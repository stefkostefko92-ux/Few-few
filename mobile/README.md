# MedQR — мобилни приложения (Android и iOS)

Тази папка превръща MedQR в **нативно приложение за Android и iOS** чрез
[Capacitor](https://capacitorjs.com/). Всяка платформа получава **собствена папка**:

- `android/` — нативният Android проект (отваря се с Android Studio)
- `ios/` — нативният iOS проект (отваря се с Xcode на macOS)

Тези две папки се **генерират** с командите по-долу (затова не са в git по
подразбиране — виж `.gitignore`).

## Как работи

Приложението е тънка нативна обвивка, която зарежда живия сайт
`https://medqr.carbonstealth.eu` (виж `server.url` в `capacitor.config.json`).
Това дава няколко предимства:

- **Без парола след първи вход** — нативният WebView пази бисквитките трайно, а
  заедно с „остани вписан“ сесията (1 година, плъзгащо подновяване) потребителят
  остава вписан и не въвежда парола отново.
- **Винаги актуално** — щом обновиш сайта, приложението показва новото без нов
  билд в магазините.
- **Офлайн** — service worker-ът на сайта кешира SOS/спешните екрани.

> Алтернатива: ако предпочиташ изцяло вграден (offline-first) билд без `server.url`,
> ще трябва статично копие в `www/`. Понеже MedQR е сървърно приложение, тук е
> избран по-надеждният подход със зареждане на живия сайт.

## Изисквания

- Node.js 20+
- **Android:** Android Studio (Android SDK). Работи на Windows/macOS/Linux.
- **iOS:** macOS + Xcode + CocoaPods. iOS билд **изисква Mac** (ограничение на Apple).

## Стъпки

```bash
cd mobile
npm install

# Генериране на платформените папки (създава android/ и ios/)
npm run add:android      # създава mobile/android
npm run add:ios          # създава mobile/ios   (само на macOS)

# Синхронизиране на конфигурацията и приставките
npm run sync

# Отваряне в съответната среда за билд/подпис/публикуване
npm run open:android     # Android Studio → Build APK/AAB
npm run open:ios         # Xcode → Archive → App Store Connect
```

## Преди публикуване

1. **Икони и splash:** генерирай от логото (`public/logo-mark.svg`) с
   `@capacitor/assets` или ръчно в Android Studio/Xcode.
2. **App ID:** `eu.carbonstealth.medqr` (сменяем в `capacitor.config.json`).
3. **Разрешения:**
   - Геолокация (за споделяне на локация / SOS) — Android `ACCESS_FINE_LOCATION`,
     iOS `NSLocationWhenInUseUsageDescription`.
   - NFC (по избор) — Android `android.permission.NFC`.
4. **Deep links / App Links** към `medqr.carbonstealth.eu`, за да се отварят QR
   връзките направо в приложението (по избор).
5. **Магазини:** Google Play (AAB) и Apple App Store (Archive през Xcode).
   За App Store: приложение, което само показва уебсайт, може да бъде отказано —
   затова добави нативна стойност (push известия, NFC, биометрия) при нужда.

## Биометрично заключване (по избор)

За да е удобно и сигурно „без парола“: добави
[`@capacitor-community/biometric-auth`](https://github.com/capacitor-community/biometric-auth)
и поискай Face ID / пръстов отпечатък при отваряне на приложението. Сесията си
остава трайна; биометрията само пази локалния достъп.
