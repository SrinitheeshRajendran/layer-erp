const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const Database = require('better-sqlite3');

// Create a temp folder to act as userData
const tempUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'layererp-autobackup-test-'));
process.env.APPDATA = tempUserData; // ensure getUserDataPath uses this path in fallback

// Create sample db, wal, shm files in tempUserData/layer-erp
const erpDir = path.join(tempUserData, 'layer-erp');
fs.mkdirSync(erpDir, { recursive: true });

fs.writeFileSync(path.join(erpDir, 'layererp-2025.db'), 'sample-2025-db');
fs.writeFileSync(path.join(erpDir, 'layererp-2025.db-wal'), 'sample-2025-wal');
fs.writeFileSync(path.join(erpDir, 'layererp-2025.db-shm'), 'sample-2025-shm');
fs.writeFileSync(path.join(erpDir, 'layererp-2026.db'), 'sample-2026-db');

const db = require('../database/db');

console.log('Testing automatic backup trigger on year switch...');
db.switchYear(2027);

const backupsRoot = path.join(erpDir, 'backups');
assert(fs.existsSync(backupsRoot), 'backups root directory must exist');

const backupFolders = fs.readdirSync(backupsRoot);
console.log('Created backup folders:', backupFolders);
assert(backupFolders.length > 0, 'At least one backup folder should be created');

const newestBackup = path.join(backupsRoot, backupFolders[0]);
const backedUpFiles = fs.readdirSync(newestBackup);
console.log('Files inside backup folder:', backedUpFiles);

assert(backedUpFiles.includes('layererp-2025.db'));
assert(backedUpFiles.includes('layererp-2025.db-wal'));
assert(backedUpFiles.includes('layererp-2025.db-shm'));
assert(backedUpFiles.includes('layererp-2026.db'));

console.log('✓ Automatic backup test PASSED successfully!');
