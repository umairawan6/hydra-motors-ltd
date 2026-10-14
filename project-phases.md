# Hydra Motors — Step-by-step creation phases

Current state: phases 0–5 implemented locally. Customers/stock, customer invoices and finance/supplier workflows use permission-checked database mutations. Cloud setup on 15 October 2026 applied all migrations to the existing Supabase project, configured private buckets/RLS and activated the first confirmed administrator. Local and Vercel Production environments are configured. Authenticated browser acceptance, live Storage workflows and independent-client concurrency checks remain pending. SMTP is deferred by the owner. Phases 6–7 are not implemented.

Local validation: 76 tests, lint, TypeScript and production build passed. Fresh and legacy upgrades are exercised in embedded PostgreSQL. A live default-privilege discrepancy was corrected by an additional migration and regression test. Invoice PDFs were rendered for visual inspection, including long terms. Full release acceptance is not claimed without staging acceptance.

Phase 3 local evidence: stock.test.ts covers persistent records, stale edits, normalized uniqueness, restricted costs and private-photo RLS. Phase 4: sales.test.ts and pdf.test.ts cover issuance, snapshots, retries, payment/credit/refund balances and PDF rendering. Phase 5: finance.test.ts and finance-integrity.test.ts cover settlement allocation, debt reservations, supplier cost counting, replacement history, returns and migration preservation. See README.md for required live checks.

| Phase | Steps in order | Exit criteria |
|---|---|---|
| 0 — Baseline | Inventory starter; recover original invoice UI if available; confirm finance-invoice interpretation, required invoice fields and tax modes | UI reference recorded; business decisions explicit; missing reference acknowledged |
| 1 — Foundation | Review/pin dependencies; add scripts and design tokens; create shared shell; configure development environment; baseline schema migrations and types | App builds/types pass; fresh database and migration upgrade both work; existing login retained |
| 2 — Access | Session refresh; server authorization; database permission model and RLS; invite/reset/logout; users/roles UI; audit writes | Role matrix passes through UI and direct APIs; inactive sessions denied; no self-escalation; last admin protected |
| 3 — Customers and stock | Customer CRUD; vehicle CRUD/status; secured costs/photos; search/filter/pagination; archive behavior | Data survives reload; concurrent edits detected; unauthorized cost/photo access denied |
| 4 — Customer sales | Invoice form; snapshots and calculations; atomic issue/stock transition/numbering; payments/refunds; PDF; credit/void workflow | Two concurrent attempts cannot sell one vehicle; retries do not duplicate numbers/payments; issued data immutable; PDF verified |
| 5 — Financial invoices | Confirm scope; provider invoices and settlements; supplier invoices/expense allocation; private attachments; due/paid filters | Settlement allocated once; sale revenue not duplicated; expenses reconcile without double counting |
| 6 — Sales and profits | SQL aggregates; date filters; sales/profit charts; outstanding balances; permission-aware CSV exports | Reports match known test records, credits and costs; restricted fields absent for unauthorized users |
| 7 — Production readiness | Critical end-to-end and RLS tests; responsive/accessibility review; logs; backup/restore; staging acceptance; approved deployment | Stock → sale → payment → PDF works; restore verified; required tax/terms approved; release checklist passes |

## Validation fixtures
- One £10,000 sale, £7,000 purchase and £500 preparation cost: £2,500 gross profit before tax adjustments/overhead; £2,000 cleared payment leaves £8,000 outstanding.
- Finance provider invoice for that sale does not increase £10,000 sales revenue; provider settlement only reduces outstanding balance.
- A linked £500 credit adjusts revenue/balance consistently; refunds remain independently tracked.
- Include sales owned by two different users, inactive user, missing permission, competing issue requests, failed PDF generation and duplicate payment retry.

## Execution handoff
For each phase: inspect relevant files → implement schema/security → implement UI → run phase checks → record evidence and status here. Keep updates short; unresolved required decisions block only the dependent work. Do not mark a phase complete on screenshots or a successful build alone.
