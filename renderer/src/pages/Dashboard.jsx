import { useState, useEffect } from "react"

export default function Dashboard({ batches = [], setPage, setActiveBatch }) {
  const [stats, setStats] = useState({
    totalBatches: 0,
    activeBatches: 0,
    totalBirds: 0,
    closedBatches: 0
  })

  useEffect(() => {
    loadData()
  }, [batches])

  const loadData = async () => {
    try {
      // getBatches() only returns active batches (status != 'Closed').
      // getClosedBatches() returns the closed ones. Merge both to get the true total.
      const [active, closed] = await Promise.all([
        window.api.getBatches(),
        window.api.getClosedBatches()
      ])

      const allBatches = [...active, ...closed]

      const birds = active.reduce(
        (s, b) => s + Number(b.current_count || 0),
        0
      )

      setStats({
        totalBatches: allBatches.length,
        activeBatches: active.length,
        totalBirds: birds,
        closedBatches: closed.length
      })
    } catch (err) {
      console.error(err)
    }
  }

  const card = (title, value, sub) => (
    <div
      style={{
        background: "#fff",
        border: "1px solid #eee",
        borderRadius: 10,
        padding: 16
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "#888",
          marginBottom: 6
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: 24,
          fontWeight: 700
        }}
      >
        {value}
      </div>

      <div
        style={{
          fontSize: 11,
          color: "#999",
          marginTop: 4
        }}
      >
        {sub}
      </div>
    </div>
  )

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 12,
          marginBottom: 20
        }}
      >
        {card(
          "Total Batches",
          stats.totalBatches,
          "All batches"
        )}

        {card(
          "Active Batches",
          stats.activeBatches,
          "Currently running"
        )}

        {card(
          "Current Birds",
          stats.totalBirds.toLocaleString(),
          "Active flock size"
        )}

        {card(
          "Closed Batches",
          stats.closedBatches,
          "Historical batches"
        )}
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #eee",
          borderRadius: 10,
          padding: 16
        }}
      >
        <div
          style={{
            fontWeight: 600,
            marginBottom: 12
          }}
        >
          Batch Registry
        </div>

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse"
          }}
        >
          <thead>
            <tr>
              {[
                "Batch",
                "Breed",
                "Start Date",
                "Current Birds",
                "Status"
              ].map(h => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: 8,
                    borderBottom: "1px solid #eee",
                    fontSize: 12,
                    color: "#888"
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {batches.map(b => (
              <tr
                key={b.id}
                onClick={() => {
                  setActiveBatch(b.batch_id)
                }}
                style={{
                  cursor: "pointer"
                }}
              >
                <td style={{ padding: 8 }}>
                  {b.batch_id}
                </td>

                <td style={{ padding: 8 }}>
                  {b.breed}
                </td>

                <td style={{ padding: 8 }}>
                  {b.start_date}
                </td>

                <td style={{ padding: 8 }}>
                  {Number(
                    b.current_count || 0
                  ).toLocaleString()}
                </td>

                <td style={{ padding: 8 }}>
                  {b.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {batches.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "#999",
              padding: 20
            }}
          >
            No batches created yet.
          </div>
        )}
      </div>
    </div>
  )
}