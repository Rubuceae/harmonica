import type { KeySignature } from '../core/keys'
import { keySignatureFor } from '../core/keys'
import { jianpuForMidi } from '../core/jianpu'
import type { Fingering, NoteEvent, Score } from '../core/types'

type Props = {
  score: Score
  transpose: number
  sig: KeySignature
  fingerings: Fingering[]
  showTab: boolean
}

const W = 1000
const MARGIN = 44
const HEADER_H = 150
const MAX_TOKENS = 26
const MAX_MEASURES = 6
const MEASURE_PAD = 8
const NOTE_BASE = 22
const NOTE_FONT = 20
const LYRIC_FONT = 15
const LYRIC_OFFSET = 34
const LYRIC_GAP = 18
const BEAM_OFFSET = 12
const BEAM_GAP = 3.5

type RawEvent =
  | { kind: 'note'; note: NoteEvent; index: number; duration: number }
  | { kind: 'rest'; id: string; onset: number; duration: number }

type Token =
  | {
      kind: 'note'
      note: NoteEvent
      index: number
      beam: number
      dotted: boolean
      onset: number
      duration: number
    }
  | { kind: 'dash'; id: string; onset: number }
  | { kind: 'rest'; id: string; beam: number; onset: number; duration: number }

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
        const onset = event.note.onset
        tokens.push({
          kind: 'note',
          note: event.note,
          index: event.index,
          beam: beamLevel(event.duration),
          dotted: isDotted(event.duration),
          onset,
          duration: event.duration,
        })
        for (let i = 0; i < dashCount(event.duration); i += 1) {
          tokens.push({ kind: 'dash', id: `${event.note.id}-d${i}`, onset: onset + event.duration })
        }
      } else {
        tokens.push({
          kind: 'rest',
          id: event.id,
          beam: beamLevel(event.duration),
          onset: event.onset,
          duration: event.duration,
        })
        for (let i = 0; i < dashCount(event.duration); i += 1) {
          tokens.push({ kind: 'dash', id: `${event.id}-d${i}`, onset: event.onset + event.duration })
        }
      }
    }
    if (tokens.length > 0) measures.push({ measure, tokens })
  }
  return measures
}

type LineLayout = {
  line: Measure[]
  measureW: number
  baseline: number
}

export function JianpuView({ score, transpose, sig, fingerings, showTab }: Props) {
  const [beats, beatType] = score.timeSignature
  const measureBeats = (beats * 4) / beatType
  const measures = buildMeasures(score.notes, measureBeats)
  const verseCount = score.notes.reduce((max, note) => Math.max(max, note.lyrics?.length ?? 0), 0)
  const lines: Measure[][] = []
  let current: Measure[] = []
  let tokenCount = 0
  for (const measure of measures) {
    if (
      current.length > 0 &&
      (tokenCount + measure.tokens.length > MAX_TOKENS || current.length >= MAX_MEASURES)
    ) {
      lines.push(current)
      current = []
      tokenCount = 0
    }
    current.push(measure)
    tokenCount += measure.tokens.length
  }
  if (current.length > 0) lines.push(current)

  const lineHeight = 78 + verseCount * 9 + (showTab ? 12 : 0)
  const layouts: LineLayout[] = lines.map((line, lineIndex) => {
    const isLast = lineIndex === lines.length - 1 && lineIndex > 0
    const count = isLast ? lines[lineIndex - 1].length : line.length
    return {
      line,
      measureW: (W - MARGIN * 2) / Math.max(1, count),
      baseline: HEADER_H + lineIndex * lineHeight + NOTE_BASE,
    }
  })
  const height = HEADER_H + Math.max(1, lines.length) * lineHeight + 16

  const stepOf = (measure: Measure, measureW: number) =>
    (measureW - MEASURE_PAD * 2) / Math.max(1, measure.tokens.length)
  const xOf = (layout: LineLayout, measureIndex: number, tokenIndex: number) => {
    const measure = layout.line[measureIndex]
    const measureX = MARGIN + measureIndex * layout.measureW
    const step = stepOf(measure, layout.measureW)
    return measureX + MEASURE_PAD + (tokenIndex + 0.5) * step
  }

  const positions = new Map<string, { x: number; baseline: number; lineIndex: number }>()
  layouts.forEach((layout, lineIndex) => {
    layout.line.forEach((measure, measureIndex) => {
      measure.tokens.forEach((token, tokenIndex) => {
        if (token.kind !== 'note') return
        positions.set(token.note.id, {
          x: xOf(layout, measureIndex, tokenIndex),
          baseline: layout.baseline,
          lineIndex,
        })
      })
    })
  })

  const title = score.title || '未命名'
  const titleSize = Math.min(24, 800 / Math.max(1, title.length))
  const originalLabel = keySignatureFor(score.originalKey).label

  return (
    <div className="jianpu-svg">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        fontFamily={'"PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Noto Sans", sans-serif'}
        role="img"
        aria-label="简谱"
      >
        <rect x={0} y={0} width={W} height={height} fill="#f0fdfa" />
        <text x={W / 2} y={34} textAnchor="middle" fontSize={titleSize} fontWeight={500} fill="#0ea5e9">
          {title}
        </text>
        {score.composer && (
          <text x={960} y={62} textAnchor="end" fontSize={11.5} fill="#475569">
            {score.composer}
          </text>
        )}
        {score.lyricist && (
          <text x={960} y={78} textAnchor="end" fontSize={11.5} fill="#475569">
            {score.lyricist}
          </text>
        )}
        <text x={40} y={64} fontSize={14} fill="#475569">
          1=C
        </text>
        <text x={40} y={86} fontSize={11.5} fill="#475569">
          {beats}/{beatType}
        </text>
        <text x={40} y={104} fontSize={11.5} fill="#475569">
          ♩ = {score.tempo}
        </text>
        <text x={40} y={120} fontSize={10} fill="#475569">
          原调 {originalLabel} · 当前 {sig.label}
        </text>

        {layouts.map((layout, lineIndex) => {
          const barBottom =
            layout.baseline + LYRIC_OFFSET + Math.max(0, verseCount - 1) * LYRIC_GAP + 12
          return (
            <g key={lineIndex}>
              {layout.line.map((measure, measureIndex) => {
                const measureX = MARGIN + measureIndex * layout.measureW
                const step = stepOf(measure, layout.measureW)
                const groups: { token: Token; index: number; beat: number }[][] = []
                let group: { token: Token; index: number; beat: number }[] = []
                let groupBeat = -1
                const flush = () => {
                  if (group.length > 0) {
                    groups.push(group)
                    group = []
                    groupBeat = -1
                  }
                }
                measure.tokens.forEach((token, tokenIndex) => {
                  if (token.kind === 'note' && token.beam >= 1) {
                    const beat = Math.floor(token.onset - (measure.measure - 1) * measureBeats + 1e-6)
                    if (group.length > 0 && beat !== groupBeat) flush()
                    group.push({ token, index: tokenIndex, beat })
                    groupBeat = beat
                  } else {
                    flush()
                  }
                })
                flush()

                return (
                  <g key={measure.measure}>
                    <line
                      x1={measureX}
                      y1={layout.baseline - 28}
                      x2={measureX}
                      y2={barBottom}
                      stroke="#b6c2cf"
                      strokeWidth={1}
                    />
                    {measure.tokens.map((token, tokenIndex) => {
                      const x = measureX + MEASURE_PAD + (tokenIndex + 0.5) * step
                      if (token.kind === 'dash') {
                        return (
                          <line
                            key={token.id}
                            x1={x - 4}
                            x2={x + 4}
                            y1={layout.baseline - 3}
                            y2={layout.baseline - 3}
                            stroke="#475569"
                            strokeWidth={1.6}
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
                            fontSize={NOTE_FONT}
                            fontWeight={600}
                            fill="#0f172a"
                          >
                            0
                          </text>
                        )
                      }
                      const jp = jianpuForMidi(token.note.midi + transpose, sig.preferFlats)
                      return (
                        <g key={token.note.id}>
                          {Array.from({ length: Math.abs(jp.octave) }).map((_, dotIndex) => (
                            <circle
                              key={`oct-${dotIndex}`}
                              cx={x}
                              cy={
                                jp.octave > 0
                                  ? layout.baseline - 26 - dotIndex * 4.5
                                  : layout.baseline + 4 + dotIndex * 4.5
                              }
                              r={2.2}
                              fill="#0f172a"
                            />
                          ))}
                          {jp.accidental && (
                            <text
                              x={x - NOTE_FONT * 0.5}
                              y={layout.baseline}
                              textAnchor="end"
                              fontSize={NOTE_FONT * 0.7}
                              fontWeight={600}
                              fill="#b45309"
                            >
                              {jp.accidental}
                            </text>
                          )}
                          <text
                            x={x}
                            y={layout.baseline}
                            textAnchor="middle"
                            fontSize={NOTE_FONT}
                            fontWeight={600}
                            fill="#0f172a"
                          >
                            {jp.degree}
                          </text>
                          {token.dotted && (
                            <circle
                              cx={x + NOTE_FONT * 0.38}
                              cy={layout.baseline - 5}
                              r={2}
                              fill="#0f172a"
                            />
                          )}
                          {(token.note.lyrics ?? []).map((syllable, verseIndex) =>
                            syllable ? (
                              <text
                                key={`lyric-${verseIndex}`}
                                x={x}
                                y={layout.baseline + LYRIC_OFFSET + verseIndex * LYRIC_GAP}
                                textAnchor="middle"
                                fontSize={LYRIC_FONT}
                                fill="#334155"
                              >
                                {syllable}
                              </text>
                            ) : null,
                          )}
                          {showTab && fingerings[token.index] && (
                            <text
                              x={x}
                              y={layout.baseline + LYRIC_OFFSET + verseCount * LYRIC_GAP + 2}
                              textAnchor="middle"
                              fontSize={9}
                              fill={fingerings[token.index].breath === 'blow' ? '#2563eb' : '#dc2626'}
                            >
                              {fingerings[token.index].hole}
                              {fingerings[token.index].breath === 'blow' ? '↑' : '↓'}
                              {fingerings[token.index].slide ? '+' : ''}
                            </text>
                          )}
                        </g>
                      )
                    })}
                    {groups.map((beamGroup, groupIndex) => {
                      const maxLevel = Math.max(
                        ...beamGroup.map(item => (item.token.kind === 'note' ? item.token.beam : 0)),
                      )
                      return Array.from({ length: maxLevel }).map((_, levelIndex) => {
                        const level = levelIndex + 1
                        const matching = beamGroup.filter(
                          item => item.token.kind === 'note' && item.token.beam >= level,
                        )
                        if (matching.length === 0) return null
                        const firstX =
                          measureX + MEASURE_PAD + (matching[0].index + 0.5) * step - step * 0.35
                        const lastX =
                          measureX +
                          MEASURE_PAD +
                          (matching[matching.length - 1].index + 0.5) * step +
                          step * 0.35
                        return (
                          <line
                            key={`beam-${groupIndex}-${level}`}
                            x1={firstX}
                            x2={lastX}
                            y1={layout.baseline + BEAM_OFFSET + levelIndex * BEAM_GAP}
                            y2={layout.baseline + BEAM_OFFSET + levelIndex * BEAM_GAP}
                            stroke="#0f172a"
                            strokeWidth={1.8}
                            strokeLinecap="round"
                          />
                        )
                      })
                    })}
                    {measureIndex === layout.line.length - 1 && (
                      <line
                        x1={measureX + layout.measureW}
                        y1={layout.baseline - 28}
                        x2={measureX + layout.measureW}
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
          const y = from.baseline - 40
          const lift = Math.min(6, Math.max(4, Math.abs(x2 - x1) * 0.05))
          return (
            <path
              key={`slur-${slurIndex}`}
              d={`M ${x1} ${y} Q ${(x1 + x2) / 2} ${y - lift} ${x2} ${y}`}
              fill="none"
              stroke="#0f172a"
              strokeWidth={1.4}
              strokeLinecap="round"
            />
          )
        })}
      </svg>
    </div>
  )
}
