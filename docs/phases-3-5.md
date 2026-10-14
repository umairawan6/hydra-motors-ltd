# Phases 3–5 implementation evidence

Implemented locally: customer/stock CRUD and archival, edit conflict checks, restricted costs/photos, customer sales with immutable snapshots, atomic numbering/stock issuance, payments/refunds/credits, retryable stored PDFs, provider invoices/settlements, supplier bills/attachments/payments and explicit expense allocation.

Business decision: user selected no VAT initially. Issuance requires actual dealership settings and approved terms. No real invoice, external email, Supabase project or deployment was created during this work.

Local evidence: 75 tests passed; lint, TypeScript, production build and clean-install dry run passed. Runtime dependency audit reported zero advisories. SQL tests exercise real PostgreSQL grants/RLS with minimal Auth/Storage fixtures, not a live Supabase service.

PDF QA: customer, credit and finance samples rendered with Poppler and inspected; long terms span three A4 pages with readable footers. Samples use clearly fictitious test data and are ignored under tmp/pdfs. Title wrapping was corrected; finance due dates are rendered.

New migrations run from 20261014000300 through 20261014000595 in filename order. Existing invoice numbers/history are retained; historical snapshots and unknown totals are not invented. Supplier replacements retain voided originals. Financial events use idempotency keys and a shared transaction lock; finance receipts and allocations are atomic.

Pending live acceptance: authenticated screen behavior on desktop/mobile, actual Storage uploads/downloads and PDF retry, session expiry/deactivation, direct REST/RPC/Storage permission checks, independent-client race tests, deployment and backup restoration. Follow README.md using a staging Supabase project. Reporting and final release readiness remain phases 6–7.
