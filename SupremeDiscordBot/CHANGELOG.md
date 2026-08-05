# Changelog — Supreme Bot

Форматът следва [Keep a Changelog](https://keepachangelog.com/bg/1.1.0/); версиите — [SemVer](https://semver.org/).

## [3.0.0] — 2026-08-07

Най-големият релийз до момента: нова тарифна структура, пълна
интернационализация, onboarding, паритетни функции и оперативна зрялост.

### Добавено
- **Тарифи v3.0**: Premium €9.99/€99 · White-label €19.99/€199 · Agency 5/10
  €39.99/€79.99 (месечно/годишно, ДДС включен); смяна на план през Customer
  Portal; Discord native монетизация (Premium Apps entitlements + reconcile)
- **Onboarding**: welcome при покана на бота (+проверка на права), `/setup
  wizard` (4 стъпки), getting-started checklist в dashboard-а
- **Canned responses**: `/tag use|add|remove|list` + context menu „Reply with
  tag" (до 50/сървър)
- **Modal форми** при ≤5 текстови въпроса — потребители със затворени DM-и
  вече могат да отварят тикети; ReDoS-защитена regex валидация и в двата пътя
- **Context menus**: „Create ticket from message", „Open ticket for user"
- **Ticket priorities** (Low/Normal/High/Urgent): `/ticket priority`, панелен
  default, цветни badge-ове + филтър в dashboard-а, ред в `/stats`
- **`/stats`** в Discord (тикети 7д/30д, топ staff, среден рейтинг)
- **THREAD режим за панели** — тикети като private threads (create/close)
- **8 езика в бота** (en/bg/de/es/fr/it/nl/pl): горещият път + локализирани
  описания на командите (Discord ги показва на езика на потребителя)
- **Публични страници**: `/commands` (пълна документация), сравнения с
  Ticket Tool и Appy, гайдове „Best Discord ticket bot" и „GDPR & EU hosting"
- **Product tour** на landing-а — 6 реални скрийншота на dashboard-а
- **Транзакционни известия** (Discord DM): изтичащ trial, провалено плащане
- **top.gg vote webhook** + публичен брояч (готов за листване)
- **Бекъпи**: шифрован дневен pg_dump (systemd timer) + верификация +
  restore процедура + fail-closed pre-deploy дъмп
- CI (GitHub Actions: backend/bot/frontend) + Dependabot; 134 автоматични
  теста (от 55), вкл. пълно покритие на money пътищата

### Променено
- **AI отговорите: Anthropic Claude → Google Gemini Flash** (безплатен tier,
  временно решение); маркетингът е доставчик-неутрален, правните документи
  назовават Google + честно разкритие за free-tier обработката
- White-label вече е отделен tier (не част от Premium €9.99); заварените
  абонати са grandfather-нати без промяна
- Invite линкът иска least-privilege права (вече не Administrator)
- Правни документи: чл. 16(а) съгласия, ЗПЦСЦУ клауза, потребителска
  юрисдикция, Discord MoR, АРС (kzp.bg), breach срок 48h
- Единна embed палитра + брандиран footer (изключен за white-label)

### Поправено
- Админ revoke не отнемаше реално достъпа (plan оставаше платен)
- Agency-покрити сървъри губеха платени функции в batch job-ове (вкл.
  необратимо триене на транскрипти)
- `/admin schedule remove` беше неизползваема (ID несъответствие)
- Discord entitlement reconcile: пагинационен cursor + празен-списък guard
- Публичен followUp на premium upsell (ephemeral изтичане)
- 2 React Query бъга (вечен skeleton, двоен error+grid рендер)
- Bot health check вече отразява реалното gateway състояние
- Prisma schema↔migrations drift (12 индекса)

## [2.3.0] — по-рано
Историята преди 3.0.0 не е водена в този файл.
