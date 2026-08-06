import { useState, useEffect } from "react"

const fmtDate = d => d ? d.split("-").reverse().join("-") : ""

// Shift a yyyy-mm-dd string by N days, returning a new yyyy-mm-dd string
const shiftDate = (dateStr, deltaDays) => {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + deltaDays)
  return d.toISOString().split("T")[0]
}

export default function DailyReport() {
  const todayStr = new Date().toISOString().split("T")[0]
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [reportRows, setReportRows] = useState([])
  const [loading, setLoading] = useState(true)

  // CSS Shared Styles copied from your project architecture
  const card = { background: "#fff", border: "1px solid #eee", borderRadius: 10, padding: 16, fontSize: 13, marginBottom: 20 }
  const th = { textAlign: "left", padding: "10px 8px", borderBottom: "2px solid #eee", color: "#64748B", fontWeight: 600, fontSize: 13, background: "#F8FAFC" }
  const td = { padding: "9px 7px", borderBottom: "1px solid #f5f5f5", fontSize: 14.5, verticalAlign: "middle" }
  const inp = { padding: "6px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }
  const navBtn = (disabled) => ({
    width: 32, height: 32, borderRadius: 6, border: "1px solid #ddd", background: disabled ? "#f5f5f5" : "#fff",
    color: disabled ? "#ccc" : "#334155", fontSize: 15, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center"
  })

  const isToday = selectedDate >= todayStr
  const goToPrevDay = () => setSelectedDate(prev => shiftDate(prev, -1))
  const goToNextDay = () => setSelectedDate(prev => (prev >= todayStr ? prev : shiftDate(prev, 1)))

  function calculateAgeAtDate(startDateStr, initialAgeDays = 0, targetDateStr) {
    if (!startDateStr) return "0.0"
    const start = new Date(startDateStr)
    const target = new Date(targetDateStr)
    start.setHours(0, 0, 0, 0)
    target.setHours(0, 0, 0, 0)
    
    const diffTime = target.getTime() - start.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    const totalDays = Math.max(0, initialAgeDays + diffDays)
    
    const weeks = Math.floor(totalDays / 7)
    const remainingDays = totalDays % 7
    return `${weeks}.${remainingDays}`
  }

  async function generateDailyReport(targetDate) {
    try {
      setLoading(true)
      // Strictly query active batches only
      const activeFlocks = await window.api.getBatches()
      const completedRows = []

      for (const flock of activeFlocks) {
        // Skip flocks that haven't been placed yet relative to selected date
        if (flock.start_date && flock.start_date > targetDate) continue

        // Fetch historical logs for this batch
        const [prod, feedAlloc, feedUse, mort, sales] = await Promise.all([
          window.api.getEggProductionByBatch(flock.batch_id),
          window.api.getFeedAllocationsByBatch(flock.batch_id),
          window.api.getFeedIntakeByBatch(flock.batch_id),
          window.api.getMortalityByBatch(flock.batch_id),
          window.api.getEggSalesByBatch(flock.batch_id)
        ])

        // 1. Calculate opening bird count (excluding mortality from prior days)
        const deathsBeforeToday = mort
          .filter(m => m.date < targetDate)
          .reduce((sum, m) => sum + Number(m.deaths || 0), 0)
        const openingBirdCount = Math.max(0, Number(flock.start_count || 0) + Number(flock.free_chicks || 0) - deathsBeforeToday)

        // 2. Today's mortality
        const todaysMortality = mort
          .filter(m => m.date === targetDate)
          .reduce((sum, m) => sum + Number(m.deaths || 0), 0)

        // 3. Today's Production
        const todaysProdObj = prod.find(p => p.date === targetDate)
        let todaysProductionEggs = 0
        let todaysProductionTrays = 0
        if (todaysProdObj) {
          const totalTrays = Number(todaysProdObj.pullet_trays || 0) +
                             Number(todaysProdObj.medium_trays || 0) +
                             Number(todaysProdObj.correct_size_trays || 0) +
                             Number(todaysProdObj.export_trays || 0) +
                             Number(todaysProdObj.large_trays || 0) +
                             Number(todaysProdObj.double_yolk_eggs || 0)
          todaysProductionTrays = totalTrays
          todaysProductionEggs = (totalTrays * 30) - Number(todaysProdObj.broken_eggs || 0)
        }

        // 4. Stock Up to Yesterday calculations
        const totalEggsProducedBefore = prod
          .filter(p => p.date < targetDate)
          .reduce((sum, p) => {
            const trays = Number(p.pullet_trays || 0) + Number(p.medium_trays || 0) + Number(p.correct_size_trays || 0) + Number(p.export_trays || 0) + Number(p.large_trays || 0) + Number(p.double_yolk_eggs || 0)
            return sum + (trays * 30) - Number(p.broken_eggs || 0)
          }, 0)

        const totalEggsSoldBefore = sales
          .filter(s => s.date < targetDate)
          .reduce((sum, s) => {
            const mainEggs = s.unit_type === "TRAY" ? Number(s.quantity || 0) * 30 : Number(s.quantity || 0)
            return sum + mainEggs
          }, 0)

        // Broken eggs are now sorted out during sales rather than production,
        // so they're pulled from egg_sales.broken_qty (same unit as that row)
        // rather than egg_production.broken_eggs (which only carries old data).
        const totalEggsBrokenBefore = sales
          .filter(s => s.date < targetDate)
          .reduce((sum, s) => {
            const brokenEggs = s.unit_type === "TRAY" ? Number(s.broken_qty || 0) * 30 : Number(s.broken_qty || 0)
            return sum + brokenEggs
          }, 0)

        const stockUptoYesterdayTrays = Math.max(0, totalEggsProducedBefore - totalEggsSoldBefore - totalEggsBrokenBefore) / 30

        // 5. Today's Sales
        const todaysEggsSold = sales
          .filter(s => s.date === targetDate)
          .reduce((sum, s) => {
            const mainEggs = s.unit_type === "TRAY" ? Number(s.quantity || 0) * 30 : Number(s.quantity || 0)
            return sum + mainEggs
          }, 0)
        const todaysSalesTrays = todaysEggsSold / 30

        

        // Today's Broken (from sales entries logged today)
        const todaysEggsBroken = sales
          .filter(s => s.date === targetDate)
          .reduce((sum, s) => {
            const brokenEggs = s.unit_type === "TRAY" ? Number(s.broken_qty || 0) * 30 : Number(s.broken_qty || 0)
            return sum + brokenEggs
          }, 0)
        const todaysBrokenTrays = todaysEggsBroken / 30

        // Total stock as of today = yesterday's stock + today's production - today's sales
        const totalStockIncludingTodayTrays = Math.max(0, stockUptoYesterdayTrays + todaysProductionTrays - todaysSalesTrays - todaysBrokenTrays)

        // 6. Feed Metrics
        const totalFeedAllocatedBefore = feedAlloc.filter(f => f.date < targetDate).reduce((sum, f) => sum + Number(f.qty_kg || 0), 0)
        const totalFeedConsumedBefore = feedUse.filter(f => f.date < targetDate).reduce((sum, f) => sum + Number(f.qty_kg || 0), 0)
        const openingFeedStock = Math.max(0, totalFeedAllocatedBefore - totalFeedConsumedBefore)

        const feedArrivalToday = feedAlloc.filter(f => f.date === targetDate).reduce((sum, f) => sum + Number(f.qty_kg || 0), 0)
        const feedTookToday = feedUse.filter(f => f.date === targetDate).reduce((sum, f) => sum + Number(f.qty_kg || 0), 0)
        
        // Feed remaining balances at the end of this day
        const totalAllocatedUpToToday = totalFeedAllocatedBefore + feedArrivalToday
        const totalConsumedUpToToday = totalFeedConsumedBefore + feedTookToday
        const remainingFeedStock = Math.max(0, totalAllocatedUpToToday - totalConsumedUpToToday)

        // 7. Laying / Production Rate
        const eggProductionRate = openingBirdCount > 0 ? (todaysProductionEggs / openingBirdCount) * 100 : 0

        completedRows.push({
          batch_id: flock.batch_id,
          age: calculateAgeAtDate(flock.start_date, flock.initial_age_days, targetDate),
          birdCount: openingBirdCount,
          mortality: todaysMortality,
          production: todaysProductionTrays,
          stockYesterday: stockUptoYesterdayTrays,
          totalStock: totalStockIncludingTodayTrays,
          sales: todaysSalesTrays,
          broken: todaysBrokenTrays,
          feedStock: openingFeedStock,
          feedArrival: feedArrivalToday,
          feedTook: feedTookToday,
          feedRemaining: remainingFeedStock,
          layRate: eggProductionRate
        })
      }

      setReportRows(completedRows)
    } catch (err) {
      console.error("Error building daily report data metrics:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    generateDailyReport(selectedDate)
  }, [selectedDate])

  // Column totals for the summary row at the bottom of the table
  const totals = reportRows.reduce((acc, r) => {
    acc.production     += Number(r.production || 0)
    acc.stockYesterday += Number(r.stockYesterday || 0)
    acc.totalStock     += Number(r.totalStock || 0)
    acc.broken          += Number(r.broken || 0)
    return acc
  }, { production: 0, stockYesterday: 0, totalStock: 0, broken: 0 })

  return (
    <div>
      {/* Date Selection Header Control */}
      <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
        <div>
          <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 4, fontWeight: 500 }}>Select Report Target Date</label>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button type="button" onClick={goToPrevDay} style={navBtn(false)} aria-label="Previous day">‹</button>
            <input type="date" value={selectedDate} max={todayStr} onChange={e => setSelectedDate(e.target.value)} style={inp} />
            <button type="button" onClick={goToNextDay} disabled={isToday} style={navBtn(isToday)} aria-label="Next day">›</button>
          </div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#64748B", textAlign: "right" }}>
          Viewing active records for: <strong>{fmtDate(selectedDate)}</strong>
        </div>
      </div>

      {/* Main Table Layout Panel */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #eee", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1250 }}>
            <thead>
              <tr>
                {[
                  "Batch ID", " Age ", " Bird Count ", "Mortality ", 
                  "Today's Production (Trays)", "Yesterday Stock (Trays)", "Total Stock (Trays)", 
                  "Sales Today (Trays)", "Broken (Trays)", "Feed Stock (Open)", "Feed Arrival", "Feed Took", "Feed Remaining", "Lay Rate %"
                ].map(h => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={14} style={{ padding: 40, textAlign: "center", color: "#aaa" }}>Loading historical metrics...</td></tr>
              ) : reportRows.length === 0 ? (
                <tr><td colSpan={14} style={{ padding: 40, textAlign: "center", color: "#aaa" }}>No active flocks detected for this historical date.</td></tr>
              ) : (
                reportRows.map((r, i) => (
                  <tr key={r.batch_id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                    <td style={{ ...td, fontWeight: 700, color: "#0F6E56" }}>{r.batch_id}</td>
                    <td style={td}>{r.age}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{r.birdCount.toLocaleString()}</td>
                    <td style={{ ...td, color: r.mortality > 0 ? "#B91C1C" : "#555", fontWeight: r.mortality > 0 ? 700 : 400 }}>
                      {r.mortality > 0 ? ` ${r.mortality}` : "0"}
                    </td>
                    <td style={td}>{r.production > 0 ? `${r.production.toFixed(1)}` : "—"}</td>
                    <td style={td}>{r.stockYesterday > 0 ? `${r.stockYesterday.toFixed(1)}` : "0.0"}</td>
                    <td style={{ ...td, fontWeight: 600, color: "#1e293b" }}>{r.totalStock > 0 ? `${r.totalStock.toFixed(1)}` : "0.0"}</td>
                    <td style={{ ...td, color: r.sales > 0 ? "#0F6E56" : "#aaa" }}>{r.sales > 0 ? `${r.sales.toFixed(1)}` : "—"}</td>
                    <td style={{ ...td, color: r.broken > 0 ? "#B91C1C" : "#aaa", fontWeight: r.broken > 0 ? 700 : 400 }}>{r.broken > 0 ? `${r.broken.toFixed(1)}` : "—"}</td>
                    <td style={td}>{r.feedStock.toLocaleString()} kg</td>
                    <td style={{ ...td, color: r.feedArrival > 0 ? "#1d4ed8" : "#555" }}>{r.feedArrival > 0 ? `+${r.feedArrival} kg` : "—"}</td>
                    <td style={{ ...td, color: r.feedTook > 0 ? "#9A3412" : "#555" }}>{r.feedTook > 0 ? `-${r.feedTook} kg` : "—"}</td>
                    <td style={{ ...td, fontWeight: 600, color: r.feedRemaining < 200 ? "#B91C1C" : "#1E293B" }}>
                      {r.feedRemaining.toLocaleString()} kg
                    </td>
                    <td style={{ ...td, fontWeight: 700, color: r.layRate > 70 ? "#0F6E56" : "#9A3412" }}>
                      {r.layRate > 0 ? `${r.layRate.toFixed(1)}%` : "0.0%"}
                    </td>
                  </tr>
                ))
              )}
              {!loading && reportRows.length > 0 && (
                <tr style={{ background: "#F1F5F9", borderTop: "2px solid #E2E8F0" }}>
                  <td style={{ ...td, fontWeight: 700, color: "#1e293b" }} colSpan={4}>Total</td>
                  <td style={{ ...td, fontWeight: 700, color: "#1e293b" }}>{totals.production.toFixed(1)}</td>
                  <td style={{ ...td, fontWeight: 700, color: "#1e293b" }}>{totals.stockYesterday.toFixed(1)}</td>
                  <td style={{ ...td, fontWeight: 700, color: "#1e293b" }}>{totals.totalStock.toFixed(1)}</td>
                  <td style={td}></td>
                  <td style={{ ...td, fontWeight: 700, color: "#B91C1C" }}>{totals.broken > 0 ? totals.broken.toFixed(1) : "—"}</td>
                  <td style={td}></td>
                  <td style={td}></td>
                  <td style={td}></td>
                  <td style={td}></td>
                  <td style={td}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}