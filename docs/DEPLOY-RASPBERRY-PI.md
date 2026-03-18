# Deploying Path Backlog to a Raspberry Pi (HTTPS + daily backup)

This guide covers deploying the app on a Raspberry Pi with:
- **HTTPS** via nginx and Certbot (Let’s Encrypt)
- **Daily database backup** to another machine (cron or systemd timer)

For recovery you need: **this repo (from GitHub)** and a **restored database backup**. No other app state is stored outside the DB.

---

## 1. Prerequisites on the Pi

- Raspberry Pi OS (64-bit recommended), updated: `sudo apt update && sudo apt upgrade -y`
- Node.js 18+ (e.g. from NodeSource or `nvm`)
- Git: `sudo apt install -y git`
- (Optional) PM2 for running the app: `sudo npm install -g pm2`

---

## 2. Clone, build, and configure

```bash
# Clone (replace with your repo URL if different)
cd /home/pi  # or your preferred directory
git clone https://github.com/keyman12/Path-Backlog.git
cd Path-Backlog

# Server
cd server
npm install
cp .env.example .env
# Edit .env: set NODE_ENV=production, PORT=3000, SESSION_SECRET, RECOVERY_USER/PASSWORD, and optionally DATABASE_PATH, BASE_URL, SMTP_*
nano .env

# Client build (from repo root)
cd ../client
npm install
npm run build
```

**Important `.env` values for production:**

- `NODE_ENV=production`
- `PORT=3000` (or another port; nginx will proxy to it)
- `SESSION_SECRET` – use e.g. `openssl rand -hex 32`
- `RECOVERY_USER` / `RECOVERY_PASSWORD` – keep secret
- `BASE_URL` – your HTTPS URL (e.g. `https://backlog.yourdomain.com`) for emails/redirects
- `DATABASE_PATH` – optional; default is `server/data/backlog.sqlite`

---

## 3. Run the app (PM2 or systemd)

The server serves the built client from `client/dist` when `NODE_ENV=production`. Run it so it survives reboots.

**Option A – PM2**

```bash
cd /home/pi/Path-Backlog/server
pm2 start index.js --name path-backlog
pm2 save
pm2 startup   # run the command it prints so PM2 starts on boot
```

**Option B – systemd**

Create a unit file:

```bash
sudo nano /etc/systemd/system/path-backlog.service
```

Contents (adjust paths and user):

```ini
[Unit]
Description=Path Backlog API
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/Path-Backlog/server
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable path-backlog
sudo systemctl start path-backlog
sudo systemctl status path-backlog
```

Check that the app responds: `curl -s http://127.0.0.1:3000` (or your chosen PORT).

---

## 4. nginx as reverse proxy

Install nginx:

```bash
sudo apt install -y nginx
```

Create a site config (replace `backlog.yourdomain.com` with your domain):

```bash
sudo nano /etc/nginx/sites-available/path-backlog
```

```nginx
server {
    listen 80;
    server_name backlog.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Enable the site and reload nginx:

```bash
sudo ln -s /etc/nginx/sites-available/path-backlog /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Ensure your domain’s DNS A record points to the Pi’s IP. Test: `http://backlog.yourdomain.com`.

---

## 5. HTTPS with Certbot

Install Certbot and the nginx plugin:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Get a certificate (Certbot will adjust your nginx config):

```bash
sudo certbot --nginx -d backlog.yourdomain.com
```

Follow the prompts (email, agree to terms). Choose to redirect HTTP → HTTPS when asked.

Renewal is automatic via a systemd timer. Test renewal:

```bash
sudo certbot renew --dry-run
```

After Certbot, nginx will serve HTTPS and proxy to `http://127.0.0.1:3000`. Set `BASE_URL=https://backlog.yourdomain.com` in `.env` and restart the app.

---

## 6. Daily database backup to another server

The database is a single SQLite file (default: `server/data/backlog.sqlite`, or `DATABASE_PATH` in `.env`). Backing this up daily is enough for recovery (with the repo from GitHub).

### 6.1 Decide backup destination

- **Local server** = another machine on your network (e.g. NAS, Linux box). You’ll copy the file there with `scp` or `rsync` over SSH.

### 6.2 SSH key (so the Pi can copy without a password)

On the Pi:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/backup_key -N ""
```

Copy the **public** key to the backup server (replace `user` and `backup-server`):

```bash
ssh-copy-id -i ~/.ssh/backup_key.pub user@backup-server
```

Test: `ssh -i ~/.ssh/backup_key user@backup-server hostname` (should not ask for a password).

### 6.3 Backup script on the Pi

Create a script that copies the DB to the backup server (adjust paths and host):

```bash
nano /home/pi/Path-Backlog/scripts/backup-db.sh
```

Example (backup server host `192.168.1.100`, user `backup`, directory `backups/path-backlog`):

```bash
#!/bin/bash
set -e
BACKUP_HOST="user@192.168.1.100"   # or user@backup-server.local
BACKUP_DIR="backups/path-backlog"
DB_PATH="/home/pi/Path-Backlog/server/data/backlog.sqlite"
KEY="$HOME/.ssh/backup_key"
DATE=$(date +%Y-%m-%d)

if [ ! -f "$DB_PATH" ]; then
  echo "DB not found: $DB_PATH"
  exit 1
fi

# Copy to backup server with date in filename
rsync -avz -e "ssh -i $KEY" "$DB_PATH" "$BACKUP_HOST:$BACKUP_DIR/backlog-$DATE.sqlite"
# Optional: keep only last 30 days on the server (run on backup server or via ssh)
# ssh -i "$KEY" "$BACKUP_HOST" "find $BACKUP_DIR -name 'backlog-*.sqlite' -mtime +30 -delete"
```

If you don’t have `rsync`, you can use `scp`:

```bash
scp -i "$KEY" "$DB_PATH" "$BACKUP_HOST:$BACKUP_DIR/backlog-$DATE.sqlite"
```

Make it executable:

```bash
chmod +x /home/pi/Path-Backlog/scripts/backup-db.sh
```

Run once manually to confirm:

```bash
/home/pi/Path-Backlog/scripts/backup-db.sh
```

### 6.4 Schedule daily backup

**Option A – cron**

```bash
crontab -e
```

Add (runs at 2:30 every night; adjust path if needed):

```
30 2 * * * /home/pi/Path-Backlog/scripts/backup-db.sh >> /home/pi/path-backlog-backup.log 2>&1
```

**Option B – systemd timer**

Timer file:

```bash
sudo nano /etc/systemd/system/path-backlog-backup.timer
```

```ini
[Unit]
Description=Daily Path Backlog DB backup

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true

[Install]
WantedBy=timers.target
```

Service file:

```bash
sudo nano /etc/systemd/system/path-backlog-backup.service
```

```ini
[Unit]
Description=Path Backlog DB backup

[Service]
Type=oneshot
User=pi
ExecStart=/home/pi/Path-Backlog/scripts/backup-db.sh
```

Enable and start the timer:

```bash
sudo systemctl daemon-reload
sudo systemctl enable path-backlog-backup.timer
sudo systemctl start path-backlog-backup.timer
sudo systemctl list-timers
```

---

## 7. Recovery (what you need)

To restore after a failure:

1. **Code** – Clone the repo from GitHub (or copy your backup of the repo) on the Pi (or a new machine).
2. **Database** – Copy the latest `backlog-YYYY-MM-DD.sqlite` from your backup server into `server/data/backlog.sqlite` (or set `DATABASE_PATH` to that file).
3. **Config** – Restore or recreate `server/.env` (same values as production).
4. Rebuild client (`npm run build` in `client/`), run the server again, and point nginx at it as above.

No other persistent state lives outside the SQLite file and the repo; the backup + repo are enough for recovery.

---

## 8. Optional: prune old backups on the backup server

On the **backup server** (not the Pi), you can add a cron job to delete backups older than e.g. 30 days:

```bash
# On backup server, crontab -e
0 3 * * * find /home/user/backups/path-backlog -name 'backlog-*.sqlite' -mtime +30 -delete
```

Adjust path and user to match your setup.

---

## Quick reference

| Item            | Location / command |
|-----------------|--------------------|
| App (production)| `server/` with `NODE_ENV=production`, serves `client/dist` |
| Database        | `server/data/backlog.sqlite` or `DATABASE_PATH` |
| Backup script   | `scripts/backup-db.sh` (create as above) |
| nginx config    | `/etc/nginx/sites-available/path-backlog` |
| HTTPS           | `sudo certbot --nginx -d your-domain` |
| Daily backup    | Cron or systemd timer calling `backup-db.sh` |
