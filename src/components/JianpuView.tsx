import type { KeySignature } from '../core/keys'
import { keySignatureFor } from '../core/keys'
import { jianpuForMidi } from '../core/jianpu'
import type { Fingering, NoteEvent, Score } from '../core/types'

type Props = {
  score: Score
  transpose: number
  sig: KeySignature
  hardSpotIds: Set<string>
  fingerings: Fingering[]
  showTab: boolean
}

const W = 1000
const MARGIN = 44
const HEADER_H = 232
const MEASURES_PER_LINE = 2
const MEASURE_PAD = 14
const NOTE_BASE = 30
const NOTE_FONT = 28
const LYRIC_FONT = 20
const LYRIC_OFFSET = 40
const LYRIC_GAP = 30

type RawEvent =
  | { kind: 'note'; note: NoteEvent; index: number; duration: number }
  | { kind: 'rest'; id: string; onset: number; duration: number }

type Token =
  | { kind: 'note'; note: NoteEvent; index: number; beam: number; dotted: boolean }
  | { kind: 'dash'; id: string }
  | { kind: 'rest'; id: string; beam: number }

type Measure = { measure: number; tokens: Token[] }

function baseDuration(duration: number): number {
  const candidates = [4, 2, 1, 0.5, 0.25, 0.125]
  return candidates.find(value => duration >= value - 1e-6) ?? 0.125
}

function beamLevel(duration: number): number {
  const base = baseDuration(duration)
  return base >= 1 ? 0 : Math.round(Math.log2(1 / base))
}

function isDotted(duration: number): boolean {
  const base = baseDuration(duration)
  return Math.abs(duration - base * 1.5) < 1e-6
}

function dashCount(duration: number): number {
  const base = baseDuration(duration)
  return base >= 1 ? Math.round(base - 1) : 0
}

function buildMeasures(notes: NoteEvent[], measureBeats: number): Measure[] {
  const byMeasure = new Map<number, { note: NoteEvent; index: number }[]>()
  notes.forEach((note, index) => {
    const list = byMeasure.get(note.measure) ?? []
    list.push({ note, index })
    byMeasure.set(note.measure, list)
  })

  const maxMeasure = Math.max(...byMeasure.keys(), 1)
  const measures: Measure[] = []
  for (let measure = 1; measure <= maxMeasure; measure += 1) {
    const start = (measure - 1) * measureBeats
    const items = (byMeasure.get(measure) ?? []).slice().sort((a, b) => a.note.onset - b.note.onset)
    const events: RawEvent[] = []
    let cursor = start
    for (const item of items) {
      const gap = item.note.onset - cursor
      if (gap > 1e-6) {
        events.push({ kind: 'rest', id: `r${measure}-${events.length}`, onset: cursor, duration: gap })
      }
      events.push({ kind: 'note', note: item.note, index: item.index, duration: item.note.duration })
      cursor = item.note.onset + item.note.duration
    }
    const tail = start + measureBeats - cursor
    if (tail > 1e-6) {
      events.push({ kind: 'rest', id: `r${measure}-tail`, onset: cursor, duration: tail })
    }

    const tokens: Token[] = []
    for (const event of events) {
      if (event.kind === 'note') {
        tokens.push({
          kind: 'note',
          note: event.note,
          index: event.index,
          beam: beamLevel(event.duration),
          dotted: isDotted(event.duration),
        })
        for (let i = 0; i < dashCount(event.duration); i += 1) {
          tokens.push({ kind: 'dash', id: `${event.note.id}-d${i}` })
        }
      } else {
        tokens.push({ kind: 'rest', id: event.id, beam: beamLevel(event.duration) })
        for (let i = 0; i < dashCount(event.duration); i += 1) {
          tokens.push({ kind: 'dash', id: `${event.id}-d${i}` })
        }
      }
    }
    if (tokens.length > 0) measures.push({ measure, tokens })
  }
  return measures
}

type LineLayout = {
  line: Measure[]
  colW: number
  widths: number[]
  startX: number
  baseline: number
}

export function JianpuView({ score, transpose, sig, hardSpotIds, fingerings, showTab }: Props) {
  const [beats, beatType] = score.timeSignature
  const measureBeats = (beats * 4) / beatType
  const measures = buildMeasures(score.notes, measureBeats)
  const verseCount = score.notes.reduce((max, note) => Math.max(max, note.lyrics?.length ?? 0), 0)
  const lineHeight = 96 + verseCount * 15 + (showTab ? 18 : 0)
  const lines: Measure[][] = []
  for (let i = 0; i < measures.length; i += MEASURES_PER_LINE) {
    lines.push(measures.slice(i, i + MEASURES_PER_LINE))
  }
  const height = HEADER_H + Math.max(1, lines.length) * lineHeight + 24

  const layouts: LineLayout[] = lines.map((line, lineIndex) => {
    const totalTokens = line.reduce((sum, measure) => sum + measure.tokens.length, 0)
    const fixed = line.length * MEASURE_PAD * 2
    const colW = Math.max(
      30,
      Math.min(110, (W - MARGIN * 2 - fixed) / Math.max(1, totalTokens)),
    )
    const widths = line.map(measure => MEASURE_PAD * 2 + measure.tokens.length * colW)
    const totalW = widths.reduce((sum, value) => sum + value, 0)
    return {
      line,
      colW,
      widths,
      startX: Math.max(MARGIN, (W - totalW) / 2),
      baseline: HEADER_H + lineIndex * lineHeight + NOTE_BASE,
    }
  })

  const positions = new Map<string, { x: number; baseline: number; lineIndex: number }>()
  layouts.forEach((layout, lineIndex) => {
    let offset = 0
    layout.line.forEach((measure, measureIndex) => {
      const measureX = layout.startX + offset
      measure.tokens.forEach((token, tokenIndex) => {
        if (token.kind !== 'note') return
        positions.set(token.note.id, {
          x: measureX + MEASURE_PAD + tokenIndex * layout.colW + layout.colW / 2,
          baseline: layout.baseline,
          lineIndex,
        })
      })
      offset += layout.widths[measureIndex]
    })
  })

  const title = score.title || '未命名'
  const titleSize = Math.min(48, 900 / Math.max(1, title.length))
  const originalLabel = keySignatureFor(score.originalKey).label

  return (
    <div className="jianpu-svg">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        fontFamily="PingFang SC, Microsoft YaHei, Noto Sans, Source Han Serif SC, sans-serif"
        role="img"
        aria-label="简谱"
      >
        <rect x={0} y={0} width={W} height={height} fill="#f0fdfa" />
        <text x={W / 2} y={52} textAnchor="middle" fontSize={titleSize} fill="#0ea5e9">
          {title}
        </text>
        {score.composer && (
          <text x={960} y={96} textAnchor="end" fontSize={16} fill="#475569">
            {score.composer}
          </text>
        )}
        {score.lyricist && (
          <text x={960} y={118} textAnchor="end" fontSize={16} fill="#475569">
            {score.lyricist}
          </text>
        )}
        <text x={40} y={98} fontSize={22} fill="#475569">
          1=C
        </text>
        <text x={40} y={126} fontSize={16} fill="#475569">
          {beats}/{beatType}
        </text>
        <text x={40} y={156} fontSize={16} fill="#475569">
          ♩ = {score.tempo}
        </text>
        <text x={40} y={184} fontSize={14} fill="#475569">
          原调 {originalLabel} · 当前 {sig.label}
        </text>

        {layouts.map((layout, lineIndex) => {
          const noteFont = layout.colW < 40 ? 22 : NOTE_FONT
          const lyricFont = layout.colW < 40 ? 18 : LYRIC_FONT
          const barBottom =
            layout.baseline +
            LYRIC_OFFSET +
            Math.max(0, verseCount - 1) * LYRIC_GAP +
            14
          return (
            <g key={lineIndex}>
              {layout.line.map((measure, measureIndex) => {
                const measureX =
                  layout.startX +
                  layout.widths.slice(0, measureIndex).reduce((sum, value) => sum + value, 0)
                const measureW = layout.widths[measureIndex]
                const tokens = measure.tokens
                const groups: { token: Token; index: number }[][] = []
                let group: { token: Token; index: number }[] = []
                tokens.forEach((token, tokenIndex) => {
                  if (token.kind === 'note' && token.beam >= 1) {
                    group.push({ token, index: tokenIndex })
                  } else if (group.length > 0) {
                    groups.push(group)
                    group = []
                  }
                })
                if (group.length > 0) groups.push(group)

                return (
                  <g key={measure.measure}>
                    <line
                      x1={measureX}
                      y1={layout.baseline - 40}
                      x2={measureX}
                      y2={barBottom}
                      stroke="#b6c2cf"
                      strokeWidth={1}
                    />
                    {tokens.map((token, tokenIndex) => {
                      const x = measureX + MEASURE_PAD + tokenIndex * layout.colW + layout.colW / 2
                      if (token.kind === 'dash') {
                        return (
                          <line
                            key={token.id}
                            x1={x - 6}
                            x2={x + 6}
                            y1={layout.baseline - 4}
                            y2={layout.baseline - 4}
                            stroke="#475569"
                            strokeWidth={2}
                            strokeLinecap="round"
                          />
                        )
                      }
                      if (token.kind === 'rest') {
                        return (
                          <text
                            key={token.id}
                            x={x}
                            y={layout.baseline}
                            textAnchor="middle"
                            fontSize={noteFont}
                            fill="#94a3b8"
                          >
                            0
                          </text>
                        )
                      }
                      const jp = jianpuForMidi(token.note.midi + transpose, sig.preferFlats)
                      const hard = hardSpotIds.has(token.note.id)
                      return (
                        <g key={token.note.id}>
                          {Array.from({ length: Math.abs(jp.octave) }).map((_, dotIndex) => (
                            <circle
                              key={`oct-${dotIndex}`}
                              cx={x}
                              cy={
                                jp.octave > 0
                                  ? layout.baseline - 34 - dotIndex * 6
                                  : layout.baseline + 8 + dotIndex * 6
                              }
                              r={2}
                              fill="#0f172a"
                            />
                          ))}
                          {jp.accidental && (
                            <text
                              x={x - noteFont * 0.45}
                              y={layout.baseline}
                              textAnchor="end"
                              fontSize={noteFont * 0.55}
                              fill="#0f172a"
                            >
                              {jp.accidental}
                            </text>
                          )}
                          <text
                            x={x}
                            y={layout.baseline}
                            textAnchor="middle"
                            fontSize={noteFont}
                            fill="#0f172a"
                          >
                            {jp.degree}
                          </text>
                          {token.dotted && (
                            <circle cx={x + noteFont * 0.4} cy={layout.baseline - 8} r={2.2} fill="#0f172a" />
                          )}
                          {(token.note.lyrics ?? []).map((syllable, verseIndex) =>
                            syllable ? (
                              <text
                                key={`lyric-${verseIndex}`}
                                x={x}
                                y={layout.baseline + LYRIC_OFFSET + verseIndex * LYRIC_GAP}
                                textAnchor="middle"
                                fontSize={lyricFont}
                                fill="#475569"
                              >
                                {syllable}
                              </text>
                            ) : null,
                          )}
                          {showTab && fingerings[token.index] && (
                            <text
                              x={x}
                              y={
                                layout.baseline +
                                LYRIC_OFFSET +
                                verseCount * LYRIC_GAP +
                                4
                              }
                              textAnchor="middle"
                              fontSize={10}
                              fill={
                                fingerings[token.index].breath === 'blow' ? '#2563eb' : '#dc2626'
                              }
                            >
                              {fingerings[token.index].hole}
                              {fingerings[token.index].breath === 'blow' ? '↑' : '↓'}
                              {fingerings[token.index].slide ? '+' : ''}
                            </text>
                          )}
                          {hard && (
                            <circle
                              cx={x + noteFont * 0.5}
                              cy={layout.baseline - noteFont}
                              r={2.6}
                              fill="#f97316"
                            />
                          )}
                        </g>
                      )
                    })}
                    {groups.map((beamGroup, groupIndex) => {
                      const maxLevel = Math.max(
                        ...beamGroup.map(item =>
                          item.token.kind === 'note' ? item.token.beam : 0,
                        ),
                      )
                      return Array.from({ length: maxLevel }).map((_, levelIndex) => {
                        const level = levelIndex + 1
                        const matching = beamGroup.filter(
                          item => item.token.kind === 'note' && item.token.beam >= level,
                        )
                        if (matching.length === 0) return null
                        const firstX =
                          measureX +
                          MEASURE_PAD +
                          matching[0].index * layout.colW +
                          layout.colW / 2 -
                          layout.colW / 2
                        const lastX =
                          measureX +
                          MEASURE_PAD +
                          matching[matching.length - 1].index * layout.colW +
                          layout.colW / 2 +
                          layout.colW / 2
                        return (
                          <line
                            key={`beam-${groupIndex}-${level}`}
                            x1={firstX}
                            x2={lastX}
                            y1={layout.baseline + 20 + levelIndex * 5}
                            y2={layout.baseline + 20 + levelIndex * 5}
                            stroke="#0f172a"
                            strokeWidth={2}
                            strokeLinecap="round"
                          />
                        )
                      })
                    })}
                    {measureIndex === layout.line.length - 1 && (
                      <line
                        x1={measureX + measureW}
                        y1={layout.baseline - 40}
                        x2={measureX + measureW}
                        y2={barBottom}
                        stroke="#b6c2cf"
                        strokeWidth={1}
                      />
                    )}
                  </g>
                )
              })}
            </g>
          )
        })}

        {(score.slurs ?? []).map((slur, slurIndex) => {
          const from = positions.get(slur.from)
          const to = positions.get(slur.to)
          if (!from || !to || from.lineIndex !== to.lineIndex || from.x === to.x) return null
          const x1 = from.x
          const x2 = to.x
          const y = from.baseline - 42
          const lift = Math.min(30, Math.max(16, Math.abs(x2 - x1) * 0.15))
          return (
            <path
              key={`slur-${slurIndex}`}
              d={`M ${x1} ${y} Q ${(x1 + x2) / 2} ${y - lift} ${x2} ${y}`}
              fill="none"
              stroke="#0f172a"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          )
        })}
      </svg>
    </div>
  )
}
