
import { NextResponse } from "next/server";
import {
  searchReliefProducts,
  type ReliefCategory,
} from "@/lib/channel3";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `
You are ReliefCart, an emergency relief procurement planning assistant.

Return valid JSON only.

Never invent:
- Product prices
- Product availability
- Retailer names
- Product pack sizes
- Medical claims
- Delivery promises

Suggest practical non-prescription emergency essentials only.

Use no more than these four categories:
Water, Hygiene, Lighting, FirstAid.

Return this JSON schema:
{
  "summary": "short explanation",
  "budget_note": "short planning explanation",
  "items": [
    {
      "category": "Water",
      "search_query": "specific product search terms",
      "priority": "critical|high|medium",
      "quantity_per_family": 1,
      "rationale": "short explanation"
    }
  ]
}

Requirements:
- Prefer relevant drinking-water purification or storage supplies.
- Prefer useful hygiene items such as hand soap and sanitiser.
- Prefer practical emergency lanterns, torches and rechargeable lights.
- Prefer genuine basic first-aid kits and wound-care supplies.
- Never recommend pet products, toys or decorative products.
- Use quantity_per_family between 1 and 3.
- Default to one purchased product package per family.
- Adapt priorities to the emergency and available budget.
- Search queries must identify the intended product clearly.
`;

type AIPlanResponse = {
  summary: string;
  budget_note: string;
  items: Array<{
    category: "Water" | "Hygiene" | "Lighting" | "FirstAid";
    search_query: string;
    priority: "critical" | "high" | "medium";
    quantity_per_family: number;
    rationale: string;
  }>;
};

type AllocationItem = {
  id: string;
  category: ReliefCategory;
  searchQuery: string;
  priority: string;
  quantityPerFamily: number;
  rationale: string;
  products: Awaited<ReturnType<typeof searchReliefProducts>>;
  searchError: string | null;
  recommendedFamilies: number | null;
  estimatedSubtotal: number | null;
  unitCostPerFamily: number | null;
  selectedProductId: string | null;
  unitCostCents: number | null;
};

const CATEGORY_ORDER: ReliefCategory[] = [
  "Water",
  "Hygiene",
  "Lighting",
  "FirstAid",
];

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

function normalizeCategory(
  value: string,
  searchQuery: string,
  index: number,
): ReliefCategory {
  const text = `${value} ${searchQuery}`.toLowerCase();

  if (/water|purif|drink/.test(text)) return "Water";
  if (/hygien|soap|sanit|toothbrush/.test(text)) return "Hygiene";
  if (/light|lantern|flashlight|torch/.test(text)) return "Lighting";
  if (/first.?aid|medical|bandage|wound/.test(text)) return "FirstAid";

  return CATEGORY_ORDER[index] ?? "Water";
}

function toMoney(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      need?: unknown;
      families?: unknown;
      budget?: unknown;
      originalPlanningBudget?: unknown;
      mode?: unknown;
    };

    const need =
      typeof body.need === "string"
        ? body.need.trim().slice(0, 900)
        : "";

    const families = Number(body.families);
    const budget = Number(body.budget);

    const originalPlanningBudget = Number(
      body.originalPlanningBudget ?? body.budget,
    );

    const mode =
      body.mode === "rescue" ? "rescue" : "standard";

    if (need.length < 12) {
      return NextResponse.json(
        { error: "Describe the emergency need in at least 12 characters." },
        { status: 400 },
      );
    }

    if (
      !Number.isInteger(families) ||
      families < 1 ||
      families > 200
    ) {
      return NextResponse.json(
        { error: "Families must be a whole number from 1 to 200." },
        { status: 400 },
      );
    }

    if (
      !Number.isFinite(budget) ||
      budget < 10 ||
      budget > 50000
    ) {
      return NextResponse.json(
        { error: "Budget must be between $10 and $50,000 USD." },
        { status: 400 },
      );
    }

    if (
      !Number.isFinite(originalPlanningBudget) ||
      originalPlanningBudget < 10 ||
      originalPlanningBudget > 50000
    ) {
      return NextResponse.json(
        { error: "Original planning budget is invalid." },
        { status: 400 },
      );
    }

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not configured.");
    }

    const rescueInstruction =
      mode === "rescue"
        ? `
This is a budget-rescue request.
Prefer economical, practical product search terms.
Preserve critical categories.
Do not remove essential categories merely to claim the budget works.
Explain compromises honestly.
`
        : `
Create the initial procurement requirements.
Prioritise essential supplies based on the emergency.
`;

    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model:
            process.env.GROQ_MODEL ??
            "openai/gpt-oss-20b",
          
          temperature: 0.2,
          max_tokens: 1500,
          reasoning_format: "hidden",
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "reliefcart_procurement_plan",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  summary: {
                    type: "string",
                  },
                  budget_note: {
                    type: "string",
                  },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        category: {
                          type: "string",
                          enum: ["Water", "Hygiene", "Lighting", "FirstAid"],
                        },
                        search_query: {
                          type: "string",
                        },
                        priority: {
                          type: "string",
                          enum: ["critical", "high", "medium"],
                        },
                        quantity_per_family: {
                          type: "integer",
                        },
                        rationale: {
                          type: "string",
                        },
                      },
                      required: [
                        "category",
                        "search_query",
                        "priority",
                        "quantity_per_family",
                        "rationale",
                      ],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["summary", "budget_note", "items"],
                additionalProperties: false,
              },
            },
          },

          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT + rescueInstruction,
            },
            {
              role: "user",
              content: JSON.stringify({
                emergency: need,
                families,
                target_budget_usd: budget,
                original_planning_budget_usd:
                  originalPlanningBudget,
                mode,
              }),
            },
          ],
        }),
        cache: "no-store",
      },
    );

    const groqPayload = (await groqResponse
      .json()
      .catch(() => ({}))) as {
      choices?: Array<{
        message?: { content?: string | null };
      }>;
      error?: { message?: string };
    };

    if (!groqResponse.ok) {
    console.error("Groq API error:", groqPayload.error);

    throw new Error(
      `Groq request failed (${groqResponse.status}): ${
        groqPayload.error?.message ??
        "Check the model and API key."
      }`,
    );
  }

    const content =
      groqPayload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Groq returned an empty plan.");
    }

    const parsed = JSON.parse(content) as AIPlanResponse;

    const rawItems = Array.isArray(parsed.items)
      ? parsed.items.slice(0, 4)
      : [];

    if (rawItems.length === 0) {
      throw new Error(
        "The AI did not return procurement categories. Try a more specific brief.",
      );
    }

    // Normalize categories and prevent duplicate category allocations.
    
// Always represent all four required categories.
// Groq can customise the queries and priorities,
// but it cannot silently omit an essential category.

const REQUIRED_CATEGORIES: Array<{
  category: ReliefCategory;
  searchQuery: string;
  priority: string;
  quantityPerFamily: number;
  rationale: string;
}> = [
  {
    category: "Water",
    searchQuery:
      "Potable Aqua Coghlan emergency drinking water purification tablets",
    priority: "critical",
    quantityPerFamily: 1,
    rationale:
      "Provide appropriate drinking-water treatment or storage after flooding.",
  },
  {
    category: "Hygiene",
    searchQuery:
      "emergency hand soap liquid hand soap hygiene supplies",
    priority: "high",
    quantityPerFamily: 1,
    rationale:
      "Support basic hand hygiene and sanitation.",
  },
  {
    category: "Lighting",
    searchQuery:
      "emergency LED flashlight battery powered lantern",
    priority: "high",
    quantityPerFamily: 1,
    rationale:
      "Provide practical lighting during power outages.",
  },
  {
    category: "FirstAid",
    searchQuery:
      "basic emergency first aid kit bandages gauze wound care",
    priority: "high",
    quantityPerFamily: 1,
    rationale:
      "Provide basic first-aid supplies for common minor injuries.",
  },
];

// Index Groq recommendations by category.
const aiItemsByCategory = new Map<
  ReliefCategory,
  {
    searchQuery: string;
    priority: string;
    quantityPerFamily: number;
    rationale: string;
  }
>();

rawItems.forEach((item, index) => {
  const searchQuery = String(
    item.search_query ?? item.category ?? "",
  ).trim().slice(0, 140);

  const category = normalizeCategory(
    String(item.category ?? ""),
    searchQuery,
    index,
  );

  const priorityText = String(
    item.priority ?? "high",
  ).toLowerCase();

  if (!aiItemsByCategory.has(category)) {
    aiItemsByCategory.set(category, {
      searchQuery,
      priority: ["critical", "high", "medium"].includes(
        priorityText,
      )
        ? priorityText
        : "high",
      quantityPerFamily: Math.min(
        3,
        Math.max(
          1,
          Math.round(
            Number(item.quantity_per_family) || 1,
          ),
        ),
      ),
      rationale: String(
        item.rationale ?? "Priority identified from the campaign brief.",
      ).slice(0, 240),
    });
  }
});

// Merge AI recommendations with required fallback categories.
const plannedItems = REQUIRED_CATEGORIES.map(
  (fallback, index) => {
    const ai = aiItemsByCategory.get(fallback.category);

    return {
      id: `need-${index + 1}`,
      category: fallback.category,
      searchQuery:
        ai?.searchQuery || fallback.searchQuery,
      priority: ai?.priority || fallback.priority,
      quantityPerFamily:
        ai?.quantityPerFamily ?? fallback.quantityPerFamily,
      rationale:
        ai?.rationale || fallback.rationale,
    };
  },
);


    // Retrieve actual Channel3 data with category-specific filtering.
    const enriched = await Promise.all(
      plannedItems.map(async (item) => {
        try {
          const products = await searchReliefProducts(
            item.searchQuery,
            item.category,
          );

          return {
            ...item,
            products,
            searchError:
              products.length === 0
                ? "No suitable, priced category matches were found. Review the search query."
                : null,
          };
        } catch (error) {
          return {
            ...item,
            products: [],
            searchError:
              error instanceof Error
                ? error.message
                : "Channel3 search failed.",
          };
        }
      }),
    );

    // Use integer cents for financial calculations.
    const baseItems: AllocationItem[] = enriched.map((item) => {
      const selectedProduct =
        item.products.find(
          (product) =>
            product.price !== null &&
            Number.isFinite(product.price) &&
            product.price > 0,
        ) ?? null;

      const unitCostCents = selectedProduct
        ? Math.round(
            selectedProduct.price! *
              item.quantityPerFamily *
              100,
          )
        : null;

      return {
        ...item,
        recommendedFamilies: 0,
        estimatedSubtotal: 0,
        unitCostPerFamily:
          unitCostCents === null
            ? null
            : toMoney(unitCostCents),
        selectedProductId: selectedProduct?.id ?? null,
        unitCostCents,
      };
    });

    const allCategoriesPriced =
      baseItems.length > 0 &&
      baseItems.every((item) => item.unitCostCents !== null);

    const budgetCents = Math.round(budget * 100);

    const fullKitCostPerFamilyCents = allCategoriesPriced
      ? baseItems.reduce(
          (sum, item) => sum + (item.unitCostCents ?? 0),
          0,
        )
      : 0;

    // Full-coverage estimate: every requested family receives every item.
    const estimatedTotalCents = allCategoriesPriced
      ? fullKitCostPerFamilyCents * families
      : null;

    // First allocate complete kits to as many families as possible.
    const completeKitFamilies =
      allCategoriesPriced &&
      fullKitCostPerFamilyCents > 0
        ? Math.min(
            families,
            Math.floor(
              budgetCents / fullKitCostPerFamilyCents,
            ),
          )
        : null;

    const baseCoverageFamilies = completeKitFamilies ?? 0;

    let remainingCents = Math.max(
      0,
      budgetCents -
        baseCoverageFamilies * fullKitCostPerFamilyCents,
    );

    const allocations: AllocationItem[] = baseItems.map(
      (item) => {
        if (item.unitCostCents === null) {
          return {
            ...item,
            recommendedFamilies: null,
            estimatedSubtotal: null,
          };
        }

        const subtotalCents =
          item.unitCostCents * baseCoverageFamilies;

        return {
          ...item,
          recommendedFamilies: baseCoverageFamilies,
          estimatedSubtotal: toMoney(subtotalCents),
        };
      },
    );

    // Spend remaining funds on category-specific coverage in priority order.
    
// Distribute remaining money using priority-weighted
// round-robin coverage instead of exhausting one category.

const priorityWeight: Record<string, number> = {
  critical: 3,
  high: 2,
  medium: 1,
};

const maxAllocationSteps = families * allocations.length;

for (
  let step = 0;
  step < maxAllocationSteps && remainingCents > 0;
  step++
) {
  const candidates = allocations
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      const cost = item.unitCostCents;

      return (
        cost !== null &&
        cost > 0 &&
        cost <= remainingCents &&
        (item.recommendedFamilies ?? 0) < families
      );
    })
    .sort((a, b) => {
      const aCoverage =
        (a.item.recommendedFamilies ?? 0) /
        families /
        (priorityWeight[a.item.priority] ?? 1);

      const bCoverage =
        (b.item.recommendedFamilies ?? 0) /
        families /
        (priorityWeight[b.item.priority] ?? 1);

      // Prefer the category with the lowest
      // priority-adjusted coverage.
      if (Math.abs(aCoverage - bCoverage) > 0.000001) {
        return aCoverage - bCoverage;
      }

      // When coverage is equal, protect higher priorities.
      const priorityDifference =
        (PRIORITY_RANK[a.item.priority] ?? 9) -
        (PRIORITY_RANK[b.item.priority] ?? 9);

      return priorityDifference || a.index - b.index;
    });

  const candidate = candidates[0];

  // No remaining product can fit within the budget.
  if (!candidate) break;

  const current = allocations[candidate.index];
  const unitCost = current.unitCostCents;

  if (unitCost === null) continue;

  const additionalSubtotalCents = unitCost;

  const currentSubtotalCents = Math.round(
    (current.estimatedSubtotal ?? 0) * 100,
  );

  allocations[candidate.index] = {
    ...current,

    recommendedFamilies:
      (current.recommendedFamilies ?? 0) + 1,

    estimatedSubtotal: toMoney(
      currentSubtotalCents + additionalSubtotalCents,
    ),
  };

  remainingCents -= additionalSubtotalCents;
}

    const recommendedTotalCents = allocations.reduce(
      (sum, item) =>
        sum +
        Math.round((item.estimatedSubtotal ?? 0) * 100),
      0,
    );

    const unallocatedBudgetCents = Math.max(
      0,
      budgetCents - recommendedTotalCents,
    );

    const coverageNote = allCategoriesPriced
      ? completeKitFamilies === families
        ? `The current offer assumptions support complete modeled kits for all ${families} families within the target budget. Review pack sizes and suitability before approval.`
        : `${completeKitFamilies} complete modeled family kits fit the target budget. Remaining funds are allocated to additional priority-category coverage where affordable. Category coverage counts are not additional complete kits.`
      : "A complete-kit count cannot be verified because one or more categories have no suitable priced offer. Review the missing categories before approving procurement.";

    const priorityCoverage = allocations
      .map((item) =>
        item.recommendedFamilies === null
          ? `${item.category}: price unavailable`
          : `${item.category}: ${item.recommendedFamilies}/${families} families`,
      )
      .join("; ");

    
    const pricedCategoryNames = allocations
      .filter((item) => item.unitCostCents !== null)
      .map((item) => item.category);

    const missingCategoryNames = allocations
      .filter((item) => item.unitCostCents === null)
      .map((item) => item.category);

    const verifiedSummary =
      `Channel3 returned suitable priced products for ` +
      `${pricedCategoryNames.length} of ${allocations.length} ` +
      `required categories: ` +
      `${pricedCategoryNames.join(", ") || "none"}.`;

    const verifiedBudgetNote =
      missingCategoryNames.length > 0
        ? `Suitable priced offers were not found for: ${missingCategoryNames.join(", ")}. These categories remain unallocated and must be reviewed before procurement approval.`
        : `All required categories have suitable priced offers. Review product pack sizes, quantities and retailer conditions before approval.`;

      return NextResponse.json({
      summary:  verifiedSummary,

      budgetNote: verifiedBudgetNote,

      budget,
      originalPlanningBudget,
      families,
      mode,
      currency: "USD",

      // Cost to fulfil every requested family.
      estimatedTotal:
        estimatedTotalCents === null
          ? null
          : toMoney(estimatedTotalCents),

      // Actual recommended allocation, constrained to the target.
      recommendedTotal: toMoney(recommendedTotalCents),
      completeKitFamilies,
      unallocatedBudget: toMoney(unallocatedBudgetCents),
      coverageNote,
      priorityCoverage,

      categoriesWithPrices: allocations.filter(
        (item) => item.unitCostCents !== null,
      ).length,

      items: allocations,

    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not generate the procurement plan.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
