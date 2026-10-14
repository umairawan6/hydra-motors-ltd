# Hydra Motors secure cloud starter (Phase 1)

**Status:** Development scaffold, not production-ready. No live accounts or cloud resources have been created.

## Includes
- Next.js login with Supabase Auth and protected server-rendered dashboard
- PostgreSQL schema with customer, vehicle, cost, sales, payment, invoice and audit tables
- Row Level Security (RLS) including restricted cost access
- Inactive-by-default staff accounts and four roles

## Setup
1. Create a **private** Supabase project in a suitable UK/EU region; enable email/password Auth, disable public self-signup, configure MFA and email delivery.
2. Run `supabase/schema.sql` in SQL Editor on a fresh project. Do not rerun the schema without migrations.
3. Create first user in Supabase Auth admin dashboard. Copy the UUID and activate it using the commented SQL statement at the end of schema.sql. Never expose service-role keys to the browser.
4. Copy `.env.example` to `.env.local`, set the project URL and publishable/anon key.
5. Run `npm install`, then `npm run dev`. Open `http://localhost:3000/login`.
6. Deploy to Vercel using environment variables, add `app.hydramotors.co.uk` after DNS/domain verification.

## Security / before production
- This is a starter: do not enter real customer data yet. Add secure admin invitation workflow, MFA enforcement, rate limiting, session refresh/middleware, server-side input validation, and audit triggers.
- Implement immutable invoice issuance with atomic server-side numbering and PDF storage; **do not** generate numbers from row counts.
- Add payment write API with idempotency, permissions and reconciliation; the current scaffold deliberately has no client payment insert policy.
- Enforce column-level controls for `sales` if sensitive fields are added; keep all profit/cost fields in `vehicle_costs`.
- Add data retention/deletion rules, backup restore testing, logging/monitoring and privacy notices compliant with UK GDPR.
- Review VAT margin-scheme treatment and legal invoice/consumer-sales wording with an accountant/legal adviser.
- Test RLS against every role (including unauthenticated, inactive, cross-user, and direct REST API access).
- Store invoice documents in private buckets with time-limited signed URLs and access checks.
- Implement manager cost visibility only with a dedicated permission table if later authorised.

## Current limitation
The previous single-file HTML invoice editor is **not yet integrated** into this starter. This package is the requested authentication, roles and cloud database foundation.
