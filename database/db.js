const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')

function getUserDataPath() {
  if (process.env.LAYER_ERP_DATA_DIR) {
    return process.env.LAYER_ERP_DATA_DIR
  }
  if (app) {
    return app.getPath('userData')
  }
  return path.join(process.env.APPDATA || path.join(process.env.HOME || '', '.config'), 'layer-erp')
}

// ─────────────────────────────────────────────────────────────────────────────
// YEARLY DATABASE — one .db file per financial year
// e.g. layererp-2026.db, layererp-2027.db ...
// Switch year by changing activeYear (via settings or auto on Jan 1)
// ─────────────────────────────────────────────────────────────────────────────

let activeYear = new Date().getFullYear()
let db = null

function getDbPath(year) {
  return path.join(getUserDataPath(), `layererp-${year}.db`)
}

function getDb(year) {
  const yr = year || activeYear
  const dbPath = getDbPath(yr)
  // If same year and path already open, return it
  if (db && db.__year === yr && db.__path === dbPath) return db

  // Close previous connection if switching year or path
  if (db) { try { db.close() } catch (e) {} db = null }

  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  db = new Database(dbPath)
  db.__year = yr
  db.__path = dbPath

  // WAL mode — much faster writes, safe on crash
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  initSchema(db)
  return db
}

function backupDatabaseFiles(label = '') {
  try {
    const userData = getUserDataPath()
    if (!fs.existsSync(userData)) return null

    // If an active DB connection is open, checkpoint its WAL so disk files are 100% current
    if (db) {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)')
      } catch (e) {
        console.warn('[Database] WAL checkpoint before backup:', e)
      }
    }

    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const isMigration = label.startsWith('migration')
    const folderName = isMigration
      ? `backup_${label}_${timestamp}`
      : (label ? `backup_${label}_${timestamp}` : `backup_${timestamp}`)
    const backupDir = path.join(userData, 'backups', folderName)

    const files = fs.readdirSync(userData).filter(f => f.endsWith('.db') || f.endsWith('.db-wal') || f.endsWith('.db-shm'))
    if (files.length === 0) return null

    fs.mkdirSync(backupDir, { recursive: true })
    let totalBytes = 0
    for (const f of files) {
      const src = path.join(userData, f)
      if (fs.statSync(src).isFile()) {
        const dest = path.join(backupDir, f)
        fs.copyFileSync(src, dest)
        totalBytes += fs.statSync(dest).size
      }
    }
    const kbUsed = (totalBytes / 1024).toFixed(2)
    console.log(`[Database] Created automatic backup at ${backupDir} (${kbUsed} KB)`)

    // Prune backups: Keep last 3 migration backups and last 5 general backups separately.
    // General pruning must NEVER prune migration backups.
    const backupsParent = path.join(userData, 'backups')
    if (fs.existsSync(backupsParent)) {
      const allDirs = fs.readdirSync(backupsParent, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name.startsWith('backup_'))
        .map(d => {
          const fullPath = path.join(backupsParent, d.name)
          return { name: d.name, path: fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs }
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs)

      const migrationDirs = allDirs.filter(d => d.name.startsWith('backup_migration'))
      const generalDirs = allDirs.filter(d => !d.name.startsWith('backup_migration'))

      // Keep only 3 most recent migration backups
      if (migrationDirs.length > 3) {
        for (let i = 3; i < migrationDirs.length; i++) {
          try {
            fs.rmSync(migrationDirs[i].path, { recursive: true, force: true })
            console.log(`[Database] Pruned old migration backup folder: ${migrationDirs[i].name}`)
          } catch (e) {
            console.warn(`[Database] Failed to prune old migration backup ${migrationDirs[i].name}:`, e)
          }
        }
      }

      // Keep only 5 most recent general backups
      if (generalDirs.length > 5) {
        for (let i = 5; i < generalDirs.length; i++) {
          try {
            fs.rmSync(generalDirs[i].path, { recursive: true, force: true })
            console.log(`[Database] Pruned old general backup folder: ${generalDirs[i].name}`)
          } catch (e) {
            console.warn(`[Database] Failed to prune old general backup ${generalDirs[i].name}:`, e)
          }
        }
      }
    }

    return backupDir
  } catch (err) {
    console.error('[Database] Automatic backup failed:', err)
    return null
  }
}

function switchYear(year) {
  if (db) {
    try { db.close() } catch (e) {}
    db = null
  }
  // Plain year switch for read-only viewing: DO NOT create a full backup here.
  activeYear = year
}

function backupBeforeUnlock(year) {
  console.log(`[Database] Backing up before unlocking year ${year} for editing...`)
  return backupDatabaseFiles(`unlock_${year}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA — runs on every open, CREATE TABLE IF NOT EXISTS is safe to repeat
// ─────────────────────────────────────────────────────────────────────────────

function initSchema(d) {
  d.exec(`
    ----------------------------------------------------------------
    -- SHEDS
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS sheds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      capacity INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    ----------------------------------------------------------------
    -- BATCHES / FLOCKS
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS flocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT UNIQUE NOT NULL,
      shed TEXT,
      breed TEXT,
      start_date TEXT,
      initial_age_days INTEGER DEFAULT 0,
      start_count INTEGER DEFAULT 0,
      current_count INTEGER DEFAULT 0,
      free_chicks INTEGER DEFAULT 0,
      cost_per_chick REAL DEFAULT 0,
      status TEXT DEFAULT 'Active',
      created_at TEXT DEFAULT (datetime('now'))
    );

    ----------------------------------------------------------------
    -- EGG PRODUCTION
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS egg_production (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      pullet_trays REAL DEFAULT 0,
      medium_trays REAL DEFAULT 0,
      correct_size_trays REAL DEFAULT 0,
      export_trays REAL DEFAULT 0,
      large_trays REAL DEFAULT 0,
      double_yolk_eggs INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    ----------------------------------------------------------------
    -- TRADERS
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS traders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      phone TEXT,
      address TEXT,
      opening_balance REAL DEFAULT 0,
      types TEXT DEFAULT '',
      notes TEXT,
      carried_from_year INTEGER
    );

    ----------------------------------------------------------------
    -- EGG SALES
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS egg_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      trader_id INTEGER,
      grade TEXT NOT NULL,
      quantity REAL DEFAULT 0,
      unit_type TEXT DEFAULT 'TRAY',
      rate_per_egg REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      broken_qty REAL DEFAULT 0,
      notes TEXT,
      FOREIGN KEY(trader_id) REFERENCES traders(id)
    );

    ----------------------------------------------------------------
    -- TRADER PAYMENTS
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS trader_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      trader_id INTEGER NOT NULL,
      amount REAL DEFAULT 0,
      mode TEXT DEFAULT 'Cash',
      notes TEXT,
      direction TEXT DEFAULT 'to_trader',
      FOREIGN KEY(trader_id) REFERENCES traders(id)
    );

    ----------------------------------------------------------------
    -- FEED PURCHASES (FARM LEVEL)
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS feed_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      trader_id INTEGER,
      feed_type TEXT NOT NULL,
      qty_kg REAL DEFAULT 0,
      rate_per_kg REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      invoice_no TEXT,
      notes TEXT,
      FOREIGN KEY(trader_id) REFERENCES traders(id)
    );

    ----------------------------------------------------------------
    -- FEED ALLOCATIONS (FARM -> BATCH)
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS feed_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      purchase_id INTEGER,
      trader_id INTEGER,
      feed_type TEXT,
      qty_kg REAL DEFAULT 0,
      rate_per_kg REAL DEFAULT 0,
      notes TEXT,
      FOREIGN KEY(trader_id) REFERENCES traders(id)
    );

    ----------------------------------------------------------------
    -- FEED CONSUMPTION
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS feed_daily_intake (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      feed_type TEXT NOT NULL,
      qty_kg REAL DEFAULT 0,
      notes TEXT
    );

    ----------------------------------------------------------------
    -- FEED RETURNS
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS feed_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      feed_type TEXT,
      qty_kg REAL DEFAULT 0,
      notes TEXT
    );

    ----------------------------------------------------------------
    -- MORTALITY
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS mortality_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      deaths INTEGER DEFAULT 0,
      reason TEXT,
      notes TEXT
    );

    ----------------------------------------------------------------
    -- MEDICAL SUPPLIERS
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS medical_suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      phone TEXT,
      address TEXT
    );

    ----------------------------------------------------------------
    -- MEDICATIONS
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS medication_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      supplier_id INTEGER,
      trader_id INTEGER,
      type TEXT DEFAULT 'Support Medicine',
      medicine TEXT,
      dose TEXT,
      cost REAL DEFAULT 0,
      notes TEXT,
      route TEXT,
      administered_by TEXT,
      tax_pct REAL DEFAULT 0,
      particulars TEXT,
      FOREIGN KEY(supplier_id) REFERENCES medical_suppliers(id)
    );

    CREATE TABLE IF NOT EXISTS medication_pack_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medication_id INTEGER NOT NULL,
      form_type TEXT DEFAULT 'Powder',
      num_packs REAL DEFAULT 0,
      qty_per_pack REAL DEFAULT 0,
      price_per_pack REAL DEFAULT 0,
      qty_unit TEXT
    );

    ----------------------------------------------------------------
    -- OTHER BATCH EXPENSES
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS batch_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      expense_type TEXT,
      amount REAL DEFAULT 0,
      notes TEXT
    );

    ----------------------------------------------------------------
    -- GLOBAL / FARM-WIDE EXPENSES
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS farm_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      expense_type TEXT,
      amount REAL DEFAULT 0,
      notes TEXT
    );

    ----------------------------------------------------------------
    -- OTHER FARM INCOME (misc income kept at farm level — rent,
    -- subsidy, interest, byproduct sales that aren't manure, etc.)
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS farm_other_income (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      income_type TEXT,
      amount REAL DEFAULT 0,
      notes TEXT
    );

    ----------------------------------------------------------------
    -- MANURE SALES
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS manure_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      batch_id TEXT,
      qty_kg REAL DEFAULT 0,
      rate_per_kg REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      buyer TEXT,
      notes TEXT
    );

    ----------------------------------------------------------------
    -- BATCH CLOSURE
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS batch_closure (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT UNIQUE,
      closure_date TEXT,
      birds_sold INTEGER DEFAULT 0,
      price_per_bird REAL DEFAULT 0,
      bird_sale_amount REAL DEFAULT 0,
      feed_returned_kg REAL DEFAULT 0,
      buyer TEXT,
      notes TEXT
    );

    ----------------------------------------------------------------
    -- TRADER ADJUSTMENTS
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS trader_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      trader_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      voided INTEGER DEFAULT 0,
      void_reason TEXT,
      voided_at TEXT
    );

    ----------------------------------------------------------------
    -- TRADER OPENING BALANCE AUDIT LOG
    ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS trader_opening_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trader_id INTEGER NOT NULL,
      old_value REAL,
      new_value REAL,
      reason TEXT NOT NULL,
      changed_at TEXT DEFAULT (datetime('now'))
    );
  `)

  // ── Column migrations (safe to run on existing DBs) ──────────
  const migrations = [
    "ALTER TABLE flocks ADD COLUMN initial_age_days INTEGER DEFAULT 0",
    "ALTER TABLE flocks ADD COLUMN free_chicks INTEGER DEFAULT 0",
    "ALTER TABLE traders ADD COLUMN types TEXT DEFAULT ''",
    "ALTER TABLE traders ADD COLUMN carried_from_year INTEGER",
    "ALTER TABLE feed_allocations ADD COLUMN trader_id INTEGER",
    "ALTER TABLE medication_log ADD COLUMN trader_id INTEGER",
    "ALTER TABLE medication_log ADD COLUMN type TEXT DEFAULT 'Support Medicine'",
    "ALTER TABLE medication_log ADD COLUMN route TEXT",
    "ALTER TABLE medication_log ADD COLUMN administered_by TEXT",
    "ALTER TABLE medication_log ADD COLUMN tax_pct REAL DEFAULT 0",
    "ALTER TABLE medication_log ADD COLUMN particulars TEXT",
    "ALTER TABLE medication_pack_details ADD COLUMN qty_unit TEXT",
    "ALTER TABLE trader_payments ADD COLUMN direction TEXT DEFAULT 'to_trader'",
    "ALTER TABLE egg_sales ADD COLUMN broken_qty REAL DEFAULT 0"
  ]
  for (const sql of migrations) {
    try { d.exec(sql) } catch (e) { /* column already exists, skip */ }
  }

  // One-time: fold legacy double-yolk fields on egg_sales into their own
  // normal "Doubles" grade rows, then drop the now-unused columns.
  migrateDoubleYolkSales(d)

  // One-time: broken-egg tracking moved from egg_production to egg_sales
  // (breakage is discovered/sorted during sales, not during production).
  dropProductionBrokenEggsColumn(d)

  // Indexes for fast queries as data grows
  d.exec(`
    CREATE INDEX IF NOT EXISTS idx_egg_sales_batch   ON egg_sales(batch_id);
    CREATE INDEX IF NOT EXISTS idx_egg_sales_date    ON egg_sales(date);
    CREATE INDEX IF NOT EXISTS idx_feed_alloc_batch  ON feed_allocations(batch_id);
    CREATE INDEX IF NOT EXISTS idx_feed_alloc_date   ON feed_allocations(date);
    CREATE INDEX IF NOT EXISTS idx_medication_batch  ON medication_log(batch_id);
    CREATE INDEX IF NOT EXISTS idx_medication_date   ON medication_log(date);
    CREATE INDEX IF NOT EXISTS idx_mortality_batch   ON mortality_log(batch_id);
    CREATE INDEX IF NOT EXISTS idx_batch_exp_batch   ON batch_expenses(batch_id);
    CREATE INDEX IF NOT EXISTS idx_farm_exp_date     ON farm_expenses(date);
    CREATE INDEX IF NOT EXISTS idx_farm_inc_date     ON farm_other_income(date);
    CREATE INDEX IF NOT EXISTS idx_manure_date       ON manure_sales(date);
    CREATE INDEX IF NOT EXISTS idx_egg_prod_batch    ON egg_production(batch_id);
    CREATE INDEX IF NOT EXISTS idx_trader_adjustments_trader ON trader_adjustments(trader_id);
    CREATE INDEX IF NOT EXISTS idx_trader_adjustments_date   ON trader_adjustments(date);
  `)
}

// ─────────────────────────────────────────────────────────────────────────────
// ONE-TIME MIGRATION — fold the old "Double Yolk Eggs" add-on fields on
// egg_sales into their own plain "Doubles" grade rows, then drop the columns.
// Guarded by column existence, so it's safe to call on every startup: once
// double_yolk_qty/rate/amount are gone from a DB, this is a no-op for it.
// ─────────────────────────────────────────────────────────────────────────────

function migrateDoubleYolkSales(d) {
  const cols = d.prepare(`PRAGMA table_info(egg_sales)`).all().map(c => c.name)
  if (!cols.includes('double_yolk_qty')) return // already migrated on this DB

  const rows = d.prepare(`SELECT * FROM egg_sales WHERE double_yolk_qty > 0`).all()

  const migrate = d.transaction(() => {
    for (const r of rows) {
      const dyQty = Number(r.double_yolk_qty || 0)
      const dyRate = Number(r.double_yolk_rate || 0)
      const dyAmount = Number(r.double_yolk_amount || 0) || (dyQty * 30 * dyRate)

      // New standalone row for the doubles portion, same date/trader/notes
      d.prepare(`
        INSERT INTO egg_sales (date, batch_id, trader_id, grade, quantity, unit_type, rate_per_egg, amount, notes)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run(r.date, r.batch_id, r.trader_id, 'Doubles', dyQty, 'TRAY', dyRate, dyAmount, r.notes || '')

      // Strip the doubles amount back out of the original row's total
      const mainAmount = Math.max(0, Number(r.amount || 0) - dyAmount)
      d.prepare(`UPDATE egg_sales SET amount = ? WHERE id = ?`).run(mainAmount, r.id)
    }
  })
  migrate()

  dropDoubleYolkColumns(d)
}

function dropDoubleYolkColumns(d) {
  d.pragma('foreign_keys = OFF')
  const rebuild = d.transaction(() => {
    d.exec(`
      CREATE TABLE egg_sales_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        batch_id TEXT NOT NULL,
        trader_id INTEGER,
        grade TEXT NOT NULL,
        quantity REAL DEFAULT 0,
        unit_type TEXT DEFAULT 'TRAY',
        rate_per_egg REAL DEFAULT 0,
        amount REAL DEFAULT 0,
        broken_qty REAL DEFAULT 0,
        notes TEXT,
        FOREIGN KEY(trader_id) REFERENCES traders(id)
      );
    `)
    // broken_qty is added via the ALTER TABLE migrations, which always run
    // before this, so the source table already has the column to carry over.
    d.exec(`
      INSERT INTO egg_sales_new (id, date, batch_id, trader_id, grade, quantity, unit_type, rate_per_egg, amount, broken_qty, notes)
      SELECT id, date, batch_id, trader_id, grade, quantity, unit_type, rate_per_egg, amount, broken_qty, notes FROM egg_sales;
    `)
    d.exec(`DROP TABLE egg_sales;`)
    d.exec(`ALTER TABLE egg_sales_new RENAME TO egg_sales;`)
    d.exec(`CREATE INDEX IF NOT EXISTS idx_egg_sales_batch ON egg_sales(batch_id);`)
    d.exec(`CREATE INDEX IF NOT EXISTS idx_egg_sales_date  ON egg_sales(date);`)
  })
  rebuild()
  d.pragma('foreign_keys = ON')
}

// ─────────────────────────────────────────────────────────────────────────────
// ONE-TIME MIGRATION — drop egg_production.broken_eggs. Breakage is now
// logged on the Sale Entry side (egg_sales.broken_qty) instead, since it's
// actually discovered/sorted during sales, not during production. Existing
// broken_eggs values are NOT carried over anywhere — this is a deliberate,
// user-confirmed data drop, not a bug. Guarded by column existence, so it's
// safe to call on every startup: once broken_eggs is gone from a DB, this
// is a no-op for it.
// ─────────────────────────────────────────────────────────────────────────────

function dropProductionBrokenEggsColumn(d) {
  const cols = d.prepare(`PRAGMA table_info(egg_production)`).all().map(c => c.name)
  if (!cols.includes('broken_eggs')) return // already migrated on this DB

  d.pragma('foreign_keys = OFF')
  const rebuild = d.transaction(() => {
    d.exec(`
      CREATE TABLE egg_production_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        batch_id TEXT NOT NULL,
        pullet_trays REAL DEFAULT 0,
        medium_trays REAL DEFAULT 0,
        correct_size_trays REAL DEFAULT 0,
        export_trays REAL DEFAULT 0,
        large_trays REAL DEFAULT 0,
        double_yolk_eggs INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `)
    d.exec(`
      INSERT INTO egg_production_new (id, date, batch_id, pullet_trays, medium_trays, correct_size_trays, export_trays, large_trays, double_yolk_eggs, created_at)
      SELECT id, date, batch_id, pullet_trays, medium_trays, correct_size_trays, export_trays, large_trays, double_yolk_eggs, created_at FROM egg_production;
    `)
    d.exec(`DROP TABLE egg_production;`)
    d.exec(`ALTER TABLE egg_production_new RENAME TO egg_production;`)
    d.exec(`CREATE INDEX IF NOT EXISTS idx_egg_prod_batch ON egg_production(batch_id);`)
  })
  rebuild()
  d.pragma('foreign_keys = ON')
}


// ─────────────────────────────────────────────────────────────────────────────
// YEAR-END MIGRATION
// Moves active batches (full history) + traders (balance only) from prevYear
// into the current year DB. Closed batches stay in the old year forever.
// ─────────────────────────────────────────────────────────────────────────────

function getMigrationPreview(prevYear) {
  const prevPath = getDbPath(prevYear)
  if (!fs.existsSync(prevPath)) return { batches: [], traders: [] }

  const prev = new Database(prevPath)
  prev.pragma('journal_mode = WAL')

  // Active batches in previous year
  const batches = prev.prepare(`SELECT * FROM flocks WHERE status != 'Closed'`).all()

  // Traders with their closing balance
  const traders = prev.prepare(`SELECT * FROM traders`).all().map(t => {
    return { ...t, closing_balance: getTraderClosingBalance(prev, t.id, t.opening_balance) }
  })

  prev.close()
  return { batches, traders }
}

// ─────────────────────────────────────────────────────────────────────────────
// MIGRATION — copy existing layererp.db into layererp-YYYY.db on first run
// Runs once automatically, then never again
// ─────────────────────────────────────────────────────────────────────────────

function migrateFromLegacy() {
  const legacyPath = path.join(getUserDataPath(), 'layererp.db')
  const newPath = getDbPath(activeYear)

  if (fs.existsSync(legacyPath) && !fs.existsSync(newPath)) {
    fs.copyFileSync(legacyPath, newPath)
    console.log(`Migrated legacy layererp.db → layererp-${activeYear}.db`)
  }
}

// Run migration before anything else
migrateFromLegacy()


// ─────────────────────────────────────────────────────────────────────────────
// YEAR-END MIGRATION
// Moves active batches (full history) from prevYear DB to currentYear DB
// Traders copied with closing balance as opening_balance
// ─────────────────────────────────────────────────────────────────────────────

function getTraderClosingBalance(prevDb, traderId, openingBalance) {
  let targetDb = prevDb
  let targetTraderId = traderId
  if (typeof prevDb === 'number' && traderId === undefined) {
    targetTraderId = prevDb
    targetDb = getDb()
  } else if (!targetDb) {
    targetDb = getDb()
  }

  if (openingBalance === undefined || openingBalance === null) {
    const row = targetDb.prepare(`SELECT opening_balance FROM traders WHERE id=?`).get(targetTraderId)
    openingBalance = row ? (row.opening_balance || 0) : 0
  }

  const sales    = targetDb.prepare(`SELECT COALESCE(SUM(amount),0) v FROM egg_sales WHERE trader_id=?`).get(targetTraderId)?.v || 0
  const feed     = targetDb.prepare(`SELECT COALESCE(SUM(qty_kg*rate_per_kg),0) v FROM feed_allocations WHERE trader_id=?`).get(targetTraderId)?.v || 0
  const paidToTrader   = targetDb.prepare(`SELECT COALESCE(SUM(amount),0) v FROM trader_payments WHERE trader_id=? AND direction != 'from_trader'`).get(targetTraderId)?.v || 0
  const receivedFromTrader = targetDb.prepare(`SELECT COALESCE(SUM(amount),0) v FROM trader_payments WHERE trader_id=? AND direction = 'from_trader'`).get(targetTraderId)?.v || 0

  let adjustments = 0
  try {
    adjustments = targetDb.prepare(`SELECT COALESCE(SUM(amount),0) v FROM trader_adjustments WHERE trader_id=? AND (voided IS NULL OR voided=0)`).get(targetTraderId)?.v || 0
  } catch (e) {
    // If trader_adjustments not available on older DB
  }

  // Medication debits for trader with pro-rata tax_pct matching getCrossBatchTraderLedger bill grouping
  let medDebits = 0
  try {
    const medRows = targetDb.prepare(`SELECT date, batch_id, cost, tax_pct FROM medication_log WHERE trader_id=?`).all(targetTraderId)
    const medGroups = {}
    for (const m of medRows) {
      const key = `${m.date}|${m.batch_id}`
      if (!medGroups[key]) {
        medGroups[key] = { debit: 0, taxPct: Number(m.tax_pct || 0) }
      }
      medGroups[key].debit += Number(m.cost || 0)
    }
    for (const g of Object.values(medGroups)) {
      const taxAmt = g.debit * g.taxPct / 100
      medDebits += Math.round(g.debit + taxAmt)
    }
  } catch (e) {
    // If medication_log or tax_pct not available on older DB
  }

  // credit (sales + payments to trader) - debit (feed + medication + payments from trader) + adjustments
  return Math.round((Number(openingBalance) + Number(sales) - Number(feed) - Number(medDebits) + Number(paidToTrader) - Number(receivedFromTrader) + Number(adjustments)) * 100) / 100
}

// Calculate net effect of a trader's rows copied into new year for active batches actually moving
function getTraderCopiedEffect(fromDb, traderId, movingBatchIds) {
  if (!movingBatchIds || movingBatchIds.length === 0) return 0
  const marks = movingBatchIds.map(() => '?').join(',')

  const sales = fromDb.prepare(`SELECT COALESCE(SUM(amount),0) v FROM egg_sales WHERE trader_id=? AND batch_id IN (${marks})`).get(traderId, ...movingBatchIds)?.v || 0
  const feed  = fromDb.prepare(`SELECT COALESCE(SUM(qty_kg*rate_per_kg),0) v FROM feed_allocations WHERE trader_id=? AND batch_id IN (${marks})`).get(traderId, ...movingBatchIds)?.v || 0

  let medDebits = 0
  try {
    const medRows = fromDb.prepare(`SELECT date, batch_id, cost, tax_pct FROM medication_log WHERE trader_id=? AND batch_id IN (${marks})`).all(traderId, ...movingBatchIds)
    const medGroups = {}
    for (const m of medRows) {
      const key = `${m.date}|${m.batch_id}`
      if (!medGroups[key]) {
        medGroups[key] = { debit: 0, taxPct: Number(m.tax_pct || 0) }
      }
      medGroups[key].debit += Number(m.cost || 0)
    }
    for (const g of Object.values(medGroups)) {
      const taxAmt = g.debit * g.taxPct / 100
      medDebits += Math.round(g.debit + taxAmt)
    }
  } catch (e) {
    // If medication_log or tax_pct not available on older DB
  }

  // copied_effect = copied egg_sales amounts - copied feed_allocations (qty*rate) - copied medication (with tax)
  return Number(sales) - Number(feed) - Number(medDebits)
}

function checkMigrationNeeded(fromYear) {
  const fromPath = getDbPath(fromYear)
  if (!fs.existsSync(fromPath)) return { needed: false, batches: [], traders: [] }

  const fromDb = new Database(fromPath, { readonly: true })
  try {
    const batches = fromDb.prepare(`SELECT * FROM flocks WHERE status != 'Closed' ORDER BY id`).all()
    if (batches.length === 0) return { needed: false, batches: [], traders: [] }

    const traders = fromDb.prepare(`SELECT * FROM traders ORDER BY name`).all()
    const tradersWithBalance = traders.map(t => ({
      ...t,
      closing_balance: getTraderClosingBalance(fromDb, t.id, t.opening_balance)
    }))

    return { needed: true, batches, traders: tradersWithBalance }
  } finally {
    fromDb.close()
  }
}

function runYearMigration(fromYear, toYear, options = {}) {
  const backupDir = backupDatabaseFiles(`migration_${fromYear}_to_${toYear}`)
  const fromPath = getDbPath(fromYear)
  const toPath   = getDbPath(toYear)

  if (!fs.existsSync(fromPath)) {
    throw new Error(`Migration failed, no data was changed. A backup is at ${backupDir}. Detail: Source DB layererp-${fromYear}.db not found`)
  }

  // Open both DBs
  const fromDb = new Database(fromPath)
  fromDb.pragma('journal_mode = WAL')
  fromDb.pragma('foreign_keys = OFF')
  initSchema(fromDb)

  const toDb = getDb(toYear)
  toDb.pragma('foreign_keys = OFF')

  // Get active batches from source
  const activeBatches = fromDb.prepare(`SELECT * FROM flocks WHERE status != 'Closed'`).all()
  if (activeBatches.length === 0) {
    fromDb.close()
    return { moved: 0, traders: 0 }
  }

  const batchIds = activeBatches.map(b => b.batch_id)
  const traderIdMap = {} // old id → new id in toYear DB

  const tablesToCopy = [
    { table: 'egg_production', cols: ['date','batch_id','pullet_trays','medium_trays','correct_size_trays','export_trays','large_trays','double_yolk_eggs'] },
    { table: 'egg_sales', cols: ['date','batch_id','trader_id','grade','quantity','unit_type','rate_per_egg','amount','broken_qty','notes'] },
    { table: 'feed_allocations', cols: ['date','batch_id','purchase_id','trader_id','feed_type','qty_kg','rate_per_kg','notes'] },
    { table: 'feed_daily_intake', cols: ['date','batch_id','feed_type','qty_kg','notes'] },
    { table: 'feed_returns', cols: ['date','batch_id','feed_type','qty_kg','notes'] },
    { table: 'mortality_log', cols: ['date','batch_id','deaths','reason','notes'] },
    { table: 'batch_expenses', cols: ['date','batch_id','expense_type','amount','notes'] },
    { table: 'manure_sales', cols: ['date','batch_id','qty_kg','rate_per_kg','amount','buyer','notes'] }
  ]

  const verifiedBatchIds = []
  let phaseACommitted = false

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE A: ONE transaction on the new-year DB (toDb)
    // ═══════════════════════════════════════════════════════════════════════════
    const phaseA = toDb.transaction(() => {
      // 1. Upsert traders inside the Phase A transaction
      const traders = fromDb.prepare(`SELECT * FROM traders`).all()
      for (const t of traders) {
        const closingOld = getTraderClosingBalance(fromDb, t.id, t.opening_balance)
        const copiedEffect = getTraderCopiedEffect(fromDb, t.id, batchIds)
        const openingNew = closingOld - copiedEffect

        const existing = toDb.prepare(`SELECT id FROM traders WHERE name=?`).get(t.name)
        if (existing) {
          traderIdMap[t.id] = existing.id
          toDb.prepare(`UPDATE traders SET opening_balance=?, phone=?, address=?, types=?, carried_from_year=? WHERE id=?`)
            .run(openingNew, t.phone || '', t.address || '', t.types || '', fromYear, existing.id)
        } else {
          const info = toDb.prepare(`INSERT INTO traders (name, phone, address, opening_balance, types, notes, carried_from_year) VALUES (?,?,?,?,?,?,?)`)
            .run(t.name, t.phone || '', t.address || '', openingNew, t.types || '', t.notes || '', fromYear)
          traderIdMap[t.id] = info.lastInsertRowid
        }
      }

      // 2. Process active batches
      for (const batch of activeBatches) {
        const bid = batch.batch_id
        const existingFlock = toDb.prepare(`SELECT id FROM flocks WHERE batch_id=?`).get(bid)

        if (existingFlock) {
          // Flock already exists in new file: do NOT silently delete source rows.
          // Run the same count verification between the two files.
          for (const item of tablesToCopy) {
            const srcCount = fromDb.prepare(`SELECT COUNT(*) c FROM ${item.table} WHERE batch_id=?`).get(bid).c
            const dstCount = toDb.prepare(`SELECT COUNT(*) c FROM ${item.table} WHERE batch_id=?`).get(bid).c
            if (srcCount !== dstCount) {
              throw new Error(`Flock ${bid} already exists in ${toYear} with differing row counts for ${item.table} (source: ${srcCount}, target: ${dstCount}). Migration aborted.`)
            }
          }
          const srcMeds = fromDb.prepare(`SELECT COUNT(*) c FROM medication_log WHERE batch_id=?`).get(bid).c
          const dstMeds = toDb.prepare(`SELECT COUNT(*) c FROM medication_log WHERE batch_id=?`).get(bid).c
          if (srcMeds !== dstMeds) {
            throw new Error(`Flock ${bid} already exists in ${toYear} with differing row counts for medication_log (source: ${srcMeds}, target: ${dstMeds}). Migration aborted.`)
          }
          const srcPacks = fromDb.prepare(`SELECT COUNT(*) c FROM medication_pack_details WHERE medication_id IN (SELECT id FROM medication_log WHERE batch_id=?)`).get(bid).c
          const dstPacks = toDb.prepare(`SELECT COUNT(*) c FROM medication_pack_details WHERE medication_id IN (SELECT id FROM medication_log WHERE batch_id=?)`).get(bid).c
          if (srcPacks !== dstPacks) {
            throw new Error(`Flock ${bid} already exists in ${toYear} with differing medication_pack_details counts (source: ${srcPacks}, target: ${dstPacks}). Migration aborted.`)
          }

          // Counts match: treat it as a completed copy and mark for Phase B purge
          verifiedBatchIds.push(bid)
          continue
        }

        // New flock: insert flock and copy rows
        toDb.prepare(`INSERT INTO flocks (batch_id, shed, breed, start_date, initial_age_days, start_count, current_count, free_chicks, cost_per_chick, status)
          VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .run(bid, batch.shed || '', batch.breed || '', batch.start_date, batch.initial_age_days || 0,
               batch.start_count || 0, batch.current_count || 0, batch.free_chicks || 0, batch.cost_per_chick || 0, 'Active')

        for (const item of tablesToCopy) {
          const rows = fromDb.prepare(`SELECT * FROM ${item.table} WHERE batch_id=? ORDER BY id`).all(bid)
          for (const row of rows) {
            const mappedRow = { ...row }
            if ('trader_id' in mappedRow && mappedRow.trader_id) {
              mappedRow.trader_id = traderIdMap[mappedRow.trader_id] || mappedRow.trader_id
            }
            const colList = item.cols.join(',')
            const vals    = item.cols.map(c => mappedRow[c] ?? null)
            const marks   = item.cols.map(() => '?').join(',')
            toDb.prepare(`INSERT INTO ${item.table} (${colList}) VALUES (${marks})`).run(...vals)
          }
        }

        // Medication and pack details
        const meds = fromDb.prepare(`SELECT * FROM medication_log WHERE batch_id=? ORDER BY id`).all(bid)
        for (const med of meds) {
          const newTraderId = med.trader_id ? (traderIdMap[med.trader_id] || med.trader_id) : null
          const info = toDb.prepare(`INSERT INTO medication_log
            (date,batch_id,trader_id,type,medicine,dose,cost,notes,route,administered_by,tax_pct,particulars)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(med.date, bid, newTraderId, med.type || '', med.medicine || '',
                 med.dose || '', med.cost || 0, med.notes || '', med.route || '', med.administered_by || '',
                 Number(med.tax_pct || 0), med.particulars || '')
          if (info.changes > 0) {
            const packs = fromDb.prepare(`SELECT * FROM medication_pack_details WHERE medication_id=?`).all(med.id)
            for (const p of packs) {
              toDb.prepare(`INSERT INTO medication_pack_details (medication_id,form_type,num_packs,qty_per_pack,price_per_pack,qty_unit)
                VALUES (?,?,?,?,?,?)`)
                .run(info.lastInsertRowid, p.form_type, p.num_packs, p.qty_per_pack, p.price_per_pack, p.qty_unit || null)
            }
          }
        }

        verifiedBatchIds.push(bid)
      }

      // Test failure injection in the middle of Phase A before verification/commit
      if (typeof options.testInjectPhaseAFail === 'function') {
        options.testInjectPhaseAFail({ toDb, fromDb, traderIdMap, batchIds: verifiedBatchIds })
      } else if (options.testInjectPhaseAFail) {
        throw new Error('Test injected failure in Phase A transaction')
      }

      // 3. Pre-commit VERIFY inside Phase A transaction:
      // a. For every moving batch and every copied table, row count in new file == row count in old file
      for (const bid of verifiedBatchIds) {
        for (const item of tablesToCopy) {
          const srcCount = fromDb.prepare(`SELECT COUNT(*) c FROM ${item.table} WHERE batch_id=?`).get(bid).c
          const dstCount = toDb.prepare(`SELECT COUNT(*) c FROM ${item.table} WHERE batch_id=?`).get(bid).c
          if (srcCount !== dstCount) {
            throw new Error(`Pre-commit verification failed: row count mismatch for batch ${bid} in ${item.table} (source: ${srcCount}, target: ${dstCount})`)
          }
        }
        const srcMeds = fromDb.prepare(`SELECT COUNT(*) c FROM medication_log WHERE batch_id=?`).get(bid).c
        const dstMeds = toDb.prepare(`SELECT COUNT(*) c FROM medication_log WHERE batch_id=?`).get(bid).c
        if (srcMeds !== dstMeds) {
          throw new Error(`Pre-commit verification failed: medication_log count mismatch for batch ${bid} (source: ${srcMeds}, target: ${dstMeds})`)
        }
        const srcPacks = fromDb.prepare(`SELECT COUNT(*) c FROM medication_pack_details WHERE medication_id IN (SELECT id FROM medication_log WHERE batch_id=?)`).get(bid).c
        const dstPacks = toDb.prepare(`SELECT COUNT(*) c FROM medication_pack_details WHERE medication_id IN (SELECT id FROM medication_log WHERE batch_id=?)`).get(bid).c
        if (srcPacks !== dstPacks) {
          throw new Error(`Pre-commit verification failed: medication_pack_details count mismatch for batch ${bid} (source: ${srcPacks}, target: ${dstPacks})`)
        }
      }

      // b. For EVERY trader, verify the carried-over balance using rows actually copied into toDb
      for (const t of traders) {
        const closingOld = getTraderClosingBalance(fromDb, t.id, t.opening_balance)
        const newTraderId = traderIdMap[t.id]
        const newOpening = toDb.prepare(`SELECT opening_balance FROM traders WHERE id=?`).get(newTraderId)?.opening_balance || 0
        const verifiedBalance = newOpening + getTraderCopiedEffect(toDb, newTraderId, batchIds)
        if (Math.abs(verifiedBalance - closingOld) > 0.01) {
          throw new Error(`Pre-commit balance verification failed for trader "${t.name}": old=${closingOld.toFixed(2)}, verified=${verifiedBalance.toFixed(2)}`)
        }
      }
    })

    // Commit Phase A
    phaseA()
    phaseACommitted = true

    // Test failure injection in Phase B
    if (options.testInjectPhaseBFail) {
      throw new Error('Test injected failure in Phase B before source purge')
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE B: ONLY after Phase A commits, delete moved rows from old-year file
    // inside ONE transaction on fromDb, for the verified batches only
    // ═══════════════════════════════════════════════════════════════════════════
    const phaseB = fromDb.transaction(() => {
      for (const bid of verifiedBatchIds) {
        fromDb.prepare(`DELETE FROM medication_pack_details WHERE medication_id IN (SELECT id FROM medication_log WHERE batch_id=?)`).run(bid)
        fromDb.prepare(`DELETE FROM medication_log    WHERE batch_id=?`).run(bid)
        fromDb.prepare(`DELETE FROM egg_production    WHERE batch_id=?`).run(bid)
        fromDb.prepare(`DELETE FROM egg_sales         WHERE batch_id=?`).run(bid)
        fromDb.prepare(`DELETE FROM feed_allocations  WHERE batch_id=?`).run(bid)
        fromDb.prepare(`DELETE FROM feed_daily_intake WHERE batch_id=?`).run(bid)
        fromDb.prepare(`DELETE FROM feed_returns      WHERE batch_id=?`).run(bid)
        fromDb.prepare(`DELETE FROM mortality_log     WHERE batch_id=?`).run(bid)
        fromDb.prepare(`DELETE FROM batch_expenses    WHERE batch_id=?`).run(bid)
        fromDb.prepare(`DELETE FROM manure_sales      WHERE batch_id=?`).run(bid)
        fromDb.prepare(`DELETE FROM flocks            WHERE batch_id=? AND status != 'Closed'`).run(bid)
      }
    })

    phaseB()
    fromDb.close()

    return { moved: verifiedBatchIds.length, traders: Object.keys(traderIdMap).length }
  } catch (err) {
    try { fromDb.close() } catch (e) {}
    console.error('[Database] runYearMigration failed:', err.message)
    if (typeof phaseACommitted !== 'undefined' && phaseACommitted) {
      throw new Error(`Migration copied your data to ${toYear} but could not finish cleaning up ${fromYear}. Nothing was lost. Please run the migration again to complete it. A backup is at ${backupDir}. Detail: ${err.message}`)
    } else {
      throw new Error(`Migration failed, no data was changed. A backup is at ${backupDir}. Detail: ${err.message}`)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TRADER ADJUSTMENTS & OPENING BALANCE AUDIT
// ─────────────────────────────────────────────────────────────────────────────

function insertTraderAdjustment(data) {
  if (!data || !data.trader_id) {
    throw new Error("Trader ID is required.")
  }
  if (!data.date) {
    throw new Error("Adjustment date is required.")
  }
  const match = String(data.date).match(/^(\d{4})/)
  const adjYear = match ? parseInt(match[1], 10) : null
  if (!adjYear || adjYear !== activeYear) {
    throw new Error(`Adjustment date (${data.date}) must be within the active financial year (${activeYear}).`)
  }
  if (!data.note || typeof data.note !== "string" || !data.note.trim()) {
    throw new Error("Adjustment note cannot be empty.")
  }
  const amount = Number(data.amount)
  if (isNaN(amount) || amount === 0) {
    throw new Error("Adjustment amount cannot be zero.")
  }

  const d = getDb()
  const info = d.prepare(`
    INSERT INTO trader_adjustments (date, trader_id, amount, note)
    VALUES (?, ?, ?, ?)
  `).run(data.date, Number(data.trader_id), amount, data.note.trim())

  return { id: info.lastInsertRowid, ...data, amount, note: data.note.trim() }
}

function getTraderAdjustments(traderId) {
  return getDb().prepare(`
    SELECT * FROM trader_adjustments
    WHERE trader_id = ?
    ORDER BY date DESC, id DESC
  `).all(traderId)
}

function voidTraderAdjustment(id, reason) {
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    throw new Error("A reason is required to void an adjustment.")
  }
  const d = getDb()
  const adj = d.prepare(`SELECT * FROM trader_adjustments WHERE id = ?`).get(id)
  if (!adj) {
    throw new Error(`Adjustment with ID ${id} not found.`)
  }
  if (adj.voided) {
    throw new Error(`Adjustment with ID ${id} is already voided.`)
  }
  d.prepare(`
    UPDATE trader_adjustments
    SET voided = 1, void_reason = ?, voided_at = datetime('now')
    WHERE id = ?
  `).run(reason.trim(), id)
  return { success: true }
}

function updateTraderOpeningBalance(traderId, newValue, reason) {
  const d = getDb()
  const trader = d.prepare(`SELECT * FROM traders WHERE id = ?`).get(traderId)
  if (!trader) {
    throw new Error(`Trader with ID ${traderId} not found.`)
  }
  if (trader.carried_from_year !== null && trader.carried_from_year !== undefined) {
    throw new Error(`Cannot edit opening balance of a trader carried forward from year ${trader.carried_from_year}. To correct it, add an adjustment.`)
  }
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    throw new Error("A reason is required to change opening balance.")
  }
  const val = Number(newValue)
  if (isNaN(val)) {
    throw new Error("New opening balance must be a valid number.")
  }
  const oldVal = Number(trader.opening_balance || 0)
  const tx = d.transaction(() => {
    d.prepare(`UPDATE traders SET opening_balance = ? WHERE id = ?`).run(val, traderId)
    d.prepare(`
      INSERT INTO trader_opening_log (trader_id, old_value, new_value, reason)
      VALUES (?, ?, ?, ?)
    `).run(traderId, oldVal, val, reason.trim())
  })
  tx()
  return { success: true, old_value: oldVal, new_value: val }
}

function getTraderOpeningLogs(traderId) {
  return getDb().prepare(`
    SELECT * FROM trader_opening_log
    WHERE trader_id = ?
    ORDER BY changed_at DESC, id DESC
  `).all(traderId)
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {

  getDb,
  closeDb: () => { if (db) { try { db.close() } catch(e){} db = null } },
  initSchema,

  // Year management
  getActiveYear: () => activeYear,
  switchYear,
  backupDatabaseFiles,
  backupBeforeUnlock,
  getAvailableYears: () => {
    const userData = getUserDataPath()
    return fs.readdirSync(userData)
      .filter(f => f.match(/^layererp-(\d{4})\.db$/))
      .map(f => parseInt(f.match(/(\d{4})/)[1]))
      .sort((a, b) => b - a)
  },

  // Migration
  checkMigrationNeeded: (fromYear) => checkMigrationNeeded(fromYear),
  runYearMigration: (fromYear, toYear, options) => runYearMigration(fromYear, toYear, options),
  getMigrationPreview: (prevYear) => getMigrationPreview(prevYear),
  getTraderClosingBalance: (prevDb, traderId, openingBalance) => getTraderClosingBalance(prevDb, traderId, openingBalance),
  getTraderCopiedEffect: (db, traderId, movingBatchIds) => getTraderCopiedEffect(db, traderId, movingBatchIds),

  // ───────────────────────────────────────────────
  // BATCHES
  // ───────────────────────────────────────────────

  insertFlock: (data) => {
    const d = getDb()
    let initialDays = 0
    if (data.initial_age) {
      const parts = String(data.initial_age).split('.')
      initialDays = (Number(parts[0] || 0) * 7) + Number(parts[1] || 0)
    }
    d.prepare(`
      INSERT INTO flocks (batch_id, shed, breed, start_date, initial_age_days, start_count, current_count, free_chicks, cost_per_chick, status)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(data.batch_id, data.shed || "", data.breed || "", data.start_date, initialDays,
           Number(data.start_count || 0), Number(data.start_count || 0) + Number(data.free_chicks || 0), Number(data.free_chicks || 0),
           Number(data.cost_per_chick || 0), "Active")
  },

  getFlocks: () => {
    return getDb().prepare(`SELECT * FROM flocks WHERE status != 'Closed' ORDER BY id DESC`).all()
  },

  getFlockByBatchId: (batchId) => {
    return getDb().prepare(`SELECT * FROM flocks WHERE batch_id = ? LIMIT 1`).get(batchId) || null
  },

  updateFlock: (id, data) => {
    const d = getDb()
    let initialDays = 0
    if (data.initial_age !== undefined && data.initial_age !== null) {
      const parts = String(data.initial_age).split('.')
      initialDays = (Number(parts[0] || 0) * 7) + Number(parts[1] || 0)
    } else {
      const cur = d.prepare(`SELECT initial_age_days FROM flocks WHERE id=?`).get(id)
      initialDays = cur ? cur.initial_age_days : 0
    }
    // Free chicks are live birds too — if this update changes free_chicks,
    // shift current_count by the same delta so they're reflected in the
    // live bird count (rather than overwriting current_count, which would
    // wipe out any mortality/sale adjustments already applied to it).
    const existing = d.prepare(`SELECT free_chicks, current_count FROM flocks WHERE id=?`).get(id)
    const oldFreeChicks = existing ? Number(existing.free_chicks || 0) : 0
    const newFreeChicks = Number(data.free_chicks ?? oldFreeChicks)
    const freeChickDelta = newFreeChicks - oldFreeChicks
    const newCurrentCount = existing ? Number(existing.current_count || 0) + freeChickDelta : 0

    d.prepare(`
      UPDATE flocks SET shed=?, breed=?, start_date=?, initial_age_days=?, start_count=?, free_chicks=?, current_count=?, cost_per_chick=?, status=? WHERE id=?
    `).run(data.shed, data.breed, data.start_date, initialDays,
           Number(data.start_count), newFreeChicks, newCurrentCount, Number(data.cost_per_chick || 0), data.status, id)
  },

  updateCurrentBirdCount: (batchId, count) => {
    getDb().prepare(`UPDATE flocks SET current_count=? WHERE batch_id=?`).run(Number(count), batchId)
  },

  deleteFlock: (id) => {
    const d = getDb()
    const flock = d.prepare(`SELECT batch_id FROM flocks WHERE id=?`).get(id)
    if (!flock) return
    const batchId = flock.batch_id
    const medIds = d.prepare(`SELECT id FROM medication_log WHERE batch_id=?`).all(batchId).map(r => r.id)
    const deleteMany = d.transaction(() => {
      d.prepare(`DELETE FROM egg_production    WHERE batch_id=?`).run(batchId)
      d.prepare(`DELETE FROM egg_sales         WHERE batch_id=?`).run(batchId)
      d.prepare(`DELETE FROM feed_allocations  WHERE batch_id=?`).run(batchId)
      d.prepare(`DELETE FROM feed_daily_intake WHERE batch_id=?`).run(batchId)
      d.prepare(`DELETE FROM feed_returns      WHERE batch_id=?`).run(batchId)
      d.prepare(`DELETE FROM mortality_log     WHERE batch_id=?`).run(batchId)
      for (const medId of medIds) {
        d.prepare(`DELETE FROM medication_pack_details WHERE medication_id=?`).run(medId)
      }
      d.prepare(`DELETE FROM medication_log    WHERE batch_id=?`).run(batchId)
      d.prepare(`DELETE FROM batch_expenses    WHERE batch_id=?`).run(batchId)
      d.prepare(`DELETE FROM manure_sales      WHERE batch_id=?`).run(batchId)
      d.prepare(`DELETE FROM batch_closure     WHERE batch_id=?`).run(batchId)
      d.prepare(`DELETE FROM flocks            WHERE id=?`).run(id)
    })
    deleteMany()
  },

  getClosedBatches: () => {
    return getDb().prepare(`SELECT * FROM flocks WHERE status='Closed' ORDER BY id DESC`).all()
  },

  // ───────────────────────────────────────────────
  // TRADERS
  // ───────────────────────────────────────────────

  insertTrader: (data) => {
    getDb().prepare(`INSERT INTO traders (name, phone, address, opening_balance, types, notes, carried_from_year) VALUES (?,?,?,?,?,?,?)`)
      .run(data.name, data.phone || "", data.address || "", Number(data.opening_balance || 0), data.types || "", data.notes || "", data.carried_from_year || null)
  },

  getTraders: () => {
    return getDb().prepare(`SELECT * FROM traders ORDER BY name`).all()
  },

  updateTrader: (id, data) => {
    if ('carried_from_year' in data) {
      getDb().prepare(`UPDATE traders SET name=?, phone=?, address=?, opening_balance=?, types=?, notes=?, carried_from_year=? WHERE id=?`)
        .run(data.name, data.phone, data.address, Number(data.opening_balance || 0), data.types, data.notes, data.carried_from_year || null, id)
    } else {
      getDb().prepare(`UPDATE traders SET name=?, phone=?, address=?, opening_balance=?, types=?, notes=? WHERE id=?`)
        .run(data.name, data.phone, data.address, Number(data.opening_balance || 0), data.types, data.notes, id)
    }
  },

  deleteTrader: (id) => {
    getDb().prepare(`DELETE FROM traders WHERE id=?`).run(id)
  },

  // Trader adjustments & opening balance audit
  insertTraderAdjustment: (data) => insertTraderAdjustment(data),
  getTraderAdjustments: (traderId) => getTraderAdjustments(traderId),
  voidTraderAdjustment: (id, reason) => voidTraderAdjustment(id, reason),
  updateTraderOpeningBalance: (traderId, newValue, reason) => updateTraderOpeningBalance(traderId, newValue, reason),
  getTraderOpeningLogs: (traderId) => getTraderOpeningLogs(traderId),

  // ───────────────────────────────────────────────
  // FEED ALLOCATIONS
  // ───────────────────────────────────────────────

  insertFeedAllocation: (data) => {
    getDb().prepare(`INSERT INTO feed_allocations (date, batch_id, purchase_id, trader_id, feed_type, qty_kg, rate_per_kg, notes) VALUES (?,?,?,?,?,?,?,?)`)
      .run(data.date, data.batch_id, data.purchase_id || null, data.trader_id || null,
           data.feed_type, Number(data.qty_kg || 0), Number(data.rate_per_kg || 0), data.notes || "")
  },

  getFeedAllocationsByBatch: (batchId) => {
    return getDb().prepare(`
      SELECT fa.*, t.name AS trader_name FROM feed_allocations fa
      LEFT JOIN traders t ON fa.trader_id = t.id
      WHERE fa.batch_id=? ORDER BY fa.date DESC, fa.id DESC
    `).all(batchId)
  },

  deleteFeedAllocation: (id) => {
    getDb().prepare(`DELETE FROM feed_allocations WHERE id=?`).run(id)
  },

  updateFeedAllocation: (id, data) => {
    getDb().prepare(`UPDATE feed_allocations SET date=?, trader_id=?, feed_type=?, qty_kg=?, rate_per_kg=?, notes=? WHERE id=?`)
      .run(data.date, data.trader_id || null, data.feed_type, Number(data.qty_kg || 0), Number(data.rate_per_kg || 0), data.notes || "", id)
  },

  // ───────────────────────────────────────────────
  // FEED INTAKE
  // ───────────────────────────────────────────────

  insertFeedIntake: (data) => {
    getDb().prepare(`INSERT INTO feed_daily_intake (date, batch_id, feed_type, qty_kg, notes) VALUES (?,?,?,?,?)`)
      .run(data.date, data.batch_id, data.feed_type, Number(data.qty_kg || 0), data.notes || "")
  },

  getFeedIntakeByBatch: (batchId) => {
    return getDb().prepare(`SELECT * FROM feed_daily_intake WHERE batch_id=? ORDER BY date DESC, id DESC`).all(batchId)
  },

  deleteFeedIntake: (id) => {
    getDb().prepare(`DELETE FROM feed_daily_intake WHERE id=?`).run(id)
  },

  updateFeedIntake: (id, data) => {
    getDb().prepare(`UPDATE feed_daily_intake SET date=?, feed_type=?, qty_kg=?, notes=? WHERE id=?`)
      .run(data.date, data.feed_type, Number(data.qty_kg || 0), data.notes || "", id)
  },

  getBatchFeedBalance: (batchId) => {
    const d = getDb()
    const allocated = d.prepare(`SELECT feed_type, SUM(qty_kg) total FROM feed_allocations WHERE batch_id=? GROUP BY feed_type`).all(batchId)
    const consumed  = d.prepare(`SELECT feed_type, SUM(qty_kg) total FROM feed_daily_intake WHERE batch_id=? GROUP BY feed_type`).all(batchId)
    const returned  = d.prepare(`SELECT feed_type, SUM(qty_kg) total FROM feed_returns WHERE batch_id=? GROUP BY feed_type`).all(batchId)
    const consumedMap = {}
    consumed.forEach(r => consumedMap[r.feed_type] = Number(r.total))
    const returnedMap = {}
    returned.forEach(r => returnedMap[r.feed_type] = Number(r.total))
    return allocated.map(r => ({
      feed_type: r.feed_type,
      allocated: Number(r.total),
      consumed:  consumedMap[r.feed_type] || 0,
      returned:  returnedMap[r.feed_type] || 0,
      remaining: Number(r.total) - (consumedMap[r.feed_type] || 0) - (returnedMap[r.feed_type] || 0)
    }))
  },

  // ───────────────────────────────────────────────
  // FEED RETURNS
  // ───────────────────────────────────────────────

  insertFeedReturn: (data) => {
    getDb().prepare(`INSERT INTO feed_returns (date, batch_id, feed_type, qty_kg, notes) VALUES (?,?,?,?,?)`)
      .run(data.date, data.batch_id, data.feed_type, Number(data.qty_kg || 0), data.notes || "")
  },

  getFeedReturnsByBatch: (batchId) => {
    return getDb().prepare(`SELECT * FROM feed_returns WHERE batch_id=? ORDER BY date DESC, id DESC`).all(batchId)
  },

  deleteFeedReturn: (id) => {
    getDb().prepare(`DELETE FROM feed_returns WHERE id=?`).run(id)
  },

  updateFeedReturn: (id, data) => {
    getDb().prepare(`UPDATE feed_returns SET date=?, feed_type=?, qty_kg=?, notes=? WHERE id=?`)
      .run(data.date, data.feed_type, Number(data.qty_kg || 0), data.notes || "", id)
  },

  // Farm-level feed purchases
  insertFeedPurchase: (data) => {
    getDb().prepare(`INSERT INTO feed_purchases (date, trader_id, feed_type, qty_kg, rate_per_kg, amount, invoice_no, notes) VALUES (?,?,?,?,?,?,?,?)`)
      .run(data.date, data.trader_id || null, data.feed_type, Number(data.qty_kg || 0),
           Number(data.rate_per_kg || 0), Number(data.amount || 0), data.invoice_no || "", data.notes || "")
  },

  getFeedPurchases: () => {
    return getDb().prepare(`SELECT fp.*, t.name AS trader_name FROM feed_purchases fp LEFT JOIN traders t ON fp.trader_id=t.id ORDER BY fp.date DESC, fp.id DESC`).all()
  },

  deleteFeedPurchase: (id) => {
    getDb().prepare(`DELETE FROM feed_purchases WHERE id=?`).run(id)
  },

  getFarmFeedBalance: () => {
    const d = getDb()
    const purchased = d.prepare(`SELECT COALESCE(SUM(qty_kg),0) total FROM feed_purchases`).get()?.total || 0
    const allocated = d.prepare(`SELECT COALESCE(SUM(qty_kg),0) total FROM feed_allocations`).get()?.total || 0
    return { purchased: Number(purchased), allocated: Number(allocated), balance: Number(purchased) - Number(allocated) }
  },

  // ───────────────────────────────────────────────
  // EGG PRODUCTION
  // ───────────────────────────────────────────────

  insertEggProduction: (data) => {
    getDb().prepare(`INSERT INTO egg_production (date, batch_id, pullet_trays, medium_trays, correct_size_trays, export_trays, large_trays, double_yolk_eggs) VALUES (?,?,?,?,?,?,?,?)`)
      .run(data.date, data.batch_id, Number(data.pullet_trays || 0), Number(data.medium_trays || 0),
           Number(data.correct_size_trays || 0), Number(data.export_trays || 0), Number(data.large_trays || 0),
           Number(data.double_yolk_eggs || 0))
  },

  getEggProductionByBatch: (batchId) => {
    return getDb().prepare(`SELECT * FROM egg_production WHERE batch_id=? ORDER BY date DESC, id DESC`).all(batchId)
  },

  getEggProduction: () => {
    return getDb().prepare(`SELECT * FROM egg_production ORDER BY date DESC, id DESC`).all()
  },

  deleteEggProduction: (id) => {
    getDb().prepare(`DELETE FROM egg_production WHERE id=?`).run(id)
  },

  updateEggProduction: (id, data) => {
    getDb().prepare(`UPDATE egg_production SET date=?, pullet_trays=?, medium_trays=?, correct_size_trays=?, export_trays=?, large_trays=?, double_yolk_eggs=? WHERE id=?`)
      .run(data.date, Number(data.pullet_trays || 0), Number(data.medium_trays || 0),
           Number(data.correct_size_trays || 0), Number(data.export_trays || 0), Number(data.large_trays || 0),
           Number(data.double_yolk_eggs || 0), id)
  },

  // ───────────────────────────────────────────────
  // EGG SALES
  // ───────────────────────────────────────────────

  insertEggSale: (data) => {
    const amount = data.unit_type === "TRAY"
      ? Number(data.quantity || 0) * 30 * Number(data.rate_per_egg || 0)
      : Number(data.quantity || 0) * Number(data.rate_per_egg || 0)
    getDb().prepare(`INSERT INTO egg_sales (date, batch_id, trader_id, grade, quantity, unit_type, rate_per_egg, amount, broken_qty, notes) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(data.date, data.batch_id, data.trader_id || null, data.grade,
           Number(data.quantity || 0), data.unit_type, Number(data.rate_per_egg || 0),
           amount, Number(data.broken_qty || 0), data.notes || "")
  },

  getEggSales: () => {
    return getDb().prepare(`SELECT s.*, t.name AS trader_name FROM egg_sales s LEFT JOIN traders t ON s.trader_id=t.id ORDER BY s.date DESC, s.id DESC`).all()
  },

  getEggSalesByBatch: (batchId) => {
    return getDb().prepare(`SELECT s.*, t.name AS trader_name FROM egg_sales s LEFT JOIN traders t ON s.trader_id=t.id WHERE s.batch_id=? ORDER BY s.date DESC, s.id DESC`).all(batchId)
  },

  deleteEggSale: (id) => {
    getDb().prepare(`DELETE FROM egg_sales WHERE id=?`).run(id)
  },

  updateEggSale: (id, data) => {
    const amount = data.unit_type === "TRAY"
      ? Number(data.quantity || 0) * 30 * Number(data.rate_per_egg || 0)
      : Number(data.quantity || 0) * Number(data.rate_per_egg || 0)
    getDb().prepare(`UPDATE egg_sales SET date=?, trader_id=?, grade=?, quantity=?, unit_type=?, rate_per_egg=?, amount=?, broken_qty=?, notes=? WHERE id=?`)
      .run(data.date, data.trader_id || null, data.grade, Number(data.quantity || 0), data.unit_type,
           Number(data.rate_per_egg || 0), amount, Number(data.broken_qty || 0), data.notes || "", id)
  },

  // ───────────────────────────────────────────────
  // TRADER PAYMENTS
  // ───────────────────────────────────────────────

  insertTraderPayment: (data) => {
    getDb().prepare(`INSERT INTO trader_payments (date, trader_id, amount, mode, notes, direction) VALUES (?,?,?,?,?,?)`)
      .run(data.date, data.trader_id, Number(data.amount || 0), data.mode || "Cash", data.notes || "", data.direction === "from_trader" ? "from_trader" : "to_trader")
  },

  getTraderPayments: () => {
    return getDb().prepare(`SELECT p.*, t.name AS trader_name FROM trader_payments p LEFT JOIN traders t ON p.trader_id=t.id ORDER BY p.date DESC, p.id DESC`).all()
  },

  getTraderPaymentsByTrader: (traderId) => {
    return getDb().prepare(`SELECT p.*, t.name AS trader_name FROM trader_payments p LEFT JOIN traders t ON p.trader_id=t.id WHERE p.trader_id=? ORDER BY p.date DESC, p.id DESC`).all(traderId)
  },

  deleteTraderPayment: (id) => {
    getDb().prepare(`DELETE FROM trader_payments WHERE id=?`).run(id)
  },

  updateTraderPayment: (id, data) => {
    getDb().prepare(`UPDATE trader_payments SET date=?, trader_id=?, amount=?, mode=?, notes=?, direction=? WHERE id=?`)
      .run(data.date, data.trader_id || null, Number(data.amount || 0), data.mode || "Cash", data.notes || "", data.direction === "from_trader" ? "from_trader" : "to_trader", id)
  },

  // ───────────────────────────────────────────────
  // MORTALITY
  // ───────────────────────────────────────────────

  insertMortalityLog: (data) => {
    const d = getDb()
    const tx = d.transaction(() => {
      d.prepare(`INSERT INTO mortality_log (date, batch_id, deaths, reason, notes) VALUES (?,?,?,?,?)`)
        .run(data.date, data.batch_id, Number(data.deaths || 0), data.reason || "", data.notes || "")
      d.prepare(`UPDATE flocks SET current_count = MAX(0, current_count - ?) WHERE batch_id=?`)
        .run(Number(data.deaths || 0), data.batch_id)
    })
    tx()
  },

  getMortalityByBatch: (batchId) => {
    return getDb().prepare(`SELECT * FROM mortality_log WHERE batch_id=? ORDER BY date DESC, id DESC`).all(batchId)
  },

  deleteMortalityLog: (id) => {
    const d = getDb()
    const tx = d.transaction(() => {
      const existing = d.prepare(`SELECT * FROM mortality_log WHERE id=?`).get(id)
      if (existing) {
        d.prepare(`UPDATE flocks SET current_count = current_count + ? WHERE batch_id=?`).run(Number(existing.deaths || 0), existing.batch_id)
      }
      d.prepare(`DELETE FROM mortality_log WHERE id=?`).run(id)
    })
    tx()
  },

  updateMortalityLog: (id, data) => {
    const d = getDb()
    const tx = d.transaction(() => {
      const existing = d.prepare(`SELECT * FROM mortality_log WHERE id=?`).get(id)
      if (existing) {
        const delta = Number(data.deaths || 0) - Number(existing.deaths || 0)
        d.prepare(`UPDATE flocks SET current_count = MAX(0, current_count - ?) WHERE batch_id=?`).run(delta, existing.batch_id)
      }
      d.prepare(`UPDATE mortality_log SET date=?, deaths=?, reason=?, notes=? WHERE id=?`)
        .run(data.date, Number(data.deaths || 0), data.reason || "", data.notes || "", id)
    })
    tx()
  },

  // ───────────────────────────────────────────────
  // MEDICATION
  // ───────────────────────────────────────────────

  insertMedication: (data) => {
    const d = getDb()
    const np = Number(data.num_packs || 0)
    const qpp = Number(data.qty_per_pack || 0)
    const formType = data.form_type || "Powder"
    const unit = data.qty_unit || ((formType === "Liquid" || formType === "Drops") ? "L" : formType === "Vile" ? "vile(s)" : "kg")
    const doseStr = np > 0 ? `${np} pack(s) × ${qpp} ${unit}` : (data.qty || data.dose || "")
    const totalCost = np > 0 ? Number(data.price_per_pack || 0) * np : Number(data.cost || 0)
    const medicineName = (data.medicine_name || data.medicine || "").trim()

    const tx = d.transaction(() => {
      const info = d.prepare(`INSERT INTO medication_log (date, batch_id, trader_id, type, medicine, dose, cost, notes, route, administered_by, tax_pct, particulars) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(data.date, data.batch_id, data.trader_id ? Number(data.trader_id) : null,
             data.type || "Support Medicine", medicineName,
             doseStr, totalCost, data.notes || "", data.route || "",
             data.administered_by ? data.administered_by.trim() : "",
             Number(data.tax_pct || 0), data.particulars || "")
      if (np > 0) {
        d.prepare(`INSERT INTO medication_pack_details (medication_id, form_type, num_packs, qty_per_pack, price_per_pack, qty_unit) VALUES (?,?,?,?,?,?)`)
          .run(info.lastInsertRowid, formType, np, qpp, Number(data.price_per_pack || 0), unit)
      }
    })
    tx()
  },

  getMedicationByBatch: (batchId) => {
    return getDb().prepare(`
      SELECT m.*, t.name AS trader_name, p.form_type, p.num_packs, p.qty_per_pack, p.price_per_pack, p.qty_unit
      FROM medication_log m
      LEFT JOIN traders t ON m.trader_id = t.id
      LEFT JOIN medication_pack_details p ON p.medication_id = m.id
      WHERE m.batch_id=? ORDER BY m.date DESC, m.id DESC
    `).all(batchId)
  },

  getMedication: () => {
    return getDb().prepare(`
      SELECT m.*, t.name AS trader_name, p.form_type, p.num_packs, p.qty_per_pack, p.price_per_pack, p.qty_unit
      FROM medication_log m
      LEFT JOIN traders t ON m.trader_id = t.id
      LEFT JOIN medication_pack_details p ON p.medication_id = m.id
      ORDER BY m.date DESC, m.id DESC
    `).all()
  },

  getAdministeredByNames: () => {
    return getDb().prepare(`SELECT DISTINCT administered_by AS name FROM medication_log WHERE administered_by IS NOT NULL AND TRIM(administered_by) <> '' ORDER BY administered_by COLLATE NOCASE`).all().map(r => r.name)
  },

  deleteMedication: (id) => {
    const d = getDb()
    d.prepare(`DELETE FROM medication_pack_details WHERE medication_id=?`).run(id)
    d.prepare(`DELETE FROM medication_log WHERE id=?`).run(id)
  },

  updateMedication: (id, data) => {
    const d = getDb()
    const np = Number(data.num_packs || 0)
    const qpp = Number(data.qty_per_pack || 0)
    const formType = data.form_type || "Powder"
    const unit = data.qty_unit || ((formType === "Liquid" || formType === "Drops") ? "L" : formType === "Vile" ? "vile(s)" : "kg")
    const doseStr = np > 0 ? `${np} pack(s) × ${qpp} ${unit}` : (data.qty || data.dose || "")
    const totalCost = np > 0 ? Number(data.price_per_pack || 0) * np : Number(data.cost || 0)
    const medicineName = (data.medicine_name || data.medicine || "").trim()

    const tx = d.transaction(() => {
      d.prepare(`UPDATE medication_log SET date=?, trader_id=?, type=?, medicine=?, dose=?, cost=?, notes=?, route=?, administered_by=?, tax_pct=?, particulars=? WHERE id=?`)
        .run(data.date, data.trader_id ? Number(data.trader_id) : null, data.type || "Support Medicine",
             medicineName, doseStr, totalCost, data.notes || "",
             data.route || "", data.administered_by ? data.administered_by.trim() : "",
             Number(data.tax_pct || 0), data.particulars || "", id)
      d.prepare(`DELETE FROM medication_pack_details WHERE medication_id=?`).run(id)
      if (np > 0) {
        d.prepare(`INSERT INTO medication_pack_details (medication_id, form_type, num_packs, qty_per_pack, price_per_pack, qty_unit) VALUES (?,?,?,?,?,?)`)
          .run(id, formType, np, qpp, Number(data.price_per_pack || 0), unit)
      }
    })
    tx()
  },

  // ───────────────────────────────────────────────
  // BATCH EXPENSES
  // ───────────────────────────────────────────────

  insertBatchExpense: (data) => {
    getDb().prepare(`INSERT INTO batch_expenses (date, batch_id, expense_type, amount, notes) VALUES (?,?,?,?,?)`)
      .run(data.date, data.batch_id, data.expense_type || "Other", Number(data.amount || 0), data.notes || "")
  },

  getBatchExpensesByBatch: (batchId) => {
    return getDb().prepare(`SELECT * FROM batch_expenses WHERE batch_id=? ORDER BY date DESC, id DESC`).all(batchId)
  },

  getAllBatchExpenses: () => {
    return getDb().prepare(`SELECT * FROM batch_expenses ORDER BY date DESC, id DESC`).all()
  },

  updateBatchExpense: (id, data) => {
    getDb().prepare(`UPDATE batch_expenses SET date=?, expense_type=?, amount=?, notes=? WHERE id=?`)
      .run(data.date, data.expense_type || "Other", Number(data.amount || 0), data.notes || "", id)
  },

  deleteBatchExpense: (id) => {
    getDb().prepare(`DELETE FROM batch_expenses WHERE id=?`).run(id)
  },

  // ───────────────────────────────────────────────
  // FARM EXPENSES
  // ───────────────────────────────────────────────

  insertFarmExpense: (data) => {
    getDb().prepare(`INSERT INTO farm_expenses (date, expense_type, amount, notes) VALUES (?,?,?,?)`)
      .run(data.date, data.expense_type || "Other", Number(data.amount || 0), data.notes || "")
  },

  getFarmExpenses: () => {
    return getDb().prepare(`SELECT * FROM farm_expenses ORDER BY date DESC, id DESC`).all()
  },

  updateFarmExpense: (id, data) => {
    getDb().prepare(`UPDATE farm_expenses SET date=?, expense_type=?, amount=?, notes=? WHERE id=?`)
      .run(data.date, data.expense_type || "Other", Number(data.amount || 0), data.notes || "", id)
  },

  deleteFarmExpense: (id) => {
    getDb().prepare(`DELETE FROM farm_expenses WHERE id=?`).run(id)
  },

  // ───────────────────────────────────────────────
  // OTHER FARM INCOME
  // ───────────────────────────────────────────────

  insertFarmOtherIncome: (data) => {
    getDb().prepare(`INSERT INTO farm_other_income (date, income_type, amount, notes) VALUES (?,?,?,?)`)
      .run(data.date, data.income_type || "Other", Number(data.amount || 0), data.notes || "")
  },

  getFarmOtherIncome: () => {
    return getDb().prepare(`SELECT * FROM farm_other_income ORDER BY date DESC, id DESC`).all()
  },

  updateFarmOtherIncome: (id, data) => {
    getDb().prepare(`UPDATE farm_other_income SET date=?, income_type=?, amount=?, notes=? WHERE id=?`)
      .run(data.date, data.income_type || "Other", Number(data.amount || 0), data.notes || "", id)
  },

  deleteFarmOtherIncome: (id) => {
    getDb().prepare(`DELETE FROM farm_other_income WHERE id=?`).run(id)
  },

  // ───────────────────────────────────────────────
  // MANURE SALES
  // ───────────────────────────────────────────────

  insertManureSale: (data) => {
    const amount = Number(data.qty_kg || 0) * Number(data.rate_per_kg || 0) || Number(data.amount || 0)
    getDb().prepare(`INSERT INTO manure_sales (date, batch_id, qty_kg, rate_per_kg, amount, buyer, notes) VALUES (?,?,?,?,?,?,?)`)
      .run(data.date, data.batch_id || null, Number(data.qty_kg || 0), Number(data.rate_per_kg || 0), amount, data.buyer || "", data.notes || "")
  },

  getManureSales: () => {
    return getDb().prepare(`SELECT * FROM manure_sales ORDER BY date DESC, id DESC`).all()
  },

  getManureSalesByBatch: (batchId) => {
    return getDb().prepare(`SELECT * FROM manure_sales WHERE batch_id=? ORDER BY date DESC, id DESC`).all(batchId)
  },

  deleteManureSale: (id) => {
    getDb().prepare(`DELETE FROM manure_sales WHERE id=?`).run(id)
  },

  updateManureSale: (id, data) => {
    const amount = Number(data.qty_kg || 0) * Number(data.rate_per_kg || 0) || Number(data.amount || 0)
    getDb().prepare(`UPDATE manure_sales SET date=?, batch_id=?, qty_kg=?, rate_per_kg=?, amount=?, buyer=?, notes=? WHERE id=?`)
      .run(data.date, data.batch_id || null, Number(data.qty_kg || 0), Number(data.rate_per_kg || 0), amount, data.buyer || "", data.notes || "", id)
  },

  // ───────────────────────────────────────────────
  // BATCH CLOSURE
  // ───────────────────────────────────────────────

  closeBatch: (data) => {
    const d = getDb()
    const totalAmount = Number(data.birds_sold || 0) * Number(data.price_per_bird || 0)
    const tx = d.transaction(() => {
      d.prepare(`INSERT INTO batch_closure (batch_id, closure_date, birds_sold, price_per_bird, bird_sale_amount, feed_returned_kg, buyer, notes) VALUES (?,?,?,?,?,?,?,?)`)
        .run(data.batch_id, data.closure_date, Number(data.birds_sold || 0), Number(data.price_per_bird || 0),
             totalAmount, Number(data.feed_returned_kg || 0), data.buyer || "", data.notes || "")
      d.prepare(`UPDATE flocks SET status='Closed' WHERE batch_id=?`).run(data.batch_id)
    })
    tx()
  },

  getBatchClosure: (batchId) => {
    return getDb().prepare(`SELECT * FROM batch_closure WHERE batch_id=? LIMIT 1`).get(batchId) || null
  },

  // ───────────────────────────────────────────────
  // PROFITABILITY
  // ───────────────────────────────────────────────

  getBatchProfitability: (batchId) => {
    const d = getDb()
    const flock = d.prepare(`SELECT * FROM flocks WHERE batch_id=? LIMIT 1`).get(batchId)
    if (!flock) return null
    const chickCost      = Number(flock.start_count || 0) * Number(flock.cost_per_chick || 0)
    const eggSales       = d.prepare(`SELECT COALESCE(SUM(amount),0) total FROM egg_sales WHERE batch_id=?`).get(batchId)?.total || 0
    const birdSale       = d.prepare(`SELECT COALESCE(SUM(bird_sale_amount),0) total FROM batch_closure WHERE batch_id=?`).get(batchId)?.total || 0
    const vaccineCost    = d.prepare(`SELECT COALESCE(SUM(cost),0) total FROM medication_log WHERE batch_id=? AND type='Vaccine'`).get(batchId)?.total || 0
    const medicalCost    = d.prepare(`SELECT COALESCE(SUM(cost),0) total FROM medication_log WHERE batch_id=? AND (type IS NULL OR type<>'Vaccine')`).get(batchId)?.total || 0
    const feedCost       = d.prepare(`SELECT COALESCE(SUM(qty_kg * rate_per_kg),0) total FROM feed_allocations WHERE batch_id=?`).get(batchId)?.total || 0
    const otherExpenses  = d.prepare(`SELECT COALESCE(SUM(amount),0) total FROM batch_expenses WHERE batch_id=?`).get(batchId)?.total || 0
    const medicationCost = Number(vaccineCost) + Number(medicalCost)
    const revenue  = Number(eggSales) + Number(birdSale)
    const expenses = Number(chickCost) + Number(feedCost) + Number(medicationCost) + Number(otherExpenses)
    return { batch_id: batchId, revenue, expenses, egg_sales: Number(eggSales), bird_sales: Number(birdSale), chick_cost: Number(chickCost), feed_cost: Number(feedCost), vaccine_cost: Number(vaccineCost), medical_cost: Number(medicalCost), medication_cost: medicationCost, other_expenses: Number(otherExpenses), net_profit: revenue - expenses }
  },

  // ───────────────────────────────────────────────
  // GLOBAL FINANCE SUMMARY
  // ───────────────────────────────────────────────

  getGlobalFinanceSummary: () => {
    const d = getDb()
    const eggSales         = d.prepare(`SELECT COALESCE(SUM(amount),0) total FROM egg_sales`).get()?.total || 0
    const birdSales        = d.prepare(`SELECT COALESCE(SUM(bird_sale_amount),0) total FROM batch_closure`).get()?.total || 0
    const manureSales      = d.prepare(`SELECT COALESCE(SUM(amount),0) total FROM manure_sales`).get()?.total || 0
    const farmOtherIncome  = d.prepare(`SELECT COALESCE(SUM(amount),0) total FROM farm_other_income`).get()?.total || 0
    const chickCost        = d.prepare(`SELECT COALESCE(SUM(start_count * cost_per_chick),0) total FROM flocks`).get()?.total || 0
    const feedCost         = d.prepare(`SELECT COALESCE(SUM(qty_kg * rate_per_kg),0) total FROM feed_allocations`).get()?.total || 0
    const medicationCost   = d.prepare(`SELECT COALESCE(SUM(cost),0) total FROM medication_log`).get()?.total || 0
    const batchOtherExp    = d.prepare(`SELECT COALESCE(SUM(amount),0) total FROM batch_expenses`).get()?.total || 0
    const farmExp          = d.prepare(`SELECT COALESCE(SUM(amount),0) total FROM farm_expenses`).get()?.total || 0
    const revenue  = Number(eggSales) + Number(birdSales) + Number(manureSales) + Number(farmOtherIncome)
    const expenses = Number(chickCost) + Number(feedCost) + Number(medicationCost) + Number(batchOtherExp) + Number(farmExp)
    return {
      revenue, egg_sales: Number(eggSales), bird_sales: Number(birdSales), manure_sales: Number(manureSales),
      farm_other_income: Number(farmOtherIncome),
      chick_cost: Number(chickCost), feed_cost: Number(feedCost), medication_cost: Number(medicationCost),
      batch_other_expenses: Number(batchOtherExp), farm_expenses: Number(farmExp),
      batch_expenses_total: Number(chickCost) + Number(feedCost) + Number(medicationCost) + Number(batchOtherExp),
      expenses, net_profit: revenue - expenses
    }
  },

  // ───────────────────────────────────────────────
  // TRADER LEDGER
  // ───────────────────────────────────────────────

  getCrossBatchTraderLedger: (traderId) => {
    const d = getDb()
    // Compact number formatting shared by the egg/feed particulars below:
    // whole numbers print as "600", fractional ones keep 2 decimals ("600.50").
    const fmtNum = (col) => `(CASE WHEN ${col} = CAST(${col} AS INTEGER) THEN CAST(CAST(${col} AS INTEGER) AS TEXT) ELSE printf('%.2f', ${col}) END)`
    const sales    = d.prepare(`
      SELECT id, date, batch_id,
             ('Egg Sale' || COALESCE(' – ' || NULLIF(grade,''), '') || ' — ' || ${fmtNum('quantity')} ||
              (CASE WHEN unit_type='PIECE' THEN ' pcs' ELSE ' trays' END) ||
              ' × ₹' || printf('%.2f', rate_per_egg) || '/egg' || COALESCE(' — ' || NULLIF(notes,''), '')) AS particulars,
             amount AS credit, 0 AS debit, 'sale' AS source, grade, quantity, unit_type, rate_per_egg, notes
      FROM egg_sales WHERE trader_id=?`).all(traderId)
    const feed     = d.prepare(`
      SELECT id, date, batch_id,
             ('Feed Arrival' || COALESCE(' – ' || NULLIF(feed_type,''), '') || ' — ' || ${fmtNum('qty_kg')} || ' kg × ₹' || printf('%.2f', rate_per_kg) || '/kg' ||
              COALESCE(' — ' || NULLIF(notes,''), '')) AS particulars,
             0 AS credit, (qty_kg * rate_per_kg) AS debit, 'feed' AS source, feed_type, qty_kg, rate_per_kg, notes
      FROM feed_allocations WHERE trader_id=?`).all(traderId)
    const medication = d.prepare(`
      SELECT id, date, batch_id,
             (COALESCE(type,'Support Medicine') || ' (' || medicine || ')' || COALESCE(' — ' || NULLIF(notes,''), '')) AS particulars,
             0 AS credit, cost AS debit, 'medication' AS source, notes, tax_pct
      FROM medication_log WHERE trader_id=?`).all(traderId)
    const payments = d.prepare(`
      SELECT id, date, '-' AS batch_id,
             (CASE WHEN COALESCE(direction,'to_trader') = 'from_trader'
                   THEN 'Payment Received (' || mode || ')'
                   ELSE 'Payment (' || mode || ')' END
              || COALESCE(' — ' || NULLIF(notes,''), '')) AS particulars,
             (CASE WHEN COALESCE(direction,'to_trader') = 'from_trader' THEN 0 ELSE amount END) AS credit,
             (CASE WHEN COALESCE(direction,'to_trader') = 'from_trader' THEN amount ELSE 0 END) AS debit,
             'payment' AS source, mode, notes, COALESCE(direction,'to_trader') AS direction
      FROM trader_payments WHERE trader_id=?`).all(traderId)
    let adjustments = []
    try {
      adjustments = d.prepare(`
        SELECT id, date, '-' AS batch_id,
               ('Adjustment' || COALESCE(' — ' || NULLIF(note,''), '')) AS particulars,
               (CASE WHEN amount > 0 THEN amount ELSE 0 END) AS credit,
               (CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS debit,
               'adjustment' AS source, note, amount
        FROM trader_adjustments
        WHERE trader_id=? AND (voided IS NULL OR voided=0)
      `).all(traderId)
    } catch (e) {
      // If trader_adjustments not available on older DB
    }
    return [...sales, ...feed, ...medication, ...payments, ...adjustments].sort((a, b) => b.date.localeCompare(a.date))
  },

  // ───────────────────────────────────────────────
  // ACCOUNT LEDGER
  // ───────────────────────────────────────────────

  getAccountLedger: ({ startDate, endDate, batchId } = {}) => {
    const d = getDb()
    const p = []
    let dateWhere = ''
    if (startDate) { dateWhere += ` AND date >= ?`; p.push(startDate) }
    if (endDate)   { dateWhere += ` AND date <= ?`; p.push(endDate) }

    const run = (sql, params) => d.prepare(sql).all(...params)

    const eggSales = run(`
      SELECT es.id, es.date, ('Egg Sale – ' || es.grade || COALESCE(' (' || t.name || ')', '') || COALESCE(' — ' || NULLIF(es.notes,''), '')) AS particulars,
             es.batch_id, 0 AS debit, es.amount AS credit, 'egg_sale' AS source,
             es.grade, es.quantity, es.unit_type, es.rate_per_egg, es.trader_id, es.notes
      FROM egg_sales es LEFT JOIN traders t ON es.trader_id = t.id
      WHERE 1=1 ${dateWhere} ${batchId ? 'AND es.batch_id=?' : ''}
    `, batchId ? [...p, batchId] : p)

    const birdSales = run(`
      SELECT bc.id, bc.closure_date AS date, ('Bird Sale' || COALESCE(' – ' || bc.buyer, '') || COALESCE(' — ' || NULLIF(bc.notes,''), '')) AS particulars,
             bc.batch_id, 0 AS debit, bc.bird_sale_amount AS credit, 'bird_sale' AS source,
             bc.birds_sold, bc.price_per_bird, bc.buyer, bc.notes
      FROM batch_closure bc
      WHERE 1=1 ${dateWhere.replace(/date/g, 'closure_date')} ${batchId ? 'AND bc.batch_id=?' : ''}
    `, batchId ? [...p, batchId] : p)

    const manureSales = run(`
      SELECT ms.id, ms.date, ('Manure Sale' || COALESCE(' – ' || ms.buyer, '') || COALESCE(' — ' || NULLIF(ms.notes,''), '')) AS particulars,
             COALESCE(ms.batch_id, '-') AS batch_id, 0 AS debit, ms.amount AS credit, 'manure_sale' AS source,
             ms.qty_kg, ms.rate_per_kg, ms.buyer, ms.notes
      FROM manure_sales ms
      WHERE 1=1 ${dateWhere} ${batchId ? 'AND ms.batch_id=?' : ''}
    `, batchId ? [...p, batchId] : p)

    const feedCosts = run(`
      SELECT fa.id, fa.date, ('Feed – ' || fa.feed_type || COALESCE(' (' || t.name || ')', '') || COALESCE(' — ' || NULLIF(fa.notes,''), '')) AS particulars,
             fa.batch_id, (fa.qty_kg * fa.rate_per_kg) AS debit, 0 AS credit, 'feed' AS source,
             fa.feed_type, fa.qty_kg, fa.rate_per_kg, fa.trader_id, fa.notes
      FROM feed_allocations fa LEFT JOIN traders t ON fa.trader_id = t.id
      WHERE 1=1 ${dateWhere} ${batchId ? 'AND fa.batch_id=?' : ''}
    `, batchId ? [...p, batchId] : p)

    const medicationCosts = run(`
      SELECT m.id, m.date, (COALESCE(m.type,'Medicine') || ' – ' || m.medicine || COALESCE(' — ' || NULLIF(m.notes,''), '')) AS particulars,
             m.batch_id, m.cost AS debit, 0 AS credit, 'medication' AS source,
             m.medicine, m.dose, m.notes, m.tax_pct, p.form_type, p.num_packs, p.qty_per_pack, p.price_per_pack
      FROM medication_log m LEFT JOIN medication_pack_details p ON p.medication_id = m.id
      WHERE 1=1 ${dateWhere} ${batchId ? 'AND m.batch_id=?' : ''}
    `, batchId ? [...p, batchId] : p)

    const batchExpenses = run(`
      SELECT be.id, be.date, ('Expense – ' || be.expense_type || COALESCE(' — ' || NULLIF(be.notes,''), '')) AS particulars,
             be.batch_id, be.amount AS debit, 0 AS credit, 'batch_expense' AS source,
             be.expense_type AS expense_subtype, be.notes
      FROM batch_expenses be
      WHERE 1=1 ${dateWhere} ${batchId ? 'AND be.batch_id=?' : ''}
    `, batchId ? [...p, batchId] : p)

    const farmExpenses = batchId ? [] : run(`
      SELECT fe.id, fe.date, ('Farm Expense – ' || fe.expense_type || COALESCE(' — ' || NULLIF(fe.notes,''), '')) AS particulars,
             '-' AS batch_id, fe.amount AS debit, 0 AS credit, 'farm_expense' AS source,
             fe.expense_type AS expense_subtype, fe.notes
      FROM farm_expenses fe WHERE 1=1 ${dateWhere}
    `, p)

    const chickCosts = run(`
      SELECT f.id, f.start_date AS date, ('Chick Purchase – ' || f.batch_id) AS particulars,
             f.batch_id, (f.start_count * f.cost_per_chick) AS debit, 0 AS credit, 'chick_cost' AS source
      FROM flocks f
      WHERE 1=1 ${dateWhere.replace(/date/g, 'start_date')} ${batchId ? 'AND f.batch_id=?' : ''}
    `, batchId ? [...p, batchId] : p)

    const farmOtherIncome = batchId ? [] : run(`
      SELECT fi.id, fi.date, ('Other Income – ' || fi.income_type || COALESCE(' — ' || NULLIF(fi.notes,''), '')) AS particulars,
             '-' AS batch_id, 0 AS debit, fi.amount AS credit, 'farm_other_income' AS source,
             fi.income_type AS income_subtype, fi.notes
      FROM farm_other_income fi WHERE 1=1 ${dateWhere}
    `, p)

    const traderPayments = batchId ? [] : run(`
      SELECT tp.id, tp.date,
             (CASE WHEN COALESCE(tp.direction,'to_trader') = 'from_trader'
                   THEN 'Payment Received – ' || COALESCE(t.name,'Unknown Trader')
                   ELSE 'Payment – ' || COALESCE(t.name,'Unknown Trader') END
              || COALESCE(' (' || NULLIF(t.types,'') || ')', '') ||
              COALESCE(' — ' || NULLIF(tp.notes,''), '')) AS particulars,
             '-' AS batch_id,
             (CASE WHEN COALESCE(tp.direction,'to_trader') = 'from_trader' THEN 0 ELSE tp.amount END) AS debit,
             (CASE WHEN COALESCE(tp.direction,'to_trader') = 'from_trader' THEN tp.amount ELSE 0 END) AS credit,
             'trader_payment' AS source,
             t.name AS trader_name, t.types AS trader_type, tp.mode, tp.notes, COALESCE(tp.direction,'to_trader') AS direction
      FROM trader_payments tp LEFT JOIN traders t ON tp.trader_id = t.id
      WHERE 1=1 ${dateWhere}
    `, p)

    const all = [
      ...eggSales, ...birdSales, ...manureSales, ...farmOtherIncome,
      ...feedCosts, ...medicationCosts,
      ...batchExpenses, ...farmExpenses, ...chickCosts, ...traderPayments
    ].sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0))

    const totalBalance = all.reduce((s, r) => s + Number(r.credit || 0) - Number(r.debit || 0), 0)
    let running = totalBalance
    return all.map(row => {
      const bal = running
      running -= (Number(row.credit || 0) - Number(row.debit || 0))
      return { ...row, balance: bal }
    })
  }
}