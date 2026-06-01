import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Mic, MicOff, Sparkles, X } from "lucide-react";
import { EventType } from "@hyperscape/shared";
import type { ClientWorld } from "../../types";
import {
  getConjureStatus,
  placeConjure,
  startConjure,
  type ConjureStatusResponse,
} from "./conjureApi";
import { ConjureGalaxy } from "./ConjureGalaxy";
import "./conjure.css";

type SpeechRecognitionAlternative = {
  transcript: string;
  confidence: number;
};

type SpeechRecognitionResult = {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
};

type SpeechRecognitionResultList = {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
};

type SpeechRecognitionEvent = Event & {
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionInstance = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

type ConjurePhase =
  | "idle"
  | "listening"
  | "starting"
  | "processing"
  | "placing"
  | "complete"
  | "failed";

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as WindowWithSpeechRecognition;
  return (
    speechWindow.SpeechRecognition ||
    speechWindow.webkitSpeechRecognition ||
    null
  );
}

function isFinished(status: string): boolean {
  return ["completed", "complete", "succeeded", "success"].includes(
    status.toLowerCase(),
  );
}

function isFailed(status: string): boolean {
  return ["failed", "error", "cancelled", "canceled"].includes(
    status.toLowerCase(),
  );
}

function getPlacementPosition(world: ClientWorld): {
  x: number;
  y: number;
  z: number;
} | null {
  const player = world.getPlayer?.();
  const position = player?.getPosition?.() ?? player?.position;
  if (!position) return null;

  return {
    x: position.x + 1.5,
    y: position.y,
    z: position.z + 1.5,
  };
}

export function ConjurePanel({ world }: { world: ClientWorld }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<ConjurePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [conjureId, setConjureId] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConjureStatusResponse | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const pollTimeoutRef = useRef<number | null>(null);

  const speechSupported = useMemo(
    () => getSpeechRecognitionConstructor() !== null,
    [],
  );

  const resetPolling = useCallback(() => {
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setPhase((current) => (current === "listening" ? "idle" : current));
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setError("Speech recognition is not available in this browser.");
      return;
    }

    setError(null);
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0]?.transcript || "";
      }
      setPrompt(transcript.trim());
    };
    recognition.onerror = () => {
      setError("I couldn't hear that clearly. Try again or type it.");
      setPhase("idle");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setPhase((current) => (current === "listening" ? "idle" : current));
    };
    recognitionRef.current = recognition;
    recognition.start();
    setPhase("listening");
  }, []);

  const submitConjure = useCallback(async () => {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || phase === "starting" || phase === "processing") return;

    stopListening();
    resetPolling();
    setError(null);
    setStatus(null);
    setConjureId(null);
    setAssetId(null);
    setPhase("starting");

    try {
      const response = await startConjure({
        prompt: cleanPrompt,
        speechTranscript: cleanPrompt,
        type: "prop",
        subtype: "spoken-conjure",
        quality: "high",
      });
      setConjureId(response.conjureId || null);
      setAssetId(response.assetId);
      setPhase("processing");
      world.emit(EventType.UI_TOAST, {
        message: "Conjure started",
        type: "info",
      });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Unable to start conjure";
      setError(message);
      setPhase("failed");
    }
  }, [phase, prompt, resetPolling, stopListening, world]);

  useEffect(() => {
    if (!conjureId || phase !== "processing") return undefined;

    let cancelled = false;
    const poll = async () => {
      try {
        const next = await getConjureStatus(conjureId);
        if (cancelled) return;
        setStatus(next);

        if (isFinished(next.status)) {
          const placementPosition = getPlacementPosition(world);
          if (!placementPosition) {
            setError("Player position is not ready for placement.");
            setPhase("failed");
            return;
          }

          try {
            setPhase("placing");
            await placeConjure(conjureId, {
              assetId: assetId || undefined,
              prompt,
              position: placementPosition,
              modelScale: 1,
            });
          } catch (caught) {
            const message =
              caught instanceof Error
                ? caught.message
                : "Unable to place conjure";
            setError(message);
            setPhase("failed");
            return;
          }

          if (cancelled) return;
          setPhase("complete");
          world.emit(EventType.UI_TOAST, {
            message: "Conjure placed",
            type: "success",
          });
          return;
        }

        if (isFailed(next.status)) {
          setError(next.error || "Conjure failed");
          setPhase("failed");
          return;
        }

        pollTimeoutRef.current = window.setTimeout(poll, 2500);
      } catch (caught) {
        if (cancelled) return;
        const message =
          caught instanceof Error ? caught.message : "Unable to poll conjure";
        setError(message);
        pollTimeoutRef.current = window.setTimeout(poll, 5000);
      }
    };

    pollTimeoutRef.current = window.setTimeout(poll, 1000);

    return () => {
      cancelled = true;
      resetPolling();
    };
  }, [assetId, conjureId, phase, prompt, resetPolling, world]);

  useEffect(() => {
    return () => {
      stopListening();
      resetPolling();
    };
  }, [resetPolling, stopListening]);

  const busy =
    phase === "starting" || phase === "processing" || phase === "placing";
  const progress = Math.max(0, Math.min(100, status?.progress ?? 0));
  const statusText =
    phase === "listening"
      ? "Listening"
      : phase === "starting"
        ? "Opening the gate"
        : phase === "processing"
          ? "Conjuring"
          : phase === "placing"
            ? "Placing"
            : phase === "complete"
              ? "Ready"
              : phase === "failed"
                ? "Failed"
                : "Idle";

  return (
    <>
      <button
        type="button"
        className="conjure-fab pointer-events-auto"
        onClick={() => setOpen(true)}
        title="Conjure"
        aria-label="Conjure"
      >
        <Sparkles size={18} />
        <span>Conjure</span>
      </button>

      {open && (
        <section
          className="conjure-panel pointer-events-auto"
          aria-label="Conjure asset"
        >
          <div className="conjure-panel__header">
            <div>
              <div className="conjure-panel__eyebrow">{statusText}</div>
              <h2>Speak a 3D asset into the world</h2>
            </div>
            <button
              type="button"
              className="conjure-icon-button"
              onClick={() => {
                stopListening();
                setOpen(false);
              }}
              aria-label="Close conjure"
            >
              <X size={18} />
            </button>
          </div>

          {busy && <ConjureGalaxy active={busy} />}

          <div className="conjure-input-row">
            <button
              type="button"
              className="conjure-mic-button"
              onClick={phase === "listening" ? stopListening : startListening}
              disabled={!speechSupported || busy}
              aria-label={
                phase === "listening" ? "Stop listening" : "Start listening"
              }
            >
              {phase === "listening" ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              disabled={busy}
              maxLength={1200}
              placeholder="an ancient bronze lantern with blue fire..."
            />
          </div>

          <div
            className="conjure-progress"
            aria-hidden={phase !== "processing"}
          >
            <div style={{ width: `${progress}%` }} />
          </div>

          <div className="conjure-panel__footer">
            <div className="conjure-status">
              {assetId && <span>{assetId}</span>}
              {status?.localPath && <span>{status.localPath}</span>}
              {error && <span className="conjure-error">{error}</span>}
            </div>
            <button
              type="button"
              className="conjure-submit"
              onClick={submitConjure}
              disabled={!prompt.trim() || busy}
            >
              <Sparkles size={16} />
              <span>{busy ? "Conjuring" : "Conjure"}</span>
            </button>
          </div>
        </section>
      )}
    </>
  );
}
