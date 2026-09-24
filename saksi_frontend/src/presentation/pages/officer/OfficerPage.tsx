import { useEffect, useRef, useState } from 'react'
import { container } from '../../../infrastructure/di/container'
import { useAppDispatch, useAppSelector } from '../../hooks/redux'
import { useSessionStream } from '../../hooks/useSessionStream'
import {
  sessionEnded,
  sessionFailed,
  sessionReset,
  sessionStarted,
  connectionChanged,
  recordingChanged,
} from '../../../application/store/slices/sessionSlice'
import {
  complianceReset,
  nudgeReceived,
  obligationSatisfied,
  obligationsLoaded,
  violationDetected,
} from '../../../application/store/slices/complianceSlice'
import {
  transcriptCleared,
  utteranceAppended,
} from '../../../application/store/slices/transcriptSlice'
import type { ComplianceReport } from '../../../domain/entities/compliance'
import {
  createDemoReport,
  createDemoSession,
  demoObligations,
  demoUtterances,
  demoViolation,
} from '../../../application/demo/demo_scenario'
import {
  selectConnected,
  selectLastNudge,
  selectLiveScore,
  selectObligations,
  selectPartial,
  selectRecording,
  selectSession,
  selectSessionError,
  selectUtterances,
} from '../../../application/store/selectors'
import { ObligationList } from '../../components/ObligationList'
import { TranscriptView } from '../../components/TranscriptView'
import { ScoreBadge } from '../../components/ScoreBadge'
import { ReportView } from '../../components/ReportView'
import { SpeakerCalibration } from '../../components/SpeakerCalibration'

export function OfficerPage() {
  const dispatch = useAppDispatch()
  const session = useAppSelector(selectSession)
  const connected = useAppSelector(selectConnected)
  const recording = useAppSelector(selectRecording)
  const sessionError = useAppSelector(selectSessionError)
  const obligations = useAppSelector(selectObligations)
  const utterances = useAppSelector(selectUtterances)
  const partial = useAppSelector(selectPartial)
  const nudge = useAppSelector(selectLastNudge)
  const score = useAppSelector(selectLiveScore)

  const [officerId, setOfficerId] = useState('PTG-001')
  const [report, setReport] = useState<ComplianceReport | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const demoTimers = useRef<number[]>([])

  useEffect(() => {
    container.repositories.session
      .obligations()
      .then((o) => dispatch(obligationsLoaded(o)))
      .catch(() => dispatch(sessionFailed('Gagal memuat daftar kewajiban')))
  }, [dispatch])

  const stream = useSessionStream(
    session?.status === 'active' && !demoMode ? session.id : null,
    'officer',
  )
  const [officerSpeakerLabel, setOfficerSpeakerLabel] = useState<string | null>(null)
  const effectiveOfficerSpeakerLabel =
    officerSpeakerLabel &&
    stream.calibrationSamples.some((sample) => sample.sourceSpeaker === officerSpeakerLabel)
      ? officerSpeakerLabel
      : (stream.calibrationSamples[0]?.sourceSpeaker ?? null)

  function clearDemoTimers() {
    demoTimers.current.forEach((timer) => window.clearTimeout(timer))
    demoTimers.current = []
    container.repositories.speech.cancel()
  }

  useEffect(() => () => clearDemoTimers(), [])

  function scheduleDemo(delayMs: number, task: () => void) {
    demoTimers.current.push(window.setTimeout(task, delayMs))
  }

  async function handleStart() {
    try {
      clearDemoTimers()
      setDemoMode(false)
      dispatch(complianceReset())
      dispatch(transcriptCleared())
      setReport(null)
      setReportError(null)
      const s = await container.usecases.startSession.execute(officerId, 'KREDIT-MULTIGUNA')
      dispatch(sessionStarted(s))
    } catch (e) {
      dispatch(sessionFailed((e as Error).message))
    }
  }

  function handleDemo() {
    clearDemoTimers()
    dispatch(complianceReset())
    dispatch(transcriptCleared())
    setReport(null)
    setReportError(null)
    setDemoMode(true)

    const demoSession = createDemoSession()
    dispatch(obligationsLoaded(demoObligations))
    dispatch(sessionStarted(demoSession))
    dispatch(connectionChanged(true))
    dispatch(recordingChanged(true))

    scheduleDemo(600, () => {
      dispatch(utteranceAppended(demoUtterances[0]))
      dispatch(obligationSatisfied({ code: 'IDENTITY', confidence: 0.99, evidenceId: 'demo-1' }))
    })
    scheduleDemo(1_800, () => dispatch(utteranceAppended(demoUtterances[1])))
    scheduleDemo(3_000, () => {
      dispatch(utteranceAppended(demoUtterances[2]))
      dispatch(violationDetected(demoViolation))
      const warning = 'Hindari janji pasti disetujui. Koreksi dan jelaskan bunga serta cicilan.'
      dispatch(nudgeReceived(warning))
      container.repositories.speech.speak(warning)
    })
    scheduleDemo(4_800, () => {
      dispatch(utteranceAppended(demoUtterances[3]))
      dispatch(obligationSatisfied({ code: 'RATE', confidence: 0.96, evidenceId: 'demo-4' }))
      dispatch(obligationSatisfied({ code: 'TENOR', confidence: 0.95, evidenceId: 'demo-4' }))
    })
    scheduleDemo(6_200, () => {
      const reminder = 'Sampaikan denda keterlambatan dan hak nasabah untuk membatalkan.'
      dispatch(nudgeReceived(reminder))
      container.repositories.speech.speak(reminder)
    })
    scheduleDemo(7_600, () => {
      dispatch(utteranceAppended(demoUtterances[4]))
      dispatch(obligationSatisfied({ code: 'PENALTY', confidence: 0.94, evidenceId: 'demo-5' }))
      dispatch(obligationSatisfied({ code: 'RIGHT', confidence: 0.98, evidenceId: 'demo-5' }))
    })
    scheduleDemo(9_000, () => {
      const ended = createDemoSession('ended')
      dispatch(sessionEnded(ended))
      dispatch(connectionChanged(false))
      setReport(createDemoReport(ended))
    })
  }

  async function handleEnd() {
    if (!session) return
    if (demoMode) {
      clearDemoTimers()
      const ended = { ...session, status: 'ended' as const, score: 90 }
      dispatch(sessionEnded(ended))
      dispatch(connectionChanged(false))
      dispatch(recordingChanged(false))
      setReport(createDemoReport(ended))
      return
    }
    try {
      const ended = await container.usecases.endSession.execute(session.id)
      dispatch(sessionEnded(ended))
      setReport(await container.usecases.getReport.execute(session.id))
    } catch (e) {
      const message = (e as Error).message
      setReportError(message)
      dispatch(sessionFailed(message))
    }
  }

  function handleNewSession() {
    clearDemoTimers()
    dispatch(sessionReset())
    dispatch(complianceReset())
    dispatch(transcriptCleared())
    setReport(null)
    setReportError(null)
    setDemoMode(false)
    setOfficerSpeakerLabel(null)
  }

  function handleConfirmSpeakerRoles() {
    if (!effectiveOfficerSpeakerLabel) return
    const customer = stream.calibrationSamples.find(
      (sample) => sample.sourceSpeaker !== effectiveOfficerSpeakerLabel,
    )
    if (!customer) return
    stream.confirmSpeakerRoles(effectiveOfficerSpeakerLabel, customer.sourceSpeaker)
  }

  return (
    <main className="page page--officer">
      <header className="page__head">
        <div>
          <h1>Bisik</h1>
          <p className="brandline">Kopilot kepatuhan petugas lapangan</p>
        </div>
        <ScoreBadge score={report?.session.score ?? score} />
      </header>

      {!session ? (
        <section className="start">
          <label htmlFor="officer">ID Petugas</label>
          <input id="officer" value={officerId} onChange={(e) => setOfficerId(e.target.value)} />
          <button className="btn btn--primary" onClick={handleStart}>
            Mulai sesi
          </button>
          <div className="demo-entry">
            <span>atau</span>
            <button className="btn btn--secondary" onClick={handleDemo}>
              Putar demo terarah · 9 detik
            </button>
            <small>Simulasi lokal tanpa mikrofon atau API eksternal.</small>
          </div>
        </section>
      ) : session.status === 'ended' ? (
        <>
          {report ? (
            <ReportView report={report} simulated={demoMode} />
          ) : reportError ? (
            <p className="error-box">Laporan gagal dimuat: {reportError}</p>
          ) : (
            <p className="muted">Menyiapkan laporan berbukti…</p>
          )}
          <button className="btn btn--primary btn--wide" onClick={handleNewSession}>
            Mulai sesi baru
          </button>
        </>
      ) : (
        <>
          {demoMode && <p className="demo-banner">Simulasi lokal · alur dipercepat</p>}
          <p className="status">
            <span className={`dot ${connected ? 'dot--on' : 'dot--off'}`} />
            {demoMode ? 'Demo aktif' : connected ? 'Terhubung' : 'Menyambung…'} ·{' '}
            {demoMode ? 'tanpa mikrofon' : recording ? 'merekam' : 'mic mati'}
          </p>

          {/* Kegagalan jalur audio harus terlihat: status "merekam" saja
              pernah menutupi sesi yang sebenarnya sudah mati. */}
          {sessionError && <p className="error-box">{sessionError}</p>}

          {!demoMode && stream.calibrationStatus !== 'confirmed' ? (
            <SpeakerCalibration
              samples={stream.calibrationSamples}
              officerLabel={effectiveOfficerSpeakerLabel}
              error={stream.calibrationError}
              onSelectOfficer={setOfficerSpeakerLabel}
              onConfirm={handleConfirmSpeakerRoles}
            />
          ) : (
            <>
              {/* Bisikan ditampilkan sekaligus diucapkan ke earpiece */}
              {nudge && <div className="nudge">🔈 {nudge}</div>}

              <ObligationList items={obligations} />
              <TranscriptView utterances={utterances} partial={partial} />
            </>
          )}

          <button className="btn btn--danger" onClick={handleEnd}>
            Akhiri sesi
          </button>
        </>
      )}
    </main>
  )
}
