type SoftwareLogoProps = {
  className?: string;
  subtitle?: string;
  title?: string;
};

export function SoftwareLogo({
  className,
  subtitle,
  title = "AI-Powered Project Management System",
}: SoftwareLogoProps) {
  return (
    <div className={["software-logo", className].filter(Boolean).join(" ")}>
      <span className="software-logo-mark" aria-hidden="true">
        <svg viewBox="0 0 72 72" role="presentation">
          <defs>
            <linearGradient id="aipm-logo-gradient" x1="10%" y1="8%" x2="92%" y2="94%">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="55%" stopColor="#1d4ed8" />
              <stop offset="100%" stopColor="#0891b2" />
            </linearGradient>
            <radialGradient id="aipm-logo-glow" cx="50%" cy="50%" r="70%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.92)" />
              <stop offset="100%" stopColor="rgba(191,219,254,0.92)" />
            </radialGradient>
          </defs>

          <rect x="6" y="6" width="60" height="60" rx="18" fill="url(#aipm-logo-gradient)" />
          <path
            d="M23 49 36 22l13 27"
            fill="none"
            stroke="#eff6ff"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="5.5"
          />
          <path
            d="M28.5 38h15"
            fill="none"
            stroke="#dbeafe"
            strokeLinecap="round"
            strokeWidth="5"
          />
          <circle cx="51" cy="22" r="5.5" fill="url(#aipm-logo-glow)" />
          <path
            d="m46.5 28 4.5-6"
            fill="none"
            stroke="#dbeafe"
            strokeLinecap="round"
            strokeWidth="2.4"
          />
          <path
            d="M19 14c7.2-4.2 17.1-4 24.1.5"
            fill="none"
            opacity="0.42"
            stroke="#dbeafe"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
      </span>

      <div className="software-logo-copy">
        <strong>{title}</strong>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
  );
}
