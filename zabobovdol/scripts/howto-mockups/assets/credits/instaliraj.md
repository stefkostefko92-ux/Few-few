# Активи на страница „Сложете сайта на телефона“ (`gen-instaliraj.js` → `public/instaliraj/*.webp`)

| Файл | Източник | Автор | Лиценз | Дата |
|------|----------|-------|--------|------|
| `assets/instaliraj/wallpaper-earth.jpg` (тапет на началните екрани; смален до 1200 px) | NASA Image and Video Library, `GSFC_20171208_Archive_e001386` — „Blue Marble 2012“ — https://images.nasa.gov/details/GSFC_20171208_Archive_e001386 (файл `~medium.jpg`) | NASA Goddard Space Flight Center (данни Suomi NPP; изображение Robert Simmon) | Public domain — материали на NASA, не са под авторско право (NASA Media Usage Guidelines); без логото на NASA, без внушение за одобрение | 2026-10-30 |
| `assets/instaliraj/home-top.png` (горният край на сайта във Chrome/Safari) | Собствена снимка на началната страница на нашия сайт (Playwright, 390×780 при 2x, мобилен изглед, пропуснат интро-екранът) | Carbon Stealth VCC | Собствено съдържание | 2026-10-30 |
| Икони на приложения (Google, Gmail, Viber, Facebook…) | `assets/brands/` (simple-icons, CC0) — само номинативно, виж `assets/CREDITS.md` | — | CC0 (знаците са търговски марки на собствениците им) | — |

Обновяване на `home-top.png` при промяна на началната страница: пусни сайта (продукционен билд),
после снимай `/` при 390 px ширина, `deviceScaleFactor: 2`, `sessionStorage.zbd_splash_seen = "1"`.
Контактите в менюто „Сподели“ („Мария“, „Георги“, „Нели“) са измислени — без снимки на хора.
