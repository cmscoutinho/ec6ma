// render.js — montagem das questões (interativa e somente leitura) e do arquivo de prova
import { h, esc, fmtDataHora, fmtNota } from './util.js';
import { EditorGrafo, svgDeGrafo, svgDeFigura } from './componentes/grafo.js';
import { EditorMatriz, materializar, htmlMatriz } from './componentes/matriz.js';
import { Sequencia, htmlSequencia } from './componentes/sequencia.js';
import { MontadorABB, svgArvore } from './componentes/abb.js';
import { EntradaTabela, htmlTabela } from './componentes/tabela.js';

const LETRAS = 'ABCDE';

export function htmlFigura(fig) {
  if (!fig) return '';
  if (fig.tipo === 'grafo') return '<div class="figura">' + svgDeFigura(fig) + '</div>';
  if (fig.tipo === 'matriz') return '<div class="figura">' + htmlMatriz(fig) + '</div>';
  return '';
}

function nVerticesTroca(troca) {
  return troca && troca.recebido && troca.recebido.adjacencia ? troca.recebido.adjacencia.rotLinhas.length : 0;
}
const rotulosV = n => Array.from({ length: n }, (_, i) => 'v' + (i + 1));

/** Indica se um item tem alguma resposta (para o mapa de progresso). */
export function itemRespondido(item, v) {
  if (v === undefined || v === null || v === '') return false;
  switch (item.tipo) {
    case 'grafo': return item.config.modo === 'selecionar_arestas' ? (v.selecionadas || []).length > 0 : (v.arestas || []).length > 0;
    case 'matriz': return Object.keys(v.celulas || {}).length > 0;
    case 'tabela': return (v || []).some(l => (l || []).some(c => String(c).trim() !== ''));
    case 'sequencia': return v.length > 0;
    case 'abb': return Object.keys(v.nos || {}).length > 0;
    default: return String(v).trim() !== '';
  }
}

export function progressoQuestao(q, respostas) {
  if (q.tipo === 'objetiva') return respostas[q.id] ? 1 : 0;
  const itens = q.itens.filter(i => !i.tipo.startsWith('troca_'));
  if (!itens.length) return 0;
  return itens.filter(i => itemRespondido(i, respostas[i.id])).length / itens.length;
}

/* ============================================================
 *  Montagem interativa
 * ============================================================ */

/**
 * ctx: {respostas, bloqueados:Set, troca, aoMudar(itemId, valor), acoes:{liberarTroca, enviarAnalise}}
 */
export function montarQuestao(cont, q, ctx) {
  cont.innerHTML = '';
  const caixa = h('article', { class: 'questao' });
  caixa.append(h('div', { class: 'questao-cab' },
    h('span', { class: 'num' }, 'Questão ' + q.numero),
    h('span', { class: 'tit' }, q.titulo || ''),
    h('span', { class: 'valor' }, (q.tipo === 'objetiva' ? 'Objetiva · ' : 'Discursiva · ') + fmtNota(q.valor) + ' ponto(s)')));
  caixa.append(h('div', { class: 'enunciado', html: q.enunciado }));
  if (q.figura) caixa.append(h('div', { html: htmlFigura(q.figura) }));

  if (q.tipo === 'objetiva') {
    const lista = h('div', { class: 'alternativas', role: 'radiogroup' });
    const desenhar = () => {
      lista.innerHTML = '';
      q.alternativas.forEach((a, i) => {
        const marcada = ctx.respostas[q.id] === a.id;
        lista.append(h('label', { class: 'alternativa' + (marcada ? ' marcada' : ''), onclick: () => { ctx.aoMudar(q.id, marcada ? '' : a.id); desenhar(); } },
          h('span', { class: 'letra' }, LETRAS[i]), h('span', { html: a.html })));
      });
    };
    desenhar();
    caixa.append(lista, h('p', { class: 'pequeno mudo', style: { marginTop: '10px' } }, 'Clique novamente na alternativa marcada para desmarcá-la.'));
    cont.append(caixa);
    return;
  }

  const dependentes = {}; // fonte -> [componentes que dependem dela]
  const receptor = q.troca === 'receptor';
  const recebido = ctx.troca && ctx.troca.estado === 'recebido';
  const n = nVerticesTroca(ctx.troca);

  q.itens.forEach(item => {
    if (receptor && !recebido && item.tipo !== 'troca_recebido') return;
    const bloqueado = ctx.bloqueados.has(item.id);
    const bloco = h('section', { class: 'item' + (bloqueado ? ' bloqueado' : '') });
    if (!item.tipo.startsWith('troca_')) bloco.append(h('div', { class: 'rotulo' }, item.rotulo));
    const alvo = h('div');
    bloco.append(alvo);
    const cfg = item.config || {};
    const mudar = v => {
      ctx.aoMudar(item.id, v);
      (dependentes[item.id] || []).forEach(c => c.atualizar());
    };
    const val = ctx.respostas[item.id];

    switch (item.tipo) {
      case 'grafo': {
        if (cfg.modo === 'selecionar_arestas') new EditorGrafo(alvo, { modo: 'selecionar_arestas', figura: cfg.figura, valor: val, leitura: bloqueado, aoMudar: mudar });
        else if (cfg.modo === 'vertices_fixos') new EditorGrafo(alvo, { modo: 'vertices_fixos', n, valor: val, config: cfg, leitura: bloqueado, aoMudar: mudar });
        else new EditorGrafo(alvo, { modo: 'livre', valor: val, config: cfg, leitura: bloqueado, aoMudar: mudar });
        break;
      }
      case 'matriz': {
        const ed = new EditorMatriz(alvo, { modo: cfg.modo, valor: val, leitura: bloqueado, obterGrafo: () => ctx.respostas[cfg.fonte], aoMudar: mudar });
        (dependentes[cfg.fonte] = dependentes[cfg.fonte] || []).push(ed);
        break;
      }
      case 'texto': {
        if (cfg.requerAnalise) {
          const an = (ctx.troca && ctx.troca.analisesRecebidas) || [];
          if (!an.length) {
            alvo.append(h('div', { class: 'aviso-box' }, ctx.troca && ctx.troca.liberado
              ? 'A reconstrução feita pela outra dupla aparecerá aqui assim que ela enviar a análise (a página verifica automaticamente).'
              : 'Disponível depois que as suas matrizes forem liberadas e analisadas por outra dupla.'));
            break;
          }
          an.forEach((a, i) => alvo.append(h('div', { class: 'aviso-box verde', style: { marginBottom: '10px' } },
            h('b', {}, an.length > 1 ? `Reconstrução ${i + 1} recebida` : 'Reconstrução recebida da outra dupla'),
            h('div', { html: svgDeGrafo(a.grafo) }),
            h('div', {}, h('b', {}, 'Cenário palpitado: '), a.cenario),
            h('div', {}, h('b', {}, 'Justificativa: '), a.justificativa || '(não informada)'))));
        }
        const ta = h('textarea', { rows: String(cfg.linhas || 4), disabled: bloqueado, spellcheck: 'false' });
        ta.value = val || '';
        ta.addEventListener('input', () => mudar(ta.value));
        alvo.append(ta);
        break;
      }
      case 'linha': {
        const inp = h('input', { type: 'text', disabled: bloqueado, spellcheck: 'false' });
        inp.value = val || '';
        inp.addEventListener('input', () => mudar(inp.value));
        alvo.append(inp);
        break;
      }
      case 'escolha': {
        const grupo = h('div', { class: 'alternativas' });
        const desenhar = () => {
          grupo.innerHTML = '';
          (cfg.opcoes || []).forEach((o, i) => {
            const marcada = ctx.respostas[item.id] === o.id;
            grupo.append(h('label', { class: 'alternativa' + (marcada ? ' marcada' : ''), style: { padding: '7px 12px' }, onclick: () => { if (bloqueado) return; mudar(marcada ? '' : o.id); desenhar(); } },
              h('span', { class: 'letra' }, String(i + 1)), h('span', {}, o.texto)));
          });
        };
        desenhar();
        alvo.append(grupo);
        break;
      }
      case 'tabela': {
        const linhas = cfg.origemTroca ? rotulosV(n) : cfg.linhas;
        new EntradaTabela(alvo, { linhas, colunas: cfg.colunas, valor: val, leitura: bloqueado, aoMudar: mudar });
        break;
      }
      case 'sequencia': {
        const itens = cfg.origemTroca ? rotulosV(n) : cfg.itens;
        new Sequencia(alvo, { itens, valor: val, leitura: bloqueado, aoMudar: mudar });
        break;
      }
      case 'abb': {
        new MontadorABB(alvo, {
          valores: cfg.valores, valor: val, leitura: bloqueado, aoMudar: mudar, remover: cfg.remover,
          copiarDe: cfg.copiarDe ? () => (ctx.respostas[cfg.copiarDe] || {}).nos : null,
          rotuloCopiar: cfg.copiarDe ? 'Copiar a árvore do item (a) (sem o nó ' + cfg.remover + ')' : null
        });
        break;
      }
      case 'troca_liberar': {
        const t = ctx.troca || {};
        if (!t.liberado) {
          alvo.append(h('div', { class: 'aviso-box ambar' },
            h('p', { style: { marginTop: 0 } }, h('b', {}, 'd) Liberação para a troca. '), 'Confira o desenho, a justificativa e as duas matrizes. Ao liberar, os itens a–c serão bloqueados e somente as matrizes serão enviadas a outra dupla.'),
            h('button', { class: 'btn ambar', type: 'button', onclick: () => ctx.acoes.liberarTroca() }, '🔁 Liberar matrizes para a troca')));
        } else {
          alvo.append(h('div', { class: 'aviso-box verde' }, h('b', {}, '✓ Matrizes liberadas para a troca. '),
            t.estado === 'recebido' ? `Vocês já receberam as matrizes de outra dupla: vá para a Questão ${q.numero + 1}.` : `Aguardando outra dupla liberar as matrizes dela para que vocês recebam (Questão ${q.numero + 1}).`));
        }
        break;
      }
      case 'troca_recebido': {
        const t = ctx.troca || {};
        if (!t.liberado) alvo.append(h('div', { class: 'aviso-box ambar' }, `Primeiro conclua a Questão ${q.numero - 1} e clique em “Liberar matrizes para a troca”. Em seguida, a plataforma entregará a vocês as matrizes de outra dupla.`));
        else if (t.estado !== 'recebido') alvo.append(h('div', { class: 'aviso-box' }, '⏳ Aguardando outra dupla liberar as matrizes… Esta página verifica automaticamente a cada 20 segundos. Enquanto isso, continue as demais questões.'));
        else {
          alvo.append(h('div', { class: 'rotulo', style: { fontWeight: 600, color: 'var(--azul)' } }, 'Matrizes recebidas (de uma dupla anônima)'),
            h('p', { class: 'pequeno mudo', style: { margin: '0 0 6px' } }, 'Somente as matrizes foram enviadas: nomes de vértices e arestas, desenho e cenário ficam ocultos até vocês enviarem a análise.'),
            h('div', { class: 'linha-flex', style: { alignItems: 'flex-start', gap: '28px' } },
              h('div', {}, h('div', { class: 'seq-rotulo' }, 'Matriz de incidência'), h('div', { html: htmlMatriz(Object.assign({ canto: 'v/a' }, t.recebido.incidencia)) })),
              h('div', {}, h('div', { class: 'seq-rotulo' }, 'Matriz de adjacência'), h('div', { html: htmlMatriz(Object.assign({ canto: 'v' }, t.recebido.adjacencia)) }))));
        }
        break;
      }
      case 'troca_enviar': {
        const t = ctx.troca || {};
        if (t.analiseEnviada) {
          alvo.append(h('div', { class: 'aviso-box verde' }, h('b', {}, '✓ Análise enviada à dupla de origem. '), 'Os itens desta questão estão bloqueados.'));
          if (t.revelacao) alvo.append(h('div', { html: htmlRevelacao(t.revelacao) }));
        }
        else alvo.append(h('div', { class: 'aviso-box ambar' },
          h('p', { style: { marginTop: 0 } }, 'Ao enviar, a reconstrução, o palpite e a justificativa serão mostrados à dupla de origem e os itens desta questão serão bloqueados.'),
          h('button', { class: 'btn ambar', type: 'button', onclick: () => ctx.acoes.enviarAnalise() }, '📨 Enviar análise à dupla de origem')));
        break;
      }
    }
    caixa.append(bloco);
  });
  cont.append(caixa);
}

/** Grafo original da outra dupla, revelado só depois do envio da análise. */
export function htmlRevelacao(rv) {
  if (!rv) return '';
  return '<div class="aviso-box" style="margin-top:12px"><b>🔓 Revelação — grafo original da outra dupla</b>' +
    '<p class="pequeno" style="margin:4px 0">Compare com a sua reconstrução. Cenário verdadeiro: <b>' + esc(rv.cenario || '?') + '</b>' + (rv.reserva ? ' (matrizes reserva da plataforma)' : '') + '</p>' +
    (rv.grafo ? '<div class="figura">' + svgDeGrafo(rv.grafo) + '</div>' : '') + '</div>';
}

/* ============================================================
 *  Renderização somente leitura (HTML em string)
 * ============================================================ */

export function htmlItemLeitura(item, respostas, troca) {
  const v = respostas[item.id];
  const cfg = item.config || {};
  switch (item.tipo) {
    case 'grafo':
      if (cfg.modo === 'selecionar_arestas') return '<div class="figura">' + svgDeFigura(cfg.figura, { selecionadas: (v && v.selecionadas) || [] }) + '</div>';
      return '<div class="figura">' + svgDeGrafo(v) + '</div>';
    case 'matriz':
      return htmlMatriz(materializar(v, respostas[cfg.fonte], cfg.modo));
    case 'texto': case 'linha':
      return '<div class="resposta-lida">' + (v ? esc(v) : '<span class="mudo">(em branco)</span>') + '</div>';
    case 'escolha': {
      const o = (cfg.opcoes || []).find(x => x.id === v);
      return '<div class="resposta-lida">' + (o ? esc(o.texto) : '<span class="mudo">(não respondido)</span>') + '</div>';
    }
    case 'tabela': {
      const n = troca && troca.recebido ? troca.recebido.adjacencia.rotLinhas.length : (v || []).length;
      return htmlTabela(cfg.origemTroca ? rotulosV(n) : cfg.linhas, cfg.colunas, v);
    }
    case 'sequencia': return htmlSequencia(v);
    case 'abb': return svgArvore((v || {}).nos);
    case 'troca_recebido':
      if (troca && troca.recebido) return '<div class="linha-flex" style="align-items:flex-start;gap:28px"><div><div class="seq-rotulo">Incidência recebida</div>' + htmlMatriz(Object.assign({ canto: 'v/a' }, troca.recebido.incidencia)) + '</div><div><div class="seq-rotulo">Adjacência recebida</div>' + htmlMatriz(Object.assign({ canto: 'v' }, troca.recebido.adjacencia)) + '</div></div>';
      return '<div class="mudo pequeno">(nenhuma matriz recebida)</div>';
    case 'troca_liberar': return troca && troca.liberado ? '<div class="pequeno">✓ Matrizes liberadas para a troca em ' + fmtDataHora(troca.liberadoEm) + '</div>' : '<div class="pequeno mudo">Matrizes não liberadas.</div>';
    case 'troca_enviar': return troca && troca.analiseEnviada ? '<div class="pequeno">✓ Análise enviada à dupla de origem.</div>' + (troca.revelacao ? htmlRevelacao(troca.revelacao) : '') : '<div class="pequeno mudo">Análise não enviada.</div>';
    default: return esc(JSON.stringify(v));
  }
}

/**
 * HTML de uma questão em modo leitura.
 * extras: {gabarito:boolean, troca, verificacao, correcao:{nota,feedback}, objetiva:{marcada,correta,acertou}}
 */
export function htmlQuestaoLeitura(q, respostas, extras = {}) {
  let s = `<article class="questao" style="margin-bottom:18px"><div class="questao-cab"><span class="num">Questão ${q.numero}</span><span class="tit">${esc(q.titulo || '')}</span><span class="valor">${fmtNota(q.valor)} ponto(s)`;
  if (extras.nota !== undefined && extras.nota !== null) s += ` · <b style="color:var(--azul)">nota: ${fmtNota(extras.nota)}</b>`;
  s += '</span></div>';
  s += `<div class="enunciado">${q.enunciado}</div>` + htmlFigura(q.figura);
  if (q.tipo === 'objetiva') {
    s += '<div class="alternativas">';
    q.alternativas.forEach((a, i) => {
      const marcada = respostas[q.id] === a.id;
      let cls = marcada ? ' marcada' : '';
      if (extras.gabarito && q.correta) { if (a.id === q.correta) cls = ' correta'; else if (marcada) cls = ' errada'; }
      s += `<div class="alternativa${cls}"><span class="letra">${LETRAS[i]}</span><span>${a.html}${marcada ? ' <b>(marcada)</b>' : ''}${extras.gabarito && a.id === q.correta ? ' <b style="color:var(--verde)">✓ correta</b>' : ''}</span></div>`;
    });
    s += '</div>';
    if (!respostas[q.id]) s += '<p class="pequeno mudo">Questão não respondida.</p>';
  } else {
    q.itens.forEach(it => {
      if (it.tipo === 'troca_liberar' || it.tipo === 'troca_enviar') { s += '<section class="item">' + htmlItemLeitura(it, respostas, extras.troca) + '</section>'; return; }
      if (it.tipo === 'texto' && it.config && it.config.requerAnalise && extras.troca && extras.troca.analisesRecebidas && extras.troca.analisesRecebidas.length) {
        extras.troca.analisesRecebidas.forEach(a => {
          s += '<section class="item"><div class="rotulo">Reconstrução recebida da outra dupla</div>' + svgDeGrafo(a.grafo) + `<div><b>Cenário palpitado:</b> ${esc(a.cenario)}</div><div><b>Justificativa:</b> ${esc(a.justificativa || '')}</div></section>`;
        });
      }
      s += `<section class="item"><div class="rotulo">${esc(it.rotulo)}</div>${htmlItemLeitura(it, respostas, extras.troca)}</section>`;
    });
  }
  if (extras.verificacao && extras.mostrarVerificacao) s += htmlVerificacao(extras.verificacao);
  if (extras.feedback) s += `<div class="aviso-box" style="margin-top:14px"><b>Comentário do professor:</b><div style="white-space:pre-wrap">${esc(extras.feedback)}</div></div>`;
  return s + '</article>';
}

export function htmlVerificacao(vq, { soEsperado = false } = {}) {
  if (!vq || !vq.itens) return '';
  let s = '<table class="verif"><tr><th style="width:34px"></th><th>Verificação</th><th>Resposta</th><th>Esperado</th></tr>';
  vq.itens.forEach(i => {
    const ok = i.ok === true ? '<td class="ok">✔</td>' : i.ok === false ? '<td class="nok">✘</td>' : '<td class="centro">•</td>';
    s += `<tr>${ok}<td>${esc(i.rotulo)}</td><td><pre>${esc(i.obtido)}</pre></td><td><pre>${esc(i.esperado)}</pre></td></tr>`;
  });
  return s + '</table>';
}

/* ============================================================
 *  Arquivo de prova (HTML autocontido para download / Drive)
 * ============================================================ */

export async function gerarArquivoProva({ config, sessao, questoes, respostas, troca, entregueEm, nEventos, logo, titulo }) {
  let css = '';
  try { css = await (await fetch('css/style.css')).text(); } catch (e) { css = ''; }
  const nomes = (sessao.nomes || []).map((n, i) => `${esc(n)} — matrícula ${esc((sessao.matriculas || [])[i] || '')}`).join('<br>');
  let corpo = `<header class="cabecalho"><div class="interno">${logo ? `<img class="logo" src="${logo}" alt="CESUPA">` : ''}<div class="titulos"><div class="inst">Centro Universitário do Estado do Pará</div><div class="disc">${esc(config.disciplina || '')}</div><div class="pequeno mudo">${esc([config.curso, 'Turma ' + config.turma, config.professor, config.periodo].filter(Boolean).join(' · '))}</div></div></div></header>`;
  corpo += `<main class="pagina"><div class="cartao"><h1>${esc(titulo || config.titulo || 'Prova')}</h1><p>${nomes}</p>` +
    `<p class="pequeno">Identificador: <b>${esc(sessao.tentativaId)}</b>` + (sessao.codigo ? ` · Código de consulta do resultado: <b style="font-family:monospace;font-size:1.1em">${esc(sessao.codigo)}</b>` : '') +
    `<br>Entregue em: ${fmtDataHora(entregueEm || Date.now())}` + (nEventos !== undefined ? ` · Ocorrências registradas (saídas de tela cheia/aba/foco): ${nEventos}` : '') + '</p>' +
    `<p class="pequeno mudo">Arquivo gerado automaticamente pela plataforma de avaliação. Guarde-o junto com o código de consulta.</p></div>`;
  questoes.forEach(q => { corpo += htmlQuestaoLeitura(q, respostas, { troca }); });
  corpo += '</main>';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo || 'Prova')} — ${esc((sessao.matriculas || []).join(', '))}</title><style>${css}\n.questao{page-break-inside:avoid;margin-bottom:18px}</style></head><body>${corpo}</body></html>`;
}
