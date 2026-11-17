import type { Breath, Fingering, HardSpot, Metrics, OptimizationResult, Score } from './types'
import type { HarmonicaLayout } from './layout'
import { fingeringsForMidi } from './layout'
import { keySignatureFor, transposeKey } from './keys'

export type ModeKey = 'air' | 'jump' | 'beginner' | 'slide'

export type Weights = {
  air: number
  jump: number
  slide: number
  breath: number
  register: number
  runThreshold: number
}

export const MODE_WEIGHTS: Record<ModeKey, Weights> = {
  air: { air: 2.0, jump: 1.0, slide: 0.2, breath: 0, register: 0.3, runThreshold: 3 },
  jump: { air: 1.0, jump: 2.5, slide: 0.2, breath: 0, register: 0.3, runThreshold: 3 },
  beginner: { air: 1.0, jump: 1.2, slide: 0.3, breath: 0.8, register: 0.3, runThreshold: 4 },
  slide: { air: 1.5, jump: 1.0, slide: 2.0, breath: 0, register: 0.3, runThreshold: 3 },
}

type LayerEntry = {
  cost: number
  f: Fingering
  run: number
  prevKey: string | null
}

type Run = {
  breath: Breath
  seconds: number
  noteIndices: number[]
}

const bucket = (run: number) => Math.min(16, Math.round(run * 4) / 4)
const stateKey = (f: Fingering, run: number) => `${f.hole}:${f.breath}:${f.slide ? 1 : 0}:${bucket(run)}`

function seconds(duration: number, tempo: number): number {
  return (duration * 60) / tempo
}

function speed(dt: number): number {
  return Math.min(3, Math.max(1, 1 + 0.2 / Math.max(dt, 0.05)))
}

function registerCost(f: Fingering, layout: HarmonicaLayout, w: Weights): number {
  return f.hole <= 2 || f.hole >= layout.holes - 1 ? w.register : 0
}

function runCost(run: number, w: Weights): number {
  const over = Math.max(0, run - w.runThreshold)
  return w.air * over * over
}

function jumpCost(distance: number, w: Weights): number {
  return w.jump * Math.pow(Math.abs(distance), 1.5)
}

function collectRuns(score: Score, fingerings: Fingering[]): Run[] {
  const runs: Run[] = []
  let current: Run | null = null
  for (let i = 0; i < score.notes.length; i += 1) {
    const f = fingerings[i]
    const dt = seconds(score.notes[i].duration, score.tempo)
    if (!current || current.breath !== f.breath) {
      if (current) runs.push(current)
      current = { breath: f.breath, seconds: dt, noteIndices: [i] }
    } else {
      current.seconds += dt
      current.noteIndices.push(i)
    }
  }
  if (current) runs.push(current)
  return runs
}

function computeMetrics(
  score: Score,
  fingerings: Fingering[],
  layout: HarmonicaLayout,
  weights: Weights,
): Metrics {
  const runs = collectRuns(score, fingerings)
  const totalSeconds = score.notes.reduce((sum, n) => sum + seconds(n.duration, score.tempo), 0)
  let longestBlow = 0
  let longestDraw = 0
  let longRunSeconds = 0
  for (const run of runs) {
    if (run.breath === 'blow') longestBlow = Math.max(longestBlow, run.seconds)
    else longestDraw = Math.max(longestDraw, run.seconds)
    if (run.seconds > weights.runThreshold) longRunSeconds += run.seconds - weights.runThreshold
  }

  let maxJump = 0
  let jumpCount = 0
  let slideToggles = 0
  let edgeNotes = 0
  for (let i = 0; i < fingerings.length; i += 1) {
    const f = fingerings[i]
    if (f.hole <= 2 || f.hole >= layout.holes - 1) edgeNotes += 1
    if (i === 0) continue
    const prev = fingerings[i - 1]
    const jump = Math.abs(f.hole - prev.hole)
    if (jump > maxJump) maxJump = jump
    if (jump >= 3) jumpCount += 1
    if (f.slide !== prev.slide) slideToggles += 1
  }

  const difficulty =
    weights.air * longRunSeconds +
    weights.jump * maxJump +
    weights.jump * jumpCount * 0.5 +
    weights.slide * slideToggles +
    weights.register * edgeNotes

  return {
    longestBlow,
    longestDraw,
    longRunSeconds,
    longRunRatio: totalSeconds > 0 ? longRunSeconds / totalSeconds : 0,
    totalSeconds,
    maxJump,
    jumpCount,
    slideToggles,
    edgeNotes,
    difficulty,
  }
}

function computeHardSpots(
  score: Score,
  fingerings: Fingering[],
  layout: HarmonicaLayout,
  weights: Weights,
): HardSpot[] {
  const spots: HardSpot[] = []
  const seen = new Set<string>()
  const add = (spot: HardSpot) => {
    const key = `${spot.noteId}:${spot.type}`
    if (seen.has(key)) return
    seen.add(key)
    spots.push(spot)
  }

  for (const run of collectRuns(score, fingerings)) {
    if (run.seconds <= weights.runThreshold) continue
    const last = run.noteIndices[run.noteIndices.length - 1]
    const note = score.notes[last]
    add({
      noteId: note.id,
      type: 'long-run',
      detail: `第 ${note.measure} 小节：连续${run.breath === 'blow' ? '吹' : '吸'} ${run.seconds.toFixed(1)}s`,
    })
  }

  for (let i = 1; i < fingerings.length; i += 1) {
    const jump = Math.abs(fingerings[i].hole - fingerings[i - 1].hole)
    if (jump >= 3) {
      const note = score.notes[i]
      add({ noteId: note.id, type: 'jump', detail: `第 ${note.measure} 小节：跨 ${jump} 孔` })
    }
  }

  for (let i = 0; i < fingerings.length; i += 1) {
    const f = fingerings[i]
    if (f.hole <= 2 || f.hole >= layout.holes - 1) {
      const note = score.notes[i]
      add({ noteId: note.id, type: 'edge', detail: `第 ${note.measure} 小节：音域边缘（${f.hole} 孔）` })
    }
  }

  return spots
}

export function evaluate(
  score: Score,
  layout: HarmonicaLayout,
  transposition: number,
  weights: Weights,
): OptimizationResult | null {
  if (score.notes.length === 0) return null
  const pitches = score.notes.map(n => n.midi + transposition)
  if (pitches.some(p => p < layout.minMidi || p > layout.maxMidi)) return null
  if (pitches.some(p => fingeringsForMidi(layout, p).length === 0)) return null

  const layers: Map<string, LayerEntry>[] = []
  const dt0 = seconds(score.notes[0].duration, score.tempo)
  const first = new Map<string, LayerEntry>()
  for (const f of fingeringsForMidi(layout, pitches[0])) {
    const run = dt0
    first.set(stateKey(f, run), {
      cost: runCost(run, weights) + registerCost(f, layout, weights),
      f,
      run,
      prevKey: null,
    })
  }
  layers.push(first)

  for (let i = 1; i < pitches.length; i += 1) {
    const dt = seconds(score.notes[i].duration, score.tempo)
    const prev = layers[i - 1]
    const cur = new Map<string, LayerEntry>()
    for (const g of fingeringsForMidi(layout, pitches[i])) {
      for (const [pk, p] of prev) {
        const same = g.breath === p.f.breath
        const run2 = same ? p.run + dt : dt
        const inc =
          (same ? runCost(run2, weights) - runCost(p.run, weights) : runCost(run2, weights)) +
          (jumpCost(g.hole - p.f.hole, weights) +
            (g.slide !== p.f.slide ? weights.slide : 0) +
            (same ? 0 : weights.breath)) *
            speed(dt) +
          registerCost(g, layout, weights)
        const cost = p.cost + inc
        const key = stateKey(g, run2)
        const existing = cur.get(key)
        if (!existing || cost < existing.cost) {
          cur.set(key, { cost, f: g, run: run2, prevKey: pk })
        }
      }
    }
    layers.push(cur)
  }

  let bestKey = ''
  let best: LayerEntry | null = null
  for (const [key, entry] of layers[layers.length - 1]) {
    if (!best || entry.cost < best.cost) {
      best = entry
      bestKey = key
    }
  }
  if (!best) return null

  const fingerings: Fingering[] = []
  let cursor: string | null = bestKey
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const entry: LayerEntry | undefined = cursor ? layers[i].get(cursor) : undefined
    if (!entry) break
    fingerings.unshift(entry.f)
    cursor = entry.prevKey
  }

  const metrics = computeMetrics(score, fingerings, layout, weights)
  const hardSpots = computeHardSpots(score, fingerings, layout, weights)
  const sig = keySignatureFor(transposeKey(score.originalKey, transposition))
  const originalSig = keySignatureFor(score.originalKey)

  return {
    transposition,
    fingerings,
    metrics,
    hardSpots,
    cost: best.cost,
    keyName: sig.name,
    keyLabel: sig.label,
    originalKeyLabel: originalSig.label,
  }
}

export function recommend(score: Score, layout: HarmonicaLayout, weights: Weights): OptimizationResult[] {
  const results: OptimizationResult[] = []
  for (let t = -6; t <= 5; t += 1) {
    const result = evaluate(score, layout, t, weights)
    if (result) results.push(result)
  }
  results.sort((a, b) => a.metrics.difficulty - b.metrics.difficulty)
  return results.slice(0, 3)
}
