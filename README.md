# Bisik

> Kopilot kepatuhan real-time untuk petugas keuangan lapangan Indonesia. Bisik mendengarkan percakapan tatap muka **petugas ↔ nasabah**, mengenali siapa yang berbicara, lalu membisikkan kewajiban yang belum disampaikan sebelum sesi berakhir.

Dibangun untuk **AssemblyAI Voice Agent Hackathon 2026** (lablab.ai).

`saksi` tetap menjadi nama internal repository dan module. **Bisik** adalah nama produk publik agar positioning-nya tegas: pencegahan kelalaian secara privat, recovery saat percakapan masih berlangsung, dan laporan supervisor berbasis bukti.

## Kenapa ini berbeda

Hampir semua voice agent adalah **manusia ↔ bot**. Bisik adalah **AI yang mendengarkan dua manusia** dan hanya ikut campur saat ada kewajiban yang terlewat. Pengingat biasa masuk privat ke earpiece petugas; pelanggaran tetap tercatat untuk supervisor dan membutuhkan koreksi eksplisit.

## Tiga project

| Folder | Isi | Stack |
|---|---|---|
| [`saksi_frontend/`](./saksi_frontend) | PWA petugas (`/officer`) + dashboard supervisor (`/supervisor`) | React 19 · Vite · TypeScript · Redux Toolkit |
| [`saksi_backend/`](./saksi_backend) | Gateway WebSocket, rule engine, laporan | Go 1.26 · pgx · PostgreSQL 18 (Docker) |
| [`saksi_mobile/`](./saksi_mobile) | App petugas di lapangan | Flutter · Riverpod |

Ketiganya memakai **clean architecture** dengan aturan dependensi yang sama:

```
domain  ←  application/usecase  ←  adapter/infrastructure  ←  presentation
   ↑ tidak pernah mengimpor ke arah kanan
```

Penjelasan khusus backend—lapisan, state management, endpoint, dan cara
menjalankan—tersedia di [`saksi_backend/README.md`](./saksi_backend/README.md).

## Alur

```
Mic (PWA AudioWorklet / Flutter record)
  │  PCM16 16kHz mono, WebSocket
  ▼
Go Gateway ── goroutine per sesi, channel fan-out
  ├→ AssemblyAI Streaming STT + streaming speaker diarization
  │    └─ kalibrasi A/B → konfirmasi PETUGAS vs NASABAH sebelum scoring
  ├→ Rule engine: 5 butir kewajiban, semantic match via LLM Gateway
  ├→ Guardrails deterministik: janji terlarang ("dijamin untung", "pasti cair")
  └→ Nudge → HANYA ke klien role officer → TTS di perangkat
             (nasabah tidak mendengar, latensi lebih rendah)
  ▼
Laporan: skor + transkrip ber-timestamp + bukti per butir
```

## 5 butir kewajiban

| Kode | Butir |
|---|---|
| `IDENTITY` | Identitas petugas & lembaga |
| `RATE` | Suku bunga / total biaya |
| `TENOR` | Jangka waktu & besaran cicilan |
| `PENALTY` | Denda keterlambatan |
| `RIGHT` | Hak nasabah menolak/membatalkan |

Sengaja hardcoded. Editor rule bukan bagian dari scope hackathon.

## Menjalankan

Panduan lengkap untuk menjalankan ketiga project, memilih alamat mobile, dan
menguji AssemblyAI dengan dua pembicara ada di [`TESTING.md`](./TESTING.md).
Struktur tabel, relasi, constraint, dan aturan migrasi ada di
[`saksi_backend/SCHEMA.md`](./saksi_backend/SCHEMA.md).

### 1. Backend + Postgres

```bash
cd saksi_backend
test -f .env || cp .env.example .env  # jangan timpa .env yang sudah terisi
make db                     # Postgres di Docker, migrasi jalan otomatis
make dev                    # API di :8080
```

### 2. Frontend

```bash
cd saksi_frontend
cp .env.example .env
pnpm install && pnpm dev    # http://localhost:5173/officer
```

### Build deployment

Frontend deployment dibuild memakai Node host (minimum Node 24), bukan image
Node di Docker. Hasil `saksi_frontend/dist` disimpan di repository agar builder
deployment hanya memerlukan Go:

```bash
make deploy-build   # pnpm install + build frontend dengan Node host
make deploy-image   # langkah di atas + build image aplikasi
```

Setiap perubahan frontend wajib diikuti `make deploy-build` sebelum commit.

### 3. Mobile

```bash
cd saksi_mobile
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:8080 --dart-define=WS_URL=ws://10.0.2.2:8080
```

> `10.0.2.2` adalah alamat host dari emulator Android. Untuk perangkat fisik, pakai IP LAN mesin kamu.

## Status

Scaffold lengkap dan terkompilasi (`go test`, `go vet`, `pnpm build`, `flutter analyze` bersih).
Kontrak lokal Streaming STT dan LLM Gateway memiliki unit test. Jalur live masih
harus diverifikasi, khususnya kompatibilitas `whisper-rt` + speaker diarization
untuk percakapan Bahasa Indonesia. PWA sudah menahan scoring sampai dua label
suara dikalibrasi dan dikonfirmasi; Flutter sementara masih memakai fallback
pembicara pertama sebagai petugas.
