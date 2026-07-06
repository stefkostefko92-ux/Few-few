// CS Anticheat — Screenshare Scanner (клиентски .exe).
//
// Играчът пуска това exe при screenshare проверка. То сканира машината за следи
// от известни чийтове (Windows forensic артефакти), генерира хеширан HWID и
// сглобява доклад, който по избор се праща към backend панела.
//
// Windows-only по функция; компилира се и на други ОС като no-op (за CI/тестове).
// Компилация:  GOOS=windows GOARCH=amd64 go build -o CSAnticheat.exe .
package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/carbonstealth/cs-anticheat/client/internal/hwid"
	"github.com/carbonstealth/cs-anticheat/client/internal/model"
	"github.com/carbonstealth/cs-anticheat/client/internal/report"
	"github.com/carbonstealth/cs-anticheat/client/internal/scan"
	"github.com/carbonstealth/cs-anticheat/client/internal/ui"
)

// build се задава при компилация: -ldflags "-X main.build=v0.1.0".
var build = "dev"

const notice = "CS Anticheat сканира тази машина за следи от известни чийтове " +
	"(хеширан HWID, изпълнени програми, процеси, драйвери, DMA устройства). " +
	"Не се чете съдържание на лични файлове. Докладът се предава на администратора " +
	"на сървъра. Права и обжалване: https://carbonstealth.eu/csac/privacy"

func envOr(flagVal, envKey, def string) string {
	if flagVal != "" {
		return flagVal
	}
	if v := os.Getenv(envKey); v != "" {
		return v
	}
	return def
}

func main() {
	var (
		serverRef = flag.String("server", "", "идентификатор на сървъра/screenshare сесията")
		endpoint  = flag.String("endpoint", "", "URL на backend-а за качване на доклада (по избор)")
		secret    = flag.String("secret", "", "HMAC тайна (по-добре през CSAC_SECRET env)")
		salt      = flag.String("salt", "", "salt за HWID хеша (по-добре през CSAC_SALT env)")
		out       = flag.String("out", "cs-anticheat-report.json", "локален файл за доклада")
		verbose   = flag.Bool("verbose", false, "печатай всяка находка на екрана")
		noSubmit  = flag.Bool("no-submit", false, "не качвай, само локален файл")
		noPause   = flag.Bool("no-pause", false, "не чакай Enter на края")
	)
	flag.Parse()

	sec := envOr(*secret, "CSAC_SECRET", "")
	slt := envOr(*salt, "CSAC_SALT", "cs-anticheat-default-salt")

	ui.Banner(build)
	ui.Notice(notice)

	// Контекст + HWID (неинвазивно).
	sys := scan.System(build)
	hw := hwid.Compute(slt)
	if sys.OS != "" {
		ui.Line("Система: %s %s · %s", sys.OS, sys.OSVersion, sys.Arch)
	}
	if sys.TestSigning {
		ui.Line("⚠ Test Signing режим е ВКЛЮЧЕН (позволява неподписани драйвери)")
	}
	if sys.KernelDbg {
		ui.Line("⚠ Активен kernel debugger")
	}
	fmt.Println()

	// Изпълни модулите.
	dets, runs := scan.Run(*verbose,
		func(name string) { ui.Step(name) },
		func(ok bool, found int) { ui.StepDone(ok, found) },
		func(d model.Detection) { ui.Detection(d) },
	)

	r := report.Build(sys, hw, dets, runs, *serverRef, notice)
	ui.Verdict(r)

	// Локален запис.
	if err := report.SaveLocal(r, *out); err != nil {
		ui.Line("Неуспешен локален запис: %v", err)
	} else {
		ui.Line("Докладът е записан: %s", *out)
	}

	// Качване към backend.
	ep := envOr(*endpoint, "CSAC_ENDPOINT", "")
	if ep != "" && !*noSubmit {
		ui.Line("Качване към %s ...", ep)
		if resp, err := report.Submit(r, ep, sec, 20*time.Second); err != nil {
			ui.Line("Качването не успя: %v", err)
		} else {
			ui.Line("Качено. Отговор: %s", resp)
		}
	}

	if !*noPause {
		fmt.Print("\n  Натисни Enter за изход...")
		bufio.NewReader(os.Stdin).ReadBytes('\n')
	}
}
