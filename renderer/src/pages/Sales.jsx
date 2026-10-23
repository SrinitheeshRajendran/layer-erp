import { useState, useEffect } from "react"

const fmtDate = d => d ? d.split("-").reverse().join("-") : ""

const formatINR = (val) => {
  const num = Number(val || 0)
  const sign = num < 0 ? "-" : ""
  const formatted = Math.abs(num).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
  return `${sign}₹${formatted}`
}

// Groups same-day, same-batch entries belonging to one "bill" into a single row:
// - medication/vaccine lines merge with tax% applied + rounded to one Debit
// - egg sale ("sale") lines merge into one Credit (no tax)
// - feed lines merge into one Debit (no tax)
// Payments and anything else pass through unchanged — grouping never crosses
// batches, and never mixes different source types together.
const MED_FAMILY = new Set(["medication", "vaccine"])
function groupBillRows(rows) {
  const groups = {}
  const ordered = []
  rows.forEach(r => {
    const family = MED_FAMILY.has(r.source) ? "medication" : (r.source === "sale" ? "sale" : (r.source === "feed" ? "feed" : null))
    if (!family) { ordered.push(r); return }
    const key = `${r.date}|${r.batch_id}|${family}`
    if (!groups[key]) {
      groups[key] = { isGroup: true, date: r.date, batch_id: r.batch_id, source: r.source, ref: r.id, particulars: [], debit: 0, credit: 0, taxPct: Number(r.tax_pct || 0) }
      ordered.push(groups[key])
    }
    groups[key].particulars.push(r.particulars || "")
    groups[key].debit  += Number(r.debit  || 0)
    groups[key].credit += Number(r.credit || 0)
  })

  // Finalize: medication groups get tax applied + rounded; others just sum as-is
  const finalRows = ordered.map(r => {
    if (!r.isGroup) return r
    let debit = r.debit, credit = r.credit
    if (r.debit > 0 && MED_FAMILY.has(r.source)) {
      const taxAmt = r.debit * r.taxPct / 100
      debit = Math.round(r.debit + taxAmt)
    }
    return {
      date: r.date, batch_id: r.batch_id, source: r.source, id: r.ref,
      particulars: r.particulars.join("<br/>"),
      debit, credit
    }
  })

  // Blank out the date on rows that share the same date as the row before them,
  // so a multi-batch "same day" block reads as one date, not repeated ones.
  let lastDate = null
  return finalRows.map(r => {
    const show = r.date !== lastDate
    lastDate = r.date
    return { ...r, __showDate: show }
  })
}

const TRADER_PROFILES = [
  "Chicks Supplier",
  "Feed Supplier",
  "Medicine Supplier",
  "Egg Buyer",
  "Old Birds Buyer",
  "Manure Buyer",
];

function getPeriodOpeningBalance(storedOpening, allRows, periodStartDate) {
  if (!periodStartDate) return Number(storedOpening || 0);
  const beforeRows = groupBillRows(allRows.filter(r => r.date && r.date < periodStartDate));
  const priorCredit = beforeRows.reduce((s, r) => s + Number(r.credit || 0), 0);
  const priorDebit  = beforeRows.reduce((s, r) => s + Number(r.debit || 0), 0);
  return Number(storedOpening || 0) + (priorCredit - priorDebit);
}

export default function Sales({ isReadOnly = false, activeYear = null }) {
  const [traders, setTraders] = useState([])
  const [selectedTrader, setSelectedTrader] = useState("")
  const [crossLedger, setCrossLedger] = useState([])
  const [saved, setSaved] = useState("")

  // Add / Edit Trader Form Popup Overlay Setup State
  const [showAddTraderModal, setShowAddTraderModal] = useState(false)
  const [editingTraderId, setEditingTraderId] = useState(null)
  const [traderForm, setTraderForm] = useState({
    name: "", phone: "", address: "", opening_balance: "0", types: []
  })

  const today = new Date().toISOString().split('T')[0]

  const [paymentForm, setPaymentForm] = useState({
    date: today, trader: "", amount: "", mode: "Cash", notes: "", direction: "to_trader"
  })
  const [editingPaymentId, setEditingPaymentId] = useState(null)

  const [ledgerSearch, setLedgerSearch] = useState("")
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [printFrom, setPrintFrom] = useState("")
  const [printTo,   setPrintTo]   = useState("")

  // ── Trader adjustments & opening balance audit state ──
  const [traderAdjustments, setTraderAdjustments] = useState([])
  const [traderOpeningLogs, setTraderOpeningLogs] = useState([])
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false)
  const [adjConfirmStep, setAdjConfirmStep] = useState(false)
  const [adjForm, setAdjForm] = useState({
    date: today,
    direction: "trader_owes_more",
    amount: "",
    note: ""
  })
  const [voidModalAdj, setVoidModalAdj] = useState(null)
  const [voidReason, setVoidReason] = useState("")

  // Opening balance change audit state for edit modal
  const [originalOpeningBalance, setOriginalOpeningBalance] = useState("0")
  const [openingBalanceReason, setOpeningBalanceReason] = useState("")
  const [showOpeningConfirmModal, setShowOpeningConfirmModal] = useState(false)

  // ── month navigator + pagination (Unified Statement Ledger History) ──
  const PAGE_SIZE = 30
  const [ledgerViewDate, setLedgerViewDate] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() } // month: 0-11
  })
  const [ledgerPage, setLedgerPage] = useState(1)

  const goPrevLedgerMonth = () => setLedgerViewDate(v => {
    let { year, month } = v
    month -= 1
    if (month < 0) { month = 11; year -= 1 }
    return { year, month }
  })
  const goNextLedgerMonth = () => setLedgerViewDate(v => {
    let { year, month } = v
    month += 1
    if (month > 11) { month = 0; year += 1 }
    return { year, month }
  })
  const ledgerMonthLabel = new Date(ledgerViewDate.year, ledgerViewDate.month, 1)
    .toLocaleString("en-US", { month: "long", year: "numeric" })
  const ledgerMonthInputValue = `${ledgerViewDate.year}-${String(ledgerViewDate.month + 1).padStart(2, "0")}`
  const handleLedgerMonthInputChange = (e) => {
    const val = e.target.value // "YYYY-MM"
    if (!val) return
    const [y, m] = val.split("-").map(Number)
    setLedgerViewDate({ year: y, month: m - 1 })
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

  const notify = (msg) => { setSaved(msg); setTimeout(() => setSaved(""), 2500) }

  const handlePrint = () => {
    if (!selectedTrader || crossLedger.length === 0) return notify("No ledger data to print")

    const trader  = traders.find(t => Number(t.id) === Number(selectedTrader))
    const name    = trader?.name    || "Trader"
    const types   = trader?.types   || ""
    const phone   = trader?.phone   || ""
    const address = trader?.address || ""

    const farmName    = localStorage.getItem("farm_name")    || "SRI ANNAMAR POULTRY FARM"
    const farmAddress = localStorage.getItem("farm_address") || "REDDIPUDUR, NAMAKKAL"
    const farmPhone   = localStorage.getItem("farm_phone")   || "8870044489"

    const currentActiveYear = activeYear || new Date().getFullYear()
    const periodStartDate = printFrom || `${currentActiveYear}-01-01`
    const toDate   = printTo ? new Date(printTo) : null

    const inRange = r => {
      if (!r.date) return false
      if (r.date < periodStartDate) return false
      if (toDate && new Date(r.date) > toDate) return false
      return true
    }

    const displayedOpening = getPeriodOpeningBalance(trader?.opening_balance, crossLedger, periodStartDate)
    const openingAmt = Math.abs(displayedOpening)
    const openingInDebit = displayedOpening < 0

    // Rows within the selected range, ordered oldest → newest for printing
    const monthRowsRaw = crossLedger.filter(inRange).sort((a, b) => new Date(a.date) - new Date(b.date))
    if (monthRowsRaw.length === 0 && openingAmt === 0) return notify("No transactions for selected date range")

    // Group same-day, same-batch bill lines (medication/egg sale/feed) into one row each
    const finalRows = groupBillRows(monthRowsRaw)

    // Ref number generation — assigned after grouping, so one bill = one Ref
    const counters  = {}
    const prefixMap = { payment: "PAYM", feed: "FEED", sale: "EGG", egg_sale: "EGG", medication: "MED", vaccine: "MED", manure: "MNR", bird_sale: "BIRD", mortality: "MORT", adjustment: "ADJ" }
    const taggedFinalRows = finalRows.map(r => {
      const prefix = (r.source === "payment" && r.direction === "from_trader") ? "RCPT" : (prefixMap[r.source] || "REF")
      counters[prefix] = (counters[prefix] || 0) + 1
      return { ...r, ref: `${prefix}-${counters[prefix]}` }
    })

    // Sub totals for this period only
    const monDebit  = taggedFinalRows.reduce((s, r) => s + Number(r.debit  || 0), 0)
    const monCredit = taggedFinalRows.reduce((s, r) => s + Number(r.credit || 0), 0)
    const totalDebitSide  = monDebit  + (openingInDebit  ? openingAmt : 0)
    const totalCreditSide = monCredit + (!openingInDebit ? openingAmt : 0)

    const diff        = Math.abs(totalDebitSide - totalCreditSide)
    const closingInDebit = totalDebitSide > totalCreditSide
    const grandTotal  = Math.max(totalDebitSide, totalCreditSide)

    const fmt    = n => n > 0 ? `₹${Number(n).toLocaleString("en-IN")}` : "—"
    const fmtAmt = n => `₹${Number(n).toLocaleString("en-IN")}`

    const monthLabel = (!printFrom && !printTo)
      ? `${currentActiveYear} Statement`
      : `${printFrom ? fmtDate(printFrom) : `${currentActiveYear}-01-01`} to ${printTo ? fmtDate(printTo) : "Today"}`

    const fromLabel = printFrom ? fmtDate(printFrom) : `${currentActiveYear}-01-01`
    const toLabel   = printTo   ? fmtDate(printTo)   : "Today"

    // Opening balance row HTML
    const openingRow = openingAmt > 0 ? `
      <tr class="opening">
        <td></td>
        <td>
          <strong>Opening Balance</strong>
          ${trader?.carried_from_year ? `<div style="font-size:10px;color:#64748b;font-style:italic;font-weight:normal;">Opening balance carried forward from ${trader.carried_from_year}</div>` : ''}
        </td>
        <td></td>
        <td class="num">${openingInDebit  ? `<strong>${fmtAmt(openingAmt)}</strong>` : "—"}</td>
        <td class="num">${!openingInDebit ? `<strong>${fmtAmt(openingAmt)}</strong>` : "—"}</td>
      </tr>` : ""

    const rowsHtml = taggedFinalRows.map(r => `
      <tr>
        <td>${r.__showDate === false ? "" : fmtDate(r.date)}</td>
        <td>${r.particulars || ""}</td>
        <td>${r.ref}</td>
        <td class="num">${r.debit  > 0 ? fmt(r.debit)  : "—"}</td>
        <td class="num">${r.credit > 0 ? fmt(r.credit) : "—"}</td>
      </tr>`).join("")

    const subTotalRow = `
      <tr class="subtotal">
        <td colspan="3"><strong>Sub Total</strong></td>
        <td class="num"><strong>${fmtAmt(totalDebitSide)}</strong></td>
        <td class="num"><strong>${fmtAmt(totalCreditSide)}</strong></td>
      </tr>`

    const closingRow = closingInDebit
      ? `<tr class="closing"><td colspan="3"><strong>Closing Balance</strong></td><td class="num"><strong>${fmtAmt(diff)}</strong></td><td class="num">—</td></tr>`
      : `<tr class="closing"><td colspan="3"><strong>Closing Balance</strong></td><td class="num">—</td><td class="num"><strong>${fmtAmt(diff)}</strong></td></tr>`

    const grandRow = `
      <tr class="grand">
        <td colspan="3"><strong>Grand Total</strong></td>
        <td class="num"><strong>${fmtAmt(grandTotal)}</strong></td>
        <td class="num"><strong>${fmtAmt(grandTotal)}</strong></td>
      </tr>`

    const closingLabel = diff === 0
      ? "Fully Settled ✓"
      : closingInDebit
        ? `We owe ${name} ₹${diff.toLocaleString("en-IN")} — Carried Forward`
        : `${name} owes us ₹${diff.toLocaleString("en-IN")} — Carried Forward`

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Ledger — ${name} — ${monthLabel}</title>
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
    tr.opening td { background: #fffbea; font-style: italic; border-bottom: 1px dashed #ccc; }
    tr.subtotal td { border-top: 2px solid #000; font-weight: 700; background: #f0f0f0; }
    tr.closing td { font-weight: 700; background: #fff8dc; }
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
    <h2>Ledger</h2>
    <h3>${name}</h3>
    ${types ? `<h2 style="font-size:11px;color:#555">${types}</h2>` : ""}
    ${phone ? `<h2 style="font-size:11px;color:#555">Ph: ${phone}${address ? " | " + address : ""}</h2>` : ""}
  </div>

  <div class="meta">
    <div>
      <strong>Period:</strong> ${fromLabel} To ${toLabel}<br/>
      <strong>Entries:</strong> ${taggedFinalRows.length}
    </div>
    <div style="text-align:right">
      <strong>Generated:</strong> ${new Date().toLocaleDateString("en-IN")}<br/>
      <strong>Trader Type:</strong> ${types || "—"}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:90px">Date</th>
        <th>Particulars</th>
        <th style="width:70px">Ref No</th>
        <th class="num" style="width:110px">Debit (₹)</th>
        <th class="num" style="width:110px">Credit (₹)</th>
      </tr>
    </thead>
    <tbody>
      ${openingRow}
      ${rowsHtml}
      ${subTotalRow}
      ${closingRow}
      ${grandRow}
    </tbody>
  </table>

  <div class="closing-label">${closingLabel}</div>

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

  const loadData = async () => {
    const traderList = window.api.getTraders ? await window.api.getTraders() : []
    setTraders(traderList || [])

    if (traderList.length > 0 && !selectedTrader) {
      const initialTrader = traderList[0]
      setSelectedTrader(initialTrader.id)
      setPaymentForm(f => ({ ...f, trader: initialTrader.id }))
    }
  }

  useEffect(() => { loadData() }, [])

  const loadAdjustmentsAndLogs = async (traderId) => {
    if (!traderId) {
      setTraderAdjustments([])
      setTraderOpeningLogs([])
      return
    }
    try {
      if (window.api.getTraderAdjustments) {
        const adjs = await window.api.getTraderAdjustments(Number(traderId))
        setTraderAdjustments(adjs || [])
      }
      if (window.api.getTraderOpeningLogs) {
        const logs = await window.api.getTraderOpeningLogs(Number(traderId))
        setTraderOpeningLogs(logs || [])
      }
    } catch (e) {
      console.error("Failed to load adjustments or logs:", e)
    }
  }

  useEffect(() => {
    if (selectedTrader) {
      loadAdjustmentsAndLogs(selectedTrader)
      if (window.api.getCrossBatchTraderLedger) {
        window.api.getCrossBatchTraderLedger(Number(selectedTrader)).then(data => {
          setCrossLedger(data || [])
        }).catch(err => {
          console.error("Ledger query error:", err)
          setCrossLedger([])
        })
      }
    } else {
      setCrossLedger([])
      setTraderAdjustments([])
      setTraderOpeningLogs([])
    }
  }, [selectedTrader])

  const refreshLedger = async (traderId) => {
    if (traderId && window.api.getCrossBatchTraderLedger) {
      const data = await window.api.getCrossBatchTraderLedger(Number(traderId))
      setCrossLedger(data || [])
    }
  }

  const handleOpenAddAdjustment = () => {
    setAdjForm({
      date: today,
      direction: "trader_owes_more",
      amount: "",
      note: ""
    })
    setAdjConfirmStep(false)
    setShowAdjustmentModal(true)
  }

  const handleReviewAdjustment = (e) => {
    e?.preventDefault()
    const amt = Number(adjForm.amount)
    if (isNaN(amt) || amt <= 0) {
      return notify("Enter a valid positive adjustment amount")
    }
    if (!adjForm.note || !adjForm.note.trim()) {
      return notify("Adjustment note is required")
    }
    const currentYear = activeYear || new Date().getFullYear()
    const adjYear = parseInt((adjForm.date || "").slice(0, 4), 10)
    if (adjYear !== currentYear) {
      return notify(`Adjustment date (${adjForm.date}) must be within the active financial year (${currentYear})`)
    }
    setAdjConfirmStep(true)
  }

  const handleConfirmAdjustment = async () => {
    const amt = Number(adjForm.amount)
    const signedAmount = adjForm.direction === "trader_owes_more" ? amt : -amt
    try {
      if (window.api.insertTraderAdjustment) {
        await window.api.insertTraderAdjustment({
          trader_id: Number(selectedTrader),
          date: adjForm.date,
          amount: signedAmount,
          note: adjForm.note.trim()
        })
        notify("Adjustment recorded successfully!")
        setShowAdjustmentModal(false)
        setAdjConfirmStep(false)
        refreshLedger(selectedTrader)
        loadAdjustmentsAndLogs(selectedTrader)
      }
    } catch (err) {
      notify(`Failed to save adjustment: ${err.message}`)
    }
  }

  const handleOpenVoidModal = (adj) => {
    setVoidModalAdj(adj)
    setVoidReason("")
  }

  const handleConfirmVoid = async () => {
    if (!voidReason.trim()) {
      return notify("A reason is required to void an adjustment")
    }
    try {
      if (window.api.voidTraderAdjustment) {
        await window.api.voidTraderAdjustment(voidModalAdj.id, voidReason.trim())
        notify("Adjustment voided successfully!")
        setVoidModalAdj(null)
        setVoidReason("")
        refreshLedger(selectedTrader)
        loadAdjustmentsAndLogs(selectedTrader)
      }
    } catch (err) {
      notify(`Failed to void adjustment: ${err.message}`)
    }
  }

  const handleLogPayment = async () => {
    if (!paymentForm.trader) return notify("Select a trader to assign payment")
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) return notify("Enter a valid amount")

    const payload = {
      date: paymentForm.date,
      trader_id: Number(paymentForm.trader),
      amount: Number(paymentForm.amount),
      mode: paymentForm.mode,
      notes: paymentForm.notes,
      direction: paymentForm.direction === "from_trader" ? "from_trader" : "to_trader"
    }

    if (editingPaymentId) {
      if (window.api.updateTraderPayment) {
        await window.api.updateTraderPayment(editingPaymentId, payload)
        notify("Payment updated successfully!")
      }
      setEditingPaymentId(null)
    } else {
      if (window.api.insertTraderPayment) {
        await window.api.insertTraderPayment(payload)
        notify("Payment registered successfully!")
      }
    }

    setPaymentForm(f => ({ ...f, amount: "", notes: "" }))
    loadData()
    refreshLedger(selectedTrader)
  }

  const editPayment = (row) => {
    setEditingPaymentId(row.id)
    const direction = row.direction === "from_trader" ? "from_trader" : "to_trader"
    setPaymentForm({
      date: row.date,
      trader: String(selectedTrader),
      amount: String(direction === "from_trader" ? (row.debit || 0) : (row.credit || 0)),
      // `mode` and `notes` now come back as their own columns from the ledger
      // query — fall back to parsing particulars only for older cached rows.
      mode: row.mode || (row.particulars || "").match(/^Payment(?: Received)? \(([^)]+)\)/)?.[1] || "Cash",
      notes: row.notes || "",
      direction
    })
  }

  const cancelPaymentEdit = () => {
    setEditingPaymentId(null)
    setPaymentForm(f => ({ ...f, amount: "", notes: "", mode: "Cash", direction: "to_trader" }))
  }

  const deletePayment = async (id) => {
    if (!window.confirm("Delete this payment record?")) return
    if (window.api.deleteTraderPayment) {
      await window.api.deleteTraderPayment(id)
      notify("Payment deleted")
      loadData()
      refreshLedger(selectedTrader)
    }
  }

  const handleCreateTraderSubmit = async (e) => {
    e.preventDefault()
    if (!traderForm.name.trim()) return

    const isOpeningChanged = editingTraderId &&
      !traderForm.carried_from_year &&
      Number(traderForm.opening_balance || 0) !== Number(originalOpeningBalance || 0)

    if (isOpeningChanged) {
      if (!openingBalanceReason.trim()) {
        return notify("Reason is required when changing opening balance")
      }
      setShowOpeningConfirmModal(true)
      return
    }

    await saveTraderData()
  }

  const saveTraderData = async () => {
    const payload = {
      name: traderForm.name.trim(),
      phone: traderForm.phone,
      address: traderForm.address,
      opening_balance: Number(traderForm.opening_balance || 0),
      types: traderForm.types.join(", "),
      notes: ""
    }

    if (editingTraderId) {
      if (traderForm.carried_from_year) {
        payload.carried_from_year = traderForm.carried_from_year
      }
      if (!traderForm.carried_from_year && Number(traderForm.opening_balance || 0) !== Number(originalOpeningBalance || 0)) {
        if (window.api.updateTraderOpeningBalance) {
          await window.api.updateTraderOpeningBalance(
            editingTraderId,
            Number(traderForm.opening_balance || 0),
            openingBalanceReason.trim()
          )
        }
      }
      if (window.api.updateTrader) {
        await window.api.updateTrader(editingTraderId, payload)
        notify("Trader profile updated successfully!")
      }
    } else {
      await window.api.insertTrader(payload)
      notify("Trader profile recorded successfully!")
    }

    setShowAddTraderModal(false)
    setShowOpeningConfirmModal(false)
    setEditingTraderId(null)
    setOpeningBalanceReason("")
    setTraderForm({ name: "", phone: "", address: "", opening_balance: "0", types: [], carried_from_year: null })
    loadData()
    if (selectedTrader) {
      refreshLedger(selectedTrader)
      loadAdjustmentsAndLogs(selectedTrader)
    }
  }

  const handleEditTrader = (trader) => {
    setEditingTraderId(trader.id)
    const opBal = String(trader.opening_balance ?? "0")
    setOriginalOpeningBalance(opBal)
    setOpeningBalanceReason("")
    setTraderForm({
      name: trader.name || "",
      phone: trader.phone || "",
      address: trader.address || "",
      opening_balance: opBal,
      types: trader.types ? trader.types.split(", ").filter(Boolean) : [],
      carried_from_year: trader.carried_from_year || null
    })
    setShowAddTraderModal(true)
  }

  const handleDeleteTrader = async (trader) => {
    if (!window.confirm(`Delete trader "${trader.name}"? This cannot be undone.`)) return
    if (window.api.deleteTrader) {
      await window.api.deleteTrader(trader.id)
      notify("Trader deleted.")
      if (Number(selectedTrader) === Number(trader.id)) {
        setSelectedTrader("")
        setCrossLedger([])
      }
      loadData()
    }
  }

  const handleCheckboxProfile = (profile) => {
    setTraderForm(prev => {
      const exists = prev.types.includes(profile)
      return {
        ...prev,
        types: exists ? prev.types.filter(t => t !== profile) : [...prev.types, profile]
      }
    })
  }

  const groupedAllRows = groupBillRows(crossLedger)
  const totalCredit = groupedAllRows.reduce((s, r) => s + Number(r.credit || 0), 0)
  const totalDebit = groupedAllRows.reduce((s, r) => s + Number(r.debit || 0), 0)
  const activeTraderObj = traders.find(t => Number(t.id) === Number(selectedTrader))
  // Opening balance: negative = you owe the trader, positive = trader owes you
  // (same convention used in the printed ledger's opening-balance row)
  const openingBalance = Number(activeTraderObj?.opening_balance || 0)
  const netBalance = totalCredit - totalDebit + openingBalance

  const currentYearNum = activeYear || new Date().getFullYear()
  const yearStartDate = `${currentYearNum}-01-01`
  const displayedYearOpening = getPeriodOpeningBalance(activeTraderObj?.opening_balance, crossLedger, yearStartDate)

  const monthStartDate = `${ledgerViewDate.year}-${String(ledgerViewDate.month + 1).padStart(2, "0")}-01`
  const displayedMonthOpening = getPeriodOpeningBalance(activeTraderObj?.opening_balance, crossLedger, monthStartDate)

  // ── ledger table: search filter (existing) + month filter + grouping + pagination ──
  const ledgerSearchFiltered = crossLedger.filter(p => matchesMonth(p.date, ledgerSearch))
  const ledgerMonthFilteredRaw = ledgerSearchFiltered.filter(p => {
    if (!p.date) return false
    const d = new Date(p.date)
    return d.getFullYear() === ledgerViewDate.year && d.getMonth() === ledgerViewDate.month
  })
  // Group same-day, same-batch bill lines (medication/egg sale/feed) into one row each —
  // matches exactly what the printed ledger shows, so on-screen and print never disagree.
  const ledgerMonthFiltered = groupBillRows(
    ledgerMonthFilteredRaw.slice().sort((a, b) => new Date(b.date) - new Date(a.date))
  )
  const ledgerTotalPages = Math.max(1, Math.ceil(ledgerMonthFiltered.length / PAGE_SIZE))
  const ledgerSafePage   = Math.min(Math.max(1, ledgerPage), ledgerTotalPages)
  const ledgerPageRows   = ledgerMonthFiltered.slice((ledgerSafePage - 1) * PAGE_SIZE, ledgerSafePage * PAGE_SIZE)

  useEffect(() => { setLedgerPage(1) }, [ledgerViewDate.year, ledgerViewDate.month, ledgerSearch, selectedTrader])

  const inp = { fontSize: 13, border: "1px solid #ddd", borderRadius: 6, padding: "6px 10px", background: "#fff", width: "100%", boxSizing: "border-box" }
  const searchInp = { padding: "6px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12, width: 180, boxSizing: "border-box", background: "#f9fafb" }
  const card = { background: "#fff", border: "1px solid #eee", borderRadius: 10, padding: 16, marginBottom: 16 }
  const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #eee", color: "#888", fontWeight: 600, fontSize: 14 }
  const td = { padding: "8px 9px", borderBottom: "1px solid #f5f5f5", fontSize: 13 }
  const btn = (bg, cl) => ({ background: bg, color: cl, border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer" })

  return (
    <div>
      {saved && (
        <div style={{ background: "#E1F5EE", color: "#0F6E56", padding: "8px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 500 }}>
          ✓ {saved}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 16, marginBottom: 16 }}>

        {/* LEFT PANEL: Overview Balances details */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: "#334155" }}>Trader Account Statement & Offset Balance</span>
            <div style={{ display: "flex", gap: 8 }}>
              {selectedTrader && (
                <button onClick={() => setShowPrintModal(true)} style={{ ...btn("#1e293b", "#fff"), fontSize: 12 }}>
                  🖨 Print Ledger
                </button>
              )}
              {!isReadOnly && (
                <button onClick={() => setShowAddTraderModal(true)} style={btn("#0F6E56", "#fff")}>
                  👤 + Add Trader
                </button>
              )}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Select Active Trader Account</label>
            <select value={selectedTrader}
              onChange={e => {
                setSelectedTrader(e.target.value)
                setPaymentForm(f => ({ ...f, trader: e.target.value }))
              }}
              style={{ ...inp, background: "#f8fafc" }}>
              <option value="">Select a trader profile...</option>
              {traders.map(t => <option key={t.id} value={t.id}>{t.name} ({t.types || "No Profiles"})</option>)}
            </select>
          </div>

          {selectedTrader ? (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: "#666" }}>Total Credit (Egg Sales + Payments Made To Trader)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0F6E56", marginTop: 2 }}>₹{totalCredit.toLocaleString("en-IN")}</div>
                </div>
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: "#666" }}>Total Debit (Feed Purchases / Deliveries + Payments Received)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#A32D2D", marginTop: 2 }}>₹{totalDebit.toLocaleString("en-IN")}</div>
                </div>
              </div>

              <div style={{
                background: netBalance >= 0 ? "#E1F5EE" : "#FCEBEB",
                border: `1px solid ${netBalance >= 0 ? "#9FE1CB" : "#fca5a5"}`,
                borderRadius: 8, padding: 16, textAlign: "center"
              }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>Net Ledger Accounting Position</div>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: netBalance >= 0 ? "#0F6E56" : "#A32D2D" }}>
                  ₹{Math.abs(netBalance).toLocaleString("en-IN")}
                </h2>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: netBalance >= 0 ? "#0F6E56" : "#A32D2D" }}>
                  {netBalance >= 0 ? `${activeTraderObj?.name || 'Trader'} owes you` : `You owe ${activeTraderObj?.name || 'Trader'}`}
                </div>
              </div>

              {activeTraderObj && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 12, color: "#475569" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600 }}>Opening Balance:</span>
                    <span style={{ fontWeight: 700, color: displayedYearOpening >= 0 ? "#0F6E56" : "#A32D2D" }}>
                      ₹{Math.abs(displayedYearOpening).toLocaleString("en-IN")} {displayedYearOpening >= 0 ? "(Dr / Receivable)" : "(Cr / Payable)"}
                    </span>
                  </div>
                  {Boolean(activeTraderObj?.carried_from_year) && (
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, fontStyle: "italic" }}>
                      Opening balance carried forward from {activeTraderObj.carried_from_year}
                    </div>
                  )}
                </div>
              )}

              {!isReadOnly && activeTraderObj && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button
                    onClick={handleOpenAddAdjustment}
                    style={{ ...btn("#2563eb", "#fff"), flex: 1, fontSize: 12, fontWeight: 600 }}>
                    ⚖️ Add Adjustment
                  </button>
                  <button
                    onClick={() => handleEditTrader(activeTraderObj)}
                    style={{ ...btn("#eef2ff", "#1d4ed8"), flex: 1, fontSize: 12 }}>
                    ✏️ Edit Details
                  </button>
                  <button
                    onClick={() => handleDeleteTrader(activeTraderObj)}
                    style={{ ...btn("#FCEBEB", "#A32D2D"), flex: 1, fontSize: 12 }}>
                    🗑 Delete
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#aaa", fontSize: 13 }}>
              Select a trader from the options to monitor consolidated statements.
            </div>
          )}
        </div>

        {/* RIGHT PANEL: Log Payment Form */}
        <div style={card}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: "#1d4ed8" }}>
            💳 {editingPaymentId ? "Edit Payment Settlement" : "Log Payment Settlement"}
          </div>

          {!editingPaymentId && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button type="button"
                onClick={() => setPaymentForm(f => ({ ...f, direction: "to_trader" }))}
                style={{
                  flex: 1, padding: "8px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: paymentForm.direction === "to_trader" ? "2px solid #1d4ed8" : "1px solid #ddd",
                  background: paymentForm.direction === "to_trader" ? "#eef2ff" : "#fff",
                  color: paymentForm.direction === "to_trader" ? "#1d4ed8" : "#666"
                }}>
                ⬆ Payment Sent
              </button>
              <button type="button"
                onClick={() => setPaymentForm(f => ({ ...f, direction: "from_trader" }))}
                style={{
                  flex: 1, padding: "8px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: paymentForm.direction === "from_trader" ? "2px solid #0F6E56" : "1px solid #ddd",
                  background: paymentForm.direction === "from_trader" ? "#f0fdf4" : "#fff",
                  color: paymentForm.direction === "from_trader" ? "#0F6E56" : "#666"
                }}>
                ⬇ Payment Received
              </button>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>
                {paymentForm.direction === "from_trader" ? "Received From (Trader Profile Source) *" : "Paying To (Trader Profile Target) *"}
              </label>
              <select value={paymentForm.trader}
                onChange={e => setPaymentForm({ ...paymentForm, trader: e.target.value })} style={inp}>
                <option value="">{paymentForm.direction === "from_trader" ? "Choose matching payer..." : "Choose matching payee..."}</option>
                {traders.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Transaction Date</label>
              <input type="date" value={paymentForm.date}
                onChange={e => setPaymentForm(f => ({ ...f, date: e.target.value }))} style={inp} />
            </div>

            <div>
              <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Amount Settled (₹)</label>
              <input type="number" min="0" placeholder="e.g. 50000" onWheel={(e) => e.target.blur()}
                value={paymentForm.amount}
                onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} style={inp} />
            </div>

            <div>
              <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Payment Mode</label>
              <select value={paymentForm.mode}
                onChange={e => setPaymentForm(f => ({ ...f, mode: e.target.value }))} style={inp}>
                <option>Cash</option>
                <option>UPI/NEFT</option>
                <option>Cheque</option>
                <option>Bank Transfer</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Notes / Reference</label>
              <input placeholder="Receipt invoice numbers..."
                value={paymentForm.notes}
                onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))} style={inp} />
            </div>

            {editingPaymentId && (
              <div style={{
                fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, width: "fit-content",
                background: paymentForm.direction === "from_trader" ? "#f0fdf4" : "#eef2ff",
                color: paymentForm.direction === "from_trader" ? "#0F6E56" : "#1d4ed8"
              }}>
                {paymentForm.direction === "from_trader" ? "⬇ Trader Pays Us" : "⬆ We Pay Trader"}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleLogPayment}
                style={{
                  background: paymentForm.direction === "from_trader" ? "#0F6E56" : "#1d4ed8",
                  color: "#fff", border: "none", borderRadius: 6, padding: "10px", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 4, flex: 1
                }}>
                {editingPaymentId ? "Update Payment" : (paymentForm.direction === "from_trader" ? "Log Payment Received" : "Log Payment Transaction")}
              </button>
              {editingPaymentId && (
                <button onClick={cancelPaymentEdit}
                  style={{ ...btn("#e5e7eb", "#333"), marginTop: 4 }}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ADJUSTMENTS & AUDIT HISTORY PANEL */}
      {selectedTrader && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>
              ⚖️ Adjustments & History — {activeTraderObj?.name}
            </span>
            {!isReadOnly && (
              <button onClick={handleOpenAddAdjustment} style={{ ...btn("#2563eb", "#fff"), fontSize: 12, fontWeight: 600 }}>
                + Add Adjustment
              </button>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              Adjustments ({traderAdjustments.length})
            </div>
            {traderAdjustments.length === 0 ? (
              <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic", padding: "6px 0" }}>
                No adjustments recorded for this trader.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ ...th, fontSize: 12 }}>Date</th>
                    <th style={{ ...th, fontSize: 12 }}>Adjustment Note</th>
                    <th style={{ ...th, fontSize: 12, textAlign: "right" }}>Amount</th>
                    <th style={{ ...th, fontSize: 12, textAlign: "center" }}>Status</th>
                    {!isReadOnly && <th style={{ ...th, fontSize: 12, textAlign: "center", width: 80 }}>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {traderAdjustments.map(adj => {
                    const isVoided = Boolean(adj.voided)
                    const isPositive = adj.amount > 0
                    return (
                      <tr key={adj.id} style={{ borderBottom: "1px solid #f1f5f9", background: isVoided ? "#fafafa" : "#fff" }}>
                        <td style={td}>
                          {isVoided ? <s style={{ color: "#94a3b8" }}>{fmtDate(adj.date)}</s> : fmtDate(adj.date)}
                        </td>
                        <td style={td}>
                          {isVoided ? (
                            <div>
                              <s style={{ color: "#94a3b8" }}>{adj.note}</s>
                              <div style={{ fontSize: 10, color: "#b91c1c", marginTop: 2, fontStyle: "italic" }}>
                                Voided: {adj.void_reason} {adj.voided_at ? `(${adj.voided_at.slice(0, 10)})` : ""}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontWeight: 500 }}>{adj.note}</span>
                          )}
                        </td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                          {isVoided ? (
                            <s style={{ color: "#94a3b8" }}>{formatINR(adj.amount)}</s>
                          ) : (
                            <span style={{ color: isPositive ? "#0F6E56" : "#A32D2D" }}>
                              {isPositive ? `+${formatINR(adj.amount)}` : formatINR(adj.amount)}
                            </span>
                          )}
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          {isVoided ? (
                            <span style={{ background: "#fee2e2", color: "#b91c1c", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                              Voided
                            </span>
                          ) : (
                            <span style={{ background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                              Active
                            </span>
                          )}
                        </td>
                        {!isReadOnly && (
                          <td style={{ ...td, textAlign: "center" }}>
                            {!isVoided && (
                              <button
                                onClick={() => handleOpenVoidModal(adj)}
                                style={{ ...btn("#fee2e2", "#b91c1c"), padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>
                                Void
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Opening Balance Audit Log */}
          {traderOpeningLogs.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                Opening Balance Audit Log ({traderOpeningLogs.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {traderOpeningLogs.map(log => (
                  <div key={log.id} style={{ fontSize: 11, padding: "6px 10px", background: "#f8fafc", borderRadius: 6, border: "1px solid #f1f5f9", color: "#475569" }}>
                    <span style={{ fontWeight: 600, color: "#1e293b" }}>{log.changed_at ? log.changed_at.slice(0, 16) : ""}</span>: Changed from{" "}
                    <strong>{formatINR(log.old_value)}</strong> to <strong>{formatINR(log.new_value)}</strong> — Reason: <em>{log.reason}</em>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* LOWER PANEL: Consolidated Statement Ledger History */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Unified Statement Ledger History</span>
          <input
            style={searchInp}
            placeholder="Search e.g. jan 2026"
            value={ledgerSearch}
            onChange={e => setLedgerSearch(e.target.value)}
          />
        </div>

        {activeTraderObj && (
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10, fontStyle: "italic" }}>
            Opening Balance: ₹{Math.abs(displayedMonthOpening).toLocaleString("en-IN")} {displayedMonthOpening >= 0 ? "(Dr)" : "(Cr)"}
            {activeTraderObj.carried_from_year ? ` — Opening balance carried forward from ${activeTraderObj.carried_from_year}` : ""}
          </div>
        )}

        {/* month nav (left) + page nav (right) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={goPrevLedgerMonth} aria-label="Previous month"
              style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#475569" }}>
              ‹
            </button>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <span style={{
                fontSize: 13, fontWeight: 700, color: "#1e293b",
                border: "1px solid #ddd", borderRadius: 6, padding: "5px 12px",
                background: "#fff", minWidth: 130, textAlign: "center",
              }}>
                {ledgerMonthLabel}
              </span>
              <input type="month" value={ledgerMonthInputValue} onChange={handleLedgerMonthInputChange}
                title="Jump to month"
                style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
            </div>
            <button onClick={goNextLedgerMonth} aria-label="Next month"
              style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#475569" }}>
              ›
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setLedgerPage(p => Math.max(1, p - 1))} disabled={ledgerSafePage <= 1} aria-label="Previous page"
              style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: ledgerSafePage <= 1 ? "not-allowed" : "pointer", fontSize: 14, color: ledgerSafePage <= 1 ? "#ccc" : "#475569" }}>
              ‹
            </button>
            <span style={{
              fontSize: 13, fontWeight: 700, color: "#1e293b",
              border: "1px solid #ddd", borderRadius: 6, padding: "5px 12px",
              background: "#fff", minWidth: 90, textAlign: "center",
            }}>
              Page {ledgerSafePage} / {ledgerTotalPages}
            </span>
            <button onClick={() => setLedgerPage(p => Math.min(ledgerTotalPages, p + 1))} disabled={ledgerSafePage >= ledgerTotalPages} aria-label="Next page"
              style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: ledgerSafePage >= ledgerTotalPages ? "not-allowed" : "pointer", fontSize: 14, color: ledgerSafePage >= ledgerTotalPages ? "#ccc" : "#475569" }}>
              ›
            </button>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Date</th>
              <th style={th}>Batch ID</th>
              <th style={th}>Particulars Description</th>
              <th style={th}>Debit (Eggs Given / Medicine)</th>
              <th style={th}>Credit (Feed Received / Payments)</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {ledgerSafePage === 1 && displayedMonthOpening !== 0 && (
              <tr style={{ background: "#fffbea", fontStyle: "italic" }}>
                <td style={td}>—</td>
                <td style={td}>
                  <span style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4, fontSize: 11, color: "#475569" }}>
                    —
                  </span>
                </td>
                <td style={td}>
                  <strong>Opening Balance</strong>
                  {activeTraderObj?.carried_from_year && (
                    <div style={{ fontSize: 10, color: "#64748b", fontStyle: "italic", fontWeight: "normal" }}>
                      Opening balance carried forward from {activeTraderObj.carried_from_year}
                    </div>
                  )}
                </td>
                <td style={{ ...td, color: "#A32D2D" }}>
                  {displayedMonthOpening < 0 ? `₹${Math.abs(displayedMonthOpening).toLocaleString("en-IN")}` : "—"}
                </td>
                <td style={{ ...td, color: "#0F6E56" }}>
                  {displayedMonthOpening > 0 ? `₹${displayedMonthOpening.toLocaleString("en-IN")}` : "—"}
                </td>
                <td style={td}></td>
              </tr>
            )}
            {ledgerMonthFiltered.length === 0 && (ledgerSafePage > 1 || displayedMonthOpening === 0) ? (
              <tr><td colSpan="6" style={{ ...td, textAlign: "center", color: "#aaa" }}>No transaction history logs selected.</td></tr>
            ) : (
              ledgerPageRows.map((p, i) => (
                <tr key={p.id ? `${p.source}-${p.id}` : i}>
                  <td style={td}>{p.__showDate === false ? "" : fmtDate(p.date)}</td>
                  <td style={td}>
                    <span style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4, fontSize: 11, color: "#475569" }}>
                      {p.batch_id}
                    </span>
                  </td>
                  <td style={td}><strong>{(p.particulars || "").split("<br/>").map((line, li) => (
                    <span key={li}>{li > 0 && <br />}{line}</span>
                  ))}</strong></td>
                  <td style={{ ...td, color: "#A32D2D" }}>{p.debit > 0 ? `₹${Number(p.debit).toLocaleString("en-IN")}` : "—"}</td>
                  <td style={{ ...td, color: "#0F6E56" }}>{p.credit > 0 ? `₹${Number(p.credit).toLocaleString("en-IN")}` : "—"}</td>
                  <td style={td}>
                    {p.source === "payment" ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => editPayment(p)} style={{ ...btn("#eef2ff", "#1d4ed8"), padding: "3px 10px", fontSize: 11 }}>Edit</button>
                        <button onClick={() => deletePayment(p.id)} style={{ ...btn("#FCEBEB", "#A32D2D"), padding: "3px 10px", fontSize: 11 }}>Delete</button>
                      </div>
                    ) : p.source === "adjustment" ? (
                      <span style={{ fontSize: 11, color: "#475569", fontWeight: 500 }}>
                        Adjustment
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: "#aaa" }} title="Edit this from the batch's own tab">
                        Edit in batch {p.batch_id}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setLedgerPage(p => Math.max(1, p - 1))} disabled={ledgerSafePage <= 1} aria-label="Previous page"
              style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: ledgerSafePage <= 1 ? "not-allowed" : "pointer", fontSize: 14, color: ledgerSafePage <= 1 ? "#ccc" : "#475569" }}>
              ‹
            </button>
            <span style={{
              fontSize: 13, fontWeight: 700, color: "#1e293b",
              border: "1px solid #ddd", borderRadius: 6, padding: "5px 12px",
              background: "#fff", minWidth: 90, textAlign: "center",
            }}>
              Page {ledgerSafePage} / {ledgerTotalPages}
            </span>
            <button onClick={() => setLedgerPage(p => Math.min(ledgerTotalPages, p + 1))} disabled={ledgerSafePage >= ledgerTotalPages} aria-label="Next page"
              style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: ledgerSafePage >= ledgerTotalPages ? "not-allowed" : "pointer", fontSize: 14, color: ledgerSafePage >= ledgerTotalPages ? "#ccc" : "#475569" }}>
              ›
            </button>
          </div>
        </div>
      </div>

      {/* Popup Overlay Modal */}
      {showAddTraderModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 99999 }} onClick={() => { setShowAddTraderModal(false); setEditingTraderId(null); setTraderForm({ name: "", phone: "", address: "", opening_balance: "0", types: [] }) }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: "480px", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, fontSize: 16, fontWeight: 600 }}>
              <span>{editingTraderId ? "Edit Trader Profile" : "Add New Trader Profile Account"}</span>
              <button style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#888" }} onClick={() => { setShowAddTraderModal(false); setEditingTraderId(null); setTraderForm({ name: "", phone: "", address: "", opening_balance: "0", types: [] }) }}>&times;</button>
            </div>

            <form onSubmit={handleCreateTraderSubmit}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 4 }}>Trader Name *</label>
                <input type="text" placeholder="e.g. Trader Name" required value={traderForm.name} style={inp} onChange={e => setTraderForm({ ...traderForm, name: e.target.value })} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 4 }}>Phone</label>
                  <input type="text" placeholder="Contact link" value={traderForm.phone} style={inp} onChange={e => setTraderForm({ ...traderForm, phone: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 4 }}>Opening Balance (₹)</label>
                  {Boolean(traderForm.carried_from_year && editingTraderId) ? (
                    <div>
                      <input type="number" value={traderForm.opening_balance} readOnly
                        style={{ ...inp, background: "#f1f5f9", color: "#64748b", cursor: "not-allowed" }} />
                      <div style={{ fontSize: 11, color: "#d97706", marginTop: 4, fontWeight: 500 }}>
                        Carried forward from {traderForm.carried_from_year}. To correct it, add an adjustment.
                      </div>
                    </div>
                  ) : (
                    <div>
                      <input type="number" value={traderForm.opening_balance} style={inp} onWheel={(e) => e.target.blur()}
                        onChange={e => setTraderForm({ ...traderForm, opening_balance: e.target.value })} />
                      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3 }}>
                        Positive = trader owes you &nbsp;·&nbsp; Negative (e.g. -5000) = you owe trader
                      </div>
                      {editingTraderId && Number(traderForm.opening_balance || 0) !== Number(originalOpeningBalance || 0) && (
                        <div style={{ marginTop: 8 }}>
                          <label style={{ fontSize: 11, color: "#b91c1c", fontWeight: 600, display: "block", marginBottom: 2 }}>
                            Reason for Opening Balance Change *
                          </label>
                          <input type="text" placeholder="Explain reason for change..." required value={openingBalanceReason}
                            onChange={e => setOpeningBalanceReason(e.target.value)} style={inp} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 4 }}>Address Particulars</label>
                <input type="text" placeholder="Location yard" value={traderForm.address} style={inp} onChange={e => setTraderForm({ ...traderForm, address: e.target.value })} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: "#444", fontWeight: 600, display: "block", marginBottom: 8 }}>Select Trader Profile Categories:</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {TRADER_PROFILES.map(p => {
                    const isChecked = traderForm.types.includes(p)
                    return (
                      <label key={p} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", padding: "4px 0" }}>
                        <input type="checkbox" checked={isChecked} onChange={() => handleCheckboxProfile(p)} style={{ cursor: "pointer" }} />
                        {p}
                      </label>
                    )
                  })}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button type="button" style={btn("#e5e7eb", "#333")} onClick={() => { setShowAddTraderModal(false); setEditingTraderId(null); setTraderForm({ name: "", phone: "", address: "", opening_balance: "0", types: [] }) }}>Cancel</button>
                <button type="submit" style={{ ...btn("#0F6E56", "#fff"), fontWeight: 600 }}>{editingTraderId ? "Update Trader" : "Save Trader Profile"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Print Date Range Picker Modal */}
      {showPrintModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 99999 }}
          onClick={() => setShowPrintModal(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 380, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: "#1e293b" }}>🖨 Print Ledger Statement</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>From Date</label>
                <input type="date" value={printFrom} onChange={e => setPrintFrom(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>To Date</label>
                <input type="date" value={printTo} onChange={e => setPrintTo(e.target.value)} style={inp} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 20 }}>
              Leave dates blank to include the full history.
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowPrintModal(false)} style={btn("#e5e7eb", "#333")}>Cancel</button>
              <button onClick={handlePrint} style={{ ...btn("#1e293b", "#fff"), fontWeight: 600 }}>Print</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Adjustment Modal */}
      {showAdjustmentModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 99999 }}
          onClick={() => { setShowAdjustmentModal(false); setAdjConfirmStep(false) }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: "460px", boxShadow: "0 8px 30px rgba(0,0,0,0.2)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>
              <span>⚖️ Add Trader Adjustment</span>
              <button style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#888" }}
                onClick={() => { setShowAdjustmentModal(false); setAdjConfirmStep(false) }}>&times;</button>
            </div>

            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14, lineHeight: "1.4" }}>
              This changes the trader's balance only. It does not change sales or profit reports.
            </div>

            {!adjConfirmStep ? (
              <form onSubmit={handleReviewAdjustment}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 4 }}>Trader</label>
                  <input type="text" readOnly value={activeTraderObj?.name || ""} style={{ ...inp, background: "#f8fafc", color: "#64748b" }} />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 4 }}>Adjustment Date *</label>
                  <input type="date" required value={adjForm.date} onChange={e => setAdjForm({ ...adjForm, date: e.target.value })} style={inp} />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: "#444", fontWeight: 600, display: "block", marginBottom: 6 }}>Direction of Adjustment *</label>
                  <div style={{ display: "flex", gap: 10 }}>
                    <label style={{
                      flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                      border: adjForm.direction === "trader_owes_more" ? "2px solid #0F6E56" : "1px solid #e2e8f0",
                      background: adjForm.direction === "trader_owes_more" ? "#f0fdf4" : "#fff",
                      fontSize: 12, fontWeight: 600, color: adjForm.direction === "trader_owes_more" ? "#0F6E56" : "#475569"
                    }}>
                      <input type="radio" name="adj_direction" value="trader_owes_more" checked={adjForm.direction === "trader_owes_more"}
                        onChange={() => setAdjForm({ ...adjForm, direction: "trader_owes_more" })} />
                      Trader owes me more (+)
                    </label>
                    <label style={{
                      flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                      border: adjForm.direction === "farm_owes_trader" ? "2px solid #A32D2D" : "1px solid #e2e8f0",
                      background: adjForm.direction === "farm_owes_trader" ? "#fef2f2" : "#fff",
                      fontSize: 12, fontWeight: 600, color: adjForm.direction === "farm_owes_trader" ? "#A32D2D" : "#475569"
                    }}>
                      <input type="radio" name="adj_direction" value="farm_owes_trader" checked={adjForm.direction === "farm_owes_trader"}
                        onChange={() => setAdjForm({ ...adjForm, direction: "farm_owes_trader" })} />
                      I owe trader more (-)
                    </label>
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 4 }}>Amount (₹, positive number) *</label>
                  <input type="number" min="0.01" step="any" placeholder="e.g. 5000" required value={adjForm.amount}
                    onWheel={(e) => e.target.blur()} onChange={e => setAdjForm({ ...adjForm, amount: e.target.value })} style={inp} />
                </div>

                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 4 }}>Reason / Note *</label>
                  <input type="text" placeholder="e.g. Dec rate discount correction" required value={adjForm.note}
                    onChange={e => setAdjForm({ ...adjForm, note: e.target.value })} style={inp} />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button type="button" style={btn("#e5e7eb", "#333")} onClick={() => setShowAdjustmentModal(false)}>Cancel</button>
                  <button type="submit" style={{ ...btn("#2563eb", "#fff"), fontWeight: 600 }}>Review Adjustment →</button>
                </div>
              </form>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
                  Please review and confirm this adjustment:
                </div>

                <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12, border: "1px solid #e2e8f0", fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div><strong>Trader:</strong> {activeTraderObj?.name}</div>
                  <div><strong>Date:</strong> {fmtDate(adjForm.date)}</div>
                  <div><strong>Type:</strong> {adjForm.direction === "trader_owes_more" ? "Trader owes me more (+)" : "I owe trader more (-)"}</div>
                  <div><strong>Adjustment Amount:</strong> {formatINR(adjForm.direction === "trader_owes_more" ? Number(adjForm.amount) : -Number(adjForm.amount))}</div>
                  <div><strong>Note:</strong> {adjForm.note}</div>
                </div>

                {(() => {
                  const delta = adjForm.direction === "trader_owes_more" ? Number(adjForm.amount || 0) : -Number(adjForm.amount || 0)
                  const nextBalance = netBalance + delta
                  return (
                    <div style={{ margin: "16px 0", padding: "12px 14px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0", textAlign: "center", fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                      Trader balance will change from <span style={{ color: netBalance >= 0 ? "#0F6E56" : "#A32D2D" }}>{formatINR(netBalance)}</span> to <span style={{ color: nextBalance >= 0 ? "#0F6E56" : "#A32D2D" }}>{formatINR(nextBalance)}</span>
                    </div>
                  )
                })()}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button type="button" style={btn("#e5e7eb", "#333")} onClick={() => setAdjConfirmStep(false)}>← Back</button>
                  <button type="button" onClick={handleConfirmAdjustment} style={{ ...btn("#0F6E56", "#fff"), fontWeight: 700 }}>Confirm & Save Adjustment</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Void Adjustment Modal */}
      {voidModalAdj && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 99999 }}
          onClick={() => setVoidModalAdj(null)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: "420px", boxShadow: "0 8px 30px rgba(0,0,0,0.2)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: "#b91c1c" }}>
              ⚠️ Void Adjustment
            </div>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 12 }}>
              Are you sure you want to void the adjustment of <strong>{formatINR(voidModalAdj.amount)}</strong> dated <strong>{fmtDate(voidModalAdj.date)}</strong> ({voidModalAdj.note})?
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 4 }}>Reason for voiding *</label>
              <input type="text" placeholder="e.g. Entered in error / duplicate" required value={voidReason} onChange={e => setVoidReason(e.target.value)} style={inp} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btn("#e5e7eb", "#333")} onClick={() => setVoidModalAdj(null)}>Cancel</button>
              <button style={{ ...btn("#b91c1c", "#fff"), fontWeight: 600 }} onClick={handleConfirmVoid}>Confirm Void</button>
            </div>
          </div>
        </div>
      )}

      {/* Opening Balance Confirm Modal */}
      {showOpeningConfirmModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 999999 }}
          onClick={() => setShowOpeningConfirmModal(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: "420px", boxShadow: "0 8px 30px rgba(0,0,0,0.2)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: "#1e293b" }}>
              Confirm Opening Balance Change
            </div>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 12 }}>
              Opening balance will change from <strong>{formatINR(originalOpeningBalance)}</strong> to <strong>{formatINR(traderForm.opening_balance)}</strong>.
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
              <strong>Reason:</strong> {openingBalanceReason}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btn("#e5e7eb", "#333")} onClick={() => setShowOpeningConfirmModal(false)}>Cancel</button>
              <button style={{ ...btn("#0F6E56", "#fff"), fontWeight: 600 }} onClick={saveTraderData}>Confirm & Save</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}