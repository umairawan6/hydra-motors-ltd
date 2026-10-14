# Hydra Motors — Design system

Goal: preserve the existing visual language and add consistent operational screens. Current evidence: app/layout.tsx, app/login/page.tsx, app/dashboard/page.tsx. Original invoice-editor reference is pending recovery.

## Tokens
| Token | Value | Use |
|---|---|---|
| Background | #0b1420 | App canvas |
| Surface | #14263a | Forms/cards |
| Raised surface | #15283d | Dashboard sections |
| Text | #e6f2fa | Primary text |
| Muted text | #a8bbc9 | Secondary text |
| Brand | #38c7dc | Brand and focus accents |
| Action | #08758b | Primary actions; darker cyan for white-text contrast |
| Border | #30485e | Inputs/dividers |
| Success / warning / danger | #86efac / #fcd34d / #fca5a5 | Status text with icon/label |

- Font: Arial/system sans-serif; body 16px, labels 14px, section headings 20px, page heading 28px.
- Spacing: 4, 8, 12, 16, 24, 32, 40px. Radius: inputs/buttons 6px, cards 12px, login 16px.
- Use tabular numbers for financial columns. Format GBP with Intl; dates DD/MM/YYYY.

## Layout and components
- Desktop: sidebar navigation, header, page title/action, filter bar, content. Mobile: collapsible navigation and stacked forms; tables scroll or switch to record cards.
- Navigation: Dashboard, Vehicles, Customers, Sales invoices, Financial invoices, Reports, Users/settings. Render only authorized entries.
- Shared components: Button, Input, Select, MoneyInput, DateInput, Card, Table, Pagination, StatusBadge, Dialog, EmptyState, Alert, InvoicePreview.
- Forms: labels above controls; field-level errors; preserve non-sensitive input on failure; disable duplicate submission while pending.
- Tables: clear headers, aligned monetary columns, server pagination, search/filter state in URL. Row actions have accessible labels.
- Status badges always include text. Destructive actions name the affected record and require a reason for financial changes.

## Invoice layout
- A4 print/PDF: white background, dark text, Hydra header, dealership details, customer/provider details, unique number/date, vehicle details, itemized totals, payments/balance, configured terms.
- Draft watermark until issue; issued documents render from stored snapshots. Screen previews and PDFs use the same values.
- Prevent split totals blocks; repeat table headers on multi-page PDFs; verify long names and addresses.

## Accessibility and states
- Target WCAG AA contrast; verify all actual foreground/background combinations, including action buttons.
- Visible keyboard focus; semantic controls; associated labels; error announcements; dialog focus trap and return focus.
- Provide loading skeletons, no-results guidance, retryable errors and successful save feedback on every data screen.
- Keep costs/profit out of unauthorized responses, exports and PDFs; hiding UI alone is insufficient.
