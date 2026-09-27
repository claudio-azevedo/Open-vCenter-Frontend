import type {
  AgentBinary,
  Folder,
  HostHardwareInventory,
  Iso,
  TagColor,
  Template,
  Vlan,
  VmDisk,
  VmNic,
  VmSnapshot,
  VmState,
} from "~/api/types";
import { DEMO_STATE_VERSION } from "./model";
import type {
  DemoCluster,
  DemoHardware,
  DemoHost,
  DemoState,
  DemoTask,
  DemoVm,
  DemoVolume,
  TaskOutcome,
} from "./model";
import { Rng, hash32, randomSeed, uuid } from "./random";
import { diskFileName, vmFolderFor } from "./paths";
import { taskProfile } from "./taskProfiles";

/**
 * Random initial inventory for demo mode:
 *   2-5 clusters × 2-5 hosts, 2-6 standalone hosts, 5-10 VMs per host,
 *   plus folders, VLANs, templates, ISOs, agent builds, a few hours of task
 *   history and one long export still running.
 * Every host is online with a connected agent.
 */

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const GB = 1024 ** 3;
export const TB = 1024 ** 4;

export const ACTIVE_AGENT_VERSION = "1.4.2";
const OLD_AGENT_VERSION = "1.3.9";
const DOMAIN = "corp.example";

export const DEMO_OPERATORS = [
  "alice.santos@contoso.com",
  "bruno.lima@contoso.com",
  "carla.mendes@contoso.com",
  "ops-automation@contoso.com",
];

// ---- profiles ---------------------------------------------------------------

interface SiteProfile {
  name: string;
  /** VM name prefix. */
  tag: string;
  /** Second octet of the site's 10.x.0.0/16. */
  net: number;
  roles: string[];
  folders: string[];
}

const CLUSTER_PROFILES: SiteProfile[] = [
  {
    name: "CL-PROD-01",
    tag: "PRD",
    net: 11,
    roles: ["APP", "SQL", "WEB", "DC", "FS", "ERP", "CRM", "API", "MQ", "REDIS", "LB", "SIEM", "EXCH", "RDS", "CA"],
    folders: ["Production", "Databases", "Infrastructure"],
  },
  {
    name: "CL-PROD-02",
    tag: "PRD",
    net: 12,
    roles: ["APP", "SQL", "WEB", "API", "MQ", "REDIS", "LB", "ERP", "BI", "ETL"],
    folders: ["Production", "Databases"],
  },
  {
    name: "CL-DEV-01",
    tag: "DEV",
    net: 21,
    roles: ["BUILD", "GITLAB", "JENKINS", "APP", "SQL", "WEB", "API", "QA", "SONAR", "NEXUS"],
    folders: ["Development", "CI-CD"],
  },
  {
    name: "CL-DR-01",
    tag: "DR",
    net: 31,
    roles: ["DC", "SQL", "APP", "FS", "WEB", "REPL"],
    folders: ["Disaster Recovery"],
  },
  {
    name: "CL-VDI-01",
    tag: "VDI",
    net: 41,
    roles: ["WIN11", "WIN11", "WIN11", "BROKER", "PROFILE"],
    folders: ["Desktops"],
  },
  {
    name: "CL-EDGE-01",
    tag: "EDG",
    net: 51,
    roles: ["FW", "PROXY", "DNS", "VPN", "NTP", "LB"],
    folders: ["Network Services"],
  },
];

const STANDALONE_PROFILES: SiteProfile[] = [
  { name: "HV-BRANCH-SP", tag: "SP", net: 101, roles: ["DC", "FS", "PRINT", "APP", "WSUS"], folders: ["Branch Services"] },
  { name: "HV-BRANCH-RJ", tag: "RJ", net: 102, roles: ["DC", "FS", "PRINT", "APP", "NVR"], folders: ["Branch Services"] },
  { name: "HV-BRANCH-POA", tag: "POA", net: 103, roles: ["DC", "FS", "APP", "PRINT"], folders: [] },
  { name: "HV-LAB-01", tag: "LAB", net: 111, roles: ["LAB", "TEST", "DEV", "K8S", "WEB"], folders: ["Lab"] },
  { name: "HV-LAB-02", tag: "LAB", net: 112, roles: ["LAB", "TEST", "K8S", "SQL"], folders: [] },
  { name: "HV-EDGE-01", tag: "EDG", net: 121, roles: ["FW", "DNS", "PROXY", "NTP"], folders: [] },
  { name: "HV-TEST-01", tag: "TST", net: 131, roles: ["TEST", "APP", "WEB", "SQL"], folders: ["Testing"] },
  { name: "HV-BACKUP-01", tag: "BKP", net: 141, roles: ["BKP", "REPO", "PROXY"], folders: [] },
];

const LINUX_ROLES = new Set([
  "REDIS", "MQ", "LB", "GITLAB", "JENKINS", "SONAR", "NEXUS", "PROXY", "DNS",
  "NTP", "FW", "VPN", "K8S", "NVR", "REPO", "ETL",
]);

/** Which folder a role gravitates to, when the site has it. */
const ROLE_FOLDER: Record<string, string> = {
  SQL: "Databases", REDIS: "Databases", MQ: "Databases",
  DC: "Infrastructure", FS: "Infrastructure", CA: "Infrastructure",
  SIEM: "Infrastructure", EXCH: "Infrastructure",
  BUILD: "CI-CD", GITLAB: "CI-CD", JENKINS: "CI-CD", SONAR: "CI-CD", NEXUS: "CI-CD",
};

const VM_NOTES = [
  "Owner: Finance team. Maintenance window: Sunday 02:00-04:00.",
  "Do not power off without notifying the on-call DBA.",
  "Patched monthly by WSUS - ring 2.",
  "Legacy workload - migration planned for Q4.",
  "Backed up nightly (Veeam job BKP-DAILY-01).",
  "Contact: platform-team@contoso.com",
];

const SNAPSHOT_NAMES = [
  "Before monthly patching",
  "Pre-upgrade",
  "Before app release 3.2",
  "Baseline after install",
  "Before driver update",
];

const TEMPLATE_DEFS = [
  { name: "_TEMPLATE_WIN2022_BASE", guestOs: "Windows Server 2022 Datacenter", cpu: 2, memMb: 4096, prov: 127, disk: 21 },
  { name: "_TEMPLATE_WIN2025_CORE", guestOs: "Windows Server 2025 Datacenter (Core)", cpu: 2, memMb: 4096, prov: 80, disk: 12 },
  { name: "_TEMPLATE_UBUNTU2404", guestOs: "Ubuntu 24.04 LTS", cpu: 2, memMb: 2048, prov: 40, disk: 5 },
  { name: "_TEMPLATE_RHEL94", guestOs: "Red Hat Enterprise Linux 9.4", cpu: 2, memMb: 4096, prov: 60, disk: 7 },
];

const ISO_FILES = [
  { name: "SERVER_2022_EVAL_x64FRE_en-us.iso", gb: 4.7 },
  { name: "SERVER_2025_EVAL_x64FRE_en-us.iso", gb: 5.6 },
  { name: "Win11_24H2_English_x64.iso", gb: 5.4 },
  { name: "ubuntu-24.04.1-live-server-amd64.iso", gb: 2.6 },
  { name: "rhel-9.4-x86_64-dvd.iso", gb: 10.2 },
  { name: "virtio-win-0.1.262.iso", gb: 0.7 },
];

const VLAN_DEFS = [
  { name: "MGMT", vlanId: 10, description: "Management network" },
  { name: "SERVERS", vlanId: 20, description: "Server VLAN" },
  { name: "DMZ", vlanId: 30, description: "Internet-facing services" },
  { name: "BACKUP", vlanId: 40, description: "Backup traffic" },
  { name: "VDI", vlanId: 50, description: "Virtual desktops" },
];

const SERVER_MODELS = [
  { manufacturer: "Dell Inc.", model: "PowerEdge R750" },
  { manufacturer: "Dell Inc.", model: "PowerEdge R760" },
  { manufacturer: "HPE", model: "ProLiant DL380 Gen10 Plus" },
  { manufacturer: "Lenovo", model: "ThinkSystem SR650 V2" },
];

const CPU_MODELS = [
  { model: "Intel(R) Xeon(R) Gold 6338 CPU @ 2.00GHz", cores: 32 },
  { model: "Intel(R) Xeon(R) Gold 6430 CPU @ 2.10GHz", cores: 32 },
  { model: "Intel(R) Xeon(R) Silver 4314 CPU @ 2.40GHz", cores: 16 },
  { model: "AMD EPYC 7543 32-Core Processor", cores: 32 },
];

const OS_BUILDS = [
  { caption: "Microsoft Windows Server 2022 Datacenter", version: "10.0.20348" },
  { caption: "Microsoft Windows Server 2025 Datacenter", version: "10.0.26100" },
];

// ---- small builders -----------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, "0");

function rngUuid(rng: Rng): string {
  const h = rng.hex(32).split("");
  h[12] = "4";
  h[16] = "89ab"[parseInt(h[16], 16) & 3];
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

function shortId(rng: Rng): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += rng.pick(chars.split(""));
  return s;
}

function volume(path: string, label: string, totalTb: number, freeRatio: number): DemoVolume {
  const totalBytes = Math.round(totalTb * TB);
  return { path, label, totalBytes, freeBytes: Math.round(totalBytes * freeRatio) };
}

function mac(rng: Rng, prefix: string): string {
  return `${prefix}:${rng.hex(6).match(/../g)!.join(":")}`.toUpperCase();
}

export function generateHardware(
  rng: Rng,
  clustered: boolean,
  now: number,
): DemoHardware {
  const cpu = rng.pick(CPU_MODELS);
  const sockets = clustered ? 2 : rng.pick([1, 2]);
  const cores = cpu.cores * sockets;
  const nic = (
    name: string,
    description: string,
    speedBps: number,
    connected: boolean,
  ): HostHardwareInventory["network"][number] => ({
    name,
    description,
    mac: mac(rng, rng.pick(["B8:CE:F6", "3C:FD:FE", "F4:E9:D4"])),
    speedBps: connected ? speedBps : 0,
    connected,
    status: connected ? "Up" : "Disconnected",
    linkSpeed: connected ? `${speedBps / 1e9} Gbps` : null,
    driverVersion: rng.pick(["3.10.52295.0", "1.12.1.0", "4.1.227.0"]),
    driverDate: rng.pick(["2025-03-14", "2024-11-02", "2025-06-20"]),
    driverProvider: description.startsWith("Mellanox") ? "Mellanox" : description.split(" ")[0],
    firmwareVersion: rng.pick(["14.32.1010", "22.5.7", "1.3212.0"]),
  });

  const network = clustered
    ? [
        nic("SLOT 3 Port 1", "Mellanox ConnectX-4 Lx Ethernet Adapter", 25e9, true),
        nic("SLOT 3 Port 2", "Mellanox ConnectX-4 Lx Ethernet Adapter #2", 25e9, true),
        nic("Embedded NIC 1", "Broadcom NetXtreme Gigabit Ethernet", 1e9, true),
        nic("Embedded NIC 2", "Broadcom NetXtreme Gigabit Ethernet #2", 1e9, false),
      ]
    : [
        nic("Embedded NIC 1", "Intel(R) Ethernet Controller X710 for 10GbE SFP+", 10e9, true),
        nic("Embedded NIC 2", "Intel(R) Ethernet Controller X710 for 10GbE SFP+ #2", 10e9, rng.chance(0.5)),
      ];

  const vSwitches: NonNullable<HostHardwareInventory["vSwitches"]> = clustered
    ? [
        {
          name: "vSwitch-SET",
          id: rngUuid(rng),
          type: "External",
          netAdapter: null,
          allowManagementOS: true,
          embeddedTeaming: true,
          teamMembers: ["SLOT 3 Port 1", "SLOT 3 Port 2"],
          loadBalancingAlgorithm: "HyperVPort",
          bandwidthReservationMode: "Weight",
        },
        { name: "vSwitch-Internal", id: rngUuid(rng), type: "Internal", allowManagementOS: true },
      ]
    : [
        {
          name: "vSwitch-External",
          id: rngUuid(rng),
          type: "External",
          netAdapter: "Embedded NIC 1",
          allowManagementOS: true,
          embeddedTeaming: false,
          bandwidthReservationMode: "Absolute",
        },
      ];

  const hbas: NonNullable<HostHardwareInventory["hbas"]> = clustered
    ? [0, 1].map((port) => ({
        manufacturer: "Emulex Corporation",
        model: "LPe32002-M2",
        modelDescription: "Emulex LightPulse LPe32002-M2 2-Port 32Gb Fibre Channel Adapter",
        serialNumber: `FC${rng.hex(8).toUpperCase()}`,
        driverVersion: "14.2.539.0",
        firmwareVersion: "14.2.539.14",
        hardwareVersion: "0000000B",
        nodeWWN: `20:00:00:10:9B:${rng.hex(6).match(/../g)!.join(":").toUpperCase()}`,
        portWWN: `10:00:00:10:9B:${rng.hex(4).match(/../g)!.join(":").toUpperCase()}:0${port}`,
        state: "Online",
        speed: "32 Gbit/s",
        connectionType: "Fabric",
      }))
    : [];

  return {
    cpu: { model: cpu.model, sockets, cores, logical: cores * 2 },
    memoryBytes: rng.pick(clustered ? [384, 512, 768, 1024] : [128, 192, 256]) * GB,
    os: rng.pick(OS_BUILDS),
    network,
    vSwitches,
    hbas,
    system: rng.pick(SERVER_MODELS),
    bootTime: new Date(now - rng.int(3, 90) * DAY - rng.int(0, 23) * HOUR).toISOString(),
  };
}

function localVolumes(rng: Rng, clustered: boolean): DemoVolume[] {
  const system = volume("C:\\", "System", 0.47, rng.float(0.45, 0.7));
  if (clustered) return [system];
  const vols = [system, volume("D:\\", "Data", rng.pick([1.92, 3.84]), rng.float(0.3, 0.65))];
  if (rng.chance(0.4)) vols.push(volume("E:\\", "VMS-2", 1.92, rng.float(0.5, 0.9)));
  return vols;
}

function standaloneDefaultVmPath(rng: Rng): string {
  return rng.chance(0.2)
    ? "C:\\ProgramData\\Microsoft\\Windows\\Hyper-V"
    : "D:\\Hyper-V\\Virtual Machines";
}

/** A brand-new host record (Hosts Management ▸ Add Host): its agent checks in
 *  after `connectAt`, see `connectHost`. */
export function newHostRecord(input: {
  name: string;
  clusterId: string | null;
  now: number;
}): DemoHost {
  const rng = new Rng(hash32(`${input.name}:${input.now}`));
  return {
    id: uuid(),
    shortId: shortId(rng),
    clusterId: input.clusterId,
    name: input.name,
    fqdn: null,
    ipAddress: null,
    hypervisor: "hyperv",
    agentVersion: null,
    // gives the viewer time to look at the "Setup Agent" tab
    connectAt: input.now + 45_000,
    offlineFrom: null,
    offlineUntil: null,
    hardware: null,
    localVolumes: localVolumes(rng, !!input.clusterId),
    defaultVmPath: "D:\\Hyper-V\\Virtual Machines",
    nodeState: "Up",
    memBase: rng.float(0.2, 0.35),
  };
}

/** What the simulated agent reports on its first check-in. */
export function connectHost(host: DemoHost, now: number): void {
  const rng = new Rng(hash32(`${host.id}:connect`));
  host.fqdn = `${host.name.toLowerCase()}.${DOMAIN}`;
  host.ipAddress = `10.200.0.${rng.int(10, 250)}`;
  host.agentVersion = ACTIVE_AGENT_VERSION;
  host.hardware = generateHardware(rng, !!host.clusterId, now);
  host.hardware.bootTime = new Date(now - rng.int(1, 5) * DAY).toISOString();
}

// ---- the generator ---------------------------------------------------------------

export function generateDemoState(now = Date.now(), seed = randomSeed()): DemoState {
  const rng = new Rng(seed);
  const state: DemoState = {
    version: DEMO_STATE_VERSION,
    seed,
    createdAt: now,
    clusters: [],
    hosts: [],
    folders: [],
    vlans: [],
    tagCategories: [],
    tags: [],
    vms: [],
    templates: [],
    isos: [],
    tasks: [],
    agentBinaries: [],
  };

  // ---- tag catalog: OS + Datacenter categories and a few standalone tags ----
  const addCategory = (name: string) => {
    const c = { id: rngUuid(rng), name };
    state.tagCategories.push(c);
    return c.id;
  };
  const addTag = (name: string, categoryId: string | null, color: TagColor) => {
    const t = { id: rngUuid(rng), name, categoryId, color };
    state.tags.push(t);
    return t.id;
  };
  const osCategory = addCategory("OS");
  const osTag = {
    windows: addTag("Windows", osCategory, "blue"),
    linux: addTag("Linux", osCategory, "orange"),
  };
  addTag("Others", osCategory, "gray");
  addTag("Appliances", osCategory, "purple");
  const dcCategory = addCategory("Datacenter");
  const dcTags = (["teal", "navy", "green"] as const).map((color, i) =>
    addTag(`Datacenter-${i + 1}`, dcCategory, color),
  );
  const looseTags = (
    [
      ["production", "red"],
      ["backup", "yellow"],
      ["pci-scope", "pink"],
    ] as const
  ).map(([name, color]) => addTag(name, null, color));
  // each site sits in one datacenter
  const siteDc = new Map<string, string>();
  const dcTagFor = (site: string) => {
    if (!siteDc.has(site)) siteDc.set(site, dcTags[siteDc.size % dcTags.length]);
    return siteDc.get(site)!;
  };

  const nameCounters = new Map<string, number>();
  const nextVmName = (tag: string, role: string) => {
    const key = `${tag}-${role}`;
    const n = (nameCounters.get(key) ?? 0) + 1;
    nameCounters.set(key, n);
    return `${key}-${pad2(n)}`;
  };

  const addVlans = (scope: { clusterId?: string; hostId?: string }, defs: typeof VLAN_DEFS) => {
    const defaultTag = defs.find((d) => d.vlanId === 20)?.vlanId ?? defs[0]?.vlanId;
    for (const d of defs) {
      state.vlans.push({
        id: rngUuid(rng),
        name: d.name,
        vlanId: d.vlanId,
        description: d.description,
        isDefault: d.vlanId === defaultTag,
        clusterId: scope.clusterId ?? null,
        hostId: scope.hostId ?? null,
      });
    }
  };

  const addFolders = (
    scope: { clusterId?: string; hostId?: string },
    names: string[],
  ): Folder[] =>
    names.map((name) => {
      const f: Folder = {
        id: rngUuid(rng),
        name,
        clusterId: scope.clusterId ?? null,
        hostId: scope.hostId ?? null,
      };
      state.folders.push(f);
      return f;
    });

  const addIsos = (host: DemoHost, root: string): Iso[] =>
    rng.shuffle(ISO_FILES)
      .slice(0, rng.int(3, 5))
      .map((f) => {
        const path = `${root}\\${f.name}`;
        const id = [0, 1, 2, 3]
          .map((i) => hash32(`${host.id}:${path}:${i}`).toString(16).padStart(8, "0"))
          .join("");
        const iso: Iso = {
          id,
          hostId: host.id,
          name: f.name,
          path,
          sizeBytes: Math.round(f.gb * GB),
          checksum: id,
        };
        state.isos.push(iso);
        return iso;
      });

  const addTemplates = (host: DemoHost, root: string, count: number) => {
    for (const t of rng.shuffle(TEMPLATE_DEFS).slice(0, count)) {
      state.templates.push({
        id: rngUuid(rng),
        hostId: host.id,
        name: t.name,
        path: `${root}\\${t.name}`,
        sizeBytes: t.prov * GB,
        diskSizeBytes: t.disk * GB,
        notes: `Sysprepped ${t.guestOs} image, patched ${new Date(now - rng.int(10, 60) * DAY).toISOString().slice(0, 7)}.`,
        cpuCount: t.cpu,
        memoryMb: t.memMb,
        guestOs: t.guestOs,
        createdAt: new Date(now - rng.int(5, 120) * DAY).toISOString(),
      } satisfies Template);
    }
  };

  const makeHost = (
    name: string,
    net: number,
    index: number,
    clusterId: string | null,
  ): DemoHost => {
    const clustered = !!clusterId;
    const host: DemoHost = {
      id: rngUuid(rng),
      shortId: shortId(rng),
      clusterId,
      name,
      fqdn: `${name.toLowerCase()}.${DOMAIN}`,
      ipAddress: `10.${net}.0.${10 + index}`,
      hypervisor: "hyperv",
      agentVersion: rng.chance(0.85) ? ACTIVE_AGENT_VERSION : OLD_AGENT_VERSION,
      connectAt: now - rng.int(30, 400) * DAY,
      offlineFrom: null,
      offlineUntil: null,
      hardware: generateHardware(rng, clustered, now),
      localVolumes: localVolumes(rng, clustered),
      defaultVmPath: clustered ? "C:\\ClusterStorage\\Volume1\\VMS" : standaloneDefaultVmPath(rng),
      nodeState: "Up",
      memBase: rng.float(0.15, 0.3),
    };
    state.hosts.push(host);
    return host;
  };

  const makeVms = (input: {
    host: DemoHost;
    site: SiteProfile;
    clustered: boolean;
    placements: string[];
    defaultVmPath: string;
    vlans: Vlan[];
    folders: Folder[];
    isos: Iso[];
  }) => {
    const { host, site, clustered } = input;
    const count = rng.int(5, 10);
    for (let i = 0; i < count; i++) {
      const role = rng.pick(site.roles);
      const linux =
        LINUX_ROLES.has(role) || ((role === "API" || role === "WEB") && rng.chance(0.5));
      const name = nextVmName(site.tag, role);
      const power: VmState = rng.weighted<VmState>([
        ["Running", 72],
        ["Off", 18],
        ["Paused", 4],
        ["Saved", 6],
      ]);
      const firmware = rng.chance(linux ? 0.12 : 0.08) ? "BIOS" : "UEFI";
      const memGb =
        role === "SQL" || role === "EXCH" || role === "ERP"
          ? rng.pick([32, 64])
          : role === "WIN11"
            ? rng.pick([4, 8])
            : rng.pick([2, 4, 4, 8, 8, 16]);
      const dynamic = role === "WIN11" || rng.chance(0.3);
      const folder = vmFolderFor(input.defaultVmPath, rng.pick(input.placements), name);
      const osGb = linux ? rng.pick([40, 60, 80]) : rng.pick([80, 127, 127]);
      const disks: VmDisk[] = [
        {
          id: rngUuid(rng),
          path: `${folder}\\Virtual Hard Disks\\${diskFileName(name, "OS")}`,
          controller: firmware === "BIOS" ? "IDE 0:0" : "SCSI 0:0",
          sizeBytes: osGb * GB,
          usedBytes: Math.round(osGb * GB * rng.float(0.25, 0.7)),
          type: rng.chance(0.7) ? "Fixed" : "Dynamic",
          format: "VHDX",
        },
      ];
      if (rng.chance(0.5)) {
        const dataGb = rng.pick([100, 200, 250, 500]);
        disks.push({
          id: rngUuid(rng),
          path: `${folder}\\Virtual Hard Disks\\${diskFileName(name, "DATA")}`,
          controller: firmware === "BIOS" ? "IDE 0:1" : "SCSI 0:1",
          sizeBytes: dataGb * GB,
          usedBytes: Math.round(dataGb * GB * rng.float(0.1, 0.8)),
          type: rng.chance(0.6) ? "Fixed" : "Dynamic",
          format: "VHDX",
        });
      }
      for (const d of disks) if (d.type === "Fixed") d.usedBytes = d.sizeBytes;

      const vlan = input.vlans.length
        ? (input.vlans.find((v) => v.isDefault && rng.chance(0.7)) ?? rng.pick(input.vlans))
        : null;
      const nics: VmNic[] = [0, ...(rng.chance(0.2) ? [1] : [])].map((n) => ({
        id: rngUuid(rng),
        name: n === 0 ? "Network Adapter" : "Network Adapter 2",
        switchName: host.hardware!.vSwitches![0].name,
        vlanId: vlan?.vlanId ?? null,
        macAddress: mac(rng, "00:15:5D"),
        ipAddresses: [`10.${input.site.net}.${vlan?.vlanId ?? 1}.${rng.int(20, 250)}`],
        connected: true,
      }));

      let parentId: string | null = null;
      const snapshots: VmSnapshot[] = rng.chance(0.3)
        ? rng.shuffle(SNAPSHOT_NAMES)
            .slice(0, rng.int(1, 3))
            .map((snapName, k, all) => {
              const s: VmSnapshot = {
                id: rngUuid(rng),
                name: `${snapName} (${new Date(now - (all.length - k) * rng.int(3, 20) * DAY).toISOString().slice(0, 10)})`,
                createdAt: new Date(now - (all.length - k) * rng.int(3, 20) * DAY).toISOString(),
                parentId,
                type: rng.chance(0.8) ? "Production" : "Standard",
              };
              parentId = s.id;
              return s;
            })
        : [];

      const secureBoot = firmware === "UEFI" ? rng.chance(0.85) : null;
      const autoStart = rng.weighted([
        ["StartIfRunning", 60],
        ["Start", 20],
        ["Nothing", 20],
      ] as const);
      const inFolder =
        input.folders.find((f) => f.name === ROLE_FOLDER[role]) ??
        (input.folders.length && rng.chance(0.45) ? rng.pick(input.folders) : null);

      state.vms.push({
        id: rngUuid(rng),
        vmUuid: rngUuid(rng).toUpperCase(),
        hostId: host.id,
        folderId: inFolder?.id ?? null,
        name,
        state: power,
        firmware,
        vcpu: role === "WIN11" ? rng.pick([2, 4]) : rng.pick([1, 2, 2, 4, 4, 8, 16]),
        memory: {
          assignedBytes: memGb * GB,
          minBytes: dynamic ? (memGb >= 4 ? 1024 : 512) * 1024 ** 2 : null,
          maxBytes: dynamic ? memGb * 2 * GB : null,
          dynamic,
          demandBytes: null,
        },
        disks,
        nics,
        snapshots,
        secureBoot,
        secureBootTemplate: secureBoot ? (linux ? "Linux" : "Windows") : null,
        nestedVirtualization: role === "K8S" || rng.chance(0.05),
        autoStartAction: autoStart,
        autoStartDelaySec:
          autoStart === "Start"
            ? rng.pick([0, 30, 60, 120])
            : autoStart === "StartIfRunning"
              ? rng.pick([0, 0, 30])
              : 0,
        autoStopAction: rng.weighted([
          ["ShutDown", 70],
          ["Save", 20],
          ["TurnOff", 10],
        ] as const),
        configPath: folder,
        dvdPath: input.isos.length && rng.chance(0.1) ? rng.pick(input.isos).path : null,
        highlyAvailable: clustered && rng.chance(0.85),
        notes: rng.chance(0.3) ? rng.pick(VM_NOTES) : null,
        tagIds: [
          linux ? osTag.linux : osTag.windows,
          dcTagFor(site.tag),
          ...(rng.chance(0.35) ? [rng.pick(looseTags)] : []),
        ],
        metricsEnabled: rng.chance(0.3),
        createdAt: new Date(now - rng.int(5, 700) * DAY).toISOString(),
        runningSince:
          power === "Running" || power === "Paused"
            ? now - rng.int(2 * HOUR, 60 * DAY)
            : null,
        stoppedAt: null,
        cpuBase:
          role === "SQL" || role === "BUILD" || role === "ETL"
            ? rng.float(25, 55)
            : rng.float(3, 25),
        lock: null,
        drainedFrom: null,
      } satisfies DemoVm);
    }
  };

  // ---- clusters ----
  const clusterProfiles = [
    CLUSTER_PROFILES[0],
    ...rng.shuffle(CLUSTER_PROFILES.slice(1)),
  ].slice(0, rng.int(2, 5));

  for (const site of clusterProfiles) {
    const csvCount = rng.int(2, 4);
    const cluster: DemoCluster = {
      id: rngUuid(rng),
      name: site.name,
      hypervisor: "hyperv",
      csvs: Array.from({ length: csvCount }, (_, i) =>
        volume(
          `C:\\ClusterStorage\\Volume${i + 1}`,
          `CSV-${pad2(i + 1)}`,
          rng.pick([4, 6, 8]),
          rng.float(0.25, 0.6),
        ),
      ),
    };
    state.clusters.push(cluster);
    const scope = { clusterId: cluster.id };
    addVlans(
      scope,
      rng.shuffle(VLAN_DEFS.filter((d) => d.name !== "VDI" || site.tag === "VDI"))
        .slice(0, rng.int(3, 4))
        .sort((a, b) => a.vlanId - b.vlanId),
    );
    const vlans = state.vlans.filter((v) => v.clusterId === cluster.id);
    const folders = addFolders(scope, site.folders);

    const hostCount = rng.int(2, 5);
    const hostPrefix = `HV-${site.name.replace(/^CL-/, "").replace(/-/g, "")}`;
    const hosts = Array.from({ length: hostCount }, (_, j) =>
      makeHost(`${hostPrefix}-N${pad2(j + 1)}`, site.net, j, cluster.id),
    );
    const isoRoot = "C:\\ClusterStorage\\Volume1\\ISO";
    addTemplates(hosts[0], "C:\\ClusterStorage\\Volume1\\Templates", rng.int(2, 3));
    const placements = cluster.csvs.map((c) => c.path);
    for (const host of hosts) {
      const isos = addIsos(host, isoRoot);
      makeVms({
        host,
        site,
        clustered: true,
        placements,
        defaultVmPath: `${cluster.csvs[0].path}\\VMS`,
        vlans,
        folders,
        isos,
      });
    }
  }

  // ---- standalone hosts ----
  const standalone = rng.shuffle(STANDALONE_PROFILES).slice(0, rng.int(2, 6));
  standalone.forEach((site, i) => {
    const host = makeHost(site.name, site.net, i, null);
    const scope = { hostId: host.id };
    if (rng.chance(0.6)) {
      addVlans(scope, [
        { name: "LAN", vlanId: 100, description: "Site LAN" },
        ...(rng.chance(0.5) ? [{ name: "CAMERAS", vlanId: 110, description: "CCTV" }] : []),
      ]);
    }
    const vlans = state.vlans.filter((v) => v.hostId === host.id);
    const folders = addFolders(scope, rng.chance(0.7) ? site.folders : []);
    const dataRoot = host.localVolumes.some((v) => v.path.startsWith("D:")) ? "D:" : "C:";
    const isos = addIsos(host, `${dataRoot}\\ISO`);
    if (rng.chance(0.4)) addTemplates(host, `${dataRoot}\\Templates`, 1);
    const placements = host.localVolumes
      .map((v) => v.path)
      .filter((p) => !p.startsWith("C:") || host.defaultVmPath.startsWith("C:"));
    makeVms({
      host,
      site,
      clustered: false,
      placements,
      defaultVmPath: host.defaultVmPath,
      vlans,
      folders,
      isos,
    });
  });

  // ---- agent builds ----
  state.agentBinaries = [
    agentBinary(rng, ACTIVE_AGENT_VERSION, true, now - 9 * DAY, "FC HBA inventory, faster VM refresh."),
    agentBinary(rng, OLD_AGENT_VERSION, false, now - 41 * DAY, "Quick metrics."),
  ];

  // ---- task history + one export still running ----
  state.tasks = historyTasks(rng, state, now);
  const exportable = state.vms.find((v) => v.state === "Off" && !v.lock);
  if (exportable) {
    const profile = taskProfile("vm_export_template");
    const task: DemoTask = {
      id: rngUuid(rng),
      kind: "vm_export_template",
      targetType: "vm",
      targetId: exportable.id,
      targetName: exportable.name,
      hostId: exportable.hostId,
      requestedBy: DEMO_OPERATORS[0],
      createdAt: now - 20_000,
      queueMs: 800,
      runMs: 150_000,
      outcome: "succeeded",
      error: null,
      result: null,
      params: {
        vm_id: exportable.id,
        action: "export_template",
        template_name: `_TEMPLATE_${exportable.name.replace(/-\d+$/, "")}_GOLD`,
        notes: `Golden image built from ${exportable.name}.`,
      },
      steps: profile.steps,
      applied: false,
    };
    state.tasks.unshift(task);
    exportable.lock = {
      taskId: task.id,
      kind: task.kind,
      requestedBy: task.requestedBy,
      acquiredAt: new Date(task.createdAt).toISOString(),
    };
  }

  return state;
}

function agentBinary(
  rng: Rng,
  version: string,
  isActive: boolean,
  createdAt: number,
  notes: string,
): AgentBinary {
  return {
    id: rngUuid(rng),
    version,
    hypervisor: "hyperv",
    filename: `ovc-agent-${version}.exe`,
    sizeBytes: rng.int(13_000_000, 16_000_000),
    checksumSha256: rng.hex(64),
    contentType: "application/vnd.microsoft.portable-executable",
    storageBackend: "local",
    notes,
    isActive,
    uploadedBy: DEMO_OPERATORS[0],
    createdAt: new Date(createdAt).toISOString(),
  };
}

const HISTORY_VM_KINDS: ReadonlyArray<readonly [string, number]> = [
  ["vm_start", 14],
  ["vm_shutdown", 10],
  ["vm_restart", 8],
  ["snapshot_create", 8],
  ["vm_edit", 6],
  ["vm_migrate", 4],
  ["snapshot_remove", 3],
  ["vm_startup_change", 3],
  ["mount_dvd", 2],
  ["vm_export_template", 2],
  ["vm_enable_metrics", 2],
];

const HISTORY_HOST_KINDS: ReadonlyArray<readonly [string, number]> = [
  ["refresh_hardware", 4],
  ["refresh_inventory", 4],
  ["host_update_agent", 1],
];

const FAILURES: Record<string, string> = {
  vm_start: "Not enough memory in the system to start the virtual machine.",
  vm_shutdown: "The guest did not respond to the shutdown request (integration services not running).",
  vm_migrate: "Live migration did not succeed: the destination node has insufficient resources.",
  vm_export_template: "Export failed: not enough free space on the destination volume.",
  vm_edit: "The operation cannot be performed while the virtual machine is in its current state.",
};

function historyTasks(rng: Rng, state: DemoState, now: number): DemoTask[] {
  const tasks: DemoTask[] = [];
  const count = rng.int(35, 45);
  for (let i = 0; i < count; i++) {
    const onHost = rng.chance(0.2);
    const kind = rng.weighted(onHost ? HISTORY_HOST_KINDS : HISTORY_VM_KINDS);
    const profile = taskProfile(kind);
    // a third of the history lands within the last hour (the dock's window)
    const ago = i < count / 3 ? rng.int(2 * MIN, 55 * MIN) : rng.int(HOUR, 3 * HOUR);
    const vm = rng.pick(state.vms);
    const host = onHost ? rng.pick(state.hosts) : state.hosts.find((h) => h.id === vm.hostId)!;
    const outcome: TaskOutcome = rng.weighted([
      ["succeeded", 86],
      ["failed", FAILURES[kind] ? 10 : 0],
      ["timeout", 4],
    ] as const);
    tasks.push({
      id: rngUuid(rng),
      kind,
      targetType: onHost ? "host" : "vm",
      targetId: onHost ? host.id : vm.id,
      targetName: onHost ? host.name : vm.name,
      hostId: host.id,
      requestedBy: rng.pick(DEMO_OPERATORS),
      createdAt: now - ago,
      queueMs: rng.int(300, 1200),
      runMs: profile.runMs,
      outcome,
      error:
        outcome === "failed"
          ? FAILURES[kind]
          : outcome === "timeout"
            ? "No response from the host agent within 600 seconds."
            : null,
      result: outcome === "succeeded" ? "ok" : null,
      params: onHost ? {} : { vm_id: vm.id },
      steps: profile.steps,
      applied: true,
    });
  }
  return tasks.sort((a, b) => b.createdAt - a.createdAt);
}
