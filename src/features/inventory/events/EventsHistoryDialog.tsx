import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import { Button, Dialog, Icon, Select, TextField } from "~/components/win95";
import { qk } from "~/api/queryKeys";
import type { AuditEventParams } from "~/api/endpoints/audit";
import type { AuditOutcome, AuditTargetType } from "~/api/types";
import { EventsTable } from "./EventsTable";
import { OUTCOME_TEXT, TARGET_TYPE_LABEL } from "./eventLabels";

const SEARCH_DEBOUNCE_MS = 300;

/** View ▸ Events History (admin) - the audit log: who changed what, and when.
 *  Search and filters run on the backend (the log is paged). */
export function EventsHistoryDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [q, setQ] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [targetType, setTargetType] = React.useState<AuditTargetType | "">("");
  const [outcome, setOutcome] = React.useState<AuditOutcome | "">("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const params: AuditEventParams = {
    ...(debouncedQ ? { q: debouncedQ } : {}),
    ...(targetType ? { targetType } : {}),
    ...(outcome ? { outcome } : {}),
  };
  const filtered = Boolean(debouncedQ || targetType || outcome);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: qk.auditEventsAll() });

  return (
    <Dialog
      title="Events History"
      onClose={onClose}
      width={1040}
      footer={
        <>
          <Button onClick={refresh} className="min-w-0 px-2">
            <Icon icon={RefreshCw} size={13} /> Refresh
          </Button>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Icon icon={Search} size={14} className="text-disabled-text" />
          <TextField
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by object name or who did it…"
            className="min-w-[220px] flex-1"
          />
          <Select
            aria-label="Object type"
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as AuditTargetType | "")}
          >
            <option value="">All objects</option>
            {(Object.keys(TARGET_TYPE_LABEL) as AuditTargetType[]).map((t) => (
              <option key={t} value={t}>
                {TARGET_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as AuditOutcome | "")}
          >
            <option value="">Any outcome</option>
            {(Object.keys(OUTCOME_TEXT) as AuditOutcome[]).map((o) => (
              <option key={o} value={o}>
                {OUTCOME_TEXT[o]}
              </option>
            ))}
          </Select>
          {filtered || q ? (
            <Button
              className="min-w-0 px-2"
              onClick={() => {
                setQ("");
                setDebouncedQ("");
                setTargetType("");
                setOutcome("");
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>

        <EventsTable
          params={params}
          wrapperClassName="max-h-[440px]"
          emptyText={filtered ? "No events match the filters." : "No events recorded yet."}
        />
      </div>
    </Dialog>
  );
}
