"use strict";
/* ==========================================================================
   FORMULÁRIOS PÚBLICOS — agendamento de corte e contato

   FORM DE VERDADE, com `method="post"`: funciona sem JavaScript. Com
   JavaScript, o site.js envia o mesmo formulário por fetch e mostra a
   confirmação sem trocar de página. O servidor responde aos dois: JSON para
   quem pede JSON, 303 para o resto.

   CONTRA ROBÔ, três camadas baratas e invisíveis para gente:
     1. campo-armadilha (`site`) escondido — gente não preenche, robô sim;
     2. ficha de tempo assinada (`_t`): recusa envio em menos de 3 s depois
        de a página abrir e ficha com mais de 1 dia (formulário raspado);
     3. freio por IP: 6 envios por hora.
   Nada de CAPTCHA: ele custa conversão de gente de verdade — o dono de
   confecção no celular, no meio do expediente.
   ========================================================================== */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Q, txt, auditar, DIR } = require("./db");
const { esc, semHtml } = require("./html-seguro");
const U = require("./util");
const Email = require("./email");

/* ------------------------------------------------------------- segredo */
let SEGREDO = process.env.CORTESAM_SEGREDO || "";
if (!SEGREDO) {
  const arq = path.join(DIR, "segredo.txt");
  try { SEGREDO = fs.readFileSync(arq, "utf8").trim(); } catch { }
  if (!SEGREDO) {
    SEGREDO = crypto.randomBytes(32).toString("hex");
    try { fs.writeFileSync(arq, SEGREDO, { mode: 0o600 }); } catch { }
  }
}
const assinar = (s) => crypto.createHmac("sha256", SEGREDO).update(String(s)).digest("base64url").slice(0, 22);
const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function ficha(agora = Date.now()) { return `${agora}.${assinar("t" + agora)}`; }
function fichaValida(v, agora = Date.now()) {
  const m = /^(\d{13})\.([\w-]{22})$/.exec(String(v || ""));
  if (!m) return false;
  if (!igual(m[2], assinar("t" + m[1]))) return false;
  const idade = agora - Number(m[1]);
  return idade >= 3000 && idade <= 24 * 3600e3;
}
const linkConfirmacao = (codigo) => `/agendamento/recebido/?c=${codigo}&t=${assinar("a" + codigo)}`;
const confirmacaoValida = (c, t) => /^[A-Z2-9]{6}$/.test(String(c || "")) && igual(String(t || ""), assinar("a" + c));

/* ------------------------------------------------------------- freio */
const batidas = new Map();
function freado(ip, limite = Number(process.env.CORTESAM_FREIO) || 6, janelaMs = 3600e3, agora = Date.now()) {
  const l = (batidas.get(ip) || []).filter((t) => agora - t < janelaMs);
  if (l.length >= limite) { batidas.set(ip, l); return true; }
  l.push(agora); batidas.set(ip, l);
  if (batidas.size > 5000) for (const [k, v] of batidas) if (!v.some((t) => agora - t < janelaMs)) batidas.delete(k);
  return false;
}

/* ------------------------------------------------------------- regras */
function regrasAgenda(hoje = U.hojeLocal()) {
  const horarios = String(txt("agenda.horarios")).split(",").map((s) => s.trim()).filter((s) => /^\d{1,2}:\d{2}$/.test(s))
    .map((s) => s.padStart(5, "0"));
  const fechados = String(txt("agenda.dias_fechados")).split(",").map((s) => s.trim()).filter((s) => /^[0-6]$/.test(s)).map(Number);
  const antecedencia = Math.max(1, Number(txt("agenda.antecedencia_dias", "45")) || 45);
  /* Agendar para HOJE não: a casa precisa ver o pedido e confirmar. */
  return { horarios, fechados, antecedencia, min: U.somarDias(hoje, 1), maxData: U.somarDias(hoje, antecedencia) };
}

const TECIDOS = ["Malha", "Jeans / brim", "Tecido plano", "Moletom", "Tecido com elastano", "Outro"];
const servicosAtivos = () => Q.todos("SELECT titulo FROM servicos WHERE ativo = 1 ORDER BY ordem, id").map((s) => s.titulo);

const numeroOpcional = (v, max) => {
  if (v === "" || v === undefined || v === null) return null;
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isInteger(n) && n >= 1 && n <= max ? n : NaN;
};

/* "2026-02-31" passa na regex e o Date "conserta" para 3 de março: a data
   só vale se os três números voltarem iguais. */
function dataReal(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/* Devolve { dados } ou { erros: {campo: mensagem} } — a tela marca o campo. */
function validarAgendamento(b, hoje = U.hojeLocal()) {
  const R = regrasAgenda(hoje);
  const e = {};
  const nome = U.limitar(semHtml(b.nome), 80);
  const tel = U.soDigitos(b.telefone);
  const email = U.limitar(b.email, 120);
  const data = String(b.data || "");
  const horario = String(b.horario || "").trim();
  const pecas = numeroOpcional(b.pecas, 100000);
  if (nome.length < 2) e.nome = "Diga seu nome.";
  if (tel.length < 10 || tel.length > 13) e.telefone = "Informe um WhatsApp com DDD.";
  if (email && !U.emailValido(email)) e.email = "Esse e-mail parece incompleto.";
  if (!dataReal(data)) e.data = "Escolha a data.";
  else if (data < R.min) e.data = "Escolha a partir de amanhã: a oficina confirma cada pedido.";
  else if (data > R.maxData) e.data = `Agendamentos até ${R.antecedencia} dias à frente.`;
  else if (R.fechados.length) {
    const dia = new Date(Date.UTC(+data.slice(0, 4), +data.slice(5, 7) - 1, +data.slice(8, 10))).getUTCDay();
    if (R.fechados.includes(dia)) e.data = `A oficina não atende ${dia === 0 || dia === 6 ? "no" : "na"} ${U.DIAS[dia]}.`;
  }
  if (!/^\d{1,2}:\d{2}$/.test(horario)) e.horario = "Escolha o horário.";
  else if (R.horarios.length && !R.horarios.includes(horario.padStart(5, "0"))) e.horario = "Escolha um dos horários da lista.";
  if (Number.isNaN(pecas)) e.pecas = "Quantidade de peças inválida.";
  const servicos = servicosAtivos();
  const servico = servicos.includes(b.servico) ? b.servico : "";
  const tecido = TECIDOS.includes(b.tecido) ? b.tecido : "";
  const obs = U.limitar(semHtml(b.observacoes), 1000);
  if (Object.keys(e).length) return { erros: e };
  return {
    dados: {
      nome, telefone: tel, email, empresa: U.limitar(semHtml(b.empresa), 100), servico, tecido, pecas,
      data, horario: horario.padStart(5, "0"), observacoes: obs, origem: b.origem === "calculadora" ? "calculadora" : "site",
    },
  };
}

function validarContato(b) {
  const e = {};
  const nome = U.limitar(semHtml(b.nome), 80);
  const contato = U.limitar(semHtml(b.contato), 120);
  const mensagem = U.limitar(semHtml(b.mensagem), 1500);
  if (nome.length < 2) e.nome = "Diga seu nome.";
  if (!U.emailValido(contato) && U.soDigitos(contato).length < 10) e.contato = "Um e-mail ou WhatsApp para a resposta.";
  if (mensagem.length < 5) e.mensagem = "Escreva a sua mensagem.";
  if (Object.keys(e).length) return { erros: e };
  return { dados: { nome, contato, assunto: U.limitar(semHtml(b.assunto), 100), mensagem } };
}

/* ------------------------------------------------------------- recebimento */
function portaria(b, ip) {
  if (String(b.site || "").trim()) return { status: 200, json: { ok: true, silencio: true } };  // armadilha: finge sucesso
  if (!fichaValida(b._t)) return { status: 400, json: { ok: false, erro: "O formulário expirou ou foi enviado rápido demais. Recarregue a página e tente de novo." } };
  if (freado(ip)) return { status: 429, json: { ok: false, erro: "Muitos envios deste endereço. Fale com a gente pelo WhatsApp." } };
  return null;
}

async function receberAgendamento(b, ip) {
  const barrado = portaria(b, ip); if (barrado) return barrado;
  const v = validarAgendamento(b);
  if (v.erros) return { status: 422, json: { ok: false, erros: v.erros, erro: "Confira os campos marcados." } };
  const d = v.dados;
  let codigo;
  for (let i = 0; i < 5; i++) { codigo = U.codigo(); if (!Q.um("SELECT 1 FROM agendamentos WHERE codigo=?", codigo)) break; }
  Q.roda(`INSERT INTO agendamentos (codigo, nome, empresa, telefone, email, servico, tecido, pecas, data, horario, observacoes, origem)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, codigo, d.nome, d.empresa, d.telefone, d.email, d.servico, d.tecido, d.pecas, d.data, d.horario, d.observacoes, d.origem);
  auditar("site", "agendamento recebido", codigo, `${d.data} ${d.horario} · ${d.servico || "serviço não informado"}`);
  const quando = `${U.diaDaSemana(d.data)}, ${U.dataCurta(d.data)} às ${d.horario}`;
  Email.avisar(`Agendamento ${codigo} — ${U.dataCurta(d.data)} ${d.horario} · ${d.nome}${d.empresa ? " (" + d.empresa + ")" : ""}`, "Novo pedido de agendamento", [
    ["Código", codigo], ["Nome", d.nome], ["Confecção", d.empresa], ["WhatsApp", U.telefoneBonito(d.telefone)], ["E-mail", d.email],
    ["Quando", quando], ["Serviço", d.servico], ["Tecido", d.tecido], ["Peças", d.pecas ?? ""], ["Observações", d.observacoes],
    ["Origem", d.origem === "calculadora" ? "calculadora de enfesto" : "site"],
  ], `<p style="margin:18px 0 0;font-size:13px;color:#5b6478">Confirme pelo painel (Agendamentos) — o botão de lá já abre o WhatsApp do cliente com a mensagem pronta.</p>`);
  const zapCasa = U.zap(txt("casa.whatsapp"),
    `Olá, Corte Sam! Acabei de pedir um agendamento pelo site.\nCódigo: ${codigo}\nNome: ${d.nome}${d.empresa ? `\nConfecção: ${d.empresa}` : ""}\nQuando: ${quando}${d.servico ? `\nServiço: ${d.servico}` : ""}`);
  return { status: 201, json: { ok: true, codigo, quando, confirmacao: linkConfirmacao(codigo), zap: zapCasa } };
}

async function receberContato(b, ip) {
  const barrado = portaria(b, ip); if (barrado) return barrado;
  const v = validarContato(b);
  if (v.erros) return { status: 422, json: { ok: false, erros: v.erros, erro: "Confira os campos marcados." } };
  const d = v.dados;
  Q.roda("INSERT INTO mensagens (nome, contato, assunto, mensagem) VALUES (?,?,?,?)", d.nome, d.contato, d.assunto, d.mensagem);
  Email.avisar(`Mensagem pelo site — ${d.assunto || d.nome}`, "Nova mensagem", [
    ["Nome", d.nome], ["Contato", d.contato], ["Assunto", d.assunto], ["Mensagem", d.mensagem]]);
  return { status: 201, json: { ok: true, mensagem: "Mensagem recebida. Respondemos em horário comercial." } };
}

/* ================================================================ telas */
const campo = (nome, rotulo, controle, { dica = "", classe = "" } = {}) => `
  <div class="campo ${classe}" data-campo="${nome}">
    <label for="f-${nome}">${rotulo}</label>
    ${controle}
    ${dica ? `<small class="campo__dica">${dica}</small>` : ""}
    <small class="campo__erro" data-erro="${nome}" role="alert"></small>
  </div>`;

const armadilha = () => `
  <div class="armadilha" aria-hidden="true"><label>Site <input name="site" tabindex="-1" autocomplete="off"></label></div>
  <input type="hidden" name="_t" value="${ficha()}">`;

/* `pre` vem da calculadora (?pecas=…&tecido=…): só preenche o que é válido. */
function formAgendamento({ pre = {} } = {}) {
  const R = regrasAgenda();
  const servicos = servicosAtivos();
  const pecas = numeroOpcional(pre.pecas, 100000);
  const obsPre = pre.metros && /^\d{1,5}([.,]\d{1,2})?$/.test(String(pre.metros)) && pre.folhas && /^\d{1,4}$/.test(String(pre.folhas))
    ? `Pela calculadora: ${String(pre.folhas)} folhas, cerca de ${String(pre.metros).replace(".", ",")} m de tecido.` : "";
  const horario = R.horarios.length
    ? `<div class="horarios" role="radiogroup" aria-labelledby="rot-horario">${R.horarios.map((h, i) => `<label class="horario"><input type="radio" name="horario" value="${h}"${i === 0 ? " required" : ""}><span>${h}</span></label>`).join("")}</div>`
    : `<input id="f-horario" name="horario" type="time" required>`;
  const aviso = semHtml(txt("agenda.aviso"));
  return `
<form class="form form--agenda" method="post" action="/agendamento" data-form="agendamento" novalidate data-fechados="${R.fechados.join(",")}">
  ${armadilha()}
  <input type="hidden" name="origem" value="${pre.origem === "calculadora" ? "calculadora" : "site"}">
  <fieldset class="form__bloco">
    <legend><span>01</span>Quem vem cortar</legend>
    <div class="form__grade">
      ${campo("nome", "Seu nome", `<input id="f-nome" name="nome" autocomplete="name" required maxlength="80">`)}
      ${campo("empresa", "Confecção <span>(opcional)</span>", `<input id="f-empresa" name="empresa" autocomplete="organization" maxlength="100">`)}
      ${campo("telefone", "WhatsApp", `<input id="f-telefone" name="telefone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="(81) 9 0000-0000" data-mascara="telefone">`)}
      ${campo("email", "E-mail <span>(opcional)</span>", `<input id="f-email" name="email" type="email" autocomplete="email" maxlength="120">`)}
    </div>
  </fieldset>
  <fieldset class="form__bloco">
    <legend><span>02</span>O que vai cortar</legend>
    <div class="form__grade">
      ${campo("servico", "Serviço", `<select id="f-servico" name="servico"><option value="">Ainda não sei</option>${servicos.map((s) => `<option${pre.servico === s ? " selected" : ""}>${esc(s)}</option>`).join("")}</select>`)}
      ${campo("tecido", "Tecido", `<select id="f-tecido" name="tecido"><option value="">Escolha</option>${TECIDOS.map((t) => `<option${pre.tecido === t ? " selected" : ""}>${t}</option>`).join("")}</select>`)}
      ${campo("pecas", "Quantidade de peças <span>(aprox.)</span>", `<input id="f-pecas" name="pecas" type="number" inputmode="numeric" min="1" max="100000"${pecas && !Number.isNaN(pecas) ? ` value="${pecas}"` : ""}>`)}
      ${campo("observacoes", "Detalhes <span>(opcional)</span>", `<textarea id="f-observacoes" name="observacoes" rows="3" maxlength="1000" placeholder="Modelo, grade de tamanhos, se o tecido tem estampa com sentido…">${esc(obsPre)}</textarea>`, { classe: "campo--largo" })}
    </div>
  </fieldset>
  <fieldset class="form__bloco">
    <legend><span>03</span>Quando</legend>
    <div class="form__grade">
      ${campo("data", "Data", `<input id="f-data" name="data" type="date" required min="${R.min}" max="${R.maxData}">`, { dica: R.fechados.length ? "De segunda a sexta." : "" })}
      <div class="campo campo--largo" data-campo="horario">
        <span class="campo__rotulo" id="rot-horario">Horário</span>
        ${horario}
        <small class="campo__erro" data-erro="horario" role="alert"></small>
      </div>
    </div>
  </fieldset>
  ${aviso ? `<p class="form__aviso">${ico("check")} ${esc(aviso)}</p>` : ""}
  <button class="btn btn--acao btn--lg btn--bloco" type="submit"><span data-rotulo>Pedir agendamento</span></button>
  <p class="form__lgpd">Seus dados servem só para o agendamento. Veja a <a href="/privacidade/">política de privacidade</a>.</p>
  <div class="form__retorno" data-retorno aria-live="polite"></div>
</form>`;
}

function formContato() {
  return `
<form class="form form--contato" method="post" action="/contato" data-form="contato" novalidate>
  ${armadilha()}
  <div class="form__grade">
    ${campo("ct-nome", "Seu nome", `<input id="f-ct-nome" name="nome" autocomplete="name" required maxlength="80">`)}
    ${campo("ct-contato", "E-mail ou WhatsApp", `<input id="f-ct-contato" name="contato" required maxlength="120">`)}
    ${campo("ct-assunto", "Assunto", `<input id="f-ct-assunto" name="assunto" maxlength="100">`, { classe: "campo--largo" })}
    ${campo("ct-mensagem", "Mensagem", `<textarea id="f-ct-mensagem" name="mensagem" rows="4" required maxlength="1500"></textarea>`, { classe: "campo--largo" })}
  </div>
  <button class="btn btn--acao btn--bloco" type="submit"><span data-rotulo>Enviar mensagem</span></button>
  <p class="form__lgpd">Seus dados servem só para responder. Veja a <a href="/privacidade/">política de privacidade</a>.</p>
  <div class="form__retorno" data-retorno aria-live="polite"></div>
</form>`;
}

/* ícone local, sem puxar o layout (o layout depende deste módulo) */
function ico(n) {
  return n === "check" ? '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : "";
}

module.exports = {
  receberAgendamento, receberContato, formAgendamento, formContato, validarAgendamento, validarContato,
  regrasAgenda, ficha, fichaValida, freado, confirmacaoValida, linkConfirmacao, assinar, dataReal, TECIDOS, _batidas: batidas,
};
