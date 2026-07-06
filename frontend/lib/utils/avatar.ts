const AVATAR_STORAGE_KEY = "flowpilot-user-avatars";

type AvatarMap = Record<string, string>;

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
      try { window.localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(nextMap)); } catch {}
    }
  }
}

export function readStoredAvatar(userId: string) {
  return readAvatarMap()[userId] ?? null;
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
