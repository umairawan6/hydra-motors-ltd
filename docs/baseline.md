# Phase 0 baseline and decisions

Recorded 14 October 2026.

Reference recovered 15 October 2026: the owner supplied the previous two-page invoice PDF. Its Hydra logo was extracted to `public/branding/hydra-logo.png`; the PDF renderer now follows its white/navy/cyan layout. Normal customer samples keep the signature lines on the invoice page, with printed names/dates. The former browser print headers/file paths are absent. Buyer/company example records from that reference were not imported into the database. The original single-file editor remains absent from this repository.

- Existing app: Next.js/React/TypeScript, Supabase cookie login, one protected dashboard, one SQL schema. No integrated invoice editor or stock CRUD.
- UI evidence: original app layout/login/dashboard; dark navy surfaces, cyan branding, Arial, rounded forms/cards. These remain the visual baseline.
- The parent starter folder contains no original single-file invoice editor. Visual parity with that absent file cannot be verified; preserve available references and recover the old editor before invoice work if available.
- Business scope: one dealership, GBP, staff-only. User confirmed financial invoices means BOTH finance-provider invoices and supplier/expense invoices.
- Customer invoice requirements are documented in prd.md. Exact legal dealership details, tax modes/rates, invoice terms and numbering series remain decisions for phase 4; financial issuance stays disabled until approved and transactional.
- No Supabase project/credentials were present at implementation time. Local PostgreSQL tests validate migrations/RLS; live Auth/email/deployment acceptance remains pending.
- No customer/business records were deleted. Legacy supabase/schema.sql was moved to migration 20261014000100. Legacy lib/supabase.ts was replaced by server-only clients. Placeholder dashboard and inline styles were replaced by shared screens/styles.
- Additional UI library deferred until complex stock/invoice forms need it; CSS variables provide the design tokens without adding Tailwind at this stage.

## Verification record
- Tests: tests/access.test.ts (real PostgreSQL grants/RLS via PGlite), tests/validation.test.ts (form and redirect boundaries).
- Final local evidence: 42 tests passed; lint and TypeScript passed; production build passed; npm ci dry run passed. Runtime dependency audit reported zero advisories.
- Browser evidence: desktop/mobile login rendered; mobile width and document scroll width both 390px; reset form showed missing-configuration error; protected staff page redirected to setup. Authenticated staff screens still require live Supabase acceptance.
- Production build, lint and typecheck are the phase 1 local gates. Live Supabase deployment is a separate phase 2 acceptance gate, never implied by a build.
- Gstack review instructions were installed into the local Codex skills folder. The full Gstack runtime, native QA helpers and specialist review were not installed/run; no full Gstack certification is claimed.
