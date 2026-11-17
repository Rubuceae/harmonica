import type { Breath, Fingering } from './types'

export type LayoutId = 'tenor12' | 'standard12' | 'sixteen'

export type HarmonicaLayout = {
  id: LayoutId
  name: string
  holes: number
  startMidi: number
  slide: boolean
  minMidi: number
  maxMidi: number
  byMidi: Map<number, Fingering[]>
  reeds: Map<string, number>
}

const PATTERN: [number, number, number, number][] = [
  [0, 2, 1, 3],
  [4, 5, 5, 6],
  [7, 9, 8, 10],
  [12, 11, 13, 12],
]

export const LAYOUTS: Record<LayoutId, { name: string; holes: number; startMidi: number }> = {
  tenor12: { name: '12 孔 C（tenor，5 吹 = C4）', holes: 12, startMidi: 48 },
  standard12: { name: '12 孔 C（标准，5 吹 = C5）', holes: 12, startMidi: 60 },
  sixteen: { name: '16 孔 C（5 吹 = C4）', holes: 16, startMidi: 48 },
}

export function buildLayout(id: LayoutId): HarmonicaLayout {
  const spec = LAYOUTS[id]
  const byMidi = new Map<number, Fingering[]>()
  const reeds = new Map<string, number>()
  let minMidi = Number.POSITIVE_INFINITY
  let maxMidi = Number.NEGATIVE_INFINITY

  const add = (hole: number, breath: Breath, slide: boolean, midi: number) => {
    reeds.set(`${hole}:${breath}:${slide ? 1 : 0}`, midi)
    const list = byMidi.get(midi) ?? []
    list.push({ hole, breath, slide })
    byMidi.set(midi, list)
    minMidi = Math.min(minMidi, midi)
    maxMidi = Math.max(maxMidi, midi)
  }

  for (let hole = 1; hole <= spec.holes; hole += 1) {
    const group = Math.floor((hole - 1) / 4)
    const index = (hole - 1) % 4
    const base = spec.startMidi + group * 12
    const [blow, draw, blowSlide, drawSlide] = PATTERN[index]
    add(hole, 'blow', false, base + blow)
    add(hole, 'draw', false, base + draw)
    add(hole, 'blow', true, base + blowSlide)
    add(hole, 'draw', true, base + drawSlide)
  }

  for (const list of byMidi.values()) {
    list.sort(
      (a, b) =>
        Number(a.slide) - Number(b.slide) ||
        a.hole - b.hole ||
        (a.breath === b.breath ? 0 : a.breath === 'blow' ? -1 : 1),
    )
  }

  return {
    id,
    name: spec.name,
    holes: spec.holes,
    startMidi: spec.startMidi,
    slide: true,
    minMidi,
    maxMidi,
    byMidi,
    reeds,
  }
}

export function fingeringsForMidi(layout: HarmonicaLayout, midi: number): Fingering[] {
  return layout.byMidi.get(midi) ?? []
}

export function inRange(layout: HarmonicaLayout, midi: number): boolean {
  return midi >= layout.minMidi && midi <= layout.maxMidi
}
