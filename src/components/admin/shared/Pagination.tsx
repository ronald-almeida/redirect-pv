import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPage: (p: number) => void;
}

export function Pagination({ page, totalPages, totalItems, pageSize, onPage }: PaginationProps) {
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 border-t border-border px-5 py-3 text-[12px] sm:flex-row sm:items-center sm:justify-between">
      <div className="text-muted-foreground">
        Mostrando {from} a {to} de {totalItems} links
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page === 1}
          aria-label="Página anterior"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {Array.from({ length: Math.min(totalPages, 4) }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => onPage(n)}
            className={cn(
              "flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[11.5px] font-semibold",
              page === n
                ? "border border-primary/40 bg-primary/10 text-primary"
                : "border border-border bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {n}
          </button>
        ))}
        {totalPages > 4 && <span className="px-1 text-muted-foreground">…</span>}
        <button
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label="Próxima página"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
