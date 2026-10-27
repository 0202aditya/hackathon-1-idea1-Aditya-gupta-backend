// Backend/lib/duffel/client.ts
import { ENV, validateEnv } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { Cabin, FlightOffer, TripInput } from "@/lib/api-types";
import { extractIata, mapDuffelOfferToFlightOffer } from "./mappers";

const DUFFEL_BASE_URL = "https://api.duffel.com/air";

async function duffelFetch(path: string, options: RequestInit = {}) {
  validateEnv();

  const url = `${DUFFEL_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${ENV.DUFFEL_ACCESS_TOKEN}`,
      "Duffel-Version": "v2",
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorMsg =
      json?.errors?.[0]?.message ||
      json?.errors?.[0]?.title ||
      res.statusText ||
      "Duffel API request failed";
    throw new ApiError("UPSTREAM_ERROR", `Duffel error: ${errorMsg}`, res.status);
  }

  return json;
}

export async function createOfferRequest(input: TripInput): Promise<FlightOffer[]> {
  validateEnv();

  const slices = input.legs.map((leg) => {
    const origin = extractIata(leg.from);
    const destination = extractIata(leg.to);
    if (!origin || !destination) {
      throw new ApiError(
        "VALIDATION",
        `Invalid airport code for leg: ${leg.from} -> ${leg.to}`
      );
    }
    if (!leg.date) {
      throw new ApiError("VALIDATION", "Departure date is required for every leg.");
    }
    return {
      origin,
      destination,
      departure_date: leg.date,
    };
  });

  const passengerCount = Math.max(1, Math.min(3, input.passengers || 1));
  const passengers = Array.from({ length: passengerCount }, () => ({
    type: "adult",
  }));

  const payload = {
    data: {
      slices,
      passengers,
      cabin_class: input.cabin || "economy",
    },
  };

  const response = await duffelFetch("/offer_requests?return_offers=true", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const rawOffers: any[] = response.data?.offers || [];
  if (rawOffers.length === 0) {
    throw new ApiError(
      "NO_OFFERS",
      `No flight offers found for ${input.cabin} class on these dates. Try another travel class or date.`,
      404
    );
  }

  const mappedOffers = rawOffers.map((o) =>
    mapDuffelOfferToFlightOffer(o, input.cabin)
  );

  // Sort ascending by price
  mappedOffers.sort((a, b) => a.totalMinor - b.totalMinor);

  // Return top 10 cheapest
  return mappedOffers.slice(0, 10);
}

export async function fetchFreshOffer(
  offerId: string,
  cabin: Cabin = "economy"
): Promise<FlightOffer> {
  validateEnv();

  const response = await duffelFetch(`/offers/${offerId}?return_available_services=false`);
  const rawOffer = response.data;
  if (!rawOffer) {
    throw new ApiError("NOT_FOUND", "Flight offer not found or expired.", 404);
  }

  return mapDuffelOfferToFlightOffer(rawOffer, cabin);
}

