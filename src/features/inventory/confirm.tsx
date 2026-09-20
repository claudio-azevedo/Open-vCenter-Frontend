import * as React from "react";
import { Button, Dialog } from "~/components/win95";

/**
 * App-wide confirmation prompt - always the Win95 `Dialog`, never `window.confirm`.
 * `await confirm({ ... })` resolves to true/false. `<ConfirmHost/>` must be mounted
 * once (it is, in InventoryExplorer).
 *
 * `await confirmWithCheckbox({ ..., checkbox })` also renders an opt-in checkbox
 * and resolves to `{ confirmed, checked }`.
 */

interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Optional opt-in checkbox shown above the buttons (defaults to unchecked). */
  checkbox?: {
    label: React.ReactNode;
    defaultChecked?: boolean;
    /** Render the label in the destructive colour. */
    danger?: boolean;
  };
}

type Pending = ConfirmOptions & {
  resolve: (result: { confirmed: boolean; checked: boolean }) => void;
};

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function open(options: ConfirmOptions) {
  return new Promise<{ confirmed: boolean; checked: boolean }>((resolve) => {
    pending = { ...options, resolve };
    emit();
  });
}

export function confirm(options: ConfirmOptions): Promise<boolean> {
  return open(options).then((r) => r.confirmed);
}

export function confirmWithCheckbox(
  options: ConfirmOptions & {
    checkbox: NonNullable<ConfirmOptions["checkbox"]>;
  },
): Promise<{ confirmed: boolean; checked: boolean }> {
  return open(options);
}

function settle(confirmed: boolean, checked: boolean) {
  pending?.resolve({ confirmed, checked });
  pending = null;
  emit();
}

export function ConfirmHost() {
  const state = React.useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pending,
    () => pending,
  );

  const [checked, setChecked] = React.useState(false);

  // reset the checkbox to its default whenever a new prompt opens
  React.useEffect(() => {
    setChecked(state?.checkbox?.defaultChecked ?? false);
  }, [state]);

  if (!state) return null;

  return (
    <Dialog
      title={state.title}
      onClose={() => settle(false, false)}
      footer={
        <>
          <Button
            className={state.danger ? "font-bold" : ""}
            onClick={() => settle(true, checked)}
          >
            {state.confirmLabel ?? "OK"}
          </Button>
          <Button onClick={() => settle(false, false)}>
            {state.cancelLabel ?? "Cancel"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-base">{state.message}</div>
        {state.checkbox && (
          <label
            className={`flex items-center gap-2 text-base ${
              state.checkbox.danger ? "text-[#c00000]" : ""
            }`}
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            {state.checkbox.label}
          </label>
        )}
      </div>
    </Dialog>
  );
}
