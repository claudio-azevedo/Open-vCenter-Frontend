import { createFileRoute, redirect } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button, Icon, Window } from "~/components/win95";
import { hasAnyRole, isAdminRole } from "~/auth";

export const Route = createFileRoute("/access-denied")({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: "/login" });
    // Already has access - don't strand them here.
    if (isAdminRole(context.user.roles) || hasAnyRole(context.user.roles)) {
      throw redirect({ to: "/inventory" });
    }
  },
  component: AccessDenied,
});

function AccessDenied() {
  return (
    <div className="grid h-full w-full place-items-center p-8">
      <Window
        title="Access denied"
        icon={<Icon icon={ShieldAlert} size={14} />}
        className="w-[380px]"
      >
        <div className="flex flex-col gap-3 p-4 text-base">
          <p className="font-bold">No roles assigned</p>
          <p>
            Your account is signed in but has no permissions in Open vCenter.
            Ask an <strong>ADMINISTRATOR</strong> to grant you a role.
          </p>
          <Button block onClick={() => (window.location.href = "/logout")}>
            Sign out
          </Button>
        </div>
      </Window>
    </div>
  );
}
