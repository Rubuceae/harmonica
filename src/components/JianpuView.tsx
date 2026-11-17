import { useEffect, useRef, useState } from 'react'
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

const BEAT_WIDTH = 64
const MEASURE_PAD = 8
const NUMBER_Y = 26
const BEAM_Y = 42
const LINE_HEIGHT = 64
const TAB_LINE_HEIGHT = 80

type Event =
  | { kind: 'note'; note: NoteEvent; index: number; duration: number }
  | { kind: 'rest'; id: string; onset: number; duration: number }

type Measure = { measure: number; events: Event[] }

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

function fontSize(level: number): number {
  if (level >= 2) return 14
  if (level === 1) return 18
  return 20
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
    const events: Event[] = []
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
    if (events.length > 0) measures.push({ measure, events })
  }
  return measures
}

function eventOnset(event: Event): number {
  return event.kind === 'note' ? event.note.onset : event.onset
}

export function JianpuView({
  notes,
  transpose,
  sig,
  timeSignature,
  hardSpotIds,
  fingerings,
  showTab,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(900)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const update = () => setWidth(container.clientWidth || 900)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const measureBeats = (timeSignature[0] * 4) / timeSignature[1]
  const measureWidth = measureBeats * BEAT_WIDTH + MEASURE_PAD * 2
  const perLine = Math.max(1, Math.min(4, Math.floor((width - 16) / measureWidth)))
  const measures = buildMeasures(notes, measureBeats)
  const lineHeight = showTab ? TAB_LINE_HEIGHT : LINE_HEIGHT
  const lineCount = Math.max(1, Math.ceil(measures.length / perLine))
  const svgWidth = perLine * measureWidth + 16
  const svgHeight = lineCount * lineHeight + 8

  const xOf = (event: Event, measureIndex: number, measureStart: number) =>
    8 + measureIndex * measureWidth + MEASURE_PAD + (eventOnset(event) - measureStart) * BEAT_WIDTH

  return (
    <div className="jianpu-svg" ref={containerRef}>
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        role="img"
        aria-label="简谱"
      >
        {Array.from({ length: lineCount }).map((_, lineIndex) => {
          const lineMeasures = measures.slice(lineIndex * perLine, lineIndex * perLine + perLine)
          return (
            <g key={lineIndex} transform={`translate(0 ${lineIndex * lineHeight + 8})`}>
              {lineMeasures.map((measure, measureIndex) => {
                const measureStart = (measure.measure - 1) * measureBeats
                const measureX = 8 + measureIndex * measureWidth
                const events = measure.events
                const groups: Event[][] = []
                let group: Event[] = []
                for (const event of events) {
                  if (beamLevel(event.duration) >= 1) {
                    group.push(event)
                  } else if (group.length > 0) {
                    groups.push(group)
                    group = []
                  }
                }
                if (group.length > 0) groups.push(group)

                return (
                  <g key={measure.measure}>
                    <line
                      x1={measureX}
                      y1={8}
                      x2={measureX}
                      y2={lineHeight - 12}
                      stroke="#b8b2a8"
                      strokeWidth={1}
                    />
                    {events.map((event, eventIndex) => {
                      const x = xOf(event, measureIndex, measureStart)
                      const level = beamLevel(event.duration)
                      const fs = fontSize(level)
                      const dotted = isDotted(event.duration)
                      const dashes = dashCount(event.duration)
                      const isNote = event.kind === 'note'
                      const hard = isNote && hardSpotIds.has(event.note.id)
                      const color = isNote ? (hard ? '#c2410c' : '#1f2933') : '#9ca3af'
                      let degree = '0'
                      let accidental = ''
                      let octave = 0
                      if (isNote) {
                        const jp = jianpuForMidi(event.note.midi + transpose, sig.preferFlats)
                        degree = String(jp.degree)
                        accidental = jp.accidental
                        octave = jp.octave
                      }
                      return (
                        <g key={isNote ? event.note.id : `rest-${eventIndex}`}>
                          {Array.from({ length: Math.abs(octave) }).map((_, dotIndex) => (
                            <circle
                              key={`oct-${dotIndex}`}
                              cx={x}
                              cy={octave > 0 ? 10 - dotIndex * 4 : 34 + dotIndex * 4}
                              r={1.5}
                              fill="#b45309"
                            />
                          ))}
                          {accidental && (
                            <text
                              x={x - fs * 0.4}
                              y={NUMBER_Y}
                              textAnchor="end"
                              fontSize={fs * 0.55}
                              fill="#b45309"
                            >
                              {accidental}
                            </text>
                          )}
                          <text
                            x={x}
                            y={NUMBER_Y}
                            textAnchor="middle"
                            fontSize={fs}
                            fontWeight={650}
                            fill={color}
                            fontFamily="Inter, 'Noto Sans SC', sans-serif"
                          >
                            {degree}
                          </text>
                          {dotted && <circle cx={x + fs * 0.4} cy={NUMBER_Y - 5} r={1.6} fill={color} />}
                          {Array.from({ length: dashes }).map((_, dashIndex) => (
                            <line
                              key={`dash-${dashIndex}`}
                              x1={x + (dashIndex + 1) * BEAT_WIDTH - 4}
                              x2={x + (dashIndex + 1) * BEAT_WIDTH + 4}
                              y1={NUMBER_Y - 4}
                              y2={NUMBER_Y - 4}
                              stroke="#6b7280"
                              strokeWidth={1.5}
                              strokeLinecap="round"
                            />
                          ))}
                          {showTab && isNote && fingerings[event.index] && (
                            <text
                              x={x}
                              y={LINE_HEIGHT - 8}
                              textAnchor="middle"
                              fontSize={9}
                              fill={
                                fingerings[event.index].breath === 'blow' ? '#2563eb' : '#dc2626'
                              }
                            >
                              {fingerings[event.index].hole}
                              {fingerings[event.index].breath === 'blow' ? '↑' : '↓'}
                              {fingerings[event.index].slide ? '+' : ''}
                            </text>
                          )}
                        </g>
                      )
                    })}
                    {groups.map((beamGroup, groupIndex) => {
                      const maxLevel = Math.max(...beamGroup.map(event => beamLevel(event.duration)))
                      return Array.from({ length: maxLevel }).map((_, levelIndex) => {
                        const level = levelIndex + 1
                        const matching = beamGroup.filter(event => beamLevel(event.duration) >= level)
                        if (matching.length === 0) return null
                        const first = xOf(matching[0], measureIndex, measureStart) - 7
                        const last = xOf(matching[matching.length - 1], measureIndex, measureStart) + 7
                        return (
                          <line
                            key={`beam-${groupIndex}-${level}`}
                            x1={first}
                            x2={last}
                            y1={BEAM_Y + levelIndex * 4}
                            y2={BEAM_Y + levelIndex * 4}
                            stroke="#1f2933"
                            strokeWidth={level === 1 ? 1.7 : 1.5}
                            strokeLinecap="round"
                          />
                        )
                      })
                    })}
                    {measureIndex === lineMeasures.length - 1 && (
                      <line
                        x1={measureX + measureWidth}
                        y1={8}
                        x2={measureX + measureWidth}
                        y2={lineHeight - 12}
                        stroke="#b8b2a8"
                        strokeWidth={1}
                      />
                    )}
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
