#!/usr/bin/env bash
set -euo pipefail

required_ports=(80 443)

echo "Checking UFW status..."
if ! command -v ufw >/dev/null 2>&1; then
  echo "UFW is not installed."
  exit 1
fi

sudo ufw status verbose

for port in "${required_ports[@]}"; do
  if sudo ufw status | grep -Eq "${port}/tcp[[:space:]]+ALLOW"; then
    echo "UFW allows ${port}/tcp"
  else
    echo "UFW does not allow ${port}/tcp"
    exit 1
  fi
done

echo "Checking listening ports..."
if ! command -v ss >/dev/null 2>&1; then
  echo "The ss utility is not installed."
  exit 1
fi

for port in "${required_ports[@]}"; do
  if sudo ss -tulpen | grep -Eq ":${port}[[:space:]]"; then
    echo "Something is listening on ${port}/tcp"
  else
    echo "Nothing is listening on ${port}/tcp"
    exit 1
  fi
done

echo "Port check passed."
