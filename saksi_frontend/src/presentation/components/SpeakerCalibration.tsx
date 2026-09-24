interface CalibrationSample {
  sourceSpeaker: string
  text: string
}

interface Props {
  samples: CalibrationSample[]
  officerLabel: string | null
  error: string | null
  onSelectOfficer: (label: string) => void
  onConfirm: () => void
}

export function SpeakerCalibration({
  samples,
  officerLabel,
  error,
  onSelectOfficer,
  onConfirm,
}: Props) {
  const labels = samples.map((sample) => sample.sourceSpeaker)
  const customerLabel = labels.find((label) => label !== officerLabel) ?? null
  const ready = labels.length >= 2 && officerLabel !== null && customerLabel !== null

  return (
    <section className="calibration" aria-labelledby="calibration-title">
      <p className="calibration__eyebrow">Langkah keamanan · belum dinilai</p>
      <h2 id="calibration-title">Kenali dua suara</h2>
      <ol className="calibration__steps">
        <li>Petugas ucapkan: “Saya petugas yang menjalankan sesi ini.”</li>
        <li>Nasabah ucapkan: “Saya nasabah dan siap memulai.”</li>
      </ol>

      {samples.length === 0 ? (
        <p className="calibration__waiting">Mendengarkan suara petugas…</p>
      ) : (
        <div className="calibration__samples">
          {samples.map((sample) => (
            <label
              key={sample.sourceSpeaker}
              className={`calibration__sample ${
                officerLabel === sample.sourceSpeaker ? 'calibration__sample--selected' : ''
              }`}
            >
              <input
                type="radio"
                name="officer-speaker"
                checked={officerLabel === sample.sourceSpeaker}
                onChange={() => onSelectOfficer(sample.sourceSpeaker)}
              />
              <span>
                <strong>Suara {sample.sourceSpeaker}</strong>
                <small>{sample.text}</small>
                <em>{officerLabel === sample.sourceSpeaker ? 'Petugas' : 'Nasabah'}</em>
              </span>
            </label>
          ))}
        </div>
      )}

      {samples.length === 1 && (
        <p className="calibration__waiting">Satu suara ditemukan. Sekarang minta orang kedua berbicara.</p>
      )}
      {error && <p className="error-box">Kalibrasi gagal: {error}</p>}
      <button className="btn btn--primary btn--wide" disabled={!ready} onClick={onConfirm}>
        {ready ? 'Konfirmasi dan mulai penilaian' : 'Menunggu dua suara'}
      </button>
      <small className="calibration__note">
        Pilih contoh yang benar-benar diucapkan petugas. Ucapan kalibrasi tidak masuk laporan.
      </small>
    </section>
  )
}
