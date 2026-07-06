//go:build windows

package scan

import (
	"strings"
	"unsafe"

	"github.com/carbonstealth/cs-anticheat/client/internal/model"
	"github.com/carbonstealth/cs-anticheat/client/internal/signatures"
	"golang.org/x/sys/windows"
)

// scanWindowTitles изброява видимите прозорци и сверява заглавията им.
// Cheat overlay-ите често имат разпознаваемо заглавие.
func scanWindowTitles() ([]model.Detection, error) {
	user32 := windows.NewLazySystemDLL("user32.dll")
	enumWindows := user32.NewProc("EnumWindows")
	getText := user32.NewProc("GetWindowTextW")
	isVisible := user32.NewProc("IsWindowVisible")

	var out []model.Detection
	buf := make([]uint16, 512)

	cb := windows.NewCallback(func(hwnd uintptr, _ uintptr) uintptr {
		if vis, _, _ := isVisible.Call(hwnd); vis == 0 {
			return 1 // продължи
		}
		n, _, _ := getText.Call(hwnd, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
		if n == 0 {
			return 1
		}
		title := strings.ToLower(windows.UTF16ToString(buf[:n]))
		if sig := signatures.FindByName(signatures.KindWindow, title); sig != nil {
			out = append(out, det(
				"window-titles", "known-cheat", sevFromString(sig.Severity),
				"Прозорец на чийт: "+sig.Name, title, "", sig.ID,
			))
		}
		return 1
	})

	enumWindows.Call(cb, 0)
	return out, nil
}
