package http

import "github.com/saksi/saksi_backend/internal/domain"

type StartSessionRequest struct {
	OfficerID string `json:"officer_id"`
	ProductID string `json:"product_id"`
}

type SessionResponse struct {
	ID        string `json:"id"`
	OfficerID string `json:"officer_id"`
	ProductID string `json:"product_id"`
	Status    string `json:"status"`
	StartedAt string `json:"started_at"`
	Score     int    `json:"score"`
}

type ObligationResponse struct {
	Code       string  `json:"code"`
	Label      string  `json:"label"`
	Status     string  `json:"status"`
	Confidence float64 `json:"confidence"`
	EvidenceID string  `json:"evidence_id,omitempty"`
}

type ReportResponse struct {
	Session     SessionResponse      `json:"session"`
	Obligations []ObligationResponse `json:"obligations"`
	Violations  []ViolationResponse  `json:"violations"`
	Transcript  []UtteranceResponse  `json:"transcript"`
}

type ViolationResponse struct {
	Phrase     string `json:"phrase"`
	Severity   string `json:"severity"`
	EvidenceID string `json:"evidence_id"`
	DetectedAt string `json:"detected_at"`
}

type UtteranceResponse struct {
	ID            string `json:"id"`
	Speaker       string `json:"speaker"`
	SourceSpeaker string `json:"source_speaker"`
	Text          string `json:"text"`
	StartMS       int    `json:"start_ms"`
	Revised       bool   `json:"revised"`
}

func toSessionResponse(s *domain.Session) SessionResponse {
	return SessionResponse{
		ID:        s.ID,
		OfficerID: s.OfficerID,
		ProductID: s.ProductID,
		Status:    string(s.Status),
		StartedAt: s.StartedAt.Format("2006-01-02T15:04:05Z07:00"),
		Score:     s.Score,
	}
}
