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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      throw new ApiError("VALIDATION", "Trip ID parameter is required.", 400);
    }

    // 1. Delete from in-memory fallback
    memoryTrips.delete(id);

    // 2. If authenticated user, delete from Supabase trips table
    // (Foreign key on delete cascade will automatically delete row from trip_results)
    const { user, supabase } = await getOptionalUser(req);
    if (user) {
      const { error } = await supabase
        .from("trips")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        console.error("Failed to delete trip from Supabase:", error);
        throw new ApiError("UPSTREAM_ERROR", `Failed to delete trip: ${error.message}`, 500);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

