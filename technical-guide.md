# Hydra Motors — Technical guide

Status: phases 0–5 implemented locally; live Supabase acceptance pending. Reporting and release readiness follow project-phases.md.

## Stack
- Next.js 16.4.1 App Router + React 19.3.1 + TypeScript; dependencies pinned in package-lock.json.
- Supabase PostgreSQL, Auth and private Storage; SQL migrations and generated database types.
- CSS variables for shared design tokens and responsive forms; Zod for validation. Tailwind/headless components remain optional for later complex screens.
- React Hook Form only for complex invoice forms; Server Components for reads, Server Actions for mutations, Route Handlers for downloads/webhooks when needed.
- @react-pdf/renderer 4.9.0 for invoice PDFs; Vitest with PGlite for database/business rules. Recharts/reporting and live browser automation remain for phases 6–7.
- Vercel deployment, separate staging/production Supabase projects, structured logs and error monitoring. No separate API server or ORM needed for MVP.

## Existing gaps
The original starter has been upgraded with customers/stock, draft/issued sales, PDFs, payment/credit/refund events, provider settlements and supplier invoices. SQL history is under supabase/migrations. Active-sale uniqueness and controlled RPCs replace unrestricted starter mutations. Remaining gaps: reporting, production hardening and live Supabase Auth/Storage/browser acceptance.

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

Implemented financial rows use UUIDs, foreign keys, decimal money, constraints and query indexes. Supplier invoices explicitly distinguish additional, included-in-base and overhead treatments; settlements do not create new expenses. The wider target model above remains guidance for future expansion, not a claim that every proposed table is implemented.

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

### Reporting implementation

`sales_profit_report(date,date)` is a read-only, stable SQL-backed RPC. Its definer privilege is deliberate: `reports.sales` authorizes dealership-wide aggregate results even when base sales RLS is narrower. It checks the current active profile/permission internally, revokes PUBLIC/anonymous execution, uses an empty search_path and returns no customer/staff identities. Profit/cost JSON keys require both `reports.profit` and `costs.read`. The page and private/no-store CSV route also require `reports.sales`; they share date/response validation in `lib/reports.ts` and use the signed-in Supabase client, never the admin key. One SQL statement calculates monthly totals from business events without client pagination limits. See README Phase 6 for recognition dates, cost restatement, missing/legacy data and current-balance semantics.

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
