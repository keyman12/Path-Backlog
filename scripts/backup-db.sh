#!/bin/bash
# Daily backup of Path Backlog SQLite DB to a remote server.
# 1. Set BACKUP_HOST and BACKUP_DIR below (and optionally SSH key path).
# 2. Ensure SSH key is installed on backup server: ssh-copy-id -i ~/.ssh/backup_key user@host
# 3. Schedule with cron or systemd (see docs/DEPLOY-RASPBERRY-PI.md).

set -e
BACKUP_HOST="user@192.168.1.100"   # e.g. user@nas.local or user@backup-server
BACKUP_DIR="backups/path-backlog"  # path on the backup server
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB_PATH="${DATABASE_PATH:-$SCRIPT_DIR/../server/data/backlog.sqlite}"
KEY="${BACKUP_KEY:-$HOME/.ssh/backup_key}"
DATE=$(date +%Y-%m-%d)

if [ ! -f "$DB_PATH" ]; then
  echo "DB not found: $DB_PATH"
  exit 1
fi

rsync -avz -e "ssh -i $KEY -o StrictHostKeyChecking=no" "$DB_PATH" "$BACKUP_HOST:$BACKUP_DIR/backlog-$DATE.sqlite"
echo "Backed up to $BACKUP_HOST:$BACKUP_DIR/backlog-$DATE.sqlite"
