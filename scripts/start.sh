#!/bin/sh
set -e
export DATABASE_URL="${DATABASE_URL:-file:./prisma/dev.db}"
npx prisma db push
exec npx next start --hostname 0.0.0.0 --port "${PORT:-3000}"
