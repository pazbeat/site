#!/bin/sh
# Закрывает сайт для всех, кроме Cloudflare.
#
# Зачем: без этого сервер доступен по IP напрямую, и защиту Cloudflare
# (фильтрация ботов, ограничение запросов, скрытие адреса) можно обойти,
# просто обратившись к 185.129.51.231. Так же устроена защита sert.imbir.kz.
#
# ЗАПУСКАТЬ ТОЛЬКО ПОСЛЕ того, как домен переведён на Cloudflare с
# включённым проксированием (оранжевое облачко) и выпущен сертификат —
# иначе сайт станет недоступен вообще, включая проверку домена.
#
# Откат: ufw allow 80/tcp && ufw allow 443/tcp
set -e

echo "Обновляю списки адресов Cloudflare…"
V4=$(curl -fsS --max-time 30 https://www.cloudflare.com/ips-v4)
V6=$(curl -fsS --max-time 30 https://www.cloudflare.com/ips-v6)
[ -n "$V4" ] || { echo "не получил список IPv4 — прекращаю"; exit 1; }

echo "Снимаю общий доступ к 80 и 443…"
ufw --force delete allow 80/tcp  2>/dev/null || true
ufw --force delete allow 443/tcp 2>/dev/null || true

echo "Разрешаю только Cloudflare…"
for ip in $V4 $V6; do
  [ -n "$ip" ] || continue
  ufw allow from "$ip" to any port 80  proto tcp >/dev/null
  ufw allow from "$ip" to any port 443 proto tcp >/dev/null
done

echo "Готово. Правил: $(ufw status numbered | grep -c ALLOW)"
echo "SSH (22) остаётся открытым — иначе доступ к серверу пропадёт."
