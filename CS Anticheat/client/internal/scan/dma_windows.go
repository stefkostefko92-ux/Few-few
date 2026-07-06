//go:build windows

package scan

import (
	"strings"

	"github.com/carbonstealth/cs-anticheat/client/internal/model"
	"github.com/carbonstealth/cs-anticheat/client/internal/signatures"
	"golang.org/x/sys/windows/registry"
)

// scanDMADevices търси хардуерни DMA cheat устройства (FPGA карти като PCILeech/
// Screamer) чрез PCI/USB enumeration. Това е единствената локална следа от
// иначе „невидимите" hardware чийтове (research/01 — Клас B).
func scanDMADevices() ([]model.Detection, error) {
	var out []model.Detection
	roots := []string{
		`SYSTEM\CurrentControlSet\Enum\PCI`,
		`SYSTEM\CurrentControlSet\Enum\USB`,
	}
	for _, root := range roots {
		for _, dev := range enumSubKeys(registry.LOCAL_MACHINE, root) {
			id := strings.ToLower(dev)
			if sig := signatures.FindByName(signatures.KindDMAVendor, id); sig != nil {
				out = append(out, det(
					"dma-devices", "dma-hardware", sevFromString(sig.Severity),
					"Възможно DMA устройство: "+sig.Name, dev, root+`\`+dev, sig.ID,
				))
			}
		}
	}
	return out, nil
}
