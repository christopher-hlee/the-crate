import { router, Stack } from "expo-router";
import { useState } from "react";
import { Platform, Text, TextInput, View } from "react-native";
import { Button, Notice } from "../src/components/ui";
import { useAuth } from "../src/lib/auth";
import { config } from "../src/lib/config";

export default function LoginScreen() {
  const { signInWithEmail, signInWithPassword, signInWithProvider, signInAsDevUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // `fn` resolving to false means the person backed out (a dismissed sign-in sheet): stay here.
  const run = async (key: string, fn: () => Promise<unknown>, done?: () => void) => {
    setBusy(key);
    setError(null);
    try {
      if ((await fn()) === false) return;
      done?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="flex-1 bg-bg p-6">
      <Stack.Screen options={{ title: "Sign in" }} />
      {error ? <Notice>{error}</Notice> : null}
      {config.authMode === "dev" ? (
        <View className="mb-6">
          <Text className="mb-2 text-ink-2">
            Development build: sign in as a made-up test user.
          </Text>
          <Button
            testID="dev-sign-in"
            variant="primary"
            label="Continue as test user"
            busy={busy === "dev"}
            onPress={() => void run("dev", signInAsDevUser, () => router.back())}
          />
        </View>
      ) : null}
      {sent ? (
        <Text className="mb-6 text-ink">
          Check your email for a sign-in link. Open it on this device.
        </Text>
      ) : (
        <View className="mb-6">
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor="#a89f93"
            className="mb-2 min-h-11 rounded-md border border-line bg-surface-2 px-3 text-ink"
          />
          {usePassword ? (
            <>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                placeholder="Password"
                placeholderTextColor="#a89f93"
                className="mb-2 min-h-11 rounded-md border border-line bg-surface-2 px-3 text-ink"
              />
              <Button
                variant="primary"
                label="Sign in"
                disabled={!email.includes("@") || !password}
                busy={busy === "password"}
                onPress={() =>
                  void run(
                    "password",
                    () => signInWithPassword(email.trim(), password),
                    () => router.back(),
                  )
                }
              />
            </>
          ) : (
            <Button
              variant="primary"
              label="Email me a sign-in link"
              disabled={!email.includes("@")}
              busy={busy === "email"}
              onPress={() =>
                void run(
                  "email",
                  () => signInWithEmail(email.trim()),
                  () => setSent(true),
                )
              }
            />
          )}
          <Button
            variant="ghost"
            label={usePassword ? "Email me a link instead" : "Use a password"}
            onPress={() => setUsePassword(!usePassword)}
          />
        </View>
      )}
      {Platform.OS === "ios" ? (
        <View className="mb-2">
          <Button
            label="Continue with Apple"
            busy={busy === "apple"}
            onPress={() =>
              void run(
                "apple",
                () => signInWithProvider("apple"),
                () => router.back(),
              )
            }
          />
        </View>
      ) : null}
      <Button
        label="Continue with Google"
        busy={busy === "google"}
        onPress={() =>
          void run(
            "google",
            () => signInWithProvider("google"),
            () => router.back(),
          )
        }
      />
    </View>
  );
}
