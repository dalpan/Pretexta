#!/usr/bin/env bash
# Create .env from .env.example with fresh random secrets. Never overwrites an existing .env.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  exit 0
fi

rand() { python3 -c "import secrets; print(secrets.token_urlsafe($1))"; }

admin_password="$(rand 12)"
sed \
  -e "s|^JWT_SECRET=.*|JWT_SECRET=$(rand 48)|" \
  -e "s|^MONGO_PASSWORD=.*|MONGO_PASSWORD=$(rand 24)|" \
  -e "s|^SEED_ADMIN_PASSWORD=.*|SEED_ADMIN_PASSWORD=${admin_password}|" \
  .env.example > .env
chmod 600 .env

echo "Created .env with random secrets."
echo "Admin login: $(grep '^SEED_ADMIN_USERNAME=' .env | cut -d= -f2) / ${admin_password}"
echo "(also stored in .env as SEED_ADMIN_PASSWORD)"
