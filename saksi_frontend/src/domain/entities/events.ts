import type { Speaker } from './session'

/** Event realtime yang dikirim gateway Go lewat WebSocket. */
export type SessionEvent =
  | { type: 'partial'; speaker: Speaker; text: string }
  | { type: 'utterance'; id: string; speaker: Speaker; text: string }
  | { type: 'speaker_revised'; utterance_id: string; speaker: Speaker }
  | { type: 'speaker_calibration_started' }
  | { type: 'speaker_calibration_partial'; source_speaker: string; text: string }
  | { type: 'speaker_calibration_utterance'; source_speaker: string; text: string }
  | { type: 'speaker_roles_confirmed'; officer_label: string; customer_label: string }
  | { type: 'speaker_calibration_error'; message: string }
  | { type: 'obligation_satisfied'; code: string; confidence: number; evidence_id: string }
  | { type: 'violation'; phrase: string; severity: string; evidence_id: string }
  | { type: 'nudge'; text: string }
  | { type: 'session_error'; message: string }
