import { Dialog } from "~/components/win95";

export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      title="About Open vCenter"
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
        <img src="/ovc-logo.svg" alt="Open vCenter" className="h-auto w-full" />
        <p className="font-bold">Open vCenter (OVC)</p>
        <p>A modern web application for managing VMs.</p>
        <p>Apache 2.0 licensed Open Source Software.</p>
        <p className="text-disabled-text">See licenses and details below.</p>
        <p>
          <a
            href="https://github.com/claudio-azevedo/Open-vCenter"
            target="_blank"
            rel="noopener noreferrer"
            className="text-title-active underline"
          >
            github.com/claudio-azevedo/Open-vCenter
          </a>
        </p>
        <p>
          <a
            href="https://openvcenter.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-title-active underline"
          >
            openvcenter.com
          </a>
        </p>
      </div>
    </Dialog>
  );
}
