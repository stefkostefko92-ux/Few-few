# tools/mobile — „ръце" на Мобилджията (v2.0)

```bash
node tools/mobile/store-readiness.mjs medqr/mobile        # Capacitor обвивка (medqr)
node tools/mobile/store-readiness.mjs zabobovdol/android  # TWA (zabobovdol)
```

- **store-readiness.mjs** — евристичен детектор за най-скъпите откази от магазина:
  тънка Capacitor обвивка с отдалечен `server.url` без нативни плъгини (**Apple 4.2**),
  тайни в бъндъла/конфига (не са тайни — декомпилират се), липсващ `PrivacyInfo.xcprivacy`,
  липсващи Info.plist usage descriptions (NFC/Face ID), `@capacitor/preferences` за
  чувствително (не е криптиран), TWA assetlinks напомняне (production SHA-256, Lighthouse ≥80).
  Връща exit **1** при HIGH. Евристично е — **потвърди ръчно** срещу App Review / Play pre-launch report.

## Граница
- Реален iOS билд иска **macOS + Xcode**; качване иска App Store Connect / Play Console — не стават тук.
  Инструментът е статичен предпазител преди опашката на ревюто, не замяна на билда/submit.
- Числата за магазините (target API, EU такси) са подвижни — **провери на живо** при качване
  (developer.apple.com, developer.android.com, developer.apple.com/support/dma-and-apps-in-the-eu/).

⚠ Подписващи ключове (iOS .p12/provisioning, Android keystore) и APNs/FCM ключове остават извън
репото (secret store, mode 600). Тайни никога в бъндъла.
