import * as React from "react";
import { KeyRound } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { clearAuthCookies, signInFn } from "~/auth";
import { Button, Icon } from "~/components/win95";

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
    <div className="grid h-full w-full place-items-center bg-surface p-8">
      <div className="bevel-raised w-[340px] bg-surface p-[3px] pt-[2px]">
        <div className="flex h-[22px] items-center gap-1 bg-title-active bg-gradient-to-r from-title-active to-title-active-2 px-2 text-title-text">
          <Icon icon={KeyRound} size={14} />
          <span className="text-base font-bold">
            Open vCenter - Sign In
          </span>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <img
            src="/ovc-logo.svg"
            alt="Open vCenter"
            className="h-auto w-full"
          />
          <p className="text-base">
            Sign in with your organization account to continue.
          </p>
          {error ? (
            <p className="text-base text-title-active">
              Sign-in failed. Please try again.
            </p>
          ) : null}
          <Button block disabled={loading} onClick={signIn}>
            {loading ? "Redirecting…" : buttonLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
