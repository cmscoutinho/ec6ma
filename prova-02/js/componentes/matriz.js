// componentes/matriz.js — editor de matrizes de incidência/adjacência ligado a um grafo
import { h, esc } from '../util.js';

/** Converte a resposta (células por uid) na matriz com rótulos v1.., a1.. */
export function materializar(valor, grafo, modo) {
  const g = grafo || { vertices: [], arestas: [] };
  const vs = g.vertices || [], as = g.arestas || [];
  const cel = (valor && valor.celulas) || {};
  const cols = modo === 'incidencia' ? as : vs;
  return {
    canto: modo === 'incidencia' ? 'v/a' : 'v',
    rotLinhas: vs.map((v, i) => 'v' + (i + 1)),
    nomesLinhas: vs.map(v => v.nome || ''),
    rotColunas: cols.map((c, i) => (modo === 'incidencia' ? 'a' : 'v') + (i + 1)),
    nomesColunas: modo === 'incidencia' ? cols.map(c => c.nome || '') : null,
    valores: vs.map(v => cols.map(c => Number(cel[v.uid + '|' + c.uid] || 0)))
  };
}

/** HTML (string) de uma matriz {canto, rotLinhas, rotColunas, valores, nomesLinhas?}; dif: matriz booleana opcional. */
export function htmlMatriz(m, { dif } = {}) {
  if (!m || !m.rotLinhas || !m.rotLinhas.length) return '<div class="mudo pequeno">(matriz vazia)</div>';
  let s = '<div class="matriz-wrap"><table class="matriz"><tr><th>' + esc(m.canto || '') + '</th>' +
    m.rotColunas.map((c, j) => '<th>' + esc(c) + (m.nomesColunas && m.nomesColunas[j] ? '<small class="nome-col">' + esc(m.nomesColunas[j]) + '</small>' : '') + '</th>').join('') + '</tr>';
  m.valores.forEach((lin, i) => {
    s += '<tr><th class="lin">' + esc(m.rotLinhas[i]) + (m.nomesLinhas && m.nomesLinhas[i] ? '<small>' + esc(m.nomesLinhas[i]) + '</small>' : '') + '</th>';
    lin.forEach((v, j) => {
      const cls = (Number(v) > 0 ? 'v1' : Number(v) < 0 ? 'vneg' : '') + (dif && dif[i] && dif[i][j] ? ' dif' : '');
      s += `<td class="${cls}">${Number(v) < 0 ? '−' + Math.abs(v) : esc(v)}</td>`;
    });
    s += '</tr>';
  });
  return s + '</table></div>';
}

export class EditorMatriz {
  /** op: {modo:'incidencia'|'adjacencia', valor, obterGrafo: ()=>grafo, leitura, aoMudar} */
  constructor(el, op) {
    this.el = el;
    this.modo = op.modo;
    this.obterGrafo = op.obterGrafo;
    this.leitura = !!op.leitura;
    this.aoMudar = op.aoMudar || (() => {});
    this.cel = Object.assign({}, (op.valor && op.valor.celulas) || {});
    this.ciclo = this.modo === 'incidencia' ? [0, 1, -1] : [0, 1];
    this.atualizar();
  }

  getValor() {
    // descarta células de vértices/arestas que não existem mais
    const g = this.obterGrafo() || { vertices: [], arestas: [] };
    const ids = new Set([...(g.vertices || []).map(v => v.uid), ...(g.arestas || []).map(a => a.uid)]);
    const out = {};
    for (const [k, v] of Object.entries(this.cel)) {
      const [a, b] = k.split('|');
      if (v && ids.has(a) && ids.has(b)) out[k] = v;
    }
    return { celulas: out };
  }

  atualizar() {
    const g = this.obterGrafo() || { vertices: [], arestas: [] };
    const vs = g.vertices || [], as = g.arestas || [];
    const cols = this.modo === 'incidencia' ? as : vs;
    this.el.innerHTML = '';
    if (!vs.length || (this.modo === 'incidencia' && !as.length)) {
      this.el.append(h('div', { class: 'aviso-box' }, 'Desenhe o grafo acima: a matriz acompanha automaticamente os vértices' + (this.modo === 'incidencia' ? ' e as arestas.' : '.')));
      return;
    }
    const tab = h('table', { class: 'matriz' + (this.leitura ? '' : ' editavel') });
    const cab = h('tr', {}, h('th', {}, this.modo === 'incidencia' ? 'v/a' : 'v'));
    cols.forEach((c, j) => cab.append(h('th', { title: c.nome || '' }, (this.modo === 'incidencia' ? 'a' : 'v') + (j + 1),
      this.modo === 'incidencia' && c.nome ? h('small', { class: 'nome-col' }, c.nome) : null)));
    tab.append(cab);
    vs.forEach((v, i) => {
      const tr = h('tr', {}, h('th', { class: 'lin' }, 'v' + (i + 1), v.nome ? h('small', { title: v.nome }, v.nome) : null));
      cols.forEach(c => {
        const chave = v.uid + '|' + c.uid;
        const td = h('td', { tabindex: this.leitura ? null : '0', dataset: { k: chave } });
        this.pintar(td, Number(this.cel[chave] || 0));
        if (!this.leitura) {
          td.addEventListener('click', () => this.girar(td, chave, 1));
          td.addEventListener('contextmenu', e => { e.preventDefault(); this.girar(td, chave, -1); });
          td.addEventListener('keydown', e => {
            const mapa = { '0': 0, '1': 1, '-': -1 };
            if (e.key in mapa && this.ciclo.includes(mapa[e.key])) { this.definir(td, chave, mapa[e.key]); e.preventDefault(); }
            if (e.key === ' ' || e.key === 'Enter') { this.girar(td, chave, 1); e.preventDefault(); }
          });
        }
        tr.append(td);
      });
      tab.append(tr);
    });
    const wrap = h('div', { class: 'matriz-wrap' }, tab);
    this.el.append(wrap);
    if (!this.leitura) {
      this.el.append(h('div', { class: 'linha-flex pequeno mudo', style: { marginTop: '6px' } },
        h('span', {}, this.modo === 'incidencia'
          ? 'Clique na célula para alternar 0 → 1 → −1 (botão direito volta). Teclado: 0, 1 ou −.'
          : 'Clique na célula para alternar entre 0 e 1. Teclado: 0 ou 1.'),
        h('span', { class: 'espaco' }),
        h('button', { class: 'btn sec peq', type: 'button', onclick: () => { this.cel = {}; this.atualizar(); this.aoMudar(this.getValor()); } }, 'Zerar matriz')));
    }
  }

  pintar(td, v) {
    td.textContent = v < 0 ? '−1' : String(v);
    td.className = v > 0 ? 'v1' : v < 0 ? 'vneg' : '';
  }

  definir(td, chave, v) {
    if (v) this.cel[chave] = v; else delete this.cel[chave];
    this.pintar(td, v);
    this.aoMudar(this.getValor());
  }

  girar(td, chave, passo) {
    const atual = Number(this.cel[chave] || 0);
    let i = this.ciclo.indexOf(atual);
    if (i < 0) i = 0;
    const prox = this.ciclo[(i + passo + this.ciclo.length) % this.ciclo.length];
    this.definir(td, chave, prox);
  }
}
