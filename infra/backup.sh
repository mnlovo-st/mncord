#!/usr/bin/env sh
# Nightly encrypted database backup. Keeps 14 days locally; copy the folder to Oracle Object Storage
# (free 20 GB) with rclone if configured. Cron: 0 4 * * * /opt/mncord/infra/backup.sh
set -eu
cd "$(dirname "$0")"
DEST="${BACKUP_DIR:-/opt/mncord/backups}"
mkdir -p "$DEST"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
# age public key in backup.pub (generate with: age-keygen -o backup.key; keep backup.key OFF the server)
docker compose exec -T postgres pg_dump -U mncord -d mncord --format=custom \
  | age -R backup.pub > "$DEST/mncord-$STAMP.dump.age"
find "$DEST" -name 'mncord-*.dump.age' -mtime +14 -delete
if command -v rclone >/dev/null 2>&1 && rclone listremotes | grep -q '^oci:'; then
  rclone copy "$DEST" oci:mncord-backups --max-age 2d
fi
echo "backup ok: $DEST/mncord-$STAMP.dump.age"
