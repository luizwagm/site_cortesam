"use strict";
/* Utilitários sem dependência de banco — a suíte os prova em memória. */
const crypto = require("node:crypto");
const { esc } = require("./html-seguro");

const slugify = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "item";

/* Dinheiro em centavos inteiros. `null` é "sem preço publicado", nunca zero. */
const REAL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dinheiro = (c) => (c === null || c === undefined || c === "" ? "" : REAL.format(Number(c) / 100));

/* "R$ 1.234,56", "1234,56", "89" → centavos. Vazio → null. Lixo → NaN. */
function centavos(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[R$\s]/g, "");
  if (s === "") return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$|^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const normal = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return Math.round(Number(normal) * 100);
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/* Datas AAAA-MM-DD são DATAS, não instantes: montar com `new Date("2026-09-15")`
   dá meia-noite em UTC, que em Pernambuco (UTC−3) é o DIA ANTERIOR. Tudo aqui
   trabalha com os três números, sem fuso. */
function partes(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? { a: +m[1], m: +m[2], d: +m[3] } : null;
}
function dataExtenso(iso) {
  const p = partes(iso); if (!p) return "";
  return `${p.d} de ${MESES[p.m - 1]} de ${p.a}`;
}
function dataCurta(iso) {
  const p = partes(iso); if (!p) return "";
  return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.a}`;
}
function diaDaSemana(iso) {
  const p = partes(iso); if (!p) return "";
  return DIAS[new Date(Date.UTC(p.a, p.m - 1, p.d)).getUTCDay()];
}
/* "Hoje" no fuso da casa, não no do servidor (que roda em UTC). */
function hojeLocal(agora = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Recife", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(agora);
}
function somarDias(iso, n) {
  const p = partes(iso);
  const d = new Date(Date.UTC(p.a, p.m - 1, p.d + n));
  return d.toISOString().slice(0, 10);
}

/* Telefone: guarda só dígitos; mostra com máscara. */
const soDigitos = (s) => String(s || "").replace(/\D/g, "");
function telefoneBonito(s) {
  let d = soDigitos(s);
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(s || "");
}
/* Número internacional para o wa.me: 55 + DDD + número. */
function numeroZap(s) {
  let d = soDigitos(s);
  if (!d) return "";
  if (!d.startsWith("55")) d = "55" + d;
  return d.length >= 12 && d.length <= 13 ? d : "";
}
/* O ÚNICO montador de link de WhatsApp. Botão do topo, agendamento, serviço e
   painel passam todos por aqui — duas versões do mesmo link é o caminho para
   uma delas ficar com o número velho no dia em que a casa trocar de aparelho. */
function zap(numero, mensagem = "") {
  const n = numeroZap(numero);
  if (!n) return "";
  return `https://wa.me/${n}` + (mensagem ? `?text=${encodeURIComponent(mensagem)}` : "");
}

const emailValido = (e) => /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(String(e || "").trim());

/* Código do agendamento: curto, ditável por telefone, sem I/O/0/1. */
const ALFA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function codigo(n = 6) {
  const b = crypto.randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += ALFA[b[i] % ALFA.length];
  return s;
}

/* Hash do IP com sal diário: conta visitante único do dia sem conseguir
   seguir a mesma pessoa no dia seguinte. */
function hashDoDia(ip, dia, segredo) {
  return crypto.createHash("sha256").update(`${segredo}|${dia}|${ip}`).digest("hex").slice(0, 24);
}

const limitar = (s, n) => String(s ?? "").trim().slice(0, n);

module.exports = {
  esc, slugify, dinheiro, centavos, dataExtenso, dataCurta, diaDaSemana, hojeLocal, somarDias,
  soDigitos, telefoneBonito, numeroZap, zap, emailValido, codigo, hashDoDia, limitar, MESES, DIAS,
};
