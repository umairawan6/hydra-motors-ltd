# Hydra Motors dealership workspace

Next.js App Router + React + TypeScript + Supabase PostgreSQL/Auth. The navy/cyan design is retained.

## What is implemented

Phases **0–6** are implemented: foundation, access, customers/stock, customer invoicing, financial invoices and sales/profit reporting. Phase 7 is in progress.

- Responsive staff portal, login, password reset/setup, logout and session refresh.
- Database-backed overview; no fabricated sales/customer/stock numbers.
- Staff invitations, separate activation, default/custom roles and configurable permissions.
- Server-side authorization plus database Row Level Security (RLS).
- Audited access changes, self-access protection and at least one active administrator preserved through app workflows.
- Versioned SQL migrations, typed data access, lint/typecheck/tests and production build.
- Customers and vehicle stock: create/edit/archive, search, status filters, pagination, optimistic edit versions, restricted costs and private photos.
- Customer sale drafts, discounts/charges, atomic issue-time numbering and stock transition, immutable snapshots, PDF storage, receipts/deposits, refunds, credits and stock returns.
- Finance-provider contacts, collection invoices linked to existing sales, settlement allocations, remittance references, due/paid filters and void history.
- Supplier bills, payments/refunds, private attachments and explicit vehicle cost allocation without adding settled expenses again.

Sales/profit charts and permission-aware CSV exports are live. **Current work:** phase 7 workflow acceptance and release readiness. Full hosted workflow acceptance remains pending; see the [release checklist](docs/release-readiness.md) for evidence and outstanding checks.

The original invoice editor was absent from the starter. On 15 October 2026 the owner supplied a previous invoice PDF; its layout and embedded logo now provide the customer invoice design reference. See docs/baseline.md.

### Cloud setup progress — 15 October 2026

- Existing Supabase project: `qcmedrrqfkmihoevchiq` (Hydra Motors LTD). The 11 application migrations and `20261015000100_auth_helper_privileges.sql` were applied through the Supabase integration. Remote history versions/names were aligned with the repository filenames for future CLI migrations. Do not rerun them manually; inspect the remote migration history before future changes.
- Verified live: 20 public tables with RLS enabled, three private storage buckets, four default roles, and one confirmed active administrator. Anonymous execution of the profile helper is revoked; authenticated staff retain access.
- Public signup is disabled; email/password login and email confirmation remain enabled.
- Local `.env.local` is configured and ignored by Git. It connects to this same cloud database: local changes affect real data. Use a separate Supabase project for disposable testing.
- Vercel project: `hydra-motors-ltd`. Live production URL: **https://hydra-motors-ltd.vercel.app**. The existing Supabase integration supplied its Production keys; `NEXT_PUBLIC_SITE_URL` was added. Vercel reported Ready, and the owner successfully signed in as Administrator on the public production domain. Staff management loaded successfully. Local Storage API access was verified with the saved server key; live invoice/upload workflows remain untested.
- Supabase Site URL points to the production origin. Exact `/auth/confirm`, `/auth/callback` and `/auth/callback?next=/update-password` redirects are configured for production, `localhost:3000` and `127.0.0.1:3000`.
- Email onboarding/reset is deferred by the owner: the current Supabase dashboard requires custom SMTP (or a paid email-template option) before templates can be edited. No SMTP service or paid upgrade was configured. Do not rely on app invitations or password-reset emails until SMTP, the templates below and delivery are tested.
- Vercel's Production branch is **`features/new-version`**, which is published to GitHub. Push reviewed changes to that branch to deploy automatically. `main` still contains the old starter. If you later merge the app into `main`, change Vercel Settings → Environments → Production → Branch Tracking to `main` at the same time.

For normal use, open `/login` and use your administrator email and password. In **Users**, administrators can assign a role and activate a dashboard-created account. Once SMTP is configured, invitations let staff choose their own passwords; new staff still require activation. Complete **Settings → Invoice settings** with real dealership details, no-VAT confirmation and terms before issuing invoices.

**Add staff while email is deferred:**
1. In Supabase → Authentication → Users → Add user → Create new user, enter the staff email. The account owner should set a unique password themselves; keep Auto confirm user checked for this administrator-managed setup. Avoid shared passwords.
2. Sign in to the app as an administrator and open **Staff accounts**. Find the new inactive account, choose Manager, Sales or Accountant as appropriate, enable Active and save.
3. The staff member can sign in at the live `/login` page with their own credentials. Review **Roles & permissions** before changing role capabilities. Administrator has full access; assign it only when needed.

Local startup with the configured environment: `npm ci`, `npm run dev`, then open `http://127.0.0.1:3000`. If the production preview is already using port 3000, stop it before starting development. Both local and hosted apps currently use the same Supabase project.

## Project roadmap

| Phase | Scope | Status |
|---|---|---|
| 0–2 | Baseline, Next.js/Supabase foundation, login and roles | Implemented |
| 3 | Customers and vehicle stock | Implemented |
| 4 | Customer invoices, payments, credits and PDF | Implemented |
| 5 | Finance-company invoices and supplier/expense invoices | Implemented |
| 6 | Sales/profit reports, date filters, monthly charts and CSV | Implemented; validation below |
| 7 | Workflow acceptance and launch readiness: independent browser concurrency, SMTP, responsive/accessibility checks and business settings | In progress; local full-workflow test and CI definition added |
| 8 — Cloud access and application security | Review all roles/RLS/RPC/Storage boundaries; strengthen administrator authentication and account recovery; review sessions, security headers, input/upload limits, abuse protection and secret/environment separation; disable test reset before real data | Planned |
| 9 — Cloud monitoring and recovery | Configure safe error/security logging and actionable alerts; review dependency updates and credential rotation; verify backup/restore on a separate environment; document incident response, deployment rollback, retention and periodic access reviews | Planned |

Phases 8 and 9 are the final two phases. They strengthen existing protections; security checks continue in every feature phase. Paid services, account-wide security changes and recovery credentials require an agreed configuration before activation.

### Phase 7: acceptance and release checks

The [release checklist](docs/release-readiness.md) tracks verified checks separately from pending hosted acceptance. Run `npm run check` and `npm run build` locally. The isolated workflow test creates fictitious customers/stock, issues an invoice, records/retries a receipt, renders the actual saved invoice snapshot as a PDF, verifies immutability after a customer edit, and reconciles the report/CSV. It rolls back all fixture records and uses no cloud credentials. Sample PDF: ignored `tmp/pdfs/workflow-acceptance.pdf`.

GitHub Actions workflow **Repository checks** runs `npm ci`, checks/tests and the production build on pushes to `main`/`features/new-version` and on pull requests. It needs no Supabase/Vercel secrets and does not deploy or run live migrations. A passing local run does not establish that GitHub Actions passed. Required-check/branch-protection settings are separate; Vercel's existing automatic Git deployment is not gated by this workflow.

SMTP remains deferred under the owner's earlier preference. Independent browser/session races, hosted private-file delivery, full keyboard/mobile acceptance and real dealership settings still need evidence. Recovery acceptance is coordinated with phase 9. Phase 7 remains open until its required checks pass. Additional communication features are assigned below; phases 8 and 9 remain the final cloud-security phases.

Customer communications requested by the owner are now scheduled within phase 7:

| Step | Planned behavior | Activation requirement |
|---|---|---|
| 7A — Invoice email copy | Automatically email the customer the issued invoice PDF once ready. Show queued/sent/failed status, last attempt and authorized retry/resend. Missing customer email is clearly flagged; email failure does not undo issuance or create another invoice. Prevent accidental duplicate sends on issue/PDF retries. | Verified sending address/domain, selected transactional-email provider and delivery tests to an explicitly approved test recipient. Planned, not implemented or sending. |
| 7B — Thank-you SMS (later) | Optional message such as “Thank you for choosing Hydra Motors. Enjoy your new car!” after a completed sale. Honor the customer's communication preference, validate the phone number and prevent duplicates. Keep SMS separate from invoice email and payment status. | Selected SMS provider, sender setup, agreed sending trigger/template, cost limits and approved test recipient. Planned for later, disabled by default. |

Supabase custom SMTP handles account invitation/password-reset email; it does **not** automatically email sales invoices. Invoice copies need a separate server-side transactional-email integration (potentially using the same email provider). Do not place email/SMS provider secrets in browser code. Phase 8 will review sending permissions, private attachments and webhook authentication; phase 9 will cover delivery alerts, retries and retention. The final two phases remain 8 and 9.

### Phase 6: using Sales & profits

Open **Sales & profits** in the sidebar. Select inclusive From/To dates (London time, up to ten years), apply the filter and download the monthly CSV if needed. Empty months show zero. Reports are aggregated in PostgreSQL, so the REST row limit cannot silently truncate the totals.

`reports.sales` grants dealership-wide aggregate sales/cash/debt figures without customer details. Profit figures and cost columns require **both** `reports.profit` and `costs.read`; these fields are omitted from database responses and CSV for other users. Default Manager can see sales reports; Administrator and Accountant can also see profit. Sales staff have no reporting access by default. Inactive accounts and anonymous/direct unpermitted RPC calls are denied.

- Gross sales use the customer sale issue date; credits reduce revenue on their own issue date. Drafts and finance-company invoice totals never add revenue.
- Cash is receipts minus refunds on payment dates, with finance settlements counted once. Outstanding and due-back balances are **current, across all dates**, separate from the selected period.
- Vehicle costs are current purchase/preparation/other costs plus open supplier bills marked additional. Included-in-base bills are not counted again. Full credits reverse the sale's vehicle cost once on the final credit date; partial credits reduce revenue only.
- Trading profit subtracts those vehicle costs and open overhead invoices dated in the selected period. It is an operational estimate before tax and unrecorded expenses. Later cost changes or bill voids restate past reports; these are not frozen accounting statements.
- Missing cost records withhold affected profit figures. Legacy issued sales without an issue date are explicitly flagged and excluded from dated revenue/profit, while their debt remains included in current balances. Reconcile these records before relying on reports.

Validation: lint, typecheck and production build passed; 108 tests passed together, followed by the additional return/resale test (16 reporting tests, 109 total). Fixtures cover partial/full credits, later-period credits, London summer-time boundaries, missing costs, finance settlement deduplication, supplier cost treatments, empty dates, CSV and permission boundaries. Live verification is read-only; it does not issue invoices or reset test data.

### Optional Auto Trader stock connection

**Feasible, subject to Hydra's approved API access.** Auto Trader Connect's [Stock Sync](https://help.autotrader.co.uk/hc/en-gb/articles/21846314775453-Introduction-to-Stock-Sync) supports a paginated stock baseline for a dealer advertiser ID and subsequent webhook updates, including media, prices and reserved/sold/deleted status. Production access has Auto Trader integration/go-live requirements. An existing advert alone does not establish API access; confirm the account's Stock Sync entitlement and permitted fields with Auto Trader before implementation. Availability and any fees have not been confirmed for Hydra.

Planned flow: server-only credentials → reviewed import preview → match external stock ID and normalized registration/VIN → import available vehicle/specification/advert/media data → retry-safe updates and sync audit. Missing required values must be flagged for review; never invent vehicle details. Purchase costs, preparation expenses and internal supplier records remain manual unless an authorized source supplies them. External sold/deleted updates must not overwrite issued sale history or silently delete internal stock. Start with one-way import; retain manual stock entry. **No Auto Trader integration or scraping is implemented in this phase.**

## 1. Run locally

Requirements: Node.js **22.13+ or 24 LTS** (Node 24 used for local checks), npm and a Supabase project. Git is needed to publish the repository. Supabase CLI/Docker are optional for local database development.

From this project folder, in PowerShell:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without Supabase variables, the app displays setup instructions. Complete the sections below, fill `.env.local`, then restart the server. Never overwrite an existing `.env.local` containing your keys.

Stop any existing production preview before starting development on port 3000. If you use another port, update `NEXT_PUBLIC_SITE_URL` and the corresponding Supabase redirect URLs. After changing environment variables for a production preview, rebuild before `npm run start`.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SECRET_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

| Variable | Purpose |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Project URL from Supabase project settings |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Browser-safe publishable key; RLS protects data |
| SUPABASE_SECRET_KEY | Server-only key for staff invitations and immutable invoice PDF uploads |
| NEXT_PUBLIC_SITE_URL | Canonical app origin for invite/reset redirects; required, no path |

Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are accepted as fallbacks. Never put a privileged key in a `NEXT_PUBLIC_` variable. Keep local env files out of Git. Public variables must be set at build time on Vercel.

Without a privileged app key, you can create users through the Supabase dashboard and activate them in the app. PDF generation/storage and app invitations require that key. Financial database mutations use the authenticated user's client and permission-checked RPCs, never the privileged client. The PDF route checks invoice access before using the privileged storage uploader.

## 2. Create and connect Supabase

1. Create a project in [Supabase](https://supabase.com/dashboard), choose your region, and save the database password securely. Use separate projects for staging and production.
2. Copy the project URL and publishable key from project settings/API keys into `.env.local`. Copy a secret key only if using the app's invitation feature.
3. Apply the database migrations using **one** method below. Do not run baseline SQL against an existing database.
4. Configure Auth and the email templates, then create the first admin.

### Fresh database: SQL Editor method

Run each complete file once, in this order:

1. `supabase/migrations/20261014000100_baseline.sql`
2. `supabase/migrations/20261014000200_access.sql`
3. `supabase/migrations/20261014000300_stock.sql`
4. `supabase/migrations/20261014000350_stock_storage.sql`
5. `supabase/migrations/20261014000400_sales.sql`
6. `supabase/migrations/20261014000450_invoice_storage.sql`
7. `supabase/migrations/20261014000500_finance.sql`
8. `supabase/migrations/20261014000550_supplier_storage.sql`
9. `supabase/migrations/20261014000575_finance_integrity.sql`
10. `supabase/migrations/20261014000590_audit_boundaries.sql`
11. `supabase/migrations/20261014000595_query_indexes.sql`
12. `supabase/migrations/20261015000100_auth_helper_privileges.sql`
13. `supabase/migrations/20261015152512_admin_test_data_reset.sql`
14. `supabase/migrations/20261015160739_sales_profit_reports.sql`
15. `supabase/migrations/20261015223253_test_reset_api_delete_guard.sql`
16. `supabase/migrations/20261015224811_draft_vehicle_stock.sql`
17. `supabase/migrations/20261015230040_autotrader_draft_import.sql`

Use a current Supabase PostgreSQL 15+ project. Storage migrations require Supabase's `storage` schema and create private buckets/policies. Before applying stock migration 00300 to existing data, resolve registrations that collide after uppercasing/removing spaces and VINs that collide after uppercasing. The migration deliberately refuses ambiguous duplicates instead of deleting vehicles.

The access migration runs in a transaction. Stop and investigate any error; do not keep executing snippets from a failed migration. SQL Editor does not automatically record CLI migration history; see the CLI section before switching methods.

### Existing original starter database

1. Back up the database and verify that it matches the original starter schema (including `profiles.role` as `public.staff_role`). Test on a staging copy first.
2. **Skip 20261014000100** because its tables already exist.
3. Run **20261014000200_access.sql once**. It preserves original records and active roles, migrates the enum to role references, and replaces fixed-role policies with permissions.
4. Existing active admins remain active. If one exists, do not run the bootstrap script again.
5. Apply every migration from **00300 onward** in filename order. If phases 0–2 were already set up, start at 00300 and do not rerun 00100 or 00200.

Existing sale invoice numbers and records are retained; versioned legacy invoice metadata receives a version suffix to distinguish records. The upgrade does not invent historical invoice snapshots or totals. Legacy documents without snapshots cannot be generated as PDFs or credited by the new workflow; retain their original documents and reconcile them separately. New drafts should be edited/saved before issuing.

If your existing database has custom tables, policies or role changes beyond the starter, review the migration against that schema first. Do not reset an existing database to fix migration errors.

### Optional CLI workflow

Install the Supabase CLI using its [official installation instructions](https://supabase.com/docs/guides/local-development/cli/getting-started). The commands below also work with `npx supabase` in place of `supabase`.

```powershell
supabase login
supabase init
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --dry-run
supabase db push
```

Run `supabase init` only if `supabase/config.toml` does not exist. `db push` applies changes to the linked project: review the dry run and confirm the project reference first.

For an unchanged starter whose baseline was previously applied manually, record that fact **before** `db push`:

```powershell
supabase migration repair 20261014000100 --status applied
supabase db push --dry-run
supabase db push
```

If both files were applied manually, record both as applied instead:

```powershell
supabase migration repair 20261014000100 20261014000200 --status applied
supabase migration list
```

`migration repair` changes history only; it does not execute SQL. Mark only migrations actually reflected in that database. Keep migrations in Git; add new files for future changes instead of editing applied migrations.

For isolated local development, install Docker, run `supabase start` after initialization, and use its local URL/keys. Apply migrations with `supabase migration up`. Configure local Auth/signup/email templates separately in `supabase/config.toml`; dashboard settings do not apply to the local stack. Never use `db reset --linked` on a live database.

## 3. Configure Supabase Auth and email

In Supabase Authentication settings:

1. Enable email/password authentication; **disable public signup**. Only invited or dashboard-created staff should have accounts.
2. Set Site URL to your app origin, initially `http://localhost:3000`.
3. Add these permitted redirect URLs, replacing the origin when deploying:
   - `http://localhost:3000/auth/confirm`
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/auth/callback?next=/update-password`
4. Configure password policy, Auth rate limits and production SMTP delivery. Use a password minimum of 12 characters to match the app. The app does not currently enforce MFA; add an MFA enrollment/enforcement phase if required before launch.
5. Update the **Invite user** and **Reset password** templates to use token-hash links. This supports opening links on a different device and avoids relying on browser fragment tokens.

Invite template link:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Set your staff password</a>
```

Reset-password template link:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset your password</a>
```

Use the correct Site URL for each Supabase environment. Production and local/staging projects should have their own Site URLs/templates. The `/auth/callback` route also supports PKCE code exchange; only explicit app destinations are permitted.

After opening the invite link, staff set a password and sign in. Their account remains **inactive until an administrator activates it**. Resetting a password does not activate an account.

## 4. Create your first administrator

1. In Supabase Authentication → Users, create your own email/password user. If the dashboard offers confirmation settings, mark the account confirmed for this initial setup.
2. Copy its user UUID. The database trigger creates an inactive sales profile automatically.
3. Open `supabase/bootstrap-admin.sql`, replace the all-zero UUID and `Owner` name, and run the complete script in the SQL Editor once.
4. Sign in at `/login`; open **Staff accounts** to invite/activate colleagues.

The bootstrap script refuses to run if an active admin already exists. Normal access changes use audited app functions. App users cannot edit their own role/activation; another administrator must do that. No delete-user workflow is implemented. Direct actions from Supabase's privileged dashboard remain the project owner's responsibility.

## 5. Roles and permissions

| Default role | Main access |
|---|---|
| Administrator | All permissions, users, roles and activity log |
| Manager | Operational customers/vehicles, all sales, invoice issuance/credits, sales reporting |
| Sales | Operational customers/vehicles and own sales/invoices |
| Accountant | Read customers/vehicles/all sales; costs, finance, payments and profit reporting |

Managers and sales staff cannot read purchase costs or allocated supplier costs by default. Profit reporting remains phase 6. Supplier payment/refund recording requires both `finance.manage` and `payments.manage`; vehicle allocation requires `costs.write`, and viewing allocated bills requires `costs.read`.

In **Roles & permissions**, create a custom role or adjust default permissions. New roles start with zero permissions. Administrator user/role/audit controls cannot be removed. Delegated user/role managers cannot grant greater access than they have or elevate themselves. All data access rechecks active state and permissions; deactivation blocks data access even before an Auth token expires. UI visibility is only a convenience; RLS and RPC checks enforce access.

Activity log includes access and business changes. Before/after snapshots are stored in the database; log writes and edits are unavailable to authenticated app clients. Audit visibility also checks the underlying sale, finance and cost permissions so an audit grant does not expose restricted costs or unrelated sales.

## Dealership workflows (phases 3–5)

### Customers and stock

1. Add customers under **Customers**. Enter a billing address before issuing a sale; archive records rather than deleting referenced history.
2. Add vehicles under **Vehicle stock**. Registration is normalized to uppercase without spaces. Use available/reserved/archived; only financial issue/return workflows can transition sold stock.
3. Enter base purchase/preparation/other costs with a cost-authorized account. Conflicting edits are rejected; refresh before reapplying changes.
4. Upload vehicle photos. Allowed: JPG, PNG, WebP, up to 5 MB. No SVG uploads. Completed photo metadata is immutable.

### Customer sales and PDFs

Sale record lookup now searches through a permission-checked server action and displays customer/vehicle match counts. A single match for an entered search is selected automatically; multiple matches populate the dropdown. No matches produces explicit feedback. Searches retain entered prices/charges and existing selections without a page reload.

Use **Edit / remove draft** from Sales & invoices to edit an unissued sale or cancel it through **Remove draft**. Cancelled drafts are retained under the `void` status filter and excluded from Active sales. For issued documents, use **View / correct invoice** and **Correct / cancel issued invoice**: credit a price correction, or fully credit/refund/return stock and create a replacement sale for incorrect buyer/vehicle details. Issued financial history and stored PDFs cannot be overwritten or permanently deleted through these controls.

Vehicle stock has **Edit / manage stock → Remove from stock** with confirmation. This archives an unsold vehicle and excludes it from the default stock list and new-sale selection. Use the `archived` filter to find it; select available/reserved in its details and save to restore. Sold vehicles require the invoice credit/return workflow first. Costs, photos and history are retained. No existing business records were removed while testing these controls.

1. As administrator, open **Invoice settings**. Save actual company name, address, registration number, contact/payment details and approved terms. Confirm **no VAT**, as selected for this implementation. VAT and margin-scheme calculation are not supported yet.
2. Create a sale, search/select an active customer and available/reserved vehicle, then enter vehicle price, discount and optional described charges. **Save the draft before issuing**; issuance uses saved values.
3. Issue the invoice with explicit confirmation. One database transaction allocates a unique number, snapshots company/customer/vehicle/prices, marks the sale issued and stock sold, and records the audit trail.
4. Open the PDF link. The trusted server renders the immutable snapshot and stores it privately. Generation failures can be retried without changing invoice number or issuing another sale. PDFs show issue-time values; current balances are on the sale screen.

The PDF uses the supplied Hydra logo, white A4 pages, navy text and a cyan divider. VAT labels/amounts are hidden. Customer invoices include optional printable seller/buyer signature lines with printed names and dates; these are blank signing spaces, not electronic signatures or proof of handover. Credit notes and finance invoices retain their distinct titles and references. A standard sample fits one page, with long terms continuing naturally. Company details/terms always come from the immutable invoice snapshot; no customer data was copied from the reference PDF. Existing stored PDFs are retained unchanged; the revised design applies when generating a PDF for the first time. The logo is bundled locally with the PDF route, without a remote image request. Example preview: `output/pdf/hydra-invoice-preview.pdf` (fictitious test data, ignored by Git).
5. Record receipts/deposits after issuance with an Admin/Accountant or other payment-authorized role. Only cleared receipts are recorded in this MVP; there is no bank/card integration. Refunds must link to an original receipt and cannot exceed its unrefunded amount.
6. Cancel unissued drafts to void them. Correct issued sales using linked credit notes; a full credit reverses the sale financially while preserving the original issued document. Net sale revenue for phase 6 must use `sale_price - credited_amount`, without subtracting those same notes again.
7. A full credit can return stock if receipts were already refunded. If you credit first and refund later, use **Return fully credited vehicle** afterward. Outstanding finance invoices must be reconciled/voided, and a newer sale prevents an old return action from changing the vehicle.

Invoice, payment and supplier-write request keys are preserved during submission retries. Do not intentionally reuse a key for different input. Financial mutations are serialized with a database advisory lock; independently running live-client concurrency tests remain a release acceptance check.

### Finance-provider invoices

1. Add provider contacts under **Finance invoices → Providers**.
2. Select an issued customer sale, provider, amount and due date. Finance invoices reserve the unallocated outstanding debt; they do not create a new sale or additional revenue.
3. Record remittances from the finance invoice screen. The receipt and its finance allocation are committed together and reduce the linked customer's balance once. Repeating the same request does not add another receipt.
4. Ordinary customer receipts cannot consume debt reserved for an open provider invoice. Record deposits first, or reconcile/void and replace the provider claim before changing the allocation. Credits cannot leave finance claims exceeding the remaining debt.
5. Record provider refunds against their original receipt on the customer sale screen. Finance balances reflect those refunds. Void an unpaid/fully refunded provider invoice with a reason before replacing it; the original PDF/history remain available.

### Supplier bills and expense allocation

1. Record the supplier's actual bill/reference, invoice date, due date, total and description. Supplier totals are recorded as billed costs; no input-VAT recovery calculation is implemented.
2. Select **Overhead** without a vehicle, **Additional vehicle expense** for a new cost, or **Already included in base costs** if that amount is already in purchase/preparation/other costs.
3. Additional open supplier bills contribute once to the vehicle's allocated-expense total. Payments/refunds do not create another cost. Included-in-base bills and overhead are excluded from that vehicle total.
4. Record supplier payments/refunds against the bill, with refunds linked to the original payment. Overpayments and excessive refunds are rejected.
5. Attach private PDF/JPG/PNG/WebP bills or receipts, maximum 5 MB. Completed attachments cannot be replaced through the app. The supplier's externally issued document is retained; the app does not invent a supplier VAT invoice.
6. Void erroneous bills only after payments have been refunded, then record a replacement. Voided originals and attachments are retained; only one open bill per normalized supplier/reference is allowed.

Financial mutations record events; they do not transfer money, charge cards or email invoices. The operator records completed real-world transactions.

### Private storage

Buckets are created by migrations: `vehicle-photos`, `invoice-pdfs`, `supplier-documents`. Keep all three private. Files are delivered through authenticated application routes with `private, no-store` headers and RLS checks, rather than public links. Uploads are checked for size and supported file signatures; bucket MIME limits are also enforced. PDFs are uploaded only by the server from immutable snapshots; authenticated clients have no PDF overwrite/delete policy.

Upload metadata is created before object storage and finalized afterward. Interrupted network requests can leave pending rows or unreferenced objects; review and clean up those pending assets through a privileged maintenance process before release. Do not delete finalized invoice documents as upload cleanup.

## 6. Checks and database types

```powershell
npm run check
npm run build
npm run start
```

`check` runs lint, typecheck and tests. Tests use PGlite (embedded PostgreSQL) to exercise actual grants, RLS and RPCs with minimal Auth/Storage identity fixtures; no live credentials or Docker needed. They cover fresh/upgrade migrations, roles, stale edits, stock uniqueness, atomic issue/retry behavior, balances, credits/refunds, finance allocation and expense counting. PDF tests generate clearly fictitious samples under ignored `tmp/pdfs/`; these were rendered for visual inspection. Local SQL fixtures do not prove live Supabase Auth, upload service behavior, independent-client concurrency or deployment behavior.

`lib/supabase/database.types.ts` contains schema-derived starter types. After connecting a project and applying migrations, generate authoritative types using an installed, logged-in Supabase CLI:

```powershell
$env:SUPABASE_PROJECT_ID = "YOUR_PROJECT_REF"
npm run db:types
npm run typecheck
```

The generation script preserves the existing file on CLI failure. Do not include database credentials or access tokens in committed scripts.

Runtime dependency audit command: `npm audit --omit=dev`. Full `npm audit` currently reports an unpatched `braces` dependency in the Next.js lint-tool chain; keep tooling updated and review upstream advisories. No runtime advisory was reported during implementation.

ESLint 9 is pinned for compatibility with Next.js's bundled lint plugins. Move to ESLint 10 once those plugins support it; do not force conflicting peer dependencies. The lockfile was checked with a clean-install dry run.

## 7. Deploy to Vercel

1. Push this repository to GitHub/GitLab/Bitbucket, including `package-lock.json`; exclude `.env.local` and privileged keys.
2. Create a [Vercel](https://vercel.com/new) project and import the repository.
3. Framework preset: **Next.js**. Root directory: this app folder (the one containing `package.json`). Node runtime: 22 or 24. Install command: `npm ci`; build command: `npm run build`; leave output directory at the framework default.
4. In Vercel Settings → Environment Variables, add the four env values listed above for the appropriate environments. Set `NEXT_PUBLIC_SITE_URL` to the chosen deployed origin, such as `https://app.hydramotors.co.uk` or your assigned `.vercel.app` URL. Add the privileged key only to environments that require invitations.
5. Apply reviewed migrations to the deployment's Supabase project before starting the app. Vercel deploys the code; it **does not automatically migrate the database**.
6. Deploy. If the assigned URL was unknown initially, update `NEXT_PUBLIC_SITE_URL`, Supabase Site URL and redirects once it is known, then redeploy. Environment-variable changes require a new build.
7. Configure the custom domain in Vercel and add the DNS records it provides. Update both app and Auth origins/redirects to the canonical domain and redeploy.
8. Use a separate staging Supabase project for Vercel Preview. Prefer a stable staging domain for email links; do not allow broad production redirect wildcards or use production customer data in previews.

Before launch, manually verify login/logout, session refresh, reset/invite links, inactive-account denial, all four roles, direct page/RPC/Storage denial, customer/stock persistence, two-client edit/issuance races, PDF generation/retry and finance/supplier reconciliation. Verify backups/restoration and monitoring. Live acceptance remains pending until these checks run against your configured staging Supabase project.

Other Node hosting can run `npm ci`, `npm run build`, then `npm run start` behind HTTPS with the same env values and Auth URLs. Static export hosting is unsuitable for this authenticated server app.

## Admin-only test data reset

Completed reset, 15 October 2026: at the owner's request, cleared the disposable customers, cars, sales, invoices/credits, payments and uploaded business files before the planned 14-vehicle Auto Trader import. Database verification found zero customers/vehicles/sales/invoices/payments, zero files in all three managed buckets, and no pending cleanup. The active administrator and company settings were preserved. No Auto Trader vehicles have been imported yet.

Migration 15 fixes a live PostgREST compatibility issue (`DELETE requires a WHERE clause`) by binding each bulk delete to the active authorized reset job. Keep Supabase safe-update protection enabled. Administrator/project/test-mode gates, role grants and durable file cleanup remain unchanged. Reset regression tests passed (14 tests), and the repaired portal reset completed successfully. The existing Hydra project already has this migration; do not rerun it manually.

While this workspace contains only disposable test data, administrators can open **Invoice settings → Manage test data** (`/dashboard/settings/test-data`). Check the displayed counts, stop other users from editing, type `RESET TEST DATA` and tick the permanent-removal confirmation before submitting. Adding this feature does not run a reset.

Reset permanently clears customers, vehicles (including archived stock), sales, invoices/credits, payments/refunds, finance providers/settlements, supplier invoices/payments, costs, uploaded files and related business audit snapshots. Staff accounts, roles, company settings, security/reset audit history and invoice number counters remain. Invoice numbers are never reused. Local and cloud applications connected to the same database share the reset.

Three server-side conditions are required: active administrator role, matching project configuration, and an enabled database switch. After applying migration 13, configure these **server-only** variables locally and in the intended Vercel environment, then redeploy:

```dotenv
ENABLE_TEST_DATA_RESET=true
TEST_DATA_RESET_PROJECT_REF=your-supabase-project-reference
```

Enable only the confirmed testing database through its Supabase SQL Editor:

```sql
update public.test_reset_control set enabled = true where id = 1;
```

The migration defaults to disabled. The owner's existing testing project has been enabled; no reset was executed during feature verification. Browser database roles cannot call the privileged reset functions directly. Database deletion is transactional; private files are removed through the Storage API in batches. If file cleanup is interrupted, **Resume cleanup** continues the saved job without deleting records added afterward. Finish cleanup before starting another testing cycle.

**Before entering real business data:** set `ENABLE_TEST_DATA_RESET=false`, redeploy, and run `update public.test_reset_control set enabled = false where id = 1;`. Use a separate Supabase project for future testing. Keep normal backups; this screen provides no undo.

Validation: 93 tests, lint, typecheck and production build passed, including reset permissions, disabled gates, retained settings/counters, immutable attachments, complete cleanup and safe retries. Live verification checks the screen without submitting a reset.

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| Setup page appears | Project URL/key absent or invalid; restart after editing env |
| Invalid credentials | Auth user exists, password correct, email confirmed, Auth available |
| Access pending | Activate the user's profile through an administrator; verify bootstrap UUID |
| Unable to load staff/permissions | Both migrations applied; correct Supabase project and schema |
| Invite fails | Server-only secret key, SMTP/rate limits, existing account and email template |
| Invite/reset link invalid | Correct Site URL, token-hash template, unused/unexpired token |
| Works locally but not on Vercel | Env values set before build, deployment uses correct DB, exact Auth URLs |
| Baseline reports table already exists | Stop; use the existing-starter upgrade path, never rerun baseline |
| CLI type generation fails | CLI on PATH, logged in, valid project reference and permissions |
| Stock migration rejects duplicate keys | Resolve normalized registration/VIN collisions before migrating; preserve history |
| Invoice cannot be issued | Save draft, active customer with billing address, eligible stock, approved company settings |
| PDF fails / retry message | Server-only key, private invoice bucket, complete new snapshot; retry the same PDF link |
| Receipt/credit blocked by finance allocation | Reconcile or void the provider claim first; use the finance settlement screen |
| Supplier allocation rejected | Overhead requires no vehicle; allocated treatments require a vehicle and cost permissions |

## Project map

```text
app/                    Login, setup, auth callbacks, customers, stock, sales, finance, expenses and admin screens
components/             Shared forms, navigation and buttons
lib/auth/               Server authorization and permission definitions
lib/supabase/           Server/admin clients and schema types
lib/business/           Shared business input validation, file checks and formatting
lib/invoices/           Immutable-snapshot PDF renderer
styles/                 Design tokens
supabase/migrations/    Versioned baseline, access, stock, financial and Storage migrations
supabase/bootstrap-admin.sql  One-time first-admin setup
tests/                  PostgreSQL workflow/permission tests and PDF renderer checks
docs/baseline.md         Current inventory, decisions and limitations
```

Planning: `prd.md`, `design system.md`, `technical-guide.md`, `project-phases.md`. Agent instructions: `AGENTS.md` → `agent.md`. Old runtime helper and old top-level SQL file were removed after replacement; original database history is retained as the baseline migration.

Gstack: its review instruction skill was installed locally at `~/.codex/skills/gstack-review`. It is available to Codex on the next turn. Review guidance was consulted for SQL safety, authorization and race conditions; full Gstack browser/runtime/specialist certification was not run. Full runtime setup requires Bun and the tools documented by [Gstack](https://github.com/garrytan/gstack#other-ai-agents).

Official references: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [database migrations](https://supabase.com/docs/guides/deployment/database-migrations), [Next.js authorization](https://nextjs.org/docs/app/guides/authentication), [Vercel Next.js deployment](https://vercel.com/docs/frameworks/full-stack/nextjs).
Phase 6 release verified on the live production domain (commit 3e1aa5e): reports loaded, the October date filter applied, and the monthly CSV downloaded with matching totals and the missing-cost warning. No business records were modified. Migration 14 is already applied to the existing Hydra testing project; do not rerun it.
Phase 7 local evidence: 110 tests, lint, typecheck and production build passed. The new full-workflow fixture rolls back its database changes; it does not issue a cloud invoice or make a real payment. Hosted acceptance remains tracked separately in docs/release-readiness.md.
Hosted Phase 7 checks passed at commit cb67cf8: https://github.com/umairawan6/hydra-motors-ltd/actions/runs/38771941579. The Linux runner completed npm ci, all 110 tests, lint/typecheck and production build without Supabase/Vercel credentials. The initial lockfile failure was repaired by adding only the two missing transitive entries; direct dependency versions are unchanged.

## Invoice warranty

On **Sales & invoices → Create sale**, choose **3 months**, **6 months** or **12 months** in Warranty, then save the draft. The default is **Not specified**; no warranty is assumed. The selection remains editable while the sale is a draft and is captured permanently at issuance. Customer invoice PDFs show the selected duration under vehicle details; unspecified/legacy warranties are omitted. Existing issued documents are unchanged. Migration `20261016122644_invoice_warranty.sql` adds the nullable constrained duration and updates the existing protected draft/issue RPCs without changing permission grants. Validation: 146 tests, lint, typecheck and production build passed; a six-month sample was rendered and visually checked on one A4 page.

## Draft vehicle stock workflow

Warranty release verification: Vercel Production `11fff65` reported Ready. The authenticated Create customer sale page displayed Not specified/3/6/12-month choices, and selecting six months worked. No live sale or invoice was created during verification; persistence and issuance were verified in the transactional database tests. Migration 18 is applied to the existing Hydra project; anonymous draft RPC execution remains denied.

New vehicles default to **Draft**. Drafts can have missing registration, make, model, year or mileage; missing data stays empty rather than being invented. VIN is optional for every status. There is one **Year** field for the car/model year, separate from the existing purchase-date field. The stock list shows year and has a Draft filter.

Open Vehicle stock, filter Draft, edit the vehicle and complete **registration, make, model, year and mileage**, then choose **Available** and save. Zero mileage is valid. Required fields react to the selected status and are validated again on the server/database RPC. Known registrations/VINs retain normalized uniqueness. Drafts cannot be selected for sales or issued through sale RPCs. Incomplete drafts may be archived and restored to Draft; Available/Reserved require complete details. Stock-write permission and stale-edit protection remain.

Migration 16 adds nullable draft import fields and activation validation while preserving existing stock/history. Future Auto Trader imports must explicitly use Draft and flag missing values for staff review. **The Auto Trader connector is not implemented yet.** Local validation: 124 tests, lint and typecheck passed.
Draft-stock live verification: Vercel Production commit a6c35b7 reported Ready. The Add Vehicle form defaulted to Draft; switching to Available made registration/make/model/year/mileage required while VIN remained optional. Draft filtering loaded correctly with zero records. No vehicle was saved during verification. Production build passed; migration 16 is already applied to the existing Hydra project.

## Import from Auto Trader option

One-time stock import (16 October 2026): the owner's requested public Auto Trader listings were transcribed to CSV, validated with the existing parser and imported using the protected transactional RPC. The live Hydra Motors Limited retailer page (retailer 10047138, Slough) showed **12 adverts**, rather than the previously mentioned 14; all 12 were imported as Drafts, with zero skipped. Make, model/variant, advertised year and mileage are populated. Registration and VIN were unavailable in the listing facts and remain empty; complete registration and review each record before marking Available. Public advert IDs use the `advert-` prefix for duplicate matching; they are not verified Connect API stock IDs. No prices, costs or photos were imported. This was a one-time import, not automatic synchronization. Source: https://www.autotrader.co.uk/dealers/buckinghamshire/slough/hydra-motors-limited-10047138 . The local CSV is `output/hydra-autotrader-2026-10-16.csv`.

Vehicle stock now has **Import from Auto Trader** next to Add vehicle. It opens `/dashboard/vehicles/import`, with **Not connected** shown for the direct API. The owner has not confirmed approved Auto Trader Connect Stock Sync access. Direct fetching, automatic synchronization and media download are not implemented/enabled; no credentials are requested in the browser. Request Stock Sync API access, advertiser ID and integration approval through the Auto Trader account manager, then arrange a server-only integration. A public advert or dealer page alone is not API authorization.

A separate **authorized stock CSV** import is available now if Auto Trader or the stock provider supplies a file (no claim is made that every account offers CSV export). Upload a UTF-8 comma-separated file, review the preview/missing fields, confirm it contains authorized Hydra stock, then click **Import as Drafts**. Supported headers: `stock_id,registration,make,model,year,mileage,vin`; aliases include `autotrader_stock_id`, `reg_number`, `model_year`. Maximum 200 vehicles/1 MB. Quote values containing commas, such as mileage `"10,000"`. Other columns, photos, prices and costs are not imported.

Each row must have a stable stock ID, registration or VIN; other details may be missing. Existing matches by stock ID, normalized registration or VIN are skipped without changing or relinking existing vehicles. Repeated imports therefore do not add the same identifiable vehicle twice. The protected RPC runs the batch transactionally, always forces Draft status, ignores supplied internal IDs/status/costs and preserves the stock-write/read permission checks and audit trail. Invalid rows block the batch; network errors tell staff to check Draft stock before retrying. Edit the imported Drafts, fill required details, then mark Available. No invoices, payments or stock costs are created by import.

Migration 17 adds the external stock ID and import RPC. Automated checks cover CSV validation/limits, missing fields, escaped values, duplicates, rollback and permissions. Local validation: 142 tests, lint, typecheck and production build passed. No Hydra vehicles have been imported during implementation.
Import-option live verification: Vercel Production 8626f84 reported Ready. Vehicle stock displayed Import from Auto Trader; its page loaded with Not connected/API access required and the separate CSV preview/import controls. No stock records were created. Automated browser file selection was blocked by the ChatGPT Chrome extension file-URL permission, so live CSV preview/submission is not claimed; parser and transactional import behavior are covered by the automated tests. Migration 17 is already applied; anonymous import execution is denied.
