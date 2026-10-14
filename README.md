# Hydra Motors dealership workspace

Next.js App Router + React + TypeScript + Supabase PostgreSQL/Auth. The navy/cyan design is retained.

## What is implemented

First three planned phases **0, 1 and 2**: baseline, application foundation and access control.

- Responsive staff portal, login, password reset/setup, logout and session refresh.
- Database-backed overview; no fabricated sales/customer/stock numbers.
- Staff invitations, separate activation, default/custom roles and configurable permissions.
- Server-side authorization plus database Row Level Security (RLS).
- Audited access changes, self-access protection and at least one active administrator preserved through app workflows.
- Versioned SQL migrations, typed data access, lint/typecheck/tests and production build.

**Next:** phase 3 customer/vehicle CRUD; phases 4–6 invoices, payments, finance/expenses and reporting. These modules are not implemented yet. Financial writes are disabled until safe transactional workflows are added. This is not a finished production dealership system.

No live accounts, Supabase projects, emails or deployments were created during implementation. Supabase Auth/email acceptance must be performed after configuration. The original invoice editor referenced by the starter was not present; see docs/baseline.md.

## 1. Run locally

Requirements: Node.js **22.13+ or 24 LTS** (Node 24 used for local checks), npm and a Supabase project. Git is needed to publish the repository. Supabase CLI/Docker are optional for local database development.

From this project folder, in PowerShell:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without Supabase variables, the app displays setup instructions. Complete the sections below, fill `.env.local`, then restart the server. Never overwrite an existing `.env.local` containing your keys.

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
| SUPABASE_SECRET_KEY | Server-only privileged key, required only to send staff invitations |
| NEXT_PUBLIC_SITE_URL | Canonical app origin for invite/reset redirects; required, no path |

Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are accepted as fallbacks. Never put a privileged key in a `NEXT_PUBLIC_` variable. Keep local env files out of Git. Public variables must be set at build time on Vercel.

If you prefer not to configure a privileged app key yet, create users through the Supabase dashboard and activate them in the app; the invite form explains why it is unavailable.

## 2. Create and connect Supabase

1. Create a project in [Supabase](https://supabase.com/dashboard), choose your region, and save the database password securely. Use separate projects for staging and production.
2. Copy the project URL and publishable key from project settings/API keys into `.env.local`. Copy a secret key only if using the app's invitation feature.
3. Apply the database migrations using **one** method below. Do not run baseline SQL against an existing database.
4. Configure Auth and the email templates, then create the first admin.

### Fresh database: SQL Editor method

Run each complete file once, in this order:

1. `supabase/migrations/20261014000100_baseline.sql`
2. `supabase/migrations/20261014000200_access.sql`

The access migration runs in a transaction. Stop and investigate any error; do not keep executing snippets from a failed migration. SQL Editor does not automatically record CLI migration history; see the CLI section before switching methods.

### Existing original starter database

1. Back up the database and verify that it matches the original starter schema (including `profiles.role` as `public.staff_role`). Test on a staging copy first.
2. **Skip 20261014000100** because its tables already exist.
3. Run **20261014000200_access.sql once**. It preserves original records and active roles, migrates the enum to role references, and replaces fixed-role policies with permissions.
4. Existing active admins remain active. If one exists, do not run the bootstrap script again.

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

Permissions for future features are stored now, but those features appear only when implemented. Managers and sales staff cannot read purchase costs/profit by default.

In **Roles & permissions**, create a custom role or adjust default permissions. New roles start with zero permissions. Administrator user/role/audit controls cannot be removed. Delegated user/role managers cannot grant greater access than they have or elevate themselves. All data access rechecks active state and permissions; deactivation blocks data access even before an Auth token expires. UI visibility is only a convenience; RLS and RPC checks enforce access.

Activity log shows database-recorded access changes. Before/after snapshots are stored in the database; log writes and edits are unavailable to authenticated app clients.

## 6. Checks and database types

```powershell
npm run check
npm run build
npm run start
```

`check` runs lint, typecheck and tests. Tests use PGlite (embedded PostgreSQL) to exercise actual grants, RLS and RPCs with a minimal Auth identity fixture; no live credentials or Docker needed. They cover fresh/upgrade migrations, inactive users, sales ownership, restricted costs, access mutations and audits. These tests do not prove live Supabase email, session refresh, storage or deployment behavior.

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

Before launch, manually verify login/logout, refresh after session expiry, reset/invite links, inactive-account denial, all four roles, direct unauthorized page/API access and permission changes. Verify backups/restoration and error monitoring. Live Supabase acceptance remains pending until those checks run against your configured project.

Other Node hosting can run `npm ci`, `npm run build`, then `npm run start` behind HTTPS with the same env values and Auth URLs. Static export hosting is unsuitable for this authenticated server app.

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

## Project map

```text
app/                    Login, setup, auth callbacks, dashboard/users/roles/audit
components/             Shared forms, navigation and buttons
lib/auth/               Server authorization and permission definitions
lib/supabase/           Server/admin clients and schema types
styles/                 Design tokens
supabase/migrations/    Baseline and access upgrade
supabase/bootstrap-admin.sql  One-time first-admin setup
tests/                  Validation and PostgreSQL authorization checks
docs/baseline.md         Current inventory, decisions and limitations
```

Planning: `prd.md`, `design system.md`, `technical-guide.md`, `project-phases.md`. Agent instructions: `AGENTS.md` → `agent.md`. Old runtime helper and old top-level SQL file were removed after replacement; original database history is retained as the baseline migration.

Gstack: its review instruction skill was installed locally at `~/.codex/skills/gstack-review`. It is available to Codex on the next turn. Review guidance was consulted for SQL safety, authorization and race conditions; full Gstack browser/runtime/specialist certification was not run. Full runtime setup requires Bun and the tools documented by [Gstack](https://github.com/garrytan/gstack#other-ai-agents).

Official references: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [database migrations](https://supabase.com/docs/guides/deployment/database-migrations), [Next.js authorization](https://nextjs.org/docs/app/guides/authentication), [Vercel Next.js deployment](https://vercel.com/docs/frameworks/full-stack/nextjs).
