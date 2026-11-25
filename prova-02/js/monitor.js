// monitor.js — detecção de saída da tela cheia, troca de aba/minimização e perda de foco;
// bloqueio de copiar/colar/recortar (somente aviso, sem registro).
import { toast } from './util.js';

/**
 * op: {
 *   aoIniciarAusencia(tipo)            — chamado imediatamente quando algo ocorre
 *   aoFinalizarAusencia(tipo, duracaoMs) — chamado quando o aluno volta
 *   aoMudarTelaCheia(emTelaCheia)
 * }
 */
export function criarMonitor(op) {
  let ativo = false;
  const ausencias = {}; // tipo -> início (ms)
  let intervalo = null;

  const inicio = tipo => {
    if (!ativo || ausencias[tipo]) return;
    ausencias[tipo] = Date.now();
    op.aoIniciarAusencia && op.aoIniciarAusencia(tipo);
  };
  const fim = tipo => {
    if (!ausencias[tipo]) return;
    const d = Date.now() - ausencias[tipo];
    delete ausencias[tipo];
    if (ativo) op.aoFinalizarAusencia && op.aoFinalizarAusencia(tipo, d);
  };

  function emTelaCheia() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }

  function onFullscreen() {
    if (!ativo || document.fullscreenEnabled === false) return;
    if (emTelaCheia()) fim('saiu_tela_cheia'); else inicio('saiu_tela_cheia');
    op.aoMudarTelaCheia && op.aoMudarTelaCheia(emTelaCheia());
  }
  function onVisibilidade() {
    if (!ativo) return;
    if (document.hidden) { delete ausencias.perdeu_foco; inicio('aba_oculta'); }
    else fim('aba_oculta');
  }
  function verificarFoco() {
    if (!ativo) return;
    if (document.hidden) return;
    if (!document.hasFocus()) inicio('perdeu_foco'); else fim('perdeu_foco');
  }
  function onBlur() { setTimeout(verificarFoco, 250); }

  // ---- bloqueios de área de transferência (apenas aviso) ----
  let ultimoAviso = 0;
  function avisar() {
    if (Date.now() - ultimoAviso > 1500) { toast('Copiar, recortar e colar estão bloqueados durante a prova.', 'aviso', 2500); ultimoAviso = Date.now(); }
  }
  function bloquearClip(e) { if (!ativo) return; e.preventDefault(); e.stopPropagation(); avisar(); }
  function onTecla(e) {
    if (!ativo) return;
    const k = (e.key || '').toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if ((mod && ['c', 'v', 'x'].includes(k)) || (e.shiftKey && k === 'insert') || (mod && k === 'insert')) { e.preventDefault(); e.stopPropagation(); avisar(); return; }
    // atalhos que não fazem sentido durante a prova
    if ((mod && ['p', 's', 'u'].includes(k)) || k === 'f12' || (mod && e.shiftKey && ['i', 'j', 'c'].includes(k))) { e.preventDefault(); e.stopPropagation(); }
  }
  function onContexto(e) {
    if (!ativo) return;
    if (e.target.closest && e.target.closest('table.matriz')) return; // botão direito usado nas matrizes
    e.preventDefault();
  }
  function onDrop(e) {
    if (!ativo) return;
    // impede arrastar texto de fora para campos de resposta
    const t = e.target;
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) { e.preventDefault(); avisar(); }
  }
  function onAntesDeSair(e) { if (ativo) { e.preventDefault(); e.returnValue = ''; } }

  return {
    iniciar() {
      if (ativo) return;
      ativo = true;
      document.addEventListener('fullscreenchange', onFullscreen);
      document.addEventListener('webkitfullscreenchange', onFullscreen);
      document.addEventListener('visibilitychange', onVisibilidade);
      window.addEventListener('blur', onBlur);
      window.addEventListener('focus', verificarFoco);
      ['copy', 'cut', 'paste'].forEach(t => document.addEventListener(t, bloquearClip, true));
      document.addEventListener('keydown', onTecla, true);
      document.addEventListener('contextmenu', onContexto, true);
      document.addEventListener('drop', onDrop, true);
      window.addEventListener('beforeunload', onAntesDeSair);
      intervalo = setInterval(verificarFoco, 1000);
      if (document.fullscreenEnabled !== false && !emTelaCheia()) inicio('saiu_tela_cheia');
    },
    parar() {
      ativo = false;
      clearInterval(intervalo);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('webkitfullscreenchange', onFullscreen);
      document.removeEventListener('visibilitychange', onVisibilidade);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', verificarFoco);
      ['copy', 'cut', 'paste'].forEach(t => document.removeEventListener(t, bloquearClip, true));
      document.removeEventListener('keydown', onTecla, true);
      document.removeEventListener('contextmenu', onContexto, true);
      document.removeEventListener('drop', onDrop, true);
      window.removeEventListener('beforeunload', onAntesDeSair);
    },
    /** Encerra ausências em aberto (ex.: antes da entrega) devolvendo [{tipo, duracaoMs}] */
    pendentes() {
      return Object.keys(ausencias).map(t => ({ tipo: t, duracaoMs: Date.now() - ausencias[t] }));
    },
    emTelaCheia
  };
}

export async function entrarTelaCheia() {
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else return false;
    return true;
  } catch (e) { return false; }
}

export function sairTelaCheia() {
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* ignore */ }
}
