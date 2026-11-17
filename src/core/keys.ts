import type { KeyInfo, KeyMode } from './types'

export type KeySignature = {
  tonic: number
  mode: KeyMode
  name: string
  fifths: number
  preferFlats: boolean
  label: string
}

export const MAJOR_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const MAJOR_FIFTHS = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5]
const MINOR_NAMES = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm']
const MINOR_FIFTHS = [-3, 4, -1, -6, 1, -4, 3, -2, 5, 0, -5, 2]

export function keySignatureFor(key: KeyInfo): KeySignature {
  const isMajor = key.mode === 'major'
  const name = isMajor ? MAJOR_NAMES[key.tonic] : MINOR_NAMES[key.tonic]
  const fifths = isMajor ? MAJOR_FIFTHS[key.tonic] : MINOR_FIFTHS[key.tonic]
  const label = isMajor ? `${name} 大调` : `${name.slice(0, -1)} 小调`
  return { tonic: key.tonic, mode: key.mode, name, fifths, preferFlats: fifths < 0, label }
}

export function transposeKey(key: KeyInfo, semitones: number): KeyInfo {
  return {
    tonic: (((key.tonic + semitones) % 12) + 12) % 12,
    mode: key.mode,
  }
}

const SHARP_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']
const FLAT_NAMES = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b']
const SHARP_ORDER = ['f', 'c', 'g', 'd', 'a', 'e', 'b']
const FLAT_ORDER = ['b', 'e', 'a', 'd', 'g', 'c', 'f']

export function staffNote(midi: number, sig: KeySignature): { vexKey: string; accidental: '#' | 'b' | 'n' | null } {
  const pc = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  const name = (sig.preferFlats ? FLAT_NAMES : SHARP_NAMES)[pc]
  const letter = name[0]
  const noteAcc = name.slice(1) as '' | '#' | 'b'

  const keyAlter = new Map<string, '#' | 'b'>()
  const order = sig.fifths >= 0 ? SHARP_ORDER : FLAT_ORDER
  for (let i = 0; i < Math.abs(sig.fifths); i += 1) {
    keyAlter.set(order[i], sig.fifths >= 0 ? '#' : 'b')
  }

  const implied = keyAlter.get(letter) ?? ''
  let accidental: '#' | 'b' | 'n' | null = null
  if (noteAcc === implied) accidental = null
  else if (noteAcc === '') accidental = implied ? 'n' : null
  else accidental = noteAcc

  return { vexKey: `${name}/${octave}`, accidental }
}
