import { Pressable, Text } from "react-native";

// U+FE0E keeps the hearts as text glyphs, so they take the theme colour instead of emoji red.
const FULL = "♥︎";
const EMPTY = "♡︎";

/** The favorite toggle. With `label`, the text sits inside the same touch target. */
export function HeartButton({
  favorited,
  onPress,
  label,
  testID,
  large,
  disabled,
}: {
  favorited: boolean;
  onPress: () => void;
  label?: string;
  testID?: string;
  large?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={favorited ? "Remove from favorites" : "Add to favorites"}
      accessibilityState={{ selected: favorited, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      className={`min-h-11 min-w-11 flex-row items-center justify-center px-2 ${disabled ? "opacity-50" : ""}`}
    >
      <Text
        className={`${large ? "text-3xl" : "text-xl"} ${favorited ? "text-accent" : "text-ink-2"}`}
      >
        {favorited ? FULL : EMPTY}
      </Text>
      {label ? <Text className="ml-2 text-ink">{label}</Text> : null}
    </Pressable>
  );
}
