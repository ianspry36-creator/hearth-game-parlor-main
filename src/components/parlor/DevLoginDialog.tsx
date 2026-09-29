import { useEffect, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DEV_LOGIN_PASSWORD,
  disableDeveloperMode,
  enableDeveloperMode,
  isDeveloperMode,
} from "@/lib/dev-mode";

type Props = {
  /** The element that opens the dialog (e.g. the footer "Dev login" link). */
  trigger: ReactNode;
};

/** Popup that unlocks Developer Mode for the session via a shared access code. */
export function DevLoginDialog({ trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [devActive, setDevActive] = useState(false);

  // Reset the field each time the dialog opens so stale input is never shown.
  useEffect(() => {
    if (!open) return;
    setCode("");
    setError(null);
    setDevActive(isDeveloperMode());
  }, [open]);

  const submit = () => {
    if (code.trim() === DEV_LOGIN_PASSWORD) {
      enableDeveloperMode();
      setDevActive(true);
      setError(null);
      setOpen(false);
    } else {
      setError("Incorrect access code.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="border-gold/25 bg-brand text-cream sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Dev Login</DialogTitle>
          <DialogDescription className="text-ivory/65">
            Enter the developer access code to enable Developer Mode for the rest of this session.
          </DialogDescription>
        </DialogHeader>

        {devActive ? (
          <div className="space-y-3">
            <p className="text-sm text-ivory/70">
              Developer Mode is <span className="font-semibold text-gold">active</span> for this
              session.
            </p>
            <Button
              type="button"
              variant="parlorGhost"
              size="sm"
              onClick={() => {
                disableDeveloperMode();
                setDevActive(false);
              }}
            >
              Disable Developer Mode
            </Button>
          </div>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="flex gap-2">
              <Input
                id="dev-code"
                type="password"
                value={code}
                autoFocus
                onChange={(event) => {
                  setCode(event.target.value);
                  setError(null);
                }}
                placeholder="Access code"
                className="border-gold/30 bg-brand/60 text-cream placeholder:text-ivory/40"
              />
              <Button
                type="submit"
                variant="parlor"
                size="sm"
                className="shrink-0"
                disabled={!code.trim()}
              >
                Login
              </Button>
            </div>
            {error && <p className="text-xs text-red-300">{error}</p>}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
