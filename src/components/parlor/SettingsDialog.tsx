import { useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus, Rocket, Settings, ShieldOff, Upload, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { THEME_OPTIONS, readTheme, writeTheme, type ThemeId } from "@/lib/theme";
import { EFFECT_OPTIONS, readEffect, writeEffect, type EffectId } from "@/lib/effects";
import {
  PALETTE_CHANNELS,
  channelHex,
  readPalette,
  writePalette,
  type CustomPalette,
} from "@/lib/palette";
import { useBlockedUsers } from "@/lib/blockedUsers";
import { getNickname } from "@/lib/multiplayer";
import cardBackAsset from "@/assets/card-back.png";
import {
  allCardBacks,
  allCardFronts,
  CARD_DECK,
  readCardBack,
  readCardFront,
  readCustomBacks,
  readCustomDeck,
  readCustomFronts,
  writeCardBack,
  writeCardFront,
  writeCustomBacks,
  writeCustomDeck,
  writeCustomFronts,
  DEFAULT_CARD_BACK,
  DEFAULT_CARD_FRONT,
  type CardBackId,
  type CardBackOption,
  type CardFrontId,
  type CardFrontOption,
  type CardId,
  type CustomCard,
  type CustomDeck,
} from "@/lib/cards";

type Props = {
  className?: string;
};

/** A sample Ace of Hearts rendered in the chosen card-face colours (or the uploaded image). */
function CardFacePreview({ option }: { option: CardFrontOption }) {
  if (option.image) {
    return (
      <div
        aria-hidden
        className="relative h-40 w-28 select-none overflow-hidden rounded-lg border border-black/20 shadow-md shadow-black/40"
      >
        <img src={option.image} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }

  const { background, ink, red, border } = option.face ?? {
    background: "#ffffff",
    ink: "#1c1b22",
    red: "#c0392b",
    border: "rgba(0,0,0,0.15)",
  };
  const design = option.design ?? "classic";

  if (design !== "classic") {
    return (
      <div
        aria-hidden
        className="relative h-40 w-28 select-none overflow-hidden rounded-lg border shadow-md shadow-black/40"
        style={{ background, borderColor: border }}
      >
        {design === "flourish" && <FlourishFace ink={ink} red={red} border={border} />}
        {design === "geometric" && <GeometricFace ink={ink} red={red} border={border} />}
        {design === "royal" && <RoyalFace ink={ink} red={red} border={border} />}
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className="relative h-40 w-28 select-none overflow-hidden rounded-lg border shadow-md shadow-black/40"
      style={{ background, borderColor: border }}
    >
      <span
        className="absolute left-1.5 top-1 flex flex-col items-center font-display text-[15px] font-bold leading-none"
        style={{ color: red }}
      >
        A
        <span className="mt-0.5 text-[11px]">♥</span>
      </span>
      <span className="absolute inset-0 grid place-items-center text-3xl" style={{ color: red }}>
        ♥
      </span>
      <span className="absolute bottom-1 right-1.5 rotate-180 text-[11px]" style={{ color: ink }}>
        ♠
      </span>
    </div>
  );
}

type FaceInk = { ink: string; red: string; border: string };

/** Ornate card face: double frame, corner curls and a central medallion. */
function FlourishFace({ ink, red, border }: FaceInk) {
  return (
    <svg viewBox="0 0 100 140" className="h-full w-full" preserveAspectRatio="none">
      <rect x="4" y="4" width="92" height="132" fill="none" stroke={border} strokeWidth="1.5" />
      <rect x="8" y="8" width="84" height="124" fill="none" stroke={ink} strokeWidth="0.5" opacity="0.55" />
      <g stroke={red} strokeWidth="1.2" fill="none">
        <path d="M8 8 q7 0 7 7" />
        <path d="M92 8 q-7 0 -7 7" />
        <path d="M8 132 q7 0 7 -7" />
        <path d="M92 132 q-7 0 -7 -7" />
      </g>
      <circle cx="50" cy="70" r="34" fill="none" stroke={ink} strokeWidth="0.7" opacity="0.5" />
      <circle cx="50" cy="70" r="30" fill="none" stroke={red} strokeWidth="0.8" />
      <text x="50" y="82" textAnchor="middle" fontSize="34" fill={red}>
        ♥
      </text>
    </svg>
  );
}

/** Art-deco card face: corner triangles and a central diamond. */
function GeometricFace({ ink, red, border }: FaceInk) {
  return (
    <svg viewBox="0 0 100 140" className="h-full w-full" preserveAspectRatio="none">
      <rect x="4" y="4" width="92" height="132" fill="none" stroke={ink} strokeWidth="1.2" />
      <rect x="9" y="9" width="82" height="122" fill="none" stroke={border} strokeWidth="1" />
      <path d="M9 9 L30 9 L9 30 Z" fill={red} opacity="0.85" />
      <path d="M91 9 L70 9 L91 30 Z" fill={red} opacity="0.85" />
      <path d="M9 131 L30 131 L9 110 Z" fill={red} opacity="0.85" />
      <path d="M91 131 L70 131 L91 110 Z" fill={red} opacity="0.85" />
      <path d="M50 40 L66 70 L50 100 L34 70 Z" fill="none" stroke={red} strokeWidth="1.6" />
      <text x="50" y="77" textAnchor="middle" fontSize="22" fill={red}>
        ♥
      </text>
    </svg>
  );
}

/** Regal card face: a crown, radiating lines and a large central heart. */
function RoyalFace({ ink, red, border }: FaceInk) {
  return (
    <svg viewBox="0 0 100 140" className="h-full w-full" preserveAspectRatio="none">
      <rect x="5" y="5" width="90" height="130" fill="none" stroke={border} strokeWidth="1.5" />
      <rect x="9" y="9" width="82" height="122" fill="none" stroke={ink} strokeWidth="0.6" opacity="0.6" />
      <path d="M34 40 L34 30 L42 37 L50 26 L58 37 L66 30 L66 40 Z" fill={red} />
      <rect x="34" y="40" width="32" height="5" fill={red} />
      <g stroke={ink} strokeWidth="0.6" opacity="0.45">
        <line x1="50" y1="48" x2="50" y2="20" />
        <line x1="28" y1="72" x2="10" y2="58" />
        <line x1="72" y1="72" x2="90" y2="58" />
      </g>
      <text x="50" y="104" textAnchor="middle" fontSize="40" fill={red}>
        ♥
      </text>
    </svg>
  );
}

/** The shared card-back artwork, tinted by the chosen back style (or the uploaded image). */
function CardBackPreview({ option }: { option: CardBackOption }) {
  return (
    <div
      aria-hidden
      className="relative h-40 w-28 select-none overflow-hidden rounded-lg border border-black/20 shadow-md shadow-black/40"
    >
      <img
        src={option.image ?? cardBackAsset}
        alt=""
        className="h-full w-full object-cover"
        style={
          option.image || !option.filter || option.filter === "none"
            ? undefined
            : { filter: option.filter }
        }
      />
    </div>
  );
}

/** Downscale an uploaded image to a data URL so it fits comfortably in localStorage. */
async function resizeCardImage(file: File, maxDim = 512): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to decode image"));
      el.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Turn a display label into a safe, lowercase filename stem. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Trigger a browser download for a data-URL image. */
function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** A single rank slot in the custom-deck uploader (Ace through King). */
function RankUploadBox({
  label,
  dataUrl,
  busy,
  onUpload,
  onRemove,
}: {
  label: string;
  dataUrl?: string;
  busy: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="overflow-hidden rounded-lg border border-gold/20 bg-surface/40">
      <div className="border-b border-gold/15 px-2 py-1.5 text-center text-xs font-semibold text-ivory/80">
        {label}
      </div>
      <div className="relative">
        {dataUrl ? (
          <>
            <img src={dataUrl} alt={label} className="aspect-[5/7] w-full object-cover" />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="absolute bottom-1 left-1 rounded bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white/90 transition-colors hover:bg-black/80"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${label}`}
              title={`Remove ${label}`}
              className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/60 text-white/70 transition-colors hover:bg-black/80 hover:text-gold"
            >
              <X className="size-3" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex aspect-[5/7] w-full flex-col items-center justify-center gap-1.5 text-ivory/40 transition-colors hover:bg-gold/10 hover:text-gold"
          >
            <Upload className="size-5" />
            <span className="text-[10px] font-semibold uppercase tracking-wide">Upload</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            if (file) onUpload(file);
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

/** Upload and manage a set of custom card images (front or back). */
function CardUploadSection({
  title,
  hint,
  items,
  busy,
  onUpload,
  onRemove,
  onCommit,
}: {
  title: string;
  hint: string;
  items: CustomCard[];
  busy: boolean;
  onUpload: (name: string, file: File) => void;
  onRemove: (id: string) => void;
  onCommit: (item: CustomCard) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const canUpload = name.trim().length > 0;
  return (
    <section className="rounded-xl border border-gold/20 bg-surface/40 p-5">
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-ivory/50">{hint}</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          if (file) {
            onUpload(name, file);
            setName("");
          }
          event.target.value = "";
        }}
      />
      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name this design"
          maxLength={40}
          aria-label={`${title} name`}
          className="h-10 min-w-0 flex-1 rounded-lg border border-gold/25 bg-surface/60 px-3 text-sm text-cream placeholder:text-ivory/40 focus:border-gold focus:outline-none"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || !canUpload}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="size-4" />
          {busy ? "Uploading..." : "Upload image"}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-gold/20 bg-surface/20 px-4 py-6 text-center text-sm text-ivory/50">
          No custom designs yet.
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <li key={item.id} className="overflow-hidden rounded-lg border border-gold/20 bg-surface/40">
              <div className="relative">
                <img src={item.dataUrl} alt={item.label} className="aspect-[5/7] w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-xs font-semibold text-white/90">
                  {item.label}
                </span>
              </div>
              <div className="flex items-center gap-1 p-1.5">
                <button
                  type="button"
                  onClick={() => onCommit(item)}
                  title="Download this design as a PNG to commit to the game"
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-gold/90 px-2 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-gold"
                >
                  <Rocket className="size-3.5" />
                  Commit to game
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  aria-label={`Remove ${item.label}`}
                  title={`Remove ${item.label}`}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-ivory/50 transition-colors hover:bg-black/20 hover:text-gold"
                >
                  <X className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Settings gear — opens a dialog to change the parlour's colours and background. */
export function SettingsDialog({ className }: Props) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(() => readTheme());
  const [candidate, setCandidate] = useState<ThemeId>(theme);
  const [effect, setEffect] = useState<EffectId>(() => readEffect());
  const [effectCandidate, setEffectCandidate] = useState<EffectId>(effect);
  const [palette, setPalette] = useState<CustomPalette>(() => readPalette());
  const [paletteCandidate, setPaletteCandidate] = useState<CustomPalette>(palette);
  const [cardFront, setCardFront] = useState<CardFrontId>(() => readCardFront());
  const [cardBack, setCardBack] = useState<CardBackId>(() => readCardBack());
  const [customFronts, setCustomFronts] = useState<CustomCard[]>(() => readCustomFronts());
  const [customBacks, setCustomBacks] = useState<CustomCard[]>(() => readCustomBacks());
  const [uploading, setUploading] = useState(false);
  const [commitNote, setCommitNote] = useState<string | null>(null);
  const [customDeck, setCustomDeck] = useState<CustomDeck>(() => readCustomDeck());
  const { blockedUsers, addBlockedUser, removeBlockedUser } = useBlockedUsers();
  const [blockDraft, setBlockDraft] = useState("");
  const isOwner = (getNickname() ?? "").toLowerCase() === "spry123456";

  const frontOptions = allCardFronts(customFronts);
  const backOptions = allCardBacks(customBacks);

  const frontOption = frontOptions.find((option) => option.id === cardFront) ?? frontOptions[0]!;
  const backOption = backOptions.find((option) => option.id === cardBack) ?? backOptions[0]!;

  const cycleCardFront = (dir: 1 | -1) => {
    const index = frontOptions.findIndex((option) => option.id === cardFront);
    const next = frontOptions[(index + dir + frontOptions.length) % frontOptions.length]!;
    setCardFront(next.id);
    writeCardFront(next.id);
  };

  const cycleCardBack = (dir: 1 | -1) => {
    const index = backOptions.findIndex((option) => option.id === cardBack);
    const next = backOptions[(index + dir + backOptions.length) % backOptions.length]!;
    setCardBack(next.id);
    writeCardBack(next.id);
  };

  const addCustomCard = (type: "front" | "back", label: string, dataUrl: string) => {
    const id = `custom-${crypto.randomUUID()}`;
    const name = label.trim() || "Custom";
    if (type === "front") {
      const next = [...customFronts, { id, label: name, dataUrl }];
      setCustomFronts(next);
      writeCustomFronts(next);
    } else {
      const next = [...customBacks, { id, label: name, dataUrl }];
      setCustomBacks(next);
      writeCustomBacks(next);
    }
  };

  const removeCustomCard = (type: "front" | "back", id: string) => {
    if (type === "front") {
      const next = customFronts.filter((item) => item.id !== id);
      setCustomFronts(next);
      writeCustomFronts(next);
      if (cardFront === id) {
        setCardFront(DEFAULT_CARD_FRONT);
        writeCardFront(DEFAULT_CARD_FRONT);
      }
    } else {
      const next = customBacks.filter((item) => item.id !== id);
      setCustomBacks(next);
      writeCustomBacks(next);
      if (cardBack === id) {
        setCardBack(DEFAULT_CARD_BACK);
        writeCardBack(DEFAULT_CARD_BACK);
      }
    }
  };

  const handleCardUpload = async (type: "front" | "back", name: string, file: File) => {
    setUploading(true);
    try {
      const dataUrl = await resizeCardImage(file);
      addCustomCard(type, name, dataUrl);
    } catch {
      // Ignore unreadable or non-image files.
    } finally {
      setUploading(false);
    }
  };

  /** Upload one of the 52 card faces into the custom deck. */
  const handleDeckUpload = async (cardId: CardId, file: File) => {
    setUploading(true);
    try {
      const dataUrl = await resizeCardImage(file);
      setCustomDeck((prev) => {
        const next = { ...prev, [cardId]: dataUrl };
        writeCustomDeck(next);
        return next;
      });
    } catch {
      // Ignore unreadable or non-image files.
    } finally {
      setUploading(false);
    }
  };

  /** Remove a single card from the custom deck. */
  const removeDeckCard = (cardId: CardId) => {
    setCustomDeck((prev) => {
      const next = { ...prev };
      delete next[cardId];
      writeCustomDeck(next);
      return next;
    });
  };

  const loadedDeckCount = CARD_DECK.filter((card) => typeof customDeck[card.id] === "string").length;
  const deckComplete = loadedDeckCount === CARD_DECK.length;

  /** Download every card of the custom deck as a PNG, ready to commit to the repo. */
  const commitDeck = () => {
    const downloads = CARD_DECK.flatMap((card) => {
      const url = customDeck[card.id];
      return typeof url === "string" ? [{ name: `${card.id}.png`, url }] : [];
    });
    downloads.forEach((entry, index) => {
      window.setTimeout(() => downloadDataUrl(entry.url, entry.name), index * 200);
    });
    setCommitNote(`Saved ${downloads.length} card fronts to your Downloads folder.`);
    window.setTimeout(() => setCommitNote(null), 6000);
  };

  /** Export a custom design as a PNG so it can be committed to the repo as a permanent card. */
  const commitCustomCard = (item: CustomCard) => {
    const filename = `${slugify(item.label) || "custom-design"}.png`;
    downloadDataUrl(item.dataUrl, filename);
    setCommitNote(`Saved "${filename}" to your Downloads folder.`);
    window.setTimeout(() => setCommitNote(null), 5000);
  };

  const submitBlock = () => {
    if (addBlockedUser(blockDraft)) setBlockDraft("");
  };

  const applyThemeOption = (id: ThemeId) => {
    setTheme(id);
    setCandidate(id);
    writeTheme(id);
    setOpen(false);
  };

  const applyEffectOption = (id: EffectId) => {
    setEffect(id);
    setEffectCandidate(id);
    writeEffect(id);
    setOpen(false);
  };

  const paletteDirty = JSON.stringify(paletteCandidate) !== JSON.stringify(palette);

  const applyPaletteOption = () => {
    setPalette(paletteCandidate);
    writePalette(paletteCandidate);
    setOpen(false);
  };

  const resetPalette = () => {
    const empty: CustomPalette = {};
    setPalette(empty);
    setPaletteCandidate(empty);
    writePalette(empty);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          className={cn(
            "grid size-11 place-items-center rounded-full border border-gold/25 bg-surface/40 text-ivory/70 transition-colors hover:border-gold/60 hover:text-gold",
            className,
          )}
        >
          <Settings className="size-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="border-gold/25 bg-brand text-cream sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="colours">
          <TabsList
            className={cn(
              "grid w-full rounded-xl border border-gold/25 bg-surface p-1",
              isOwner ? "grid-cols-7" : "grid-cols-3",
            )}
          >
            <TabsTrigger value="colours" className="data-[state=active]:bg-gold data-[state=active]:text-brand">
              Colours
            </TabsTrigger>
            <TabsTrigger value="effects" className="data-[state=active]:bg-gold data-[state=active]:text-brand">
              Effects
            </TabsTrigger>
            {isOwner && (
              <TabsTrigger value="cards" className="data-[state=active]:bg-gold data-[state=active]:text-brand">
                Cards
              </TabsTrigger>
            )}
            <TabsTrigger value="blocked" className="data-[state=active]:bg-gold data-[state=active]:text-brand">
              Block Users
            </TabsTrigger>
            {isOwner && (
              <TabsTrigger value="palette" className="data-[state=active]:bg-gold data-[state=active]:text-brand">
                Palette
              </TabsTrigger>
            )}
            {isOwner && (
              <TabsTrigger value="upload" className="data-[state=active]:bg-gold data-[state=active]:text-brand">
                Upload Card
              </TabsTrigger>
            )}
            {isOwner && (
              <TabsTrigger value="upload-front" className="data-[state=active]:bg-gold data-[state=active]:text-brand">
                Upload Front
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="colours" className="min-h-[33rem]">
            <div className="grid grid-cols-4 gap-3">
              {THEME_OPTIONS.map((option) => {
                const active = option.id === theme;
                const selected = option.id === candidate;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setCandidate(option.id)}
                    onDoubleClick={() => applyThemeOption(option.id)}
                    aria-pressed={active}
                    className={cn(
                      "relative h-28 w-full select-none overflow-hidden rounded-xl border text-left transition-all",
                      selected ? "-translate-y-0.5 border-gold ring-2 ring-gold" : "border-gold/20 hover:border-gold/50",
                    )}
                    style={{ background: `linear-gradient(135deg, ${option.swatch.brand}, ${option.swatch.accent})` }}
                  >
                    <span className="absolute inset-x-0 bottom-0 bg-black/45 px-2 py-1.5 font-display text-sm font-semibold text-white/90">
                      {option.label}
                    </span>
                    {active && (
                      <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-gold text-brand">
                        <Check className="size-4" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => applyThemeOption(candidate)}
                disabled={candidate === theme}
                className="rounded-lg bg-gold px-5 py-2 text-sm font-semibold text-brand transition-colors hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
              >
                Select
              </button>
            </div>
          </TabsContent>

          <TabsContent value="effects" className="min-h-[33rem]">
            <div className="grid grid-cols-2 gap-3">
              {EFFECT_OPTIONS.map((option) => {
                const active = option.id === effect;
                const selected = option.id === effectCandidate;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setEffectCandidate(option.id)}
                    onDoubleClick={() => applyEffectOption(option.id)}
                    aria-pressed={active}
                    className={cn(
                      "relative overflow-hidden rounded-2xl border p-2 text-left transition-all",
                      selected ? "border-gold ring-2 ring-gold" : "border-gold/20 hover:border-gold/50",
                    )}
                  >
                    <span
                      className={cn(
                        "block h-24 w-full rounded-xl border border-white/10 bg-surface",
                        option.id !== "none" && `fx-${option.id}`,
                      )}
                    />
                    <span className="mt-2 block font-display text-base font-semibold">{option.label}</span>
                    {active && (
                      <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-gold text-brand">
                        <Check className="size-4" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => applyEffectOption(effectCandidate)}
                disabled={effectCandidate === effect}
                className="rounded-lg bg-gold px-5 py-2 text-sm font-semibold text-brand transition-colors hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
              >
                Select
              </button>
            </div>
          </TabsContent>

          <TabsContent value="cards" className="min-h-[33rem]">
            <p className="text-sm text-ivory/70">
              Choose how your playing cards look. Pick a face and a back — the arrows cycle through
              the available styles and save your choice right away.
            </p>

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <section className="rounded-xl border border-gold/20 bg-surface/40 p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-display text-base font-semibold">Card front</h3>
                  <span className="text-xs font-semibold uppercase tracking-wider text-gold">
                    {frontOption.label}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => cycleCardFront(-1)}
                    aria-label="Previous card front"
                    title="Previous card front"
                    className="grid size-9 shrink-0 place-items-center rounded-full border border-gold/25 bg-surface/60 text-ivory/70 transition-colors hover:border-gold/60 hover:text-gold"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <CardFacePreview option={frontOption} />
                  <button
                    type="button"
                    onClick={() => cycleCardFront(1)}
                    aria-label="Next card front"
                    title="Next card front"
                    className="grid size-9 shrink-0 place-items-center rounded-full border border-gold/25 bg-surface/60 text-ivory/70 transition-colors hover:border-gold/60 hover:text-gold"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </div>
              </section>

              <section className="rounded-xl border border-gold/20 bg-surface/40 p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-display text-base font-semibold">Card back</h3>
                  <span className="text-xs font-semibold uppercase tracking-wider text-gold">
                    {backOption.label}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => cycleCardBack(-1)}
                    aria-label="Previous card back"
                    title="Previous card back"
                    className="grid size-9 shrink-0 place-items-center rounded-full border border-gold/25 bg-surface/60 text-ivory/70 transition-colors hover:border-gold/60 hover:text-gold"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <CardBackPreview option={backOption} />
                  <button
                    type="button"
                    onClick={() => cycleCardBack(1)}
                    aria-label="Next card back"
                    title="Next card back"
                    className="grid size-9 shrink-0 place-items-center rounded-full border border-gold/25 bg-surface/60 text-ivory/70 transition-colors hover:border-gold/60 hover:text-gold"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </div>
              </section>
            </div>
          </TabsContent>

          <TabsContent value="blocked" className="min-h-[33rem]">
            <p className="text-sm text-ivory/70">
              Blocked players are hidden from your invites and waiting room. Add a nickname below to block it.
            </p>

            <form
              className="mt-4 flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                submitBlock();
              }}
            >
              <input
                type="text"
                value={blockDraft}
                onChange={(event) => setBlockDraft(event.target.value)}
                placeholder="Nickname to block"
                maxLength={10}
                aria-label="Nickname to block"
                className="h-10 flex-1 rounded-lg border border-gold/25 bg-surface/60 px-3 text-base text-cream placeholder:text-ivory/40 focus:border-gold/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!blockDraft.trim()}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gold px-4 text-sm font-semibold text-brand transition-colors hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="size-4" />
                Add
              </button>
            </form>

            {blockedUsers.length === 0 ? (
              <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-gold/20 bg-surface/20 px-6 py-8 text-center">
                <ShieldOff className="size-6 text-gold/40" />
                <p className="font-display text-base text-ivory/50">No blocked users</p>
                <p className="text-sm text-ivory/40">You haven't blocked anyone yet.</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {blockedUsers.map((name) => (
                  <li
                    key={name}
                    className="flex items-center justify-between rounded-lg border border-gold/20 bg-surface/40 px-3 py-2"
                  >
                    <span className="font-display text-base font-semibold">{name}</span>
                    <button
                      type="button"
                      onClick={() => removeBlockedUser(name)}
                      aria-label={`Unblock ${name}`}
                      title={`Unblock ${name}`}
                      className="grid size-8 place-items-center rounded-full text-ivory/50 transition-colors hover:bg-gold/15 hover:text-gold"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="palette" className="min-h-[33rem]">
            <p className="text-sm text-ivory/70">
              Tune the three background tones used across the site. Pick a colour for each and it
              becomes part of the main page backdrop.
            </p>

            <div className="mt-4 space-y-3">
              {PALETTE_CHANNELS.map(({ id, label, hint, cssVar }) => (
                <div
                  key={id}
                  className="flex flex-wrap items-center gap-4 rounded-xl border border-gold/20 bg-surface/40 p-4"
                >
                  <span
                    aria-hidden
                    className="grid size-12 shrink-0 place-items-center rounded-full border border-white/10"
                    style={{ background: `var(${cssVar})` }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-semibold">{label}</p>
                    <p className="text-xs text-ivory/50">{hint}</p>
                  </div>
                  <input
                    type="color"
                    value={channelHex(paletteCandidate, id)}
                    onChange={(event) =>
                      setPaletteCandidate((prev) => ({ ...prev, [id]: event.target.value }))
                    }
                    aria-label={`${label} colour`}
                    className="h-11 w-16 shrink-0 cursor-pointer rounded-lg border border-gold/25 bg-surface p-1"
                  />
                  {paletteCandidate[id] && (
                    <button
                      type="button"
                      onClick={() =>
                        setPaletteCandidate((prev) => {
                          const next = { ...prev };
                          delete next[id];
                          return next;
                        })
                      }
                      aria-label={`Reset ${label}`}
                      title={`Reset ${label}`}
                      className="grid size-8 shrink-0 place-items-center rounded-full text-ivory/50 transition-colors hover:bg-gold/15 hover:text-gold"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={resetPalette}
                disabled={
                  Object.keys(palette).length === 0 && Object.keys(paletteCandidate).length === 0
                }
                className="rounded-lg border border-gold/25 px-5 py-2 text-sm font-semibold text-ivory/80 transition-colors hover:border-gold/60 hover:text-gold disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={applyPaletteOption}
                disabled={!paletteDirty}
                className="rounded-lg bg-gold px-5 py-2 text-sm font-semibold text-brand transition-colors hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </TabsContent>

          <TabsContent value="upload" className="min-h-[33rem]">
            <p className="text-sm text-ivory/70">
              Upload custom card designs from your computer. Uploaded images appear as extra
              options in the Cards tab, where you can select them like any built-in style.
            </p>
            <p className="mt-2 text-xs text-ivory/50">
              Use <span className="font-semibold text-gold">Commit to game</span> to download a
              design as a PNG so it can be added to the repo as a permanent card for every player.
            </p>
            {commitNote && <p className="mt-2 text-xs font-semibold text-gold">{commitNote}</p>}

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <CardUploadSection
                title="Card front"
                hint="An image used as the front (face) of your cards."
                items={customFronts}
                busy={uploading}
                onUpload={(name, file) => handleCardUpload("front", name, file)}
                onRemove={(id) => removeCustomCard("front", id)}
                onCommit={commitCustomCard}
              />
              <CardUploadSection
                title="Card back"
                hint="An image used as the back of your cards."
                items={customBacks}
                busy={uploading}
                onUpload={(name, file) => handleCardUpload("back", name, file)}
                onRemove={(id) => removeCustomCard("back", id)}
                onCommit={commitCustomCard}
              />
            </div>
          </TabsContent>

          <TabsContent value="upload-front" className="min-h-[33rem]">
            <p className="text-sm text-ivory/70">
              Build a complete custom deck: upload one image for each of the 52 cards (thirteen
              ranks across Spades, Clubs, Diamonds and Hearts).
            </p>
            <p className="mt-2 text-xs text-ivory/50">
              Loaded {loadedDeckCount} of {CARD_DECK.length} cards. The{" "}
              <span className="font-semibold text-gold">Commit to game</span> button appears once
              every card has an image.
            </p>
            {commitNote && <p className="mt-2 text-xs font-semibold text-gold">{commitNote}</p>}

            <div className="mt-6 max-h-80 overflow-y-auto rounded-lg pr-1">
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                {CARD_DECK.map((card) => (
                  <RankUploadBox
                    key={card.id}
                    label={card.short}
                    dataUrl={customDeck[card.id]}
                    busy={uploading}
                    onUpload={(file) => handleDeckUpload(card.id, file)}
                    onRemove={() => removeDeckCard(card.id)}
                  />
                ))}
              </div>
            </div>

            {deckComplete && (
              <div className="mt-6 border-t border-gold/15 pt-5">
                <button
                  type="button"
                  onClick={commitDeck}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-surface/60 px-4 py-2 text-sm font-semibold text-gold transition-colors hover:border-gold hover:bg-gold/10"
                >
                  <Rocket className="size-4" />
                  Commit to game
                </button>
                <p className="mt-2 text-xs text-ivory/50">
                  Downloads all 52 fronts as PNGs so they can be added to the repo as a
                  permanent card front set for every player.
                </p>
              </div>
            )}
          </TabsContent>

        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
