export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <span
      role="presentation"
      className={`block animate-pulse rounded bg-zinc-200 dark:bg-zinc-800 ${className}`}
    />
  );
}

/** A row of skeleton cells matching a table with the given column widths. */
export function SkeletonTableRow({ widths }: { widths: string[] }) {
  return (
    <tr>
      {widths.map((w, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className={`h-4 ${w}`} />
        </td>
      ))}
    </tr>
  );
}
