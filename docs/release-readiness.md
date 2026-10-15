# Phase 7 — Release acceptance

Status: in progress. A passing build is not launch approval. Record date, commit, environment, role and observed result for each check; use fictitious data in a separate staging database for mutations. Never copy production customer data into test fixtures. Do not put credentials, private customer details or authentication screenshots in evidence.

## Local and repository checks

- `npm ci`, `npm run check`, `npm run build` must pass on Node 24.
- `tests/workflow-acceptance.test.ts` runs customer/stock creation → restricted costs → draft → issue/retry → receipt/retry → immutable snapshot → actual PDF rendering → sales/profit/CSV reconciliation in rollback-isolated embedded PostgreSQL. Expected: £10,000 sale, £7,500 costs, £2,500 profit, £2,000 cash, £8,000 due. Output: ignored `tmp/pdfs/workflow-acceptance.pdf`.
- The other suites cover fresh/legacy migrations, role/RLS boundaries, stale edits, credits/refunds, supplier/finance allocations, reset safeguards and date-boundary reporting.
- `.github/workflows/check.yml` repeats checks/build on pushes and pull requests without Supabase/Vercel credentials. A workflow definition is not evidence that a hosted run passed. Configure required checks/branch protection separately if desired; current Vercel Git deployment is not automatically blocked by this workflow.

## Hosted acceptance checklist

| Check | Expected result | Current evidence/status |
|---|---|---|
| Admin login and staff/role screens | Active staff enter; inactive staff are denied | Owner login/admin screens previously verified; independent role/browser sessions pending |
| Customer/stock persistence | Reload retains details; normalized registration unique; archive/restore works | Local database tests; full staging browser story pending |
| Competing edits/issuance | Two independent browser sessions: stale edit rejected; only one issue succeeds for one vehicle; retry returns original document | Transaction tests cover stale edits/idempotency; independent-client race pending |
| Receipt, credit and refund | Balances reconcile; duplicate retries do not duplicate cash; refunds linked to original receipt | Automated tests and earlier owner test-data reversals; full staging acceptance pending |
| Private files and PDF | Authorized PDF/photo/attachment delivery works; anonymous/other roles denied; PDF retry keeps invoice number | Renderer/RLS tests; complete hosted upload/delivery verification pending |
| Reporting and CSV | Date filter and downloaded numbers match known fixtures; cost/profit absent for unauthorized roles | Production admin page/filter/CSV verified at 3e1aa5e; independent manager/accountant browser check pending |
| Mobile and keyboard | Login/forms/navigation usable at small width; labels, focus and errors usable; tables scroll within container | Prior login/report width checks; complete form/keyboard audit pending |
| SMTP invite/reset | Owned sender verified; staff invitation and password reset deliver, token expires/works once, chosen password remains private | Deferred by owner; no provider configured; not accepted |
| 7A customer invoice copy | Once issued PDF is ready, one customer email is queued; retries do not duplicate it; status/resend works; invalid/missing email or provider failure is visible | Newly requested; planned; application transactional-email integration not implemented |
| 7B thank-you SMS | Optional completed-sale message; customer preferences, phone validation, sender and duplicate/cost controls work | Later optional addition; no provider configured or messages sent |
| Business identity and terms | Owner confirms real company identity, bank details, no-tax configuration and terms; final invoice PDF reviewed | Test setup only; final business confirmation pending |
| Test tooling disabled | Before real records, both reset gates disabled; dedicated staging environment documented | Still testing; reset intentionally available to admin |
| Recovery and monitoring | Restore into isolated target and application rollback verified; alert ownership documented | Detailed operational completion in phase 9; not yet verified |

## Two-session race procedure (staging only)

1. Record the staging project reference and commit. Use two separately authenticated browser profiles, active authorized staff, one test customer and one available test vehicle. Complete its costs.
2. Open the same draft/version in both profiles. Make competing edits. Exactly one save succeeds; the other must report stale data and require refresh.
3. Reload the draft in both sessions and attempt issuance at the same time. Only one customer invoice/document number may be issued; vehicle becomes sold. Repeating the successful request must return the same invoice.
4. Inspect invoice/stock/payment records and report totals. Verify receipts and finance allocations separately; do not use actual bank transfers. Record observed success/failure rather than marking success from an HTTP status alone.
5. Archive/credit the named staging fixture through the supported flows. Do not reset a shared database to tidy up an acceptance test.

## SMTP handoff (still deferred)

Choose a provider and an owned sending domain/mailbox, verify DNS/sender ownership, configure its credentials directly in Supabase custom SMTP, then configure the documented Auth email templates and exact redirect URLs. Staff invitations/password resets require explicit recipient authorization before sending. Users enter and submit their own new passwords. No email service, paid plan, DNS change or mail send is included merely by adding this checklist.

## Release decision

Keep phase 7 open until the required hosted checks have evidence and business settings are confirmed. Record outstanding phase 8/9 controls before using real records. Auto Trader connection remains an optional integration requiring approved account/API access, not a launch dependency. Owner additions are assigned to 7A invoice email and later optional 7B SMS; final phases 8/9 remain cloud security and recovery. The first hosted GitHub Actions run exposed two missing lockfile entries (@emnapi/core and @emnapi/runtime). Those entries were repaired without changing direct dependency versions; npm 11.21.1 clean-install dry-run passed. The repaired hosted run passed on commit cb67cf8: https://github.com/umairawan6/hydra-motors-ltd/actions/runs/38771941579 (clean install, 110 tests, lint/typecheck and production build, without cloud credentials).
