import { ApiError } from "~/api/client";
import type { DemoVm } from "./model";
import { getDemoState } from "./store";

/**
 * `GET /vms/:id/thumbnail` in demo mode: a 320x240 JPEG drawn on a canvas - a
 * Windows lock screen or a Linux text console, depending on the VM's guest OS.
 * Like the real agent, a VM that is Off (or never reported) has no capture: 404.
 * `X-Captured-At` is the last 3-minute boundary (the demo's VM inventory cadence).
 */
export async function demoThumbnail(
  path: string,
): Promise<{ blob: Blob; headers: Headers }> {
  if (typeof window === "undefined") {
    throw new ApiError(503, "DEMO_MODE", "Demo data lives in the browser");
  }
  const id = /^\/vms\/([^/]+)\/thumbnail$/.exec(path)?.[1];
  const vm = id ? getDemoState().vms.find((v) => v.id === id) : undefined;
  if (!vm || !vm.vmUuid || vm.state === "Off") {
    throw new ApiError(404, "NOT_FOUND", "Thumbnail not found");
  }

  const now = Date.now();
  const capturedAt = now - (now % (3 * 60_000));
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 240;
  const g = canvas.getContext("2d");
  if (!g) throw new ApiError(500, "INTERNAL", "Canvas unavailable");
  if (isLinux(vm)) drawLinuxConsole(g, vm);
  else drawWindowsLockScreen(g, new Date(capturedAt));

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.7),
  );
  if (!blob) throw new ApiError(500, "INTERNAL", "Could not encode thumbnail");
  return {
    blob,
    headers: new Headers({
      "x-captured-at": new Date(capturedAt).toISOString(),
    }),
  };
}

function isLinux(vm: DemoVm): boolean {
  if (vm.guestOs) return !/windows/i.test(vm.guestOs);
  return vm.secureBootTemplate === "Linux";
}

// Colours below paint a simulated guest screen (image pixels), not app chrome,
// so theme tokens don't apply.

function drawWindowsLockScreen(g: CanvasRenderingContext2D, at: Date) {
  const bg = g.createLinearGradient(0, 0, 320, 240);
  bg.addColorStop(0, "#0b2e6b");
  bg.addColorStop(1, "#1f6fc5");
  g.fillStyle = bg;
  g.fillRect(0, 0, 320, 240);
  g.fillStyle = "#ffffff";
  g.font = "300 54px 'Segoe UI', system-ui, sans-serif";
  g.fillText(
    at.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
    }),
    24,
    150,
  );
  g.font = "16px 'Segoe UI', system-ui, sans-serif";
  g.fillText(
    at.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
    26,
    176,
  );
  g.font = "11px 'Segoe UI', system-ui, sans-serif";
  g.fillStyle = "#d6e4f5";
  g.fillText("Press Ctrl+Alt+Del to unlock.", 26, 222);
}

function drawLinuxConsole(g: CanvasRenderingContext2D, vm: DemoVm) {
  const host = vm.name.toLowerCase();
  g.fillStyle = "#000000";
  g.fillRect(0, 0, 320, 240);
  g.fillStyle = "#c0c0c0";
  g.font = "11px 'Courier New', monospace";
  const lines = [
    `${vm.guestOs ?? "Linux"} ${host} tty1`,
    "",
    `${host} login: _`,
  ];
  lines.forEach((line, i) => g.fillText(line, 6, 16 + i * 14));
}
