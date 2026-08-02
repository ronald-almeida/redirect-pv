import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EXPORT_FORMATS, isExportAvailable } from "@/lib/analytics/export";

/**
 * Menu de exportação — a arquitetura já existe; os formatos são liberados
 * registrando handlers em `EXPORT_HANDLERS`.
 */
export function ExportMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <FileDown className="h-3.5 w-3.5" />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[11px]">Formatos</DropdownMenuLabel>
        {EXPORT_FORMATS.map((f) => (
          <DropdownMenuItem
            key={f.id}
            onSelect={() =>
              toast.info(`Exportação em ${f.label} em breve`, {
                description: "O módulo já está preparado para receber este formato.",
              })
            }
            className="flex items-center justify-between text-[12.5px]"
          >
            <span>
              {f.label}
              <span className="ml-1.5 text-[10.5px] text-muted-foreground">{f.hint}</span>
            </span>
            {!isExportAvailable(f.id) && (
              <span className="text-[10px] text-muted-foreground">em breve</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
