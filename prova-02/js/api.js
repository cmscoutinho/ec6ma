// api.js — comunicação com o Web App do Google Apps Script (ou /api no teste local)

let deslocamento = 0; // relógio do servidor − relógio local (ms)

function urlApi() {
  const u = window.PROVA_CONFIG && window.PROVA_CONFIG.API_URL;
  if (!u || u.includes('COLE_AQUI')) throw new Error('Configure a URL da API em js/config.js.');
  return u;
}

export function agoraServidor() { return Date.now() + deslocamento; }

/**
 * Chama uma ação da API. Usa POST com text/plain (evita preflight CORS no Apps Script).
 * Lança Error com .codigo quando o servidor responde ok:false.
 */
export async function api(acao, dados = {}, { tentativas = 1, timeout = 60000 } = {}) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    const t0 = Date.now();
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), timeout);
      const resp = await fetch(urlApi(), {
        method: 'POST', redirect: 'follow', signal: ctrl.signal,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ acao, ...dados })
      });
      clearTimeout(tm);
      const j = await resp.json();
      if (j.agora) {
        const rtt = Date.now() - t0;
        if (rtt < 8000) deslocamento = j.agora + rtt / 2 - Date.now();
      }
      if (!j.ok) {
        const e = new Error(j.erro || 'Erro no servidor');
        e.codigo = j.codigo || 'ERRO';
        e.doServidor = true;
        throw e;
      }
      return j;
    } catch (e) {
      ultimoErro = e;
      if (e.doServidor) throw e;              // erro de regra: não adianta repetir
      if (i < tentativas - 1) await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  const e = new Error('Falha de conexão com o servidor. ' + (ultimoErro && ultimoErro.message ? '(' + ultimoErro.message + ')' : ''));
  e.codigo = 'REDE';
  throw e;
}

/** Envio "fire-and-forget" que sobrevive ao fechamento da página. */
export function apiBeacon(acao, dados = {}) {
  try {
    const blob = new Blob([JSON.stringify({ acao, ...dados })], { type: 'text/plain;charset=utf-8' });
    return navigator.sendBeacon(urlApi(), blob);
  } catch (e) { return false; }
}
