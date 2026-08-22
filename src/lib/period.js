// Corte do mês no horário de BRASÍLIA, igual ao usado no banco e nas Edge
// Functions. Assim a cota mensal segue o calendário do cliente, e não o fuso
// do servidor nem o do navegador de quem abriu o painel.
// O Brasil não usa horário de verão desde 2019, então o offset é fixo (-03:00).
export function monthStartISO() {
  const [y, m] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()).split("-");
  return new Date(`${y}-${m}-01T00:00:00-03:00`).toISOString();
}
