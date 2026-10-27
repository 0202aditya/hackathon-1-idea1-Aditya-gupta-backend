// Backend/app/api/wallet/[cardId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { errorResponse, ApiError } from "@/lib/errors";
import { getOptionalUser } from "@/lib/auth";
import { CARDS_CATALOG, ensureCardsInDatabase } from "@/lib/cards-catalog";
import { UserCard } from "@/lib/api-types";
import { getSessionWallet } from "../route";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  try {
    const { cardId } = await params;
    if (!cardId) {
      throw new ApiError("VALIDATION", "cardId is required.", 400);
    }

    const body = await req.json().catch(() => ({}));
    const pointsBalance = Math.max(0, Number(body.pointsBalance) || 0);
    const monthlySpendMinor = body.monthlySpendMinor || {};

    const cardMeta =
      CARDS_CATALOG.find((c) => c.id === cardId) || {
        id: cardId,
        name: cardId,
        issuer: "Bank",
      };

    const userCard: UserCard = {
      cardId,
      card: cardMeta,
      pointsBalance,
      monthlySpendMinor,
    };

    const { user, supabase } = await getOptionalUser(req);

    if (user) {
      // Upsert into Supabase user_cards
      const { data, error } = await supabase
        .from("user_cards")
        .upsert(
          {
            user_id: user.id,
            card_id: cardId,
            points_balance: pointsBalance,
            monthly_spend_minor: monthlySpendMinor,
          },
          { onConflict: "user_id,card_id" }
        )
        .select();

      if (error) {
        console.error("Supabase user_cards upsert error:", error);
        throw new ApiError(
          "UPSTREAM_ERROR",
          `Database error saving wallet: ${error.message} (${error.details || ""})`,
          500
        );
      }
    } else {
      console.warn("Wallet PUT called without an authenticated user. Saved to session only.");
    }

    // Also update in-memory wallet
    const guestKey = user?.id || req.headers.get("x-forwarded-for") || "guest";
    const wallet = getSessionWallet(guestKey);
    wallet.set(cardId, userCard);

    return NextResponse.json(userCard);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  try {
    const { cardId } = await params;
    if (!cardId) {
      throw new ApiError("VALIDATION", "cardId is required.", 400);
    }

    const { user, supabase } = await getOptionalUser(req);

    if (user) {
      const { error } = await supabase
        .from("user_cards")
        .delete()
        .eq("user_id", user.id)
        .eq("card_id", cardId);

      if (error) {
        console.error("Supabase user_cards delete error:", error);
      }
    }

    const guestKey = user?.id || req.headers.get("x-forwarded-for") || "guest";
    const wallet = getSessionWallet(guestKey);
    wallet.delete(cardId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
