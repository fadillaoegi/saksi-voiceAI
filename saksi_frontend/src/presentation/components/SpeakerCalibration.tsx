interface CalibrationSample {
  id: string
  sourceSpeaker: string
  text: string
}

interface Props {
  samples: CalibrationSample[]
  officerLabel: string | null
  error: string | null
  onSelectOfficer: (label: string) => void
  onConfirm: () => void
  onRestart: () => void
}

/** Satu kartu per SUARA, bukan per ucapan — satu suara bisa bicara berkali-kali. */
function distinctVoices(samples: CalibrationSample[]) {
  const byLabel = new Map<string, CalibrationSample>()
  for (const sample of samples) {
    if (!sample.sourceSpeaker || sample.sourceSpeaker === 'UNKNOWN') continue
    // Simpan ucapan terakhir: biasanya paling panjang dan paling enak dibaca.
    byLabel.set(sample.sourceSpeaker, sample)
  }
  return [...byLabel.values()].sort((a, b) =>
    a.sourceSpeaker.localeCompare(b.sourceSpeaker),
  )
}

export function SpeakerCalibration({
  samples,
  officerLabel,
  error,
  onSelectOfficer,
  onConfirm,
  onRestart,
}: Props) {
  const voices = distinctVoices(samples)
  // Ucapan yang terdengar tetapi belum bisa dilabeli. Dulu ini dibuang
  // diam-diam, sehingga petugas menatap layar yang tidak berubah tanpa tahu
  // kenapa — padahal sistemnya sedang mendengar.
  const unlabelled = samples.length - voices.length

  const customerLabel = voices
    .map((v) => v.sourceSpeaker)
    .find((label) => label !== officerLabel) ?? null
  const ready = voices.length >= 2 && officerLabel !== null && customerLabel !== null

  return (
    <section className="calibration" aria-labelledby="calibration-title">
      <p className="calibration__eyebrow">Langkah keamanan · belum dinilai</p>
      <h2 id="calibration-title">Kenali dua suara</h2>
      <ol className="calibration__steps">
        <li>Petugas ucapkan satu kalimat penuh, minimal 3 detik.</li>
        <li>Nasabah ucapkan satu kalimat penuh, minimal 3 detik.</li>
        <li>Jangan bicara bersamaan, beri jeda sekitar satu detik.</li>
      </ol>

      {voices.length === 0 ? (
        <p className="calibration__waiting">Mendengarkan…</p>
      ) : (
        <div className="calibration__samples">
          {voices.map((voice) => (
            <label
              key={voice.sourceSpeaker}
              className={`calibration__sample ${
                officerLabel === voice.sourceSpeaker ? 'calibration__sample--selected' : ''
              }`}
            >
              <input
                type="radio"
                name="officer-speaker"
                checked={officerLabel === voice.sourceSpeaker}
                onChange={() => onSelectOfficer(voice.sourceSpeaker)}
              />
              <span>
                <strong>Suara {voice.sourceSpeaker}</strong>
                <small>{voice.text}</small>
                <em>{officerLabel === voice.sourceSpeaker ? 'Petugas' : 'Nasabah'}</em>
              </span>
            </label>
          ))}
        </div>
      )}

      {voices.length === 1 && (
        <p className="calibration__waiting">
          Baru satu suara yang dikenali. Minta orang kedua bicara lebih lama —
          kalimat pendek sering belum cukup bagi model untuk memisahkan suara.
        </p>
      )}

      {unlabelled > 0 && (
        <p className="calibration__waiting">
          {unlabelled} ucapan terdengar tetapi belum bisa dipisahkan sebagai suara
          tersendiri. Bicara lebih panjang dan lebih jelas, atau ulangi kalibrasi.
        </p>
      )}

      {error && <p className="error-box">Kalibrasi gagal: {error}</p>}

      <button className="btn btn--primary btn--wide" disabled={!ready} onClick={onConfirm}>
        {ready ? 'Konfirmasi dan mulai penilaian' : 'Menunggu dua suara'}
      </button>

      {/* Jalan keluar. Tanpa ini petugas terjebak selamanya kalau diarization
          tidak pernah memberi label kedua. */}
      <button className="btn--link" onClick={onRestart}>
        Ulangi kalibrasi dari awal
      </button>

      <small className="calibration__note">
        Pilih contoh yang benar-benar diucapkan petugas. Ucapan kalibrasi tidak masuk laporan.
      </small>
    </section>
  )
}
