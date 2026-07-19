"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAcceptableScan, normalizeScannedPayload } from "@/src/contacts/scanned-key";
import { decodeImageData } from "@/src/lib/qr-decode";

// Local-only camera QR scanner (D4). getUserMedia runs client-side; frames are read into an in-memory
// canvas and decoded locally with jsQR — NOTHING is uploaded and no frame is persisted. The stream is
// bound via `video.srcObject` (a live MediaStream object, NOT a URL) so it is not governed by
// `media-src` and needs no CSP change (D3). Tracks are stopped on unmount, on tab-hidden, and
// immediately after a successful decode. Graceful degradation: a missing API / denied / no-camera
// resolves to a calm status the UI turns into a "paste the key instead" fallback — never a throw.

export type CameraScannerStatus = "idle" | "requesting" | "scanning" | "denied" | "unavailable";

export interface UseCameraScanner {
  status: CameraScannerStatus;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export interface UseCameraScannerOptions {
  /** Called ONCE with the trimmed decoded payload when an acceptable aesmsg key is scanned. */
  onResult: (payload: string) => void;
  /** When false the scanner does not acquire the camera (e.g. the scan tab is not active). */
  active?: boolean;
}

export function useCameraScanner({
  onResult,
  active = true,
}: UseCameraScannerOptions): UseCameraScanner {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // The element we actually bound the stream to. Held separately because React detaches `videoRef`
  // (sets .current = null) during the commit phase BEFORE our effect cleanup runs on unmount — so
  // clearing srcObject must target this captured reference, not the already-nulled videoRef.
  const boundVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handledRef = useRef(false);
  const [status, setStatus] = useState<CameraScannerStatus>("idle");

  // Keep the latest onResult without re-triggering the acquisition effect.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current !== null) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    const bound = boundVideoRef.current ?? videoRef.current;
    if (bound !== null) {
      bound.srcObject = null;
      boundVideoRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    handledRef.current = false;

    const scanFrame = () => {
      if (cancelled || handledRef.current) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        let canvas = canvasRef.current;
        if (canvas === null) {
          canvas = document.createElement("canvas");
          canvasRef.current = canvas;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const decoded = decodeImageData(image.data, image.width, image.height);
          if (decoded !== null && isAcceptableScan(decoded)) {
            handledRef.current = true;
            const payload = normalizeScannedPayload(decoded);
            stop();
            onResultRef.current(payload);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(scanFrame);
    };

    const start = async () => {
      const media = navigator.mediaDevices;
      if (!media || typeof media.getUserMedia !== "function") {
        if (!cancelled) setStatus("unavailable");
        return;
      }
      setStatus("requesting");
      let stream: MediaStream;
      try {
        stream = await media.getUserMedia({ video: { facingMode: "environment" } });
      } catch (err) {
        if (cancelled) return;
        const name = (err as { name?: string }).name;
        setStatus(
          name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable",
        );
        return;
      }
      if (cancelled) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video !== null) {
        boundVideoRef.current = video;
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          /* autoplay can reject silently; the frame loop still samples once frames arrive */
        }
      }
      setStatus("scanning");
      rafRef.current = requestAnimationFrame(scanFrame);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else if (!handledRef.current) {
        void start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    void start();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [active, stop]);

  return { status, videoRef };
}
