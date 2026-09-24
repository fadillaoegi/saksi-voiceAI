import { useState } from 'react'
import { useAppSelector } from '../../hooks/redux'
import { useSessionStream } from '../../hooks/useSessionStream'
import {
  selectConnected,
  selectLiveScore,
  selectObligations,
  selectPartial,
  selectUtterances,
  selectViolations,
} from '../../../application/store/selectors'
import { ObligationList } from '../../components/ObligationList'
import { TranscriptView } from '../../components/TranscriptView'
import { ScoreBadge } from '../../components/ScoreBadge'

export function SupervisorPage() {
  const [input, setInput] = useState('')
  const [watching, setWatching] = useState<string | null>(null)

  const connected = useAppSelector(selectConnected)
  const obligations = useAppSelector(selectObligations)
  const utterances = useAppSelector(selectUtterances)
  const partial = useAppSelector(selectPartial)
  const violations = useAppSelector(selectViolations)
  const score = useAppSelector(selectLiveScore)

  useSessionStream(watching, 'supervisor')

  return (
    <main className="page page--supervisor">
      <header className="page__head">
        <div>
          <h1>Bisik Supervisor</h1>
          <p className="brandline">Pemantauan kepatuhan berbasis bukti</p>
        </div>
        <ScoreBadge score={score} />
      </header>

      {!watching ? (
        <section className="start">
          <label htmlFor="sid">ID Sesi</label>
          <input id="sid" value={input} onChange={(e) => setInput(e.target.value)} />
          <button className="btn btn--primary" onClick={() => setWatching(input.trim() || null)}>
            Pantau
          </button>
        </section>
      ) : (
        <div className="grid">
          <section>
            <h2>Kewajiban</h2>
            <ObligationList items={obligations} />
            <p className="status">
              <span className={`dot ${connected ? 'dot--on' : 'dot--off'}`} />
              {connected ? 'Live' : 'Terputus'}
            </p>
          </section>

          <section>
            <h2>Pelanggaran</h2>
            {violations.length === 0 ? (
              <p className="muted">Belum ada.</p>
            ) : (
              <ul className="violations">
                {violations.map((v, i) => (
                  <li key={`${v.phrase}-${i}`} className="violation">
                    <strong>{v.phrase}</strong> <span>{v.severity}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid__wide">
            <h2>Transkrip</h2>
            <TranscriptView utterances={utterances} partial={partial} />
          </section>
        </div>
      )}
    </main>
  )
}
