import type { KeyInfo, NoteEvent, Score } from './types'

const DEGREE_SEMITONES = [0, 2, 4, 5, 7, 9, 11]

export type JianpuNote = {
  text: string
  accidental: '#' | 'b' | ''
  degree: number
  octave: number
}

export function jianpuForMidi(midi: number, preferFlats: boolean): JianpuNote {
  const pc = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 5
  const natural: Record<number, number> = { 0: 1, 2: 2, 4: 3, 5: 4, 7: 5, 9: 6, 11: 7 }
  if (natural[pc] !== undefined) {
    return { text: String(natural[pc]), accidental: '', degree: natural[pc], octave }
  }

  const sharpMap: Record<number, ['#' | 'b', number]> = {
    1: ['#', 1],
    3: ['#', 2],
    6: ['#', 4],
    8: ['#', 5],
    10: ['#', 6],
  }
  const flatMap: Record<number, ['#' | 'b', number]> = {
    1: ['b', 2],
    3: ['b', 3],
    6: ['b', 5],
    8: ['b', 6],
    10: ['b', 7],
  }
  const [acc, degree] = (preferFlats ? flatMap : sharpMap)[pc]
  return { text: `${acc}${degree}`, accidental: acc, degree, octave }
}

export function parseJianpu(
  input: string,
  tempo: number,
  originalKey: KeyInfo,
  title = '未命名',
): Score {
  const tokens = input.replace(/\|/g, ' | ').trim().split(/\s+/).filter(Boolean)
  const notes: NoteEvent[] = []
  const beatsPerMeasure = 4
  let beat = 0

  for (const token of tokens) {
    if (token === '|') continue
    if (token === '-') {
      if (notes.length > 0) notes[notes.length - 1].duration += 1
      beat += 1
      continue
    }

    const match = token.match(/^([#b]?)([1-7])([',]*)([_.]?)$/)
    if (!match) continue
    const [, acc, digit, octaveMarks, durMark] = match
    const degree = Number(digit)
    const octave = (octaveMarks.match(/'/g)?.length ?? 0) - (octaveMarks.match(/,/g)?.length ?? 0)
    const semitone = DEGREE_SEMITONES[degree - 1] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0)
    const midi = 60 + 12 * octave + semitone
    const duration = durMark === '_' ? 0.5 : durMark === '.' ? 1.5 : 1

    notes.push({
      id: `n${notes.length}`,
      onset: beat,
      duration,
      midi,
      measure: Math.floor(beat / beatsPerMeasure) + 1,
      beatInMeasure: beat % beatsPerMeasure,
    })
    beat += duration
  }

  return { title, tempo, timeSignature: [4, 4], originalKey, notes }
}
