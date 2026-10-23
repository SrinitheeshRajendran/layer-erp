const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

// Create temp isolated directory
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-migr-'));
const appDataDir = path.join(tempDir, 'layer-erp');
fs.mkdirSync(appDataDir, { recursive: true });

// Set APPDATA to redirect getUserDataPath
process.env.APPDATA = tempDir;

const backupDir = path.join(process.env.APPDATA ? path.join(process.env.USERPROFILE || 'C:\\Users\\srini', 'AppData', 'Roaming', 'layer-erp-backup') : '', '');
const realBackup2026 = path.join(process.env.USERPROFILE || 'C:\\Users\\srini', 'AppData', 'Roaming', 'layer-erp-backup', 'layererp-2026.db');

console.log('Real 2026 backup path:', realBackup2026);
console.log('Temp appData directory:', appDataDir);

// Copy 2026 backup to temp dir as layererp-2026.db
const tempDb2026 = path.join(appDataDir, 'layererp-2026.db');
fs.copyFileSync(realBackup2026, tempDb2026);
if (fs.existsSync(realBackup2026 + '-wal')) fs.copyFileSync(realBackup2026 + '-wal', tempDb2026 + '-wal');
if (fs.existsSync(realBackup2026 + '-shm')) fs.copyFileSync(realBackup2026 + '-shm', tempDb2026 + '-shm');

// Load db module after process.env.APPDATA is set
const dbModule = require('../database/db');

// Grouping logic matching Sales.jsx
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

  return ordered.map(r => {
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
}

function calculateLedgerForTrader(d, traderId, openingBalance, maxDate = null) {
  const sales = d.prepare(`
    SELECT id, date, batch_id, amount AS credit, 0 AS debit, 'sale' AS source
    FROM egg_sales WHERE trader_id=? ${maxDate ? 'AND date <= ?' : ''}
  `).all(...(maxDate ? [traderId, maxDate] : [traderId]));

  const feed = d.prepare(`
    SELECT id, date, batch_id, 0 AS credit, (qty_kg * rate_per_kg) AS debit, 'feed' AS source
    FROM feed_allocations WHERE trader_id=? ${maxDate ? 'AND date <= ?' : ''}
  `).all(...(maxDate ? [traderId, maxDate] : [traderId]));

  let medication = [];
  try {
    medication = d.prepare(`
      SELECT id, date, batch_id, 0 AS credit, cost AS debit, 'medication' AS source, tax_pct
      FROM medication_log WHERE trader_id=? ${maxDate ? 'AND date <= ?' : ''}
    `).all(...(maxDate ? [traderId, maxDate] : [traderId]));
  } catch (e) {
    medication = d.prepare(`
      SELECT id, date, batch_id, 0 AS credit, cost AS debit, 'medication' AS source, 0 AS tax_pct
      FROM medication_log WHERE trader_id=? ${maxDate ? 'AND date <= ?' : ''}
    `).all(...(maxDate ? [traderId, maxDate] : [traderId]));
  }

  const payments = d.prepare(`
    SELECT id, date, '-' AS batch_id,
           (CASE WHEN COALESCE(direction,'to_trader') = 'from_trader' THEN 0 ELSE amount END) AS credit,
           (CASE WHEN COALESCE(direction,'to_trader') = 'from_trader' THEN amount ELSE 0 END) AS debit,
           'payment' AS source
    FROM trader_payments WHERE trader_id=? ${maxDate ? 'AND date <= ?' : ''}
  `).all(...(maxDate ? [traderId, maxDate] : [traderId]));

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
    payCount: payments.length,
    sales,
    feed,
    medication,
    payments
  };
}

// 1. Inspect 2026 DB before migration
const db2026 = new Database(tempDb2026);
db2026.pragma('journal_mode = WAL');
dbModule.initSchema(db2026);

const traders2026 = db2026.prepare("SELECT * FROM traders ORDER BY id").all();
const activeBatches2026 = db2026.prepare("SELECT * FROM flocks WHERE status != 'Closed'").all();
const closedBatches2026 = db2026.prepare("SELECT * FROM flocks WHERE status = 'Closed'").all();

console.log('\n--- 2026 DB Status ---');
console.log(`Traders: ${traders2026.length}`);
console.log(`Active Batches: ${activeBatches2026.map(b => b.batch_id).join(', ') || 'None'}`);
console.log(`Closed Batches: ${closedBatches2026.map(b => b.batch_id).join(', ') || 'None'}`);

const trader2026ClosingBalances = {};
for (const t of traders2026) {
  const closingMigration = dbModule.getTraderClosingBalance(db2026, t.id, t.opening_balance);
  const ledgerObj = calculateLedgerForTrader(db2026, t.id, t.opening_balance, '2026-12-31');
  trader2026ClosingBalances[t.id] = {
    id: t.id,
    name: t.name,
    types: t.types,
    opening_balance: t.opening_balance,
    closingMigration,
    ledgerBalance: ledgerObj.netBalance,
    salesCount: ledgerObj.salesCount,
    feedCount: ledgerObj.feedCount,
    medCount: ledgerObj.medCount,
    payCount: ledgerObj.payCount
  };
}
db2026.close();

console.log('\n--- Running Year Migration (2026 -> 2027) ---');
const migrationResult = dbModule.runYearMigration(2026, 2027);
console.log('Migration Result:', migrationResult);

// 2. Inspect 2027 DB after migration
const tempDb2027 = path.join(appDataDir, 'layererp-2027.db');
const db2027 = new Database(tempDb2027);

const traders2027 = db2027.prepare("SELECT * FROM traders ORDER BY id").all();
console.log('\n--- 2027 Traders in Migrated DB ---');
console.table(traders2027.map(t => ({
  id: t.id,
  name: t.name,
  opening_balance: t.opening_balance,
  types: t.types
})));

// Check table counts in 2027 DB
const tableCounts2027 = {
  egg_sales: db2027.prepare("SELECT COUNT(*) c FROM egg_sales").get().c,
  feed_allocations: db2027.prepare("SELECT COUNT(*) c FROM feed_allocations").get().c,
  medication_log: db2027.prepare("SELECT COUNT(*) c FROM medication_log").get().c,
  trader_payments: db2027.prepare("SELECT COUNT(*) c FROM trader_payments").get().c
};
console.log('\n--- Transaction Counts in 2027 DB ---');
console.log(tableCounts2027);

// 3. For each trader in 2027, calculate:
// - Ledger balance as of first day of 2027 (2027-01-01)
// - Ledger balance as of today (all transactions)
// - Compare with 2026 closing balance
const comparison = [];
for (const t27 of traders2027) {
  // Find matching 2026 trader by name
  const t26 = Object.values(trader2026ClosingBalances).find(x => x.name === t27.name);
  const closing2026 = t26 ? t26.closingMigration : 0;

  // Ledger on 2027-01-01
  // Notice: what if transactions in 2027 have 2026 dates because they were copied from 2026 active batches?
  const ledgerJan1 = calculateLedgerForTrader(db2027, t27.id, t27.opening_balance, '2027-01-01');
  const ledgerToday = calculateLedgerForTrader(db2027, t27.id, t27.opening_balance, null);

  // Check what transactions exist for this trader in 2027 DB
  const t27Sales = db2027.prepare("SELECT date, batch_id, amount FROM egg_sales WHERE trader_id=?").all(t27.id);
  const t27Feed = db2027.prepare("SELECT date, batch_id, (qty_kg*rate_per_kg) as amount FROM feed_allocations WHERE trader_id=?").all(t27.id);
  const t27Med = db2027.prepare("SELECT date, batch_id, cost FROM medication_log WHERE trader_id=?").all(t27.id);
  const t27Pay = db2027.prepare("SELECT date, amount, direction FROM trader_payments WHERE trader_id=?").all(t27.id);

  comparison.push({
    id: t27.id,
    name: t27.name,
    closing2026: closing2026,
    opening2027: t27.opening_balance,
    ledgerJan1: ledgerJan1.netBalance,
    ledgerToday: ledgerToday.netBalance,
    diffJan1Vs2026: ledgerJan1.netBalance - closing2026,
    diffTodayVs2026: ledgerToday.netBalance - closing2026,
    copiedSales: t27Sales.length,
    copiedFeed: t27Feed.length,
    copiedMed: t27Med.length,
    copiedPay: t27Pay.length,
    copiedSalesAmt: t27Sales.reduce((s, r) => s + Number(r.amount || 0), 0),
    copiedFeedAmt: t27Feed.reduce((s, r) => s + Number(r.amount || 0), 0),
    copiedMedAmt: t27Med.reduce((s, r) => s + Number(r.cost || 0), 0)
  });
}

console.log('\n--- PER-TRADER COMPARISON TABLE ---');
console.table(comparison.map(c => ({
  ID: c.id,
  Trader: c.name,
  '2026 Closing': c.closing2026,
  '2027 Opening': c.opening2027,
  '2027 Ledger (Jan 1)': c.ledgerJan1,
  '2027 Ledger (Today)': c.ledgerToday,
  'Diff (Jan 1 - 2026)': c.diffJan1Vs2026,
  'Diff (Today - 2026)': c.diffTodayVs2026
})));

console.log('\n--- COPIED TRANSACTIONS BREAKDOWN PER TRADER ---');
console.table(comparison.map(c => ({
  Trader: c.name,
  'Copied Sales (₹)': c.copiedSalesAmt,
  'Copied Feed (₹)': c.copiedFeedAmt,
  'Copied Med (₹)': c.copiedMedAmt,
  'Copied Pay count': c.copiedPay,
  'Total Double Counted (Sales - Feed - Med)': c.copiedSalesAmt - c.copiedFeedAmt - c.copiedMedAmt
})));

db2027.close();
