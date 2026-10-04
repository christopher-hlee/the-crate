import { APP_NAME } from "@app/core";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Alert, Platform, ScrollView, Text, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Notice, Section } from "../../src/components/ui";
import { archiveEnabled } from "../../src/lib/archive";
import { useAuth } from "../../src/lib/auth";
import { config } from "../../src/lib/config";
import { buy, configurePurchases, proPackages, restore } from "../../src/lib/purchases";

const SOURCE: Record<string, string> = {
  stripe: "the web",
  app_store: "the App Store",
  play_store: "Google Play",
};

export default function AccountScreen() {
  const { api, me, refresh, signOut } = useAuth();
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const userId = me?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;
    configurePurchases(userId)
      .then((ok) => (ok ? proPackages() : []))
      .then(setPackages)
      .catch(() => setPackages([]));
  }, [userId]);

  const purchase = async (pkg: PurchasesPackage) => {
    setBusy(pkg.identifier);
    try {
      if (await buy(pkg)) {
        setNotice("Welcome to Pro. It can take a moment to show up everywhere.");
        await refresh();
      }
    } catch (err) {
      const cancelled =
        typeof err === "object" &&
        err !== null &&
        "userCancelled" in err &&
        (err as { userCancelled?: boolean }).userCancelled;
      if (!cancelled) setNotice("The purchase didn't go through. You haven't been charged.");
    } finally {
      setBusy(null);
    }
  };

  const restorePurchases = async () => {
    setBusy("restore");
    try {
      setNotice(
        (await restore()) ? "Pro restored." : "No Pro subscription found for this store account.",
      );
      await refresh();
    } catch {
      setNotice("Couldn't restore purchases. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = () =>
    Alert.alert(
      "Delete your account?",
      "Your crates, history, notes and votes are deleted now, and everything else within 7 days. A store subscription has to be cancelled in the store.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            void api
              .deleteAccount()
              .then(signOut)
              .then(() => setNotice("Your account has been deleted."))
              .catch(() => setNotice("Couldn't delete the account. Try again.")),
        },
      ],
    );

  const openWeb = (path: string) => void WebBrowser.openBrowserAsync(`${config.apiUrl}${path}`);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="p-4">
        <Text className="mb-4 text-2xl font-semibold text-ink">Account</Text>
        {notice ? <Notice>{notice}</Notice> : null}
        {me ? (
          <Section title="Signed in">
            <Text testID="account-email" className="mb-3 text-ink">
              {me.user.email ?? "Signed in"}
            </Text>
            <Button label="Sign out" onPress={() => void signOut()} />
          </Section>
        ) : (
          <Section title="Sign in">
            <Text className="mb-3 text-ink-2">
              Sign in to keep crates and history across devices.
            </Text>
            <Button
              testID="sign-in"
              variant="primary"
              label="Sign in"
              onPress={() => router.push("/login")}
            />
          </Section>
        )}
        <Section title="Plan">
          <Text testID="plan" className="mb-1 text-lg font-semibold text-ink">
            {me?.plan === "pro" ? "Pro" : "Free"}
          </Text>
          {me?.plan === "pro" ? (
            <Text className="mb-3 text-ink-2">
              {me.planSource ? `Billed through ${SOURCE[me.planSource]}. ` : ""}
              {me.expiresAt ? `Renews or ends ${new Date(me.expiresAt).toLocaleDateString()}.` : ""}
            </Text>
          ) : (
            <Text className="mb-3 text-ink-2">
              Listening is free, always. Pro adds digging tools: tempo, key and deep-cut filters,
              seeded crates, notes, unlimited crates, a 1,000-play history and crate sheets.
            </Text>
          )}
          {me && me.plan !== "pro" && packages?.length
            ? packages.map((pkg) => (
                <View key={pkg.identifier} className="mb-2">
                  <Button
                    testID={`buy-${pkg.packageType}`}
                    variant="primary"
                    label={`${pkg.product.title || "Pro"} · ${pkg.product.priceString}`}
                    busy={busy === pkg.identifier}
                    onPress={() => void purchase(pkg)}
                  />
                </View>
              ))
            : null}
          {me && me.plan !== "pro" && packages && packages.length === 0 ? (
            <Text className="mb-2 text-ink-2">Subscriptions aren't available in this build.</Text>
          ) : null}
          {me && packages?.length ? (
            <Button
              variant="ghost"
              label="Restore purchases"
              busy={busy === "restore"}
              onPress={() => void restorePurchases()}
            />
          ) : null}
          {me?.planSource === "app_store" || me?.planSource === "play_store" ? (
            <Text className="mt-2 text-xs text-ink-2">
              Manage or cancel in{" "}
              {Platform.OS === "ios"
                ? "Settings › Apple ID › Subscriptions"
                : "Google Play › Payments & subscriptions"}
              .
            </Text>
          ) : null}
          <Text className="mt-2 text-xs text-ink-2">
            Subscriptions renew automatically until cancelled. See the Terms of Use and Privacy
            Policy below.
          </Text>
        </Section>
        <Section title="About">
          <Button variant="ghost" label="What's new" onPress={() => router.push("/changelog")} />
          {archiveEnabled ? (
            <Button
              variant="ghost"
              label="Archive (preview)"
              onPress={() => router.push("/archive")}
            />
          ) : null}
          <Button variant="ghost" label="Terms of Use" onPress={() => openWeb("/legal/terms")} />
          <Button
            variant="ghost"
            label="Privacy Policy"
            onPress={() => openWeb("/legal/privacy")}
          />
          <Button
            variant="ghost"
            label="Attribution"
            onPress={() => openWeb("/legal/attribution")}
          />
          <Button
            variant="ghost"
            label="Tempo data from GetSongBPM"
            onPress={() => void WebBrowser.openBrowserAsync("https://getsongbpm.com")}
          />
          <Text className="mt-2 text-xs text-ink-2">
            {APP_NAME} plays videos with YouTube's player and uses YouTube API Services. Record data
            comes from the Discogs data dumps (CC0).
          </Text>
        </Section>
        {me ? (
          <Section title="Danger zone">
            <Button label="Delete account" onPress={deleteAccount} />
          </Section>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
