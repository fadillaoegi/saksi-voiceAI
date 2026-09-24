/**
 * Alasan audio dianggap tidak layak dijadikan bukti kepatuhan.
 * String kosong berarti audio sehat.
 */
export type AudioQualityReason = string

/** Kontrak penangkapan mikrofon + pengiriman frame PCM16. */
export interface AudioRepository {
  start(
    onFrame: (pcm: ArrayBuffer) => void,
    onQuality?: (reason: AudioQualityReason) => void,
  ): Promise<void>
  stop(): Promise<void>
  isRunning(): boolean
}

/** Kontrak bisikan suara ke earpiece petugas. */
export interface SpeechRepository {
  speak(text: string): void
  cancel(): void
}
