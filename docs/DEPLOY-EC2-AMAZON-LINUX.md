# Deploying Path Backlog on AWS EC2 (Amazon Linux, HTTPS + daily backup)

This guide covers deploying the app on an **EC2 instance running Amazon Linux 2 or 2023** with:
- **HTTPS** via nginx and Certbot (Let’s Encrypt)
- **Daily database backup** to another machine (cron or systemd timer)

For recovery you need: **this repo (from GitHub)** and a **restored database backup**. No other app state is stored outside the DB.

---

## 0. Co-existing with path-mcp-server (same EC2)

The **backlog** app will be served at **backlog.path2ai.tech**, with that domain pointing to this server. The **path-mcp-server** (MCP) is already running on this instance (e.g. at **mcp.path2ai.tech**). You are adding Path Backlog as a second site; the two apps use different ports and hostnames.

**Ports:** Use whichever port is **free**. Typically MCP runs on **3005**, so Path Backlog uses **3000**. If your MCP is instead on 3000, run Path Backlog on **3005** and swap the ports in the table below.

| Service        | Hostname              | Port (typical) | nginx config (existing or new)     |
|----------------|-----------------------|----------------|------------------------------------|
| path-mcp-server| `mcp.path2ai.tech`    | **3005**       | `/etc/nginx/conf.d/path-mcp.conf` (do not modify) |
| Path Backlog   | `backlog.path2ai.tech`| **3000**       | `/etc/nginx/conf.d/path-backlog.conf` (add new)   |

- **Do not** change the existing MCP port or nginx config. Pick the port for Backlog so it does not conflict (3000 if MCP is on 3005; 3005 if MCP is on 3000).
- **Do not** remove or overwrite the existing MCP nginx site. You will **add** a new config file for the backlog only.
- When running Certbot, request a certificate **only** for **backlog.path2ai.tech** so Certbot only updates the new server block.

---

## 1. EC2 and security group

- Launch an **Amazon Linux 2** or **Amazon Linux 2023** AMI (64-bit), or use your **existing** EC2 instance that runs path-mcp-server.
- **Security group**: allow inbound **22** (SSH), **80** (HTTP for Certbot), and **443** (HTTPS). Restrict SSH by your IP if possible. (If MCP is already on this instance, these are likely already open.)
- Associate an **Elastic IP** if you want a fixed public IP.
- Point your **backlog** domain’s **A record** (e.g. `backlog.path2ai.tech`) to this instance’s public IP. The MCP domain (`mcp.path2ai.tech`) can point to the same IP.

---

## 2. Prerequisites on Amazon Linux

SSH in, then install what’s missing. **If path-mcp-server is already deployed on this instance, Node.js and nginx are likely already installed** — skip those steps and just ensure Git is available for cloning the Backlog repo.

```bash
# Update system
sudo dnf update -y

# Git (needed to clone Path-Backlog)
sudo dnf install -y git

# Node.js 18+ (skip if already installed for MCP)
# Amazon Linux 2023:
sudo dnf install -y nodejs

# Amazon Linux 2 (if nodejs is old): use NodeSource or nvm
# Option A – NodeSource (Node 20 LTS):
# curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
# sudo dnf install -y nodejs
# Option B – nvm (no sudo):
# curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
# source ~/.bashrc && nvm install 20 && nvm use 20

node -v   # should be v18+
npm -v
```

**nginx**: If you already have the MCP site, nginx is installed and running. If this is a fresh instance, run: `sudo dnf install -y nginx`.

**(Optional) PM2 for process management** (if not already used for MCP):

```bash
sudo npm install -g pm2
```

If you already use PM2 for path-mcp-server, you will simply add a second process (path-backlog) later; both will run side by side.

---

## 3. Clone, build, and configure

Use `ec2-user`’s home (or another user you run the app as):

```bash
cd /home/ec2-user
git clone https://github.com/keyman12/Path-Backlog.git
cd Path-Backlog

# Server
cd server
npm install
cp .env.example .env
nano .env   # set NODE_ENV=production, PORT=3000, SESSION_SECRET, RECOVERY_*, BASE_URL, etc.

# Client build (from repo root)
cd ../client
npm install
npm run build
```

**Important `.env` values:**

- `NODE_ENV=production`
- `PORT=3000` (or **3005** if MCP is already using 3000 — see section 0)
- `SESSION_SECRET` – e.g. `openssl rand -hex 32`
- `RECOVERY_USER` / `RECOVERY_PASSWORD` – keep secret
- `BASE_URL` – your HTTPS URL (e.g. `https://backlog.yourdomain.com`)
- `DATABASE_PATH` – optional; default is `server/data/backlog.sqlite`

---

## 4. Run the app (PM2 or systemd)

**Option A – PM2**

```bash
cd /home/ec2-user/Path-Backlog/server
pm2 start index.js --name path-backlog
pm2 save
pm2 startup   # run the command it prints so PM2 starts on boot
```

**Option B – systemd**

```bash
sudo nano /etc/systemd/system/path-backlog.service
```

Contents (adjust paths if not using `ec2-user`):

```ini
[Unit]
Description=Path Backlog API
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/Path-Backlog/server
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node index.js
# If MCP uses 3000, set PORT=3005 above and use 3005 in nginx path-backlog.conf
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

Check: `curl -s http://127.0.0.1:3000` (or your PORT).

---

## 5. nginx as reverse proxy

**If path-mcp-server is already on this instance:** nginx is already configured for `mcp.path2ai.tech` (e.g. in `/etc/nginx/conf.d/path-mcp.conf`). **Do not modify that file.** Add a **new** config file only for Path Backlog.

Create the Backlog site config. Use your backlog hostname (e.g. `backlog.path2ai.tech`):

```bash
sudo nano /etc/nginx/conf.d/path-backlog.conf
```

```nginx
# Path Backlog app — separate server block; MCP is in path-mcp.conf
# Use 3000 if MCP is on 3005; use 3005 if MCP is on 3000.
server {
    listen 80;
    server_name backlog.path2ai.tech;

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

Reload nginx (this loads the new config without touching the existing MCP site):

```bash
sudo nginx -t
sudo systemctl reload nginx
```

If nginx is not yet enabled or running (fresh instance): `sudo systemctl enable nginx && sudo systemctl start nginx`.

Test: open `http://backlog.path2ai.tech` in a browser (DNS for `backlog.path2ai.tech` must point to this EC2 instance’s public IP).

---

## 6. HTTPS with Certbot

Request a certificate **only for the backlog hostname** so Certbot only updates `path-backlog.conf` and does not alter the existing MCP (path-mcp) config:

```bash
# Install certbot if not already present (e.g. from MCP setup)
sudo dnf install -y certbot python3-certbot-nginx

# Get certificate for the backlog domain only
sudo certbot --nginx -d backlog.path2ai.tech
```

Follow the prompts; choose to redirect HTTP → HTTPS when asked. Certbot will add SSL to the `path-backlog.conf` server block. Renewal is automatic. Test renewal:

```bash
sudo certbot renew --dry-run
```

Set `BASE_URL=https://backlog.path2ai.tech` in `server/.env` and restart the Path Backlog app (e.g. `sudo systemctl restart path-backlog` or `pm2 restart path-backlog`).

---

## 7. Daily database backup

The same **`scripts/backup-db.sh`** and approach as the Pi work on EC2. Use an SSH key and copy the DB to your backup server (e.g. another EC2, NAS, or local machine).

**Setup:**

1. On the EC2 instance: `ssh-keygen -t ed25519 -f ~/.ssh/backup_key -N ""`
2. Copy public key to backup server: `ssh-copy-id -i ~/.ssh/backup_key user@backup-server`
3. Edit **`scripts/backup-db.sh`**: set `BACKUP_HOST` (e.g. `user@10.0.1.50` or `user@backup.example.com`) and `BACKUP_DIR` (e.g. `backups/path-backlog`). Use `KEY="$HOME/.ssh/backup_key"` (or leave default).
4. Ensure DB path is correct: default is `server/data/backlog.sqlite` relative to repo root; or set `DATABASE_PATH` in the environment when running the script.
5. Make executable: `chmod +x /home/ec2-user/Path-Backlog/scripts/backup-db.sh`
6. Test once: `/home/ec2-user/Path-Backlog/scripts/backup-db.sh`

**Schedule with cron:**

```bash
crontab -e
# Add (e.g. 2:30 AM daily):
30 2 * * * /home/ec2-user/Path-Backlog/scripts/backup-db.sh >> /home/ec2-user/path-backlog-backup.log 2>&1
```

Or use a **systemd timer** as in the Raspberry Pi guide (`docs/DEPLOY-RASPBERRY-PI.md`), adjusting paths to `/home/ec2-user/Path-Backlog`.

**Recovery:** Restore the latest `backlog-YYYY-MM-DD.sqlite` to `server/data/backlog.sqlite` (or set `DATABASE_PATH`), keep the repo and `.env`, rebuild client if needed, restart the app.

---

## 8. Summary

| Item            | On EC2 (Amazon Linux)        |
|-----------------|------------------------------|
| User / home     | `ec2-user`, `/home/ec2-user` |
| Packages        | `sudo dnf install ...`       |
| Node.js         | `dnf install nodejs` (AL2023) or NodeSource/nvm (AL2) |
| Path Backlog    | **backlog.path2ai.tech** → port **3000** (or 3005 if MCP uses 3000), nginx `path-backlog.conf` |
| path-mcp-server | Already running; leave port and nginx `path-mcp.conf` unchanged |
| HTTPS           | `sudo certbot --nginx -d backlog.path2ai.tech` (backlog only) |
| Backup script   | `scripts/backup-db.sh`; cron or systemd timer |

Nothing in the **application code** or **backup script** needs to change for EC2. When sharing the server with path-mcp-server, use **port 3000** for Backlog and **add** only a new nginx server block and Certbot certificate for the backlog hostname.

---

## 9. Troubleshooting 502 Bad Gateway

A **502 Bad Gateway** at https://backlog.path2ai.tech means nginx is running but cannot reach the Path Backlog Node app. Run these on the EC2 instance (SSH in as `ec2-user` or the user that runs the app).

**1. Is the app running?**

```bash
# If using systemd:
sudo systemctl status path-backlog

# If using PM2:
pm2 list
pm2 logs path-backlog --lines 30
```

If it is **inactive (dead)** or **not in the list**, start it and watch for errors:

```bash
# systemd:
sudo systemctl start path-backlog
sudo journalctl -u path-backlog -n 50 --no-pager

# PM2:
cd /home/ec2-user/Path-Backlog/server && pm2 start index.js --name path-backlog
pm2 logs path-backlog --lines 50
```

**2. Is the app listening on the right port?**

nginx proxies to **3000** (or **3005** if you chose that). Check what is listening:

```bash
sudo ss -tlnp | grep -E '3000|3005'
# or: sudo netstat -tlnp | grep -E '3000|3005'
```

You should see `node` (or `LISTEN`) on the port you use for Backlog. If nothing is on that port, the app failed to bind (check logs above; often a missing `.env` or wrong `PORT`).

**3. Can you reach the app locally?**

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/
# If you use 3005 for Backlog, use 3005 instead of 3000.
```

You should get `200` (or another 2xx/3xx). If you get "Connection refused", the app is not running or not on that port.

**4. Port mismatch**

Confirm **nginx** is proxying to the **same** port the app uses. Check:

```bash
grep proxy_pass /etc/nginx/conf.d/path-backlog.conf
# Should show http://127.0.0.1:3000 (or 3005).
```

If the app uses **3005** (because MCP is on 3000), nginx must have `proxy_pass http://127.0.0.1:3005;`. Edit the config, then `sudo nginx -t && sudo systemctl reload nginx`.

**5. nginx error log**

```bash
sudo tail -30 /var/log/nginx/error.log
```

Look for "connect() failed" or "refused" — that confirms nginx cannot connect to the upstream (app not running or wrong port).

**Common fixes**

- **App not running:** Start it with `sudo systemctl start path-backlog` or `pm2 start`, and fix any startup errors (e.g. missing `server/.env`, wrong `node` path).
- **Wrong port:** Set `PORT=3000` (or 3005) in `.env` and in the systemd unit `Environment=PORT=3000`, and use the same port in `path-backlog.conf` for `proxy_pass`.
- **App crashes on start:** Run the server by hand to see the error: `cd /home/ec2-user/Path-Backlog/server && node index.js` (then Ctrl+C). Fix the reported error (e.g. DB path, missing env vars).
