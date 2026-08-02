import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

/**
 * Rodapé de scroll infinito: sentinela via IntersectionObserver e botão
 * "Carregar mais" como alternativa acessível.
 */
export function InfiniteFooter({
  loaded,
  total,
  noun = "registros",
  hasMore,
  loading,
  onLoadMore,
}: {
  loaded: number;
  total: number;
  noun?: string;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore || loading) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: "320px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, onLoadMore]);

  return (
    <div className="flex flex-col items-center gap-2 border-t border-border px-4 py-3 text-[12px]">
      <div ref={ref} aria-hidden className="h-px w-full" />
      <span className="text-muted-foreground tabular-nums">
        {loading && loaded === 0
          ? "Carregando…"
          : `${loaded.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} ${noun}`}
      </span>
      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={loading}
          className="flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-4 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Carregar mais
        </button>
      )}
    </div>
  );
}
