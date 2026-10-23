const { app, BrowserWindow, ipcMain } = require("electron")
const path = require("path")

let db

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Layer ERP",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (app.isPackaged || process.env.LAYER_ERP_USE_DIST === "1") {
    // Production / Local Dist: load the built React files (no dev server available)
    win.loadFile(path.join(__dirname, "renderer/dist/index.html"))
  } else {
    // Development: load the Vite dev server
    win.loadURL("http://localhost:5173")
  }
}

app.whenReady().then(() => {
  db = require("./database/db")

  createWindow()

  // =====================================================
  // BATCHES
  // =====================================================

  ipcMain.handle("batch:getAll", () =>
    db.getFlocks()
  )

  ipcMain.handle("batch:getOne", (_, batchId) =>
    db.getFlockByBatchId(batchId)
  )

  ipcMain.handle("batch:insert", (_, data) =>
    db.insertFlock(data)
  )

  ipcMain.handle("batch:update", (_, id, data) =>
    db.updateFlock(id, data)
  )

  ipcMain.handle("batch:updateCount", (_, batchId, count) =>
    db.updateCurrentBirdCount(batchId, count)
  )

  ipcMain.handle("batch:delete", (_, id) =>
    db.deleteFlock(id)
  )

  ipcMain.handle("batch:getClosed", () =>
    db.getClosedBatches()
  )

  // =====================================================
  // EGG PRODUCTION
  // =====================================================

  ipcMain.handle("production:add", (_, data) =>
    db.insertEggProduction(data)
  )

  ipcMain.handle("production:getAll", () =>
    db.getEggProduction()
  )

  ipcMain.handle("production:getBatch", (_, batchId) =>
    db.getEggProductionByBatch(batchId)
  )

  ipcMain.handle("production:update", (_, id, data) =>
    db.updateEggProduction(id, data)
  )

  ipcMain.handle("production:delete", (_, id) =>
    db.deleteEggProduction(id)
  )

  // =====================================================
  // FEED PURCHASES
  // =====================================================

  ipcMain.handle("feedPurchase:add", (_, data) =>
    db.insertFeedPurchase(data)
  )

  ipcMain.handle("feedPurchase:getAll", () =>
    db.getFeedPurchases()
  )

  ipcMain.handle("feedPurchase:delete", (_, id) =>
    db.deleteFeedPurchase(id)
  )

  ipcMain.handle("feedPurchase:balance", () =>
    db.getFarmFeedBalance()
  )

  // =====================================================
  // FEED ALLOCATION
  // =====================================================

  ipcMain.handle("feedAllocation:add", (_, data) =>
    db.insertFeedAllocation(data)
  )

  ipcMain.handle("feedAllocation:getAll", () =>
    db.getFeedAllocations()
  )

  ipcMain.handle("feedAllocation:getBatch", (_, batchId) =>
    db.getFeedAllocationsByBatch(batchId)
  )

  ipcMain.handle("feedAllocation:update", (_, id, data) =>
    db.updateFeedAllocation(id, data)
  )

  ipcMain.handle("feedAllocation:delete", (_, id) =>
    db.deleteFeedAllocation(id)
  )

  // =====================================================
  // FEED CONSUMPTION
  // =====================================================

  ipcMain.handle("feedIntake:add", (_, data) =>
    db.insertFeedIntake(data)
  )

  ipcMain.handle("feedIntake:getAll", () =>
    db.getFeedIntake()
  )

  ipcMain.handle("feedIntake:getBatch", (_, batchId) =>
    db.getFeedIntakeByBatch(batchId)
  )

  ipcMain.handle("feedIntake:update", (_, id, data) =>
    db.updateFeedIntake(id, data)
  )

  ipcMain.handle("feedIntake:delete", (_, id) =>
    db.deleteFeedIntake(id)
  )

  ipcMain.handle("feedIntake:balance", (_, batchId) =>
    db.getBatchFeedBalance(batchId)
  )

  // =====================================================
  // FEED RETURNS
  // =====================================================

  ipcMain.handle("feedReturn:add", (_, data) =>
    db.insertFeedReturn(data)
  )

  ipcMain.handle("feedReturn:getBatch", (_, batchId) =>
    db.getFeedReturnsByBatch(batchId)
  )

  ipcMain.handle("feedReturn:update", (_, id, data) =>
    db.updateFeedReturn(id, data)
  )

  ipcMain.handle("feedReturn:delete", (_, id) =>
    db.deleteFeedReturn(id)
  )

  // =====================================================
  // MORTALITY
  // =====================================================

  ipcMain.handle("mortality:add", (_, data) =>
    db.insertMortalityLog(data)
  )

  ipcMain.handle("mortality:getBatch", (_, batchId) =>
    db.getMortalityByBatch(batchId)
  )

  ipcMain.handle("mortality:update", (_, id, data) =>
    db.updateMortalityLog(id, data)
  )

  ipcMain.handle("mortality:delete", (_, id) =>
    db.deleteMortalityLog(id)
  )

  // =====================================================
  // MEDICATION
  // =====================================================

  ipcMain.handle("medication:add", (_, data) =>
    db.insertMedication(data)
  )

  ipcMain.handle("medication:getAll", () =>
    db.getMedication()
  )

  ipcMain.handle("medication:getAdministeredByNames", () =>
    db.getAdministeredByNames()
  )

  ipcMain.handle("medication:getBatch", (_, batchId) =>
    db.getMedicationByBatch(batchId)
  )

  ipcMain.handle("medication:update", (_, id, data) =>
    db.updateMedication(id, data)
  )

  ipcMain.handle("medication:delete", (_, id) =>
    db.deleteMedication(id)
  )

  // =====================================================
  // TRADERS
  // =====================================================

  ipcMain.handle("trader:add", (_, data) =>
    db.insertTrader(data)
  )

  ipcMain.handle("trader:getAll", () =>
    db.getTraders()
  )

  ipcMain.handle("trader:update", (_, id, data) =>
    db.updateTrader(id, data)
  )

  ipcMain.handle("trader:delete", (_, id) =>
    db.deleteTrader(id)
  )

  // =====================================================
  // EGG SALES
  // =====================================================

  ipcMain.handle("sale:add", (_, data) =>
    db.insertEggSale(data)
  )

  ipcMain.handle("sale:getAll", () =>
    db.getEggSales()
  )

  ipcMain.handle("sale:getBatch", (_, batchId) =>
    db.getEggSalesByBatch(batchId)
  )

  ipcMain.handle("sale:update", (_, id, data) =>
    db.updateEggSale(id, data)
  )

  ipcMain.handle("sale:delete", (_, id) =>
    db.deleteEggSale(id)
  )

  // =====================================================
  // PAYMENTS
  // =====================================================

  ipcMain.handle("payment:add", (_, data) =>
    db.insertTraderPayment(data)
  )

  ipcMain.handle("payment:getAll", () =>
    db.getTraderPayments()
  )

  ipcMain.handle("payment:getTrader", (_, traderId) =>
    db.getTraderPaymentsByTrader(traderId)
  )

  ipcMain.handle("payment:update", (_, id, data) =>
    db.updateTraderPayment(id, data)
  )

  ipcMain.handle("payment:delete", (_, id) =>
    db.deleteTraderPayment(id)
  )

  // =====================================================
  // BATCH OTHER EXPENSES (maintenance, electricity, labor, etc.)
  // =====================================================

  ipcMain.handle("batchExpense:add", (_, data) =>
    db.insertBatchExpense(data)
  )

  ipcMain.handle("batchExpense:getBatch", (_, batchId) =>
    db.getBatchExpensesByBatch(batchId)
  )

  ipcMain.handle("batchExpense:getAll", () =>
    db.getAllBatchExpenses()
  )

  ipcMain.handle("batchExpense:update", (_, id, data) =>
    db.updateBatchExpense(id, data)
  )

  ipcMain.handle("batchExpense:delete", (_, id) =>
    db.deleteBatchExpense(id)
  )

  // =====================================================
  // GLOBAL / FARM-WIDE EXPENSES
  // =====================================================

  ipcMain.handle("farmExpense:add", (_, data) =>
    db.insertFarmExpense(data)
  )

  ipcMain.handle("farmExpense:getAll", () =>
    db.getFarmExpenses()
  )

  ipcMain.handle("farmExpense:update", (_, id, data) =>
    db.updateFarmExpense(id, data)
  )

  ipcMain.handle("farmExpense:delete", (_, id) =>
    db.deleteFarmExpense(id)
  )

  // =====================================================
  // GLOBAL FINANCE SUMMARY
  // =====================================================

  ipcMain.handle("finance:globalSummary", () =>
    db.getGlobalFinanceSummary()
  )

  // =====================================================
  // PROFITABILITY
  // =====================================================

  ipcMain.handle("profit:getBatch", (_, batchId) =>
    db.getBatchProfitability(batchId)
  )

  // =====================================================
  // BATCH CLOSURE
  // =====================================================

  ipcMain.handle("batch:close", (_, data) =>
    db.closeBatch(data)
  )

  ipcMain.handle("batch:closure", (_, batchId) =>
    db.getBatchClosure(batchId)
  )

  // =====================================================
  // LEDGER
  // =====================================================
  ipcMain.handle("ledger:getTrader", (_, traderId) =>
    db.getCrossBatchTraderLedger(traderId)
  )

  ipcMain.handle("ledger:getAccount", (_, filters) =>
    db.getAccountLedger(filters || {})
  )

  // =====================================================
  // MANURE SALES
  // =====================================================
  ipcMain.handle("manure:add",    (_, data)     => db.insertManureSale(data))
  ipcMain.handle("manure:getAll", ()            => db.getManureSales())
  ipcMain.handle("manure:getBatch",(_, batchId) => db.getManureSalesByBatch(batchId))
  ipcMain.handle("manure:update", (_, id, data) => db.updateManureSale(id, data))
  ipcMain.handle("manure:delete", (_, id)       => db.deleteManureSale(id))

  // =====================================================
  // YEAR MANAGEMENT
  // =====================================================
  ipcMain.handle("year:getActive",    ()       => db.getActiveYear())
  ipcMain.handle("year:getAvailable", ()       => db.getAvailableYears())
  ipcMain.handle("year:switch",       (_, yr)  => { db.switchYear(yr); return yr })
  ipcMain.handle("year:backupBeforeUnlock", (_, yr) => db.backupBeforeUnlock(yr))
  ipcMain.handle("year:checkMigration",  (_, yr)         => db.checkMigrationNeeded(yr))
  ipcMain.handle("year:migrationPreview",(_, yr)         => db.getMigrationPreview(yr))
  ipcMain.handle("year:runMigration",    (_, fromYr, toYr) => db.runYearMigration(fromYr, toYr))
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})