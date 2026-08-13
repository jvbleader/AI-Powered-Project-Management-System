"use client";

import { UserAvatar } from "@/components/user-avatar";
import { formatAssigneeNames } from "@/lib/utils/format";

type AssigneeLike = {
  id?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
};

export function AssigneeAvatars({
  assignees,
  size = 28,
  max = 3,
  emptyLabel = "Chưa phân công",
}: {
  assignees?: Array<AssigneeLike | null | undefined> | null;
  size?: number;
  max?: number;
  emptyLabel?: string;
}) {
  const people = (assignees ?? []).filter((person): person is AssigneeLike & { id: string; name: string } =>
    Boolean(person?.id && person?.name),
  );

  if (!people.length) {
    return (
      <div
        title={emptyLabel}
        style={{
          width: size,
          height: size,
          borderRadius: "999px",
          background: "var(--surface-muted)",
          color: "var(--muted)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: Math.max(10, size * 0.42),
          fontWeight: 700,
        }}
      >
        ?
      </div>
    );
  }

  const visible = people.slice(0, max);
  const extra = people.length - visible.length;
  const title = formatAssigneeNames({ assignees: people });

  return (
    <div title={title} style={{ display: "inline-flex", alignItems: "center" }}>
      {visible.map((person, index) => (
        <span
          key={person.id}
          style={{
            marginLeft: index === 0 ? 0 : -8,
            borderRadius: "999px",
            boxShadow: "0 0 0 2px #fff",
            zIndex: visible.length - index,
          }}
        >
          <UserAvatar
            userId={person.id}
            email={person.email}
            name={person.name}
            avatarUrl={person.avatarUrl}
            size={size}
          />
        </span>
      ))}
      {extra > 0 ? (
        <span
          style={{
            marginLeft: -8,
            minWidth: size,
            height: size,
            borderRadius: "999px",
            background: "#e2e8f0",
            color: "#334155",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: Math.max(10, size * 0.38),
            fontWeight: 700,
            boxShadow: "0 0 0 2px #fff",
            padding: "0 6px",
          }}
        >
          +{extra}
        </span>
      ) : null}
    </div>
  );
}
