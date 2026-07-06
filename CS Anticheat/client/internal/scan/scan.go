// Package scan съдържа детекционните модули (Windows forensics).
// Този файл е cross-platform — само споделени типове/хелпъри.
package scan

import "github.com/carbonstealth/cs-anticheat/client/internal/model"

// scanner е един детекционен модул.
type scanner struct {
	name string
	fn   func() ([]model.Detection, error)
}

// det е удобен конструктор за находка.
func det(scannerName, category string, sev model.Severity, title, detail, evidence, sigID string) model.Detection {
	return model.Detection{
		Scanner:     scannerName,
		Category:    category,
		Severity:    sev,
		Title:       title,
		Detail:      detail,
		Evidence:    evidence,
		SignatureID: sigID,
	}
}

// sevFromString мапва низ към model.Severity (за сигнатурите).
func sevFromString(s string) model.Severity {
	switch s {
	case "critical":
		return model.SeverityCritical
	case "high":
		return model.SeverityHigh
	case "medium":
		return model.SeverityMedium
	case "low":
		return model.SeverityLow
	default:
		return model.SeverityInfo
	}
}
