// Inline icon set (Feather-style strokes, 24×24). No external icon package needed.

const P = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
      <path d="M8 14h2M14 14h2M8 17.5h2M14 17.5h2" />
    </>
  ),
  folder: <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />,
  file: (
    <>
      <path d="M14 2.5H6.5A2.5 2.5 0 0 0 4 5v14a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 19V8.5z" />
      <path d="M14 2.5V9h6M8 13h8M8 17h5.5" />
    </>
  ),
  layers: (
    <>
      <path d="m12 2.8 9.2 4.6-9.2 4.6L2.8 7.4z" />
      <path d="m2.8 12 9.2 4.6 9.2-4.6M2.8 16.6 12 21.2l9.2-4.6" />
    </>
  ),
  message: <path d="M20.6 11.6a8.4 8.4 0 0 1-9.1 8.3 9 9 0 0 1-3.6-.8L3 21l1.9-4.7a8.4 8.4 0 1 1 15.7-4.7z" />,
  bell: (
    <>
      <path d="M18 8.4a6 6 0 1 0-12 0c0 6.6-3 6.6-3 8.6h18c0-2-3-2-3-8.6" />
      <path d="M10.2 20.6a2.1 2.1 0 0 0 3.6 0" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20.2a7.5 7.5 0 0 1 14.4 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.8 20a6.5 6.5 0 0 1 12.4 0" />
      <path d="M16 4.9a3.2 3.2 0 0 1 0 6.2M17.5 14.2a6.5 6.5 0 0 1 3.7 5.8" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.08A1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="6" rx="1" />
      <rect x="12" y="8" width="3" height="10" rx="1" />
      <rect x="17" y="5" width="3" height="13" rx="1" />
    </>
  ),
  activity: <path d="M3 12h4l2.5-7 5 14 2.5-7h4" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.4 9a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.2-2.6 4" />
      <path d="M12 17.2h.01" />
    </>
  ),
  logout: (
    <>
      <path d="M9.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4.5" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </>
  ),
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
  check: <path d="m4.5 12.5 5 5 10-11" />,
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5M12 3v12" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5M12 15V3" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  zoomIn: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6M8 11h6M11 8v6" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6M8 11h6" />
    </>
  ),
  expand: <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />,
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6M19 6l-1 14.5a2 2 0 0 1-2 1.5H8a2 2 0 0 1-2-1.5L5 6" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.3l3.3 2" />
    </>
  ),
  pin: (
    <>
      <path d="M20.5 10.2c0 6.3-8.5 11.8-8.5 11.8s-8.5-5.5-8.5-11.8a8.5 8.5 0 0 1 17 0z" />
      <circle cx="12" cy="10" r="2.8" />
    </>
  ),
  phone: <path d="M21 16.9v2.6a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.1 3.7 2 2 0 0 1 3.1 1.5h2.6a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L6.8 9.3a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7a2 2 0 0 1 1.7 2z" />,
  mail: (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
      <path d="m3 6 9 7 9-7" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2.5 4.5 5.5v6c0 5 3.2 8.2 7.5 9.9 4.3-1.7 7.5-4.9 7.5-9.9v-6z" />
      <path d="m8.8 11.8 2.2 2.2 4.3-4.5" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.4 2.4 17a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.4a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4.3M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5h.01" />
    </>
  ),
  briefcase: (
    <>
      <rect x="2.5" y="7" width="19" height="13.5" rx="2" />
      <path d="M8.5 7V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2M2.5 12.5h19" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h4" />
    </>
  ),
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowLeft: <path d="M19 12H5M11 18l-6-6 6-6" />,
  printer: (
    <>
      <path d="M6.5 9V3h11v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M6.5 17h11v4h-11zM17.5 12.5h.01" />
    </>
  ),
  refresh: <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" />,
  lock: (
    <>
      <rect x="4" y="10.5" width="16" height="10.5" rx="2.2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5M12 15v2.5" />
    </>
  ),
  external: <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />,
  home: <path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4.5v-6h-5v6H5a2 2 0 0 1-2-2z" />,
  more: (
    <>
      <circle cx="12" cy="5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="19" r="1.4" />
    </>
  ),
  send: <path d="m22 2-7 20-4-9-9-4zM22 2 11 13" />,
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  key: (
    <>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m11 12 9-9M16.5 6.5 19 9M14 9l2 2" />
    </>
  ),
  archive: (
    <>
      <rect x="2.5" y="4" width="19" height="5" rx="1.5" />
      <path d="M4.5 9v9.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V9M10 13h4" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2.2" />
      <circle cx="8.5" cy="8.5" r="1.6" />
      <path d="m21 15-5-5L5 21" />
    </>
  ),
  ruler: (
    <>
      <path d="M3.5 15.5 15.5 3.5a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L8.5 20.5a2 2 0 0 1-2.8 0l-2.2-2.2a2 2 0 0 1 0-2.8z" />
      <path d="M7 12l2 2M10 9l2 2M13 6l2 2" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.6 8.4-2.2 5-5 2.2 2.2-5z" />
    </>
  ),
  filter: <path d="M4 5h16l-6.5 7.5V20l-3 1v-8.5z" />,
  calendarPlus: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.2" />
      <path d="M8 3v4M16 3v4M3 10h18M12 13.5v6M9 16.5h6" />
    </>
  ),
  userCheck: (
    <>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.8 20a6.4 6.4 0 0 1 12.4 0M16.5 11.5l2 2 3.5-4" />
    </>
  ),
  map: (
    <>
      <path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6z" />
      <path d="M9 3v15M15 6v15" />
    </>
  ),
};

export function Icon({ name, size = 20, className = '', strokeWidth = 1.8, ...rest }) {
  const content = P[name];
  if (!content) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ? `icon ${className}` : 'icon'}
      {...rest}
    >
      {content}
    </svg>
  );
}

export function LogoMark({ size = 34 }) {
  return (
    <span className="logo__mark" style={{ width: size, height: size, borderRadius: Math.round(size / 3.6) }}>
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="m16 8-2.6 5.4L8 16l2.6-5.4z" fill="#fff" stroke="none" />
        <path d="M12 1.5v2M12 20.5v2M1.5 12h2M20.5 12h2" />
      </svg>
    </span>
  );
}

export const iconNames = Object.keys(P);
