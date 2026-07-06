//go:build !windows

package scan

import (
	"os"
	"runtime"

	"github.com/carbonstealth/cs-anticheat/client/internal/model"
)

// System е stub за не-Windows (скенерът работи само на Windows).
func System(build string) model.System {
	host, _ := os.Hostname()
	return model.System{
		Hostname:     host,
		OS:           runtime.GOOS,
		Arch:         runtime.GOARCH,
		ScannerBuild: build,
	}
}
