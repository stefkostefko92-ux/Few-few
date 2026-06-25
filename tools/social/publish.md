# Публикуване и контент-двигател (Социалджията v2.0)

Изисква креденшъли/услуги → затова е документиран поток, не вграден скрипт. Агентът
**произвежда активи + план**; публикуването минава през официални API (никога скрейпъри).

## Календар + публикуване
**Postiz** (self-hosted, AGPL-3.0, 30+ платформи, REST API) като гръбнак:
```bash
docker run -d -p 5000:5000 ghcr.io/gitroomhq/postiz-app:latest   # зад reverse proxy
```
Драйв-вай от pipeline: `clip.sh all` → C2PA подпис → Postiz API за насрочване.

## Официални API (по платформа)
- **TikTok Content Posting API** — по подразбиране **draft/inbox** режим (без одит). Direct Post иска одобрение (седмици); без одит постовете са `SELF_ONLY`.
- **Instagram Graph API** (Reels) — ~25 публикации/акаунт/24ч.
- **YouTube Data API** (Shorts), **LinkedIn** — стандартни OAuth потоци.
Креденшълите живеят на сървъра (sops/age), никога в репото.

## Затворен цикъл
1. **Trend-sensing:** `tools/social/trends.py` + TikTok Creative Center (ръчно).
2. **Партидно производство:** 1 дълго → много shorts (SupoClip/ViralMint hook-detection) → `clip.sh` финал (9:16, captions, −14 LUFS).
3. **Faceless серии (по избор):** HeyGen Video Agent API + ElevenLabs глас (script→MP4 webhook).
4. **Disclosure:** `tools/social/c2pa-sign.sh in out --ai` + видим етикет.
5. **Публикуване:** Postiz/официални API, draft-first, човек одобрява.
6. **Анализ → итерация:** издърпай метрики, A/B 2–3 hook/thumbnail варианта, пази победителите като пресети в brand-kit.

## Граници (важно)
- Стой в официалните API — скрейпъри = бан риск.
- Автоматизацията чете като спам → човек в цикъла, лимити на каданса, без engagement ботове.
- Музика/сток — само лицензирани. Платформите свалят C2PA при re-upload (провенанс ≠ доказателство).
