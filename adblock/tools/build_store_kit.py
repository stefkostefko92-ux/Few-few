#!/usr/bin/env python3
# Сглобява dist/store-kit/ за CWS от ЕДИНСТВЕНИЯ източник (docs/STORE_LISTING.md +
# docs/SUBMISSION.md) — текстовете не се преписват на ръка, за да не дрейфнат.
import json, re, shutil, subprocess, sys
from pathlib import Path

A = Path(__file__).resolve().parent.parent  # adblock/
KIT = A / "dist" / "store-kit"
ver = json.loads((A / "manifest.json").read_text())["version"]
LOCALES = sorted(p.name for p in (A / "_locales").iterdir() if p.is_dir())
LANGS = len({l.split("_")[0] for l in LOCALES})  # езиците, не папките (es/es_419, pt_BR/pt_PT, zh_CN/zh_TW)
# Chrome Web Store не показва тези в листинга си (живата страница, 2026-10-12: 63 от 73) — Chrome пак ги ползва.
# Един списък и за генератора на скрийншотите (store/screenshots/build.py).
CWS_UNLISTED = json.loads((A / "store" / "cws-unlisted.json").read_text())
STORE_LOCALES = [l for l in LOCALES if l != "en" and l not in CWS_UNLISTED]
# Скрийншотите по езици (Google: „use locale-specific screenshots“) — рендерира ги
# `python3 store/screenshots/build.py --locales`; китът не тръгва без всичките.
SHOTS = A / "dist" / "store-screenshots"
no_shots = [l for l in STORE_LOCALES if not all((SHOTS / l / f"screenshot-{i}.jpg").exists() for i in range(1, 6))]
assert not no_shots, f"missing localized screenshots (python3 store/screenshots/build.py --locales): {no_shots}"
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

# Клипът за магазина не се сменя с всяка версия → миниатюрата е от последния рендериран клип (dist/), не от {ver}.
def _vkey(p):
    return tuple(int(x) for x in re.search(r"promo-(\d+(?:\.\d+)*)-store-thumb", p.name).group(1).split("."))
_thumbs = sorted((A / "dist").glob("supreme-adblock-promo-*-store-thumb.png"), key=_vkey)
thumb = _thumbs[-1].name if _thumbs else f"supreme-adblock-promo-{ver}-store-thumb.png"

NOMINATION = """Featured badge nomination: Supreme AdBlock (chbjbiabkgocfbbfhednpbhfeipjcclk)

Supreme AdBlock is a single-purpose content blocker: it blocks ads, trackers and page annoyances on the pages the user visits. All core features work without an account or payment.

- Platform: built for Manifest V3 from the first line. Network blocking uses declarativeNetRequest. No remote code: all logic ships in the package, unminified; the only network data is a signed (Ed25519), data-only filter file (hostnames and CSS selectors).
- Privacy: no analytics, no telemetry, no data collection. The Privacy practices tab matches the privacy policy, including the Limited Use statement: https://adblock.carbonstealth.eu/privacy
- Permissions: one install warning (site access, which a content blocker needs); every permission is justified in the listing.
- User experience: a welcome page on first install only; no notifications and no persistent UI; one-click fixes when a site breaks, and reports only through the user's own e-mail; a rare review request that the user can switch off, with no incentive.
- Quality: the popup, settings, welcome and repair pages pass automated WCAG 2.2 AA checks (axe) in the dark and light themes; the popup fits Chrome's 600 px in all 73 locales; pages keep the back/forward cache; end-to-end tests run in Chromium.
- Listing: English plus a localized description and localized screenshots for every language the store lists; the promo tile and marquee follow the image guidelines; support page: https://adblock.carbonstealth.eu/support
- Publisher: Carbon Stealth VCC (EU), Established Publisher badge, no policy violations."""

md = f"""# Supreme AdBlock {ver} — Chrome Web Store: всичко за copy/paste

Редът следва dashboard-а. Всяко поле е в блок — копирай съдържанието на блока без оградата.
Текстовете са генерирани от `docs/STORE_LISTING.md` и `docs/SUBMISSION.md` (единственият източник).

## 0. Преди да качиш

- Записът е жив: отвори го → **Package → Upload new package** → `supreme-adblock-{ver}.zip`. НЕ „New item“.
- Деплойни `adblock/server/` на сървъра ПРЕДИ Submit (`sudo REF=main PROJECTS="adblock" bash /opt/few-few/current/deploy/fetch-deploy.sh`) — ревюърът отваря privacy URL-а: там трябва да е изречението на Google за **Limited Use** (Program Policies го изискват на сайта), а `filters.json` да е новият (само данни, без ключ `scriptlets`) с пресен подпис.
- **Статус на търговец (DSA):** листингът показва „Non-trader“ и личен имейл, а публикуваме като Carbon Stealth VCC и приемаме дарения — декларирай се като търговец (данните на фирмата, `info@carbonstealth.eu`). Решение на собственика.
- Account → **Publisher display name: `Carbon Stealth`**; верифицирай `carbonstealth.eu`. В момента записът показва личното име на акаунта, а продуктът, manifest-ът и политиката казват Carbon Stealth — изравни ги.

## 1. Store listing → Product details

**Title** — идва от manifest-а (`extName`), в таблото само провери, че се вижда новото име:
{block("Supreme AdBlock – Ad Blocker")}
**Summary (132 max)**
{block(summary)}
**Description**
{block(en)}
**Category**
{block("Privacy & Security")}

(Днес листингът е в *Tools* — смени го: блокерите на реклами и тракери са в *Privacy & Security*.)
**Language**
{block("English")}
**Official URL** — избери от падащото меню верифицирания домейн:
{block("carbonstealth.eu")}
**Homepage URL**
{block("https://adblock.carbonstealth.eu")}
**Support URL** (страницата за поддръжка — стъпки за счупен сайт, YouTube, пропусната реклама, контакт)
{block("https://adblock.carbonstealth.eu/support")}

## 2. Store listing → Graphic assets (файловете са в store-kit/)

- Store icon 128×128: `store_icon_128.png`
- Screenshots 1280×800 (английски, по подразбиране): `screenshot-1.png` … `screenshot-5.png` (в този ред; изтрий старите във ВСЕКИ език). Новите са с минимум текст и по-едър шрифт — така иска Google („Keep text minimal“), а при 640×400 се четат.
- Screenshots по езици: в отделния архив `supreme-adblock-{ver}-screenshots.zip` → `store-screenshots/<код>/screenshot-1.jpg … 5.jpg` за всеки от {len(STORE_LOCALES)}-те езика на магазина: надписите и popup-ът са на съответния език, RTL за арабски, иврит, персийски и урду. Качват се при всеки език (т. 3).
- Small promo tile 440×280: `promo_small_440x280.png`
- Marquee 1400×560: `marquee_1400x560.png` (без него не можем да сме в голямата витрина на магазина)
- Плочката и marquee-то са без текст — така иска Google за промо графиките (не са по езици).

## 2b. Store listing → Promo video (YouTube)

**Клиповете не се обновяват повече** (решение на собственика, 2026-10-15) — нито с новата версия, нито при промени. Полето **YouTube video** в листинга не се пипа като част от това качване. За сведение: последният рендер е store cut 5.1.8 (`supreme-adblock-promo-5.1.8-store-web.mp4`, без сравнение и без „free“, миниатюра `{thumb}`); ако някога клип в листинга се сменя, само версия за магазина — никога пълната или вертикалната за социалните мрежи (там има „Free“ и сравнение).

## 3. Store listing → Additional languages

**При всеки език: Description + петте му скрийншота** (Google препоръчва скрийншоти по езици, когато разширението е многоезично). В dashboard-а горе избери езика → постави описанието → Graphic assets → Screenshots: изтрий старите и качи `store-screenshots/<код>/screenshot-1…5.jpg` в този ред. Език без свои скрийншоти показва английските.

Готово описание за всеки от {len(LOCALES)}-те локала ({LANGS} езика — es/es_419, pt_BR/pt_PT и zh_CN/zh_TW са варианти) е в `listing/<код>.txt` (кодът = папката в `_locales`). В dashboard-а: **Add language** → избери езика → постави съдържанието на файла в Description. Магазинът показва {len(LOCALES) - len(CWS_UNLISTED)} от тях („{len(LOCALES) - len(CWS_UNLISTED)} languages“ в Details): {", ".join(CWS_UNLISTED)} не са в неговия списък — ако ги няма в Add language, пропусни ги; разширението пак е на тези езици за хората с Chrome на тях. Title и Summary идват от manifest-а (`extName`/`extDescription`, не са поле в таблото): en „Supreme AdBlock – Ad Blocker“, bg/de/it с родова дума, другите езици — „Supreme AdBlock“. Преводите извън en/bg/it/de са машинно подпомогнати — и описанията, и надписите на скрийншотите (`store/screenshots/i18n.json`); popup-ът и панелите на скрийншотите са истинските низове на разширението. Ако имаш носител на езика, дай му ги да ги прегледа преди да ги поставиш (Преводача отбеляза за преглед: am, kn, ta, ne, bn, si, eu, te, ml, ur, ar, ko, pa, sw, hy, ka, vi, az, gu, mr, uz).

Пълните bg/it/de описания (от `docs/STORE_LISTING.md`):

**Bulgarian (български) — Description**
{block(bg)}
**Italian (italiano) — Description**
{block(it)}
**German (Deutsch) — Description**
{block(de)}
Title и Summary за другите езици идват от manifest-а: името е „Supreme AdBlock“ (родова дума само в en/bg/de/it), summary е локализираното `extDescription`.

## 4. Privacy → Single purpose

**Single purpose description**
{block("Content blocker: blocks ads, trackers and page annoyances (pop-ups, cookie prompts, distracting widgets) on the pages you visit.")}

## 5. Privacy → Permission justification (по едно поле за всяко право)

**declarativeNetRequest**
{block(perms["declarativeNetRequest"])}
**declarativeNetRequestFeedback** (броячът на значката и разбивката „Blocked on this page“ в popup-а)
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
- [ ] /privacy съдържа раздела „Chrome Web Store User Data Policy (Limited Use)“
- [ ] Категория: Privacy & Security
- [ ] При Submit: отметни **deferred publishing**, ако искаш сам да избереш кога одобрената версия излиза

## 9b. След като {ver} е публикувана — номинация за Featured

Chrome Web Store **One Stop Support** → опцията за номинация за Featured badge. Условията на Google (всички изпълнени): разширение, публикувано и публично, наше, с английски, без активни нарушения, основните функции без акаунт и плащане. Badge-ът не се купува; прегледът отнема време.

**Текст за номинацията** (на английски — постави го в полето за описание на формата; всяко твърдение е проверимо):
{block(NOMINATION)}

Преди да номинираш — листингът трябва да показва най-доброто (ревюърът гледа него, а класирането — оценките и задържането):
- [ ] {ver} е публикувана и в Details пише Version {ver}
- [ ] Description (EN) е новото от т. 1 — на живо НЕ трябва да има „not retrofitted“, „acceptable ads“, „Daily signed“ или „73 languages“
- [ ] Описанията по езици от `listing/<код>.txt` са поставени (поне de, fr, es, it, pt_BR, ru, pl, nl, tr, ja, ko, id, uk, bg) — без тях чужденците виждат стар английски текст
- [ ] Скрийншотите са от този кит — английските и тези по езици (поне за същите големи езици); промо плочката и marquee — също
- [ ] Support URL = `https://adblock.carbonstealth.eu/support` (и страницата отговаря с 200 след деплоя)
- [ ] Account → **Spotlight item** = Supreme AdBlock (показва се на страницата на издателя)
- [ ] Отговорени са отзивите и въпросите в таба **Support** на листинга — ранкингът и ревюърите гледат дали издателят отговаря
- [ ] Сайтът е деплойнат от същия ref (политиката и твърденията там съвпадат с листинга)
- [ ] Graphic assets: качени са `promo_small_440x280.png` (без нея листингът е след тези, които я имат) и `marquee_1400x560.png` (без нея — никога в голямата витрина)
- [ ] Homepage URL = `https://adblock.carbonstealth.eu` — САМО ако в Search Console е потвърден целият домейн (Domain property, DNS); при URL-prefix свойство за `https://carbonstealth.eu` го остави, иначе текстът на значката „Created by the owner of the listed website“ може да падне
- [ ] Contact email: фирменият (`info@carbonstealth.eu`) вместо личния Gmail — показва се публично в листинга
- [ ] Статус на търговец (DSA): днес „Non-trader“ с предупреждението, че правата на потребителите в ЕС не важат; Carbon Stealth VCC е фирма — реши с Правния Разбирач дали да се декларира като търговец (адресът и телефонът стават публични)
- [ ] Линкът за дарения (popup + Настройки) води към лична Revolut сметка, а издателят е Carbon Stealth — по-прозрачно е фирмена сметка или страница на сайта, която казва кой получава парите

## 10. Microsoft Edge Add-ons (същият zip)

Partner Center → https://partner.microsoft.com/dashboard/microsoftedge/ → Create new extension → качи `supreme-adblock-{ver}.zip` (същия като за Chrome). Category Productivity; privacy/website/support — като горе. Edge иска описание за всеки език в `_locales` — ползвай САМО `listing/<код>.txt` (дългото описание от т. 1 споменава Chrome, а Edge 1.1.2 забранява други браузъри). Search terms (≤7): `ad blocker` · `block ads` · `youtube ad blocker` · `tracker blocker` · `cookie banner blocker` · `popup blocker` · `Carbon Stealth`. Screenshots — същите. Notes for certification — бележката от т. 7 плюс: домейните идват от мрежата, защото рекламните мрежи ги сменят всеки ден; файлът е подписан и съдържа само имена на домейни; листите от автора са по избор.

## 11. Firefox Add-ons (AMO)

https://addons.mozilla.org/developers/ → Submit a New Add-on → On this site → качи `supreme-adblock-{ver}-firefox.zip`. `web-ext lint` дава 0 грешки; предупрежденията (getMatchedRules/onRuleMatchedDebug/onUserSettingsChanged — проверяват се преди употреба; DANGEROUS_EVAL — рутините noeval ПОДМЕНЯТ window.eval на страницата; coin miner — правила, които БЛОКИРАТ майнъри) и бележката за ревюъра са в `docs/AMO.md` — постави я дословно. Изходният код е ЗАДЪЛЖИТЕЛЕН (генерирани файлове): качи `supreme-adblock-{ver}-source.zip` от кита; бележка: `node tools/build_scriptlets.mjs` възпроизвежда main.js и ubo/* байт по байт, а rules/*.json са записан снимка на листите (източници, дати и SHA-256 в THIRD_PARTY_NOTICES.txt). Описание за AMO — от `listing/en.txt` (без абзаца за Manifest V3, той е за Chrome). Data collection: none.
"""

KIT.mkdir(parents=True, exist_ok=True)
for old in [*KIT.glob("supreme-adblock-*.zip"), *KIT.glob("supreme-adblock-promo-*")]:  # стари версии (вкл. миниатюри) не пътуват
    old.unlink()
(KIT / "CWS-copy-paste.md").write_text(md)
for f in ["store_icon_128.png", "promo_small_440x280.png", "marquee_1400x560.png"]:
    shutil.copy2(A / "store" / f, KIT / f)
for i in range(1, 6):
    shutil.copy2(A / "store" / "screenshots" / f"screenshot-{i}.png", KIT / f"screenshot-{i}.png")
shutil.copy2(A / "dist" / f"supreme-adblock-{ver}.zip", KIT / f"supreme-adblock-{ver}.zip")
shutil.copy2(A / "dist" / f"supreme-adblock-{ver}-firefox.zip", KIT / f"supreme-adblock-{ver}-firefox.zip")
shutil.copy2(A / "dist" / f"supreme-adblock-{ver}-source.zip", KIT / f"supreme-adblock-{ver}-source.zip")
for extra in (thumb,):  # the video itself travels separately (size)
    if (A / "dist" / extra).exists():
        shutil.copy2(A / "dist" / extra, KIT / extra)
shutil.rmtree(KIT / "listing", ignore_errors=True)
shutil.copytree(A / "docs" / "listing", KIT / "listing")

# Скрийншотите по езици пътуват в отделен архив (~50 MB): китът остава лек за телефон.
shots_zip = A / "dist" / f"supreme-adblock-{ver}-screenshots.zip"
for old in (A / "dist").glob("supreme-adblock-*-screenshots.zip"):
    old.unlink()
subprocess.run(["zip", "-r", "-X", "-D", "-q", str(shots_zip), *[f"store-screenshots/{l}" for l in STORE_LOCALES]], cwd=A / "dist", check=True)
print("screenshots zip:", shots_zip, shots_zip.stat().st_size)

out = A / "dist" / f"supreme-adblock-{ver}-store-kit.zip"
out.unlink(missing_ok=True)
subprocess.run(["zip", "-r", "-X", "-D", "-q", str(out), "store-kit"], cwd=A / "dist", check=True)
print("kit:", sorted(p.name for p in KIT.iterdir()))
print("zip:", out, out.stat().st_size)
print("perms:", list(perms))
