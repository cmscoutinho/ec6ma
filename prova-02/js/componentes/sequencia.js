// componentes/sequencia.js — ordenação por arrastar-e-soltar (com alternativa por clique)
import { h, esc } from '../util.js';

const TIPO_DND = 'application/x-prova-seq';

export function htmlSequencia(lista) {
  if (!lista || !lista.length) return '<span class="mudo pequeno">(vazio)</span>';
  return '<div class="linha-flex">' + lista.map((x, i) => `<span class="chip na-seq"><span class="ord">${i + 1}º</span>${esc(x)}</span>`).join('') + '</div>';
}

export class Sequencia {
  /** op: {itens:[str], valor:[str], leitura, aoMudar} */
  constructor(el, op) {
    this.el = el;
    this.itens = (op.itens || []).map(String);
    this.seq = (op.valor || []).map(String).filter(x => this.itens.includes(x));
    this.leitura = !!op.leitura;
    this.aoMudar = op.aoMudar || (() => {});
    this.id = 'sq' + Math.random().toString(36).slice(2, 8);
    this.montar();
  }

  getValor() { return this.seq.slice(); }

  mudou() { this.render(); this.aoMudar(this.getValor()); }

  montar() {
    this.el.innerHTML = '';
    if (this.leitura) { this.el.innerHTML = htmlSequencia(this.seq); return; }
    this.zona = h('div', { class: 'seq-zona' });
    this.bandeja = h('div', { class: 'seq-zona bandeja' });
    this.el.append(h('div', { class: 'seq' },
      h('div', { class: 'linha-flex' }, h('span', { class: 'seq-rotulo' }, 'Sua sequência'), h('span', { class: 'espaco' }),
        h('button', { class: 'btn sec peq', type: 'button', onclick: () => { this.seq = []; this.mudou(); } }, 'Limpar')),
      this.zona,
      h('span', { class: 'seq-rotulo' }, 'Disponíveis (arraste para cima ou clique)'),
      this.bandeja));
    this.ligarZona(this.zona, true);
    this.ligarZona(this.bandeja, false);
    this.render();
  }

  chip(valor, naSeq, idx) {
    const c = h('span', { class: 'chip' + (naSeq ? ' na-seq' : ''), draggable: 'true', title: naSeq ? 'Arraste para reordenar • clique para remover' : 'Arraste ou clique para adicionar' },
      naSeq ? h('span', { class: 'ord' }, (idx + 1) + 'º') : null, valor);
    c.dataset.valor = valor;
    c.addEventListener('dragstart', e => {
      e.dataTransfer.setData(TIPO_DND, JSON.stringify({ id: this.id, valor }));
      e.dataTransfer.effectAllowed = 'move';
      c.classList.add('arrastando');
    });
    c.addEventListener('dragend', () => { c.classList.remove('arrastando'); this.limparMarcador(); });
    c.addEventListener('click', () => {
      if (naSeq) this.seq = this.seq.filter(x => x !== valor);
      else this.seq.push(valor);
      this.mudou();
    });
    return c;
  }

  render() {
    this.zona.innerHTML = '';
    this.bandeja.innerHTML = '';
    if (!this.seq.length) this.zona.append(h('span', { class: 'vazio' }, 'Arraste os itens para cá, na ordem desejada.'));
    this.seq.forEach((v, i) => this.zona.append(this.chip(v, true, i)));
    const restantes = this.itens.filter(x => !this.seq.includes(x));
    if (!restantes.length) this.bandeja.append(h('span', { class: 'vazio' }, 'Todos os itens foram usados.'));
    restantes.forEach(v => this.bandeja.append(this.chip(v, false)));
  }

  indiceInsercao(e) {
    const chips = Array.from(this.zona.querySelectorAll('.chip'));
    for (let i = 0; i < chips.length; i++) {
      const r = chips[i].getBoundingClientRect();
      if (e.clientY < r.top) return i;
      if (e.clientY <= r.bottom && e.clientX < r.left + r.width / 2) return i;
    }
    return chips.length;
  }

  limparMarcador() { if (this.marcador) { this.marcador.remove(); this.marcador = null; } this.zona.classList.remove('alvo'); }

  ligarZona(zona, ehSeq) {
    zona.addEventListener('dragover', e => {
      if (!Array.from(e.dataTransfer.types).includes(TIPO_DND)) return;
      e.preventDefault();
      if (!ehSeq) return;
      zona.classList.add('alvo');
      const i = this.indiceInsercao(e);
      if (!this.marcador) this.marcador = h('span', { class: 'marcador-insercao' });
      const chips = zona.querySelectorAll('.chip');
      if (i < chips.length) zona.insertBefore(this.marcador, chips[i]); else zona.append(this.marcador);
    });
    zona.addEventListener('dragleave', e => { if (!zona.contains(e.relatedTarget)) this.limparMarcador(); });
    zona.addEventListener('drop', e => {
      const raw = e.dataTransfer.getData(TIPO_DND);
      if (!raw) return;
      e.preventDefault();
      const d = JSON.parse(raw);
      if (d.id !== this.id) { this.limparMarcador(); return; }
      if (ehSeq) {
        let i = this.indiceInsercao(e);
        const atual = this.seq.indexOf(d.valor);
        if (atual >= 0) { this.seq.splice(atual, 1); if (atual < i) i--; }
        this.seq.splice(i, 0, d.valor);
      } else {
        this.seq = this.seq.filter(x => x !== d.valor);
      }
      this.limparMarcador();
      this.mudou();
    });
  }
}
