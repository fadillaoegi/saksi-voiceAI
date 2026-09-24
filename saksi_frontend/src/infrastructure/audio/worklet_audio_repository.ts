import type { AudioRepository } from '../../domain/repositories/audio_repository'

const TARGET_SAMPLE_RATE = 16_000
const FLUSH_TIMEOUT_MS = 100

/**
 * Menangkap mikrofon lewat Web Audio API + AudioWorklet dan
 * mengeluarkan frame PCM16 16 kHz mono.
 *
 * AudioContext diminta pada 16 kHz supaya tidak perlu resampling manual.
 * Browser yang menolak akan jatuh ke sample rate perangkat; dalam kasus itu
 * worklet yang menurunkan sendiri ke 16 kHz, karena gateway selalu
 * mendeklarasikan `sample_rate=16000` ke AssemblyAI.
 *
 * Frame keluar sudah diakumulasi worklet menjadi 4096 byte (128 ms) agar
 * memenuhi syarat 50–1000 ms per frame Streaming API.
 */
export class WorkletAudioRepository implements AudioRepository {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  private onFrame: ((pcm: ArrayBuffer) => void) | null = null

  actualSampleRate = TARGET_SAMPLE_RATE

  async start(onFrame: (pcm: ArrayBuffer) => void): Promise<void> {
    if (this.ctx) return

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    this.ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
    this.actualSampleRate = this.ctx.sampleRate

    await this.ctx.audioWorklet.addModule('/pcm-worklet.js')

    const source = this.ctx.createMediaStreamSource(this.stream)
    this.node = new AudioWorkletNode(this.ctx, 'pcm-processor')
    this.onFrame = onFrame
    this.node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => this.onFrame?.(e.data)

    source.connect(this.node)
    // Jangan sambungkan ke destination: kita tidak mau suara petugas
    // terdengar balik lewat speaker.
  }

  async stop(): Promise<void> {
    // Minta sisa buffer yang belum genap satu frame sebelum port ditutup,
    // supaya kalimat terakhir petugas tidak terpotong. Worklet berjalan di
    // thread audio, jadi jawabannya ditunggu — dengan batas waktu, karena
    // sisa di bawah 50 ms memang sengaja tidak dikirim.
    await this.flushPending()
    this.onFrame = null
    this.node?.port.close()
    this.node?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    await this.ctx?.close()
    this.node = null
    this.stream = null
    this.ctx = null
  }

  /** Menunggu satu frame terakhir dari worklet, maksimal FLUSH_TIMEOUT_MS. */
  private flushPending(): Promise<void> {
    const node = this.node
    if (!node) return Promise.resolve()

    return new Promise((resolve) => {
      const timer = setTimeout(resolve, FLUSH_TIMEOUT_MS)
      const previous = this.onFrame
      this.onFrame = (pcm) => {
        previous?.(pcm)
        clearTimeout(timer)
        resolve()
      }
      node.port.postMessage('flush')
    })
  }

  isRunning(): boolean {
    return this.ctx !== null
  }
}
