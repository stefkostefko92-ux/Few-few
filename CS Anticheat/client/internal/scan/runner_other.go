//go:build !windows

package scan

import "github.com/carbonstealth/cs-anticheat/client/internal/model"

// Run е stub за не-Windows платформи. Скенерът работи само на Windows.
func Run(
	verbose bool,
	onStep func(name string),
	onDone func(ok bool, found int),
	onDet func(model.Detection),
) ([]model.Detection, []model.ScannerRun) {
	_ = verbose
	_ = onStep
	_ = onDone
	_ = onDet
	return nil, nil
}
