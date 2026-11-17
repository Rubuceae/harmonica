import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseMusicXml } from './musicxml'

const xml = readFileSync(new URL('./fixtures/audiveris-c-major.xml', import.meta.url), 'utf-8')

describe('Audiveris MusicXML output', () => {
  it('parses a C major staff image result', () => {
    const score = parseMusicXml(xml, 'staff-test')
    expect(score.timeSignature).toEqual([4, 4])
    expect(score.originalKey).toEqual({ tonic: 0, mode: 'major' })
    expect(score.notes.map(note => note.midi)).toEqual([
      60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60,
    ])
    expect(score.notes[6].duration).toBe(2)
  })
})
