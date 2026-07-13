#!/bin/sh
# Применяем миграции перед стартом сервера (наша БД — источник истины).
set -e

echo "→ prisma migrate deploy"
npx prisma migrate deploy

# Первичный сид справочников только в пустую БД (сид идемпотентен)
if [ "${RUN_SEED:-0}" = "1" ]; then
  echo "→ prisma db seed"
  npx prisma db seed || echo "seed skipped/failed (не критично)"
fi

echo "→ starting: $*"
exec "$@"
