#!/bin/sh
# Ежедневный бэкап PostgreSQL с ротацией 30 дней (PRD §9.12).
# Запускается контейнером `backup` из docker-compose раз в сутки.
# Требует переменную DATABASE_URL и утилиту pg_dump (postgresql-client).
#
# Оболочка — POSIX sh, а не bash: образ postgres:16-alpine идёт без bash,
# и compose запускает файл через `sh`.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/var/backups/imbir}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/imbir-$STAMP.sql.gz"
# Дамп пишется во временный файл и попадает на своё место только целым.
# Иначе упавший pg_dump оставлял пустой .sql.gz, и тот считался бэкапом:
# поймано живьём 2026-08-21 — в каталоге лежал файл на 20 байт после того,
# как база на секунду оказалась недоступна.
TMP="$OUT.part"

mkdir -p "$BACKUP_DIR"

# --no-owner/--no-privileges — переносимо между окружениями; gzip — сжатие.
#
# Схему pgboss не сохраняем: это журнал выполненных заданий очереди, он
# копится тысячами строк в сутки и втрое раздувал дамп, ничего не давая при
# восстановлении. Очередь заводит свои таблицы сама при старте приложения, а
# отложенная доставка держит дату в собственной таблице (модель sweeper), так
# что потерять из-за этого нечего.
if ! pg_dump "$DATABASE_URL" --no-owner --no-privileges --exclude-schema=pgboss | gzip > "$TMP"; then
  rm -f "$TMP"
  echo "backup FAILED: pg_dump не отработал, файл не создан" >&2
  exit 1
fi

# Проверка восстановимости (PRD §9.12): архив открывается и не пуст
if ! gzip -t "$TMP" 2>/dev/null; then
  rm -f "$TMP"
  echo "backup FAILED: архив повреждён" >&2
  exit 1
fi
if ! zcat "$TMP" | grep -q '^CREATE TABLE'; then
  rm -f "$TMP"
  echo "backup FAILED: в дампе нет ни одной таблицы" >&2
  exit 1
fi

mv "$TMP" "$OUT"
echo "backup written: $OUT ($(du -h "$OUT" | cut -f1))"

# Ротация: удаляем дампы старше RETENTION_DAYS и хвосты неудачных попыток
find "$BACKUP_DIR" -name 'imbir-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name 'imbir-*.sql.gz.part' -mtime +1 -delete
echo "rotation done (kept last $RETENTION_DAYS days)"
