#!/bin/sh
set -e
if [ -d /data ]; then
  export DATABASE_URL="file:/data/inbox.db"
else
  export DATABASE_URL="${DATABASE_URL:-file:./prisma/dev.db}"
fi
npx prisma db push
exec npx next start --hostname 0.0.0.0 --port "${PORT:-3000}"
