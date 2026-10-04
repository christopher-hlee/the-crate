import type { Peaks } from "@app/core";
import { useMemo, useState } from "react";
import { Pressable } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";

const BARS = 120;

/** Waveform from precomputed peaks, with the played part, chop markers and tap-to-seek. */
export function Waveform({
  peaks,
  progress,
  markers,
  duration,
  onSeek,
}: {
  peaks: Peaks | null;
  progress: number;
  markers: number[];
  duration: number;
  onSeek: (seconds: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const bars = useMemo(() => {
    if (!peaks || peaks.peaks.length < 2) return [];
    const n = peaks.peaks.length / 2;
    return Array.from({ length: BARS }, (_, i) => {
      let lo = 0;
      let hi = 0;
      for (let b = Math.floor((i * n) / BARS); b < Math.floor(((i + 1) * n) / BARS); b++) {
        lo = Math.min(lo, peaks.peaks[b * 2] ?? 0);
        hi = Math.max(hi, peaks.peaks[b * 2 + 1] ?? 0);
      }
      return { lo, hi };
    });
  }, [peaks]);
  const h = 72;
  return (
    <Pressable
      testID="waveform"
      accessibilityLabel="Waveform. Tap to seek."
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onPress={(e) => width && duration && onSeek((e.nativeEvent.locationX / width) * duration)}
      className="rounded-md bg-surface-2"
    >
      <Svg width="100%" height={h} viewBox={`0 0 ${BARS} ${h}`} preserveAspectRatio="none">
        {bars.map((b, i) => (
          <Rect
            // biome-ignore lint/suspicious/noArrayIndexKey: bars are positional
            key={i}
            x={i + 0.15}
            y={((1 - b.hi) / 2) * h}
            width={0.7}
            height={Math.max(1, ((b.hi - b.lo) / 2) * h)}
            fill={i / BARS <= progress ? "#f97316" : "#a89f93"}
          />
        ))}
        {duration
          ? markers.map((m) => (
              <Line
                key={m}
                x1={(m / duration) * BARS}
                x2={(m / duration) * BARS}
                y1={0}
                y2={h}
                stroke="#f1ebe2"
                strokeWidth={0.4}
              />
            ))
          : null}
      </Svg>
    </Pressable>
  );
}
