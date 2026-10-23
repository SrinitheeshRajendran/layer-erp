const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const Database = require('better-sqlite3');

console.log('================================================================');
console.log('LAYER ERP: TRADER ADJUSTMENTS & OPENING EDIT TEST SUITE');
console.log('================================================================\n');

const backupSourceDir = path.join(process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\srini', 'AppData', 'Roaming'), 'layer-erp-backup');
const backup2026 = path.join(backupSourceDir, 'layererp-2026.db');
assert(fs.existsSync(backup2026), `Backup DB not found at ${backup2026}`);

function setupTempEnv(prefix = 'layer-test-adj-') {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  process.env.LAYER_ERP_DATA_DIR = tempDir;
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

// Helper to compute ledger balance from rows and opening balance (matching Sales.jsx)
function computeLedgerBalance(rows, openingBalance = 0) {
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit || 0), 0);
  const totalDebit = rows.reduce((s, r) => s + Number(r.debit || 0), 0);
  return Math.round((Number(openingBalance || 0) + totalCredit - totalDebit) * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST A: Add +5,000 and -3,000 adjustments
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- TEST A: Add +5,000 and -3,000 Adjustments & Math Agreement ---');
{
  const { tempDir, dbModule } = setupTempEnv('layer-adj-testA-');
  copy2026ToTemp(tempDir);
  dbModule.switchYear(2026);
  dbModule.getDb(2026);

  const traders = dbModule.getTraders();
  const trader = traders[0]; // e.g. Mahendra feeds and foods
  const baselineClosing = dbModule.getTraderClosingBalance(trader.id);
  const baselineLedgerRows = dbModule.getCrossBatchTraderLedger(trader.id);
  const baselineLedgerClosing = computeLedgerBalance(baselineLedgerRows, trader.opening_balance);
  assert.strictEqual(baselineLedgerClosing, baselineClosing, 'Baseline ledger closing must equal baseline closing balance');

  // Insert +5000 adjustment (trader owes more)
  const adj1 = dbModule.insertTraderAdjustment({
    trader_id: trader.id,
    date: '2026-06-15',
    amount: 5000,
    note: 'Underbilled feed weight correction'
  });
  assert(adj1.id > 0, 'adj1 must have positive id');
  assert.strictEqual(adj1.amount, 5000, 'adj1 amount must be +5000');

  // Insert -3000 adjustment (farm owes trader more)
  const adj2 = dbModule.insertTraderAdjustment({
    trader_id: trader.id,
    date: '2026-07-20',
    amount: -3000,
    note: 'Quality rebate credit note'
  });
  assert(adj2.id > 0, 'adj2 must have positive id');
  assert.strictEqual(adj2.amount, -3000, 'adj2 amount must be -3000');

  // Check closing balance via getTraderClosingBalance
  const expectedClosing = Math.round((baselineClosing + 5000 - 3000) * 100) / 100;
  const newClosing = dbModule.getTraderClosingBalance(trader.id);
  assert.strictEqual(newClosing, expectedClosing, `Closing balance must equal baseline + 2000. Expected ${expectedClosing}, got ${newClosing}`);

  // Check ledger rows and computed balance
  const newLedgerRows = dbModule.getCrossBatchTraderLedger(trader.id);
  const newLedgerClosing = computeLedgerBalance(newLedgerRows, trader.opening_balance);
  assert.strictEqual(newLedgerClosing, expectedClosing, 'Ledger closing balance must match closing formula');

  const adjRows = newLedgerRows.filter(r => r.source === 'adjustment');
  assert.strictEqual(adjRows.length, 2, 'Ledger must contain exactly 2 adjustment rows');
  const posAdj = adjRows.find(r => r.id === adj1.id);
  assert.strictEqual(posAdj.credit, 5000);
  assert.strictEqual(posAdj.debit, 0);
  assert(posAdj.particulars.includes('Underbilled feed weight correction'));

  const negAdj = adjRows.find(r => r.id === adj2.id);
  assert.strictEqual(negAdj.credit, 0);
  assert.strictEqual(negAdj.debit, 3000);
  assert(negAdj.particulars.includes('Quality rebate credit note'));

  dbModule.closeDb();
  console.log(`✓ Test A passed: +5000 and -3000 adjustments correctly updated balance by +2000 (from ${baselineClosing} to ${newClosing})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST B: Voided adjustment is excluded from every balance, but retained in history
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST B: Voided Adjustment Exclusion & History ---');
{
  const { tempDir, dbModule } = setupTempEnv('layer-adj-testB-');
  copy2026ToTemp(tempDir);
  dbModule.switchYear(2026);
  dbModule.getDb(2026);

  const trader = dbModule.getTraders()[0];
  const baselineClosing = dbModule.getTraderClosingBalance(trader.id);

  const adj1 = dbModule.insertTraderAdjustment({
    trader_id: trader.id,
    date: '2026-05-10',
    amount: 5000,
    note: 'Wrongly billed item'
  });
  const adj2 = dbModule.insertTraderAdjustment({
    trader_id: trader.id,
    date: '2026-05-12',
    amount: -3000,
    note: 'Valid allowance'
  });

  // Void adj1
  const voidResult = dbModule.voidTraderAdjustment(adj1.id, 'Duplicate / wrong entry');
  assert(voidResult.success, 'voidTraderAdjustment must succeed');

  // Verify voided status in adjustments list
  const adjustments = dbModule.getTraderAdjustments(trader.id);
  assert.strictEqual(adjustments.length, 2, 'History must retain both adjustments');
  const voided = adjustments.find(a => a.id === adj1.id);
  assert.strictEqual(voided.voided, 1, 'voided must be 1');
  assert.strictEqual(voided.void_reason, 'Duplicate / wrong entry', 'void_reason must match');
  assert(voided.voided_at != null, 'voided_at must be populated');

  // Verify closing balance excludes voided adjustment
  const expectedClosing = Math.round((baselineClosing - 3000) * 100) / 100;
  const newClosing = dbModule.getTraderClosingBalance(trader.id);
  assert.strictEqual(newClosing, expectedClosing, `Closing balance after voiding +5000 must be baseline - 3000. Expected ${expectedClosing}, got ${newClosing}`);

  // Verify ledger excludes voided adjustment
  const ledgerRows = dbModule.getCrossBatchTraderLedger(trader.id);
  const ledgerAdjRows = ledgerRows.filter(r => r.source === 'adjustment');
  assert.strictEqual(ledgerAdjRows.length, 1, 'Ledger must only include the non-voided adjustment');
  assert.strictEqual(ledgerAdjRows[0].id, adj2.id);
  assert.strictEqual(computeLedgerBalance(ledgerRows, trader.opening_balance), expectedClosing);

  // Attempting to void again must throw
  let revoidCaught = false;
  try {
    dbModule.voidTraderAdjustment(adj1.id, 'Trying again');
  } catch (err) {
    revoidCaught = true;
    assert(err.message.includes('already voided'), `Expected error message about already voided, got: ${err.message}`);
  }
  assert(revoidCaught, 'Cannot re-void an already-voided adjustment');

  dbModule.closeDb();
  console.log(`✓ Test B passed: Voided adjustment correctly excluded from balances while retained in audit history`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST C: Validations (Empty note, amount 0, invalid date, empty void reason)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST C: Adjustment Validations ---');
{
  const { tempDir, dbModule } = setupTempEnv('layer-adj-testC-');
  copy2026ToTemp(tempDir);
  dbModule.switchYear(2026);
  dbModule.getDb(2026);

  const trader = dbModule.getTraders()[0];

  // 1. Empty note
  assert.throws(() => {
    dbModule.insertTraderAdjustment({
      trader_id: trader.id,
      date: '2026-06-01',
      amount: 100,
      note: '   '
    });
  }, /note cannot be empty/i, 'Empty note must be rejected');

  // 2. Zero amount
  assert.throws(() => {
    dbModule.insertTraderAdjustment({
      trader_id: trader.id,
      date: '2026-06-01',
      amount: 0,
      note: 'Zero test'
    });
  }, /cannot be zero/i, 'Zero amount must be rejected');

  // 3. Date outside active year (active is 2026, date is 2025)
  assert.throws(() => {
    dbModule.insertTraderAdjustment({
      trader_id: trader.id,
      date: '2025-12-31',
      amount: 500,
      note: 'Outside year test'
    });
  }, /must be within the active financial year/i, 'Date outside active year must be rejected');

  // 4. Void with empty reason
  const validAdj = dbModule.insertTraderAdjustment({
    trader_id: trader.id,
    date: '2026-06-01',
    amount: 100,
    note: 'Valid adjustment'
  });
  assert.throws(() => {
    dbModule.voidTraderAdjustment(validAdj.id, '  ');
  }, /reason is required/i, 'Void with empty reason must be rejected');

  dbModule.closeDb();
  console.log('✓ Test C passed: All input validation rules enforced correctly');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST D: Migration with Old-Year Adjustment
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST D: Migration with Old-Year Adjustment (No Duplication) ---');
{
  const { tempDir, dbModule } = setupTempEnv('layer-adj-testD-');
  copy2026ToTemp(tempDir);
  dbModule.switchYear(2026);
  dbModule.getDb(2026);

  const traders2026 = dbModule.getTraders();
  const trader = traders2026[0];

  // Seed an adjustment in 2026
  dbModule.insertTraderAdjustment({
    trader_id: trader.id,
    date: '2026-11-20',
    amount: -12500,
    note: 'Year-end reconciliation discount'
  });

  // Calculate 2026 closing balances for all 6 traders
  const preClosingBalances = {};
  for (const t of traders2026) {
    preClosingBalances[t.id] = dbModule.getTraderClosingBalance(t.id);
  }

  // Run migration 2026 -> 2027
  const migResult = dbModule.runYearMigration(2026, 2027);
  assert(migResult && migResult.traders > 0, 'Migration must succeed');

  // Switch to 2027 DB
  dbModule.switchYear(2027);
  dbModule.getDb(2027);
  const traders2027 = dbModule.getTraders();
  assert.strictEqual(traders2027.length, traders2026.length, 'All 6 traders must exist in 2027');

  // Verify each trader's 2027 displayed opening balance and closing balance == 2026 closing
  for (const t27 of traders2027) {
    const origTrader = traders2026.find(t => t.name === t27.name);
    assert(origTrader != null, `Trader ${t27.name} must exist`);
    const expectedOldClosing = preClosingBalances[origTrader.id];

    const closing2027 = dbModule.getTraderClosingBalance(t27.id);
    assert.strictEqual(closing2027, expectedOldClosing, `Trader ${t27.name}: 2027 closing (${closing2027}) must match 2026 closing (${expectedOldClosing})`);

    const ledgerRows2027 = dbModule.getCrossBatchTraderLedger(t27.id);
    const ledgerClosing2027 = computeLedgerBalance(ledgerRows2027, t27.opening_balance);
    assert.strictEqual(ledgerClosing2027, expectedOldClosing, `Trader ${t27.name}: 2027 ledger closing must match 2026 closing`);
  }

  // Verify that the 2026 adjustment row was NOT duplicated into 2027 trader_adjustments table
  const adjustments2027 = dbModule.getTraderAdjustments(trader.id);
  assert.strictEqual(adjustments2027.length, 0, '2027 trader_adjustments must be clean; old adjustment is folded into opening balance, NOT duplicated');

  dbModule.closeDb();
  console.log('✓ Test D passed: Old-year adjustment correctly folded into migrated opening balance without duplicate rows');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST E: Re-run Migration When Adjustment Exists in New Year
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST E: Re-running Migration with Existing New-Year Adjustment ---');
{
  const { tempDir, dbModule } = setupTempEnv('layer-adj-testE-');
  copy2026ToTemp(tempDir);

  // Initial migration 2026 -> 2027
  dbModule.switchYear(2026);
  dbModule.getDb(2026);
  dbModule.runYearMigration(2026, 2027);

  // In 2027, add an adjustment
  dbModule.switchYear(2027);
  dbModule.getDb(2027);
  const trader27 = dbModule.getTraders()[0];
  const old27Closing = dbModule.getTraderClosingBalance(trader27.id);

  const adjIn2027 = dbModule.insertTraderAdjustment({
    trader_id: trader27.id,
    date: '2027-02-15',
    amount: 8000,
    note: 'Early 2027 adjustment'
  });
  assert(adjIn2027.id > 0);

  const balanceWithAdj = dbModule.getTraderClosingBalance(trader27.id);
  assert.strictEqual(balanceWithAdj, Math.round((old27Closing + 8000) * 100) / 100);

  // Now simulate 2026 edit/unlock: re-populate 2026 and re-run migration 2026 -> 2027
  copy2026ToTemp(tempDir);
  dbModule.switchYear(2026);
  dbModule.getDb(2026);
  const rerunResult = dbModule.runYearMigration(2026, 2027);
  assert(rerunResult && rerunResult.traders > 0, 'Rerun migration must succeed');

  // Verify 2027 state after rerun
  dbModule.switchYear(2027);
  dbModule.getDb(2027);
  const traderAfterRerun = dbModule.getTraders().find(t => t.name === trader27.name);
  const adjustmentsAfterRerun = dbModule.getTraderAdjustments(traderAfterRerun.id);
  assert.strictEqual(adjustmentsAfterRerun.length, 1, '2027 adjustment must be untouched by migration rerun');
  assert.strictEqual(adjustmentsAfterRerun[0].id, adjIn2027.id);
  assert.strictEqual(adjustmentsAfterRerun[0].amount, 8000);

  const closingAfterRerun = dbModule.getTraderClosingBalance(traderAfterRerun.id);
  assert.strictEqual(closingAfterRerun, balanceWithAdj, 'Closing balance after rerun must preserve the 2027 adjustment');

  dbModule.closeDb();
  console.log('✓ Test E passed: Migration rerun preserves new-year adjustments and calculates accurate balances');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST F: Controlled Opening Balance Edit on Non-Migrated vs Migrated Traders
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST F: Controlled Opening Balance Edits & Audit Logging ---');
{
  const { tempDir, dbModule } = setupTempEnv('layer-adj-testF-');
  copy2026ToTemp(tempDir);
  dbModule.switchYear(2026);
  dbModule.getDb(2026);

  // 1. Create a non-migrated trader in 2026
  dbModule.insertTrader({
    name: 'Test NonMigrated Supplier',
    types: 'Feed',
    phone: '9876543210',
    opening_balance: 15000,
    notes: 'Initial test setup'
  });
  const newTrader = dbModule.getTraders().find(t => t.name === 'Test NonMigrated Supplier');
  assert(newTrader.id > 0);
  assert.strictEqual(newTrader.opening_balance, 15000);
  assert.strictEqual(newTrader.carried_from_year, null);

  const closingBeforeEdit = dbModule.getTraderClosingBalance(newTrader.id);
  assert.strictEqual(closingBeforeEdit, 15000);

  // Update opening balance to 35000 with audit reason
  const updateResult = dbModule.updateTraderOpeningBalance(newTrader.id, 35000, 'Corrected opening invoice reconciliation');
  assert(updateResult.success, 'updateTraderOpeningBalance must succeed for non-migrated trader');

  // Verify opening balance updated in database
  const refreshedTrader = dbModule.getTraders().find(t => t.id === newTrader.id);
  assert.strictEqual(refreshedTrader.opening_balance, 35000);

  // Verify audit log entry
  const logs = dbModule.getTraderOpeningLogs(newTrader.id);
  assert.strictEqual(logs.length, 1, 'There must be 1 audit log entry');
  assert.strictEqual(logs[0].old_value, 15000);
  assert.strictEqual(logs[0].new_value, 35000);
  assert.strictEqual(logs[0].reason, 'Corrected opening invoice reconciliation');
  assert(logs[0].changed_at != null);

  // Verify closing balance changed by exact difference (+20,000)
  const closingAfterEdit = dbModule.getTraderClosingBalance(newTrader.id);
  assert.strictEqual(closingAfterEdit, 35000, 'Closing balance must change by exact delta');

  // 2. Test migrated trader refusal in 2027
  dbModule.runYearMigration(2026, 2027);
  dbModule.switchYear(2027);
  dbModule.getDb(2027);

  const migratedTrader = dbModule.getTraders().find(t => t.carried_from_year != null);
  assert(migratedTrader != null, 'Migrated trader must have carried_from_year');

  assert.throws(() => {
    dbModule.updateTraderOpeningBalance(migratedTrader.id, 99999, 'Trying to edit migrated opening');
  }, /carried forward from year.*To correct it, add an adjustment/i, 'Editing migrated opening balance must be refused');

  dbModule.closeDb();
  console.log('✓ Test F passed: Non-migrated opening balance edits are logged to audit table; migrated opening edits are strictly refused');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST G: Late-Rate Scenario End-to-End
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST G: Late-Rate Scenario End-to-End ---');
{
  const { tempDir, dbModule } = setupTempEnv('layer-adj-testG-');
  copy2026ToTemp(tempDir);

  // Step 1: Migrate 2026 to 2027
  dbModule.switchYear(2026);
  dbModule.getDb(2026);
  dbModule.runYearMigration(2026, 2027);

  // Step 2: Open 2027, select an egg buyer trader (e.g. Mahendra Natural Food)
  dbModule.switchYear(2027);
  dbModule.getDb(2027);
  const eggBuyer = dbModule.getTraders().find(t => (t.types && t.types.includes('Egg')) || t.name === 'Mahendra Natural Food');
  assert(eggBuyer != null, 'Egg buyer trader must exist');

  const startBalance = dbModule.getTraderClosingBalance(eggBuyer.id);

  // Step 3: In January 2027, egg rate discount for December was agreed (-₹4,500)
  dbModule.insertTraderAdjustment({
    trader_id: eggBuyer.id,
    date: '2027-01-10',
    amount: -4500,
    note: 'Dec egg rate retroactive discount of 5 paise/egg'
  });

  // Step 4: Verify balance changes by exact amount
  const postAdjBalance = dbModule.getTraderClosingBalance(eggBuyer.id);
  const expectedPostBalance = Math.round((startBalance - 4500) * 100) / 100;
  assert.strictEqual(postAdjBalance, expectedPostBalance, `Balance must shift by exact -4500: from ${startBalance} to ${postAdjBalance}`);

  // Step 5: Verify in 2027 ledger statement
  const ledgerRows = dbModule.getCrossBatchTraderLedger(eggBuyer.id);
  const computedPostBalance = computeLedgerBalance(ledgerRows, eggBuyer.opening_balance);
  assert.strictEqual(computedPostBalance, expectedPostBalance);

  const adjRow = ledgerRows.find(r => r.source === 'adjustment');
  assert(adjRow != null, 'Adjustment must be visible in ledger');
  assert.strictEqual(adjRow.debit, 4500);

  dbModule.closeDb();
  console.log('✓ Test G passed: Late-rate adjustment in new year cleanly modifies balance by exact delta');
}

console.log('\n================================================================');
console.log('ALL TRADER ADJUSTMENT TESTS PASSED 100%!');
console.log('================================================================\n');
