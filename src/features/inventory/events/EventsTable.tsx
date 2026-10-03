import * as React from "react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { Button, Table, Td, Th, cn } from "~/components/win95";
import { auditEventsQuery } from "~/api/queries";
import type { AuditEventParams } from "~/api/endpoints/audit";
import { ApiError } from "~/api/client";
import type { AuditEvent } from "~/api/types";
import { dateTime } from "../format";
import { EventDetailsDialog } from "./EventDetailsDialog";
import {
  OUTCOME_TEXT,
  TARGET_TYPE_LABEL,
  eventActor,
  eventLabel,
  eventSummary,
  outcomeClass,
} from "./eventLabels";

/** The audit log for `params`, newest first, with "Load older events" paging.
 *  Admin only - render it only when `useAuth().isAdmin`. */
export function EventsTable({
  params,
  hideType = false,
  emptyText = "No events recorded yet.",
  wrapperClassName,
}: {
  params: AuditEventParams;
  /** drop the Type column (every row is the same kind, e.g. a VM's own tab) */
  hideType?: boolean;
  emptyText?: string;
  wrapperClassName?: string;
}) {
  const events = useInfiniteQuery({
    ...auditEventsQuery(params),
    placeholderData: keepPreviousData,
  });
  const [details, setDetails] = React.useState<AuditEvent | null>(null);

  const rows = React.useMemo(
    () => events.data?.pages.flatMap((p) => p.items) ?? [],
    [events.data],
  );
  const cols = hideType ? 7 : 8;

  if (events.isError) {
    return (
      <p className="text-danger">
        {events.error instanceof ApiError
          ? events.error.message
          : "Could not load the events."}
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="bevel-thin-sunken bg-window p-3 text-center text-disabled-text">
        {events.isLoading ? "Loading…" : emptyText}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Table className="text-xs" wrapperClassName={wrapperClassName}>
        <thead>
          <tr>
            <Th className="w-[150px]">Time</Th>
            <Th className="w-[160px]">Event</Th>
            {hideType ? null : <Th className="w-[90px]">Type</Th>}
            <Th className="w-[150px]">Target</Th>
            <Th className="w-[140px]">Initiated by</Th>
            <Th className="w-[80px]">Outcome</Th>
            <Th>Change</Th>
            <Th className="w-[1%]" />
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const summary = eventSummary(e);
            return (
              <React.Fragment key={e.id}>
                <tr>
                  <Td className="whitespace-nowrap">{dateTime(e.occurredAt)}</Td>
                  <Td>{eventLabel(e.action)}</Td>
                  {hideType ? null : (
                    <Td className="whitespace-nowrap">
                      {TARGET_TYPE_LABEL[e.targetType] ?? e.targetType}
                    </Td>
                  )}
                  <Td className="truncate">{e.targetName ?? "-"}</Td>
                  <Td
                    className={cn(
                      "truncate",
                      e.actorType === "system" && "text-disabled-text",
                    )}
                  >
                    {eventActor(e)}
                  </Td>
                  <Td className={cn(outcomeClass(e.outcome), "whitespace-nowrap")}>
                    {OUTCOME_TEXT[e.outcome]}
                  </Td>
                  <Td className="max-w-[320px] truncate" title={summary || undefined}>
                    {summary || "-"}
                  </Td>
                  <Td>
                    <Button
                      className="min-w-0 px-2 whitespace-nowrap"
                      onClick={() => setDetails(e)}
                    >
                      Details
                    </Button>
                  </Td>
                </tr>
                {e.error ? (
                  <tr>
                    <Td />
                    <td colSpan={cols - 1} className="px-1 pb-1 text-danger">
                      {e.error}
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </Table>

      <div className="flex items-center justify-between">
        <p className="text-disabled-text">
          {rows.length} event{rows.length === 1 ? "" : "s"}
          {events.hasNextPage ? " shown" : ""}.
        </p>
        {events.hasNextPage ? (
          <Button
            className="min-w-0 px-2"
            disabled={events.isFetchingNextPage}
            onClick={() => events.fetchNextPage()}
          >
            {events.isFetchingNextPage ? "Loading…" : "Load older events"}
          </Button>
        ) : null}
      </div>

      {details ? (
        <EventDetailsDialog event={details} onClose={() => setDetails(null)} />
      ) : null}
    </div>
  );
}
