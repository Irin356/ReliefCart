"use server";

import {
  captureDonationOrder,
  createDonationOrder,
} from "@/lib/paypal-orders";

export async function createOrder(tierId: string): Promise<{ id: string }> {
  if (typeof tierId !== "string" || tierId.length > 40) {
    throw new Error("Invalid contribution option.");
  }
  return createDonationOrder(tierId);
}

export async function captureOrder(orderId: string): Promise<{
  status: "COMPLETED";
  captureId: string;
  amount: string;
  currency: string;
}> {
  if (typeof orderId !== "string" || !/^[A-Z0-9-]{5,80}$/i.test(orderId)) {
    throw new Error("Invalid PayPal order ID.");
  }
  return captureDonationOrder(orderId);
}
