import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type SpeechBubbleTail = "down-left" | "down-right" | "up-left" | "up-center";

const CORNER = 18;
const TAIL_LEN = 9;
const TAIL_W = 16;
const TAIL_OFFSET = 26;
// How far each tail shoulder's control point extends horizontally. Matching it
// to the tail length rounds the shoulders so the tail reads as one smooth
// teardrop flowing out of the body, never a separate triangle glued on.
const SHOULDER = 8;

/**
 * Builds a single SVG path for a rounded speech bubble with a smooth tail.
 * The body and tail are a single continuous, tangent-continuous outline (all
 * cubic béziers) — there is no second square/diamond/triangle element, so the
 * cloud and its tail are literally one shape.
 */
function buildPath(w: number, h: number, tail: SpeechBubbleTail): string {
  const r = CORNER;
  const tl = TAIL_LEN;
  const sh = SHOULDER;
  const down = tail === "down-left" || tail === "down-right";
  const bodyTop = down ? 0 : tl;
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
    // Clockwise from the top-left, with the tail bulging out of the bottom edge.
    d.push(`M ${r} ${bodyTop}`);
    d.push(`H ${w - r}`);
    d.push(`Q ${w} ${bodyTop} ${w} ${bodyTop + r}`);
    d.push(`V ${bodyBot - r}`);
    d.push(`Q ${w} ${bodyBot} ${w - r} ${bodyBot}`);
    d.push(`H ${x2}`);
    // Right shoulder -> tip -> left shoulder, each shoulder keeping a horizontal
    // tangent so it blends into the bottom edge without a hard corner.
    d.push(`C ${x2 - sh} ${bodyBot} ${x2} ${bodyBot + tl} ${cx} ${bodyBot + tl}`);
    d.push(`C ${x1} ${bodyBot + tl} ${x1 + sh} ${bodyBot} ${x1} ${bodyBot}`);
    d.push(`H ${r}`);
    d.push(`Q 0 ${bodyBot} 0 ${bodyBot - r}`);
    d.push(`V ${bodyTop + r}`);
    d.push(`Q 0 ${bodyTop} ${r} ${bodyTop}`);
  } else {
    // Clockwise from the left shoulder, tail bulging out of the top edge.
    d.push(`M ${x1} ${bodyTop}`);
    d.push(`C ${x1 + sh} ${bodyTop} ${x1} 0 ${cx} 0`);
    d.push(`C ${x2} 0 ${x2 - sh} ${bodyTop} ${x2} ${bodyTop}`);
    d.push(`H ${w - r}`);
    d.push(`Q ${w} ${bodyTop} ${w} ${bodyTop + r}`);
    d.push(`V ${bodyBot - r}`);
    d.push(`Q ${w} ${bodyBot} ${w - r} ${bodyBot}`);
    d.push(`H ${r}`);
    d.push(`Q 0 ${bodyBot} 0 ${bodyBot - r}`);
    d.push(`V ${bodyTop + r}`);
    d.push(`Q 0 ${bodyTop} ${r} ${bodyTop}`);
  }

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
