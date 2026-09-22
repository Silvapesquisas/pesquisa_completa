// Identidade do aparelho, usada para vincular um código do App de Campo a UM
// celular por vez. O id é gerado uma única vez e guardado no próprio aparelho.
const DEVICE_ID_KEY = "fieldapp_device_id";

export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return ""; // navegador sem storage: o servidor trata como "sem vínculo"
  }
}

// Nome amigável para o gestor reconhecer o aparelho na lista.
export function getDeviceLabel() {
  try {
    const ua = navigator.userAgent || "";
    const os = /Android/i.test(ua) ? "Android"
      : /iPhone|iPad|iPod/i.test(ua) ? "iPhone/iPad"
      : /Windows/i.test(ua) ? "Windows"
      : /Mac/i.test(ua) ? "Mac"
      : /Linux/i.test(ua) ? "Linux" : "Outro";
    const browser = /Edg\//i.test(ua) ? "Edge"
      : /Chrome\//i.test(ua) && !/Edg\//i.test(ua) ? "Chrome"
      : /Firefox\//i.test(ua) ? "Firefox"
      : /Safari\//i.test(ua) ? "Safari" : "Navegador";
    return `${os} · ${displayMode() === "standalone" ? "app instalado" : browser}`;
  } catch {
    return "Aparelho";
  }
}

// Aberto como app instalado (ícone na tela inicial) ou no navegador?
// No iPhone isso importa: o app instalado tem armazenamento SEPARADO do Safari,
// então ganha um device_id novo. O servidor usa esta informação para permitir,
// uma única vez, a troca "Safari → app instalado" no mesmo tipo de aparelho.
export function displayMode() {
  try {
    if (window.matchMedia?.("(display-mode: standalone)")?.matches) return "standalone";
    if (window.navigator.standalone === true) return "standalone"; // iOS
  } catch { /* ignore */ }
  return "browser";
}

export function deviceInfo() {
  return { device_id: getDeviceId(), device_label: getDeviceLabel(), display_mode: displayMode() };
}
