import { StatusPill } from "@/components/ui";
import { getRoleTone, roleDisplayLabels, splitSlashLabels } from "@/lib/utils/format";
import type { UserRole } from "@/types";
import styles from "./role-tags.module.css";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function RoleTags({
  roles,
  labels,
  className,
}: {
  roles?: UserRole | readonly UserRole[] | null;
  labels?: readonly string[];
  className?: string;
}) {
  const tags = (labels
    ? labels.flatMap(splitSlashLabels)
    : roleDisplayLabels(roles)
  ).filter((label, index, list) => list.indexOf(label) === index);

  if (tags.length === 0) {
    return null;
  }

  return (
    <div className={classNames(styles.stack, className)}>
      {tags.map((label) => (
        <StatusPill key={label} label={label} tone={getRoleTone(label)} />
      ))}
    </div>
  );
}
