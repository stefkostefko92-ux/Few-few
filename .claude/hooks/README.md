# Hooks — `.claude/hooks/`

Куки, наложени от харнеса (Claude Code). Регистрират се в `.claude/settings.json`.

## Активни (регистрирани в settings.json)
- **`memory-preload.mjs`** (`SubagentStart`) — инжектира „Проверени поуки" + доктрината за сигурност +
  общата процедура (`_memory/PROCEDURE.md`) в контекста на всеки агент при старт.
- **`memory-capture.mjs`** (`SubagentStop`) — изважда последния ```learn блок от транскрипта, записва
  verified → памет / друго → Карантина, обновява таблото, авто-commit/push (flock-сериализиран).

## Активни предпазители (регистрирани в settings.json)
Отбранителни, **fail-open** (хук-грешка никога не спира работата), тествани
(`tools/hooks/guards.test.mjs`). Регистрирани като `PreToolUse`/`PostToolUse` (виж settings.json):

- **`guard-dangerous.mjs`** (`PreToolUse` matcher `Bash`) — блокира САМО еднозначно катастрофални команди
  (`rm -rf /`, fork bomb, `mkfs`, `dd of=/dev/sd…`, `curl|sh`, `git push --force main`). Всичко останало
  минава — не пречи на нормалната работа.
- **`guard-secrets.mjs`** (`PostToolUse` matcher `Write|Edit`) — ранно предупреждение, ако тъкмо записан
  файл съдържа високо-уверен секрет-шаблон (Stripe/AWS/GitHub/PEM/Slack/Google). Пропуска fixture/test/
  eval/scratch пътища. Реалният hard gate остава `tools/security/secret-scan.mjs` при commit/CI.

Регистрацията (вече в settings.json):

```json
"PreToolUse": [
  { "matcher": "Bash", "hooks": [
    { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-dangerous.mjs\"", "timeout": 10 } ] }
],
"PostToolUse": [
  { "matcher": "Write|Edit", "hooks": [
    { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-secrets.mjs\"", "timeout": 10 } ] }
]
```

**Договор:** всеки хук чете JSON от stdin (`{tool_name, tool_input, …}`). `PreToolUse` блокира при **exit 2**
(причината на stderr); `PostToolUse` surface-ва предупреждение при exit 2. Всичко друго → exit 0 (разреши).
Пробвай ръчно: `echo '{"tool_input":{"command":"rm -rf /"}}' | node .claude/hooks/guard-dangerous.mjs`.
