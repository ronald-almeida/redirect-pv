// ACESSO TEMPORÁRIO — remover quando o banco/autenticação voltar ao normal.
// Libera a navegação no painel sem sessão, apenas neste navegador.
const KEY = "bigcloak_temp_access";
const MAX_AGE_MS = 1000 * 60 * 60 * 12; // 12h

export function enableTempAccess() {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, String(Date.now()));
}

export function disableTempAccess() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

export function hasTempAccess() {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts) || Date.now() - ts > MAX_AGE_MS) {
    localStorage.removeItem(KEY);
    return false;
  }
  return true;
}
