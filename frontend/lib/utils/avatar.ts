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
  window.localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(nextMap));
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
