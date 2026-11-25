// componentes/abb.js — montador de árvore binária por arrastar-e-soltar
import { h, esc, toast, confirmar } from '../util.js';

const DX = 50, DY = 66, PROF_MAX = 6;
const TIPO_DND = 'application/x-prova-abb';

/** Layout em ordem (in-order) de um conjunto de caminhos ("", "L", "LR", ...). */
function layout(caminhos) {
  const conj = new Set(caminhos);
  const pos = {};
  let x = 0, maxProf = 0;
  (function f(p) {
    if (!conj.has(p)) return;
    f(p + 'L');
    pos[p] = { x: (x++ + 0.5) * DX, y: p.length * DY + 28 };
    maxProf = Math.max(maxProf, p.length);
    f(p + 'R');
  })('');
  // caminhos "órfãos" (sem ligação até a raiz) — não deveriam existir, mas garantimos exibição
  caminhos.forEach(p => { if (!pos[p]) { pos[p] = { x: (x++ + 0.5) * DX, y: p.length * DY + 28 }; maxProf = Math.max(maxProf, p.length); } });
  return { pos, largura: Math.max(x, 1) * DX, altura: (maxProf + 1) * DY + 14 };
}

function buracos(nos) {
  const b = new Set();
  Object.keys(nos).forEach(p => { for (let i = 0; i < p.length; i++) { const a = p.slice(0, i); if (nos[a] === undefined) b.add(a); } });
  return b;
}

/** SVG (string) de uma árvore {caminho: valor}. */
export function svgArvore(nos, { cor = '#232856' } = {}) {
  nos = nos || {};
  const filled = Object.keys(nos);
  if (!filled.length) return '<div class="mudo pequeno">(árvore vazia)</div>';
  const hs = buracos(nos);
  const todos = [...filled, ...hs];
  const L = layout(todos);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.largura} ${L.altura}" style="max-width:${L.largura}px;width:100%;height:auto">`;
  todos.forEach(p => {
    if (!p) return;
    const pai = p.slice(0, -1);
    if (!L.pos[pai]) return;
    s += `<line x1="${L.pos[pai].x}" y1="${L.pos[pai].y}" x2="${L.pos[p].x}" y2="${L.pos[p].y}" stroke="#7a7fa8" stroke-width="2"${hs.has(p) || hs.has(pai) ? ' stroke-dasharray="5 4"' : ''}/>`;
  });
  todos.forEach(p => {
    const q = L.pos[p];
    if (hs.has(p)) s += `<circle cx="${q.x}" cy="${q.y}" r="19" fill="#fbe9e7" stroke="#c0392b" stroke-width="2" stroke-dasharray="4 3"/><text x="${q.x}" y="${q.y}" text-anchor="middle" dominant-baseline="central" font-size="12" fill="#c0392b">vazio</text>`;
    else s += `<circle cx="${q.x}" cy="${q.y}" r="19" fill="#fff" stroke="${cor}" stroke-width="2.2"/><text x="${q.x}" y="${q.y}" text-anchor="middle" dominant-baseline="central" font-family="monospace" font-weight="700" font-size="14" fill="${cor}">${esc(nos[p])}</text>`;
  });
  return s + '</svg>';
}

export class MontadorABB {
  /** op: {valores:[n], valor:{nos}, leitura, aoMudar, copiarDe: ()=>nos|null, rotuloCopiar, remover} */
  constructor(el, op) {
    this.el = el;
    this.valores = (op.valores || []).map(Number);
    this.nos = {};
    const ini = (op.valor && op.valor.nos) || {};
    for (const [p, v] of Object.entries(ini)) if (this.valores.includes(Number(v))) this.nos[p] = Number(v);
    this.leitura = !!op.leitura;
    this.aoMudar = op.aoMudar || (() => {});
    this.copiarDe = op.copiarDe;
    this.rotuloCopiar = op.rotuloCopiar || 'Copiar a árvore do item (a)';
    this.remover = op.remover;
    this.escolhido = null; // {valor, origem: caminho|null}
    this.id = 'ab' + Math.random().toString(36).slice(2, 8);
    this.montar();
  }

  getValor() { return { nos: Object.assign({}, this.nos) }; }
  mudou() { this.render(); this.aoMudar(this.getValor()); }

  montar() {
    this.el.innerHTML = '';
    if (this.leitura) { this.el.innerHTML = svgArvore(this.nos); return; }
    this.raiz = h('div', { class: 'abb' });
    this.bandeja = h('div', { class: 'abb-barra' });
    this.area = h('div', { class: 'abb-area' });
    this.tela = h('div', { class: 'abb-tela' });
    this.area.append(this.tela);
    const botoes = h('div', { class: 'linha-flex', style: { padding: '6px 10px', borderTop: '1px solid var(--borda)' } },
      h('button', { class: 'btn sec peq', type: 'button', onclick: async () => {
        if (!Object.keys(this.nos).length) return;
        if (await confirmar({ titulo: 'Limpar a árvore?', mensagem: 'Todos os números voltarão para a bandeja.', ok: 'Limpar', perigo: true })) { this.nos = {}; this.escolhido = null; this.mudou(); }
      } }, 'Limpar árvore'),
      this.copiarDe ? h('button', { class: 'btn sec peq', type: 'button', onclick: () => this.copiar() }, this.rotuloCopiar) : null,
      h('span', { class: 'espaco' }),
      h('span', { class: 'pequeno mudo' }, 'Nível da raiz = 0'));
    this.raiz.append(this.bandeja, this.area, botoes,
      h('div', { class: 'abb-ajuda' }, 'Arraste um número da bandeja até um círculo tracejado (ou clique no número e depois no círculo). Para mover um nó, arraste-o para outra posição livre; para devolvê-lo à bandeja, arraste-o para a bandeja ou clique no “×”. Posições em vermelho indicam um nó vazio que ainda possui filhos.'));
    this.el.append(this.raiz);
    this.ligarAlvo(this.bandeja, null);
    this.render();
  }

  async copiar() {
    const src = this.copiarDe && this.copiarDe();
    if (!src || !Object.keys(src).length) { toast('A árvore do item (a) ainda está vazia.', 'aviso'); return; }
    if (Object.keys(this.nos).length && !(await confirmar({ titulo: 'Substituir a árvore?', mensagem: 'A árvore atual deste item será substituída por uma cópia da árvore do item (a).', ok: 'Copiar' }))) return;
    this.nos = {};
    for (const [p, v] of Object.entries(src)) if (this.valores.includes(Number(v))) this.nos[p] = Number(v);
    if (this.remover !== undefined) toast('Árvore copiada sem o nó ' + this.remover + '. Agora reorganize os nós para aplicar a exclusão.', 'info', 5000);
    this.mudou();
  }

  vagas() {
    const v = new Set();
    if (this.nos[''] === undefined) v.add('');
    Object.keys(this.nos).forEach(p => {
      if (p.length + 1 > PROF_MAX) return;
      if (this.nos[p + 'L'] === undefined) v.add(p + 'L');
      if (this.nos[p + 'R'] === undefined) v.add(p + 'R');
    });
    buracos(this.nos).forEach(b => v.add(b));
    return v;
  }

  colocar(valor, destino) {
    for (const [p, x] of Object.entries(this.nos)) if (x === valor) delete this.nos[p];
    if (destino !== null) this.nos[destino] = valor;
    this.escolhido = null;
    this.mudou();
  }

  render() {
    // bandeja
    this.bandeja.innerHTML = '';
    const usados = new Set(Object.values(this.nos));
    const livres = this.valores.filter(x => !usados.has(x));
    this.bandeja.append(h('span', { class: 'seq-rotulo' }, 'Bandeja:'));
    if (!livres.length) this.bandeja.append(h('span', { class: 'pequeno mudo' }, 'todos os números foram posicionados ✓'));
    livres.forEach(v => {
      const c = h('span', { class: 'chip' + (this.escolhido && this.escolhido.valor === v ? ' escolhido' : ''), draggable: 'true' }, String(v));
      c.addEventListener('dragstart', e => { e.dataTransfer.setData(TIPO_DND, JSON.stringify({ id: this.id, valor: v })); });
      c.addEventListener('click', () => { this.escolhido = this.escolhido && this.escolhido.valor === v ? null : { valor: v }; this.render(); });
      this.bandeja.append(c);
    });
    // árvore
    const vagas = this.vagas();
    const hs = buracos(this.nos);
    const todos = [...Object.keys(this.nos), ...vagas];
    const L = layout(todos);
    this.tela.innerHTML = '';
    this.tela.style.width = L.largura + 'px';
    this.tela.style.height = L.altura + 'px';
    let linhas = `<svg width="${L.largura}" height="${L.altura}">`;
    todos.forEach(p => {
      if (!p) return;
      const pai = p.slice(0, -1);
      if (!L.pos[pai]) return;
      const cheia = this.nos[p] !== undefined && this.nos[pai] !== undefined;
      linhas += `<line x1="${L.pos[pai].x}" y1="${L.pos[pai].y}" x2="${L.pos[p].x}" y2="${L.pos[p].y}" stroke="${cheia ? '#7a7fa8' : '#c9cce0'}" stroke-width="2"${cheia ? '' : ' stroke-dasharray="5 4"'}/>`;
    });
    this.tela.innerHTML = linhas + '</svg>';
    todos.forEach(p => {
      const q = L.pos[p];
      if (this.nos[p] !== undefined) {
        const v = this.nos[p];
        const no = h('div', { class: 'abb-no' + (this.escolhido && this.escolhido.valor === v ? ' escolhido' : ''), draggable: 'true', title: 'Arraste para mover', dataset: { caminho: p } }, String(v),
          h('span', { class: 'x', title: 'Devolver à bandeja', onclick: e => { e.stopPropagation(); this.colocar(v, null); } }, '×'));
        no.style.left = q.x + 'px'; no.style.top = q.y + 'px';
        if (this.escolhido && this.escolhido.valor === v) no.style.boxShadow = '0 0 0 4px var(--ambar)';
        no.addEventListener('dragstart', e => { e.dataTransfer.setData(TIPO_DND, JSON.stringify({ id: this.id, valor: v })); });
        no.addEventListener('click', () => { this.escolhido = this.escolhido && this.escolhido.valor === v ? null : { valor: v }; this.render(); });
        this.tela.append(no);
      } else {
        const vaga = h('div', { class: 'abb-vaga' + (hs.has(p) ? ' buraco' : ''), title: hs.has(p) ? 'Posição vazia com filhos' : 'Solte um número aqui', dataset: { caminho: p } }, '+');
        vaga.style.left = q.x + 'px'; vaga.style.top = q.y + 'px';
        vaga.addEventListener('click', () => { if (this.escolhido) this.colocar(this.escolhido.valor, p); else toast('Escolha (clique) primeiro um número na bandeja.', 'info', 2200); });
        this.ligarAlvo(vaga, p);
        this.tela.append(vaga);
      }
    });
    // centraliza a rolagem na raiz na primeira renderização
    if (!this.centrou && L.pos['']) { this.centrou = true; requestAnimationFrame(() => { this.area.scrollLeft = Math.max(0, L.pos[''].x - this.area.clientWidth / 2); }); }
  }

  ligarAlvo(el, caminho) {
    el.addEventListener('dragover', e => { if (Array.from(e.dataTransfer.types).includes(TIPO_DND)) { e.preventDefault(); el.classList.add('alvo'); } });
    el.addEventListener('dragleave', () => el.classList.remove('alvo'));
    el.addEventListener('drop', e => {
      el.classList.remove('alvo');
      const raw = e.dataTransfer.getData(TIPO_DND);
      if (!raw) return;
      e.preventDefault();
      const d = JSON.parse(raw);
      if (d.id !== this.id) return;
      this.colocar(Number(d.valor), caminho);
    });
  }
}
