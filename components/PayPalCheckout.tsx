"use client";

import { useState } from "react";
import {
  PayPalProvider,
  PayPalOneTimePaymentButton,
  type OnApproveDataOneTimePayments,
} from "@paypal/react-paypal-js/sdk-v6";
import { captureOrder, createOrder } from "@/app/actions";

export type CaptureSummary = {
  status: "COMPLETED";
  captureId: string;
  amount: string;
  currency: string;
};

type Props = {
  tierId: string;
  onSuccess: (result: CaptureSummary) => void;
};

export default function PayPalCheckout({ tierId, onSuccess }: Props) {
  const [error, setError] = useState<string | null>(null);
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

  if (!clientId) {
    return <p className="text-sm text-rose-300">Set NEXT_PUBLIC_PAYPAL_CLIENT_ID to enable Sandbox checkout.</p>;
  }

  return (
    <div className="space-y-3">
      <PayPalProvider
        clientId={clientId}
        environment="sandbox"
        components={["paypal-payments"]}
        pageType="checkout"
      >
        <PayPalOneTimePaymentButton
          createOrder={async () => {
            setError(null);
            try {
              const result = await createOrder(tierId);
              return { orderId: result.id };
            } catch (caught) {
              const message = caught instanceof Error ? caught.message : "Could not create the PayPal order.";
              setError(message);
              throw caught;
            }
          }}
          onApprove={async ({ orderId }: OnApproveDataOneTimePayments) => {
            setError(null);
            try {
              const result = await captureOrder(orderId);
              onSuccess(result);
            } catch (caught) {
              const message = caught instanceof Error ? caught.message : "Could not confirm the PayPal capture.";
              setError(message);
              throw caught;
            }
          }}
          presentationMode="auto"
        />
      </PayPalProvider>
      {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
      <p className="text-xs text-slate-400">Sandbox only. Use a PayPal Sandbox Personal buyer account, not a real payment account.</p>
    </div>
  );
}
