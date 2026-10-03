import { Tabs } from "expo-router";
import { type ColorValue, Text } from "react-native";

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: "#1b1917", borderTopColor: "#34302b" },
        tabBarActiveTintColor: "#f97316",
        tabBarInactiveTintColor: "#a89f93",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Dig", tabBarIcon: icon("◎"), tabBarButtonTestID: "tab-dig" }}
      />
      <Tabs.Screen
        name="crates"
        options={{ title: "Crates", tabBarIcon: icon("▤"), tabBarButtonTestID: "tab-crates" }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: "History", tabBarIcon: icon("↺"), tabBarButtonTestID: "tab-history" }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: "Account", tabBarIcon: icon("◐"), tabBarButtonTestID: "tab-account" }}
      />
    </Tabs>
  );
}
