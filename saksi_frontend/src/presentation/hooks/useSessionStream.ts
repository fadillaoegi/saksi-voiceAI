import { useCallback, useEffect, useRef, useState } from 'react'
import { container } from '../../infrastructure/di/container'
import type { SessionEvent } from '../../domain/entities/events'
import type { SocketRole } from '../../infrastructure/ws/session_socket'
import { useAppDispatch } from './redux'
import { connectionChanged, recordingChanged, sessionFailed } from '../../application/store/slices/sessionSlice'
import {
  partialReceived,
  speakerRevised,
  utteranceAppended,
} from '../../application/store/slices/transcriptSlice'
import {
  nudgeReceived,
  obligationSatisfied,
  violationDetected,
} from '../../application/store/slices/complianceSlice'

/**
 * Menyambungkan WebSocket ke store, dan — khusus role officer —
 * mengalirkan frame mikrofon ke gateway.
 */
export function useSessionStream(sessionId: string | null, role: SocketRole) {
  const dispatch = useAppDispatch()
  const startedRef = useRef(false)
  const [calibrationStatus, setCalibrationStatus] = useState<'idle' | 'collecting' | 'confirmed'>(
    'idle',
  )
  const [calibrationSamples, setCalibrationSamples] = useState<
    Array<{ sourceSpeaker: string; text: string }>
  >([])
  const [calibrationError, setCalibrationError] = useState<string | null>(null)

  const handleEvent = useCallback(
    (e: SessionEvent) => {
      switch (e.type) {
        case 'partial':
          dispatch(partialReceived({ speaker: e.speaker, text: e.text }))
          break
        case 'utterance':
          dispatch(
            utteranceAppended({
              id: e.id, speaker: e.speaker, text: e.text, startMs: 0, revised: false,
            }),
          )
          break
        case 'speaker_revised':
          dispatch(speakerRevised({ id: e.utterance_id, speaker: e.speaker }))
          break
        case 'speaker_calibration_started':
          setCalibrationStatus('collecting')
          setCalibrationSamples([])
          setCalibrationError(null)
          break
        case 'speaker_calibration_partial':
          break
        case 'speaker_calibration_utterance':
          if (!e.source_speaker || e.source_speaker === 'UNKNOWN') break
          setCalibrationSamples((current) => {
            const next = current.filter((sample) => sample.sourceSpeaker !== e.source_speaker)
            return [...next, { sourceSpeaker: e.source_speaker, text: e.text }]
          })
          break
        case 'speaker_roles_confirmed':
          setCalibrationStatus('confirmed')
          setCalibrationError(null)
          break
        case 'speaker_calibration_error':
          setCalibrationError(e.message)
          break
        case 'obligation_satisfied':
          dispatch(
            obligationSatisfied({
              code: e.code, confidence: e.confidence, evidenceId: e.evidence_id,
            }),
          )
          break
        case 'violation':
          dispatch(
            violationDetected({
              phrase: e.phrase, severity: e.severity,
              evidenceId: e.evidence_id, detectedAt: new Date().toISOString(),
            }),
          )
          break
        case 'session_error':
          // Jalur audio mati: hentikan indikator merekam dan tampilkan
          // sebabnya, jangan biarkan UI terlihat masih menyimak.
          dispatch(sessionFailed(e.message))
          break
        case 'nudge':
          dispatch(nudgeReceived(e.text))
          // Hanya petugas yang mendengar bisikan.
          if (role === 'officer') container.repositories.speech.speak(e.text)
          break
      }
    },
    [dispatch, role],
  )

  useEffect(() => {
    if (!sessionId || startedRef.current) return
    startedRef.current = true

    container.socket.connect(sessionId, role, {
      onEvent: handleEvent,
      onOpen: () => {
        dispatch(connectionChanged(true))
        if (role !== 'officer') return
        // Perintah dikirim sebelum mikrofon mulai agar frame pertama pun
        // diperlakukan sebagai kalibrasi, bukan otomatis sebagai petugas.
        container.socket.beginSpeakerCalibration()
        container.usecases.streamAudio
          .start((pcm) => container.socket.sendAudio(pcm))
          .then(() => dispatch(recordingChanged(true)))
          .catch((err: Error) => dispatch(sessionFailed(err.message)))
      },
      onClose: () => dispatch(connectionChanged(false)),
      onError: () => dispatch(sessionFailed('Koneksi gateway terputus')),
    })

    return () => {
      startedRef.current = false
      container.repositories.speech.cancel()
      // Socket ditutup SETELAH mikrofon berhenti: stop() masih mengirim
      // sisa buffer worklet, dan frame itu ikut hilang kalau soket sudah mati.
      void container.usecases.streamAudio
        .stop()
        .finally(() => container.socket.close())
    }
  }, [sessionId, role, handleEvent, dispatch])

  const confirmSpeakerRoles = useCallback((officerLabel: string, customerLabel: string) => {
    setCalibrationError(null)
    container.socket.confirmSpeakerRoles(officerLabel, customerLabel)
  }, [])

  return { calibrationStatus, calibrationSamples, calibrationError, confirmSpeakerRoles }
}
