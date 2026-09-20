import { createFileRoute, redirect } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button, Icon } from "~/components/win95";
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
    <div className="grid h-full w-full place-items-center bg-surface p-8">
      <div className="bevel-raised w-[380px] bg-surface p-[3px] pt-[2px]">
        <div className="flex h-[22px] items-center gap-1 bg-title-active bg-gradient-to-r from-title-active to-title-active-2 px-2 text-title-text">
          <Icon icon={ShieldAlert} size={14} />
          <span className="text-base font-bold">Access denied</span>
        </div>
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
      </div>
    </div>
  );
}
