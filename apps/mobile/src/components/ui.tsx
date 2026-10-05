import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, type PressableProps, Text, View } from "react-native";

type ButtonProps = Omit<PressableProps, "children"> & {
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  busy?: boolean;
};

export function Button({ label, variant = "secondary", busy, disabled, ...rest }: ButtonProps) {
  const base = "min-h-11 items-center justify-center rounded-md px-4";
  const tone =
    variant === "primary"
      ? "bg-accent"
      : variant === "secondary"
        ? "border border-line bg-surface-2"
        : "bg-transparent";
  const text = variant === "primary" ? "text-accent-ink font-semibold" : "text-ink";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      className={`${base} ${tone} ${disabled ? "opacity-50" : ""}`}
      {...rest}
    >
      {busy ? <ActivityIndicator color="#f1ebe2" /> : <Text className={text}>{label}</Text>}
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
  locked,
  hint,
  testID,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  locked?: boolean;
  hint?: string;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityHint={hint}
      accessibilityState={{ selected: Boolean(active), disabled: Boolean(locked) }}
      onPress={locked ? undefined : onPress}
      className={`mb-2 mr-2 rounded-full border px-3 py-1.5 ${active ? "border-accent bg-accent" : "border-line bg-surface-2"} ${locked ? "opacity-50" : ""}`}
    >
      <Text className={active ? "text-accent-ink" : "text-ink"}>
        {locked ? `🔒 ${label}` : label}
      </Text>
    </Pressable>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View className="mb-4 rounded-lg border border-line bg-surface p-4">
      {title ? (
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-2">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <View
      accessibilityRole="alert"
      className="mb-3 rounded-md border border-warn/40 bg-surface-2 px-3 py-2"
    >
      <Text className="text-warn">{children}</Text>
    </View>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <View className="items-center px-6 py-12">
      <Text className="mb-1 text-lg font-semibold text-ink">{title}</Text>
      {body ? <Text className="text-center text-ink-2">{body}</Text> : null}
    </View>
  );
}
