const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');
const dbModule = require('../database/db');

const backupDir = path.join(process.env.APPDATA, 'layer-erp-backup');
const db2025Backup = path.join(backupDir, 'layererp-2025.db');
const db2026Backup = path.join(backupDir, 'layererp-2026.db');

console.log('================================================================');
console.log('AUDIT STEP 1: broken_eggs query on 2025 and 2026 backups');
console.log('================================================================');

function checkBrokenEggs(dbPath, year) {
  const db = new Database(dbPath, { readonly: true });
  try {
    const cols = db.prepare("PRAGMA table_info(egg_production)").all().map(c => c.name);
    console.log(`\n[${year} Backup] egg_production columns:`, cols.join(', '));
    if (!cols.includes('broken_eggs')) {
      console.log(`[${year} Backup] Column 'broken_eggs' does NOT exist in egg_production.`);
      return { exists: false, count: 0, sum: 0 };
    }
    const res = db.prepare("SELECT COUNT(*) AS count, SUM(broken_eggs) AS total_broken FROM egg_production WHERE broken_eggs > 0").get();
    console.log(`[${year} Backup] SELECT COUNT(*), SUM(broken_eggs) FROM egg_production WHERE broken_eggs > 0:`);
    console.log(`   COUNT(*) = ${res.count}`);
    console.log(`   SUM(broken_eggs) = ${res.total_broken}`);
    return { exists: true, count: res.count, sum: res.total_broken };
  } finally {
    db.close();
  }
}

const res2025 = checkBrokenEggs(db2025Backup, 2025);
const res2026 = checkBrokenEggs(db2026Backup, 2026);


console.log('\n================================================================');
console.log('AUDIT STEP 2: Copy 2026 backup to temp, run initSchema, audit schema');
console.log('================================================================');

const tempAuditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'layererp-audit-2026-'));
const temp2026Path = path.join(tempAuditDir, 'layererp-2026.db');

fs.copyFileSync(db2026Backup, temp2026Path);
if (fs.existsSync(db2026Backup + '-wal')) {
  fs.copyFileSync(db2026Backup + '-wal', temp2026Path + '-wal');
}
if (fs.existsSync(db2026Backup + '-shm')) {
  fs.copyFileSync(db2026Backup + '-shm', temp2026Path + '-shm');
}
console.log('Copied 2026 backup files to:', tempAuditDir);

const temp2026Db = new Database(temp2026Path);
temp2026Db.pragma('foreign_keys = ON');
temp2026Db.pragma('journal_mode = WAL');

console.log('Running initSchema on 2026 copy...');
dbModule.initSchema(temp2026Db);

// Verify-schema logic
const verifySchemaScript = require('./verify-schema');
// If verify-schema exposes auditDatabase or we run the comparison directly:
const REFERENCE_SCHEMA = {
  sheds: ['id', 'name', 'capacity', 'created_at'],
  flocks: ['id', 'batch_id', 'shed', 'breed', 'start_date', 'initial_age_days', 'start_count', 'current_count', 'free_chicks', 'cost_per_chick', 'status', 'created_at'],
  egg_production: ['id', 'date', 'batch_id', 'pullet_trays', 'medium_trays', 'correct_size_trays', 'export_trays', 'large_trays', 'double_yolk_eggs', 'created_at'],
  traders: ['id', 'name', 'phone', 'address', 'opening_balance', 'types', 'notes', 'carried_from_year'],
  egg_sales: ['id', 'date', 'batch_id', 'trader_id', 'grade', 'quantity', 'unit_type', 'rate_per_egg', 'amount', 'notes', 'broken_qty'],
  trader_payments: ['id', 'date', 'trader_id', 'amount', 'mode', 'notes', 'direction'],
  feed_purchases: ['id', 'date', 'trader_id', 'feed_type', 'qty_kg', 'rate_per_kg', 'amount', 'invoice_no', 'notes'],
  feed_allocations: ['id', 'date', 'batch_id', 'purchase_id', 'trader_id', 'feed_type', 'qty_kg', 'rate_per_kg', 'notes'],
  feed_daily_intake: ['id', 'date', 'batch_id', 'feed_type', 'qty_kg', 'notes'],
  feed_returns: ['id', 'date', 'batch_id', 'feed_type', 'qty_kg', 'notes'],
  mortality_log: ['id', 'date', 'batch_id', 'deaths', 'reason', 'notes'],
  medical_suppliers: ['id', 'name', 'phone', 'address'],
  medication_log: ['id', 'date', 'batch_id', 'supplier_id', 'trader_id', 'type', 'medicine', 'dose', 'cost', 'notes', 'route', 'administered_by', 'tax_pct', 'particulars'],
  medication_pack_details: ['id', 'medication_id', 'form_type', 'num_packs', 'qty_per_pack', 'price_per_pack', 'qty_unit'],
  batch_expenses: ['id', 'date', 'batch_id', 'expense_type', 'amount', 'notes'],
  farm_expenses: ['id', 'date', 'expense_type', 'amount', 'notes'],
  farm_other_income: ['id', 'date', 'income_type', 'amount', 'notes'],
  manure_sales: ['id', 'date', 'batch_id', 'qty_kg', 'rate_per_kg', 'amount', 'buyer', 'notes'],
  batch_closure: ['id', 'batch_id', 'closure_date', 'birds_sold', 'price_per_bird', 'bird_sale_amount', 'feed_returned_kg', 'buyer', 'notes']
};

const REQUIRED_INDEXES = [
  'idx_egg_sales_batch', 'idx_egg_sales_date', 'idx_feed_alloc_batch', 'idx_feed_alloc_date',
  'idx_medication_batch', 'idx_medication_date', 'idx_mortality_batch', 'idx_batch_exp_batch',
  'idx_farm_exp_date', 'idx_farm_inc_date', 'idx_manure_date', 'idx_egg_prod_batch'
];

const tables = temp2026Db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name);
const indexes = temp2026Db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all().map(i => i.name);

const missingTables = [];
const missingColumns = [];
const extraColumns = [];
const missingIndexes = [];

for (const [table, expectedCols] of Object.entries(REFERENCE_SCHEMA)) {
  if (!tables.includes(table)) {
    missingTables.push(table);
    continue;
  }
  const actualCols = temp2026Db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  for (const col of expectedCols) {
    if (!actualCols.includes(col)) missingColumns.push(`${table}.${col}`);
  }
  for (const col of actualCols) {
    if (!expectedCols.includes(col)) extraColumns.push(`${table}.${col}`);
  }
}
for (const idx of REQUIRED_INDEXES) {
  if (!indexes.includes(idx)) missingIndexes.push(idx);
}

console.log('1. MISSING TABLES:', missingTables.length ? missingTables : 'None');
console.log('2. MISSING COLUMNS:', missingColumns.length ? missingColumns : 'None');
console.log('3. EXTRA COLUMNS:', extraColumns.length ? extraColumns : 'None');
console.log('4. MISSING INDEXES:', missingIndexes.length ? missingIndexes : 'None');
const isPass = missingTables.length === 0 && missingColumns.length === 0 && extraColumns.length === 0 && missingIndexes.length === 0;
console.log('RESULT:', isPass ? 'PASS' : 'FAIL');
temp2026Db.close();


console.log('\n================================================================');
console.log('AUDIT STEP 3: Compare getTraderClosingBalance vs getCrossBatchTraderLedger');
console.log('================================================================');

// Helper to calculate getCrossBatchTraderLedger closing balance exactly like Sales.jsx:
const MED_FAMILY = new Set(["medication", "vaccine"]);

function groupBillRows(rows) {
  const groups = {};
  const ordered = [];
  rows.forEach(r => {
    const family = MED_FAMILY.has(r.source) ? "medication" : (r.source === "sale" ? "sale" : (r.source === "feed" ? "feed" : null));
    if (!family) { ordered.push(r); return; }
    const key = `${r.date}|${r.batch_id}|${family}`;
    if (!groups[key]) {
      groups[key] = { isGroup: true, date: r.date, batch_id: r.batch_id, source: r.source, ref: r.id, particulars: [], debit: 0, credit: 0, taxPct: Number(r.tax_pct || 0) };
      ordered.push(groups[key]);
    }
    groups[key].particulars.push(r.particulars || "");
    groups[key].debit  += Number(r.debit  || 0);
    groups[key].credit += Number(r.credit || 0);
  });

  const finalRows = ordered.map(r => {
    if (!r.isGroup) return r;
    let debit = r.debit, credit = r.credit;
    if (r.debit > 0 && MED_FAMILY.has(r.source)) {
      const taxAmt = r.debit * r.taxPct / 100;
      debit = Math.round(r.debit + taxAmt);
    }
    return {
      date: r.date, batch_id: r.batch_id, source: r.source, id: r.ref,
      particulars: r.particulars.join("<br/>"),
      debit, credit
    };
  });
  return finalRows;
}

function getLedgerClosingBalanceForTrader(db, traderId, openingBalance) {
  // Query matching getCrossBatchTraderLedger logic in db.js
  const sales = db.prepare(`
    SELECT id, date, batch_id, amount AS credit, 0 AS debit, 'sale' AS source
    FROM egg_sales WHERE trader_id=?
  `).all(traderId);

  const feed = db.prepare(`
    SELECT id, date, batch_id, 0 AS credit, (qty_kg * rate_per_kg) AS debit, 'feed' AS source
    FROM feed_allocations WHERE trader_id=?
  `).all(traderId);

  let medication = [];
  try {
    medication = db.prepare(`
      SELECT id, date, batch_id, 0 AS credit, cost AS debit, 'medication' AS source, tax_pct
      FROM medication_log WHERE trader_id=?
    `).all(traderId);
  } catch (e) {
    // If tax_pct not in table
    medication = db.prepare(`
      SELECT id, date, batch_id, 0 AS credit, cost AS debit, 'medication' AS source, 0 AS tax_pct
      FROM medication_log WHERE trader_id=?
    `).all(traderId);
  }

  const payments = db.prepare(`
    SELECT id, date, '-' AS batch_id,
           (CASE WHEN COALESCE(direction,'to_trader') = 'from_trader' THEN 0 ELSE amount END) AS credit,
           (CASE WHEN COALESCE(direction,'to_trader') = 'from_trader' THEN amount ELSE 0 END) AS debit,
           'payment' AS source
    FROM trader_payments WHERE trader_id=?
  `).all(traderId);

  const crossLedger = [...sales, ...feed, ...medication, ...payments].sort((a, b) => b.date.localeCompare(a.date));
  const groupedAllRows = groupBillRows(crossLedger);
  const totalCredit = groupedAllRows.reduce((s, r) => s + Number(r.credit || 0), 0);
  const totalDebit = groupedAllRows.reduce((s, r) => s + Number(r.debit || 0), 0);
  const netBalance = totalCredit - totalDebit + Number(openingBalance || 0);

  return {
    netBalance,
    totalCredit,
    totalDebit,
    salesCount: sales.length,
    feedCount: feed.length,
    medCount: medication.length,
    payCount: payments.length
  };
}

// Call getTraderClosingBalance directly from db.js:
function calculateMigrationClosingBalance(db, traderId, openingBalance) {
  return dbModule.getTraderClosingBalance(db, traderId, openingBalance);
}

function compareTraders(dbPath, year) {
  console.log(`\n----------------------------------------------------------------`);
  console.log(` Trader Balances in ${year} Backup`);
  console.log(`----------------------------------------------------------------`);
  const db = new Database(dbPath, { readonly: true });
  try {
    const traders = db.prepare(`SELECT * FROM traders ORDER BY id`).all();
    console.log(`Found ${traders.length} traders in ${year} DB.\n`);
    const results = [];
    for (const t of traders) {
      const ledger = getLedgerClosingBalanceForTrader(db, t.id, t.opening_balance);
      const migrationBal = calculateMigrationClosingBalance(db, t.id, t.opening_balance);
      const diff = ledger.netBalance - migrationBal;
      results.push({
        id: t.id,
        name: t.name,
        opening_balance: t.opening_balance,
        ledger_balance: ledger.netBalance,
        migration_balance: migrationBal,
        difference: diff,
        details: ledger
      });
    }

    console.table(results.map(r => ({
      ID: r.id,
      Trader: r.name,
      'Opening Bal': r.opening_balance,
      'Ledger Balance': r.ledger_balance,
      'Migration Balance': r.migration_balance,
      'Difference (Ledger - Migr)': r.difference
    })));

    return results;
  } finally {
    db.close();
  }
}

const traders2025 = compareTraders(db2025Backup, 2025);
const traders2026 = compareTraders(db2026Backup, 2026);
