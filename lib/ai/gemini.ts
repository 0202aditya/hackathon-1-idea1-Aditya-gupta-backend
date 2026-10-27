// Backend/lib/ai/gemini.ts
import { ENV } from "@/lib/env";
import { AiPlan, FlightOffer, SavingsResult, TripInput, UserCard } from "@/lib/api-types";
import { CARDS_CATALOG } from "@/lib/cards-catalog";

function formatCurrency(minor: number, currency: string = "EUR"): string {
  const amount = (minor || 0) / 100;
  const formatted = amount.toLocaleString("en-IE", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  if (currency === "USD") return `$${formatted}`;
  if (currency === "GBP") return `£${formatted}`;
  return `€${formatted}`;
}

export function generateTemplatePlan(
  savings: SavingsResult,
  trip: TripInput,
  userCards: UserCard[]
): AiPlan {
  const bestCardId = savings.best.payCardId || "your card";
  const bestCardName = CARDS_CATALOG.find((c) => c.id === bestCardId)?.name || bestCardId;
  const currency = savings.currency || "EUR";
  const normalFare = formatCurrency(savings.normalPriceMinor, currency);
  const hackedFare = formatCurrency(savings.best.hackedPriceMinor, currency);
  const totalSavings = formatCurrency(savings.best.savingsMinor, currency);
  const heldPointsMinor = savings.best.heldPointsOffsetMinor || 0;
  const spendPointsMinor = savings.best.spendPointsOffsetMinor || 0;
  const heldPointsOffset = formatCurrency(heldPointsMinor, currency);
  const spendPointsOffset = formatCurrency(spendPointsMinor, currency);
  const earnBack = formatCurrency(savings.best.earnBackMinor, currency);
  const months = savings.projection.monthsUntilDeparture || 0;

  const steps: AiPlan["steps"] = [];

  if (heldPointsMinor > 0) {
    const redeemCardName =
      CARDS_CATALOG.find((c) => c.id === savings.best.redeemCardId)?.name || "your card";
    steps.push({
      type: "redeem",
      title: `Redeem currently held points on ${redeemCardName}`,
      detail: `Apply held points to wipe ${heldPointsOffset} directly off your flight ticket.`,
    });
  }

  if (spendPointsMinor > 0) {
    const redeemCardName =
      CARDS_CATALOG.find((c) => c.id === savings.best.redeemCardId)?.name || "your card";
    steps.push({
      type: "redeem",
      title: `Redeem projected spend points`,
      detail: `Apply ${spendPointsOffset} in points accumulated from ${months} months of everyday card spending.`,
    });
  }

  steps.push({
    type: "pay",
    title: `Pay remaining fare with ${bestCardName}`,
    detail: `Use your ${bestCardName} to book the ticket. This card gives the highest airline multiplier for this flight.`,
  });

  if (savings.best.earnBackMinor > 0) {
    steps.push({
      type: "earn",
      title: "Earn new reward points on this booking",
      detail: `You will earn back approx. ${earnBack} in rewards on the cash portion you pay.`,
    });
  }

  steps.push({
    type: "check",
    title: "Final Hacked Fare",
    detail: `Your effective cost drops from ${normalFare} down to ${hackedFare}, saving ${totalSavings} (${savings.best.savingsPct}%).`,
  });

  return {
    headline: `Book with ${bestCardName} to pay ${hackedFare} instead of ${normalFare}`,
    summary: `Your best single card for this trip is ${bestCardName}. It maximises your travel rewards and saves you ${totalSavings}.`,
    steps,
    warnings: [
      "Ensure tickets are booked under the passenger's exact name as on government ID.",
      "Accelerated rewards require booking through direct airline or bank partner travel desks.",
    ],
    source: "template",
  };
}

export async function generateGeminiPlan(
  offer: FlightOffer,
  savings: SavingsResult,
  trip: TripInput,
  userCards: UserCard[]
): Promise<AiPlan> {
  const fallback = generateTemplatePlan(savings, trip, userCards);

  if (!ENV.GEMINI_API_KEY) {
    return fallback;
  }

  const bestCardName =
    CARDS_CATALOG.find((c) => c.id === savings.best.payCardId)?.name || savings.best.payCardId;
  const currency = savings.currency || "EUR";
  const normalFare = formatCurrency(savings.normalPriceMinor, currency);
  const hackedFare = formatCurrency(savings.best.hackedPriceMinor, currency);
  const totalSavings = formatCurrency(savings.best.savingsMinor, currency);
  const heldPointsMinor = savings.best.heldPointsOffsetMinor || 0;
  const spendPointsMinor = savings.best.spendPointsOffsetMinor || 0;
  const heldPointsOffset = formatCurrency(heldPointsMinor, currency);
  const spendPointsOffset = formatCurrency(spendPointsMinor, currency);
  const earnBack = formatCurrency(savings.best.earnBackMinor, currency);
  const months = savings.projection.monthsUntilDeparture || 0;

  // Format runner-up card alternatives for comparison
  const alternatives = (savings.alternatives || []).slice(0, 2).map((alt) => {
    const cardName = CARDS_CATALOG.find((c) => c.id === alt.payCardId)?.name || alt.payCardId;
    return `- ${cardName}: saves ${formatCurrency(alt.savingsMinor, currency)} (Hacked Fare: ${formatCurrency(alt.hackedPriceMinor, currency)})`;
  });

  const systemPrompt = `You are the Lead Travel Hacking & Credit Card Optimization Strategist for Una Milla — an elite travel finance platform.
You provide sophisticated, data-driven, and highly actionable advice to travelers seeking to maximize airline rewards and minimize flight costs.

YOUR MISSION:
Analyze the flight details, user's credit card portfolio, and pre-calculated figures to deliver a polished, high-conviction, and structured recommendation for the single best card to use.

CRITICAL FINANCIAL ACCURACY RULES:
1. ONLY recommend the designated winning card: "${bestCardName}".
2. Use ONLY the exact figures provided below — NEVER compute, invent, or alter figures:
   - Base Ticket Price: ${normalFare}
   - Points Currently Held in Wallet Discount: ${heldPointsOffset}
   - Projected Monthly Spend Points Discount: ${spendPointsOffset} (accumulated across ${months} months)
   - Rewards Earn Back on Remaining Fare: ${earnBack}
   - Final Hacked Price: ${hackedFare}
   - Total Net Savings: ${totalSavings} (${savings.best.savingsPct}% off)
3. HELD POINTS INTEGRITY: If Points Currently Held is ${formatCurrency(0, currency)}, do NOT instruct the user to redeem points they already hold. Instead, highlight their spending plan to accumulate projected points before departure.
4. SPEND PLAN INTEGRITY: If Projected Monthly Spend Discount is greater than ${formatCurrency(0, currency)}, provide concrete advice on channeling daily and recurring expenses onto "${bestCardName}" over the next ${months} months.
5. CARD COMPARISON: Contrast the winning card with the user's other cards, explaining specifically why "${bestCardName}" won (e.g. superior airline reward multipliers, higher earn-back rates).

OUTPUT FORMAT:
Respond with strictly valid JSON matching this schema:
{
  "headline": "A bold, compelling 1-line hook with the card name, route, and hacked price",
  "summary": "A punchy, expert 2-to-3 sentence executive breakdown: why this card beats alternatives, the total savings achieved, and the key driver (spend accumulation vs payment multiplier).",
  "steps": [
    {
      "type": "book | redeem | pay | earn | check",
      "title": "Actionable, precise step title",
      "detail": "Clear step-by-step instruction mentioning specific portals (e.g. SmartBuy or airline desk), spend categories, exact amounts, and timing."
    }
  ],
  "warnings": [
    "Insider travel hacking pro-tips, including booking portal recommendations, reward capping awareness, transfer partner options, or name-matching requirements."
  ]
}`;

  const userPrompt = `=== TRIP DETAILS ===
Route: ${trip.legs.map((l) => `${l.from} -> ${l.to}`).join(", ")}
Travel Date: ${trip.legs[0]?.date || "Immediate"} (${months > 0 ? `${months} months from today` : "Immediate departure"})
Airline(s): ${offer.slices.map((s) => s.carrier).join(", ")}
Cabin Class: ${trip.cabin}
Passengers: ${trip.passengers || 1}

=== PRE-CALCULATED FIGURES ===
Base Ticket Price: ${normalFare}
Points Held Today Discount: ${heldPointsOffset}
Projected Points from Monthly Spend: ${spendPointsOffset} (${months} months until flight)
Payment Rewards Earn-Back: ${earnBack}
Calculated Hacked Price: ${hackedFare}
Total Net Savings: ${totalSavings} (${savings.best.savingsPct}% off)

=== USER WALLET PORTFOLIO ===
${userCards.map((c) => `- ${c.card.name} (${c.card.issuer}): ${c.pointsBalance.toLocaleString()} points held`).join("\n")}

=== RUNNER-UP ALTERNATIVES EVALUATED ===
${alternatives.length > 0 ? alternatives.join("\n") : "No alternative cards in wallet"}

Generate the ultimate travel hacking recommendation now in JSON format.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${ENV.GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn("Gemini API call failed, using template plan:", res.status, res.statusText, errBody);
      return fallback;
    }

    const json = await res.json();
    const candidateText = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      return fallback;
    }

    const parsed = JSON.parse(candidateText);
    return {
      headline: parsed.headline || fallback.headline,
      summary: parsed.summary || fallback.summary,
      steps: Array.isArray(parsed.steps) && parsed.steps.length > 0 ? parsed.steps : fallback.steps,
      warnings: Array.isArray(parsed.warnings) && parsed.warnings.length > 0 ? parsed.warnings : fallback.warnings,
      source: "ai",
    };
  } catch (err) {
    console.error("Gemini plan generation error:", err);
    return fallback;
  }
}

