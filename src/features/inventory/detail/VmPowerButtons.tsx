import { Button, Icon } from "~/components/win95";
import type { Vm } from "~/api/types";
import { TRANSITIONAL_VM_STATES } from "~/api/types";
import { actionsForState } from "../actions/powerActions";
import { useVmPowerAction } from "../actions/useVmPowerAction";
import { confirm, confirmWithCheckbox } from "../confirm";

export function VmPowerButtons({
  vm,
}: {
  vm: Pick<Vm, "id" | "name" | "state" | "lock">;
}) {
  const mutation = useVmPowerAction(vm);
  const actions = actionsForState(vm.state);
  const busy =
    mutation.isPending || TRANSITIONAL_VM_STATES.has(vm.state) || !!vm.lock;

  if (!actions.length) {
    return <span className="text-disabled-text">{vm.state}</span>;
  }

  return (
    <div className="flex items-center gap-1">
      {actions.map((action) => (
        <Button
          key={action.id}
          disabled={busy}
          className="min-w-0 px-2"
          onClick={async () => {
            if (action.id === "delete") {
              const { confirmed, checked } = await confirmWithCheckbox({
                title: `Delete - ${vm.name}`,
                message: (
                  <span>
                    Delete <strong>{vm.name}</strong> permanently? This cannot
                    be undone.
                  </span>
                ),
                confirmLabel: "Delete",
                danger: true,
                checkbox: {
                  label:
                    "Also delete all its files and folders from disk (can't be undone)",
                  danger: true,
                },
              });
              if (!confirmed) return;
              mutation.mutate({ action: "delete", removeFiles: checked });
              return;
            }
            if (
              action.confirm &&
              !(await confirm({
                title: `${action.label} - ${vm.name}`,
                message: action.confirm,
                confirmLabel: action.label,
                danger: action.destructive,
              }))
            ) {
              return;
            }
            mutation.mutate({ action: action.id });
          }}
        >
          <Icon icon={action.icon} size={14} className={action.color} />
          {action.label}
        </Button>
      ))}
    </div>
  );
}
