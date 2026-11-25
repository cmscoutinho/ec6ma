// prova.js — página inicial (instruções/identificação) e aplicação da prova em tela cheia
import { $, h, esc, toast, confirmar, baixar, fmtDataHora, fmtHora, fmtDuracao, fmtNota, logoDataUrl, cabecalhoInstitucional } from './util.js';
import { api, apiBeacon, agoraServidor } from './api.js';
import { montarQuestao, progressoQuestao, gerarArquivoProva } from './render.js';
import { criarMonitor, entrarTelaCheia, sairTelaCheia } from './monitor.js';
import { montarPainelMaterial } from './componentes/visualizador.js';

const app = $('#app');
const CHAVE_SESSAO = 'prova_grafos_sessao';
const INTERVALO_SALVAR = 25000;

const lerSessaoLocal = () => { try { return JSON.parse(localStorage.getItem(CHAVE_SESSAO) || 'null'); } catch (e) { return null; } };
const gravarSessaoLocal = s => { try { localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s)); } catch (e) { /* ignore */ } };
const chaveBackup = id => 'prova_grafos_backup_' + id;

/* ============================================================
 *  Página inicial
 * ============================================================ */

let statusServidor = null;
let relogioLanding = null;

async function paginaInicial(msgErro) {
  document.body.classList.remove('em-prova');
  app.innerHTML = '';
  app.append(h('div', { class: 'pagina' }, h('div', { class: 'cartao' }, 'Carregando…')));
  try {
    statusServidor = await api('status', {}, { tentativas: 3 });
  } catch (e) {
    app.innerHTML = '';
    app.append(cabecalhoInstitucional(null), h('div', { class: 'pagina' }, h('div', { class: 'faixa-estado erro' }, 'Não foi possível conectar ao servidor da prova: ' + e.message),
      h('button', { class: 'btn', onclick: () => paginaInicial() }, 'Tentar novamente')));
    return;
  }
  const cfg = statusServidor.config;
  document.title = (cfg.titulo || 'Prova') + ' — ' + cfg.disciplina;
  app.innerHTML = '';
  app.append(cabecalhoInstitucional(cfg));

  const faixa = h('div', { class: 'faixa-estado info' });
  const btnIniciar = h('button', { class: 'btn grande', type: 'button', style: { width: '100%', marginTop: '6px' } }, '▶ Iniciar prova em tela cheia');
  const erro = h('div', { class: 'faixa-estado erro' + (msgErro ? '' : ' oculto') }, msgErro || '');

  const campo = (rot, attrs) => { const i = h('input', Object.assign({ type: 'text', autocomplete: 'off', spellcheck: 'false' }, attrs)); return [h('label', { class: 'campo' }, rot, i), i]; };
  const [lN1, n1] = campo('Nome completo', { maxlength: '80' });
  const [lM1, m1] = campo('Matrícula', { inputmode: 'numeric', maxlength: '20' });
  const [lN2, n2] = campo('Nome completo', { maxlength: '80' });
  const [lM2, m2] = campo('Matrícula', { inputmode: 'numeric', maxlength: '20' });
  const blocoInt2 = h('div', { class: 'integrante' }, h('h4', {}, '2º integrante'), h('div', { class: 'duas-col' }, lN2, lM2));
  const chkInd = h('input', { type: 'checkbox' });
  chkInd.addEventListener('change', () => blocoInt2.classList.toggle('oculto', chkInd.checked));
  const chkConc = h('input', { type: 'checkbox' });

  const sessaoLocal = lerSessaoLocal();
  const cartaoRetomar = sessaoLocal ? h('div', { class: 'cartao', style: { borderColor: 'var(--ambar)' } },
    h('h3', {}, sessaoLocal.entregue ? 'Prova já entregue neste navegador' : 'Há uma prova em andamento neste navegador'),
    h('p', { class: 'pequeno' }, (sessaoLocal.nomes || []).join(' e ')),
    h('div', { class: 'linha-flex' },
      h('button', { class: 'btn ambar', onclick: () => retomar(sessaoLocal) }, sessaoLocal.entregue ? 'Ver comprovante / baixar prova' : '↻ Retomar em tela cheia'),
      h('button', { class: 'btn fantasma peq', onclick: async () => {
        if (await confirmar({ titulo: 'Esquecer esta sessão?', mensagem: 'Use apenas se este computador será usado por outra dupla. A prova continua salva no servidor e pode ser retomada informando as mesmas matrículas.', ok: 'Esquecer', perigo: true })) {
          localStorage.removeItem(CHAVE_SESSAO); paginaInicial();
        }
      } }, 'Não sou desta dupla'))) : null;

  const regras = [
    'A prova é feita em <b>dupla</b>, em um único computador, e tem duração de <b>' + cfg.duracaoMin + ' minutos</b> a partir do início (respeitando o horário máximo definido pelo professor).',
    'Ela ocorre em <b>tela cheia</b>. Saídas da tela cheia, trocas de aba, minimização da janela e perda de foco são <b>registradas</b> com horário e duração e enviadas ao professor.',
    '<b>Copiar, recortar e colar estão bloqueados</b>. Use apenas o teclado e o mouse dentro da plataforma.',
    'O <b>material de consulta</b> (PDFs das aulas) fica disponível dentro da própria prova, no botão “📚 Material” — não é preciso abrir outra aba.',
    'As respostas são <b>salvas automaticamente</b> no servidor. Se o computador travar, volte a esta página com as mesmas matrículas para retomar.',
    `Parte I: ${cfg.nObjetivas || 4} questões objetivas (5 alternativas, ${fmtNota(cfg.valorObjetivas || 2)} pontos). Parte II: 5 questões discursivas e interativas (desenho de grafos, matrizes, árvores por arrastar-e-soltar, ${fmtNota(cfg.valorDiscursivas || 8)} pontos), incluindo uma <b>troca cega de matrizes com outra dupla</b>.`,
    'Ao terminar o tempo, a prova é <b>bloqueada e enviada automaticamente</b>. Ao entregar, você recebe um <b>código de consulta</b> e pode baixar o arquivo da prova.',
  ];
  if (cfg.instrucoesExtras) regras.push(esc(cfg.instrucoesExtras));

  app.append(h('div', { class: 'pagina' },
    h('div', { class: 'grade-2' },
      h('div', {},
        h('div', { class: 'cartao' },
          h('h1', {}, cfg.titulo || 'Avaliação'),
          h('p', { class: 'mudo', style: { marginTop: '-4px' } }, [cfg.disciplina, 'Turma ' + cfg.turma, cfg.periodo].filter(Boolean).join(' · ')),
          faixa,
          h('p', { class: 'pequeno mudo' }, 'Abertura: ', h('b', {}, fmtDataHora(cfg.inicio)), ' · Horário máximo: ', h('b', {}, fmtDataHora(cfg.fim))),
          h('h3', { style: { marginTop: '18px' } }, 'Instruções'),
          h('ul', { class: 'regras' }, ...regras.map((r, i) => h('li', { 'data-i': String(i + 1), html: r })))),
        h('div', { class: 'linha-flex' },
          h('a', { class: 'btn sec', href: 'material.html', target: '_blank' }, '📚 Material de consulta'),
          h('a', { class: 'btn sec', href: 'resultado.html' }, '📝 Consultar resultado'))),
      h('div', {},
        cartaoRetomar,
        h('form', { class: 'cartao', onsubmit: e => { e.preventDefault(); iniciar(); } },
          h('h2', {}, 'Identificação da dupla'),
          h('div', { class: 'integrante' }, h('h4', {}, '1º integrante'), h('div', { class: 'duas-col' }, lN1, lM1)),
          blocoInt2,
          cfg.permitirIndividual ? h('label', { class: 'check', style: { marginBottom: '10px' } }, chkInd, h('span', {}, 'Farei a prova individualmente (somente com autorização do professor)')) : null,
          h('label', { class: 'check', style: { marginBottom: '14px' } }, chkConc, h('span', {}, 'Li as instruções e estou ciente de que as ocorrências serão registradas.')),
          erro, btnIniciar)))),
    h('div', { class: 'rodape' }, 'CESUPA — Centro Universitário do Estado do Pará'));

  btnIniciar.type = 'submit';

  function atualizarFaixa() {
    const agora = agoraServidor();
    let est = statusServidor.estado;
    if (cfg.inicio && cfg.fim) est = agora < cfg.inicio ? 'antes' : agora > cfg.fim ? 'encerrada' : 'aberta';
    faixa.className = 'faixa-estado ' + ({ aberta: 'aberta', antes: 'antes', encerrada: 'encerrada' }[est] || 'info');
    if (est === 'nao_configurada') faixa.textContent = 'O professor ainda não definiu o horário desta prova.';
    else if (est === 'antes') { faixa.innerHTML = ''; faixa.append('⏳ A prova abre em ', h('span', { class: 'contagem' }, fmtDuracao(cfg.inicio - agora)), ' (às ' + fmtHora(cfg.inicio) + ').'); }
    else if (est === 'aberta') faixa.textContent = '✅ Prova aberta. Acesso permitido até ' + fmtDataHora(cfg.fim) + '.';
    else faixa.textContent = '⛔ O prazo da prova terminou. Somente duplas com extensão autorizada pelo professor podem retomar.';
    btnIniciar.disabled = est === 'antes' || est === 'nao_configurada';
    btnIniciar.textContent = est === 'encerrada' ? '↻ Retomar (somente com extensão autorizada)' : '▶ Iniciar prova em tela cheia';
  }
  clearInterval(relogioLanding);
  atualizarFaixa();
  relogioLanding = setInterval(atualizarFaixa, 1000);

  async function iniciar() {
    erro.classList.add('oculto');
    const individual = chkInd.checked;
    const dados = { nome1: n1.value.trim(), mat1: m1.value.trim(), nome2: n2.value.trim(), mat2: m2.value.trim(), individual };
    const falha = msg => { erro.textContent = msg; erro.classList.remove('oculto'); };
    if (!dados.nome1 || !dados.mat1) return falha('Preencha nome e matrícula do 1º integrante.');
    if (!individual && (!dados.nome2 || !dados.mat2)) return falha('Preencha nome e matrícula do 2º integrante.');
    if (!/^\d{4,}$/.test(dados.mat1.replace(/\D/g, '')) || (!individual && !/^\d{4,}$/.test(dados.mat2.replace(/\D/g, '')))) return falha('Matrícula inválida: use apenas números.');
    if (!chkConc.checked) return falha('Confirme que leu as instruções.');
    const pedidoTelaCheia = entrarTelaCheia(); // precisa ser chamado dentro do clique
    btnIniciar.disabled = true; btnIniciar.textContent = 'Preparando a prova…';
    try {
      const s = await api('iniciar', dados, { tentativas: 2 });
      await pedidoTelaCheia;
      clearInterval(relogioLanding);
      abrirProva(s);
    } catch (e) {
      sairTelaCheia();
      falha(e.message);
      btnIniciar.disabled = false; atualizarFaixa();
    }
  }
}

async function retomar(local) {
  const pedido = local.entregue ? Promise.resolve() : entrarTelaCheia();
  try {
    const s = await api('retomar', { tentativaId: local.tentativaId, token: local.token }, { tentativas: 2 });
    await pedido;
    clearInterval(relogioLanding);
    if (s.status !== 'em_andamento') { sairTelaCheia(); telaFinal(s, { codigo: s.codigo, entregueEm: null }); return; }
    abrirProva(s);
  } catch (e) {
    sairTelaCheia();
    if (e.codigo === 'SESSAO_SUBSTITUIDA' || e.codigo === 'NAO_ENCONTRADA') localStorage.removeItem(CHAVE_SESSAO);
    paginaInicial(e.message);
  }
}

/* ============================================================
 *  Prova
 * ============================================================ */

const P = {};

function abrirProva(s) {
  Object.assign(P, {
    sessao: s, questoes: s.questoes, respostas: s.respostas || {}, bloqueados: new Set(s.bloqueados || []),
    troca: s.troca, atual: 0, pendentes: new Map(), versao: 0, salvando: false, ultimoSalvo: Date.now(),
    nEventos: s.nEventos || 0, prazo: s.prazo, encerrada: false, filaEventos: [], avisos: {}, materialMontado: false
  });
  gravarSessaoLocal({ tentativaId: s.tentativaId, token: s.token, nomes: s.nomes });
  // recupera alterações locais que não chegaram ao servidor
  try {
    const bk = JSON.parse(localStorage.getItem(chaveBackup(s.tentativaId)) || 'null');
    if (bk && bk.pendentes) bk.pendentes.forEach(k => {
      if (!P.bloqueados.has(k) && bk.respostas[k] !== undefined) { P.respostas[k] = bk.respostas[k]; P.pendentes.set(k, ++P.versao); }
    });
  } catch (e) { /* ignore */ }

  document.body.classList.add('em-prova');
  montarLayout();
  irPara(0);

  P.monitor = criarMonitor({
    aoIniciarAusencia: tipo => {
      if (tipo !== 'saiu_tela_cheia') return;
      mostrarBloqueioTelaCheia(true);
    },
    aoFinalizarAusencia: (tipo, dur) => registrarEvento(tipo, dur),
    aoMudarTelaCheia: em => mostrarBloqueioTelaCheia(!em)
  });
  P.monitor.iniciar();
  if (document.fullscreenEnabled === false) registrarEvento('tela_cheia_indisponivel', 0, true);

  P.timer = setInterval(tique, 1000);
  P.timerSalvar = setInterval(() => { if (P.pendentes.size && Date.now() - P.ultimoSalvo >= INTERVALO_SALVAR) salvar(); }, 5000);
  P.timerTroca = setInterval(verificarTroca, 20000);
  window.addEventListener('pagehide', aoSairDaPagina);
  tique();
  if (P.pendentes.size) salvar();
}

function montarLayout() {
  const s = P.sessao;
  app.innerHTML = '';
  P.el = {};
  P.el.relogio = h('div', { class: 'relogio', title: 'Tempo restante' }, '--:--');
  P.el.salvo = h('div', { class: 'status-salvo' }, 'Respostas salvas');
  P.el.ocorr = h('div', { class: 'ocorrencias', title: 'Saídas da tela cheia, trocas de aba e perdas de foco registradas' }, '');
  P.el.nav = h('nav', { class: 'navegacao' });
  P.el.area = h('main', { class: 'area-questao' });
  P.el.painel = h('aside', { class: 'painel-material oculto' });
  P.el.corpo = h('div', { class: 'corpo-prova' }, P.el.nav, P.el.area, P.el.painel);
  const btnMat = h('button', { class: 'btn sec peq', onclick: alternarMaterial }, '📚 Material');
  const btnEnt = h('button', { class: 'btn sucesso peq', onclick: () => entregar(false) }, '✔ Entregar prova');
  app.append(
    h('div', { class: 'barra-prova' },
      h('img', { class: 'logo-branco', src: 'img/cesupa_logo.png', alt: 'CESUPA' }),
      h('div', { class: 'dupla' }, h('b', {}, s.nomes.join(' & ')), h('br'), 'Matrículas: ' + s.matriculas.join(' / ')),
      h('div', { class: 'espaco' }),
      P.el.salvo, P.el.ocorr, P.el.relogio, btnMat, btnEnt),
    P.el.corpo);
  P.el.bloqueio = h('div', { class: 'sobreposicao oculto' },
    h('div', {},
      h('h2', {}, '⚠ Você saiu da tela cheia'),
      h('p', {}, 'Esta ocorrência está sendo registrada (com o tempo que durar). Volte para a tela cheia para continuar a prova.'),
      h('button', { class: 'btn grande', onclick: () => entrarTelaCheia() }, 'Voltar para a tela cheia')));
  app.append(P.el.bloqueio);
  atualizarOcorrencias();
  atualizarNav();
}

function mostrarBloqueioTelaCheia(sim) {
  if (!P.el || P.encerrada) return;
  P.el.bloqueio.classList.toggle('oculto', !sim);
}

function alternarMaterial() {
  const aberto = P.el.painel.classList.toggle('oculto');
  P.el.corpo.classList.toggle('com-material', !aberto);
  if (!aberto && !P.materialMontado) { P.materialMontado = true; montarPainelMaterial(P.el.painel, { compacto: true }); }
}

function atualizarOcorrencias() {
  P.el.ocorr.textContent = P.nEventos ? `⚠ ${P.nEventos} ocorrência(s) registrada(s)` : 'Nenhuma ocorrência';
  P.el.ocorr.classList.toggle('tem', P.nEventos > 0);
}

function atualizarNav() {
  const nav = P.el.nav;
  nav.innerHTML = '';
  const objs = P.questoes.filter(q => q.tipo === 'objetiva');
  const discs = P.questoes.filter(q => q.tipo !== 'objetiva');
  const grade = h('div', { class: 'grade-obj' + (objs.length === 4 ? ' n4' : '') });
  objs.forEach(q => {
    const i = P.questoes.indexOf(q);
    grade.append(h('button', { class: 'nav-item' + (P.respostas[q.id] ? ' respondida' : '') + (i === P.atual ? ' atual' : ''), title: q.titulo, onclick: () => irPara(i) }, String(q.numero)));
  });
  nav.append(h('h4', {}, 'Parte I — Objetivas'), grade, h('h4', {}, 'Parte II — Discursivas'));
  discs.forEach(q => {
    const i = P.questoes.indexOf(q);
    const pr = progressoQuestao(q, P.respostas);
    nav.append(h('button', { class: 'nav-item nav-disc' + (pr >= 1 ? ' respondida' : pr > 0 ? ' parcial' : '') + (i === P.atual ? ' atual' : ''), onclick: () => irPara(i) },
      h('b', {}, 'Q' + q.numero + ' '), q.titulo, h('div', { class: 'barra' }, h('i', { style: { width: Math.round(pr * 100) + '%' } }))));
  });
  const respondidas = objs.filter(q => P.respostas[q.id]).length;
  nav.append(h('div', { class: 'legenda-nav' },
    h('span', { class: 'l-resp' }, 'respondida'), h('span', { class: 'l-parc' }, 'parcialmente respondida'),
    h('div', { style: { marginTop: '8px' } }, `Objetivas respondidas: ${respondidas}/${objs.length}`)));
}

let navPendente = null;
function agendarNav() { clearTimeout(navPendente); navPendente = setTimeout(atualizarNav, 400); }

function irPara(i) {
  if (i < 0 || i >= P.questoes.length) return;
  P.atual = i;
  renderizarAtual();
  atualizarNav();
  P.el.area.scrollTop = 0;
}

function renderizarAtual() {
  const q = P.questoes[P.atual];
  const cont = h('div');
  montarQuestao(cont, q, {
    respostas: P.respostas, bloqueados: P.bloqueados, troca: P.troca,
    aoMudar: (id, v) => alterar(id, v),
    acoes: { liberarTroca, enviarAnalise }
  });
  P.el.area.innerHTML = '';
  P.el.area.append(cont, h('div', { class: 'nav-rodape' },
    h('button', { class: 'btn sec', disabled: P.atual === 0, onclick: () => irPara(P.atual - 1) }, '← Anterior'),
    P.atual < P.questoes.length - 1
      ? h('button', { class: 'btn', onclick: () => irPara(P.atual + 1) }, 'Próxima →')
      : h('button', { class: 'btn sucesso', onclick: () => entregar(false) }, '✔ Entregar prova')));
}

function alterar(id, v) {
  if (P.encerrada || P.bloqueados.has(id)) return;
  P.respostas[id] = v;
  P.pendentes.set(id, ++P.versao);
  P.el.salvo.textContent = '● Alterações não salvas';
  backupLocal();
  agendarNav();
}

function backupLocal() {
  try { localStorage.setItem(chaveBackup(P.sessao.tentativaId), JSON.stringify({ respostas: P.respostas, pendentes: Array.from(P.pendentes.keys()) })); } catch (e) { /* ignore */ }
}

const cred = () => ({ tentativaId: P.sessao.tentativaId, token: P.sessao.token });

function pacotePendentes() {
  const r = {}, vers = {};
  P.pendentes.forEach((ver, k) => { r[k] = P.respostas[k]; vers[k] = ver; });
  return { r, vers };
}
function confirmarEnviados(vers) {
  Object.entries(vers).forEach(([k, ver]) => { if (P.pendentes.get(k) === ver) P.pendentes.delete(k); });
  backupLocal();
}

async function salvar() {
  if (P.salvando || P.encerrada || !P.pendentes.size) return;
  P.salvando = true;
  const { r, vers } = pacotePendentes();
  P.el.salvo.textContent = '⟳ Salvando…';
  try {
    const res = await api('salvar', Object.assign(cred(), { respostas: r }), { tentativas: 2, timeout: 45000 });
    confirmarEnviados(vers);
    P.ultimoSalvo = Date.now();
    if (res.prazo) P.prazo = res.prazo;
    P.el.salvo.textContent = (P.pendentes.size ? '● ' : '✓ Salvo às ') + fmtHora(Date.now());
  } catch (e) {
    P.ultimoSalvo = Date.now() - INTERVALO_SALVAR + 8000; // tenta de novo em ~8 s
    if (tratarErroFatal(e)) return;
    P.el.salvo.textContent = '⚠ Sem conexão — respostas guardadas neste computador';
  } finally {
    P.salvando = false;
  }
}

function tratarErroFatal(e) {
  if (e.codigo === 'SESSAO_SUBSTITUIDA') {
    P.encerrada = true;
    encerrarTimers();
    P.monitor && P.monitor.parar();
    localStorage.removeItem(CHAVE_SESSAO);
    app.append(h('div', { class: 'sobreposicao' }, h('div', {}, h('h2', {}, 'Sessão encerrada'), h('p', {}, e.message),
      h('button', { class: 'btn', onclick: () => { sairTelaCheia(); location.reload(); } }, 'Voltar à página inicial'))));
    return true;
  }
  if (e.codigo === 'ENCERRADA' || e.codigo === 'PRAZO') { if (!P.encerrada) encerrarPorTempo(); return true; }
  return false;
}

/* ---------- Ocorrências ---------- */

const SUSPEITOS = ['saiu_tela_cheia', 'aba_oculta', 'perdeu_foco'];

function registrarEvento(tipo, duracaoMs, semContar) {
  if (P.encerrada) return;
  if (SUSPEITOS.includes(tipo) && !semContar) { P.nEventos++; atualizarOcorrencias(); }
  const ev = Object.assign(cred(), { tipo, duracaoMs, detalhe: duracaoMs ? 'duração ' + fmtDuracao(duracaoMs) : '' });
  P.filaEventos.push(ev);
  enviarFilaEventos();
  if (tipo === 'aba_oculta' || tipo === 'perdeu_foco') toast('Ocorrência registrada: ' + (tipo === 'aba_oculta' ? 'troca de aba/minimização' : 'janela fora de foco') + ' (' + fmtDuracao(duracaoMs) + ').', 'erro', 5000);
}

async function enviarFilaEventos() {
  if (P.enviandoEventos) return;
  P.enviandoEventos = true;
  try {
    while (P.filaEventos.length) {
      const ev = P.filaEventos[0];
      try {
        const r = await api('evento', ev, { tentativas: 2, timeout: 30000 });
        P.filaEventos.shift();
        if (r.nEventos !== undefined && r.nEventos > P.nEventos) { P.nEventos = r.nEventos; atualizarOcorrencias(); }
      } catch (e) {
        if (tratarErroFatal(e)) return;
        if (e.doServidor) { P.filaEventos.shift(); continue; }
        setTimeout(enviarFilaEventos, 10000);
        return;
      }
    }
  } finally { P.enviandoEventos = false; }
}

function aoSairDaPagina() {
  if (P.encerrada || !P.monitor) return;
  P.monitor.pendentes().forEach(p => apiBeacon('evento', Object.assign(cred(), { tipo: p.tipo, duracaoMs: p.duracaoMs, detalhe: 'página fechada durante a ocorrência' })));
  P.filaEventos.forEach(ev => apiBeacon('evento', ev));
  if (P.pendentes.size) apiBeacon('salvar', Object.assign(cred(), { respostas: pacotePendentes().r }));
}

/* ---------- Tempo ---------- */

function tique() {
  if (P.encerrada) return;
  const rest = P.prazo - agoraServidor();
  P.el.relogio.textContent = fmtDuracao(rest);
  P.el.relogio.className = 'relogio' + (rest <= 5 * 60000 ? ' critico' : rest <= 15 * 60000 ? ' alerta' : '');
  if (rest <= 15 * 60000 && rest > 14 * 60000 && !P.avisos.q15) { P.avisos.q15 = true; toast('Faltam 15 minutos para o fim da prova.', 'aviso', 7000); }
  if (rest <= 5 * 60000 && rest > 4 * 60000 && !P.avisos.q5) { P.avisos.q5 = true; toast('Faltam 5 minutos! Revise e entregue a prova.', 'erro', 8000); }
  if (rest <= 0) encerrarPorTempo();
}

function encerrarTimers() { clearInterval(P.timer); clearInterval(P.timerSalvar); clearInterval(P.timerTroca); }

function encerrarPorTempo() {
  if (P.encerrada) return;
  entregar(true);
}

/* ---------- Troca cega ---------- */

async function verificarTroca() {
  if (P.encerrada || !P.troca || !P.troca.liberado) return;
  const precisa = P.troca.estado !== 'recebido' || !(P.troca.analisesRecebidas || []).length;
  if (!precisa) return;
  try {
    const r = await api('trocaStatus', cred());
    aplicarTroca(r.troca);
  } catch (e) { tratarErroFatal(e); }
}

function aplicarTroca(nova) {
  const antiga = P.troca || {};
  P.troca = nova;
  const chegouMatriz = antiga.estado !== 'recebido' && nova.estado === 'recebido';
  const chegouAnalise = (nova.analisesRecebidas || []).length > (antiga.analisesRecebidas || []).length;
  const num = id => (P.questoes.find(x => x.id === id) || {}).numero;
  if (chegouMatriz) toast(`🔁 Vocês receberam as matrizes de outra dupla! Veja a Questão ${num('d2')}.`, 'ok', 8000);
  if (chegouAnalise) toast(`📨 A outra dupla enviou a reconstrução do seu grafo. Veja a Questão ${num('d1')}, item e).`, 'ok', 8000);
  const q = P.questoes[P.atual];
  if ((chegouMatriz && q.id === 'd2') || (chegouAnalise && q.id === 'd1')) renderizarAtual();
  atualizarNav();
}

async function liberarTroca() {
  const g = P.respostas.d1_grafo || { vertices: [], arestas: [] };
  const nV = g.vertices.length, nE = g.arestas.length;
  const nInc = Object.keys((P.respostas.d1_inc || {}).celulas || {}).length;
  const nAdj = Object.keys((P.respostas.d1_adj || {}).celulas || {}).length;
  if (nV < 2 || !nE) { toast('Desenhe o grafo antes de liberar as matrizes.', 'erro'); return; }
  const avisos = [];
  if (nV < 6 || nV > 8) avisos.push(`O grafo tem ${nV} vértices (pedido: 6 a 8).`);
  if (nE < 8 || nE > 12) avisos.push(`O grafo tem ${nE} arestas (pedido: 8 a 12).`);
  if (g.vertices.some(v => !v.nome)) avisos.push('Há vértices sem nome.');
  if (!nInc) avisos.push('A matriz de incidência está vazia (toda zero).');
  if (!nAdj) avisos.push('A matriz de adjacência está vazia (toda zero).');
  if (!String(P.respostas.d1_just || '').trim()) avisos.push('A justificativa (item b) está em branco.');
  const ok = await confirmar({
    titulo: 'Liberar as matrizes para a troca?',
    html: '<p>Depois de liberar, o desenho, a justificativa e as matrizes <b>não poderão mais ser alterados</b>. Somente as duas matrizes serão enviadas a outra dupla.</p>' +
      (avisos.length ? '<div class="aviso-box ambar"><b>Atenção:</b><ul>' + avisos.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul></div>' : ''),
    ok: 'Liberar matrizes'
  });
  if (!ok) return;
  try {
    const { r, vers } = pacotePendentes();
    ['d1_grafo', 'd1_just', 'd1_inc', 'd1_adj'].forEach(k => { r[k] = P.respostas[k]; });
    const res = await api('trocaLiberar', Object.assign(cred(), { respostas: r }), { tentativas: 2 });
    confirmarEnviados(vers);
    P.bloqueados = new Set(res.bloqueados);
    ['d1_grafo', 'd1_just', 'd1_inc', 'd1_adj'].forEach(k => P.pendentes.delete(k));
    aplicarTroca(res.troca);
    renderizarAtual();
    toast(res.troca.estado === 'recebido' ? 'Matrizes liberadas e já recebidas de outra dupla!' : 'Matrizes liberadas. Aguardando outra dupla…', 'ok');
  } catch (e) { if (!tratarErroFatal(e)) toast(e.message, 'erro', 6000); }
}

async function enviarAnalise() {
  const avisos = [];
  if (!((P.respostas.d2_grafo || {}).arestas || []).length) avisos.push('O grafo reconstruído não tem arestas.');
  if (!(P.respostas.d2_bfs || []).length) avisos.push('A ordem da BFS está vazia.');
  if (!P.respostas.d2_cenario) avisos.push('O palpite de cenário não foi escolhido.');
  const ok = await confirmar({
    titulo: 'Enviar a análise à dupla de origem?',
    html: `<p>A reconstrução, o palpite e a justificativa serão mostrados à dupla que elaborou as matrizes, e os itens da Questão ${(P.questoes.find(x => x.id === 'd2') || {}).numero} serão <b>bloqueados</b>. Em seguida, o grafo original (com nomes) e o cenário verdadeiro serão revelados a vocês.</p>` +
      (avisos.length ? '<div class="aviso-box ambar"><b>Atenção:</b><ul>' + avisos.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul></div>' : ''),
    ok: 'Enviar análise'
  });
  if (!ok) return;
  try {
    const { r, vers } = pacotePendentes();
    ['d2_grafo', 'd2_graus', 'd2_isolados', 'd2_ciclos', 'd2_bfs', 'd2_cenario', 'd2_just'].forEach(k => { if (P.respostas[k] !== undefined) r[k] = P.respostas[k]; });
    const res = await api('trocaEnviarAnalise', Object.assign(cred(), { respostas: r }), { tentativas: 2 });
    confirmarEnviados(vers);
    P.bloqueados = new Set(res.bloqueados);
    aplicarTroca(res.troca);
    renderizarAtual();
    toast('Análise enviada à dupla de origem.', 'ok');
  } catch (e) { if (!tratarErroFatal(e)) toast(e.message, 'erro', 6000); }
}

/* ---------- Entrega ---------- */

async function entregar(auto) {
  if (P.encerrada) return;
  if (!auto) {
    const faltam = P.questoes.filter(q => progressoQuestao(q, P.respostas) < 1).map(q => q.numero);
    const ok = await confirmar({
      titulo: 'Entregar a prova agora?',
      html: (faltam.length ? `<div class="aviso-box ambar">Questões sem resposta completa: <b>${faltam.join(', ')}</b>.</div>` : '<p>Todas as questões têm resposta.</p>') +
        '<p>Depois de entregar, não será possível alterar as respostas.</p>',
      ok: 'Entregar definitivamente', perigo: false
    });
    if (!ok || P.encerrada) return;
  }
  P.encerrada = true;
  encerrarTimers();
  // finaliza ocorrências em aberto antes de encerrar o monitoramento
  const abertas = P.monitor ? P.monitor.pendentes() : [];
  P.monitor && P.monitor.parar();
  for (const a of abertas) P.filaEventos.push(Object.assign(cred(), { tipo: a.tipo, duracaoMs: a.duracaoMs, detalhe: 'em andamento no momento da entrega' }));
  P.filaEventos.forEach(ev => api('evento', ev).catch(() => apiBeacon('evento', ev)));
  P.filaEventos = [];

  const sobre = h('div', { class: 'sobreposicao' });
  const msg = h('p', {}, 'Enviando suas respostas ao servidor… não feche esta janela.');
  sobre.append(h('div', {}, h('h2', {}, auto ? '⏰ Tempo esgotado' : 'Entregando a prova'), msg));
  app.append(sobre);
  if (P.el.bloqueio) P.el.bloqueio.classList.add('oculto');

  const cfg = P.sessao.config;
  const logo = await logoDataUrl();
  let relatorio = '';
  try { relatorio = await gerarArquivoProva({ config: cfg, sessao: P.sessao, questoes: P.questoes, respostas: P.respostas, troca: P.troca, entregueEm: Date.now(), nEventos: P.nEventos, logo }); } catch (e) { relatorio = ''; }

  let tentativa = 0;
  const enviar = async () => {
    tentativa++;
    try {
      const r = await api('entregar', Object.assign(cred(), { respostas: P.respostas, auto, relatorioHtml: relatorio }), { tentativas: 2, timeout: 90000 });
      localStorage.removeItem(chaveBackup(P.sessao.tentativaId));
      gravarSessaoLocal({ tentativaId: P.sessao.tentativaId, token: P.sessao.token, nomes: P.sessao.nomes, entregue: true, codigo: r.codigo });
      window.removeEventListener('pagehide', aoSairDaPagina);
      telaFinal(P.sessao, { codigo: r.codigo, entregueEm: r.entregueEm, logo, respostas: P.respostas, troca: P.troca, nEventos: P.nEventos });
    } catch (e) {
      if (e.codigo === 'SESSAO_SUBSTITUIDA') { tratarErroFatal(e); return; }
      msg.innerHTML = '';
      msg.append('Não foi possível enviar (' + e.message + '). Nova tentativa automática em 10 s. ',
        h('br'), h('br'),
        h('button', { class: 'btn', onclick: () => { clearTimeout(P.retentar); enviar(); } }, 'Tentar agora'), ' ',
        h('button', { class: 'btn', onclick: () => baixar(nomeArquivo(), relatorio, 'text/html;charset=utf-8') }, 'Baixar cópia da prova'));
      P.retentar = setTimeout(enviar, 10000);
    }
  };
  enviar();
}

function nomeArquivo() { return 'Prova_Grafos_' + P.sessao.matriculas.join('_') + '.html'; }

async function telaFinal(sessao, { codigo, entregueEm, logo, respostas, troca, nEventos }) {
  encerrarTimers();
  document.body.classList.remove('em-prova');
  const cfg = sessao.config;
  const resp = respostas || sessao.respostas || {};
  const tr = troca || sessao.troca;
  app.innerHTML = '';
  const baixarProva = async () => {
    const html = await gerarArquivoProva({ config: cfg, sessao: Object.assign({}, sessao, { codigo }), questoes: sessao.questoes, respostas: resp, troca: tr, entregueEm, nEventos: nEventos !== undefined ? nEventos : sessao.nEventos, logo: logo || await logoDataUrl() });
    baixar('Prova_Grafos_' + sessao.matriculas.join('_') + '.html', html, 'text/html;charset=utf-8');
  };
  app.append(cabecalhoInstitucional(cfg),
    h('div', { class: 'pagina' }, h('div', { class: 'cartao final' },
      h('div', { style: { fontSize: '3rem' } }, '✅'),
      h('h1', {}, 'Prova entregue com sucesso'),
      h('p', {}, sessao.nomes.join(' e ')),
      h('p', { class: 'mudo' }, 'Código de consulta do resultado (anote ou fotografe):'),
      h('div', { class: 'codigo-grande' }, codigo || '—'),
      h('p', { class: 'pequeno' }, 'Quando o professor liberar a correção, acesse “Consultar resultado” e informe sua matrícula e este código.'),
      h('div', { class: 'linha-flex', style: { justifyContent: 'center' } },
        h('button', { class: 'btn', onclick: baixarProva }, '⬇ Baixar minha prova (.html)'),
        document.fullscreenElement ? h('button', { class: 'btn sec', onclick: e => { sairTelaCheia(); e.target.remove(); } }, 'Sair da tela cheia') : null,
        h('a', { class: 'btn sec', href: 'resultado.html' }, 'Página de resultado')))));
}

/* ---------- inicialização ---------- */
paginaInicial();
