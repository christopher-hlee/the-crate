import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useAuth } from "../lib/auth";
import { errorMessage } from "../lib/errors";
import { Button } from "./ui";

/** A timestamped note on the playing video (limits.notes). Inline, never over the player. */
export function NotePanel({
  item,
  position,
  onDone,
}: {
  item: { recordKey: string; videoId: string };
  position: () => number;
  onDone: (message: string) => void;
}) {
  const { api } = useAuth();
  const [body, setBody] = useState("");
  const [stamp, setStamp] = useState(() => Math.floor(position()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mm = `${Math.floor(stamp / 60)}:${String(stamp % 60).padStart(2, "0")}`;

  const save = async () => {
    setBusy(true);
    // A retry starts clean: the last attempt's error no longer applies.
    setError(null);
    try {
      await api.createNote({ ...item, atSeconds: stamp, body });
      onDone("Note saved.");
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the note."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View testID="note-panel" className="py-2">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-wider text-ink-2">
          Note at {mm}
        </Text>
        <Button
          variant="ghost"
          label="Use current time"
          onPress={() => setStamp(Math.floor(position()))}
        />
      </View>
      {error ? <Text className="mb-2 text-warn">{error}</Text> : null}
      <TextInput
        value={body}
        onChangeText={(t) => {
          setBody(t);
          setError(null);
        }}
        multiline
        maxLength={2000}
        placeholder="What's here? A break, a vocal, a loop…"
        placeholderTextColor="#a89f93"
        className="mb-2 min-h-20 rounded-md border border-line bg-surface-2 p-3 text-ink"
      />
      <Button
        variant="primary"
        label="Save note"
        onPress={() => void save()}
        busy={busy}
        disabled={!body.trim()}
      />
    </View>
  );
}
