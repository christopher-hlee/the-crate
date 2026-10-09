import { useEffect, useRef } from "react";

/** True while the calling component is mounted, so late answers can be dropped after it goes. */
export function useMounted(): { readonly current: boolean } {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
