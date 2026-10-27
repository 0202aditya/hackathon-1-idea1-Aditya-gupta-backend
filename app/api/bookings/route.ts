// Backend/app/api/bookings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { getOptionalUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await getOptionalUser(req);

    if (!user) {
      return NextResponse.json([]);
    }

    const { data, error } = await supabase
      .from("bookings")
      .select("*, trips(input)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch bookings from Supabase:", error);
      return NextResponse.json([]);
    }

    return NextResponse.json(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}
