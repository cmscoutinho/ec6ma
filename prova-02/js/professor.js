// professor.js — painel do professor: monitoramento, correção, troca, configuração, materiais e LLM
import { $, h, esc, toast, confirmar, baixar, fmtDataHora, fmtHora, fmtDuracao, fmtNota, cabecalhoInstitucional } from './util.js';
import { api, agoraServidor } from './api.js';
import { htmlQuestaoLeitura, htmlVerificacao } from './render.js';

const app = $('#app');
const LETRAS = 'ABCDE';
let senha = sessionStorage.getItem('prova_prof_senha') || '';
let cfg = null;
let abaAtual = 'monitor';
let timerMonitor = null;
let selecionada = null;

const adm = (acao, dados = {}, op) => api(acao, Object.assign({ senha }, dados), op);

const ROT_STATUS = { em_andamento: ['Em andamento', 'andamento'], entregue: ['Entregue', 'entregue'], expirada: ['Expirada (auto)', 'expirada'] };
const ROT_EVENTO = { saiu_tela_cheia: 'tela cheia', aba_oculta: 'aba/minimizar', perdeu_foco: 'foco', retomada: 'retomada', recarregou: 'recarga' };

function selo(status) { const r = ROT_STATUS[status] || [status, 'cinza']; return h('span', { class: 'selo ' + r[1] }, r[0]); }

/* ---------------- Login ---------------- */
async function login(msg) {
  app.innerHTML = '';
  const inp = h('input', { type: 'password', placeholder: 'Senha do professor', autocomplete: 'current-password' });
  const erro = h('div', { class: 'faixa-estado erro' + (msg ? '' : ' oculto') }, msg || '');
  const entrar = async () => {
    senha = inp.value;
    try {
      const r = await adm('adminLogin');
      cfg = r.config;
      sessionStorage.setItem('prova_prof_senha', senha);
      painel();
    } catch (e) { erro.textContent = e.message; erro.classList.remove('oculto'); }
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });
  app.append(cabecalhoInstitucional(null), h('div', { class: 'pagina', style: { maxWidth: '460px' } },
    h('div', { class: 'cartao' }, h('h2', {}, 'Área do professor'), erro, h('label', { class: 'campo' }, 'Senha', inp),
      h('button', { class: 'btn', style: { width: '100%' }, onclick: entrar }, 'Entrar'))));
  inp.focus();
}

/* ---------------- Estrutura ---------------- */
function painel() {
  app.innerHTML = '';
  const abas = [['monitor', '📡 Monitoramento'], ['correcao', '✍ Correção'], ['troca', '🔁 Troca entre duplas'], ['config', '⚙ Configuração'], ['materiais', '📚 Materiais'], ['llm', '🤖 LLM e exportação']];
  const barra = h('div', { class: 'abas' }, ...abas.map(([id, rot]) => h('button', { class: id === abaAtual ? 'ativa' : '', onclick: () => { abaAtual = id; painel(); } }, rot)));
  const conteudo = h('div');
  app.append(cabecalhoInstitucional(cfg, h('div', { class: 'linha-flex' }, h('span', { class: 'pequeno mudo' }, 'Painel do professor'),
    h('button', { class: 'btn sec peq', onclick: () => { sessionStorage.removeItem('prova_prof_senha'); senha = ''; login(); } }, 'Sair'))),
  h('div', { class: 'pagina', style: { maxWidth: '1400px' } }, barra, conteudo));
  clearInterval(timerMonitor);
  ({ monitor: abaMonitor, correcao: abaCorrecao, troca: abaTroca, config: abaConfig, materiais: abaMateriais, llm: abaLLM })[abaAtual](conteudo);
}

function falha(e) {
  if (e.codigo === 'NAO_AUTORIZADO') { sessionStorage.removeItem('prova_prof_senha'); login(e.message); return; }
  toast(e.message, 'erro', 6000);
}

/* ---------------- Monitoramento ---------------- */
async function abaMonitor(el) {
  const kpis = h('div', { class: 'kpis' });
  const faixa = h('div', { class: 'faixa-estado info' });
  const tab = h('div', { style: { overflowX: 'auto' } });
  const auto = h('input', { type: 'checkbox', checked: true });
  el.append(faixa, h('div', { class: 'linha-flex', style: { marginBottom: '10px' } },
    h('label', { class: 'check' }, auto, 'Atualizar automaticamente (20 s)'), h('span', { class: 'espaco' }),
    h('button', { class: 'btn sec peq', onclick: () => carregar() }, '↻ Atualizar agora')), kpis, tab);

  async function carregar() {
    let r;
    try { r = await adm('adminListar'); } catch (e) { falha(e); return; }
    cfg = r.config;
    const ts = r.tentativas;
    const agora = agoraServidor();
    faixa.className = 'faixa-estado ' + ({ aberta: 'aberta', antes: 'antes', encerrada: 'encerrada' }[r.estado] || 'info');
    faixa.textContent = { aberta: 'Prova ABERTA', antes: 'Prova ainda não aberta', encerrada: 'Prazo encerrado', nao_configurada: 'Horário não configurado (aba Configuração)' }[r.estado] +
      ' · abertura ' + fmtDataHora(cfg.inicio) + ' · horário máximo ' + fmtDataHora(cfg.fim) + ' · duração ' + cfg.duracaoMin + ' min';
    kpis.innerHTML = '';
    const k = (n, t) => h('div', { class: 'kpi' }, h('b', {}, String(n)), h('span', {}, t));
    kpis.append(k(ts.length, 'duplas'), k(ts.filter(t => t.status === 'em_andamento').length, 'em andamento'),
      k(ts.filter(t => t.status !== 'em_andamento').length, 'entregues'), k(ts.reduce((a, t) => a + t.nEventos, 0), 'ocorrências registradas'),
      k(ts.filter(t => t.troca && t.troca.liberado).length, 'liberaram matrizes'));
    const t = h('table', { class: 'dados' });
    t.append(h('tr', {}, ...['Dupla', 'Status', 'Início', 'Tempo', 'Último salvamento', 'Ocorrências', 'Troca', 'Objetivas', 'Final', 'Ações'].map(x => h('th', {}, x))));
    ts.sort((a, b) => a.criadoEm - b.criadoEm).forEach(x => {
      const rest = x.prazo - agora;
      const oc = Object.entries(x.resumoEventos || {}).map(([k2, v]) => (ROT_EVENTO[k2] || k2) + ': ' + v).join(' · ');
      const acoes = h('select', { style: { width: 'auto', margin: 0, padding: '4px 6px' } },
        h('option', { value: '' }, 'Ações…'), h('option', { value: 'estender:10' }, '+10 min'), h('option', { value: 'estender:30' }, '+30 min'),
        h('option', { value: 'reabrir' }, 'Reabrir prova'), h('option', { value: 'forcarEntrega' }, 'Forçar entrega'),
        h('option', { value: 'reservaTroca' }, 'Dar matrizes reserva (troca)'), h('option', { value: 'novoCodigo' }, 'Gerar novo código'),
        h('option', { value: 'excluir' }, 'Excluir tentativa'));
      acoes.addEventListener('change', async () => {
        const [op, min] = acoes.value.split(':');
        acoes.value = '';
        if (!op) return;
        const perig = op === 'excluir' || op === 'forcarEntrega';
        if (!(await confirmar({ titulo: 'Confirmar ação', mensagem: `Aplicar “${acoes.options[[...acoes.options].findIndex(o => o.value.startsWith(op))].text}” para ${x.nomes.join(' & ')}?`, perigo: perig }))) return;
        try { await adm('adminAcao', { id: x.id, op, minutos: Number(min || 0) }); toast('Ação aplicada.', 'ok'); carregar(); } catch (e) { falha(e); }
      });
      t.append(h('tr', {},
        h('td', {}, h('b', {}, x.nomes.join(' & ')), h('div', { class: 'pequeno mudo' }, x.matriculas.join(' / ') + ' · ' + x.id + ' · código ' + x.codigo)),
        h('td', {}, selo(x.status)),
        h('td', {}, fmtHora(x.criadoEm)),
        h('td', {}, x.status === 'em_andamento' ? h('span', { style: { fontFamily: 'var(--mono)', color: rest < 600000 ? 'var(--vermelho)' : '' } }, rest > 0 ? fmtDuracao(rest) : 'esgotado') : 'entregue ' + fmtHora(x.entregueEm), x.extraMin ? h('div', { class: 'pequeno mudo' }, '+' + x.extraMin + ' min') : null),
        h('td', {}, x.ultimoSalvamento ? 'há ' + fmtDuracao(agora - x.ultimoSalvamento) : '—'),
        h('td', {}, x.nEventos ? h('span', { class: 'selo vermelho', title: oc }, String(x.nEventos)) : h('span', { class: 'selo cinza' }, '0'), oc ? h('div', { class: 'pequeno mudo' }, oc) : null),
        h('td', { class: 'pequeno' }, !x.troca ? '—' : (x.troca.liberado ? 'liberou' : '') + (x.troca.recebeDe ? ' · recebeu' : x.troca.liberado ? ' · aguardando' : '') + (x.troca.analiseEnviada ? ' · analisou' : '')),
        h('td', {}, fmtNota(x.notaObj)),
        h('td', {}, h('b', {}, fmtNota(x.notaFinal)), h('div', { class: 'pequeno mudo' }, x.liberado ? 'liberada' : x.statusCorrecao)),
        h('td', {}, acoes, ' ', h('button', { class: 'btn sec peq', onclick: () => { selecionada = x.id; abaAtual = 'correcao'; painel(); } }, 'Abrir'))));
    });
    tab.innerHTML = '';
    tab.append(ts.length ? t : h('div', { class: 'cartao mudo' }, 'Nenhuma dupla iniciou a prova ainda.'));
  }
  carregar();
  timerMonitor = setInterval(() => { if (auto.checked) carregar(); }, 20000);
}

/* ---------------- Correção ---------------- */
async function abaCorrecao(el) {
  const lista = h('div', { class: 'lista-correcao' });
  const det = h('div');
  el.append(h('div', { class: 'correcao-layout' }, lista, det));
  let ts = [];
  try { ts = (await adm('adminListar')).tentativas; } catch (e) { falha(e); return; }
  ts.sort((a, b) => a.nomes.join().localeCompare(b.nomes.join()));
  const desenharLista = () => {
    lista.innerHTML = '';
    if (!ts.length) lista.append(h('div', { style: { padding: '14px' }, class: 'mudo' }, 'Nenhuma prova.'));
    ts.forEach(x => lista.append(h('button', { class: x.id === selecionada ? 'ativo' : '', onclick: () => { selecionada = x.id; desenharLista(); abrir(x.id); } },
      h('b', {}, x.nomes.join(' & ')),
      h('small', {}, (ROT_STATUS[x.status] || [x.status])[0] + ' · ' + (x.statusCorrecao === 'corrigida' ? '✔ corrigida' : x.statusCorrecao === 'rascunho' ? '✎ rascunho' : 'pendente') + (x.liberado ? ' · liberada' : '') + ' · nota ' + fmtNota(x.notaFinal)))));
  };
  desenharLista();
  if (selecionada) abrir(selecionada); else det.append(h('div', { class: 'cartao mudo' }, 'Selecione uma dupla à esquerda.'));

  async function abrir(id) {
    det.innerHTML = '';
    det.append(h('div', { class: 'cartao' }, 'Carregando…'));
    let d;
    try { d = await adm('adminTentativa', { id }); } catch (e) { falha(e); return; }
    det.innerHTML = '';
    const R = d.resumo;
    const cor = d.correcao || {};
    const discs = d.questoes.filter(q => q.tipo === 'discursiva');
    const notas = {};
    const totalEl = h('b', { style: { fontSize: '1.4rem', color: 'var(--azul)' } });
    const recalcular = () => {
      let s = d.objetivas.nota;
      discs.forEach(q => { const v = parseFloat(String(notas[q.id].nota.value).replace(',', '.')); if (!isNaN(v)) s += v; });
      totalEl.textContent = fmtNota(s);
    };

    // cabeçalho
    det.append(h('div', { class: 'cartao' },
      h('div', { class: 'linha-flex' }, h('h2', { style: { margin: 0 } }, R.nomes.join(' & ')), selo(R.status), R.liberado ? h('span', { class: 'selo entregue' }, 'resultado liberado') : null,
        h('span', { class: 'espaco' }), h('span', {}, 'Nota final: '), totalEl),
      h('p', { class: 'pequeno mudo' }, `Matrículas ${R.matriculas.join(' / ')} · id ${R.id} · código ${R.codigo} · início ${fmtDataHora(R.criadoEm)} · entrega ${fmtDataHora(R.entregueEm)}`),
      h('p', { class: 'pequeno' }, 'Ocorrências: ', h('b', {}, String(R.nEventos)), ' ', Object.entries(R.resumoEventos || {}).map(([k, v]) => (ROT_EVENTO[k] || k) + ': ' + v).join(' · '),
        R.arquivoUrl ? h('span', {}, ' · ', h('a', { href: R.arquivoUrl, target: '_blank' }, 'arquivo da prova (Drive)')) : null)));

    // objetivas
    const tObj = h('table', { class: 'dados' }, h('tr', {}, ...['Questão', 'Tema', 'Marcada', 'Correta', ''].map(x => h('th', {}, x))));
    d.questoes.filter(q => q.tipo === 'objetiva').forEach(q => {
      const o = d.objetivas.detalhes[q.id];
      const letra = id => { const i = q.alternativas.findIndex(a => a.id === id); return i >= 0 ? LETRAS[i] : '—'; };
      tObj.append(h('tr', {}, h('td', {}, 'Q' + q.numero), h('td', {}, q.titulo + ' (var. ' + (q.variante + 1) + ')'), h('td', {}, letra(o.marcada)), h('td', {}, letra(o.correta)),
        h('td', {}, o.acertou ? h('span', { class: 'selo entregue' }, '✔ +' + fmtNota(q.valor)) : h('span', { class: 'selo vermelho' }, '✘'))));
    });
    det.append(h('div', { class: 'cartao' }, h('div', { class: 'linha-flex' }, h('h3', { style: { margin: 0 } }, 'Parte I — Objetivas (correção automática)'), h('span', { class: 'espaco' }), h('b', {}, fmtNota(d.objetivas.nota) + ' / ' + fmtNota(d.questoes.filter(q => q.tipo === 'objetiva').reduce((x, q) => x + q.valor, 0)))),
      h('details', { class: 'colapso' }, h('summary', {}, 'Ver tabela de acertos'), tObj),
      h('details', { class: 'colapso' }, h('summary', {}, 'Ver as questões objetivas como a dupla viu'),
        h('div', { html: d.questoes.filter(q => q.tipo === 'objetiva').map(q => htmlQuestaoLeitura(q, d.respostas, { gabarito: true })).join('') }))));

    // troca
    if (d.trocaRecebida || (d.receptores && d.receptores.length)) {
      det.append(h('div', { class: 'aviso-box', style: { marginBottom: '18px' } }, h('b', {}, 'Troca cega: '),
        d.trocaRecebida ? `recebeu as matrizes de ${d.trocaRecebida.doador} (cenário original: “${d.trocaRecebida.cenarioDoador}”${d.trocaRecebida.reserva ? ', matriz reserva' : ''}). ` : 'não recebeu matrizes. ',
        d.receptores && d.receptores.length ? `As matrizes desta dupla foram enviadas para: ${d.receptores.join(', ')}.` : 'As matrizes desta dupla não foram enviadas a ninguém.'));
    }

    // discursivas
    discs.forEach(q => {
      const v = d.verificacao[q.id];
      const atual = (cor.discursivas || {})[q.id] || {};
      const nota = h('input', { type: 'number', min: '0', max: String(q.valor), step: '0.05', style: { width: '110px' } });
      nota.value = atual.nota !== undefined ? atual.nota : '';
      const fb = h('textarea', { rows: '3', placeholder: 'Feedback individual para a dupla (aparece na página de resultado)' });
      fb.value = atual.feedback || '';
      notas[q.id] = { nota, fb, origem: atual.origem || 'manual' };
      nota.addEventListener('input', () => { notas[q.id].origem = 'manual'; recalcular(); });
      fb.addEventListener('input', () => { notas[q.id].origem = 'manual'; });
      const sug = v ? h('button', { class: 'btn sec peq', type: 'button', onclick: () => { nota.value = Math.min(q.valor, v.sugestao); notas[q.id].origem = 'manual'; recalcular(); } }, `Usar sugestão automática (${fmtNota(v.sugestao)})`) : null;
      det.append(h('div', { class: 'cartao' },
        h('details', { class: 'colapso', open: true }, h('summary', {}, `Q${q.numero} — ${q.titulo} (valor ${fmtNota(q.valor)})`),
          h('div', { html: htmlQuestaoLeitura(q, d.respostas, { troca: d.troca }) }),
          h('details', { class: 'colapso' }, h('summary', {}, 'Rubrica'), h('p', { class: 'pequeno' }, q.rubrica)),
          v ? h('div', {}, h('h4', { style: { marginBottom: '4px' } }, 'Verificação automática'),
            h('div', { class: 'pequeno mudo' }, `Pontuação objetiva sugerida: ${fmtNota(v.sugestao)} de ${fmtNota(v.sugestaoMax)} pontos verificáveis automaticamente. ${v.obs || ''}`),
            h('div', { html: htmlVerificacao(v) })) : null),
        h('div', { class: 'bloco-nota' },
          h('div', {}, h('label', { class: 'campo' }, 'Nota (0 a ' + fmtNota(q.valor) + ')', nota), sug,
            atual.origem === 'llm' ? h('div', { class: 'pequeno', style: { marginTop: '6px' } }, h('span', { class: 'selo expirada' }, 'sugerida pelo LLM')) : null),
          h('label', { class: 'campo' }, 'Feedback', fb))));
    });

    // feedback geral e eventos
    const geral = h('textarea', { rows: '3', placeholder: 'Comentário geral para a dupla' });
    geral.value = cor.feedbackGeral || '';
    const ev = h('div', { class: 'linha-tempo' }, ...(d.eventos || []).map(e => h('div', {}, h('b', {}, fmtDataHora(e.ts) + ' '), e.detalhe + (e.duracaoSeg ? ` (${e.duracaoSeg} s)` : ''))));
    const salvar = async liberar => {
      const disc = {};
      discs.forEach(q => { const n = notas[q.id]; if (String(n.nota.value).trim() !== '') disc[q.id] = { nota: parseFloat(String(n.nota.value).replace(',', '.')), feedback: n.fb.value, origem: n.origem }; });
      try {
        const r = await adm('adminSalvarCorrecao', { id, correcao: { discursivas: disc, feedbackGeral: geral.value, status: Object.keys(disc).length === discs.length ? 'corrigida' : 'rascunho' } });
        if (liberar) await adm('adminLiberar', { ids: [id], liberado: true });
        toast('Correção salva. Nota final: ' + fmtNota(r.notaFinal) + (liberar ? ' — resultado liberado.' : ''), 'ok');
        const x = ts.find(t => t.id === id); if (x) { x.notaFinal = r.notaFinal; x.statusCorrecao = Object.keys(disc).length === discs.length ? 'corrigida' : 'rascunho'; if (liberar) x.liberado = true; }
        desenharLista();
        if (liberar) abrir(id);
      } catch (e) { falha(e); }
    };
    det.append(h('div', { class: 'cartao' },
      h('label', { class: 'campo' }, 'Comentário geral', geral),
      h('details', { class: 'colapso' }, h('summary', {}, `Linha do tempo de eventos (${(d.eventos || []).length})`), ev),
      h('div', { class: 'linha-flex', style: { marginTop: '12px' } },
        h('button', { class: 'btn', onclick: () => salvar(false) }, '💾 Salvar correção'),
        h('button', { class: 'btn sucesso', onclick: () => salvar(true) }, '💾 Salvar e liberar resultado'),
        R.liberado ? h('button', { class: 'btn sec', onclick: async () => { await adm('adminLiberar', { ids: [id], liberado: false }); toast('Resultado ocultado.'); abrir(id); } }, 'Ocultar resultado') : null,
        h('span', { class: 'espaco' }),
        h('button', { class: 'btn sec', onclick: () => { const i = ts.findIndex(t => t.id === id); if (i < ts.length - 1) { selecionada = ts[i + 1].id; desenharLista(); abrir(selecionada); } } }, 'Próxima dupla →'))));
    recalcular();
  }
}

/* ---------------- Troca ---------------- */
async function abaTroca(el) {
  let r;
  try { r = await adm('adminTroca'); } catch (e) { falha(e); return; }
  el.append(h('div', { class: 'aviso-box', style: { marginBottom: '14px' } },
    'Quando uma dupla libera as matrizes (etapa 1 da troca), ela recebe as matrizes da dupla liberada que tiver menos receptores; quem estiver esperando recebe as dela. ',
    `Se uma dupla esperar mais de ${cfg.trocaReservaMin} min, recebe automaticamente um conjunto de matrizes reserva (você também pode forçar isso pelo menu “Ações” do Monitoramento).`));
  const t = h('table', { class: 'dados' }, h('tr', {}, ...['Dupla', 'Cenário sorteado', 'Liberou', 'Recebeu matrizes de', 'Recebido em', 'Análise enviada'].map(x => h('th', {}, x))));
  r.troca.sort((a, b) => a.liberadoEm - b.liberadoEm).forEach(x => t.append(h('tr', {},
    h('td', {}, x.nomes || x.tentativaId), h('td', {}, x.cenario), h('td', {}, fmtHora(x.liberadoEm)),
    h('td', {}, x.recebeDe ? (x.nomesDoador || x.recebeDe) : h('span', { class: 'selo expirada' }, 'aguardando')),
    h('td', {}, x.recebidoEm ? fmtHora(x.recebidoEm) : '—'), h('td', {}, x.analiseEm ? fmtHora(x.analiseEm) : '—'))));
  el.append(r.troca.length ? t : h('div', { class: 'cartao mudo' }, 'Nenhuma dupla liberou matrizes ainda.'),
    h('button', { class: 'btn sec', style: { marginTop: '12px' }, onclick: () => painel() }, '↻ Atualizar'));
}

/* ---------------- Configuração ---------------- */
const paraLocal = ms => { if (!ms) return ''; const d = new Date(Number(ms)); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

async function abaConfig(el) {
  try { cfg = (await adm('adminLogin')).config; } catch (e) { falha(e); return; }
  const campos = {};
  const campo = (k, rot, tipo = 'text', dica = '') => {
    const i = h('input', { type: tipo });
    if (tipo === 'datetime-local') i.value = paraLocal(cfg[k]); else i.value = cfg[k] ?? '';
    campos[k] = i;
    return h('label', { class: 'campo' }, rot, dica ? h('span', { class: 'dica' }, ' — ' + dica) : null, i);
  };
  const chk = (k, rot) => { const i = h('input', { type: 'checkbox' }); i.checked = !!cfg[k]; campos[k] = i; return h('label', { class: 'check', style: { marginBottom: '10px' } }, i, rot); };
  const instr = h('textarea', { rows: '3' }); instr.value = cfg.instrucoesExtras || ''; campos.instrucoesExtras = instr;

  const salvar = async () => {
    const novo = {};
    for (const [k, i] of Object.entries(campos)) {
      if (i.type === 'checkbox') novo[k] = i.checked;
      else if (i.type === 'datetime-local') novo[k] = i.value ? new Date(i.value).getTime() : 0;
      else if (i.type === 'number') novo[k] = Number(i.value);
      else novo[k] = i.value;
    }
    try { cfg = (await adm('adminSalvarConfig', { config: novo })).config; toast('Configuração salva.', 'ok'); } catch (e) { falha(e); }
  };

  const lista = h('textarea', { rows: '8', placeholder: '202301234;Nome do aluno\n202305678;Outro aluno' });
  adm('adminAlunos').then(r => { lista.value = r.alunos.map(a => a.matricula + ';' + a.nome).join('\n'); }).catch(() => {});
  const novaSenha = h('input', { type: 'password', placeholder: 'Nova senha (mín. 6 caracteres)' });

  el.append(h('div', { class: 'grade-2' },
    h('div', { class: 'cartao' }, h('h3', {}, 'Horário e regras'),
      campo('inicio', 'Início (abertura do acesso)', 'datetime-local'),
      campo('fim', 'Horário máximo da prova', 'datetime-local', 'após este horário ninguém começa e todos são encerrados'),
      campo('duracaoMin', 'Duração (minutos)', 'number'),
      campo('toleranciaEnvioMin', 'Tolerância para o envio automático chegar (min)', 'number'),
      campo('trocaReservaMin', 'Espera máxima na troca antes da matriz reserva (min)', 'number'),
      chk('permitirIndividual', 'Permitir prova individual (marcada pelo aluno)'),
      chk('usarListaAlunos', 'Restringir o acesso às matrículas da lista ao lado'),
      h('button', { class: 'btn', onclick: salvar }, '💾 Salvar configuração')),
    h('div', {},
      h('div', { class: 'cartao' }, h('h3', {}, 'Identificação'),
        campo('titulo', 'Título da prova'), campo('disciplina', 'Disciplina'), campo('curso', 'Curso'), campo('turma', 'Turma'),
        campo('professor', 'Professor'), campo('periodo', 'Período'),
        h('label', { class: 'campo' }, 'Instruções extras (aparecem na página inicial)', instr),
        h('button', { class: 'btn', onclick: salvar }, '💾 Salvar configuração')),
      h('div', { class: 'cartao' }, h('h3', {}, 'Lista de alunos (opcional)'),
        h('p', { class: 'pequeno mudo' }, 'Uma linha por aluno: matrícula;nome. Só é usada se a opção “Restringir o acesso” estiver marcada.'),
        lista, h('button', { class: 'btn sec', style: { marginTop: '8px' }, onclick: async () => { try { const r = await adm('adminAlunos', { lista: lista.value }); toast(r.alunos.length + ' aluno(s) salvos.', 'ok'); } catch (e) { falha(e); } } }, 'Salvar lista')),
      h('div', { class: 'cartao' }, h('h3', {}, 'Senha do professor'), novaSenha,
        h('button', { class: 'btn sec', style: { marginTop: '8px' }, onclick: async () => {
          try { await adm('adminSenha', { novaSenha: novaSenha.value }); senha = novaSenha.value; sessionStorage.setItem('prova_prof_senha', senha); toast('Senha alterada.', 'ok'); } catch (e) { falha(e); }
        } }, 'Alterar senha')))));
}

/* ---------------- Materiais ---------------- */
async function abaMateriais(el) {
  try { cfg = (await adm('adminLogin')).config; } catch (e) { falha(e); return; }
  const lista = h('div');
  const desenhar = () => {
    lista.innerHTML = '';
    if (!cfg.materiais.length) lista.append(h('p', { class: 'mudo' }, 'Nenhum material cadastrado.'));
    cfg.materiais.forEach(m => lista.append(h('div', { class: 'linha-flex', style: { borderBottom: '1px solid var(--borda)', padding: '8px 0' } },
      h('span', {}, '📄 ', h('b', {}, m.titulo), h('span', { class: 'pequeno mudo' }, m.url ? ' — ' + m.url : ' — Google Drive')),
      h('span', { class: 'espaco' }),
      h('button', { class: 'btn sec peq', onclick: () => mexer(m.id, { mover: -1 }) }, '↑'),
      h('button', { class: 'btn sec peq', onclick: () => mexer(m.id, { mover: 1 }) }, '↓'),
      h('button', { class: 'btn perigo peq', onclick: async () => { if (await confirmar({ titulo: 'Remover material?', mensagem: m.titulo, perigo: true, ok: 'Remover' })) mexer(m.id, {}); } }, 'Remover'))));
  };
  const mexer = async (id, extra) => { try { cfg.materiais = (await adm('adminRemoverMaterial', Object.assign({ id }, extra))).materiais; desenhar(); } catch (e) { falha(e); } };
  const arq = h('input', { type: 'file', accept: 'application/pdf', multiple: true });
  const prog = h('div', { class: 'pequeno mudo' });
  const enviar = async () => {
    for (const f of arq.files) {
      if (f.size > 25 * 1024 * 1024) { toast(f.name + ': arquivo acima de 25 MB.', 'erro'); continue; }
      prog.textContent = 'Enviando ' + f.name + '…';
      const b64 = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(f); });
      try { cfg.materiais = (await adm('adminUploadMaterial', { nome: f.name, titulo: f.name.replace(/\.pdf$/i, '').replace(/_/g, ' '), base64: b64 }, { timeout: 300000 })).materiais; desenhar(); }
      catch (e) { falha(e); }
    }
    prog.textContent = 'Concluído.';
    arq.value = '';
  };
  const tit = h('input', { type: 'text', placeholder: 'Título' });
  const url = h('input', { type: 'text', placeholder: 'https://… (PDF com acesso público e CORS liberado)' });
  el.append(h('div', { class: 'grade-2' },
    h('div', { class: 'cartao' }, h('h3', {}, 'Materiais de consulta'), lista),
    h('div', {},
      h('div', { class: 'cartao' }, h('h3', {}, 'Enviar PDF para o Google Drive'),
        h('p', { class: 'pequeno mudo' }, 'Os arquivos ficam na pasta da prova no seu Drive e são entregues aos alunos pelo próprio Apps Script (não precisam ser públicos).'),
        arq, h('button', { class: 'btn', style: { marginTop: '10px' }, onclick: enviar }, '⬆ Enviar'), prog),
      h('div', { class: 'cartao' }, h('h3', {}, 'Ou adicionar por URL'), tit, url,
        h('button', { class: 'btn sec', style: { marginTop: '10px' }, onclick: async () => { try { cfg.materiais = (await adm('adminRemoverMaterial', { adicionarUrl: url.value, titulo: tit.value })).materiais; desenhar(); } catch (e) { falha(e); } } }, 'Adicionar')))));
  desenhar();
}

/* ---------------- LLM e exportação ---------------- */
function abaLLM(el) {
  const nomes = h('input', { type: 'checkbox' });
  const texto = h('textarea', { rows: '10', placeholder: 'Cole aqui a resposta do LLM (array JSON)…' });
  const sobres = h('input', { type: 'checkbox' });
  el.append(h('div', { class: 'grade-2' },
    h('div', {},
      h('div', { class: 'cartao' }, h('h3', {}, '1. Gerar arquivo para correção por LLM'),
        h('p', {}, 'Gera um único arquivo Markdown com as instruções de correção, as rubricas, as respostas discursivas de todas as duplas entregues (grafos, matrizes e árvores convertidos em texto) e a verificação automática de cada item. Envie esse arquivo a um LLM (Claude, por exemplo) e peça a correção.'),
        h('label', { class: 'check', style: { marginBottom: '10px' } }, nomes, 'Incluir nomes e matrículas (por padrão o arquivo é anônimo, identificado só pelo id da tentativa)'),
        h('button', { class: 'btn', onclick: async () => {
          try { const r = await adm('adminExportLLM', { incluirNomes: nomes.checked }, { timeout: 300000 }); baixar('correcao_discursivas_' + (cfg.turma || '') + '.md', r.markdown, 'text/markdown;charset=utf-8'); } catch (e) { falha(e); }
        } }, '⬇ Baixar arquivo (.md)')),
      h('div', { class: 'cartao' }, h('h3', {}, '2. Importar a correção do LLM'),
        h('p', { class: 'pequeno mudo' }, 'Cole o array JSON devolvido pelo LLM. As notas e feedbacks entram como rascunho (marcados “sugerida pelo LLM”) para você revisar na aba Correção antes de liberar.'),
        texto,
        h('label', { class: 'check', style: { margin: '8px 0' } }, sobres, 'Sobrescrever notas que eu já lancei manualmente'),
        h('button', { class: 'btn', onclick: async () => {
          try { const r = await adm('adminImportLLM', { texto: texto.value, sobrescrever: sobres.checked }); toast(`${r.aplicados} nota(s) importada(s); ${r.ignorados} ignorada(s).`, 'ok', 6000); } catch (e) { falha(e); }
        } }, '⬆ Importar'))),
    h('div', {},
      h('div', { class: 'cartao' }, h('h3', {}, 'Notas'),
        h('p', { class: 'pequeno mudo' }, 'Planilha CSV (separador “;”) com objetivas, cada discursiva e a nota final.'),
        h('button', { class: 'btn sec', onclick: async () => { try { const r = await adm('adminExportCSV'); baixar('notas_' + (cfg.turma || '') + '.csv', '﻿' + r.csv, 'text/csv;charset=utf-8'); } catch (e) { falha(e); } } }, '⬇ Exportar notas (CSV)')),
      h('div', { class: 'cartao' }, h('h3', {}, 'Liberação dos resultados'),
        h('p', { class: 'pequeno mudo' }, 'Os alunos só veem a correção depois de liberada (pela matrícula + código de consulta).'),
        h('div', { class: 'linha-flex' },
          h('button', { class: 'btn sucesso', onclick: () => liberarTodas(true) }, 'Liberar todas as corrigidas'),
          h('button', { class: 'btn sec', onclick: () => liberarTodas(false) }, 'Ocultar todas'))))));
}

async function liberarTodas(lib) {
  try {
    const ts = (await adm('adminListar')).tentativas;
    const ids = ts.filter(t => !lib || t.statusCorrecao === 'corrigida').map(t => t.id);
    if (!(await confirmar({ titulo: lib ? 'Liberar resultados?' : 'Ocultar resultados?', mensagem: `${ids.length} prova(s) serão afetadas.`, ok: 'Confirmar' }))) return;
    const r = await adm('adminLiberar', { ids, liberado: lib });
    toast(r.alterados + ' prova(s) atualizadas.', 'ok');
  } catch (e) { falha(e); }
}

/* ---------------- início ---------------- */
if (senha) adm('adminLogin').then(r => { cfg = r.config; painel(); }).catch(e => login(e.message)); else login();
