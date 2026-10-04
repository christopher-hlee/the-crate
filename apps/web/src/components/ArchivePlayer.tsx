"use client";

// The archive player: our own audio (public-domain or CC), so a native <audio> element with a
// waveform drawn from precomputed peaks, chop markers, and WAV export of the whole recording or
// one chop (Pro). This never plays or touches YouTube media.

import { ApiError, type Asset } from "@app/api-client";
import { decodeWav, encodeWav, type Peaks, regionsFromChops, sliceAudio } from "@app/core";
import { Download, Scissors, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { saveBlob } from "@/lib/daw-export";
import { useViewer } from "@/lib/viewer";

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

export function ArchivePlayer({ asset }: { asset: Asset }) {
  const { me, isPro } = useViewer();
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Peaks | null>(null);
  const [time, setTime] = useState(0);
  const [markers, setMarkers] = useState<number[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loadedChops = useRef(false);
  const duration = asset.durationS ?? (peaks ? peaks.frames / peaks.sampleRate : 0);

  useEffect(() => {
    setPeaks(null);
    setMarkers([]);
    setTime(0);
    loadedChops.current = false;
    fetch(asset.peaksUrl, { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<Peaks>) : null))
      .then(setPeaks)
      .catch(() => setPeaks(null));
    if (me)
      api
        .chops(asset.id)
        .then((c) => setMarkers(c.markers))
        .catch(() => undefined)
        .finally(() => {
          loadedChops.current = true;
        });
  }, [asset.id, asset.peaksUrl, me]);

  // Save chop markers (signed in), debounced.
  useEffect(() => {
    if (!me || !loadedChops.current) return;
    const t = setTimeout(() => void api.saveChops(asset.id, markers).catch(() => undefined), 600);
    return () => clearTimeout(t);
  }, [markers, me, asset.id]);

  // Draw the waveform, the played part, and the markers.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const w = canvas.clientWidth * devicePixelRatio;
    const h = canvas.clientHeight * devicePixelRatio;
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    const styles = getComputedStyle(canvas);
    const ink = styles.getPropertyValue("--color-ink-2").trim() || "#a89f93";
    const accent = styles.getPropertyValue("--color-accent").trim() || "#f97316";
    if (peaks && peaks.peaks.length >= 2) {
      const n = peaks.peaks.length / 2;
      const played = duration ? time / duration : 0;
      for (let x = 0; x < w; x++) {
        const b = Math.min(n - 1, Math.floor((x / w) * n));
        const lo = peaks.peaks[b * 2] ?? 0;
        const hi = peaks.peaks[b * 2 + 1] ?? 0;
        ctx.fillStyle = x / w <= played ? accent : ink;
        const top = ((1 - hi) / 2) * h;
        ctx.fillRect(x, top, 1, Math.max(1, ((hi - lo) / 2) * h));
      }
    }
    ctx.fillStyle = accent;
    ctx.font = `${11 * devicePixelRatio}px system-ui`;
    markers.forEach((m, i) => {
      const x = duration ? (m / duration) * w : 0;
      ctx.fillRect(x, 0, Math.max(1, devicePixelRatio * 1.5), h);
      ctx.fillText(String(i + 2), x + 3 * devicePixelRatio, 12 * devicePixelRatio);
    });
  }, [peaks, time, markers, duration]);

  const addChop = useCallback(() => {
    const t = audioRef.current?.currentTime ?? 0;
    if (t <= 0 || (duration && t >= duration)) return;
    setMarkers((m) => [...m, Math.round(t * 1000) / 1000].sort((a, b) => a - b));
  }, [duration]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)))
        return;
      if (e.key === "c" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        addChop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addChop]);

  const regions = useMemo(
    () => (duration ? regionsFromChops(markers, duration) : []),
    [markers, duration],
  );

  const exportWav = async (region: (typeof regions)[number] | null) => {
    setBusy(region ? `chop-${region.index}` : "full");
    setNotice(null);
    try {
      const d = await api.assetDownload(asset.id, region ?? undefined);
      const res = await fetch(d.wavUrl, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let bytes: Uint8Array = new Uint8Array(await res.arrayBuffer());
      if (region)
        bytes = encodeWav(sliceAudio(decodeWav(bytes), region.startSeconds, region.endSeconds), 16);
      saveBlob(bytes, `${d.fileStem}.wav`, "audio/wav");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "The export failed. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3" data-testid="archive-player">
      {/* biome-ignore lint/a11y/useMediaCaption: archive recordings are music without speech captions */}
      <audio
        ref={audioRef}
        src={asset.previewUrl}
        controls
        preload="metadata"
        className="w-full"
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        data-testid="archive-audio"
      />
      <canvas
        ref={canvasRef}
        className="h-24 w-full cursor-pointer rounded-md bg-surface-2"
        aria-label="Waveform. Click to seek."
        data-testid="waveform"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const audio = audioRef.current;
          if (audio && duration)
            audio.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
        }}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="tabular-nums text-ink-2">
          {fmt(time)} / {fmt(duration)}
        </span>
        <Button size="sm" variant="outline" onClick={addChop} aria-keyshortcuts="C">
          <Scissors size={14} aria-hidden /> Chop at playhead (C)
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setMarkers((m) => m.slice(0, -1))}
          disabled={!markers.length}
        >
          <Undo2 size={14} aria-hidden /> Undo chop
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMarkers([])} disabled={!markers.length}>
          Clear chops
        </Button>
        {!me && <span className="text-ink-2">Sign in to keep your chops.</span>}
      </div>
      {notice && (
        <p role="status" className="text-sm text-warn">
          {notice}
        </p>
      )}
      <ol className="divide-y divide-line rounded-md border border-line text-sm" aria-label="Chops">
        {regions.map((r) => (
          <li key={r.index} className="flex items-center gap-3 px-3 py-1.5">
            <span className="w-14 text-ink-2">Chop {r.index}</span>
            <button
              type="button"
              className="tabular-nums underline"
              onClick={() => {
                const audio = audioRef.current;
                if (!audio) return;
                audio.currentTime = r.startSeconds;
                void audio.play();
              }}
            >
              {fmt(r.startSeconds)}–{fmt(r.endSeconds)}
            </button>
            <span className="flex-1" />
            {isPro && regions.length > 1 && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => void exportWav(r)}
              >
                <Download size={14} aria-hidden />{" "}
                {busy === `chop-${r.index}` ? "Exporting…" : "WAV"}
              </Button>
            )}
          </li>
        ))}
      </ol>
      {isPro ? (
        <Button
          variant="primary"
          size="sm"
          disabled={busy !== null}
          onClick={() => void exportWav(null)}
        >
          <Download size={14} aria-hidden /> {busy === "full" ? "Exporting…" : "Download WAV"}
        </Button>
      ) : (
        <p className="text-sm text-ink-2">
          Listening is free. WAV downloads and DAW folder export are Pro tools.
        </p>
      )}
    </div>
  );
}
