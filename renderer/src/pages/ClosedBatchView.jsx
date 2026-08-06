import { useState, useEffect } from "react"

export default function ClosedBatchView({ batchId, onBack, isReadOnly = false }) {
  const [batch, setBatch]       = useState(null)
  const [profit, setProfit]     = useState(null)
  const [closure, setClosure]   = useState(null)
  const [mortality, setMortality] = useState([])
  const [medications, setMedications] = useState([])
  const [production, setProduction] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!batchId) return
    setLoading(true)
    Promise.all([
      window.api.getBatch(batchId),
      window.api.getBatchProfitability(batchId),
      window.api.getBatchClosure(batchId),
      window.api.getMortalityByBatch(batchId),
      window.api.getMedicationByBatch(batchId),
      window.api.getEggProductionByBatch(batchId)
    ]).then(([b, p, c, mort, meds, prod]) => {
      setBatch(b)
      setProfit(p)
      setClosure(c)
      setMortality(mort || [])
      setMedications(meds || [])
      setProduction(prod || [])
      setLoading(false)
    })
  }, [batchId])

  const card = {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 10,
    padding: 20,
    fontSize: 13
  }

  const th = {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "1px solid #eee",
    color: "#888",
    fontWeight: 600,
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 0.5
  }

  const td = {
    padding: "8px 9px",
    borderBottom: "1px solid #f5f5f5",
    fontSize: 13,
    verticalAlign: "middle"
  }

  if (loading) return (
    <div style={{ padding: 40, color: "#aaa", fontSize: 13 }}>Loading closed batch...</div>
  )

  if (!batch) return (
    <div style={{ padding: 40, color: "#aaa", fontSize: 13 }}>Batch not found.</div>
  )

  const totalEggs = production.reduce((s, r) => {
    return s + Number(r.pullet_trays || 0) + Number(r.medium_trays || 0) +
      Number(r.correct_size_trays || 0) + Number(r.export_trays || 0) + Number(r.large_trays || 0)
  }, 0)

  const avgEggTraysPerDay = production.length > 0
    ? (totalEggs / production.length).toFixed(2)
    : "0.00"

  const totalMortality = mortality.reduce((s, r) => s + Number(r.deaths || 0), 0)
  const mortalityRate = batch.start_count > 0
    ? ((totalMortality / batch.start_count) * 100).toFixed(1)
    : "0.0"

  const revenue   = profit?.revenue   || 0
  const expenses  = profit?.expenses  || 0
  const netProfit = profit?.net_profit ?? (revenue - expenses)
  const profitColor = netProfit >= 0 ? "#0F6E56" : "#A32D2D"

  const birdSaleRevenue = closure?.bird_sale_amount || 0

  // Duration
  let durationText = "—"
  if (batch.start_date && closure?.closure_date) {
    const start = new Date(batch.start_date)
    const end   = new Date(closure.closure_date)
    const days  = Math.round((end - start) / (1000 * 60 * 60 * 24))
    const weeks = Math.floor(days / 7)
    const rem   = days % 7
    durationText = `${weeks}w ${rem}d (${days} days)`
  }

  const kpiCard = (label, value, sub, color) => (
    <div style={{ ...card, textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#aaa", marginBottom: 6, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || "#1a1a1a", marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#bbb" }}>{sub}</div>}
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div>
          <span
            style={{
              background: "#FEF3C7",
              color: "#92400E",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 20,
              padding: "2px 10px",
              marginRight: 8
            }}
          >
            CLOSED
          </span>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{batch.batch_id}</span>
          {batch.shed && <span style={{ color: "#aaa", fontSize: 12, marginLeft: 8 }}>· {batch.shed}</span>}
        </div>
      </div>

      {/* Batch Info Row */}
      <div style={{ ...card, marginBottom: 16, display: "flex", gap: 32, flexWrap: "wrap" }}>
        {[
          ["Breed",        batch.breed || "—"],
          ["Placement",    batch.start_date || "—"],
          ["Closed",       closure?.closure_date || "—"],
          ["Duration",     durationText],
          ["Start Count",  (batch.start_count || 0).toLocaleString() + " birds"],
          ["Final Count",  (batch.current_count || 0).toLocaleString() + " birds"],
        ].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 10, color: "#aaa", fontWeight: 600, marginBottom: 2 }}>{k.toUpperCase()}</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* KPI Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        {kpiCard("Net Profit / Loss", `₹${Number(netProfit).toLocaleString()}`, "Total batch result", profitColor)}
        {kpiCard("Total Revenue",     `₹${Number(revenue).toLocaleString()}`,   "Eggs + Bird sale")}
        {kpiCard("Total Expenses",    `₹${Number(expenses).toLocaleString()}`,  "Feed + Med + Chick cost")}
        {kpiCard("Avg Egg Production",`${avgEggTraysPerDay} trays/day`,         `${production.length} production days`)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
        {kpiCard("Total Mortality",  `${totalMortality.toLocaleString()} birds`, `${mortalityRate}% of start count`, totalMortality > 0 ? "#A32D2D" : "#1a1a1a")}
        {kpiCard("Total Eggs",       `${totalEggs.toLocaleString()} trays`,       `${production.length} days logged`)}
        {kpiCard("Bird Sale Revenue",`₹${Number(birdSaleRevenue).toLocaleString()}`, closure ? `${closure.birds_sold} birds @ ₹${closure.price_per_bird}/bird` : "—")}
      </div>

      {/* Financial Breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>📊 Financial Breakdown</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {[
                ["Chick Capital Cost", profit?.chick_cost || 0, true],
                ["Feed Expenses",      profit?.feed_cost  || 0, false],
                ["Vaccine Expenses",   profit?.vaccine_cost || 0, false],
                ["Medical Expenses",   profit?.medical_cost || 0, false],
              ].map(([label, val, bold]) => (
                <tr key={label}>
                  <td style={{ ...td, color: "#555", fontWeight: bold ? 600 : 400 }}>{label}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: bold ? 600 : 400 }}>₹{Number(val).toLocaleString()}</td>
                </tr>
              ))}
              <tr style={{ borderTop: "2px solid #ddd" }}>
                <td style={{ ...td, fontWeight: 700 }}>Total Expenses</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>₹{Number(expenses).toLocaleString()}</td>
              </tr>
              <tr>
                <td style={{ ...td, color: "#555" }}>Egg Sales Revenue</td>
                <td style={{ ...td, textAlign: "right" }}>₹{Number(profit?.egg_sales || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td style={{ ...td, color: "#555" }}>Bird Sale Revenue</td>
                <td style={{ ...td, textAlign: "right" }}>₹{Number(birdSaleRevenue).toLocaleString()}</td>
              </tr>
              <tr style={{ borderTop: "2px solid #ddd" }}>
                <td style={{ ...td, fontWeight: 700 }}>Net Profit / Loss</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700, color: profitColor }}>
                  ₹{Number(netProfit).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Mortality Summary */}
        <div style={card}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>💀 Mortality Log</div>
          {mortality.length === 0 ? (
            <div style={{ color: "#bbb", fontSize: 12 }}>No mortality recorded.</div>
          ) : (
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Date", "Deaths", "Reason"].map(h => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mortality.map(r => (
                    <tr key={r.id}>
                      <td style={td}>{r.date}</td>
                      <td style={{ ...td, color: "#A32D2D", fontWeight: 600 }}>{r.deaths}</td>
                      <td style={{ ...td, color: "#666" }}>{r.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{
            marginTop: 12,
            borderTop: "1px solid #eee",
            paddingTop: 10,
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            fontWeight: 600
          }}>
            <span>Total Deaths</span>
            <span style={{ color: totalMortality > 0 ? "#A32D2D" : "#555" }}>
              {totalMortality.toLocaleString()} ({mortalityRate}%)
            </span>
          </div>
        </div>
      </div>

      {/* Medication History */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>💊 Medical History</div>
        {medications.length === 0 ? (
          <div style={{ color: "#bbb", fontSize: 12 }}>No medications recorded.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Date", "Type", "Medicine", "Dose", "Route", "Administered By", "Cost"].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {medications.map(r => (
                <tr key={r.id}>
                  <td style={td}>{r.date}</td>
                  <td style={td}>
                    <span style={{
                      background: r.type === "Vaccine" ? "#EFF6FF" : "#F0FDF4",
                      color:      r.type === "Vaccine" ? "#1D4ED8" : "#166534",
                      borderRadius: 4,
                      padding: "2px 7px",
                      fontSize: 11,
                      fontWeight: 500
                    }}>
                      {r.type || "Support Medicine"}
                    </span>
                  </td>
                  <td style={td}>{r.medicine || "—"}</td>
                  <td style={td}>{r.dose || "—"}</td>
                  <td style={td}>{r.route || "—"}</td>
                  <td style={td}>{r.administered_by || "—"}</td>
                  <td style={{ ...td, textAlign: "right" }}>₹{Number(r.cost || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Closure Details */}
      {closure && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>🔒 Closure Details</div>
          <div style={{ display: "flex", gap: 40 }}>
            {[
              ["Closure Date",   closure.closure_date],
              ["Birds Sold",     `${(closure.birds_sold || 0).toLocaleString()} birds`],
              ["Price Per Bird", `₹${closure.price_per_bird || 0}`],
              ["Sale Revenue",   `₹${Number(closure.bird_sale_amount || 0).toLocaleString()}`],
              ["Buyer",          closure.buyer || "—"],
              ["Notes",          closure.notes || "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 10, color: "#aaa", fontWeight: 600, marginBottom: 3 }}>{k.toUpperCase()}</div>
                <div style={{ fontSize: 13 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}