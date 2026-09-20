import { Dialog } from "~/components/win95";
import type { useAuth } from "~/auth";

export function AuthDebugDialog({
  auth,
  onClose,
}: {
  auth: ReturnType<typeof useAuth>;
  onClose: () => void;
}) {
  return (
    <Dialog
      title="Auth Debug"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="bevel-raised active:bevel-pressed min-w-[75px] bg-surface px-3 py-[3px]"
        >
          OK
        </button>
      }
    >
      <div className="space-y-2 text-base">
        <p className="text-disabled-text">
          Client-side auth context only - never the raw OIDC tokens, which
          stay server-side (see ~/auth/token.server.ts).
        </p>
        <pre className="bevel-sunken max-h-[50vh] overflow-auto bg-surface p-2 font-mono text-xs">
          {JSON.stringify(
            {
              isAuthenticated: auth.isAuthenticated,
              isAdmin: auth.isAdmin,
              hasAnyRole: auth.hasAnyRole,
              user: auth.user,
            },
            null,
            2,
          )}
        </pre>
      </div>
    </Dialog>
  );
}
