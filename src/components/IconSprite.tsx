export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="i-sun" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
        </symbol>
        <symbol id="i-moon" viewBox="0 0 24 24">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </symbol>
        <symbol id="i-back" viewBox="0 0 24 24">
          <path d="m12 19-7-7 7-7M19 12H5" />
        </symbol>
        <symbol id="i-up" viewBox="0 0 24 24">
          <path d="m5 12 7-7 7 7M12 19V5" />
        </symbol>
        <symbol id="i-check" viewBox="0 0 24 24">
          <path d="M20 6 9 17l-5-5" />
        </symbol>
        <symbol id="i-x" viewBox="0 0 24 24">
          <path d="M18 6 6 18M6 6l12 12" />
        </symbol>
        <symbol id="i-play" viewBox="0 0 24 24">
          <path d="M6 3.5 20 12 6 20.5Z" />
        </symbol>
        <symbol id="i-pause" viewBox="0 0 24 24">
          <path d="M7 4v16M17 4v16" />
        </symbol>
        <symbol id="i-next" viewBox="0 0 24 24">
          <path d="M5 4.5 15 12 5 19.5ZM19 5v14" />
        </symbol>
        <symbol id="i-prev" viewBox="0 0 24 24">
          <path d="M19 4.5 9 12l10 7.5ZM5 5v14" />
        </symbol>
        <symbol id="i-chev" viewBox="0 0 24 24">
          <path d="m9 18 6-6-6-6" />
        </symbol>
        <symbol id="i-tup" viewBox="0 0 24 24">
          <path d="M22 7 13.5 15.5 8.5 10.5 2 17M16 7h6v6" />
        </symbol>
        <symbol id="i-tdown" viewBox="0 0 24 24">
          <path d="M22 17 13.5 8.5 8.5 13.5 2 7M16 17h6v-6" />
        </symbol>
        <symbol id="i-flat" viewBox="0 0 24 24">
          <path d="M4 12h16" />
        </symbol>
        <symbol id="i-chat" viewBox="0 0 24 24">
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </symbol>
        <symbol id="i-music" viewBox="0 0 24 24">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </symbol>
        <symbol id="i-cog" viewBox="0 0 24 24">
          <path d="M20 7h-9M14 17H5" />
          <circle cx="17" cy="17" r="3" />
          <circle cx="7" cy="7" r="3" />
        </symbol>
        <symbol id="i-import" viewBox="0 0 24 24">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </symbol>
        <symbol id="i-repeat" viewBox="0 0 24 24">
          <path d="m17 2 4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
        </symbol>
        <symbol id="i-plus" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </symbol>
        <symbol id="i-pulse" viewBox="0 0 24 24">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </symbol>
        <symbol id="i-menu" viewBox="0 0 24 24">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </symbol>
      </defs>
    </svg>
  );
}

export function Icon({
  name,
  size = 18,
  strokeWidth = 2.75,
  filled = false,
  className,
  style,
}: {
  name: string;
  size?: number;
  strokeWidth?: number;
  filled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      <use href={`#i-${name}`} />
    </svg>
  );
}
