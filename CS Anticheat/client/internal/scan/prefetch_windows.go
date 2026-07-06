//go:build windows

package scan

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/carbonstealth/cs-anticheat/client/internal/model"
	"github.com/carbonstealth/cs-anticheat/client/internal/signatures"
)

// scanPrefetch чете имената на .pf файловете в Prefetch. Всеки .pf доказва, че
// дадена програма Е БИЛА пускана — дори .exe-то вече да е изтрито.
// Форматът е NAME.EXE-<hash>.pf; парсваме само името (без съдържанието).
func scanPrefetch() ([]model.Detection, error) {
	dir := filepath.Join(os.Getenv("SystemRoot"), "Prefetch")
	if dir == "\\Prefetch" || dir == "" {
		dir = `C:\Windows\Prefetch`
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		// Prefetch може да е изключен/недостъпен без администраторски права.
		return nil, err
	}

	var out []model.Detection
	for _, e := range entries {
		fn := strings.ToLower(e.Name())
		if !strings.HasSuffix(fn, ".pf") {
			continue
		}
		prog := fn
		if idx := strings.LastIndex(fn, "-"); idx > 0 {
			prog = fn[:idx] // NAME.EXE
		}
		if sig := signatures.FindByName(signatures.KindProcess, prog); sig != nil {
			out = append(out, det(
				"prefetch", "execution-evidence", sevFromString(sig.Severity),
				"Следа от изпълнение: "+sig.Name,
				prog, filepath.Join(dir, e.Name()), sig.ID,
			))
		}
	}
	return out, nil
}
