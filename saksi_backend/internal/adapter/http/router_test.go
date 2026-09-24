package http

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSPAMenyajikanAssetDanFallbackRoute(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<h1>Bisik</h1>"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "app.js"), []byte("console.log('bisik')"), 0o600); err != nil {
		t.Fatal(err)
	}

	router := NewRouter(&Handler{}, http.NotFoundHandler(), "", dir)

	for _, path := range []string{"/", "/officer", "/supervisor/sesi-1"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		res := httptest.NewRecorder()
		router.ServeHTTP(res, req)
		if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), "Bisik") {
			t.Fatalf("GET %s = %d %q, mau index SPA", path, res.Code, res.Body.String())
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/app.js", nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), "console.log") {
		t.Fatalf("asset = %d %q", res.Code, res.Body.String())
	}
}

func TestSPATidakMenutupiAPIYangTidakDikenal(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("Bisik"), 0o600); err != nil {
		t.Fatal(err)
	}
	router := NewRouter(&Handler{}, http.NotFoundHandler(), "", dir)

	req := httptest.NewRequest(http.MethodGet, "/api/tidak-ada", nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("status = %d, mau 404", res.Code)
	}
}
