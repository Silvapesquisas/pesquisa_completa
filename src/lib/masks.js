// Máscaras de entrada (Brasil). Recebem o texto digitado e devolvem formatado,
// limitando a quantidade de dígitos para o formato correto.

// Telefone/WhatsApp: (XX) XXXX-XXXX (fixo) ou (XX) XXXXX-XXXX (celular).
export function maskPhoneBR(value) {
  const d = (value || "").replace(/\D/g, "").slice(0, 11);
  const len = d.length;
  if (len === 0) return "";
  if (len < 3) return `(${d}`;
  if (len <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (len <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function fmtCPF(d) {
  const a = d.slice(0, 3), b = d.slice(3, 6), c = d.slice(6, 9), e = d.slice(9, 11);
  let s = a;
  if (b) s += "." + b;
  if (c) s += "." + c;
  if (e) s += "-" + e;
  return s;
}

function fmtCNPJ(d) {
  const a = d.slice(0, 2), b = d.slice(2, 5), c = d.slice(5, 8), e = d.slice(8, 12), f = d.slice(12, 14);
  let s = a;
  if (b) s += "." + b;
  if (c) s += "." + c;
  if (e) s += "/" + e;
  if (f) s += "-" + f;
  return s;
}

// CPF (até 11 dígitos) ou CNPJ (12–14 dígitos), detectado pelo tamanho.
export function maskCpfCnpj(value) {
  const d = (value || "").replace(/\D/g, "").slice(0, 14);
  return d.length <= 11 ? fmtCPF(d) : fmtCNPJ(d);
}
