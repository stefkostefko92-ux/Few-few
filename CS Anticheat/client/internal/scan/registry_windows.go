//go:build windows

package scan

import (
	"path/filepath"
	"strings"

	"github.com/carbonstealth/cs-anticheat/client/internal/model"
	"github.com/carbonstealth/cs-anticheat/client/internal/signatures"
	"golang.org/x/sys/windows/registry"
)

// scanRegistryExecution проверява регистровите артефакти за следи от изпълнени
// програми: BAM (Background Activity Moderator), UserAssist и MUICache.
func scanRegistryExecution() ([]model.Detection, error) {
	var out []model.Detection
	out = append(out, scanBAM()...)
	out = append(out, scanUserAssist()...)
	out = append(out, scanMUICache()...)
	return out, nil
}

// matchPath сверява базовото име на път със сигнатурите.
func matchPath(scanner, category string, raw string) *model.Detection {
	p := strings.ToLower(strings.TrimSpace(raw))
	if p == "" {
		return nil
	}
	base := p
	if b := filepath.Base(strings.ReplaceAll(p, `\`, `/`)); b != "" {
		base = b
	}
	sig := signatures.FindByName(signatures.KindProcess, base)
	if sig == nil {
		sig = signatures.FindByName(signatures.KindFile, base)
	}
	if sig == nil {
		return nil
	}
	d := det(scanner, category, sevFromString(sig.Severity),
		"Следа от изпълнение: "+sig.Name, base, raw, sig.ID)
	return &d
}

// enumValueNames връща имената на стойностите в ключ (или nil при грешка).
func enumValueNames(root registry.Key, path string) []string {
	k, err := registry.OpenKey(root, path, registry.QUERY_VALUE|registry.WOW64_64KEY)
	if err != nil {
		return nil
	}
	defer k.Close()
	names, _ := k.ReadValueNames(-1)
	return names
}

// enumSubKeys връща имената на подключовете.
func enumSubKeys(root registry.Key, path string) []string {
	k, err := registry.OpenKey(root, path, registry.ENUMERATE_SUB_KEYS|registry.WOW64_64KEY)
	if err != nil {
		return nil
	}
	defer k.Close()
	names, _ := k.ReadSubKeyNames(-1)
	return names
}

// scanBAM: HKLM\SYSTEM\CurrentControlSet\Services\bam\State\UserSettings\<SID>
// Стойностите са пълни пътища на скоро изпълнени програми.
func scanBAM() []model.Detection {
	const base = `SYSTEM\CurrentControlSet\Services\bam\State\UserSettings`
	var out []model.Detection
	for _, sid := range enumSubKeys(registry.LOCAL_MACHINE, base) {
		for _, v := range enumValueNames(registry.LOCAL_MACHINE, base+`\`+sid) {
			// пътищата са във вид \Device\HarddiskVolumeN\...\name.exe
			if d := matchPath("registry-exec", "bam", v); d != nil {
				out = append(out, *d)
			}
		}
	}
	return out
}

// rot13 декодира UserAssist имената.
func rot13(s string) string {
	b := []byte(s)
	for i, c := range b {
		switch {
		case c >= 'a' && c <= 'z':
			b[i] = 'a' + (c-'a'+13)%26
		case c >= 'A' && c <= 'Z':
			b[i] = 'A' + (c-'A'+13)%26
		}
	}
	return string(b)
}

// scanUserAssist: HKCU\...\Explorer\UserAssist\<GUID>\Count (ROT13 пътища).
func scanUserAssist() []model.Detection {
	const base = `Software\Microsoft\Windows\CurrentVersion\Explorer\UserAssist`
	var out []model.Detection
	for _, guid := range enumSubKeys(registry.CURRENT_USER, base) {
		path := base + `\` + guid + `\Count`
		for _, v := range enumValueNames(registry.CURRENT_USER, path) {
			if d := matchPath("registry-exec", "userassist", rot13(v)); d != nil {
				out = append(out, *d)
			}
		}
	}
	return out
}

// scanMUICache: HKCU\...\Shell\MuiCache — имената на стойностите са пътища.
func scanMUICache() []model.Detection {
	const base = `Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache`
	var out []model.Detection
	for _, v := range enumValueNames(registry.CURRENT_USER, base) {
		if d := matchPath("registry-exec", "muicache", v); d != nil {
			out = append(out, *d)
		}
	}
	return out
}
