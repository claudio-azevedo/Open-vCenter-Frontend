import * as React from "react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-community";
import type {
  ColDef,
  GridApi,
  IRowNode,
  SelectionChangedEvent,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { Play, Power } from "lucide-react";
import {
  Button,
  ClientOnly,
  Dropdown,
  Icon,
  TextField,
} from "~/components/win95";
import type { DropdownOption } from "~/components/win95";
import type { Vm, VmState } from "~/api/types";
import { bytes, duration } from "../format";
import { useInventorySelection } from "../selection";
import { confirm } from "../confirm";
import { useVmBatchPowerAction } from "../actions/useVmBatchPowerAction";

ModuleRegistry.registerModules([AllCommunityModule]);

// A flat list view; colours come from the active theme's CSS tokens (see
// app.css / themes), so switching themes needs no grid re-render. The bevel
// comes from the wrapper div.
const gridTheme = themeQuartz.withParams({
  fontFamily: "inherit",
  fontSize: 11,
  headerFontSize: 11,
  borderRadius: 0,
  wrapperBorderRadius: 0,
  browserColorScheme: "inherit",
  foregroundColor: "var(--grid-fg)",
  backgroundColor: "var(--color-window)",
  headerBackgroundColor: "var(--grid-header-bg)",
  oddRowBackgroundColor: "var(--color-window)",
  rowHoverColor: "var(--grid-row-hover)",
  selectedRowBackgroundColor: "var(--color-selection)",
  borderColor: "var(--grid-border)",
});

const columns: ColDef<Vm>[] = [
  { field: "name", headerName: "Name", flex: 2, minWidth: 160 },
  { field: "state", headerName: "State", width: 110 },
  { field: "vcpu", headerName: "vCPU", width: 80 },
  {
    headerName: "Memory",
    width: 110,
    valueGetter: (p) => p.data?.memory.assignedBytes ?? 0,
    valueFormatter: (p) => bytes(p.value),
  },
  {
    headerName: "Uptime",
    width: 110,
    valueGetter: (p) => p.data?.uptimeSec ?? null,
    valueFormatter: (p) => duration(p.value),
  },
  {
    headerName: "Snapshot",
    width: 100,
    valueGetter: (p) => ((p.data?.snapshots.length ?? 0) > 0 ? "Yes" : "No"),
  },
  {
    headerName: "IP address",
    flex: 1,
    minWidth: 130,
    valueGetter: (p) =>
      p.data?.nics.flatMap((n) => n.ipAddresses).join(", ") || "-",
  },
];

// Sorting stays; the per-column header filters are gone (see the search box and
// the filter dropdowns in the toolbar above the grid).
const defaultColDef: ColDef = {
  sortable: true,
  filter: false,
  resizable: true,
};

const STATE_FILTER_OPTIONS: DropdownOption[] = [
  { value: "", label: "All states" },
  { value: "Running", label: "Running" },
  { value: "Off", label: "Off" },
  { value: "Paused", label: "Paused" },
  { value: "Saved", label: "Saved" },
];

const SNAPSHOT_FILTER_OPTIONS: DropdownOption[] = [
  { value: "", label: "Any snapshot" },
  { value: "yes", label: "Has snapshot" },
  { value: "no", label: "No snapshot" },
];

/** Batch power actions only make sense for VMs that are fully on or fully off. */
const BATCHABLE_STATES: ReadonlySet<VmState> = new Set<VmState>([
  "Running",
  "Off",
]);

export function VmGrid({ vms }: { vms: Vm[] }) {
  const { select } = useInventorySelection();
  const batch = useVmBatchPowerAction();

  const [search, setSearch] = React.useState("");
  const [stateFilter, setStateFilter] = React.useState("");
  const [snapshotFilter, setSnapshotFilter] = React.useState("");
  const [selectedVms, setSelectedVms] = React.useState<Vm[]>([]);
  const gridApiRef = React.useRef<GridApi<Vm> | null>(null);

  // A batch can only target VMs that share one power state; the first selected
  // row locks the rest until the selection is cleared.
  const lockedState =
    selectedVms[0]?.state === "Running"
      ? "Running"
      : selectedVms[0]?.state === "Off"
        ? "Off"
        : null;

  const filtered = React.useMemo(
    () =>
      vms.filter((v) => {
        if (stateFilter && v.state !== stateFilter) return false;
        const hasSnapshot = v.snapshots.length > 0;
        if (snapshotFilter === "yes" && !hasSnapshot) return false;
        if (snapshotFilter === "no" && hasSnapshot) return false;
        return true;
      }),
    [vms, stateFilter, snapshotFilter],
  );

  // Recreated whenever the lock changes so ag-grid re-evaluates which checkboxes
  // are still enabled.
  const rowSelection = React.useMemo(
    () =>
      ({
        mode: "multiRow",
        checkboxes: true,
        headerCheckbox: false,
        enableClickSelection: false,
        isRowSelectable: (node: IRowNode<Vm>) => {
          const s = node.data?.state;
          if (!s || !BATCHABLE_STATES.has(s)) return false;
          return !lockedState || s === lockedState;
        },
      }) as const,
    [lockedState],
  );

  const onSelectionChanged = (e: SelectionChangedEvent<Vm>) => {
    setSelectedVms(e.api.getSelectedRows());
  };

  const clearSelection = () => {
    gridApiRef.current?.deselectAll();
    setSelectedVms([]);
  };

  const runBatch = async (action: "start" | "stop") => {
    const label = action === "start" ? "Power On" : "Power Off";
    const n = selectedVms.length;
    const ok = await confirm({
      title: label,
      confirmLabel: label,
      danger: action === "stop",
      message: (
        <div className="space-y-1">
          <p>
            {label} the following {n} VM{n === 1 ? "" : "s"}?
          </p>
          <ul className="bevel-sunken max-h-40 overflow-auto bg-window p-1">
            {selectedVms.map((v) => (
              <li key={v.id}>{v.name}</li>
            ))}
          </ul>
        </div>
      ),
    });
    if (!ok) return;
    batch.mutate({ vms: selectedVms, action }, { onSettled: clearSelection });
  };

  return (
    <div className="flex h-full min-h-[240px] flex-col gap-[3px]">
      <div className="flex flex-wrap items-center gap-2">
        <TextField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search VMs…"
          className="w-52"
          aria-label="Search VMs"
        />
        <Dropdown
          value={stateFilter}
          onChange={setStateFilter}
          options={STATE_FILTER_OPTIONS}
          className="w-32"
        />
        <Dropdown
          value={snapshotFilter}
          onChange={setSnapshotFilter}
          options={SNAPSHOT_FILTER_OPTIONS}
          className="w-36"
        />
        <div className="flex-1" />
        {selectedVms.length > 0 && lockedState === "Off" && (
          <Button
            className="min-w-0 px-2"
            disabled={batch.isPending}
            onClick={() => runBatch("start")}
          >
            <Icon icon={Play} size={14} className="text-success" />
            Power On ({selectedVms.length})
          </Button>
        )}
        {selectedVms.length > 0 && lockedState === "Running" && (
          <Button
            className="min-w-0 px-2"
            disabled={batch.isPending}
            onClick={() => runBatch("stop")}
          >
            <Icon icon={Power} size={14} className="text-danger" />
            Power Off ({selectedVms.length})
          </Button>
        )}
      </div>

      <div className="bevel-sunken h-full min-h-[200px] bg-window p-[2px]">
        <ClientOnly
          fallback={<div className="p-2 text-disabled-text">Loading grid…</div>}
        >
          <AgGridReact<Vm>
            theme={gridTheme}
            rowData={filtered}
            columnDefs={columns}
            defaultColDef={defaultColDef}
            quickFilterText={search}
            rowSelection={rowSelection}
            onGridReady={(e) => {
              gridApiRef.current = e.api;
            }}
            onSelectionChanged={onSelectionChanged}
            getRowId={(p) => p.data.id}
            onRowClicked={(e) =>
              e.data && select({ kind: "vm", id: e.data.id })
            }
            onRowDoubleClicked={(e) =>
              e.data && select({ kind: "vm", id: e.data.id }, "summary")
            }
          />
        </ClientOnly>
      </div>
    </div>
  );
}
