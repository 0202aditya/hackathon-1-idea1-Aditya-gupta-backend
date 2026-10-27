// Backend/app/api/trips/route.ts
import { NextRequest, NextResponse } from "next/server";
import { errorResponse, ApiError } from "@/lib/errors";
import { getOptionalUser } from "@/lib/auth";
import { createOfferRequest } from "@/lib/duffel/client";
import { FlightOffer, SearchedTrip, TripInput, UserCard } from "@/lib/api-types";
import { calculateCardSavings } from "@/lib/engine/savings";
import { generateTemplatePlan } from "@/lib/ai/gemini";
import { CARDS_CATALOG } from "@/lib/cards-catalog";
import { getSessionWallet } from "../wallet/route";
import { randomUUID } from "crypto";

// 10-minute in-memory search cache
type CacheEntry = {
  timestamp: number;
  offers: FlightOffer[];
};
const searchCache = new Map<string, CacheEntry>();

// In-memory fallback trip store (for fast testing & non-logged-in sessions)
export const memoryTrips = new Map<
  string,
  {
    trip: TripInput;
    offers: FlightOffer[];
    createdAt: number;
    savings?: any;
    aiPlan?: any;
  }
>();

export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await getOptionalUser(req);

    if (user) {
      // 1. Fetch user trips from Supabase joined with trip_results
      const { data: tripRows, error: tripErr } = await supabase
        .from("trips")
        .select(`
          id,
          kind,
          input,
          created_at,
          trip_results (
            offers,
            savings,
            ai_plan
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (tripErr) {
        console.error("Failed to fetch user trips from Supabase:", tripErr);
        throw new ApiError("UPSTREAM_ERROR", tripErr.message, 500);
      }

      // Fetch user wallet cards in case we need to calculate savings for trips that don't have it yet
      let userCards: UserCard[] = [];
      const { data: dbCards } = await supabase
        .from("user_cards")
        .select("card_id, points_balance, monthly_spend_minor, cards(*)")
        .eq("user_id", user.id);

      if (dbCards && dbCards.length > 0) {
        userCards = dbCards.map((row: any) => ({
          cardId: row.card_id,
          card:
            row.cards ||
            CARDS_CATALOG.find((c) => c.id === row.card_id) || {
              id: row.card_id,
              name: row.card_id,
              issuer: "Bank",
            },
          pointsBalance: Number(row.points_balance) || 0,
          monthlySpendMinor: row.monthly_spend_minor || {},
        }));
      }

      const searchedTrips: SearchedTrip[] = (tripRows || []).map((row: any) => {
        const results = Array.isArray(row.trip_results) ? row.trip_results[0] : row.trip_results;
        const offers: FlightOffer[] = results?.offers || [];
        const topOffer = offers[0];

        let savings = results?.savings;
        if (!savings && topOffer) {
          savings = calculateCardSavings(topOffer, userCards, row.input);
        }

        let aiPlan = results?.ai_plan;
        if (!aiPlan && savings && topOffer) {
          aiPlan = generateTemplatePlan(savings, row.input, userCards);
        }

        return {
          id: row.id,
          kind: row.kind || "quick",
          input: row.input,
          createdAt: row.created_at,
          offersCount: offers.length,
          topOffer,
          savings,
          aiPlan,
        };
      });

      return NextResponse.json(searchedTrips);
    }

    // Guest fallback from in-memory trips
    const guestKey = req.headers.get("x-forwarded-for") || "guest";
    const guestWallet = Array.from(getSessionWallet(guestKey).values());

    const searchedTrips: SearchedTrip[] = Array.from(memoryTrips.entries())
      .map(([id, item]) => {
        const topOffer = item.offers?.[0];
        let savings = item.savings;
        if (!savings && topOffer) {
          savings = calculateCardSavings(topOffer, guestWallet, item.trip);
        }

        let aiPlan = item.aiPlan;
        if (!aiPlan && savings && topOffer) {
          aiPlan = generateTemplatePlan(savings, item.trip, guestWallet);
        }

        return {
          id,
          kind: item.trip.kind || "quick",
          input: item.trip,
          createdAt: new Date(item.createdAt).toISOString(),
          offersCount: item.offers.length,
          topOffer,
          savings,
          aiPlan,
        };
      })
      .reverse();

    return NextResponse.json(searchedTrips);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TripInput;

    if (!body || !body.legs || !Array.isArray(body.legs) || body.legs.length === 0) {
      throw new ApiError(
        "VALIDATION",
        "TripInput requires at least 1 leg with origin, destination, and departure date.",
        400
      );
    }

    if (!body.cabin) {
      body.cabin = "economy";
    }

    // Cache key
    const cacheKey = JSON.stringify({
      legs: body.legs.map((l) => ({
        from: l.from.trim().toUpperCase(),
        to: l.to.trim().toUpperCase(),
        date: l.date,
      })),
      passengers: body.passengers || 1,
      cabin: body.cabin,
    });

    const now = Date.now();
    let offers: FlightOffer[];

    const cached = searchCache.get(cacheKey);
    if (cached && now - cached.timestamp < 10 * 60 * 1000) {
      offers = cached.offers;
    } else {
      offers = await createOfferRequest(body);
      searchCache.set(cacheKey, { timestamp: now, offers });
    }

    const { user, supabase } = await getOptionalUser(req);
    let tripId = randomUUID();

    if (user) {
      // Save to Supabase trips table
      const { data: tripRow, error: tripErr } = await supabase
        .from("trips")
        .insert({
          user_id: user.id,
          kind: body.kind || "quick",
          input: body,
        })
        .select("id")
        .single();

      if (!tripErr && tripRow) {
        tripId = tripRow.id;
        // Save to trip_results
        await supabase.from("trip_results").insert({
          trip_id: tripId,
          offers,
        });
      }
    }

    // Always store in memoryTrips so GET /api/trips/:id can quickly serve it
    memoryTrips.set(tripId, { trip: body, offers, createdAt: now });

    return NextResponse.json({
      tripId,
      offers,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

