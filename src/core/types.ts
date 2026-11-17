export type Breath = 'blow' | 'draw'

export type Fingering = {
  hole: number
  breath: Breath
  slide: boolean
}

export type KeyMode = 'major' | 'minor'

export type KeyInfo = {
  tonic: number
  mode: KeyMode
}

export type NoteEvent = {
  id: string
  onset: number
  duration: number
  midi: number
  measure: number
  beatInMeasure: number
}

export type Score = {
  title: string
  tempo: number
  timeSignature: [number, number]
  originalKey: KeyInfo
  notes: NoteEvent[]
}

export type HardSpotType = 'long-run' | 'jump' | 'edge'

export type HardSpot = {
  noteId: string
  type: HardSpotType
  detail: string
}

export type Metrics = {
  longestBlow: number
  longestDraw: number
  longRunSeconds: number
  longRunRatio: number
  totalSeconds: number
  maxJump: number
  jumpCount: number
  slideToggles: number
  edgeNotes: number
  difficulty: number
}

export type OptimizationResult = {
  transposition: number
  fingerings: Fingering[]
  metrics: Metrics
  hardSpots: HardSpot[]
  cost: number
  keyName: string
  keyLabel: string
  originalKeyLabel: string
}
