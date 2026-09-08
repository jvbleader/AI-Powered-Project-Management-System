import {
  buildDefaultAvatarUrl,
  isGeneratedDefaultAvatarUrl,
  resolveAvatarUrl,
} from "@/lib/utils/avatar";

describe("avatar identity mapping", () => {
  test("uses userId as the canonical seed even when browser data differs", () => {
    const fromDirectory = buildDefaultAvatarUrl({
      userId: "usr-42",
      email: "person@example.com",
      name: "Nguyễn Văn A",
    });
    const fromTaskPreview = buildDefaultAvatarUrl({
      userId: 42,
      email: null,
      name: "Tên preview có thể cũ",
    });

    expect(fromTaskPreview).toBe(fromDirectory);
  });

  test("normalizes numeric and prefixed user IDs to the same avatar", () => {
    expect(buildDefaultAvatarUrl(42)).toBe(buildDefaultAvatarUrl("usr-42"));
    expect(buildDefaultAvatarUrl("42")).toBe(buildDefaultAvatarUrl("usr-42"));
    expect(buildDefaultAvatarUrl({ userId: "  USR-42  " })).toBe(
      buildDefaultAvatarUrl("usr-42"),
    );
  });

  test("keeps a real uploaded avatar URL", () => {
    const uploaded = "https://storage.example.com/avatars/user-42.png";
    expect(
      resolveAvatarUrl({
        userId: "usr-42",
        email: "person@example.com",
        name: "Nguyễn Văn A",
        avatarUrl: `  ${uploaded}  `,
      }),
    ).toBe(uploaded);
  });

  test("migrates a generated URL cached by an older browser", () => {
    const legacyBrowserAvatar = "https://i.pravatar.cc/150?img=69";
    const identity = {
      userId: "usr-42",
      email: "person@example.com",
      name: "Nguyễn Văn A",
    };

    expect(isGeneratedDefaultAvatarUrl(legacyBrowserAvatar)).toBe(true);
    expect(resolveAvatarUrl({ ...identity, avatarUrl: legacyBrowserAvatar })).toBe(
      buildDefaultAvatarUrl(identity),
    );
  });

  test("falls back to normalized email only when no user ID exists", () => {
    expect(buildDefaultAvatarUrl({ email: " Person@Example.com " })).toBe(
      buildDefaultAvatarUrl({ email: "person@example.com" }),
    );
  });
});
