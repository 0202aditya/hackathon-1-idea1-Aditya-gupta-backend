// Backend/lib/duffel/mappers.ts
import { Cabin, FlightOffer } from "@/lib/api-types";

// Extracts standard 3-letter IATA code from airport/city input strings
export function extractIata(input: string): string {
  if (!input) return "";
  const cleaned = input.trim();
  // Check for (DEL) format
  const parenMatch = cleaned.match(/\(([A-Za-z]{3})\)/);
  if (parenMatch) return parenMatch[1].toUpperCase();

  // If directly 3 letters
  if (/^[A-Za-z]{3}$/.test(cleaned)) return cleaned.toUpperCase();

  // Known city fallbacks
  const lower = cleaned.toLowerCase();
  if (lower.includes("delhi")) return "DEL";
  if (lower.includes("mumbai") || lower.includes("bombay")) return "BOM";
  if (lower.includes("bangalore") || lower.includes("bengaluru")) return "BLR";
  if (lower.includes("dubai")) return "DXB";
  if (lower.includes("london") || lower.includes("heathrow")) return "LHR";
  if (lower.includes("goa")) return "GOI";
  if (lower.includes("hyderabad")) return "HYD";
  if (lower.includes("chennai") || lower.includes("madras")) return "MAA";
  if (lower.includes("kolkata") || lower.includes("calcutta")) return "CCU";
  if (lower.includes("singapore")) return "SIN";

  // Default to first 3 characters uppercase
  const first3 = cleaned.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
  return first3 || "DEL";
}

// Converts a decimal amount (e.g. "5420.50") to integer minor units (paise: 542050)
export function toMinorUnits(amount: string | number): number {
  const num = typeof amount === "number" ? amount : parseFloat(amount);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

export function mapDuffelOfferToFlightOffer(
  duffelOffer: any,
  cabin: Cabin
): FlightOffer {
  const slices = (duffelOffer.slices || []).map((slice: any) => {
    const origin =
      slice.origin?.iata_code ||
      slice.origin?.city_name ||
      slice.origin?.name ||
      "";
    const destination =
      slice.destination?.iata_code ||
      slice.destination?.city_name ||
      slice.destination?.name ||
      "";

    const segments = slice.segments || [];
    const firstSegment = segments[0] || {};
    const lastSegment = segments[segments.length - 1] || firstSegment;

    const carrier =
      firstSegment.operating_carrier?.name ||
      firstSegment.marketing_carrier?.name ||
      slice.airline?.name ||
      "Airline";

    const stops = Math.max(0, segments.length - 1);

    return {
      origin,
      destination,
      departingAt: firstSegment.departing_at || slice.departing_at || "",
      arrivingAt: lastSegment.arriving_at || slice.arriving_at || "",
      carrier,
      stops,
    };
  });

  const passengerIds = (duffelOffer.passengers || []).map((p: any) => p.id);

  return {
    offerId: duffelOffer.id,
    totalMinor: toMinorUnits(duffelOffer.total_amount),
    currency: duffelOffer.total_currency || "INR",
    cabin,
    slices,
    expiresAt: duffelOffer.expires_at || new Date(Date.now() + 3600000).toISOString(),
    passengerIds: passengerIds.length > 0 ? passengerIds : undefined,
  };
}

