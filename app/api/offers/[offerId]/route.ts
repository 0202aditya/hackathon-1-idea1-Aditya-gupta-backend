// Backend/app/api/offers/[offerId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { errorResponse, ApiError } from "@/lib/errors";
import { fetchFreshOffer } from "@/lib/duffel/client";
import { Cabin } from "@/lib/api-types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  try {
    const { offerId } = await params;
    if (!offerId) {
      throw new ApiError("VALIDATION", "Offer ID is required.", 400);
    }

    const { searchParams } = new URL(req.url);
    const cabin = (searchParams.get("cabin") as Cabin) || "economy";

    const freshOffer = await fetchFreshOffer(offerId, cabin);
    return NextResponse.json(freshOffer);
  } catch (error) {
    return errorResponse(error);
  }
}

