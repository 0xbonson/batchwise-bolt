type LogoProps = {
  size?: number;
  withWordmark?: boolean;
};

export function Logo({ size = 32, withWordmark = false }: LogoProps) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        role="img"
        aria-label="Batchwise logo: a muffin tray with one filled cavity"
      >
        <rect
          x="3"
          y="7"
          width="26"
          height="18"
          rx="4"
          fill="var(--slip)"
          stroke="var(--ink)"
          strokeWidth="2"
        />
        <g fill="var(--ink)">
          <circle cx="9" cy="13" r="2.6" />
          <circle cx="16" cy="13" r="2.6" />
          <circle cx="23" cy="13" r="2.6" />
          <circle cx="9" cy="19" r="2.6" />
          <circle cx="16" cy="19" r="2.6" />
          <circle cx="23" cy="19" r="2.6" />
        </g>
        <circle cx="9" cy="13" r="2.6" fill="var(--crust)" />
      </svg>
      {withWordmark && (
        <span className="font-display text-2xl leading-none tracking-tight lowercase">
          batchwise
        </span>
      )}
    </span>
  );
}
