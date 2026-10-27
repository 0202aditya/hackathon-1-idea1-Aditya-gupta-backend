// Backend/app/api/trips/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { errorResponse, ApiError } from "@/lib/errors";
import { getOptionalUser } from "@/lib/auth";
import { memoryTrips } from "../route";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      throw new ApiError("VALIDATION", "Trip ID parameter is required.", 400);
    }

    // Check memory store
    const inMemory = memoryTrips.get(id);
    if (inMemory) {
      return NextResponse.json({
        trip: inMemory.trip,
        offers: inMemory.offers,
      });
    }

    // Otherwise check Supabase
    const { supabase } = await getOptionalUser(req);
    const { data: tripRow, error: tripErr } = await supabase
      .from("trips")
      .select("input")
      .eq("id", id)
      .single();

    if (tripErr || !tripRow) {
      throw new ApiError("NOT_FOUND", `Trip with ID ${id} not found.`, 404);
    }

    const { data: resultRow } = await supabase
      .from("trip_results")
      .select("offers, savings, ai_plan")
      .eq("trip_id", id)
      .single();

    return NextResponse.json({
      trip: tripRow.input,
      offers: resultRow?.offers || [],
      savings: resultRow?.savings || undefined,
      aiPlan: resultRow?.ai_plan || undefined,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

