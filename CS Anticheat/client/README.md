# CS Anticheat — Screenshare Scanner (клиент)

Клиентски **Windows `.exe`**, който играчът пуска при screenshare проверка. Сканира
машината за следи от известни чийтове (Windows forensic артефакти), генерира
**хеширан** HWID и сглобява доклад, който по избор се качва към backend панела.

Написан на **Go** → cross-compile до single static `.exe` без зависимости.

## Компилация

```bash
./build.sh v0.1.0            # → dist/CSAnticheat.exe
# или ръчно:
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
  go build -trimpath -ldflags "-s -w -X main.build=v0.1.0" -o CSAnticheat.exe .
```

Изисква **Go 1.25+**. Компилира се и на Linux/macOS (cross-compile). За не-Windows
платформи скенерът е no-op stub (за CI/`go build ./...`), реалните модули са зад
`//go:build windows`.

## Пускане

```text
CSAnticheat.exe [флагове]

  -server    string   идентификатор на сървъра/screenshare сесията
  -endpoint  string   URL на backend-а за качване (или CSAC_ENDPOINT)
  -secret    string   HMAC тайна (по-добре CSAC_SECRET env)
  -salt      string   salt за HWID хеша (по-добре CSAC_SALT env)
  -out       string   локален файл за доклада (по подр. cs-anticheat-report.json)
  -verbose            печатай всяка находка
  -no-submit          само локален файл, без качване
  -no-pause           не чакай Enter на края
```

Препоръчва се стартиране **като администратор** — част от артефактите (Prefetch,
BAM) искат повишени права. Без тях модулите деградират меко (маркират грешка, не
чупят сканирането).

## Детекционни модули (MVP)

| Модул | Какво лови | Артефакт |
|---|---|---|
| `processes` | Активни cheat менюта/executor-и/инжектори | Toolhelp snapshot |
| `window-titles` | Cheat overlay прозорци | `EnumWindows` |
| `prefetch` | Доказателство, че cheat е **бил пускан** (дори изтрит) | `C:\Windows\Prefetch\*.pf` |
| `registry-exec` | Следа от изпълнение | BAM · UserAssist (ROT13) · MUICache |
| `drivers` | Уязвими/BYOVD kernel драйвери (kernel чийтове) | `Services` (Type=1) |
| `dma-devices` | Hardware DMA карти (FPGA/PCILeech/Screamer) | PCI/USB enum |
| `filesystem` | Cheat loader/DLL файлове | Temp · Downloads · Desktop · AppData |

Плюс системен контекст: Test Signing режим, kernel debugger, VM, elevation,
Secure Boot.

## Дизайн принципи

- **Хеширан HWID** — никакви сурови серийни номера не напускат машината
  (GDPR data-minimisation, виж `../research/05-gdpr-legal.md`).
- **GDPR connect-notice** се показва преди сканиране (какво се събира).
- **Прозрачност** — докладът включва кои модули са минали (`runs`).
- **Евристики, не присъда** — всяка находка е хипотеза; крайното решение е на
  човек (чл. 22 GDPR).

## Граница на MVP (честно)

Скенерът е **forensic** (следи от изпълнение) — като echo.ac/detect.ac, но
FiveM-native, single-exe и GDPR-изряден. **Не** е real-time блокер на активен
aimbot/ESP — това е задача на server-authoritative слоя (следваща фаза, виж
`../research/00-synthesis.md`, roadmap). Хардуерните DMA чийтове се засичат само
по хардуерна следа (`dma-devices`), не по инжекция.
