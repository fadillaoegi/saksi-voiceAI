package http

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func NewRouter(h *Handler, wsHandler http.Handler, allowedOrigins, staticDir string) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", h.Health)
	mux.HandleFunc("GET /api/obligations", h.Obligations)
	mux.HandleFunc("POST /api/sessions", h.StartSession)
	mux.HandleFunc("POST /api/sessions/{id}/end", h.EndSession)
	mux.HandleFunc("GET /api/sessions/{id}/report", h.Report)
	mux.Handle("GET /ws", wsHandler)
	if staticDir != "" {
		mux.Handle("/", spa(staticDir))
	}

	return cors(mux, allowedOrigins)
}

// spa menyajikan hasil build React dari container yang sama. Rute frontend
// seperti /officer harus fallback ke index.html, sedangkan API yang tidak
// dikenal tetap mengembalikan 404 dan tidak menyamar sebagai HTML.
func spa(staticDir string) http.Handler {
	files := http.FileServer(http.Dir(staticDir))
	index := filepath.Join(staticDir, "index.html")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.NotFound(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/ws" {
			http.NotFound(w, r)
			return
		}

		rel := strings.TrimPrefix(filepath.Clean(r.URL.Path), string(filepath.Separator))
		candidate := filepath.Join(staticDir, rel)
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			files.ServeHTTP(w, r)
			return
		}
		http.ServeFile(w, r, index)
	})
}

func cors(next http.Handler, allowedOrigins string) http.Handler {
	origins := strings.Split(allowedOrigins, ",")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		for _, o := range origins {
			if strings.TrimSpace(o) == origin {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				break
			}
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
