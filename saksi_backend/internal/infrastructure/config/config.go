package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port                         string
	DatabaseURL                  string
	AssemblyAIKey                string
	AssemblyAIWSURL              string
	AssemblyAISpeechModel        string
	AssemblyAIRevisionIntervalMS int
	LLMModel                     string
	NudgeIntervalS               int
	AllowedOrigins               string
	StaticDir                    string
}

func Load() Config {
	return Config{
		Port:                         env("PORT", "8080"),
		DatabaseURL:                  env("DATABASE_URL", "postgres://saksi:saksi@localhost:5432/saksi?sslmode=disable"),
		AssemblyAIKey:                env("ASSEMBLYAI_API_KEY", ""),
		AssemblyAIWSURL:              env("ASSEMBLYAI_WS_URL", "wss://streaming.assemblyai.com/v3/ws"),
		AssemblyAISpeechModel:        env("ASSEMBLYAI_SPEECH_MODEL", "whisper-rt"),
		AssemblyAIRevisionIntervalMS: envInt("ASSEMBLYAI_SPEAKER_REVISION_INTERVAL_MS", 120000),
		LLMModel:                     env("LLM_MODEL", "claude-sonnet-4-6"),
		NudgeIntervalS:               envInt("NUDGE_INTERVAL_SECONDS", 45),
		AllowedOrigins:               env("ALLOWED_ORIGINS", "http://localhost:5173"),
		StaticDir:                    env("STATIC_DIR", ""),
	}
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) int {
	if v := os.Getenv(k); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
