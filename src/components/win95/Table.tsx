import * as React from "react";
import { cn } from "./bevel";

/** Static, non-virtualised table for short lists inside detail panels. */
export function Table({
  className,
  wrapperClassName,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & {
  wrapperClassName?: string;
}) {
  return (
    <div
      className={cn("bevel-sunken bg-window overflow-auto", wrapperClassName)}
    >
      <table
        className={cn("w-full border-collapse text-base", className)}
        {...props}
      />
    </div>
  );
}

export function Th({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "ui-th px-2 py-[3px] text-left",
        "sticky top-0",
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-2 py-[2px] align-top", className)} {...props} />;
}

/** Two-column key/value list - the workhorse of the detail panels. */
export function PropertyList({
  items,
  className,
}: {
  items: Array<{ label: React.ReactNode; value: React.ReactNode }>;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-[minmax(7rem,max-content)_1fr] gap-x-4 gap-y-1 text-base",
        className,
      )}
    >
      {items.map((it, i) => (
        <React.Fragment key={i}>
          <dt className="text-disabled-text">{it.label}</dt>
          <dd className="min-w-0 break-words">{it.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
