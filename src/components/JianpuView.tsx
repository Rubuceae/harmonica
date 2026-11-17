import type { KeySignature } from '../core/keys'
import { jianpuForMidi } from '../core/jianpu'
import type { Fingering, NoteEvent } from '../core/types'

type Props = {
  notes: NoteEvent[]
  transpose: number
  sig: KeySignature
  timeSignature: [number, number]
  hardSpotIds: Set<string>
  fingerings: Fingering[]
  showTab: boolean
}

const BASE_WIDTH = 56

type DurationInfo = {
  dotted: boolean
  dashes: number
  underlines: number
  width: number
}

function durationInfo(duration: number, unit: number): DurationInfo {
  const candidates = [4, 2, 1, 0.5, 0.25, 0.125]
  const base = candidates.find(value => duration >= value - 1e-6) ?? 0.125
  const dotted = Math.abs(duration - base * 1.5) < 1e-6
  const dashes = base >= 1 ? Math.round(base - 1) : 0
  const underlines = base < 1 ? Math.round(Math.log2(1 / base)) : 0
  const minWidth = base <= 0.25 ? 24 : base <= 0.5 ? 30 : 34
  return {
    dotted,
    dashes,
    underlines,
    width: Math.max(minWidth, duration * unit),
  }
}

type GlyphProps = {
  degree: string
  accidental?: '#' | 'b' | ''
  octave?: number
  duration: number
  hard?: boolean
  rest?: boolean
  tab?: string
  tabBreath?: 'blow' | 'draw'
  unit?: number
}

function JianpuGlyph({
  degree,
  accidental = '',
  octave = 0,
  duration,
  hard,
  rest,
  tab,
  tabBreath,
  unit = BASE_WIDTH,
}: GlyphProps) {
  const info = durationInfo(duration, unit)
  const sizeClass = info.underlines > 1 ? ' tiny' : info.underlines > 0 ? ' short' : ''
  return (
    <div
      className={`jp-event${hard ? ' hard' : ''}${rest ? ' rest' : ''}${sizeClass}`}
      style={{ width: `${info.width}px` }}
      title={`${duration} 拍`}
    >
      <div className="jp-above">{octave > 0 ? '·'.repeat(octave) : '\u00a0'}</div>
      <div className="jp-row">
        <span className="jp-main">
          {accidental && <span className="acc">{accidental}</span>}
          <span className="degree">{degree}</span>
          {info.dotted && <span className="dot-mark">·</span>}
        </span>
        {info.dashes > 0 && (
          <span className="jp-dashes">
            {Array.from({ length: info.dashes }).map((_, index) => (
              <span className="dash" key={index}>
                —
              </span>
            ))}
          </span>
        )}
      </div>
      <div className="jp-below">{octave < 0 ? '·'.repeat(-octave) : '\u00a0'}</div>
      <div className="jp-underlines">
        {Array.from({ length: info.underlines }).map((_, index) => (
          <span className="underline" key={index} />
        ))}
      </div>
      {tab && <div className={`tab ${tabBreath ?? ''}`}>{tab}</div>}
    </div>
  )
}

type MeasureEvent =
  | { kind: 'note'; note: NoteEvent; index: number }
  | { kind: 'rest'; id: string; duration: number }

export function JianpuView({
  notes,
  transpose,
  sig,
  timeSignature,
  hardSpotIds,
  fingerings,
  showTab,
}: Props) {
  const measureBeats = (timeSignature[0] * 4) / timeSignature[1]
  const byMeasure = new Map<number, { note: NoteEvent; index: number }[]>()
  notes.forEach((note, index) => {
    const list = byMeasure.get(note.measure) ?? []
    list.push({ note, index })
    byMeasure.set(note.measure, list)
  })

  const maxMeasure = Math.max(...byMeasure.keys(), 1)
  const measures: { measure: number; events: MeasureEvent[] }[] = []
  for (let measure = 1; measure <= maxMeasure; measure += 1) {
    const start = (measure - 1) * measureBeats
    const items = (byMeasure.get(measure) ?? []).slice().sort((a, b) => a.note.onset - b.note.onset)
    const events: MeasureEvent[] = []
    let cursor = start
    for (const item of items) {
      const gap = item.note.onset - cursor
      if (gap > 1e-6) {
        events.push({ kind: 'rest', id: `r${measure}-${events.length}`, duration: gap })
      }
      events.push({ kind: 'note', note: item.note, index: item.index })
      cursor = item.note.onset + item.note.duration
    }
    const tail = start + measureBeats - cursor
    if (tail > 1e-6) {
      events.push({ kind: 'rest', id: `r${measure}-tail`, duration: tail })
    }
    if (events.length > 0) measures.push({ measure, events })
  }

  return (
    <div className="jianpu">
      {measures.map(({ measure, events }) => (
        <div className="measure" key={measure}>
          <span className="measure-number">{measure}</span>
          <div className="measure-notes">
            {events.map(event => {
              if (event.kind === 'rest') {
                return <JianpuGlyph key={event.id} degree="0" duration={event.duration} rest />
              }
              const { note, index } = event
              const jp = jianpuForMidi(note.midi + transpose, sig.preferFlats)
              const fingering = fingerings[index]
              const tab =
                showTab && fingering
                  ? `${fingering.hole}${fingering.breath === 'blow' ? '↑' : '↓'}${fingering.slide ? '+' : ''}`
                  : undefined
              return (
                <JianpuGlyph
                  key={note.id}
                  degree={String(jp.degree)}
                  accidental={jp.accidental}
                  octave={jp.octave}
                  duration={note.duration}
                  hard={hardSpotIds.has(note.id)}
                  tab={tab}
                  tabBreath={fingering?.breath}
                />
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export function DurationLegend() {
  const samples: { label: string; duration: number }[] = [
    { label: '四分', duration: 1 },
    { label: '二分', duration: 2 },
    { label: '全音符', duration: 4 },
    { label: '八分', duration: 0.5 },
    { label: '十六分', duration: 0.25 },
    { label: '附点四分', duration: 1.5 },
    { label: '附点二分', duration: 3 },
  ]

  return (
    <div className="duration-legend">
      <span className="legend-title">时值</span>
      {samples.map(sample => (
        <div className="legend-item" key={sample.label}>
          <JianpuGlyph degree="1" duration={sample.duration} unit={36} />
          <span>{sample.label}</span>
        </div>
      ))}
    </div>
  )
}
