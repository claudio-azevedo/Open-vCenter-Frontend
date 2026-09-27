import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import {
  Button,
  Dialog,
  Icon,
  Table,
  Td,
  TextField,
  Th,
  cn,
} from "~/components/win95";
import { hostsQuery, vmsQuery } from "~/api/queries";
import { ApiError } from "~/api/client";
import { VmIcon } from "./nodeIcons";

/** Searching starts once the trimmed query has this many characters. */
const MIN_QUERY_LENGTH = 3;
const PAGE_SIZE = 10;

const byName = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

// The last query comes back, pre-selected, when the dialog reopens (the
// Windows "Find" convention), so typing replaces it.
let lastQuery = "";

/**
 * Tree toolbar › Search: finds VMs by name. It filters the `GET /vms` list the
 * tree already holds, so it sends no request of its own and the states stay
 * live. Clicking a name hands the VM id to `onPick`, which closes the dialog
 * and reveals the VM in the tree.
 */
export function VmSearchDialog({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (vmId: string) => void;
}) {
  const vms = useQuery(vmsQuery());
  const hosts = useQuery(hostsQuery());
  const [query, setQuery] = React.useState(lastQuery);
  const [page, setPage] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.select();
  }, []);

  const term = query.trim().toLowerCase();
  const searching = term.length >= MIN_QUERY_LENGTH;

  const hostNames = React.useMemo(
    () => new Map((hosts.data ?? []).map((h) => [h.id, h.name])),
    [hosts.data],
  );
  const hostName = React.useCallback(
    (hostId: string) => hostNames.get(hostId) ?? hostId,
    [hostNames],
  );

  // Sorted by name, then host: the same name can exist on several hosts.
  const results = React.useMemo(() => {
    if (!searching) return [];
    return (vms.data ?? [])
      .filter((v) => v.name.toLowerCase().includes(term))
      .sort(
        (a, b) =>
          byName.compare(a.name, b.name) ||
          byName.compare(hostName(a.hostId), hostName(b.hostId)),
      );
  }, [vms.data, hostName, term, searching]);

  // A refetch can shrink the results below the current page.
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const first = current * PAGE_SIZE;
  const rows = results.slice(first, first + PAGE_SIZE);

  const failed = searching && vms.isError && !vms.data;
  const message = !searching
    ? "Search by VM name. Start typing to get results."
    : failed
      ? vms.error instanceof ApiError
        ? vms.error.message
        : "Could not load virtual machines."
      : vms.isLoading
        ? "Loading…"
        : results.length === 0
          ? `No virtual machines match “${query.trim()}”.`
          : null;

  return (
    <Dialog
      title="Search Virtual Machines"
      onClose={onClose}
      width={560}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Icon icon={Search} size={14} className="text-disabled-text" />
          <TextField
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => {
              lastQuery = e.target.value;
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search by VM name…"
            aria-label="VM name"
            className="flex-1"
          />
        </div>

        {/* Fixed height, so the dialog doesn't resize (and re-centre) while typing. */}
        {message ? (
          <p
            className={cn(
              "bevel-sunken grid h-[240px] place-items-center bg-window p-3 text-center",
              failed ? "text-danger" : "text-disabled-text",
            )}
          >
            {message}
          </p>
        ) : (
          <Table className="table-fixed" wrapperClassName="h-[240px]">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th className="w-[110px]">State</Th>
                <Th className="w-[160px]">Host</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((vm) => (
                <tr key={vm.id}>
                  <Td className="truncate">
                    <button
                      type="button"
                      title={vm.name}
                      onClick={() => onPick(vm.id)}
                      className="max-w-full cursor-pointer truncate text-left align-top text-link underline"
                    >
                      {vm.name}
                    </button>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <VmIcon state={vm.state} />
                      {vm.state}
                    </span>
                  </Td>
                  <Td className="truncate" title={hostName(vm.hostId)}>
                    {hostName(vm.hostId)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        <div className="flex min-h-[23px] items-center justify-between gap-2">
          <span className="text-disabled-text">
            {results.length
              ? `${first + 1}–${first + rows.length} of ${results.length} VM${results.length === 1 ? "" : "s"}`
              : null}
          </span>
          {pageCount > 1 ? (
            <div className="flex items-center gap-1">
              <Button
                className="min-w-0 px-1.5"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
                title="Previous page"
                aria-label="Previous page"
              >
                <Icon icon={ChevronLeft} size={13} />
              </Button>
              <span className="px-1 whitespace-nowrap">
                Page {current + 1} of {pageCount}
              </span>
              <Button
                className="min-w-0 px-1.5"
                disabled={current === pageCount - 1}
                onClick={() => setPage(current + 1)}
                title="Next page"
                aria-label="Next page"
              >
                <Icon icon={ChevronRight} size={13} />
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
