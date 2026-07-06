// Package ui рисува конзолния интерфейс на скенера (banner, секции, verdict).
// Cross-platform — само пише на stdout.
package ui

import (
	"fmt"
	"os"
	"strings"

	"github.com/carbonstealth/cs-anticheat/client/internal/model"
)

const banner = `
   ██████╗███████╗     █████╗  ██████╗
  ██╔════╝██╔════╝   ██╔══██╗██╔════╝
  ██║     ███████╗   ███████║██║
  ██║     ╚════██║   ██╔══██║██║
  ╚██████╗███████║   ██║  ██║╚██████╗
   ╚═════╝╚══════╝   ╚═╝  ╚═╝ ╚═════╝
  CS Anticheat · Screenshare Scanner`

// Banner печата заглавието.
func Banner(build string) {
	fmt.Println(banner)
	fmt.Printf("  build %s · carbonstealth.eu\n", build)
	fmt.Println(strings.Repeat("─", 52))
}

// Notice печата GDPR известието какво ще се събере.
func Notice(text string) {
	fmt.Println("  ⓘ " + text)
	fmt.Println(strings.Repeat("─", 52))
}

// Step отбелязва начало на модул.
func Step(name string) {
	fmt.Printf("  [ .. ] %-22s", name)
}

// StepDone затваря реда на модул с резултат.
func StepDone(ok bool, found int) {
	if !ok {
		fmt.Printf("\r  [ !! ] %-22s грешка\n", "")
		return
	}
	mark := "чисто"
	if found > 0 {
		mark = fmt.Sprintf("%d находки", found)
	}
	fmt.Printf("\r  [ ok ] %-22s %s\n", "", mark)
}

// Detection печата една находка (при verbose режим).
func Detection(d model.Detection) {
	fmt.Printf("        └─ [%s] %s — %s\n", strings.ToUpper(string(d.Severity)), d.Title, d.Detail)
}

// Verdict печата финалната присъда и резюме.
func Verdict(r *model.Report) {
	fmt.Println(strings.Repeat("─", 52))
	fmt.Printf("  Присъда: %s   ·   риск %d/100\n", strings.ToUpper(r.Verdict), r.Score)
	if len(r.Detections) == 0 {
		fmt.Println("  Няма открити следи от известни чийтове.")
	} else {
		counts := map[model.Severity]int{}
		for _, d := range r.Detections {
			counts[d.Severity]++
		}
		fmt.Printf("  Находки: critical=%d high=%d medium=%d low=%d\n",
			counts[model.SeverityCritical], counts[model.SeverityHigh],
			counts[model.SeverityMedium], counts[model.SeverityLow])
	}
	fmt.Printf("  Доклад ID: %s\n", r.ReportID)
	fmt.Println(strings.Repeat("─", 52))
}

// Line печата обикновен ред.
func Line(format string, a ...any) { fmt.Printf("  "+format+"\n", a...) }

// Fatal печата грешка и излиза.
func Fatal(err error) {
	fmt.Fprintf(os.Stderr, "  ГРЕШКА: %v\n", err)
	os.Exit(1)
}
