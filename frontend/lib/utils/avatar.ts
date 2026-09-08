const AVATAR_STORAGE_KEY = "flowpilot-user-avatars";
const DEFAULT_AVATAR_VARIANTS = 70;
const GENERATED_AVATAR_HOST = "i.pravatar.cc";

type AvatarMap = Record<string, string>;
export type AvatarIdentity = {
  userId?: string | number | null;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
};

function readAvatarMap(): AvatarMap {
  if (typeof window === "undefined") {
    return {};
  }

  const stored = window.localStorage.getItem(AVATAR_STORAGE_KEY);

  if (!stored) {
    return {};
  }

  try {
    return JSON.parse(stored) as AvatarMap;
  } catch {
    return {};
  }
}

function writeAvatarMap(nextMap: AvatarMap) {
  try {
    window.localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(nextMap));
  } catch (error) {
    if (error instanceof Error && error.name === "QuotaExceededError") {
      window.localStorage.clear();
      window.sessionStorage.clear();
      // Try again after clearing
      try {
        window.localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(nextMap));
      } catch {}
    }
  }
}

export function readStoredAvatar(userId: string) {
  return readAvatarMap()[userId] ?? null;
}

function normalizeUserId(userId?: string | number | null) {
  if (typeof userId === "number") {
    return `usr-${userId}`;
  }

  if (typeof userId === "string" && userId.trim()) {
    const trimmedUserId = userId.trim().toLowerCase();
    return trimmedUserId.startsWith("usr-") ? trimmedUserId : `usr-${trimmedUserId}`;
  }

  return null;
}

function normalizeStandaloneSeed(identity: string | number) {
  if (typeof identity === "number") {
    return normalizeUserId(identity) as string;
  }

  const trimmedIdentity = identity.trim().toLowerCase();
  return /^(?:usr-)?\d+$/.test(trimmedIdentity)
    ? (normalizeUserId(trimmedIdentity) as string)
    : trimmedIdentity;
}

function hashAvatarSeed(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/**
 * Older clients persisted generated pravatar URLs as if users had uploaded
 * them. Treat those URLs as fallbacks so old per-browser session snapshots can
 * be remapped from the canonical user ID.
 */
export function isGeneratedDefaultAvatarUrl(avatarUrl?: string | null) {
  if (!avatarUrl?.trim()) {
    return false;
  }

  try {
    const url = new URL(avatarUrl);
    return url.hostname === GENERATED_AVATAR_HOST && url.searchParams.has("img");
  } catch {
    return false;
  }
}

export function buildDefaultAvatarUrl(identity?: Omit<AvatarIdentity, "avatarUrl"> | string | number | null) {
  const seed =
    typeof identity === "string" || typeof identity === "number"
      ? normalizeStandaloneSeed(identity)
      : normalizeUserId(identity?.userId) ||
        identity?.email?.trim().toLowerCase() ||
        identity?.name?.trim().replace(/\s+/g, " ").toLowerCase() ||
        "flowpilot-demo";

  const variant = (hashAvatarSeed(seed) % DEFAULT_AVATAR_VARIANTS) + 1;
  return `https://i.pravatar.cc/150?img=${variant}`;
}

export function resolveAvatarUrl(identity: AvatarIdentity) {
  const explicitAvatar = identity.avatarUrl?.trim();
  if (explicitAvatar && !isGeneratedDefaultAvatarUrl(explicitAvatar)) {
    return explicitAvatar;
  }

  return buildDefaultAvatarUrl(identity);
}

export function storeUserAvatar(userId: string, avatarUrl: string) {
  const currentMap = readAvatarMap();
  writeAvatarMap({
    ...currentMap,
    [userId]: avatarUrl,
  });
}

export function removeUserAvatar(userId: string) {
  const currentMap = readAvatarMap();

  if (!(userId in currentMap)) {
    return;
  }

  const nextMap = { ...currentMap };
  delete nextMap[userId];
  writeAvatarMap(nextMap);
}
