import { Redirect } from "expo-router";

/** Magic links open thecrate://auth-callback; AuthProvider exchanges the code, then we go home. */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
