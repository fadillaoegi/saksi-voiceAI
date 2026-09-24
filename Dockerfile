FROM golang:1.26-alpine AS backend
WORKDIR /src
COPY saksi_backend/go.mod saksi_backend/go.sum ./
RUN go mod download
COPY saksi_backend/ ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/bisik ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=backend /out/bisik /app/bisik
# Frontend dibuild lebih dulu memakai Node host (`make deploy-build`).
# Hasil build sengaja masuk repository agar builder Render tidak memerlukan
# image/runtime Node tambahan.
COPY saksi_frontend/dist /app/public
ENV STATIC_DIR=/app/public
EXPOSE 8080
ENTRYPOINT ["/app/bisik"]
