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

  if (icon === "building") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 21V5l8-3 8 3v16H4Zm2-2h3v-3H6Zm5 0h3v-3h-3Zm5 0h3v-3h-3ZM6 13h3V10H6Zm5 0h3V10h-3Zm5 0h3V10h-3ZM6 8h3V5.7L6 6.8Zm5 0h3V5h-3Zm5 0h3V6.8L15 5.7Z" />
      </svg>
    );
  }

  if (icon === "badge") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2 8 6H4v4l-2 4 2 4v4h4l4 4 4-4h4v-4l2-4-2-4V6h-4L12 2Zm0 5.2A4.8 4.8 0 1 1 7.2 12 4.8 4.8 0 0 1 12 7.2Zm-2.1 3.3 1.5 1.5 3.4-3.4 1.1 1.1-4.5 4.5-2.6-2.6 1.1-1.1Z" />
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

  if (icon === "check-circle") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4.59-12.42L10 14.17l-2.59-2.58L6 13l4 4 8-8z"/>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
    </svg>
  );
}
