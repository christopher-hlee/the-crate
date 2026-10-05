import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Button } from "./ui";

const NOTE_MAX = 1000;

/** Inline note editing for a list row. `onSave` resolves to an error message, or null. */
export function ItemNoteEditor({
  initial,
  onSave,
  onClose,
}: {
  initial: string;
  onSave: (note: string | null) => Promise<string | null>;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const problem = await onSave(text.trim() || null);
    setBusy(false);
    if (problem) setError(problem);
    else onClose();
  };

  return (
    <View testID="item-note-editor" className="mt-2">
      {error ? <Text className="mb-1 text-warn">{error}</Text> : null}
      <TextInput
        testID="item-note-input"
        value={text}
        onChangeText={(t) => {
          setText(t);
          setError(null);
        }}
        multiline
        autoFocus
        maxLength={NOTE_MAX}
        placeholder="A note for yourself: the break at 1:12, a sample source…"
        placeholderTextColor="#a89f93"
        className="mb-2 min-h-16 rounded-md border border-line bg-surface-2 p-2 text-ink"
      />
      <View className="flex-row gap-2">
        <Button variant="primary" label="Save note" busy={busy} onPress={() => void save()} />
        <Button variant="ghost" label="Cancel" onPress={onClose} />
      </View>
    </View>
  );
}
