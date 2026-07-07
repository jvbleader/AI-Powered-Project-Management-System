export function NavIcon({ icon }: { icon: string }) {
  if (icon === "layers") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4 4 8l8 4 8-4-8-4Z" />
        <path d="m4 12 8 4 8-4" />
        <path d="m4 16 8 4 8-4" />
      </svg>
    );
  }

  if (icon === "bolt") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13 2 5 14h5l-1 8 8-12h-5l1-8Z" />
      </svg>
    );
  }

  if (icon === "kanban") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h4v10H5zM10 4h4v6h-4zM15 4h4v14h-4z" />
      </svg>
    );
  }

  if (icon === "clock") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 10.4 3.1 1.8-.8 1.4L11 13V7h2Z" />
      </svg>
    );
  }

  if (icon === "users") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-6 1.8-6 4v2h12v-2c0-2.2-2.7-4-6-4Zm8-2a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-1.1 0-2.2.3-3.1.8 1.3 1 2.1 2.3 2.1 3.8v1.4H22V18c0-2-2.2-5-5-5Z" />
      </svg>
    );
  }

  if (icon === "spark") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 2 2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
    </svg>
  );
}
