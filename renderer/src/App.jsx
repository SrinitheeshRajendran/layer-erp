import { useState, useEffect } from "react"
import Dashboard from "./pages/Dashboard"
import BatchView from "./pages/BatchView"
import MedicationPage from "./pages/MedicationPage"
import Sales from "./pages/Sales"
import AccountLedger from "./pages/AccountLedger"
import ClosedBatchView from "./pages/ClosedBatchView"
import FinanceExpenses from "./pages/FinanceExpenses"
import DailyReport from "./pages/DailyReport"

export default function App() {
  const [batches, setBatches] = useState([])
  const [closedBatches, setClosedBatches] = useState([])
  const [page, setPage] = useState("dashboard")
  const [activeBatch, setActiveBatch] = useState(null)
  const [activeClosedBatch, setActiveClosedBatch] = useState(null)

  const [showAddBatch, setShowAddBatch] = useState(false)
  const [activeYear, setActiveYear] = useState(new Date().getFullYear())
  const [availableYears, setAvailableYears] = useState([new Date().getFullYear()])
  const [isUnlocked, setIsUnlocked] = useState(false)
  const currentYear = new Date().getFullYear()
  const isReadOnly = activeYear !== currentYear && !isUnlocked
  const [migrationData, setMigrationData] = useState(null)   // { batches, traders }

  // Expanded payload state to cleanly bind all fields from the layout image
  const [newBatch, setNewBatch] = useState({
    batch_id: "",
    shed: "",
    breed: "BV-380",
    start_date: new Date().toISOString().slice(0, 10),
    initial_age: "0.0",
    start_count: "",
    free_chicks: "",
    cost_per_chick: ""
  })

  const [batchError, setBatchError] = useState("")

  // ── Year migration state ──────────────────────────────────────
  const [showMigrationDialog, setShowMigrationDialog] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrationDone, setMigrationDone] = useState(false)

  const loadBatches = async () => {
    try {
      const [data, closed] = await Promise.all([
        window.api.getBatches(),
        window.api.getClosedBatches()
      ])
      setBatches(data || [])
      setClosedBatches(closed || [])
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadBatches()
    window.api.getAvailableYears().then(yrs => {
      if (yrs && yrs.length) setAvailableYears(yrs)
    })
    // Check if migration needed from previous year
    const prevYear = currentYear - 1
    window.api.checkMigration(prevYear).then(result => {
      if (result && result.needed) {
        setMigrationData(result)
        setShowMigrationDialog(true)
      }
    }).catch(() => {})
  }, [])

  const switchYear = async (yr) => {
    await window.api.switchYear(yr)
    setActiveYear(yr)
    setIsUnlocked(false)
    setActiveBatch(null)
    setActiveClosedBatch(null)
    setPage("dashboard")
    loadBatches()
  }

  const handleUnlock = () => {
    if (window.confirm(`You are about to edit ${activeYear} historical data. Are you sure?`)) {
      setIsUnlocked(true)
    }
  }

  const handleMigrate = async () => {
    setMigrating(true)
    try {
      const prevYear = currentYear - 1
      await window.api.runMigration(prevYear, currentYear)
      setMigrationDone(true)
      setShowMigrationDialog(false)
      setMigrationData(null)
      // Refresh batches and years
      loadBatches()
      window.api.getAvailableYears().then(yrs => {
        if (yrs && yrs.length) setAvailableYears(yrs)
      })
    } catch(e) {
      console.error("Migration failed:", e)
      alert("Migration failed: " + e.message)
    } finally {
      setMigrating(false)
    }
  }

  const addBatch = async () => {
    if (!newBatch.batch_id.trim()) {
      setBatchError("Enter batch id")
      return
    }

    // Exact function structure preserved, reading the new properties from state payload
    await window.api.insertBatch({
      batch_id: newBatch.batch_id.trim(),
      shed: newBatch.shed || "",
      breed: newBatch.breed || "BV-380",
      start_date: newBatch.start_date || new Date().toISOString().slice(0, 10),
      initial_age: newBatch.initial_age || "0.0",
      start_count: Number(newBatch.start_count || 0),
      free_chicks: Number(newBatch.free_chicks || 0),
      cost_per_chick: Number(newBatch.cost_per_chick || 0)
    })

    // Completely resetting back to default state parameters
    setNewBatch({
      batch_id: "",
      shed: "",
      breed: "BV-380",
      start_date: new Date().toISOString().slice(0, 10),
      initial_age: "0.0",
      start_count: "",
      free_chicks: "",
      cost_per_chick: ""
    })

    setShowAddBatch(false)
    setBatchError("")
    loadBatches()
  }

  const deleteBatch = async (id, batchId) => {
    if (
      window.confirm(
        `Delete batch "${batchId}" and ALL its data (production, feed, sales, medication, mortality)? This cannot be undone.`
      )
    ) {
      await window.api.deleteBatch(id)

      if (activeBatch === batchId) {
        setActiveBatch(null)
        setPage("dashboard")
      }
      if (activeClosedBatch === batchId) {
        setActiveClosedBatch(null)
      }

      loadBatches()
    }
  }

  const navItem = (key, label, active) => (
    <div
      onClick={() => {
        setPage(key)
        setActiveBatch(null)
        setActiveClosedBatch(null)
      }}
      style={{
        padding: "9px 12px",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 13,
        background: active ? "#E1F5EE" : "transparent",
        color: active ? "#0F6E56" : "#555",
        fontWeight: active ? 600 : 400,
        marginBottom: 2
      }}
    >
      {label}
    </div>
  )

  const inp = {
    fontSize: 13,
    border: "1px solid #ddd",
    borderRadius: 6,
    padding: "6px 10px",
    background: "#fff",
    width: "100%",
    boxSizing: "border-box"
  }

  const labelStyle = {
    fontSize: 11,
    color: "#666",
    display: "block",
    marginBottom: 4,
    fontWeight: 500
  }

  const pageTitle = activeClosedBatch
    ? `📦 ${activeClosedBatch} (Closed)`
    : activeBatch
    ? activeBatch
    : {
        dashboard: "Dashboard",
        dailyReport: "📋 Daily Report",
        medication: "Medication",
        sales: "Sales & Billing",
        ledger: "Account Ledger",
        finance: "Finance & Expenses"
      }[page]

  const renderPage = () => {
    if (activeClosedBatch)
      return (
        <ClosedBatchView
          batchId={activeClosedBatch}
          onBack={() => setActiveClosedBatch(null)}
          isReadOnly={isReadOnly}
        />
      )

    if (activeBatch)
      return <BatchView batchId={activeBatch} isReadOnly={isReadOnly} />

    if (page === "dashboard")
      return (
        <Dashboard
          setPage={setPage}
          setActiveBatch={setActiveBatch}
          batches={batches}
        />
      )

    if (page === "dailyReport") return <DailyReport />
    if (page === "medication") return <MedicationPage isReadOnly={isReadOnly} />
    if (page === "sales") return <Sales isReadOnly={isReadOnly} />
    if (page === "ledger") return <AccountLedger isReadOnly={isReadOnly} />
    if (page === "finance") return <FinanceExpenses isReadOnly={isReadOnly} />

    return null
  }

  return (
    <div
      style={{
        display: "flex",
        width: "100vw",
        height: "100vh",
        margin: 0,
        padding: 0,
        boxSizing: "border-box",
        fontFamily: "sans-serif",
        background: "#f5f5f5",
        overflow: "hidden"
      }}
    >
      <style>{`
        html, body, #root {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          box-sizing: border-box;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
      <div
        style={{
          width: 230,
          background: "#fff",
          borderRight: "1px solid #eee",
          padding: "16px 8px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto"
        }}
      >
        <div
          style={{
            padding: "8px 12px 16px",
            fontWeight: 600,
            fontSize: 15,
            color: "#0F6E56"
          }}
        >
          🐔 LayerERP
        </div>

        {/* ── Year Switcher ── */}
        <div style={{ padding: "0 12px 14px" }}>
          <div style={{ fontSize: 10, color: "#aaa", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
            Financial Year
          </div>
          <select
            value={activeYear}
            onChange={e => switchYear(Number(e.target.value))}
            style={{
              width: "100%", fontSize: 13, border: "1px solid #e2e8f0",
              borderRadius: 6, padding: "6px 8px",
              background: isReadOnly ? "#FFF7ED" : "#F0FDF4",
              color: isReadOnly ? "#92400E" : "#0F6E56",
              fontWeight: 600, cursor: "pointer", outline: "none"
            }}
          >
            {availableYears.map(yr => (
              <option key={yr} value={yr}>{yr}{yr === currentYear ? " (Current)" : ""}</option>
            ))}
          </select>
          {activeYear !== currentYear && (
            <div style={{ marginTop: 6 }}>
              {isUnlocked ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10, color: "#0F6E56", fontWeight: 600 }}>🔓 Editing {activeYear}</span>
                  <button
                    onClick={() => setIsUnlocked(false)}
                    style={{ fontSize: 10, border: "1px solid #ddd", borderRadius: 4, padding: "2px 6px", cursor: "pointer", background: "#f5f5f5", color: "#666" }}
                  >
                    🔒 Lock
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10, color: "#E67E22", fontWeight: 600 }}>⚠ Read Only</span>
                  <button
                    onClick={handleUnlock}
                    style={{ fontSize: 10, border: "1px solid #E67E22", borderRadius: 4, padding: "2px 6px", cursor: "pointer", background: "#FFF7ED", color: "#92400E", fontWeight: 600 }}
                  >
                    🔓 Unlock
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Migrate button — shows when prev year has active batches */}
        {activeYear === currentYear && !migrationDone && (
          <div style={{ padding: "0 12px 10px" }}>
            <button
              onClick={() => {
                const prevYear = currentYear - 1
                window.api.checkMigration(prevYear).then(result => {
                  if (result && result.needed) {
                    setMigrationData(result)
                    setShowMigrationDialog(true)
                  }
                })
              }}
              style={{
                width: "100%", fontSize: 11, padding: "6px 10px",
                background: "#FFF7ED", border: "1px solid #FED7AA",
                borderRadius: 6, cursor: "pointer", color: "#92400E",
                fontWeight: 600, textAlign: "left"
              }}
            >
              📦 Migrate from {currentYear - 1}
            </button>
          </div>
        )}

        {migrationDone && (
          <div style={{ padding: "0 12px 10px", fontSize: 11, color: "#0F6E56", fontWeight: 600 }}>
            ✓ Migration complete
          </div>
        )}

        {navItem(
          "dashboard",
          "Dashboard",
          page === "dashboard" && !activeBatch
        )}

        <div
          style={{
            padding: "6px 12px 4px",
            fontSize: 10,
            color: "#aaa",
            fontWeight: 600,
            letterSpacing: 1,
            textTransform: "uppercase",
            marginTop: 6
          }}
        >
          Batches
        </div>

        {batches.map(b => (
          <div
            key={b.id}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
              background:
                activeBatch === b.batch_id
                  ? "#E1F5EE"
                  : "transparent",
              color:
                activeBatch === b.batch_id
                  ? "#0F6E56"
                  : "#555",
              fontWeight:
                activeBatch === b.batch_id
                  ? 600
                  : 400,
              marginBottom: 2,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <span
              style={{ flex: 1 }}
              onClick={() => {
                setActiveBatch(b.batch_id)
                setActiveClosedBatch(null)
                setPage("batch")
              }}
            >
              🐔 {b.batch_id}
            </span>

            <span
              onClick={() =>
                deleteBatch(
                  b.id,
                  b.batch_id
                )
              }
              style={{
                fontSize: 11,
                color: "#ccc",
                cursor: "pointer",
                padding: "0 2px"
              }}
            >
              ✕
            </span>
          </div>
        ))}

        {!isReadOnly && <div
          onClick={() => setShowAddBatch(true)}
          style={{
            padding: "7px 12px",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
            color: "#0F6E56",
            fontWeight: 500,
            marginTop: 4,
            display: "flex",
            alignItems: "center",
            gap: "4px"
          }}
        >
          ➕ Add Batch
        </div>}

        <div
          style={{
            padding: "6px 12px 4px",
            fontSize: 10,
            color: "#aaa",
            fontWeight: 600,
            letterSpacing: 1,
            textTransform: "uppercase",
            marginTop: 10
          }}
        >
          Global
        </div>

        {navItem(
          "dailyReport",
          "📋 Daily Report",
          page === "dailyReport" && !activeBatch
        )}

        {navItem(
          "medication",
          "💊 Medication History",
          page === "medication" && !activeBatch
        )}

        {navItem(
          "sales",
          "💰 Sales & Billing",
          page === "sales" && !activeBatch
        )}

        {navItem(
          "ledger",
          "📒 Account Ledger",
          page === "ledger" && !activeBatch
        )}

        {navItem(
          "finance",
          "💵 Finance & Expenses",
          page === "finance" && !activeBatch
        )}

        {closedBatches.length > 0 && (
          <>
            <div
              style={{
                padding: "6px 12px 4px",
                fontSize: 10,
                color: "#aaa",
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
                marginTop: 10
              }}
            >
              Closed Batches
            </div>

            {closedBatches.map(b => (
              <div
                key={b.id}
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                  background:
                    activeClosedBatch === b.batch_id
                      ? "#FEF9EC"
                      : "transparent",
                  color:
                    activeClosedBatch === b.batch_id
                      ? "#92400E"
                      : "#888",
                  fontWeight:
                    activeClosedBatch === b.batch_id ? 600 : 400,
                  marginBottom: 2,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
              >
                <span
                  style={{ flex: 1 }}
                  onClick={() => {
                    setActiveClosedBatch(b.batch_id)
                    setActiveBatch(null)
                    setPage("closedBatch")
                  }}
                >
                  📦 {b.batch_id}
                </span>

                <span
                  onClick={() => deleteBatch(b.id, b.batch_id)}
                  style={{
                    fontSize: 11,
                    color: "#ccc",
                    cursor: "pointer",
                    padding: "0 2px"
                  }}
                >
                  ✕
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      <div
        style={{
          flex: 1,
          padding: 24,
          overflowY: "auto"
        }}
      >
        {isReadOnly && (
          <div style={{
            background: "#FFF7ED", border: "1px solid #FED7AA",
            borderRadius: 8, padding: "10px 16px", marginBottom: 16,
            display: "flex", alignItems: "center", justifyContent: "space-between"
          }}>
            <span style={{ fontSize: 13, color: "#92400E", fontWeight: 600 }}>
              ⚠ Viewing {activeYear} — Read Only
            </span>
            <button
              onClick={handleUnlock}
              style={{ fontSize: 12, border: "1px solid #E67E22", borderRadius: 6, padding: "4px 12px", cursor: "pointer", background: "#fff", color: "#92400E", fontWeight: 600 }}
            >
              🔓 Unlock to Edit
            </button>
          </div>
        )}
        <h2
          style={{
            marginBottom: 20,
            fontSize: 18,
            fontWeight: 600
          }}
        >
          {pageTitle}
        </h2>

        {renderPage()}
      </div>

      {/* Migration Dialog */}
      {showMigrationDialog && migrationData && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 99999
        }}>
          <div style={{
            background: "#fff", borderRadius: 14, padding: 28,
            width: 480, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
          }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>
              📦 Year End — Move to {currentYear}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 20 }}>
              Active batches from {currentYear - 1} will be moved with full history.
              Traders will carry forward their closing balance as opening balance.
            </div>

            {/* Active Batches */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Active Batches ({migrationData.batches.length})
              </div>
              <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 14px", maxHeight: 150, overflowY: "auto" }}>
                {migrationData.batches.map(b => (
                  <div key={b.batch_id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}>
                    <span style={{ fontWeight: 600, color: "#0F6E56" }}>🐔 {b.batch_id}</span>
                    <span style={{ color: "#888" }}>{b.breed} · {Number(b.current_count).toLocaleString()} birds</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Trader Balances */}
            {migrationData.traders.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Trader Balances Carrying Forward ({migrationData.traders.length})
                </div>
                <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 14px", maxHeight: 130, overflowY: "auto" }}>
                  {migrationData.traders.map(t => (
                    <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}>
                      <span style={{ color: "#333" }}>{t.name}</span>
                      <span style={{ fontWeight: 600, color: t.closing_balance >= 0 ? "#0F6E56" : "#B91C1C" }}>
                        ₹{Number(t.closing_balance).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowMigrationDialog(false)}
                style={{ padding: "8px 18px", borderRadius: 7, border: "1px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", fontSize: 13, color: "#555" }}
              >
                Skip for Now
              </button>
              <button
                onClick={handleMigrate}
                disabled={migrating}
                style={{
                  padding: "8px 22px", borderRadius: 7, border: "none",
                  background: migrating ? "#aaa" : "#0F6E56", color: "#fff",
                  cursor: migrating ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700
                }}
              >
                {migrating ? "Moving..." : `✓ Move to ${currentYear}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pop-up modal wrapper implementing exactly the double-column grid layout fields from the image */}
      {showAddBatch && (
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
          onClick={() => {
            setShowAddBatch(false)
            setBatchError("")
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              width: "100%",
              maxWidth: "520px",
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
                marginBottom: 20,
                fontSize: 16,
                fontWeight: 600,
                color: "#4a5568"
              }}
            >
              <span>Add New Batch Flock</span>
              <button
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}
                onClick={() => {
                  setShowAddBatch(false)
                  setBatchError("")
                }}
              >
                &times;
              </button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Batch ID *</label>
              <input
                placeholder="e.g. BATCH-2026-A"
                value={newBatch.batch_id}
                onChange={e =>
                  setNewBatch({
                    ...newBatch,
                    batch_id: e.target.value
                  })
                }
                style={inp}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Shed Allocation</label>
                <input
                  placeholder="e.g. Shed B"
                  value={newBatch.shed}
                  onChange={e =>
                    setNewBatch({
                      ...newBatch,
                      shed: e.target.value
                    })
                  }
                  style={inp}
                />
              </div>
              <div>
                <label style={labelStyle}>Breed</label>
                <input
                  placeholder="e.g. BV 300"
                  value={newBatch.breed}
                  onChange={e =>
                    setNewBatch({
                      ...newBatch,
                      breed: e.target.value
                    })
                  }
                  style={inp}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Placement Date</label>
                <input
                  type="date"
                  value={newBatch.start_date}
                  onChange={e =>
                    setNewBatch({
                      ...newBatch,
                      start_date: e.target.value
                    })
                  }
                  style={inp}
                />
              </div>
              <div>
                <label style={labelStyle}>Initial Age (Weeks.Days)</label>
                <input
                  placeholder="0.0"
                  value={newBatch.initial_age}
                  onChange={e =>
                    setNewBatch({
                      ...newBatch,
                      initial_age: e.target.value
                    })
                  }
                  style={inp}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Number of Birds</label>
                <input
                  type="number"
                  placeholder="e.g. 2000"
                  value={newBatch.start_count}
                  onChange={e =>
                    setNewBatch({
                      ...newBatch,
                      start_count: e.target.value
                    })
                  }
                  style={inp}
                />
              </div>
              <div>
                <label style={labelStyle}>Free Chicks</label>
                <input
                  type="number"
                  placeholder="e.g. 50"
                  value={newBatch.free_chicks}
                  onChange={e =>
                    setNewBatch({
                      ...newBatch,
                      free_chicks: e.target.value
                    })
                  }
                  style={inp}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Cost Per Chick (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 45.00"
                  value={newBatch.cost_per_chick}
                  onChange={e =>
                    setNewBatch({
                      ...newBatch,
                      cost_per_chick: e.target.value
                    })
                  }
                  style={inp}
                />
              </div>
            </div>

            {batchError && (
              <div
                style={{
                  fontSize: 11,
                  color: "#A32D2D",
                  marginBottom: 12,
                  fontWeight: 500
                }}
              >
                ⚠️ {batchError}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10
              }}
            >
              <button
                onClick={() => {
                  setShowAddBatch(false)
                  setBatchError("")
                }}
                style={{
                  background: "#e2e8f0",
                  color: "#4a5568",
                  border: "none",
                  borderRadius: 6,
                  padding: "7px 16px",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 500
                }}
              >
                Cancel
              </button>

              <button
                onClick={addBatch}
                style={{
                  background: "#0F6E56",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "7px 16px",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600
                }}
              >
                Save Batch
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}