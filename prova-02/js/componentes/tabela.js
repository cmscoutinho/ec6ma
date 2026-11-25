// componentes/tabela.js — tabela de preenchimento (números, textos ou seleção)
import { h, esc } from '../util.js';

export function htmlTabela(linhas, colunas, valor) {
  let s = '<table class="entrada"><tr><th></th>' + colunas.map(c => '<th>' + esc(c.titulo) + '</th>').join('') + '</tr>';
  linhas.forEach((l, i) => {
    s += '<tr><th>' + esc(l) + '</th>' + colunas.map((c, j) => '<td>' + esc(((valor || [])[i] || [])[j] || '') + '</td>').join('') + '</tr>';
  });
  return s + '</table>';
}

export class EntradaTabela {
  /** op: {linhas:[str], colunas:[{titulo,tipo:'numero'|'texto'|'selecao',opcoes}], valor:[[...]], leitura, aoMudar} */
  constructor(el, op) {
    this.el = el;
    this.linhas = op.linhas || [];
    this.colunas = op.colunas || [];
    this.leitura = !!op.leitura;
    this.aoMudar = op.aoMudar || (() => {});
    this.v = this.linhas.map((_, i) => this.colunas.map((_, j) => (((op.valor || [])[i] || [])[j] ?? '') + ''));
    this.montar();
  }

  getValor() { return this.v.map(l => l.slice()); }

  montar() {
    this.el.innerHTML = '';
    if (this.leitura) { this.el.innerHTML = htmlTabela(this.linhas, this.colunas, this.v); return; }
    const t = h('table', { class: 'entrada' });
    t.append(h('tr', {}, h('th'), ...this.colunas.map(c => h('th', {}, c.titulo))));
    this.linhas.forEach((l, i) => {
      const tr = h('tr', {}, h('th', {}, l));
      this.colunas.forEach((c, j) => {
        let inp;
        if (c.tipo === 'selecao') {
          inp = h('select', {}, h('option', { value: '' }, '— selecione —'), ...(c.opcoes || []).map(o => h('option', { value: o }, o)));
        } else {
          inp = h('input', { type: c.tipo === 'numero' ? 'number' : 'text', step: c.tipo === 'numero' ? 'any' : null });
        }
        inp.value = this.v[i][j];
        const ev = c.tipo === 'selecao' ? 'change' : 'input';
        inp.addEventListener(ev, () => { this.v[i][j] = inp.value; this.aoMudar(this.getValor()); });
        tr.append(h('td', {}, inp));
      });
      t.append(tr);
    });
    this.el.append(h('div', { style: { overflowX: 'auto' } }, t));
  }
}
