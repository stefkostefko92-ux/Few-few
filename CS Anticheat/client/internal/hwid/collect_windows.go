//go:build windows

package hwid

import (
	"os"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

// regString чете REG_SZ стойност от 64-битовия изглед на регистъра.
func regString(root registry.Key, path, name string) string {
	k, err := registry.OpenKey(root, path, registry.QUERY_VALUE|registry.WOW64_64KEY)
	if err != nil {
		return ""
	}
	defer k.Close()
	v, _, err := k.GetStringValue(name)
	if err != nil {
		return ""
	}
	return v
}

// volumeSerial връща серийния номер на системния дял (C:) като hex.
func volumeSerial() string {
	root, err := syscall.UTF16PtrFromString(`C:\`)
	if err != nil {
		return ""
	}
	var serial uint32
	kernel32 := windows.NewLazySystemDLL("kernel32.dll")
	proc := kernel32.NewProc("GetVolumeInformationW")
	// GetVolumeInformationW(rootPath, volName, volNameSize, serial, maxCompLen, flags, fsName, fsNameSize)
	ret, _, _ := proc.Call(
		uintptr(unsafe.Pointer(root)),
		0, 0,
		uintptr(unsafe.Pointer(&serial)),
		0, 0, 0, 0,
	)
	if ret == 0 {
		return ""
	}
	// hex без пакет fmt, за да е леко
	const hexdigits = "0123456789abcdef"
	buf := make([]byte, 8)
	for i := 7; i >= 0; i-- {
		buf[i] = hexdigits[serial&0xf]
		serial >>= 4
	}
	return string(buf)
}

// collect събира суровите хардуерни идентификатори (само Windows).
func collect() raw {
	host, _ := os.Hostname()
	return raw{
		MachineGUID:  regString(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Cryptography`, "MachineGuid"),
		VolumeSerial: volumeSerial(),
		CPU:          regString(registry.LOCAL_MACHINE, `HARDWARE\DESCRIPTION\System\CentralProcessor\0`, "ProcessorNameString"),
		Baseboard: regString(registry.LOCAL_MACHINE, `HARDWARE\DESCRIPTION\System\BIOS`, "BaseBoardManufacturer") + " " +
			regString(registry.LOCAL_MACHINE, `HARDWARE\DESCRIPTION\System\BIOS`, "BaseBoardProduct"),
		ComputerName: host,
	}
}
