
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("donations")
      .select(
        "id, tier_label, amount, currency, status, paypal_capture_id, created_at, captured_at"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);

    const donations = data ?? [];

    return NextResponse.json(
      {
        donations,
        summary: {
          total: donations.length,
          pending: donations.filter(
            (d) => d.status?.toUpperCase() === "PENDING"
          ).length,
          completed: donations.filter(
            (d) => d.status?.toUpperCase() === "COMPLETED"
          ).length,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not load the contribution ledger.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
