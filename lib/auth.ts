// Backend/lib/auth.ts
import { NextRequest } from "next/server";
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { ENV } from "@/lib/env";
import { ApiError } from "@/lib/errors";

export function createScopedClient(accessToken?: string): SupabaseClient {
  return createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}

export async function getOptionalUser(
  req: NextRequest
): Promise<{ user: User | null; supabase: SupabaseClient; token?: string }> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;

  if (!token) {
    return { user: null, supabase: createScopedClient(), token: undefined };
  }

  const supabase = createScopedClient(token);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { user: null, supabase: createScopedClient(), token: undefined };
  }

  return { user, supabase, token };
}

export async function requireUser(
  req: NextRequest
): Promise<{ user: User; supabase: SupabaseClient; token: string }> {
  const { user, supabase, token } = await getOptionalUser(req);
  if (!user || !token) {
    throw new ApiError("UNAUTHORIZED", "Valid Bearer token is required.", 401);
  }
  return { user, supabase, token };
}

