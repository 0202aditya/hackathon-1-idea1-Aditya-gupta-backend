// Backend/app/api/wallet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { errorResponse, ApiError } from "@/lib/errors";
import { getOptionalUser } from "@/lib/auth";
import { CARDS_CATALOG } from "@/lib/cards-catalog";
import { UserCard } from "@/lib/api-types";

// In-memory fallback wallet storage per session/user
export const memoryWallets = new Map<string, Map<string, UserCard>>();

export function getSessionWallet(key: string): Map<string, UserCard> {
  if (!memoryWallets.has(key)) {
    memoryWallets.set(key, new Map());
  }
  return memoryWallets.get(key)!;
}

export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await getOptionalUser(req);

    if (user) {
      // Query from Supabase user_cards
      const { data, error } = await supabase
        .from("user_cards")
        .select("card_id, points_balance, monthly_spend_minor, cards(*)")
        .eq("user_id", user.id);

      if (error) {
        console.error("Supabase user_cards select error:", error);
      } else if (data) {
        const userCards: UserCard[] = data.map((row: any) => {
          const cardInfo =
            row.cards ||
            CARDS_CATALOG.find((c) => c.id === row.card_id) || {
              id: row.card_id,
              name: row.card_id,
              issuer: "Unknown",
            };
          return {
            cardId: row.card_id,
            card: {
              id: cardInfo.id,
              name: cardInfo.name,
              issuer: cardInfo.issuer,
              network: cardInfo.network,
              annualFeeMinor: cardInfo.annual_fee_minor,
              ratesVerifiedAt: cardInfo.rates_verified_at,
            },
            pointsBalance: Number(row.points_balance) || 0,
            monthlySpendMinor: row.monthly_spend_minor || {},
          };
        });
        return NextResponse.json(userCards);
      }
    }

    // Guest / fallback memory wallet keyed by IP or session
    const guestKey = user?.id || req.headers.get("x-forwarded-for") || "guest";
    const wallet = getSessionWallet(guestKey);
    return NextResponse.json(Array.from(wallet.values()));
  } catch (error) {
    return errorResponse(error);
  }
}
