import { useState, useEffect } from "react"

const fmtDate = d => d ? d.split("-").reverse().join("-") : ""

const PAGE_SIZE = 30

function PageNav({ page, setPage, totalPages }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button
        onClick={() => setPage(p => Math.max(1, p - 1))}
        disabled={page <= 1}
        aria-label="Previous page"
        style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: 14, color: page <= 1 ? "#ccc" : "#475569" }}
      >
        ‹
      </button>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", border: "1px solid #ddd", borderRadius: 6, padding: "5px 12px", background: "#fff", minWidth: 90, textAlign: "center" }}>
        Page {page} / {totalPages}
      </span>
      <button
        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
        disabled={page >= totalPages}
        aria-label="Next page"
        style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: page >= totalPages ? "not-allowed" : "pointer", fontSize: 14, color: page >= totalPages ? "#ccc" : "#475569" }}
      >
        ›
      </button>
    </div>
  )
}

export default function BatchView({ batchId, isReadOnly = false }) {

  const today =
    new Date().toISOString().split("T")[0]

  const [tab, setTab] = useState("overview")

  const [batch, setBatch] = useState(null)

  const [production, setProduction] = useState([])
  const [feedBalance, setFeedBalance] = useState([])
  const [feedIntake, setFeedIntake] = useState([])
  const [feedStockList, setFeedStockList] = useState([])
  const [medications, setMedications] = useState([])

  const [mortality, setMortality] = useState([])
  const [sales, setSales] = useState([])
  const [traders, setTraders] = useState([])
  const [profit, setProfit] = useState(null)
  const [closure, setClosure] = useState(null)
  const [batchExpenses, setBatchExpenses] = useState([])

  const [loading, setLoading] = useState(true)

  // Add Batch Popup Modal State
  // Each list below uses a dedicated month navigator (arrows + jump) instead of free-text search.
  const MONTH_ABBR = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]

  function makeMonthNav() {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  }

  const [productionViewDate, setProductionViewDate] = useState(makeMonthNav)
  const [salesViewDate, setSalesViewDate] = useState(makeMonthNav)
  const [medicationViewDate, setMedicationViewDate] = useState(makeMonthNav)
  const [mortalityViewDate, setMortalityViewDate] = useState(makeMonthNav)

  const goPrevProductionMonth = () => setProductionViewDate(v => {
    let { year, month } = v; month -= 1; if (month < 0) { month = 11; year -= 1 }; return { year, month }
  })
  const goNextProductionMonth = () => setProductionViewDate(v => {
    let { year, month } = v; month += 1; if (month > 11) { month = 0; year += 1 }; return { year, month }
  })
  const goPrevSalesMonth = () => setSalesViewDate(v => {
    let { year, month } = v; month -= 1; if (month < 0) { month = 11; year -= 1 }; return { year, month }
  })
  const goNextSalesMonth = () => setSalesViewDate(v => {
    let { year, month } = v; month += 1; if (month > 11) { month = 0; year += 1 }; return { year, month }
  })
  const goPrevMedicationMonth = () => setMedicationViewDate(v => {
    let { year, month } = v; month -= 1; if (month < 0) { month = 11; year -= 1 }; return { year, month }
  })
  const goNextMedicationMonth = () => setMedicationViewDate(v => {
    let { year, month } = v; month += 1; if (month > 11) { month = 0; year += 1 }; return { year, month }
  })
  const goPrevMortalityMonth = () => setMortalityViewDate(v => {
    let { year, month } = v; month -= 1; if (month < 0) { month = 11; year -= 1 }; return { year, month }
  })
  const goNextMortalityMonth = () => setMortalityViewDate(v => {
    let { year, month } = v; month += 1; if (month > 11) { month = 0; year += 1 }; return { year, month }
  })

  const productionMonthLabel = new Date(productionViewDate.year, productionViewDate.month, 1).toLocaleString("en-US", { month: "long", year: "numeric" })
  const salesMonthLabel = new Date(salesViewDate.year, salesViewDate.month, 1).toLocaleString("en-US", { month: "long", year: "numeric" })
  const medicationMonthLabel = new Date(medicationViewDate.year, medicationViewDate.month, 1).toLocaleString("en-US", { month: "long", year: "numeric" })
  const mortalityMonthLabel = new Date(mortalityViewDate.year, mortalityViewDate.month, 1).toLocaleString("en-US", { month: "long", year: "numeric" })

  const productionMonthInputValue = `${productionViewDate.year}-${String(productionViewDate.month + 1).padStart(2, "0")}`
  const salesMonthInputValue = `${salesViewDate.year}-${String(salesViewDate.month + 1).padStart(2, "0")}`
  const medicationMonthInputValue = `${medicationViewDate.year}-${String(medicationViewDate.month + 1).padStart(2, "0")}`
  const mortalityMonthInputValue = `${mortalityViewDate.year}-${String(mortalityViewDate.month + 1).padStart(2, "0")}`

  const handleProductionMonthInputChange = (e) => {
    const val = e.target.value; if (!val) return
    const [y, m] = val.split("-").map(Number); setProductionViewDate({ year: y, month: m - 1 })
  }
  const handleSalesMonthInputChange = (e) => {
    const val = e.target.value; if (!val) return
    const [y, m] = val.split("-").map(Number); setSalesViewDate({ year: y, month: m - 1 })
  }
  const handleMedicationMonthInputChange = (e) => {
    const val = e.target.value; if (!val) return
    const [y, m] = val.split("-").map(Number); setMedicationViewDate({ year: y, month: m - 1 })
  }
  const handleMortalityMonthInputChange = (e) => {
    const val = e.target.value; if (!val) return
    const [y, m] = val.split("-").map(Number); setMortalityViewDate({ year: y, month: m - 1 })
  }

  // synthetic "mon yyyy" query strings so the existing matchesMonth() filter can be reused as-is
  const productionSearch = `${MONTH_ABBR[productionViewDate.month]} ${productionViewDate.year}`
  const salesSearch = `${MONTH_ABBR[salesViewDate.month]} ${salesViewDate.year}`
  const medicationSearch = `${MONTH_ABBR[medicationViewDate.month]} ${medicationViewDate.year}`
  const mortalitySearch = `${MONTH_ABBR[mortalityViewDate.month]} ${mortalityViewDate.year}`

  // Feed Arrivals / Feed Consumption use a dedicated month navigator (arrows + jump)
  // instead of free-text search.
  const [feedArrivalViewDate, setFeedArrivalViewDate] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [feedIntakeViewDate, setFeedIntakeViewDate] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const goPrevFeedArrivalMonth = () => setFeedArrivalViewDate(v => {
    let { year, month } = v; month -= 1; if (month < 0) { month = 11; year -= 1 }; return { year, month }
  })
  const goNextFeedArrivalMonth = () => setFeedArrivalViewDate(v => {
    let { year, month } = v; month += 1; if (month > 11) { month = 0; year += 1 }; return { year, month }
  })
  const goPrevFeedIntakeMonth = () => setFeedIntakeViewDate(v => {
    let { year, month } = v; month -= 1; if (month < 0) { month = 11; year -= 1 }; return { year, month }
  })
  const goNextFeedIntakeMonth = () => setFeedIntakeViewDate(v => {
    let { year, month } = v; month += 1; if (month > 11) { month = 0; year += 1 }; return { year, month }
  })
  const feedArrivalMonthLabel = new Date(feedArrivalViewDate.year, feedArrivalViewDate.month, 1)
    .toLocaleString("en-US", { month: "long", year: "numeric" })
  const feedIntakeMonthLabel = new Date(feedIntakeViewDate.year, feedIntakeViewDate.month, 1)
    .toLocaleString("en-US", { month: "long", year: "numeric" })
  const feedArrivalMonthInputValue = `${feedArrivalViewDate.year}-${String(feedArrivalViewDate.month + 1).padStart(2, "0")}`
  const feedIntakeMonthInputValue = `${feedIntakeViewDate.year}-${String(feedIntakeViewDate.month + 1).padStart(2, "0")}`
  const handleFeedArrivalMonthInputChange = (e) => {
    const val = e.target.value
    if (!val) return
    const [y, m] = val.split("-").map(Number)
    setFeedArrivalViewDate({ year: y, month: m - 1 })
  }
  const handleFeedIntakeMonthInputChange = (e) => {
    const val = e.target.value
    if (!val) return
    const [y, m] = val.split("-").map(Number)
    setFeedIntakeViewDate({ year: y, month: m - 1 })
  }
  // synthetic "mon yyyy" query strings so the existing matchesMonth() filter can be reused as-is
  const feedArrivalSearch = `${MONTH_ABBR[feedArrivalViewDate.month]} ${feedArrivalViewDate.year}`
  const feedIntakeSearch = `${MONTH_ABBR[feedIntakeViewDate.month]} ${feedIntakeViewDate.year}`

  // pagination state (30 rows per page) for the tables above
  const [productionPage, setProductionPage] = useState(1)
  const [salesPage, setSalesPage] = useState(1)
  const [feedArrivalPage, setFeedArrivalPage] = useState(1)
  const [feedIntakePage, setFeedIntakePage] = useState(1)
  const [medicationPage, setMedicationPage] = useState(1)
  const [mortalityPage, setMortalityPage] = useState(1)

  const [showAddBatchModal, setShowAddBatchModal] = useState(false)
  const [addBatchForm, setAddBatchForm] = useState({
    batch_id: "",
    shed: "",
    breed: "",
    start_date: today,
    initial_age: "0.0",
    start_count: "",
    free_chicks: "",
    cost_per_chick: ""
  })

  const [showProductionForm, setShowProductionForm] =
    useState(false)
  const [editingProductionId, setEditingProductionId] = useState(null)

  const [showMedicationForm, setShowMedicationForm] =
  useState(false)
  const [editingMedicationId, setEditingMedicationId] = useState(null)

  const [showFeedForm, setShowFeedForm] =
  useState(false)
  const [editingFeedIntakeId, setEditingFeedIntakeId] = useState(null)
  // Feed Consumption's "Feed type" field is a dropdown of feed types already
  // logged for this batch (via Feed Arrivals) — this is on by default to stop
  // typos (e.g. "Layer Mash" vs "layer mash") from splitting the feed balance
  // into duplicate rows. Flip to true to fall back to free-text entry.
  const [useCustomFeedType, setUseCustomFeedType] = useState(false)

  const [showFeedArrivalForm, setShowFeedArrivalForm] =
  useState(false)
  const [editingFeedArrivalId, setEditingFeedArrivalId] = useState(null)

  const [showSalesForm, setShowSalesForm] =
  useState(false)
  const [showWholeTrayWarning, setShowWholeTrayWarning] = useState(false)
  const [editingSaleId, setEditingSaleId] = useState(null)

  const [showMortalityForm, setShowMortalityForm] =
  useState(false)
  const [editingMortalityId, setEditingMortalityId] = useState(null)

  const [showExpenseForm, setShowExpenseForm] =
  useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState(null)
  const [expenseSearch, setExpenseSearch] = useState("")


  const [showClosureForm, setShowClosureForm] =
  useState(false)

  const [showBreedForm, setShowBreedForm] =
  useState(false)

  const [breedInput, setBreedInput] =
  useState("")

  const [showAgeForm, setShowAgeForm] =
  useState(false)

  const [ageInput, setAgeInput] =
  useState("")

  const [showCostForm, setShowCostForm] =
  useState(false)

  const [costInput, setCostInput] =
  useState("")

  const [showFreeChickForm, setShowFreeChickForm] =
  useState(false)

  const [freeChickInput, setFreeChickInput] =
  useState("")

const [closureForm, setClosureForm] =
  useState({
    closure_date: today,
    birds_sold: 0,
    price_per_bird: 0
  })

const [feedForm, setFeedForm] =
  useState({
    date: today,
    feed_type: "",
    qty_kg: ""
  })

const [feedArrivalForm, setFeedArrivalForm] =
  useState({
    date: today,
    feed_type: "",
    qty_kg: "",
    rate_per_kg: "",
    trader_id: "",
    notes: ""
  })

const [salesForm, setSalesForm] =
  useState({
    date: today,
    grade: "",
    quantity: "",
    unit_type: "TRAY",
    rate_per_egg: "",
    trader_id: "",
    broken_qty: "",
    notes: ""
  })

const [mortalityForm, setMortalityForm] =
  useState({
    date: today,
    deaths: 0,
    reason: ""
  })

const [batchExpenseForm, setBatchExpenseForm] =
  useState({
    date: today,
    expense_type: "Maintenance",
    amount: "",
    notes: ""
  })

const blankMedLine = () => ({
  type: "Support Medicine",
  medicine_name: "",
  reason: "",
  route: "Drinking water",
  administered_by: "",
  form_type: "Powder",
  num_packs: "",
  qty_per_pack: "",
  qty_unit: "kg",
  price_per_pack: ""
})

const [medicationForm, setMedicationForm] =
  useState({
    date: today,
    trader_id: "",
    tax_pct: "",
    particulars: "",
    lines: [blankMedLine()]
  })

  const [administeredByOptions, setAdministeredByOptions] = useState([])

  const [productionForm, setProductionForm] =
    useState({
      date: today,

      pullet_trays: 0,
      medium_trays: 0,
      export_trays: 0,
      correct_size_trays: 0,
      large_trays: 0,

      double_yolk_eggs: 0
    })

  const card = {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 10,
    padding: 16,
    fontSize: 13
  }

  const btn = (bg, color = "#fff") => ({
    background: bg,
    color,
    border: "none",
    borderRadius: 6,
    padding: "6px 14px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500
  })

  const inp = {
    width: "100%",
    padding: "6px 10px",
    border: "1px solid #ddd",
    borderRadius: 6,
    fontSize: 13,
    boxSizing: "border-box",
    background: "#fff"
  }

  const searchInp = {
    padding: "6px 12px",
    border: "1px solid #ddd",
    borderRadius: 6,
    fontSize: 12,
    width: 180,
    boxSizing: "border-box",
    background: "#f9fafb"
  }

  const label = {
    fontSize: 11,
    color: "#3d3d3d",
    display: "block",
    marginBottom: 3
  }

  const kpiValue = {
    fontSize: 22,
    fontWeight: 700,
    color: "#0F6E56",
    margin: "4px 0 2px"
  }

  const kpiSub = {
    fontSize: 11,
    color: "#aaa"
  }

  const sectionTitle = {
    fontWeight: 600,
    fontSize: 13,
    marginBottom: 12
  }

  const th = {
    textAlign: "left",
    padding: "9px 11px",
    borderBottom: "1px solid #eee",
    color: "#3d3d3d",
    fontWeight: 600,
    fontSize: 15
  }

  const td = {
    padding: "9px 11px",
    borderBottom: "1px solid #f5f5f5",
    fontSize: 14,
    verticalAlign: "middle",
    color: "#3d3d3d"
  }

  function calculateCurrentAge(startDateStr, initialAgeDays = 0) {
    if (!startDateStr) return "0.0"
    const startDate = new Date(startDateStr)
    const currentToday = new Date()
    
    startDate.setHours(0, 0, 0, 0)
    currentToday.setHours(0, 0, 0, 0)
    
    const diffTime = currentToday.getTime() - startDate.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    
    const totalDays = Math.max(0, initialAgeDays + diffDays)
    const weeks = Math.floor(totalDays / 7)
    const remainingDays = totalDays % 7
    
    return `${weeks}.${remainingDays}`
  }

  function convertDaysToWeeksString(totalDays) {
    const weeks = Math.floor(totalDays / 7)
    const remainingDays = totalDays % 7
    return `${weeks}.${remainingDays}`
  }

  // Parses "jan 2026", "feb 2025" etc. and checks if a date string (YYYY-MM-DD) matches
  function matchesMonth(dateStr, query) {
    if (!query || !query.trim()) return true
    const monthMap = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
    }
    const parts = query.trim().toLowerCase().split(/\s+/)
    const monthNum = monthMap[parts[0]?.slice(0, 3)]
    const year = parts[1] ? parseInt(parts[1]) : null
    if (!monthNum) return false
    const d = new Date(dateStr)
    if (isNaN(d)) return false
    const mMatch = (d.getMonth() + 1) === monthNum
    const yMatch = year ? d.getFullYear() === year : true
    return mMatch && yMatch
  }

  // ── search-filtered + paginated (30/page) rows for each table ──────
  const productionFiltered = production.filter(p => matchesMonth(p.date, productionSearch))
  const productionTotalPages = Math.max(1, Math.ceil(productionFiltered.length / PAGE_SIZE))
  const productionSafePage = Math.min(Math.max(1, productionPage), productionTotalPages)
  const productionPageRows = productionFiltered.slice((productionSafePage - 1) * PAGE_SIZE, productionSafePage * PAGE_SIZE)
  useEffect(() => { setProductionPage(1) }, [productionSearch])

  const salesFiltered = sales.filter(s => matchesMonth(s.date, salesSearch))
  const salesTotalPages = Math.max(1, Math.ceil(salesFiltered.length / PAGE_SIZE))
  const salesSafePage = Math.min(Math.max(1, salesPage), salesTotalPages)
  const salesPageRows = salesFiltered.slice((salesSafePage - 1) * PAGE_SIZE, salesSafePage * PAGE_SIZE)
  useEffect(() => { setSalesPage(1) }, [salesSearch])

  const feedArrivalFiltered = feedStockList.filter(f => matchesMonth(f.date, feedArrivalSearch))
  const feedArrivalTotalPages = Math.max(1, Math.ceil(feedArrivalFiltered.length / PAGE_SIZE))
  const feedArrivalSafePage = Math.min(Math.max(1, feedArrivalPage), feedArrivalTotalPages)
  const feedArrivalPageRows = feedArrivalFiltered.slice((feedArrivalSafePage - 1) * PAGE_SIZE, feedArrivalSafePage * PAGE_SIZE)
  useEffect(() => { setFeedArrivalPage(1) }, [feedArrivalSearch])

  const feedIntakeFiltered = feedIntake.filter(f => matchesMonth(f.date, feedIntakeSearch))
  const feedIntakeTotalPages = Math.max(1, Math.ceil(feedIntakeFiltered.length / PAGE_SIZE))
  const feedIntakeSafePage = Math.min(Math.max(1, feedIntakePage), feedIntakeTotalPages)
  const feedIntakePageRows = feedIntakeFiltered.slice((feedIntakeSafePage - 1) * PAGE_SIZE, feedIntakeSafePage * PAGE_SIZE)
  useEffect(() => { setFeedIntakePage(1) }, [feedIntakeSearch])

  const medicationFiltered = medications.filter(m => matchesMonth(m.date, medicationSearch))
  const medicationTotalPages = Math.max(1, Math.ceil(medicationFiltered.length / PAGE_SIZE))
  const medicationSafePage = Math.min(Math.max(1, medicationPage), medicationTotalPages)
  const medicationPageRows = medicationFiltered.slice((medicationSafePage - 1) * PAGE_SIZE, medicationSafePage * PAGE_SIZE)
  useEffect(() => { setMedicationPage(1) }, [medicationSearch])

  const mortalityFiltered = mortality.filter(m => matchesMonth(m.date, mortalitySearch))
  const mortalityTotalPages = Math.max(1, Math.ceil(mortalityFiltered.length / PAGE_SIZE))
  const mortalitySafePage = Math.min(Math.max(1, mortalityPage), mortalityTotalPages)
  const mortalityPageRows = mortalityFiltered.slice((mortalitySafePage - 1) * PAGE_SIZE, mortalitySafePage * PAGE_SIZE)
  useEffect(() => { setMortalityPage(1) }, [mortalitySearch])


  async function saveFreeChicks() {
  try {
    await window.api.updateBatch(batch.id, { ...batch, free_chicks: Number(freeChickInput || 0) })
    setShowFreeChickForm(false)
    loadData()
  } catch (err) {
    console.error(err)
  }
}


  async function loadData() {
    if (!batchId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true)

      const [
        batchInfo,
        prod,
        feedBal,
        feedUse,
        feedArrivals,
        meds,
        mort,
        eggSales,
        traderList,
        profitability,
        batchClosure,
        administeredByNames,
        expenseList
      ] = await Promise.all([
        window.api.getBatch(batchId),
        window.api.getEggProductionByBatch(batchId),
        window.api.getBatchFeedBalance(batchId),
        window.api.getFeedIntakeByBatch(batchId),
        window.api.getFeedAllocationsByBatch(batchId),
        window.api.getMedicationByBatch(batchId),
        window.api.getMortalityByBatch(batchId),
        window.api.getEggSalesByBatch(batchId),
        window.api.getTraders(),
        window.api.getBatchProfitability(batchId),
        window.api.getBatchClosure(batchId),
        window.api.getAdministeredByNames(),
        window.api.getBatchExpensesByBatch(batchId)
      ])

      setBatch(batchInfo)
      setProduction(prod || [])
      setFeedBalance(feedBal || [])
      setFeedIntake(feedUse || [])
      setFeedStockList(feedArrivals || [])
      setMedications(meds || [])
      setMortality(mort || [])
      setSales(eggSales || [])
      setTraders(traderList || [])
      setProfit(profitability)
      setClosure(batchClosure)
      setAdministeredByOptions(administeredByNames || [])
      setBatchExpenses(expenseList || [])

    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateBatch(e) {
    e.preventDefault()
    if (!addBatchForm.batch_id.trim()) return

    try {
      await window.api.insertBatch({
        batch_id: addBatchForm.batch_id,
        shed: addBatchForm.shed,
        breed: addBatchForm.breed,
        start_date: addBatchForm.start_date,
        initial_age: addBatchForm.initial_age || "0.0",
        start_count: Number(addBatchForm.start_count || 0),
        free_chicks: Number(addBatchForm.free_chicks || 0),
        cost_per_chick: Number(addBatchForm.cost_per_chick || 0)
      })

      setShowAddBatchModal(false)
      setAddBatchForm({
        batch_id: "",
        shed: "",
        breed: "",
        start_date: today,
        initial_age: "0.0",
        start_count: "",
        free_chicks: "",
        cost_per_chick: ""
      })
      alert("New Batch Flock created successfully!")
      if (batchId) {
        loadData()
      } else {
        window.location.reload()
      }
    } catch (err) {
      console.error(err)
      alert("Error adding batch. Make sure Batch ID is unique.")
    }
  }

  const blankProductionForm = {
    date: today,

    pullet_trays: 0,
    medium_trays: 0,
    export_trays: 0,
    correct_size_trays: 0,
    large_trays: 0,

    double_yolk_eggs: 0
  }

  async function saveProduction() {
    try {

      if (editingProductionId) {
        await window.api.updateEggProduction(editingProductionId, productionForm)
      } else {
        await window.api.insertEggProduction({
          batch_id: batchId,
          ...productionForm
        })
      }

      setShowProductionForm(false)
      setEditingProductionId(null)
      setProductionForm(blankProductionForm)

      loadData()

    } catch (err) {
      console.error(err)
    }
  }

  function editProduction(p) {
    setEditingProductionId(p.id)
    setProductionForm({
      date: p.date || today,
      pullet_trays: Number(p.pullet_trays || 0),
      medium_trays: Number(p.medium_trays || 0),
      export_trays: Number(p.export_trays || 0),
      correct_size_trays: Number(p.correct_size_trays || 0),
      large_trays: Number(p.large_trays || 0),
      double_yolk_eggs: Number(p.double_yolk_eggs || 0)
    })
    !isReadOnly && setShowProductionForm(true)
  }

  function cancelProductionForm() {
    setShowProductionForm(false)
    setEditingProductionId(null)
    setProductionForm(blankProductionForm)
  }

  async function deleteProduction(id) {
    if (isReadOnly || !window.confirm("Delete this production record?")) return
    await window.api.deleteEggProduction(id)
    loadData()
  }

  const blankMedicationForm = {
    date: today,
    trader_id: "",
    tax_pct: "",
    particulars: "",
    lines: [blankMedLine()]
  }

  // Add / remove / update one medicine line within the current bill
  function addMedLine() {
    setMedicationForm(f => ({ ...f, lines: [...f.lines, blankMedLine()] }))
  }
  function removeMedLine(idx) {
    setMedicationForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }))
  }
  function updateMedLine(idx, patch) {
    setMedicationForm(f => ({
      ...f,
      lines: f.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l))
    }))
  }

  // Pre-tax cost of a single line
  function medLineCost(line) {
    return Number(line.num_packs || 0) * Number(line.price_per_pack || 0)
  }

  async function saveMedication() {
  try {

    const traderId = medicationForm.trader_id ? Number(medicationForm.trader_id) : null
    const traderName = medicationForm.trader_id
      ? (traders.find(t => String(t.id) === String(medicationForm.trader_id))?.name || "")
      : ""
    const taxPct = Number(medicationForm.tax_pct || 0)

    const buildPayload = (line) => ({
      batch_id: batchId,
      date: medicationForm.date,
      type: line.type,
      medicine_name: line.medicine_name,
      notes: line.type === "Vaccine" ? "" : line.reason,
      route: line.route,
      administered_by: line.administered_by.trim(),
      trader_id: traderId,
      trader_name: traderName,
      tax_pct: taxPct,
      particulars: medicationForm.particulars,
      form_type: line.form_type,
      num_packs: Number(line.num_packs || 0),
      qty_per_pack: Number(line.qty_per_pack || 0),
      qty_unit: line.qty_unit,
      price_per_pack: Number(line.price_per_pack || 0),
      cost: medLineCost(line) // pre-tax cost, per medicine line
    })

    if (editingMedicationId) {
      // Editing always operates on a single existing record
      await window.api.updateMedication(editingMedicationId, buildPayload(medicationForm.lines[0]))
    } else {
      // Bulk save — one insert per medicine line, all sharing date/trader/tax/particulars
      for (const line of medicationForm.lines) {
        if (!line.medicine_name.trim()) continue
        await window.api.insertMedication(buildPayload(line))
      }
    }

    setShowMedicationForm(false)
    setEditingMedicationId(null)

    // Remember any newly-typed "administered by" names immediately so they're
    // available in the dropdown without waiting for the next full reload
    const newNames = medicationForm.lines
      .map(l => l.administered_by.trim())
      .filter(n => n && !administeredByOptions.includes(n))
    if (newNames.length) {
      setAdministeredByOptions(opts => [...new Set([...opts, ...newNames])].sort())
    }

    setMedicationForm(blankMedicationForm)

    loadData()

  } catch (err) {
    console.error(err)
  }
}

  function editMedication(m) {
    setEditingMedicationId(m.id)
    const formType = m.form_type || "Powder"
    const defaultUnit = m.qty_unit || ((formType === "Liquid" || formType === "Drops") ? "L" : formType === "Vile" ? "vile" : "kg")
    setMedicationForm({
      date: m.date || today,
      trader_id: m.trader_id ? String(m.trader_id) : "",
      tax_pct: m.tax_pct || "",
      particulars: m.particulars || "",
      lines: [{
        type: m.type || "Support Medicine",
        medicine_name: m.medicine || "",
        reason: m.type === "Vaccine" ? "" : (m.notes || ""),
        route: m.route || "Drinking water",
        administered_by: m.administered_by || "",
        form_type: formType,
        num_packs: m.num_packs || "",
        qty_per_pack: m.qty_per_pack || "",
        qty_unit: defaultUnit,
        price_per_pack: m.price_per_pack || ""
      }]
    })
    !isReadOnly && setShowMedicationForm(true)
  }

  function cancelMedicationForm() {
    setShowMedicationForm(false)
    setEditingMedicationId(null)
    setMedicationForm(blankMedicationForm)
  }


  async function closeBatchNow() {
  try {

    await window.api.closeBatch({
      batch_id: batchId,
      ...closureForm
    })

    loadData()

  } catch (err) {
    console.error(err)
  }
}
  async function saveBreed() {
  try {

    await window.api.updateBatch(batch.id, {
      ...batch,
      breed: breedInput
    })

    setShowBreedForm(false)

    loadData()

  } catch (err) {
    console.error(err)
  }
}

  async function saveInitialAge() {
  try {

    await window.api.updateBatch(batch.id, {
      ...batch,
      initial_age: ageInput
    })

    setShowAgeForm(false)

    loadData()

  } catch (err) {
    console.error(err)
  }
}

  async function saveCostPerChick() {
  try {

    await window.api.updateBatch(batch.id, {
      ...batch,
      cost_per_chick: Number(costInput || 0)
    })

    setShowCostForm(false)

    loadData()

  } catch (err) {
    console.error(err)
  }
}

  async function saveFreeChicks() {
  try {

    await window.api.updateBatch(batch.id, {
      ...batch,
      free_chicks: Number(freeChickInput || 0)
    })

    setShowFreeChickForm(false)

    loadData()

  } catch (err) {
    console.error(err)
  }
}

  // Feed types already entered for this batch (via Feed Arrivals), deduped —
  // used to populate the Feed Consumption dropdown so it can't drift out of
  // sync with what was actually purchased/allocated.
  const feedTypeOptions = Array.from(
    new Set(
      [...feedBalance.map(f => f.feed_type), ...feedStockList.map(f => f.feed_type)]
        .filter(Boolean)
    )
  ).sort()

  const blankFeedForm = { date: today, feed_type: "", qty_kg: "" }

  async function saveFeedConsumption() {
  try {

    if (editingFeedIntakeId) {
      await window.api.updateFeedIntake(editingFeedIntakeId, feedForm)
    } else {
      await window.api.insertFeedIntake({
        batch_id: batchId,
        ...feedForm
      })
    }

    setShowFeedForm(false)
    setEditingFeedIntakeId(null)
    setFeedForm(blankFeedForm)
    setUseCustomFeedType(false)

    loadData()

  } catch (err) {
    console.error(err)
  }
}

  function editFeedConsumption(f) {
    setEditingFeedIntakeId(f.id)
    setFeedForm({
      date: f.date || today,
      feed_type: f.feed_type || "",
      qty_kg: f.qty_kg || ""
    })
    // If this record's feed type isn't one of the known dropdown options
    // (e.g. old data, or the arrival was later deleted/renamed), fall back
    // to free-text mode so the value is still visible and editable.
    setUseCustomFeedType(!!f.feed_type && !feedTypeOptions.includes(f.feed_type))
    !isReadOnly && setShowFeedForm(true)
  }

  function cancelFeedForm() {
    setShowFeedForm(false)
    setEditingFeedIntakeId(null)
    setFeedForm(blankFeedForm)
    setUseCustomFeedType(false)
  }

  async function deleteFeedConsumption(id) {
    if (!window.confirm("Delete this feed consumption record?")) return
    await window.api.deleteFeedIntake(id)
    loadData()
  }

  // Same idea as the Feed Consumption dropdown below — Feed Arrivals is
  // where a feed type first gets typed, so this defaults to reusing
  // previously-entered types (from this batch's own arrival history) and
  // only drops to free text for a genuinely new feed type.
  const [useCustomArrivalFeedType, setUseCustomArrivalFeedType] = useState(false)

  const blankFeedArrivalForm = {
    date: today,
    feed_type: "",
    qty_kg: "",
    rate_per_kg: "",
    trader_id: "",
    notes: ""
  }

  async function saveFeedArrival() {
  try {

    if (editingFeedArrivalId) {
      await window.api.updateFeedAllocation(editingFeedArrivalId, {
        ...feedArrivalForm,
        trader_id: Number(feedArrivalForm.trader_id) || null
      })
    } else {
      await window.api.insertFeedAllocation({
        batch_id: batchId,
        ...feedArrivalForm,
        trader_id: Number(feedArrivalForm.trader_id) || null
      })
    }

    setShowFeedArrivalForm(false)
    setEditingFeedArrivalId(null)
    setFeedArrivalForm(blankFeedArrivalForm)
    setUseCustomArrivalFeedType(false)

    loadData()

  } catch (err) {
    console.error(err)
  }
}

  function editFeedArrival(f) {
    setEditingFeedArrivalId(f.id)
    setFeedArrivalForm({
      date: f.date || today,
      feed_type: f.feed_type || "",
      qty_kg: f.qty_kg || "",
      rate_per_kg: f.rate_per_kg || "",
      trader_id: f.trader_id ? String(f.trader_id) : "",
      notes: f.notes || ""
    })
    // Same fallback logic as Feed Consumption: if this arrival's feed type
    // isn't currently in the dropdown list, show it as free text instead
    // of silently swapping it for something else.
    setUseCustomArrivalFeedType(!!f.feed_type && !feedTypeOptions.includes(f.feed_type))
    !isReadOnly && setShowFeedArrivalForm(true)
  }

  function cancelFeedArrivalForm() {
    setShowFeedArrivalForm(false)
    setEditingFeedArrivalId(null)
    setFeedArrivalForm(blankFeedArrivalForm)
    setUseCustomArrivalFeedType(false)
  }

  const blankSalesForm = {
    date: today,
    grade: "",
    quantity: "",
    unit_type: "TRAY",
    rate_per_egg: "",
    trader_id: "",
    broken_qty: "",
    notes: ""
  }

  async function saveEggSale() {
  try {

    const qty = Number(salesForm.quantity || 0)
    const brokenQty = Number(salesForm.broken_qty || 0)

    // Sales must be whole trays/pieces — never fractional. Production logging
    // (productionForm.double_yolk_eggs) is untouched and still allows 0.5 steps.
    if (!Number.isInteger(qty) || !Number.isInteger(brokenQty)) {
      setShowWholeTrayWarning(true)
      return
    }

    const payload = {
      ...salesForm,
      broken_qty: brokenQty,
      trader_id: salesForm.trader_id || null
    }

    if (editingSaleId) {
      await window.api.updateEggSale(editingSaleId, payload)
    } else {
      await window.api.insertEggSale({
        batch_id: batchId,
        ...payload
      })
    }

    setShowSalesForm(false)
    setEditingSaleId(null)
    setSalesForm(blankSalesForm)

    loadData()

  } catch (err) {
    console.error(err)
  }
}

  function editEggSale(s) {
    setEditingSaleId(s.id)
    setSalesForm({
      date: s.date || today,
      grade: s.grade || "",
      quantity: s.quantity || "",
      unit_type: s.unit_type || "TRAY",
      rate_per_egg: s.rate_per_egg || "",
      trader_id: s.trader_id ? String(s.trader_id) : "",
      broken_qty: s.broken_qty || "",
      notes: s.notes || ""
    })
    !isReadOnly && setShowSalesForm(true)
  }

  function cancelSalesForm() {
    setShowSalesForm(false)
    setEditingSaleId(null)
    setSalesForm(blankSalesForm)
  }

  async function deleteEggSale(id) {
    if (isReadOnly || !window.confirm("Delete this sale record?")) return
    await window.api.deleteEggSale(id)
    loadData()
  }

  const blankMortalityForm = { date: today, deaths: 0, reason: "" }

  async function saveMortality() {
  try {

    if (editingMortalityId) {
      await window.api.updateMortalityLog(editingMortalityId, mortalityForm)
    } else {
      await window.api.insertMortalityLog({
        batch_id: batchId,
        ...mortalityForm
      })
    }

    setShowMortalityForm(false)
    setEditingMortalityId(null)
    setMortalityForm(blankMortalityForm)

    loadData()

  } catch (err) {
    console.error(err)
  }
}

  function editMortality(m) {
    setEditingMortalityId(m.id)
    setMortalityForm({
      date: m.date || today,
      deaths: Number(m.deaths || 0),
      reason: m.reason || ""
    })
    !isReadOnly && setShowMortalityForm(true)
  }

  function cancelMortalityForm() {
    setShowMortalityForm(false)
    setEditingMortalityId(null)
    setMortalityForm(blankMortalityForm)
  }

  async function deleteMortality(id) {
    if (!window.confirm("Delete this mortality record? Bird count will be adjusted back.")) return
    await window.api.deleteMortalityLog(id)
    loadData()
  }

  const blankExpenseForm = { date: today, expense_type: "Maintenance", amount: "", notes: "" }

  async function saveBatchExpense() {
    try {
      if (!batchExpenseForm.amount || Number(batchExpenseForm.amount) <= 0) return

      if (editingExpenseId) {
        await window.api.updateBatchExpense(editingExpenseId, batchExpenseForm)
      } else {
        await window.api.insertBatchExpense({
          batch_id: batchId,
          ...batchExpenseForm
        })
      }

      setShowExpenseForm(false)
      setEditingExpenseId(null)
      setBatchExpenseForm(blankExpenseForm)

      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  function editBatchExpense(ex) {
    setEditingExpenseId(ex.id)
    setBatchExpenseForm({
      date: ex.date || today,
      expense_type: ex.expense_type || "Maintenance",
      amount: ex.amount ?? "",
      notes: ex.notes || ""
    })
    !isReadOnly && setShowExpenseForm(true)
  }

  function cancelExpenseForm() {
    setShowExpenseForm(false)
    setEditingExpenseId(null)
    setBatchExpenseForm(blankExpenseForm)
  }

  async function deleteBatchExpense(id) {
    if (isReadOnly || !window.confirm("Delete this expense record?")) return
    await window.api.deleteBatchExpense(id)
    loadData()
  }


  useEffect(() => {
    loadData()
  }, [batchId])

  useEffect(() => {
    if (batch) {
      setClosureForm(f => ({
        ...f,
        birds_sold: Number(batch.current_count || 0)
      }))
    }
  }, [batch])

  const renderAddBatchModalMarkup = () => {
    if (!showAddBatchModal) return null;
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.4)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 99999
        }}
        onClick={() => setShowAddBatchModal(false)}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: 24,
            width: "100%",
            maxWidth: "480px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            boxSizing: "border-box"
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
              fontSize: 14,
              fontWeight: 600
            }}
          >
            <span>Add New Batch Flock</span>
            <button
              style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#3d3d3d" }}
              onClick={() => setShowAddBatchModal(false)}
            >
              &times;
            </button>
          </div>

          <form onSubmit={handleCreateBatch} autoComplete="off">
            <div style={{ marginBottom: 12 }}>
              <label style={label}>Batch ID *</label>
              <input
                type="text"
                name="batch_id"
                id="add-batch-batch_id"
                autoComplete="off"
                placeholder="e.g. BATCH-2026-A"
                required
                value={addBatchForm.batch_id}
                style={inp}
                onChange={(e) => { const v = e.target.value; setAddBatchForm(f => ({ ...f, batch_id: v })) }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={label}>Shed Allocation</label>
                <input
                  type="text"
                  name="shed_allocation"
                  id="add-batch-shed"
                  autoComplete="off"
                  placeholder="e.g. Shed B"
                  value={addBatchForm.shed}
                  style={inp}
                  onChange={(e) => { const v = e.target.value; setAddBatchForm(f => ({ ...f, shed: v })) }}
                />
              </div>
              <div>
                <label style={label}>Breed</label>
                <input
                  type="text"
                  name="breed"
                  id="add-batch-breed"
                  autoComplete="off"
                  placeholder="e.g. BV 300"
                  value={addBatchForm.breed}
                  style={inp}
                  onChange={(e) => { const v = e.target.value; setAddBatchForm(f => ({ ...f, breed: v })) }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={label}>Placement Date</label>
                <input
                  type="date"
                  name="start_date"
                  id="add-batch-start_date"
                  autoComplete="off"
                  value={addBatchForm.start_date}
                  style={inp}
                  onChange={(e) => { const v = e.target.value; setAddBatchForm(f => ({ ...f, start_date: v })) }}
                />
              </div>
              <div>
                <label style={label}>Initial Age (Weeks.Days)</label>
                <input
                  type="text"
                  name="initial_age"
                  id="add-batch-initial_age"
                  autoComplete="off"
                  placeholder="e.g. 0.0 or 24.3"
                  value={addBatchForm.initial_age}
                  style={inp}
                  onChange={(e) => { const v = e.target.value; setAddBatchForm(f => ({ ...f, initial_age: v })) }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={label}>Number of Birds</label>
                <input
                  type="number"
                  name="start_count"
                  id="add-batch-start_count"
                  autoComplete="off"
                  onWheel={(e) => e.target.blur()}
                  min="0"
                  placeholder="e.g. 2000"
                  value={addBatchForm.start_count}
                  style={inp}
                  onChange={(e) => { const v = e.target.value; setAddBatchForm(f => ({ ...f, start_count: v })) }}
                />
              </div>
              <div>
                <label style={label}>Free Chicks</label>
                <input
                  type="number"
                  name="free_chicks"
                  id="add-batch-free_chicks"
                  autoComplete="off"
                  onWheel={(e) => e.target.blur()}
                  min="0"
                  placeholder="e.g. 50"
                  value={addBatchForm.free_chicks}
                  style={inp}
                  onChange={(e) => { const v = e.target.value; setAddBatchForm(f => ({ ...f, free_chicks: v })) }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={label}>Cost Per Chick (₹)</label>
                <input
                  type="number"
                  name="cost_per_chick"
                  id="add-batch-cost_per_chick"
                  autoComplete="off"
                  onWheel={(e) => e.target.blur()}
                  min="0"
                  step="0.01"
                  placeholder="e.g. 45.00"
                  value={addBatchForm.cost_per_chick}
                  style={inp}
                  onChange={(e) => { const v = e.target.value; setAddBatchForm(f => ({ ...f, cost_per_chick: v })) }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                style={btn("#e5e7eb", "#333")}
                onClick={() => setShowAddBatchModal(false)}
              >
                Cancel
              </button>
              <button type="submit" style={btn("#0F6E56")}>
                Save Batch
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={card}>
        Loading batch...
        {renderAddBatchModalMarkup()}
      </div>
    )
  }

  if (!batch) {
    return (
      <div style={{ ...card, textAlign: "center", padding: "40px 20px" }}>
        <p style={{ color: "#666", marginBottom: 16, fontSize: 14 }}>No active batch selection found.</p>
        <button
          style={btn("#10b981")}
          onClick={() => !isReadOnly && setShowAddBatchModal(true)}
        >
          + Create New Batch Flock
        </button>
        {renderAddBatchModalMarkup()}
      </div>
    )
  }

  const currentBirds =
    Number(batch.current_count || 0)

  const startBirds =
    Number(batch.start_count || 0) +
    Number(batch.free_chicks || 0)

  const totalDeaths =
    mortality.reduce(
      (s, m) => s + Number(m.deaths || 0),
      0
    )

  const totalEggsProduced =
    production.reduce((sum, p) => {
      return (
        sum +
        (
          Number(p.pullet_trays || 0) +
          Number(p.medium_trays || 0) +
          Number(p.export_trays || 0) +
          Number(p.correct_size_trays || 0) +
          Number(p.large_trays || 0) +
          Number(p.double_yolk_eggs || 0)   // double yolk trays × 30 added to total
        ) * 30
      )
    }, 0)

  const totalEggsSold =
    sales.reduce((s, sale) => {
      const mainEggs = sale.unit_type === "TRAY"
        ? Number(sale.quantity || 0) * 30
        : Number(sale.quantity || 0)
      return s + mainEggs
    }, 0)

  // Broken eggs sorted out during sales — tracked separately from
  // totalEggsSold so it doesn't skew the average revenue-per-egg figure.
  const totalEggsBroken =
    sales.reduce((s, sale) => {
      const brokenEggs = sale.unit_type === "TRAY"
        ? Number(sale.broken_qty || 0) * 30
        : Number(sale.broken_qty || 0)
      return s + brokenEggs
    }, 0)

  const totalEggsInStock =
    totalEggsProduced - totalEggsSold - totalEggsBroken

  const totalEggsInStockTrays =
    totalEggsInStock / 30

  const totalSalesRevenue =
    sales.reduce(
      (s, sale) => s + Number(sale.amount || 0),
      0
    )

  const totalFeedConsumed =
    feedIntake.reduce(
      (s, f) => s + Number(f.qty_kg || 0),
      0
    )

  const totalFeedArrived =
    feedBalance.reduce(
      (s, f) => s + Number(f.allocated || 0),
      0
    )

  const totalFeedBalance =
    feedBalance.reduce(
      (s, f) => s + Number(f.remaining || 0),
      0
    )

  const layRatePercent =
    currentBirds > 0
      ? (totalEggsProduced /
          (currentBirds * production.length)) * 100
      : 0

  const feedConsumedPerBird =
    currentBirds > 0
      ? totalFeedConsumed / currentBirds
      : 0

  const totalRevenue =
    Number(profit?.revenue || 0)

  const totalExpenses =
    Number(profit?.expenses || 0)

  const netProfit =
    Number(profit?.net_profit || 0)

  const tabs = [
    {
      key: "overview",
      label: "Overview"
    },
    {
      key: "production",
      label: "Egg Production"
    },
    {
      key: "sales",
      label: "Egg Sales"
    },
    {
      key: "feed",
      label: "Feed"
    },
    {
      key: "medication",
      label: "Medication"
    },
    {
      key: "mortality",
      label: "Mortality"
    },
    {
      key: "finance",
      label: "Finance"
    }
  ]

  return (
    <div>
      <style>{`
        table th {
          font-size: 14px !important;
          padding: 8px 10px !important;
          font-weight: 600 !important;
        }
        table td {
          font-size: 13px !important;
          padding: 8px 9px !important;
        }
      `}</style>
      {/* Header */}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700
              }}
            >
              Batch {batch.batch_id}
            </div>
          </div>

          <div
            style={{
              color: "#777",
              fontSize: 13,
              marginTop: 4,
              display: "flex",
              alignItems: "center",
              gap: 8
            }}
          >
            {batch.breed} • Started {batch.start_date}

            <button
              style={{
                ...btn("#e5e7eb", "#333"),
                padding: "2px 8px",
                fontSize: 11
              }}
              onClick={() => {
                setBreedInput(batch.breed || "")
                setShowBreedForm(!showBreedForm)
              }}
            >
              Edit Breed
            </button>

            <button
              style={{
                ...btn("#e5e7eb", "#333"),
                padding: "2px 8px",
                fontSize: 11
              }}
              onClick={() => {
                setAgeInput(convertDaysToWeeksString(batch.initial_age_days || 0))
                setShowAgeForm(!showAgeForm)
              }}
            >
              Edit Age at Start
            </button>

            <button
              style={{
                ...btn("#e5e7eb", "#333"),
                padding: "2px 8px",
                fontSize: 11
              }}
              onClick={() => {
                setCostInput(batch.cost_per_chick || "")
                setShowCostForm(!showCostForm)
              }}
            >
              Edit Cost / Chick
            </button>

            <button
              style={{
                ...btn("#e5e7eb", "#333"),
                padding: "2px 8px",
                fontSize: 11
              }}
              onClick={() => {
                setFreeChickInput(batch.free_chicks || "")
                setShowFreeChickForm(!showFreeChickForm)
              }}
            >
              Edit Free Chicks
            </button>
          </div>

          {showBreedForm && (
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 10,
                alignItems: "center"
              }}
            >
              <input
                value={breedInput}
                style={{
                  ...inp,
                  width: 200
                }}
                onChange={e =>
                  setBreedInput(e.target.value)
                }
              />

              <button
                style={btn("#0F6E56")}
                onClick={saveBreed}
              >
                Save
              </button>
            </div>
          )}

          {showAgeForm && (
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 10,
                alignItems: "center"
              }}
            >
              <input
                value={ageInput}
                placeholder="e.g. 24.3"
                style={{
                  ...inp,
                  width: 200
                }}
                onChange={e =>
                  setAgeInput(e.target.value)
                }
              />

              <button
                style={btn("#0F6E56")}
                onClick={saveInitialAge}
              >
                Save Age
              </button>
            </div>
          )}

          {showCostForm && (
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 10,
                alignItems: "center"
              }}
            >
              <input
                type="number"
                onWheel={(e) => e.target.blur()}
                value={costInput}
                placeholder="Bird Cost (₹)"
                style={{
                  ...inp,
                  width: 200
                }}
                onChange={e =>
                  setCostInput(e.target.value)
                }
              />

              <button
                style={btn("#0F6E56")}
                onClick={saveCostPerChick}
              >
                Save Cost
              </button>
            </div>
          )}

          {showFreeChickForm && (
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 10,
                alignItems: "center"
              }}
            >
              <input
                type="number"
                onWheel={(e) => e.target.blur()}
                min="0"
                value={freeChickInput}
                placeholder="Free Chicks (qty)"
                style={{
                  ...inp,
                  width: 200
                }}
                onChange={e =>
                  setFreeChickInput(e.target.value)
                }
              />

              <button
                style={btn("#0F6E56")}
                onClick={saveFreeChicks}
              >
                Save Free Chicks
              </button>
            </div>
          )}
        </div>

        <div>
          <span
            style={{
              background:
                batch.status === "Closed"
                  ? "#FCEBEB"
                  : "#E1F5EE",
              color:
                batch.status === "Closed"
                  ? "#A32D2D"
                  : "#0F6E56",
              padding: "6px 12px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600
            }}
          >
            {batch.status}
          </span>
        </div>
      </div>

      {/* KPI Cards */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(8,1fr)",
          gap: 12,
          marginBottom: 20
        }}
      >
        <div style={card}>
          <div style={label}>Current Birds</div>
          <h2 style={kpiValue}>{currentBirds.toLocaleString()}</h2>
        </div>

        <div style={card}>
          <div style={label}>Total Eggs</div>
          <h2 style={kpiValue}>
            {totalEggsInStock.toLocaleString()}
          </h2>
          <div style={kpiSub}>
            {totalEggsInStockTrays.toFixed(1)} trays
          </div>
        </div>

        <div style={card}>
          <div style={label}>Lay Rate</div>
          <h2 style={kpiValue}>
            {layRatePercent.toFixed(1)}%
          </h2>
        </div>

        <div style={card}>
          <div style={label}>Age of Bird</div>
          <h2 style={kpiValue}>
            {calculateCurrentAge(batch.start_date, batch.initial_age_days)}
          </h2>
        </div>

        <div style={card}>
          <div style={label}>Feed Balance</div>
          <h2 style={kpiValue}>
            {totalFeedBalance.toLocaleString()} kg
          </h2>
        </div>

        <div style={card}>
          <div style={label}>Feed/Bird</div>
          <h2 style={kpiValue}>
            {feedConsumedPerBird.toFixed(2)} kg
          </h2>
        </div>

        <div style={card}>
          <div style={label}>Revenue</div>
          <h2 style={kpiValue}>
            ₹{totalRevenue.toLocaleString()}
          </h2>
        </div>

        <div style={card}>
          <div style={label}>Net Profit</div>
          <h2 style={kpiValue}>
            ₹{netProfit.toLocaleString()}
          </h2>
        </div>
      </div>

      {/* Tabs */}

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 20
        }}
      >
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              ...btn(
                tab === t.key
                  ? "#0F6E56"
                  : "#e5e7eb",
                tab === t.key
                  ? "#fff"
                  : "#333"
              )
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}

      {tab === "overview" && (
        <div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 20
            }}
          >
            <div style={card}>
              <h3>Batch Information</h3>

              <table
                style={{
                  width: "100%"
                }}
              >
                <tbody>

                  <tr>
                    <td style={td}>Batch ID</td>
                    <td style={td}>{batch.batch_id}</td>
                  </tr>

                  <tr>
                    <td style={td}>Breed</td>
                    <td style={td}>{batch.breed}</td>
                  </tr>

                  <tr>
                    <td style={td}>Start Date</td>
                    <td style={td}>{batch.start_date}</td>
                  </tr>

                  <tr>
                    <td style={td}>Starting Birds</td>
                    <td style={td}>{startBirds}</td>
                  </tr>

                  <tr>
                    <td style={td}>Current Birds</td>
                    <td style={td}>{currentBirds}</td>
                  </tr>

                  <tr>
                    <td style={td}>Chick Unit Cost</td>
                    <td style={td}>₹{Number(batch.cost_per_chick || 0).toFixed(2)}</td>
                  </tr>

                  <tr>
                    <td style={td}>Total Chick Capital</td>
                    <td style={td}>₹{Number((batch.start_count || 0) * (batch.cost_per_chick || 0)).toLocaleString()}</td>
                  </tr>

                  <tr>
                    <td style={td}>Status</td>
                    <td style={td}>{batch.status}</td>
                  </tr>

                </tbody>
              </table>
            </div>

            <div style={card}>
              <h3>Finance Snapshot</h3>

              <table
                style={{
                  width: "100%"
                }}
              >
                <tbody>

                  <tr>
                    <td style={td}>Revenue</td>
                    <td style={td}>
                      ₹{totalRevenue.toLocaleString()}
                    </td>
                  </tr>

                  <tr>
                    <td style={td}>Expenses (Incl. Chicks)</td>
                    <td style={td}>
                      ₹{totalExpenses.toLocaleString()}
                    </td>
                  </tr>

                  <tr>
                    <td style={td}>Net Profit</td>
                    <td style={td}>
                      ₹{netProfit.toLocaleString()}
                    </td>
                  </tr>

                  {closure && (
                    <tr>
                      <td style={td}>Bird Sale Revenue</td>
                      <td style={td}>
                        ₹
                        {Number(
                          closure.bird_sale_amount || 0
                        ).toLocaleString()}
                      </td>
                    </tr>
                  )}

                </tbody>
              </table>
            </div>

          </div>

          <div style={card}>
            <h3>Feed Summary</h3>

            <table
              style={{
                width: "100%"
              }}
            >
              <thead>
                <tr>
                  <th>Feed Type</th>
                  <th>Arrived (kg)</th>
                  <th>Consumed (kg)</th>
                  <th>Balance (kg)</th>
                </tr>
              </thead>

              <tbody>

                {feedBalance.map((f, i) => (
                  <tr key={i}>
                    <td style={td}>{f.feed_type}</td>
                    <td style={td}>
                      {Number(f.allocated || 0).toLocaleString()}
                    </td>
                    <td style={td}>
                      {Number(f.consumed || 0).toLocaleString()}
                    </td>
                    <td style={td}>
                      <strong>
                        {Number(f.remaining || 0).toLocaleString()}
                      </strong>
                    </td>
                  </tr>
                ))}

              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* EGG PRODUCTION */}

      {tab === "production" && (
        <div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              alignItems: "center",
              gap: 12,
              marginBottom: 16
            }}
          >
            {/* month nav — left */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={goPrevProductionMonth} aria-label="Previous month"
                style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#475569" }}>
                ‹
              </button>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <span style={{
                  fontSize: 13, fontWeight: 700, color: "#1e293b",
                  border: "1px solid #ddd", borderRadius: 6, padding: "5px 12px",
                  background: "#fff", minWidth: 130, textAlign: "center",
                }}>
                  {productionMonthLabel}
                </span>
                <input type="month" value={productionMonthInputValue} onChange={handleProductionMonthInputChange}
                  title="Jump to month"
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
              </div>
              <button onClick={goNextProductionMonth} aria-label="Next month"
                style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#475569" }}>
                ›
              </button>
            </div>

            {/* heading — center */}
            <h3 style={{ textAlign: "center", margin: 0 }}>Egg Production</h3>

            {/* page nav + add button — right */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, justifySelf: "end" }}>
              <PageNav page={productionSafePage} setPage={setProductionPage} totalPages={productionTotalPages} />
              <button
                onClick={() =>
                  showProductionForm
                    ? cancelProductionForm()
                    : !isReadOnly && setShowProductionForm(true)
                }
                style={btn(showProductionForm ? "#e5e7eb" : "#0F6E56", showProductionForm ? "#333" : "#fff")}
              >
                {showProductionForm ? "Cancel" : "+ Add Production"}
              </button>
            </div>
          </div>

          {showProductionForm && (
            <div
              style={{
                ...card,
                marginBottom: 20
              }}
            >
              <h4>
                {editingProductionId ? "Edit Production Entry" : "Production Entry"}
              </h4>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(3,1fr)",
                  gap: 10
                }}
              >

                <div>
                  <label style={label}>Date</label>
                  <input
                    type="date"
                    value={productionForm.date}
                    onChange={e =>
                      setProductionForm({
                        ...productionForm,
                        date: e.target.value
                      })
                    }
                    style={inp}
                  />
                </div>

                <div>
                  <label style={label}>Pullet Trays</label>
                  <input
                    type="number"
                    onWheel={(e) => e.target.blur()}
                    placeholder="e.g. 10"
                    value={productionForm.pullet_trays}
                    style={inp}
                    onChange={e =>
                      setProductionForm({
                        ...productionForm,
                        pullet_trays:
                          Number(
                            e.target.value
                          )
                      })
                    }
                  />
                </div>

                <div>
                  <label style={label}>Medium Trays</label>
                  <input
                    type="number"
                    onWheel={(e) => e.target.blur()}
                    placeholder="e.g. 50"
                    value={productionForm.medium_trays}
                    style={inp}
                    onChange={e =>
                      setProductionForm({
                        ...productionForm,
                        medium_trays:
                          Number(
                            e.target.value
                          )
                      })
                    }
                  />
                </div>

                <div>
                  <label style={label}>Export Trays</label>
                  <input
                    type="number"
                    onWheel={(e) => e.target.blur()}
                    placeholder="e.g. 20"
                    value={productionForm.export_trays}
                    style={inp}
                    onChange={e =>
                      setProductionForm({
                        ...productionForm,
                        export_trays:
                          Number(
                            e.target.value
                          )
                      })
                    }
                  />
                </div>

                <div>
                  <label style={label}>Correct Size Trays</label>
                  <input
                    type="number"
                    onWheel={(e) => e.target.blur()}
                    placeholder="e.g. 30"
                    value={productionForm.correct_size_trays}
                    style={inp}
                    onChange={e =>
                      setProductionForm({
                        ...productionForm,
                        correct_size_trays:
                          Number(
                            e.target.value
                          )
                      })
                    }
                  />
                </div>

                <div>
                  <label style={label}>Large Trays</label>
                  <input
                    type="number"
                    onWheel={(e) => e.target.blur()}
                    placeholder="e.g. 5"
                    value={productionForm.large_trays}
                    style={inp}
                    onChange={e =>
                      setProductionForm({
                        ...productionForm,
                        large_trays:
                          Number(
                            e.target.value
                          )
                      })
                    }
                  />
                </div>

                <div>
                  <label style={label}>Double Yolk (trays)</label>
                  <input
                    type="number"
                    onWheel={(e) => e.target.blur()}
                    step="0.5"
                    placeholder="e.g. 0.5"
                    value={productionForm.double_yolk_eggs}
                    style={inp}
                    onChange={e =>
                      setProductionForm({
                        ...productionForm,
                        double_yolk_eggs:
                          Number(
                            e.target.value
                          )
                      })
                    }
                  />
                </div>

              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 15 }}>
                <button
                  style={btn("#0F6E56")}
                  onClick={saveProduction}
                >
                  {editingProductionId ? "Update Production" : "Save Production"}
                </button>
                <button
                  style={btn("#e5e7eb", "#333")}
                  onClick={cancelProductionForm}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div style={card}>
            <table
              style={{
                width: "100%"
              }}
            >
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Total Trays</th>
                  <th>Double Yolk (trays)</th>
                  <th>Total Eggs</th>
                  <th>Lay Rate %</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>

                {productionPageRows.map(p => {

                  const trays =
                    Number(
                      p.pullet_trays || 0
                    ) +
                    Number(
                      p.medium_trays || 0
                    ) +
                    Number(
                      p.export_trays || 0
                    ) +
                    Number(
                      p.correct_size_trays || 0
                    ) +
                    Number(
                      p.large_trays || 0
                    )

                  const eggsThisEntry =
                    (trays + Number(p.double_yolk_eggs || 0)) * 30

                  const layRateThisEntry =
                    currentBirds > 0
                      ? (eggsThisEntry / currentBirds) * 100
                      : 0

                  return (
                    <tr key={p.id}>
                      <td style={td}>{fmtDate(p.date)}</td>
                      <td style={td}>{trays}</td>
                      <td style={td}>
                        {p.double_yolk_eggs}
                      </td>
                      <td style={td}>
                        {eggsThisEntry.toLocaleString()}
                      </td>
                      <td style={td}>
                        {layRateThisEntry.toFixed(1)}%
                      </td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => editProduction(p)} style={{ ...btn("#eef2ff", "#1d4ed8"), padding: "3px 10px", fontSize: 11 }}>Edit</button>
                          <button onClick={() => deleteProduction(p.id)} style={{ ...btn("#FCEBEB", "#A32D2D"), padding: "3px 10px", fontSize: 11 }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <PageNav page={productionSafePage} setPage={setProductionPage} totalPages={productionTotalPages} />
            </div>
          </div>

          <div
            style={{
              ...card,
              marginTop: 20
            }}
          >
            <h3>
              Lay Rate Summary
            </h3>

            <p>
              Total Eggs Produced:
              {" "}
              <strong>
                {totalEggsProduced.toLocaleString()}
              </strong>
            </p>

            <p>
              Current Birds:
              {" "}
              <strong>
                {currentBirds}
              </strong>
            </p>

            <p>
              Overall Lay Rate:
              {" "}
              <strong>
                {layRatePercent.toFixed(1)}%
              </strong>
            </p>
          </div>

        </div>
      )}
      {/* EGG SALES */}

      {tab === "sales" && (
        <div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              alignItems: "center",
              gap: 12,
              marginBottom: 16
            }}
          >
            {/* month nav — left */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={goPrevSalesMonth} aria-label="Previous month"
                style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#475569" }}>
                ‹
              </button>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <span style={{
                  fontSize: 13, fontWeight: 700, color: "#1e293b",
                  border: "1px solid #ddd", borderRadius: 6, padding: "5px 12px",
                  background: "#fff", minWidth: 130, textAlign: "center",
                }}>
                  {salesMonthLabel}
                </span>
                <input type="month" value={salesMonthInputValue} onChange={handleSalesMonthInputChange}
                  title="Jump to month"
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
              </div>
              <button onClick={goNextSalesMonth} aria-label="Next month"
                style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#475569" }}>
                ›
              </button>
            </div>

            {/* heading — center */}
            <h3 style={{ textAlign: "center", margin: 0 }}>Egg Sales</h3>

            {/* page nav + add button — right */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, justifySelf: "end" }}>
              <PageNav page={salesSafePage} setPage={setSalesPage} totalPages={salesTotalPages} />
              <button
                onClick={() =>
                  showSalesForm ? cancelSalesForm() : !isReadOnly && setShowSalesForm(true)
                }
                style={btn("#0F6E56")}
              >
                {showSalesForm ? "Cancel" : "+ Add Sale"}
              </button>
            </div>
          </div>

          {showSalesForm && (
            <div
              style={{
                ...card,
                marginBottom: 20
              }}
            >
              <h4>{editingSaleId ? "Edit Sale" : "Sale Entry"}</h4>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3,1fr)",
                  gap: 10
                }}
              >

                <input
                  type="date"
                  value={salesForm.date}
                  style={inp}
                  onChange={e =>
                    setSalesForm({
                      ...salesForm,
                      date: e.target.value
                    })
                  }
                />

                <select
                  value={salesForm.grade}
                  style={inp}
                  onChange={e =>
                  setSalesForm({
                    ...salesForm,
                    grade: e.target.value
                })
                }
                >
                <option value="" disabled>Select Grade</option>
  <option value="Pullet">Pullet</option>
  <option value="Small">Small</option>
  <option value="Export">Export</option>
  <option value="Correct">Correct</option>
  <option value="Large">Large</option>
  <option value="Doubles">Doubles</option>
</select>

                <select
                  value={salesForm.unit_type}
                  style={inp}
                  onChange={e =>
                    setSalesForm({
                      ...salesForm,
                      unit_type: e.target.value
                    })
                  }
                >
                  <option value="TRAY">Trays (30 eggs)</option>
                  <option value="PIECE">Pieces (eggs)</option>
                </select>

                <input
                  type="number"
                  onWheel={(e) => e.target.blur()}
                  step="1"
                  min="0"
                  placeholder={
                    salesForm.unit_type === "TRAY"
                      ? "Quantity (Whole Trays)"
                      : "Quantity (eggs)"
                  }
                  value={salesForm.quantity}
                  style={inp}
                  onChange={e =>
                    setSalesForm({
                      ...salesForm,
                      quantity: e.target.value
                    })
                  }
                />

                <input
                  type="number"
                  onWheel={(e) => e.target.blur()}
                  step="1"
                  min="0"
                  placeholder={
                    salesForm.unit_type === "TRAY"
                      ? "Broken (Trays)"
                      : "Broken (eggs)"
                  }
                  value={salesForm.broken_qty}
                  style={inp}
                  onChange={e =>
                    setSalesForm({
                      ...salesForm,
                      broken_qty: e.target.value
                    })
                  }
                />

                <input
                  type="number"
                  onWheel={(e) => e.target.blur()}
                  placeholder="Rate Per Egg (₹)"
                  value={salesForm.rate_per_egg}
                  style={inp}
                  onChange={e =>
                    setSalesForm({
                      ...salesForm,
                      rate_per_egg: e.target.value
                    })
                  }
                />

                <select
                  value={salesForm.trader_id}
                  style={inp}
                  onChange={e =>
                    setSalesForm({
                      ...salesForm,
                      trader_id: e.target.value
                    })
                  }
                >
                  <option value="">No Trader</option>
                  {traders.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>

              </div>

              {/* Notes below trader */}
              <div style={{ marginTop: 10 }}>
                <input
                  placeholder="Notes (optional)"
                  value={salesForm.notes}
                  style={inp}
                  onChange={e =>
                    setSalesForm({
                      ...salesForm,
                      notes: e.target.value
                    })
                  }
                />
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 15 }}>
                <button
                  style={btn("#0F6E56")}
                  onClick={saveEggSale}
                >
                  {editingSaleId ? "Update Sale" : "Save Sale"}
                </button>
                <button
                  style={btn("#e5e7eb", "#333")}
                  onClick={cancelSalesForm}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div style={card}>
            <table
              style={{
                width: "100%"
              }}
            >
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Grade</th>
                  <th>Quantity</th>
                  <th>Unit</th>
                  <th>Broken</th>
                  <th>Rate/Egg</th>
                  <th>Amount</th>
                  <th>Trader</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>

                {salesPageRows.map(s => (
                  <tr key={s.id}>
                    <td style={td}>{fmtDate(s.date)}</td>
                    <td style={td}>{s.grade}</td>
                    <td style={td}>{s.quantity}</td>
                    <td style={td}>
                      {s.unit_type === "TRAY" ? "Trays" : "Pieces"}
                    </td>
                    <td style={{ ...td, color: Number(s.broken_qty || 0) > 0 ? "#B91C1C" : "#aaa" }}>
                      {Number(s.broken_qty || 0) > 0 ? s.broken_qty : "—"}
                    </td>
                    <td style={td}>
                      ₹{s.rate_per_egg}
                    </td>
                    <td style={td}>
                      ₹
                      {Number(
                        s.amount || 0
                      ).toLocaleString()}
                    </td>
                    <td style={td}>
                      {s.trader_name || "-"}
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => editEggSale(s)} style={{ ...btn("#eef2ff", "#1d4ed8"), padding: "3px 10px", fontSize: 11 }}>Edit</button>
                        <button onClick={() => deleteEggSale(s.id)} style={{ ...btn("#FCEBEB", "#A32D2D"), padding: "3px 10px", fontSize: 11 }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}

              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <PageNav page={salesSafePage} setPage={setSalesPage} totalPages={salesTotalPages} />
            </div>
          </div>

          <div
            style={{
              ...card,
              marginTop: 20
            }}
          >
            <h3>Sales Summary</h3>

            <p>
              Total Eggs Sold:
              {" "}
              <strong>
                {totalEggsSold.toLocaleString()}
              </strong>
            </p>

            <p>
              Total Sales Revenue:
              {" "}
              <strong>
                ₹{totalSalesRevenue.toLocaleString()}
              </strong>
            </p>

            <p>
              Average Rate Per Egg:
              {" "}
              <strong>
                ₹
                {(
                  totalEggsSold > 0
                    ? totalSalesRevenue / totalEggsSold
                    : 0
                ).toFixed(2)}
              </strong>
            </p>
          </div>

        </div>
      )}

      {/* FEED */}

      {tab === "feed" && (
        <div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 16 }}>

            {/* Feed Arrival card */}
            <div style={card}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: showFeedArrivalForm ? 12 : 16
                }}
              >
                {/* month nav — left */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={goPrevFeedArrivalMonth} aria-label="Previous month"
                    style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#475569" }}>
                    ‹
                  </button>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <span style={{
                      fontSize: 13, fontWeight: 700, color: "#1e293b",
                      border: "1px solid #ddd", borderRadius: 6, padding: "5px 12px",
                      background: "#fff", minWidth: 130, textAlign: "center",
                    }}>
                      {feedArrivalMonthLabel}
                    </span>
                    <input type="month" value={feedArrivalMonthInputValue} onChange={handleFeedArrivalMonthInputChange}
                      title="Jump to month"
                      style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
                  </div>
                  <button onClick={goNextFeedArrivalMonth} aria-label="Next month"
                    style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#475569" }}>
                    ›
                  </button>
                </div>

                {/* heading — center */}
                <span style={{ ...sectionTitle, textAlign: "center", marginBottom: 0 }}>Feed Arrivals Log ({feedStockList.length})</span>

                {/* add button + page nav — right */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, justifySelf: "end" }}>
                  <button
                    style={btn("#1d4ed8")}
                    onClick={() => showFeedArrivalForm ? cancelFeedArrivalForm() : !isReadOnly && setShowFeedArrivalForm(true)}
                  >
                    {showFeedArrivalForm ? "Cancel" : "+ Feed Arrival"}
                  </button>
                  <PageNav page={feedArrivalSafePage} setPage={setFeedArrivalPage} totalPages={feedArrivalTotalPages} />
                </div>
              </div>

              {showFeedArrivalForm && (
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#1d4ed8", marginBottom: 8 }}>
                    {editingFeedArrivalId ? "Edit Feed Arrival" : "New Feed Arrival"}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div>
                      <label style={label}>Date</label>
                      <input
                        type="date"
                        value={feedArrivalForm.date}
                        style={inp}
                        onChange={e =>
                          setFeedArrivalForm({
                            ...feedArrivalForm,
                            date: e.target.value
                          })
                        }
                      />
                    </div>
                    <div>
                      <label style={label}>Feed type</label>
                      {(!useCustomArrivalFeedType && feedTypeOptions.length > 0) ? (
                        <select
                          value={feedTypeOptions.includes(feedArrivalForm.feed_type) ? feedArrivalForm.feed_type : ""}
                          style={inp}
                          onChange={e => {
                            if (e.target.value === "__add_new__") {
                              setUseCustomArrivalFeedType(true)
                              setFeedArrivalForm({ ...feedArrivalForm, feed_type: "" })
                            } else {
                              setFeedArrivalForm({ ...feedArrivalForm, feed_type: e.target.value })
                            }
                          }}
                        >
                          <option value="" disabled>
                            {feedTypeOptions.length
                              ? "Select feed type"
                              : "No feed types yet — add one below"}
                          </option>
                          {feedTypeOptions.map(ft => (
                            <option key={ft} value={ft}>{ft}</option>
                          ))}
                          <option value="__add_new__">+ Add new feed type…</option>
                        </select>
                      ) : (
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            placeholder="e.g. Layer mash"
                            value={feedArrivalForm.feed_type}
                            style={inp}
                            onChange={e =>
                              setFeedArrivalForm({
                                ...feedArrivalForm,
                                feed_type: e.target.value
                              })
                            }
                          />
                          {feedTypeOptions.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setUseCustomArrivalFeedType(false)
                                setFeedArrivalForm({ ...feedArrivalForm, feed_type: "" })
                              }}
                              style={{ ...btn("#e5e7eb", "#333"), whiteSpace: "nowrap" }}
                            >
                              Choose existing
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div>
                      <label style={label}>Qty arrived (kg)</label>
                      <input
                        type="number"
                        onWheel={(e) => e.target.blur()}
                        min="0"
                        placeholder="e.g. 500"
                        value={feedArrivalForm.qty_kg}
                        style={inp}
                        onChange={e =>
                          setFeedArrivalForm({
                            ...feedArrivalForm,
                            qty_kg: e.target.value
                          })
                        }
                      />
                    </div>
                    <div>
                      <label style={label}>Rate per kg (₹)</label>
                      <input
                        type="number"
                        onWheel={(e) => e.target.blur()}
                        min="0"
                        step="0.01"
                        placeholder="e.g. 28.50"
                        value={feedArrivalForm.rate_per_kg}
                        style={inp}
                        onChange={e =>
                          setFeedArrivalForm({
                            ...feedArrivalForm,
                            rate_per_kg: e.target.value
                          })
                        }
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <label style={label}>Select Feed Supplier Trader</label>
                    <select 
                      value={feedArrivalForm.trader_id} 
                      onChange={e => setFeedArrivalForm({ ...feedArrivalForm, trader_id: e.target.value })} 
                      style={inp}
                    >
                      <option value="">Choose Supplier...</option>
                      {traders.filter(t => !t.types || t.types.includes("Feed Supplier") || t.types === "").map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <label style={label}>Notes</label>
                    <input
                      placeholder="Optional"
                      value={feedArrivalForm.notes}
                      style={inp}
                      onChange={e =>
                        setFeedArrivalForm({
                          ...feedArrivalForm,
                          notes: e.target.value
                        })
                      }
                    />
                  </div>

                  {Number(feedArrivalForm.qty_kg) > 0 && (
                    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "6px 12px", marginBottom: 10, fontSize: 12, color: "#1d4ed8" }}>
                      Total cost:{" "}
                      <strong>
                        ₹{(Number(feedArrivalForm.qty_kg) * Number(feedArrivalForm.rate_per_kg || 0)).toLocaleString()}
                      </strong>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={btn("#1d4ed8")} onClick={saveFeedArrival}>
                      {editingFeedArrivalId ? "Update Arrival" : "Save Arrival"}
                    </button>
                    <button style={btn("#e5e7eb", "#333")} onClick={cancelFeedArrivalForm}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {feedStockList.length === 0
                ? <p style={{ color: "#aaa", fontSize: 13 }}>No feed arrivals logged yet.</p>
                : <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Date", "Type", "Qty (kg)", "Rate/kg", "Total", "Supplier", ""].map(h => <th key={h} style={th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {feedArrivalPageRows.map(f => (
                        <tr key={f.id}>
                          <td style={td}>{fmtDate(f.date)}</td>
                          <td style={td}>{f.feed_type}</td>
                          <td style={td}>{Number(f.qty_kg || 0).toLocaleString()}</td>
                          <td style={td}>{f.rate_per_kg ? `₹${f.rate_per_kg}` : "—"}</td>
                          <td style={td}>
                            {f.rate_per_kg
                              ? <strong>₹{(Number(f.qty_kg || 0) * Number(f.rate_per_kg || 0)).toLocaleString()}</strong>
                              : "—"}
                          </td>
                          <td style={td}><strong>{f.trader_name || "—"}</strong></td>
                          <td style={td}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => editFeedArrival(f)} style={{ ...btn("#eef2ff", "#1d4ed8"), padding: "3px 10px", fontSize: 11 }}>Edit</button>
                              <button onClick={() => window.api.deleteFeedAllocation(f.id).then(loadData)} style={{ ...btn("#FCEBEB", "#A32D2D"), padding: "3px 10px", fontSize: 11 }}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              }
              {feedStockList.length > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                  <PageNav page={feedArrivalSafePage} setPage={setFeedArrivalPage} totalPages={feedArrivalTotalPages} />
                </div>
              )}
            </div>

            {/* Feed Consumption card */}
            <div style={card}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: showFeedForm ? 12 : 16
                }}
              >
                {/* month nav — left */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={goPrevFeedIntakeMonth} aria-label="Previous month"
                    style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#475569" }}>
                    ‹
                  </button>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <span style={{
                      fontSize: 13, fontWeight: 700, color: "#1e293b",
                      border: "1px solid #ddd", borderRadius: 6, padding: "5px 12px",
                      background: "#fff", minWidth: 130, textAlign: "center",
                    }}>
                      {feedIntakeMonthLabel}
                    </span>
                    <input type="month" value={feedIntakeMonthInputValue} onChange={handleFeedIntakeMonthInputChange}
                      title="Jump to month"
                      style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
                  </div>
                  <button onClick={goNextFeedIntakeMonth} aria-label="Next month"
                    style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#475569" }}>
                    ›
                  </button>
                </div>

                {/* heading — center */}
                <span style={{ ...sectionTitle, textAlign: "center", marginBottom: 0 }}>Feed Consumption ({feedIntake.length})</span>

                {/* add button + page nav — right */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, justifySelf: "end" }}>
                  <button
                    style={btn("#0F6E56")}
                    onClick={() => showFeedForm ? cancelFeedForm() : !isReadOnly && setShowFeedForm(true)}
                  >
                    {showFeedForm ? "Cancel" : "+ Add Feed"}
                  </button>
                  <PageNav page={feedIntakeSafePage} setPage={setFeedIntakePage} totalPages={feedIntakeTotalPages} />
                </div>
              </div>

              {showFeedForm && (
                <div style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 8, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#0F6E56", marginBottom: 8 }}>
                    {editingFeedIntakeId ? "Edit Feed Consumption" : "New Feed Consumption"}
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={label}>Date</label>
                    <input
                      type="date"
                      value={feedForm.date}
                      style={inp}
                      onChange={e =>
                        setFeedForm({
                          ...feedForm,
                          date: e.target.value
                        })
                      }
                    />
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <label style={label}>Feed type</label>
                    {!useCustomFeedType ? (
                      <select
                        value={feedTypeOptions.includes(feedForm.feed_type) ? feedForm.feed_type : ""}
                        style={inp}
                        onChange={e => {
                          if (e.target.value === "__add_new__") {
                            setUseCustomFeedType(true)
                            setFeedForm({ ...feedForm, feed_type: "" })
                          } else {
                            setFeedForm({ ...feedForm, feed_type: e.target.value })
                          }
                        }}
                      >
                        <option value="" disabled>
                          {feedTypeOptions.length
                            ? "Select feed type"
                            : "No feed types yet — add one below"}
                        </option>
                        {feedTypeOptions.map(ft => (
                          <option key={ft} value={ft}>{ft}</option>
                        ))}
                        <option value="__add_new__">+ Add new feed type…</option>
                      </select>
                    ) : (
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          placeholder="e.g. Layer mash"
                          value={feedForm.feed_type}
                          style={inp}
                          onChange={e =>
                            setFeedForm({
                              ...feedForm,
                              feed_type: e.target.value
                            })
                          }
                        />
                        {feedTypeOptions.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setUseCustomFeedType(false)
                              setFeedForm({ ...feedForm, feed_type: "" })
                            }}
                            style={{ ...btn("#e5e7eb", "#333"), whiteSpace: "nowrap" }}
                          >
                            Choose existing
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <label style={label}>Quantity consumed (kg)</label>
                    <input
                      type="number"
                      onWheel={(e) => e.target.blur()}
                      placeholder="Quantity (kg)"
                      value={feedForm.qty_kg}
                      style={inp}
                      onChange={e =>
                        setFeedForm({
                          ...feedForm,
                          qty_kg: Number(e.target.value)
                        })
                      }
                    />
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={btn("#0F6E56")} onClick={saveFeedConsumption}>
                      {editingFeedIntakeId ? "Update Feed" : "Save Feed"}
                    </button>
                    <button style={btn("#e5e7eb", "#333")} onClick={cancelFeedForm}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {feedIntake.length === 0
                ? <p style={{ color: "#aaa", fontSize: 13 }}>No feed consumption logged yet.</p>
                : <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Date", "Feed Type", "Qty (kg)", "Feed/Bird (kg)", ""].map(h => <th key={h} style={th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {feedIntakePageRows.map(f => {
                        const feedPerBirdThisEntry =
                          currentBirds > 0
                            ? Number(f.qty_kg || 0) / currentBirds
                            : 0
                        return (
                          <tr key={f.id}>
                            <td style={td}>{fmtDate(f.date)}</td>
                            <td style={td}>{f.feed_type}</td>
                            <td style={td}>{f.qty_kg}</td>
                            <td style={td}>{feedPerBirdThisEntry.toFixed(3)}</td>
                            <td style={td}>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => editFeedConsumption(f)} style={{ ...btn("#eef2ff", "#1d4ed8"), padding: "3px 10px", fontSize: 11 }}>Edit</button>
                                <button onClick={() => deleteFeedConsumption(f.id)} style={{ ...btn("#FCEBEB", "#A32D2D"), padding: "3px 10px", fontSize: 11 }}>Delete</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
              }
              {feedIntake.length > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                  <PageNav page={feedIntakeSafePage} setPage={setFeedIntakePage} totalPages={feedIntakeTotalPages} />
                </div>
              )}
            </div>
          </div>

          {/* Feed Stock Balance summary */}
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={sectionTitle}>Feed Stock (Arrived / Consumed / Balance)</div>

            {feedBalance.length === 0
              ? <p style={{ color: "#aaa", fontSize: 13 }}>No feed stock recorded yet.</p>
              : <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Feed Type", "Arrived (kg)", "Consumed (kg)", "Balance (kg)", "Feed/Bird (kg)"].map(h => <th key={h} style={th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {feedBalance.map((f, i) => (
                      <tr key={i}>
                        <td style={td}>{f.feed_type}</td>
                        <td style={td}>{Number(f.allocated || 0).toLocaleString()}</td>
                        <td style={td}>{Number(f.consumed || 0).toLocaleString()}</td>
                        <td style={td}><strong>{Number(f.remaining || 0).toLocaleString()}</strong></td>
                        <td style={td}>
                          {currentBirds > 0 ? (Number(f.consumed || 0) / currentBirds).toFixed(3) : "—"}
                        </td>
                      </tr>
                    ))}

                    {feedBalance.length > 0 && (
                      <tr style={{ borderTop: "2px solid #eee" }}>
                        <td style={td}><strong>Total</strong></td>
                        <td style={td}>
                          <strong>
                            {feedBalance.reduce((s, f) => s + Number(f.allocated || 0), 0).toLocaleString()}
                          </strong>
                        </td>
                        <td style={td}>
                          <strong>
                            {feedBalance.reduce((s, f) => s + Number(f.consumed || 0), 0).toLocaleString()}
                          </strong>
                        </td>
                        <td style={td}>
                          <strong>
                            {feedBalance.reduce((s, f) => s + Number(f.remaining || 0), 0).toLocaleString()}
                          </strong>
                        </td>
                        <td style={td}>
                          <strong>
                            {currentBirds > 0
                              ? (feedBalance.reduce((s, f) => s + Number(f.consumed || 0), 0) / currentBirds).toFixed(3)
                              : "—"}
                          </strong>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
            }
          </div>

          {/* Feed Efficiency Summary */}
          <div style={card}>
            <div style={sectionTitle}>Feed Efficiency Summary</div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: "#3d3d3d", marginBottom: 4 }}>Total Feed Arrived</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{totalFeedArrived.toLocaleString()} kg</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#3d3d3d", marginBottom: 4 }}>Total Feed Consumed</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{totalFeedConsumed.toLocaleString()} kg</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#3d3d3d", marginBottom: 4 }}>Feed Balance</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{totalFeedBalance.toLocaleString()} kg</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#3d3d3d", marginBottom: 4 }}>Current Birds</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{currentBirds.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#3d3d3d", marginBottom: 4 }}>Feed / Bird</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{feedConsumedPerBird.toFixed(3)} kg</div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* MEDICATION */}

      {tab === "medication" && (
        <div>

          <div style={card}>
            <div
  style={{
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "center",
    gap: 12,
    marginBottom: 15
  }}
>
  {/* month nav — left */}
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <button onClick={goPrevMedicationMonth} aria-label="Previous month"
      style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#475569" }}>
      ‹
    </button>
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <span style={{
        fontSize: 13, fontWeight: 700, color: "#1e293b",
        border: "1px solid #ddd", borderRadius: 6, padding: "5px 12px",
        background: "#fff", minWidth: 130, textAlign: "center",
      }}>
        {medicationMonthLabel}
      </span>
      <input type="month" value={medicationMonthInputValue} onChange={handleMedicationMonthInputChange}
        title="Jump to month"
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
    </div>
    <button onClick={goNextMedicationMonth} aria-label="Next month"
      style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#475569" }}>
      ›
    </button>
  </div>

  {/* heading — center */}
  <h3 style={{ textAlign: "center", margin: 0 }}>Medication History</h3>

  {/* page nav + add button — right */}
  <div style={{ display: "flex", alignItems: "center", gap: 10, justifySelf: "end" }}>
    <PageNav page={medicationSafePage} setPage={setMedicationPage} totalPages={medicationTotalPages} />
    <button
      style={btn("#0F6E56")}
      onClick={() =>
        showMedicationForm ? cancelMedicationForm() : !isReadOnly && setShowMedicationForm(true)
      }
    >
      {showMedicationForm ? "Cancel" : "+ Add Medication"}
    </button>
  </div>
</div>

{showMedicationForm && (
  <div
    style={{
      background: "#f8fafc",
      border: "1px solid #e2e8f0",
      borderRadius: 8,
      padding: 14,
      marginBottom: 20
    }}
  >
    <div style={{ fontSize: 12, fontWeight: 600, color: "#0F6E56", marginBottom: 10 }}>
      {editingMedicationId ? "Edit Medication / Vaccine Record" : "New Medication Bill"}
    </div>

    {/* Bill-level fields: Date + Supplier + Tax% (shared by every medicine line below) */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px", gap: 10, marginBottom: 10 }}>
      <div>
        <label style={label}>Date</label>
        <input
          type="date"
          value={medicationForm.date}
          style={inp}
          onChange={e => setMedicationForm({ ...medicationForm, date: e.target.value })}
        />
      </div>
      <div>
        <label style={label}>Supplier</label>
        <select
          value={medicationForm.trader_id}
          style={inp}
          onChange={e => setMedicationForm({ ...medicationForm, trader_id: e.target.value })}
        >
          <option value="">Choose Supplier...</option>
          {traders.filter(t => !t.types || t.types.includes("Medicine Supplier") || t.types === "").map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label style={label}>Tax %</label>
        <input
          type="number"
          onWheel={(e) => e.target.blur()}
          min="0"
          step="0.01"
          placeholder="e.g. 5"
          value={medicationForm.tax_pct}
          style={inp}
          onChange={e => setMedicationForm({ ...medicationForm, tax_pct: e.target.value })}
        />
      </div>
    </div>

    <div style={{ marginBottom: 14 }}>
      <label style={label}>Particulars</label>
      <input
        placeholder="e.g. Respiratory support, Shed 2 (for your own reference)"
        value={medicationForm.particulars}
        style={inp}
        onChange={e => setMedicationForm({ ...medicationForm, particulars: e.target.value })}
      />
    </div>

    {medicationForm.lines.map((line, idx) => {
      const lineCost = medLineCost(line)
      return (
        <div key={idx} style={{
          border: "1px solid #e2e8f0",
          borderRadius: 6,
          padding: 12,
          marginBottom: 12,
          background: "#fff"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 0.5 }}>
              MEDICINE {idx + 1}
            </div>
            {medicationForm.lines.length > 1 && (
              <button
                onClick={() => removeMedLine(idx)}
                style={{ ...btn("#FCEBEB", "#A32D2D"), padding: "2px 8px", fontSize: 11 }}
              >
                Remove
              </button>
            )}
          </div>

          {/* Row: Medicine Name + Type */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={label}>Medicine / Vaccine Name</label>
              <input
                placeholder="e.g. Tylosin, ND Lasota"
                value={line.medicine_name}
                style={inp}
                onChange={e => updateMedLine(idx, { medicine_name: e.target.value })}
              />
            </div>
            <div>
              <label style={label}>Medication Type</label>
              <select
                value={line.type}
                style={inp}
                onChange={e => updateMedLine(idx, { type: e.target.value })}
              >
                <option value="Vaccine">Vaccine</option>
                <option value="Support Medicine">Support Medicine</option>
              </select>
            </div>
          </div>

          {/* Reason (only meaningful for support medicine — vaccines don't need one) */}
          {line.type === "Vaccine" ? (
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "6px 12px", marginBottom: 10, fontSize: 12, color: "#1d4ed8" }}>
              💉 Logged as a routine <strong>Vaccine</strong> — no reason needed.
            </div>
          ) : (
            <div style={{ marginBottom: 10 }}>
              <label style={label}>Reason for medicine *</label>
              <input
                placeholder="e.g. Respiratory infection, CRD outbreak, deworming"
                value={line.reason}
                style={inp}
                onChange={e => updateMedLine(idx, { reason: e.target.value })}
              />
            </div>
          )}

          {/* Route + Administered by */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={label}>Route</label>
              <select
                value={line.route}
                style={inp}
                onChange={e => updateMedLine(idx, { route: e.target.value })}
              >
                <option>Drinking water</option>
                <option>Injection</option>
                <option>Eye drop</option>
                <option>Spray</option>
                <option>Feed mix</option>
              </select>
            </div>
            <div>
              <label style={label}>Administered by</label>
              <input
                list="administered-by-options"
                placeholder="Select existing or type a new name"
                value={line.administered_by}
                style={inp}
                onChange={e => updateMedLine(idx, { administered_by: e.target.value })}
              />
              <datalist id="administered-by-options">
                {administeredByOptions.map(name => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: "1px dashed #cbd5e1", margin: "10px 0 10px", fontSize: 11, color: "#64748b", fontWeight: 600, letterSpacing: 0.5 }}>
            PURCHASE DETAILS
          </div>

          {/* Form Type + No. of Packs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={label}>Form Type</label>
              <select
                value={line.form_type}
                style={inp}
                onChange={e => {
                  const ft = e.target.value
                  const unit = (ft === "Liquid" || ft === "Drops") ? "mL" : ft === "Vile" ? "dose" : "kg"
                  updateMedLine(idx, { form_type: ft, qty_unit: unit })
                }}
              >
                <option value="Powder">Powder</option>
                <option value="Liquid">Liquid</option>
                <option value="Vile">Vile (Injection)</option>
                <option value="Drops">Drops</option>
              </select>
            </div>
            <div>
              <label style={label}>No. of Packs</label>
              <input
                type="number"
                onWheel={(e) => e.target.blur()}
                min="0"
                step="1"
                placeholder="e.g. 20"
                value={line.num_packs}
                style={inp}
                onChange={e => updateMedLine(idx, { num_packs: e.target.value })}
              />
            </div>
          </div>

          {/* Pack Size + Unit + Price per Pack */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={label}>Pack Size (quantity per pack)</label>
              <input
                type="number"
                onWheel={(e) => e.target.blur()}
                min="0"
                step="0.001"
                placeholder="e.g. 1000"
                value={line.qty_per_pack}
                style={inp}
                onChange={e => updateMedLine(idx, { qty_per_pack: e.target.value })}
              />
            </div>
            <div>
              <label style={label}>Unit</label>
              <select
                value={line.qty_unit}
                style={inp}
                onChange={e => updateMedLine(idx, { qty_unit: e.target.value })}
              >
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="L">L</option>
                <option value="mL">mL</option>
                <option value="vile">vile</option>
                <option value="dose">dose</option>
              </select>
            </div>
            <div>
              <label style={label}>Price per Pack (₹)</label>
              <input
                type="number"
                onWheel={(e) => e.target.blur()}
                min="0"
                step="0.01"
                placeholder="e.g. 185.71"
                value={line.price_per_pack}
                style={inp}
                onChange={e => updateMedLine(idx, { price_per_pack: e.target.value })}
              />
            </div>
          </div>

          {/* Per-line cost (pre-tax) */}
          {lineCost > 0 && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "7px 12px", fontSize: 12, color: "#166534" }}>
              💰 Line total: <strong>₹{lineCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              {" "}({line.num_packs || 0} packs × ₹{line.price_per_pack || 0})
              {Number(line.qty_per_pack) > 0 && (
                <> &nbsp;·&nbsp; Total bought: <strong>{(Number(line.num_packs || 0) * Number(line.qty_per_pack)).toFixed(3)} {line.qty_unit}</strong></>
              )}
            </div>
          )}
        </div>
      )
    })}

    {!editingMedicationId && (
      <button
        onClick={addMedLine}
        style={{ ...btn("#eef2ff", "#1d4ed8"), marginBottom: 14 }}
      >
        + Add another medicine
      </button>
    )}

    {/* Bill summary — subtotal, tax, rounded grand total across all lines */}
    {(() => {
      const subtotal = medicationForm.lines.reduce((s, l) => s + medLineCost(l), 0)
      const taxPct = Number(medicationForm.tax_pct || 0)
      const taxAmt = subtotal * taxPct / 100
      const exactTotal = subtotal + taxAmt
      const grandTotal = Math.round(exactTotal)
      if (subtotal <= 0) return null
      return (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#78350f" }}>
          Subtotal: <strong>₹{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          {taxPct > 0 && <> &nbsp;·&nbsp; Tax ({taxPct}%): <strong>₹{taxAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></>}
          {" "}&nbsp;·&nbsp; Grand Total: <strong>₹{grandTotal.toLocaleString()}</strong>
        </div>
      )
    })()}

    <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
      <button
        style={btn("#0F6E56")}
        onClick={saveMedication}
      >
        {editingMedicationId ? "Update Medication" : `Save All ${medicationForm.lines.length > 1 ? medicationForm.lines.length : ""}`}
      </button>
      <button
        style={btn("#e5e7eb", "#333")}
        onClick={cancelMedicationForm}
      >
        Cancel
      </button>
    </div>

  </div>
)}

            <table
              style={{
                width: "100%",
                borderCollapse: "collapse"
              }}
            >
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Type</th>
                  <th style={th}>Medicine</th>
                  <th style={th}>Reason</th>
                  <th style={th}>Route</th>
                  <th style={th}>Administered By</th>
                  <th style={th}>Form</th>
                  <th style={th}>Packs</th>
                  <th style={th}>Pack Size</th>
                  <th style={th}>Particulars</th>
                  <th style={th}>Supplier</th>
                  <th style={th}></th>
                </tr>
              </thead>

              <tbody>

                {medicationPageRows.map(m => {
                  const np = Number(m.num_packs || 0)
                  const qpp = Number(m.qty_per_pack || 0)
                  const hasPackData = np > 0 || qpp > 0
                  const formType = m.form_type || "Powder"
                  const packUnit = m.qty_unit || (formType === "Vile" ? "dose" : formType === "Liquid" || formType === "Drops" ? "mL" : "kg")
                  return (
                    <tr key={m.id}>
                      <td style={td}>{fmtDate(m.date)}</td>
                      <td style={td}>
                        <span style={{
                          background: m.type === "Vaccine" ? "#dbeafe" : "#dcfce7",
                          color: m.type === "Vaccine" ? "#1d4ed8" : "#15803d",
                          borderRadius: 4,
                          padding: "2px 7px",
                          fontSize: 11,
                          fontWeight: 600
                        }}>
                          {m.type || "Support Medicine"}
                        </span>
                      </td>
                      <td style={{ ...td, fontWeight: 500 }}>{m.medicine || "—"}</td>
                      <td style={{ ...td, color: m.notes ? "#3d3d3d" : "#aaa" }}>
                        {m.type === "Vaccine" ? (m.notes || "Vaccine") : (m.notes || "—")}
                      </td>
                      <td style={td}>{m.route || "—"}</td>
                      <td style={td}>{m.administered_by || "—"}</td>
                      {hasPackData ? (
                        <>
                          <td style={td}>{formType}</td>
                          <td style={td}>{np > 0 ? np : "—"}</td>
                          <td style={td}>{qpp > 0 ? `${qpp} ${packUnit}` : "—"}</td>
                        </>
                      ) : (
                        <>
                          <td style={{ ...td, color: "#3d3d3d" }}>—</td>
                          <td style={{ ...td, color: "#3d3d3d" }}>—</td>
                          <td style={{ ...td, fontSize: 11, color: "#3d3d3d" }}>{m.dose || "—"}</td>
                        </>
                      )}
                      <td style={{ ...td, color: m.particulars ? "#3d3d3d" : "#aaa" }}>{m.particulars || "—"}</td>
                      <td style={td}>{m.trader_name || "—"}</td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => editMedication(m)}
                            style={{ ...btn("#eef2ff", "#1d4ed8"), padding: "3px 10px", fontSize: 11 }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => window.api.deleteMedication(m.id).then(loadData)}
                            style={{ ...btn("#FCEBEB", "#A32D2D"), padding: "3px 10px", fontSize: 11 }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <PageNav page={medicationSafePage} setPage={setMedicationPage} totalPages={medicationTotalPages} />
            </div>
          </div>

        </div>
      )}

      {/* MORTALITY */}

      {tab === "mortality" && (
        <div>

          <div style={card}>
            <div
  style={{
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "center",
    gap: 12,
    marginBottom: 15
  }}
>
  {/* month nav — left */}
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <button onClick={goPrevMortalityMonth} aria-label="Previous month"
      style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#475569" }}>
      ‹
    </button>
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <span style={{
        fontSize: 13, fontWeight: 700, color: "#1e293b",
        border: "1px solid #ddd", borderRadius: 6, padding: "5px 12px",
        background: "#fff", minWidth: 130, textAlign: "center",
      }}>
        {mortalityMonthLabel}
      </span>
      <input type="month" value={mortalityMonthInputValue} onChange={handleMortalityMonthInputChange}
        title="Jump to month"
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
    </div>
    <button onClick={goNextMortalityMonth} aria-label="Next month"
      style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#475569" }}>
      ›
    </button>
  </div>

  {/* heading — center */}
  <h3 style={{ textAlign: "center", margin: 0 }}>Mortality Records</h3>

  {/* page nav + add button — right */}
  <div style={{ display: "flex", alignItems: "center", gap: 10, justifySelf: "end" }}>
    <PageNav page={mortalitySafePage} setPage={setMortalityPage} totalPages={mortalityTotalPages} />
    <button
      style={btn("#A32D2D")}
      onClick={() =>
        showMortalityForm ? cancelMortalityForm() : !isReadOnly && setShowMortalityForm(true)
      }
    >
      {showMortalityForm ? "Cancel" : "+ Add Mortality"}
    </button>
  </div>
</div>

{showMortalityForm && (
  <div
    style={{
      ...card,
      marginBottom: 20
    }}
  >
    <div style={{ fontSize: 12, fontWeight: 600, color: "#A32D2D", marginBottom: 10 }}>
      {editingMortalityId ? "Edit Mortality Record" : "New Mortality Record"}
    </div>

    <input
      type="date"
      value={mortalityForm.date}
      style={inp}
      onChange={e =>
        setMortalityForm({
          ...mortalityForm,
          date: e.target.value
        })
      }
    />

    <input
      type="number"
      onWheel={(e) => e.target.blur()}
      placeholder="Deaths"
      value={mortalityForm.deaths}
      style={{
        ...inp,
        marginTop: 10
      }}
      onChange={e =>
        setMortalityForm({
          ...mortalityForm,
          deaths:
            Number(e.target.value)
        })
      }
    />

    <input
      placeholder="Reason"
      value={mortalityForm.reason}
      style={{
        ...inp,
        marginTop: 10
      }}
      onChange={e =>
        setMortalityForm({
          ...mortalityForm,
          reason: e.target.value
        })
      }
    />

    <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
      <button
        style={btn("#A32D2D")}
        onClick={saveMortality}
      >
        {editingMortalityId ? "Update Mortality" : "Save Mortality"}
      </button>
      <button
        style={btn("#e5e7eb", "#333")}
        onClick={cancelMortalityForm}
      >
        Cancel
      </button>
    </div>
  </div>
)}

            <table
              style={{
                width: "100%"
              }}
            >
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Deaths</th>
                  <th>Reason</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>

                {mortalityPageRows.map(m => (
                  <tr key={m.id}>
                    <td style={td}>{fmtDate(m.date)}</td>
                    <td style={td}>{m.deaths}</td>
                    <td style={td}>
                      {m.reason || "-"}
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => editMortality(m)} style={{ ...btn("#eef2ff", "#1d4ed8"), padding: "3px 10px", fontSize: 11 }}>Edit</button>
                        <button onClick={() => deleteMortality(m.id)} style={{ ...btn("#FCEBEB", "#A32D2D"), padding: "3px 10px", fontSize: 11 }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}

              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <PageNav page={mortalitySafePage} setPage={setMortalityPage} totalPages={mortalityTotalPages} />
            </div>
          </div>

          <div
            style={{
              ...card,
              marginTop: 20
            }}
          >
            <h3>
              Mortality Summary
            </h3>

            <p>
              Starting Birds:
              {" "}
              <strong>
                {startBirds}
              </strong>
            </p>

            <p>
              Total Deaths:
              {" "}
              <strong>
                {totalDeaths}
              </strong>
            </p>

            <p>
              Current Birds:
              {" "}
              <strong>
                {currentBirds}
              </strong>
            </p>
          </div>

        </div>
      )}
      {/* FINANCE */}

      {tab === "finance" && (
        <div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 12,
              marginBottom: 20
            }}
          >
            <div style={card}>
              <div>Total Revenue</div>
              <h2>
                ₹{totalRevenue.toLocaleString()}
              </h2>
            </div>

            <div style={card}>
              <div>Total Expenses</div>
              <h2>
                ₹{totalExpenses.toLocaleString()}
              </h2>
            </div>

            <div style={card}>
              <div>Net Profit</div>
              <h2>
                ₹{netProfit.toLocaleString()}
              </h2>
            </div>

            <div style={card}>
              <div>Current Birds</div>
              <h2>
                {currentBirds.toLocaleString()}
              </h2>
            </div>
          </div>

          <div style={card}>
            <h3>
              Batch Financial Summary
            </h3>

            {batch.status !== "Closed" && (

  <div
    style={{
      ...card,
      marginBottom: 20
    }}
  >
    <h3>Close Batch</h3>

    <input
      type="date"
      value={closureForm.closure_date}
      style={inp}
      onChange={e =>
        setClosureForm({
          ...closureForm,
          closure_date:
            e.target.value
        })
      }
    />

    <input
      type="number"
      onWheel={(e) => e.target.blur()}
      placeholder="Birds Sold"
      value={closureForm.birds_sold}
      style={{
        ...inp,
        marginTop: 10
      }}
      onChange={e =>
        setClosureForm({
          ...closureForm,
          birds_sold:
            Number(e.target.value)
        })
      }
    />

    <input
      type="number"
      onWheel={(e) => e.target.blur()}
      placeholder="Price Per Bird"
      value={closureForm.price_per_bird}
      style={{
        ...inp,
        marginTop: 10
      }}
      onChange={e =>
        setClosureForm({
          ...closureForm,
          price_per_bird:
            Number(e.target.value)
        })
      }
    />

    <button
      style={{
        ...btn("#A32D2D"),
        marginTop: 10
      }}
      onClick={closeBatchNow}
    >
      Close Batch
    </button>

  </div>

)}

            <table
              style={{
                width: "100%"
              }}
            >
              <tbody>

                <tr>
                  <td style={td}>
                    <strong>Chick Capital Cost (Birds × Cost/Chick)</strong>
                  </td>
                  <td style={td}>
                    <strong>
                      ₹
                      {Number(
                        profit?.chick_cost || 0
                      ).toLocaleString()}
                    </strong>
                  </td>
                </tr>

                <tr>
                  <td style={td}>
                    Feed Expenses
                  </td>
                  <td style={td}>
                    ₹
                    {Number(
                      profit?.feed_cost || 0
                    ).toLocaleString()}
                  </td>
                </tr>

                <tr>
                  <td style={td}>
                    Vaccine Expenses
                  </td>
                  <td style={td}>
                    ₹
                    {Number(
                      profit?.vaccine_cost || 0
                    ).toLocaleString()}
                  </td>
                </tr>

                <tr>
                  <td style={td}>
                    Medical Expenses
                  </td>
                  <td style={td}>
                    ₹
                    {Number(
                      profit?.medical_cost || 0
                    ).toLocaleString()}
                  </td>
                </tr>

                <tr>
                  <td style={td}>
                    Other Expenses
                  </td>
                  <td style={td}>
                    ₹
                    {Number(
                      profit?.other_expenses || 0
                    ).toLocaleString()}
                  </td>
                </tr>

                <tr style={{ borderTop: "2px solid #ccc" }}>
                  <td style={td}>
                    <strong>Total Cumulative Expenses</strong>
                  </td>
                  <td style={td}>
                    <strong>
                      ₹{totalExpenses.toLocaleString()}
                    </strong>
                  </td>
                </tr>

                <tr>
                  <td style={td}>
                    Egg Sales Revenue
                  </td>
                  <td style={td}>
                    ₹
                    {Number(
                      profit?.egg_sales || 0
                    ).toLocaleString()}
                  </td>
                </tr>

                {closure && (
                  <tr>
                    <td style={td}>
                      Bird Sale Revenue
                    </td>
                    <td style={td}>
                      ₹
                      {Number(
                        closure.bird_sale_amount || 0
                      ).toLocaleString()}
                    </td>
                  </tr>
                )}

                <tr style={{ borderTop: "2px solid #ccc" }}>
                  <td style={td}>
                    <strong>Net Profit / Loss</strong>
                  </td>
                  <td style={td}>
                    <strong style={{ color: netProfit >= 0 ? "#0F6E56" : "#A32D2D" }}>
                      ₹{netProfit.toLocaleString()}
                    </strong>
                  </td>
                </tr>

              </tbody>
            </table>
          </div>

          <div
            style={{
              ...card,
              marginTop: 20
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 15
              }}
            >
              <h3 style={{ margin: 0 }}>
                Other Expenses (Maintenance, Electricity, Labor, etc.)
              </h3>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  style={searchInp}
                  placeholder="e.g. jan 2026"
                  value={expenseSearch}
                  onChange={e => setExpenseSearch(e.target.value)}
                />
                <button
                  style={btn("#0F6E56")}
                  onClick={() =>
                    showExpenseForm ? cancelExpenseForm() : !isReadOnly && setShowExpenseForm(true)
                  }
                >
                  {showExpenseForm ? "Cancel" : "+ Add Expense"}
                </button>
              </div>
            </div>

            {showExpenseForm && (
              <div
                style={{
                  ...card,
                  marginBottom: 20
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: "#0F6E56", marginBottom: 10 }}>
                  {editingExpenseId ? "Edit Expense" : "New Expense"}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <input
                    type="date"
                    value={batchExpenseForm.date}
                    style={inp}
                    onChange={e =>
                      setBatchExpenseForm({
                        ...batchExpenseForm,
                        date: e.target.value
                      })
                    }
                  />

                  <select
                    value={batchExpenseForm.expense_type}
                    style={inp}
                    onChange={e =>
                      setBatchExpenseForm({
                        ...batchExpenseForm,
                        expense_type: e.target.value
                      })
                    }
                  >
                    <option value="Maintenance">Maintenance</option>
                    <option value="Electricity">Electricity</option>
                    <option value="Labor Salary">Labor Salary</option>
                    <option value="Water">Water</option>
                    <option value="Transport">Transport</option>
                    <option value="Repairs">Repairs</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <input
                  type="number"
                  onWheel={(e) => e.target.blur()}
                  placeholder="Amount (₹)"
                  value={batchExpenseForm.amount}
                  style={{
                    ...inp,
                    marginTop: 10
                  }}
                  onChange={e =>
                    setBatchExpenseForm({
                      ...batchExpenseForm,
                      amount: e.target.value
                    })
                  }
                />

                <textarea
                  placeholder="Notes (optional)"
                  value={batchExpenseForm.notes}
                  rows={2}
                  style={{
                    ...inp,
                    marginTop: 10,
                    resize: "vertical"
                  }}
                  onChange={e =>
                    setBatchExpenseForm({
                      ...batchExpenseForm,
                      notes: e.target.value
                    })
                  }
                />

                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button
                    style={btn("#0F6E56")}
                    onClick={saveBatchExpense}
                  >
                    {editingExpenseId ? "Update Expense" : "Save Expense"}
                  </button>
                  <button
                    style={btn("#e5e7eb", "#333")}
                    onClick={cancelExpenseForm}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <table style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {batchExpenses
                  .filter(ex => matchesMonth(ex.date, expenseSearch))
                  .map(ex => (
                    <tr key={ex.id}>
                      <td style={td}>{fmtDate(ex.date)}</td>
                      <td style={td}>{ex.expense_type || "Other"}</td>
                      <td style={td}>₹{Number(ex.amount || 0).toLocaleString()}</td>
                      <td style={td}>{ex.notes || "-"}</td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => editBatchExpense(ex)} style={{ ...btn("#eef2ff", "#1d4ed8"), padding: "3px 10px", fontSize: 11 }}>Edit</button>
                          <button onClick={() => deleteBatchExpense(ex.id)} style={{ ...btn("#FCEBEB", "#A32D2D"), padding: "3px 10px", fontSize: 11 }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}

                {batchExpenses.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ color: "#aaa", padding: "10px 0" }}>
                      No other expenses logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {closure && (
            <div
              style={{
                ...card,
                marginTop: 20
              }}
            >
              <h3>
                Batch Closure
              </h3>

              <table
                style={{
                  width: "100%"
                }}
              >
                <tbody>

                  <tr>
                    <td style={td}>
                      Closed Date
                    </td>
                    <td style={td}>
                      {closure.closure_date}
                    </td>
                  </tr>

                  <tr>
                    <td style={td}>
                      Birds Sold
                    </td>
                    <td style={td}>
                      {closure.birds_sold}
                    </td>
                  </tr>

                  <tr>
                    <td style={td}>
                      Price Per Bird
                    </td>
                    <td style={td}>
                      ₹{closure.price_per_bird}
                    </td>
                  </tr>

                  <tr>
                    <td style={td}>
                      Sale Revenue
                    </td>
                    <td style={td}>
                      ₹
                      {Number(
                        closure.bird_sale_amount || 0
                      ).toLocaleString()}
                    </td>
                  </tr>

                </tbody>
              </table>
            </div>  
          )}

        </div>
      )}
      
      {renderAddBatchModalMarkup()}

      {showWholeTrayWarning && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.4)", display: "flex",
            justifyContent: "center", alignItems: "center", zIndex: 99999
          }}
          onClick={() => setShowWholeTrayWarning(false)}
        >
          <div
            style={{ background: "#fff", borderRadius: 12, padding: 24, width: 360, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: "#1e293b" }}>
              ⚠ Whole Trays Only
            </div>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 20 }}>
              Egg sales must be entered in whole trays — fractional quantities (e.g. 0.5) are not allowed. Please correct the quantity field and try again.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowWholeTrayWarning(false)}
                style={{ background: "#1e293b", color: "#fff", border: "none", borderRadius: 7, padding: "9px 24px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}