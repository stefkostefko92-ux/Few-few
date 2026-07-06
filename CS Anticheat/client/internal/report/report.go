// Package report сглобява, оценява и доставя доклада.
package report

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/carbonstealth/cs-anticheat/client/internal/model"
)

const schemaVersion = "1.0"

// weights дава принос към риск-скора по тежест.
var weights = map[model.Severity]int{
	model.SeverityCritical: 60,
	model.SeverityHigh:     35,
	model.SeverityMedium:   15,
	model.SeverityLow:      5,
	model.SeverityInfo:     0,
}

func newID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return "csac_" + hex.EncodeToString(b)
}

// Build сглобява доклада и изчислява score + verdict.
func Build(sys model.System, hw model.HWID, dets []model.Detection, runs []model.ScannerRun, serverRef, notice string) *model.Report {
	score := 0
	for _, d := range dets {
		score += weights[d.Severity]
	}
	if score > 100 {
		score = 100
	}

	verdict := "clean"
	switch {
	case hasSeverity(dets, model.SeverityCritical), hasSeverity(dets, model.SeverityHigh):
		verdict = "detected"
	case hasSeverity(dets, model.SeverityMedium):
		verdict = "suspicious"
	}

	return &model.Report{
		SchemaVersion: schemaVersion,
		ReportID:      newID(),
		CreatedAt:     time.Now().UTC(),
		ServerRef:     serverRef,
		HWID:          hw,
		System:        sys,
		Detections:    dets,
		Runs:          runs,
		Score:         score,
		Verdict:       verdict,
		Notice:        notice,
	}
}

func hasSeverity(dets []model.Detection, s model.Severity) bool {
	for _, d := range dets {
		if d.Severity == s {
			return true
		}
	}
	return false
}

// SaveLocal записва доклада като JSON файл (за offline screenshare преглед).
func SaveLocal(r *model.Report, path string) error {
	b, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}

// Submit праща доклада към backend-а с HMAC подпис (X-CSAC-Signature).
// secret не бива да е в repo — подава се през флаг/env на deployment-а.
func Submit(r *model.Report, endpoint, secret string, timeout time.Duration) (string, error) {
	body, err := json.Marshal(r)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "CSAC-Scanner/"+r.System.ScannerBuild)
	if secret != "" {
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write(body)
		req.Header.Set("X-CSAC-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))
	}

	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("backend върна %d: %s", resp.StatusCode, string(rb))
	}
	return string(rb), nil
}
