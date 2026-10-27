// Backend/lib/env.ts

export const ENV = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  DUFFEL_ACCESS_TOKEN: process.env.DUFFEL_ACCESS_TOKEN || "",
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
};

export function validateEnv() {
  if (!ENV.DUFFEL_ACCESS_TOKEN) {
    throw new Error("Missing DUFFEL_ACCESS_TOKEN environment variable.");
  }
  if (!ENV.DUFFEL_ACCESS_TOKEN.startsWith("duffel_test_")) {
    throw new Error(
      "Duffel is test mode only: DUFFEL_ACCESS_TOKEN must start with duffel_test_."
    );
  }
}

