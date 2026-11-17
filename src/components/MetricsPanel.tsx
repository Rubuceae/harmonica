import type { OptimizationResult } from '../core/types'

type Props = {
  result: OptimizationResult | null
}

export function MetricsPanel({ result }: Props) {
  if (!result) {
    return (
      <section className="panel metrics">
        <div className="panel-head">
          <h3>难度指标</h3>
        </div>
        <p className="muted">当前移调超出音域，换一个位置。</p>
      </section>
    )
  }

  const m = result.metrics
  const difficultyPct = Math.min(100, Math.round(m.difficulty * 1.5))

  return (
    <section className="panel metrics">
      <div className="panel-head">
        <h3>难度指标</h3>
        <span className="pill">综合 {m.difficulty.toFixed(1)}</span>
      </div>
      <div className="metric-grid">
        <div className="metric">
          <span>最长连吹</span>
          <strong>{m.longestBlow.toFixed(1)}s</strong>
        </div>
        <div className="metric">
          <span>最长连吸</span>
          <strong>{m.longestDraw.toFixed(1)}s</strong>
        </div>
        <div className="metric">
          <span>长同向占比</span>
          <strong>{Math.round(m.longRunRatio * 100)}%</strong>
        </div>
        <div className="metric">
          <span>最大跨孔</span>
          <strong>{m.maxJump}</strong>
        </div>
        <div className="metric">
          <span>大跳次数</span>
          <strong>{m.jumpCount}</strong>
        </div>
        <div className="metric">
          <span>推键切换</span>
          <strong>{m.slideToggles}</strong>
        </div>
        <div className="metric">
          <span>音域边缘</span>
          <strong>{m.edgeNotes}</strong>
        </div>
        <div className="metric">
          <span>总时长</span>
          <strong>{m.totalSeconds.toFixed(1)}s</strong>
        </div>
      </div>
      <div className="difficulty-bar" aria-hidden="true">
        <span style={{ width: `${difficultyPct}%` }} />
      </div>
      <p className="muted small">综合分是相对值，用于比较不同调，不是绝对难度。</p>
    </section>
  )
}
