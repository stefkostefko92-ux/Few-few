//go:build windows

package scan

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/carbonstealth/cs-anticheat/client/internal/model"
	"github.com/carbonstealth/cs-anticheat/client/internal/signatures"
)

// scanFilesystem прави плитко сканиране на типичните места, където cheat
// loader-и/DLL-и се разархивират, за известни имена.
func scanFilesystem() ([]model.Detection, error) {
	var dirs []string
	add := func(p string) {
		if p != "" {
			dirs = append(dirs, p)
		}
	}
	add(os.Getenv("TEMP"))
	add(os.Getenv("TMP"))
	if up := os.Getenv("USERPROFILE"); up != "" {
		add(filepath.Join(up, "Downloads"))
		add(filepath.Join(up, "Desktop"))
	}
	add(os.Getenv("APPDATA"))

	seen := map[string]bool{}
	var out []model.Detection

	for _, dir := range dirs {
		if seen[dir] {
			continue
		}
		seen[dir] = true
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			name := strings.ToLower(e.Name())
			if !strings.HasSuffix(name, ".exe") && !strings.HasSuffix(name, ".dll") &&
				!strings.HasSuffix(name, ".sys") && !strings.HasSuffix(name, ".zip") {
				continue
			}
			sig := signatures.FindByName(signatures.KindProcess, name)
			if sig == nil {
				sig = signatures.FindByName(signatures.KindFile, name)
			}
			if sig != nil {
				out = append(out, det(
					"filesystem", "cheat-artifact", sevFromString(sig.Severity),
					"Файл на чийт: "+sig.Name, e.Name(), filepath.Join(dir, e.Name()), sig.ID,
				))
			}
		}
	}
	return out, nil
}
