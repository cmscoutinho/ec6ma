// componentes/visualizador.js — leitor de PDF embutido (PDF.js local, sem dependência de CDN)
import { h } from '../util.js';
import { api } from '../api.js';

let pdfjsPromise = null;
function carregarPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('../../vendor/pdfjs/pdf.min.mjs').then(m => {
      m.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
      return m;
    });
  }
  return pdfjsPromise;
}

const cache = new Map();
/** Busca um material no servidor (PDF guardado no Google Drive) — com cache em memória. */
export async function obterMaterial(id) {
  if (cache.has(id)) return cache.get(id);
  const p = api('material', { id }, { tentativas: 2, timeout: 120000 }).then(r => {
    if (r.url) return { url: r.url, titulo: r.titulo };
    const bin = atob(r.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, titulo: r.titulo };
  });
  cache.set(id, p);
  p.catch(() => cache.delete(id));
  return p;
}

export class VisualizadorPDF {
  constructor(el) {
    this.el = el;
    this.escala = 1;
    this.ajustar = true;
    this.paginaAtual = h('input', { type: 'number', min: '1', value: '1' });
    this.total = h('span', {}, '/ –');
    this.zoomTxt = h('span', { style: { minWidth: '44px', textAlign: 'center' } }, '—');
    this.paginas = h('div', { class: 'pdf-paginas' }, h('div', { class: 'pdf-vazio' }, 'Selecione um material para visualizar.'));
    const barra = h('div', { class: 'pdf-ferramentas' },
      h('button', { class: 'btn sec peq', type: 'button', title: 'Página anterior', onclick: () => this.irPara(this.atual - 1) }, '◀'),
      this.paginaAtual, this.total,
      h('button', { class: 'btn sec peq', type: 'button', title: 'Próxima página', onclick: () => this.irPara(this.atual + 1) }, '▶'),
      h('span', { class: 'espaco' }),
      h('button', { class: 'btn sec peq', type: 'button', title: 'Diminuir zoom', onclick: () => this.zoom(1 / 1.2) }, '−'),
      this.zoomTxt,
      h('button', { class: 'btn sec peq', type: 'button', title: 'Aumentar zoom', onclick: () => this.zoom(1.2) }, '+'),
      h('button', { class: 'btn sec peq', type: 'button', onclick: () => { this.ajustar = true; this.redesenhar(); } }, 'Ajustar à largura'));
    this.paginaAtual.addEventListener('change', () => this.irPara(Number(this.paginaAtual.value)));
    this.el.innerHTML = '';
    this.el.append(h('div', { class: 'pdf-viewer' }, barra, this.paginas));
    this.paginas.addEventListener('scroll', () => this.atualizarIndicador());
    this.atual = 1;
    window.addEventListener('resize', () => { if (this.ajustar && this.doc) { clearTimeout(this.tr); this.tr = setTimeout(() => this.redesenhar(), 250); } });
  }

  mensagem(txt) { this.paginas.innerHTML = ''; this.paginas.append(h('div', { class: 'pdf-vazio' }, txt)); }

  async abrir(material) {
    this.mensagem('Carregando material…');
    try {
      if (material.url) {
        // material hospedado por URL pública
        try {
          const pdfjs = await carregarPdfJs();
          this.doc = await pdfjs.getDocument({ url: material.url }).promise;
        } catch (e) {
          this.paginas.innerHTML = '';
          this.paginas.append(h('iframe', { src: material.url, style: { width: '100%', height: '100%', border: 0, background: '#fff' } }));
          return;
        }
      } else {
        const pdfjs = await carregarPdfJs();
        this.doc = await pdfjs.getDocument({ data: material.bytes.slice() }).promise;
      }
      this.total.textContent = '/ ' + this.doc.numPages;
      this.paginaAtual.max = this.doc.numPages;
      this.atual = 1;
      this.paginas.scrollTop = 0;
      await this.redesenhar();
    } catch (e) {
      console.error(e);
      if (material.bytes) {
        // alternativa: leitor nativo do navegador
        const url = URL.createObjectURL(new Blob([material.bytes], { type: 'application/pdf' }));
        this.paginas.innerHTML = '';
        this.paginas.append(h('iframe', { src: url, style: { width: '100%', height: '100%', border: 0 } }));
      } else this.mensagem('Não foi possível abrir este material.');
    }
  }

  zoom(f) { if (!this.doc) return; this.ajustar = false; this.escala = Math.max(0.4, Math.min(4, this.escala * f)); this.redesenhar(); }

  async redesenhar() {
    if (!this.doc) return;
    const gen = (this.geracao = (this.geracao || 0) + 1);
    const p1 = await this.doc.getPage(1);
    const vp1 = p1.getViewport({ scale: 1 });
    if (this.ajustar) this.escala = Math.max(0.4, (this.paginas.clientWidth - 34) / vp1.width);
    this.zoomTxt.textContent = Math.round(this.escala * 100) + '%';
    const posRel = this.paginas.scrollHeight ? this.paginas.scrollTop / this.paginas.scrollHeight : 0;
    this.paginas.innerHTML = '';
    if (this.obs) this.obs.disconnect();
    this.canvases = [];
    this.obs = new IntersectionObserver(ents => ents.forEach(en => {
      if (en.isIntersecting) this.renderizar(Number(en.target.dataset.p), gen);
    }), { root: this.paginas, rootMargin: '600px 0px' });
    for (let i = 1; i <= this.doc.numPages; i++) {
      const c = h('canvas', { dataset: { p: String(i) } });
      c.style.width = Math.floor(vp1.width * this.escala) + 'px';
      c.style.height = Math.floor(vp1.height * this.escala) + 'px';
      this.paginas.append(c);
      this.canvases.push(c);
      this.obs.observe(c);
    }
    this.paginas.scrollTop = posRel * this.paginas.scrollHeight;
  }

  async renderizar(n, gen) {
    const c = this.canvases[n - 1];
    if (!c || c.dataset.feito === String(gen)) return;
    c.dataset.feito = String(gen);
    const pg = await this.doc.getPage(n);
    if (gen !== this.geracao) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vp = pg.getViewport({ scale: this.escala * dpr });
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    c.style.width = Math.floor(vp.width / dpr) + 'px';
    c.style.height = Math.floor(vp.height / dpr) + 'px';
    await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.catch(() => {});
  }

  irPara(n) {
    if (!this.doc) return;
    n = Math.max(1, Math.min(this.doc.numPages, n || 1));
    const c = this.canvases[n - 1];
    if (c) this.paginas.scrollTop = c.offsetTop - this.paginas.offsetTop - 8;
    this.atual = n; this.paginaAtual.value = n;
  }

  atualizarIndicador() {
    if (!this.canvases) return;
    const topo = this.paginas.scrollTop + this.paginas.offsetTop + 40;
    let n = 1;
    this.canvases.forEach((c, i) => { if (c.offsetTop <= topo) n = i + 1; });
    if (n !== this.atual) { this.atual = n; this.paginaAtual.value = n; }
  }
}

/** Monta um painel completo (lista de materiais + leitor) dentro de `el`. */
export async function montarPainelMaterial(el, { compacto = false } = {}) {
  el.innerHTML = '';
  let lista = [];
  try { lista = (await api('materiais', {}, { tentativas: 2 })).materiais; } catch (e) { el.append(h('div', { class: 'aviso-box vermelho', style: { margin: '12px' } }, e.message)); return; }
  const leitor = h('div', { style: { display: 'flex', flexDirection: 'column', flex: '1', minHeight: '0', height: '100%' } });
  const v = new VisualizadorPDF(leitor);
  const abrir = async id => {
    const m = lista.find(x => x.id === id);
    if (!m) return;
    v.mensagem('Baixando “' + m.titulo + '”…');
    try { await v.abrir(await obterMaterial(id)); } catch (e) { v.mensagem('Erro ao carregar: ' + e.message); }
  };
  if (!lista.length) { el.append(h('div', { class: 'pdf-vazio', style: { color: 'var(--texto-2)' } }, 'Nenhum material foi cadastrado pelo professor.')); return; }
  if (compacto) {
    const sel = h('select', {}, ...lista.map(m => h('option', { value: m.id }, m.titulo)));
    sel.addEventListener('change', () => abrir(sel.value));
    el.append(h('div', { class: 'topo' }, h('b', { style: { color: 'var(--azul)', whiteSpace: 'nowrap' } }, '📚 Material'), sel), leitor);
    abrir(lista[0].id);
  } else {
    const nav = h('div', { class: 'material-lista' }, h('h3', {}, 'Material de consulta'));
    lista.forEach((m, i) => {
      const b = h('button', { class: i === 0 ? 'ativo' : '', onclick: () => { nav.querySelectorAll('button').forEach(x => x.classList.remove('ativo')); b.classList.add('ativo'); abrir(m.id); } }, m.titulo);
      nav.append(b);
    });
    el.append(h('div', { class: 'material-layout' }, nav, leitor));
    abrir(lista[0].id);
  }
}
