import { useState, useEffect, useMemo } from "react"

const fmtDate = d => d ? d.split("-").reverse().join("-") : ""

export default function MedicationPage({ isReadOnly = false }) {
  const [logs, setLogs] = useState([])
  const [batches, setBatches] = useState([])
  const [selectedBatch, setSelectedBatch] = useState("All batches")
  const [saved, setSaved] = useState("")

  const card = { background: "#fff", border: "1px solid #eee", borderRadius: 10, padding: 16, marginBottom: 16 }
  const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #eee", color: "#888", fontWeight: 600, fontSize: 14 }
  const td = { padding: "8px 9px", borderBottom: "1px solid #f5f5f5", fontSize: 13, verticalAlign: "middle" }
  const btn = (bg, cl) => ({ background: bg, color: cl, border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer" })
  const selectStyle = { fontSize: 13, border: "1px solid #ddd", borderRadius: 6, padding: "6px 10px", background: "#fff", boxSizing: "border-box" }
  const searchInp = { padding: "6px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12, width: 180, boxSizing: "border-box", background: "#f9fafb" }

  const [medicationSearch, setMedicationSearch] = useState("")

  // ── month navigator + pagination (Medication history table) ──────
  const PAGE_SIZE = 30
  const [medViewDate, setMedViewDate] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() } // month: 0-11
  })
  const [medPage, setMedPage] = useState(1)

  const goPrevMedMonth = () => setMedViewDate(v => {
    let { year, month } = v
    month -= 1
    if (month < 0) { month = 11; year -= 1 }
    return { year, month }
  })
  const goNextMedMonth = () => setMedViewDate(v => {
    let { year, month } = v
    month += 1
    if (month > 11) { month = 0; year += 1 }
    return { year, month }
  })
  const medMonthLabel = new Date(medViewDate.year, medViewDate.month, 1)
    .toLocaleString("en-US", { month: "long", year: "numeric" })
  const medMonthInputValue = `${medViewDate.year}-${String(medViewDate.month + 1).padStart(2, "0")}`
  const handleMedMonthInputChange = (e) => {
    const val = e.target.value // "YYYY-MM"
    if (!val) return
    const [y, m] = val.split("-").map(Number)
    setMedViewDate({ year: y, month: m - 1 })
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

  const loadData = async () => {
    const [meds, batchList] = await Promise.all([
      window.api.getMedication(),
      window.api.getBatches()
    ])
    setLogs(meds || [])
    setBatches(batchList || [])
  }

  useEffect(() => { loadData() }, [])

  const deleteMed = async (id) => {
    if (window.confirm("Delete this medication record?")) {
      await window.api.deleteMedication(id)
      notify("Record deleted!")
      loadData()
    }
  }

  const filteredLogs = useMemo(() => {
    if (selectedBatch === "All batches") return logs
    return logs.filter(l => l.batch_id === selectedBatch)
  }, [logs, selectedBatch])

  // Stats respect the batch filter so the KPIs match what's on screen
  const thisMonth = new Date().toISOString().slice(0, 7)
  const monthLogs = filteredLogs.filter(l => l.date && l.date.startsWith(thisMonth))
  const batchSet = new Set(logs.map(l => l.batch_id).filter(Boolean))

  // ── medication history table: search filter (existing) + month filter + pagination ──
  const medSearchFiltered = filteredLogs.filter(l => matchesMonth(l.date, medicationSearch))
  const medMonthFiltered = medSearchFiltered.filter(l => {
    if (!l.date) return false
    const d = new Date(l.date)
    return d.getFullYear() === medViewDate.year && d.getMonth() === medViewDate.month
  })
  const medTotalPages = Math.max(1, Math.ceil(medMonthFiltered.length / PAGE_SIZE))
  const medSafePage   = Math.min(Math.max(1, medPage), medTotalPages)
  const medPageRows    = medMonthFiltered.slice((medSafePage - 1) * PAGE_SIZE, medSafePage * PAGE_SIZE)

  useEffect(() => { setMedPage(1) }, [medViewDate.year, medViewDate.month, medicationSearch, selectedBatch])

  return (
    <div>
      {saved && (
        <div style={{ background: "#E1F5EE", color: "#0F6E56", padding: "8px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 500 }}>
          ✓ {saved}
        </div>
      )}

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          ["Records shown", filteredLogs.length, selectedBatch === "All batches" ? "all batches" : selectedBatch],
          ["This month", monthLogs.length, new Date().toLocaleString("default", { month: "long", year: "numeric" })],
          ["Batches covered", batchSet.size, "with at least 1 record"],
        ].map(([label, value, sub]) => (
          <div key={label} style={{ background: "#fff", border: "1px solid #eee", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0F6E56" }}>{value}</div>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Batch filter */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Batch</span>
        <select
          value={selectedBatch}
          onChange={e => setSelectedBatch(e.target.value)}
          style={{ ...selectStyle, width: 240 }}
        >
          <option>All batches</option>
          {batches.map(b => (
            <option key={b.id} value={b.batch_id}>{b.batch_id}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: "#aaa" }}>
          {isReadOnly ? "Viewing historical data — read only." : "This is a read-only history. To add, edit, or correct a vaccine or medicine record, open the batch and use its Medication tab."}
        </span>
      </div>

      {/* Records table */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>
            Medication history ({medMonthFiltered.length})
          </span>
          <input
            style={searchInp}
            placeholder="Search e.g. jan 2026"
            value={medicationSearch}
            onChange={e => setMedicationSearch(e.target.value)}
          />
        </div>

        {/* month nav (left) + page nav (right) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={goPrevMedMonth} aria-label="Previous month"
              style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#475569" }}>
              ‹
            </button>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <span style={{
                fontSize: 13, fontWeight: 700, color: "#1e293b",
                border: "1px solid #ddd", borderRadius: 6, padding: "5px 12px",
                background: "#fff", minWidth: 130, textAlign: "center",
              }}>
                {medMonthLabel}
              </span>
              <input type="month" value={medMonthInputValue} onChange={handleMedMonthInputChange}
                title="Jump to month"
                style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
            </div>
            <button onClick={goNextMedMonth} aria-label="Next month"
              style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#475569" }}>
              ›
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setMedPage(p => Math.max(1, p - 1))} disabled={medSafePage <= 1} aria-label="Previous page"
              style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: medSafePage <= 1 ? "not-allowed" : "pointer", fontSize: 14, color: medSafePage <= 1 ? "#ccc" : "#475569" }}>
              ‹
            </button>
            <span style={{
              fontSize: 13, fontWeight: 700, color: "#1e293b",
              border: "1px solid #ddd", borderRadius: 6, padding: "5px 12px",
              background: "#fff", minWidth: 90, textAlign: "center",
            }}>
              Page {medSafePage} / {medTotalPages}
            </span>
            <button onClick={() => setMedPage(p => Math.min(medTotalPages, p + 1))} disabled={medSafePage >= medTotalPages} aria-label="Next page"
              style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 6, width: 28, height: 28, cursor: medSafePage >= medTotalPages ? "not-allowed" : "pointer", fontSize: 14, color: medSafePage >= medTotalPages ? "#ccc" : "#475569" }}>
              ›
            </button>
          </div>
        </div>

        {medMonthFiltered.length === 0
          ? <p style={{ color: "#aaa", fontSize: 13 }}>No records yet for this filter.</p>
          : <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                {["Date", "Batch", "Type", "Medicine / vaccine", "Reason", "Route", "Administered by", "Supplier", "Total Cost", ""].map(h =>
                  <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {medPageRows.map((l, i) => (
                  <tr key={l.id ?? i}>
                    <td style={td}>{fmtDate(l.date)}</td>
                    <td style={td}>{l.batch_id}</td>
                    <td style={td}>
                      <span style={{
                        background: l.type === "Vaccine" ? "#dbeafe" : "#dcfce7",
                        color: l.type === "Vaccine" ? "#1d4ed8" : "#15803d",
                        borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 600
                      }}>
                        {l.type || "Support Medicine"}
                      </span>
                    </td>
                    <td style={td}><strong>{l.medicine}</strong></td>
                    <td style={{ ...td, color: l.notes ? "#333" : "#aaa" }}>
                      {l.type === "Vaccine" ? (l.notes || "Vaccine") : (l.notes || "—")}
                    </td>
                    <td style={td}>{l.route || "—"}</td>
                    <td style={td}>{l.administered_by || "—"}</td>
                    <td style={td}>{l.trader_name || "—"}</td>
                    <td style={{ ...td, fontWeight: 600 }}>₹{Number(l.cost || 0).toLocaleString()}</td>
                    <td style={td}>
                      {!isReadOnly && (
                        <button onClick={() => deleteMed(l.id)} style={{ ...btn("#FCEBEB", "#A32D2D"), padding: "3px 10px", fontSize: 11 }}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </div>
    </div>
  )
}