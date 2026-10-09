"use client";

// The Dig player's settings, folded under one button so the controls row stays short.
// Every option changes what plays next or where it starts; none touches the player itself.

import { formatDuration } from "@app/core";
import { Settings2 } from "lucide-react";
import { type PlayerSettings, SKIP_OPTIONS, START_OPTIONS } from "@/lib/player-settings";

type Props = {
  settings: PlayerSettings;
  onChange: (patch: Partial<PlayerSettings>) => void;
};

const selectClass = "rounded border border-line bg-surface px-1 py-0.5";

export function PlayerSettingsMenu({ settings, onChange }: Props) {
  return (
    <details className="relative ml-auto text-xs text-ink-2" data-testid="player-settings">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md border border-line px-2 py-1.5 hover:text-ink">
        <Settings2 size={14} aria-hidden /> Player settings
      </summary>
      <div className="mt-2 grid gap-2 rounded-md border border-line bg-surface p-3 sm:grid-cols-2">
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            className="accent-[var(--accent)]"
            checked={settings.autoAdvance}
            onChange={(e) => onChange({ autoAdvance: e.target.checked })}
          />
          Autoplay next
        </label>
        <label className="inline-flex items-center gap-1.5">
          Start at
          <select
            className={selectClass}
            value={String(settings.start)}
            onChange={(e) =>
              onChange({ start: e.target.value === "random" ? "random" : Number(e.target.value) })
            }
          >
            {START_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === 0 ? "the top" : formatDuration(s)}
              </option>
            ))}
            <option value="random">a random point</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-1.5">
          Next record after
          <select
            className={selectClass}
            value={settings.skipAfter}
            onChange={(e) => onChange({ skipAfter: Number(e.target.value) })}
          >
            {SKIP_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === 0 ? "the end" : `${formatDuration(s)} heard`}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            className="accent-[var(--accent)]"
            checked={settings.repeats}
            onChange={(e) => onChange({ repeats: e.target.checked })}
          />
          Replay records I've heard
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            className="accent-[var(--accent)]"
            checked={settings.hideComments}
            onChange={(e) => onChange({ hideComments: e.target.checked })}
          />
          Hide comments
        </label>
      </div>
    </details>
  );
}
