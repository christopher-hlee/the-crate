import { type SleeveInput, sleeveFor } from "@app/core";
import type { ReactNode } from "react";

/** A generated sleeve: no Discogs images, ever (rule 16). Decorative. */
export function Sleeve({ size = 160, ...input }: SleeveInput & { size?: number }) {
  const s = sleeveFor(input);
  const n = s.density;
  const shapes: ReactNode[] = [];
  const step = 100 / n;
  switch (s.pattern) {
    case "rings":
      for (let i = n; i > 0; i--) {
        shapes.push(
          <circle
            key={i}
            cx="50"
            cy="50"
            r={(i * 46) / n}
            fill="none"
            stroke={i % 2 ? s.ink : s.accent}
            strokeWidth={step / 3}
            opacity={0.85}
          />,
        );
      }
      break;
    case "stripes":
      for (let i = -n; i < n * 2; i++) {
        shapes.push(
          <rect
            key={i}
            x={i * step}
            y={-50}
            width={step / 2}
            height={200}
            fill={i % 3 ? s.ink : s.accent}
            opacity={0.8}
          />,
        );
      }
      break;
    case "grid":
      for (let x = 0; x < n; x++) {
        for (let y = 0; y < n; y++) {
          if ((x * 7 + y * 3 + s.seed) % 3 === 0) continue;
          shapes.push(
            <rect
              key={`${x}-${y}`}
              x={x * step + 1}
              y={y * step + 1}
              width={step - 2}
              height={step - 2}
              fill={(x + y) % 2 ? s.ink : s.accent}
              opacity={0.75}
            />,
          );
        }
      }
      break;
    case "dots":
      for (let x = 0; x < n; x++) {
        for (let y = 0; y < n; y++) {
          shapes.push(
            <circle
              key={`${x}-${y}`}
              cx={x * step + step / 2}
              cy={y * step + step / 2}
              r={step / 3.2}
              fill={(x * y + s.seed) % 4 ? s.ink : s.accent}
            />,
          );
        }
      }
      break;
    case "waves":
      for (let i = 0; i < n * 2; i++) {
        const y = i * (step / 2);
        shapes.push(
          <path
            key={i}
            d={`M -10 ${y} Q 25 ${y - step} 50 ${y} T 110 ${y}`}
            fill="none"
            stroke={i % 2 ? s.ink : s.accent}
            strokeWidth={step / 5}
          />,
        );
      }
      break;
    case "blocks":
      for (let i = 0; i < n; i++) {
        const w = 15 + ((s.seed >>> i) % 40);
        const h = 10 + ((s.seed >>> (i + 3)) % 35);
        const x = (s.seed >>> (i * 2)) % (100 - w);
        const y = (s.seed >>> (i * 3 + 1)) % (100 - h);
        shapes.push(
          <rect
            key={i}
            x={x}
            y={y}
            width={w}
            height={h}
            fill={i % 2 ? s.ink : s.accent}
            opacity={0.7}
          />,
        );
      }
      break;
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Generated sleeve"
      className="shrink-0 rounded-sm shadow-md"
    >
      <rect width="100" height="100" fill={s.background} />
      <g
        transform={
          s.pattern === "stripes" || s.pattern === "waves" ? `rotate(${s.angle} 50 50)` : undefined
        }
      >
        {shapes}
      </g>
      <circle cx="50" cy="50" r="13" fill={s.background} opacity="0.9" />
      <circle cx="50" cy="50" r="2" fill={s.ink} />
    </svg>
  );
}
