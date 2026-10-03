import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

/** True while the device has a connection. The YouTube lane has no offline mode. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(
    () =>
      NetInfo.addEventListener((s) =>
        setOnline(s.isConnected !== false && s.isInternetReachable !== false),
      ),
    [],
  );
  return online;
}
