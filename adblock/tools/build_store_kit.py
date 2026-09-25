#!/usr/bin/env python3
# Сглобява dist/store-kit/ за CWS от ЕДИНСТВЕНИЯ източник (docs/STORE_LISTING.md +
# docs/SUBMISSION.md) — текстовете не се преписват на ръка, за да не дрейфнат.
import json, re, shutil, subprocess, sys
from pathlib import Path

A = Path(__file__).resolve().parent.parent  # adblock/
KIT = A / "dist" / "store-kit"
ver = json.loads((A / "manifest.json").read_text())["version"]
listing = (A / "docs" / "STORE_LISTING.md").read_text()
sub = (A / "docs" / "SUBMISSION.md").read_text()

def between(s, start, end):
    i = s.index(start) + len(start)
    j = s.index(end, i)
    return s[i:j].strip("\n")

en = between(listing, "## Detailed description\n", "\n## Detailed description, localised")
bg = between(listing, "**bg**\n", "\n**it**")
it = between(listing, "**it**\n", "\n**de**")
de = between(listing, "**de**\n", "\n## Privacy")
summary = between(listing, "## Summary (132 chars max)\n", "\n").strip()
assert len(summary) <= 132, len(summary)

# §5 от SUBMISSION.md: "- **name** — text" (многоредово) → {name: text}
perm_block = between(sub, "## 5. Permission justifications (paste each)\n", "\n> **Reviewer note")
perms = {}
for m in re.finditer(r"^- \*\*(.+?)\*\* — (.+?)(?=^- \*\*|\Z)", perm_block, re.S | re.M):
    perms[m.group(1).strip()] = " ".join(m.group(2).split())
need = ["declarativeNetRequest", "declarativeNetRequestFeedback", "storage", "alarms", "contextMenus", "scripting", "host permissions `<all_urls>`"]
missing = [k for k in need if k not in perms]
assert not missing, missing

note_block = between(sub, "\n> **Reviewer note", "\n## 6.")
note = "Reviewer note" + note_block
note = "\n".join(re.sub(r"^> ?", "", ln) for ln in note.split("\n"))
note = note.replace("**", "").strip()

for s, name in ((en, "en"), (bg, "bg"), (it, "it"), (de, "de")):
    assert len(s) > 250 and "```" not in s, name

def block(s):
    return "```\n" + s + "\n```"

md = f"""# Supreme AdBlock {ver} — Chrome Web Store: всичко за copy/paste

Редът следва dashboard-а. Всяко поле е в блок — копирай съдържанието на блока без оградата.
Текстовете са генерирани от `docs/STORE_LISTING.md` и `docs/SUBMISSION.md` (единственият източник).

## 0. Преди да качиш

- Записът е жив: отвори го → **Package → Upload new package** → `supreme-adblock-{ver}.zip`. НЕ „New item“.
- Деплойни `adblock/server/` на сървъра ПРЕДИ Submit — ревюърът отваря privacy URL-а и текстът трябва да е новият (политика по чл. 13 GDPR).
- Account → **Publisher display name: `Carbon Stealth`**; верифицирай `carbonstealth.eu`. В момента записът показва личното име на акаунта, а продуктът, manifest-ът и политиката казват Carbon Stealth — изравни ги.

## 1. Store listing → Product details

**Title**
{block("Supreme AdBlock")}
**Summary (132 max)**
{block(summary)}
**Description**
{block(en)}
**Category**
{block("Productivity")}
**Language**
{block("English")}
**Official URL** — избери от падащото меню верифицирания домейн:
{block("carbonstealth.eu")}
**Homepage URL**
{block("https://adblock.carbonstealth.eu")}
**Support URL**
{block("https://adblock.carbonstealth.eu/#faq")}

## 2. Store listing → Graphic assets (файловете са в store-kit/)

- Store icon 128×128: `store_icon_128.png`
- Screenshots 1280×800: `screenshot-1.png` … `screenshot-5.png` (в този ред; 4 е нов за {ver} — регионални листи и режим „Фокус“; 1 и 5 — обновени)
- Small promo tile 440×280: `promo_small_440x280.png`
- Marquee 1400×560: `marquee_1400x560.png` (по избор)

## 2b. Store listing → Promo video (YouTube)

Качи `supreme-adblock-promo-{ver}.mp4` в YouTube (Public или Unlisted), заглавие „Supreme AdBlock — free ad blocker for Chrome · Carbon Stealth“, миниатюра `supreme-adblock-promo-{ver}-thumb.png`. После постави адреса на видеото в полето **YouTube video** на листинга. Клипът е 43 s, 1080p, със звук; числата в него са измерените на 25.09.2026 (adblock.turtlecute.org).

## 3. Store listing → Additional languages

Готово описание за ВСЕКИ от 70-те езика е в `listing/<код>.txt` (кодът = папката в `_locales`). В dashboard-а: **Add language** → избери езика → постави съдържанието на файла в Description. Title остава „Supreme AdBlock“; Summary идва от manifest-а (`extDescription` е преведен). Преводите извън en/bg/it/de са машинно подпомогнати — ако имаш носител на езика, дай му ги да ги прегледа преди да ги поставиш.

Пълните bg/it/de описания (от `docs/STORE_LISTING.md`):

**Bulgarian (български) — Description**
{block(bg)}
**Italian (italiano) — Description**
{block(it)}
**German (Deutsch) — Description**
{block(de)}
Title и Summary за другите езици: същите като английските (името е бранд; summary може и на съответния език — manifest-ът вече носи локализирано кратко описание).

## 4. Privacy → Single purpose

**Single purpose description**
{block("Content blocker: blocks ads, trackers and page annoyances (pop-ups, cookie prompts, distracting widgets) on the pages you visit.")}

## 5. Privacy → Permission justification (по едно поле за всяко право)

**declarativeNetRequest**
{block(perms["declarativeNetRequest"])}
**declarativeNetRequestFeedback** (ново за {ver} — popup-ът показва разбивка по филтър-листи)
{block(perms["declarativeNetRequestFeedback"])}
**storage**
{block(perms["storage"])}
**alarms**
{block(perms["alarms"])}
**contextMenus**
{block(perms["contextMenus"])}
**scripting**
{block(perms["scripting"])}
**Host permission justification (<all_urls>)**
{block(perms["host permissions `<all_urls>`"])}
**Are you using remote code?**
{block("No, I am not using remote code")}

## 6. Privacy → Data usage

- Всички категории: **does NOT collect** (Personally identifiable information · Health · Financial and payment · Authentication · Personal communications · Location · Web history · User activity · Website content) — нищо не е отметнато.
- Трите certification отметки: ✅ I do not sell or transfer user data to third parties, outside of the approved use cases · ✅ I do not use or transfer user data for purposes that are unrelated to my item's single purpose · ✅ I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**
{block("https://adblock.carbonstealth.eu/privacy")}

## 7. Notes for reviewer (полето при Submit / „Add notes for the reviewer“)

{block(note)}

## 8. Distribution

- Visibility: Public · Regions: All regions · Payments: Free of charge.

## 9. Последна проверка преди Submit

- [ ] Разархивирай zip-а и го зареди през chrome://extensions → Load unpacked → конзолата е чиста, в popup-а долу пише v{ver}
- [ ] https://adblock.carbonstealth.eu/privacy показва новия текст (администратор, правно основание, права + КЗЛД, „about twice a day“)
- [ ] https://adblock.carbonstealth.eu/filters.json и `/filters.json.sig` отговарят с 200 (подписаната двойка)
- [ ] Publisher = Carbon Stealth, сайтът верифициран
- [ ] Правото `tabs` го няма в списъка с обосновки (изтрий старото поле, ако е останало)

## 10. Microsoft Edge Add-ons (същият zip)

Partner Center → https://partner.microsoft.com/dashboard/microsoftedge/ → Create new extension → качи `supreme-adblock-{ver}.zip` (същия като за Chrome). Category Productivity; privacy/website/support — като горе. Edge иска описание за всеки език в `_locales` — ползвай САМО `listing/<код>.txt` (дългото описание от т. 1 споменава Chrome, а Edge 1.1.2 забранява други браузъри). Search terms (≤7): `ad blocker` · `block ads` · `youtube ad blocker` · `tracker blocker` · `cookie banner blocker` · `popup blocker` · `Carbon Stealth`. Screenshots — същите. Notes for certification — бележката от т. 7 плюс: домейните идват от мрежата, защото рекламните мрежи ги сменят всеки ден; файлът е подписан и съдържа само имена на домейни; листите от автора са по избор.

## 11. Firefox Add-ons (AMO)

https://addons.mozilla.org/developers/ → Submit a New Add-on → On this site → качи `supreme-adblock-{ver}-firefox.zip`. `web-ext lint` дава 0 грешки; предупрежденията са за `getMatchedRules` (няма го във Firefox — popup-ът скрива дневника там) и „coin miner“ в EasyPrivacy/AdGuard French — това са правила, които БЛОКИРАТ майнъри; кажи го в бележката. Изходният код е ЗАДЪЛЖИТЕЛЕН (генерирани файлове): качи `supreme-adblock-{ver}-source.zip` от кита; бележка: `node tools/build_scriptlets.mjs` възпроизвежда main.js и ubo/* байт по байт, а rules/*.json са записан снимка на листите (източници, дати и SHA-256 в THIRD_PARTY_NOTICES.txt). Описание за AMO — от `listing/en.txt` (без абзаца за Manifest V3, той е за Chrome). Data collection: none.
"""

KIT.mkdir(parents=True, exist_ok=True)
for old in KIT.glob("supreme-adblock-*.zip"):
    old.unlink()
(KIT / "CWS-copy-paste.md").write_text(md)
for f in ["store_icon_128.png", "promo_small_440x280.png", "marquee_1400x560.png"]:
    shutil.copy2(A / "store" / f, KIT / f)
for i in range(1, 6):
    shutil.copy2(A / "store" / "screenshots" / f"screenshot-{i}.png", KIT / f"screenshot-{i}.png")
shutil.copy2(A / "dist" / f"supreme-adblock-{ver}.zip", KIT / f"supreme-adblock-{ver}.zip")
shutil.copy2(A / "dist" / f"supreme-adblock-{ver}-firefox.zip", KIT / f"supreme-adblock-{ver}-firefox.zip")
shutil.copy2(A / "dist" / f"supreme-adblock-{ver}-source.zip", KIT / f"supreme-adblock-{ver}-source.zip")
for extra in (f"supreme-adblock-promo-{ver}.mp4", f"supreme-adblock-promo-{ver}-thumb.png"):
    if (A / "dist" / extra).exists():
        shutil.copy2(A / "dist" / extra, KIT / extra)
shutil.rmtree(KIT / "listing", ignore_errors=True)
shutil.copytree(A / "docs" / "listing", KIT / "listing")

out = A / "dist" / f"supreme-adblock-{ver}-store-kit.zip"
out.unlink(missing_ok=True)
subprocess.run(["zip", "-r", "-X", "-D", "-q", str(out), "store-kit"], cwd=A / "dist", check=True)
print("kit:", sorted(p.name for p in KIT.iterdir()))
print("zip:", out, out.stat().st_size)
print("perms:", list(perms))
