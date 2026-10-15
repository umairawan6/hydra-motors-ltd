# Hydra Motors — Product requirements

Status: phases 0–6 implemented; phase 7 acceptance is in progress. Customer invoice email copies and later optional thank-you SMS are planned in phase 7. Full hosted acceptance remains pending. See project-phases.md.
Purpose: turn the existing starter into a persistent dealership management app while preserving the approved UI and workflows.

## Scope and assumptions
- One dealership, GBP, UK date formatting, Europe/London display time; store timestamps in UTC.
- Staff-only app. Supabase is the source of truth; no mock records in production.
- Financial invoices means finance-provider invoices plus supplier/expense invoices; user confirmed both on 14 October 2026.
- Preserve the available navy/cyan UI. The older HTML invoice editor mentioned in README is absent: recover it before claiming visual parity.
- Exclude public marketplace, payment gateway, bank integration, multi-dealership tenancy and full accounting ledger from MVP.
- User selected no VAT initially. Issuance requires approved dealership details/terms; VAT and margin-scheme calculations remain outside the current implementation.

## Features and acceptance criteria
| Module | Requirements | Acceptance |
|---|---|---|
| Customer sale invoices | Customer records; vehicle selection; prices, discounts, deposit, payments, balance; draft, issue, PDF, credit/void workflows | Issued invoice has unique number and immutable customer/vehicle/price snapshot; survives refresh; authorized staff can download PDF |
| Vehicles stock | Registration/VIN, make/model/year, mileage, purchase date, photos, costs; available/reserved/sold/archived states; search and filters | Sold vehicles cannot be sold twice; restricted costs never reach unauthorized clients; archived history remains readable |
| Sales and profits | Date-filtered sales totals, outstanding balances, vehicle-level cost breakdown, gross profit and CSV export | Dashboard and export reconcile against issued sales and credits; draft/void documents excluded; costs visible only with permission |
| Financial invoices | Finance provider, customer/sale reference, amount due, settlement and balance; supplier expense invoices and attachments | Finance settlement reduces sale balance once; finance invoice never duplicates sale revenue; expense counted in costs once |
| Login and roles | Invite-only login, reset password, logout, active/inactive users, roles and configurable role permissions | Unauthorized direct URLs, server actions, database queries and file requests are denied; deactivation blocks existing sessions |

## Planned customer communications

- Phase 7A: when a customer invoice is successfully issued and its PDF is ready, automatically send a copy to the invoice customer's validated email. Use the immutable issued document, not a rebuilt editable draft. Show delivery state and permission-checked resend; an email failure must not invalidate the sale. Issue/payment/PDF retries must not cause duplicate messages. Missing email is surfaced for staff action.
- Phase 7B, later: optional thank-you/enjoy-your-car SMS after the agreed completed-sale trigger, using customer communication preferences and a validated phone. Keep this separate from debt collection and marketing. Sender, provider, template, cost cap and test recipient must be configured before activation.
- Both are currently planned. No email/SMS provider has been connected and no customer messages have been sent. Staff-auth SMTP and customer invoice emails are separate integrations.

## Default access

All permissions require an active account. Sales users see their own sales and related invoices; managers/accountants/admins see all sales.

| Capability | Admin | Manager | Sales | Accountant |
|---|---|---|---|---|
| Customers and stock | Manage | Manage | Manage operational fields | Read |
| Draft/issue customer invoices | All | All | Own | Read |
| Void/credit issued invoices | Yes | Yes | No | Yes |
| Purchase costs and profit | Yes | No | No | Yes |
| Enter costs, payments, finance/expenses | Yes | No | No | Yes |
| Manage users, roles, permissions | Yes | No | No | No |

Admin can configure role permissions. Operational stock access never grants cost access. Keep at least one active admin; no self-escalation. Log permission changes.

## Business rules
- Store money as decimal values or integer pennies; calculations and rounding are authoritative on the server/database.
- Gross vehicle profit = net sale revenue after credits − purchase − preparation − allocated expenses. Show overhead separately; do not label this net business profit.
- Balance = invoice total − cleared allocations + refunded allocations, adjusted for credits. Payment status is derived, not typed manually.
- Drafts are editable; issued financial values are immutable. Corrections use credit notes/linked replacement documents; retain original numbers and audit history.
- Finance documents represent collection from a provider for an existing sale; never create a second sale. Tax modes and invoice wording require business/accountant-approved configuration before release.
- Issuing a sale, assigning a number and marking stock sold must be one transaction. Credit/return handling must explicitly approve releasing stock again.

## Quality and completion
- Responsive keyboard-accessible screens; useful loading, empty, error and validation states.
- Server pagination/filtering; authenticated data must not enter shared caches.
- Audit financial writes and access changes; private document storage; backup/restore verification.
- MVP is complete when all five modules persist data, permission tests pass, financial totals reconcile, and the full stock-to-sale-to-payment-to-PDF flow passes on staging.

See [design system.md](design%20system.md), [technical-guide.md](technical-guide.md), and [project-phases.md](project-phases.md).
