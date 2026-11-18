import { describe, expect, it } from 'vitest'
import { demoScore } from './demo'
import { BUILTIN_SONGS } from './songs'
import { jianpuForMidi, parseJianpu } from './jianpu'
import { keySignatureFor } from './keys'
import { buildLayout, fingeringsForMidi } from './layout'
import { MODE_WEIGHTS, evaluate } from './optimize'

describe('layout', () => {
  it('tenor 12: hole 5 blow is C4', () => {
    const layout = buildLayout('tenor12')
    expect(
      fingeringsForMidi(layout, 60).some(f => f.hole === 5 && f.breath === 'blow' && !f.slide),
    ).toBe(true)
  })

  it('standard 12: hole 5 blow is C5', () => {
    const layout = buildLayout('standard12')
    expect(
      fingeringsForMidi(layout, 72).some(f => f.hole === 5 && f.breath === 'blow' && !f.slide),
    ).toBe(true)
  })

  it('16 hole: hole 5 blow is C4', () => {
    const layout = buildLayout('sixteen')
    expect(
      fingeringsForMidi(layout, 60).some(f => f.hole === 5 && f.breath === 'blow' && !f.slide),
    ).toBe(true)
  })
})

describe('jianpu', () => {
  it('uses fixed-do 1=C', () => {
    expect(jianpuForMidi(60, false).text).toBe('1')
    expect(jianpuForMidi(66, false).text).toBe('#4')
    expect(jianpuForMidi(72, false).text).toBe('1')
    expect(jianpuForMidi(72, false).octave).toBe(1)
  })

  it('respects 3/4 measure length', () => {
    const score = parseJianpu('1 1 1 | 2 2 2', 120, { tonic: 0, mode: 'major' }, 'test', [3, 4])
    expect(score.notes[3].measure).toBe(2)
  })

  it('supports underlines, dots, and rests', () => {
    const score = parseJianpu('1__ 1. 1._ 0 1', 120, { tonic: 0, mode: 'major' }, 'test')
    expect(score.notes.map(note => note.duration)).toEqual([0.25, 1.5, 0.75, 1])
    expect(score.notes[3].onset).toBe(3.5)
  })

  it('extends notes with dashes', () => {
    const score = parseJianpu('1 - - -', 120, { tonic: 0, mode: 'major' }, 'test')
    expect(score.notes[0].duration).toBe(4)
  })
})

describe('optimizer', () => {
  it('demo at D major has a long draw run; C major removes it', () => {
    const score = demoScore()
    const layout = buildLayout('tenor12')
    const dMajor = evaluate(score, layout, 0, MODE_WEIGHTS.air)
    const cMajor = evaluate(score, layout, -2, MODE_WEIGHTS.air)
    expect(dMajor).not.toBeNull()
    expect(cMajor).not.toBeNull()
    expect(dMajor!.metrics.longestDraw).toBeGreaterThan(4)
    expect(cMajor!.metrics.longestDraw).toBeLessThan(2)
    expect(cMajor!.hardSpots.length).toBe(0)
  })

  it('knows major key signatures', () => {
    expect(keySignatureFor({ tonic: 2, mode: 'major' }).fifths).toBe(2)
    expect(keySignatureFor({ tonic: 0, mode: 'major' }).fifths).toBe(0)
  })
})

describe('demo lyrics', () => {
  it('carries two lyric verses, creators, and slurs', () => {
    const score = demoScore()
    expect(score.notes[0].lyrics).toEqual(['一', '一'])
    expect(score.composer).toBe('传统 曲')
    expect(score.slurs?.length).toBeGreaterThan(0)
  })
})

describe('song library', () => {
  it('includes the built-in score songs', () => {
    expect(BUILTIN_SONGS.map(song => song.title)).toEqual(['小星星', '时值示例'])
    expect(BUILTIN_SONGS.every(song => song.score.notes.length > 0)).toBe(true)
  })
})
