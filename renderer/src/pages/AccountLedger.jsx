import { useState, useEffect } from "react"

const fmtDate = d => d ? d.split("-").reverse().join("-") : ""

const today = new Date().toISOString().split("T")[0]

const fmt = (n) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Builds the "qty x rate" detail suffix for sources that are priced per unit
// (feed per kg, eggs per egg, birds per bird, manure per kg, medicine per pack).
// Returns "" when the row doesn't carry those fields (e.g. old data, or a
// source that isn't priced this way), so it degrades gracefully.
const formatQtyRate = (r) => {
  switch (r.source) {
    case "egg_sale": {
      if (r.quantity == null || r.rate_per_egg == null) return ""
      const qty = Number(r.quantity) || 0
      const totalEggs = r.unit_type === "PIECE" ? qty : qty * 30
      if (!totalEggs) return ""
      return `${totalEggs.toLocaleString("en-IN")} eggs × ₹${fmt(r.rate_per_egg)}/egg`
    }
    case "feed": {
      if (r.qty_kg == null || r.rate_per_kg == null || !Number(r.qty_kg)) return ""
      return `${Number(r.qty_kg).toLocaleString("en-IN")} kg × ₹${fmt(r.rate_per_kg)}/kg`
    }
    case "bird_sale": {
      if (r.birds_sold == null || r.price_per_bird == null || !Number(r.birds_sold)) return ""
      return `${Number(r.birds_sold).toLocaleString("en-IN")} birds × ₹${fmt(r.price_per_bird)}/bird`
    }
    case "manure_sale": {
      if (r.qty_kg == null || r.rate_per_kg == null || !Number(r.qty_kg)) return ""
      if (Number(r.qty_kg) >= 1000 && Number(r.qty_kg) % 1000 === 0) {
        const tons = Number(r.qty_kg) / 1000
        const ratePerTon = Number(r.rate_per_kg) * 1000
        return `${tons.toLocaleString("en-IN")} ton × ₹${fmt(ratePerTon)}/ton`
      }
      return `${Number(r.qty_kg).toLocaleString("en-IN")} kg × ₹${fmt(r.rate_per_kg)}/kg`
    }
    case "medication": {
      if (!Number(r.num_packs) || r.price_per_pack == null) return ""
      const packWord = Number(r.num_packs) === 1 ? "pack" : "packs"
      return `${Number(r.num_packs).toLocaleString("en-IN")} ${packWord} × ₹${fmt(r.price_per_pack)}/pack`
    }
    default:
      return ""
  }
}

// Some backend entry types (e.g. bird sale closure, farm expense) build their own
// auto-generated particulars label (e.g. "Farm Expense – Labor Salary") and may return
// the user-typed description separately as r.notes / r.description / r.remarks instead
// of folding it into r.particulars. Merge whatever is available so the typed text isn't lost.
const displayParticulars = (r) => {
  const auto  = (r.particulars || "").trim()
  const extra = (r.notes || r.description || r.remarks || "").trim()
  let base = auto
  if (extra) {
    base = !auto
      ? extra
      : (auto.toLowerCase().includes(extra.toLowerCase()) ? auto : `${auto} — ${extra}`)
  }
  const detail = formatQtyRate(r)
  return detail ? `${base} · ${detail}` : base
}

// Groups same-day, same-batch entries belonging to one "bill" into a single row:
// - medication/vaccine lines merge with tax% applied + rounded to one Debit
// - egg_sale lines merge into one Credit (no tax)
// - feed lines merge into one Debit (no tax)
// Everything else (bird sale, manure sale, expenses, etc.) passes through unchanged —
// grouping never crosses batches, and never mixes different source types together.
const MED_FAMILY = new Set(["medication", "vaccine"])
function groupBillRows(rows) {
  const groups = {}
  const ordered = []
  rows.forEach(r => {
    const family = MED_FAMILY.has(r.source) ? "medication" : (r.source === "egg_sale" ? "sale" : (r.source === "feed" ? "feed" : null))
    if (!family) { ordered.push(r); return }
    const key = `${r.date}|${r.batch_id}|${family}`
    if (!groups[key]) {
      groups[key] = { isGroup: true, date: r.date, batch_id: r.batch_id, source: r.source, ref: r.id, lines: [], debit: 0, credit: 0, taxPct: Number(r.tax_pct || 0) }
      ordered.push(groups[key])
    }
    groups[key].lines.push(displayParticulars(r))
    groups[key].debit  += Number(r.debit  || 0)
    groups[key].credit += Number(r.credit || 0)
  })

  const finalRows = ordered.map(r => {
    if (!r.isGroup) return r
    let debit = r.debit, credit = r.credit
    if (r.debit > 0 && MED_FAMILY.has(r.source)) {
      const taxAmt = r.debit * r.taxPct / 100
      debit = Math.round(r.debit + taxAmt)
    }
    return {
      date: r.date, batch_id: r.batch_id, source: r.source, id: r.ref,
      particulars: r.lines.join("<br/>"),
      __rawParticulars: true,
      debit, credit
    }
  })

  // Blank out the date on rows that share the same date as the row before them
  let lastDate = null
  return finalRows.map(r => {
    const show = r.date !== lastDate
    lastDate = r.date
    return { ...r, __showDate: show }
  })
}

const SOURCE_LABELS = {
  egg_sale:      "Egg Sale",
  bird_sale:     "Bird Sale",
  manure_sale:   "Manure Sale",
  feed:          "Feed",
  medication:    "Medication",
  batch_expense: "Batch Expense",
  farm_expense:  "Farm Expense",
  chick_cost:    "Chick Purchase",
  farm_other_income: "Other Income",
  trader_payment: "Trader",
}

const SOURCE_COLORS = {
  egg_sale:      { bg: "#F0FDF4", text: "#166534" },
  bird_sale:     { bg: "#ECFDF5", text: "#065F46" },
  manure_sale:   { bg: "#FEF9C3", text: "#713F12" },
  feed:          { bg: "#FFF7ED", text: "#9A3412" },
  medication:    { bg: "#FEF3C7", text: "#92400E" },
  batch_expense: { bg: "#FFF1F2", text: "#9F1239" },
  farm_expense:  { bg: "#FDF4FF", text: "#7E22CE" },
  chick_cost:    { bg: "#F0F9FF", text: "#0C4A6E" },
  farm_other_income: { bg: "#ECFEFF", text: "#155E75" },
  trader_payment: { bg: "#F1F5F9", text: "#334155" },
}

const BATCH_ENTRY_TYPES = [
  { value: "feed",         label: "🌾 Feed",           side: "debit"  },
  { value: "medication",   label: "💊 Medication",     side: "debit"  },
  { value: "vaccine",      label: "💉 Vaccine",        side: "debit"  },
  { value: "expense",      label: "🔧 Other Expense",  side: "debit"  },
  { value: "egg_sale",     label: "🥚 Egg Sale",       side: "credit" },
  { value: "bird_sale",    label: "🐔 Bird Sale",      side: "credit" },
  { value: "manure_sale",  label: "💩 Manure Sale",    side: "credit" },
]
const FARM_ENTRY_TYPES = [
  { value: "farm_expense",        label: "🏚️ Farm Expense",        side: "debit"  },
  { value: "farm_manure_sale",    label: "💩 Manure Sale (Farm)",  side: "credit" },
  { value: "farm_other_income",   label: "💰 Other Income",        side: "credit" },
]
const EXPENSE_SUBTYPES      = ["Maintenance","Electricity","Labor Salary","Water","Transport","Repairs","Other"]
const FARM_EXPENSE_SUBTYPES = ["Maintenance","Electricity","Labor Salary","Water","Transport","Repairs","Equipment","Generator","Other"]
const OTHER_INCOME_SUBTYPES = ["Government Subsidy","Rent","Interest","Compost / Byproduct","Equipment Sale","Insurance Claim","Other"]

const blankForm = {
  date:            today,
  particulars:     "",
  scope:           "batch",   // "batch" | "farm"
  entry_type:      "",
  batch_id:        "",
  // feed
  feed_type:       "",
  qty_kg:          "",
  rate_per_kg:     "",
  // medication / vaccine
  medicine_name:   "",
  num_packs:       "",
  price_per_pack:  "",
  // expense subtype
  expense_subtype: "Maintenance",
  // other income subtype
  income_subtype:  "Government Subsidy",
  // egg sale
  egg_grade:       "Export",
  egg_qty:         "",
  egg_rate:        "",
  // bird sale
  birds_sold:      "",
  price_per_bird:  "",
  // manure sale
  manure_qty_kg:   "",
  manure_rate:     "",
  manure_unit:     "kg", // Added state indicator configuration
  manure_buyer:    "",
  // trader
  trader_id:       "",
  // computed
  debit:           "",
  credit:          "",
}

export default function AccountLedger({ isReadOnly = false }) {
  // ── data ────────────────────────────────────────────────────
  const [rows,    setRows]    = useState([])
  const [batches, setBatches] = useState([])
  const [traders, setTraders] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState("")
  const [success, setSuccess] = useState("")

  // ── filters ─────────────────────────────────────────────────
  const [search,      setSearch]      = useState("")
  const [filterBatch, setFilterBatch] = useState("")
  const [filterType,  setFilterType]  = useState("all")
  const [startDate,   setStartDate]   = useState("")
  const [endDate,     setEndDate]     = useState("")

  // ── month navigator + pagination ──────────────────────────────
  const PAGE_SIZE = 30
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() } // month: 0-11
  })
  const [page, setPage] = useState(1)

  const goPrevMonth = () => setViewDate(v => {
    let { year, month } = v
    month -= 1
    if (month < 0) { month = 11; year -= 1 }
    return { year, month }
  })
  const goNextMonth = () => setViewDate(v => {
    let { year, month } = v
    month += 1
    if (month > 11) { month = 0; year += 1 }
    return { year, month }
  })
  const monthLabel = new Date(viewDate.year, viewDate.month, 1)
    .toLocaleString("en-US", { month: "long", year: "numeric" })
  const monthInputValue = `${viewDate.year}-${String(viewDate.month + 1).padStart(2, "0")}`
  const handleMonthInputChange = (e) => {
    const val = e.target.value // "YYYY-MM"
    if (!val) return
    const [y, m] = val.split("-").map(Number)
    setViewDate({ year: y, month: m - 1 })
  }

  // ── entry form ───────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState(blankForm)
  const [editingEntry, setEditingEntry] = useState(null) // the ledger row currently being edited, or null when creating
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── print ────────────────────────────────────────────────────
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [printBatch,     setPrintBatch]     = useState("")   // "" = Total Farm (all batches)
  const [printFrom,      setPrintFrom]      = useState("")
  const [printTo,        setPrintTo]        = useState("")

  // ── egg sale validation ─────────────────────────────────────
  const [showWholeTrayWarning, setShowWholeTrayWarning] = useState(false)

  // ── load ─────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true)
    try {
      const [ledger, active, closed, fin, traderList] = await Promise.all([
        window.api.getAccountLedger({
          startDate: startDate || undefined,
          endDate:   endDate   || undefined,
          batchId:   filterBatch || undefined,
        }),
        window.api.getBatches(),
        window.api.getClosedBatches(),
        window.api.getGlobalFinanceSummary(),
        window.api.getTraders(),
      ])
      setRows(ledger || [])
      setBatches([...(active || []), ...(closed || [])])
      setSummary(fin || null)
      setTraders(traderList || [])
    } catch (e) {
      console.error("AccountLedger load error:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterBatch, startDate, endDate])

  // ── auto-calc helpers ────────────────────────────────────────
  const calcFeed = (qty, rate) =>
    (Number(qty || 0) * Number(rate || 0)).toFixed(2)

  const calcMed = (packs, ppp) =>
    (Number(packs || 0) * Number(ppp || 0)).toFixed(2)

  const calcEgg = (qty, rate) =>
    (Number(qty || 0) * 30 * Number(rate || 0)).toFixed(2)

  const calcBird = (birds, price) =>
    (Number(birds || 0) * Number(price || 0)).toFixed(2)

  // ── save ─────────────────────────────────────────────────────
  const handleSave = async () => {
    setError("")
    if (!form.date)       return setError("Date is required.")
    if (!form.entry_type) return setError("Select an entry type.")
    if (form.scope === "batch" && !form.batch_id)
      return setError("Select a batch.")

    setSaving(true)
    try {
      const et = form.entry_type

      if (et === "feed") {
        if (!form.feed_type) return setError("Feed type is required.")
        await window.api.insertFeedAllocation({
          batch_id:    form.batch_id,
          date:        form.date,
          feed_type:   form.feed_type,
          qty_kg:      Number(form.qty_kg || 0),
          rate_per_kg: Number(form.rate_per_kg || 0),
          trader_id:   form.trader_id ? Number(form.trader_id) : null,
          notes:       form.particulars,
        })
      }

      else if (et === "medication" || et === "vaccine") {
        await window.api.insertMedication({
          batch_id:        form.batch_id,
          date:            form.date,
          type:            et === "vaccine" ? "Vaccine" : "Support Medicine",
          medicine_name:   form.medicine_name || form.particulars,
          notes:           form.particulars,
          route:           "Drinking water",
          administered_by: "",
          trader_id:       form.trader_id ? Number(form.trader_id) : null,
          form_type:       "Powder",
          num_packs:       Number(form.num_packs || 1),
          qty_per_pack:    0,
          price_per_pack:  Number(form.price_per_pack || 0),
          dosage_per_bird: 0,
          birds_per_pack:  0,
          cost:            Number(form.debit || 0),
        })
      }

      else if (et === "expense") {
        if (!form.debit || Number(form.debit) <= 0)
          return setError("Enter an amount.")
        const payload = {
          batch_id:     form.batch_id,
          date:         form.date,
          expense_type: form.expense_subtype || "Other",
          amount:       Number(form.debit),
          notes:        form.particulars,
        }
        if (editingEntry && editingEntry.source === "batch_expense" && window.api.updateBatchExpense) {
          await window.api.updateBatchExpense(editingEntry.id, payload)
        } else {
          await window.api.insertBatchExpense(payload)
        }
      }

      else if (et === "farm_expense") {
        if (!form.debit || Number(form.debit) <= 0)
          return setError("Enter an amount.")
        const payload = {
          date:         form.date,
          expense_type: form.expense_subtype || "Other",
          amount:       Number(form.debit),
          notes:        form.particulars,
        }
        if (editingEntry && editingEntry.source === "farm_expense" && window.api.updateFarmExpense) {
          await window.api.updateFarmExpense(editingEntry.id, payload)
        } else {
          await window.api.insertFarmExpense(payload)
        }
      }

      else if (et === "egg_sale") {
        const eggQty = Number(form.egg_qty || 0)
        if (!Number.isInteger(eggQty)) {
          setSaving(false)
          setShowWholeTrayWarning(true)
          return
        }
        const payload = {
          batch_id:     form.batch_id,
          date:         form.date,
          grade:        form.egg_grade || "Export",
          quantity:     eggQty,
          // This form only edits grade / quantity / rate / trader — carry the
          // original unit type through untouched so a price-only correction
          // here doesn't flip Trays to Pieces (or vice versa) by accident.
          unit_type:    editingEntry?.unit_type || "TRAY",
          rate_per_egg: Number(form.egg_rate || 0),
          trader_id:    form.trader_id ? Number(form.trader_id) : null,
          notes:        form.particulars,
        }
        if (editingEntry && editingEntry.source === "egg_sale" && window.api.updateEggSale) {
          await window.api.updateEggSale(editingEntry.id, payload)
        } else {
          await window.api.insertEggSale(payload)
        }
      }

      else if (et === "bird_sale") {
        await window.api.closeBatch({
          batch_id:       form.batch_id,
          closure_date:   form.date,
          birds_sold:     Number(form.birds_sold || 0),
          price_per_bird: Number(form.price_per_bird || 0),
          notes:          form.particulars,
        })
      }

      else if (et === "manure_sale") {
        const isTon = form.manure_unit === "ton"
        const finalQty = isTon ? Number(form.manure_qty_kg || 0) * 1000 : Number(form.manure_qty_kg || 0)
        const finalRate = isTon ? Number(form.manure_rate || 0) / 1000 : Number(form.manure_rate || 0)
        const amt = Number(form.credit || 0)
        await window.api.insertManureSale({
          date:       form.date,
          batch_id:   form.batch_id || null,
          qty_kg:     finalQty,
          rate_per_kg:finalRate,
          amount:     amt,
          buyer:      form.manure_buyer || "",
          notes:      form.particulars,
        })
      }

      else if (et === "farm_other_income") {
        if (!form.credit || Number(form.credit) <= 0)
          return setError("Enter an amount.")
        const payload = {
          date:        form.date,
          income_type: form.income_subtype || "Other",
          amount:      Number(form.credit),
          notes:       form.particulars,
        }
        if (editingEntry && editingEntry.source === "farm_other_income" && window.api.updateFarmOtherIncome) {
          await window.api.updateFarmOtherIncome(editingEntry.id, payload)
        } else {
          await window.api.insertFarmOtherIncome(payload)
        }
      }

      else if (et === "farm_manure_sale") {
        const isTon = form.manure_unit === "ton"
        const finalQty = isTon ? Number(form.manure_qty_kg || 0) * 1000 : Number(form.manure_qty_kg || 0)
        const finalRate = isTon ? Number(form.manure_rate || 0) / 1000 : Number(form.manure_rate || 0)
        const amt = Number(form.credit || 0)
        await window.api.insertManureSale({
          date:       form.date,
          batch_id:   null,
          qty_kg:     finalQty,
          rate_per_kg:finalRate,
          amount:     amt,
          buyer:      form.manure_buyer || "",
          notes:      form.particulars,
        })
      }

      setSuccess("Entry saved successfully!")
      setTimeout(() => setSuccess(""), 3500)
      setForm(blankForm)
      setShowForm(false)
      setEditingEntry(null)
      load()
    } catch (e) {
      console.error(e)
      setError("Save failed: " + (e?.message || "unknown error"))
    } finally {
      setSaving(false)
    }
  }

  // ── which ledger sources support inline edit / delete from this page ──
  // Only sources whose full record shape is reconstructable from a ledger
  // row (just date + amount + notes) can be edited here. Sources whose
  // real detail lives in other fields (feed qty/rate, etc.) only get a
  // safe Delete where a delete API exists, matching how the Medication
  // page handles records created elsewhere.
  // egg_sale IS editable here — the sale price is often not known until the
  // trader announces it later in the week, so users need to be able to come
  // back and fill in / correct the rate from the ledger, not just from the
  // batch's own Sales tab.
  const EDITABLE_SOURCES = { batch_expense: "expense", farm_expense: "farm_expense", egg_sale: "egg_sale", farm_other_income: "farm_other_income" }
  const DELETE_API_MAP = {
    batch_expense: "deleteBatchExpense",
    farm_expense:  "deleteFarmExpense",
    feed:          "deleteFeedAllocation",
    medication:    "deleteMedication",
    egg_sale:      "deleteEggSale",
    manure_sale:   "deleteManureSale",
    farm_other_income: "deleteFarmOtherIncome",
    trader_payment: "deleteTraderPayment",
  }

  const startEdit = (r) => {
    const entryType = EDITABLE_SOURCES[r.source]
    if (!entryType) return
    const isBatchScope = !!(r.batch_id && r.batch_id !== "-")
    setEditingEntry(r)
    setForm({
      ...blankForm,
      date:            r.date || today,
      particulars:     displayParticulars(r),
      scope:           isBatchScope ? "batch" : "farm",
      batch_id:        isBatchScope ? r.batch_id : "",
      entry_type:      entryType,
      expense_subtype: r.expense_subtype || "Maintenance",
      income_subtype:  r.income_subtype || "Government Subsidy",
      debit:           r.debit || "",
      credit:          r.credit || "",
      // egg sale — most common reason to come back and edit: the price
      // wasn't known at the time of sale and is being filled in / corrected
      // now that the trader has announced it.
      egg_grade:       r.grade ?? "Export",
      egg_qty:         r.quantity ?? "",
      egg_rate:        r.rate_per_egg ?? "",
      trader_id:       r.trader_id ? String(r.trader_id) : "",
    })
    setShowForm(true)
    setError("")
  }

  const handleDeleteEntry = async (r) => {
    const fnName = DELETE_API_MAP[r.source]
    if (!fnName || !window.api[fnName] || r.id == null) {
      return setError("This entry can't be deleted from here.")
    }
    if (!window.confirm("Delete this entry? This cannot be undone.")) return
    setError("")
    try {
      await window.api[fnName](r.id)
      setSuccess("Entry deleted successfully!")
      setTimeout(() => setSuccess(""), 3000)
      load()
    } catch (e) {
      console.error(e)
      setError("Delete failed: " + (e?.message || "unknown error"))
    }
  }


  const filtered = rows.filter(r => {
    if (filterType === "debit"  && !(Number(r.debit)  > 0)) return false
    if (filterType === "credit" && !(Number(r.credit) > 0)) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        (displayParticulars(r) || "").toLowerCase().includes(q) ||
        (r.batch_id    || "").toLowerCase().includes(q)
      )
    }
    return true
  })

  // ── month-filtered rows (drives the ledger table) ────────────
  const monthFilteredRaw = filtered.filter(r => {
    if (!r.date) return false
    const d = new Date(r.date)
    return d.getFullYear() === viewDate.year && d.getMonth() === viewDate.month
  })
  // Group same-day, same-batch bill lines (medication/egg sale/feed) into one row each —
  // matches exactly what the printed statement shows, so on-screen and print never disagree.
  const monthFiltered = groupBillRows(monthFilteredRaw.slice().sort((a, b) => new Date(a.date) - new Date(b.date)))

  const totalDebit  = monthFiltered.reduce((s, r) => s + Number(r.debit  || 0), 0)
  const totalCredit = monthFiltered.reduce((s, r) => s + Number(r.credit || 0), 0)
  const netBalance  = totalCredit - totalDebit

  // ── pagination ─────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(monthFiltered.length / PAGE_SIZE))
  const safePage    = Math.min(Math.max(1, page), totalPages)
  const pageRows    = monthFiltered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // reset to page 1 whenever the visible month or filters change
  useEffect(() => { setPage(1) }, [viewDate.year, viewDate.month, search, filterBatch, filterType, startDate, endDate])

  // ── print ────────────────────────────────────────────────────
  const handlePrint = () => {
    const fromD = printFrom ? new Date(printFrom) : null
    const toD   = printTo   ? new Date(printTo)   : null

    const printRows = rows.filter(r => {
      if (printBatch && r.batch_id !== printBatch) return false
      const d = new Date(r.date)
      if (fromD && d < fromD) return false
      if (toD   && d > toD)   return false
      return true
    }).sort((a, b) => new Date(a.date) - new Date(b.date))

    if (printRows.length === 0) return setError("No entries found for the selected filters.")

    // Group same-day, same-batch bill lines (medication/egg sale/feed) into one row each
    const finalPrintRows = groupBillRows(printRows)

    const farmName    = localStorage.getItem("farm_name")    || "SRI ANNAMAR POULTRY FARM"
    const farmAddress = localStorage.getItem("farm_address") || "REDDIPUDUR, NAMAKKAL"
    const farmPhone   = localStorage.getItem("farm_phone")   || "8870044489"

    const titleLabel = printBatch ? `Batch Statement — ${printBatch}` : "Total Farm Statement (All Batches)"

    const fmtAmt = n => Number(n || 0) > 0 ? `₹${Number(n).toLocaleString("en-IN")}` : "—"

    let running = 0
    const rowsHtml = finalPrintRows.map(r => {
      running += Number(r.credit || 0) - Number(r.debit || 0)
      const particularsHtml = r.__rawParticulars ? r.particulars : displayParticulars(r)
      return `
      <tr>
        <td>${r.__showDate === false ? "" : fmtDate(r.date)}</td>
        <td>${particularsHtml}</td>
        <td>${r.batch_id && r.batch_id !== "-" ? r.batch_id : "—"}</td>
        <td class="num">${r.debit  > 0 ? fmtAmt(r.debit)  : "—"}</td>
        <td class="num">${r.credit > 0 ? fmtAmt(r.credit) : "—"}</td>
        <td class="num">${fmtAmt(Math.abs(running))}${running < 0 ? " Dr" : running > 0 ? " Cr" : ""}</td>
      </tr>`
    }).join("")

    const printTotalDebit  = finalPrintRows.reduce((s, r) => s + Number(r.debit  || 0), 0)
    const printTotalCredit = finalPrintRows.reduce((s, r) => s + Number(r.credit || 0), 0)
    const printNet         = printTotalCredit - printTotalDebit

    const fromLabel = printFrom ? fmtDate(printFrom) : "Beginning"
    const toLabel   = printTo   ? fmtDate(printTo)   : "Date"

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${titleLabel}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #000; padding: 24px 32px; }
    .header { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 10px; }
    .header h1 { font-size: 18px; font-weight: 800; letter-spacing: 1px; }
    .header h2 { font-size: 13px; font-weight: 400; margin: 2px 0; }
    .header h3 { font-size: 15px; font-weight: 700; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 11px; line-height: 1.8; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { background: #000; color: #fff; padding: 8px; font-size: 11px; }
    th.num, td.num { text-align: right; }
    td { padding: 6px 8px; border-bottom: 1px solid #ddd; font-size: 11px; }
    tr:nth-child(even) td { background: #f9f9f9; }
    tr.grand td { font-weight: 700; background: #000; color: #fff; }
    .closing-label { margin-top: 12px; font-size: 13px; font-weight: 700; text-align: right; padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
    .footer { margin-top: 16px; border-top: 1px solid #ccc; padding-top: 8px; display: flex; justify-content: space-between; font-size: 10px; color: #555; }
    @media print { body { padding: 8px 16px; } @page { margin: 10mm; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${farmName}</h1>
    ${farmAddress ? `<h4>${farmAddress}</h4>` : ""}
    ${farmPhone   ? `<h4>Ph: ${farmPhone}</h4>` : ""}
    <h2>Account Ledger</h2>
    <h3>${titleLabel}</h3>
  </div>

  <div class="meta">
    <div>
      <strong>Period:</strong> ${fromLabel} To ${toLabel}<br/>
      <strong>Scope:</strong> ${printBatch ? "Single Batch" : "All Batches (Total Farm)"}
    </div>
    <div style="text-align:right">
      <strong>Generated:</strong> ${new Date().toLocaleDateString("en-IN")}<br/>
      <strong>Entries:</strong> ${finalPrintRows.length}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:80px">Date</th>
        <th>Particulars</th>
        <th style="width:70px">Batch</th>
        <th class="num" style="width:95px">Debit (₹)</th>
        <th class="num" style="width:95px">Credit (₹)</th>
        <th class="num" style="width:110px">Balance (₹)</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="grand">
        <td colspan="3"><strong>Grand Total</strong></td>
        <td class="num"><strong>${fmtAmt(printTotalDebit)}</strong></td>
        <td class="num"><strong>${fmtAmt(printTotalCredit)}</strong></td>
        <td class="num"><strong>${fmtAmt(Math.abs(printNet))}${printNet < 0 ? " Dr" : printNet > 0 ? " Cr" : ""}</strong></td>
      </tr>
    </tbody>
  </table>

  <div class="closing-label">
    ${printNet === 0 ? "Balanced ✓" : printNet > 0 ? `Net Profit: ₹${printNet.toLocaleString("en-IN")}` : `Net Loss: ₹${Math.abs(printNet).toLocaleString("en-IN")}`}
  </div>

  <div class="footer">
    <span>System-generated statement. Not a tax invoice.</span>
    <span>Printed on: ${new Date().toLocaleDateString("en-IN")}</span>
  </div>

  <script>window.onload = () => window.print()</script>
</body>
</html>`

    const win = window.open("", "_blank", "width=900,height=700")
    win.document.write(html)
    win.document.close()
    setShowPrintModal(false)
  }

  // ── styles ───────────────────────────────────────────────────
  const inp = {
    fontSize: 13, border: "1px solid #ddd", borderRadius: 6,
    padding: "7px 10px", background: "#fff", outline: "none",
    width: "100%", boxSizing: "border-box",
  }
  const lbl  = { fontSize: 11, color: "#555", marginBottom: 4, display: "block", fontWeight: 600 }
  const fRow = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }
  const f1   = { marginBottom: 12 }

  const scopeTypes = form.scope === "batch" ? BATCH_ENTRY_TYPES : FARM_ENTRY_TYPES

  // current entry side
  const entryMeta = [...BATCH_ENTRY_TYPES, ...FARM_ENTRY_TYPES].find(t => t.value === form.entry_type)

  return (
    <div style={{ fontFamily: "sans-serif" }}>
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

      {/* ══ Top bar ══════════════════════════════════════════════ */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Account Ledger</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
            Daily entry — all transactions in one place
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => { setShowPrintModal(true); setError("") }}
            style={{
              background: "#1e293b", color: "#fff",
              border: "none", borderRadius: 8, padding: "9px 20px",
              cursor: "pointer", fontWeight: 600, fontSize: 13,
            }}
          >
            🖨 Print
          </button>
          {!isReadOnly && <button
            onClick={() => { setShowForm(v => !v); setError(""); setForm(blankForm); setEditingEntry(null) }}
            style={{
              background: showForm ? "#e5e7eb" : "#0F6E56",
              color: showForm ? "#333" : "#fff",
              border: "none", borderRadius: 8, padding: "9px 20px",
              cursor: "pointer", fontWeight: 600, fontSize: 13,
            }}
          >
            {showForm ? "✕ Cancel" : "+ New Entry"}
          </button>}
        </div>
      </div>

      {/* ══ Success toast ════════════════════════════════════════ */}
      {success && (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "10px 16px", color: "#166534", fontSize: 13, marginBottom: 16, fontWeight: 600 }}>
          ✓ {success}
        </div>
      )}

      {/* ══ GLOBAL SUMMARY CARDS (from real DB) ═════════════════ */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 22 }}>
          {[
            { label: "Total Revenue",     value: summary.revenue,              bg: "#F0FDF4", border: "#BBF7D0", color: "#166534" },
            { label: "Egg Sales",         value: summary.egg_sales,            bg: "#ECFDF5", border: "#A7F3D0", color: "#065F46" },
            { label: "Bird Sales",        value: summary.bird_sales,           bg: "#ECFDF5", border: "#A7F3D0", color: "#065F46" },
            { label: "Total Expenses",    value: summary.expenses,             bg: "#FFF7ED", border: "#FED7AA", color: "#9A3412" },
            { label: "Feed Cost",         value: summary.feed_cost,            bg: "#FFF7ED", border: "#FED7AA", color: "#9A3412" },
            { label: "Medication",        value: summary.medication_cost,      bg: "#FEF3C7", border: "#FDE68A", color: "#92400E" },
            { label: "Chick Cost",        value: summary.chick_cost,           bg: "#F0F9FF", border: "#BAE6FD", color: "#0C4A6E" },
            { label: "Batch Expenses",    value: summary.batch_other_expenses, bg: "#FFF1F2", border: "#FECDD3", color: "#9F1239" },
            { label: "Farm Expenses",     value: summary.farm_expenses,        bg: "#FDF4FF", border: "#E9D5FF", color: "#7E22CE" },
            { label: "Manure Sales",       value: summary.manure_sales,        bg: "#FEF9C3", border: "#FDE68A", color: "#713F12" },
            { label: "Other Income",       value: summary.farm_other_income,   bg: "#ECFEFF", border: "#A5F3FC", color: "#155E75" },
            { label: "Net Profit / Loss", value: summary.net_profit,
              bg:     summary.net_profit >= 0 ? "#ECFDF5" : "#FFF1F2",
              border: summary.net_profit >= 0 ? "#A7F3D0" : "#FECDD3",
              color:  summary.net_profit >= 0 ? "#065F46" : "#B91C1C" },
          ].map(c => (
            <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 3, fontWeight: 600 }}>{c.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: c.color }}>₹ {fmt(c.value)}</div>
            </div>
          ))}
        </div>
      )}

      {/* ══ ENTRY FORM ══════════════════════════════════════════ */}
      {showForm && !isReadOnly && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 22, marginBottom: 26, boxShadow: "0 2px 12px rgba(0,0,0,0.07)" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#0F6E56", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            {editingEntry ? "✏️ Edit Ledger Entry" : "📝 New Ledger Entry"}
          </div>

          {error && (
            <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: 7, padding: "8px 12px", color: "#9F1239", fontSize: 12, marginBottom: 14 }}>
              ⚠ {error}
            </div>
          )}

          {/* Step 1 — Date & Particulars */}
          <div style={fRow}>
            <div>
              <label style={lbl}>Date *</label>
              <input type="date" value={form.date} onChange={e => set("date", e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Particulars / Description</label>
              <input
                placeholder="e.g. Layer Mash arrived, Vaccine dose…"
                value={form.particulars}
                onChange={e => set("particulars", e.target.value)}
                style={inp}
              />
            </div>
          </div>

          {/* Step 2 — Scope (Batch / Farm) */}
          <div style={f1}>
            <label style={lbl}>Entry For *</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["batch", "farm"].map(s => (
                <button
                  key={s}
                  onClick={() => { set("scope", s); set("entry_type", "") }}
                  style={{
                    padding: "7px 18px", borderRadius: 20, cursor: "pointer", fontSize: 13,
                    border: "1.5px solid",
                    borderColor: form.scope === s ? "#0F6E56" : "#e2e8f0",
                    background:  form.scope === s ? "#E1F5EE" : "#f8fafc",
                    color:       form.scope === s ? "#0F6E56" : "#555",
                    fontWeight:  form.scope === s ? 700 : 400,
                  }}
                >
                  {s === "batch" ? "📦 Batch" : "🏚️ Farm"}
                </button>
              ))}
            </div>
          </div>

          {/* Step 3 — Batch selector (only if scope=batch) */}
          {form.scope === "batch" && (
            <div style={f1}>
              <label style={lbl}>Batch ID *</label>
              <select value={form.batch_id} onChange={e => set("batch_id", e.target.value)} style={inp}>
                <option value="">— Select Batch —</option>
                {batches.map(b => (
                  <option key={b.id} value={b.batch_id}>
                    {b.batch_id}{b.status === "Closed" ? " (Closed)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Step 4 — Entry type pills */}
          <div style={f1}>
            <label style={lbl}>Entry Type *</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {scopeTypes.map(t => (
                <button
                  key={t.value}
                  onClick={() => set("entry_type", t.value)}
                  style={{
                    padding: "6px 16px", borderRadius: 20, cursor: "pointer", fontSize: 12,
                    border: "1.5px solid",
                    borderColor: form.entry_type === t.value ? "#0F6E56" : "#e2e8f0",
                    background:  form.entry_type === t.value ? "#E1F5EE" : "#f8fafc",
                    color:       form.entry_type === t.value ? "#0F6E56" : "#555",
                    fontWeight:  form.entry_type === t.value ? 700 : 400,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Step 5 — Trader selector (only for relevant entry types) */}
          {["feed", "medication", "vaccine", "egg_sale", "bird_sale", "manure_sale", "farm_manure_sale"].includes(form.entry_type) && (
            <div style={f1}>
              <label style={lbl}>
                {["feed", "medication", "vaccine"].includes(form.entry_type) ? "Supplier (Trader)" : "Buyer (Trader)"}
              </label>
              <select value={form.trader_id} onChange={e => set("trader_id", e.target.value)} style={inp}>
                <option value="">— Select Trader (optional) —</option>
                {traders.map(t => (
                  <option key={t.id} value={t.id}>{t.name}{t.types ? ` (${t.types})` : ""}</option>
                ))}
              </select>
            </div>
          )}

          {/* ── Conditional detail fields ── */}

          {/* FEED */}
          {form.entry_type === "feed" && (
            <>
              <div style={fRow}>
                <div>
                  <label style={lbl}>Feed Type *</label>
                  <input placeholder="e.g. Layer Mash, Grower" value={form.feed_type}
                    onChange={e => set("feed_type", e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Qty (kg)</label>
                  <input type="number" onWheel={(e) => e.target.blur()} min="0" placeholder="0" value={form.qty_kg}
                    onChange={e => { set("qty_kg", e.target.value); set("debit", calcFeed(e.target.value, form.rate_per_kg)) }}
                    style={inp} />
                </div>
              </div>
              <div style={fRow}>
                <div>
                  <label style={lbl}>Rate / kg (₹)</label>
                  <input type="number" onWheel={(e) => e.target.blur()} min="0" step="0.01" placeholder="0.00" value={form.rate_per_kg}
                    onChange={e => { set("rate_per_kg", e.target.value); set("debit", calcFeed(form.qty_kg, e.target.value)) }}
                    style={inp} />
                </div>
                <div>
                  <label style={lbl}>Debit — Total Cost (₹)</label>
                  <input type="number" onWheel={(e) => e.target.blur()} min="0" value={form.debit}
                    onChange={e => set("debit", e.target.value)}
                    style={{ ...inp, background: "#FFF7ED", fontWeight: 700, color: "#9A3412" }} />
                </div>
              </div>
            </>
          )}

          {/* MEDICATION / VACCINE */}
          {(form.entry_type === "medication" || form.entry_type === "vaccine") && (
            <>
              <div style={fRow}>
                <div>
                  <label style={lbl}>{form.entry_type === "vaccine" ? "Vaccine" : "Medicine"} Name *</label>
                  <input placeholder="Name" value={form.medicine_name}
                    onChange={e => set("medicine_name", e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={lbl}>No. of Packs</label>
                  <input type="number" onWheel={(e) => e.target.blur()} min="0" placeholder="1" value={form.num_packs}
                    onChange={e => { set("num_packs", e.target.value); set("debit", calcMed(e.target.value, form.price_per_pack)) }}
                    style={inp} />
                </div>
              </div>
              <div style={fRow}>
                <div>
                  <label style={lbl}>Price / Pack (₹)</label>
                  <input type="number" onWheel={(e) => e.target.blur()} min="0" step="0.01" value={form.price_per_pack}
                    onChange={e => { set("price_per_pack", e.target.value); set("debit", calcMed(form.num_packs, e.target.value)) }}
                    style={inp} />
                </div>
                <div>
                  <label style={lbl}>Debit — Total Cost (₹)</label>
                  <input type="number" onWheel={(e) => e.target.blur()} min="0" value={form.debit}
                    onChange={e => set("debit", e.target.value)}
                    style={{ ...inp, background: "#FEF3C7", fontWeight: 700, color: "#92400E" }} />
                </div>
              </div>
            </>
          )}

          {/* BATCH EXPENSE */}
          {form.entry_type === "expense" && (
            <div style={fRow}>
              <div>
                <label style={lbl}>Expense Type</label>
                <select value={form.expense_subtype} onChange={e => set("expense_subtype", e.target.value)} style={inp}>
                  {EXPENSE_SUBTYPES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Debit — Amount (₹)</label>
                <input type="number" onWheel={(e) => e.target.blur()} min="0" value={form.debit} onChange={e => set("debit", e.target.value)}
                  style={{ ...inp, background: "#FFF1F2", fontWeight: 700, color: "#9F1239" }} />
              </div>
            </div>
          )}

          {/* FARM EXPENSE */}
          {form.entry_type === "farm_expense" && (
            <div style={fRow}>
              <div>
                <label style={lbl}>Expense Type</label>
                <select value={form.expense_subtype} onChange={e => set("expense_subtype", e.target.value)} style={inp}>
                  {FARM_EXPENSE_SUBTYPES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Debit — Amount (₹)</label>
                <input type="number" onWheel={(e) => e.target.blur()} min="0" value={form.debit} onChange={e => set("debit", e.target.value)}
                  style={{ ...inp, background: "#FDF4FF", fontWeight: 700, color: "#7E22CE" }} />
              </div>
            </div>
          )}

          {/* OTHER INCOME (farm) */}
          {form.entry_type === "farm_other_income" && (
            <div style={fRow}>
              <div>
                <label style={lbl}>Income Type</label>
                <select value={form.income_subtype} onChange={e => set("income_subtype", e.target.value)} style={inp}>
                  {OTHER_INCOME_SUBTYPES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Credit — Amount (₹)</label>
                <input type="number" onWheel={(e) => e.target.blur()} min="0" value={form.credit} onChange={e => set("credit", e.target.value)}
                  style={{ ...inp, background: "#ECFEFF", fontWeight: 700, color: "#155E75" }} />
              </div>
            </div>
          )}

          {/* MANURE SALE (batch or farm) */}
          {(form.entry_type === "manure_sale" || form.entry_type === "farm_manure_sale") && (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Unit Selector</label>
                <div style={{ display: "flex", gap: 4 }}>
                  {["kg", "ton"].map(unit => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => {
                        const curQty = Number(form.manure_qty_kg || 0)
                        const curRate = Number(form.manure_rate || 0)
                        if (unit === "ton" && form.manure_unit === "kg") {
                          set("manure_qty_kg", (curQty / 1000).toString())
                          set("manure_rate", (curRate * 1000).toString())
                        } else if (unit === "kg" && form.manure_unit === "ton") {
                          set("manure_qty_kg", (curQty * 1000).toString())
                          set("manure_rate", (curRate / 1000).toString())
                        }
                        set("manure_unit", unit)
                      }}
                      style={{
                        padding: "4px 14px", borderRadius: 4, fontSize: 12, cursor: "pointer",
                        border: "1px solid",
                        borderColor: form.manure_unit === unit ? "#0F6E56" : "#ddd",
                        background: form.manure_unit === unit ? "#E1F5EE" : "#fff",
                        color: form.manure_unit === unit ? "#0F6E56" : "#333",
                        fontWeight: form.manure_unit === unit ? 700 : 400
                      }}
                    >
                      {unit.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div style={fRow}>
                <div>
                  <label style={lbl}>Qty ({form.manure_unit})</label>
                  <input type="number" onWheel={(e) => e.target.blur()} min="0" placeholder="0" value={form.manure_qty_kg}
                    onChange={e => { set("manure_qty_kg", e.target.value); set("credit", (Number(e.target.value) * Number(form.manure_rate || 0)).toFixed(2)) }}
                    style={inp} />
                </div>
                <div>
                  <label style={lbl}>Rate / {form.manure_unit} (₹)</label>
                  <input type="number" onWheel={(e) => e.target.blur()} min="0" step="0.01" placeholder="0.00" value={form.manure_rate}
                    onChange={e => { set("manure_rate", e.target.value); set("credit", (Number(form.manure_qty_kg || 0) * Number(e.target.value)).toFixed(2)) }}
                    style={inp} />
                </div>
              </div>
              <div style={fRow}>
                <div>
                  <label style={lbl}>Buyer (optional)</label>
                  <input placeholder="Buyer name" value={form.manure_buyer}
                    onChange={e => set("manure_buyer", e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Credit — Total Amount (₹)</label>
                  <input type="number" onWheel={(e) => e.target.blur()} min="0" value={form.credit}
                    onChange={e => set("credit", e.target.value)}
                    style={{ ...inp, background: "#FEF9C3", fontWeight: 700, color: "#713F12" }} />
                </div>
              </div>
            </>
          )}

          {/* EGG SALE */}
          {form.entry_type === "egg_sale" && (
            <>
              <div style={fRow}>
                <div>
                  <label style={lbl}>Grade</label>
                  <select value={form.egg_grade} onChange={e => set("egg_grade", e.target.value)} style={inp}>
                    {["Export","Large","Medium","Pullet","Correct"].map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Qty (Whole Trays)</label>
                  <input type="number" onWheel={(e) => e.target.blur()} min="0" step="1" placeholder="0" value={form.egg_qty}
                    onChange={e => { set("egg_qty", e.target.value); set("credit", calcEgg(e.target.value, form.egg_rate)) }}
                    style={inp} />
                </div>
              </div>
              <div style={fRow}>
                <div>
                  <label style={lbl}>Rate / Egg (₹)</label>
                  <input type="number" onWheel={(e) => e.target.blur()} min="0" step="0.01" value={form.egg_rate}
                    onChange={e => { set("egg_rate", e.target.value); set("credit", calcEgg(form.egg_qty, e.target.value)) }}
                    style={inp} />
                </div>
                <div>
                  <label style={lbl}>Credit — Total Revenue (₹)</label>
                  <input type="number" onWheel={(e) => e.target.blur()} min="0" value={form.credit} onChange={e => set("credit", e.target.value)}
                    style={{ ...inp, background: "#F0FDF4", fontWeight: 700, color: "#166534" }} />
                </div>
              </div>
            </>
          )}

          {/* BIRD SALE */}
          {form.entry_type === "bird_sale" && (
            <div style={fRow}>
              <div>
                <label style={lbl}>Birds Sold</label>
                <input type="number" onWheel={(e) => e.target.blur()} min="0" value={form.birds_sold}
                  onChange={e => { set("birds_sold", e.target.value); set("credit", calcBird(e.target.value, form.price_per_bird)) }}
                  style={inp} />
              </div>
              <div>
                <label style={lbl}>Price / Bird (₹)</label>
                <input type="number" onWheel={(e) => e.target.blur()} min="0" step="0.01" value={form.price_per_bird}
                  onChange={e => { set("price_per_bird", e.target.value); set("credit", calcBird(form.birds_sold, e.target.value)) }}
                  style={inp} />
              </div>
            </div>
          )}

          {!form.entry_type && (
            <div style={{ color: "#94a3b8", fontSize: 12, padding: "8px 0 14px" }}>
              ↑ Select an entry type above to see the relevant fields.
            </div>
          )}

          {/* Debit / Credit preview */}
          {form.entry_type && (
            <div style={{ display: "flex", gap: 12, marginTop: 4, marginBottom: 18 }}>
              <div style={{ flex: 1, background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ fontSize: 10, color: "#9A3412", fontWeight: 700, letterSpacing: 0.5 }}>DEBIT (Expense)</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#B91C1C" }}>₹ {fmt(form.debit || 0)}</div>
              </div>
              <div style={{ flex: 1, background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ fontSize: 10, color: "#166534", fontWeight: 700, letterSpacing: 0.5 }}>CREDIT (Income)</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#15803D" }}>₹ {fmt(form.credit || 0)}</div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleSave} disabled={saving} style={{
              background: saving ? "#aaa" : "#0F6E56", color: "#fff",
              border: "none", borderRadius: 7, padding: "9px 24px",
              cursor: saving ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13,
            }}>
              {saving ? "Saving…" : editingEntry ? "✓ Update Entry" : "✓ Save Entry"}
            </button>
            <button onClick={() => { setShowForm(false); setForm(blankForm); setError(""); setEditingEntry(null) }}
              style={{ background: "#e5e7eb", color: "#333", border: "none", borderRadius: 7, padding: "9px 18px", cursor: "pointer", fontSize: 13 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ══ MONTH NAVIGATOR (left) + PAGE NAVIGATOR (right) ═════ */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>

        {/* month nav — top-left */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={goPrevMonth} aria-label="Previous month"
            style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#475569" }}>
            ‹
          </button>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <span style={{
              fontSize: 13, fontWeight: 700, color: "#1e293b",
              border: "1px solid #ddd", borderRadius: 6, padding: "5px 12px",
              background: "#fff", minWidth: 130, textAlign: "center",
            }}>
              {monthLabel}
            </span>
            <input type="month" value={monthInputValue} onChange={handleMonthInputChange}
              title="Jump to month"
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
          </div>
          <button onClick={goNextMonth} aria-label="Next month"
            style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#475569" }}>
            ›
          </button>
        </div>

        {/* page nav — top-right */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} aria-label="Previous page"
            style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: safePage <= 1 ? "not-allowed" : "pointer", fontSize: 14, color: safePage <= 1 ? "#ccc" : "#475569" }}>
            ‹
          </button>
          <span style={{
            fontSize: 13, fontWeight: 700, color: "#1e293b",
            border: "1px solid #ddd", borderRadius: 6, padding: "5px 12px",
            background: "#fff", minWidth: 90, textAlign: "center",
          }}>
            Page {safePage} / {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} aria-label="Next page"
            style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: safePage >= totalPages ? "not-allowed" : "pointer", fontSize: 14, color: safePage >= totalPages ? "#ccc" : "#475569" }}>
            ›
          </button>
        </div>
      </div>

      {/* ══ LEDGER FILTERS ══════════════════════════════════════ */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <input placeholder="🔍 Search particulars / batch…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 12, border: "1px solid #ddd", borderRadius: 6, padding: "6px 10px", width: 200, background: "#fff" }} />

        <select value={filterBatch} onChange={e => setFilterBatch(e.target.value)}
          style={{ fontSize: 12, border: "1px solid #ddd", borderRadius: 6, padding: "6px 10px", background: "#fff" }}>
          <option value="">All Batches</option>
          {batches.map(b => <option key={b.id} value={b.batch_id}>{b.batch_id}</option>)}
        </select>

        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          style={{ fontSize: 12, border: "1px solid #ddd", borderRadius: 6, padding: "6px 10px", background: "#fff" }}>
          <option value="all">All</option>
          <option value="debit">Debit Only</option>
          <option value="credit">Credit Only</option>
        </select>

        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
          style={{ fontSize: 12, border: "1px solid #ddd", borderRadius: 6, padding: "6px 8px" }} />
        <span style={{ fontSize: 11, color: "#aaa" }}>to</span>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
          style={{ fontSize: 12, border: "1px solid #ddd", borderRadius: 6, padding: "6px 8px" }} />

        {(search || filterBatch || filterType !== "all" || startDate || endDate) && (
          <button onClick={() => { setSearch(""); setFilterBatch(""); setFilterType("all"); setStartDate(""); setEndDate("") }}
            style={{ fontSize: 11, border: "1px solid #e0e0e0", borderRadius: 6, padding: "6px 10px", background: "#f5f5f5", cursor: "pointer", color: "#666" }}>
            Clear
          </button>
        )}

        {/* mini totals for current view */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, fontSize: 12, alignItems: "center" }}>
          <span style={{ color: "#B91C1C", fontWeight: 600 }}>Dr: ₹{fmt(totalDebit)}</span>
          <span style={{ color: "#15803D", fontWeight: 600 }}>Cr: ₹{fmt(totalCredit)}</span>
          <span style={{ color: netBalance >= 0 ? "#0F6E56" : "#B91C1C", fontWeight: 700 }}>Net: ₹{fmt(netBalance)}</span>
        </div>
      </div>

      {/* ══ LEDGER TABLE ════════════════════════════════════════ */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #eee", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead>
              <tr style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
                {["Date","Particulars","Batch","Type","Debit (₹)","Credit (₹)","Balance (₹)","Actions"].map(h => (
                  <th key={h} style={{
                    padding: "10px 12px",
                    textAlign: h.includes("₹") ? "right" : h === "Actions" ? "center" : "left",
                    fontSize: 11, fontWeight: 600, color: "#64748B",
                    letterSpacing: 0.4, whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 50, textAlign: "center", color: "#aaa", fontSize: 13 }}>Loading…</td></tr>
              ) : monthFiltered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 50, textAlign: "center", color: "#aaa", fontSize: 13 }}>
                  No entries found for {monthLabel}. Click <strong>+ New Entry</strong> to add one.
                </td></tr>
              ) : pageRows.map((r, i) => {
                const sc = SOURCE_COLORS[r.source] || { bg: "#f5f5f5", text: "#555" }
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                    <td style={{ padding: "9px 12px", fontSize: 12.5, borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap", color: "#475569" }}>{fmtDate(r.date)}</td>
                    <td style={{ padding: "9px 12px", fontSize: 12.5, borderBottom: "1px solid #f0f0f0", maxWidth: 280 }}>
                      <div style={{ fontWeight: 500, color: "#1e293b" }}>{displayParticulars(r)}</div>
                    </td>
                    <td style={{ padding: "9px 12px", borderBottom: "1px solid #f0f0f0" }}>
                      {r.batch_id && r.batch_id !== "-"
                        ? <span style={{ fontSize: 11, fontWeight: 700, background: "#E1F5EE", color: "#0F6E56", borderRadius: 4, padding: "2px 8px" }}>{r.batch_id}</span>
                        : <span style={{ fontSize: 11, color: "#ccc" }}>—</span>}
                    </td>
                    <td style={{ padding: "9px 12px", borderBottom: "1px solid #f0f0f0" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, background: sc.bg, color: sc.text, borderRadius: 4, padding: "2px 8px", whiteSpace: "nowrap" }}>
                        {SOURCE_LABELS[r.source] || r.source}
                      </span>
                    </td>
                    <td style={{ padding: "9px 12px", borderBottom: "1px solid #f0f0f0", textAlign: "right", fontFamily: "monospace", fontSize: 12.5, fontWeight: Number(r.debit) > 0 ? 700 : 400, color: Number(r.debit) > 0 ? "#B91C1C" : "#ddd" }}>
                      {Number(r.debit) > 0 ? fmt(r.debit) : "—"}
                    </td>
                    <td style={{ padding: "9px 12px", borderBottom: "1px solid #f0f0f0", textAlign: "right", fontFamily: "monospace", fontSize: 12.5, fontWeight: Number(r.credit) > 0 ? 700 : 400, color: Number(r.credit) > 0 ? "#15803D" : "#ddd" }}>
                      {Number(r.credit) > 0 ? fmt(r.credit) : "—"}
                    </td>
                    <td style={{ padding: "9px 12px", borderBottom: "1px solid #f0f0f0", textAlign: "right", fontFamily: "monospace", fontSize: 12.5, fontWeight: 700, color: Number(r.balance) >= 0 ? "#0F6E56" : "#B91C1C" }}>
                      {fmt(r.balance)}
                    </td>
                    <td style={{ padding: "9px 12px", borderBottom: "1px solid #f0f0f0", textAlign: "center" }}>
                      {isReadOnly ? (
                        <span style={{ fontSize: 10, color: "#ccc" }}>—</span>
                      ) : EDITABLE_SOURCES[r.source] ? (
                        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                          <button onClick={() => startEdit(r)} style={{ background: "#eef2ff", color: "#1d4ed8", border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 500, cursor: "pointer" }}>
                            Edit
                          </button>
                          <button onClick={() => handleDeleteEntry(r)} style={{ background: "#FCEBEB", color: "#A32D2D", border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 500, cursor: "pointer" }}>
                            Delete
                          </button>
                        </div>
                      ) : DELETE_API_MAP[r.source] ? (
                        <button onClick={() => handleDeleteEntry(r)} style={{ background: "#FCEBEB", color: "#A32D2D", border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 500, cursor: "pointer" }}>
                          Delete
                        </button>
                      ) : (
                        <span style={{ fontSize: 10, color: "#aaa" }} title="Edit this from the batch's own tab">
                          {r.batch_id && r.batch_id !== "-" ? `Edit in batch ${r.batch_id}` : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>

            {monthFiltered.length > 0 && !loading && (
              <tfoot>
                <tr style={{ background: "#F1F5F9", borderTop: "2px solid #E2E8F0" }}>
                  <td colSpan={4} style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "#475569" }}>
                    Totals ({monthFiltered.length} entries in {monthLabel}, showing {pageRows.length} on this page)
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#B91C1C", fontFamily: "monospace", fontSize: 13 }}>{fmt(totalDebit)}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#15803D", fontFamily: "monospace", fontSize: 13 }}>{fmt(totalCredit)}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: netBalance >= 0 ? "#0F6E56" : "#B91C1C", fontFamily: "monospace", fontSize: 13 }}>{fmt(netBalance)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} aria-label="Previous page"
              style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: safePage <= 1 ? "not-allowed" : "pointer", fontSize: 14, color: safePage <= 1 ? "#ccc" : "#475569" }}>
              ‹
            </button>
            <span style={{
              fontSize: 13, fontWeight: 700, color: "#1e293b",
              border: "1px solid #ddd", borderRadius: 6, padding: "5px 12px",
              background: "#fff", minWidth: 90, textAlign: "center",
            }}>
              Page {safePage} / {totalPages}
            </span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} aria-label="Next page"
              style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: safePage >= totalPages ? "not-allowed" : "pointer", fontSize: 14, color: safePage >= totalPages ? "#ccc" : "#475569" }}>
              ›
            </button>
          </div>
        </div>
      </div>

      {/* ══ PRINT MODAL ═══════════════════════════════════════ */}
      {showPrintModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 99999 }}
          onClick={() => setShowPrintModal(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 360, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: "#1e293b" }}>🖨 Print Ledger Statement</div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Scope</label>
              <select value={printBatch} onChange={e => setPrintBatch(e.target.value)} style={inp}>
                <option value="">🏚️ Total Farm (All Batches)</option>
                {batches.map(b => (
                  <option key={b.id} value={b.batch_id}>📦 {b.batch_id}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              <div>
                <label style={lbl}>From Date</label>
                <input type="date" value={printFrom} onChange={e => setPrintFrom(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>To Date</label>
                <input type="date" value={printTo} onChange={e => setPrintTo(e.target.value)} style={inp} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 16 }}>
              Leave dates blank to include the full history.
            </div>

            {error && (
              <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: 7, padding: "8px 12px", color: "#9F1239", fontSize: 12, marginBottom: 14 }}>
                ⚠ {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => { setShowPrintModal(false); setError("") }} style={{ background: "#e5e7eb", color: "#333", border: "none", borderRadius: 7, padding: "9px 18px", cursor: "pointer", fontSize: 13 }}>Cancel</button>
              <button onClick={handlePrint} style={{ background: "#1e293b", color: "#fff", border: "none", borderRadius: 7, padding: "9px 24px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Print</button>
            </div>
          </div>
        </div>
      )}

      {showWholeTrayWarning && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 99999 }}
          onClick={() => setShowWholeTrayWarning(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 360, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: "#1e293b" }}>⚠ Whole Trays Only</div>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 20 }}>
              Egg sales must be entered in whole trays — fractional quantities (e.g. 0.5) are not allowed. Please correct the quantity field and try again.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setShowWholeTrayWarning(false)} style={{ background: "#1e293b", color: "#fff", border: "none", borderRadius: 7, padding: "9px 24px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>OK</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}