# Neon setup — database and buckets

Both come from one Neon project: Postgres for the data, Neon Object Storage
for documents and photos. One account, one bill, nothing else to provision.

The app already speaks both protocols — Neon Object Storage is S3-compatible,
so the existing `@aws-sdk/client-s3` code needed no rewrite.

---

## 1. Create the project

[console.neon.tech](https://console.neon.tech) → **Create project**.

| Field | Value |
|---|---|
| Project name | `bhim-crm` |
| Postgres version | **17** to match the local `postgres:17-alpine`. Note that new projects now default to **18** — see the version note below |
| Region | Nearest Asia region. **Singapore (`ap-southeast-1`)** is usually closest and is one of the regions where Object Storage is available |
| Database name | `bhim_crm` — it defaults to `neondb`, change it here |

Region matters more than usual, because it is the one hop you cannot optimise
away later without migrating. Check that Object Storage is offered in the
region you pick — it is in fewer regions than Postgres.

> **Version drift.** This project came up on PostgreSQL **18.6** while local
> development runs 17. The schema and migrations apply cleanly to both — all 16
> were verified against 18.6 — but running different majors in development and
> production is a gap that eventually bites. Either pick 17 when creating the
> project, or bump the local container to `postgres:18-alpine` for parity.

Neon creates the database and an owner role for you. There is **no
`CREATE DATABASE` and no `GRANT` step** — two of the three things that went
wrong on RDS and Azure simply do not exist here.

---

## 2. The database connection string

On the dashboard, find **Connection string** and turn the *Connection pooling*
toggle **off**.

That matters. Neon offers two hosts:

- `ep-xxxx-xxxxxxxx.region.aws.neon.tech` — direct
- `ep-xxxx-xxxxxxxx**-pooler**.region.aws.neon.tech` — through PgBouncer

The pooled one is for serverless functions that open a connection per request.
This app is a long-lived server that keeps its **own** pool, so the pooler adds
nothing: it exists to solve a problem this app does not have.

Measured on this project, both endpoints work and the direct one is faster —
867 ms against 1464 ms on a cold branch. The remaining reason to prefer direct
is `postgres.js`'s named prepared statements, which transaction-mode pooling
does not reliably support.

One caveat retracted: an earlier version of this note claimed
`pg_advisory_lock` — which [scripts/migrate.mjs](../scripts/migrate.mjs) uses
to stop two deploys migrating at once — would silently fail through the pooler.
Testing showed the lock was acquired *and* visible in `pg_locks` on both
endpoints, so that warning was wrong. Direct is still the better choice, just
not for that reason.

Then **strip the query string**. Neon gives you:

```
postgresql://bhim_crm_owner:npg_AbC123@ep-cool-sun-12345678.ap-southeast-1.aws.neon.tech/bhim_crm?sslmode=require&channel_binding=require
```

Keep only:

```
postgresql://bhim_crm_owner:npg_AbC123@ep-cool-sun-12345678.ap-southeast-1.aws.neon.tech/bhim_crm
```

TLS is set by `DATABASE_SSL`, and two places configuring it is one too many.
`channel_binding` is a libpq parameter `postgres.js` does not handle anyway.

### TLS needs no certificate file

Neon's certificate comes from a public CA that Node already trusts, so:

```bash
DATABASE_SSL="verify-full"
# DATABASE_CA_CERT is left unset
```

This is the one genuine simplification over RDS and Azure, both of which sign
with their own root and need a bundle on disk.

---

## 3. Create the buckets

Neon project → **Storage** → create a bucket for documents. This project uses:

- `bhim-crm-bucket` — documents, created by hand
- `bhim-crm-temp` — staging, **created by the app itself** on first use

You only have to make the first one. `S3_MANAGE_BUCKETS=true` lets the app
create the temp bucket, and that was verified working against Neon — it
supports `CreateBucket` over the S3 API, unlike a least-privilege AWS
credential.

Leave both **private**. Every file is served through a time-limited presigned
URL, so public access has no legitimate use here.

Two buckets rather than one, because the browser uploads straight into `temp`
and the server moves the file into `documents` after resizing it. That keeps an
8 MB rooftop photo off the Node process entirely.

> You can skip creating them by hand: `S3_MANAGE_BUCKETS=true` lets the app
> create them on first use, and Neon supports `CreateBucket` over the S3 API.
> It runs once per process, not once per upload.

### The endpoint is per branch

Buckets belong to a Neon **branch**, not a region, and they are copy-on-write.
Read the S3 endpoint off the Storage page of the branch you are pointing at,
and use your production branch for production.

This is a real bonus nobody else offers: a dev branch inherits production's
buckets without duplicating bytes, so you can test document generation against
real files without touching the originals.

### Credentials

Storage → **Credentials** → create one. It maps onto an ordinary S3 access key
pair.

Neon's console hands you a snippet using `AWS_*` variable names. This app uses
`S3_*`, because it has never been AWS-specific. Rename as you paste:

| Neon gives you | Put it in |
|---|---|
| `AWS_ENDPOINT_URL_S3` | `S3_ENDPOINT` |
| `AWS_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID` |
| `AWS_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY` |
| `AWS_REGION` | `S3_REGION` |

The endpoint looks like
`https://br-<branch>.storage.c-3.<region>.aws.neon.tech` — note the `br-`
prefix, which is the branch, not the project. The database host starts `ep-`
instead. They are different hostnames; do not copy one into the other.

Neon's snippet also suggests installing `dotenv`. You do not need it: the
scripts here load `.env` through Node's own `--env-file-if-exists`, and a
variable already set in the real environment still takes precedence.

There is no instance-role equivalent, so production does hold a key here —
keep the env file root-owned at mode 600 and rotate from the console if it
leaks.

---

## 4. Try it from your laptop first

This is the main reason to do Neon before choosing a host: you can point your
machine at it today without deploying anything. Your local Postgres and MinIO
containers stay untouched, so removing the variables switches back.

Put the values in `.env` (gitignored) rather than exporting them. There is
deliberately only one env file: development and the server both read it, and
both point at the live Neon database and bucket. The only line that differs
between the two is `AUTH_URL`.

```ini
DATABASE_URL="postgresql://neondb_owner:...@ep-xxxx.c-3.ap-southeast-1.aws.neon.tech/bhim_crm"
DATABASE_SSL="verify-full"

S3_ENDPOINT="https://br-xxxx.storage.c-3.ap-southeast-1.aws.neon.tech"
S3_REGION="ap-southeast-1"
S3_ACCESS_KEY_ID="nak_live_..."
S3_SECRET_ACCESS_KEY="nsk_live_..."
S3_BUCKET_DOCUMENTS="bhim-crm-bucket"
S3_BUCKET_TEMP="bhim-crm-temp"
S3_MANAGE_BUCKETS="true"
```

```bash
npm run db:migrate:prod   # creates the schema
npm run db:seed           # admin + every master table
npm run smoke:storage     # upload, resize, presigned read-back, delete
npm run dev
```

`smoke:storage` is the one to watch: it exercises the full path — a 12 MB
photo in, portal variant squeezed under 2 MB, all three variants stored, and
the portal copy read back byte-for-byte through a presigned URL.

**`response-content-disposition` works.** This was an open question — Neon's
docs do not mention the override, and the Download button depends on it to save
a file under its real name. Tested against this project: the header comes back
as `attachment; filename="Electricity Bill.txt"`, so the Download button is
fine. Nothing to work around.

Also confirmed against the live bucket: presigned PUT accepted as the browser
issues it, content type preserved, tampered signatures refused with 403,
unsigned URLs refused with 403, and deletes effective.

---

## 5. What Neon does differently from S3

Three gaps, none fatal, all worth knowing before you rely on them.

### Versioning is stored but not enforced

Objects always come back with `x-amz-version-id: null`. This is a worse failure
mode than R2, which at least refuses the call — here it reports success while
protecting nothing. So the app **no longer asks for it**; see the note in
[operations.ts](../src/lib/storage/operations.ts).

What saves you is that every key carries a timestamp, so **no object is ever
overwritten**, and generated documents are printed and signed on paper. What is
genuinely lost is recovering a *superseded* file at the three places that delete
one on regeneration. Move to a provider with real versioning if that stops
being acceptable.

### Lifecycle rules are stored but not enforced

So the temp bucket does not empty itself. The happy path already cleans up —
the server deletes each temp object once it has filed it — but an upload
abandoned mid-way (a phone losing signal on a roof) would stay forever and be
billed against the free allowance.

[scripts/cleanup-temp.mjs](../scripts/cleanup-temp.mjs) replaces the missing
rule. Run it daily from cron:

```bash
15 2 * * *  cd /srv/bhim-crm/current && npm run storage:cleanup >> /var/log/bhim-cleanup.log 2>&1
```

Check what it would do before trusting it: `node scripts/cleanup-temp.mjs --dry-run`

### Other S3 calls that return 501

`PutBucketAcl`, `PutBucketPolicy`, `PutObjectAcl`, `PutBucketEncryption`,
`PutBucketReplication`, bucket notifications, logging, website hosting. None is
used by this app — encryption at rest is automatic, and access is controlled by
presigned URLs rather than ACLs.

---

## 6. Free-tier behaviour that will actually affect you

**Storage is about 5 GB per project.** Rough arithmetic: 10–20 MB of scans and
compressed photos per project, so a few hundred projects. Documents live in the
bucket, not Postgres, so the database itself stays small — the biggest tables
will be audit log and stage history.

**The database suspends when idle.** After about five minutes with no queries
the compute scales to zero; the next query wakes it in a few hundred
milliseconds. For an office CRM that means the first page load after lunch is
slightly slow.

**Compute time is the metered resource, not requests.** An open idle connection
*keeps the compute awake*, so [db/index.ts](../src/lib/db/index.ts) sets
`idle_timeout` to 60 seconds — short on purpose, so the branch can actually
suspend instead of burning the allowance doing nothing. `connect_timeout` is 15
seconds to give it room to wake up.

**Backups are not RDS-grade.** The free plan gives point-in-time restore over a
short window, not seven days of automated backups. A `pg_dump` on a cron
matters more here, not less:

```bash
30 2 * * *  pg_dump "$DATABASE_URL" | gzip > /var/backups/bhim-$(date +\%F).sql.gz
```

Confirm the current limits on your own dashboard rather than trusting these
numbers — Neon has revised its plans more than once.

**Object Storage is in beta.** The bucket API endpoints say so explicitly. Fine
for getting running; worth a second thought before it holds the only copy of
signed agreements.

---

## 7. Data residency

Singapore, not India. Both the encrypted Aadhaar column and the scanned Aadhaar
images would sit there, because Neon has no India region.

That is probably acceptable for a proprietorship under the DPDP Act, which
permits cross-border transfer except to restricted countries — but it is a
decision worth making knowingly rather than by accident, given the app
deliberately encrypts that column and audits every read of it.

---

## 8. What is still undecided

Where the **app** runs. Neon covers the database and the bucket; the Next
server and Gotenberg still need a host, and that choice is independent of
everything above.

The constraint: Gotenberg is LibreOffice behind HTTP and wants ~768 MB, and
document generation takes tens of seconds — so serverless free tiers cannot
host this, and Vercel's Hobby plan also forbids commercial use.

The options discussed were an Oracle Cloud Always Free VM (generous, no
expiry), or a small paid VPS at roughly €4/month. `deploy/` holds the systemd
unit, nginx config and release script, which work on any Linux host.
