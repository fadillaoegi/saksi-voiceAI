package domain

import "errors"

var (
	ErrNotFound      = errors.New("resource tidak ditemukan")
	ErrSessionEnded  = errors.New("sesi sudah berakhir")
	ErrInvalidInput  = errors.New("input tidak valid")
	ErrUpstreamAudio = errors.New("upstream audio gagal")
)
