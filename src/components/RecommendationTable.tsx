import type { OptimizationResult } from '../core/types'

type Props = {
  recommendations: OptimizationResult[]
  current: number
  onSelect: (transposition: number) => void
}

export function RecommendationTable({ recommendations, current, onSelect }: Props) {
  return (
    <section className="panel recommendations">
      <div className="panel-head">
        <h3>推荐移调</h3>
        <span className="muted small">按当前模式评估</span>
      </div>
      {recommendations.length === 0 ? (
        <p className="muted">没有能放进当前音域的移调。</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>五线谱调</th>
                <th>移调</th>
                <th>最长同向</th>
                <th>大跳</th>
                <th>推键</th>
                <th>综合</th>
              </tr>
            </thead>
            <tbody>
              {recommendations.map((result, index) => {
                const longest = Math.max(result.metrics.longestBlow, result.metrics.longestDraw)
                return (
                  <tr
                    key={result.transposition}
                    className={result.transposition === current ? 'active' : ''}
                    onClick={() => onSelect(result.transposition)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') onSelect(result.transposition)
                    }}
                  >
                    <td>
                      {index === 0 ? '★ ' : ''}
                      {result.keyLabel}
                    </td>
                    <td>{result.transposition > 0 ? `+${result.transposition}` : result.transposition}</td>
                    <td>{longest.toFixed(1)}s</td>
                    <td>{result.metrics.maxJump}</td>
                    <td>{result.metrics.slideToggles}</td>
                    <td>{result.metrics.difficulty.toFixed(1)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
