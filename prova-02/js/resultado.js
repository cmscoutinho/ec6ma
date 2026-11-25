// resultado.js — consulta da prova corrigida pelo aluno (matrícula + código único)
import { $, h, esc, toast, baixar, fmtDataHora, fmtNota, logoDataUrl, cabecalhoInstitucional } from './util.js';
import { api } from './api.js';
import { htmlQuestaoLeitura, htmlVerificacao } from './render.js';

const app = $('#app');

function formulario(msg) {
  app.innerHTML = '';
  const mat = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off' });
  const cod = h('input', { type: 'text', autocomplete: 'off', placeholder: 'ex.: ABC-2D4F', style: { textTransform: 'uppercase', fontFamily: 'var(--mono)' } });
  const erro = h('div', { class: 'faixa-estado ' + (msg && msg.tipo === 'info' ? 'antes' : 'erro') + (msg ? '' : ' oculto') }, msg ? msg.texto : '');
  const consultar = async () => {
    erro.classList.add('oculto');
    try {
      const r = await api('resultado', { matricula: mat.value, codigo: cod.value }, { tentativas: 2 });
      if (!r.liberado) { erro.className = 'faixa-estado antes'; erro.textContent = r.mensagem; return; }
      mostrar(r);
    } catch (e) { erro.className = 'faixa-estado erro'; erro.textContent = e.message; }
  };
  cod.addEventListener('keydown', e => { if (e.key === 'Enter') consultar(); });
  app.append(cabecalhoInstitucional(null, h('a', { class: 'btn sec peq', href: 'index.html' }, '← Página da prova')),
    h('div', { class: 'pagina', style: { maxWidth: '520px' } }, h('div', { class: 'cartao' },
      h('h2', {}, 'Consultar resultado da prova'),
      h('p', { class: 'pequeno mudo' }, 'Informe a sua matrícula e o código de consulta exibido ao final da prova (também presente no arquivo baixado).'),
      erro,
      h('label', { class: 'campo' }, 'Matrícula', mat),
      h('label', { class: 'campo' }, 'Código de consulta', cod),
      h('button', { class: 'btn', style: { width: '100%' }, onclick: consultar }, 'Consultar'))));
  mat.focus();
}

function conteudoResultado(r) {
  const discs = r.correcao.discursivas || {};
  let s = `<div class="cartao"><div class="linha-flex"><div><h1 style="margin:0">${esc(r.config.titulo || 'Prova')}</h1>` +
    `<p class="mudo" style="margin:4px 0">${r.nomes.map((n, i) => esc(n) + ' (' + esc(r.matriculas[i] || '') + ')').join(' · ')}</p>` +
    `<p class="pequeno mudo" style="margin:0">Entregue em ${fmtDataHora(r.entregueEm)} · código ${esc(r.codigo)}</p></div><span class="espaco"></span>` +
    `<div style="text-align:center"><div class="pequeno mudo">Nota final</div><div style="font-size:2.4rem;font-weight:800;color:var(--azul)">${fmtNota(r.notaFinal)}</div><div class="pequeno mudo">de 10,00</div></div></div>`;
  s += '<table class="dados" style="margin-top:14px"><tr><th>Parte</th><th>Nota</th></tr>' +
    `<tr><td>Parte I — Objetivas (correção automática)</td><td>${fmtNota(r.notaObj)} / ${fmtNota(r.questoes.filter(q => q.tipo === 'objetiva').reduce((x, q) => x + q.valor, 0))}</td></tr>` +
    r.questoes.filter(q => q.tipo === 'discursiva').map(q => `<tr><td>Questão ${q.numero} — ${esc(q.titulo)}</td><td>${discs[q.id] ? fmtNota(discs[q.id].nota) : '—'} / ${fmtNota(q.valor)}</td></tr>`).join('') + '</table>';
  if (r.correcao.feedbackGeral) s += `<div class="aviso-box" style="margin-top:14px"><b>Comentário geral do professor:</b><div style="white-space:pre-wrap">${esc(r.correcao.feedbackGeral)}</div></div>`;
  s += '</div>';
  r.questoes.forEach(q => {
    if (q.tipo === 'objetiva') {
      const o = r.objetivas.detalhes[q.id];
      s += htmlQuestaoLeitura(q, r.respostas, { gabarito: true, nota: o && o.acertou ? q.valor : 0 });
    } else {
      const d = discs[q.id] || {};
      let html = htmlQuestaoLeitura(q, r.respostas, { troca: r.troca, nota: d.nota, feedback: d.feedback });
      const v = r.verificacao && r.verificacao[q.id];
      if (v && ['d3', 'd4', 'd5'].includes(q.id)) {
        html = html.replace(/<\/article>$/, '<details class="colapso"><summary>Ver gabarito dos itens verificáveis</summary>' + htmlVerificacao(v) + '</details></article>');
      }
      s += html;
    }
  });
  return s;
}

function mostrar(r) {
  app.innerHTML = '';
  const corpo = conteudoResultado(r);
  app.append(cabecalhoInstitucional(r.config, h('div', { class: 'linha-flex' },
    h('button', { class: 'btn peq', onclick: async () => {
      let css = ''; try { css = await (await fetch('css/style.css')).text(); } catch (e) { /* ignore */ }
      const logo = await logoDataUrl();
      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Resultado — ${esc(r.matriculas.join(', '))}</title><style>${css}</style></head><body>` +
        `<header class="cabecalho"><div class="interno">${logo ? `<img class="logo" src="${logo}">` : ''}<div class="titulos"><div class="inst">Centro Universitário do Estado do Pará</div><div class="disc">${esc(r.config.disciplina)}</div></div></div></header><main class="pagina">${corpo}</main></body></html>`;
      baixar('Resultado_' + r.matriculas.join('_') + '.html', html, 'text/html;charset=utf-8');
    } }, '⬇ Baixar prova corrigida'),
    h('button', { class: 'btn sec peq', onclick: () => formulario() }, 'Nova consulta'))),
  h('main', { class: 'pagina', html: corpo }));
}

formulario();
