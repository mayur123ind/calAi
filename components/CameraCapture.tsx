"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Xmark } from "iconoir-react";
import { Notice } from "./ui";

/**
 * Full-screen live camera that keeps taking photos until Done. Each shot is handed to `onShot` as a JPEG file.
 * Needs https or localhost; the caller falls back to the phone's own camera (a file input) elsewhere.
 */
export function CameraCapture({
  remaining,
  taken,
  onShot,
  onClose,
}: {
  remaining: number;
  taken: string[];
  onShot: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let alive = true;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => alive && setError("Couldn't open the camera. Allow camera access in your browser, or use Photos instead."));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      stream?.getTracks().forEach((t) => t.stop());
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function shoot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || remaining <= 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => blob && onShot(new File([blob], `meal-${Date.now()}.jpg`, { type: "image/jpeg" })),
      "image/jpeg",
      0.9,
    );
    setFlash(true);
    setTimeout(() => setFlash(false), 140);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Camera" className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="relative min-h-0 flex-1">
        <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
        {flash && <div aria-hidden="true" className="absolute inset-0 bg-white/70" />}
        <button
          type="button"
          aria-label="Close camera"
          onClick={onClose}
          className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] flex size-11 items-center justify-center rounded-full bg-black/50 backdrop-blur"
        >
          <Xmark className="size-6" />
        </button>
        {error && (
          <div className="absolute inset-x-4 top-20">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
      </div>

      {/* Shots so far, newest last, scrolling sideways. */}
      {taken.length > 0 && (
        <div className="flex gap-2 overflow-x-auto bg-black px-4 pt-3">
          {taken.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt={`Photo ${i + 1}`} className="size-14 shrink-0 rounded-lg object-cover ring-1 ring-white/30" />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between bg-black px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <span className="num w-20 text-sm text-white/70">{taken.length} / {taken.length + remaining}</span>
        <button
          type="button"
          onClick={shoot}
          disabled={remaining <= 0 || !!error}
          aria-label="Take photo"
          className="size-[72px] rounded-full border-4 border-white bg-white/20 transition-transform active:scale-90 disabled:opacity-40"
        />
        <button
          type="button"
          onClick={onClose}
          className="inline-flex w-20 items-center justify-end gap-1 font-semibold text-lime"
        >
          <Check className="size-5" /> Done
        </button>
      </div>
    </div>
  );
}
