import { useEffect, useMemo, useState } from 'react'
import { HardSpotList } from './components/HardSpotList'
import { JianpuView } from './components/JianpuView'
import { MetricsPanel } from './components/MetricsPanel'
import { RecommendationTable } from './components/RecommendationTable'
import { StaffView } from './components/StaffView'
import { DEMO_JIANPU, DEMO_LYRICS, DURATION_DEMO, demoScore } from './core/demo'
import { attachLyrics, parseJianpu } from './core/jianpu'
import { MAJOR_NAMES, keySignatureFor, transposeKey } from './core/keys'
import { LAYOUTS, buildLayout, type LayoutId } from './core/layout'
import { MODE_WEIGHTS, evaluate, recommend, type ModeKey } from './core/optimize'
import { BUILTIN_SONGS, loadSavedSongs, newSongId, saveSongs, type SongEntry } from './core/songs'
import type { KeyMode, Score } from './core/types'
import { loadMusicXmlFile, parseMusicXml } from './io/musicxml'

const OMR_URL = 'http://localhost:8001/omr'

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
  const isDurationDemo = params.get('demo') === 'duration'
  const initialScore = isDurationDemo
    ? parseJianpu(DURATION_DEMO, 96, { tonic: 0, mode: 'major' }, '时值示例')
    : demoScore()

  const [layoutId, setLayoutId] = useState<LayoutId>('tenor12')
  const [score, setScore] = useState<Score>(() => initialScore)
  const [transposition, setTransposition] = useState(initialT)
  const [octaveShift, setOctaveShift] = useState(() => {
    const value = Number(params.get('octave') ?? 0)
    return Number.isFinite(value) ? Math.max(-2, Math.min(2, value)) : 0
  })
  const effectiveTransposition = transposition + octaveShift * 12
  const [mode, setMode] = useState<ModeKey>('air')
  const [view, setView] = useState<'jianpu' | 'staff'>(initialView)
  const [showTab, setShowTab] = useState(params.get('tab') === '1')

  const importParam = params.get('import')
  const [importOpen, setImportOpen] = useState(
    importParam === '1' || importParam === 'image' || importParam === 'musicxml',
  )
  const [importTab, setImportTab] = useState<'jianpu' | 'musicxml' | 'image'>(
    importParam === 'image' ? 'image' : importParam === 'musicxml' ? 'musicxml' : 'jianpu',
  )
  const [imageTitle, setImageTitle] = useState('')
  const [songsOpen, setSongsOpen] = useState(params.get('songs') === '1')
  const [savedSongs, setSavedSongs] = useState<SongEntry[]>(() => loadSavedSongs())
  const [currentSongId, setCurrentSongId] = useState(
    isDurationDemo ? 'builtin-duration' : 'builtin-little-star',
  )
  const [songTitleDraft, setSongTitleDraft] = useState('')
  const [jianpuDraft, setJianpuDraft] = useState(DEMO_JIANPU)
  const [titleDraft, setTitleDraft] = useState(isDurationDemo ? '时值示例' : '小星星')
  const [lyricsDraft, setLyricsDraft] = useState(isDurationDemo ? '' : DEMO_LYRICS)
  const [composerDraft, setComposerDraft] = useState(isDurationDemo ? '' : '传统 曲')
  const [lyricistDraft, setLyricistDraft] = useState(isDurationDemo ? '' : '佚名 词')
  const [keyTonic, setKeyTonic] = useState(2)
  const [keyMode, setKeyMode] = useState<KeyMode>('major')
  const [tempoDraft, setTempoDraft] = useState(96)
  const [timeDraft, setTimeDraft] = useState<[number, number]>([4, 4])
  const [importError, setImportError] = useState('')
  const [importStatus, setImportStatus] = useState('')

  const layout = useMemo(() => buildLayout(layoutId), [layoutId])
  const weights = MODE_WEIGHTS[mode]
  const result = useMemo(
    () => evaluate(score, layout, effectiveTransposition, weights),
    [score, layout, effectiveTransposition, weights],
  )
  const recommendations = useMemo(() => recommend(score, layout, weights), [score, layout, weights])
  const currentSig = useMemo(
    () => keySignatureFor(transposeKey(score.originalKey, effectiveTransposition)),
    [score.originalKey, effectiveTransposition],
  )
  const originalSig = useMemo(() => keySignatureFor(score.originalKey), [score.originalKey])
  const hardSpotIds = useMemo(
    () => new Set(result?.hardSpots.map(spot => spot.noteId) ?? []),
    [result],
  )

  const allSongs = [...BUILTIN_SONGS, ...savedSongs]

  useEffect(() => {
    let cancelled = false
    fetch('/songs/qifengle.json')
      .then(response => (response.ok ? response.json() : null))
      .then((data: Score | null) => {
        if (!data || cancelled) return
        setSavedSongs(previous => {
          const next = [
            ...previous.filter(song => song.id !== 'local-qifengle-score'),
            {
              id: 'local-qifengle-score',
              title: '起风了（可优化）',
              score: data,
            },
          ]
          saveSongs(next)
          return next
        })
        if (params.get('song') === 'editable') {
          setScore(data)
          setCurrentSongId('local-qifengle-score')
          setTransposition(0)
          setView(params.get('view') === 'staff' ? 'staff' : 'jianpu')
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/songs/edelweiss.jianpu.txt')
      .then(response => (response.ok ? response.text() : ''))
      .then(text => {
        if (!text || cancelled) return
        const parsed = parseJianpu(text, 148, { tonic: 0, mode: 'major' }, '雪绒花', [3, 4])
        const finalScore = {
          ...parsed,
          slurs: [
            { from: 'n0', to: 'n1' },
            { from: 'n3', to: 'n4' },
            { from: 'n6', to: 'n7' },
            { from: 'n8', to: 'n10' },
            { from: 'n13', to: 'n14' },
            { from: 'n16', to: 'n17' },
            { from: 'n19', to: 'n20' },
            { from: 'n21', to: 'n23' },
            { from: 'n26', to: 'n27' },
            { from: 'n28', to: 'n30' },
            { from: 'n31', to: 'n32' },
            { from: 'n34', to: 'n35' },
            { from: 'n36', to: 'n37' },
            { from: 'n40', to: 'n41' },
            { from: 'n43', to: 'n44' },
            { from: 'n46', to: 'n47' },
            { from: 'n48', to: 'n50' },
          ],
        }
        const entry: SongEntry = {
          id: 'local-edelweiss-score',
          title: '雪绒花',
          score: finalScore,
        }
        setSavedSongs(previous => {
          const next = [...previous.filter(song => song.id !== entry.id), entry]
          saveSongs(next)
          return next
        })
        if (params.get('song') === 'edelweiss') {
          setScore(finalScore)
          setCurrentSongId(entry.id)
          setTransposition(0)
          setView(params.get('view') === 'jianpu' ? 'jianpu' : 'staff')
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signedT = effectiveTransposition > 0 ? `+${effectiveTransposition}` : String(effectiveTransposition)
  const anchor = layout.id === 'standard12' ? 'C5（第三间）' : 'C4（下加一线）'

  const selectSong = (song: SongEntry) => {
    setCurrentSongId(song.id)
    setScore(song.score)
    setTransposition(0)
    setView('jianpu')
    setSongsOpen(false)
    setImportOpen(false)
  }

  const saveCurrentSong = () => {
    const title = songTitleDraft.trim() || score.title || '未命名'
    const entry: SongEntry = { id: newSongId(), title, score }
    const next = [...savedSongs, entry]
    setSavedSongs(next)
    saveSongs(next)
    setCurrentSongId(entry.id)
    setSongTitleDraft('')
  }

  const deleteSong = (id: string) => {
    const next = savedSongs.filter(song => song.id !== id)
    setSavedSongs(next)
    saveSongs(next)
    if (currentSongId === id) setCurrentSongId('')
  }

  const routeImportFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (['xml', 'musicxml', 'mxl'].includes(ext)) {
      await onMusicXmlFile(file)
      return
    }
    if (['png', 'jpg', 'jpeg', 'tif', 'tiff', 'pdf'].includes(ext)) {
      await onImageFile(file)
      return
    }
    if (['txt', 'text'].includes(ext)) {
      const text = await file.text()
      setJianpuDraft(text)
      setImportTab('jianpu')
      setImportStatus(`已载入 ${file.name}，检查后点“应用简谱”。`)
      setImportError('')
      return
    }
    setImportError(`拖入的文件类型不支持：${ext || file.name}`)
  }

  const applyJianpu = () => {
    setImportError('')
    try {
      const tempo = Number.isFinite(tempoDraft) ? Math.max(30, Math.min(240, tempoDraft)) : 96
      let parsed = parseJianpu(
        jianpuDraft,
        tempo,
        { tonic: keyTonic, mode: keyMode },
        titleDraft.trim() || '未命名',
        timeDraft,
      )
      if (parsed.notes.length === 0) {
        throw new Error('没有解析到音符，检查一下数字 / 升降号 / 八度点。')
      }
      const verses = lyricsDraft
        .split('\n')
        .map(line => line.trim().split(/\s+/).filter(Boolean))
        .filter(verse => verse.length > 0)
      if (verses.length > 0) parsed = attachLyrics(parsed, verses)
      setScore({
        ...parsed,
        composer: composerDraft.trim() || undefined,
        lyricist: lyricistDraft.trim() || undefined,
      })
      setCurrentSongId('')
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
      setCurrentSongId('')
      setTransposition(0)
      setView('jianpu')
      setImportStatus('')
      setImportOpen(false)
    } catch (error) {
      setImportStatus('')
      setImportError(error instanceof Error ? error.message : String(error))
    }
  }

  const onImageFile = async (file: File | undefined) => {
    if (!file) return
    setImportError('')
    setImportStatus(`正在识别 ${file.name}…（本地 OMR，可能需要几十秒）`)
    try {
      const response = await fetch(OMR_URL, {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Filename': file.name,
        },
        body: file,
      })
      const payload = await response.text()
      if (!response.ok) {
        let message = payload
        try {
          const parsed = JSON.parse(payload) as { error?: string }
          if (parsed.error) message = parsed.error
        } catch {
          // keep raw payload
        }
        throw new Error(message || `OMR 服务返回 ${response.status}`)
      }
      const parsed = parseMusicXml(payload, imageTitle.trim() || file.name.replace(/\.[^.]+$/, ''))
      setScore(parsed)
      setCurrentSongId('')
      setTransposition(0)
      setView('jianpu')
      setImportStatus('')
      setImportOpen(false)
    } catch (error) {
      setImportStatus('')
      const message = error instanceof Error ? error.message : String(error)
      setImportError(
        message.includes('Failed to fetch') || message.includes('NetworkError')
          ? '图片识别需要本地 OMR 服务：先在项目目录运行 `npm run omr`（需要 Audiveris）。'
          : message,
      )
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
          className="ghost"
          onClick={() => {
            setSongsOpen(open => !open)
            setImportOpen(false)
          }}
        >
          {songsOpen ? '收起歌曲' : '歌曲'}
        </button>
        <button
          className="import-button"
          onClick={() => {
            setImportOpen(open => !open)
            setSongsOpen(false)
            setImportError('')
          }}
        >
          {importOpen ? '收起导入' : '导入乐谱'}
        </button>
      </div>

      {songsOpen && (
        <div className="drawer-backdrop" onClick={() => setSongsOpen(false)}>
          <aside className="drawer song-panel" onClick={event => event.stopPropagation()}>
          <div className="panel-head">
            <div>
              <h3>歌曲管理</h3>
              <p className="muted small">选择内置或保存的歌曲；导入的乐谱可以保存到这里。</p>
            </div>
            <button className="ghost" onClick={() => setSongsOpen(false)}>
              关闭
            </button>
          </div>
          <div className="song-save">
            <input
              type="text"
              placeholder={`保存为：${score.title}`}
              value={songTitleDraft}
              onChange={event => setSongTitleDraft(event.target.value)}
            />
            <button className="import-button" onClick={saveCurrentSong}>
              保存当前乐谱
            </button>
          </div>
          <ul className="song-list">
            {allSongs.map(song => (
              <li key={song.id} className={currentSongId === song.id ? 'active' : ''}>
                <button className="song-main" onClick={() => selectSong(song)}>
                  <span className="song-title">{song.title}</span>
                </button>
                {!song.builtin && (
                  <button className="ghost song-delete" onClick={() => deleteSong(song.id)}>
                    删除
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="hint">
            「起风了（可优化）」「雪绒花」来自本地文件；导入的简谱 / MusicXML / 图片结果也可以保存到这里。
          </p>
          </aside>
        </div>
      )}

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

          <div
            className="drop-zone"
            onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault()
              const file = event.dataTransfer.files?.[0]
              if (file) void routeImportFile(file)
            }}
          >
            拖入文件：MusicXML / .mxl / 简谱 .txt / 图片 / PDF
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
            <button
              className={importTab === 'image' ? 'active' : ''}
              onClick={() => {
                setImportTab('image')
                setImportError('')
              }}
            >
              图片 OMR
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
                <label>
                  曲名
                  <input
                    type="text"
                    value={titleDraft}
                    onChange={event => setTitleDraft(event.target.value)}
                  />
                </label>
                <label>
                  作曲
                  <input
                    type="text"
                    value={composerDraft}
                    onChange={event => setComposerDraft(event.target.value)}
                  />
                </label>
                <label>
                  作词
                  <input
                    type="text"
                    value={lyricistDraft}
                    onChange={event => setLyricistDraft(event.target.value)}
                  />
                </label>
                <div className="import-actions">
                  <button onClick={applyJianpu}>应用简谱</button>
                  <button
                    className="ghost"
                    onClick={() => {
                      setJianpuDraft(DEMO_JIANPU)
                      setTitleDraft('小星星')
                      setLyricsDraft(DEMO_LYRICS)
                      setComposerDraft('传统 曲')
                      setLyricistDraft('佚名 词')
                      setKeyTonic(2)
                      setKeyMode('major')
                    }}
                  >
                    恢复示例
                  </button>
                  <button
                    className="ghost"
                    onClick={() => {
                      setJianpuDraft(DURATION_DEMO)
                      setTitleDraft('时值示例')
                      setLyricsDraft('')
                      setComposerDraft('')
                      setLyricistDraft('')
                      setKeyTonic(0)
                      setKeyMode('major')
                    }}
                  >
                    时值示例
                  </button>
                </div>
              </div>
              <label className="import-text import-lyrics">
                歌词（可选；一行一段，空格分隔）
                <textarea
                  value={lyricsDraft}
                  onChange={event => setLyricsDraft(event.target.value)}
                  rows={3}
                  spellCheck={false}
                />
              </label>
            </div>
          ) : importTab === 'musicxml' ? (
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
          ) : (
            <div className="import-xml">
              <input
                type="text"
                placeholder="曲名（可选，默认用文件名）"
                value={imageTitle}
                onChange={event => setImageTitle(event.target.value)}
              />
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.tif,.tiff,.pdf,image/*,application/pdf"
                onChange={event => onImageFile(event.target.files?.[0])}
              />
              <p className="hint">
                本地 OMR：先在项目目录运行 <code>npm run omr</code>（需要 Audiveris 5.x）。
                支持印刷体五线谱图片 / PDF；简谱图片暂不支持；曲名默认用文件名。
              </p>
            </div>
          )}

          {importStatus && <p className="muted small">{importStatus}</p>}
          {importError && <p className="error">{importError}</p>}
        </section>
      )}

      <main className="main-grid">
        <div className="left-rail">
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

            <div className="octave-control">
              <span>八度</span>
              <button onClick={() => setOctaveShift(value => Math.max(-2, value - 1))}>−1</button>
              <button onClick={() => setOctaveShift(0)}>0</button>
              <button onClick={() => setOctaveShift(value => Math.min(2, value + 1))}>+1</button>
              <strong>{octaveShift > 0 ? `+${octaveShift}` : octaveShift}</strong>
            </div>

            <div className="fixed-do-card">
              <span>简谱基准</span>
              <strong>1=C</strong>
              <small>1 = {anchor} = 5 吹</small>
            </div>

            <p className="hint">看五线谱时先看调号；简谱把升降号显式写出。原调只作标签，演奏看当前调。</p>
            <p className="hint">孔位是优化器选的，不是固定映射；关掉孔位时只看音高。</p>

            <details className="duration-help">
              <summary>时值写法</summary>
              <p>
                四分 <b>1</b>；二分 <b>1 —</b>；全音符 <b>1 — — —</b>；八分数字下 1 条线；十六分 2 条线；附点数字后加点；休止 <b>0</b>。
              </p>
            </details>
          </aside>

          <RecommendationTable
            recommendations={recommendations}
            current={effectiveTransposition}
            onSelect={value => {
              setTransposition(value)
              setOctaveShift(0)
            }}
          />
          <MetricsPanel result={result} />
          <HardSpotList result={result} />
        </div>

        <section
          className={`panel score-panel${view === 'jianpu' ? ' jianpu-panel' : ''}`}
        >
            <>
              {!result && (
                <div className="range-warning">
                  <span>当前移调超出 {layout.name} 的音域。</span>
                  <button onClick={() => setOctaveShift(value => Math.max(-2, value - 1))}>降八度</button>
                  <button onClick={() => setOctaveShift(value => Math.min(2, value + 1))}>升八度</button>
                </div>
              )}
              {view === 'jianpu' ? (
                <JianpuView
                  score={score}
                  transpose={effectiveTransposition}
                  sig={currentSig}
                  fingerings={result?.fingerings ?? []}
                  showTab={showTab}
                />
              ) : (
                <>
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
                  <StaffView
                    sections={score.sections}
                    notes={score.notes}
                    transpose={effectiveTransposition}
                    sig={currentSig}
                    timeSignature={score.timeSignature}
                    hardSpotIds={hardSpotIds}
                  />
                </>
              )}
            </>
        </section>
      </main>

      <footer>
        <span>固定 1=C · 12 孔 C 半音阶（tenor 默认）· 标准 12 孔 / 16 孔可切换</span>
        <span>设计文档在 docs/DESIGN.md</span>
      </footer>
    </div>
  )
}
