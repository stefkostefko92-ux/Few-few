#!/bin/sh
# Avvio del contenitore applicativo di Staffe.
#
#   1) attende che PostgreSQL accetti connessioni;
#   2) allinea lo schema (migrazioni versionate se ci sono, altrimenti db push);
#   3) passa il controllo a Next.js.
#
# Idempotente: un riavvio non rompe nulla. Fail closed: se lo schema non si può
# applicare, il contenitore muore invece di servire un'applicazione mezza rotta
# (la sonda /api/health risponderebbe comunque 503 e il deploy tornerebbe indietro).
set -e

echo "→ Attendo il database…"
ATTEMPTS=0
until npx prisma db execute --schema prisma/schema.prisma --stdin <<'SQL' >/dev/null 2>&1
SELECT 1;
SQL
do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 30 ]; then
    echo "✖ Il database non ha risposto in tempo (60 s)."
    exit 1
  fi
  echo "  …tentativo $ATTEMPTS, attendo 2 s"
  sleep 2
done

# Ci sono migrazioni versionate (prisma/migrations/<timestamp>_nome/)?
HAS_MIGRATIONS=0
if [ -d prisma/migrations ]; then
  # Nota: se il glob non trova nulla, `sh` lascia il pattern letterale → -f falso.
  for m in prisma/migrations/*/migration.sql; do
    if [ -f "$m" ]; then HAS_MIGRATIONS=1; fi
    break
  done
fi

if [ "$HAS_MIGRATIONS" = "1" ]; then
  echo "→ Applico le migrazioni (prisma migrate deploy)…"
  # Ogni modifica distruttiva passa da un file SQL leggibile e revisionato,
  # non da un `db push` silenzioso.
  if ! OUT=$(npx prisma migrate deploy 2>&1); then
    echo "$OUT"
    if echo "$OUT" | grep -q "P3005"; then
      # Database già popolato ma senza cronologia delle migrazioni. NON risolviamo
      # da soli: marcare una migrazione come "applicata" senza eseguirne l'SQL
      # lascerebbe l'applicazione senza tabelle in modo permanente. Decide l'operatore.
      echo "✖ Database preesistente senza cronologia (P3005)."
      echo "  Fai il backup, poi una volta sola:"
      echo "    docker compose run --rm app npx prisma migrate resolve --applied <nome_migrazione_iniziale>"
    fi
    echo "✖ migrate deploy fallito — mi fermo (vedi DEPLOY.md → Rollback)."
    exit 1
  fi
  echo "$OUT"
else
  # Nessuna migrazione nel repository (fase iniziale del prodotto): creiamo lo
  # schema con `db push`. SENZA --accept-data-loss: se la modifica cancellerebbe
  # dati, Prisma si rifiuta e il deploy si ferma. È il comportamento voluto.
  echo "→ Nessuna migrazione versionata: allineo lo schema con prisma db push…"
  npx prisma db push --skip-generate
fi

echo "✔ Schema allineato. Avvio dell'applicazione."
exec "$@"
