# Hydra Motors — Technical guide

Status: phases 0–2 implemented locally; live Supabase acceptance pending. Remaining business modules follow project-phases.md.

## Stack
- Next.js 16.4.1 App Router + React 19.3.1 + TypeScript; dependencies pinned in package-lock.json.
- Supabase PostgreSQL, Auth and private Storage; SQL migrations and generated database types.
- CSS variables for shared design tokens and responsive forms; Zod for validation. Tailwind/headless components remain optional for later complex screens.
- React Hook Form only for complex invoice forms; Server Components for reads, Server Actions for mutations, Route Handlers for downloads/webhooks when needed.
- @react-pdf/renderer for invoice PDFs; Recharts for authorized reports; Vitest for business rules, Playwright for critical browser flows.
- Vercel deployment, separate staging/production Supabase projects, structured logs and error monitoring. No separate API server or ORM needed for MVP.

## Existing gaps
The original Next 15 starter has been upgraded. Current app includes shared UI, session refresh, server authorization, role management and audit screens. SQL history is now under supabase/migrations. Missing: integrated invoice UI, customer/stock CRUD, safe issuance/payment APIs, PDFs and reports. Live Supabase Auth/email checks require configured credentials.
Existing sales.vehicle_id uniqueness prevents historical resale; change to transaction-enforced active-sale rules before building sales. Existing draft-update policy is insufficient for immutable ownership/vehicle fields; use explicit database constraints and controlled mutations.

## Data model evolution
| Entity | Proposed changes |
|---|---|
| profiles / roles / permissions | Replace enum-only authorization with roles, permissions, role_permissions and profile role reference; preserve four defaults and inactive-by-default provisioning |
| customers | Contact/address fields, search indexes; archive referenced records |
| vehicles / vehicle_costs | Stock status, purchase date, optimistic version; keep sensitive costs separately secured |
| vehicle_photos | Vehicle FK and private storage path; upload size/type limits |
| sales / sale_items | Draft/issued/void lifecycle, sold_at, currency, tax configuration, snapshot totals; controlled amendments |
| invoices / invoice_items | Customer/finance/credit types, numbering, issue snapshot, original invoice link, PDF generation status/path |
| finance_providers / finance_settlements | Provider contacts, linked sale/invoice, remittance reference; allocations to existing sale |
| supplier_invoices / expense_items | Supplier, due date, amount, document; optional vehicle allocation; prevent duplicate cost attribution |
| payments / payment_allocations | Cleared/refunded events, external reference, idempotency key, allocation across invoices; no destructive edits |
| invoice_sequences / audit_logs | Atomic numbering by document series; immutable actor/action/before/after/reason records |

Use UUID keys, foreign keys, decimal money, constraints, created_at/updated_at and indexes matching queries. Store only canonical costs; expense allocations must not also be added manually to preparation/other cost totals.

## Security and request flow
1. Validate session with Supabase SSR server client; implement cookie refresh using the framework-version-appropriate middleware/proxy integration.
2. Central server-only authorization helper loads active profile and effective permissions. Check it in every action, query and download; never trust submitted role/user IDs.
3. Validate inputs; use authenticated Supabase client so RLS applies. Privileged admin client is server-only and limited to explicitly authorized account provisioning.
4. Enable RLS for every exposed table and storage bucket; apply ownership restrictions and sensitive-column separation. Reports/views must preserve underlying authorization.
5. Revalidate affected pages after writes; use explicit field projections; do not cache private data across users. Audit permission changes and recheck permissions on every request.

Database RPCs must validate auth.uid(), active state and permission internally. Restrict EXECUTE grants, lock down search_path and review any SECURITY DEFINER use. Application checks alone do not secure direct RPC access.

## Financial transactions
- issue_sale: lock vehicle/draft; validate stock and totals; reserve next sequence number; persist immutable snapshots; issue invoice; mark sold; audit; commit atomically. Unique request key returns the same result on retry.
- record_payment: enforce unique idempotency key; validate positive amount/currency and remaining allocations; persist payment plus allocations and audit atomically. Refunds are linked events.
- credit_sale: lock original document; prevent credits exceeding remaining creditable amount; preserve history; update balance/reporting; stock return is an explicit permitted transition.
- Generate PDF after commit from snapshot; record pending/ready/failed state; permit safe retry without reissuing or renumbering. Authorized signed URLs expire quickly.
- Aggregate reports in SQL with authorization, date boundaries and consistent tax treatment. Revenue is based on issue/sale date; cash receipts are a separate measure. Finance invoice issuance contributes no additional revenue.

## Structure
```text
app/(auth)/login/
app/(dashboard)/{vehicles,customers,sales,finance,reports,settings}/
components/{ui,forms,invoices}/
lib/{supabase,auth,validation,finance}/
supabase/{migrations,tests,seed.sql}
tests/{unit,e2e}/
```

## Local setup and release
1. Inspect dependency compatibility; install and commit lockfile. Add typecheck/lint/test scripts.
2. Configure .env.local with public Supabase URL/key; privileged key only when an admin workflow needs it. Keep .env.example value-free and secrets ignored.
3. Baseline existing schema into migrations; test fresh install and upgrade on disposable databases. Generate database types.
4. Create development auth users and fictitious seed records. Disable public signup; configure reset/invite callbacks and production email delivery.
5. Run checks, staging migrations, permission and workflow tests; verify PDF layout and restore backup before production release.

Official implementation references: [Next.js authorization](https://nextjs.org/docs/app/guides/authentication), [Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Supabase Next.js setup](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs). Recheck version-specific instructions during implementation.
