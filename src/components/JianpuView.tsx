import type { KeySignature } from '../core/keys'
import { jianpuForMidi } from '../core/jianpu'
import type { Fingering, NoteEvent } from '../core/types'

type Props = {
  notes: NoteEvent[]
  transpose: number
  sig: KeySignature
  hardSpotIds: Set<string>
  fingerings: Fingering[]
  showTab: boolean
}

function durationMarks(duration: number): string {
  if (duration >= 2) return '—'.repeat(Math.round(duration - 1))
  if (duration === 1.5) return '·'
  if (duration === 0.5) return '_'
  return ''
}

export function JianpuView({ notes, transpose, sig, hardSpotIds, fingerings, showTab }: Props) {
  const fingerByIndex = new Map(notes.map((note, index) => [note.id, fingerings[index]]))
  const measures = new Map<number, NoteEvent[]>()
  for (const note of notes) {
    const list = measures.get(note.measure) ?? []
    list.push(note)
    measures.set(note.measure, list)
  }

  return (
    <div className="jianpu">
      {[...measures.entries()].map(([measure, measureNotes]) => (
        <div className="measure" key={measure}>
          <span className="measure-number">{measure}</span>
          <div className="measure-notes">
            {measureNotes.map(note => {
              const jp = jianpuForMidi(note.midi + transpose, sig.preferFlats)
              const fingering = fingerByIndex.get(note.id)
              return (
                <div
                  className={`jianpu-note${hardSpotIds.has(note.id) ? ' hard' : ''}`}
                  key={note.id}
                  title={`第 ${note.measure} 小节 · ${note.duration} 拍`}
                >
                  <div className="octave-dots above">{jp.octave > 0 ? '·'.repeat(jp.octave) : '\u00a0'}</div>
                  <div className="jp-main">
                    {jp.accidental && <span className="acc">{jp.accidental}</span>}
                    <span className="degree">{jp.degree}</span>
                  </div>
                  <div className="octave-dots below">{jp.octave < 0 ? '·'.repeat(-jp.octave) : '\u00a0'}</div>
                  <div className={`duration${note.duration === 0.5 ? ' eighth' : ''}`}>
                    {durationMarks(note.duration)}
                  </div>
                  {showTab && fingering && (
                    <div className={`tab ${fingering.breath}`}>
                      {fingering.hole}
                      {fingering.breath === 'blow' ? '↑' : '↓'}
                      {fingering.slide ? '+' : ''}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
