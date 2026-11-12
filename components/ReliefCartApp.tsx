"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { ColDef } from "ag-grid-community";
import { DataGrid, type Row } from "@/app/(endpoints)/data-grid";
import PayPalCheckout, { type CaptureSummary } from "@/components/PayPalCheckout";
import { CONTRIBUTION_TIERS, CAMPAIGN } from "@/lib/relief-config";

type ReliefProduct = {
  id: string;
  title: string;
  brand: string;
  imageUrl: string | null;
  price: number | null;
  currency: string;
  merchant: string;
  offerUrl: string | null;
  availability: string;
};

type PlanItem = {
  id: string;
  category: string;
  searchQuery: string;
  priority: string;
  quantityPerFamily: number;
  rationale: string;
  products: ReliefProduct[];
  searchError: string | null;
  recommendedFamilies: number | null;
  estimatedSubtotal: number | null;
  unitCostPerFamily: number | null;
  selectedProductId: string | null;
};

type PlanResult = {
  summary: string;
  budgetNote: string;
  budget: number;
  families: number;
  currency: string;
  estimatedTotal: number | null;
  categoriesWithPrices: number;
  items: PlanItem[];
  disclaimer: string;
  mode: "standard" | "rescue";
  originalPlanningBudget: number;
  recommendedTotal: number;
  completeKitFamilies: number | null;
  unallocatedBudget: number;
  coverageNote: string;
  priorityCoverage: string;
};

type DonationApiRow = {
  id: string;
  tier_label: string;
  amount: number | string;
  currency: string;
  status: string;
  paypal_capture_id: string | null;
  created_at: string;
  captured_at: string | null;
};

const money = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);

export default function ReliefCartApp() {
  const [need, setNeed] = useState("Create an emergency essentials plan for 50 families affected by severe flooding. Prioritise safe drinking water, hygiene, lighting and basic first-aid supplies. Avoid non-essential items.");
  const [families, setFamilies] = useState<number>(CAMPAIGN.familyCount);
  const [budget, setBudget] = useState<number>(CAMPAIGN.fundraisingGoal);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [donations, setDonations] = useState<Row[]>([]);
  const [donationTotal, setDonationTotal] = useState(0);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<keyof typeof CONTRIBUTION_TIERS | null>(null);
  const [receipt, setReceipt] = useState<CaptureSummary | null>(null);

  const donationColumns = useMemo<ColDef<Row>[]>(() => [
    { field: "tier_label", headerName: "Contribution", flex: 1, minWidth: 170 },
    { field: "amount", headerName: "Amount", type: "money", minWidth: 120 },
    { field: "status", headerName: "Status", minWidth: 120 },
    { field: "paypal_capture_id", headerName: "PayPal capture reference", flex: 1, minWidth: 190 },
    { field: "captured_at", headerName: "Captured at", cellDataType: "dateTimeString", minWidth: 180 },
  ], []);

  const refreshDonations = useCallback(async () => {
    try {
      const response = await fetch("/api/donations", { cache: "no-store" });
      const payload = (await response.json()) as { donations?: DonationApiRow[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load contributions.");
      const rows = (payload.donations ?? []).map((row) => ({
        ...row,
        amount: Number(row.amount),
        currency: row.currency,
      }));
      setDonations(rows as Row[]);
      setDonationTotal(rows.reduce((sum, row) => sum + Number(row.amount), 0));
      setLedgerError(null);
    } catch (error) {
      setLedgerError(error instanceof Error ? error.message : "Could not load the contribution ledger.");
    }
  }, []);

  
useEffect(() => {
  let cancelled = false;

  fetch("/api/donations", { cache: "no-store" })
    .then(async (response) => {
      const payload = (await response.json()) as {
        donations?: DonationApiRow[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load contributions.");
      }

      return (payload.donations ?? []).map((row) => ({
        ...row,
        amount: Number(row.amount),
        currency: row.currency,
      }));
    })
    .then((rows) => {
      if (cancelled) return;

      setDonations(rows as Row[]);
      setDonationTotal(
        rows.reduce((sum, row) => sum + Number(row.amount), 0)
      );
      setLedgerError(null);
    })
    .catch((error: unknown) => {
      if (cancelled) return;

      setLedgerError(
        error instanceof Error
          ? error.message
          : "Could not load the contribution ledger."
      );
    });

  return () => {
    cancelled = true;
  };
}, []);


  async function generatePlan(
  nextBudget: number = budget,
  mode: "standard" | "rescue" = "standard",
) {
    setPlanning(true);
    setPlanError(null);
    setReceipt(null);
    try {
      const response = await fetch("/api/ai/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
  need,
  families,
  budget: nextBudget,
  originalPlanningBudget: budget,
  mode,
}),
      });
      const payload = (await response.json()) as PlanResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not create the procurement plan.");
      setPlan(payload);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "Could not create the procurement plan.");
    } finally {
      setPlanning(false);
    }
  }

  async function runBudgetRescue() {
  // Always calculate from the original planning input.
  // Never overwrite the campaign or planning budget.
  const rescueTarget = Math.max(
    10,
    Math.round(budget * 0.7),
  );

  await generatePlan(rescueTarget, "rescue");
}

  async function handlePaymentSuccess(result: CaptureSummary) {
    setReceipt(result);
    setSelectedTier(null);
    await refreshDonations();
  }

  const progress = Math.min(100, (donationTotal / Math.max(1, CAMPAIGN.fundraisingGoal)) * 100);
  const productEstimate = plan?.estimatedTotal;
  const productOverBudget =
  productEstimate !== null &&
  productEstimate !== undefined &&
  productEstimate > (plan?.budget ?? budget);

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-7 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-400 text-xl font-black text-[#052018]">R</div>
            <div>
              <p className="text-lg font-semibold tracking-tight">ReliefCart <span className="text-emerald-300">AI</span></p>
              <p className="text-xs text-slate-400">Procurement intelligence · transparent funding</p>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1.5 text-emerald-200">Sandbox demo</span>
            <Link href="/dashboard" className="rounded-xl border border-white/15 px-4 py-2 text-slate-200 hover:bg-white/10">AG Studio analytics ↗</Link>
          </nav>
        </header>

        <section className="grid gap-8 py-8 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[.24em] text-emerald-300">Community response workspace</p>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Turn urgent needs into <span className="text-emerald-300">fundable action.</span></h1>
            <p className="mt-4 max-w-2xl leading-7 text-slate-300">ReliefCart uses AI to shape an emergency procurement plan, Channel3 to discover real product offers, and PayPal Sandbox to demonstrate transparent campaign contributions.</p>
          </div>
          <div className="rounded-3xl border border-emerald-300/20 bg-gradient-to-br from-emerald-300/10 to-cyan-300/5 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-300">Active campaign</p>
                <h2 className="mt-1 text-xl font-semibold">{CAMPAIGN.name}</h2>
                <p className="mt-1 text-xs text-slate-400">{CAMPAIGN.location} · {families} families</p>
              </div>
              <span className="rounded-full bg-emerald-300/15 px-3 py-1 text-xs text-emerald-200">Open</span>
            </div>
            <div className="mt-5 flex items-end justify-between"><span className="text-sm text-slate-400">Sandbox contributions</span><strong className="text-2xl">{money(donationTotal)}</strong></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-300 transition-all" style={{ width: `${progress}%` }} /></div>
            <div className="mt-2 flex justify-between text-xs text-slate-400"><span>{progress.toFixed(0)}% of demo goal</span><span>Goal {money(CAMPAIGN.fundraisingGoal)}</span></div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[.92fr_1.08fr]">
          <div className="rounded-3xl border border-white/10 bg-[#101e2e] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">01 · AI procurement agent</p><h2 className="mt-2 text-2xl font-semibold">Describe the need</h2></div><span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">Groq AI</span></div>
            <label className="mt-5 block text-sm text-slate-300" htmlFor="need">Emergency brief</label>
            <textarea id="need" value={need} onChange={(event) => setNeed(event.target.value)} rows={5} maxLength={900} className="mt-2 w-full resize-y rounded-2xl border border-white/10 bg-[#091523] p-4 text-sm leading-6 outline-none transition focus:border-emerald-300/60" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-slate-300">Families<input type="number" min={1} max={200} value={families} onChange={(event) => setFamilies(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#091523] px-3 py-3 text-white outline-none focus:border-emerald-300/60" /></label>
              <label className="text-sm text-slate-300">Planning budget (USD)<input type="number" min={10} max={50000} value={budget} onChange={(event) => setBudget(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#091523] px-3 py-3 text-white outline-none focus:border-emerald-300/60" /></label>
            </div>
            <button onClick={() => void generatePlan()} disabled={planning} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-5 py-3.5 font-semibold text-[#062018] transition hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-60">{planning ? "Analysing needs and searching products…" : "Generate procurement plan →"}</button>
            {planError && <p role="alert" className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{planError}</p>}
            <p className="mt-3 text-xs leading-5 text-slate-500">AI proposes priorities and search terms. Channel3 supplies product data; organizers must review quantities, variants, prices and delivery suitability.</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#101e2e] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">02 · Live product intelligence</p><h2 className="mt-2 text-2xl font-semibold">Procurement shortlist</h2></div><span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-200">Channel3 API</span></div>
            {!plan && <div className="mt-6 grid min-h-64 place-items-center rounded-2xl border border-dashed border-white/15 p-8 text-center"><div><div className="text-4xl">⌕</div><p className="mt-3 font-medium">Your shortlist will appear here</p><p className="mt-1 max-w-sm text-sm text-slate-400">Generate a plan to search real product listings, prices and retailer offers.</p></div></div>}
            {plan && <div className="mt-5 space-y-4">
              <div className="rounded-2xl bg-[#0a1725] p-4"><p className="text-sm leading-6 text-slate-200">{plan.summary}</p><p className="mt-2 text-xs leading-5 text-slate-400">{plan.budgetNote}</p></div>

<div className="flex flex-wrap items-center justify-between gap-3">
  <div>
    <p className="text-xs text-slate-400">
      Full-coverage estimate for {plan.families} families
    </p>
    <p className="mt-1 text-2xl font-semibold">
      {productEstimate == null
        ? "Unavailable"
        : money(productEstimate)}
    </p>
    <p className="mt-1 text-xs text-slate-500">
      Planning target: {money(plan.budget)}
      {" · "}Original planning budget:{" "}
      {money(plan.originalPlanningBudget)}
    </p>
  </div>

  <button
    onClick={() => void runBudgetRescue()}
    disabled={planning}
    className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-sm font-medium text-amber-100 hover:bg-amber-300/20 disabled:opacity-50"
  >
    ✦ Smart Budget Rescue · Target{" "}
    {money(Math.max(10, Math.round(budget * 0.7)))}
  </button>
</div>

{productOverBudget && productEstimate != null && (
  <p className="text-xs text-amber-200">
    Full coverage exceeds the planning target by{" "}
    {money(productEstimate - plan.budget)}.
    Review the optimized allocation below.
  </p>
)}

<div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-4">
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200">
        {plan.mode === "rescue"
          ? "Smart Budget Rescue proposal"
          : "Budget-aware procurement allocation"}
      </p>
      <p className="mt-1 text-2xl font-semibold text-emerald-200">
        {money(plan.recommendedTotal)}
      </p>
      <p className="text-xs text-slate-400">
        Recommended spending within the target budget
      </p>
    </div>

    <div className="text-right">
      <p className="text-xs text-slate-400">Unallocated funds</p>
      <p className="mt-1 text-xl font-semibold">
        {money(plan.unallocatedBudget)}
      </p>
    </div>
  </div>

  <div className="mt-4 grid grid-cols-2 gap-3">
    <div className="rounded-xl bg-[#0a1725] p-3">
      <p className="text-xs text-slate-400">
        Complete modeled kits
      </p>
      <p className="mt-1 text-xl font-semibold">
        {plan.completeKitFamilies === null
          ? "Unverified"
          : `${plan.completeKitFamilies}/${plan.families}`}
      </p>
    </div>

    <div className="rounded-xl bg-[#0a1725] p-3">
      <p className="text-xs text-slate-400">
        Categories priced
      </p>
      <p className="mt-1 text-xl font-semibold">
        {plan.categoriesWithPrices}/{plan.items.length}
      </p>
    </div>
  </div>

  <p className="mt-3 text-xs leading-5 text-slate-300">
    {plan.coverageNote}
  </p>

  <p className="mt-2 text-xs leading-5 text-slate-400">
    {plan.priorityCoverage}
  </p>
</div>

              <div className="space-y-4">
                {plan.items.map((item) => <div key={item.id} className="rounded-2xl border border-white/10 bg-[#0a1725] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{item.category}</h3><p className="mt-1 text-xs text-slate-400">{item.rationale}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${item.priority === "critical" ? "bg-rose-300/15 text-rose-200" : item.priority === "high" ? "bg-amber-300/15 text-amber-100" : "bg-slate-300/10 text-slate-300"}`}>{item.priority}</span></div>
                  <p className="mt-2 text-xs text-slate-500">Search: {item.searchQuery} · Suggested quantity: {item.quantityPerFamily} per family</p>
                  {item.searchError && <p className="mt-2 text-xs text-amber-200">Channel3: {item.searchError}</p>}
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {item.products.slice(0, 2).map((product) => <div key={product.id} className="flex gap-3 rounded-xl border border-white/10 bg-[#101e2e] p-3">
                      {product.imageUrl ? <Image src={product.imageUrl} alt={product.title} width={80} height={80} unoptimized className="h-20 w-20 rounded-lg bg-white object-contain" /> : <div className="grid h-20 w-20 place-items-center rounded-lg bg-white/5 text-2xl">□</div>}
                      <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-medium">{product.title}</p><p className="mt-1 text-xs text-slate-400">{product.brand || product.merchant}</p><p className="mt-1 font-semibold text-emerald-200">{product.price === null ? "Price unavailable" : money(product.price, product.currency)}</p>{product.offerUrl && <a href={product.offerUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-cyan-200 underline underline-offset-2">View retailer offer ↗</a>}</div>
                    </div>)}
                  </div>
                  {item.products.length === 0 && !item.searchError && <p className="mt-2 text-xs text-slate-400">No matching product offers were returned. Try editing the search brief.</p>}
                </div>)}
              </div>
              <p className="text-[11px] leading-5 text-slate-500">{plan.disclaimer}</p>
            </div>}
          </div>
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
          <div className="rounded-3xl border border-white/10 bg-[#101e2e] p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">03 · PayPal Sandbox</p><h2 className="mt-2 text-2xl font-semibold">Fund the campaign</h2><p className="mt-2 text-sm leading-6 text-slate-400">Choose a contribution tier. ReliefCart creates a PayPal order on the server, captures it after approval and records the confirmed payment.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              {Object.values(CONTRIBUTION_TIERS).map((tier) => <button key={tier.id} onClick={() => { setSelectedTier(tier.id as keyof typeof CONTRIBUTION_TIERS); setReceipt(null); }} className={`rounded-2xl border p-4 text-left transition ${selectedTier === tier.id ? "border-emerald-300 bg-emerald-300/10" : "border-white/10 bg-[#0a1725] hover:border-white/25"}`}><p className="text-sm font-semibold">{tier.label}</p><p className="mt-2 text-2xl font-semibold">{money(tier.amount)}</p><p className="mt-1 text-xs leading-5 text-slate-400">{tier.description}</p></button>)}
            </div>
            {selectedTier && <div className="mt-5 rounded-2xl border border-white/10 bg-[#0a1725] p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="font-semibold">{CONTRIBUTION_TIERS[selectedTier].label}</p><p className="text-xs text-slate-400">Sandbox contribution · {money(CONTRIBUTION_TIERS[selectedTier].amount)}</p></div><button onClick={() => setSelectedTier(null)} className="text-xs text-slate-400 underline">Cancel</button></div><PayPalCheckout tierId={selectedTier} onSuccess={(result) => void handlePaymentSuccess(result)} /></div>}
            {receipt && <div role="status" className="mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-4"><p className="font-semibold text-emerald-200">Sandbox payment captured successfully</p><p className="mt-1 text-sm text-slate-200">{money(Number(receipt.amount), receipt.currency)} · Capture {receipt.captureId}</p></div>}
            </div>

          <div className="flex min-h-[440px] flex-col rounded-3xl border border-white/10 bg-[#101e2e] p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">04 · Operations intelligence</p><h2 className="mt-2 text-2xl font-semibold">Contribution ledger</h2><p className="mt-1 text-sm text-slate-400">AG Grid · sortable, filterable and searchable</p></div><button onClick={() => void refreshDonations()} className="rounded-xl border border-white/15 px-3 py-2 text-xs text-slate-200 hover:bg-white/10">↻ Refresh</button></div>
            {ledgerError && <p role="alert" className="mb-3 text-xs text-amber-200">{ledgerError}</p>}
            <div className="flex h-[340px] min-h-[340px] flex-col overflow-hidden rounded-xl bg-white p-2 text-[#001435]"><DataGrid rows={donations} columns={donationColumns} /></div>
          </div>
        </section>

        <footer className="mt-8 flex flex-wrap justify-between gap-3 border-t border-white/10 py-5 text-xs text-slate-500"><span>ReliefCart AI</span><span>PayPal Sandbox · Channel3 product data · Groq AI · AG Grid</span></footer>
      </div>
    </main>
  );
}
