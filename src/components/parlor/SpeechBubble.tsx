import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type SpeechBubbleTail = "down-left" | "down-right" | "up-left" | "up-center";

const CORNER = 16;
const TAIL_LEN = 8;
const TAIL_W = 14;
const TAIL_OFFSET = 26;

/**
 * Builds a single SVG path for a rounded speech bubble with a pointed tail.
 * The body and tail are drawn as one continuous outline so there is no seam
 * or separate square/diamond element.
 */
function buildPath(w: number, h: number, tail: SpeechBubbleTail): string {
  const r = CORNER;
  const down = tail === "down-left" || tail === "down-right";
  const bodyTop = down ? 0 : TAIL_LEN;
  const bodyBot = bodyTop + h;

  const cx = down
    ? tail === "down-left"
      ? TAIL_OFFSET
      : w - TAIL_OFFSET
    : tail === "up-center"
      ? w / 2
      : TAIL_OFFSET;
  const x1 = cx - TAIL_W / 2;
  const x2 = cx + TAIL_W / 2;

  const d: string[] = [];

  if (down) {
    d.push(`M ${r} ${bodyTop}`);
  } else {
    d.push(`M ${x1} ${bodyTop}`, `L ${cx} 0`, `L ${x2} ${bodyTop}`);
  }

  // Top edge -> top-right corner -> right side -> bottom-right corner.
  d.push(`H ${w - r}`);
  d.push(`Q ${w} ${bodyTop} ${w} ${bodyTop + r}`);
  d.push(`V ${bodyBot - r}`);
  d.push(`Q ${w} ${bodyBot} ${w - r} ${bodyBot}`);

  // Tail (only for down-pointing bubbles).
  if (down) {
    d.push(`H ${x2}`, `L ${cx} ${bodyBot + TAIL_LEN}`, `L ${x1} ${bodyBot}`);
  }

  // Bottom edge -> bottom-left corner -> left side -> top-left corner.
  d.push(`H ${r}`);
  d.push(`Q 0 ${bodyBot} 0 ${bodyBot - r}`);
  d.push(`V ${bodyTop + r}`);
  d.push(`Q 0 ${bodyTop} ${r} ${bodyTop}`);
  d.push("Z");

  return d.join(" ");
}

export function SpeechBubble({
  text,
  tail = "down-left",
  className,
  textClassName = "font-medium",
}: {
  text: string;
  tail?: SpeechBubbleTail;
  className?: string;
  textClassName?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const down = tail === "down-left" || tail === "down-right";
  const { w, h } = size;

  return (
    <div className={cn("relative w-max", down ? "pb-2" : "pt-2", className)}>
      {w > 0 && (
        <svg
          aria-hidden
          className="absolute left-0 top-0 drop-shadow-lg"
          width={w}
          height={h + TAIL_LEN}
          viewBox={`0 0 ${w} ${h + TAIL_LEN}`}
        >
          <path
            d={buildPath(w, h, tail)}
            fill="var(--cream)"
            stroke="var(--gold)"
            strokeOpacity={0.3}
            strokeWidth={1}
          />
        </svg>
      )}
      <span
        ref={ref}
        className={cn(
          "relative z-10 inline-block max-w-[16rem] whitespace-normal px-3 py-1.5 text-sm text-brand",
          textClassName,
        )}
      >
        {text}
      </span>
    </div>
  );
}
