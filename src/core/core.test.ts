import { describe, expect, it } from 'vitest'
import { demoScore } from './demo'
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
