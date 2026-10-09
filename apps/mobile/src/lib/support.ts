// The contact point shown on the Account screen (App Store guideline 1.2).

import { supportContact } from "@app/core";

/** EXPO_PUBLIC_SUPPORT_EMAIL, or a placeholder the screen marks as one. */
export const SUPPORT = supportContact(process.env.EXPO_PUBLIC_SUPPORT_EMAIL);
