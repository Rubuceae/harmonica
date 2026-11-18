import { DURATION_DEMO, demoScore } from './demo'
import { parseJianpu } from './jianpu'
import type { Score } from './types'

export type SongEntry = {
  id: string
  title: string
  score: Score
  builtin?: boolean
}

const STORAGE_KEY = 'harmonica.songs.v1'

function durationScore(): Score {
  return parseJianpu(DURATION_DEMO, 96, { tonic: 0, mode: 'major' }, '时值示例')
}

export const BUILTIN_SONGS: SongEntry[] = [
  { id: 'builtin-little-star', title: '小星星', score: demoScore(), builtin: true },
  { id: 'builtin-duration', title: '时值示例', score: durationScore(), builtin: true },
]

export function loadSavedSongs(): SongEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw) as SongEntry[]
    if (!Array.isArray(data)) return []
    return data.filter(song => song && typeof song.title === 'string' && Boolean(song.score))
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
