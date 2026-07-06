//go:build windows

package scan

import (
	"os"
	"runtime"
	"strings"
	"unsafe"

	"github.com/carbonstealth/cs-anticheat/client/internal/model"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

func reg(path, name string) string {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, path, registry.QUERY_VALUE|registry.WOW64_64KEY)
	if err != nil {
		return ""
	}
	defer k.Close()
	v, _, _ := k.GetStringValue(name)
	return v
}

// codeIntegrity връща (enabled, testSigning) чрез NtQuerySystemInformation.
func codeIntegrity() (bool, bool) {
	var info struct {
		Length  uint32
		Options uint32
	}
	info.Length = uint32(unsafe.Sizeof(info))
	ntdll := windows.NewLazySystemDLL("ntdll.dll")
	proc := ntdll.NewProc("NtQuerySystemInformation")
	const systemCodeIntegrityInformation = 103
	proc.Call(systemCodeIntegrityInformation,
		uintptr(unsafe.Pointer(&info)), uintptr(info.Length), 0)
	const optEnabled = 0x01
	const optTestSign = 0x02
	return info.Options&optEnabled != 0, info.Options&optTestSign != 0
}

// kernelDebugger връща дали е активен kernel debugger.
func kernelDebugger() bool {
	var info struct {
		DebuggerEnabled    byte
		DebuggerNotPresent byte
	}
	ntdll := windows.NewLazySystemDLL("ntdll.dll")
	proc := ntdll.NewProc("NtQuerySystemInformation")
	const systemKernelDebuggerInformation = 35
	proc.Call(systemKernelDebuggerInformation,
		uintptr(unsafe.Pointer(&info)), uintptr(unsafe.Sizeof(info)), 0)
	return info.DebuggerEnabled != 0 && info.DebuggerNotPresent == 0
}

func isElevated() bool {
	tok := windows.GetCurrentProcessToken()
	return tok.IsElevated()
}

func isVirtualMachine() bool {
	man := strings.ToLower(reg(`HARDWARE\DESCRIPTION\System\BIOS`, "SystemManufacturer") + " " +
		reg(`HARDWARE\DESCRIPTION\System\BIOS`, "SystemProductName"))
	for _, marker := range []string{"vmware", "virtualbox", "vbox", "qemu", "kvm", "hyper-v", "xen"} {
		if strings.Contains(man, marker) {
			return true
		}
	}
	return false
}

// System събира неинвазивен контекст за доклада.
func System(build string) model.System {
	host, _ := os.Hostname()
	_, testSign := codeIntegrity()

	product := reg(`SOFTWARE\Microsoft\Windows NT\CurrentVersion`, "ProductName")
	display := reg(`SOFTWARE\Microsoft\Windows NT\CurrentVersion`, "DisplayVersion")
	buildNum := reg(`SOFTWARE\Microsoft\Windows NT\CurrentVersion`, "CurrentBuild")
	osVer := strings.TrimSpace(display + " (build " + buildNum + ")")

	var secureBoot *bool
	if v, _, err := readDword(`SYSTEM\CurrentControlSet\Control\SecureBoot\State`, "UEFISecureBootEnabled"); err == nil {
		b := v == 1
		secureBoot = &b
	}

	return model.System{
		Hostname:     host,
		OS:           strings.TrimSpace(product),
		OSVersion:    osVer,
		Arch:         runtime.GOARCH,
		CPU:          reg(`HARDWARE\DESCRIPTION\System\CentralProcessor\0`, "ProcessorNameString"),
		Username:     os.Getenv("USERNAME"),
		Elevated:     isElevated(),
		TestSigning:  testSign,
		SecureBoot:   secureBoot,
		KernelDbg:    kernelDebugger(),
		VirtualMach:  isVirtualMachine(),
		ScannerBuild: build,
	}
}

func readDword(path, name string) (uint64, uint32, error) {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, path, registry.QUERY_VALUE|registry.WOW64_64KEY)
	if err != nil {
		return 0, 0, err
	}
	defer k.Close()
	return k.GetIntegerValue(name)
}
