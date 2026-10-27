import { NextRequest, NextResponse } from "next/server";
import { ENV } from "@/lib/env";

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const origin = req.headers.get("origin") || "*";
  const allowedOrigin = ENV.FRONTEND_ORIGIN || "*";

  // Preflight
  if (req.method === "OPTIONS") {
    const preflightHeaders = {
      "Access-Control-Allow-Origin": origin || allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };
    return new NextResponse(null, { status: 204, headers: preflightHeaders });
  }

  const res = NextResponse.next();
  res.headers.set("Access-Control-Allow-Origin", origin || allowedOrigin);
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  return res;
}

export const config = {
  matcher: "/api/:path*",
};
