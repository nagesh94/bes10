# Deploying to Hostinger KVM (Mumbai)

One VPS running everything: the Next.js app, Postgres, MinIO and Gotenberg.
Neon is kept only as the off-site backup destination.

**Why this shape.** Queries are sub-millisecond instead of the 68 ms measured
from India to a database in Singapore, customer documents — including scanned
Aadhaar cards — stay on Indian soil, there is no 5 GB storage ceiling, and
nothing in the application code changes. Gotenberg keeps working, so the five
statutory DISCOM forms are untouched.

**The trade-off, stated plainly.** One box holds the only working copy of your
records. Section 8 is therefore not optional.

---

## 1. Buy the server

Hostinger → VPS → **KVM 2**: 2 vCPU, 8 GB RAM, 100 GB NVMe.

KVM 1 would have been enough on RAM, but its single vCPU gets pinned for
several seconds whenever LibreOffice renders a submission pack, which makes
the app sluggish for everyone else while it runs. The second core removes
that, and it is the only moment this app is genuinely CPU-bound.

| Setting | Value |
|---|---|
| Location | **Mumbai, India** — check the picker; Hostinger's Asia VPS region is India, not Singapore |
| OS | **Ubuntu 24.04 LTS**, plain (no panel template) |
| Authentication | **SSH key**, not a password |

Budget honestly: the advertised rate is a 24-month prepaid intro price and
renewal is roughly double (~₹999/month at the time of writing). **Check the
figure in the cart before paying.**

8 GB is generous here: Next ~400 MB, Postgres ~300 MB, Gotenberg capped at
768 MB, MinIO ~200 MB — about 1.7 GB in use. The swap file in §2 is still
worth adding as insurance for `next build`, but it will rarely be touched.

Postgres defaults are fine at this size and data volume; documents live in
object storage, so the database stays small. Don't bother tuning
`shared_buffers` until something is actually slow.

---

## 2. Base setup

```bash
ssh root@187.126.125.193

apt update && apt upgrade -y
apt install -y git nginx curl ufw

# Node 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

```

**Check for Docker before adding its repository.** Hostinger's VPS images
usually ship with it, and adding the repo a second time gives
`Conflicting values set for option Signed-By` — which breaks `apt` completely
until the duplicate is removed:

```bash
docker --version && docker compose version
```

If that works, **skip the next block** — you already have Docker. Only if it
fails:

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
apt update && apt install -y docker-ce docker-compose-plugin
```

> This box reports its release as `resolute`, newer than 24.04. Docker's
> repository does not always publish for the newest Ubuntu, which is a second
> reason to prefer whatever came pre-installed.

Swap, so the build is never OOM-killed:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Firewall, plus SSH hardening.

Your broadband address (`49.36.42.39` right now) is a residential Indian ISP
allocation and will almost certainly change. Restricting SSH to it would lock
you out the first time your ISP rotates it — so instead, SSH stays open to the
internet and is protected by keys and rate-limiting, which is the stronger
control anyway. A password cannot be brute-forced if passwords are not
accepted.

```bash
ufw default deny incoming
ufw default allow outgoing
ufw limit 22/tcp          # rate-limits repeated connection attempts
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Then refuse passwords outright. Confirm your key works in a second terminal
**before** running this:

```bash
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl restart ssh

apt install -y fail2ban
systemctl enable --now fail2ban
```

Unattended security updates, since patching is now your responsibility:

```bash
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades    # answer Yes
```

> If you ever do lock yourself out, hPanel has a browser-based console that
> bypasses SSH entirely. That is your way back in — worth knowing where it is
> *before* you need it.
>
> If you would rather restrict by IP anyway, the rule is
> `ufw allow from <ip> to any port 22 proto tcp` — just expect to use the
> hPanel console when the address changes.

> Postgres, MinIO and Gotenberg are **never** opened. `docker-compose.yml`
> binds all three to `127.0.0.1`, so the firewall is a second line of defence
> rather than the only one.

---

## 3. Service account and code

```bash
useradd -r -m -d /srv/bhim-crm -s /bin/bash bhim
usermod -aG docker bhim
install -d -o bhim -g bhim /srv/bhim-crm

sudo -u bhim git clone <repo-url> /srv/bhim-crm/current
```

---

## 4. The .env file — copy it, then flip one block

There is one `.env`, and it is the same file on both machines. Everything that
genuinely differs is collected into a single block near the bottom with two
halves, **LOCAL** and **SERVER**. Exactly one is active.

Copy it up as it is:

```bash
mv /root/bhim.env /srv/bhim-crm/current/.env
chown bhim:bhim /srv/bhim-crm/current/.env
chmod 600 /srv/bhim-crm/current/.env
nano /srv/bhim-crm/current/.env
```

Scroll to the banner that reads **THE ONLY BLOCK THAT CHANGES BETWEEN
MACHINES** and do two things:

1. Comment out the ten lines under `LOCAL (active)` — add `#` to each
2. Uncomment the sixteen lines under `SERVER (commented)` — remove the `# `

Nothing above that banner is touched. `AUTH_URL` in particular needs no
change: it holds the production URL in both places, and `src/lib/env.ts`
derives `http://localhost:3000` from `NODE_ENV` when running `npm run dev`.

Check the flip took:

```bash
cd /srv/bhim-crm/current
grep -E '^(DATABASE_URL|S3_ENDPOINT|POSTGRES_USER)=' .env
```

All three must print, and `DATABASE_URL` must contain `127.0.0.1`, not
`neon.tech`. If `POSTGRES_USER` is missing, the SERVER half is still
commented and `docker compose` will refuse to start.

## 5. Start the services

```bash
cd /srv/bhim-crm/current
sudo -u bhim docker compose up -d
sudo -u bhim docker compose ps
```

Three containers, all healthy, nothing listening publicly — confirm that:

```bash
ss -tlnp | grep -E '5432|9000|3001'   # every line must say 127.0.0.1
```

---

## 6. Build, migrate, seed

```bash
cd /srv/bhim-crm/current
sudo -u bhim npm ci
sudo -u bhim npm run build

sudo -u bhim npm run db:migrate:prod   # creates the schema in the local Postgres
sudo -u bhim npm run db:seed           # admin + every master table
sudo -u bhim npm run smoke:storage     # proves MinIO works end to end
```

The seed prints which database it wrote to — check it says `bhim_crm`.

> This is a **fresh** database. The Neon one was only ever seeded with master
> data and the admin account, so there is nothing to migrate across. If you
> had entered real projects into Neon, dump and restore them now instead.

---

## 7. Run it

```bash
cp deploy/bhim-crm.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now bhim-crm

curl -s localhost:3000/api/health
curl -s "localhost:3000/api/health?deep=1"
```

Then nginx and TLS.

`bes247.tech` is Hostinger's own free domain, so DNS is in the **same panel as
the VPS** — no third-party registrar involved. hPanel → **Domains** →
`bes247.tech` → **DNS / Nameservers**, then add:

| Type | Name | Points to | TTL |
|---|---|---|---|
| **A** | `crm` | `187.126.125.193` | 600 |

An **A record** — not "domain forwarding", which is an HTTP redirect and will
not work. hPanel may also offer a one-click "point domain to VPS" shortcut;
that does the same thing.

Check it has propagated before calling Certbot, or issuance fails:

```bash
dig +short crm.bes247.tech      # must print 187.126.125.193
```

**Two stages, and the order matters.** `deploy/nginx.conf` names a certificate
that does not exist yet, so installing it first makes `nginx -t` fail with
`cannot load certificate ... No such file or directory`. Start with the
HTTP-only config:

```bash
mkdir -p /var/www/html
cp deploy/nginx-bootstrap.conf /etc/nginx/sites-available/bhim-crm
ln -sf /etc/nginx/sites-available/bhim-crm /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

Get the certificate — `certonly`, so Certbot does not rewrite the config and
discard the tuned upload limits:

```bash
apt install -y certbot
certbot certonly --webroot -w /var/www/html -d crm.bes247.tech
```

Now the certificate exists, so the real config loads:

```bash
cp deploy/nginx.conf /etc/nginx/sites-available/bhim-crm
nginx -t && systemctl reload nginx
systemctl restart bhim-crm
```

Certbot installs its own renewal timer, so TLS renews itself. Don't buy an
SSL certificate from Hostinger — Let's Encrypt is free and already wired into
`deploy/nginx.conf`.

> **On the free domain.** It is free for the initial term and then renews at
> the normal `.tech` rate, which is considerably more than the promotional
> price — worth checking in hPanel so the bill is not a surprise, and worth
> knowing that the domain is tied to the hosting account. Nothing technical
> about `.tech` causes trouble: Let's Encrypt treats it like any other TLD.

Sign in at `https://crm.bes247.tech` with `nagesh@admin.com` / `admin@pass`
and **change that password immediately** — Settings → Password.

---

## 8. Backups — do this on day one

One box, one disk. Hostinger's snapshots are a convenience, not a backup you
can restore elsewhere.

```bash
# Check what it would do first
sudo -u bhim npm run db:backup -- --dry-run

# Then for real
sudo -u bhim npm run db:backup
```

It gzips a `pg_dump` and uploads it to the Neon bucket, prunes dumps older
than `BACKUP_RETENTION_DAYS`, and mirrors new documents under `documents/`.
The mirror is incremental and never deletes — document keys carry a timestamp,
so objects are only ever added.

Daily, as the `bhim` user (`sudo -u bhim crontab -e`):

```cron
30 2 * * *  cd /srv/bhim-crm/current && npm run db:backup >> /var/log/bhim-backup.log 2>&1
15 3 * * *  cd /srv/bhim-crm/current && npm run storage:cleanup >> /var/log/bhim-cleanup.log 2>&1
```

**Test a restore before you trust it.** A backup you have never restored is a
guess:

```bash
aws s3 cp s3://bhim-crm-backup/db/<file>.sql.gz .   # or download from the console
gunzip -c <file>.sql.gz | docker exec -i bhim-postgres psql -U bhim -d scratch_restore
```

---

## 9. Later releases

```bash
cd /srv/bhim-crm/current && ./deploy/deploy.sh
```

Pull, install, build, migrate, seed, restart, health-check. The build happens
before the service is touched, so a failed build leaves the running version up.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Service won't start, log names a variable | Missing from `.env`. Production has no fallbacks by design. |
| `password authentication failed` | `POSTGRES_PASSWORD` and the password inside `DATABASE_URL` disagree. |
| Database connection refused | Containers aren't up: `docker compose ps`. |
| Login does nothing, no error | `AUTH_URL` isn't the exact public `https://` origin, so the secure cookie is rejected. |
| Upload fails in the browser | MinIO isn't reachable on `127.0.0.1:9000`, or `S3_*` credentials don't match the compose file. |
| `NoSuchBucket` | `S3_MANAGE_BUCKETS` is `false` and the buckets were never created. |
| PDF pack fails | Gotenberg is down, or `mem_limit` was hit by a large conversion. |
| Build killed | Swap isn't on (§2). |
| Backups "succeed" but the bucket is empty | `BACKUP_S3_BUCKET` points at the app's temp bucket, and the cleanup job deleted them. Use a dedicated bucket. |

Logs: `journalctl -u bhim-crm -f` and
`docker compose logs -f`

---

## What this does not cover

**OS patching is now yours.** `unattended-upgrades` handles security updates;
reboots after a kernel update are manual. That's the cost of a VPS over a
managed platform, and it's the main thing you took on by choosing this.

**Monitoring.** Nothing tells you if the box is down. A free external check
against `https://crm.bes247.tech/api/health` is worth ten minutes — if the
app dies at 9 a.m. you want to know before a technician on a roof does.
