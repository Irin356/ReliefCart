# ReliefCart AI

**AI-powered emergency relief procurement planning and contribution tracking.**

ReliefCart AI helps relief coordinators turn an emergency brief, family count, and available budget into a practical procurement plan. It combines AI-generated planning suggestions with product search results, budget-aware allocation, PayPal Sandbox contributions, a Supabase donation ledger, and AG Grid analytics.

> **Demo video:** [Watch ReliefCart AI on YouTube](https://youtu.be/JvuT7RIXpU8)

## The problem

During an emergency, relief teams must decide what supplies to procure, compare available products, and stretch limited funds across affected families. These decisions can be difficult when needs are urgent and product information is spread across different sources.

## The solution

ReliefCart AI brings planning, product discovery, budget allocation, and contribution tracking into one application. A coordinator describes the emergency, enters the number of families and a budget, and generates a procurement plan. The application searches for matching product offers and uses the returned prices in its estimates and allocation calculations.

## Key features

### 1. AI-assisted relief planning

- Accepts a natural-language emergency brief, family count, and planning budget.
- Uses Groq to generate structured procurement suggestions.
- Organizes essential supplies into four categories: **Water, Hygiene, Lighting, and First Aid**.
- Provides priorities, product search terms, and short rationales.

### 2. Product discovery with Channel3

- Searches for products relevant to each relief category using the Channel3 API.
- Displays product information and available offer details returned by the product search service.
- Uses returned prices for procurement estimates rather than treating AI-generated prices as verified offers.

### 3. Smart Budget and Budget Rescue

- Estimates the cost of covering all requested families using the selected product offers.
- Calculates a recommended allocation constrained by the entered budget.
- Prioritizes category coverage using a priority-weighted allocation approach.
- Shows modeled complete-kit coverage, category-level coverage, recommended spend, and any unallocated budget.
- Supports a reduced-budget rescue scenario while retaining visibility into essential categories.

**Planning note:** These figures are estimates based on the selected offers and configured quantities. Product pack sizes, suitability, retailer conditions, shipping costs, and final availability must be checked before procurement. A modeled category set is not a guarantee that every family has received a complete or medically suitable kit.

### 4. PayPal contribution checkout

- Integrates PayPal Checkout for one-time contributions.
- Creates donation records and PayPal orders on the server.
- Captures approved orders on the server and checks the captured amount and currency against the contribution record.
- Marks a donation `COMPLETED` only after a successful, matching PayPal capture.

**Payment environment:** The current demonstration uses PayPal **Sandbox** accounts. Sandbox transactions are simulated and do not collect real money. Do not use this setup to accept live donations.

### 5. Supabase contribution ledger

- Stores contribution records in Supabase PostgreSQL.
- Tracks payment states such as `PENDING`, `COMPLETED`, `FAILED`, and `REVIEW_REQUIRED`.
- Stores PayPal order and capture references and capture timestamps when available.
- Exposes the contribution ledger through the `/api/donations` endpoint.

Pending contributions are not treated as received funds. Only successfully captured and verified contributions should be counted as completed donations.

### 6. AG Grid data table

- Displays contribution records in a sortable, filterable, searchable grid.
- Supports reviewing contribution amounts, payment statuses, PayPal capture references, and capture timestamps.

## Technology stack

| Area | Technology |
|---|---|
| Application | Next.js App Router, React, TypeScript |
| AI planning | Groq API (`openai/gpt-oss-20b` by default) |
| Product discovery | Channel3 API |
| Payments | PayPal Checkout SDK and PayPal REST API (Sandbox) |
| Database | Supabase PostgreSQL |
| Data grid | AG Grid |
| Styling | Tailwind CSS |

## Application flow

1. The coordinator enters the emergency need, number of families, and budget.
2. The planning API asks Groq for structured category recommendations.
3. The server searches Channel3 for matching products and offer information.
4. The application calculates full-coverage estimates and a budget-constrained allocation.
5. A contributor selects a contribution tier and approves the PayPal Sandbox checkout.
6. The server captures the approved PayPal order and verifies the capture details.
7. Supabase is updated with the final payment status, and the contribution ledger displays the record.

## Run locally

### Requirements

- Node.js 20.9 or later
- npm
- A Groq API key
- A Channel3 API key
- A Supabase project
- A PayPal Developer account with Sandbox Business and Personal test accounts

### 1. Clone the repository

```bash
git clone https://github.com/Irin356/ReliefCart.git
cd ReliefCart
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example environment file:

**Windows PowerShell**

```powershell
Copy-Item env.example .env.local
```

**macOS / Linux**

```bash
cp env.example .env.local
```

Open `.env.local` and fill in the values for the integrations listed in `env.example`. Do not commit this file or share its contents.

The PayPal variables used by the application are:

```dotenv
NEXT_PUBLIC_PAYPAL_CLIENT_ID=YOUR_SANDBOX_APP_CLIENT_ID
PAYPAL_CLIENT_ID=YOUR_SANDBOX_APP_CLIENT_ID
PAYPAL_SECRET=YOUR_SANDBOX_APP_SECRET
```

Use the **same Client ID** for `NEXT_PUBLIC_PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_ID`. The `PAYPAL_SECRET` must belong to that same Sandbox REST API app. Keep the secret server-side; do not create a `NEXT_PUBLIC_PAYPAL_SECRET` variable.

The application also needs the Groq, Channel3, and Supabase values defined in `env.example`. Preserve the variable names from that file. The Groq model can be configured with `GROQ_MODEL`; when omitted, the application defaults to `openai/gpt-oss-20b`.

### 4. Set up the Supabase database

1. Create or open your Supabase project.
2. Open the Supabase SQL Editor.
3. Run the SQL in [`supabase/schema.sql`](supabase/schema.sql) to create the donation table and its database policies.
4. Configure the Supabase project values in `.env.local` using the variable names in `env.example`.

Keep administrative Supabase credentials on the server. Never expose a service-role key through a `NEXT_PUBLIC_` environment variable.

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Other useful commands

```bash
npm run build   # Create a production build
npm run start   # Serve the production build
npm run lint    # Run lint checks, if configured in package.json
```

## PayPal Sandbox testing

1. In the PayPal Developer Dashboard, create a Sandbox REST API app associated with a Sandbox Business seller account.
2. Configure the app's Client ID and Secret in `.env.local`.
3. Use a separate Sandbox Personal buyer account to complete checkout.
4. Restart the Next.js server after changing environment variables.
5. After checkout, inspect `/api/donations` and confirm that the new record has `status: "COMPLETED"`, a non-null `paypal_capture_id`, and a non-null `captured_at`.

Use Sandbox credentials only for this demonstration. Never put real PayPal credentials in the repository.

## Important security notes

- `.env.local` contains private API credentials and must remain untracked by Git.
- Keep PayPal secrets, Supabase administrative keys, Groq keys, and Channel3 keys on the server.
- The PayPal integration described here is configured for Sandbox testing, not live-money processing.
- Before deploying publicly, review authentication, authorization, rate limiting, database access policies, logging, and production payment requirements.

## Known limitations

- Product search results, prices, merchants, and availability can change. Review the current offer before procurement.
- Product pack sizes and exact per-family suitability may require manual validation.
- Budget allocations are planning estimates, not purchase orders or guarantees of delivery.
- PayPal Sandbox transactions are simulated and are not real contributions.

## Demo

[ReliefCart AI — YouTube demo](https://youtu.be/JvuT7RIXpU8)

## License

Add the license selected for this project as a `LICENSE` file in the repository root. Confirm that the upstream starter code permits the license you choose before publishing or relicensing the project.
