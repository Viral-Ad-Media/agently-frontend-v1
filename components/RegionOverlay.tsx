import React from "react";
import type { MediaRegion } from "../types";

/**
 * A customer photo with the areas the assistant pointed at drawn over it.
 * The image keeps its own aspect ratio (no cropping) so the boxes, which are
 * fractions of the image, land where the model put them. These are
 * approximate highlights from a vision model, not measured outlines.
 */

const TONE = ["border-emerald-400", "border-emerald-400", "border-amber-400", "border-amber-400", "border-rose-500", "border-rose-500"];
const TONE_BG = ["bg-emerald-500", "bg-emerald-500", "bg-amber-500", "bg-amber-500", "bg-rose-600", "bg-rose-600"];

interface Props {
  src: string;
  alt: string;
  regions?: MediaRegion[];
  className?: string;
}

const RegionOverlay: React.FC<Props> = ({ src, alt, regions = [], className = "" }) => (
  <div className={`relative inline-block w-full ${className}`}>
    <img src={src} alt={alt} className="block h-auto w-full" loading="lazy" />
    {regions.map((r, i) => {
      const sev = Math.min(5, Math.max(0, Math.round(r.severity ?? 2)));
      const [x, y, w, h] = r.box;
      return (
        <div
          key={i}
          data-testid="media-region"
          className={`pointer-events-none absolute rounded-md border-2 ${TONE[sev]}`}
          style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }}
        >
          <span
            className={`absolute left-0 top-0 max-w-full -translate-y-full truncate rounded-t px-1.5 py-0.5 text-[10px] font-bold text-white ${TONE_BG[sev]}`}
          >
            {r.label}
          </span>
        </div>
      );
    })}
  </div>
);

export default RegionOverlay;
