import { describe, expect, it } from 'vitest'
import { parseMusicXml } from './musicxml'

const SIMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Test Melody</work-title></work>
  <part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>2</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`

const TIE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="start"/></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="stop"/></note>
      <note><rest/><duration>8</duration></note>
    </measure>
  </part>
</score-partwise>`

const LYRIC_SLUR_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <identification>
    <creator type="composer">Test Composer</creator>
    <creator type="lyricist">Test Lyricist</creator>
  </identification>
  <part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <lyric number="1"><text>一</text></lyric>
        <notations><slur type="start" number="1"/></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration>
        <lyric number="1"><text>二</text></lyric>
        <notations><slur type="stop" number="1"/></notations>
      </note>
      <note><rest/><duration>8</duration></note>
    </measure>
  </part>
</score-partwise>`

describe('parseMusicXml', () => {
  it('parses key, time, title, and pitches', () => {
    const score = parseMusicXml(SIMPLE_XML)
    expect(score.title).toBe('Test Melody')
    expect(score.originalKey).toEqual({ tonic: 2, mode: 'major' })
    expect(score.timeSignature).toEqual([4, 4])
    expect(score.notes.map(note => note.midi)).toEqual([62, 64, 66, 67])
    expect(score.notes[0].duration).toBe(1)
  })

  it('merges tied notes', () => {
    const score = parseMusicXml(TIE_XML)
    expect(score.notes).toHaveLength(1)
    expect(score.notes[0].duration).toBe(2)
  })

  it('parses lyrics, creators, and slurs', () => {
    const score = parseMusicXml(LYRIC_SLUR_XML)
    expect(score.composer).toBe('Test Composer')
    expect(score.lyricist).toBe('Test Lyricist')
    expect(score.notes[0].lyrics).toEqual(['一'])
    expect(score.notes[1].lyrics).toEqual(['二'])
    expect(score.slurs).toEqual([{ from: 'n0', to: 'n1' }])
  })
})
