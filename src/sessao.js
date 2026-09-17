"use strict";
/* ==========================================================================
   QUEM ENTRA NO PAINEL — senha, sessão e papéis

   SENHA em scrypt com sal por usuário (lento de propósito: tira a vantagem
   da placa de vídeo), comparada em tempo constante.

   SESSÃO: token sorteado no banco, entregue em cookie HttpOnly (script da
   página não lê) e SameSite=Lax (outro site não manda o cookie num POST).
   `Secure` só em https — em http o navegador descartaria o cookie e o login
   "não funcionaria" no ambiente local sem erro nenhum.

   FREIO de senha: o `limitador.js` do parque (balde por IP + por CONTA,
   gravado em disco, espera crescente). Ver o comentário de lá.

   PAPÉIS — a tela esconde o que o papel não usa, mas quem DECIDE é o
   servidor, em `pode()`. Botão escondido é conforto; a trava é aqui.
     administrador  tudo: agendamentos, mensagens, serviços, textos, usuários
     redator        blog, galeria de trabalhos e perguntas frequentes — o
                    conteúdo que muda toda semana e que faz o site subir no
                    Google, sem acesso a agenda nem a dados de cliente
   ========================================================================== */
const path = require("node:path");
const crypto = require("node:crypto");
const { Q, DIR } = require("./db");
const { criarLimitador } = require("./limitador");

const CUSTO = { N: 16384, r: 8, p: 1 };
const DIAS = 7;
const COOKIE = "cortesam_sessao";

function cifrar(senha) {
  const sal = crypto.randomBytes(16);
  return sal.toString("hex") + ":" + crypto.scryptSync(String(senha), sal, 64, CUSTO).toString("hex");
}
function confere(senha, guardado) {
  try {
    const [s, h] = String(guardado || "").split(":");
    if (!s || !h) return false;
    const calc = crypto.scryptSync(String(senha), Buffer.from(s, "hex"), 64, CUSTO);
    const alvo = Buffer.from(h, "hex");
    return alvo.length === calc.length && crypto.timingSafeEqual(alvo, calc);
  } catch { return false; }
}
/* Senha que não se adivinha numa lista de mil: 8+ caracteres, com letra e
   número. Não é a regra perfeita — é a que o dono de uma oficina cumpre. */
function senhaBoa(s) {
  const v = String(s || "");
  if (v.length < 8) return "A senha precisa de pelo menos 8 caracteres.";
  if (!/[a-zA-Z]/.test(v) || !/\d/.test(v)) return "Use letras e números na senha.";
  if (/^(12345678|senha123|cortesam1|password1)$/i.test(v)) return "Essa senha é das primeiras que um ataque tenta.";
  return "";
}

function abrir(usuarioId) {
  const token = crypto.randomBytes(32).toString("base64url");
  Q.roda("INSERT INTO sessoes (token, usuario_id, expira) VALUES (?,?,?)", token, usuarioId, new Date(Date.now() + DIAS * 864e5).toISOString());
  Q.roda("UPDATE usuarios SET entrou = datetime('now') WHERE id = ?", usuarioId);
  return token;
}
const tokenDe = (req) => (/(?:^|;\s*)cortesam_sessao=([^;]+)/.exec(req.headers.cookie || "") || [])[1] || "";
function ler(req) {
  const t = tokenDe(req);
  if (!t) return null;
  return Q.um(`SELECT u.id, u.usuario, u.nome, u.email, u.papel, u.trocar_senha FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
               WHERE s.token = ? AND s.expira > ? AND u.ativo = 1`, t, new Date().toISOString()) || null;
}
function fechar(req) { const t = tokenDe(req); if (t) Q.roda("DELETE FROM sessoes WHERE token = ?", t); }
/* Trocar a senha ou desativar a conta derruba as outras sessões dela: quem
   pegou o celular esquecido logado perde o acesso junto. */
function fecharTodas(usuarioId, exceto = "") { Q.roda("DELETE FROM sessoes WHERE usuario_id = ? AND token <> ?", usuarioId, exceto); }
const cookie = (token, seguro) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DIAS * 86400}${seguro ? "; Secure" : ""}`;
const cookieSair = (seguro) => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${seguro ? "; Secure" : ""}`;
function limparVencidas() { Q.roda("DELETE FROM sessoes WHERE expira <= ?", new Date().toISOString()); }

/* ------------------------------------------------------------- papéis */
const AREAS = {
  administrador: "*",
  redator: ["painel", "blog", "galeria", "faq", "upload"],
};
const PAPEIS = Object.keys(AREAS);
function pode(usuario, area) {
  if (!usuario) return false;
  const a = AREAS[usuario.papel];
  return a === "*" || (Array.isArray(a) && a.includes(area));
}

const limitador = criarLimitador({ arquivo: path.join(DIR, "limitador.json") });
limitador.carregar();

module.exports = { cifrar, confere, senhaBoa, abrir, ler, fechar, fecharTodas, cookie, cookieSair, limparVencidas, pode, PAPEIS, AREAS, limitador };
