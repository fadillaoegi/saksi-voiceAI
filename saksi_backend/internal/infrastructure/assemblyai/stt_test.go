package assemblyai

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/saksi/saksi_backend/internal/domain"
	"github.com/saksi/saksi_backend/internal/usecase"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestConnectionParamsUntukBahasaIndonesia(t *testing.T) {
	stt := NewStreamingSTT("key", "ws://example.test", "", 5000, testLogger())
	q := stt.connectionParams()

	if got := q.Get("speech_model"); got != "whisper-rt" {
		t.Fatalf("speech_model = %q, mau whisper-rt", got)
	}
	if got := q.Get("speaker_labels_revision_interval_ms"); got != "120000" {
		t.Fatalf("revision interval = %q, mau 120000", got)
	}
	if got := q.Get("format_turns"); got != "" {
		t.Fatalf("format_turns tidak boleh dikirim untuk whisper-rt, dapat %q", got)
	}
}

func TestConnectionParamsUniversalStreamingMemintaFormat(t *testing.T) {
	stt := NewStreamingSTT("key", "ws://example.test", "universal-streaming-multilingual", 300000, testLogger())
	if got := stt.connectionParams().Get("format_turns"); got != "true" {
		t.Fatalf("format_turns = %q, mau true", got)
	}
}

func TestResolveRoleStabilPerLabel(t *testing.T) {
	stt := NewStreamingSTT("key", "ws://example.test", "whisper-rt", 120000, testLogger())
	stt.speakers["sesi-1"] = &speakerSession{
		roles: map[string]domain.Speaker{}, calibrationTurns: map[int]struct{}{},
	}

	if got, _ := stt.resolveSpeaker("sesi-1", "A", 1); got != domain.SpeakerOfficer {
		t.Fatalf("speaker pertama = %q, mau officer", got)
	}
	if got, _ := stt.resolveSpeaker("sesi-1", "B", 2); got != domain.SpeakerCustomer {
		t.Fatalf("speaker kedua = %q, mau customer", got)
	}
	if got, _ := stt.resolveSpeaker("sesi-1", "A", 3); got != domain.SpeakerOfficer {
		t.Fatalf("label A berubah menjadi %q", got)
	}
	if got, _ := stt.resolveSpeaker("sesi-1", "UNKNOWN", 4); got != domain.SpeakerUnknown {
		t.Fatalf("UNKNOWN = %q, mau unknown", got)
	}
}

func TestKalibrasiMenahanRoleSampaiDikonfirmasi(t *testing.T) {
	stt := NewStreamingSTT("key", "ws://example.test", "whisper-rt", 120000, testLogger())
	stt.speakers["sesi-1"] = &speakerSession{
		roles: map[string]domain.Speaker{}, calibrationTurns: map[int]struct{}{},
	}

	if err := stt.BeginSpeakerCalibration("sesi-1"); err != nil {
		t.Fatalf("BeginSpeakerCalibration(): %v", err)
	}
	if got, calibrating := stt.resolveSpeaker("sesi-1", "B", 7); got != domain.SpeakerUnknown || !calibrating {
		t.Fatalf("saat kalibrasi got=(%q,%v), mau (unknown,true)", got, calibrating)
	}
	if !stt.isCalibrationTurn("sesi-1", 7) {
		t.Fatal("turn kalibrasi tidak ditandai")
	}

	if err := stt.ConfirmSpeakerRoles("sesi-1", "B", "A"); err != nil {
		t.Fatalf("ConfirmSpeakerRoles(): %v", err)
	}
	if got, calibrating := stt.resolveSpeaker("sesi-1", "B", 8); got != domain.SpeakerOfficer || calibrating {
		t.Fatalf("label B got=(%q,%v), mau (officer,false)", got, calibrating)
	}
	if got, _ := stt.resolveSpeaker("sesi-1", "A", 9); got != domain.SpeakerCustomer {
		t.Fatalf("label A = %q, mau customer", got)
	}
}

func TestConfirmSpeakerRolesMenolakLabelSama(t *testing.T) {
	stt := NewStreamingSTT("key", "ws://example.test", "whisper-rt", 120000, testLogger())
	stt.speakers["sesi-1"] = &speakerSession{
		roles: map[string]domain.Speaker{}, calibrationTurns: map[int]struct{}{},
	}
	if err := stt.ConfirmSpeakerRoles("sesi-1", "A", "A"); err == nil {
		t.Fatal("label petugas dan nasabah yang sama harus ditolak")
	}
}

func TestEmitTranscriptEventMenungguAcknowledgement(t *testing.T) {
	out := make(chan usecase.TranscriptEvent)
	finished := make(chan bool, 1)

	go func() {
		finished <- emitTranscriptEvent(context.Background(), out, usecase.TranscriptEvent{Text: "uji"})
	}()

	event := <-out
	select {
	case <-finished:
		t.Fatal("emit selesai sebelum event di-acknowledge")
	case <-time.After(20 * time.Millisecond):
	}

	event.Acknowledge()
	select {
	case ok := <-finished:
		if !ok {
			t.Fatal("emit mengembalikan false setelah acknowledgement")
		}
	case <-time.After(time.Second):
		t.Fatal("emit tidak selesai setelah acknowledgement")
	}
}

// Regresi live 25 Sep: AudioWorklet mengirim 128 sample (256 byte) per frame
// sehingga AssemblyAI menutup koneksi dan sesi berikutnya gagal dengan
// "resource tidak ditemukan". Frame keluar wajib berada di 50–1000 ms.
func TestAppendAudioMenahanFrameDiBawahMinimum(t *testing.T) {
	stream := &streamConnection{}

	// 6 x 256 byte = 1536 byte, masih di bawah 4096: belum boleh dikirim.
	for i := 0; i < 6; i++ {
		if frames := stream.appendAudio(make([]byte, 256)); frames != nil {
			t.Fatalf("frame ke-%d: potongan 8 ms tidak boleh diteruskan, dapat %d frame", i, len(frames))
		}
	}

	// Potongan berikutnya melewati 4096 byte dan memicu satu frame penuh.
	frames := stream.appendAudio(make([]byte, 2560))
	if len(frames) != 1 {
		t.Fatalf("mau 1 frame setelah melewati batas, dapat %d", len(frames))
	}
	if len(frames[0]) != RecommendedChunkBytes {
		t.Fatalf("ukuran frame = %d byte, mau %d", len(frames[0]), RecommendedChunkBytes)
	}
}

func TestAppendAudioMemotongFrameDiAtasMaksimum(t *testing.T) {
	stream := &streamConnection{}

	// Satu potongan 2 detik (64000 byte) melewati batas atas 1000 ms.
	frames := stream.appendAudio(make([]byte, 64000))
	if len(frames) == 0 {
		t.Fatal("potongan besar harus menghasilkan frame")
	}

	total := 0
	for i, frame := range frames {
		if len(frame) > MaximumFrameBytes {
			t.Fatalf("frame %d = %d byte, melewati batas %d", i, len(frame), MaximumFrameBytes)
		}
		if len(frame) < MinimumFrameBytes {
			t.Fatalf("frame %d = %d byte, di bawah batas %d", i, len(frame), MinimumFrameBytes)
		}
		total += len(frame)
	}
	if rest := stream.drainAudio(); rest != nil {
		total += len(rest)
	}
	if total != 64000 {
		t.Fatalf("total byte terkirim = %d, mau 64000 (tidak boleh ada audio hilang)", total)
	}
}

func TestDrainAudioMembuangSisaTerlaluPendek(t *testing.T) {
	stream := &streamConnection{}

	// Sisa 800 byte = 25 ms: ditolak AssemblyAI, jadi sengaja dibuang.
	stream.appendAudio(make([]byte, 800))
	if rest := stream.drainAudio(); rest != nil {
		t.Fatalf("sisa 25 ms harus dibuang, dapat %d byte", len(rest))
	}

	// Sisa 1600 byte = 50 ms: tepat di batas dan masih boleh dikirim.
	stream.appendAudio(make([]byte, MinimumFrameBytes))
	rest := stream.drainAudio()
	if len(rest) != MinimumFrameBytes {
		t.Fatalf("sisa 50 ms harus ikut terkirim, dapat %d byte", len(rest))
	}
	if again := stream.drainAudio(); again != nil {
		t.Fatal("drain kedua harus kosong")
	}
}
