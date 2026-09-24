import type {
  AudioQualityReason,
  AudioRepository,
} from '../../domain/repositories/audio_repository'

const TARGET_SAMPLE_RATE = 16_000
const FLUSH_TIMEOUT_MS = 100

/**
 * Ambang quality gate. Angkanya sengaja konservatif: verdict "buruk" menahan
 * checklist berubah hijau, jadi salah tuduh lebih mahal daripada kelewatan.
 */
// Di bawah ini dianggap tidak ada yang bicara — bukan audio buruk, jadi
// jangan divonis apa pun. Tanpa ini setiap jeda bicara akan dilaporkan pelan.
const SILENCE_PEAK = 0.02
// Lebih dari 1% sample menyentuh skala penuh: suara pecah, transkrip ngawur.
const CLIP_RATIO = 0.01
// RMS bicara normal jauh di atas ini; di bawahnya mikrofon terlalu jauh.
const QUIET_RMS = 0.008
// Crest factor rendah + energi tinggi = bunyi rata terus-menerus (AC, jalan),
// bukan bicara yang punya puncak dan jeda.
const NOISY_RMS = 0.02
const NOISY_CREST = 2.2

interface AudioStats {
  rms: number
  peak: number
  clippedRatio: number
}

/** Menerjemahkan satu jendela pengukuran menjadi alasan, '' kalau sehat. */
export function verdictFor(stats: AudioStats): AudioQualityReason {
  if (stats.peak < SILENCE_PEAK) return ''
  if (stats.clippedRatio > CLIP_RATIO) return 'Suara terlalu keras dan pecah'
  if (stats.rms < QUIET_RMS) return 'Suara terlalu pelan dari mikrofon'
  if (stats.rms > NOISY_RMS && stats.peak / stats.rms < NOISY_CREST) {
    return 'Kebisingan latar terlalu tinggi'
  }
  return ''
}

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
  private onQuality: ((reason: AudioQualityReason) => void) | null = null
  private lastReason: AudioQualityReason = ''

  actualSampleRate = TARGET_SAMPLE_RATE

  async start(
    onFrame: (pcm: ArrayBuffer) => void,
    onQuality?: (reason: AudioQualityReason) => void,
  ): Promise<void> {
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
    this.onQuality = onQuality ?? null
    this.lastReason = ''
    // Worklet mengirim dua jenis pesan: frame PCM (ArrayBuffer) dan hasil
    // pengukuran per detik (objek biasa).
    this.node.port.onmessage = (e: MessageEvent<ArrayBuffer | AudioStats>) => {
      if (e.data instanceof ArrayBuffer) {
        this.onFrame?.(e.data)
        return
      }
      this.reportQuality(verdictFor(e.data))
    }

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
    // Sesi berakhir: jangan tinggalkan peringatan audio yang menggantung.
    this.reportQuality('')
    this.onQuality = null
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

  /** Hanya melaporkan saat vonisnya berubah, bukan tiap detik. */
  private reportQuality(reason: AudioQualityReason): void {
    if (reason === this.lastReason) return
    this.lastReason = reason
    this.onQuality?.(reason)
  }

  isRunning(): boolean {
    return this.ctx !== null
  }
}
