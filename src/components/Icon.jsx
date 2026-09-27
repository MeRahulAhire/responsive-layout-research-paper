// Small hand-tuned 1.6px stroke icon set (no icon-font dependency).
const PATHS = {
  "arrow-up-right": "M7 17 17 7M8 7h9v9",
  "arrow-down": "M12 5v14M6 13l6 6 6-6",
  "arrow-up": "M12 19V5M6 11l6-6 6 6",
  copy: "M9 9h10v10H9zM5 15V5h10",
  check: "M5 12.5 10 17 19 7",
  table: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14",
  chart: "M4 19h16M6 15l4-5 3 3 5-7",
  code: "M9 8l-4 4 4 4M15 8l4 4-4 4",
  sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  system: "M4 5h16v11H4zM9 20h6M12 16v4",
  menu: "M4 7h16M4 12h16M4 17h10",
  close: "M6 6l12 12M18 6 6 18",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  file: "M7 3h7l5 5v13H7zM14 3v5h5",
  github: "M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6.2 0C6.6 2.8 5.6 3.1 5.6 3.1a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.2 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
  quote: "M7 7h4v4c0 3-2 5-4 6M14 7h4v4c0 3-2 5-4 6",
  chevron: "M9 6l6 6-6 6",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
};

export function Icon({ name, size = 16, className = "", title }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}
