const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const Database = require('better-sqlite3');
const dbModule = require('../database/db');

console.log('================================================================');
console.log('TEST: Trader Role Independence in Balance Calculations');
console.log('================================================================');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'layererp-role-test-'));
const testDbPath = path.join(tempDir, 'role-test.db');
const testDb = new Database(testDbPath);
testDb.pragma('foreign_keys = ON');
testDb.pragma('journal_mode = WAL');
dbModule.initSchema(testDb);

// 1. Create a trader whose types explicitly says 'Feed Supplier'
const tInfo = testDb.prepare(`
  INSERT INTO traders (name, phone, address, opening_balance, types, notes)
  VALUES (?,?,?,?,?,?)
`).run('Kisan Feed Mills', '9988776655', 'Bypass Road', 5000, 'Feed Supplier', 'Registered solely as Feed Supplier');
const traderId = tInfo.lastInsertRowid;

// Verify types field
const trader = testDb.prepare('SELECT * FROM traders WHERE id=?').get(traderId);
assert.strictEqual(trader.types, 'Feed Supplier', 'Trader types must be Feed Supplier');
console.log(`Created trader "${trader.name}" with types: "${trader.types}", opening_balance: ${trader.opening_balance}`);

// 2. Insert flock for batch references
testDb.prepare(`
  INSERT INTO flocks (batch_id, shed, breed, start_date, start_count, status)
  VALUES ('BATCH-ROLE-1', 'Shed 1', 'BV300', '2026-01-01', 5000, 'Active')
`).run();

// 3. Transactions across multiple streams:
// Stream A: Feed arrival from trader
testDb.prepare(`
  INSERT INTO feed_allocations (date, batch_id, trader_id, feed_type, qty_kg, rate_per_kg, notes)
  VALUES ('2026-01-05', 'BATCH-ROLE-1', ?, 'Layer Mash', 200, 30, 'Mash delivery')
`).run(traderId); // debit: 200 * 30 = 6,000

// Stream B: Egg sale to the trader (even though types says Feed Supplier)
testDb.prepare(`
  INSERT INTO egg_sales (date, batch_id, trader_id, grade, quantity, unit_type, rate_per_egg, amount, notes)
  VALUES ('2026-01-10', 'BATCH-ROLE-1', ?, 'Table Egg', 100, 'TRAY', 5, 15000, 'Egg purchase by trader')
`).run(traderId); // credit: 15,000

// Stream C: from_trader payment (money paid by trader to farm)
testDb.prepare(`
  INSERT INTO trader_payments (date, trader_id, amount, mode, direction, notes)
  VALUES ('2026-01-15', ?, 4000, 'UPI', 'from_trader', 'Payment from trader for eggs')
`).run(traderId); // debit (settles trader debt): 4,000

// Stream D: to_trader payment (money paid by farm to trader)
testDb.prepare(`
  INSERT INTO trader_payments (date, trader_id, amount, mode, direction, notes)
  VALUES ('2026-01-20', ?, 1000, 'Cheque', 'to_trader', 'Payment towards feed bill')
`).run(traderId); // credit (settles farm debt): 1,000

// 4. Calculate Ledger Net Balance matching Sales.jsx / getCrossBatchTraderLedger
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
    return { date: r.date, batch_id: r.batch_id, source: r.source, id: r.ref, particulars: r.particulars.join("<br/>"), debit, credit };
  });
}

const sales = testDb.prepare(`SELECT amount AS credit, 0 AS debit, 'sale' AS source, date, batch_id FROM egg_sales WHERE trader_id=?`).all(traderId);
const feed = testDb.prepare(`SELECT 0 AS credit, (qty_kg * rate_per_kg) AS debit, 'feed' AS source, date, batch_id FROM feed_allocations WHERE trader_id=?`).all(traderId);
const payments = testDb.prepare(`
  SELECT (CASE WHEN COALESCE(direction,'to_trader') = 'from_trader' THEN 0 ELSE amount END) AS credit,
         (CASE WHEN COALESCE(direction,'to_trader') = 'from_trader' THEN amount ELSE 0 END) AS debit,
         'payment' AS source, date, '-' AS batch_id
  FROM trader_payments WHERE trader_id=?
`).all(traderId);

const crossLedger = [...sales, ...feed, ...payments].sort((a, b) => b.date.localeCompare(a.date));
const grouped = groupBillRows(crossLedger);
const totalCredit = grouped.reduce((s, r) => s + Number(r.credit || 0), 0);
const totalDebit = grouped.reduce((s, r) => s + Number(r.debit || 0), 0);
const ledgerBalance = totalCredit - totalDebit + Number(trader.opening_balance || 0);

// 5. Calculate Migration Closing Balance
const migrationBalance = dbModule.getTraderClosingBalance(testDb, traderId, trader.opening_balance);

console.log('\nResults Breakdown:');
console.log(`- Opening Balance:              ₹${trader.opening_balance}`);
console.log(`- Egg Sales (Credit):          +₹${sales[0].credit}`);
console.log(`- Feed Arrival (Debit):        -₹${feed[0].debit}`);
console.log(`- Payment to Trader (Credit):  +₹1000`);
console.log(`- Payment from Trader (Debit): -₹4000`);
console.log('----------------------------------------------------');
console.log(`Expected Net Balance:           ₹${5000 + 15000 - 6000 + 1000 - 4000} (₹11,000)`);
console.log(`Ledger Balance:                 ₹${ledgerBalance}`);
console.log(`Migration Balance:              ₹${migrationBalance}`);

// 6. Assertions
assert.strictEqual(ledgerBalance, 11000, 'Ledger balance must be 11000');
assert.strictEqual(migrationBalance, 11000, 'Migration balance must be 11000');
assert.strictEqual(ledgerBalance, migrationBalance, 'Ledger and Migration balances must match exactly');

console.log('\n✓ Test PASSED: A trader with types="Feed Supplier" having egg sales and from_trader payments');
console.log('  is completely unaffected by types and produces identical, accurate balances across both');
console.log('  the interactive ledger and getTraderClosingBalance.\n');

testDb.close();
