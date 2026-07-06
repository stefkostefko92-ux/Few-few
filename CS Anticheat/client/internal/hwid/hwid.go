// Package hwid генерира ХЕШИРАН хардуерен отпечатък.
// Никакви сурови серийни номера не напускат машината — само salted SHA-256
// (GDPR data minimisation, research/05: hash-only HWID).
package hwid

import (
	"crypto/sha256"
	"encoding/hex"
	"net"
	"sort"
	"strings"

	"github.com/carbonstealth/cs-anticheat/client/internal/model"
)

// raw са суровите компоненти (никога не се сериализират/пращат).
type raw struct {
	MachineGUID  string
	VolumeSerial string
	CPU          string
	Baseboard    string
	ComputerName string
	MACs         []string
}

// macs връща сортирани не-виртуални MAC адреси (cross-platform).
func macs() []string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil
	}
	var out []string
	for _, ifc := range ifaces {
		if ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		hw := ifc.HardwareAddr.String()
		if hw == "" || strings.HasPrefix(hw, "00:00:00") {
			continue
		}
		out = append(out, strings.ToLower(hw))
	}
	sort.Strings(out)
	return out
}

func hashComponent(salt, value string) string {
	if value == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(salt + "|" + strings.ToLower(strings.TrimSpace(value))))
	return hex.EncodeToString(sum[:])
}

// Compute събира компонентите и връща само хешираната форма.
// salt трябва да е конфигуриран per-deployment (не в repo — env/файл).
func Compute(salt string) model.HWID {
	r := collect() // платформено-зависимо
	r.MACs = macs()

	comps := map[string]string{}
	if h := hashComponent(salt, r.MachineGUID); h != "" {
		comps["machineGuid"] = h
	}
	if h := hashComponent(salt, r.VolumeSerial); h != "" {
		comps["volumeSerial"] = h
	}
	if h := hashComponent(salt, r.Baseboard); h != "" {
		comps["baseboard"] = h
	}
	if h := hashComponent(salt, r.CPU); h != "" {
		comps["cpu"] = h
	}
	if len(r.MACs) > 0 {
		comps["mac"] = hashComponent(salt, strings.Join(r.MACs, ","))
	}

	// Composite = стабилна комбинация от най-устойчивите компоненти.
	// MachineGUID + Baseboard оцеляват при смяна на диск/мрежова карта.
	var parts []string
	for _, v := range []string{r.MachineGUID, r.Baseboard, r.CPU, r.ComputerName} {
		if v != "" {
			parts = append(parts, strings.ToLower(strings.TrimSpace(v)))
		}
	}
	composite := hashComponent(salt, strings.Join(parts, "::"))

	return model.HWID{
		Composite:  composite,
		Components: comps,
		Algo:       "sha256-salted",
	}
}
