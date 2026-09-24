import * as React from "react";
import { KeyRound } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { clearAuthCookies, signInFn } from "~/auth";
import { Button, Dropdown, Icon, Window } from "~/components/win95";
import { THEMES, isThemeId, useTheme } from "~/preferences";

export function Login({
  redirectTo,
  error,
}: {
  redirectTo?: string;
  error?: string;
}) {
  const callSignIn = useServerFn(signInFn);
  const callClear = useServerFn(clearAuthCookies);
  const [loading, setLoading] = React.useState(false);
  const { theme, setTheme } = useTheme();

  const providerName = import.meta.env.VITE_OIDC_PROVIDER_NAME;
  const buttonLabel = providerName ? `Sign in with ${providerName}` : "Sign in";

  const signIn = async () => {
    setLoading(true);
    try {
      // drop stale cookies so an expired session can't wedge the new flow
      await callClear();
      const { url } = await callSignIn({ data: { callbackURL: redirectTo } });
      window.location.href = url;
    } catch (err) {
      // Without this, a server-side error here (bad OIDC config, a
      // better-auth API mismatch, ...) just looks like the button doing
      // nothing - no visible error, loading resets silently.
      console.error("Sign-in failed:", err);
      setLoading(false);
    }
  };

  return (
    <div className="grid h-full w-full place-items-center p-8">
      <Window
        title="Open vCenter - Sign In"
        icon={<Icon icon={KeyRound} size={14} />}
        className="w-[340px]"
      >
        <div className="flex flex-col gap-3 p-4">
          <img
            src="/ovc-logo.svg"
            alt="Open vCenter"
            className="ui-logo h-auto w-full"
          />
          <p className="text-base">
            Sign in with your organization account to continue.
          </p>
          {error ? (
            <p className="text-base text-accent">
              Sign-in failed. Please try again.
            </p>
          ) : null}
          <Button block disabled={loading} onClick={signIn}>
            {loading ? "Redirecting…" : buttonLabel}
          </Button>
          <div className="flex items-center gap-2 text-base">
            <label htmlFor="login-theme" className="shrink-0">
              Theme:
            </label>
            <Dropdown
              id="login-theme"
              className="flex-1"
              value={theme}
              onChange={(v) => isThemeId(v) && setTheme(v)}
              options={THEMES.map((t) => ({ value: t.id, label: t.label }))}
            />
          </div>
        </div>
      </Window>
    </div>
  );
}
