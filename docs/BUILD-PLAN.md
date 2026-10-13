# BHIM Solar CRM — Build Plan

Companion to [ARCHITECTURE.md](ARCHITECTURE.md). That document says **what** the system is;
this one says **in what order it gets built, and how we know each step is done.**

Design reference: the 25-screen canvas. Every phase below names the boards it implements.

---

## Ground rules

1. **Each phase ends with something you can open and use.** No phase is "plumbing only".
2. **Nothing is mocked that will later be real.** If a screen shows a document count, it counts real rows from the start.
3. **Zod schemas are written once** and used by the form, the server action and the flag engine. A field is never validated in two places with two rules.
4. **RBAC is wired in Phase 0**, before there is anything to protect. Retrofitting access control is how leaks happen.
5. **Everything runs locally.** No cloud account until you decide to deploy.

---

## The local stack

```bash
docker compose up -d
```

| Service | Port | What it is |
|---|---|---|
| postgres | 5432 | The database |
| minio | 9000 / 9001 | S3-compatible storage + web console |
| minio-init | — | Creates buckets, enables versioning, exits |
| **gotenberg** | 3001 | LibreOffice behind HTTP — converts the DOCX templates to PDF |
| mailpit | 1025 / 8025 | Catches every outgoing email |

Then `npm run dev` on 3000.

**Why Gotenberg.** The five templates are Word files. Turning a filled `.docx` into a PDF needs LibreOffice, and shelling out to a LibreOffice binary from Node is fragile — it leaks processes, behaves differently on Windows and Linux, and breaks on a serverless host. Gotenberg wraps it in an HTTP API inside a container. The app posts a file and gets a PDF back, identically on your laptop and on a server.

---

## Repository layout

```
bhim-crm/
├─ docker-compose.yml          postgres · minio · gotenberg · mailpit
├─ .env                  (gitignored; the only env file)
├─ templates/                  the five source .docx files
├─ public/brand/               emblem · wordmark · both vendor signatures
├─ drizzle/                    generated migrations
└─ src/
   ├─ app/
   │  ├─ (auth)/login
   │  └─ (app)/
   │     ├─ dashboard · leads · projects/[id]/… · partners · admin · installer
   ├─ components/              ui/ (shadcn) · forms/ · app-shell/
   ├─ lib/
   │  ├─ db/schema.ts          one file per domain, re-exported
   │  ├─ rbac/permissions.ts   the matrix + can()
   │  ├─ workflow/stages.ts    the nine gates, declarative
   │  ├─ flags/engine.ts       name match + load rules
   │  ├─ storage/              presigned upload, variants, sharp
   │  ├─ documents/            templates, merge, packs, letterhead
   │  └─ validation/           Zod, shared client + server
   ├─ messages/                en.json · hi.json
   └─ styles/tokens.css        light + dark, one token set
```

---

## Phase 0 — Foundation

**Boards:** Login, Settings, Admin → Users & roles, Admin → Master data

| # | Step | Done when |
|---|---|---|
| 0.1 | `docker compose up`, verify all five services | MinIO console opens, buckets exist, Mailpit inbox loads |
| 0.2 | Next.js 15 + TypeScript + Tailwind + shadcn/ui | `npm run dev` serves a page |
| 0.3 | **Design tokens** — extract the palette from the canvas into `tokens.css`, light + dark | Toggling `data-theme` flips the whole app |
| 0.4 | **i18n** — next-intl, `en.json` + `hi.json`, Noto Sans Devanagari | Switching to हिंदी changes chrome; reference numbers stay Latin |
| 0.5 | Drizzle + schema + first migration + seed | `drizzle-kit push` succeeds; seed creates one admin |
| 0.6 | Better Auth, email + password, roles on the session | You can sign in and out |
| 0.7 | **RBAC** — the permission matrix + `can()` guard + route protection | An employee hitting `/projects/1/payments` gets refused server-side |
| 0.8 | App shell — header, role-aware nav, theme and language switchers | Matches the Login and Settings boards |
| 0.9 | Admin — users CRUD (4 roles), master data CRUD | You can create an employee, an installer and a channel partner |

**Checkpoint:** four people can sign in, each sees a different menu, and an admin can edit master data. No projects yet.

---

## Phase 1 — Leads and onboarding

**Boards:** Pipeline dashboard, Leads, Project detail, Stage 1 (desktop + mobile), Flags

| # | Step | Done when |
|---|---|---|
| 1.1 | `contacts` + `projects` + stage progress + stage history | A project exists with a code like `BHIM-2026-0001` |
| 1.2 | **Stage gating** — `workflow/stages.ts`, the nine gates, admin override with reason | Stage 2 cannot open until stage 1 passes |
| 1.3 | Leads list, create, and **Convert to prospect** with its gate | Converting keeps the same row and logs the transition |
| 1.4 | The 8-section prospect form, one Zod schema per section, autosave | All ~80 fields persist and reload |
| 1.5 | **Flag engine** — name normalisation and similarity, load comparison | Entering a 2 kW sanctioned load against a 3 kW plant raises the flag inline |
| 1.6 | Flag resolution — both sub-processes, MPCZ deep links from master data | A Bhopal project links to Bhopal, a Betul one to Betul |
| 1.7 | **Storage** — presigned upload to MinIO, `original` / `portal` / `thumb` variants via sharp | A 4 MB scan uploads from a phone and yields a sub-200 KB portal copy |
| 1.8 | Pipeline dashboard with the 9-dot stage rail | Matches the board, counts are real |

**Checkpoint:** a real lead becomes a prospect, the form is filled, both flags fire and clear, documents upload.

---

## Phase 2 — Money, agreement, partners

**Boards:** Payment, Agreement, Channel partners, Partner portal

| # | Step | Done when |
|---|---|---|
| 2.1 | Payment plan, milestones, payments received, subsidy — **admin-only routes** | An employee request never loads a monetary column |
| 2.2 | Jan Samarth fields + sanction letter upload | Employee can upload the letter without seeing the loan amount |
| 2.3 | Stage 2 — quotation upload, signature upload, signed-scan upload linked to its original | Both copies retained, neither replaces the other |
| 2.4 | Channel partners, referral attribution, commission accrual at commissioning | Commissioning a referred project creates an accrued commission |
| 2.5 | Payouts with gross / TDS / net, partner portal | A partner signs in and sees only their own referrals |

**Checkpoint:** a project has a locked plan, a signed agreement on file, and a referring partner owed a calculable amount.

---

## Phase 3 — The field

**Boards:** Installer jobs, Stage 3 on site, Stage 4 site evidence, both dark variants

| # | Step | Done when |
|---|---|---|
| 3.1 | Installation record — panels, inverter (incl. **phase**), ACDB/DCDB | Saves and reloads |
| 3.2 | **Repeatable structure members** — column / rafter / purlin, add and remove rows | Four columns at four lengths persist in order |
| 3.3 | Panel serials, conditional battery bank | Battery block appears only when hybrid |
| 3.4 | Stage 4 — photo capture with `navigator.geolocation` at shutter time, server-side geo stamp | Coordinates stored in the DB, not read from EXIF |
| 3.5 | Material used (make, size, core, conductor) + earthing with resistance | All of it reaches the work completion report later |
| 3.6 | **Offline** — Dexie draft persistence + background upload queue | Aeroplane mode: fill a form, take photos, reconnect, everything syncs |
| 3.7 | PWA via Serwist — installable, offline shell | Installs on an Android phone |

**Checkpoint:** an installer works a full job on a roof with no signal and it all arrives.

---

## Phase 4 — The document engine

**Boards:** Documents & packs

This is the phase the whole system exists for.

| # | Step | Done when |
|---|---|---|
| 4.1 | `docs/DOCUMENT-GENERATION.md` — every field in all five documents mapped to a column | Each field is either mapped or listed as new |
| 4.2 | Add the remaining columns from 4.1 | Migration applied |
| 4.3 | Template registry — upload, version, activate, no deploy | Admin replaces the agreement wording themselves |
| 4.4 | **docxtemplater → Gotenberg → PDF** | A filled Work Completion Report comes out as a PDF |
| 4.5 | **Letterhead wrapper** for the ALMM declaration — header, GSTIN, footer, watermark from company settings | Changing the phone number changes it once, everywhere |
| 4.6 | **Signature compositing** — vendor constant from `public/brand`, customer from stage 2 | Commissioning certificate comes out signed on both sides |
| 4.7 | **Bank loan pack** — 11 printable items merged in order, 3 physical items on the cover checklist | One click, one correctly ordered PDF |
| 4.8 | **Portal upload pack** — size-capped files, portal naming, zip | Nothing exceeds the cap |

**Checkpoint:** press one button, get the whole bank file; press another, get the five DISCOM documents filled and signed.

---

## Phase 5 — Closing the pipeline

**Boards:** Stages 5 & 6, Stages 8 & 9

DCR certificate, meter payment, portal upload tracking, commissioning (with the **date of performance check**), subsidy received → collection task → balance → project closed.

**Checkpoint:** a project goes end to end, all nine stages.

---

## Phase 6 — Notifications and reporting

Email first via Mailpit, then Resend or SES. SMS and WhatsApp behind the same interface, switched on when DLT templates clear. Dashboards, exports, audit log UI.

---

## Testing

| What | How | Why |
|---|---|---|
| Flag engine | Vitest, table-driven | Name matching has edge cases: honorifics, double spaces, initials |
| Stage gates | Vitest | A gate that opens early is the worst possible bug |
| RBAC matrix | Vitest, every role × every action | Cheap to assert, expensive to get wrong |
| Document field mapping | Vitest against a known project fixture | Catches a template change silently dropping a field |
| Critical paths | Playwright, later | Login → lead → convert → stage 1; installer offline → sync |

The first four are pure functions. They are fast, they need no database, and they cover the parts where a bug is quiet rather than loud.

---

## Risks, and what we do about them

| Risk | Response |
|---|---|
| **Template churn** — government forms change | Templates in the DB with versions; old projects keep the version they were generated with |
| **Portal file limits unknown** | `PORTAL_MAX_FILE_KB` is config, not code |
| **DLT lead time for SMS** | Ship email first; start registration in parallel if SMS matters |
| **Offline sync conflicts** | Installer data is append-mostly; last-write-wins per field with a sync timestamp, and photos never conflict because each is its own row |
| **Aadhaar handling** | Encrypted column, restricted prefix, reads logged, from Phase 1 — not bolted on |
| **Scope creep into commercial** | Residential only. Commercial is a separate pipeline and a separate decision |

---

## Still open

1. **Letterhead** — confirm `23CCYPS1427F1ZC` is the GSTIN; a transparent-background emblem would print better than the white-background one.
2. **Portal file naming and size caps** for the upload pack.
3. **Commission trigger** — currently accrues at commissioning.
4. Sample data in the design still reads Lucknow; switching to Betul when the app is seeded.

None of these block Phase 0.
