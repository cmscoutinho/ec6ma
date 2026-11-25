// componentes/grafo.js — editor interativo de grafos (SVG) e renderização estática
import { h, esc, toast, confirmar } from '../util.js';

const R = 20;
let contadorSvg = 0;

/* ============================================================
 *  Geometria e desenho (compartilhado entre editor e leitura)
 * ============================================================ */

function unit(dx, dy) { const n = Math.hypot(dx, dy) || 1; return [dx / n, dy / n]; }

/**
 * Monta o conteúdo interno de um <svg>.
 * vs: [{key, x, y, rotulo, nome}]   as: [{key, de, para, rotulo, peso}]
 */
function conteudoSvg({ vs, as, dirigido, selV, selE, marcadas, idSvg, mostrarRotulosArestas = true }) {
  const pos = {};
  vs.forEach(v => { pos[v.key] = v; });
  const grupos = {};
  as.forEach(a => {
    if (a.de === a.para) return;
    const k = [a.de, a.para].sort().join('|');
    (grupos[k] = grupos[k] || []).push(a);
  });
  const cor = { normal: '#4a4f7c', sel: '#d9892b', marc: '#1f8a5b' };
  let s = '<defs>';
  for (const [nome, c] of Object.entries(cor)) {
    s += `<marker id="${idSvg}-${nome}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="${nome === 'marc' ? 4.5 : 7}" markerHeight="${nome === 'marc' ? 4.5 : 7}" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`;
  }
  s += '</defs><g class="arestas">';
  const contLacos = {};
  as.forEach(a => {
    const P = pos[a.de], Q = pos[a.para];
    if (!P || !Q) return;
    const estado = marcadas && marcadas.has(a.key) ? 'marc' : (selE === a.key ? 'sel' : 'normal');
    const classe = 'ares' + (estado === 'sel' ? ' sel' : '') + (estado === 'marc' ? ' marcada' : '');
    const marker = dirigido ? ` marker-end="url(#${idSvg}-${estado})"` : '';
    let d, lx, ly;
    if (a.de === a.para) {
      const i = contLacos[a.de] = (contLacos[a.de] || 0) + 1;
      const t = 26 + 12 * i;
      d = `M${P.x - 8},${P.y - R + 2} C${P.x - t},${P.y - R - t * 1.3} ${P.x + t},${P.y - R - t * 1.3} ${P.x + 8},${P.y - R + 2}`;
      lx = P.x; ly = P.y - R - t * 1.05;
    } else {
      const k = [a.de, a.para].sort().join('|');
      const g = grupos[k];
      const idx = g.indexOf(a), n = g.length;
      const off = (idx - (n - 1) / 2) * 34;
      const [A, B] = [a.de, a.para].sort().map(x => pos[x]);
      const [ux, uy] = unit(B.x - A.x, B.y - A.y);
      const nx = -uy, ny = ux;
      const mx = (P.x + Q.x) / 2, my = (P.y + Q.y) / 2;
      const cx = mx + nx * off, cy = my + ny * off;
      const [sx0, sy0] = unit(cx - P.x, cy - P.y);
      const [ex0, ey0] = unit(cx - Q.x, cy - Q.y);
      const S = [P.x + sx0 * R, P.y + sy0 * R];
      const E = [Q.x + ex0 * (R + (dirigido ? 2 : 0)), Q.y + ey0 * (R + (dirigido ? 2 : 0))];
      d = `M${S[0].toFixed(1)},${S[1].toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${E[0].toFixed(1)},${E[1].toFixed(1)}`;
      const t = a.peso !== undefined ? 0.5 : 0.4; // rótulos fora do centro evitam sobreposição em cruzamentos
      lx = (1 - t) * (1 - t) * S[0] + 2 * (1 - t) * t * cx + t * t * E[0];
      ly = (1 - t) * (1 - t) * S[1] + 2 * (1 - t) * t * cy + t * t * E[1];
      if (off === 0 && a.peso === undefined) { lx += nx * 10; ly += ny * 10; }
    }
    s += `<g class="${classe}" data-e="${esc(a.key)}"><path class="hit" d="${d}"/><path class="linha" d="${d}"${marker}/>`;
    if (a.peso !== undefined && a.peso !== null) s += `<text class="peso" x="${lx}" y="${ly}">${esc(a.peso)}</text>`;
    else if (mostrarRotulosArestas && a.rotulo) s += `<text x="${lx}" y="${ly}">${esc(a.rotulo)}</text>`;
    s += '</g>';
  });
  s += '</g><g class="vertices">';
  vs.forEach(v => {
    s += `<g class="vert${selV === v.key ? ' sel' : ''}" data-v="${esc(v.key)}"><circle cx="${v.x}" cy="${v.y}" r="${R}"/>` +
      `<text class="id" x="${v.x}" y="${v.y}">${esc(v.rotulo)}</text>` +
      (v.nome ? `<text class="nome" x="${v.x}" y="${v.y + R + 14}">${esc(v.nome)}</text>` : '') + '</g>';
  });
  s += '</g>';
  return s;
}

function vsDoValor(g) { return (g.vertices || []).map((v, i) => ({ key: v.uid, x: v.x, y: v.y, rotulo: 'v' + (i + 1), nome: v.nome })); }
function asDoValor(g) { return (g.arestas || []).map((a, j) => ({ key: a.uid, de: a.de, para: a.para, rotulo: 'a' + (j + 1) + (a.nome ? ' · ' + a.nome : '') })); }

const chaveFig = (a, b) => [a, b].sort().join('-');

/** SVG (string) de uma resposta do tipo grafo. */
export function svgDeGrafo(g, { largura = 640, altura = 380, classe = '' } = {}) {
  if (!g || !g.vertices || !g.vertices.length) return '<div class="mudo pequeno">(sem grafo desenhado)</div>';
  const id = 'gs' + (++contadorSvg);
  return `<svg class="eg-svg leitura ${classe}" viewBox="0 0 ${largura} ${altura}" xmlns="http://www.w3.org/2000/svg" style="max-width:${largura}px">` +
    conteudoSvg({ vs: vsDoValor(g), as: asDoValor(g), dirigido: !!g.dirigido, idSvg: id }) + '</svg>';
}

/** SVG (string) de uma figura de enunciado (vértices com id, arestas com peso opcional). */
export function svgDeFigura(fig, { selecionadas } = {}) {
  const id = 'gf' + (++contadorSvg);
  const vs = fig.vertices.map(v => ({ key: v.id, x: v.x, y: v.y, rotulo: v.id }));
  const as = fig.arestas.map(a => ({ key: chaveFig(a.de, a.para), de: a.de, para: a.para, peso: a.peso }));
  const marc = selecionadas ? new Set(selecionadas) : null;
  return `<svg class="eg-svg leitura" viewBox="0 0 ${fig.largura} ${fig.altura}" xmlns="http://www.w3.org/2000/svg" style="max-width:${fig.largura}px;background:none">` +
    conteudoSvg({ vs, as, dirigido: !!fig.dirigido, idSvg: id, marcadas: marc }) + '</svg>';
}

/* ============================================================
 *  Editor interativo
 * ============================================================ */

let contadorUid = 0;
const novoUid = p => p + Date.now().toString(36).slice(-4) + (++contadorUid).toString(36) + Math.random().toString(36).slice(2, 5);

export class EditorGrafo {
  /**
   * @param {HTMLElement} el
   * @param {{modo:'livre'|'vertices_fixos'|'selecionar_arestas', valor, config, leitura, aoMudar, figura, n}} op
   */
  constructor(el, op) {
    this.el = el;
    this.modo = op.modo || 'livre';
    this.cfg = op.config || {};
    this.leitura = !!op.leitura;
    this.aoMudar = op.aoMudar || (() => {});
    this.selV = null; this.selE = null;
    this.idSvg = 'ge' + (++contadorSvg);
    if (this.modo === 'selecionar_arestas') {
      this.fig = op.figura;
      this.W = this.fig.largura; this.H = this.fig.altura;
      this.marcadas = new Set((op.valor && op.valor.selecionadas) || []);
    } else {
      this.W = 640; this.H = 380;
      const v = op.valor && op.valor.vertices ? JSON.parse(JSON.stringify(op.valor)) : { dirigido: false, vertices: [], arestas: [] };
      if (this.modo === 'vertices_fixos') {
        const n = op.n || 0;
        const ok = v.vertices.length === n && v.vertices.every((x, i) => x.uid === 'v' + (i + 1));
        if (!ok) {
          v.vertices = this.circulo(n);
          v.arestas = [];
        }
      }
      this.g = { dirigido: !!v.dirigido, vertices: v.vertices || [], arestas: v.arestas || [] };
    }
    this.montar();
  }

  circulo(n) {
    const cx = this.W / 2, cy = this.H / 2, r = Math.min(this.W, this.H) / 2 - 45;
    return Array.from({ length: n }, (_, i) => ({
      uid: 'v' + (i + 1), nome: '',
      x: Math.round(cx + r * Math.cos(-Math.PI / 2 + 2 * Math.PI * i / n)),
      y: Math.round(cy + r * Math.sin(-Math.PI / 2 + 2 * Math.PI * i / n))
    }));
  }

  getValor() {
    if (this.modo === 'selecionar_arestas') return { selecionadas: Array.from(this.marcadas).sort() };
    return JSON.parse(JSON.stringify(this.g));
  }

  mudou() { this.desenhar(); this.atualizarBarra(); this.aoMudar(this.getValor()); }

  montar() {
    this.el.innerHTML = '';
    this.raiz = h('div', { class: 'editor-grafo', tabindex: this.leitura ? null : '0', style: { position: 'relative' } });
    this.barra = h('div', { class: 'eg-barra' });
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${this.W} ${this.H}`);
    this.svg.setAttribute('class', 'eg-svg' + (this.leitura ? ' leitura' : ''));
    if (!this.leitura) this.raiz.append(this.barra);
    this.raiz.append(this.svg);
    if (!this.leitura) {
      const ajuda = {
        livre: 'Clique no espaço vazio para criar um vértice (digite o nome e Enter) • arraste para mover • clique em um vértice e depois em outro para criar a aresta (no dígrafo: origem → destino) • duplo clique em um vértice ou aresta (ou selecione e use “✎ Renomear”) para dar nome • selecione e tecle Delete para excluir.',
        vertices_fixos: 'Clique em um vértice e depois em outro para criar a aresta (no dígrafo: origem → destino) • arraste os vértices para organizar • selecione uma aresta e tecle Delete para excluí-la.',
        selecionar_arestas: 'Clique nas arestas para destacá-las (clique de novo para desmarcar).'
      }[this.modo];
      this.raiz.append(h('div', { class: 'eg-ajuda' }, ajuda));
      this.ligarEventos();
    }
    this.el.append(this.raiz);
    this.montarBarra();
    this.desenhar();
  }

  montarBarra() {
    if (this.leitura) return;
    const b = this.barra;
    b.innerHTML = '';
    if (this.modo === 'selecionar_arestas') {
      this.contador = h('span', { class: 'contador' });
      b.append(this.contador, h('span', { class: 'espaco' }),
        h('button', { class: 'btn sec peq', type: 'button', onclick: () => { this.marcadas.clear(); this.mudou(); } }, 'Limpar seleção'));
      this.atualizarBarra();
      return;
    }
    if (this.cfg.permiteDirigido !== false) {
      this.chkDir = h('input', { type: 'checkbox' });
      this.chkDir.checked = this.g.dirigido;
      this.chkDir.addEventListener('change', () => { this.g.dirigido = this.chkDir.checked; this.mudou(); });
      b.append(h('label', { class: 'check', style: { fontWeight: 600 } }, this.chkDir, 'Dirigido (dígrafo)'));
    }
    this.btnLaco = h('button', { class: 'btn sec peq', type: 'button', title: 'Cria um laço no vértice selecionado', onclick: () => this.criarLaco() }, '↺ Laço');
    this.btnExcluir = h('button', { class: 'btn sec peq', type: 'button', onclick: () => this.excluirSelecionado() }, '🗑 Excluir selecionado');
    b.append(this.btnLaco, this.btnExcluir);
    if (this.modo === 'livre') {
      this.btnRenomear = h('button', { class: 'btn sec peq', type: 'button', title: 'Dar nome ao vértice ou à aresta selecionada', onclick: () => {
        if (this.selV) this.renomear('v', this.selV); else if (this.selE) this.renomear('a', this.selE);
      } }, '✎ Renomear');
      b.append(this.btnRenomear);
    }
    if (this.modo === 'vertices_fixos') {
      b.append(h('button', { class: 'btn sec peq', type: 'button', onclick: () => {
        const c = this.circulo(this.g.vertices.length);
        this.g.vertices.forEach((v, i) => { v.x = c[i].x; v.y = c[i].y; });
        this.mudou();
      } }, '◯ Reorganizar'));
    } else {
      b.append(h('button', { class: 'btn sec peq', type: 'button', onclick: async () => {
        if (await confirmar({ titulo: 'Limpar o grafo?', mensagem: 'Todos os vértices e arestas serão apagados. As matrizes associadas também perderão os valores.', ok: 'Limpar', perigo: true })) {
          this.g.vertices = []; this.g.arestas = []; this.selV = this.selE = null; this.mudou();
        }
      } }, 'Limpar tudo'));
    }
    this.contador = h('span', { class: 'contador' });
    b.append(h('span', { class: 'espaco' }), this.contador);
    this.atualizarBarra();
  }

  atualizarBarra() {
    if (this.leitura || !this.contador) return;
    if (this.modo === 'selecionar_arestas') { this.contador.textContent = this.marcadas.size + ' aresta(s) destacada(s)'; return; }
    const nV = this.g.vertices.length, nE = this.g.arestas.length;
    const c = this.cfg;
    const foraV = c.minV && (nV < c.minV || nV > c.maxV);
    const foraE = c.minE && (nE < c.minE || nE > c.maxE);
    this.contador.innerHTML = '';
    this.contador.append(
      h('span', { class: foraV ? 'contador fora' : '' }, nV + ' vértice(s)' + (c.minV ? ` (${c.minV}–${c.maxV})` : '')),
      ' · ',
      h('span', { class: foraE ? 'contador fora' : '' }, nE + ' aresta(s)' + (c.minE ? ` (${c.minE}–${c.maxE})` : '')));
    if (this.btnLaco) this.btnLaco.disabled = !this.selV;
    if (this.btnExcluir) this.btnExcluir.disabled = !(this.selE || (this.selV && this.modo === 'livre'));
    if (this.btnRenomear) this.btnRenomear.disabled = !(this.selE || this.selV);
  }

  desenhar() {
    if (this.modo === 'selecionar_arestas') {
      const vs = this.fig.vertices.map(v => ({ key: v.id, x: v.x, y: v.y, rotulo: v.id }));
      const as = this.fig.arestas.map(a => ({ key: chaveFig(a.de, a.para), de: a.de, para: a.para, peso: a.peso }));
      this.svg.innerHTML = conteudoSvg({ vs, as, dirigido: !!this.fig.dirigido, idSvg: this.idSvg, marcadas: this.marcadas });
      return;
    }
    this.svg.innerHTML = conteudoSvg({ vs: vsDoValor(this.g), as: asDoValor(this.g), dirigido: this.g.dirigido, selV: this.selV, selE: this.selE, idSvg: this.idSvg });
  }

  ponto(e) {
    const p = this.svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(this.svg.getScreenCTM().inverse());
    return { x: Math.round(Math.max(R + 2, Math.min(this.W - R - 2, q.x))), y: Math.round(Math.max(R + 2, Math.min(this.H - R - 18, q.y))) };
  }

  ligarEventos() {
    const svg = this.svg;
    svg.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      this.fecharRenomear();
      const vEl = e.target.closest('[data-v]');
      const aEl = e.target.closest('[data-e]');
      if (vEl && this.modo !== 'selecionar_arestas') {
        this.arrasto = { uid: vEl.dataset.v, x0: e.clientX, y0: e.clientY, movido: false };
        svg.setPointerCapture(e.pointerId);
      } else if (aEl) {
        this.cliqueAresta = aEl.dataset.e;
      } else {
        this.cliqueFundo = this.ponto(e);
      }
      this.raiz.focus({ preventScroll: true });
    });
    svg.addEventListener('pointermove', e => {
      if (!this.arrasto) return;
      if (!this.arrasto.movido && Math.hypot(e.clientX - this.arrasto.x0, e.clientY - this.arrasto.y0) < 5) return;
      this.arrasto.movido = true;
      const v = this.g.vertices.find(x => x.uid === this.arrasto.uid);
      if (!v) return;
      const p = this.ponto(e);
      v.x = p.x; v.y = p.y;
      if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = null; this.desenhar(); });
    });
    svg.addEventListener('pointerup', e => {
      if (this.arrasto) {
        const a = this.arrasto; this.arrasto = null;
        try { svg.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        if (a.movido) this.mudou(); else this.cliqueVertice(a.uid);
        return;
      }
      if (this.cliqueAresta) {
        const k = this.cliqueAresta; this.cliqueAresta = null;
        if (this.modo === 'selecionar_arestas') {
          this.marcadas.has(k) ? this.marcadas.delete(k) : this.marcadas.add(k);
          this.mudou();
        } else {
          this.cliqueArestaEditor(k);
        }
        return;
      }
      if (this.cliqueFundo) {
        const p = this.cliqueFundo; this.cliqueFundo = null;
        if (this.modo === 'selecionar_arestas') return;
        if (this.selV || this.selE) { this.selV = this.selE = null; this.desenhar(); this.atualizarBarra(); return; }
        if (this.modo === 'livre') this.criarVertice(p);
      }
    });
    // o duplo clique é detectado manualmente (o SVG é redesenhado entre os cliques,
    // o que impede o evento nativo "dblclick" de disparar de forma confiável)
    svg.addEventListener('dblclick', e => e.preventDefault());
    this.raiz.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.excluirSelecionado(); }
      if (e.key === 'Escape') { this.selV = this.selE = null; this.desenhar(); this.atualizarBarra(); }
    });
  }

  ehDuploClique(tipo, id) {
    const agora = Date.now(), u = this.ultimoClique;
    // um clique que acabou de criar uma aresta não inicia duplo clique (permite encadear arestas rapidamente)
    const duplo = !!(u && u.tipo === tipo && u.id === id && agora - u.t < 400 && !u.arestaCriada);
    this.ultimoClique = duplo ? null : { tipo, id, t: agora };
    return duplo ? u : null;
  }

  cliqueArestaEditor(k) {
    if (this.ehDuploClique('a', k) && this.modo === 'livre') {
      this.selE = null; this.selV = null;
      this.desenhar(); this.atualizarBarra();
      this.renomear('a', k);
      return;
    }
    this.selE = this.selE === k ? null : k; this.selV = null;
    this.desenhar(); this.atualizarBarra();
  }

  cliqueVertice(uid) {
    const duplo = this.ehDuploClique('v', uid);
    if (duplo) {
      this.selV = null; this.selE = null; // após renomear, nada fica selecionado (evita criar aresta no próximo clique)
      this.desenhar(); this.atualizarBarra();
      if (this.modo === 'livre') this.renomear('v', uid);
      return;
    }
    if (this.selV && this.selV !== uid) {
      const de = this.selV;
      this.selV = null;
      const nova = this.criarAresta(de, uid);
      if (this.ultimoClique) this.ultimoClique.arestaCriada = nova;
      this.desenhar(); this.atualizarBarra();
    } else {
      this.selV = this.selV === uid ? null : uid;
      this.selE = null;
      this.desenhar(); this.atualizarBarra();
    }
  }

  criarVertice(p) {
    if (this.cfg.maxV && this.g.vertices.length >= this.cfg.maxV) { toast(`Limite de ${this.cfg.maxV} vértices atingido.`, 'aviso'); return; }
    const v = { uid: novoUid('v'), nome: '', x: p.x, y: p.y };
    this.g.vertices.push(v);
    this.mudou();
    this.renomear('v', v.uid);
  }

  criarAresta(de, para) {
    if (this.cfg.maxE && this.g.arestas.length >= this.cfg.maxE) { toast(`Limite de ${this.cfg.maxE} arestas atingido.`, 'aviso'); return null; }
    const uid = novoUid('a');
    this.g.arestas.push({ uid, de, para, nome: '' });
    this.mudou();
    return uid;
  }

  criarLaco() {
    if (!this.selV) return;
    this.criarAresta(this.selV, this.selV);
  }

  excluirSelecionado() {
    if (this.selE) {
      this.g.arestas = this.g.arestas.filter(a => a.uid !== this.selE);
      this.selE = null; this.mudou();
    } else if (this.selV && this.modo === 'livre') {
      const u = this.selV;
      this.g.vertices = this.g.vertices.filter(v => v.uid !== u);
      this.g.arestas = this.g.arestas.filter(a => a.de !== u && a.para !== u);
      this.selV = null; this.mudou();
    }
  }

  fecharRenomear() { if (this.inputNome) this.inputNome.blur(); }

  /** Converte coordenadas do SVG em posição relativa ao editor (considera zoom e margens). */
  posTela(x, y) {
    const p = this.svg.createSVGPoint(); p.x = x; p.y = y;
    const q = p.matrixTransform(this.svg.getScreenCTM());
    const rr = this.raiz.getBoundingClientRect();
    return { x: q.x - rr.left, y: q.y - rr.top };
  }

  renomear(tipo, uid) {
    const alvo = tipo === 'v' ? this.g.vertices.find(x => x.uid === uid) : this.g.arestas.find(x => x.uid === uid);
    if (!alvo) return;
    this.fecharRenomear();
    let px, py;
    if (tipo === 'v') { px = alvo.x; py = alvo.y + R + 6; }
    else {
      const A = this.g.vertices.find(v => v.uid === alvo.de), B = this.g.vertices.find(v => v.uid === alvo.para);
      if (!A || !B) return;
      px = (A.x + B.x) / 2; py = A === B ? A.y - R - 40 : (A.y + B.y) / 2 + 8;
    }
    const pos = this.posTela(px, py);
    const idx = (tipo === 'v' ? this.g.vertices : this.g.arestas).indexOf(alvo) + 1;
    const inp = h('input', { type: 'text', class: 'eg-renomear', maxlength: '28', placeholder: tipo === 'v' ? 'Nome do vértice v' + idx : 'Nome da aresta a' + idx + ' (opcional)', value: alvo.nome || '' });
    inp.style.left = Math.max(4, Math.min(this.raiz.clientWidth - 170, pos.x - 80)) + 'px';
    inp.style.top = pos.y + 'px';
    let feito = false;
    const concluir = salvar => {
      if (feito) return; feito = true;
      if (salvar) alvo.nome = inp.value.trim();
      inp.remove(); this.inputNome = null;
      this.mudou();
      this.raiz.focus({ preventScroll: true });
    };
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') concluir(true);
      if (e.key === 'Escape') concluir(false);
    });
    inp.addEventListener('pointerdown', e => e.stopPropagation());
    inp.addEventListener('blur', () => concluir(true));
    this.raiz.append(inp);
    this.inputNome = inp;
    inp.focus({ preventScroll: true }); inp.select();
    setTimeout(() => { if (document.activeElement !== inp && !feito) { inp.focus({ preventScroll: true }); inp.select(); } }, 0);
  }
}
