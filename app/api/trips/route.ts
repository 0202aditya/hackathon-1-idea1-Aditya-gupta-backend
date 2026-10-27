// Backend/app/api/trips/route.ts
import { NextRequest, NextResponse } from "next/server";
import { errorResponse, ApiError } from "@/lib/errors";
import { getOptionalUser } from "@/lib/auth";
import { createOfferRequest } from "@/lib/duffel/client";
import { FlightOffer, TripInput } from "@/lib/api-types";
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
  { trip: TripInput; offers: FlightOffer[]; createdAt: number }
>();

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

