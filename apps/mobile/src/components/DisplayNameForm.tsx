import { displayNameProblem } from "@app/core";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useAuth } from "../lib/auth";
import { errorMessage } from "../lib/errors";
import { Button } from "./ui";

/** Choose or change the public name shown with comments. Inline, never a modal. */
export function DisplayNameForm({
  initial = "",
  prompt,
  onSaved,
  onCancel,
}: {
  initial?: string;
  prompt?: string;
  onSaved?: (displayName: string) => void;
  onCancel?: () => void;
}) {
  const { api, refresh } = useAuth();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const value = name.trim();
    const problem = displayNameProblem(value);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await api.setDisplayName(value);
      await refresh();
      setBusy(false);
      onSaved?.(saved.displayName);
    } catch (err) {
      setBusy(false);
      setError(
        errorMessage(err, "Couldn't save that name. Try again.", {
          conflict: "That name is taken. Try another.",
        }),
      );
    }
  };

  return (
    <View testID="display-name-form" className="py-1">
      {prompt ? <Text className="mb-2 text-ink">{prompt}</Text> : null}
      {error ? <Text className="mb-2 text-warn">{error}</Text> : null}
      <View className="flex-row items-center">
        <TextInput
          testID="display-name-input"
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(null);
          }}
          onSubmitEditing={() => void save()}
          returnKeyType="done"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={30}
          placeholder="Display name"
          placeholderTextColor="#a89f93"
          className="mr-2 min-h-11 flex-1 rounded-md border border-line bg-surface-2 px-3 text-ink"
        />
        <Button
          testID="display-name-save"
          label="Save"
          busy={busy}
          disabled={!name.trim()}
          onPress={() => void save()}
        />
      </View>
      <Text className="mt-1 text-xs text-ink-2">
        3 to 30 letters, numbers, spaces, dots, dashes or underscores. Shown with your comments.
      </Text>
      {onCancel ? <Button variant="ghost" label="Cancel" onPress={onCancel} /> : null}
    </View>
  );
}
