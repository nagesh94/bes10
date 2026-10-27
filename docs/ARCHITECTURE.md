# BHIM Energy Solutions — Solar CRM
## System Architecture

**Scheme:** PM Surya Ghar: Muft Bijli Yojana
**Segment:** Residential only (commercial is a separate pipeline, out of scope)
**Form factor:** Mobile-first PWA (phone, tablet, laptop)
**Scale:** 10–15 projects/month — single deployment, no queues, no horizontal scaling
**First build:** a **proof of concept running entirely locally** — Docker Compose with Postgres and MinIO. No cloud account of any kind.
**Status:** Draft v2 — architecture agreed, design complete, pre-implementation

---

## 1. What this system is

A vendor-side CRM that owns the **entire residential rooftop solar lifecycle**, from first contact to subsidy settlement.

The government portals — PM Surya Ghar, the DCR portal, the DISCOM meter-payment portal — stay **external and manual**. There is no public API for any of them. This application is therefore:

1. **The system of record** — one place where every field, document and photo for a project lives
2. **The checklist** — nothing can be skipped, every stage has a gate
3. **The document factory** — the core value: turn project data into print-ready bank packs and portal-ready upload packs

Point 3 is the reason the application exists. Everything else serves it.

---

## 2. Roles and access

Three roles. Access is enforced **server-side on every action**; the UI only reflects it.

| Capability | Admin | Employee | Installer | Channel partner |
|---|:---:|:---:|:---:|:---:|
| Leads — create, edit, convert to prospect | ✅ | ✅ | ❌ | ❌ |
| Submit a referral | ✅ | ✅ | ✅ | ✅ |
| Prospect form (all 8 sections) | ✅ | ✅ | ❌ | ❌ |
| Resolve flags (name change, load enhancement) | ✅ | ✅ | ❌ | ❌ |
| **Payment plan, payments received, finance amounts** | ✅ | ❌ | ❌ | ❌ |
| **Project value, subsidy amount, outstanding balance** | ✅ | ❌ | ❌ | ❌ |
| **Partner rates and payouts** | ✅ | ❌ | ❌ | ❌ *own commission only* |
| Stage 9 — settlement | ✅ | ❌ | ❌ | ❌ |
| Upload documents | ✅ | ✅ | ❌ | ❌ |
| Assign an installer to a project | ✅ | ✅ | ❌ | ❌ |
| **Site survey** | ✅ | ✅ | ✅ | ❌ |
| Stage 3 — installation form | ✅ | ✅ | ✅ *assigned* | ❌ |
| Stage 4 — photos & material consumed | ✅ | ✅ | ✅ *assigned* | ❌ |
| Upload photos | ✅ | ✅ | ✅ | ❌ |
| Stages 5–8 (DCR, meter, portal upload, commissioning) | ✅ | ✅ | ❌ | ❌ |
| Master data, users, templates, stage override | ✅ | ❌ | ❌ | ❌ |
| Reports and dashboards | ✅ | ✅ *own + assigned* | ❌ | ❌ *own referrals* |

**Field work is open, money is not.** Site surveys, installation details and photo uploads can be done by an Admin, an Employee **or** an Installer — whoever is on site. The restriction that matters is financial, not functional.

**Money is admin only.** This is the single hardest boundary in the system. An **Employee** runs the whole pipeline — leads, prospects, flags, documents, packs, portal uploads, commissioning — and sees **no amount anywhere**: not project value, not the payment plan, not payments received, not the subsidy figure, not partner rates or payouts. An **Installer** sees no amounts either. A **Channel partner** sees only their own commission, never customer pricing.

Concretely, this means:

- `/projects/[id]/payments`, the payment-negotiation page, the partner payout screens and stage 9 settlement are **admin-only routes**, not pages with some fields hidden.
- The *Outstanding* figure on the pipeline dashboard, the Payments card and the commission on the Referred-by card are **omitted from the response** for non-admins.
- The **document side of finance stays with employees.** Uploading the Jan Samarth digital approval letter, assembling the bank loan pack and printing it are document work, so an employee does all of it — they just never see the loan amount or the project value while doing so. That split is deliberate: documents are operational, amounts are commercial.

**Design rule:** a permission matrix in one module (`lib/rbac/permissions.ts`), checked by a single `can(user, action, resource)` guard. Never scattered role checks.

**Enforced at the query layer.** Monetary columns are selected only for admins; a non-admin request never loads them, so there is no amount sitting in a payload waiting to be revealed by the browser's dev tools. Hiding a field in the interface is not a control.

**No approval gates.** An Employee can advance any stage they have access to without Admin sign-off. Admin's extra power is master data, user management, and overriding a stage gate (which is logged with a mandatory reason).

---

## 3. Entity lifecycle

```
       ┌────────┐   Convert button    ┌──────────┐   Stage 2 complete   ┌──────────┐
       │  LEAD  │ ──────────────────► │ PROSPECT │ ───────────────────► │ CUSTOMER │
       └────────┘                     └──────────┘                      └──────────┘
  first contact,        national portal application created        agreement signed
  basic details         + initial form filled + explicit            and scanned back
                        "Convert to Prospect" action
```

**One `projects` table with a `stage` enum — not three tables.** Lead/Prospect/Customer is a *status*, not a different kind of thing. Separate tables would mean data migration on every transition and a lost history. We get `lifecycle_stage`, `pipeline_stage`, `stage_entered_at` and a full `stage_history` trail instead.

### The 9 pipeline stages

| # | Stage | Completion gate |
|---|---|---|
| 1 | **Onboarding & documentation** | 8-section prospect form complete, all flags resolved, payment plan saved |
| 2 | **Agreement** | Quotation uploaded, agreement generated → printed → wet-signed by both parties → scanned → uploaded |
| 3 | **Installation** | Installation record complete, incl. battery block if hybrid |
| 4 | **Post-installation** | All required geotagged photos present + material consumption recorded |
| 5 | **DCR certificate** | Certificate uploaded + DCR number recorded |
| 6 | **Meter payment** | Receipt uploaded + status = paid |
| 7 | **Document generation & portal upload** | Every generated document produced, signed where required, each marked uploaded to the PM Surya Ghar portal |
| 8 | **Commissioning** | DISCOM commissioning certificate / net meter installed and recorded |
| 9 | **Subsidy & settlement** *(admin only)* | Subsidy received → outstanding balance collected → project closed |

Each stage carries `not_started | in_progress | blocked | complete`, who completed it, and when.

**Stage gating** is declared in code (`lib/workflow/stages.ts`) as a list of required records and documents per stage. A stage cannot be marked complete until its checklist passes, and cannot open until the prior stage is complete — unless an Admin overrides, which demands a written reason and is audit-logged.

---

## 4. Data model

### Core

```
users                 id, email, password_hash, totp_secret, role, name, phone, active
sessions              (managed by auth library)

contacts              id, first_name, last_name, gender, phone, email,
                      address, pin_code

projects              id, project_code (BHIM-2026-0001), contact_id,
                      lifecycle_stage  (LEAD | PROSPECT | CUSTOMER),
                      pipeline_stage   (1..9),
                      segment          (RESIDENTIAL),
                      assigned_employee_id, assigned_installer_id,
                      created_by, created_at

project_stage_progress  project_id, stage_no, status, completed_by,
                        completed_at, blocked_reason
stage_history           project_id, from_stage, to_stage, actor_id, at, note,
                        override_reason
```

### Stage 1 — the prospect form, one table per section

```
application_details   project_id, national_portal_id, application_date,
                      circle_name, division_name, subdivision_name,
                      is_dcr (bool), wants_subsidy (bool)

rooftop_details       project_id, plant_size_kw, latitude, longitude

identity_aadhaar      project_id, name_on_aadhaar, address_on_aadhaar,
                      aadhaar_last4, aadhaar_encrypted
identity_pan          project_id, name_on_pan, pan_number
bank_account          project_id, bank_name, account_holder_name,
                      account_number, ifsc_code
electricity_connection project_id, consumer_number, sanctioned_load_kw,
                      current_bill_amount

other_details         project_id, panel_type, panel_company, meter_type

site_survey           project_id, expected_wire_length_m, ac_cable_length_m,
                      dc_cable_length_m, earthing_length_m, la_length_m,
                      pipes_required
```

### Flags

```
flags                 project_id, type (NAME_MISMATCH | LOAD_ENHANCEMENT),
                      status (OPEN | IN_PROGRESS | RESOLVED | WAIVED),
                      detected_at, detail_json, resolved_by, resolved_at,
                      waiver_reason

name_change_request   flag_id, applicant_photo_doc_id, khasra_number,
                      noc_document_id, submitted_at, completed_at
load_change_request   flag_id, current_sanctioned_kw, required_kw,
                      applied_at, approved_at, new_sanctioned_kw
```

### Money

```
payment_plan          project_id, mode (CASH | FINANCE | SPLIT),
                      total_project_value, cash_component, finance_component

payment_milestones    project_id, amount, trigger
                      (UPFRONT | ON_INSTALL | PSS1 | PSS2 |
                       POST_SUBSIDY | ON_LOAN_DISBURSAL),
                      due_date, sort_order

payments_received     project_id, milestone_id, amount, mode
                      (CASH|UPI|CHEQUE|NEFT|
                       LOAN_DISBURSAL_PSS1|LOAN_DISBURSAL_PSS2),
                      received_on, reference_no, proof_document_id, recorded_by

customer_advances     project_id, amount, mode, paid_on, reference_no,
                      note, recorded_by

finance_application   project_id, bank_name, loan_amount, application_no,
                      status, sanctioned_on, disbursed_on

subsidy               project_id, status
                      (NOT_APPLIED | APPLIED | APPROVED | RECEIVED),
                      expected_amount, received_amount, received_on
```

### Referrals and channel partners

```
channel_partners      id, user_id (nullable until they sign in),
                      name, phone, email, pan, bank_account, ifsc,
                      commission_basis (PER_KW | FLAT_PER_PROJECT),
                      commission_rate, active

referrals             partner_id, project_id, referred_on, note
                      (one per project; a project has at most one referrer)

commissions           referral_id, project_id,
                      basis, rate, kw, gross_amount,
                      status (ACCRUED | DUE | PAID | CANCELLED),
                      accrued_on, due_on

commission_payouts    partner_id, gross_amount, tds_amount, net_amount,
                      paid_on, mode, reference_no, proof_document_id,
                      recorded_by
                      (one payout settles many commissions)
```

**Commission accrues at commissioning (stage 8), not at referral.** Nobody is paid for a lead that never got built. The rate lives on the partner, so different partners can be on different terms, and the rate in force is copied onto the `commissions` row so a later rate change never rewrites history.

**TDS.** Referral commission to a non-employee attracts TDS under section 194H (5%). Payouts therefore record gross, TDS and net separately rather than one figure — the partner's PAN is captured for the same reason.

### Stage 3–4 — installation and evidence

```
installation          project_id, installation_date,
                      inverter_company, inverter_model, inverter_serial,
                      inverter_capacity_kw,
                      inverter_phase (SINGLE | THREE),
                      is_hybrid (bool),
                      panel_company, panel_model, total_panels,
                      total_capacity_kw,
                      structure_company, leg_count,
                      acdb_company, acdb_size, dcdb_company, dcdb_size

panel_serials         installation_id, serial_no            (one row per panel)

-- Column, rafter and purlin are the SAME shape: any number of runs,
-- each with its own size, length and count. A 3 kW roof commonly has
-- four columns at four different lengths, so this can never be three
-- fixed "size" columns on `installation`.
structure_members     installation_id,
                      member_type (COLUMN | RAFTER | PURLIN),
                      size,          -- e.g. "75 x 40 mm"
                      length_m,
                      quantity,
                      sort_order

battery_bank          installation_id, manufacturer, battery_type,
                      cell_capacity, series_count, parallel_count,
                      total_capacity, total_voltage
battery_serials       battery_bank_id, serial_no

material_consumption  project_id, category (AC | DC | LA | EARTHING),
                      length_m, size
```

### Documents and evidence

```
documents             id, project_id,
                      doc_type,            -- AADHAAR, PAN, BILL, BANK_PROOF,
                                           -- QUOTATION, AGREEMENT, NOC,
                                           -- DCR_CERT, METER_RECEIPT, ...
                      doc_class,           -- COLLECTED | GENERATED | EXECUTED
                                           -- | EVIDENCE | EXTERNAL
                      status,              -- PENDING | GENERATED | PRINTED
                                           -- | SIGNED | SCANNED | UPLOADED_TO_PORTAL
                                           -- | VERIFIED | REJECTED
                      s3_key_original, s3_key_portal, s3_key_thumb,
                      mime_type, size_bytes, page_count,
                      signed_copy_of,      -- self-reference: scan → generated doc
                      supersedes_id,       -- version chain
                      template_id, generated_at,
                      uploaded_by, uploaded_at,
                      portal_uploaded_at, verified_by

photos                id, project_id, photo_type,
                      -- CUSTOMER_WITH_PANEL, CUSTOMER_WITH_INVERTER,
                      -- EARTHING_AC, EARTHING_DC, EARTHING_PIT, SITE_SURVEY
                      s3_key_original, s3_key_portal, s3_key_thumb,
                      latitude, longitude, accuracy_m, captured_at,
                      uploaded_by, device_info

document_templates    id, name, doc_type, version, engine (DOCX | PDF_FORM
                      | PDF_OVERLAY), s3_key, field_map_json, active
```

### External references and audit

```
external_refs         project_id, national_portal_id, dcr_number,
                      meter_payment_ref, commissioning_cert_no,
                      net_meter_serial

audit_log             actor_id, action, entity_type, entity_id,
                      before_json, after_json, ip, at
```

### Master data (Admin-editable, no deploy needed)

```
panel_companies, panel_models, inverter_models, structure_companies,
banks, discoms → circles → divisions → subdivisions, plant_size_catalog
```

---

## 5. The flag engine

Flags are **derived from form data**, created automatically, and block Stage 1 completion until resolved or waived.

### Name-mismatch flag

Fires when the name on **Aadhaar**, **PAN**, **electricity bill** and **bank account** are not a match.

Comparison is normalised before matching — case, extra whitespace, punctuation, and common honorifics (Shri/Smt/Mr/Mrs) stripped — then compared with a similarity threshold rather than strict equality, so `RAJESH KUMAR` and `Rajesh  Kumar` do not raise a false flag while `Rajesh Kumar` vs `Suresh Kumar` does. Near-matches are surfaced to the Employee for a judgement call rather than auto-resolved.

**Resolution path:** name change on the electricity bill, applied for on the **MPCZ DISCOM portal** (the app provides a deep link), requiring

- applicant photo
- khasra number
- NOC certificate — **prepared outside the app and uploaded**, like the quotation

### Load-enhancement flag

Fires when `electricity_connection.sanctioned_load_kw < rooftop_details.plant_size_kw`.

Rule: sanctioned load must be **greater than or equal to** plant capacity. A 3 kW plant on a 2 kW sanctioned connection requires enhancement to 4 kW. The application computes and displays the required load.

**Resolution path:** load-enhancement application on the **MPCZ DISCOM portal** (again, a deep link from the flag), tracked with its own status and acknowledgement number, with the new sanctioned load recorded on approval.

Both deep-link URLs live in master data, not in code, so another DISCOM zone can be added without a deploy.

Both flags are optional by nature — they exist only when the data triggers them — and both carry an independent status plus an Admin waiver path with a mandatory reason.

---

## 6. The document engine

This is the core of the system.

### Document classes

| Class | Origin | Examples |
|---|---|---|
| **COLLECTED** | Prepared outside the app and uploaded | Aadhaar, PAN, electricity bill, cancelled cheque, **bank statement**, **passport photographs**, khasra, **quotation**, **NOC certificate** |
| **GENERATED** | Produced by this app from a template + project data | Agreement — plus whatever the supplied templates turn out to cover |
| **EXECUTED** | Generated → printed → wet-signed → scanned → re-uploaded | Signed agreement |
| **EVIDENCE** | Captured in the field | Geotagged site and installation photos |
| **EXTERNAL** | Downloaded from a government portal, then uploaded here | **Acknowledgement**, **feasibility report**, **site feasibility report**, **e-token** (four separate papers, not two), **Jan Samarth digital approval letter**, DCR certificate, meter receipt, commissioning certificate |
| **PHYSICAL** | An object, not a file — it can only be checklisted | Passport photographs, cheques, stamp paper |

**Two documents moved out of GENERATED.** There is no subsidy claim form to produce — the subsidy is applied for on the PM Surya Ghar portal directly. And the NOC is prepared outside the app and uploaded. The generated set is therefore the agreement plus whatever the supplied templates cover; the engine below is unchanged either way.

### The external portals

Four places the app sends you to, and takes a result back from. None of them has an API, so these steps stay deliberately manual — what the app adds is that the reference number and the file cannot go missing, and the next stage will not open without them.

| Portal | What happens there | What comes back |
|---|---|---|
| **PM Surya Ghar** | The application, and the subsidy claim | National Portal ID; subsidy status; the **acknowledgement**, **feasibility report**, **site feasibility report** and **e-token**, all issued there and uploaded back here |
| **Jan Samarth** | The bank loan application | **Digital approval letter**, uploaded here; lender and sanction number; the money itself in two releases, PSS1 and PSS2 |
| **MPCZ DISCOM** | Name change; load enhancement | Acknowledgement numbers, revised bill, new sanctioned load |
| **DCR portal / DISCOM vendor login** | DCR certificate; meter payment | Certificate and number; payment receipt |

### Document lifecycle

```
PENDING → GENERATED → PRINTED → SIGNED → SCANNED → UPLOADED_TO_PORTAL → VERIFIED
                                                                      ↘ REJECTED
```

A scanned signed copy is stored as a **separate linked record** (`signed_copy_of`), never as a replacement for the generated original. Both are retained.

**There is no e-signature anywhere in this system.** The agreement is generated, printed, signed on paper by both parties, scanned, and uploaded.

### File variants — generated automatically on every upload

| Variant | Purpose | Treatment |
|---|---|---|
| `original` | **Printing** — bank packs, physical submission | Stored untouched, full resolution |
| `portal` | **PM Surya Ghar upload** | Compressed under a configurable size cap (govt portals typically cap at 200–500 KB) and format-normalised |
| `thumb` | UI listings | Small JPEG |

The original is never destructively compressed. Shrinking files to satisfy a portal limit is done by the server, automatically — not by a person on a phone.

### Document packs

The highest-value feature. Select a project, press one button.

#### The bank loan pack

One click prints the whole bank file in order, at full resolution, with a cover checklist on top. Fixed contents, 23 pages:

| # | Item | Pages | Where it comes from |
|---|---|---|---|
| 1 | Cover checklist | 1 | Generated at print time |
| 2 | Aadhaar card | 1 | Collected |
| 3 | PAN card | 1 | Collected |
| 4 | Electricity bill | 2 | Collected |
| 5 | Cancelled cheque | 1 | Collected |
| 6 | Bank statement | 6 | Collected |
| 7 | Quotation | 2 | Collected (priced outside the app) |
| 8 | Vendor agreement — signed scan | 4 | Generated, then wet-signed and scanned back |
| 9 | Acknowledgement | 1 | **PM Surya Ghar portal** |
| 10 | Feasibility report | 1 | **PM Surya Ghar portal** |
| 11 | Site feasibility report | 2 | **PM Surya Ghar portal** |
| 12 | E-token | 1 | **PM Surya Ghar portal** |
| 13 | Sanction letter | 2 | **Jan Samarth** |

**Three items in the bank file cannot be printed**, because they are objects rather than documents:

- Passport photographs × 2
- Cheques × 3
- Stamp paper, ₹1,500 × 1

These go on the **cover checklist** as hand-attach items. That is the whole point of the cover sheet: the pack prints in one action, and the one thing a printer cannot do is still accounted for, so nobody reaches the bank a cheque short.

The acknowledgement, the DISCOM's feasibility report, the site feasibility report and the e-token all come **off the PM Surya Ghar portal**, downloaded from there and uploaded into the app by an employee or admin — same pattern as the DCR certificate and the digital approval letter. All four are part of the bank file, which is where they are uploaded.

#### The portal upload pack

Individual size-compliant files, named to match what the PM Surya Ghar portal asks for, delivered as a zip.

Implementation for both: `pdf-lib` for merge, order and overlay; `sharp` for resizing. The pack definition — which documents, in which order, and which physical items — lives in configuration, so a bank that wants a different order does not need a code change.

### Template engine

Templates live in the database (`document_templates`), uploadable by an Admin without a deploy, and versioned.

Engine chosen per template:

- **DOCX** — `docxtemplater` with placeholders, rendered to PDF. **Preferred** — your team edits wording without a code change.
- **PDF_FORM** — `pdf-lib` filling an existing AcroForm
- **PDF_OVERLAY** — `pdf-lib` drawing text at mapped coordinates onto a flat government PDF. Exact-looking but rigid; a coordinate map per template.

---

## 7. The money pipeline

Separating **expected** from **received** is what makes post-subsidy collection work.

```
payment_plan ──► payment_milestones (expected inflows)
                        ▲
                        │ reconciled against
                        ▼
                 payments_received (actual, with proof upload)
                        ▲
                        │ cleared by
                        │
                 customer_advances (money handed to the customer)
                        │
                        ▼
                 outstanding_balance (computed)
```

Outstanding is the project value **plus** anything handed to the customer, less
what has come in. An advance is neither a discount nor an expense: the office
pays a fee on their behalf or fronts cash against a subsidy that has not
landed, and it is owed back, so it belongs on the balance rather than in a
ledger of its own.

Under PM Surya Ghar the subsidy (CFA) is credited to the **customer's** bank account, not the vendor's. That is precisely why `subsidy.status → RECEIVED` is the event that triggers collection of the customer's remaining balance.

**Event flow:**

```
subsidy.status = RECEIVED
   ├─► create collection task for assigned Employee
   └─► queue customer notification (balance due)
```

The event and the task are built now. Actual message sending is wired in the notification phase.

---

## 8. Notifications (later phase, designed for now)

A single `notifications` table and a provider interface, so channels can be added without touching business logic.

**Practical constraint:** Indian SMS requires **TRAI DLT registration** — sender ID and every message template must be pre-approved, which takes days to weeks. WhatsApp Business templates need Meta approval. **Email works immediately** with no approval.

**Therefore: ship email first (Resend or SES), with SMS and WhatsApp behind the same interface.** If customer SMS matters, start DLT registration in parallel with development rather than discovering the lead time at launch.

---

## 9. Technology

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router), React 19, TypeScript** | One codebase, frontend + backend, as required |
| API | Route Handlers + Server Actions | No separate API service to run |
| Database | **PostgreSQL** + **Drizzle ORM** | Wide relational schema with many enums; readable SQL migrations |
| UI | **Tailwind CSS + shadcn/ui** | Mobile-first, accessible components we own outright |
| Forms | **React Hook Form + Zod** | ~80 fields in Stage 1 alone. One Zod schema per section, reused client **and** server, and it also drives the flag engine |
| Auth | **Better Auth** | **Email + password only for now.** Sessions and roles built in; its TOTP plugin can be switched on later without changing how anyone signs in today |
| Storage | **S3 API** — **MinIO locally**, S3 or R2 later | Presigned direct upload from the phone, SSE, versioning. MinIO speaks the same API, so the code never changes |
| Theming | CSS custom properties + `data-theme` | Light, dark and system, with no duplicated stylesheets |
| Language | `next-intl` | English and Hindi, switchable at runtime |
| PWA | **Serwist** | Installable on Android, iOS and desktop |
| Images | `browser-image-compression`, `sharp` | Client-side pre-upload trim for photos; server-side variants and geotag stamping |
| PDF | `@react-pdf/renderer`, `pdf-lib`, `docxtemplater` | Own templates, form filling, merging, overlay |
| Offline | **Dexie (IndexedDB)** + upload queue | Installers work on rooftops with poor signal |
| Email | Mailpit locally, Resend or SES later | Mailpit catches every mail in a local inbox, so nothing escapes during the POC |
| Hosting | **Docker Compose on a laptop** for the POC; a single VPS or Vercel + Neon later | At 10–15 projects/month, one small box is plenty |

**Deliberately excluded at this scale:** Redis, background job queues, microservices, horizontal scaling, a separate API gateway. Processing runs inline. Adding these later is easy; carrying them now is pure cost.

### Why the S3 API, and why MinIO first

Google Drive requires OAuth token refresh, carries per-user quotas and rate limits, and cannot do presigned direct upload. For an application whose core is documents and photos, the S3 API is the clear choice.

**MinIO is S3.** It implements the same API, so the application talks to one `S3Client` whose endpoint is a configuration value. Moving from the laptop to AWS or Cloudflare R2 later is a change of four environment variables, not a change of code. This is the main reason to run the POC on MinIO rather than, say, the local filesystem — a filesystem-backed POC would have to be rewritten.

### Local development — the POC stack

Everything runs on the machine. No cloud account, no bill, no network dependency.

```
docker compose up
  ├─ postgres:17        →  localhost:5432    the database
  ├─ minio              →  localhost:9000    S3-compatible object storage
  │                        localhost:9001    MinIO web console
  ├─ minio-init         →  creates the bucket and sets versioning, then exits
  └─ mailpit            →  localhost:8025    catches every outgoing email
next dev                →  localhost:3000    the application
```

Buckets created on first run: `bhim-documents` (versioning on, no lifecycle expiry) and `bhim-temp`.

The compose file lives at the repository root. A single `.env` (gitignored) holds every variable and is used in development and on the server alike, both pointing at the live Neon database and bucket; see `NEON.md`. The only line that differs between the two is `AUTH_URL`.

### Theming — light and dark

One token set, declared as CSS custom properties on `:root`, redefined under `[data-theme="dark"]`, with a `prefers-color-scheme` fallback so **System** works before any choice is made. There is no second stylesheet and no duplicated component.

Dark mode is not an inversion. It changes which colour does the structural work:

| Role | Light | Dark |
|---|---|---|
| Page ground | `#F4F6F9` | `#0A1626` — brand navy becomes the ground |
| Surface | `#FFFFFF` | `#11203A` |
| Hairline | `#DDE3EC` | `#223A61` |
| Body text | `#0F1B2D` | `#E9EFF8` |
| Muted text | `#54657E` | `#91A6C5` |
| Primary action | `#FF7A00` with navy text | unchanged — orange carries more weight |
| Complete | `#1E7A2E` | `#35B55A` — lightened to stay legible |
| Flag | `#92400E` on `#FEF3C7` | `#FBBF24` on `#3A2A08` |

**Greens and ambers are lightened in dark mode, not reused.** The light-mode values fail contrast on a dark surface. Orange keeps navy text in both themes, because white on `#FF7A00` fails in either.

The theme is stored per user in the database and mirrored to `localStorage`, so the correct theme paints on first render rather than flashing.

### Language — English and Hindi

`next-intl`, with all copy in message catalogues and no hard-coded strings in components. The choice is stored per user and switchable at runtime.

**What does not get translated.** Reference numbers, serials, Portal IDs, consumer numbers, IFSC codes, PAN numbers and amounts stay in Latin digits and monospace in both languages. These are read aloud over the phone and retyped into government portals exactly as shown; localising the digits would be an error, not a feature. Customer and staff names are data, not chrome, so they are rendered as entered.

**Typography.** Noto Sans Devanagari pairs with Archivo. Devanagari sets roughly 15% wider than Latin and has taller ascenders, so nothing is sized to fit the English string exactly — buttons and chips size to content, table columns are given room, and line heights are set loosely enough for the matra marks.

---

## 10. Offline support

Installers fill Stages 3 and 4 standing on a rooftop, frequently without signal. Retrofitting offline support is painful; building it in is cheap.

- Form state persisted to **IndexedDB** as the user types
- Photos queued locally with their captured GPS coordinates
- A background sync queue drains when connectivity returns
- Clear UI state: *saved locally / syncing / synced*

**iOS caveat:** Safari strips EXIF GPS from web uploads. Coordinates must be captured from `navigator.geolocation` at shutter time and stored in the database alongside the file. EXIF cannot be relied on.

---

## 11. Security and compliance

- **Aadhaar number** — last 4 digits stored in plaintext for display, full number encrypted at the column level. Document files in a restricted S3 prefix. Every read audit-logged. This is transparent to printing and download.
- **S3** — server-side encryption, bucket versioning on, **no lifecycle deletion rules**. A bank or the portal may request a document a year later.
- **Access** — presigned URLs, short-lived, generated per request after an RBAC check. No public bucket objects.
- **Audit log** — every mutation records actor, before/after, timestamp.
- **Auth** — email and password. Accounts are created by an Admin; there is no self-registration, including for channel partners. Two-factor is deferred, not ruled out: Better Auth's TOTP plugin can be enabled later without migrating anybody.

---

## 12. Application structure

```
app/
  (auth)/login, /setup-2fa
  (app)/
    dashboard/                  pipeline board — every project × every stage
    leads/                      list, create, convert
    projects/[id]/
      overview/
      stage-1-onboarding/       8-section form, flags
      stage-2-agreement/        quotation, generate, upload signed scan
      stage-3-installation/
      stage-4-evidence/         photos + material
      stage-5-dcr/
      stage-6-meter/
      stage-7-documents/        generate packs, mark portal-uploaded
      stage-8-commissioning/
      stage-9-settlement/       subsidy, balance collection
      documents/
      payments/
    installer/                  restricted view — assigned projects only
    admin/                      users, master data, templates, audit
lib/
  rbac/permissions.ts           single source of truth for access
  workflow/stages.ts            declarative stage gates
  flags/engine.ts               name-match + load rules
  documents/
    generate.ts, pack.ts, variants.ts
  db/schema.ts
  validation/                   Zod schemas, shared client + server
```

---

## 13. Build phases

| Phase | Contents |
|---|---|
| **0** | Docker Compose (Postgres, MinIO, Mailpit), scaffold, theming tokens, English + Hindi catalogues, auth + TOTP, RBAC, user management, master data, app shell |
| **1** | Leads, projects, Stage 1 eight-section form, flag engine, conversion to Prospect |
| **2** | Payment plan, payments received, Jan Samarth + approval letter, Stage 2 agreement + quotation upload |
| **2b** | Channel partners, referral attribution, commission accrual and payouts, partner portal |
| **3** | Stage 3 installation, Stage 4 photos with geotagging, offline queue |
| **4** | Document engine — templates, generation, variants, bank and portal packs |
| **5** | Stages 5–9: DCR, meter payment, portal upload tracking, commissioning, subsidy settlement |
| **6** | Notifications, dashboards, reporting |

---

## 14. Open items

1. **Template format** — Word, fillable PDF, or flat government PDF? Determines the engine per template. *(Templates to be supplied.)*
2. **Customer signature image** — the agreement is wet-signed on paper, so what is the uploaded signature used for? Embedded into other generated documents so they come out pre-signed, or held as a specimen only?
3. **Portal field names** — exact file naming and size limits the PM Surya Ghar portal expects, to configure the Portal Upload Pack.
4. **Operating region** — the DISCOM deep links are MPCZ (Madhya Pradesh), but the sample data in the design still reads Lucknow. Confirm the region and the sample set gets switched to match.
5. **Commission trigger** — modelled as accruing at commissioning (stage 8). Confirm, or move it to full payment collection.
6. **Page counts in the bank pack** — the per-document page counts are estimates. They resolve themselves once real files are uploaded; only the order is fixed.

### Assumption flagged

The instruction *"an NOC will be generated from the code for name change request we are just going to upload it"* reads two ways. It has been built as **NOC uploaded, not generated**, on the strength of "we are just going to upload it". If the NOC should in fact be produced from a template like the agreement, say so — it is a small change, the generation engine is already there.
