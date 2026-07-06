//go:build windows

package scan

import (
	"strings"

	"github.com/carbonstealth/cs-anticheat/client/internal/model"
	"github.com/carbonstealth/cs-anticheat/client/internal/signatures"
	"golang.org/x/sys/windows/registry"
)

// scanDrivers изброява регистрираните драйвери (Services, Type=1 kernel) и
// търси известни уязвими/BYOVD драйвери, които kernel чийтовете товарят.
func scanDrivers() ([]model.Detection, error) {
	const base = `SYSTEM\CurrentControlSet\Services`
	var out []model.Detection

	for _, name := range enumSubKeys(registry.LOCAL_MACHINE, base) {
		k, err := registry.OpenKey(registry.LOCAL_MACHINE, base+`\`+name,
			registry.QUERY_VALUE|registry.WOW64_64KEY)
		if err != nil {
			continue
		}
		typ, _, _ := k.GetIntegerValue("Type")
		img, _, _ := k.GetStringValue("ImagePath")
		k.Close()

		// Type 1 = kernel driver, 2 = file system driver.
		if typ != 1 && typ != 2 {
			continue
		}
		hay := strings.ToLower(name + " " + img)
		if sig := signatures.FindByName(signatures.KindDriver, hay); sig != nil {
			out = append(out, det(
				"drivers", "vulnerable-driver", sevFromString(sig.Severity),
				"Уязвим/BYOVD драйвер: "+sig.Name, name, img, sig.ID,
			))
		}
	}
	return out, nil
}
