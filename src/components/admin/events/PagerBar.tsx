import { ChevronLeft, ChevronRight } from "lucide-react";

/** Paginação server-side simples (0-indexed) usada em Eventos e Histórico. */
export function PagerBar({
  page,
  pageSize,
  total,
  loading,
  noun = "registros",
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  noun?: string;
  onPage: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);

  return (
    <div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-[12px] sm:flex-row sm:items-center sm:justify-between">
      <span className="text-muted-foreground tabular-nums">
        {loading ? "Carregando…" : `${from}–${to} de ${total.toLocaleString("pt-BR")} ${noun}`}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPage(Math.max(0, page - 1))}
          disabled={page === 0}
          aria-label="Página anterior"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[86px] text-center tabular-nums text-muted-foreground">
          {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page + 1 >= totalPages}
          aria-label="Próxima página"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
