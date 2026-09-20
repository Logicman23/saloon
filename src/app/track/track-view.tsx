"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  LocateFixed,
  MapPin,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { Monogram } from "@/components/brand/logo";
import { SALON } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The confirmation flow, as a state machine.
 *
 * `invalid` is separated from `error` because it is the one failure the client
 * cannot fix by retrying — a link without `?client=` is a salon mistake, and
 * offering "Try again" there would loop them forever.
 */
type Phase = "invalid" | "unsupported" | "idle" | "locating" | "saving" | "done" | "error";

interface Failure {
  title: string;
  description: string;
  /** Whether retrying could plausibly succeed. */
  retryable: boolean;
}

/**
 * Geolocation errors, translated into something a client can act on.
 *
 * `PERMISSION_DENIED` is the one that matters: the browser will not re-prompt
 * once denied, so "try again" alone is useless advice — the copy has to say
 * where the switch is.
 */
function describeGeolocationError(error: GeolocationPositionError): Failure {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return {
        title: "Location access blocked",
        description:
          "Your browser is set to refuse location for this page. Tap the padlock or location icon in the address bar, allow location, then reload.",
        retryable: false,
      };
    case error.POSITION_UNAVAILABLE:
      return {
        title: "Couldn't get a signal",
        description:
          "Your device couldn't fix a position — this is common indoors or in a basement. Step near a window or outside and try again.",
        retryable: true,
      };
    case error.TIMEOUT:
      return {
        title: "Taking too long",
        description:
          "Your device is still searching for a satellite fix. Move somewhere with a clearer view of the sky and try again.",
        retryable: true,
      };
    default:
      return {
        title: "Couldn't read your location",
        description: "Something went wrong reading your position. Please try again.",
        retryable: true,
      };
  }
}

export function TrackView({ clientRef }: { clientRef: string }) {
  const [phase, setPhase] = React.useState<Phase>(clientRef ? "idle" : "invalid");
  const [failure, setFailure] = React.useState<Failure | null>(null);
  const [coords, setCoords] = React.useState<{ lat: number; lng: number; accuracy?: number } | null>(
    null,
  );

  /**
   * Held in a ref, not state: it guards against a second in-flight request
   * (a double tap, or the auto-start racing a manual click) and must be read
   * synchronously, before React has re-rendered.
   */
  const busy = React.useRef(false);

  const capture = React.useCallback(() => {
    if (busy.current || !clientRef) return;

    // Both checks live here rather than at mount: they read browser-only APIs,
    // and answering them in response to the tap is also when the client can
    // actually act on the answer.
    //
    // `isSecureContext` matters as much as the feature check. Over plain http
    // the API exists but every call fails with PERMISSION_DENIED, which would
    // otherwise be reported as "you blocked location" — sending the client to
    // a browser setting that was never the problem.
    if (!navigator.geolocation || !window.isSecureContext) {
      setPhase("unsupported");
      return;
    }

    busy.current = true;
    setFailure(null);
    setPhase("locating");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setCoords({ lat: latitude, lng: longitude, accuracy });
        setPhase("saving");

        try {
          const response = await fetch("/api/save-location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientId: clientRef,
              latitude,
              longitude,
              accuracy,
            }),
          });

          if (!response.ok) {
            // The server's own message is written for this reader, so prefer
            // it over a generic one when the response carries it.
            const payload = await response.json().catch(() => null);
            setFailure({
              title: "Couldn't save your location",
              description:
                (payload && typeof payload.message === "string" && payload.message) ||
                "The salon's system didn't accept the location. Please try again in a moment.",
              retryable: true,
            });
            setPhase("error");
            return;
          }

          setPhase("done");
        } catch {
          setFailure({
            title: "No connection",
            description:
              "Your location was read, but it couldn't be sent. Check your internet connection and try again.",
            retryable: true,
          });
          setPhase("error");
        } finally {
          busy.current = false;
        }
      },
      (error) => {
        busy.current = false;
        setFailure(describeGeolocationError(error));
        setPhase("error");
      },
      {
        enableHighAccuracy: true,
        // A high-accuracy fix can take a while to settle on a phone that has
        // just woken its GPS; 20s is patient enough to avoid a false timeout
        // without leaving the client staring at a spinner.
        timeout: 20_000,
        // Never a cached fix: the whole point is where they are *now*.
        maximumAge: 0,
      },
    );
  }, [clientRef]);

  /**
   * Start on its own only when permission is already granted.
   *
   * A permission prompt that appears before the client has read why it is
   * being asked is the single most reliable way to get it denied — and once
   * denied, the browser will not ask again. So the first visit gets a button;
   * a return visit, where the answer is already yes, skips straight to the fix.
   */
  React.useEffect(() => {
    if (!clientRef || !navigator.permissions?.query) return;

    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (!cancelled && status.state === "granted") capture();
      })
      // Safari has historically rejected this query outright. Not knowing the
      // answer is fine — the button is still there.
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [clientRef, capture]);

  return (
    <main className="canvas-vignette flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <header className="mb-6 flex flex-col items-center gap-3 text-center">
          <Monogram className="size-12" />
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-wide text-gilded">
              {SALON.name}
            </h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-faint">{SALON.tagline}</p>
          </div>
        </header>

        <div className="rounded-2xl border border-hairline bg-charcoal p-6 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] sm:p-7">
          {phase === "invalid" ? (
            <Panel
              tone="danger"
              icon={AlertTriangle}
              title="This link is incomplete"
              description="The link you opened is missing its client reference, so we can't tell whose location this is. Please ask the salon to resend it."
            />
          ) : phase === "unsupported" ? (
            <Panel
              tone="danger"
              icon={WifiOff}
              title="Location isn't available here"
              description="This browser can't share a location — usually because the page was opened over an insecure connection or inside an app's built-in browser. Open the link in Chrome or Safari and try again."
            />
          ) : phase === "done" ? (
            <Panel
              tone="success"
              icon={CheckCircle2}
              title="Location confirmed successfully"
              description="Thank you. The salon has your location and will be in touch. You can close this page."
            >
              {coords && (
                <dl className="mt-5 space-y-2 rounded-xl border border-hairline bg-obsidian-elevated p-4 text-sm">
                  <Row label="Latitude" value={coords.lat.toFixed(6)} />
                  <Row label="Longitude" value={coords.lng.toFixed(6)} />
                  {coords.accuracy !== undefined && (
                    <Row label="Accuracy" value={`± ${Math.round(coords.accuracy)} m`} />
                  )}
                </dl>
              )}
            </Panel>
          ) : phase === "locating" || phase === "saving" ? (
            <Panel
              tone="pending"
              icon={Loader2}
              spin
              title={phase === "locating" ? "Requesting location access…" : "Saving your location…"}
              description={
                phase === "locating"
                  ? "If your browser asks for permission, choose Allow. This can take a few seconds while your device fixes a position."
                  : "Almost done — sending the confirmation to the salon."
              }
            />
          ) : phase === "error" && failure ? (
            <Panel tone="danger" icon={AlertTriangle} title={failure.title} description={failure.description}>
              {failure.retryable && (
                <button
                  type="button"
                  onClick={capture}
                  className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-gold-light to-gold text-base font-semibold text-obsidian shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_6px_18px_-8px_rgba(212,175,55,0.7)] transition-all duration-200 ease-[var(--ease-luxury)] hover:brightness-110 active:scale-[0.98]"
                >
                  <LocateFixed className="size-5" />
                  Try again
                </button>
              )}
            </Panel>
          ) : (
            <>
              <Panel
                tone="idle"
                icon={MapPin}
                title="Confirm your location"
                description="Sana's Beauty Saloon needs your exact location to confirm your appointment. Tap below and choose “Allow” when your browser asks."
              />
              <button
                type="button"
                onClick={capture}
                className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-gold-light to-gold text-base font-semibold text-obsidian shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_6px_18px_-8px_rgba(212,175,55,0.7)] transition-all duration-200 ease-[var(--ease-luxury)] hover:brightness-110 active:scale-[0.98]"
              >
                <LocateFixed className="size-5" />
                Share my location
              </button>
            </>
          )}
        </div>

        <p className="mt-5 flex items-start justify-center gap-2 px-2 text-center text-xs leading-relaxed text-faint">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span>
            Your location is shared once, with {SALON.shortName} only, and is used solely to
            confirm this appointment.
          </span>
        </p>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ Parts */

const TONES = {
  idle: "border-gold/30 bg-gold/10 text-gold",
  pending: "border-gold/30 bg-gold/10 text-gold",
  success: "border-success/30 bg-success/10 text-success",
  danger: "border-danger/30 bg-danger/10 text-danger",
} as const;

function Panel({
  tone,
  icon: Icon,
  spin,
  title,
  description,
  children,
}: {
  tone: keyof typeof TONES;
  icon: React.ComponentType<{ className?: string }>;
  spin?: boolean;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="text-center">
      <span
        className={cn(
          "inline-flex size-14 items-center justify-center rounded-full border",
          TONES[tone],
        )}
      >
        <Icon className={cn("size-6", spin && "animate-spin")} />
      </span>

      {/* Announced to screen readers as the phase changes, so someone not
          watching the icon still learns the request succeeded or failed. */}
      <div aria-live="polite">
        <h2 className="mt-4 text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
      </div>

      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-xs uppercase tracking-wider text-faint">{label}</dt>
      <dd className="tabular font-medium text-ink">{value}</dd>
    </div>
  );
}
