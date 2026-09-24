package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	adapterhttp "github.com/saksi/saksi_backend/internal/adapter/http"
	"github.com/saksi/saksi_backend/internal/adapter/repository/postgres"
	"github.com/saksi/saksi_backend/internal/adapter/ws"
	"github.com/saksi/saksi_backend/internal/infrastructure/assemblyai"
	"github.com/saksi/saksi_backend/internal/infrastructure/config"
	"github.com/saksi/saksi_backend/internal/infrastructure/db"
	"github.com/saksi/saksi_backend/internal/infrastructure/logger"
	"github.com/saksi/saksi_backend/internal/usecase"
)

func main() {
	log := logger.New()
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("koneksi database gagal", "err", err)
		os.Exit(1)
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		log.Error("migrasi database gagal", "err", err)
		os.Exit(1)
	}

	// --- Wiring: infrastructure -> usecase -> adapter ---
	sessionRepo := postgres.NewSessionRepo(pool)
	transcriptRepo := postgres.NewTranscriptRepo(pool)
	complianceRepo := postgres.NewComplianceRepo(pool)

	stt := assemblyai.NewStreamingSTT(
		cfg.AssemblyAIKey,
		cfg.AssemblyAIWSURL,
		cfg.AssemblyAISpeechModel,
		cfg.AssemblyAIRevisionIntervalMS,
		log,
	)
	matcher := assemblyai.NewLLMMatcher(cfg.AssemblyAIKey, cfg.LLMModel)
	guard := assemblyai.NewPhraseGuard()

	hub := ws.NewHub(log)
	nudger := ws.NewHubNudger(hub)

	sessionUC := usecase.NewSessionUsecase(sessionRepo, complianceRepo, stt)
	complianceUC := usecase.NewComplianceUsecase(complianceRepo, transcriptRepo, matcher, guard, nudger, hub)

	wsHandler := ws.NewHandler(hub, stt, complianceUC, cfg.AllowedOrigins,
		time.Duration(cfg.NudgeIntervalS)*time.Second, log)
	httpHandler := adapterhttp.NewHandler(sessionUC, sessionRepo, complianceRepo, transcriptRepo, log)
	router := adapterhttp.NewRouter(httpHandler, wsHandler, cfg.AllowedOrigins, cfg.StaticDir)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Info("saksi_backend jalan", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("server berhenti", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	log.Info("shutdown...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
