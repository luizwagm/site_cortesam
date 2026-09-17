"use strict";
/* ==========================================================================
   MEDIÇÃO — Google Analytics 4 e Meta Pixel (padrão do parque, ver Alafcell)

   NADA DISPARA ANTES DO ACEITE. GA4 e Pixel gravam cookie e mandam o
   comportamento do visitante para fora do país; pela LGPD isso pede
   CONSENTIMENTO dado antes. "Ao continuar você concorda" não serve: quando a
   faixa aparece, o dado já foi. Aqui o script só entra depois do clique em
   "Aceitar", e "Recusar" é botão de verdade, do mesmo tamanho.

   A FAIXA NASCE DO QUE O SITE CARREGA: sem GA4 e sem Pixel configurados no
   painel, ela nem é escrita — pedir consentimento para cookie que não existe
   é ruído que ensina o visitante a clicar sem ler.

   A contagem própria (tabela `acessos`) não depende disso e conta todo mundo.
   ========================================================================== */
const { txt } = require("./db");

const ga4Valido = (v) => /^G-[A-Z0-9]{4,20}$/i.test(String(v || "").trim());
const pixelValido = (v) => /^\d{8,20}$/.test(String(v || "").trim());

function configurada() {
  return ga4Valido(txt("medicao.ga4")) || pixelValido(txt("medicao.pixel"));
}

/* Domínios que o CSP precisa liberar SÓ quando há medição ligada. */
function origensCsp() {
  if (!configurada()) return { script: "", conectar: "", imagem: "" };
  const s = [], c = [], i = [];
  if (ga4Valido(txt("medicao.ga4"))) {
    s.push("https://www.googletagmanager.com");
    c.push("https://*.google-analytics.com", "https://*.analytics.google.com", "https://www.googletagmanager.com");
    i.push("https://*.google-analytics.com", "https://www.googletagmanager.com");
  }
  if (pixelValido(txt("medicao.pixel"))) {
    s.push("https://connect.facebook.net");
    c.push("https://www.facebook.com", "https://connect.facebook.net");
    i.push("https://www.facebook.com");
  }
  return { script: s.join(" "), conectar: c.join(" "), imagem: i.join(" ") };
}

function cabeca(nonce) {
  if (!configurada()) return "";
  const ga4 = String(txt("medicao.ga4")).trim();
  const pixel = String(txt("medicao.pixel")).trim();
  return `
<script nonce="${nonce}">
(function () {
  var GA4 = ${JSON.stringify(ga4Valido(ga4) ? ga4 : "")};
  var PIXEL = ${JSON.stringify(pixelValido(pixel) ? pixel : "")};
  function ligarGA4() {
    if (!GA4 || window.__ga4) return; window.__ga4 = 1;
    var s = document.createElement("script"); s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA4;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    gtag("js", new Date()); gtag("config", GA4, { anonymize_ip: true });
  }
  function ligarPixel() {
    if (!PIXEL || window.__pixel) return; window.__pixel = 1;
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
    (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', PIXEL); fbq('track', 'PageView');
  }
  window.corteSamMedir = function () { ligarGA4(); ligarPixel(); };
  /* Evento de conversão: o agendamento enviado. Só existe se o aceite existiu. */
  window.corteSamConverteu = function (tipo) {
    try { if (window.gtag) gtag("event", "generate_lead", { event_category: tipo }); } catch (e) {}
    try { if (window.fbq) fbq("track", "Lead", { content_category: tipo }); } catch (e) {}
  };
  try { if (/(?:^|;\\s*)cortesam_medir=sim/.test(document.cookie)) window.corteSamMedir(); } catch (e) {}
})();
</script>`;
}

function aviso(nonce) {
  if (!configurada()) return "";
  return `
<div class="consent" id="consent" role="region" aria-label="Cookies" hidden>
  <p><strong>Cookies, só com a sua licença.</strong> Usamos Google Analytics e Meta Pixel para entender
    o que as pessoas procuram no site. Nada é vendido, e tudo funciona igual se você recusar.
    <a href="/privacidade/">Saiba mais</a>.</p>
  <div class="consent__acoes">
    <button class="btn btn--acao btn--sm" type="button" data-medir="sim">Aceitar</button>
    <button class="btn btn--linha btn--sm" type="button" data-medir="nao">Recusar</button>
  </div>
</div>
<script nonce="${nonce}">
(function () {
  var cx = document.getElementById("consent"); if (!cx) return;
  if (/(?:^|;\\s*)cortesam_medir=/.test(document.cookie)) return;
  cx.hidden = false;
  cx.addEventListener("click", function (e) {
    var b = e.target.closest("[data-medir]"); if (!b) return;
    var v = b.dataset.medir;
    document.cookie = "cortesam_medir=" + v + "; Path=/; Max-Age=" + (180 * 24 * 3600) + "; SameSite=Lax";
    cx.hidden = true;
    if (v === "sim" && window.corteSamMedir) window.corteSamMedir();
  });
})();
</script>`;
}

module.exports = { cabeca, aviso, configurada, origensCsp, ga4Valido, pixelValido };
