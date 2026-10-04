import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/lib/auth";
import { initSentry, withSentry } from "../src/lib/sentry";

initSentry();

const headerStyle = { backgroundColor: "#121110" };

function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#121110" }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle,
              headerTintColor: "#f1ebe2",
              contentStyle: { backgroundColor: "#121110" },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="crates/[id]" options={{ title: "Crate" }} />
            <Stack.Screen name="login" options={{ title: "Sign in", presentation: "card" }} />
            <Stack.Screen name="changelog" options={{ title: "What's new" }} />
            <Stack.Screen name="archive" options={{ title: "Archive (preview)" }} />
            <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default withSentry(RootLayout);
