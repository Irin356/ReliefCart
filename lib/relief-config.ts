export const CAMPAIGN = {
  id: "kerala-flood-response-demo",
  name: "Community Flood Response",
  location: "Illustrative emergency response campaign",
  familyCount: 50,
  fundraisingGoal: 600,
  currency: "USD",
} as const;

// Fixed server-side contribution amounts. The browser sends only a tier ID,
// never an amount. These are sandbox contribution tiers, not retailer purchases.
export const CONTRIBUTION_TIERS = {
  community: {
    id: "community",
    label: "Community Support",
    amount: 10,
    description: "A small contribution toward shared essentials.",
  },
  family: {
    id: "family",
    label: "Family Essentials Fund",
    amount: 25,
    description: "A contribution toward water, hygiene and lighting needs.",
  },
  response: {
    id: "response",
    label: "Emergency Response Fund",
    amount: 50,
    description: "A larger contribution toward urgent campaign priorities.",
  },
} as const;

export type ContributionTierId = keyof typeof CONTRIBUTION_TIERS;
