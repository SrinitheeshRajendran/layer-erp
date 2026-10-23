const path = require('path');
const Database = require('better-sqlite3');

const backupDir = path.join(process.env.APPDATA, 'layer-erp-backup');
const db25 = new Database(path.join(backupDir, 'layererp-2025.db'), { readonly: true });
const db26 = new Database(path.join(backupDir, 'layererp-2026.db'), { readonly: true });

console.log('=== 2025 BACKUP TRADER TYPES ===');
try {
  const types25 = db25.prepare('SELECT DISTINCT types FROM traders').all();
  console.log('Distinct types in 2025:', types25);
  const allTraders25 = db25.prepare('SELECT id, name, types FROM traders').all();
  console.log('All traders in 2025:', allTraders25);
} catch (e) {
  console.log('Error querying 2025 traders:', e.message);
}
db25.close();

console.log('\n=== 2026 BACKUP TRADER TYPES ===');
try {
  const types26 = db26.prepare('SELECT DISTINCT types FROM traders').all();
  console.log('Distinct types in 2026:', types26);
  const allTraders26 = db26.prepare('SELECT id, name, types FROM traders').all();
  console.log('All traders in 2026:', allTraders26);
} catch (e) {
  console.log('Error querying 2026 traders:', e.message);
}
db26.close();
