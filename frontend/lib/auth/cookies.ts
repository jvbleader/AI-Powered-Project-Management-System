export const ACCESS_COOKIE_NAME = "access_token";
export const REFRESH_COOKIE_NAME = "refresh_token";

type CookieStoreLike = {
  get(name: string): { value?: string } | undefined;
};

export function hasAuthCookies(cookieStore: CookieStoreLike) {
  return Boolean(
    cookieStore.get(ACCESS_COOKIE_NAME)?.value ||
      cookieStore.get(REFRESH_COOKIE_NAME)?.value,
  );
}