//go:build windows

package scan

import (
	"time"

	"github.com/carbonstealth/cs-anticheat/client/internal/model"
)

// registry на всички активни модули (ред = ред на изпълнение).
func scanners() []scanner {
	return []scanner{
		{"processes", scanProcesses},
		{"window-titles", scanWindowTitles},
		{"prefetch", scanPrefetch},
		{"registry-exec", scanRegistryExecution},
		{"drivers", scanDrivers},
		{"dma-devices", scanDMADevices},
		{"filesystem", scanFilesystem},
	}
}

// Run изпълнява всички модули, докладвайки прогрес през callback-и.
func Run(
	verbose bool,
	onStep func(name string),
	onDone func(ok bool, found int),
	onDet func(model.Detection),
) ([]model.Detection, []model.ScannerRun) {
	var all []model.Detection
	var runs []model.ScannerRun

	for _, s := range scanners() {
		if onStep != nil {
			onStep(s.name)
		}
		start := time.Now()
		dets, err := s.fn()
		dur := time.Since(start)

		run := model.ScannerRun{Name: s.name, OK: err == nil, Detections: len(dets), Duration: dur}
		if err != nil {
			run.Err = err.Error()
		}
		runs = append(runs, run)

		if onDone != nil {
			onDone(err == nil, len(dets))
		}
		for _, d := range dets {
			all = append(all, d)
			if verbose && onDet != nil {
				onDet(d)
			}
		}
	}
	return all, runs
}
