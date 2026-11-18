import { useEffect, useRef, useState } from 'react'
import { Accidental, Barline, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow'
import type { KeySignature } from '../core/keys'
import { staffNote } from '../core/keys'
import type { NoteEvent, Section } from '../core/types'

type Props = {
  notes: NoteEvent[]
  transpose: number
  sig: KeySignature
  timeSignature: [number, number]
  hardSpotIds: Set<string>
  sections?: Section[]
}

const MEASURES_PER_SYSTEM = 4
const SYSTEM_HEIGHT = 120

function durationToVex(duration: number): { duration: string; dots: number } {
  if (duration >= 4) return { duration: 'w', dots: duration >= 6 ? 1 : 0 }
  if (duration >= 2) return { duration: 'h', dots: duration >= 3 ? 1 : 0 }
  if (duration >= 1) return { duration: 'q', dots: duration >= 1.5 ? 1 : 0 }
  if (duration >= 0.5) return { duration: '8', dots: duration >= 0.75 ? 1 : 0 }
  return { duration: '16', dots: 0 }
}

export function StaffView({ notes, transpose, sig, timeSignature, hardSpotIds, sections }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const render = () => {
      let currentMeasure = 0
      try {
      container.innerHTML = ''
      if (notes.length === 0) return

      const measures = new Map<number, NoteEvent[]>()
      for (const note of notes) {
        const list = measures.get(note.measure) ?? []
        list.push(note)
        measures.set(note.measure, list)
      }
      const maxMeasure = Math.max(...measures.keys(), 1)
      const systems = Math.ceil(maxMeasure / MEASURES_PER_SYSTEM)
      const width = Math.max(720, container.clientWidth || 900)
      const height = systems * SYSTEM_HEIGHT + 24

      const renderer = new Renderer(container, Renderer.Backends.SVG)
      renderer.resize(width, height)
      const context = renderer.getContext()

      // 每行第一个小节要额外容纳谱号/调号/拍号；量出这段宽度，
      // 让第一个小节的“音符区”与其他小节等宽，避免第一个小节被压缩/漂移。
      const modifierWidths: number[] = []
      for (let system = 0; system < systems; system += 1) {
        const dummy = new Stave(0, 0, 300)
        dummy.addClef('treble')
        dummy.addKeySignature(sig.name)
        if (system === 0) dummy.addTimeSignature(`${timeSignature[0]}/${timeSignature[1]}`)
        modifierWidths.push(dummy.getNoteStartX())
      }
      const maxModifier = Math.max(...modifierWidths, 0)
      const measureWidth = (width - 20 - maxModifier) / MEASURES_PER_SYSTEM

      for (let measure = 1; measure <= maxMeasure; measure += 1) {
        currentMeasure = measure
        const systemIndex = Math.floor((measure - 1) / MEASURES_PER_SYSTEM)
        const indexInSystem = (measure - 1) % MEASURES_PER_SYSTEM
        const modifierWidth = modifierWidths[systemIndex]
        const x =
          indexInSystem === 0
            ? 10
            : 10 + modifierWidth + indexInSystem * measureWidth
        const staveWidth =
          indexInSystem === 0 ? modifierWidth + measureWidth : measureWidth
        const y = 20 + systemIndex * SYSTEM_HEIGHT
        const stave = new Stave(x, y, staveWidth)

        if (indexInSystem === 0) {
          stave.addClef('treble')
          stave.addKeySignature(sig.name)
          if (measure === 1) stave.addTimeSignature(`${timeSignature[0]}/${timeSignature[1]}`)
          stave.setBegBarType(Barline.type.SINGLE)
        } else {
          stave.setBegBarType(Barline.type.NONE)
        }
        stave.setEndBarType(measure === maxMeasure ? Barline.type.END : Barline.type.SINGLE)
        stave.setMeasure(measure)
        stave.setContext(context).draw()
        const section = sections?.find(item => item.startMeasure === measure)
        if (section) {
          context.setFont('sans-serif', 11, 600)
          context.fillStyle = '#0e7490'
          context.fillText(section.label, 10, stave.getYForLine(0) - 10)
        }

        const measureNotes = measures.get(measure) ?? []
        if (measureNotes.length === 0) continue

        const staveNotes: StaveNote[] = []
        for (const note of measureNotes) {
          const spelled = staffNote(note.midi + transpose, sig)
          const dur = durationToVex(note.duration)
          const vexDuration = `${dur.duration}${dur.dots > 0 ? 'd' : ''}`
          const staveNote = new StaveNote({
            keys: [spelled.vexKey],
            duration: vexDuration,
            clef: 'treble',
            autoStem: true,
          })
          if (spelled.accidental) staveNote.addModifier(new Accidental(spelled.accidental), 0)
          if (hardSpotIds.has(note.id)) {
            staveNote.setStyle({ fillStyle: '#c2410c', strokeStyle: '#c2410c' })
          }
          staveNotes.push(staveNote)
        }

        const totalBeats = measureNotes.reduce((sum, note) => sum + note.duration, 0)
        const meter = Math.max(1, Math.ceil(totalBeats - 1e-6))
        const remaining = meter - totalBeats
        if (remaining > 1e-3) {
          const restDur = durationToVex(remaining)
          staveNotes.push(
            new StaveNote({
              keys: ['b/4'],
              duration: `${restDur.duration}${restDur.dots > 0 ? 'd' : ''}r`,
              clef: 'treble',
            }),
          )
        }
        const voice = new Voice({ numBeats: meter, beatValue: 4 })
        voice.addTickables(staveNotes)
        const available = measureWidth - 18
        new Formatter().joinVoices([voice]).format([voice], available)
        voice.draw(context, stave)
      }
      } catch (cause) {
        setError(`第 ${currentMeasure} 小节：${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }

    let timer = 0
    const onResize = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(render, 120)
    }

    render()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.clearTimeout(timer)
    }
  }, [notes, transpose, sig, timeSignature, hardSpotIds, sections])

  return (
    <div className="staff">
      {error && <p className="error">五线谱渲染出错：{error}</p>}
      <div ref={containerRef} />
    </div>
  )
}
