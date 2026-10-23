const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE SCHEMA — 19 tables from layererp-2025.db (Step 2)
// ─────────────────────────────────────────────────────────────────────────────
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
  batch_closure: ['id', 'batch_id', 'closure_date', 'birds_sold', 'price_per_bird', 'bird_sale_amount', 'feed_returned_kg', 'buyer', 'notes'],
  trader_adjustments: ['id', 'date', 'trader_id', 'amount', 'note', 'created_at', 'voided', 'void_reason', 'voided_at'],
  trader_opening_log: ['id', 'trader_id', 'old_value', 'new_value', 'reason', 'changed_at']
};

const REQUIRED_INDEXES = [
  'idx_egg_sales_batch',
  'idx_egg_sales_date',
  'feed_alloc_batch' ? 'idx_feed_alloc_batch' : '',
  'idx_feed_alloc_date',
  'idx_medication_batch',
  'idx_medication_date',
  'idx_mortality_batch',
  'idx_batch_exp_batch',
  'idx_farm_exp_date',
  'idx_farm_inc_date',
  'idx_manure_date',
  'idx_egg_prod_batch',
  'idx_trader_adjustments_trader',
  'idx_trader_adjustments_date'
].filter(Boolean);

function getInitSchema() {
  const dbModule = require('../database/db');
  if (typeof dbModule.initSchema === 'function') {
    return dbModule.initSchema;
  }
  // Fallback: extract from db.js source if not exported yet
  const dbSrc = fs.readFileSync(path.join(__dirname, '../database/db.js'), 'utf8');
  const fn = new Function('require', 'module', 'exports', '__dirname', dbSrc + '; return initSchema;');
  return fn(require, { exports: {} }, {}, path.join(__dirname, '../database'));
}

function auditDatabase(db, label) {
  console.log(`\n=======================================================`);
  console.log(` AUDIT REPORT: ${label}`);
  console.log(`=======================================================`);

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name);
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all().map(i => i.name);

  const missingTables = [];
  const missingColumns = [];
  const extraColumns = [];
  const missingIndexes = [];

  // Check tables & columns
  for (const [table, expectedCols] of Object.entries(REFERENCE_SCHEMA)) {
    if (!tables.includes(table)) {
      missingTables.push(table);
      continue;
    }

    const actualCols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    for (const col of expectedCols) {
      if (!actualCols.includes(col)) {
        missingColumns.push(`${table}.${col}`);
      }
    }

    for (const col of actualCols) {
      if (!expectedCols.includes(col)) {
        extraColumns.push(`${table}.${col}`);
      }
    }
  }

  // Check indexes
  for (const idx of REQUIRED_INDEXES) {
    if (!indexes.includes(idx)) {
      missingIndexes.push(idx);
    }
  }

  // Print Details
  console.log(`1. MISSING TABLES:`);
  if (missingTables.length === 0) {
    console.log(`   None (All ${Object.keys(REFERENCE_SCHEMA).length} reference tables present)`);
  } else {
    missingTables.forEach(t => console.log(`   - ${t}`));
  }

  console.log(`\n2. MISSING COLUMNS:`);
  if (missingColumns.length === 0) {
    console.log(`   None (All reference columns present)`);
  } else {
    missingColumns.forEach(c => console.log(`   - ${c}`));
  }

  console.log(`\n3. EXTRA COLUMNS:`);
  if (extraColumns.length === 0) {
    console.log(`   None`);
  } else {
    extraColumns.forEach(c => console.log(`   - ${c}`));
  }

  console.log(`\n4. MISSING INDEXES:`);
  if (missingIndexes.length === 0) {
    console.log(`   None (All ${REQUIRED_INDEXES.length} required indexes present)`);
  } else {
    missingIndexes.forEach(i => console.log(`   - ${i}`));
  }

  const isPass = missingTables.length === 0 && missingColumns.length === 0 && missingIndexes.length === 0 && extraColumns.length === 0;

  console.log(`-------------------------------------------------------`);
  console.log(`RESULT: ${isPass ? 'PASS' : 'FAIL'}`);
  console.log(`-------------------------------------------------------`);

  return { isPass, missingTables, missingColumns, extraColumns, missingIndexes };
}

function runVerification() {
  const initSchema = getInitSchema();

  // Test 1: Brand new temporary database
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'layererp-test-'));
  const freshDbPath = path.join(tempDir, 'fresh-test.db');
  const freshDb = new Database(freshDbPath);
  freshDb.pragma('foreign_keys = ON');
  freshDb.pragma('journal_mode = WAL');

  console.log(`\n>>> Running initSchema on brand-new DB (${freshDbPath})...`);
  initSchema(freshDb);
  const freshResult = auditDatabase(freshDb, 'Brand-New Database (Fresh initSchema)');
  freshDb.close();

  // Test 2: Older-style database upgraded via migrations
  const olderDbPath = path.join(tempDir, 'older-test.db');
  const olderDb = new Database(olderDbPath);
  olderDb.pragma('foreign_keys = ON');
  olderDb.pragma('journal_mode = WAL');

  console.log(`\n>>> Creating older-style baseline DB without migration columns...`);
  // Create older-style tables lacking newly added migration columns
  olderDb.exec(`
    CREATE TABLE sheds (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, capacity INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE flocks (id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id TEXT UNIQUE NOT NULL, shed TEXT, breed TEXT, start_date TEXT, start_count INTEGER DEFAULT 0, current_count INTEGER DEFAULT 0, cost_per_chick REAL DEFAULT 0, status TEXT DEFAULT 'Active', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE egg_production (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, batch_id TEXT NOT NULL, pullet_trays REAL DEFAULT 0, medium_trays REAL DEFAULT 0, correct_size_trays REAL DEFAULT 0, export_trays REAL DEFAULT 0, large_trays REAL DEFAULT 0, broken_eggs REAL DEFAULT 0, double_yolk_eggs INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE traders (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, phone TEXT, address TEXT, opening_balance REAL DEFAULT 0, notes TEXT);
    CREATE TABLE egg_sales (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, batch_id TEXT NOT NULL, trader_id INTEGER, grade TEXT NOT NULL, quantity REAL DEFAULT 0, unit_type TEXT DEFAULT 'TRAY', rate_per_egg REAL DEFAULT 0, amount REAL DEFAULT 0, notes TEXT);
    CREATE TABLE trader_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, trader_id INTEGER NOT NULL, amount REAL DEFAULT 0, mode TEXT DEFAULT 'Cash', notes TEXT);
    CREATE TABLE feed_purchases (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, trader_id INTEGER, feed_type TEXT NOT NULL, qty_kg REAL DEFAULT 0, rate_per_kg REAL DEFAULT 0, amount REAL DEFAULT 0, invoice_no TEXT, notes TEXT);
    CREATE TABLE feed_allocations (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, batch_id TEXT NOT NULL, purchase_id INTEGER, feed_type TEXT, qty_kg REAL DEFAULT 0, rate_per_kg REAL DEFAULT 0, notes TEXT);
    CREATE TABLE feed_daily_intake (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, batch_id TEXT NOT NULL, feed_type TEXT NOT NULL, qty_kg REAL DEFAULT 0, notes TEXT);
    CREATE TABLE feed_returns (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, batch_id TEXT NOT NULL, feed_type TEXT, qty_kg REAL DEFAULT 0, notes TEXT);
    CREATE TABLE mortality_log (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, batch_id TEXT NOT NULL, deaths INTEGER DEFAULT 0, reason TEXT, notes TEXT);
    CREATE TABLE medical_suppliers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, phone TEXT, address TEXT);
    CREATE TABLE medication_log (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, batch_id TEXT NOT NULL, supplier_id INTEGER, medicine TEXT, dose TEXT, cost REAL DEFAULT 0, notes TEXT);
    CREATE TABLE medication_pack_details (id INTEGER PRIMARY KEY AUTOINCREMENT, medication_id INTEGER NOT NULL, form_type TEXT DEFAULT 'Powder', num_packs REAL DEFAULT 0, qty_per_pack REAL DEFAULT 0, price_per_pack REAL DEFAULT 0);
    CREATE TABLE batch_expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, batch_id TEXT NOT NULL, expense_type TEXT, amount REAL DEFAULT 0, notes TEXT);
    CREATE TABLE farm_expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, expense_type TEXT, amount REAL DEFAULT 0, notes TEXT);
    CREATE TABLE farm_other_income (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, income_type TEXT, amount REAL DEFAULT 0, notes TEXT);
    CREATE TABLE manure_sales (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, batch_id TEXT, qty_kg REAL DEFAULT 0, rate_per_kg REAL DEFAULT 0, amount REAL DEFAULT 0, buyer TEXT, notes TEXT);
    CREATE TABLE batch_closure (id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id TEXT UNIQUE, closure_date TEXT, birds_sold INTEGER DEFAULT 0, price_per_bird REAL DEFAULT 0, bird_sale_amount REAL DEFAULT 0, feed_returned_kg REAL DEFAULT 0, buyer TEXT, notes TEXT);
  `);

  console.log(`>>> Running initSchema upgrade on older-style DB...`);
  initSchema(olderDb);
  const olderResult = auditDatabase(olderDb, 'Older-Style Database (Upgraded via initSchema)');
  olderDb.close();

  // Cleanup temporary files
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {}

  const overallPass = freshResult.isPass && olderResult.isPass;
  console.log(`\n=======================================================`);
  console.log(` OVERALL VERIFICATION: ${overallPass ? 'ALL TESTS PASSED' : 'VERIFICATION FAILED'}`);
  console.log(`=======================================================\n`);

  if (!overallPass) {
    process.exit(1);
  }
}

runVerification();
