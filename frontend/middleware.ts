/**
 * Next.js Middleware — Token Refresh Gateway
 *
 * Runs on EVERY request to a protected route BEFORE SSR (layout.tsx).
 * Responsibilities:
 *   1. Decode JWT locally (no backend round-trip) to check expiry.
 *   2. If access token is still valid → let the request pass through.
 *   3. If access token is expired/missing → call /refresh on the backend.
 *   4. If refresh succeeds → forward the new Set-Cookie headers to the browser
 *      so SSR and client-side both receive the fresh token.
 *   5. If refresh fails → redirect to /unauthorized (truly unauthenticated).
 *
 * This solves the "signout while using the app" bug where:
 *  - SSR called /refresh but didn't forward the new cookie to the browser
 *  - Client then tried to refresh again causing a race / double-refresh
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_INTERNAL_URL =
  process.env.API_BASE_URL_INTERNAL ??
  `http://backend:${process.env.NEXT_PUBLIC_API_PORT ?? "8000"}`;

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";

// Buffer in seconds before actual expiry when we proactively refresh.
// 5s is enough to prevent race conditions without rendering short-lived tokens useless.
const EXPIRY_BUFFER_SECONDS = 5;

/**
 * Decode JWT payload without verifying signature.
 * Used only to check the `exp` field locally — signature is verified by backend.
 */
function decodeJwtExpiry(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const paddedPayload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(paddedPayload);
    const payload = JSON.parse(decoded) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/** Returns true if the access token is present and has NOT expired (with buffer). */
function isAccessTokenValid(token: string | undefined): boolean {
  if (!token) return false;
  const exp = decodeJwtExpiry(token);
  if (exp === null) return false;
  return Date.now() / 1000 < exp - EXPIRY_BUFFER_SECONDS;
}

function buildCookieHeader(accessToken?: string, refreshToken?: string): string {
  return [
    accessToken ? `${ACCESS_COOKIE}=${accessToken}` : null,
    refreshToken ? `${REFRESH_COOKIE}=${refreshToken}` : null,
  ]
    .filter(Boolean)
    .join("; ");
}

/** Call /refresh on backend and return the raw Response (or null on failure). */
async function callRefresh(cookieHeader: string): Promise<Response | null> {
  try {
    const res = await fetch(`${BACKEND_INTERNAL_URL}/refresh`, {
      method: "GET",
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

/**
 * Parse backend Set-Cookie headers and apply them to the Next.js response.
 * This is the KEY fix: without this, the browser never received the new
 * access_token cookie that the backend issued during SSR refresh.
 */
function forwardSetCookies(backendResponse: Response, nextResponse: NextResponse): void {
  // getSetCookie() returns individual cookies correctly (handles commas in values)
  // Fallback for older runtimes: split on ", " between cookie entries
  type HeadersWithGetSetCookie = Headers & { getSetCookie?(): string[] };
  const rawHeaders = backendResponse.headers as HeadersWithGetSetCookie;

  const setCookieList: string[] =
    rawHeaders.getSetCookie?.() ??
    (backendResponse.headers.get("set-cookie") ?? "")
      .split(/,(?=\s*[a-zA-Z_]+=)/)
      .filter(Boolean);

  for (const raw of setCookieList) {
    const parts = raw.split(";").map((s) => s.trim());
    const [nameVal, ...attrs] = parts;
    const eqIdx = nameVal.indexOf("=");
    if (eqIdx === -1) continue;

    const name = nameVal.slice(0, eqIdx).trim();
    const value = nameVal.slice(eqIdx + 1).trim();

    let maxAge: number | undefined;
    let httpOnly = false;
    let secure = false;
    let path = "/";
    let sameSite: "lax" | "strict" | "none" = "lax";

    for (const attr of attrs) {
      const lower = attr.toLowerCase();
      if (lower === "httponly") httpOnly = true;
      else if (lower === "secure") secure = true;
      else if (lower.startsWith("max-age=")) maxAge = parseInt(lower.slice(8), 10);
      else if (lower.startsWith("path=")) path = attr.slice(5).trim();
      else if (lower.startsWith("samesite=")) {
        const ss = attr.slice(9).trim().toLowerCase();
        sameSite = ss === "strict" ? "strict" : ss === "none" ? "none" : "lax";
      }
    }

    nextResponse.cookies.set(name, value, { httpOnly, secure, maxAge, path, sameSite });
  }
}

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  // No auth cookies at all → unauthenticated, redirect immediately
  if (!accessToken && !refreshToken) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  // Access token still valid → pass through without any backend call
  if (isAccessTokenValid(accessToken)) {
    return NextResponse.next();
  }

  // Access token expired or missing → attempt refresh
  const cookieHeader = buildCookieHeader(accessToken, refreshToken);
  const refreshResult = await callRefresh(cookieHeader);

  if (!refreshResult) {
    // Refresh token also invalid/expired → truly unauthenticated
    // CRITICAL: We MUST delete the cookies here! Otherwise, the browser keeps
    // the stale cookies. Then if the user goes to /login, hasValidServerSession()
    // might falsely think they are logged in and redirect to /dashboard, creating
    // an infinite loop between /login -> /dashboard -> /unauthorized.
    const response = NextResponse.redirect(new URL("/unauthorized", request.url));
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
    return response;
  }


  // Refresh succeeded → forward the new cookie(s) to the browser
  // This ensures both SSR (layout.tsx) and client-side get the fresh token
  const response = NextResponse.next();
  forwardSetCookies(refreshResult, response);
  return response;
}

export const config = {
  // Apply to all protected routes. Exclude public pages, Next.js internals, and static assets.
  matcher: [
    "/(dashboard|profile|projects|tasks|team|departments|roles|logwork|logwork-approvals|ai-assistant)/:path*",
  ],
};
