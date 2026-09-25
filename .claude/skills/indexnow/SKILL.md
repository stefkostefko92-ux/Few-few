---
name: indexnow
description: >-
  Автоматично подава променени URL-и към търсачките след SEO/GEO/AEO промяна (IndexNow → Bing,
  Yandex, Seznam, Naver, Yep с едно извикване). Ползвай ВИНАГИ след промяна, засягаща откриваемост:
  нов/променен sitemap, нови/променени страници, canonical/hreflang, JSON-LD, robots/llms.txt.
  Дори потребителят да не каже „indexnow" — ако е пипано съдържание/структура за търсене, това е стъпката.
  Google НЕ поддържа IndexNow — за него дръж sitemap свеж + Search Console.
---

# Уведоми търсачките при промяна на откриваемост

**Правило от репото:** всяка SEO/GEO/AEO промяна → авто-подаване към всички търсачки, които поддържат
автоматично подаване. **IndexNow** праща до Bing, Yandex, Seznam, Naver и Yep с **едно** извикване.

## Кога се задейства
- Нов или променен `sitemap.xml`
- Нови/променени/изтрити страници (вкл. смяна на slug → 301 + подай новия URL)
- Промяна на `canonical`/`hreflang`, JSON-LD, `robots.txt`/`llms.txt`

## Команда
```bash
node tools/seo/indexnow.mjs https://<live-domain>
```
Изисква сайтът да е **деплойнат** с `indexnow-key.txt` в web root.

**Ако ключът е на `<key>.txt`, а не на `indexnow-key.txt`** (така е при Supreme), горната команда
пада с „Липсва валиден ключ" — подай го явно:
```bash
node tools/seo/indexnow.mjs https://<live-domain> \
  --key-file <път до <key>.txt> --key-location https://<live-domain>/<key>.txt
```
> **Капанът, който струва деплой:** при SPA (`try_files … /index.html`) адресът
> `/indexnow-key.txt` връща **200 с index.html**, не 404. Тоест „файлът отговаря" НЕ значи
> „ключът е там" — проверявай съдържанието: `curl -s <url>/indexnow-key.txt` трябва да върне
> само ключа. (Реален провал на Supreme, 07.08.2026.)

Deploy hook-ът
(`deploy/autodeploy.sh`) авто-пинга при всеки релийз за продукт с `INDEXNOW_<PROJ>` set —
затова при обикновен деплой често не е нужно ръчно. Пусни ръчно при промяна на живо между релийзи
(напр. публикуване на съдържание през админ панела).

## Google (отделно — НЕ поддържа IndexNow)
Sitemap ping е спрян (2023). За Google:
- Дръж `sitemap.xml` свеж (авто-открива се).
- Ползвай Search Console: `tools/seo/gsc.mjs`.

## zabobovdol
Има и сървърна admin операция за IndexNow (`src/lib/indexnow.ts`) — публикуване на съдържание през
админ панела може да я ползва директно. Собственик на откриваемостта = агентът **SEO**.
