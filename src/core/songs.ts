import { DURATION_DEMO, demoScore } from './demo'
import { parseJianpu } from './jianpu'
import type { Score } from './types'

export type SongKind = 'score' | 'reference'

export type SongEntry = {
  id: string
  title: string
  kind: SongKind
  score?: Score
  svgUrl?: string
  svgText?: string
  builtin?: boolean
}

const STORAGE_KEY = 'harmonica.songs.v1'

function durationScore(): Score {
  return parseJianpu(DURATION_DEMO, 96, { tonic: 0, mode: 'major' }, '时值示例')
}

export const BUILTIN_SONGS: SongEntry[] = [
  { id: 'builtin-little-star', title: '小星星', kind: 'score', score: demoScore(), builtin: true },
  { id: 'builtin-duration', title: '时值示例', kind: 'score', score: durationScore(), builtin: true },
  {
    id: 'builtin-qifengle',
    title: '起风了',
    kind: 'reference',
    svgUrl: '/songs/qifengle.svg',
    builtin: true,
  },
]

export function loadSavedSongs(): SongEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw) as SongEntry[]
    if (!Array.isArray(data)) return []
    return data.filter(
      song =>
        song &&
        typeof song.title === 'string' &&
        (song.kind === 'score' ? Boolean(song.score) : Boolean(song.svgText)),
    )
  } catch {
    return []
  }
}

export function saveSongs(songs: SongEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(songs))
  } catch {
    // localStorage 可能被禁用或超限；不阻断主流程
  }
}

export function newSongId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}
