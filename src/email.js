"use strict";
/* ==========================================================================
   E-MAIL — aviso ao Corte Sam quando chega agendamento ou mensagem

   Driver por ambiente: CORTESAM_SMTP com a URL completa do SMTP
   (smtps://usuario:senha@smtp.provedor.com:465). Credencial em variável de
   ambiente, NUNCA no banco: banco vai para backup, e backup vai para o
   desktop de alguém.

   Sem a variável (ou sem destinatário no painel), o módulo fica "seco":
   registra no log o que TERIA enviado e segue. E-mail nunca derruba um
   agendamento — o pedido já está gravado e aparece no painel de
   qualquer jeito. O aviso é conveniência, o banco é a verdade.
   ========================================================================== */
const { txt } = require("./db");
const { esc } = require("./html-seguro");

let transporte = null;
const ativo = () => !!process.env.CORTESAM_SMTP;

function destinatarios() {
  return String(txt("contato.email_aviso")).split(/[,;\s]+/).map((s) => s.trim()).filter((s) => /@/.test(s));
}

function remetente() {
  const nome = String(txt("marca.nome", "Corte Sam")).replace(/["<>]/g, "");
  try {
    const u = new URL(process.env.CORTESAM_SMTP);
    return `"${nome}" <${process.env.CORTESAM_SMTP_DE || decodeURIComponent(u.username)}>`;
  } catch { return nome; }
}

function casca(titulo, linhas, rodape = "") {
  const tr = linhas.filter(([, v]) => v !== "" && v !== null && v !== undefined)
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#5b6478;font-size:13px;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-size:15px;color:#0B1F4B">${esc(String(v)).replace(/\n/g, "<br>")}</td></tr>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#EEF2F8;font-family:system-ui,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="height:6px;background:#1554D1;border-radius:6px 6px 0 0"></div>
  <div style="background:#fff;border-radius:0 0 12px 12px;padding:24px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#1554D1">Corte Sam · site</p>
    <h1 style="margin:0 0 18px;font-size:20px;color:#0B1F4B">${esc(titulo)}</h1>
    <table style="border-collapse:collapse;width:100%">${tr}</table>
    ${rodape}
  </div>
</div></body></html>`;
}

/* Nunca lança: quem chama está no meio de responder ao cliente. */
async function avisar(assunto, titulo, linhas, rodape = "") {
  const para = destinatarios();
  if (!ativo() || !para.length) {
    console.log(`  · e-mail (seco): ${assunto}${para.length ? "" : " — sem destinatário no painel"}`);
    return { enviado: false };
  }
  try {
    if (!transporte) transporte = require("nodemailer").createTransport(process.env.CORTESAM_SMTP);
    await transporte.sendMail({ from: remetente(), to: para.join(", "), subject: assunto, html: casca(titulo, linhas, rodape) });
    return { enviado: true };
  } catch (e) {
    console.error("  ✖ e-mail não enviado:", e.message);
    return { enviado: false, erro: e.message };
  }
}

module.exports = { avisar, ativo, destinatarios, casca };
