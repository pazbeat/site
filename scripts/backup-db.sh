#!/usr/bin/env bash
# Ежедневный бэкап PostgreSQL с ротацией 30 дней (PRD §9.12).
# Запуск по cron: 0 3 * * *  /app/scripts/backup-db.sh >> /var/log/imbir-backup.log 2>&1
# Требует переменную DATABASE_URL и утилиту pg_dump (postgresql-client).
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/imbir}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/imbir-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

# --no-owner/--no-privileges — переносимо между окружениями; gzip — сжатие
pg_dump "$DATABASE_URL" --no-owner --no-privileges | gzip > "$OUT"
echo "backup written: $OUT ($(du -h "$OUT" | cut -f1))"

# Ротация: удаляем дампы старше RETENTION_DAYS
find "$BACKUP_DIR" -name 'imbir-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
echo "rotation done (kept last $RETENTION_DAYS days)"

# Проверка восстановимости (PRD §9.12): последний дамп открывается gzip'ом
gzip -t "$OUT" && echo "integrity OK"
