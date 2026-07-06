// Package model дефинира споделените структури на доклада от скенера.
// Няма платформено-зависим код тук — компилира се навсякъде.
package model

import "time"

// Severity степенува находката.
type Severity string

const (
	SeverityInfo     Severity = "info"     // информативно, не е нарушение
	SeverityLow      Severity = "low"      // слаб сигнал
	SeverityMedium   Severity = "medium"   // подозрително, изисква преглед
	SeverityHigh     Severity = "high"     // силна следа от чийт
	SeverityCritical Severity = "critical" // почти сигурно нарушение
)

// Rank връща числов ранг за сортиране/агрегиране (по-високо = по-тежко).
func (s Severity) Rank() int {
	switch s {
	case SeverityCritical:
		return 4
	case SeverityHigh:
		return 3
	case SeverityMedium:
		return 2
	case SeverityLow:
		return 1
	default:
		return 0
	}
}

// Detection е една находка от даден скенер.
type Detection struct {
	Scanner  string   `json:"scanner"`            // кой модул я е намерил (напр. "processes")
	Category string   `json:"category"`           // тип (напр. "known-cheat", "dma-device")
	Severity Severity `json:"severity"`           // тежест
	Title    string   `json:"title"`              // кратко заглавие
	Detail   string   `json:"detail"`             // детайли (име на процес/файл/ключ)
	Evidence string   `json:"evidence,omitempty"` // суров артефакт (път, hash, стойност)
	// SignatureID сочи към сигнатурата, ако находката е match по база.
	SignatureID string `json:"signatureId,omitempty"`
}

// ScannerRun описва изпълнението на един модул (за прозрачност/диагностика).
type ScannerRun struct {
	Name       string        `json:"name"`
	OK         bool          `json:"ok"`
	Err        string        `json:"err,omitempty"`
	Detections int           `json:"detections"`
	Duration   time.Duration `json:"durationNs"`
}

// System е неинвазивна информация за средата (за контекст в панела).
type System struct {
	Hostname     string `json:"hostname"`
	OS           string `json:"os"`
	OSVersion    string `json:"osVersion"`
	Arch         string `json:"arch"`
	CPU          string `json:"cpu"`
	Username     string `json:"username"` // локално потребителско име (не е ел. поща)
	Elevated     bool   `json:"elevated"` // пуснато ли е като администратор
	TestSigning  bool   `json:"testSigning"`
	SecureBoot   *bool  `json:"secureBoot,omitempty"`
	KernelDbg    bool   `json:"kernelDebug"`
	VirtualMach  bool   `json:"virtualMachine"`
	ScannerBuild string `json:"scannerBuild"`
}

// Report е пълният резултат от едно сканиране.
type Report struct {
	SchemaVersion string       `json:"schemaVersion"`
	ReportID      string       `json:"reportId"`   // локално генериран UUID-подобен
	CreatedAt     time.Time    `json:"createdAt"`  // UTC
	ServerRef     string       `json:"serverRef"`  // към кой FiveM сървър/screenshare (по избор)
	HWID          HWID         `json:"hwid"`       // хеширан fingerprint
	System        System       `json:"system"`     // контекст
	Detections    []Detection  `json:"detections"` // всички находки
	Runs          []ScannerRun `json:"runs"`       // прозрачност кои модули са минали
	Score         int          `json:"score"`      // агрегиран риск 0..100
	Verdict       string       `json:"verdict"`    // clean | suspicious | detected
	Notice        string       `json:"notice"`     // GDPR connect-notice текст (какво е събрано)
}

// HWID е хешираният хардуерен отпечатък (никакви сурови серийни номера).
type HWID struct {
	// Composite е основният стабилен идентификатор (salted SHA-256, hex).
	Composite string `json:"composite"`
	// Components са отделни хешове (за корелация, без да разкриват суровата стойност).
	Components map[string]string `json:"components"`
	Algo       string            `json:"algo"` // напр. "sha256-salted"
}
