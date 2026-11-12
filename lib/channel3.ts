
import "server-only";

const CHANNEL3_BASE_URL = "https://api.trychannel3.com";

export type ReliefCategory = "Water" | "Hygiene" | "Lighting" | "FirstAid";

type Channel3Offer = {
  url?: string;
  domain?: string;
  availability?: string;
  price?: {
    price?: number;
    currency?: string;
    compare_at_price?: number | null;
  };
};

type Channel3Product = {
  id: string;
  title: string;
  description?: string | null;
  brands?: Array<{ id: string; name: string }>;
  images?: Array<{
    url?: string;
    cleaned_url?: string | null;
    is_main_image?: boolean;
    alt_text?: string | null;
  }>;
  offers?: Channel3Offer[];
};

type Channel3SearchResponse = {
  products?: Channel3Product[];
  message?: string;
};

export type ReliefProduct = {
  id: string;
  title: string;
  brand: string;
  imageUrl: string | null;
  price: number | null;
  currency: string;
  merchant: string;
  offerUrl: string | null;
  availability: string;
  relevanceScore: number;
};

const CATEGORY_RULES: Record<
  ReliefCategory,
  { include: string[]; exclude: string[] }
> = {
  Water: {
    include: [
      "water purification",
      "purification tablets",
      "water filter",
      "water filtration",
      "drinking water",
      "potable aqua",
      "water treatment",
      "water storage",
      "water container",
    ],
    exclude: [
      "pool",
      "aquarium",
      "fish",
      "water gun",
      "water toy",
      "pet",
      "dog",
      "cat",
    ],
  },

  Hygiene: {
    include: [
      "hand soap",
      "soap",
      "hand sanitizer",
      "sanitizer",
      "hygiene",
      "toothbrush",
      "toothpaste",
      "sanitary",
      "menstrual",
      "feminine hygiene",
      "wet wipes",
      "body wash",
      "disinfectant wipes",
      "cleaning wipes",
    ],
    exclude: [
      "car wash",
      "vehicle",
      "industrial cleaner",
      "air freshener",
      "perfume",
      "pet shampoo",
    ],
  },

  Lighting: {
    include: [
      "lantern",
      "flashlight",
      "torch",
      "emergency light",
      "rechargeable light",
      "solar light",
      "led light",
      "battery operated light",
      "battery powered light",
      "camping lantern",
    ],
    exclude: [
      "flickering",
      "decorative",
      "christmas",
      "string lights",
      "ornament",
      "novelty",
      "toy",
      "candle holder",
    ],
  },

  FirstAid: {
    include: [
      "first aid",
      "medical kit",
      "trauma kit",
      "bandage",
      "gauze",
      "wound care",
      "antiseptic",
      "wound dressing",
      "first aid supplies",
      "emergency medical",
    ],
    exclude: [
      "dog",
      "pet",
      "cat",
      "veterinary",
      "animal",
      "toy",
      "pretend",
      "play kit",
      "little tikes",
    ],
  },
};

  
function getRelevanceScore(
  product: Channel3Product,
  category: ReliefCategory,
): number {
  // Do not use the brand name to determine product relevance.
  // "First Aid Only" is a brand, and it can sell hygiene products.
  const title = product.title.toLowerCase();
  const description = (product.description ?? "").toLowerCase();
  const text = `${title} ${description}`;

  const rules = CATEGORY_RULES[category];

  if (rules.exclude.some((term) => text.includes(term))) {
    return 0;
  }

  // Explicitly reject products belonging to another category.
  if (
    category === "FirstAid" &&
    /\b(hygiene|sanitizer|sanitiser|soap|personal care)\b/i.test(text)
  ) {
    return 0;
  }

  if (
    category === "Lighting" &&
    /\b(decorative|ornament|christmas|toy|flickering)\b/i.test(text)
  ) {
    return 0;
  }

  const matches = rules.include.filter((term) =>
    text.includes(term),
  );

  return matches.length;
}

const FALLBACK_QUERIES: Partial<
  Record<ReliefCategory, string[]>
> = {
  Water: [
    "Potable Aqua water purification tablets",
    "emergency drinking water purification tablets",
    "water treatment tablets for safe drinking water",
  ],
  FirstAid: [
    "basic emergency first aid kit bandages gauze",
    "portable household first aid kit",
    "emergency wound care first aid supplies",
  ],
};

export async function searchReliefProducts(
  query: string,
  category: ReliefCategory,
): Promise<ReliefProduct[]> {
  const apiKey = process.env.CHANNEL3_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("CHANNEL3_API_KEY is not configured.");
  }

  const queries = [
    ...new Set([
      query,
      ...(FALLBACK_QUERIES[category] ?? []),
    ]),
  ];

  const productsById = new Map<string, Channel3Product>();

  for (const searchQuery of queries) {
    const response = await fetch(`${CHANNEL3_BASE_URL}/v1/search`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 5,
        config: {
          country: "US",
          currency: "USD",
          mode: "default",
        },
      }),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as Channel3SearchResponse;

    if (!response.ok) {
      throw new Error(
        `Channel3 search failed (${response.status}): ${
          payload.message ?? "Check the API key and request."
        }`,
      );
    }

    for (const product of payload.products ?? []) {
      if (product.id) {
        productsById.set(product.id, product);
      }
    }

    // Stop early when enough suitable, priced products are found.
    const suitableCount = [...productsById.values()].filter(
      (product) => {
        if (getRelevanceScore(product, category) === 0) {
          return false;
        }

        return (product.offers ?? []).some((offer) => {
          const price = Number(offer.price?.price);
          const currency = (
            offer.price?.currency ?? "USD"
          ).toUpperCase();

          return (
            offer.availability !== "OutOfStock" &&
            Number.isFinite(price) &&
            price > 0 &&
            currency === "USD"
          );
        });
      },
    ).length;

    if (suitableCount >= 2) break;
  }

  const mapped = [...productsById.values()]
    .filter(
      (product) => getRelevanceScore(product, category) > 0,
    )
    .map((product) => {
      const offers = (product.offers ?? [])
        .filter((offer) => {
          const price = Number(offer.price?.price);
          const currency = (
            offer.price?.currency ?? "USD"
          ).toUpperCase();

          return (
            offer.availability !== "OutOfStock" &&
            Number.isFinite(price) &&
            price > 0 &&
            currency === "USD"
          );
        })
        .sort(
          (a, b) =>
            Number(a.price?.price) -
            Number(b.price?.price),
        );

      const bestOffer = offers[0];

      const mainImage =
        product.images?.find((image) => image.is_main_image) ??
        product.images?.[0];

      return {
        id: product.id,
        title: product.title,
        brand: product.brands?.[0]?.name ?? "",
        imageUrl:
          mainImage?.cleaned_url ?? mainImage?.url ?? null,
        price: bestOffer
          ? Number(bestOffer.price?.price)
          : null,
        currency: (
          bestOffer?.price?.currency ?? "USD"
        ).toUpperCase(),
        merchant: bestOffer?.domain ?? "Retailer",
        offerUrl: bestOffer?.url ?? null,
        availability:
          bestOffer?.availability ??
          "Availability not supplied",
        relevanceScore: getRelevanceScore(
          product,
          category,
        ),
      };
    })
    .sort((a, b) => {
      const priceA = a.price ?? Number.POSITIVE_INFINITY;
      const priceB = b.price ?? Number.POSITIVE_INFINITY;

      return (
        priceA - priceB ||
        b.relevanceScore - a.relevanceScore
      );
    });

  return mapped;

}
