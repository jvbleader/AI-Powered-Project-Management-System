import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, hasAuthCookies } from "@/services/auth/cookies";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";
const DEFAULT_INTERNAL_API_BASE_URL = "http://backend:8000";

async function requestServerAuth(path: string, method: "GET" | "POST", cookieHeader: string) {
  const apiBaseUrl =
    process.env.API_BASE_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

  return fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      Cookie: cookieHeader,
    },
    cache: "no-store",
  });
}

export async function hasValidServerSession() {
  const cookieStore = await cookies();
  const internalApiBaseUrl = process.env.API_BASE_URL_INTERNAL ?? DEFAULT_INTERNAL_API_BASE_URL;

  if (!hasAuthCookies(cookieStore)) {
    return false;
  }

  const cookieHeader = cookieStore.toString();

  try {
    if (cookieStore.get(ACCESS_COOKIE_NAME)?.value) {
      const meResponse = await requestServerAuth("/me", "GET", cookieHeader);

      if (meResponse.ok) {
        return true;
      }
    }

    if (!cookieStore.get(REFRESH_COOKIE_NAME)?.value) {
      return false;
    }

    const refreshResponse = await fetch(`${internalApiBaseUrl}/refresh`, {
      method: "GET",
      headers: {
        Cookie: cookieHeader,
      },
      cache: "no-store",
    });

    return refreshResponse.ok;
  } catch {
    return false;
  }
}

export async function requireServerSession() {
  if (!(await hasValidServerSession())) {
    redirect("/login");
  }
}
