import type { ReactNode } from "react";

/**
 * Line-art stone/cut shapes for İmalat preview (Blue Nile–style picker).
 * Codes align with ADR-0044 izinli_kesimler / kesim_kod.
 */

export type ShapeCode = string;

const LABEL: Record<string, string> = {
  ROUND: "Yuvarlak",
  PRINCESS: "Prenses",
  CUSHION: "Cushion",
  EMERALD: "Zümrüt",
  PEAR: "Armut",
  OVAL: "Oval",
  RADIANT: "Radiant",
  ASSCHER: "Asscher",
  MARQUISE: "Markiz",
  HEART: "Kalp",
  CABOCHON: "Cabochon",
  BEAD: "Boncuk",
  HAM: "Ham",
};

export function shapeLabel(kod: string): string {
  const k = kod.trim().toUpperCase();
  return LABEL[k] ?? k;
}

type IconProps = {
  className?: string;
  title?: string;
};

function Frame({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {children}
      </g>
    </svg>
  );
}

export function ShapeIcon({
  kod,
  className,
  title,
}: {
  kod: string;
  className?: string;
  title?: string;
}) {
  const k = kod.trim().toUpperCase();
  const t = title ?? shapeLabel(k);
  switch (k) {
    case "ROUND":
      return (
        <Frame className={className} title={t}>
          <circle cx="20" cy="20" r="11" />
          <circle cx="20" cy="20" r="4.5" opacity="0.35" />
        </Frame>
      );
    case "PRINCESS":
      return (
        <Frame className={className} title={t}>
          <rect x="10" y="10" width="20" height="20" />
          <path d="M20 10 L20 30 M10 20 L30 20" opacity="0.35" />
        </Frame>
      );
    case "CUSHION":
      return (
        <Frame className={className} title={t}>
          <rect x="10" y="10" width="20" height="20" rx="5" />
        </Frame>
      );
    case "EMERALD":
      return (
        <Frame className={className} title={t}>
          <path d="M13 11 H27 L31 15 V25 L27 29 H13 L9 25 V15 Z" />
          <path d="M14 15 H26 V25 H14 Z" opacity="0.35" />
        </Frame>
      );
    case "PEAR":
      return (
        <Frame className={className} title={t}>
          <path d="M20 7 C27 12 30 18 30 24 C30 30 25.5 33 20 33 C14.5 33 10 30 10 24 C10 18 13 12 20 7 Z" />
        </Frame>
      );
    case "OVAL":
      return (
        <Frame className={className} title={t}>
          <ellipse cx="20" cy="20" rx="9" ry="13" />
        </Frame>
      );
    case "RADIANT":
      return (
        <Frame className={className} title={t}>
          <path d="M14 10 H26 L31 15 V25 L26 30 H14 L9 25 V15 Z" />
        </Frame>
      );
    case "ASSCHER":
      return (
        <Frame className={className} title={t}>
          <path d="M14 10 H26 L30 14 V26 L26 30 H14 L10 26 V14 Z" />
          <rect x="15" y="15" width="10" height="10" opacity="0.35" />
        </Frame>
      );
    case "MARQUISE":
      return (
        <Frame className={className} title={t}>
          <path d="M20 6 C28 14 28 26 20 34 C12 26 12 14 20 6 Z" />
        </Frame>
      );
    case "HEART":
      return (
        <Frame className={className} title={t}>
          <path d="M20 32 C12 26 8 20 8 15 C8 11 11 8 15 8 C17.5 8 19.2 9.2 20 11 C20.8 9.2 22.5 8 25 8 C29 8 32 11 32 15 C32 20 28 26 20 32 Z" />
        </Frame>
      );
    case "CABOCHON":
      return (
        <Frame className={className} title={t}>
          <ellipse cx="20" cy="22" rx="11" ry="8" />
          <path d="M9 20 Q20 10 31 20" opacity="0.45" />
        </Frame>
      );
    case "BEAD":
      return (
        <Frame className={className} title={t}>
          <circle cx="20" cy="20" r="9" />
          <circle cx="20" cy="20" r="2" fill="currentColor" stroke="none" />
        </Frame>
      );
    default:
      return (
        <Frame className={className} title={t}>
          <polygon points="20,8 30,20 20,32 10,20" />
        </Frame>
      );
  }
}

/** Simple ring / montür silhouette for preview stage. */
export function MonturRingIcon({ className, title }: IconProps) {
  return (
    <svg
      viewBox="0 0 120 140"
      className={className}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      >
        {/* band */}
        <ellipse cx="60" cy="108" rx="34" ry="14" />
        <path d="M26 108 V78 C26 62 42 52 60 52 C78 52 94 62 94 78 V108" />
        {/* head / prongs */}
        <path d="M48 54 L44 28 M72 54 L76 28 M60 50 L60 22" />
        <path d="M44 28 L60 18 L76 28" opacity="0.55" />
      </g>
    </svg>
  );
}

/** Map carat → relative scale for preview stone (visual only). */
export function caratPreviewScale(carat: number): number {
  const c = Math.max(0.25, Math.min(carat, 5));
  // ~0.55 at 0.5ct → ~1.35 at 2.5ct
  return 0.4 + Math.sqrt(c) * 0.55;
}

/** Suggest preview carat chips inside montür range. */
export function previewCaratOptions(
  min: number | null,
  max: number | null
): number[] {
  const base = [0.5, 1, 1.5, 2, 2.5, 3];
  if (min == null || max == null) return base;
  const filtered = base.filter((c) => c >= min - 1e-9 && c <= max + 1e-9);
  if (filtered.length >= 2) return filtered;
  const mid = Number(((min + max) / 2).toFixed(2));
  return Array.from(new Set([min, mid, max])).sort((a, b) => a - b);
}
