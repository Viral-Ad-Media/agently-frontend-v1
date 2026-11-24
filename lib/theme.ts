/**
 * One theme choice for the public pages: landing, sign-in/sign-up, Terms and
 * onboarding. Dark is the default; a visitor who picks light with the
 * sun/moon toggle keeps light everywhere. The signed-in dashboard is
 * light-only for now (see components/BrandSurface.tsx) and ignores this.
 *
 * Earlier builds stored the choice under separate keys per page; those are
 * still read so a returning visitor keeps what they picked.
 */

export type ThemeChoice = "light" | "dark";

export const THEME_KEY = "agently-theme";
const LEGACY_KEYS = ["agently-landing-theme", "agently-auth-theme"];

export const DEFAULT_THEME: ThemeChoice = "dark";

export function readThemeChoice(): ThemeChoice | null {
  try {
    for (const key of [THEME_KEY, ...LEGACY_KEYS]) {
      const value = window.localStorage.getItem(key);
      if (value === "light" || value === "dark") return value;
    }
  } catch {
    /* storage unavailable: fall back to the default */
  }
  return null;
}

export function saveThemeChoice(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_KEY, choice);
    for (const key of LEGACY_KEYS) window.localStorage.removeItem(key);
  } catch {
    /* the choice still applies for this visit */
  }
}
