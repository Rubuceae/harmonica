import { XMLParser } from 'fast-xml-parser'
import { unzipSync } from 'fflate'
import type { KeyInfo, KeyMode, NoteEvent, Score, Slur } from '../core/types'

const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

const MAJOR_KEY_BY_FIFTHS: Record<number, number> = {
  0: 0,
  1: 7,
  2: 2,
  3: 9,
  4: 4,
  5: 11,
  6: 6,
  7: 1,
  [-1]: 5,
  [-2]: 10,
  [-3]: 3,
  [-4]: 8,
  [-5]: 1,
  [-6]: 6,
  [-7]: 11,
}

const MINOR_KEY_BY_FIFTHS: Record<number, number> = {
  0: 9,
  1: 4,
  2: 11,
  3: 6,
  4: 1,
  5: 8,
  6: 3,
  7: 10,
  [-1]: 2,
  [-2]: 7,
  [-3]: 0,
  [-4]: 5,
  [-5]: 10,
  [-6]: 3,
  [-7]: 8,
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: name =>
    [
      'part',
      'measure',
      'note',
      'attributes',
      'key',
      'time',
      'direction',
      'sound',
      'pitch',
      'rest',
      'tie',
      'chord',
      'backup',
      'forward',
      'clef',
    ].includes(name),
})

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object') {
    const node = (value as Record<string, unknown>)['#text']
    if (typeof node === 'string' || typeof node === 'number') return String(node)
  }
  return ''
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(text(value))
  return Number.isFinite(parsed) ? parsed : fallback
}

function keyFromFifths(fifths: number, mode: KeyMode): KeyInfo {
  const table = mode === 'major' ? MAJOR_KEY_BY_FIFTHS : MINOR_KEY_BY_FIFTHS
  const tonic = table[fifths]
  return {
    tonic: tonic === undefined ? (mode === 'major' ? 0 : 9) : tonic,
    mode,
  }
}

type RawNote = {
  onset: number
  duration: number
  midi: number
  tieStop: boolean
  lyrics?: string[]
  slurStarts?: number[]
  slurStops?: number[]
}

export function parseMusicXml(xml: string, titleHint?: string): Score {
  const document = parser.parse(xml) as Record<string, any>
  const root: any = document['score-partwise'] ?? document['score-timewise']
  if (!root) throw new Error('不是 MusicXML 的 score-partwise 格式')

  const parts = asArray(root.part)
  if (parts.length === 0) throw new Error('MusicXML 里没有 part')
  const part = parts[0]
  const measures = asArray(part.measure)
  if (measures.length === 0) throw new Error('MusicXML 里没有小节')

  let divisions = 1
  let timeSignature: [number, number] = [4, 4]
  let originalKey: KeyInfo = { tonic: 0, mode: 'major' }
  let tempo = 96
  let cursor = 0
  let lastOnset = 0
  const rawNotes: RawNote[] = []

  for (const measure of measures) {
    for (const attributes of asArray(measure.attributes)) {
      if (attributes.divisions !== undefined) {
        divisions = Math.max(1, numberValue(attributes.divisions, divisions))
      }
      const keyNode = asArray(attributes.key)[0]
      if (keyNode) {
        const fifths = numberValue(keyNode.fifths, 0)
        const mode: KeyMode = text(keyNode.mode) === 'minor' ? 'minor' : 'major'
        originalKey = keyFromFifths(fifths, mode)
      }
      const timeNode = asArray(attributes.time)[0]
      if (timeNode) {
        const beats = numberValue(timeNode.beats, timeSignature[0])
        const beatType = numberValue(timeNode['beat-type'], timeSignature[1])
        timeSignature = [beats, beatType]
      }
    }

    for (const direction of asArray(measure.direction)) {
      const sound = asArray(direction.sound)[0]
      if (sound?.['@_tempo'] !== undefined) tempo = numberValue(sound['@_tempo'], tempo)
    }
    for (const sound of asArray(measure.sound)) {
      if (sound?.['@_tempo'] !== undefined) tempo = numberValue(sound['@_tempo'], tempo)
    }

    for (const note of asArray(measure.note)) {
      const duration = numberValue(note.duration, 0) / divisions
      if (note.rest !== undefined) {
        cursor += duration
        continue
      }
      if (note.grace !== undefined) continue
      if (!note.pitch) {
        cursor += duration
        continue
      }

      const pitch = asArray(note.pitch)[0]
      const step = text(pitch.step).toUpperCase()
      const alter = numberValue(pitch.alter, 0)
      const octave = numberValue(pitch.octave, 4)
      const semitone = STEP_SEMITONES[step]
      if (semitone === undefined) {
        cursor += duration
        continue
      }
      const midi = 12 * (octave + 1) + semitone + alter

      const isChord = note.chord !== undefined
      const onset = isChord ? lastOnset : cursor
      if (!isChord) {
        lastOnset = onset
        cursor += duration
      }

      const ties = [...asArray(note.tie), ...asArray(note.notations?.tied)]
      const tieStop = ties.some((tie: any) => tie?.['@_type'] === 'stop')

      const lyrics: string[] = []
      for (const lyric of asArray(note.lyric)) {
        const verse = Math.max(0, numberValue(lyric['@_number'], lyrics.length + 1) - 1)
        const value = text(lyric.text)
        if (value) lyrics[verse] = value
      }
      const slurNodes = asArray(note.notations?.slur)
      const slurStarts = slurNodes
        .filter((slur: any) => slur?.['@_type'] === 'start')
        .map((slur: any) => numberValue(slur['@_number'], 1))
      const slurStops = slurNodes
        .filter((slur: any) => slur?.['@_type'] === 'stop')
        .map((slur: any) => numberValue(slur['@_number'], 1))
      const lyricsValue = lyrics.length > 0 ? lyrics : undefined

      if (isChord) {
        const existing = rawNotes.find(item => Math.abs(item.onset - onset) < 0.001)
        if (existing) {
          if (midi > existing.midi) existing.midi = midi
        } else {
          rawNotes.push({
            onset,
            duration,
            midi,
            tieStop,
            lyrics: lyricsValue,
            slurStarts,
            slurStops,
          })
        }
        continue
      }

      if (tieStop) {
        let merged = false
        for (let i = rawNotes.length - 1; i >= 0; i -= 1) {
          const previous = rawNotes[i]
          if (previous.midi === midi && Math.abs(previous.onset + previous.duration - onset) < 0.001) {
            previous.duration += duration
            if (!previous.lyrics?.length && lyricsValue) previous.lyrics = lyricsValue
            merged = true
            break
          }
        }
        if (merged) continue
      }

      rawNotes.push({
        onset,
        duration,
        midi,
        tieStop,
        lyrics: lyricsValue,
        slurStarts,
        slurStops,
      })
    }

    for (const backup of asArray(measure.backup)) {
      cursor -= numberValue(backup.duration, 0) / divisions
    }
    for (const forward of asArray(measure.forward)) {
      cursor += numberValue(forward.duration, 0) / divisions
    }
  }

  if (rawNotes.length === 0) throw new Error('没有解析到音符')

  const byOnset = new Map<number, RawNote>()
  for (const note of rawNotes) {
    const key = Math.round(note.onset * 1000) / 1000
    const existing = byOnset.get(key)
    if (!existing || note.midi > existing.midi) byOnset.set(key, note)
  }

  const measureBeats = (timeSignature[0] * 4) / timeSignature[1]
  const sortedRaw = [...byOnset.values()].sort((a, b) => a.onset - b.onset)
  const notes: NoteEvent[] = sortedRaw.map((note, index) => ({
    id: `n${index}`,
    onset: note.onset,
    duration: note.duration,
    midi: note.midi,
    measure: Math.floor(note.onset / measureBeats) + 1,
    beatInMeasure: note.onset % measureBeats,
    lyrics: note.lyrics && note.lyrics.length > 0 ? note.lyrics : undefined,
  }))

  const slurs: Slur[] = []
  const activeSlurs = new Map<number, string>()
  sortedRaw.forEach((raw, index) => {
    const note = notes[index]
    for (const number of raw.slurStops ?? []) {
      const from = activeSlurs.get(number)
      if (from && from !== note.id) slurs.push({ from, to: note.id })
      activeSlurs.delete(number)
    }
    for (const number of raw.slurStarts ?? []) activeSlurs.set(number, note.id)
  })

  const creators = asArray(root.identification?.creator)
  const composerNode = creators.find((creator: any) => creator?.['@_type'] === 'composer')
  const lyricistNode = creators.find((creator: any) => creator?.['@_type'] === 'lyricist')
  const composer = text(composerNode) || undefined
  const lyricist = text(lyricistNode) || undefined

  const title =
    text(root.work?.['work-title']) ||
    text(root['movement-title']) ||
    titleHint ||
    '导入的乐谱'

  return { title, tempo, timeSignature, originalKey, notes, composer, lyricist, slurs }
}

export async function loadMusicXmlFile(file: File): Promise<Score> {
  const buffer = new Uint8Array(await file.arrayBuffer())
  const name = file.name
  const lower = name.toLowerCase()

  if (lower.endsWith('.mxl')) {
    const zip = unzipSync(buffer)
    const entry = Object.entries(zip).find(([path, data]) => {
      if (path.startsWith('META-INF/')) return false
      if (!path.toLowerCase().endsWith('.xml')) return false
      const xml = new TextDecoder().decode(data)
      return xml.includes('<score-partwise') || xml.includes('<score-timewise')
    })
    if (!entry) throw new Error('.mxl 里没有找到 MusicXML')
    return parseMusicXml(new TextDecoder().decode(entry[1]), name.replace(/\.mxl$/i, ''))
  }

  return parseMusicXml(new TextDecoder().decode(buffer), name.replace(/\.(xml|musicxml)$/i, ''))
}
