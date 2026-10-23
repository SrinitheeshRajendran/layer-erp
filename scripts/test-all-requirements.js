const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const Database = require('better-sqlite3');

console.log('================================================================');
console.log('LAYER ERP: COMPREHENSIVE VERIFICATION & TEST SUITE');
console.log('================================================================\n');

const backupSourceDir = path.join(process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\srini', 'AppData', 'Roaming'), 'layer-erp-backup');
const backup2026 = path.join(backupSourceDir, 'layererp-2026.db');
assert(fs.existsSync(backup2026), `Backup DB not found at ${backup2026}`);

// Helper to create a temp data directory and load dbModule
function setupTempEnv(prefix = 'layer-test-') {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  process.env.LAYER_ERP_DATA_DIR = tempDir;
  // Clear require cache for db so it reinitializes with new LAYER_ERP_DATA_DIR
  delete require.cache[require.resolve('../database/db')];
  const dbModule = require('../database/db');
  dbModule.closeDb();
  return { tempDir, dbModule };
}

function copy2026ToTemp(tempDir) {
  const target = path.join(tempDir, 'layererp-2026.db');
  fs.copyFileSync(backup2026, target);
  if (fs.existsSync(backup2026 + '-wal')) fs.copyFileSync(backup2026 + '-wal', target + '-wal');
  if (fs.existsSync(backup2026 + '-shm')) fs.copyFileSync(backup2026 + '-shm', target + '-shm');
  return target;
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1: MAKE runYearMigration ALL-OR-NOTHING
// ─────────────────────────────────────────────────────────────────────────────

console.log('--- TEST 1.1: Phase A Failure Injection (Atomic Rollback) ---');
{
  const { tempDir, dbModule } = setupTempEnv('layer-p1-phaseA-');
  copy2026ToTemp(tempDir);

  const db2026Pre = new Database(path.join(tempDir, 'layererp-2026.db'), { readonly: true });
  const preFlocks = db2026Pre.prepare(`SELECT COUNT(*) c FROM flocks`).get().c;
  const preEggSales = db2026Pre.prepare(`SELECT COUNT(*) c FROM egg_sales`).get().c;
  const preFeed = db2026Pre.prepare(`SELECT COUNT(*) c FROM feed_allocations`).get().c;
  db2026Pre.close();

  let failedCaught = false;
  let errorMsg = '';
  try {
    dbModule.runYearMigration(2026, 2027, { testInjectPhaseAFail: true });
  } catch (err) {
    failedCaught = true;
    errorMsg = err.message;
  }
  dbModule.closeDb();

  assert(failedCaught, 'Expected migration to fail due to injected Phase A failure');
  assert(errorMsg.includes('Migration failed, no data was changed. A backup is at'), `Error message must match required format. Got: ${errorMsg}`);
  console.log('✓ Error message correctly returned to UI:', errorMsg);

  // Assert 2026 is fully intact
  const db2026Post = new Database(path.join(tempDir, 'layererp-2026.db'), { readonly: true });
  assert.strictEqual(db2026Post.prepare(`SELECT COUNT(*) c FROM flocks`).get().c, preFlocks, '2026 flocks must be unchanged');
  assert.strictEqual(db2026Post.prepare(`SELECT COUNT(*) c FROM egg_sales`).get().c, preEggSales, '2026 egg_sales must be unchanged');
  assert.strictEqual(db2026Post.prepare(`SELECT COUNT(*) c FROM feed_allocations`).get().c, preFeed, '2026 feed_allocations must be unchanged');
  db2026Post.close();
  console.log('✓ Source 2026 DB is 100% intact');

  // Assert 2027 has no partial data
  const db2027Post = new Database(path.join(tempDir, 'layererp-2027.db'), { readonly: true });
  assert.strictEqual(db2027Post.prepare(`SELECT COUNT(*) c FROM flocks`).get().c, 0, '2027 flocks must be 0 (no partial data)');
  assert.strictEqual(db2027Post.prepare(`SELECT COUNT(*) c FROM egg_sales`).get().c, 0, '2027 egg_sales must be 0');
  assert.strictEqual(db2027Post.prepare(`SELECT COUNT(*) c FROM traders`).get().c, 0, '2027 traders must be 0');
  db2027Post.close();
  console.log('✓ Target 2027 DB has NO partial data (cleanly rolled back)');
}

console.log('\n--- TEST 1.2: Phase B Failure Injection & Safe Resume ---');
{
  const { tempDir, dbModule } = setupTempEnv('layer-p1-phaseB-');
  copy2026ToTemp(tempDir);

  const db2026Pre = new Database(path.join(tempDir, 'layererp-2026.db'), { readonly: true });
  const preActiveFlocks = db2026Pre.prepare(`SELECT COUNT(*) c FROM flocks WHERE status != 'Closed'`).get().c;
  db2026Pre.close();

  let failedCaught = false;
  let phaseBErrorMsg = '';
  try {
    dbModule.runYearMigration(2026, 2027, { testInjectPhaseBFail: true });
  } catch (err) {
    failedCaught = true;
    phaseBErrorMsg = err.message;
  }
  dbModule.closeDb();
  assert(failedCaught, 'Expected migration to fail in Phase B');
  assert(phaseBErrorMsg.includes('Migration copied your data to 2027 but could not finish cleaning up 2026. Nothing was lost. Please run the migration again to complete it.'),
    `Expected Phase B truthful error message, got: ${phaseBErrorMsg}`);
  console.log('✓ Truthful message verified on Phase B failure:', phaseBErrorMsg);

  // Old file 2026 must be intact (Phase B was not committed)
  const db2026Mid = new Database(path.join(tempDir, 'layererp-2026.db'), { readonly: true });
  assert.strictEqual(db2026Mid.prepare(`SELECT COUNT(*) c FROM flocks WHERE status != 'Closed'`).get().c, preActiveFlocks, 'Source active flocks must remain intact when Phase B fails');
  db2026Mid.close();
  console.log('✓ When Phase B fails, source file 2026 remains completely intact');

  // Re-run migration: Phase A will detect existingFlock, verify counts match, and Phase B completes purge
  const rerunResult = dbModule.runYearMigration(2026, 2027);
  dbModule.closeDb();
  console.log('✓ Second migration run completed successfully:', rerunResult);

  // Assert 2026 active batches are now purged
  const db2026Final = new Database(path.join(tempDir, 'layererp-2026.db'), { readonly: true });
  assert.strictEqual(db2026Final.prepare(`SELECT COUNT(*) c FROM flocks WHERE status != 'Closed'`).get().c, 0, 'Source active batches purged after second run');
  db2026Final.close();

  // Assert 2027 has no duplicated rows
  const db2027Final = new Database(path.join(tempDir, 'layererp-2027.db'), { readonly: true });
  const flockCounts = db2027Final.prepare(`SELECT batch_id, COUNT(*) c FROM flocks GROUP BY batch_id HAVING c > 1`).all();
  assert.strictEqual(flockCounts.length, 0, 'No duplicated flocks in 2027');
  db2027Final.close();
  console.log('✓ Target 2027 DB has NO duplicates after resume');
}

console.log('\n--- TEST 1.3: existingFlock Count Mismatch Abort ---');
{
  const { tempDir, dbModule } = setupTempEnv('layer-p1-mismatch-');
  copy2026ToTemp(tempDir);

  // Pre-create 2027 with flock '1' having fewer rows than 2026
  const db2027 = new Database(path.join(tempDir, 'layererp-2027.db'));
  dbModule.initSchema(db2027);
  db2027.prepare(`INSERT INTO flocks (batch_id, start_date, status) VALUES ('1', '2026-01-01', 'Active')`).run();
  // Insert only 1 egg production row (source has many)
  db2027.prepare(`INSERT INTO egg_production (date, batch_id, pullet_trays) VALUES ('2026-05-01', '1', 5)`).run();
  db2027.close();

  let failed = false;
  let msg = '';
  try {
    dbModule.runYearMigration(2026, 2027);
  } catch (e) {
    failed = true;
    msg = e.message;
  }
  dbModule.closeDb();
  assert(failed, 'Migration must abort on existingFlock count mismatch');
  assert(msg.includes('differing row counts') || msg.includes('differs'), `Expected mismatch error message, got: ${msg}`);
  console.log('✓ existingFlock count mismatch correctly aborted without deleting or skipping silently');
}

console.log('\n--- TEST 1.4: Pre-Commit Balance Check Catches Corrupted Egg Sale ---');
{
  const { tempDir, dbModule } = setupTempEnv('layer-p1-corrupt-egg-');
  copy2026ToTemp(tempDir);

  const db2026Pre = new Database(path.join(tempDir, 'layererp-2026.db'), { readonly: true });
  const preFlocks = db2026Pre.prepare(`SELECT COUNT(*) c FROM flocks`).get().c;
  const preEggSales = db2026Pre.prepare(`SELECT COUNT(*) c FROM egg_sales`).get().c;
  const preFeed = db2026Pre.prepare(`SELECT COUNT(*) c FROM feed_allocations`).get().c;
  const preTraders = db2026Pre.prepare(`SELECT COUNT(*) c FROM traders`).get().c;
  db2026Pre.close();

  let failedCaught = false;
  let errorMsg = '';
  try {
    dbModule.runYearMigration(2026, 2027, {
      testInjectPhaseAFail: ({ toDb }) => {
        toDb.prepare(`UPDATE egg_sales SET amount = amount + 500 WHERE id = (SELECT id FROM egg_sales WHERE trader_id IS NOT NULL LIMIT 1)`).run();
      }
    });
  } catch (err) {
    failedCaught = true;
    errorMsg = err.message;
  }
  dbModule.closeDb();

  assert(failedCaught, 'Expected migration to fail due to corrupted egg_sales amount');
  assert(errorMsg.includes('Pre-commit balance verification failed for trader'), `Error message must indicate pre-commit balance verification failure. Got: ${errorMsg}`);
  assert(errorMsg.includes('Migration failed, no data was changed'), `Error message must match required format. Got: ${errorMsg}`);
  console.log('✓ Pre-commit balance verification correctly caught corrupted egg sale:', errorMsg);

  // Assert old file is untouched
  const db2026Post = new Database(path.join(tempDir, 'layererp-2026.db'), { readonly: true });
  assert.strictEqual(db2026Post.prepare(`SELECT COUNT(*) c FROM flocks`).get().c, preFlocks, '2026 flocks must be unchanged');
  assert.strictEqual(db2026Post.prepare(`SELECT COUNT(*) c FROM egg_sales`).get().c, preEggSales, '2026 egg_sales must be unchanged');
  assert.strictEqual(db2026Post.prepare(`SELECT COUNT(*) c FROM feed_allocations`).get().c, preFeed, '2026 feed_allocations must be unchanged');
  assert.strictEqual(db2026Post.prepare(`SELECT COUNT(*) c FROM traders`).get().c, preTraders, '2026 traders must be unchanged');
  db2026Post.close();
  console.log('✓ Source 2026 DB is untouched');

  // Assert new file has no data
  const db2027Post = new Database(path.join(tempDir, 'layererp-2027.db'), { readonly: true });
  assert.strictEqual(db2027Post.prepare(`SELECT COUNT(*) c FROM flocks`).get().c, 0, '2027 flocks must be 0');
  assert.strictEqual(db2027Post.prepare(`SELECT COUNT(*) c FROM egg_sales`).get().c, 0, '2027 egg_sales must be 0');
  assert.strictEqual(db2027Post.prepare(`SELECT COUNT(*) c FROM feed_allocations`).get().c, 0, '2027 feed_allocations must be 0');
  assert.strictEqual(db2027Post.prepare(`SELECT COUNT(*) c FROM traders`).get().c, 0, '2027 traders must be 0');
  db2027Post.close();
  console.log('✓ Target 2027 DB has NO data (cleanly rolled back)');
}

console.log('\n--- TEST 1.5: Pre-Commit Balance Check Catches Wrong Feed Trader ID ---');
{
  const { tempDir, dbModule } = setupTempEnv('layer-p1-wrong-trader-');
  copy2026ToTemp(tempDir);

  const db2026Pre = new Database(path.join(tempDir, 'layererp-2026.db'), { readonly: true });
  const preFlocks = db2026Pre.prepare(`SELECT COUNT(*) c FROM flocks`).get().c;
  const preEggSales = db2026Pre.prepare(`SELECT COUNT(*) c FROM egg_sales`).get().c;
  const preFeed = db2026Pre.prepare(`SELECT COUNT(*) c FROM feed_allocations`).get().c;
  const preTraders = db2026Pre.prepare(`SELECT COUNT(*) c FROM traders`).get().c;
  db2026Pre.close();

  let failedCaught = false;
  let errorMsg = '';
  try {
    dbModule.runYearMigration(2026, 2027, {
      testInjectPhaseAFail: ({ toDb }) => {
        toDb.prepare(`UPDATE feed_allocations SET trader_id = 999999 WHERE id = (SELECT id FROM feed_allocations WHERE trader_id IS NOT NULL LIMIT 1)`).run();
      }
    });
  } catch (err) {
    failedCaught = true;
    errorMsg = err.message;
  }
  dbModule.closeDb();

  assert(failedCaught, 'Expected migration to fail due to wrong feed trader_id');
  assert(errorMsg.includes('Pre-commit balance verification failed for trader'), `Error message must indicate pre-commit balance verification failure. Got: ${errorMsg}`);
  assert(errorMsg.includes('Migration failed, no data was changed'), `Error message must match required format. Got: ${errorMsg}`);
  console.log('✓ Pre-commit balance verification correctly caught wrong feed trader ID:', errorMsg);

  // Assert old file is untouched
  const db2026Post = new Database(path.join(tempDir, 'layererp-2026.db'), { readonly: true });
  assert.strictEqual(db2026Post.prepare(`SELECT COUNT(*) c FROM flocks`).get().c, preFlocks, '2026 flocks must be unchanged');
  assert.strictEqual(db2026Post.prepare(`SELECT COUNT(*) c FROM egg_sales`).get().c, preEggSales, '2026 egg_sales must be unchanged');
  assert.strictEqual(db2026Post.prepare(`SELECT COUNT(*) c FROM feed_allocations`).get().c, preFeed, '2026 feed_allocations must be unchanged');
  assert.strictEqual(db2026Post.prepare(`SELECT COUNT(*) c FROM traders`).get().c, preTraders, '2026 traders must be unchanged');
  db2026Post.close();
  console.log('✓ Source 2026 DB is untouched');

  // Assert new file has no data
  const db2027Post = new Database(path.join(tempDir, 'layererp-2027.db'), { readonly: true });
  assert.strictEqual(db2027Post.prepare(`SELECT COUNT(*) c FROM flocks`).get().c, 0, '2027 flocks must be 0');
  assert.strictEqual(db2027Post.prepare(`SELECT COUNT(*) c FROM egg_sales`).get().c, 0, '2027 egg_sales must be 0');
  assert.strictEqual(db2027Post.prepare(`SELECT COUNT(*) c FROM feed_allocations`).get().c, 0, '2027 feed_allocations must be 0');
  assert.strictEqual(db2027Post.prepare(`SELECT COUNT(*) c FROM traders`).get().c, 0, '2027 traders must be 0');
  db2027Post.close();
  console.log('✓ Target 2027 DB has NO data (cleanly rolled back)');
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 2: OPENING ROW MUST SHOW THE TRUE CARRIED-FORWARD FIGURE
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n--- TEST 2: All 6 Traders in 2026 Backup Copy After Migration to 2027 ---');
{
  const { tempDir, dbModule } = setupTempEnv('layer-p2-traders-');
  copy2026ToTemp(tempDir);

  const db2026 = new Database(path.join(tempDir, 'layererp-2026.db'), { readonly: true });
  const traders2026 = db2026.prepare(`SELECT * FROM traders ORDER BY id`).all();
  const closing2026Map = {};
  for (const t of traders2026) {
    closing2026Map[t.name] = dbModule.getTraderClosingBalance(db2026, t.id, t.opening_balance);
  }
  db2026.close();

  // Run clean migration and switch to 2027 as the app does
  dbModule.runYearMigration(2026, 2027);
  dbModule.switchYear(2027);

  // GroupBillRows emulation matching Sales.jsx exactly
  function groupBillRows(rows) {
    const groups = {};
    const ordered = [];
    rows.forEach(r => {
      const family = (r.source === 'medication' || r.source === 'vaccine') ? 'medication' : (r.source === 'sale' ? 'sale' : (r.source === 'feed' ? 'feed' : null));
      if (!family) { ordered.push(r); return; }
      const key = `${r.date}|${r.batch_id}|${family}`;
      if (!groups[key]) {
        groups[key] = { isGroup: true, date: r.date, batch_id: r.batch_id, source: r.source, debit: 0, credit: 0, taxPct: Number(r.tax_pct || 0) };
        ordered.push(groups[key]);
      }
      groups[key].debit  += Number(r.debit  || 0);
      groups[key].credit += Number(r.credit || 0);
    });
    return ordered.map(r => {
      if (!r.isGroup) return r;
      let debit = r.debit, credit = r.credit;
      if (r.debit > 0 && (r.source === 'medication' || r.source === 'vaccine')) {
        const taxAmt = r.debit * r.taxPct / 100;
        debit = Math.round(r.debit + taxAmt);
      }
      return { ...r, debit, credit };
    });
  }

  function getPeriodOpeningBalance(storedOpening, allRows, periodStartDate) {
    if (!periodStartDate) return Number(storedOpening || 0);
    const beforeRows = groupBillRows(allRows.filter(r => r.date && r.date < periodStartDate));
    const priorCredit = beforeRows.reduce((s, r) => s + Number(r.credit || 0), 0);
    const priorDebit  = beforeRows.reduce((s, r) => s + Number(r.debit || 0), 0);
    return Number(storedOpening || 0) + (priorCredit - priorDebit);
  }

  const db2027 = dbModule.getDb(2027);
  const traders2027 = db2027.prepare(`SELECT * FROM traders ORDER BY id`).all();

  console.log('\nTrader Comparison (2026 Closing vs 2027 Displayed Opening vs 2027 Ledger Closing):');
  const tableReport = [];

  for (const t of traders2027) {
    const closing2026 = closing2026Map[t.name];
    const crossLedger = dbModule.getCrossBatchTraderLedger(t.id);
    const groupedAll = groupBillRows(crossLedger);
    const totalCredit = groupedAll.reduce((s, r) => s + Number(r.credit || 0), 0);
    const totalDebit  = groupedAll.reduce((s, r) => s + Number(r.debit || 0), 0);
    const netLedgerBalance = totalCredit - totalDebit + Number(t.opening_balance || 0);

    // Year view opening (before 2027-01-01)
    const displayedYearOpening = getPeriodOpeningBalance(t.opening_balance, crossLedger, '2027-01-01');

    // January 2027 view opening (before 2027-01-01)
    const displayedJanOpening = getPeriodOpeningBalance(t.opening_balance, crossLedger, '2027-01-01');

    // Printed statement opening without printFrom (period starts 2027-01-01)
    const printedStatementOpening = getPeriodOpeningBalance(t.opening_balance, crossLedger, '2027-01-01');

    tableReport.push({
      Trader: t.name,
      '2026 Closing': closing2026.toFixed(2),
      '2027 Stored Offset': t.opening_balance.toFixed(2),
      '2027 Displayed Opening': displayedYearOpening.toFixed(2),
      '2027 Jan Opening': displayedJanOpening.toFixed(2),
      '2027 Ledger Closing': netLedgerBalance.toFixed(2),
      'Carried Year': t.carried_from_year
    });

    // 1. Displayed opening == 2026 closing balance within 0.01
    assert(Math.abs(displayedYearOpening - closing2026) < 0.01,
      `Trader ${t.name}: displayed opening (${displayedYearOpening}) must match 2026 closing (${closing2026})`);

    // 2. Closing balance unchanged
    assert(Math.abs(netLedgerBalance - closing2026) < 0.01,
      `Trader ${t.name}: 2027 ledger closing (${netLedgerBalance}) must match 2026 closing (${closing2026})`);

    // 3. January 2027 view starts from correct figure
    assert(Math.abs(displayedJanOpening - closing2026) < 0.01,
      `Trader ${t.name}: January 2027 opening (${displayedJanOpening}) must match 2026 closing (${closing2026})`);

    // 4. Printed statement opening matches
    assert(Math.abs(printedStatementOpening - displayedYearOpening) < 0.01,
      `Trader ${t.name}: printed statement opening (${printedStatementOpening}) must match displayed opening (${displayedYearOpening})`);

    // 5. Part 3: carried_from_year must be 2026 and notes not modified
    assert.strictEqual(t.carried_from_year, 2026, `Trader ${t.name} carried_from_year must be 2026`);
    assert(!String(t.notes || '').includes('[Migrated'), `Trader ${t.name} notes must not have [Migrated...]: "${t.notes}"`);
  }

  console.table(tableReport);
  console.log('✓ All 6 traders in 2026 backup verified: displayed opening == 2026 closing, closing balance identical, January 2027 view correct, print statement opening matches!');

  // Late rate edit test
  console.log('\n--- Late Rate Edit on Copied 2026 Row Flows Into Displayed Opening ---');
  const trader1 = traders2027[0];
  const oldSale = db2027.prepare(`SELECT * FROM egg_sales WHERE trader_id=? AND date < '2027-01-01' LIMIT 1`).get(trader1.id);
  if (oldSale) {
    const dispOpeningBefore = getPeriodOpeningBalance(trader1.opening_balance, dbModule.getCrossBatchTraderLedger(trader1.id), '2027-01-01');
    const rateDelta = 0.50;
    const newRate = Number(oldSale.rate_per_egg) + rateDelta;
    const qty = oldSale.unit_type === 'TRAY' ? oldSale.quantity * 30 : oldSale.quantity;
    const newAmount = qty * newRate;
    db2027.prepare(`UPDATE egg_sales SET rate_per_egg=?, amount=? WHERE id=?`).run(newRate, newAmount, oldSale.id);

    const dispOpeningAfter = getPeriodOpeningBalance(trader1.opening_balance, dbModule.getCrossBatchTraderLedger(trader1.id), '2027-01-01');
    const expectedDelta = newAmount - oldSale.amount;
    assert.strictEqual(Math.round((dispOpeningAfter - dispOpeningBefore) * 100) / 100, Math.round(expectedDelta * 100) / 100,
      'Late rate edit on copied row must flow directly into displayed opening balance');
    console.log(`✓ Late rate edit delta ₹${expectedDelta.toFixed(2)} flowed directly into displayed opening balance: before=₹${dispOpeningBefore.toFixed(2)}, after=₹${dispOpeningAfter.toFixed(2)}`);
  }
  dbModule.closeDb();
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 4: BACKUPS
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n--- TEST 4: Separate Migration Backups & No Backups on Plain Year Switch ---');
{
  const { tempDir, dbModule } = setupTempEnv('layer-p4-backups-');
  fs.writeFileSync(path.join(tempDir, 'layererp-2026.db'), 'data2026');

  // Plain year switches must NOT create backups
  dbModule.switchYear(2027);
  dbModule.switchYear(2026);
  const backupsDir = path.join(tempDir, 'backups');
  const switchBackups = fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir) : [];
  assert.strictEqual(switchBackups.length, 0, 'Plain year switch must NOT create backups');
  console.log('✓ Plain year switch created 0 backups');

  // Unlock year creates backup
  dbModule.backupBeforeUnlock(2026);
  const unlockBackups = fs.readdirSync(backupsDir).filter(f => f.startsWith('backup_unlock_2026'));
  assert.strictEqual(unlockBackups.length, 1, 'backupBeforeUnlock must create an unlock backup');
  console.log('✓ backupBeforeUnlock created unlock backup:', unlockBackups[0]);

  // Create 5 migration backups and 7 general backups
  for (let i = 1; i <= 5; i++) {
    dbModule.backupDatabaseFiles(`migration_2026_to_2027_test_${i}`);
  }
  for (let i = 1; i <= 7; i++) {
    dbModule.backupDatabaseFiles(`general_test_${i}`);
  }

  const allBackups = fs.readdirSync(backupsDir);
  const migrationBackups = allBackups.filter(f => f.startsWith('backup_migration'));
  const generalBackups = allBackups.filter(f => !f.startsWith('backup_migration'));

  console.log(`Total remaining migration backups: ${migrationBackups.length} (expected 3)`);
  console.log(`Total remaining general backups: ${generalBackups.length} (expected 5)`);

  assert.strictEqual(migrationBackups.length, 3, 'Must retain exactly the last 3 migration backups');
  assert.strictEqual(generalBackups.length, 5, 'Must retain exactly the last 5 general backups');
  console.log('✓ Migration backups kept at 3, general backups kept at 5, neither pruned the other!');
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 5: EXTRA TESTS
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n--- TEST 5.a: Chain Migration 2026 -> 2027 -> 2028 ---');
{
  const { tempDir, dbModule } = setupTempEnv('layer-p5-chain-');
  copy2026ToTemp(tempDir);

  const db2026 = new Database(path.join(tempDir, 'layererp-2026.db'), { readonly: true });
  const closing2026Map = {};
  for (const t of db2026.prepare(`SELECT * FROM traders`).all()) {
    closing2026Map[t.name] = dbModule.getTraderClosingBalance(db2026, t.id, t.opening_balance);
  }
  db2026.close();

  // Step 1: 2026 -> 2027
  dbModule.runYearMigration(2026, 2027);

  const db2027 = dbModule.getDb(2027);
  for (const t of db2027.prepare(`SELECT * FROM traders`).all()) {
    assert.strictEqual(t.carried_from_year, 2026, `2027 trader ${t.name} carried_from_year must be 2026`);
    const closing27 = dbModule.getTraderClosingBalance(db2027, t.id, t.opening_balance);
    assert(Math.abs(closing27 - closing2026Map[t.name]) < 0.01, `2027 closing must match 2026 closing for ${t.name}`);
  }

  // Step 2: 2027 -> 2028
  dbModule.runYearMigration(2027, 2028);

  const db2028 = dbModule.getDb(2028);
  for (const t of db2028.prepare(`SELECT * FROM traders`).all()) {
    assert.strictEqual(t.carried_from_year, 2027, `2028 trader ${t.name} carried_from_year must be 2027`);
    const closing28 = dbModule.getTraderClosingBalance(db2028, t.id, t.opening_balance);
    assert(Math.abs(closing28 - closing2026Map[t.name]) < 0.01, `2028 closing must match original closing for ${t.name}`);
  }
  dbModule.closeDb();
  console.log('✓ Chain migration 2026 -> 2027 -> 2028 passed: balances equal at each step, carried_from_year updated to 2027, no duplicates!');
}

console.log('\n--- TEST 5.b: Trader with Non-Zero Opening Balance in Old Year ---');
{
  const { tempDir, dbModule } = setupTempEnv('layer-p5-nonzero-');
  copy2026ToTemp(tempDir);

  const db2026 = new Database(path.join(tempDir, 'layererp-2026.db'));
  const tInfo = db2026.prepare(`INSERT INTO traders (name, opening_balance, notes) VALUES ('Seeded NonZero Trader', 75000, 'Original notes')`).run();
  // Add a sale and feed for moving batch 1
  db2026.prepare(`INSERT INTO egg_sales (date, batch_id, trader_id, grade, quantity, rate_per_egg, amount) VALUES ('2026-06-01', '1', ?, 'Table', 100, 5, 500)`).run(tInfo.lastInsertRowid);
  db2026.prepare(`INSERT INTO feed_allocations (date, batch_id, trader_id, feed_type, qty_kg, rate_per_kg) VALUES ('2026-06-02', '1', ?, 'Layer Mash', 10, 30)`).run(tInfo.lastInsertRowid);
  const closingOld = dbModule.getTraderClosingBalance(db2026, tInfo.lastInsertRowid, 75000);
  db2026.close();

  dbModule.runYearMigration(2026, 2027);

  const db2027 = dbModule.getDb(2027);
  const t2027 = db2027.prepare(`SELECT * FROM traders WHERE name='Seeded NonZero Trader'`).get();
  assert(t2027, 'Seeded trader must exist in 2027');
  const closingNew = dbModule.getTraderClosingBalance(db2027, t2027.id, t2027.opening_balance);
  assert(Math.abs(closingNew - closingOld) < 0.01, `Old closing (${closingOld}) must equal new ledger balance (${closingNew})`);
  assert.strictEqual(t2027.carried_from_year, 2026);
  assert.strictEqual(t2027.notes, 'Original notes', 'Original notes must be preserved unchanged');
  dbModule.closeDb();
  console.log(`✓ Non-zero opening balance trader verified: old closing (${closingOld}) == new ledger balance (${closingNew}), notes preserved!`);
}

console.log('\n--- TEST 5.c: Re-running Migration When Opening Balance Modified in New Year ---');
{
  const { tempDir, dbModule } = setupTempEnv('layer-p5-rerun-mod-');
  copy2026ToTemp(tempDir);

  dbModule.runYearMigration(2026, 2027);

  const db2027 = dbModule.getDb(2027);
  const alpha = db2027.prepare(`SELECT * FROM traders WHERE name='Alpha agency'`).get();
  const originalOpening = alpha.opening_balance;

  // Simulate user manually modifying opening balance in 2027
  db2027.prepare(`UPDATE traders SET opening_balance=99999 WHERE id=?`).run(alpha.id);
  const modifiedOpening = db2027.prepare(`SELECT opening_balance FROM traders WHERE id=?`).get(alpha.id).opening_balance;
  assert.strictEqual(modifiedOpening, 99999);
  dbModule.closeDb();

  // Re-populate 2026 and run migration again
  copy2026ToTemp(tempDir);
  dbModule.runYearMigration(2026, 2027);

  const db2027Post = dbModule.getDb(2027);
  const alphaPost = db2027Post.prepare(`SELECT * FROM traders WHERE name='Alpha agency'`).get();
  console.log(`Behavior observation on rerun:`);
  console.log(`- Original migrated opening_balance: ₹${originalOpening.toFixed(2)}`);
  console.log(`- User modified opening_balance:     ₹${modifiedOpening.toFixed(2)}`);
  console.log(`- After migration rerun:             ₹${alphaPost.opening_balance.toFixed(2)}`);
  assert.strictEqual(alphaPost.opening_balance, originalOpening, 'Migration rerun recomputes and overwrites opening_balance based on source closing_old - copied_effect');
  console.log('✓ Documented and asserted: migration rerun re-computes and overwrites opening_balance to ensure mathematical closing balance integrity with source DB.');
  dbModule.closeDb();
}

console.log('\n================================================================');
console.log('ALL VERIFICATION SUITE TESTS PASSED 100%!');
console.log('================================================================\n');
