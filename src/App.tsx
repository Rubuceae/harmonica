import { useMemo, useState } from 'react'
import { HardSpotList } from './components/HardSpotList'
import { JianpuView } from './components/JianpuView'
import { MetricsPanel } from './components/MetricsPanel'
import { RecommendationTable } from './components/RecommendationTable'
import { StaffView } from './components/StaffView'
import { DEMO_JIANPU, demoScore } from './core/demo'
import { parseJianpu } from './core/jianpu'
import { MAJOR_NAMES, keySignatureFor, transposeKey } from './core/keys'
import { LAYOUTS, buildLayout, type LayoutId } from './core/layout'
import { MODE_WEIGHTS, evaluate, recommend, type ModeKey } from './core/optimize'
import type { KeyMode, Score } from './core/types'
import { loadMusicXmlFile } from './io/musicxml'

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
  const [score, setScore] = useState<Score>(() => demoScore())
  const [transposition, setTransposition] = useState(initialT)
  const [mode, setMode] = useState<ModeKey>('air')
  const [view, setView] = useState<'jianpu' | 'staff'>(initialView)
  const [showTab, setShowTab] = useState(params.get('tab') === '1')

  const [importOpen, setImportOpen] = useState(params.get('import') === '1')
  const [importTab, setImportTab] = useState<'jianpu' | 'musicxml'>('jianpu')
  const [jianpuDraft, setJianpuDraft] = useState(DEMO_JIANPU)
  const [keyTonic, setKeyTonic] = useState(2)
  const [keyMode, setKeyMode] = useState<KeyMode>('major')
  const [tempoDraft, setTempoDraft] = useState(96)
  const [timeDraft, setTimeDraft] = useState<[number, number]>([4, 4])
  const [importError, setImportError] = useState('')
  const [importStatus, setImportStatus] = useState('')

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

  const applyJianpu = () => {
    setImportError('')
    try {
      const tempo = Number.isFinite(tempoDraft) ? Math.max(30, Math.min(240, tempoDraft)) : 96
      const parsed = parseJianpu(
        jianpuDraft,
        tempo,
        { tonic: keyTonic, mode: keyMode },
        '导入的简谱',
        timeDraft,
      )
      if (parsed.notes.length === 0) {
        throw new Error('没有解析到音符，检查一下数字 / 升降号 / 八度点。')
      }
      setScore(parsed)
      setTransposition(0)
      setView('jianpu')
      setImportOpen(false)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error))
    }
  }

  const onMusicXmlFile = async (file: File | undefined) => {
    if (!file) return
    setImportError('')
    setImportStatus(`正在解析 ${file.name}…`)
    try {
      const parsed = await loadMusicXmlFile(file)
      setScore(parsed)
      setTransposition(0)
      setView('jianpu')
      setImportStatus('')
      setImportOpen(false)
    } catch (error) {
      setImportStatus('')
      setImportError(error instanceof Error ? error.message : String(error))
    }
  }

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
        <button
          className="import-button"
          onClick={() => {
            setImportOpen(open => !open)
            setImportError('')
          }}
        >
          {importOpen ? '收起导入' : '导入乐谱'}
        </button>
      </div>

      {importOpen && (
        <section className="panel import-panel">
          <div className="panel-head">
            <h3>导入 / 编辑乐谱</h3>
            <button
              className="ghost"
              onClick={() => {
                setImportOpen(false)
                setImportError('')
              }}
            >
              关闭
            </button>
          </div>

          <div className="segmented" role="group" aria-label="导入格式">
            <button
              className={importTab === 'jianpu' ? 'active' : ''}
              onClick={() => {
                setImportTab('jianpu')
                setImportError('')
              }}
            >
              简谱文本
            </button>
            <button
              className={importTab === 'musicxml' ? 'active' : ''}
              onClick={() => {
                setImportTab('musicxml')
                setImportError('')
              }}
            >
              MusicXML
            </button>
          </div>

          {importTab === 'jianpu' ? (
            <div className="import-grid">
              <label className="import-text">
                简谱
                <textarea
                  value={jianpuDraft}
                  onChange={event => setJianpuDraft(event.target.value)}
                  rows={7}
                  spellCheck={false}
                />
              </label>
              <div className="import-settings">
                <label>
                  原调
                  <select value={keyTonic} onChange={event => setKeyTonic(Number(event.target.value))}>
                    {MAJOR_NAMES.map((name, index) => (
                      <option value={index} key={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  调式
                  <select value={keyMode} onChange={event => setKeyMode(event.target.value as KeyMode)}>
                    <option value="major">大调</option>
                    <option value="minor">小调</option>
                  </select>
                </label>
                <label>
                  速度
                  <input
                    type="number"
                    min={30}
                    max={240}
                    value={tempoDraft}
                    onChange={event => setTempoDraft(Number(event.target.value))}
                  />
                </label>
                <label>
                  拍号
                  <select
                    value={`${timeDraft[0]}/${timeDraft[1]}`}
                    onChange={event => {
                      const [beats, beatType] = event.target.value.split('/').map(Number)
                      setTimeDraft([beats, beatType])
                    }}
                  >
                    <option value="4/4">4/4</option>
                    <option value="3/4">3/4</option>
                    <option value="2/4">2/4</option>
                  </select>
                </label>
                <div className="import-actions">
                  <button onClick={applyJianpu}>应用简谱</button>
                  <button className="ghost" onClick={() => setJianpuDraft(DEMO_JIANPU)}>
                    恢复示例
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="import-xml">
              <input
                type="file"
                accept=".xml,.musicxml,.mxl,application/xml,text/xml"
                onChange={event => onMusicXmlFile(event.target.files?.[0])}
              />
              <p className="hint">
                支持 .xml / .musicxml / .mxl；取第一个 part 的最高音旋律。解析失败会显示原因。
              </p>
            </div>
          )}

          {importStatus && <p className="muted small">{importStatus}</p>}
          {importError && <p className="error">{importError}</p>}
        </section>
      )}

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
                {score.tempo} BPM · {score.timeSignature[0]}/{score.timeSignature[1]} · 原调{' '}
                {originalSig.label} · 当前 {currentSig.label}（{signedT}）
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
                timeSignature={score.timeSignature}
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
