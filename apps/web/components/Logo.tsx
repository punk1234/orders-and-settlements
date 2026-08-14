export function Logo({ className = '', iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-xs font-bold tracking-tight text-white dark:bg-zinc-50 dark:text-zinc-900">
        OS
      </span>
      {!iconOnly && (
        <span className="text-sm leading-tight font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          <span className="whitespace-nowrap">Orders &amp;</span>
          <br />
          Settlements
        </span>
      )}
    </span>
  );
}
