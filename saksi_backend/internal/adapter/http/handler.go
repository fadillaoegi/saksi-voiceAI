package http

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/saksi/saksi_backend/internal/domain"
	"github.com/saksi/saksi_backend/internal/usecase"
)

type Handler struct {
	sessions    *usecase.SessionUsecase
	sessionRepo domain.SessionRepository
	compliance  domain.ComplianceRepository
	transcripts domain.TranscriptRepository
	log         *slog.Logger
}

func NewHandler(
	s *usecase.SessionUsecase,
	sr domain.SessionRepository,
	c domain.ComplianceRepository,
	t domain.TranscriptRepository,
	log *slog.Logger,
) *Handler {
	return &Handler{sessions: s, sessionRepo: sr, compliance: c, transcripts: t, log: log}
}

func (h *Handler) Health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "saksi_backend"})
}

func (h *Handler) Obligations(w http.ResponseWriter, _ *http.Request) {
	obs := domain.DefaultObligations()
	out := make([]ObligationResponse, 0, len(obs))
	for _, ob := range obs {
		out = append(out, ObligationResponse{Code: ob.Code, Label: ob.Label, Status: string(domain.ObligationPending)})
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) StartSession(w http.ResponseWriter, r *http.Request) {
	var req StartSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, domain.ErrInvalidInput)
		return
	}
	s, err := h.sessions.Start(r.Context(), req.OfficerID, req.ProductID)
	if err != nil {
		writeError(w, statusFor(err), err)
		return
	}
	writeJSON(w, http.StatusCreated, toSessionResponse(s))
}

func (h *Handler) EndSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s, err := h.sessions.End(r.Context(), id)
	if err != nil {
		writeError(w, statusFor(err), err)
		return
	}
	writeJSON(w, http.StatusOK, toSessionResponse(s))
}

// Report adalah laporan kepatuhan berbukti: tiap butir menunjuk
// utterance mana yang memenuhinya.
func (h *Handler) Report(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := r.PathValue("id")

	s, err := h.sessionRepo.FindByID(ctx, id)
	if err != nil {
		writeError(w, statusFor(err), err)
		return
	}
	states, err := h.compliance.ListStates(ctx, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	violations, err := h.compliance.ListViolations(ctx, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	utterances, err := h.transcripts.ListBySession(ctx, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	labels := map[string]string{}
	for _, ob := range domain.DefaultObligations() {
		labels[ob.Code] = ob.Label
	}

	resp := ReportResponse{Session: toSessionResponse(s)}
	for _, st := range states {
		resp.Obligations = append(resp.Obligations, ObligationResponse{
			Code: st.Code, Label: labels[st.Code], Status: string(st.Status),
			Confidence: st.Confidence, EvidenceID: st.EvidenceID,
		})
	}
	for _, v := range violations {
		resp.Violations = append(resp.Violations, ViolationResponse{
			Phrase: v.Phrase, Severity: v.Severity, EvidenceID: v.EvidenceID,
			DetectedAt: v.DetectedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}
	for _, u := range utterances {
		resp.Transcript = append(resp.Transcript, UtteranceResponse{
			ID: u.ID, Speaker: string(u.Speaker), SourceSpeaker: u.SourceSpeaker,
			Text: u.Text, StartMS: u.StartMS, Revised: u.Revised,
		})
	}
	writeJSON(w, http.StatusOK, resp)
}

func statusFor(err error) int {
	switch {
	case errors.Is(err, domain.ErrNotFound):
		return http.StatusNotFound
	case errors.Is(err, domain.ErrInvalidInput):
		return http.StatusBadRequest
	case errors.Is(err, domain.ErrSessionEnded):
		return http.StatusConflict
	default:
		return http.StatusInternalServerError
	}
}

func writeJSON(w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, code int, err error) {
	writeJSON(w, code, map[string]string{"error": err.Error()})
}
