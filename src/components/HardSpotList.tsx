import type { OptimizationResult } from '../core/types'

type Props = {
  result: OptimizationResult | null
}

export function HardSpotList({ result }: Props) {
  const spots = result?.hardSpots ?? []

  return (
    <section className="panel hardspots">
      <div className="panel-head">
        <h3>难点</h3>
        <span className="muted small">{spots.length} 处</span>
      </div>
      {spots.length === 0 ? (
        <p className="muted">当前调没有明显难点。</p>
      ) : (
        <ul>
          {spots.slice(0, 8).map((spot, index) => (
            <li className={`spot ${spot.type}`} key={`${spot.noteId}-${spot.type}-${index}`}>
              {spot.detail}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
