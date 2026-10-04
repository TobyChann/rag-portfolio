#!/usr/bin/env bash
# One-time copy of the app's data from Supabase into the production Postgres
# container. Run from the repo root on the server, with the stack's postgres
# service up and the backend STOPPED (so nothing writes mid-copy):
#
#   docker compose -f docker-compose.prod.yml up -d postgres
#   SUPABASE_URL='postgresql://...' deploy/migrate-from-supabase.sh
#
# SUPABASE_URL is the Supabase connection string (Project settings → Database →
# Session pooler). Only the public schema is copied — that's where the app's
# tables live; Supabase's own schemas (auth, storage…) are skipped.
set -euo pipefail

: "${SUPABASE_URL:?set SUPABASE_URL to the Supabase connection string}"
# A .env saved on Windows leaves a trailing \r, which libpq reads as part of
# the database name ("database "postgres" does not exist").
SUPABASE_URL="${SUPABASE_URL%$'\r'}"
COMPOSE="docker compose -f docker-compose.prod.yml"
DUMP="/tmp/supabase-public-$(date +%Y%m%d-%H%M%S).sql"

echo "→ Dumping public schema from Supabase to $DUMP"
# pg_dump from a throwaway postgres:17 container, so the server needs no
# Postgres client installed. --no-owner/--no-acl drop Supabase-specific roles.
# Visitor analytics (visitors, queries) come across as empty tables: the test
# database's sessions and questions shouldn't count as production traffic.
docker run --rm postgres:17 pg_dump "$SUPABASE_URL" \
  --schema=public --no-owner --no-acl --format=plain \
  --exclude-table-data=public.visitors --exclude-table-data=public.queries > "$DUMP"

echo "→ Restoring into the production database"
# A dump of an explicitly selected schema starts with CREATE SCHEMA public,
# which a fresh database already has — drop that line. --single-transaction +
# ON_ERROR_STOP: any error rolls the whole restore back, never half-applied.
sed '/^CREATE SCHEMA public;$/d' "$DUMP" | \
  $COMPOSE exec -T postgres psql -U portfolio -d portfolio -v ON_ERROR_STOP=1 --single-transaction -q

echo "→ Row counts after restore:"
$COMPOSE exec -T postgres psql -U portfolio -d portfolio -c "
  SELECT 'documents' AS t, count(*) FROM documents UNION ALL
  SELECT 'folders', count(*) FROM folders UNION ALL
  SELECT 'skills', count(*) FROM skills UNION ALL
  SELECT 'queries', count(*) FROM queries UNION ALL
  SELECT 'resumes', count(*) FROM resumes;"

echo "✓ Done. The dump is kept at $DUMP — delete it once you've checked the site."
