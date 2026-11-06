# Safari (macOS, iPhone, iPad) — на пауза

**Решение на собственика (6 ноември 2026):** не плащаме за разпространение на безплатен продукт, затова
Safari чака. Apple: „To distribute Safari Extensions, you need to be a member of the Apple Developer
Program“ (developer.apple.com/safari/extensions) — платено членство, подновява се всяка година; цената
провери на developer.apple.com/programs при решение.

## Ако някой ден се реши

- **Без Mac:** Apple позволява пакет без Mac и Xcode — ZIP на разширението се качва в App Store Connect,
  там се превръща в приложение, тества се с TestFlight и се подава за ревю (WWDC26, сесия 216 „Create
  web extensions for Safari“).
- **С Mac:** командата на Xcode за преобразуване („command-line web extension converter“, `xcrun …`;
  точното име — в документацията на инсталирания Xcode) прави проект с приложение-обвивка (macOS и/или
  iOS).
- Ревюто е по App Review Guidelines, т. 4.4 (Extensions).

## Какво не знаем

Не е изпробвано в Safari. Да се провери преди обещание: `declarativeNetRequest` (лимити и regex),
`scripting` в MAIN world (YouTube и скриптлетите), Ed25519 в WebCrypto (подписът на `filters.json`),
`getMatchedRules`. На сайта не пишем, че работим в Safari.
