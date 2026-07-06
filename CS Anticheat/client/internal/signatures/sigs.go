// Package signatures държи базата от известни cheat индикатори.
// Извлечено от разузнаването (research/01-fivem-cheat-landscape.md).
// Матчването е case-insensitive по substring/точно име според типа.
//
// ВАЖНО: сигнатурите са евристики, не доказателство. Всяка находка се третира
// като хипотеза; крайното решение е на човек (виж GDPR чл. 22 — research/05).
package signatures

import "strings"

// Kind типизира какво описва сигнатурата.
type Kind string

const (
	KindProcess   Kind = "process"    // име на процес/изпълним файл
	KindWindow    Kind = "window"      // заглавие на прозорец
	KindFile      Kind = "file"        // име на файл/артефакт
	KindDriver    Kind = "driver"      // име на (уязвим) драйвер
	KindDMAVendor Kind = "dma-vendor"  // PCI vendor:device на DMA карта
)

// Signature е един индикатор.
type Signature struct {
	ID       string
	Kind     Kind
	Match    string // стойност за сравнение (lowercase)
	Name     string // човешко име на чийта/инструмента
	Severity string // info|low|medium|high|critical (виж model.Severity)
	Note     string
}

// DB е пълната база. Разширявай при ново разузнаване.
var DB = []Signature{
	// ── Известни FiveM cheat менюта / executor-и (process + file) ──
	{"redengine", KindProcess, "redengine", "RedENGINE", "critical", "Платен FiveM Lua executor"},
	{"eulen", KindProcess, "eulen", "Eulen", "critical", "Платен FiveM cheat menu"},
	{"skript", KindProcess, "skript", "Skript.gg", "critical", "Платен FiveM cheat"},
	{"hxcheats", KindProcess, "hx-", "HX / Hydro", "high", "FiveM cheat menu"},
	{"susano", KindProcess, "susano", "Susano", "high", "FiveM cheat menu"},
	{"tzx", KindProcess, "tzx", "TZX", "high", "FiveM cheat"},
	{"d3dmenu", KindProcess, "d3dmenu", "D3D", "high", "FiveM cheat menu"},
	{"cobra", KindProcess, "cobra", "Cobra", "high", "FiveM cheat menu"},
	{"brady", KindProcess, "brady", "Brady", "medium", "FiveM cheat"},
	{"impaulsive", KindProcess, "impaulse", "Impaulsive", "medium", "FiveM cheat"},

	// ── Generic executor / injector инструменти ──
	{"cheatengine", KindProcess, "cheatengine", "Cheat Engine", "high", "Memory editor"},
	{"cheatengine2", KindProcess, "cheat engine", "Cheat Engine", "high", "Memory editor"},
	{"extremeinjector", KindProcess, "extreme injector", "Extreme Injector", "high", "DLL injector"},
	{"xenos", KindProcess, "xenosinjector", "Xenos", "high", "DLL injector"},
	{"processhacker", KindProcess, "processhacker", "Process Hacker", "low", "Може да е легитимен, но чест при чийтъри"},
	{"x64dbg", KindProcess, "x64dbg", "x64dbg", "medium", "Debugger"},
	{"scylla", KindProcess, "scylla", "Scylla", "medium", "Dumper/unpacker"},

	// ── Window titles на cheat overlay-и ──
	{"win-redengine", KindWindow, "redengine", "RedENGINE (window)", "critical", ""},
	{"win-eulen", KindWindow, "eulen", "Eulen (window)", "critical", ""},
	{"win-skript", KindWindow, "skript", "Skript (window)", "high", ""},
	{"win-cheatengine", KindWindow, "cheat engine", "Cheat Engine (window)", "high", ""},

	// ── Уязвими / BYOVD драйвери (kernel cheats ги товарят) ──
	{"drv-iqvw64", KindDriver, "iqvw64e", "Intel iQVW64 (BYOVD)", "high", "Често злоупотребяван уязвим драйвер"},
	{"drv-rtcore64", KindDriver, "rtcore64", "MSI RTCore64 (BYOVD)", "high", "Уязвим драйвер за kernel R/W"},
	{"drv-gdrv", KindDriver, "gdrv", "Gigabyte gdrv (BYOVD)", "high", "Уязвим драйвер"},
	{"drv-winring0", KindDriver, "winring0", "WinRing0 (BYOVD)", "medium", "Уязвим драйвер"},
	{"drv-echo", KindDriver, "echo_driver", "echo_driver.sys", "medium", "Конкурентен AC driver (CVE-2023-38817)"},

	// ── DMA hardware cheat карти (PCI vendor:device, lowercase hex) ──
	{"dma-xilinx", KindDMAVendor, "ven_10ee", "Xilinx (DMA/PCILeech)", "critical", "Типична FPGA DMA карта"},
	{"dma-ftdi-usb", KindDMAVendor, "vid_0403&pid_601", "FTDI FT60x (USB DMA)", "high", "USB DMA мост"},
	{"dma-lambda", KindDMAVendor, "ven_1d6b", "LambdaConcept Screamer", "high", "DMA firmware често спуфва VID"},
}

// FindByName връща сигнатура по substring match за даден Kind.
// value трябва да е предварително lowercase-нат от викащия.
func FindByName(kind Kind, value string) *Signature {
	for i := range DB {
		s := &DB[i]
		if s.Kind != kind {
			continue
		}
		if strings.Contains(value, s.Match) {
			return s
		}
	}
	return nil
}
