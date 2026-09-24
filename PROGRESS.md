# PROGRESS — Bisik (`saksi` internal)

> **Dokumen serah-terima.** Dibaca lebih dulu oleh siapa pun (manusia atau agent) yang melanjutkan pekerjaan ini.
> Update file ini setiap kali ada perubahan berarti, dan tambahkan entri di [Log](#log).

> **Aturan kerja wajib:** setiap task yang selesai harus diikuti pembaruan file Markdown yang relevan—minimal `PROGRESS.md`. Catat status terbaru, hasil verifikasi/test, keputusan penting, dan entri Log sebelum menyerahkan hasil kepada pengguna. Jika konteks/token hampir habis atau pekerjaan harus berpindah ke Claude/agent lain, perbarui handoff ini lebih dulu walaupun task belum selesai: tulis posisi terakhir, file yang berubah, perintah verifikasi, dan langkah berikutnya.

**Terakhir diperbarui:** 2026-09-25 · **Deadline submit:** 30 Sep 2026, 22:00 WIB
**Lomba:** AssemblyAI Voice Agent Hackathon 2026 (lablab.ai) · $10k

---

## 1. Apa yang sedang dibangun

**Bisik** adalah nama produk publik; `saksi` tetap menjadi nama repository dan module internal. Bisik mendengarkan percakapan tatap muka **petugas ↔ nasabah** produk keuangan, mengenali siapa yang bicara, lalu **membisikkan ke earpiece petugas** butir kewajiban yang belum disampaikan. Setelah sesi selesai, keluar laporan kepatuhan berbukti.

**Sudut yang membedakan:** hampir semua voice agent adalah manusia ↔ bot. Bisik adalah **AI yang mendengarkan dua manusia** dan mencegah kelalaian melalui coaching privat saat percakapan masih berlangsung. Pelanggaran tetap dicatat untuk supervisor dan membutuhkan koreksi eksplisit.

**Peringatan pesaing:** submission `Saakshi — Consent You Can Prove` sudah memakai nama dan use case yang sangat mirip. Karena itu nama publik diubah menjadi Bisik dan positioning dikunci ke preventive private coaching untuk operasi lapangan Indonesia, bukan customer-facing consent witness.

Analisa lomba, rubrik juri, dan peta pesaing ada di `../ANALISA-HACKATHON.md`. Rencana harian di `../HACKATHON.md`.

---

## 2. Status per project

| Project | Stack | Status | Verifikasi terakhir |
|---|---|---|---|
| `saksi_backend` | Go 1.26 · pgx · PostgreSQL 18 (Docker) | Pipeline + evidence gate + agregasi frame audio + contract test AssemblyAI lokal | `go vet ./...` ✅ · `go test ./...` ✅ (25 Sep) |
| `saksi_frontend` | React 19 · Vite · TS · Redux Toolkit · PWA | Officer, supervisor, laporan akhir · frame worklet 128 ms · brand publik Bisik | `pnpm build` ✅ · `pnpm lint` ✅ (25 Sep) |
| `saksi_mobile` | Flutter · Riverpod | Scaffold + halaman petugas + event `session_error` | `flutter analyze` ✅ bersih (25 Sep) |

**Handshake AssemblyAI sungguhan sudah berhasil** memakai `whisper-rt` + diarization (`Begin` diterima dan `Terminate` selesai). Penyebab kegagalan audio end-to-end — frame 128 sample/8 ms dari AudioWorklet, di bawah syarat 50–1000 ms — **sudah diperbaiki di dua lapis** (worklet mengakumulasi 128 ms, backend mengagregasi frame dari klien mana pun). Perbaikan ini terbukti lewat unit test, **belum lewat audio sungguhan**: transkrip Bahasa Indonesia dan `speaker_label` live masih harus dibuktikan.

**Database lokal:** container `saksi_postgres` memakai image lokal `postgres:18-alpine` (server 18.4) dan volume `saksi_backend_saksi_pgdata18`; health status ✅. Image `postgres:17-alpine` sudah dihapus sesuai instruksi pemilik. Volume lama `saksi_backend_saksi_pgdata` sengaja dipertahankan sebagai cadangan dan tidak dipasang ke PG18.

---

## 3. Protokol AssemblyAI — diverifikasi ulang 24 Sep 2026

Diverifikasi dari `docs/streaming/api-spec/streaming-websocket`, dokumentasi Streaming Diarization, Whisper Streaming, dan LLM Gateway. Diimplementasikan di
`saksi_backend/internal/infrastructure/assemblyai/stt.go`.

**Koneksi**
```
wss://streaming.assemblyai.com/v3/ws
Header: Authorization: <API_KEY>      ← tanpa prefix "Bearer"
```

**Query param yang dipakai**

| Param | Nilai | Kenapa |
|---|---|---|
| `speech_model` | configurable; default `whisper-rt` | Bahasa Indonesia belum tercantum pada Universal-3.5 Pro; Whisper Streaming mendukung `id`. Kombinasi live dengan diarization wajib dibuktikan setelah key tersedia |
| `encoding` | `pcm_s16le` | Sama dengan output AudioWorklet & `record` di Flutter |
| `sample_rate` | `16000` | |
| `format_turns` | kondisional | Hanya dikirim untuk `universal-streaming-english`/`multilingual`; Universal-3.5 Pro selalu formatted |
| `speaker_labels` | `true` | Mengaktifkan diarization |
| `max_speakers` | `2` | Percakapan ini selalu dua orang; batas keras model |
| `speaker_labels_revision_interval_ms` | `120000` | Minimum resmi 120 detik; nilai lebih kecil otomatis dinaikkan server. Revisi final tetap dikirim setelah `Terminate` |

**Pesan dari server**

| Type | Field penting |
|---|---|
| `Begin` | `id`, `expires_at`, `configuration` |
| `Turn` | `turn_order`, `end_of_turn`, `transcript`, `speaker_label`, `words[]{text,start,end,speaker,word_is_final}` |
| `SpeakerRevision` | `revisions[]{turn_order, speaker_label, words[]}` — hanya turn yang berubah |
| `Termination` | `audio_duration_seconds`, `session_duration_seconds` |
| `SpeechStarted`, `Heartbeat` | belum ditangani, aman diabaikan |

**Pesan ke server:** frame audio biner (50–1000 ms, rekomendasi 4096 byte) · `{"type":"Terminate"}` untuk menutup.

**Jebakan yang sudah ditangani**
- Header Streaming STT dan LLM Gateway sama-sama memakai API key apa adanya, **tanpa `Bearer`**.
- Model dan interval revisi configurable lewat environment; kontrak query diuji tanpa jaringan.
- `speaker_label` bisa bernilai `"UNKNOWN"` untuk ucapan di bawah 1 detik → dipetakan ke `SpeakerUnknown`, tidak dianggap petugas.
- `Turn` tidak punya field `id`. ID utterance dibentuk sendiri: `"<sessionID>-t<turn_order>"`, supaya `SpeakerRevision` bisa menunjuk balik ke baris yang sama.
- Frame audio di bawah 50 ms ditolak upstream (close 3007). Worklet web mengakumulasi 2048 sample (4096 byte/128 ms) dan backend mengagregasi ulang setiap potongan klien, jadi ukuran chunk `record` di Flutter tidak lagi menjadi risiko. Sisa buffer di bawah 50 ms dibuang saat flush karena tetap akan ditolak.
- Putusnya stream upstream dulu hanya masuk log. Sekarang STT mengirim event gagal, adapter meneruskannya sebagai `session_error` ke petugas dan menghentikan nudge berkala.
- Label `"A"`/`"B"` tidak punya arti tetap. PWA sekarang melakukan kalibrasi dan konfirmasi eksplisit sebelum scoring. Fallback "pembicara pertama = petugas" hanya dipertahankan untuk klien lama/Flutter yang belum mengirim perintah kalibrasi.

**Hardening identitas pembicara**
- **Selesai di PWA:** sebelum sesi dinilai, petugas dan nasabah masing-masing membaca satu kalimat. UI menampilkan contoh `Suara A/B`; pengguna memilih contoh petugas dan mengonfirmasi mapping. Karena scoring belum dimulai, pemilihan/tukar role tidak membutuhkan rollback checklist.
- **Selesai di backend:** seluruh turn kalibrasi diberi `unknown`, tidak dipersist, tidak masuk guardrail/checklist/laporan, dan tidak memicu nudge. Revisi diarization untuk turn kalibrasi juga diabaikan.
- **Kompatibilitas:** Flutter belum memiliki UI kalibrasi dan masih memakai fallback urutan bicara. Pemetaan ulang di tengah sesi beserta recompute penuh juga belum tersedia.
- Tambahkan quality gate audio di klien (terlalu pelan, clipping, dan kebisingan tinggi). Saat audio/label ambigu atau `UNKNOWN`, tampilkan peringatan dan jangan gunakan bagian tersebut sebagai bukti kepatuhan.
- Untuk orang ketiga, naikkan batas deteksi secara terkontrol menjadi tiga pembicara. Label di luar dua hasil kalibrasi menjadi **Pengamat/Tidak dikenal**, tidak ikut scoring, dan memunculkan peringatan. Jika mapping berubah, scoring dijeda sampai petugas mengonfirmasi.
- Percakapan tumpang tindih dari satu mikrofon tidak dapat dipisahkan 100%. UX harus meminta bicara bergantian; pilihan produksi yang lebih kuat adalah audio multi-channel/perangkat terpisah.

---

## 4. Arsitektur

Ketiga project memakai clean architecture dengan aturan dependensi yang sama:

```
domain  ←  usecase/application  ←  adapter/infrastructure  ←  presentation
   ↑ layer domain tidak pernah mengimpor ke arah kanan
```

**Alur data**
```
Mic (AudioWorklet di web / record di Flutter) — PCM16 16kHz mono
  │ WebSocket biner
  ▼
Go Gateway — goroutine per sesi, channel fan-out
  ├→ AssemblyAI Universal Streaming v3 + diarization
  ├→ Rule engine: 5 butir kewajiban, semantic match via LLM Gateway
  ├→ Guardrails deterministik: janji terlarang
  └→ Nudge → HANYA klien role=officer → TTS di perangkat
  ▼
Laporan: skor + transkrip + bukti per butir
```

**Peta file yang penting**

| Yang dicari | Ada di |
|---|---|
| 5 butir kewajiban & frasa terlarang | `saksi_backend/internal/domain/checklist.go` |
| Inti penilaian kepatuhan | `saksi_backend/internal/usecase/compliance_usecase.go` |
| Klien WebSocket AssemblyAI | `saksi_backend/internal/infrastructure/assemblyai/stt.go` |
| Semantic match via LLM Gateway | `saksi_backend/internal/infrastructure/assemblyai/matcher.go` |
| Skema dan aturan migrasi PostgreSQL | `saksi_backend/SCHEMA.md` · `internal/infrastructure/db/migrations/` |
| Migration runner checksummed | `saksi_backend/internal/infrastructure/db/migrate.go` · `cmd/migrate/main.go` |
| Fan-out realtime + bisikan | `saksi_backend/internal/adapter/ws/` |
| Wiring semua dependensi | `saksi_backend/cmd/api/main.go` |
| Capture audio PCM16 (web) | `saksi_frontend/public/pcm-worklet.js` |
| Composition root (web) | `saksi_frontend/src/infrastructure/di/container.ts` |
| Kontrak event realtime | `saksi_frontend/src/domain/entities/events.ts` · `saksi_mobile/lib/features/session/domain/entities/session_event.dart` |
| Composition root (mobile) | `saksi_mobile/lib/features/session/presentation/providers/di_providers.dart` |

> Saat protokol WebSocket berubah, **tiga file kontrak event** di atas yang harus disamakan. Itu satu-satunya titik sinkronisasi antar project.

---

## 5. Keputusan yang sudah diambil — jangan dibongkar tanpa alasan

| Keputusan | Alasan |
|---|---|
| **PWA web adalah deliverable utama**, bukan APK | Syarat wajib lablab: prototype harus bisa diakses lewat URL. Juri tidak akan install APK. Flutter adalah tambahan untuk memperkuat cerita lapangan |
| **Nama publik Bisik; repo tetap `saksi`** | Menghindari kebingungan dengan pesaing `Saakshi` dan memperjelas pembeda: coaching privat preventif untuk petugas Indonesia |
| **TTS bisikan dieksekusi di klien**, bukan streaming audio dari server | Latensi lebih rendah, tanpa bandwidth audio balik, dan nasabah dijamin tidak mendengar karena keluar lewat earpiece perangkat |
| **Guardrails deterministik** (cocokkan frasa), bukan LLM | Pelanggaran kepatuhan tidak boleh bergantung pada sampling model. Demo jadi reproducible |
| **Evidence gate sebelum LLM + confidence minimum 0,80** | Mencegah false-green dan menghemat panggilan LLM. LLM hanya menilai ucapan yang sudah memiliki bukti minimum spesifik per butir |
| **5 butir kewajiban hardcoded** | Editor rule bukan scope hackathon. Menambah scope di sini adalah cara paling cepat kehabisan waktu |
| **Revisi label memicu penilaian ulang** | Kalau ucapan ternyata milik petugas padahal tadi dikira nasabah, ucapan itu belum pernah dinilai. Tanpa ini, koreksi diarization justru membuat laporan salah. Ada di `compliance_usecase.go → handleRevision` |
| **Role pembicara PWA dikalibrasi sebelum scoring** | Urutan bicara bukan identitas. Dua contoh suara ditampilkan sebagai A/B dan manusia memilih petugas; turn kalibrasi tidak pernah dinilai. Flutter dan remap di tengah sesi masih pending |
| **Audio ambigu gagal secara aman** *(direncanakan)* | Ucapan `UNKNOWN`, kualitas buruk, overlap, atau pembicara ketiga tidak boleh menjadi bukti kepatuhan. Sistem memberi peringatan dan mengecualikannya dari scoring |
| **`Terminate` adalah flush barrier sebelum skor** | Backend menunggu `SpeakerRevision`/`Termination` dan acknowledgement dari compliance handler sebelum menghitung skor, supaya laporan tidak memakai label lama |
| **Frame audio diakumulasi di klien DAN backend** | Worklet mengirim 128 ms agar tidak membanjiri WebSocket dengan 125 pesan/detik; backend tetap mengagregasi ulang karena `record` di Flutter tidak menjamin ukuran potongan. Satu lapis saja pernah membuat seluruh sesi live gagal |
| **Kegagalan upstream harus terlihat petugas** | Sesi yang mati diam-diam lebih berbahaya daripada error: petugas mengira percakapannya sedang disimak. Stream yang putus memicu `session_error` dan menghentikan nudge berkala |
| **Pengingat dikirim berkala (45 detik), bukan tiap ucapan** | Bisikan tiap kalimat akan membuat petugas mematikan aplikasi |
| **Frontend deployment dibuild dengan Node host**, bukan image Node Docker | Laptop sudah memakai Node 24.15.0 + pnpm 11.1.3. Hasil `saksi_frontend/dist` disimpan di repo supaya Docker/Render hanya membutuhkan builder Go |
| **Migrasi database forward-only dan checksummed** | API otomatis menjalankan versi baru dalam transaksi dengan advisory lock. File yang sudah diterapkan tidak boleh diubah; koreksi selalu memakai nomor migrasi baru |
| Komentar kode ditulis **bahasa Indonesia** | Konsisten dengan domain & pemilik repo. Ikuti gaya ini |

---

## 6. Pekerjaan berikutnya — urut prioritas

### 🔴 Blocker
- [x] Register lablab.ai — tim **Fadil Laoegi**, mode Closed (solo)
- [x] **Pasang API key AssemblyAI** di `saksi_backend/.env` lokal; nilainya tidak dicatat di Git/Markdown.
- [ ] **Selesaikan live STT.** Handshake `whisper-rt` + diarization → `Begin` → `Terminate` sudah terbukti ✅. Buffer frame 50–1000 ms sudah diimplementasikan di worklet dan backend ✅. **Sisa yang wajib dibuktikan dengan audio sungguhan:** transkrip Bahasa Indonesia masuk → `speaker_label` terisi → final `SpeakerRevision` datang saat `Terminate`.
- [ ] **Uji LLM Gateway sungguhan.** Endpoint, bentuk payload, dan auth sudah cocok dokumentasi serta memiliki unit test; akses model `claude-sonnet-4-6` pada akun nyata belum diketahui.

### 🟠 Jalur kritis
- [ ] Deploy backend + frontend, **target 27 Sep** (Render). Image single-container lokal sudah lulus smoke test; berikutnya push repo publik, validasi Blueprint di Render, isi secret, lalu uji URL publik.
- [ ] Uji dua suara sungguhan: pastikan dua kartu A/B muncul, pilihan role terkunci, kalimat kalibrasi tidak dinilai, dan percakapan setelah konfirmasi terpisah benar.
- [x] Implementasikan kalibrasi dua pembicara + konfirmasi/tukar role **sebelum scoring di PWA**; fallback urutan bicara hanya tersisa untuk Flutter/klien lama.
- [ ] Implementasikan audio quality gate dan safe-fail untuk `UNKNOWN`, overlap/ambigu, serta pembicara ketiga; bagian ambigu tidak boleh memenuhi checklist.
- [x] Halaman laporan akhir frontend: skor, bukti per kewajiban, timestamp, pelanggaran, dan transkrip.
- [x] Evidence gate deterministik + confidence minimum 0,80 + test `ComplianceUsecase` untuk false-green, ucapan nasabah, revision, pelanggaran, dan error matcher.
- [x] Identitas PWA Bisik: favicon khusus, ikon manifest yang valid, bahasa `id`, dan aset ikut precache build produksi.
- [x] Demo terarah 9 detik tanpa backend/API, berlabel simulasi: pelanggaran → bisikan koreksi → pemenuhan 5 kewajiban → laporan berbukti.
- [ ] Ukur latensi nudge end-to-end. Target wajar 1–2 detik; kalau lebih, kurangi `NUDGE_INTERVAL_SECONDS` bukan solusinya — periksa jalur STT dulu.

### 🟡 Deliverable lomba
- [ ] Repo GitHub **publik** (lokal sudah di-init, belum ada remote)
- [ ] Video pitch ≤5 menit MP4 — porsi terbesar untuk demo yang jalan
- [ ] Slide deck PDF — wajib memuat TAM + model harga
- [ ] README dirapikan untuk pembaca luar
- [x] Runbook lokal BE, FE, mobile, automated checks, dan skenario live dua pembicara tersedia di `TESTING.md`.

### 🟢 Kalau sempat
- [ ] Tangani `Heartbeat` & `SpeechStarted`
- [ ] Reconnect otomatis saat WebSocket putus
- [ ] Halaman riwayat sesi untuk supervisor
- [ ] Mode offline Flutter (rekam dulu, kirim belakangan)

---

## 7. Cara menjalankan

```bash
# 1. Backend + Postgres
cd saksi_backend
cp .env.example .env          # isi ASSEMBLYAI_API_KEY
make db                       # Postgres di Docker, migrasi jalan otomatis
make dev                      # API di :8080

# 2. Frontend
cd saksi_frontend
cp .env.example .env
pnpm install && pnpm dev      # http://localhost:5173/officer

# 3. Mobile
cd saksi_mobile
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:8080 --dart-define=WS_URL=ws://10.0.2.2:8080
```

`make db-reset` menghapus volume dan menjalankan ulang migrasi dari nol.
`10.0.2.2` adalah alamat host dari emulator Android; untuk perangkat fisik pakai IP LAN.

**Catatan lingkungan:** `riverpod_generator` + `custom_lint` bentrok resolusi versi dengan `flutter_riverpod` 3.x, jadi provider Riverpod ditulis manual tanpa codegen. Jangan coba pasang ulang paket codegen itu.

---

## 8. Yang belum diuji sama sekali

Jujur soal ini supaya tidak ada yang mengira sudah beres:

- Seluruh jalur audio end-to-end (mic → gateway → AssemblyAI → nudge). Ukuran frame sudah diperbaiki dan diuji unit, tetapi belum ada satu pun `Turn` sungguhan yang diterima dari AssemblyAI.
- Decimation sample rate di worklet (jalur untuk browser yang menolak AudioContext 16 kHz, mis. Safari). Jalur 16 kHz adalah no-op dan dipakai Chrome; jalur penurunan rate belum pernah dijalankan dengan audio nyata.
- Event `session_error` belum pernah dipicu oleh kegagalan upstream sungguhan, hanya oleh jalur kode.
- Akurasi diarization pada suara Indonesia.
- Alur kalibrasi PWA dengan dua suara nyata; kontrak dan safe-fail sudah memiliki unit test, UI sudah build/lint tetapi belum menerima audio AssemblyAI sungguhan.
- `matcher.go` belum pernah memanggil LLM Gateway sungguhan; kontrak auth/payload/error sudah diuji in-memory.
- Flutter belum pernah dijalankan di perangkat fisik; izin mikrofon sudah ditulis di manifest tapi belum dicoba.
- Render UI laporan dari sesi **live** belum diuji visual; layout yang sama sudah diuji lewat mode simulasi di Chrome desktop.
- Mode simulasi sudah diuji visual di Chrome desktop, termasuk auto-finish, akhiri lebih awal, skor konsisten, dan reset; viewport mobile serta sesi live tetap belum diuji visual.
- Endpoint laporan sudah diuji manual dengan Postgres + HTTP lokal menggunakan data sintetis; render visual browser dan sesi audio live belum diuji.
- Image deployment single-container sudah dibuild dan diuji lokal dengan PostgreSQL 18 (`/health` dan `/officer` HTTP 200), tetapi belum dijalankan di Render/URL publik.

---

## Log

| Tanggal | Perubahan |
|---|---|
| 2026-09-23 | Scaffold 3 project, clean architecture, semua build/analyze bersih. Postgres via Docker + migrasi otomatis. Izin mikrofon Android & iOS. |
| 2026-09-23 | Implementasi awal protokol AssemblyAI: `stt.go` ditulis ulang (param, tipe pesan, ID utterance dari `turn_order`, penanganan `UNKNOWN`). Saat itu interval revision diisi 5000 ms; temuan ini dikoreksi 24 Sep setelah referensi resmi terbaru menetapkan minimum 120000 ms. |
| 2026-09-23 | `handleRevision` menilai ulang kewajiban saat label berubah jadi petugas — tanpa ini koreksi diarization membuat laporan salah. `TranscriptRepository.FindByID` ditambahkan. |
| 2026-09-23 | Test: `PhraseGuard` + `SessionUsecase.Score`. Git repo di-init, commit pertama. |
| 2026-09-24 | Register lablab.ai selesai; tim **Fadil Laoegi** dibuat dengan mode Closed (solo). Deskripsi tim menekankan sudut "mendengarkan dua manusia" dan laporan berbukti. Blocker tersisa: API key AssemblyAI. |
| 2026-09-24 | Protokol kerja ditetapkan: setiap task selesai wajib memperbarui Markdown relevan, minimal `PROGRESS.md`, termasuk status, hasil verifikasi, keputusan, dan Log. |
| 2026-09-24 | Fase 1 lokal: nama publik diubah menjadi **Bisik** karena ada pesaing langsung bernama Saakshi; nama repo/module tetap `saksi`. UI/PWA/README memakai positioning private preventive coaching untuk petugas Indonesia. File `.env` lokal yang diabaikan Git disiapkan; Makefile kini memuatnya otomatis. |
| 2026-09-24 | Protokol AssemblyAI diverifikasi ulang. LLM Gateway diperbaiki agar auth tanpa `Bearer`, error non-2xx tidak lagi ditelan, default model menjadi `claude-sonnet-4-6`. Speech model dan interval revision dibuat configurable; default Bahasa Indonesia `whisper-rt`, minimum revision 120000 ms. |
| 2026-09-24 | Test baru: parameter Streaming STT, clamp interval revisi, role mapping, auth/payload/error LLM Gateway. Verifikasi: `go test ./...` ✅ · `go vet ./...` ✅. Live API masih diblokir API key. |
| 2026-09-24 | Rule engine diperkuat dengan evidence gate per kewajiban dan confidence minimum 0,80 sebelum status satisfied. Ditambah test untuk false-green, speaker nasabah, confidence rendah, speaker revision, violation+nudge, dan kegagalan matcher. |
| 2026-09-24 | Halaman laporan akhir dibuat dan dipanggil setelah sesi berakhir: ringkasan skor, kutipan/timestamp per kewajiban, violation evidence, transkrip, serta tombol sesi baru. Verifikasi: `go test ./...` ✅ · `go vet ./...` ✅ · `pnpm build` ✅ · `pnpm lint` ✅. |
| 2026-09-24 | Smoke test integrasi lokal dengan Postgres + HTTP berhasil: create session → satu obligation satisfied (confidence 0,93) + satu violation → end session menghasilkan skor 10 → report mengembalikan evidence ID, kutipan, timestamp, violation, dan transcript dengan benar. Data sesi sintetis sudah dihapus; container `saksi_postgres` tetap hidup untuk pengujian berikutnya. |
| 2026-09-24 | Race finalisasi sesi diperbaiki: write WebSocket diserialisasi, `Stop()` mengirim `Terminate` lalu menunggu upstream selesai, setiap transcript/revision memakai acknowledgement, dan score dihitung setelah flush. Test membuktikan emitter menunggu ack dan `SessionUsecase.End` menunggu stop sebelum scoring. |
| 2026-09-24 | Identitas PWA diperbaiki: referensi ikon PNG yang tidak pernah ada diganti ikon SVG Bisik, favicon bawaan diganti, metadata manifest memakai bahasa Indonesia, dan aset ikon masuk precache. Verifikasi: kedua SVG valid (`xmllint`) · `pnpm lint` ✅ · `pnpm build` ✅ · manifest produksi dan file output diperiksa ✅. |
| 2026-09-24 | Mode demo terarah 9 detik ditambahkan sebagai fallback juri tanpa mikrofon/API: percakapan contoh memicu janji terlarang, bisikan koreksi, pemenuhan checklist, lalu laporan 90/100 dengan kutipan dan timestamp. Semua layar diberi label tegas “simulasi lokal”; tombol akhiri dini tidak memanggil backend. Verifikasi: Chrome desktop auto-finish + early-finish + reset ✅ · skor header/laporan konsisten ✅ · `pnpm lint` ✅ · `pnpm build` ✅. |
| 2026-09-24 | Database lokal dikoreksi agar memakai image yang sudah tersedia: Compose kini `postgres:18-alpine` dengan mount point resmi PG18 `/var/lib/postgresql` dan volume terpisah `saksi_pgdata18`. Container sehat pada PostgreSQL 18.4, migrasi startup membuat 4 tabel, dan image `postgres:17-alpine` sudah dihapus. Volume PG17 lama dipertahankan sebagai cadangan. |
| 2026-09-24 | Image Docker Node dihapus sesuai instruksi pemilik. Node host terdeteksi v24.15.0 (cukup, tidak di-upgrade), pnpm 11.1.3. Dockerfile tidak lagi memiliki stage Node; frontend dibuild lewat `make deploy-build`, output `dist` disimpan untuk builder deployment. Image `bisik:deployment-test` berhasil dibuat hanya dengan builder Go + runtime distroless (±4,7 MB) dan lolos smoke test terhadap PostgreSQL 18: `/health` 200, `/officer` 200. Verifikasi: `go test ./...` ✅ · `go vet ./...` ✅ · `pnpm lint` ✅. |
| 2026-09-24 | API key AssemblyAI dipasang di `saksi_backend/.env` lokal yang diabaikan Git. Nilai rahasia tidak disalin ke dokumentasi atau commit. Live STT/LLM belum diuji. Karena key pernah dikirim melalui chat, rotasi key direkomendasikan setelah pengujian. |
| 2026-09-24 | `TESTING.md` ditambahkan sebagai runbook lengkap: urutan menjalankan PostgreSQL/backend/PWA/Flutter, alamat Android/iOS/HP fisik/macOS, pemeriksaan otomatis, skrip live dua pembicara yang memenuhi evidence gate, hasil laporan 90/100 yang diharapkan, supervisor, shutdown, dan troubleshooting. |
| 2026-09-25 | Risiko identitas pembicara dirumuskan: urutan bicara tidak cukup aman. Rencana hardening dicatat berupa kalibrasi dua suara, konfirmasi/tukar role, penilaian ulang setelah koreksi, audio quality gate, dan pengecualian ucapan ambigu/pembicara ketiga dari scoring. Belum diimplementasikan; overlap satu mikrofon tetap tidak dapat dijamin 100%. |
| 2026-09-25 | Kalibrasi dua pembicara diimplementasikan untuk PWA: backend menahan scoring/nudge, meneruskan sampel label mentah A/B tanpa menyimpan turn kalibrasi, lalu mengunci mapping setelah konfirmasi manusia. UI menampilkan dua contoh suara dan memungkinkan memilih/tukar petugas sebelum scoring. Flutter tetap memakai fallback lama. Verifikasi: `go build ./...` ✅ · `go test ./...` ✅ · `go vet ./...` ✅ · `pnpm build` ✅ · `pnpm lint` ✅. Live dua suara masih wajib diuji. |
| 2026-09-25 | Migrasi backend dibuat production-safe: `schema_migrations` menyimpan versi + SHA-256, tiap file berjalan dalam transaksi, dan PostgreSQL advisory lock mencegah race antarinstance. `002_schema_hardening.sql` menambah audit `source_speaker`, tiga indeks, dan delapan constraint integritas. Ditambah `make migrate`, command migrator, serta `SCHEMA.md`. Terverifikasi pada upgrade DB lama, eksekusi ulang idempotent, dan bootstrap DB kosong; DB verifikasi sementara sudah dihapus. `go test ./...` ✅ · `go vet ./...` ✅. |
| 2026-09-25 | Dokumentasi backend khusus ditambahkan di `saksi_backend/README.md`: batas lapisan clean architecture, pembagian state PostgreSQL vs memory, caveat koordinasi kalibrasi, endpoint, serta langkah menjalankan Go host + PostgreSQL 18 Docker. Tidak ada perubahan runtime. |
| 2026-09-25 | Blocker frame audio diperbaiki di dua lapis. Worklet web kini mengakumulasi 2048 sample (4096 byte/128 ms) sebelum mengirim, membawa posisi baca lintas blok saat sample rate perangkat bukan 16 kHz, dan mengirim sisa buffer saat `stop()` — soket baru ditutup setelah flush itu selesai. Backend `PushAudio` mengagregasi potongan klien mana pun ke 1600–32000 byte dan `Stop` mengosongkan sisanya sebelum `Terminate`, jadi ukuran chunk `record` di Flutter tidak lagi menjadi risiko. Bug UX turunan ikut diperbaiki: stream upstream yang putus sebelum sesi diakhiri sekarang mengirim event gagal → `session_error` ke petugas, nudge berkala berhenti, dan banner error tampil di `/officer`. Kontrak event disamakan di tiga file. Verifikasi: `go test ./...` ✅ (3 test frame baru) · `go vet ./...` ✅ · `pnpm lint` ✅ · `pnpm build` ✅ · `make deploy-build` ✅ · `flutter analyze` ✅. **Belum diuji dengan audio sungguhan.** |
| 2026-09-25 | Kegagalan live pertama didiagnosis dari DB dan log pengguna: tiga sesi tercipta tetapi `utterances` kosong; nudge 45 detik tetap berjalan, lalu audio menghasilkan `resource tidak ditemukan`. Probe langsung membuktikan API key, endpoint, `whisper-rt`, diarization, `Begin`, dan `Terminate` valid. Root cause: worklet mengirim 128 sample/8 ms per WebSocket frame, di bawah syarat AssemblyAI 50–1000 ms (close code 3007). Bug UX sekunder: pipeline error/close tidak dikirim ke UI dan nudge tetap hidup, sehingga UI terlihat merekam. Diagnosis saja; perbaikan belum diimplementasikan. |
