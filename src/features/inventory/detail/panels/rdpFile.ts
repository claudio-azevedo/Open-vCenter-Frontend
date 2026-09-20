import type { Vm } from '~/api/types'

/**
 * Contents of an `.rdp` file that opens the VM's Hyper-V console in the native
 * Windows client (mstsc). It connects to the host on port 2179 and names the VM
 * through the preconnection blob (`pcb`), exactly like `vmconnect.exe`.
 *
 * `negotiate security layer:i:0` is what makes the Hyper-V console handshake
 * work; the client still prompts for host credentials.
 */
export function vmConsoleRdpFileContent(hostAddr: string, vmGuid: string): string {
  return [
    `full address:s:${hostAddr}`,
    `pcb:s:${vmGuid}`,
    `server port:i:2179`,
    `negotiate security layer:i:0`,
    `desktop size id:i:2`,
    `keyboardhook:i:1`,
    `screen mode id:i:1`,
    `compression:i:1`,
    `session bpp:i:16`,
    `audiomode:i:2`,
    `redirectprinters:i:0`,
    `redirectlocation:i:0`,
    `redirectcomports:i:0`,
    `redirectsmartcards:i:0`,
    `redirectwebauthn:i:0`,
    `redirectclipboard:i:1`,
    `redirectposdevices:i:0`,
    `prompt for credentials:i:0`,
  ].join('\r\n')
}

/** Build and trigger a download of `<vm name>.rdp` for the Hyper-V console. */
export function downloadVmConsoleRdpFile(
  vm: Pick<Vm, 'name' | 'vmUuid'>,
  hostAddr: string,
): void {
  if (!vm.vmUuid) return
  const blob = new Blob([vmConsoleRdpFileContent(hostAddr, vm.vmUuid)], {
    type: 'application/x-rdp',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${vm.name}.rdp`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
