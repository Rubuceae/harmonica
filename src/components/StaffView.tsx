import { useEffect, useRef } from 'react'
import { Accidental, Barline, Dot, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow'
import type { KeySignature } from '../core/keys'
import { staffNote } from '../core/keys'
import type { NoteEvent } from '../core/types'

type Props = {
  notes: NoteEvent[]
  transpose: number
  sig: KeySignature
  timeSignature: [number, number]
  hardSpotIds: Set<string>
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

export function StaffView({ notes, transpose, sig, timeSignature, hardSpotIds }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const render = () => {
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
      const measureWidth = (width - 20) / MEASURES_PER_SYSTEM
      const height = systems * SYSTEM_HEIGHT + 24

      const renderer = new Renderer(container, Renderer.Backends.SVG)
      renderer.resize(width, height)
      const context = renderer.getContext()

      for (let measure = 1; measure <= maxMeasure; measure += 1) {
        const systemIndex = Math.floor((measure - 1) / MEASURES_PER_SYSTEM)
        const indexInSystem = (measure - 1) % MEASURES_PER_SYSTEM
        const x = 10 + indexInSystem * measureWidth
        const y = 20 + systemIndex * SYSTEM_HEIGHT
        const stave = new Stave(x, y, measureWidth)

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

        const measureNotes = measures.get(measure) ?? []
        if (measureNotes.length === 0) continue

        const staveNotes: StaveNote[] = []
        for (const note of measureNotes) {
          const spelled = staffNote(note.midi + transpose, sig)
          const dur = durationToVex(note.duration)
          const staveNote = new StaveNote({
            keys: [spelled.vexKey],
            duration: dur.duration,
            clef: 'treble',
            autoStem: true,
          })
          if (dur.dots > 0) Dot.buildAndAttach([staveNote], { all: true })
          if (spelled.accidental) staveNote.addModifier(new Accidental(spelled.accidental), 0)
          if (hardSpotIds.has(note.id)) {
            staveNote.setStyle({ fillStyle: '#c2410c', strokeStyle: '#c2410c' })
          }
          staveNotes.push(staveNote)
        }

        const totalBeats = measureNotes.reduce((sum, note) => sum + note.duration, 0)
        const voice = new Voice({ numBeats: Math.max(0.5, totalBeats), beatValue: 4 })
        voice.addTickables(staveNotes)
        const available = measureWidth - (indexInSystem === 0 ? 82 : 18)
        new Formatter().joinVoices([voice]).format([voice], available)
        voice.draw(context, stave)
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
  }, [notes, transpose, sig, timeSignature, hardSpotIds])

  return <div className="staff" ref={containerRef} />
}
