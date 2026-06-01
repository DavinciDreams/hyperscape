import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ImagePlus, Mic, MicOff, Sparkles, X } from "lucide-react";
import { EventType } from "@hyperscape/shared";
import type { ClientWorld } from "../../types";
import {
  getConjureStatus,
  placeConjure,
  startConjure,
  type ConjureStatusResponse,
} from "./conjureApi";
import { ConjureWorldEffect } from "./ConjureWorldEffect";
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

const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type WorldPosition = {
  x: number;
  y: number;
  z: number;
};

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

function getPlacementPosition(world: ClientWorld): WorldPosition | null {
  const player = world.getPlayer?.();
  const position = player?.getPosition?.() ?? player?.position;
  if (!position) return null;

  return {
    x: position.x + 1.5,
    y: position.y,
    z: position.z + 1.5,
  };
}

function createImagePrompt(prompt: string, imageFile: File | null): string {
  const cleanPrompt = prompt.trim();
  if (cleanPrompt) return cleanPrompt;
  if (!imageFile) return "";
  return "A game-ready 3D asset based on the uploaded image";
}

export function ConjurePanel({ world }: { world: ClientWorld }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<ConjurePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [conjureId, setConjureId] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConjureStatusResponse | null>(null);
  const [placementPosition, setPlacementPosition] =
    useState<WorldPosition | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  const clearImage = useCallback(() => {
    setImageFile(null);
    setImagePreviewUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return null;
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const selectImage = useCallback((file: File | null) => {
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setError("Choose a PNG, JPG, or WebP image.");
      return;
    }

    setError(null);
    setImageFile(file);
    setImagePreviewUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return URL.createObjectURL(file);
    });
  }, []);

  const uploadImage = useCallback(async (): Promise<string | undefined> => {
    if (!imageFile) return undefined;
    const networkWithUpload = world.network as {
      upload?: (file: File) => Promise<string>;
    };
    if (!networkWithUpload.upload) {
      throw new Error("Image upload is not available in this world.");
    }
    return networkWithUpload.upload(imageFile);
  }, [imageFile, world.network]);

  const submitConjure = useCallback(async () => {
    const cleanPrompt = createImagePrompt(prompt, imageFile);
    if (!cleanPrompt || phase === "starting" || phase === "processing") return;

    stopListening();
    resetPolling();
    setError(null);
    setStatus(null);
    setConjureId(null);
    setAssetId(null);
    const nextPlacementPosition = getPlacementPosition(world);
    if (!nextPlacementPosition) {
      setError("Player position is not ready for conjure placement.");
      setPhase("failed");
      return;
    }
    setPlacementPosition(nextPlacementPosition);
    setPhase("starting");

    try {
      const uploadedImageFilename = await uploadImage();
      const response = await startConjure({
        prompt: cleanPrompt,
        speechTranscript: prompt.trim() || undefined,
        type: "prop",
        subtype: "spoken-conjure",
        quality: "high",
        uploadedImageFilename,
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
  }, [
    imageFile,
    phase,
    prompt,
    resetPolling,
    stopListening,
    uploadImage,
    world,
  ]);

  useEffect(() => {
    if (!conjureId || phase !== "processing") return undefined;

    let cancelled = false;
    const poll = async () => {
      try {
        const next = await getConjureStatus(conjureId);
        if (cancelled) return;
        setStatus(next);

        if (isFinished(next.status)) {
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
  }, [
    assetId,
    conjureId,
    phase,
    placementPosition,
    prompt,
    resetPolling,
    world,
  ]);

  useEffect(() => {
    return () => {
      stopListening();
      resetPolling();
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl, resetPolling, stopListening]);

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

          <div className="conjure-image-row">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) =>
                selectImage(event.currentTarget.files?.item(0) || null)
              }
              disabled={busy}
            />
            <button
              type="button"
              className="conjure-image-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              <ImagePlus size={16} />
              <span>{imageFile ? "Change image" : "Upload image"}</span>
            </button>
            {imageFile && (
              <button
                type="button"
                className="conjure-icon-button"
                onClick={clearImage}
                disabled={busy}
                aria-label="Remove uploaded image"
              >
                <X size={16} />
              </button>
            )}
            {imagePreviewUrl && (
              <img
                className="conjure-image-preview"
                src={imagePreviewUrl}
                alt=""
              />
            )}
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
              disabled={!createImagePrompt(prompt, imageFile) || busy}
            >
              <Sparkles size={16} />
              <span>{busy ? "Conjuring" : "Conjure"}</span>
            </button>
          </div>
        </section>
      )}

      <ConjureWorldEffect
        active={busy}
        position={placementPosition}
        world={world}
      />
    </>
  );
}
