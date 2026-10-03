import { createApiClient } from "@app/api-client";

/** Same-origin client: the session cookie rides along. */
export const api = createApiClient({ baseUrl: "" });
