import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  BUILD_DEFAULTS,
  BUILD_FEATURES,
  BUILD_OPTIONS,
  buildAvatarUrl,
  buildSelectionFromUrl,
  writeCustomAvatar,
  type BuildFeature,
  type BuildOption,
  type BuildSelection,
} from "@/lib/avatars";

type Props = {
  onSelect: (url: string) => void;
  onClose: () => void;
  /** The currently selected avatar, used to pre-fill the sliders. */
  initialUrl?: string;
};

type SliderProps = {
  label: string;
  options: BuildOption[];
  value: string | null;
  onChange: (value: string | null) => void;
};

/** Shows one feature at a time, with arrows to step through its options. The
 * live preview reflects the current selection, so each row is just the
 * feature's category name and its previous/next arrows. */
function BuildSlider({ label, options, value, onChange }: SliderProps) {
  const found = options.findIndex((option) => option.value === value);
  const index = found < 0 ? 0 : found;

  const step = (direction: 1 | -1) => {
    const next = (index + direction + options.length) % options.length;
    onChange(options[next]!.value);
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label={`Previous ${label}`}
        className="grid size-4.5 shrink-0 place-items-center rounded-full text-ivory/70 ring-1 ring-gold/20 transition-colors hover:bg-gold/10 hover:text-ivory"
      >
        <ChevronLeft className="size-2.5" />
      </button>

      <p className="min-w-0 flex-1 truncate text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-ivory/70">
        {label}
      </p>

      <button
        type="button"
        onClick={() => step(1)}
        aria-label={`Next ${label}`}
        className="grid size-4.5 shrink-0 place-items-center rounded-full text-ivory/70 ring-1 ring-gold/20 transition-colors hover:bg-gold/10 hover:text-ivory"
      >
        <ChevronRight className="size-2.5" />
      </button>
    </div>
  );
}

/**
 * The "Build" tab of the portrait picker. A large live preview sits on the
 * left; the right holds two columns of slider widgets for hat, hairstyle,
 * hair colour, facial hair, skin colour, eyes, mouth, glasses, top style,
 * and clothes colour. Saving persists the result as the
 * player's avatar.
 */
export function BuildAvatarPanel({ onSelect, onClose, initialUrl }: Props) {
  const [selection, setSelection] = useState<BuildSelection>(() =>
    initialUrl ? buildSelectionFromUrl(initialUrl) : { ...BUILD_DEFAULTS },
  );

  const previewUrl = useMemo(() => buildAvatarUrl(selection), [selection]);

  const setFeature = (feature: BuildFeature, value: string | null) =>
    setSelection((prev) => ({ ...prev, [feature]: value }));

  const save = () => {
    writeCustomAvatar(previewUrl);
    onSelect(previewUrl);
    onClose();
  };

  return (
    <div className="avatar-scroll flex max-h-[65vh] flex-col gap-5 overflow-y-auto overscroll-contain pr-1 sm:max-h-none sm:flex-row sm:items-start">
      <div className="flex shrink-0 flex-col items-center gap-3 self-center sm:self-auto">
        <div className="grid size-40 place-items-center overflow-hidden rounded-full bg-gold/20 ring-2 ring-gold/40">
          <img
            src={previewUrl}
            alt="Your built avatar"
            width={160}
            height={160}
            className="size-full object-cover"
          />
        </div>
        <button
          type="button"
          onClick={save}
          className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-brand transition-colors hover:bg-gold-bright"
        >
          Use this avatar
        </button>
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-1 gap-x-3.5 gap-y-2 sm:grid-cols-2">
        {BUILD_FEATURES.map(({ feature, label }) => (
          <BuildSlider
            key={feature}
            label={label}
            options={BUILD_OPTIONS[feature]}
            value={selection[feature]}
            onChange={(value) => setFeature(feature, value)}
          />
        ))}
      </div>
    </div>
  );
}
