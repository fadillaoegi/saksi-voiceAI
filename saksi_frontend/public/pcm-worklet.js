// Saksi — AudioWorklet: Float32 -> PCM16 mono 16 kHz.
// Sengaja vanilla dan berdiri sendiri: ini bagian paling rapuh di pipeline,
// jangan dibungkus abstraksi framework.
//
// Dua aturan AssemblyAI Streaming yang wajib dipatuhi di sini:
//  1. Satu frame WebSocket harus berisi 50–1000 ms audio. Render quantum
//     Web Audio hanya 128 sample (8 ms), jadi frame HARUS diakumulasi dulu.
//     Mengirim langsung per quantum membuat upstream menutup koneksi
//     (close 3007) dan backend melaporkan "push audio gagal".
//  2. Sample rate harus sama dengan yang dideklarasikan gateway (16 kHz).
//     Browser boleh menolak permintaan AudioContext 16 kHz, karena itu
//     worklet menurunkan sample rate sendiri kalau ternyata berbeda.

const TARGET_SAMPLE_RATE = 16000
// 2048 sample = 4096 byte = 128 ms: ukuran frame yang direkomendasikan AssemblyAI.
const FRAME_SAMPLES = 2048
// 800 sample = 50 ms: batas minimum yang masih boleh dikirim saat flush terakhir.
const MIN_FLUSH_SAMPLES = 800
// Jendela pengukuran kualitas audio: 1 detik pada laju target.
const STATS_WINDOW_SAMPLES = TARGET_SAMPLE_RATE
// Sample dianggap pecah kalau menyentuh batas skala penuh.
const CLIP_THRESHOLD = 0.98

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Int16Array(FRAME_SAMPLES)
    this.filled = 0
    // Posisi baca pecahan untuk decimation; disimpan antar quantum supaya
    // tidak ada sample yang hilang atau terhitung dua kali di batas blok.
    this.readCursor = 0
    this.ratio = sampleRate / TARGET_SAMPLE_RATE
    // Statistik mentah untuk quality gate. Worklet sengaja hanya mengukur
    // dan tidak memutuskan: ambang batasnya ada di sisi TypeScript supaya
    // mudah dibaca dan diubah tanpa menyentuh file paling rapuh ini.
    this.statSamples = 0
    this.statSumSquares = 0
    this.statPeak = 0
    this.statClipped = 0
    this.port.onmessage = (e) => {
      if (e.data === 'flush') this.flush(MIN_FLUSH_SAMPLES)
    }
  }

  /** Kirim isi buffer kalau sudah memenuhi jumlah sample minimum. */
  flush(minSamples) {
    if (this.filled < minSamples) return
    const frame = this.buffer.slice(0, this.filled)
    this.filled = 0
    this.port.postMessage(frame.buffer, [frame.buffer])
  }

  push(sample) {
    const s = Math.max(-1, Math.min(1, sample))
    this.buffer[this.filled++] = s < 0 ? s * 0x8000 : s * 0x7fff
    if (this.filled === FRAME_SAMPLES) this.flush(FRAME_SAMPLES)

    const magnitude = Math.abs(s)
    this.statSamples++
    this.statSumSquares += s * s
    if (magnitude > this.statPeak) this.statPeak = magnitude
    if (magnitude >= CLIP_THRESHOLD) this.statClipped++
    if (this.statSamples >= STATS_WINDOW_SAMPLES) this.reportStats()
  }

  reportStats() {
    this.port.postMessage({
      rms: Math.sqrt(this.statSumSquares / this.statSamples),
      peak: this.statPeak,
      clippedRatio: this.statClipped / this.statSamples,
    })
    this.statSamples = 0
    this.statSumSquares = 0
    this.statPeak = 0
    this.statClipped = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true

    const channel = input[0]
    if (!channel) return true

    if (this.ratio === 1) {
      for (let i = 0; i < channel.length; i++) this.push(channel[i])
      return true
    }

    // Decimation sederhana: ambil sample terdekat pada laju target.
    // readCursor dibawa lintas blok agar jarak antar sample tetap konsisten.
    for (let i = this.readCursor; i < channel.length; i += this.ratio) {
      this.push(channel[Math.floor(i)])
    }
    this.readCursor = (this.readCursor - channel.length) % this.ratio
    if (this.readCursor < 0) this.readCursor += this.ratio
    return true
  }
}

registerProcessor('pcm-processor', PCMProcessor)
