// Backend/proxy.ts
import { NextRequest, NextResponse } from "next/server";

export async function proxy(req: NextRequest) {
  // Only apply to /api/* routes
  if (!req.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const origin = req.headers.get("origin") || "*";

  // Preflight
  if (req.method === "OPTIONS") {
    const preflightHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };
    return new NextResponse(null, { status: 204, headers: preflightHeaders });
  }

  const res = NextResponse.next();
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  return res;
}

export const config = {
  matcher: "/api/:path*",
};
