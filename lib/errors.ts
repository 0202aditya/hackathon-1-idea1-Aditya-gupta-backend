// Backend/lib/errors.ts
import { NextResponse } from "next/server";

export type ErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION"
  | "NOT_FOUND"
  | "NO_OFFERS"
  | "OFFER_EXPIRED"
  | "PRICE_CHANGED"
  | "DUPLICATE_BOOKING"
  | "UPSTREAM_ERROR"
  | "RATE_LIMITED";

export class ApiError extends Error {
  code: ErrorCode;
  statusCode: number;
  fields?: Record<string, string>;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 400,
    fields?: Record<string, string>
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.fields = fields;
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
        },
      },
      { status: error.statusCode }
    );
  }

  const message = error instanceof Error ? error.message : "Internal Server Error";
  return NextResponse.json(
    {
      error: {
        code: "UPSTREAM_ERROR",
        message,
      },
    },
    { status: 500 }
  );
}

