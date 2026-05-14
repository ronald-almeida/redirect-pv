import {
  type LinkAgg,
  countryFlag,
  emptyAgg,
  formatTime,
  topEntries,
} from "@/lib/analytics";

const MODE_LABEL: Record<string, { label: string; cls: string; dot: string }> = {
  real: {
    label: "Real",
    cls: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  decoy: {
    label: "Isca",
    cls: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  waiting: {
    label: "Espera",
    cls: "text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
};

export function LinkAnalytics({ agg }: { agg: LinkAgg | undefined }) {
  const a = agg ?? emptyAgg();
  const totalDevices = a.devices.mobile + a.devices.desktop;
  const mobilePct = totalDevices ? (a.devices.mobile / totalDevices) * 100 : 0;
  const desktopPct = totalDevices ? (a.devices.desktop / totalDevices) * 100 : 0;
  const topCountries = topEntries(a.countries, 3);
  const utmList = topEntries(a.utm, 5);

  return (
    <div className="mt-4 grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Top países
        </h4>
        {topCountries.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem dados ainda.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {topCountries.map(([cc, n]) => (
              <li key={cc} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="text-base leading-none">{countryFlag(cc)}</span>
                  <span className="font-mono text-xs">{cc}</span>
                </span>
                <span className="tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Dispositivos
        </h4>
        {totalDevices === 0 ? (
          <p className="text-xs text-muted-foreground">Sem dados ainda.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="bg-sky-500"
                style={{ width: `${mobilePct}%` }}
                title={`Mobile ${mobilePct.toFixed(0)}%`}
              />
              <div
                className="bg-violet-500"
                style={{ width: `${desktopPct}%` }}
                title={`Desktop ${desktopPct.toFixed(0)}%`}
              />
            </div>
            <div className="flex justify-between text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                Mobile {mobilePct.toFixed(0)}% ({a.devices.mobile})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-violet-500" />
                Desktop {desktopPct.toFixed(0)}% ({a.devices.desktop})
              </span>
            </div>
          </div>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          VPN detectado
        </h4>
        <div className="text-2xl font-semibold tabular-nums">{a.vpn}</div>
        <p className="text-xs text-muted-foreground">cliques marcados como VPN/proxy</p>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          UTM source
        </h4>
        {utmList.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem UTM ainda.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {utmList.map(([src, n]) => (
              <li key={src} className="flex items-center justify-between">
                <span className="font-mono text-xs">{src}</span>
                <span className="tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sm:col-span-2">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Últimos 10 cliques
        </h4>
        {a.recent.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum clique ainda.</p>
        ) : (
          <div className="overflow-hidden rounded-md border bg-background">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Quando</th>
                  <th className="px-2 py-1.5 text-left font-medium">País</th>
                  <th className="px-2 py-1.5 text-left font-medium">Dispositivo</th>
                  <th className="px-2 py-1.5 text-left font-medium">Modo</th>
                </tr>
              </thead>
              <tbody>
                {a.recent.map((c, i) => {
                  const baseMode = c.mode_at_click.split(":")[0];
                  const meta = MODE_LABEL[baseMode] ?? MODE_LABEL.waiting;
                  return (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1.5 tabular-nums">
                        {formatTime(c.created_at)}
                      </td>
                      <td className="px-2 py-1.5">
                        {c.country ? (
                          <span className="flex items-center gap-1.5">
                            <span>{countryFlag(c.country)}</span>
                            <span className="font-mono">{c.country}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 capitalize">
                        {c.device ?? "—"}
                        {c.is_vpn && (
                          <span className="ml-1 rounded bg-rose-100 px-1 py-0.5 text-[10px] text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                            VPN
                          </span>
                        )}
                      </td>
                      <td className={`px-2 py-1.5 ${meta.cls}`}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
