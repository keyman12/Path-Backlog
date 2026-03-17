# Path Backlog App – Infrastructure and Deployment

This guide covers deploying the Path Backlog app at **backlog.path2ai.tech** on a Raspberry Pi 5 (4GB) with HTTPS via Nginx and Let's Encrypt.

---

## 1. Domain and routing

### DNS

- In your DNS provider, create an **A record** for `backlog.path2ai.tech` pointing to your home broadband **public IP**.
- If your public IP changes, use a **dynamic DNS** client on the Pi (e.g. `ddclient`, No-IP, DuckDNS) and point the A record to the DDNS hostname instead.

### Port forwarding

On your broadband router:

1. Forward **external port 443** (HTTPS) to the Raspberry Pi’s **local IP** on port 443.
2. Optionally forward **external port 80** (HTTP) to the Pi on port 80 (used by Certbot for HTTP-01 challenge and redirect to HTTPS).

Example (router UI wording may differ):

- Service: HTTPS | External port: 443 | Internal IP: `192.168.1.100` | Internal port: 443
- Service: HTTP  | External port: 80  | Internal IP: `192.168.1.100` | Internal port: 80

---

## 2. Raspberry Pi 5 setup

### OS

- Install **Raspberry Pi OS (64-bit)**.
- Enable **SSH** and set a **static LAN IP** (e.g. 192.168.1.100) in your router or via Pi OS network settings (recommended so port forwarding always targets the same host).

### Base install

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx certbot python3-certbot-nginx
```

### Node.js (LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # expect v20.x or v22.x
```

---

## 3. Nginx configuration

Create a server block for the app. The Node app will listen on `http://127.0.0.1:3000`.

```bash
sudo nano /etc/nginx/sites-available/backlog.path2ai.tech
```

Paste the following (replace `backlog.path2ai.tech` if your domain differs):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name backlog.path2ai.tech;

    # SPA + API proxy (Certbot will add SSL and redirect later)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site and test:

```bash
sudo ln -s /etc/nginx/sites-available/backlog.path2ai.tech /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 4. HTTPS with Certbot (Let's Encrypt)

Run Certbot so it obtains a certificate and adjusts the Nginx config for HTTPS:

```bash
sudo certbot --nginx -d backlog.path2ai.tech
```

- Use an email address for renewal notices.
- Choose to redirect HTTP to HTTPS when prompted.

Certbot will add a `listen 443 ssl` server block and set `ssl_certificate` / `ssl_certificate_key`. Renewal is automatic via systemd timer:

```bash
sudo systemctl status certbot.timer
```

Optional: add HSTS and security headers in the same server block (inside the `server { ... }` that Certbot creates for port 443):

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
```

---

## 5. Running the application

### Clone and install

```bash
cd /home/pi
git clone <your-repo-url> path-backlog-app
cd path-backlog-app
```

### Backend

```bash
cd server
npm ci
cp .env.example .env
# Edit .env: set NODE_ENV=production, RECOVERY_USER / RECOVERY_PASSWORD, SESSION_SECRET, etc.
npm run start
```

Use a process manager so the app restarts on reboot (e.g. systemd or PM2):

**systemd example** (`/etc/systemd/system/path-backlog-api.service`):

```ini
[Unit]
Description=Path Backlog API
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/path-backlog-app/server
ExecStart=/usr/bin/node index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable path-backlog-api
sudo systemctl start path-backlog-api
```

### Frontend (production build)

Build the React app and serve it from the Node server (or from Nginx). The repo’s server is set up to serve the built client from `client/dist` when `NODE_ENV=production`, so a single Node process can serve both API and SPA.

```bash
cd /home/pi/path-backlog-app/client
npm ci
npm run build
```

Ensure the server is configured to serve `client/dist` in production (see server README).

---

## 6. Firewall (optional)

If you enable `ufw`:

```bash
sudo ufw allow 22    # SSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

---

## 7. Summary checklist

- [ ] DNS A record for `backlog.path2ai.tech` → public IP (or DDNS)
- [ ] Router: port 443 (and 80) forwarded to Pi’s local IP
- [ ] Pi: static IP, Nginx, Certbot, Node.js installed
- [ ] Nginx server block for `backlog.path2ai.tech` proxying to `http://127.0.0.1:3000`
- [ ] Certbot run for HTTPS and HTTP→HTTPS redirect
- [ ] App installed, `.env` configured, backend running (systemd or PM2)
- [ ] Client built and served by backend (or Nginx)
- [ ] Recovery credentials in `.env` (RECOVERY_USER / RECOVERY_PASSWORD) and documented in `docs/` (not in version control)
