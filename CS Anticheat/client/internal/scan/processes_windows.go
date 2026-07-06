//go:build windows

package scan

import (
	"strconv"
	"strings"
	"unsafe"

	"github.com/carbonstealth/cs-anticheat/client/internal/model"
	"github.com/carbonstealth/cs-anticheat/client/internal/signatures"
	"golang.org/x/sys/windows"
)

// scanProcesses изброява текущите процеси и ги сверява със сигнатурите.
func scanProcesses() ([]model.Detection, error) {
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, err
	}
	defer windows.CloseHandle(snap)

	var out []model.Detection
	var e windows.ProcessEntry32
	e.Size = uint32(unsafe.Sizeof(e))

	if err := windows.Process32First(snap, &e); err != nil {
		return nil, err
	}
	for {
		name := strings.ToLower(windows.UTF16ToString(e.ExeFile[:]))
		if name != "" {
			if sig := signatures.FindByName(signatures.KindProcess, name); sig != nil {
				out = append(out, det(
					"processes", "known-cheat", sevFromString(sig.Severity),
					"Открит процес: "+sig.Name,
					name, "pid="+strconv.Itoa(int(e.ProcessID)), sig.ID,
				))
			}
		}
		if err := windows.Process32Next(snap, &e); err != nil {
			break // ERROR_NO_MORE_FILES → край
		}
	}
	return out, nil
}
