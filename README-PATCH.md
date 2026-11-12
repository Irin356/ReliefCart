# ReliefCart AI — patch for the official PayPal × AG Grid starter

This folder contains the ReliefCart application files to copy into a fresh clone of:
https://github.com/paypaldev/hackathon-paypal-ag-grid-boilerplate

It intentionally does not include `node_modules`, credentials, a generated lockfile, or the upstream starter files.

## Add dependencies in the starter

```powershell
npm install @paypal/react-paypal-js @supabase/supabase-js
```

The patch uses the PayPal Sandbox REST endpoints directly with the OAuth helper pattern already present in the starter's `lib/paypal.ts`. It uses PayPal's React JavaScript SDK v6 for the checkout button. It calls Channel3's documented `POST /v1/search` endpoint and Groq's OpenAI-compatible chat-completions endpoint using `fetch`, so no separate SDK packages are required for those two APIs.

## Copy these paths

Copy the contents of this folder into the root of the cloned starter, preserving paths. Overwrite the starter's `app/page.tsx` with the patch version. Keep the existing `app/(endpoints)/data-grid.tsx`, `app/dashboard/`, `lib/paypal.ts`, `package.json` and other starter files.

Files included:

- `app/page.tsx` — replace the starter home page with ReliefCart.
- `app/actions.ts` — server actions for create/capture.
- `app/api/ai/plan/route.ts` — Groq planning + live Channel3 search.
- `app/api/donations/route.ts` — read-only contribution ledger API.
- `components/ReliefCartApp.tsx` — UI, AI plan, product cards, contribution flow and AG Grid ledger.
- `components/PayPalCheckout.tsx` — PayPal SDK v6 button.
- `lib/relief-config.ts` — server-authoritative contribution tiers.
- `lib/supabase-admin.ts` — server-only Supabase client.
- `lib/paypal-orders.ts` — server-side PayPal Sandbox create/capture and ledger verification.
- `lib/channel3.ts` — server-side product search adapter.
- `supabase/schema.sql` — donations table and RLS setup.
- `ENVIRONMENT.md` — required secrets and public client ID.

## Configure

1. Follow the parent answer's setup steps to create Sandbox credentials, a Groq key, Channel3 key and Supabase project.
2. Run `supabase/schema.sql` in Supabase SQL Editor.
3. Merge `ENVIRONMENT.md` values into `.env.local` (do not commit that file).
4. Run `npm run dev` and open http://localhost:3000.

## Notes and limitations

- The client submits only a contribution tier ID. The amount is selected server-side from `lib/relief-config.ts`.
- PayPal is hard-coded to Sandbox. Do not switch to live payments for the hackathon demo.
- Channel3 prices are retailer catalogue offers; they are not verified bulk quotes and do not include tax/shipping. ReliefCart does not initiate retailer checkout.
- Product search is scoped to US/USD so product prices and the demo PayPal contribution currency both use USD. This is a hackathon demo locale, not a claim that those offers ship to the campaign location.
- The official starter's `/dashboard` AG Studio route is preserved. It continues to show the starter's PayPal Sandbox analytics; the home screen uses the starter's actual AG Grid `DataGrid` for the contribution ledger.
- This patch was authored without access to your local starter checkout and could not be compiled against your installed dependency tree here. Run the listed lint/build checks and resolve any environment-specific errors before submission.
- The upstream starter repository did not expose a root `LICENSE` file when inspected. Do not apply a blanket MIT license to upstream files without confirming permission/licensing. Ask PayPal/AG Grid or the repository owner how to license a derivative submission; the hackathon rules require a public repository with an open-source license.
