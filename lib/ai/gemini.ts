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
  if (currency === "EUR") return `€${formatted}`;
  if (currency === "INR") return `₹${Math.round(amount).toLocaleString("en-IN")}`;
  if (currency === "USD") return `$${formatted}`;
  return `${currency} ${formatted}`;
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

  const systemPrompt = `You are a credit card travel hacking strategist for Una Milla.
Your job is to recommend the single best credit card to use for a flight booking based on exact pre-calculated figures in ${currency}.

STRICT RULES:
1. ONLY recommend ONE single winning card for this trip: "${bestCardName}".
2. Do NOT invent or calculate numbers. Use ONLY the provided numbers:
   - Normal ticket price: ${normalFare}
   - Points currently held in wallet discount: ${heldPointsOffset}
   - Projected monthly spend points discount: ${spendPointsOffset} (accumulated over ${months} months)
   - Earn back rewards on flight payment: ${earnBack}
   - Final hacked price: ${hackedFare}
   - Total savings: ${totalSavings} (${savings.best.savingsPct}%)
3. ACCURACY: If points currently held is ${formatCurrency(0, currency)}, do NOT tell the user to redeem points they hold. Instead, if they have spend points, mention that points are accumulated from their upcoming monthly spending.
4. Keep the advice actionable, crisp, and direct.
5. Output MUST be valid JSON conforming to this schema:
{
  "headline": "A short 1-line catchy summary naming the best card",
  "summary": "2-sentence clear explanation of why this card won and how the user saves money",
  "steps": [
    { "type": "redeem|pay|earn|book|check", "title": "Step title", "detail": "Specific step details" }
  ],
  "warnings": ["1 or 2 relevant tips/warnings regarding caps or partner booking"]
}`;

  const userPrompt = `Flight Route: ${trip.legs.map((l) => `${l.from} -> ${l.to}`).join(", ")}
Cabin Class: ${trip.cabin}
Airlines: ${offer.slices.map((s) => s.carrier).join(", ")}
Normal Price: ${normalFare}
Calculated Hacked Price: ${hackedFare}
Winning Card Recommendation: ${bestCardName}
Points Currently Held Discount: ${heldPointsOffset}
Projected Monthly Spend Discount: ${spendPointsOffset} (${months} months until flight)
New Rewards Earn Back: ${earnBack}
Total Savings: ${totalSavings}

User Cards available:
${userCards.map((c) => `- ${c.card.name} (Held Points: ${c.pointsBalance.toLocaleString()})`).join("\n")}

Generate the JSON recommendation now.`;

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

