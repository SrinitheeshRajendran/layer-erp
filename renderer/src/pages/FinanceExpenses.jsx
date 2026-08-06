import { useState, useEffect } from "react"

const fmtDate = d => d ? d.split("-").reverse().join("-") : ""

export default function FinanceExpenses({ isReadOnly = false }) {
  const today = new Date().toISOString().slice(0, 10)

  const [summary, setSummary] = useState(null)
  const [batches, setBatches] = useState([])
  const [selectedBatch, setSelectedBatch] = useState("")
  const [batchProfit, setBatchProfit] = useState(null)
  const [batchExpenseList, setBatchExpenseList] = useState([])

  const [farmExpenses, setFarmExpenses] = useState([])
  const [showFarmExpenseForm, setShowFarmExpenseForm] = useState(false)
  const [editingFarmExpenseId, setEditingFarmExpenseId] = useState(null)
  const [farmExpenseSearch, setFarmExpenseSearch] = useState("")

  const blankFarmExpenseForm = {
    date: today,
    expense_type: "Farm Maintenance",
    amount: "",
    notes: ""
  }
  const [farmExpenseForm, setFarmExpenseForm] = useState(blankFarmExpenseForm)

  const [loading, setLoading] = useState(true)

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

  function matchesMonth(dateStr, query) {
    if (!query) return true
    if (!dateStr) return false
    const d = new Date(dateStr)
    if (isNaN(d)) return dateStr.toLowerCase().includes(query.toLowerCase())
    const monthName = d.toLocaleString("default", { month: "long" }).toLowerCase()
    const monthShort = d.toLocaleString("default", { month: "short" }).toLowerCase()
    const year = String(d.getFullYear())
    const q = query.toLowerCase().trim()
    return (
      dateStr.toLowerCase().includes(q) ||
      monthName.includes(q) ||
      monthShort.includes(q) ||
      year.includes(q) ||
      `${monthName} ${year}`.includes(q) ||
      `${monthShort} ${year}`.includes(q)
    )
  }

  async function loadGlobal() {
    try {
      setLoading(true)
      const [globalSummary, batchList, farmExpenseList] = await Promise.all([
        window.api.getGlobalFinanceSummary(),
        window.api.getBatches(),
        window.api.getFarmExpenses()
      ])
      setSummary(globalSummary)
      setBatches(batchList || [])
      setFarmExpenses(farmExpenseList || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function loadBatchBreakdown(batchId) {
    if (!batchId) {
      setBatchProfit(null)
      setBatchExpenseList([])
      return
    }
    try {
      const [profitability, expenseList] = await Promise.all([
        window.api.getBatchProfitability(batchId),
        window.api.getBatchExpensesByBatch(batchId)
      ])
      setBatchProfit(profitability)
      setBatchExpenseList(expenseList || [])
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadGlobal()
  }, [])

  useEffect(() => {
    loadBatchBreakdown(selectedBatch)
  }, [selectedBatch])

  async function saveFarmExpense() {
    try {
      if (!farmExpenseForm.amount || Number(farmExpenseForm.amount) <= 0) return

      if (editingFarmExpenseId) {
        await window.api.updateFarmExpense(editingFarmExpenseId, farmExpenseForm)
      } else {
        await window.api.insertFarmExpense(farmExpenseForm)
      }

      setShowFarmExpenseForm(false)
      setEditingFarmExpenseId(null)
      setFarmExpenseForm(blankFarmExpenseForm)

      loadGlobal()
      if (selectedBatch) loadBatchBreakdown(selectedBatch)
    } catch (err) {
      console.error(err)
    }
  }

  function editFarmExpense(ex) {
    setEditingFarmExpenseId(ex.id)
    setFarmExpenseForm({
      date: ex.date || today,
      expense_type: ex.expense_type || "Farm Maintenance",
      amount: ex.amount ?? "",
      notes: ex.notes || ""
    })
    setShowFarmExpenseForm(true)
  }

  function cancelFarmExpenseForm() {
    setShowFarmExpenseForm(false)
    setEditingFarmExpenseId(null)
    setFarmExpenseForm(blankFarmExpenseForm)
  }

  async function deleteFarmExpense(id) {
    if (!window.confirm("Delete this farm expense record?")) return
    await window.api.deleteFarmExpense(id)
    loadGlobal()
  }

  if (loading && !summary) {
    return <div style={{ fontSize: 13, color: "#888" }}>Loading finance data...</div>
  }

  const totalRevenue = Number(summary?.revenue || 0)
  const totalExpenses = Number(summary?.expenses || 0)
  const netProfit = Number(summary?.net_profit || 0)

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
      {/* GLOBAL BANNER */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 12,
          marginBottom: 20
        }}
      >
        <div style={card}>
          <div>Total Revenue (All Batches)</div>
          <h2>₹{totalRevenue.toLocaleString()}</h2>
        </div>

        <div style={card}>
          <div>Total Expenses (Batches + Farm)</div>
          <h2>₹{totalExpenses.toLocaleString()}</h2>
        </div>

        <div style={card}>
          <div>Net Profit</div>
          <h2 style={{ color: netProfit >= 0 ? "#0F6E56" : "#A32D2D" }}>
            ₹{netProfit.toLocaleString()}
          </h2>
        </div>
      </div>

      {/* GLOBAL EXPENSE BREAKDOWN */}
      <div style={{ ...card, marginBottom: 20 }}>
        <h3>Overall Expense Breakdown</h3>
        <table style={{ width: "100%" }}>
          <tbody>
            <tr>
              <td>Chick Capital Cost (all batches)</td>
              <td>₹{Number(summary?.chick_cost || 0).toLocaleString()}</td>
            </tr>
            <tr>
              <td>Feed Expenses (all batches)</td>
              <td>₹{Number(summary?.feed_cost || 0).toLocaleString()}</td>
            </tr>
            <tr>
              <td>Medication Expenses (all batches)</td>
              <td>₹{Number(summary?.medication_cost || 0).toLocaleString()}</td>
            </tr>
            <tr>
              <td>Batch-wise Other Expenses (maintenance, electricity, labor, etc.)</td>
              <td>₹{Number(summary?.batch_other_expenses || 0).toLocaleString()}</td>
            </tr>
            <tr>
              <td>Farm-wide Global Expenses</td>
              <td>₹{Number(summary?.farm_expenses || 0).toLocaleString()}</td>
            </tr>
            <tr style={{ borderTop: "2px solid #ccc" }}>
              <td><strong>Total Expenses</strong></td>
              <td><strong>₹{totalExpenses.toLocaleString()}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* BATCH-WISE DROPDOWN BREAKDOWN */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 15
          }}
        >
          <h3 style={{ margin: 0 }}>Batch-wise Finance Breakdown</h3>

          <select
            value={selectedBatch}
            onChange={e => setSelectedBatch(e.target.value)}
            style={{ ...inp, width: 220 }}
          >
            <option value="">Select a batch...</option>
            {batches.map(b => (
              <option key={b.id} value={b.batch_id}>{b.batch_id}</option>
            ))}
          </select>
        </div>

        {!selectedBatch && (
          <div style={{ color: "#aaa" }}>Select a batch above to view its revenue, expenses and net profit.</div>
        )}

        {selectedBatch && batchProfit && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 12,
                marginBottom: 16
              }}
            >
              <div style={card}>
                <div>Revenue</div>
                <h3>₹{Number(batchProfit.revenue || 0).toLocaleString()}</h3>
              </div>
              <div style={card}>
                <div>Expenses</div>
                <h3>₹{Number(batchProfit.expenses || 0).toLocaleString()}</h3>
              </div>
              <div style={card}>
                <div>Net Profit</div>
                <h3 style={{ color: Number(batchProfit.net_profit || 0) >= 0 ? "#0F6E56" : "#A32D2D" }}>
                  ₹{Number(batchProfit.net_profit || 0).toLocaleString()}
                </h3>
              </div>
            </div>

            <table style={{ width: "100%", marginBottom: 16 }}>
              <tbody>
                <tr>
                  <td>Chick Capital Cost</td>
                  <td>₹{Number(batchProfit.chick_cost || 0).toLocaleString()}</td>
                </tr>
                <tr>
                  <td>Feed Expenses</td>
                  <td>₹{Number(batchProfit.feed_cost || 0).toLocaleString()}</td>
                </tr>
                <tr>
                  <td>Vaccine Expenses</td>
                  <td>₹{Number(batchProfit.vaccine_cost || 0).toLocaleString()}</td>
                </tr>
                <tr>
                  <td>Medical Expenses</td>
                  <td>₹{Number(batchProfit.medical_cost || 0).toLocaleString()}</td>
                </tr>
                <tr>
                  <td>Other Expenses (maintenance, electricity, labor)</td>
                  <td>₹{Number(batchProfit.other_expenses || 0).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
              Other Expense Entries for {selectedBatch}
            </div>
            <table style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {batchExpenseList.map(ex => (
                  <tr key={ex.id}>
                    <td>{fmtDate(ex.date)}</td>
                    <td>{ex.expense_type || "Other"}</td>
                    <td>₹{Number(ex.amount || 0).toLocaleString()}</td>
                    <td>{ex.notes || "-"}</td>
                  </tr>
                ))}
                {batchExpenseList.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: "#aaa", padding: "10px 0" }}>
                      No other expenses logged for this batch yet. Add them from the batch's Finance tab.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* GLOBAL / FARM-WIDE EXPENSES ENTRY */}
      <div style={card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 15
          }}
        >
          <h3 style={{ margin: 0 }}>Global Farm Expenses (Maintenance, Electricity, Labor Salary, etc.)</h3>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              style={searchInp}
              placeholder="e.g. jan 2026"
              value={farmExpenseSearch}
              onChange={e => setFarmExpenseSearch(e.target.value)}
            />
            <button
              style={btn("#0F6E56")}
              onClick={() =>
                !isReadOnly && (showFarmExpenseForm ? cancelFarmExpenseForm() : setShowFarmExpenseForm(true))
              }
            >
              {isReadOnly ? "" : showFarmExpenseForm ? "Cancel" : "+ Add Global Expense"}
            </button>
          </div>
        </div>

        <p style={{ color: "#888", marginTop: 0 }}>
          These are farm-wide costs not tied to a specific batch (e.g. shared electricity lines, farm maintenance,
          general labor salary). They are subtracted from the overall revenue across all batches above.
        </p>

        {showFarmExpenseForm && (
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#0F6E56", marginBottom: 10 }}>
              {editingFarmExpenseId ? "Edit Global Expense" : "New Global Expense"}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input
                type="date"
                value={farmExpenseForm.date}
                style={inp}
                onChange={e => setFarmExpenseForm({ ...farmExpenseForm, date: e.target.value })}
              />

              <select
                value={farmExpenseForm.expense_type}
                style={inp}
                onChange={e => setFarmExpenseForm({ ...farmExpenseForm, expense_type: e.target.value })}
              >
                <option value="Farm Maintenance">Farm Maintenance</option>
                <option value="Electricity">Electricity</option>
                <option value="Labor Salary">Labor Salary</option>
                <option value="Water">Water</option>
                <option value="Equipment">Equipment</option>
                <option value="Transport">Transport</option>
                <option value="Repairs">Repairs</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <input
              type="number" onWheel={(e) => e.target.blur()}
              placeholder="Amount (₹)"
              value={farmExpenseForm.amount}
              style={{ ...inp, marginTop: 10 }}
              onChange={e => setFarmExpenseForm({ ...farmExpenseForm, amount: e.target.value })}
            />

            <textarea
              placeholder="Notes (optional)"
              value={farmExpenseForm.notes}
              rows={2}
              style={{ ...inp, marginTop: 10, resize: "vertical" }}
              onChange={e => setFarmExpenseForm({ ...farmExpenseForm, notes: e.target.value })}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button style={btn("#0F6E56")} onClick={saveFarmExpense}>
                {editingFarmExpenseId ? "Update Expense" : "Save Expense"}
              </button>
              <button style={btn("#e5e7eb", "#333")} onClick={cancelFarmExpenseForm}>
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
            {farmExpenses
              .filter(ex => matchesMonth(ex.date, farmExpenseSearch))
              .map(ex => (
                <tr key={ex.id}>
                  <td>{fmtDate(ex.date)}</td>
                  <td>{ex.expense_type || "Other"}</td>
                  <td>₹{Number(ex.amount || 0).toLocaleString()}</td>
                  <td>{ex.notes || "-"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {!isReadOnly && <button
                        onClick={() => editFarmExpense(ex)}
                        style={{ ...btn("#eef2ff", "#1d4ed8"), padding: "3px 10px", fontSize: 11 }}
                      >
                        Edit
                      </button>}
                      {!isReadOnly && <button
                        onClick={() => deleteFarmExpense(ex.id)}
                        style={{ ...btn("#FCEBEB", "#A32D2D"), padding: "3px 10px", fontSize: 11 }}
                      >
                        Delete
                      </button>}
                    </div>
                  </td>
                </tr>
              ))}
            {farmExpenses.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "#aaa", padding: "10px 0" }}>
                  No global farm expenses logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}