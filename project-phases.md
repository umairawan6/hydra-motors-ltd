# Hydra Motors — Step-by-step creation phases

Current state: phases 0–2 implemented locally. Phase 0 evidence is in docs/baseline.md; phase 1 build and fresh/upgrade database checks pass; phase 2 local RLS/RPC checks pass. Live Supabase Auth/email and deployed browser acceptance remain pending configuration. Phases 3–7 are not implemented.

Local validation: 42 tests, lint, TypeScript, production build and clean-install dry run passed. Login was checked at desktop and 390px mobile width. Full release acceptance is not claimed without a configured Supabase project.

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
