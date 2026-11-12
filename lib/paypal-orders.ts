import "server-only";
import { CONTRIBUTION_TIERS, type ContributionTierId, CAMPAIGN } from "@/lib/relief-config";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com";
let cachedToken: { value: string; expiresAt: number } | undefined;

type PayPalCapture = {
  id?: string;
  status?: string;
  amount?: { value?: string; currency_code?: string };
};

type PayPalOrder = {
  id?: string;
  status?: string;
  message?: string;
  name?: string;
  purchase_units?: Array<{
    custom_id?: string;
    payments?: { captures?: PayPalCapture[] };
  }>;
};

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  if (!clientId || !secret) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_SECRET must be configured.");
  }

  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(`PayPal authentication failed (${response.status}). Check your Sandbox app credentials.`);
  }

  const expiresIn = payload.expires_in ?? 300;
  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(30, expiresIn - 60) * 1000,
  };
  return payload.access_token;
}

async function paypalRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${PAYPAL_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    message?: string;
    name?: string;
  };

  if (!response.ok) {
    const detail = payload.message ?? payload.name ?? "Request rejected";
    throw new Error(`PayPal request failed (${response.status}): ${detail}`);
  }
  return payload;
}

export async function createDonationOrder(tierId: string): Promise<{ id: string }> {
  if (!Object.prototype.hasOwnProperty.call(CONTRIBUTION_TIERS, tierId)) {
    throw new Error("Unknown contribution tier.");
  }
  const tier = CONTRIBUTION_TIERS[tierId as ContributionTierId];
  const supabase = getSupabaseAdmin();
  const donationId = crypto.randomUUID();

  const { error: insertError } = await supabase.from("donations").insert({
    id: donationId,
    campaign_id: CAMPAIGN.id,
    tier_id: tier.id,
    tier_label: tier.label,
    amount: tier.amount,
    currency: CAMPAIGN.currency,
    status: "PENDING",
  });
  if (insertError) throw new Error(`Could not create the contribution record: ${insertError.message}`);

  try {
    const order = await paypalRequest<PayPalOrder>("/v2/checkout/orders", {
      method: "POST",
      headers: { "PayPal-Request-Id": `${donationId}-create` },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: tier.id,
            custom_id: donationId,
            description: `ReliefCart AI — ${tier.label}`,
            amount: {
              currency_code: CAMPAIGN.currency,
              value: tier.amount.toFixed(2),
            },
          },
        ],
      }),
    });

    if (!order.id) throw new Error("PayPal did not return an order ID.");

    const { error: updateError } = await supabase
      .from("donations")
      .update({ paypal_order_id: order.id })
      .eq("id", donationId);
    if (updateError) {
      throw new Error(`Order created but its ledger record could not be updated: ${updateError.message}`);
    }

    return { id: order.id };
  } catch (error) {
    await supabase.from("donations").update({ status: "FAILED" }).eq("id", donationId);
    throw error;
  }
}

export async function captureDonationOrder(orderId: string): Promise<{
  status: "COMPLETED";
  captureId: string;
  amount: string;
  currency: string;
}> {
  const supabase = getSupabaseAdmin();
  const { data: donation, error: readError } = await supabase
    .from("donations")
    .select("id, amount, currency, status, paypal_capture_id")
    .eq("paypal_order_id", orderId)
    .maybeSingle();

  if (readError) throw new Error(`Could not verify the contribution record: ${readError.message}`);
  if (!donation) throw new Error("This PayPal order is not associated with a ReliefCart contribution.");

  if (donation.status === "COMPLETED" && donation.paypal_capture_id) {
    return {
      status: "COMPLETED",
      captureId: donation.paypal_capture_id,
      amount: Number(donation.amount).toFixed(2),
      currency: donation.currency,
    };
  }

  // Read first so that retrying after a network interruption does not charge twice.
  let order = await paypalRequest<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  if (order.status !== "COMPLETED") {
    order = await paypalRequest<PayPalOrder>(
      `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      {
        method: "POST",
        headers: { "PayPal-Request-Id": `${donation.id}-capture` },
        body: "{}",
      },
    );
  }

  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (order.status !== "COMPLETED" || capture?.status !== "COMPLETED" || !capture.id || !capture.amount?.value) {
    throw new Error("PayPal has not confirmed a completed capture. Check the Sandbox transaction before retrying.");
  }

  const expectedAmount = Number(donation.amount).toFixed(2);
  const capturedAmount = Number(capture.amount.value).toFixed(2);
  const capturedCurrency = capture.amount.currency_code ?? "";
  if (capturedAmount !== expectedAmount || capturedCurrency !== donation.currency) {
    await supabase
      .from("donations")
      .update({ status: "REVIEW_REQUIRED", paypal_capture_id: capture.id })
      .eq("id", donation.id);
    throw new Error("The captured amount did not match the server-side contribution record. The record was flagged for review.");
  }

  const { error: updateError } = await supabase
    .from("donations")
    .update({
      status: "COMPLETED",
      paypal_capture_id: capture.id,
      captured_at: new Date().toISOString(),
    })
    .eq("id", donation.id);

  if (updateError) {
    // A retry can safely re-read the completed PayPal order and finish this database update.
    throw new Error(`PayPal captured the payment, but the ledger update failed: ${updateError.message}. Retry the confirmation.`);
  }

  return {
    status: "COMPLETED",
    captureId: capture.id,
    amount: capturedAmount,
    currency: capturedCurrency,
  };
}
