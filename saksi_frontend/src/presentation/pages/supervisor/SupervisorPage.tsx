import { useCallback, useEffect, useState } from 'react'
import { container } from '../../../infrastructure/di/container'
import { useAppDispatch, useAppSelector } from '../../hooks/redux'
import { loggedOut } from '../../../application/store/slices/authSlice'
import { obligationsLoaded } from '../../../application/store/slices/complianceSlice'
import type { Session } from '../../../domain/entities/session'
import { useSessionStream } from '../../hooks/useSessionStream'
import {
  selectAuthRestoring,
  selectAuthUser,
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
import { BisikWave } from '../../components/BisikWave'
import { LoginForm } from '../../components/LoginForm'

export function SupervisorPage() {
  const dispatch = useAppDispatch()
  const [watching, setWatching] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [listError, setListError] = useState<string | null>(null)
  // Dimulai dari true: daftar memang langsung dimuat begitu supervisor masuk.
  const [loadingList, setLoadingList] = useState(true)

  const authUser = useAppSelector(selectAuthUser)
  const authRestoring = useAppSelector(selectAuthRestoring)

  const connected = useAppSelector(selectConnected)
  const obligations = useAppSelector(selectObligations)
  const utterances = useAppSelector(selectUtterances)
  const partial = useAppSelector(selectPartial)
  const violations = useAppSelector(selectViolations)
  const score = useAppSelector(selectLiveScore)

  useSessionStream(watching, 'supervisor')

  // Sengaja tidak menyetel status memuat di awal: fungsi ini juga dipanggil
  // dari effect, dan menyetel state secara sinkron di sana memicu render
  // beruntun. Tombol segarkan yang menyalakan statusnya sendiri.
  const refresh = useCallback(async () => {
    try {
      const list = await container.repositories.session.sessions()
      setSessions(list)
      setListError(null)
    } catch (e) {
      setListError((e as Error).message)
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    // Aturan set-state-in-effect keliru di sini: seluruh setState di dalam
    // refresh() berada SETELAH await, jadi tidak ada render beruntun.
    // Memuat daftar saat supervisor masuk justru persis kegunaan effect —
    // menyinkronkan dengan sistem luar.
    // oxlint-disable-next-line react/set-state-in-effect
    if (authUser) void refresh()
  }, [authUser, refresh])

  // Checklist supervisor dulu kosong sampai ada event masuk, jadi supervisor
  // yang bergabung di tengah sesi tidak melihat progres yang sudah terjadi.
  // Daftar butir dimuat lebih dulu supaya kerangkanya selalu tampil.
  useEffect(() => {
    if (!watching) return
    container.repositories.session
      .obligations()
      .then((o) => dispatch(obligationsLoaded(o)))
      .catch(() => undefined)
  }, [watching, dispatch])

  return (
    <main className="page page--supervisor">
      <header className="page__head">
        <div>
          <h1>Bisik Supervisor</h1>
          <p className="brandline">Pemantauan kepatuhan berbasis bukti</p>
        </div>
        <ScoreBadge score={score} />
      </header>

      {authRestoring ? (
        <p className="loading">
          <BisikWave />
          Memeriksa sesi login…
        </p>
      ) : !authUser ? (
        <LoginForm
          expects="supervisor"
          title="Masuk sebagai supervisor"
          hint="Supervisor memantau dan membaca laporan, tidak pernah mengirim audio."
        />
      ) : !watching ? (
        <section className="start">
          <p className="whoami">
            <span>
              Masuk sebagai <strong>{authUser.name}</strong>
            </span>
            <button
              className="btn--link"
              onClick={() => {
                container.repositories.auth.logout()
                dispatch(loggedOut())
              }}
            >
              Keluar
            </button>
          </p>

          <h2>Sesi terbaru</h2>
          {loadingList ? (
            <p className="loading">
              <BisikWave />
              Memuat daftar sesi…
            </p>
          ) : listError ? (
            <p className="error-box">{listError}</p>
          ) : sessions.length === 0 ? (
            <p className="muted">
              Belum ada sesi. Mulai satu dari halaman petugas, lalu segarkan.
            </p>
          ) : (
            <ul className="session-list">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button onClick={() => setWatching(s.id)}>
                    {s.productId} · {s.status === 'active' ? 'berjalan' : 'selesai'}
                    <small>
                      {new Date(s.startedAt).toLocaleString('id-ID')} · {s.id}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            className="btn btn--secondary"
            onClick={() => {
              setLoadingList(true)
              void refresh()
            }}
          >
            Segarkan daftar
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
