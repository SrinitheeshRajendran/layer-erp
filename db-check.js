const { app } = require('electron')
const path = require('path')
const Database = require('better-sqlite3')

app.whenReady().then(() => {
  const dbPath = path.join(require('os').homedir(), 'AppData', 'Roaming', 'layer-erp', 'layererp-2026.db')
  const db = new Database(dbPath)
  console.log('DB PATH:', dbPath)
  console.log(db.prepare("SELECT id, batch_id, start_count, free_chicks, current_count FROM flocks").all())
  app.quit()
})