#!/bin/bash
# Отделна роля за ПРИЛОЖЕНИЕТО — заради Row-Level Security.
#
# Пуска се веднъж, при първото вдигане на празен том (механизмът на официалния
# образ). Причината да съществува: суперпотребителят заобикаля политиките
# БЕЗУСЛОВНО, дори при `FORCE ROW LEVEL SECURITY`, а Postgres ОТКАЗВА да понижи
# bootstrap потребителя („The bootstrap user must have the SUPERUSER attribute").
# Тоест ако приложението върви с `POSTGRES_USER`, изолацията между фирмите е
# украса — политиките стоят, но никого не спират.
#
# Затова: bootstrap-ът остава `postgres` и не се ползва от приложението, а тук се
# създава `APP_DB_USER` — обикновена роля, СОБСТВЕНИК на схемата (Prisma иска
# това за миграциите), но БЕЗ суперпотребителски права.
set -euo pipefail

: "${APP_DB_USER:?APP_DB_USER липсва}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD липсва}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
	DO \$\$
	BEGIN
	  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_DB_USER}') THEN
	    CREATE ROLE "${APP_DB_USER}" LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER CREATEDB;
	  END IF;
	END
	\$\$;

	-- Собственик на базата и на схемата: Prisma прилага миграции (CREATE TABLE,
	-- ALTER, CREATE POLICY) и това иска собственост, не просто права.
	ALTER DATABASE "${POSTGRES_DB}" OWNER TO "${APP_DB_USER}";
	ALTER SCHEMA public OWNER TO "${APP_DB_USER}";
	GRANT ALL ON SCHEMA public TO "${APP_DB_USER}";
SQL

echo "✔ приложната роля ${APP_DB_USER} е създадена (без суперпотребител — RLS важи и за нея)"
