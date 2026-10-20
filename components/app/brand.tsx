import Image from "next/image";

import { cn } from "@/lib/utils";

import logo from "@/public/images/wupcare-logo.png";
import logoName from "@/public/images/wupcare-logoname.png";

// Official WUPCare artwork (public/images, never edited). Both PNGs carry
// transparent padding (about 13% on the icon; 8% sides / 18% top-bottom on
// the full logo) plus a few stray edge pixels. The frames below show only the
// measured artwork box, with a small margin, by sizing and offsetting the
// untouched image inside an overflow-hidden box. Percentages come from the
// pixel bounding boxes of the 1254×1254 and 2172×724 sources.

// Icon: artwork box ~ (163,169)-(1090,1077); shown as a 948px square at (152,149).
const ICON_FRAME = { width: "132.28%", left: "-16.03%", top: "-15.72%" } as const;

// Full logo: artwork box ~ (169,133)-(2000,595); shown as 1852×483 at (159,123).
const NAME_FRAME = { width: "117.28%", left: "-8.59%", top: "-25.47%" } as const;

/** Square WUPCare icon. Decorative by default; pass `label` when it stands alone. */
export function BrandMark({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={cn("relative inline-block size-7 shrink-0 self-center overflow-hidden", className)}>
      <Image
        src={logo}
        alt={label ?? ""}
        sizes="64px"
        className="absolute h-auto max-w-none"
        style={ICON_FRAME}
      />
    </span>
  );
}

/**
 * Full WUPCare logo with the name and university. Replaces the old icon plus
 * text pair, so no extra wordmark is needed beside it. Set the height with a
 * `h-*` class; the width follows the artwork's aspect ratio.
 */
export function Brand({
  className,
  label = "WUPCare, Wesleyan University-Philippines",
  preload = false,
  sizes = "240px",
}: {
  className?: string;
  label?: string;
  preload?: boolean;
  sizes?: string;
}) {
  return (
    <span className={cn("relative block aspect-[1852/483] h-10 w-auto shrink-0 self-start justify-self-start overflow-hidden", className)}>
      <Image
        src={logoName}
        alt={label}
        sizes={sizes}
        preload={preload}
        className="absolute h-auto max-w-none"
        style={NAME_FRAME}
      />
    </span>
  );
}
