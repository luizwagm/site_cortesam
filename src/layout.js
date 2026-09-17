"use strict";
/* ==========================================================================
   LAYOUT — o que toda página pública tem: cabeça, topo, rodapé, dado
   estruturado e as peças pequenas (foto responsiva, ícones, título rico).
   ========================================================================== */
const fs = require("node:fs");
const path = require("node:path");
const { Q, txt } = require("./db");
const { esc, sanitizarHtml, semHtml, emLinhas } = require("./html-seguro");
const U = require("./util");
const Medicao = require("./medicao");
const VERSAO = require("../package.json").version;

/* ------------------------------------------------------------ endereço base
   CORTESAM_SITE é o endereço público (canonical, og:url, sitemap). O endereço
   de TRABALHO (*.projetos.luizaugust.me) sai do índice sozinho: o Google não
   pode conhecer o site por um endereço que vai morrer. */
const SITE = () => String(process.env.CORTESAM_SITE || "http://localhost:5208").replace(/\/+$/, "");
function indexavel() {
  if (process.env.CORTESAM_INDEXAR === "sim") return true;
  if (process.env.CORTESAM_INDEXAR === "nao") return false;
  const s = SITE();
  return /^https:\/\//.test(s) && !/\.projetos\.luizaugust\.me$/i.test(new URL(s).hostname);
}
/* A cópia de trabalho pode continuar respondendo depois que o domínio
   definitivo subir (mesmo processo, dois server_name). Quem chega pelo host
   de trabalho recebe noindex, qualquer que seja o CORTESAM_SITE — lição do
   Alafcell 0.13.1, em que a cópia .projetos concorreu com o site no Google. */
const hostDeTrabalho = (host) => /\.projetos\.luizaugust\.me(:\d+)?$/i.test(String(host || ""));
const absoluto = (c) => /^https?:\/\//i.test(c) ? c : SITE() + (String(c).startsWith("/") ? c : "/" + c);

/* ------------------------------------------------------------ dados da casa */
function casa() {
  const zapNum = txt("casa.whatsapp");
  return {
    nome: semHtml(txt("casa.nome", "Corte Sam")),
    lema: semHtml(txt("casa.lema", "O corte certo da moda")),
    razao: semHtml(txt("casa.razao")),
    cnpj: semHtml(txt("casa.cnpj")),
    desde: semHtml(txt("casa.desde", "2017")),
    whatsapp: zapNum,
    zap: (msg) => U.zap(zapNum, msg),
    telefone2: semHtml(txt("casa.telefone2")),
    email: semHtml(txt("casa.email")),
    logradouro: semHtml(txt("casa.logradouro")),
    bairro: semHtml(txt("casa.bairro")),
    cidade: semHtml(txt("casa.cidade", "Caruaru")),
    uf: semHtml(txt("casa.uf", "PE")),
    cep: semHtml(txt("casa.cep")),
    lat: Number(txt("casa.lat")) || null,
    lng: Number(txt("casa.lng")) || null,
    horario: emLinhas(txt("casa.horario")),
    avisoZap: semHtml(txt("casa.aviso_zap")),
    pagamento: semHtml(txt("casa.pagamento")),
    instagram: txt("redes.instagram"),
    facebook: txt("redes.facebook"),
    gNota: semHtml(txt("google.nota")),
    gTotal: semHtml(txt("google.total")),
    gLink: txt("google.link"),
  };
}
const MSG_ZAP = "Olá, Corte Sam! Vim pelo site e quero falar sobre um corte.";
const linkMaps = (c) => c.lat && c.lng
  ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.nome} ${c.logradouro} ${c.cidade}`)}`;
const mapaEmbutido = (c) => c.lat && c.lng
  ? `https://www.google.com/maps?q=${c.lat},${c.lng}&z=17&hl=pt-BR&output=embed`
  : `https://www.google.com/maps?q=${encodeURIComponent(`${c.logradouro}, ${c.cidade} ${c.uf}`)}&z=17&hl=pt-BR&output=embed`;

/* --------------------------------------------------------------- horário
   "Segunda a sexta · 8h às 12h" → especificação do Google. O texto é livre
   (o dono escreve como quiser); o que não se entende com segurança NÃO vai
   para o dado estruturado — horário errado no Google manda cliente para a
   porta fechada, e é pior que horário nenhum. */
const DIAS_SCHEMA = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NOMES_DIA = { domingo: 0, segunda: 1, terca: 2, terça: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, sábado: 6 };
function horarioEstruturado(texto) {
  const saida = [];
  for (const linha of String(texto || "").split("\n")) {
    const l = linha.toLowerCase().replace(/-feira/g, "");
    const dias = [...l.matchAll(/(domingo|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado)/g)].map((m) => NOMES_DIA[m[1]]);
    const horas = [...l.matchAll(/(\d{1,2})(?:[:h](\d{2}))?\s*h?\b/g)].map((m) => ({ h: +m[1], m: +(m[2] || 0) }))
      .filter((x) => x.h <= 24 && x.m < 60);
    if (!dias.length || horas.length !== 2) return null;           // uma linha não entendida invalida tudo
    let lista = dias;
    if (dias.length === 2 && /\ba\b|\bà\b|até|-/.test(l)) {        // "segunda a sexta" é intervalo
      lista = []; for (let d = dias[0]; ; d = (d + 1) % 7) { lista.push(d); if (d === dias[1] || lista.length > 7) break; }
    }
    const hh = (x) => `${String(x.h).padStart(2, "0")}:${String(x.m).padStart(2, "0")}`;
    if (hh(horas[0]) >= hh(horas[1])) return null;
    saida.push({ "@type": "OpeningHoursSpecification", dayOfWeek: lista.map((d) => DIAS_SCHEMA[d]), opens: hh(horas[0]), closes: hh(horas[1]) });
  }
  return saida.length ? saida : null;
}

/* --------------------------------------------------------------- títulos
   Campos de título aceitam UMA marcação: <em>, que vira a palavra em
   destaque. Qualquer outra tag some. */
function tituloRico(v) {
  const limpo = sanitizarHtml(String(v || "")).replace(/<\/?p>/gi, "");
  return limpo.replace(/<(?!\/?em>)[^>]+>/gi, "");
}

/* ------------------------------------------------------------ fotografia
   Fotos do banco vêm em até três larguras (-p, -m e cheia). O srcset deixa o
   celular baixar a menor que serve. Largura/altura declaradas evitam o "pulo"
   do layout enquanto a foto chega (CLS). */
const LARG = {};
try {
  const { FOTOS } = require("../ferramentas/baixar-imagens.cjs");
  for (const [nome, , larguras] of FOTOS) LARG[nome] = larguras;
} catch { /* sem a lista, as fotos saem sem srcset — o site não quebra */ }

/* Dimensões reais das fotos da oficina, lidas do próprio WebP (cabeçalho VP8/VP8L/VP8X). */
const DIM = new Map();
function dimensoesWebp(arquivo) {
  if (DIM.has(arquivo)) return DIM.get(arquivo);
  let r = null;
  try {
    const b = fs.readFileSync(arquivo);
    const tipo = b.toString("ascii", 12, 16);
    if (tipo === "VP8X") r = [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    else if (tipo === "VP8 ") r = [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    else if (tipo === "VP8L") { const v = b.readUInt32LE(21); r = [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
  } catch { }
  DIM.set(arquivo, r);
  return r;
}

function foto(src, alt, { classe = "", tamanhos = "100vw", prioridade = false } = {}) {
  const s = String(src || "");
  if (!s) return "";
  const carregar = prioridade ? 'fetchpriority="high" loading="eager"' : 'loading="lazy"';
  const m = /^\/assets\/img\/banco\/([a-z0-9-]+?)(-m|-p)?\.webp$/.exec(s);
  if (m && LARG[m[1]]) {
    const [lm, lg, lp] = LARG[m[1]];
    const dims = dimensoesWebp(path.join(__dirname, "..", "assets", "img", "banco", `${m[1]}-m.webp`));
    const conj = [lp && `/assets/img/banco/${m[1]}-p.webp ${lp}w`, `/assets/img/banco/${m[1]}-m.webp ${lm}w`, `/assets/img/banco/${m[1]}.webp ${lg}w`].filter(Boolean).join(", ");
    return `<img class="${classe}" src="/assets/img/banco/${m[1]}-m.webp" srcset="${conj}" sizes="${tamanhos}" alt="${esc(alt)}" ${carregar} decoding="async"${dims ? ` width="${dims[0]}" height="${dims[1]}"` : ""}>`;
  }
  let dims = null;
  if (/^\/assets\/img\/[a-z0-9/_.-]+\.webp$/i.test(s) && !s.includes("..")) dims = dimensoesWebp(path.join(__dirname, "..", s));
  return `<img class="${classe}" src="${esc(s)}" alt="${esc(alt)}" ${carregar} decoding="async"${dims ? ` width="${dims[0]}" height="${dims[1]}"` : ""}>`;
}

/* --------------------------------------------------------------- ícones */
const ICONES = {
  zap: '<path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.7 11.7 0 0 0 4.5 4c1.7.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3Z" fill="currentColor"/>',
  insta: '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor"/>',
  face: '<path d="M14 8.5V7c0-.8.5-1 1-1h2V2.5h-2.8C11 2.5 10 4.6 10 6.6v1.9H8V12h2v9.5h4V12h2.7l.4-3.5Z" fill="currentColor"/>',
  pino: '<path d="M12 21s-6.5-6.1-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.9-6.5 11-6.5 11Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  relogio: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3.2 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  fone: '<path d="M6.6 3.5 9 3l1.6 4-2 1.3a11 11 0 0 0 7.1 7.1l1.3-2 4 1.6-.5 2.4a2 2 0 0 1-2 1.6A15.8 15.8 0 0 1 3 5.5a2 2 0 0 1 1.6-2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  seta: '<path d="M5 12h13m-5-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  estrela: '<path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.3l-5.6 2.9 1.1-6.3-4.6-4.4 6.3-.9Z" fill="currentColor"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 10h17M8 3v4m8-4v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  tesoura: '<circle cx="6" cy="6.5" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="6" cy="17.5" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.3 8.2 20 18M8.3 15.8 20 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  regua: '<rect x="2.5" y="8" width="19" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 8v3m3.5-3v4.5M13 8v3m3.5-3v4.5M20 8v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  camadas: '<path d="M3 8c3-2.4 6-2.4 9 0s6 2.4 9 0M3 12.5c3-2.4 6-2.4 9 0s6 2.4 9 0M3 17c3-2.4 6-2.4 9 0s6 2.4 9 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  calc: '<rect x="5" y="2.5" width="14" height="19" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 6.5h8M8.5 11h1m3 0h1m3 0h0M8.5 14.5h1m3 0h1m3 0h0M8.5 18h1m3 0h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  fechar: '<path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  google: '<path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z" fill="currentColor"/><path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" fill="currentColor" opacity=".75"/><path d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9Z" fill="currentColor" opacity=".55"/><path d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6Z" fill="currentColor" opacity=".9"/>',
};
const ico = (n, cls = "ico") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONES[n] || ""}</svg>`;

/* O símbolo inline no topo: evita um pedido a mais e pinta junto com o texto.
   Os ids ganham sufixo porque o símbolo aparece duas vezes na página. */
const SIMBOLO = fs.readFileSync(path.join(__dirname, "..", "assets", "img", "marca.svg"), "utf8")
  .replace(/<!--[\s\S]*?-->/g, "").replace(/\s+role="img" aria-label="Corte Sam"/, ' aria-hidden="true" focusable="false"').replace(/\n\s*/g, "");
const simbolo = (sufixo, cls = "marca__simbolo") => SIMBOLO.replace(/cs-(e|d)/g, `cs-$1-${sufixo}`).replace("<svg ", `<svg class="${cls}" `);

/* ------------------------------------------------------------- navegação */
const MENU = [
  ["/servicos/", "Serviços"],
  ["/calculadora-de-enfesto/", "Calculadora"],
  ["/sobre/", "A oficina"],
  ["/blog/", "Blog"],
  ["/contato/", "Contato"],
];

function cabecalho(caminho) {
  const c = casa();
  const itens = MENU.map(([href, rot]) => {
    const atual = caminho === href || (href !== "/" && caminho.startsWith(href));
    return `<li><a href="${href}"${atual ? ' aria-current="page"' : ""}>${rot}</a></li>`;
  }).join("");
  const zapLink = c.zap(MSG_ZAP);
  return `
<a class="pular" href="#conteudo">Pular para o conteúdo</a>
<div class="progresso" aria-hidden="true"><span data-progresso></span></div>
<header class="topo" data-topo>
  <div class="topo__faixa envelope">
    <a class="marca" href="/">
      ${simbolo("topo")}
      <span class="marca__nome">Corte <b>Sam</b></span>
    </a>
    <nav class="topo__nav" aria-label="Principal"><ul>${itens}</ul></nav>
    <div class="topo__acoes">
      ${zapLink ? `<a class="topo__zap" href="${esc(zapLink)}" target="_blank" rel="noopener" aria-label="Conversar no WhatsApp">${ico("zap")}</a>` : ""}
      <a class="btn btn--giz btn--sm topo__cta" href="/agendamento/" aria-label="Agendar corte">${ico("calendario")}<span>Agendar corte</span></a>
      <button class="topo__menu" type="button" aria-expanded="false" aria-controls="menu-movel" data-abrir-menu>
        ${ico("menu")}<span class="sr">Abrir menu</span>
      </button>
    </div>
  </div>
</header>
<div class="menu-movel" id="menu-movel" hidden data-menu-movel>
  <div class="menu-movel__topo">
    <span class="marca">${simbolo("menu")}<span class="marca__nome">Corte <b>Sam</b></span></span>
    <button class="menu-movel__fechar" type="button" data-fechar-menu>${ico("fechar")}<span class="sr">Fechar menu</span></button>
  </div>
  <nav aria-label="Menu">
    <ol>
      <li><a href="/"><small>00</small>Início</a></li>
      ${MENU.map(([h, r], i) => `<li><a href="${h}"><small>${String(i + 1).padStart(2, "0")}</small>${r}</a></li>`).join("")}
    </ol>
  </nav>
  <div class="menu-movel__pe">
    <a class="btn btn--giz btn--bloco" href="/agendamento/">${ico("calendario")} Agendar corte</a>
    ${zapLink ? `<a class="btn btn--linha-clara btn--bloco" href="${esc(zapLink)}" target="_blank" rel="noopener">${ico("zap")} WhatsApp</a>` : ""}
    <p>${esc(c.logradouro)} · ${esc(c.cidade)}/${esc(c.uf)}</p>
  </div>
</div>`;
}

/* ------------------------------------------------------------- rodapé */
function linhasHorario(c, { classe = "" } = {}) {
  const zapLink = c.zap(MSG_ZAP);
  return c.horario
    ? `<ul class="${classe}">${c.horario.split("\n").map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`
    : `<ul class="${classe}"><li>Consulte pelo <a href="${esc(zapLink)}" target="_blank" rel="noopener">WhatsApp</a></li></ul>`;
}

function rodape(nonce, { semChamada = false } = {}) {
  const c = casa();
  const zapLink = c.zap(MSG_ZAP);
  const redes = [
    c.instagram && `<a href="${esc(c.instagram)}" target="_blank" rel="noopener" aria-label="Instagram">${ico("insta")}</a>`,
    c.facebook && `<a href="${esc(c.facebook)}" target="_blank" rel="noopener" aria-label="Facebook">${ico("face")}</a>`,
    zapLink && `<a href="${esc(zapLink)}" target="_blank" rel="noopener" aria-label="WhatsApp">${ico("zap")}</a>`,
    c.gLink && `<a href="${esc(c.gLink)}" target="_blank" rel="noopener" aria-label="Perfil no Google">${ico("google")}</a>`,
  ].filter(Boolean).join("");
  const chamada = semChamada ? "" : `
  <section class="rodape__chamada" aria-labelledby="rodape-chamada">
    <div class="envelope">
      <div class="linha-corte" aria-hidden="true" data-tesoura><span class="linha-corte__tesoura">${ico("tesoura")}</span></div>
      <p class="selo selo--claro">Agenda aberta · seg a sex</p>
      <h2 id="rodape-chamada" class="rodape__titulo" data-esticar>${tituloRico(txt("home.chamada_titulo", "Sua produção na mesa <em>certa</em>."))}</h2>
      <p class="rodape__sub">${esc(semHtml(txt("home.chamada_texto")))}</p>
      <div class="rodape__botoes">
        <a class="btn btn--giz btn--lg" href="/agendamento/">${ico("calendario")} Agendar corte ${ico("seta")}</a>
        ${zapLink ? `<a class="btn btn--linha-clara btn--lg" href="${esc(zapLink)}" target="_blank" rel="noopener">${ico("zap")} WhatsApp</a>` : ""}
      </div>
      ${c.avisoZap && zapLink ? `<p class="rodape__aviso">${esc(c.avisoZap)}</p>` : ""}
    </div>
  </section>`;
  return `
<footer class="rodape">
  ${chamada}
  <div class="envelope rodape__grade">
    <div class="rodape__marca">
      <a class="marca marca--grande" href="/">${simbolo("pe")}<span class="marca__nome">Corte <b>Sam</b></span></a>
      <p class="rodape__lema">${esc(c.lema)}.</p>
      <p>Corte de tecidos e modelagem para confecções em ${esc(c.cidade)} e no Polo do Agreste${c.desde ? `, desde ${esc(c.desde)}` : ""}.</p>
      <div class="rodape__redes">${redes}</div>
    </div>
    <nav class="rodape__col" aria-label="Serviços">
      <h3><span>01</span>Serviços</h3>
      <ul>
        ${Q.todos("SELECT slug, titulo FROM servicos WHERE ativo = 1 ORDER BY ordem, id").map((s) => `<li><a href="/servicos/${esc(s.slug)}/">${esc(s.titulo)}</a></li>`).join("")}
        <li><a href="/calculadora-de-enfesto/">Calculadora de enfesto</a></li>
      </ul>
    </nav>
    <nav class="rodape__col" aria-label="Institucional">
      <h3><span>02</span>Corte Sam</h3>
      <ul>
        <li><a href="/sobre/">A oficina</a></li>
        <li><a href="/blog/">Blog</a></li>
        <li><a href="/agendamento/">Agendamento</a></li>
        <li><a href="/contato/">Contato e mapa</a></li>
      </ul>
    </nav>
    <div class="rodape__col">
      <h3><span>03</span>Onde e quando</h3>
      <address>
        <p>${ico("pino")}<span>${esc(c.logradouro)}<br>${esc(c.bairro)} · ${esc(c.cidade)}/${esc(c.uf)}${c.cep ? `<br>CEP ${esc(c.cep)}` : ""}</span></p>
        ${c.whatsapp ? `<p>${ico("zap")}<a href="${esc(zapLink)}" target="_blank" rel="noopener">${esc(U.telefoneBonito(c.whatsapp))}</a></p>` : ""}
        ${c.telefone2 ? `<p>${ico("fone")}<a href="tel:+55${esc(U.soDigitos(c.telefone2))}">${esc(U.telefoneBonito(c.telefone2))}</a></p>` : ""}
        ${c.email ? `<p>${ico("email")}<a href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>` : ""}
      </address>
      <div class="rodape__horario">${ico("relogio")}${linhasHorario(c)}</div>
    </div>
  </div>
  <div class="regua regua--rodape" aria-hidden="true"></div>
  <div class="envelope rodape__base">
    <p>© ${new Date().getFullYear()} ${esc(c.razao || c.nome)}${c.cnpj ? ` · CNPJ ${esc(c.cnpj)}` : ""}</p>
    <p><a href="/privacidade/">Privacidade</a> · Fotos de ambientação: <a href="https://unsplash.com" target="_blank" rel="noopener">Unsplash</a></p>
    <a class="dev-credit" href="https://luizaugust.me" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 20V8l4-4 4 4v12M12 20V10l4-4 4 4v10" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
      Desenvolvido por <strong>LA Software House</strong>
    </a>
  </div>
</footer>
${zapLink ? `<a class="zap-flut" href="${esc(zapLink)}" target="_blank" rel="noopener" aria-label="Conversar no WhatsApp">${ico("zap")}</a>` : ""}
${Medicao.aviso(nonce)}`;
}

/* ------------------------------------------------------------- JSON-LD
   LocalBusiness com o que a busca local usa para decidir quem aparece:
   endereço, geo, telefone, horário (só se entendido com segurança), serviços
   e área atendida.

   SEM aggregateRating, de propósito: nota do próprio negócio publicada na
   própria página é "self-serving review" — o Google não mostra estrela para
   isso desde 2019. O lugar das estrelas é o Perfil da Empresa no Google. */
function jsonldEmpresa() {
  const c = casa();
  const servicos = Q.todos("SELECT slug, titulo, resumo FROM servicos WHERE ativo = 1 ORDER BY ordem, id");
  const r = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": SITE() + "/#empresa",
    name: c.nome,
    alternateName: "Corte Sam - Corte e Modelagem",
    legalName: c.razao || undefined,
    slogan: c.lema || undefined,
    url: SITE() + "/",
    logo: absoluto("/assets/img/logo.png"),
    image: [absoluto("/assets/img/og.png")],
    description: semHtml(txt("seo.descricao")),
    foundingDate: c.desde || undefined,
    telephone: c.whatsapp ? "+55 " + U.telefoneBonito(c.whatsapp) : undefined,
    email: c.email || undefined,
    taxID: c.cnpj || undefined,
    paymentAccepted: c.pagamento || undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: c.logradouro,
      addressLocality: c.cidade,
      addressRegion: c.uf,
      postalCode: c.cep || undefined,
      addressCountry: "BR",
    },
    hasMap: c.gLink || linkMaps(c),
    areaServed: [
      { "@type": "City", name: "Caruaru" },
      { "@type": "City", name: "Toritama" },
      { "@type": "City", name: "Santa Cruz do Capibaribe" },
      { "@type": "AdministrativeArea", name: "Agreste de Pernambuco" },
    ],
    knowsAbout: ["Corte de tecidos", "Enfesto", "Risco e encaixe", "Modelagem de roupas", "Confecção"],
    hasOfferCatalog: servicos.length ? {
      "@type": "OfferCatalog", name: "Serviços de corte",
      itemListElement: servicos.map((s) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: s.titulo, description: semHtml(s.resumo) || undefined, url: absoluto(`/servicos/${s.slug}/`) } })),
    } : undefined,
    potentialAction: { "@type": "ReserveAction", target: absoluto("/agendamento/"), name: "Agendar corte" },
    sameAs: [c.instagram, c.facebook, c.gLink].filter(Boolean),
  };
  if (c.lat && c.lng) r.geo = { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lng };
  const h = horarioEstruturado(c.horario);
  if (h) r.openingHoursSpecification = h;
  return r;
}

function jsonldTrilha(itens) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: itens.map(([nome, url], i) => ({ "@type": "ListItem", position: i + 1, name: nome, item: absoluto(url) })),
  };
}

/* O JSON dentro de <script> não pode conter "</" — um texto do painel com
   "</script>" fecharia a tag e o resto viraria HTML executado. */
const jsonSeguro = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

/* ------------------------------------------------------------- a página */
function pagina({ titulo, descricao, caminho = "/", corpo, jsonld = [], imagem, classe = "", nonce, semIndice = false, tipoOg = "website", host = "", semChamada = false }) {
  const c = casa();
  const tituloFinal = titulo ? `${titulo} · ${c.nome}` : `${c.nome} · Corte de tecidos e modelagem em Caruaru-PE`;
  const desc = semHtml(descricao || txt("seo.descricao")).slice(0, 170);
  const canon = SITE() + caminho;
  const og = absoluto(imagem || "/assets/img/og.png");
  const fora = semIndice || !indexavel() || hostDeTrabalho(host);
  const robots = fora ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1";
  const verificacao = semHtml(txt("medicao.search_console"));
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<script nonce="${nonce}">document.documentElement.classList.add("js");setTimeout(function(){if(!window.__corteSamOk)document.documentElement.classList.remove("js")},2500);</script>
<title>${esc(tituloFinal)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${esc(canon)}">
<meta name="theme-color" content="#0A1A3F">
<meta property="og:type" content="${tipoOg}">
<meta property="og:site_name" content="${esc(c.nome)}">
<meta property="og:title" content="${esc(titulo || c.nome + " · Corte de tecidos em Caruaru")}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canon)}">
<meta property="og:image" content="${esc(og)}">
<meta property="og:image:alt" content="${esc(c.nome)} — ${esc(c.lema)}">
<meta property="og:locale" content="pt_BR">
<meta name="twitter:card" content="summary_large_image">
<meta name="geo.region" content="BR-PE">
<meta name="geo.placename" content="${esc(c.cidade)}">
${c.lat && c.lng ? `<meta name="geo.position" content="${c.lat};${c.lng}"><meta name="ICBM" content="${c.lat}, ${c.lng}">` : ""}
${verificacao && /^[\w-]{10,80}$/.test(verificacao) ? `<meta name="google-site-verification" content="${esc(verificacao)}">` : ""}
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/assets/img/marca.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/img/icone-180.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/assets/fonts/anybody.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/figtree.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/plex-mono-500.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/fonts/fontes.css?v=${VERSAO}">
<link rel="stylesheet" href="/assets/css/site.css?v=${VERSAO}">
${[jsonldEmpresa(), ...jsonld].map((j) => `<script type="application/ld+json">${jsonSeguro(j)}</script>`).join("\n")}
${Medicao.cabeca(nonce)}
</head>
<body class="${esc(classe)}">
${cabecalho(caminho)}
<main id="conteudo">
${corpo}
</main>
${rodape(nonce, { semChamada })}
<script src="/assets/js/site.js?v=${VERSAO}" defer></script>
</body>
</html>`;
}

/* Selo do Google: link para a ficha, com a nota SE o dono preencheu. */
function seloGoogle({ classe = "" } = {}) {
  const c = casa();
  if (!c.gLink) return "";
  const nota = c.gNota
    ? `<span class="selo-google__nota">${ico("estrela")} ${esc(c.gNota)}</span><span>no Google${c.gTotal ? ` · ${esc(c.gTotal)} avaliações` : ""}</span>`
    : `<span>Ver a Corte Sam no Google</span>`;
  return `<a class="selo-google ${classe}" href="${esc(c.gLink)}" target="_blank" rel="noopener">${ico("google")}${nota}</a>`;
}

module.exports = {
  pagina, casa, foto, ico, simbolo, tituloRico, seloGoogle, linkMaps, mapaEmbutido, linhasHorario,
  jsonldTrilha, jsonSeguro, SITE, absoluto, indexavel, hostDeTrabalho, horarioEstruturado, MENU, VERSAO, MSG_ZAP,
};
