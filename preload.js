const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("api", {

  getBatches: () =>
    ipcRenderer.invoke("batch:getAll"),

  getBatch: (batchId) =>
    ipcRenderer.invoke("batch:getOne", batchId),

  insertBatch: (data) =>
    ipcRenderer.invoke("batch:insert", data),

  updateBatch: (id, data) =>
    ipcRenderer.invoke("batch:update", id, data),

  updateBatchCount: (batchId, count) =>
    ipcRenderer.invoke("batch:updateCount", batchId, count),

  deleteBatch: (id) =>
    ipcRenderer.invoke("batch:delete", id),

  getClosedBatches: () =>
    ipcRenderer.invoke("batch:getClosed"),

  insertEggProduction: (data) =>
    ipcRenderer.invoke("production:add", data),

  getEggProduction: () =>
    ipcRenderer.invoke("production:getAll"),

  getEggProductionByBatch: (batchId) =>
    ipcRenderer.invoke("production:getBatch", batchId),

  updateEggProduction: (id, data) =>
    ipcRenderer.invoke("production:update", id, data),

  deleteEggProduction: (id) =>
    ipcRenderer.invoke("production:delete", id),

  insertFeedPurchase: (data) =>
    ipcRenderer.invoke("feedPurchase:add", data),

  getFeedPurchases: () =>
    ipcRenderer.invoke("feedPurchase:getAll"),

  getFarmFeedBalance: () =>
    ipcRenderer.invoke("feedPurchase:balance"),

  insertFeedAllocation: (data) =>
    ipcRenderer.invoke("feedAllocation:add", data),

  getFeedAllocationsByBatch: (batchId) =>
    ipcRenderer.invoke("feedAllocation:getBatch", batchId),

  updateFeedAllocation: (id, data) =>
    ipcRenderer.invoke("feedAllocation:update", id, data),

  deleteFeedAllocation: (id) =>
    ipcRenderer.invoke("feedAllocation:delete", id),

  insertFeedIntake: (data) =>
    ipcRenderer.invoke("feedIntake:add", data),

  getFeedIntakeByBatch: (batchId) =>
    ipcRenderer.invoke("feedIntake:getBatch", batchId),

  updateFeedIntake: (id, data) =>
    ipcRenderer.invoke("feedIntake:update", id, data),

  deleteFeedIntake: (id) =>
    ipcRenderer.invoke("feedIntake:delete", id),

  getBatchFeedBalance: (batchId) =>
    ipcRenderer.invoke("feedIntake:balance", batchId),

  insertFeedReturn: (data) =>
    ipcRenderer.invoke("feedReturn:add", data),

  getFeedReturnsByBatch: (batchId) =>
    ipcRenderer.invoke("feedReturn:getBatch", batchId),

  updateFeedReturn: (id, data) =>
    ipcRenderer.invoke("feedReturn:update", id, data),

  deleteFeedReturn: (id) =>
    ipcRenderer.invoke("feedReturn:delete", id),

  insertMortalityLog: (data) =>
    ipcRenderer.invoke("mortality:add", data),

  getMortalityByBatch: (batchId) =>
    ipcRenderer.invoke("mortality:getBatch", batchId),

  updateMortalityLog: (id, data) =>
    ipcRenderer.invoke("mortality:update", id, data),

  deleteMortalityLog: (id) =>
    ipcRenderer.invoke("mortality:delete", id),

  insertMedication: (data) =>
    ipcRenderer.invoke("medication:add", data),

  getMedication: () =>
    ipcRenderer.invoke("medication:getAll"),

  getAdministeredByNames: () =>
    ipcRenderer.invoke("medication:getAdministeredByNames"),

  getMedicationByBatch: (batchId) =>
    ipcRenderer.invoke("medication:getBatch", batchId),

  updateMedication: (id, data) =>
    ipcRenderer.invoke("medication:update", id, data),

  deleteMedication: (id) =>
    ipcRenderer.invoke("medication:delete", id),

  getTraders: () =>
    ipcRenderer.invoke("trader:getAll"),

  insertTrader: (data) =>
    ipcRenderer.invoke("trader:add", data),

  updateTrader: (id, data) =>
    ipcRenderer.invoke("trader:update", id, data),

  deleteTrader: (id) =>
    ipcRenderer.invoke("trader:delete", id),

  insertEggSale: (data) =>
    ipcRenderer.invoke("sale:add", data),

  getEggSales: () =>
    ipcRenderer.invoke("sale:getAll"),

  getEggSalesByBatch: (batchId) =>
    ipcRenderer.invoke("sale:getBatch", batchId),

  updateEggSale: (id, data) =>
    ipcRenderer.invoke("sale:update", id, data),

  deleteEggSale: (id) =>
    ipcRenderer.invoke("sale:delete", id),

  insertTraderPayment: (data) =>
    ipcRenderer.invoke("payment:add", data),

  getTraderPayments: () =>
    ipcRenderer.invoke("payment:getAll"),

  getTraderPaymentsByTrader: (traderId) =>
    ipcRenderer.invoke("payment:getTrader", traderId),

  updateTraderPayment: (id, data) =>
    ipcRenderer.invoke("payment:update", id, data),

  deleteTraderPayment: (id) =>
    ipcRenderer.invoke("payment:delete", id),

  getBatchProfitability: (batchId) =>
    ipcRenderer.invoke("profit:getBatch", batchId),

  // Batch-level "other expenses" (maintenance, electricity, labor, etc.)
  insertBatchExpense: (data) =>
    ipcRenderer.invoke("batchExpense:add", data),

  getBatchExpensesByBatch: (batchId) =>
    ipcRenderer.invoke("batchExpense:getBatch", batchId),

  getAllBatchExpenses: () =>
    ipcRenderer.invoke("batchExpense:getAll"),

  updateBatchExpense: (id, data) =>
    ipcRenderer.invoke("batchExpense:update", id, data),

  deleteBatchExpense: (id) =>
    ipcRenderer.invoke("batchExpense:delete", id),

  // Global / farm-wide expenses (shared costs, not tied to one batch)
  insertFarmExpense: (data) =>
    ipcRenderer.invoke("farmExpense:add", data),

  getFarmExpenses: () =>
    ipcRenderer.invoke("farmExpense:getAll"),

  updateFarmExpense: (id, data) =>
    ipcRenderer.invoke("farmExpense:update", id, data),

  deleteFarmExpense: (id) =>
    ipcRenderer.invoke("farmExpense:delete", id),

  // Global finance summary across all batches + farm expenses
  getGlobalFinanceSummary: () =>
    ipcRenderer.invoke("finance:globalSummary"),

  closeBatch: (data) =>
    ipcRenderer.invoke("batch:close", data),

  getBatchClosure: (batchId) =>
    ipcRenderer.invoke("batch:closure", batchId),

  getTraderLedger: (traderId) =>
    ipcRenderer.invoke("ledger:getTrader", traderId),

  // ALIAS HOOK: Maps the front-end Sales.jsx lookup to the unified ledger engine
  getCrossBatchTraderLedger: (traderId) =>
    ipcRenderer.invoke("ledger:getTrader", traderId),

  // Account Ledger
  getAccountLedger: (filters) =>
    ipcRenderer.invoke("ledger:getAccount", filters),

  // Manure Sales
  insertManureSale:    (data)    => ipcRenderer.invoke("manure:add", data),
  getManureSales:      ()        => ipcRenderer.invoke("manure:getAll"),
  getManureSalesByBatch:(batchId)=> ipcRenderer.invoke("manure:getBatch", batchId),
  updateManureSale:    (id, data)=> ipcRenderer.invoke("manure:update", id, data),
  deleteManureSale:    (id)      => ipcRenderer.invoke("manure:delete", id),

  // Year management
  getActiveYear:    ()    => ipcRenderer.invoke("year:getActive"),
  getAvailableYears:()    => ipcRenderer.invoke("year:getAvailable"),
  switchYear:        (yr)           => ipcRenderer.invoke("year:switch", yr),
  backupBeforeUnlock:(yr)           => ipcRenderer.invoke("year:backupBeforeUnlock", yr),
  checkMigration:      (yr)          => ipcRenderer.invoke("year:checkMigration", yr),
  getMigrationPreview: (yr)          => ipcRenderer.invoke("year:migrationPreview", yr),
  runMigration:        (fromYr, toYr)=> ipcRenderer.invoke("year:runMigration", fromYr, toYr)
})