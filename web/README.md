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
