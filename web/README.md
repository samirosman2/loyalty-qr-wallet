This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Merchant brands

Before deploying brand creation, apply [`merchant_brand_creation.sql`](../merchant_brand_creation.sql)
to the Supabase database. It expects the existing `loyalty_brands`, `brand_members`,
and `shops` brand and active-branch columns. The function is restricted to the service
role and creates the brand, owner membership and first branch atomically. Existing
unbranded shops remain visible; newly created brands use their first branch's name.

For shared brand points, pause point transactions and apply
[`brand_point_events.sql`](../brand_point_events.sql) once before deploying the scan
changes. It sums legacy card balances for each brand/customer only when no brand
balance exists; existing brand balances are left unchanged and must be reconciled
separately. The migration makes brand point RPCs service-role-only and atomically
records the scanned branch in transaction history. Unbranded shops retain their
existing card-level flow.

## Phase 2 enterprise schema

After the Phase 1 brand and shared-points migrations, review and apply
[`phase2_enterprise_schema.sql`](../phase2_enterprise_schema.sql). It aborts without
changing data if a brand does not have exactly one owner membership matching
`owner_user_id`, or if a manager has no assigned branch or an assignment belongs
to another brand. Reconcile such records before migrating. A branch with an
assigned manager cannot be deleted until that manager is reassigned or removed.
Transfer ownership in one transaction: remove the old owner membership, change
`owner_user_id`, and insert the new owner membership before committing.

The new audit and voucher tables have row-level security enabled without client
policies; they are intended for service-role access until policies are designed.
This migration alone does not issue or redeem vouchers; apply Slice 2D below to
enable those workflows.

## Brand onboarding

After Phase 2, apply [`slice2b_brand_onboarding.sql`](../slice2b_brand_onboarding.sql)
before deploying the onboarding flow. It permits a null audit brand for a merchant
who has no brand yet and installs the service-role-only, transactional onboarding
RPC. Login writes an audit event for each membership, or one unbranded event when
there are none. Login fails if audit logging fails. The application does not
automatically audit authentication performed outside its merchant login route.

Merchants with multiple owner or manager memberships select a brand after login;
cashier-only accounts are denied access. New merchants create a brand and first
branch in the merchant dashboard, then complete onboarding. Managers can scan only
at their assigned branch and cannot open brand administration. The active-brand
cookie is checked against current membership on every protected request. Existing
unbranded shops remain available to their owners.

Brand setup accepts an HTTPS logo URL rather than uploading files. A public URL
from the `brand-assets` Supabase Storage bucket can be used; provisioning the
bucket and uploading images are separate administrative steps. Public brand and
shop pages display the configured theme; `/merchant/login?brand=<brand-slug>`
uses that brand's theme as well.

## Brand dashboard and managers

Apply [`slice2c_brand_dashboard.sql`](../slice2c_brand_dashboard.sql) after Slice 2B
and before deploying the dashboard. The migration adds branch addresses, active
membership status, audited brand operations and exact, server-side KPI aggregation.
The dashboard counts distinct customers with cards at the brand's branches, all-time
EUR purchase amounts, earn/redeem point transactions, and active unexpired vouchers.
Spend reflects transactions where an amount was recorded.

Create a **public** Supabase Storage bucket named `brand-assets` before using logo
uploads. Uploads are server-side with the service role, restricted to PNG, JPEG or
WebP and 2 MB, and stored as `<brand_id>/logo.<ext>`. Replacing a logo and updating
the database are separate operations: if the database update fails, the uploaded
object may already have changed. No public client upload policy is required.

Managers are created with an owner-supplied password (at least 12 characters) and
confirmed email. Deliver credentials securely outside this app. Deactivation applies
only to the brand membership; deactivating a branch leaves assignments in place but
prevents scans. Passwords belong to the entire Supabase account, so resets are blocked
if the account has memberships in other brands. If account creation succeeds but
membership creation fails, an administrator must reconcile the created Auth user;
the application reports this partial failure instead of deleting the account.
Password resets and logout span Supabase Auth and audit storage and cannot be atomic;
the UI reports audit failures explicitly. Password changes also affect any non-brand
uses of the same Auth account.

The audit viewer is brand-scoped and paginated, with UTC date filters. Brand
settings, branch and manager changes, point earns/redemptions, and merchant logins
and logouts generate entries. Authentication performed
outside the application's merchant login/logout routes is not automatically logged.

## Spend vouchers and purchase scans

Apply [`slice2d_spend_vouchers.sql`](../slice2d_spend_vouchers.sql) after Slice 2C,
before deploying the Slice 2D application. Reconcile duplicate non-empty receipt
references for positive earn purchases within each branch first: the migration
aborts if duplicates exist. References are trimmed and case-sensitive, and may be
reused in different branches. New earn scans require a positive EUR amount, a receipt
reference and a client-generated idempotency key. Retrying an unchanged scan reuses
the key; a different key with the same branch receipt is rejected. The database
records the authoritative purchase timestamp after locking the brand balance rather
than trusting the device clock.

Active rules evaluate brand-wide EUR purchases in their rolling window and issue at
most one voucher per customer and rule in that window, including already redeemed
or expired vouchers. Issuance and redemption are transactional and audited; only
active, unexpired vouchers can be redeemed. The eight-argument legacy brand scan
RPC still supports reward redemption but no longer accepts earn scans without
purchase details. The customer card is public to anyone with its URL: voucher
discounts, status and expiry are visible there, but voucher codes are not shown.

## Customer and accounting reports

Apply [`slice2e_accounting_reports.sql`](../slice2e_accounting_reports.sql) after
Slice 2D before deploying the reports. Both report APIs and the database functions
require an active owner of the selected brand; managers cannot access customer or
accounting reports. The customer report lists brand cardholders, including those
without purchases when no branch/date filter is selected. With a branch or date
filter it includes customers with point transactions in that scope. Visits count
positive earn purchases in any currency, spend sums only EUR purchases, and last
visit is the latest purchase in scope. Point balances and active-unexpired/redeemed voucher
counts are current brand-wide values. Card codes include all cards for the brand.
The itemized customer ledger includes point transactions and voucher issue/redemption
events, subject to the same branch/time filters. An older voucher with no linked
source transaction has no known issue branch.

Report API filters use `shop_id`, `from`, `to`, `page`, plus `min_visits`,
`min_spend`, `q`, or `customer_id` for customers and `bill_reference`, `type`,
or `format=csv` for transactions. Date-only bounds are UTC and include the entire
end date; date-time bounds require an offset, with an inclusive start and exclusive
end. Dashboard inputs use the browser's local time; displayed/exported timestamps
are UTC, retaining database microseconds. The accounting ledger includes all point
transaction types and displays the recorded currency and nullable amount; historical
records without purchase details are not invented. Processed-by email is the current
Auth email when available, falling back to the recorded user ID.

CSV exports use the applied transaction filters, include all matches in one database
snapshot, and use UTF-8 BOM, semicolon delimiters, decimal commas, quoting, and
spreadsheet-formula protection for text. Large exports are assembled in memory on
the server and may exceed hosting time or memory limits; errors are reported rather
than returning an intentionally truncated export. Exports contain personal data and
should be stored and shared according to the brand's privacy and retention policies.

## Customer consent and verification

Customer signup and marketing consent changes require a verified email OTP. Configure
Supabase Auth email signup and an email template that includes `{{ .Token }}`. Customer
and merchant sessions use separate cookies. Unbranded shops cannot accept new signups;
existing phone-only customers need a verified email associated with their customer record.

The German consent text in `src/lib/consent-text.ts` is provisional: obtain legal review,
provide a complete privacy notice and verify the actual advertising purposes, recipients
and channels before collecting or relying on consent. Consent changes append history;
an absent marketing record is not consent. The existing card URL remains accessible to
anyone who knows its code and should not be treated as customer authentication.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
