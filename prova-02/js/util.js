// util.js — utilitários de interface compartilhados

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

/** Cria elementos: h('div', {class:'x', onclick: fn, html:'<b>..</b>'}, filhos...) */
export function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const f of filhos.flat()) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}

export function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let caixaToasts = null;
export function toast(msg, tipo = 'info', ms = 3800) {
  if (!caixaToasts) { caixaToasts = h('div', { id: 'toasts' }); document.body.append(caixaToasts); }
  const t = h('div', { class: 'toast ' + tipo }, msg);
  caixaToasts.append(t);
  setTimeout(() => t.remove(), ms);
}

/** Modal de confirmação (não usa window.confirm, que atrapalha a tela cheia). */
export function confirmar({ titulo = 'Confirmar', mensagem = '', html = '', ok = 'Confirmar', cancelar = 'Cancelar', perigo = false } = {}) {
  return new Promise(resolve => {
    const fundo = h('div', { class: 'modal-fundo' });
    const fechar = v => { fundo.remove(); resolve(v); };
    const caixa = h('div', { class: 'modal', role: 'dialog' },
      h('h3', {}, titulo),
      html ? h('div', { html }) : h('p', {}, mensagem),
      h('div', { class: 'acoes' },
        cancelar ? h('button', { class: 'btn sec', onclick: () => fechar(false) }, cancelar) : null,
        h('button', { class: 'btn' + (perigo ? ' perigo' : ''), onclick: () => fechar(true) }, ok)));
    fundo.append(caixa);
    document.body.append(fundo);
    caixa.querySelector('.acoes .btn:last-child').focus();
  });
}

export function baixar(nome, conteudo, mime = 'text/plain;charset=utf-8') {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nome });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}

const fmtDH = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtH = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const fmtDataHora = ms => (ms ? fmtDH.format(new Date(Number(ms))) : '—');
export const fmtHora = ms => (ms ? fmtH.format(new Date(Number(ms))) : '—');
export function fmtDuracao(ms) {
  ms = Math.max(0, Math.round(ms / 1000));
  const hh = Math.floor(ms / 3600), mm = Math.floor((ms % 3600) / 60), ss = ms % 60;
  return (hh ? String(hh).padStart(2, '0') + ':' : '') + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}
export const fmtNota = n => (n === null || n === undefined || n === '' || isNaN(n) ? '—' : Number(n).toFixed(2).replace('.', ','));

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Converte a logo em data URL (para embutir no arquivo de prova baixado). */
export async function logoDataUrl() {
  try {
    const r = await fetch('img/cesupa_logo.png');
    const b = await r.blob();
    return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
  } catch (e) { return ''; }
}

export function cabecalhoInstitucional(config, extra = '') {
  return h('header', { class: 'cabecalho' },
    h('div', { class: 'interno' },
      h('img', { class: 'logo', src: 'img/cesupa_logo.png', alt: 'CESUPA' }),
      h('div', { class: 'titulos' },
        h('div', { class: 'inst' }, 'Centro Universitário do Estado do Pará'),
        h('div', { class: 'disc' }, (config && config.disciplina) || 'Teoria dos Grafos e Matemática Discreta'),
        h('div', { class: 'pequeno mudo' }, [config && config.curso, config && ('Turma ' + config.turma), config && config.professor].filter(Boolean).join(' · '))),
      h('div', { class: 'espaco' }),
      extra ? (extra instanceof Node ? extra : h('div', { html: extra })) : null));
}
