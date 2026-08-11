"use client";

import Image from "next/image";
import type { CSSProperties } from "react";

import { resolveAvatarUrl } from "@/lib/utils/avatar";

type UserAvatarProps = {
  userId?: string | number | null;
  email?: string | null;
  name: string;
  avatarUrl?: string | null;
  size: number;
  title?: string;
  className?: string;
  imageClassName?: string;
  style?: CSSProperties;
};

export function UserAvatar({
  userId,
  email,
  name,
  avatarUrl,
  size,
  title,
  className = "avatar-token",
  imageClassName = "avatar-image",
  style,
}: UserAvatarProps) {
  const resolvedAvatarUrl = resolveAvatarUrl({
    userId,
    email,
    name,
    avatarUrl,
  });

  return (
    <span
      title={title ?? name}
      className={className}
      style={{
        width: size,
        height: size,
        overflow: "hidden",
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      <Image
        src={resolvedAvatarUrl}
        alt={name}
        width={size}
        height={size}
        className={imageClassName}
        unoptimized
      />
    </span>
  );
}
