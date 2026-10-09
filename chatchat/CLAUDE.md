# CLAUDE.md — ChatChat (AI техническа поддръжка за табла на асансьори)

Платформа за техници на място и вътрешна поддръжка на производител на табла за управление на
асансьори (quadri di manovra): въпрос → търсене във версионирана база знания (документи, кодове за
грешка, приложимост по модел/HW/FW) → Claude предлага диагноза с цитати → **детерминистичен Safety
Gate** → техникът вижда проверими стъпки или ескалира с тикет. Изпълнява спецификацията „AI Technical
Support Platform v1.1“ (09.10.2026), фаза F1 (MVP) от пътната карта §18. Самостоятелен продукт —
`cd chatchat/` за всичко. Домейн: chatchat.carbonstealth.eu (порт 4330).

## Стек

Node ≥22 · TypeScript strict (ESM, `NodeNext`) · Express 5 · Zod 4 на всеки външен вход · Prisma 6 +
PostgreSQL 16 (пълнотекстово `tsvector` + GIN) · pino (без съдържание и PII) · Argon2id · Claude през
`@anthropic-ai/vertex-sdk` **само в ЕС** (`VERTEX_REGION` = `eu`/`europe-*`) · UI: ванилови ES модули
в `public/` без билд, строг CSP (`script-src 'self'`, без inline) · тестове `node:test` през tsx.

## Команди (гейтът)

```bash
npm ci
npm run gate              # prettier + typecheck (src + tests) + unit тестове + build — „готово“ = зелено
npm test                  # unit: AI оркестратор (фалшив модел), речник за безопасност, gate, retrieval
npm run test:integration  # иска жива PostgreSQL: DATABASE_URL=postgresql://…/chatchat_test
npm run dev               # :4330, чете .env (PUBLIC_BASE_URL, DATABASE_URL, SESSION_PEPPER, MFA_ENC_KEY; VERTEX_* по избор)
npm run tenant:create     # след build: клиент + първи потребител от средата (TENANT_*, USER_*);
                          # без USER_PASSWORD печата еднократен линк /reset#… (72 ч)
npm run user:create       # нов потребител в съществуващ клиент (същото)
npm run user:reset        # USER_EMAIL → нов линк за парола (24 ч); RESET_MFA=1 нулира и TOTP
npm run retention         # дневно: стари сесии; затворени случаи само с RETENTION_CASE_DAYS
```

Без `VERTEX_PROJECT_ID` приложението работи, но `/api/v1/chat/messages` връща 503 `ai_unavailable`
(fail-closed, без резервен доставчик).

## Подредба

```
src/
  domain/      договорите: контекст (§10.1), отговор (§14.3 → ModelDiagnosis + DiagnosticAnswer), версии, нормализация
  retrieval/   хибридното търсене (§8): точно (кодове, клеми) → пълнотекстово → приложимост → прагове §8.3
  store/       KnowledgeStore върху Prisma (tenant + PUBLISHED + аудитория във ВСЯКА заявка), снимка на знанието (§13.3)
  ai/          оркестраторът: промпт, инструменти само за четене, доказателствен пакет E1…En, Vertex клиент
  safety/      Safety Gate (§11.2) · screen.ts (свободен текст + връзка стъпка↔източник) · речник IT/EN/BG
               (terms.ts данни · patterns.ts блокове · lexicon.ts правила + сгъване срещу обфускация) · цитати · таван · ескалация
  auth/        сесии в базата (httpOnly cookie) + отнемане/кука, RBAC матрица §12.4, CSRF guards,
               TOTP (totp.ts от korpora, mfa.ts — пазач срещу повторен код)
  routes/      тънки рутери: auth, auth-mfa, catalog, cases, chat, tickets, audit, saved-filters,
               admin-{catalog,documents,errors}, admin-users (директория) · admin-user-actions · admin-subject (GDPR)
  services/    случаи (достъп, номера, хронология, обобщение на тикет, изгледи), приемане на документи,
               потребители (линкове, ранг, масови), филтри (позволени полета), субект (експорт/изтриване), табла (QR)
  cli/         tenant.ts — клиент/потребител/линк за парола от средата
public/        интерфейсът (вход + работно пространство), i18n/{it,en,bg}.json
```

## Инварианти (не ги отслабвай)

- **AI вижда само PUBLISHED** документи и кодове, само на своя клиент и само в аудиторията на ролята;
  в портален случай — само `PORTAL`, който и да пита (AC-18). Филтрите са в `store/knowledge.ts`, не в модела.
- **Safety Gate е след модела и е детерминистичен; изходът на модела е враждебен.** Класът на стъпка =
  по-строгият от модела и речника; мост/байпас в стъпката → махната + `blocked`, каквото и да цитира;
  SAFETY_RELEVANT минава само ако публикувана safety процедура ДОКУМЕНТИРА стъпката (`screen.ts`) и иска
  човешко потвърждение; DIRECT_COMMAND — никога. Всеки свободен текст (summary, причини, decision points,
  бележки) минава през речника. Нивото „strong“ е само за кода на случая и не расте с инструменти
  (`cappedLevel`). Цитат извън пакета, несъвместим или не-дословен се изпуска (NFR-10).
- **AI отговорът пази аудиториите, с които е търсено** (`CaseMessage.audiences`); читател без тях вижда
  `gate.audienceWithheld`. Свободният текст минава през `redactPii` (`domain/pii.ts`) преди запис и модела.
- **Без съвместим източник моделът НЕ се вика** — `noEvidenceAnswer` (AC-04).
- **Документите са недоверени данни** — в промпта между маркери със случаен жетон; инструментите не
  приемат tenant/модел/аудитория от модела. Ticket/изход са действия на човека, не инструменти на AI.
- Всеки AI отговор пази `knowledgeSnapshotId` + `promptVersion` (AC-09); смяна на промпта/правилата →
  нов `PROMPT_VERSION` (`ai/prompt.ts`) / `GATE_VERSION` (`safety/gate.ts`).
- Одитът е верига (`audit.ts`, advisory lock, каноничен JSON) — никога съдържание на разговор, парола или токен.
  Администраторът на клиента НЕ вижда вход/изход/MFA проверки (`routes/audit.ts`, чл. 4 Statuto dei
  Lavoratori) — само платформеният. Причината на админ действие е в одита, маскирана с `redactPii`.
- **Втори фактор:** персоналът (SUPPORT, ENGINEERING, KNOWLEDGE_OWNER, TENANT_ADMIN, PLATFORM_ADMIN) е
  задължен — без TOTP стига само до `/auth/me`, `/auth/logout`, `/auth/mfa/*` (403 `mfa_setup_required`);
  включен и неминат → 401 `mfa_required`. Проверката е в `requireUser`/`requireCapability` (`mfaBlock`) —
  нов маршрут към данни ползва тях, никога само `requireSession`. Тайната — AES-256-GCM с `MFA_ENC_KEY`.
- **Сесиите се отнемат само през `revokeUserSessions`** (`auth/sessions.ts`, AC-16: деактивиране, роля,
  фирма, изтекъл срок, нова парола, MFA нулиране, изтриване); realtime модул се закача с
  `onSessionsRevoked`. В транзакция — `announceRevocation` след commit.
- **Парола никога не се показва и не се праща:** само еднократен линк `/reset#<токен>` (HMAC в
  `PasswordReset`), върнат веднъж на администратора/CLI. Управлението е в клиента (tenantId), без себе си
  и без по-висок ранг (`targetProblem`, `roleRank`).
- Порталният техник вижда РОЛЯТА на служителя, не името (`services/case-views.ts`, `authorRole`).
- Нова ревизия на документ (supersedes) → кодовете за грешка на старата стават REVIEW и се връщат в
  отговора на publish; `relink` → `publish`. QR токенът на таблото — само HMAC в `Device.qrTokenHash`.
- Кодовете, които gate/сървърът връщат (`gate.*`, `ctx.*`, `collect.*`, `ai.*`, грешките на API), се
  превеждат в `public/i18n/*.json` — нов код = превод на трите езика (кодовете на F2 администрирането
  и MFA още чакат UI стъпката).
- Миграции: само `prisma migrate deploy` на сървъра, никога `db push`. Файл >300 реда → раздели.
- Продуктите/документите в тестовете са фикстури; реални данни на клиента в репото — никога.

## Извън тази стъпка (пътна карта §18)

Снимки и прикачени файлове (F2, искат антивирус), извличане от PDF/DOCX, семантично търсене с
pgvector, преглед на схеми, канали/директни съобщения/присъствие/обаждания (§12.3), UI за
директорията, MFA, QR и запазените филтри (API-то е готово), OIDC (Entra ID), ретенция, оценъчен набор
от реални случаи (§16.2).
