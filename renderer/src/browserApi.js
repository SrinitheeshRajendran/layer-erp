// Fallback API for when the frontend is opened directly in a web browser (e.g. Chrome)
// where Electron's native IPC (preload.js) is not available.

if (typeof window !== "undefined" && !window.api) {
  console.warn("⚠️ Running in Browser Mode: Using web browser fallback API.")

  const initialBatches = [
    { id: 1, batch_id: "6", breed: "BV-300", start_date: "2026-06-02", start_count: 6500, current_count: 6419, status: "Active", shed: "Shed 6" },
    { id: 2, batch_id: "7", breed: "BV-300", start_date: "2026-05-30", start_count: 23500, current_count: 23003, status: "Active", shed: "Shed 7" },
    { id: 3, batch_id: "5", breed: "BV-300", start_date: "2026-06-01", start_count: 23500, current_count: 23274, status: "Active", shed: "Shed 5" },
    { id: 4, batch_id: "4", breed: "BV-300", start_date: "2026-06-01", start_count: 4200, current_count: 4016, status: "Active", shed: "Shed 4" },
    { id: 5, batch_id: "3", breed: "BV-300", start_date: "2026-06-01", start_count: 3300, current_count: 3177, status: "Active", shed: "Shed 3" },
    { id: 6, batch_id: "2", breed: "BV-300", start_date: "2026-06-01", start_count: 3500, current_count: 3399, status: "Active", shed: "Shed 2" },
    { id: 7, batch_id: "1", breed: "BV-300", start_date: "2026-06-01", start_count: 5800, current_count: 5632, status: "Active", shed: "Shed 1" }
  ]

  let batches = JSON.parse(localStorage.getItem("layererp_batches") || JSON.stringify(initialBatches))
  let eggProduction = JSON.parse(localStorage.getItem("layererp_egg_production") || "[]")
  let eggSales = JSON.parse(localStorage.getItem("layererp_egg_sales") || "[]")
  let traders = JSON.parse(localStorage.getItem("layererp_traders") || "[]")
  let payments = JSON.parse(localStorage.getItem("layererp_payments") || "[]")
  let medications = JSON.parse(localStorage.getItem("layererp_medications") || "[]")
  let batchExpenses = JSON.parse(localStorage.getItem("layererp_batch_expenses") || "[]")
  let farmExpenses = JSON.parse(localStorage.getItem("layererp_farm_expenses") || "[]")

  window.api = {
    getBatches: async () => batches.filter(b => b.status !== "Closed"),
    getBatch: async (batchId) => batches.find(b => String(b.batch_id) === String(batchId)) || null,
    insertBatch: async (data) => {
      const newBatch = { ...data, id: Date.now(), current_count: Number(data.start_count || 0), status: "Active" }
      batches.unshift(newBatch)
      localStorage.setItem("layererp_batches", JSON.stringify(batches))
      return newBatch
    },
    updateBatch: async (id, data) => {
      batches = batches.map(b => b.id === id ? { ...b, ...data } : b)
      localStorage.setItem("layererp_batches", JSON.stringify(batches))
    },
    updateBatchCount: async (batchId, count) => {
      batches = batches.map(b => String(b.batch_id) === String(batchId) ? { ...b, current_count: count } : b)
      localStorage.setItem("layererp_batches", JSON.stringify(batches))
    },
    deleteBatch: async (id) => {
      batches = batches.filter(b => b.id !== id)
      localStorage.setItem("layererp_batches", JSON.stringify(batches))
    },
    getClosedBatches: async () => batches.filter(b => b.status === "Closed"),

    insertEggProduction: async (data) => {
      eggProduction.push({ ...data, id: Date.now() })
      localStorage.setItem("layererp_egg_production", JSON.stringify(eggProduction))
    },
    getEggProduction: async () => eggProduction,
    getEggProductionByBatch: async (batchId) => eggProduction.filter(p => String(p.batch_id) === String(batchId)),
    updateEggProduction: async (id, data) => {
      eggProduction = eggProduction.map(p => p.id === id ? { ...p, ...data } : p)
      localStorage.setItem("layererp_egg_production", JSON.stringify(eggProduction))
    },
    deleteEggProduction: async (id) => {
      eggProduction = eggProduction.filter(p => p.id !== id)
      localStorage.setItem("layererp_egg_production", JSON.stringify(eggProduction))
    },

    insertFeedPurchase: async () => {},
    getFeedPurchases: async () => [],
    getFarmFeedBalance: async () => ({ balance_kg: 0 }),
    insertFeedAllocation: async () => {},
    getFeedAllocationsByBatch: async () => [],
    updateFeedAllocation: async () => {},
    deleteFeedAllocation: async () => {},
    insertFeedIntake: async () => {},
    getFeedIntakeByBatch: async () => [],
    updateFeedIntake: async () => {},
    deleteFeedIntake: async () => {},
    getBatchFeedBalance: async () => [],
    insertFeedReturn: async () => {},
    getFeedReturnsByBatch: async () => [],
    updateFeedReturn: async () => {},
    deleteFeedReturn: async () => {},

    insertMortalityLog: async () => {},
    getMortalityByBatch: async () => [],
    updateMortalityLog: async () => {},
    deleteMortalityLog: async () => {},

    insertMedication: async () => {},
    getMedication: async () => medications,
    getAdministeredByNames: async () => [],
    getMedicationByBatch: async () => [],
    updateMedication: async () => {},
    deleteMedication: async () => {},

    getTraders: async () => traders,
    insertTrader: async (t) => { traders.push({ ...t, id: Date.now() }) },
    updateTrader: async () => {},
    deleteTrader: async () => {},

    insertEggSale: async () => {},
    getEggSales: async () => eggSales,
    getEggSalesByBatch: async () => [],
    updateEggSale: async () => {},
    deleteEggSale: async () => {},

    insertTraderPayment: async () => {},
    getTraderPayments: async () => payments,
    getTraderPaymentsByTrader: async () => [],
    updateTraderPayment: async () => {},
    deleteTraderPayment: async () => {},

    getBatchProfitability: async () => ({ revenue: 0, expenses: 0, profit: 0 }),
    insertBatchExpense: async () => {},
    getBatchExpensesByBatch: async () => [],
    getAllBatchExpenses: async () => batchExpenses,
    updateBatchExpense: async () => {},
    deleteBatchExpense: async () => {},

    insertFarmExpense: async () => {},
    getFarmExpenses: async () => farmExpenses,
    updateFarmExpense: async () => {},
    deleteFarmExpense: async () => {},

    getGlobalFinanceSummary: async () => ({ total_income: 0, total_expenses: 0, net_profit: 0 }),
    closeBatch: async () => {},
    getBatchClosure: async () => null,

    getTraderLedger: async () => [],
    getCrossBatchTraderLedger: async () => [],
    getAccountLedger: async () => [],

    insertManureSale: async () => {},
    getManureSales: async () => [],
    getManureSalesByBatch: async () => [],
    updateManureSale: async () => {},
    deleteManureSale: async () => {},

    getActiveYear: async () => 2026,
    getAvailableYears: async () => [2026],
    switchYear: async () => {},
    backupBeforeUnlock: async () => null,
    checkMigration: async () => ({ needed: false, batches: [], traders: [] }),
    getMigrationPreview: async () => ({ batches: [], traders: [] }),
    runMigration: async () => ({ moved: 0, traders: 0 })
  }
}
