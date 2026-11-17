import { useMemo, useState } from 'react'
import { HardSpotList } from './components/HardSpotList'
import { JianpuView } from './components/JianpuView'
import { MetricsPanel } from './components/MetricsPanel'
import { RecommendationTable } from './components/RecommendationTable'
import { StaffView } from './components/StaffView'
import { demoScore } from './core/demo'
import { keySignatureFor, transposeKey } from './core/keys'
import { LAYOUTS, buildLayout, type LayoutId } from './core/layout'
import { MODE_WEIGHTS, evaluate, recommend, type ModeKey } from './core/optimize'

const MODE_LABELS: Record<ModeKey, string> = {
  air: '气息优先',
  jump: '跳孔优先',
  beginner: '新手·怕交替',
  slide: '推键敏感',
}

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const initialView = params.get('view') === 'staff' ? 'staff' : 'jianpu'
  const parsedT = Number(params.get('t') ?? 0)
  const initialT = Number.isFinite(parsedT) ? Math.max(-12, Math.min(12, parsedT)) : 0

  const [layoutId, setLayoutId] = useState<LayoutId>('tenor12')
  const [score] = useState(() => demoScore())
  const [transposition, setTransposition] = useState(initialT)
  const [mode, setMode] = useState<ModeKey>('air')
  const [view, setView] = useState<'jianpu' | 'staff'>(initialView)
  const [showTab, setShowTab] = useState(params.get('tab') === '1')

  const layout = useMemo(() => buildLayout(layoutId), [layoutId])
  const weights = MODE_WEIGHTS[mode]
  const result = useMemo(
    () => evaluate(score, layout, transposition, weights),
    [score, layout, transposition, weights],
  )
  const recommendations = useMemo(() => recommend(score, layout, weights), [score, layout, weights])
  const currentSig = useMemo(
    () => keySignatureFor(transposeKey(score.originalKey, transposition)),
    [score.originalKey, transposition],
  )
  const originalSig = useMemo(() => keySignatureFor(score.originalKey), [score.originalKey])
  const hardSpotIds = useMemo(
    () => new Set(result?.hardSpots.map(spot => spot.noteId) ?? []),
    [result],
  )

  const signedT = transposition > 0 ? `+${transposition}` : String(transposition)
  const anchor = layout.id === 'standard12' ? 'C5（第三间）' : 'C4（下加一线）'

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Harmonica Score Optimizer</p>
          <h1>口琴谱面优化工具</h1>
          <p className="subtitle">固定 1=C · 只改绝对音高，相对音高不变 · 五线谱看当前调，简谱永远 1=C</p>
        </div>
        <a className="github" href="https://github.com/Rubuceae/harmonica" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </header>

      <div className="toolbar">
        <label>
          乐器
          <select value={layoutId} onChange={event => setLayoutId(event.target.value as LayoutId)}>
            {Object.entries(LAYOUTS).map(([id, item]) => (
              <option value={id} key={id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          模式
          <select value={mode} onChange={event => setMode(event.target.value as ModeKey)}>
            {Object.entries(MODE_LABELS).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="segmented" role="group" aria-label="谱面类型">
          <button className={view === 'jianpu' ? 'active' : ''} onClick={() => setView('jianpu')}>
            简谱
          </button>
          <button className={view === 'staff' ? 'active' : ''} onClick={() => setView('staff')}>
            五线谱
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={showTab} onChange={event => setShowTab(event.target.checked)} />
          显示孔位（简谱）
        </label>
      </div>

      <main className="main-grid">
        <aside className="panel controls">
          <div className="key-compare">
            <div>
              <span>原调</span>
              <strong>{originalSig.label}</strong>
            </div>
            <div className="arrow">→</div>
            <div>
              <span>当前</span>
              <strong>{currentSig.label}</strong>
            </div>
          </div>

          <label className="slider-label">
            <span>整体升降</span>
            <strong>{signedT} 半音</strong>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={transposition}
              onChange={event => setTransposition(Number(event.target.value))}
            />
          </label>
          <div className="slider-ends">
            <span>-12</span>
            <span>0</span>
            <span>+12</span>
          </div>

          <div className="fixed-do-card">
            <span>简谱基准</span>
            <strong>1=C</strong>
            <small>1 = {anchor} = 5 吹</small>
          </div>

          <p className="hint">看五线谱时先看调号；简谱把升降号显式写出。原调只作标签，演奏看当前调。</p>
          <p className="hint">孔位是优化器选的，不是固定映射；关掉孔位时只看音高。</p>
        </aside>

        <section className="panel score-panel">
          <div className="score-head">
            <div>
              <h2>{score.title}</h2>
              <p>
                {score.tempo} BPM · 4/4 · 原调 {originalSig.label} · 当前 {currentSig.label}（{signedT}）
              </p>
            </div>
            <div className="legend">
              <span className="legend-item">
                <span className="dot blow" /> 吹
              </span>
              <span className="legend-item">
                <span className="dot draw" /> 吸
              </span>
              <span className="legend-item">
                <span className="dot hard" /> 难点
              </span>
            </div>
          </div>

          {result ? (
            view === 'jianpu' ? (
              <JianpuView
                notes={score.notes}
                transpose={transposition}
                sig={currentSig}
                hardSpotIds={hardSpotIds}
                fingerings={result.fingerings}
                showTab={showTab}
              />
            ) : (
              <StaffView
                notes={score.notes}
                transpose={transposition}
                sig={currentSig}
                hardSpotIds={hardSpotIds}
              />
            )
          ) : (
            <div className="warn">当前移调超出 {layout.name} 的音域，换一个位置或选一个推荐调。</div>
          )}
        </section>
      </main>

      <div className="lower-grid">
        <MetricsPanel result={result} />
        <RecommendationTable
          recommendations={recommendations}
          current={transposition}
          onSelect={setTransposition}
        />
        <HardSpotList result={result} />
      </div>

      <footer>
        <span>固定 1=C · 12 孔 C 半音阶（tenor 默认）· 标准 12 孔 / 16 孔可切换</span>
        <span>设计文档在 docs/DESIGN.md</span>
      </footer>
    </div>
  )
}
