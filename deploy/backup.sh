#!/usr/bin/env bash
# Nightly compressed dump of the production database, keeping the last 14.
# Install from the repo root on the server. The VM's clock is UTC, so 19:00
# here is 03:00 in Singapore. Ubuntu Minimal images ship without cron:
# `sudo apt-get install -y cron` first.
#
#   (crontab -l 2>/dev/null; echo "0 19 * * * cd $PWD && deploy/backup.sh >> $HOME/backups/backup.log 2>&1") | crontab -
#
# Restore one with:
#   gunzip -c ~/backups/portfolio-YYYYMMDD-HHMMSS.sql.gz | \
#     docker compose -f docker-compose.prod.yml exec -T postgres psql -U portfolio -d portfolio
#
# These live on the VM's own disk, which protects against mistakes but not
# against losing the VM — copy them off occasionally (or to Object Storage).
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP=14
mkdir -p "$BACKUP_DIR"

FILE="$BACKUP_DIR/portfolio-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U portfolio -d portfolio --no-owner | gzip > "$FILE"
echo "$(date -Is) wrote $FILE ($(du -h "$FILE" | cut -f1))"

# Drop all but the newest $KEEP dumps.
ls -1t "$BACKUP_DIR"/portfolio-*.sql.gz | tail -n +$((KEEP + 1)) | xargs -r rm --
