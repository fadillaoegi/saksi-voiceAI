package usecase

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/saksi/saksi_backend/internal/domain"
)

const minimumMatchConfidence = 0.80

var digitPattern = regexp.MustCompile(`\d`)

var numberWords = []string{
	"nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan",
	"sepuluh", "sebelas", "belas", "puluh", "ratus", "ribu", "juta", "miliar",
}

// ComplianceUsecase adalah inti Saksi: menilai tiap ucapan petugas
// terhadap 5 butir kewajiban, dan membisikkan yang belum terpenuhi.
type ComplianceUsecase struct {
	compliance  domain.ComplianceRepository
	transcripts domain.TranscriptRepository
	matcher     SemanticMatcher
	guard       Guardrail
	nudger      Nudger
	broadcaster Broadcaster
	obligations []domain.Obligation
}

func NewComplianceUsecase(
	c domain.ComplianceRepository,
	t domain.TranscriptRepository,
	m SemanticMatcher,
	g Guardrail,
	n Nudger,
	b Broadcaster,
) *ComplianceUsecase {
	return &ComplianceUsecase{
		compliance:  c,
		transcripts: t,
		matcher:     m,
		guard:       g,
		nudger:      n,
		broadcaster: b,
		obligations: domain.DefaultObligations(),
	}
}

// HandleTranscript dipanggil untuk setiap event dari STT.
func (uc *ComplianceUsecase) HandleTranscript(ctx context.Context, sessionID string, ev TranscriptEvent) error {
	// Kalibrasi hanya membantu manusia mengenali label A/B. Ucapannya sengaja
	// tidak masuk database, guardrail, checklist, atau laporan akhir.
	if ev.IsCalibration {
		eventType := "speaker_calibration_partial"
		if ev.IsFinal {
			eventType = "speaker_calibration_utterance"
		}
		uc.broadcaster.Publish(sessionID, map[string]any{
			"type": eventType, "source_speaker": ev.SourceSpeaker, "text": ev.Text,
		})
		return nil
	}

	// Revisi label diarization: perbarui label lama, jangan buat entri baru.
	if ev.IsRevision {
		return uc.handleRevision(ctx, sessionID, ev)
	}
	if !ev.IsFinal {
		uc.broadcaster.Publish(sessionID, map[string]any{
			"type": "partial", "speaker": ev.Speaker, "text": ev.Text,
		})
		return nil
	}

	u := &domain.Utterance{
		ID:            ev.UtteranceID,
		SessionID:     sessionID,
		Speaker:       ev.Speaker,
		SourceSpeaker: ev.SourceSpeaker,
		Text:          ev.Text,
		StartMS:       ev.StartMS,
		EndMS:         ev.EndMS,
		CreatedAt:     time.Now().UTC(),
	}
	if u.ID == "" {
		u.ID = uuid.NewString()
	}
	if err := uc.transcripts.Append(ctx, u); err != nil {
		return err
	}
	uc.broadcaster.Publish(sessionID, map[string]any{
		"type": "utterance", "id": u.ID, "speaker": u.Speaker, "text": u.Text,
	})

	// Butir kewajiban hanya bisa dipenuhi oleh PETUGAS, bukan nasabah.
	if u.Speaker != domain.SpeakerOfficer {
		return nil
	}
	uc.inspectGuardrail(ctx, sessionID, u)
	return uc.evaluateObligations(ctx, sessionID, u)
}

// handleRevision menangani koreksi label pembicara dari AssemblyAI.
//
// Ini bukan sekadar mengganti label di UI. Kalau satu ucapan ternyata
// milik PETUGAS padahal tadi dikira nasabah, ucapan itu belum pernah
// dinilai terhadap checklist — jadi harus dinilai sekarang. Tanpa ini,
// koreksi diarization justru membuat laporan kepatuhan salah.
func (uc *ComplianceUsecase) handleRevision(ctx context.Context, sessionID string, ev TranscriptEvent) error {
	if err := uc.transcripts.ReviseSpeaker(ctx, ev.UtteranceID, ev.Speaker); err != nil {
		return err
	}
	uc.broadcaster.Publish(sessionID, map[string]any{
		"type": "speaker_revised", "utterance_id": ev.UtteranceID, "speaker": ev.Speaker,
	})

	if ev.Speaker != domain.SpeakerOfficer {
		return nil
	}
	u, err := uc.transcripts.FindByID(ctx, ev.UtteranceID)
	if err != nil {
		// Revisi bisa menunjuk turn yang belum sempat tersimpan; abaikan.
		return nil
	}
	uc.inspectGuardrail(ctx, sessionID, u)
	return uc.evaluateObligations(ctx, sessionID, u)
}

func (uc *ComplianceUsecase) inspectGuardrail(ctx context.Context, sessionID string, u *domain.Utterance) {
	phrase, severity, found, err := uc.guard.Inspect(ctx, u.Text)
	if err != nil || !found {
		return
	}
	v := &domain.Violation{
		ID:         uuid.NewString(),
		SessionID:  sessionID,
		Phrase:     phrase,
		Severity:   severity,
		EvidenceID: u.ID,
		DetectedAt: time.Now().UTC(),
	}
	_ = uc.compliance.RecordViolation(ctx, v)
	uc.broadcaster.Publish(sessionID, map[string]any{
		"type": "violation", "phrase": phrase, "severity": severity, "evidence_id": u.ID,
	})
	_ = uc.nudger.Whisper(ctx, sessionID, fmt.Sprintf("Hati-hati, hindari frasa %q.", phrase))
}

func (uc *ComplianceUsecase) evaluateObligations(ctx context.Context, sessionID string, u *domain.Utterance) error {
	states, err := uc.compliance.ListStates(ctx, sessionID)
	if err != nil {
		return err
	}
	pending := map[string]bool{}
	for _, st := range states {
		if st.Status == domain.ObligationPending {
			pending[st.Code] = true
		}
	}
	for _, ob := range uc.obligations {
		if !pending[ob.Code] {
			continue
		}
		// Evidence gate menahan false-green dan menghemat panggilan LLM.
		// LLM hanya menilai ucapan yang memiliki bukti minimum sesuai butir.
		if !isEvidenceCandidate(ob.Code, u.Text) {
			continue
		}
		matched, conf, err := uc.matcher.Match(ctx, u.Text, ob)
		if err != nil || !matched || conf < minimumMatchConfidence {
			continue
		}
		if err := uc.compliance.MarkSatisfied(ctx, sessionID, ob.Code, u.ID, conf); err != nil {
			return err
		}
		uc.broadcaster.Publish(sessionID, map[string]any{
			"type": "obligation_satisfied", "code": ob.Code, "confidence": conf, "evidence_id": u.ID,
		})
	}
	return nil
}

// isEvidenceCandidate adalah pagar deterministik sebelum semantic match.
// Ia sengaja konservatif: lebih aman butir tetap pending dan dibisikkan
// daripada laporan memberi tanda hijau pada disclosure yang tidak lengkap.
func isEvidenceCandidate(code, utterance string) bool {
	text := strings.ToLower(strings.TrimSpace(utterance))
	if text == "" {
		return false
	}

	switch code {
	case "IDENTITY":
		return containsAny(text, "nama saya", "perkenalkan", "saya bertugas") &&
			containsAny(text, "bank", "bpr", "koperasi", "finance", "multifinance", "asuransi", "perusahaan", "pt ")
	case "RATE":
		return hasNumber(text) && containsAny(text, "bunga", "suku", "biaya", "persen", "%", "apr")
	case "TENOR":
		return hasNumber(text) &&
			containsAny(text, "tenor", "jangka waktu", "bulan", "tahun") &&
			containsAny(text, "cicilan", "angsuran", "per bulan", "per minggu")
	case "PENALTY":
		return containsAny(text, "denda", "terlambat", "keterlambatan", "penalti", "tunggakan")
	case "RIGHT":
		return containsAny(text, "hak", "boleh", "dapat", "bisa") &&
			containsAny(text, "menolak", "membatalkan", "batalkan", "tidak melanjutkan", "tidak setuju")
	default:
		return false
	}
}

func hasNumber(text string) bool {
	return digitPattern.MatchString(text) || containsAny(text, numberWords...)
}

func containsAny(text string, candidates ...string) bool {
	for _, candidate := range candidates {
		if strings.Contains(text, candidate) {
			return true
		}
	}
	return false
}

// RemindPending membisikkan butir yang masih pending ke earpiece petugas.
// Dipanggil oleh timer, bukan setiap ucapan, supaya tidak berisik.
func (uc *ComplianceUsecase) RemindPending(ctx context.Context, sessionID string) error {
	states, err := uc.compliance.ListStates(ctx, sessionID)
	if err != nil {
		return err
	}
	labels := map[string]string{}
	for _, ob := range uc.obligations {
		labels[ob.Code] = ob.Label
	}
	for _, st := range states {
		if st.Status != domain.ObligationPending {
			continue
		}
		// Bisikkan satu butir saja per pengingat.
		return uc.nudger.Whisper(ctx, sessionID, "Belum disampaikan: "+labels[st.Code])
	}
	return nil
}
