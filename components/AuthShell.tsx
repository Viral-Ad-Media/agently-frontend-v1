import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

/**
 * Shared shell for the auth screens (v1.8, 2026-10-05).
 *
 * Pure-Tailwind port of the approved "agently-auth-pages" preview. The only
 * non-Tailwind styling is the theme block below: CSS variables plus the
 * data-theme selectors that Tailwind v3 cannot express. Everything else in
 * the auth screens is Tailwind utilities.
 *
 * Theme behaviour mirrors the preview exactly:
 *  - first load follows the OS/browser preference (no stored choice),
 *  - the sun/moon toggle stores an explicit choice in localStorage,
 *  - the choice is painted via data-theme on <html> and removed when the
 *    user goes back to following the system (i.e. never — the toggle only
 *    sets explicit choices, matching the preview).
 */

const AUTH_THEME_KEY = "agently-auth-theme";

const THEME_CSS = `
.auth-scope{
  --accent:#f2572b;--accent-hover:#d94720;--accent-soft:#fff0ea;
  --surface:#f7f7f5;--surface-raised:#ffffff;--surface-soft:#eeeeeb;
  --text:#111521;--muted:#606575;--line:#d9d9d4;--line-strong:#bfc1c5;
  --field:#ffffff;--focus:rgba(242,87,43,.22);
  --success:#267a52;--danger:#b63d28;
  --shadow:0 18px 45px rgba(12,16,27,.08);
  color-scheme:light;
}
@media (prefers-color-scheme:dark){
  html:not([data-theme="light"]) .auth-scope{
    --surface:#0d1220;--surface-raised:#131a2a;--surface-soft:#1b2335;
    --text:#f5f5f2;--muted:#a9afbd;--line:#30384a;--line-strong:#475065;
    --field:#101726;--focus:rgba(242,87,43,.3);--accent-soft:#331a16;
    --success:#74cda3;--danger:#ff9c87;
    --shadow:0 20px 55px rgba(0,0,0,.28);
    color-scheme:dark;
  }
}
html[data-theme="dark"] .auth-scope{
  --surface:#0d1220;--surface-raised:#131a2a;--surface-soft:#1b2335;
  --text:#f5f5f2;--muted:#a9afbd;--line:#30384a;--line-strong:#475065;
  --field:#101726;--focus:rgba(242,87,43,.3);--accent-soft:#331a16;
  --success:#74cda3;--danger:#ff9c87;
  --shadow:0 20px 55px rgba(0,0,0,.28);
  color-scheme:dark;
}
html[data-theme="light"] .auth-scope{color-scheme:light;}
`;

export type AuthTheme = "light" | "dark";

export function useAuthTheme(): { theme: AuthTheme; choose: (t: AuthTheme) => void } {
  const [manual, setManual] = useState<AuthTheme | null>(() => {
    try {
      const stored = window.localStorage.getItem(AUTH_THEME_KEY);
      return stored === "light" || stored === "dark" ? stored : null;
    } catch {
      return null;
    }
  });
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
    };
  }, []);

  useEffect(() => {
    if (manual) {
      document.documentElement.setAttribute("data-theme", manual);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, [manual]);

  // Never leak an auth theme choice into the rest of the app.
  useEffect(
    () => () => {
      document.documentElement.removeAttribute("data-theme");
    },
    [],
  );

  const choose = (t: AuthTheme) => {
    setManual(t);
    try {
      window.localStorage.setItem(AUTH_THEME_KEY, t);
    } catch {
      /* storage unavailable — the choice still applies for this visit */
    }
  };

  return { theme: manual ?? (systemDark ? "dark" : "light"), choose };
}

export const SunIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    aria-hidden="true"
    className="h-[15px] w-[15px]"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
  </svg>
);

export const MoonIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    aria-hidden="true"
    className="h-[15px] w-[15px]"
  >
    <path d="M20.5 15.2A9 9 0 0 1 8.8 3.5a9 9 0 1 0 11.7 11.7Z" />
  </svg>
);

export const EyeIcon = ({ hidden }: { hidden: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    aria-hidden="true"
    className="h-[18px] w-[18px]"
  >
    {hidden ? (
      <>
        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
        <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
        <path d="m2 2 20 20" />
        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      </>
    ) : (
      <>
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    )}
  </svg>
);

export const BackArrowIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    aria-hidden="true"
    className="h-4 w-4"
  >
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const MailIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    aria-hidden="true"
    className="h-[26px] w-[26px]"
  >
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const ARCHIVO = { fontFamily: '"Archivo", sans-serif' } as const;
const GROTESK = { fontFamily: '"Space Grotesk", sans-serif' } as const;

export function ThemeToggle() {
  const { theme, choose } = useAuthTheme();
  const btn = (value: AuthTheme, label: string, Icon: React.FC) =>
    (
      <button
        key={value}
        type="button"
        onClick={() => choose(value)}
        aria-label={label}
        aria-pressed={theme === value}
        className={`grid h-[29px] w-[31px] place-items-center rounded-[7px] transition ${
          theme === value
            ? "bg-[var(--surface-soft)] text-[var(--text)]"
            : "text-[var(--muted)] hover:text-[var(--text)]"
        }`}
      >
        <Icon />
      </button>
    );
  return (
    <div
      className="absolute right-[clamp(20px,3vw,40px)] top-[22px] inline-flex items-center rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-[3px] max-[760px]:right-5 max-[760px]:top-[18px]"
      aria-label="Color theme"
    >
      {btn("light", "Use light theme", SunIcon)}
      {btn("dark", "Use dark theme", MoonIcon)}
    </div>
  );
}

export function SectionHeading({
  title,
  sub,
}: {
  title: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="mb-[30px]">
      <h1
        style={ARCHIVO}
        className="m-0 text-[clamp(34px,4vw,46px)] font-semibold leading-[1] tracking-[-0.045em] text-[var(--text)] max-[760px]:text-[36px]"
      >
        {title}
      </h1>
      {sub && (
        <p className="m-0 mt-3 max-w-[540px] text-[15px] text-[var(--muted)]">
          {sub}
        </p>
      )}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="grid gap-[7px]">
      <label
        htmlFor={htmlFor}
        className="text-[14px] font-medium text-[var(--text)]"
      >
        {label}
      </label>
      {children}
      {hint}
    </div>
  );
}

export const inputClassName =
  "h-[46px] w-full rounded-[12px] border border-[var(--line)] bg-[var(--field)] px-[14px] text-[15px] text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] placeholder:opacity-70 focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--focus)]";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClassName} ${props.className ?? ""}`} />;
}

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`flex min-h-[42px] w-full items-center justify-center rounded-[12px] bg-[var(--accent)] px-4 text-[14px] font-semibold text-white shadow-[0_5px_14px_rgba(242,87,43,0.2)] transition hover:bg-[var(--accent-hover)] active:translate-y-px disabled:opacity-50 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function TextButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`cursor-pointer border-0 bg-transparent p-0 font-medium text-[var(--accent)] hover:underline hover:underline-offset-[3px] ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function ErrorAlert({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium leading-[1.45] text-[#b63d28] dark:border-red-900/40 dark:bg-red-950/40 dark:text-[#ff9c87]"
    >
      {children}
    </div>
  );
}

export function BackButton({
  onClick,
  children,
}: {
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-7 inline-flex cursor-pointer items-center gap-[7px] border-0 bg-transparent p-0 text-[14px] text-[var(--muted)] transition hover:text-[var(--text)]"
    >
      <BackArrowIcon />
      {children}
    </button>
  );
}

export function PasswordRevealButton({
  visible,
  onToggle,
  label,
}: {
  visible: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? `Hide ${label}` : `Show ${label}`}
      title={visible ? `Hide ${label}` : `Show ${label}`}
      className="absolute right-[5px] top-[5px] grid h-9 w-9 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-[var(--muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
    >
      <EyeIcon hidden={visible} />
    </button>
  );
}

export function AuthShell({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="auth-scope min-h-svh text-[var(--text)]"
      style={{
        ...GROTESK,
        background: "var(--surface)",
        fontSize: 15,
        lineHeight: 1.5,
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <style>{THEME_CSS}</style>
      <div className="relative grid min-h-svh items-center px-[clamp(28px,8vw,120px)] pb-[76px] pt-[92px] max-[760px]:items-start max-[760px]:px-5 max-[760px]:pb-[76px] max-[760px]:pt-[82px] max-[390px]:px-4">
        <ThemeToggle />
        <div
          className={`mx-auto w-full ${wide ? "max-w-[840px]" : "max-w-[470px]"}`}
        >
          {children}
        </div>
        <footer className="mx-auto mt-12 w-full max-w-[470px] pb-2 text-center text-[12px] text-[var(--muted)]">
          Need help?{" "}
          <a
            href="mailto:agentlycallsupport@gmail.com"
            className="underline underline-offset-[3px] hover:text-[var(--text)]"
          >
            agentlycallsupport@gmail.com
          </a>{" "}
          ·{" "}
          <Link to="/terms" className="underline underline-offset-[3px] hover:text-[var(--text)]">
            Terms &amp; Privacy
          </Link>
        </footer>
      </div>
    </div>
  );
}

export const ARCHIVO_FONT = ARCHIVO;
