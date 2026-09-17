"use strict";
/* ==========================================================================
   PROVAS — Corte Sam

   Sobe o servidor DE VERDADE num banco descartável (CORTESAM_DADOS numa pasta
   temporária) e pede o que o visitante, o Google, o robô de spam, o dono e o
   redator pedem. Nada aqui toca em data/ do projeto.

   Roda como se fosse o site DEFINITIVO (CORTESAM_SITE=https://www.cortesam.com.br,
   indexável): é o modo em que um erro de SEO custa caro. O endereço de
   trabalho é provado pelo cabeçalho Host.

   Uso:  node testes/provar.cjs
   ========================================================================== */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const vm = require("node:vm");
const crypto = require("node:crypto");

const RAIZ = path.join(__dirname, "..");
const PORTA = Number(process.env.CORTESAM_PORTA_PROVAS) || 5238;
const B = `http://127.0.0.1:${PORTA}`;
const SITE = "https://www.cortesam.com.br";
const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "cortesam-provas-"));
const UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), "cortesam-uploads-"));
const DADOS_UNIT = fs.mkdtempSync(path.join(os.tmpdir(), "cortesam-unit-"));
const SEGREDO = crypto.randomBytes(32).toString("hex");
const SENHA_INICIAL = "Inicial-Prova-2026";
const VERSAO = require("../package.json").version;

/* Os módulos puros rodam NESTE processo, com o mesmo segredo do servidor
   (é o que permite assinar uma ficha de formulário "velha" de 5 s). */
process.env.CORTESAM_DADOS = DADOS_UNIT;
process.env.CORTESAM_SEGREDO = SEGREDO;
process.env.CORTESAM_SITE = SITE;
process.env.CORTESAM_INDEXAR = "sim";

let ok = 0; const falhas = [];
function certo(nome, cond, detalhe = "") {
  if (cond) { ok++; console.log(`  ✔ ${nome}`); }
  else { falhas.push(nome); console.log(`  ✖ ${nome}${detalhe !== "" ? `\n      ${String(detalhe).slice(0, 500)}` : ""}`); }
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(metodo, caminho, { corpo, cookie, json = true, form = false, cab = {} } = {}) {
  const headers = { ...cab };
  if (cookie) headers.Cookie = cookie;
  let body;
  if (corpo !== undefined) {
    if (form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(corpo).toString(); }
    else { headers["Content-Type"] = "application/json"; body = JSON.stringify(corpo); }
  }
  if (json) headers.Accept = headers.Accept || "application/json";
  const r = await fetch(B + caminho, { method: metodo, headers, body, redirect: "manual" });
  const texto = await r.text();
  let j = null; try { j = JSON.parse(texto); } catch { }
  return { status: r.status, j: j || {}, texto, cab: r.headers };
}
const pagina = (c) => pedir("GET", c, { json: false });
/* fetch não deixa trocar o Host; http.request deixa. */
function comHost(caminho, host) {
  return new Promise((ok, erro) => {
    http.get({ host: "127.0.0.1", port: PORTA, path: caminho, headers: { Host: host } }, (r) => {
      let t = ""; r.setEncoding("utf8"); r.on("data", (d) => (t += d)); r.on("end", () => ok({ status: r.statusCode, texto: t, cab: r.headers }));
    }).on("error", erro);
  });
}
const jsonld = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

let servidor, log = "";
function subir() {
  servidor = spawn(process.execPath, ["server.js"], {
    cwd: RAIZ,
    env: { ...process.env, PORT: String(PORTA), CORTESAM_DADOS: DADOS, CORTESAM_UPLOADS: UPLOADS, CORTESAM_SENHA_INICIAL: SENHA_INICIAL,
      CORTESAM_FREIO: "1000", CORTESAM_SITE: SITE, CORTESAM_INDEXAR: "sim", CORTESAM_SMTP: "", CORTESAM_SEGREDO: SEGREDO },
  });
  servidor.stdout.on("data", (d) => (log += d));
  servidor.stderr.on("data", (d) => (log += d));
}
async function esperarSubir() {
  for (let i = 0; i < 75; i++) { try { const r = await fetch(B + "/saude"); if (r.status === 200) return true; } catch { } await esperar(200); }
  return false;
}
function derrubar() {
  return new Promise((r) => { if (!servidor || servidor.exitCode !== null) return r(); servidor.once("exit", r); servidor.kill(); });
}

/* Datas úteis, no fuso da casa. */
const U = require("../src/util");
const HOJE = U.hojeLocal();
function proximoDia(semana, aPartir = 1) {   // 0 = domingo … 6 = sábado
  for (let i = aPartir; i < aPartir + 8; i++) {
    const d = U.somarDias(HOJE, i);
    if (new Date(d + "T12:00:00Z").getUTCDay() === semana) return d;
  }
}

(async () => {
  /* =============================================== unidades (sem servidor) */
  console.log("\n— peças puras");
  const L = require("../src/layout");
  const F = require("../src/formularios");
  const Calc = require("../src/calculo");
  const h1 = L.horarioEstruturado("Segunda a sexta · 8h às 12h\nSegunda a sexta · 14h às 18h");
  certo("horário do cartaz vira 2 faixas de seg a sex (08:00–12:00 e 14:00–18:00)",
    h1 && h1.length === 2 && h1[0].dayOfWeek.join() === "Monday,Tuesday,Wednesday,Thursday,Friday" && h1[0].opens === "08:00" && h1[0].closes === "12:00" && h1[1].opens === "14:00" && h1[1].closes === "18:00", JSON.stringify(h1));
  certo("\"Sábado · 08:00 às 11:30\" vira só sábado", JSON.stringify(L.horarioEstruturado("Sábado · 08:00 às 11:30")) === JSON.stringify([{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Saturday"], opens: "08:00", closes: "11:30" }]));
  certo("horário que não se entende NÃO vai ao Google (nunca um horário chutado)", L.horarioEstruturado("Depende do dia") === null && L.horarioEstruturado("Segunda a sexta · 18h às 8h") === null && L.horarioEstruturado("") === null);
  certo("data impossível (31/02) é recusada e data real passa", !F.dataReal("2026-02-31") && !F.dataReal("2026-13-01") && F.dataReal("2028-02-29") && !F.dataReal("2026-02-29"));
  const agora = Date.now();
  certo("ficha do formulário: recusa < 3 s, aceita 5 s, recusa > 1 dia e assinatura adulterada",
    !F.fichaValida(F.ficha(agora - 1000), agora) && F.fichaValida(F.ficha(agora - 5000), agora) && !F.fichaValida(F.ficha(agora - 25 * 3600e3), agora) && !F.fichaValida(F.ficha(agora - 5000).replace(/.$/, (c) => (c === "A" ? "B" : "A")), agora));
  certo("freio por IP: o 7º envio na hora é barrado, outro IP passa", (() => {
    for (let i = 0; i < 6; i++) if (F.freado("9.9.9.9", 6, 3600e3, agora)) return false;
    return F.freado("9.9.9.9", 6, 3600e3, agora) && !F.freado("8.8.8.8", 6, 3600e3, agora);
  })());
  const r1 = Calc.calcular(Calc.ler({ comprimento: "2,40", folhas: "40", pecas_risco: "6", largura: "1,8", gramatura: "160" }).valores);
  certo("calculadora: 2,40 m × 40 folhas + 2 cm por ponta = 97,60 m, 240 peças, 28,11 kg", r1.metros === 97.6 && r1.metros_folha === 2.44 && r1.pecas === 240 && r1.kg === 28.11 && r1.metros_peca === 0.407, JSON.stringify(r1));
  const rs = Calc.calcular(Calc.ler({ comprimento: "1", folhas: "10", folga: "0", sobra: "10" }).valores);
  certo("calculadora: sobra de 10 % soma ao total (1 m × 10 folhas = 11 m)", rs.metros === 11, JSON.stringify(rs));
  const lixo = Calc.ler({ comprimento: "abc", folhas: "2.5", gramatura: "9999" });
  certo("calculadora recusa texto, folha fracionada e gramatura absurda", lixo.erros.comprimento && lixo.erros.folhas && lixo.erros.gramatura);
  /* A mesma conta mora no site.js (resultado ao vivo). Se um lado mudar
     sozinho, o visitante vê um número na tela e outro ao recarregar. */
  const janela = { matchMedia: () => ({ matches: false }), document: { documentElement: { classList: { add() {} } } } };
  const ctx = { window: janela, document: janela.document, requestAnimationFrame: () => 0, setTimeout: () => 0, navigator: {}, IntersectionObserver: undefined };
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "assets/js/site.js"), "utf8"), ctx);
  const noSite = janela.__corteSamCalc;
  let iguais = !!noSite, exemplo = "";
  for (let i = 0; i < 400 && iguais; i++) {
    const b = { comprimento: (Math.random() * 12).toFixed(2).replace(".", ","), folhas: String(1 + Math.floor(Math.random() * 300)), pecas_risco: Math.random() < .5 ? "" : String(1 + Math.floor(Math.random() * 20)),
      folga: String(Math.floor(Math.random() * 6)), sobra: String(Math.floor(Math.random() * 12)), largura: Math.random() < .5 ? "" : (0.6 + Math.random() * 2).toFixed(2), gramatura: Math.random() < .5 ? "" : String(80 + Math.floor(Math.random() * 400)) };
    const a = Calc.ler(b), c = noSite.ler(b);
    const ra = Object.keys(a.erros).length ? "erro" : JSON.stringify(Calc.calcular(a.valores));
    const rc = Object.keys(c.erros).length ? "erro" : JSON.stringify(noSite.calcular(c.valores));
    if (ra !== rc) { iguais = false; exemplo = `${JSON.stringify(b)} → servidor ${ra} × site.js ${rc}`; }
  }
  certo("a calculadora do site.js dá o MESMO resultado do servidor em 400 casos sorteados", iguais, exemplo);

  /* =============================================== servidor */
  subir();
  if (!(await esperarSubir())) { console.log("O servidor não subiu:\n" + log); process.exit(1); }

  console.log("\n— o site de pé");
  const saude = await pedir("GET", "/saude");
  certo("/saude responde 200 com a versão do package.json", saude.status === 200 && saude.j.versao === VERSAO, saude.texto);
  for (const c of ["/", "/servicos/", "/servicos/corte-de-tecidos/", "/servicos/corte-de-modelos/", "/servicos/modelagem/", "/agendamento/", "/calculadora-de-enfesto/", "/sobre/", "/contato/", "/blog/", "/blog/o-que-e-enfesto/", "/privacidade/"]) {
    const r = await pagina(c);
    certo(`${c} responde 200`, r.status === 200, r.status);
  }
  const home = await pagina("/");
  certo("a home tem o título com \"corte de tecidos\", o CNPJ e a assinatura da LA", /<h1 class="capa__titulo">Corte de tecidos <em>certo<\/em>/.test(home.texto) && /28\.849\.360\/0001-81/.test(home.texto) && /class="dev-credit" href="https:\/\/luizaugust\.me"/.test(home.texto));
  certo("canonical e og:url absolutos no domínio definitivo", home.texto.includes(`<link rel="canonical" href="${SITE}/">`) && home.texto.includes(`<meta property="og:url" content="${SITE}/">`));
  certo("no domínio definitivo a página é indexável", /content="index, follow/.test(home.texto) && !home.cab.get("x-robots-tag"));
  const ld = jsonld(home.texto);
  const emp = ld.find((x) => x["@type"] === "LocalBusiness");
  certo("JSON-LD LocalBusiness com endereço, CEP, geo e telefone", emp && emp.address.streetAddress === "Rua 27 de Janeiro, 94" && emp.address.postalCode === "55004-470" && emp.geo && emp.geo.latitude === -8.2858682 && /99481-9330/.test(emp.telephone), JSON.stringify(emp).slice(0, 400));
  certo("JSON-LD com horário ESTRUTURADO (seg–sex, 8–12 e 14–18)", emp && Array.isArray(emp.openingHoursSpecification) && emp.openingHoursSpecification.length === 2 && emp.openingHoursSpecification[1].closes === "18:00");
  certo("JSON-LD com os 3 serviços, a área atendida (Toritama, Santa Cruz) e a ação de agendar", emp && emp.hasOfferCatalog.itemListElement.length === 3 && JSON.stringify(emp.areaServed).includes("Toritama") && JSON.stringify(emp.areaServed).includes("Santa Cruz do Capibaribe") && /\/agendamento\/$/.test(emp.potentialAction.target));
  certo("SEM aggregateRating (self-serving review) e sem preço inventado", !/aggregateRating/.test(home.texto) && !/R\$\s?30/.test(home.texto) && !/10% ?OFF/i.test(home.texto));
  const faqLd = ld.find((x) => x["@type"] === "FAQPage");
  certo("toda pergunta do FAQPage está NA TELA", faqLd && faqLd.mainEntity.length >= 5 && faqLd.mainEntity.every((q) => home.texto.includes(q.name)));
  certo("depoimentos: tabela vazia = seção ausente (nada de depoimento inventado)", !/class="secao secao--papel depoimentos"/.test(home.texto));
  certo("o botão de WhatsApp usa o número da oficina", /https:\/\/wa\.me\/5581994819330/.test(home.texto));
  certo("os 3 textos do blog aparecem na home", /O que é enfesto/.test(home.texto) && /Risco e encaixe/.test(home.texto) && /checklist da confecção/.test(home.texto));
  certo("a seção do processo usa fotos REAIS da oficina", (home.texto.match(/\/assets\/img\/oficina\/(risco-encaixe|enfesto-rolo|corte-malha|pecas-cortadas)\.webp/g) || []).length >= 4);
  certo("imagens com largura e altura declaradas (sem pulo de layout)", [...home.texto.matchAll(/<img [^>]*>/g)].every((m) => /width="\d+" height="\d+"/.test(m[0])), [...home.texto.matchAll(/<img [^>]*>/g)].map((m) => m[0]).filter((t) => !/width=/.test(t)).slice(0, 2).join("\n"));
  certo("só a foto da capa tem prioridade alta; o resto é lazy", (home.texto.match(/fetchpriority="high"/g) || []).length === 2 && /loading="lazy"/.test(home.texto));
  for (const [arq, onde] of [...home.texto.matchAll(/(?:src|href)="(\/assets\/[^"?]+)/g)].map((m) => [m[1], "home"]).slice(0, 60)) {
    if (!fs.existsSync(path.join(RAIZ, arq))) certo(`arquivo citado na ${onde} existe: ${arq}`, false);
  }
  certo("todo arquivo de /assets citado na home existe no disco", [...home.texto.matchAll(/(?:src|href)="(\/assets\/[^"?]+)/g)].every((m) => fs.existsSync(path.join(RAIZ, m[1]))));
  const srcsets = [...home.texto.matchAll(/srcset="([^"]+)"/g)].flatMap((m) => m[1].split(",").map((s) => s.trim().split(" ")[0]));
  certo("toda largura do srcset existe no disco", srcsets.length > 0 && srcsets.every((s) => fs.existsSync(path.join(RAIZ, s))), srcsets.filter((s) => !fs.existsSync(path.join(RAIZ, s))).join(", "));
  certo("o mapa do Google NÃO carrega sozinho", !/<iframe/.test((await pagina("/contato/")).texto) && /data-carregar-mapa/.test((await pagina("/contato/")).texto));

  console.log("\n— serviços e redirecionamentos");
  const sv = await pagina("/servicos/corte-de-tecidos/");
  const svLd = jsonld(sv.texto);
  certo("página do serviço com JSON-LD Service ligado à empresa e trilha", svLd.some((x) => x["@type"] === "Service" && x.provider["@id"] === `${SITE}/#empresa`) && svLd.some((x) => x["@type"] === "BreadcrumbList" && x.itemListElement.length === 3));
  certo("o título do serviço tem a cidade (busca local)", /<title>Corte de tecidos em Caruaru · Corte Sam<\/title>/.test(sv.texto));
  certo("serviço inexistente dá 404", (await pagina("/servicos/nao-existe/")).status === 404);
  const semBarra = await pagina("/servicos");
  certo("/servicos → /servicos/ (301)", semBarra.status === 301 && semBarra.cab.get("location") === "/servicos/");
  const semBarraPost = await pagina("/blog/o-que-e-enfesto");
  certo("/blog/<slug> → /blog/<slug>/ (301)", semBarraPost.status === 301 && semBarraPost.cab.get("location") === "/blog/o-que-e-enfesto/");
  const antigo = await pagina("/orcamento/");
  certo("endereços prováveis do site antigo levam ao lugar novo (/orcamento/ → /agendamento/)", antigo.status === 301 && antigo.cab.get("location") === "/agendamento/");
  certo("página inexistente: 404 com noindex", await (async () => { const r = await pagina("/nao-tem"); return r.status === 404 && /noindex/.test(r.texto); })());

  console.log("\n— SEO de máquina");
  const robots = (await pagina("/robots.txt")).texto;
  certo("robots.txt com UM grupo, painel e API fora, sitemap absoluto", (robots.match(/User-agent:/g) || []).length === 1 && /Disallow: \/admin\//.test(robots) && /Disallow: \/api\//.test(robots) && robots.includes(`Sitemap: ${SITE}/sitemap.xml`), robots);
  /* Disallow é PREFIXO: um "Disallow: /agendamento" tiraria a página de
     agendamento inteira do Google (lição do Alafcell). Prova com startsWith. */
  const proibidos = [...robots.matchAll(/^Disallow: (.+)$/gm)].map((m) => m[1].trim());
  const sitemap = (await pagina("/sitemap.xml")).texto;
  const noMapa = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(SITE, ""));
  certo("nenhuma página do sitemap é bloqueada pelo robots (Disallow é prefixo)", noMapa.length > 0 && noMapa.every((c) => !proibidos.some((p) => c.startsWith(p))), noMapa.filter((c) => proibidos.some((p) => c.startsWith(p))).join(", "));
  certo("sitemap com as páginas fixas, os 3 serviços e os 3 textos", ["/", "/servicos/", "/agendamento/", "/calculadora-de-enfesto/", "/blog/", "/servicos/corte-de-tecidos/", "/servicos/modelagem/", "/blog/o-que-e-enfesto/"].every((c) => noMapa.includes(c)), noMapa.join(" "));
  const llms = (await pagina("/llms.txt")).texto;
  certo("llms.txt com endereço, horário, serviços e a fórmula da calculadora", /Rua 27 de Janeiro, 94/.test(llms) && /8h às 12h/.test(llms) && /\[Corte de tecidos\]/.test(llms) && /gramatura/.test(llms) && !/undefined|null/.test(llms), llms.slice(0, 300));
  const mani = await pedir("GET", "/manifest.webmanifest");
  certo("manifesto com ícones que existem", mani.j.icons && mani.j.icons.every((i) => fs.existsSync(path.join(RAIZ, i.src))));
  /* O endereço de trabalho não pode concorrer com o site no Google, mesmo
     quando o mesmo processo responde pelos dois nomes. */
  const trab = await comHost("/", "cortesam.projetos.luizaugust.me");
  certo("pelo host de trabalho: noindex na página e no cabeçalho", /content="noindex, nofollow"/.test(trab.texto) && /noindex/.test(trab.cab["x-robots-tag"] || ""));
  const robTrab = await comHost("/robots.txt", "cortesam.projetos.luizaugust.me");
  certo("pelo host de trabalho: robots.txt fecha tudo", /Disallow: \/\s*$/.test(robTrab.texto) && !/Sitemap/.test(robTrab.texto), robTrab.texto);
  const calcComParam = await pagina("/calculadora-de-enfesto/?comprimento=2,4&folhas=40&largura=1,8&gramatura=160");
  certo("calculadora sem JavaScript: o servidor devolve 97,60 m e 28,11 kg", /97,60/.test(calcComParam.texto) && /28,11/.test(calcComParam.texto));
  certo("calculadora com parâmetros: noindex (evita mil páginas iguais) e canonical limpo", /content="noindex/.test(calcComParam.texto) && calcComParam.texto.includes(`<link rel="canonical" href="${SITE}/calculadora-de-enfesto/">`));
  certo("calculadora sem parâmetros: indexável", /content="index, follow/.test((await pagina("/calculadora-de-enfesto/")).texto));
  const calcXss = await pagina("/calculadora-de-enfesto/?comprimento=%22%3E%3Cscript%3Ealert(1)%3C/script%3E");
  certo("calculadora não devolve o parâmetro cru (XSS)", !/<script>alert\(1\)<\/script>/.test(calcXss.texto));

  console.log("\n— segurança do que é servido");
  const csp = home.cab.get("content-security-policy") || "";
  const nonce = (/'nonce-([^']+)'/.exec(csp) || [])[1];
  certo("CSP com nonce, e o script inline usa ESSE nonce", nonce && home.texto.includes(`<script nonce="${nonce}">`), csp);
  certo("CSP sem 'unsafe-inline' em script e sem terceiros quando não há medição", !/script-src[^;]*unsafe-inline/.test(csp) && !/googletagmanager|facebook/.test(csp));
  certo("X-Frame-Options DENY, nosniff e Permissions-Policy fechada", home.cab.get("x-frame-options") === "DENY" && home.cab.get("x-content-type-options") === "nosniff" && /camera=\(\)/.test(home.cab.get("permissions-policy") || ""));
  certo("sem GA4/Pixel configurados, nem a faixa de cookies aparece", !/id="consent"/.test(home.texto));
  for (const c of ["/server.js", "/package.json", "/src/db.js", "/data/site.db", "/assets/../server.js", "/assets/%2e%2e/server.js", "/admin/../server.js", "/testes/provar.cjs", "/.env", "/assets/server.js", "/assets/src/db.js", "/admin/admin.css/../../server.js", "/assets/img/uploads/../../../server.js", "/ferramentas/marca.cjs", "/IDENTIDADE.md"]) {
    const r = await pagina(c);
    certo(`${c} NÃO é servido`, r.status === 404 || r.status === 400, r.status);
  }
  /* fetch (e o próprio `new URL`) NORMALIZAM "%2e%2e": a travessia de pasta de
     verdade chega com a BARRA codificada, que só vira "/" no decodeURIComponent
     do servidor — e no Windows a contrabarra também separa pasta. Pedido cru. */
  for (const c of ["/assets/..%2fserver.js", "/assets/..%2f..%2fCorte-Sam%2fserver.js", "/assets/img/..%2f..%2fserver.js", "/admin/..%2fserver.js", "/assets/..%5cserver.js", "/assets/img/uploads/..%2f..%2f..%2fserver.js"]) {
    const r = await comHost(c, "127.0.0.1");
    certo(`${c} (barra codificada, pedido cru) NÃO é servido`, r.status === 404 || r.status === 400, r.status);
  }
  certo("/assets/css/site.css é servido", (await pagina("/assets/css/site.css")).status === 200);
  const svg = await pagina("/assets/img/marca.svg");
  certo("SVG servido com CSP própria em sandbox (SVG executa script)", svg.status === 200 && /sandbox/.test(svg.cab.get("content-security-policy") || ""));
  const comp = await fetch(B + "/", { headers: { "Accept-Encoding": "br, gzip" } });
  certo("o HTML sai comprimido quando o navegador aceita", /^(br|gzip)$/.test(comp.headers.get("content-encoding") || "") && /Accept-Encoding/.test(comp.headers.get("vary") || ""));
  const adm = await pagina("/admin/");
  certo("/admin/ com noindex, no-store e CSP sem iframe", adm.status === 200 && /noindex/.test(adm.cab.get("x-robots-tag") || "") && /no-store/.test(adm.cab.get("cache-control") || "") && /frame-src 'none'/.test(adm.cab.get("content-security-policy") || ""));
  /* Escape "barra-u-zeros" escrito por ferramenta vira o BYTE de controle no arquivo:
     invisível no editor, e o git passa a tratar o arquivo como binário. */
  const fontes = ["server.js", ...fs.readdirSync(path.join(RAIZ, "src")).map((f) => "src/" + f), "assets/js/site.js", "admin/admin.js", "assets/css/site.css", "admin/admin.css", "testes/provar.cjs", "ferramentas/marca.cjs"];
  const sujos = fontes.filter((f) => /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(fs.readFileSync(path.join(RAIZ, f), "utf8")));
  certo("nenhum arquivo de código tem byte de controle cru", sujos.length === 0, sujos.join(", "));
  /* Script de shell com CRLF chega ao servidor como "interpretador não
     encontrado"; e o fim de linha misturado faz sabotagem e diff mentirem. */
  const comCr = [...fontes, "criar-site.sh", "deploy.sh", "verificar.sh", "operacao/cortesam.service", "operacao/cortesam-backup.service", "operacao/cortesam-backup.timer"]
    .filter((f) => fs.readFileSync(path.join(RAIZ, f), "utf8").includes(String.fromCharCode(13)));
  certo("código e scripts com fim de linha LF (sem CRLF)", comCr.length === 0, comCr.join(", "));

  console.log("\n— a unidade do systemd");
  /* Instalação nova: `data/` não vem no git, o /var/www é só-leitura dentro do
     namespace (ProtectSystem=strict) e um ReadWritePaths com `-` é IGNORADO
     quando a pasta falta — o servidor morria em laço, com ENOENT no mkdir e
     mensagem que fala de arquivo ausente, não de permissão. Quem cria as
     pastas é o ExecStartPre com `+` (fora do sandbox, como root). */
  const unidade = fs.readFileSync(path.join(RAIZ, "operacao", "cortesam.service"), "utf8");
  const PASTAS = ["data", "assets/img/uploads", "backups"];
  const antesDeSubir = unidade.split("\n").filter((l) => l.startsWith("ExecStartPre="));
  certo("a unidade cria as pastas de escrita antes do namespace (ExecStartPre com +)",
    antesDeSubir.length >= 2 && antesDeSubir.every((l) => l.startsWith("ExecStartPre=+")) && /\bmkdir -p\b/.test(antesDeSubir[0]) && PASTAS.every((d) => antesDeSubir[0].includes("/Corte-Sam/" + d)), antesDeSubir.join(" | "));
  certo("…e devolve a posse ao usuário do serviço", antesDeSubir.some((l) => /chown deploy:deploy/.test(l) && PASTAS.every((d) => l.includes("/Corte-Sam/" + d))));
  certo("toda pasta de escrita está em ReadWritePaths", PASTAS.every((d) => unidade.includes("ReadWritePaths=-/var/www/projetos/Corte-Sam/" + d)));
  /* O comentário CITA a trava (é a lição do Kenósis); o que não pode existir é
     a diretiva de verdade — por isso a busca ignora as linhas de comentário. */
  const diretivas = unidade.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
  certo("a unidade NÃO tem MemoryDenyWriteExecute (mata o V8 com 5/TRAP)", !diretivas.some((l) => /^MemoryDenyWriteExecute/.test(l.trim())));
  certo("StartLimitIntervalSec no [Unit], não no [Service] (no lugar errado o systemd ignora)", /\[Unit\][\s\S]*StartLimitIntervalSec=0[\s\S]*\[Service\]/.test(unidade));
  certo("o deploy.sh também cria as três pastas", PASTAS.every((d) => fs.readFileSync(path.join(RAIZ, "deploy.sh"), "utf8").includes(`"$RAIZ/${d}"`)));

  console.log("\n— agendamento pelo site");
  const segunda = proximoDia(1, 2);
  const sabado = proximoDia(6, 1);
  const fichaVelha = () => F.ficha(Date.now() - 5000);
  const base = { nome: "ZZ Prova Agendamento", empresa: "ZZ Confecção", telefone: "(81) 98888-7777", servico: "Corte de tecidos", tecido: "Malha", pecas: "240", data: segunda, horario: "09:00", observacoes: "40 folhas", _t: fichaVelha(), site: "" };
  const agOk = await pedir("POST", "/agendamento", { corpo: base, form: true });
  certo("agendamento válido: 201 com código e link de confirmação assinado", agOk.status === 201 && /^[A-Z2-9]{6}$/.test(agOk.j.codigo) && /\/agendamento\/recebido\/\?c=/.test(agOk.j.confirmacao), agOk.texto);
  certo("o botão de WhatsApp da confirmação leva o código", decodeURIComponent(agOk.j.zap || "").includes(agOk.j.codigo || "§"));
  const rec = await pagina(agOk.j.confirmacao || "/x");
  certo("a página de confirmação mostra o código e é noindex", rec.status === 200 && rec.texto.includes(agOk.j.codigo) && /noindex/.test(rec.texto));
  certo("confirmação com assinatura falsa dá 404 (ninguém lista os pedidos alheios)", (await pagina(`/agendamento/recebido/?c=${agOk.j.codigo}&t=AAAAAAAAAAAAAAAAAAAAAA`)).status === 404);
  const fds = await pedir("POST", "/agendamento", { corpo: { ...base, data: sabado, _t: fichaVelha() }, form: true });
  certo("sábado é recusado (dias sem atendimento)", fds.status === 422 && /não atende/.test(fds.j.erros?.data || ""), fds.texto);
  const hoje = await pedir("POST", "/agendamento", { corpo: { ...base, data: HOJE, _t: fichaVelha() }, form: true });
  certo("agendar para hoje é recusado (a oficina precisa confirmar)", hoje.status === 422 && hoje.j.erros?.data, hoje.texto);
  const foraLista = await pedir("POST", "/agendamento", { corpo: { ...base, horario: "12:30", _t: fichaVelha() }, form: true });
  certo("horário fora da lista (12:30, almoço) é recusado", foraLista.status === 422 && foraLista.j.erros?.horario, foraLista.texto);
  const dataRuim = await pedir("POST", "/agendamento", { corpo: { ...base, data: "2027-02-31", _t: fichaVelha() }, form: true });
  certo("data impossível é recusada", dataRuim.status === 422 && dataRuim.j.erros?.data);
  const rapido = await pedir("POST", "/agendamento", { corpo: { ...base, _t: F.ficha(Date.now()) }, form: true });
  certo("envio em menos de 3 s (robô) é recusado", rapido.status === 400, rapido.texto);
  const armadilha = await pedir("POST", "/agendamento", { corpo: { ...base, nome: "ZZ Robo Armadilha", site: "http://spam", _t: fichaVelha() }, form: true });
  certo("campo-armadilha preenchido: finge sucesso e NÃO grava", armadilha.status === 200 && armadilha.j.ok && !armadilha.j.codigo);
  const origem = await pedir("POST", "/agendamento", { corpo: { ...base, _t: fichaVelha() }, form: true, cab: { Origin: "https://site-malicioso.example" } });
  certo("POST com Origin de outro site é recusado", origem.status === 403);
  const semJs = await pedir("POST", "/agendamento", { corpo: { ...base, nome: "ZZ Sem JS", _t: fichaVelha() }, form: true, json: false });
  certo("sem JavaScript: sucesso vira 303 para a confirmação", semJs.status === 303 && /^\/agendamento\/recebido\/\?c=/.test(semJs.cab.get("location") || ""), semJs.status);
  const semJsErro = await pedir("POST", "/agendamento", { corpo: { ...base, telefone: "12", _t: fichaVelha() }, form: true, json: false });
  certo("sem JavaScript: erro mostra a mensagem e o caminho de volta", semJsErro.status === 422 && /WhatsApp com DDD/.test(semJsErro.texto) && /href="\/agendamento\/"/.test(semJsErro.texto));
  const xss = await pedir("POST", "/agendamento", { corpo: { ...base, nome: "ZZ <img src=x onerror=alert(1)>", observacoes: "<script>alert(1)</script>", _t: fichaVelha() }, form: true });
  certo("HTML enviado no formulário é limpo antes de gravar", xss.status === 201);
  const pre = await pagina("/agendamento/?origem=calculadora&folhas=40&metros=97.6&pecas=240&servico=Corte%20de%20tecidos");
  certo("vindo da calculadora: o formulário chega preenchido (peças, serviço, observação)", /name="pecas"[^>]*value="240"/.test(pre.texto) && /<option selected>Corte de tecidos<\/option>/.test(pre.texto) && /40 folhas, cerca de 97,6 m/.test(pre.texto) && /name="origem" value="calculadora"/.test(pre.texto));
  const preXss = await pagina("/agendamento/?metros=%3Cscript%3E&folhas=1&pecas=%3Cb%3E");
  certo("parâmetros da calculadora não viram HTML (XSS)", !/<script>/.test(preXss.texto.split("<body")[1].replace(/<script[^>]*src=[^>]*><\/script>|<script nonce=[\s\S]*?<\/script>|<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "")));
  const contato = await pedir("POST", "/contato", { corpo: { nome: "ZZ Contato", contato: "zz@exemplo.com", assunto: "Teste", mensagem: "Mensagem de prova", _t: fichaVelha() }, form: true });
  certo("mensagem de contato válida: 201", contato.status === 201, contato.texto);

  console.log("\n— painel: entrada e senha");
  const errado = await pedir("POST", "/api/admin/entrar", { corpo: { usuario: "admin", senha: "errada-123" } });
  certo("senha errada: 401 com mensagem que não diz qual dos dois errou", errado.status === 401 && errado.j.erro === "Usuário ou senha incorretos.");
  const inexistente = await pedir("POST", "/api/admin/entrar", { corpo: { usuario: "nao-existe", senha: "errada-123" } });
  certo("usuário inexistente: a MESMA resposta", inexistente.status === 401 && inexistente.j.erro === errado.j.erro);
  /* O freio de senha empurra a próxima tentativa (1 s, 2 s…) depois de cada
     erro — é ele funcionando. A prova espera como uma pessoa esperaria. */
  const freiou = await pedir("POST", "/api/admin/entrar", { corpo: { usuario: "admin", senha: SENHA_INICIAL } });
  certo("logo depois de dois erros, o freio pede espera (429)", freiou.status === 429, freiou.texto);
  await esperar(4500);
  const entrou = await pedir("POST", "/api/admin/entrar", { corpo: { usuario: "admin", senha: SENHA_INICIAL } });
  const setCookie = entrou.cab.get("set-cookie") || "";
  let cookie = (/cortesam_sessao=[^;]+/.exec(setCookie) || [""])[0];
  certo("entrada com a senha inicial: cookie HttpOnly e SameSite=Lax, pede troca", entrou.status === 200 && entrou.j.trocar_senha === true && /HttpOnly/.test(setCookie) && /SameSite=Lax/.test(setCookie) && cookie, entrou.texto + " " + setCookie);
  certo("com senha provisória, o painel NÃO abre nada além da troca", (await pedir("GET", "/api/admin/painel", { cookie })).status === 403 && (await pedir("GET", "/api/admin/eu", { cookie })).status === 200);
  certo("senha fraca é recusada", (await pedir("POST", "/api/admin/senha", { cookie, corpo: { atual: SENHA_INICIAL, nova: "12345678" } })).status === 400);
  certo("troca de senha com a atual errada é recusada", (await pedir("POST", "/api/admin/senha", { cookie, corpo: { atual: "outra-coisa-1", nova: "Nova-Senha-Forte-9" } })).status === 400);
  const troca = await pedir("POST", "/api/admin/senha", { cookie, corpo: { atual: SENHA_INICIAL, nova: "Nova-Senha-Forte-9" } });
  certo("troca de senha válida", troca.status === 200, troca.texto);
  const painel = await pedir("GET", "/api/admin/painel", { cookie });
  certo("painel abre depois da troca, com os agendamentos e as pendências", painel.status === 200 && painel.j.agenda_pendentes >= 2 && Array.isArray(painel.j.pendencias) && painel.j.pendencias.some((p) => /Perfil da Empresa no Google/.test(p.texto)), painel.texto.slice(0, 300));
  certo("POST do painel com Origin de outro site é recusado", (await pedir("PUT", "/api/admin/textos", { cookie, corpo: { valores: {} }, cab: { Origin: "https://evil.example" } })).status === 403);
  certo("sem sessão, a API responde 401", (await pedir("GET", "/api/admin/agendamentos")).status === 401);

  console.log("\n— painel: agendamentos");
  const lista = await pedir("GET", "/api/admin/agendamentos?periodo=todos", { cookie });
  const meu = (lista.j.agendamentos || []).find((a) => a.codigo === agOk.j.codigo);
  certo("o agendamento do site aparece no painel com o WhatsApp de confirmação pronto", meu && decodeURIComponent(meu.zap_confirmar).includes("CONFIRMADO") && decodeURIComponent(meu.zap_confirmar).includes(meu.codigo) && /wa\.me\/5581988887777/.test(meu.zap_confirmar));
  const limpo = (lista.j.agendamentos || []).find((a) => /^ZZ /.test(a.nome) && /img/.test(a.nome) === false && /alert/.test(a.observacoes));
  certo("o HTML do formulário foi gravado sem tag", !(lista.j.agendamentos || []).some((a) => /<img|<script/i.test(a.nome + a.observacoes)), JSON.stringify(limpo));
  certo("o campo-armadilha não gravou nada", !(lista.j.agendamentos || []).some((a) => a.nome === "ZZ Robo Armadilha"));
  const conf = await pedir("PUT", `/api/admin/agendamentos/${meu && meu.id}`, { cookie, corpo: { status: "confirmado", nota: "trazer o risco" } });
  certo("confirmar agendamento grava a situação e a nota", conf.status === 200 && conf.j.agendamento.status === "confirmado" && conf.j.agendamento.nota === "trazer o risco");
  certo("situação inventada é recusada", (await pedir("PUT", `/api/admin/agendamentos/${meu && meu.id}`, { cookie, corpo: { status: "pago" } })).status === 400);
  const tel = await pedir("POST", "/api/admin/agendamentos", { cookie, corpo: { nome: "ZZ Telefone", telefone: "81977776666", data: segunda, horario: "10:00" } });
  certo("agendamento por telefone entra CONFIRMADO", tel.status === 201 && (await pedir("GET", "/api/admin/agendamentos?periodo=todos&q=ZZ%20Telefone", { cookie })).j.agendamentos[0].status === "confirmado", tel.texto);
  certo("agendamento por telefone segue as regras (sábado recusado)", (await pedir("POST", "/api/admin/agendamentos", { cookie, corpo: { nome: "ZZ Sab", telefone: "81977776666", data: sabado, horario: "10:00" } })).status === 422);

  console.log("\n— painel: conteúdo");
  const svs = await pedir("GET", "/api/admin/servicos", { cookie });
  const corte = svs.j.servicos.find((s) => s.slug === "corte-de-tecidos");
  const ren = await pedir("PUT", `/api/admin/servicos/${corte.id}`, { cookie, corpo: { titulo: "Corte de tecido industrial" } });
  certo("renomear um serviço NÃO muda o endereço (o link do Google não quebra)", ren.status === 200 && ren.j.slug === "corte-de-tecidos" && /Corte de tecido industrial/.test((await pagina("/servicos/corte-de-tecidos/")).texto));
  const novoSv = await pedir("POST", "/api/admin/servicos", { cookie, corpo: { titulo: "Corte de tecidos", resumo: "Um serviço repetido para provar o endereço único.", conteudo: "<p>x</p><script>alert(1)</script>" } });
  certo("serviço com nome repetido ganha endereço próprio (-2) e perde o <script>", novoSv.status === 201 && novoSv.j.slug === "corte-de-tecidos-2" && !/<script/.test((await pagina("/servicos/corte-de-tecidos-2/")).texto.split('<article class="texto-rico">')[1]?.split("</article>")[0] || "<script"));
  const desliga = await pedir("PUT", `/api/admin/servicos/${novoSv.j.id}`, { cookie, corpo: { ativo: false } });
  certo("serviço desativado some do site (404) e do sitemap", desliga.status === 200 && (await pagina("/servicos/corte-de-tecidos-2/")).status === 404 && !/corte-de-tecidos-2/.test((await pagina("/sitemap.xml")).texto));
  certo("imagem de fora do painel é recusada no serviço", (await pedir("PUT", `/api/admin/servicos/${corte.id}`, { cookie, corpo: { imagem: "https://evil.example/x.png" } })).status === 400 && (await pedir("PUT", `/api/admin/servicos/${corte.id}`, { cookie, corpo: { imagem: "/assets/img/uploads/../../../server.js" } })).status === 400);

  const amanha = U.somarDias(HOJE, 3);
  const futuro = await pedir("POST", "/api/admin/blog", { cookie, corpo: { title: "ZZ Texto agendado", date: amanha, content: "<p>Conteúdo do texto agendado para o futuro.</p>", publicado: true } });
  certo("texto com data futura NÃO aparece ao público nem no sitemap", futuro.status === 201 && (await pagina(`/blog/${futuro.j.slug}/`)).status === 404 && !(await pagina("/sitemap.xml")).texto.includes(futuro.j.slug));
  const prev = await pedir("GET", `/blog/${futuro.j.slug}/`, { cookie, json: false });
  certo("…mas abre para quem está logado, com faixa de pré-visualização e noindex", prev.status === 200 && /Pré-visualização/.test(prev.texto) && /noindex/.test(prev.texto));
  const pub = await pedir("POST", "/api/admin/blog", { cookie, corpo: { title: "ZZ Texto publicado", date: HOJE, content: "<p>Texto publicado <strong>hoje</strong>.</p><img src=x onerror=alert(1)><script>alert(2)</script>", publicado: true, tema: "Produção" } });
  const pubPag = await pagina(`/blog/${pub.j.slug}/`);
  certo("texto publicado aparece, sem onerror e sem <script> no corpo", pub.status === 201 && pubPag.status === 200 && !/onerror|alert\(2\)/.test(pubPag.texto) && /<strong>hoje<\/strong>/.test(pubPag.texto));
  /* A limpeza é na GRAVAÇÃO (o banco só guarda HTML seguro): a página também
     limpa na saída, então só a leitura pela API prova a primeira camada. */
  const guardado = await pedir("GET", `/api/admin/blog/${pub.j.id}`, { cookie });
  certo("o HTML do texto já é gravado limpo no banco (não só na página)", guardado.status === 200 && !/onerror|<script/i.test(guardado.j.post.content) && /<strong>hoje<\/strong>/.test(guardado.j.post.content), guardado.j.post && guardado.j.post.content);
  const renPost = await pedir("PUT", `/api/admin/blog/${pub.j.id}`, { cookie, corpo: { title: "ZZ Título novo do texto", slug: "outro-endereco" } });
  certo("texto já publicado mantém o endereço ao renomear", renPost.status === 200 && renPost.j.slug === pub.j.slug);
  certo("BlogPosting no JSON-LD do texto", jsonld(pubPag.texto).some((x) => x["@type"] === "BlogPosting" && x.datePublished === HOJE));

  const t1 = await pedir("PUT", "/api/admin/textos", { cookie, corpo: { valores: { "home.capa_selo": "ZZ selo editado", "casa.horario": "Segunda a sexta · 7h às 11h\nSábado · 8h às 12h" } } });
  const homeNova = await pagina("/");
  const empNova = jsonld(homeNova.texto).find((x) => x["@type"] === "LocalBusiness");
  certo("editar textos muda o site na hora (selo e horário estruturado)", t1.status === 200 && /ZZ selo editado/.test(homeNova.texto) && empNova.openingHoursSpecification[1].dayOfWeek.join() === "Saturday" && empNova.openingHoursSpecification[0].opens === "07:00");
  const t2 = await pedir("PUT", "/api/admin/textos", { cookie, corpo: { valores: { "casa.horario": "Depende do dia" } } });
  certo("horário que o Google não entende: sai do JSON-LD e o painel avisa", t2.status === 200 && !jsonld((await pagina("/")).texto).find((x) => x["@type"] === "LocalBusiness").openingHoursSpecification && (await pedir("GET", "/api/admin/painel", { cookie })).j.pendencias.some((p) => /Google não entende/.test(p.texto)));
  certo("GA4 com formato errado é recusado", (await pedir("PUT", "/api/admin/textos", { cookie, corpo: { valores: { "medicao.ga4": "UA-1234" } } })).status === 400);
  certo("horários da agenda em formato errado são recusados", (await pedir("PUT", "/api/admin/textos", { cookie, corpo: { valores: { "agenda.horarios": "9h, 10h" } } })).status === 400);
  certo("não dá para fechar os 7 dias da semana", (await pedir("PUT", "/api/admin/textos", { cookie, corpo: { valores: { "agenda.dias_fechados": "0,1,2,3,4,5,6" } } })).status === 400);
  const sc = await pedir("PUT", "/api/admin/textos", { cookie, corpo: { valores: { "medicao.search_console": '<meta name="google-site-verification" content="abcDEF123_xyz-987654" />' } } });
  certo("Search Console: colar a tag inteira guarda só o código e a meta sai na página", sc.status === 200 && /<meta name="google-site-verification" content="abcDEF123_xyz-987654">/.test((await pagina("/")).texto));
  const ga = await pedir("PUT", "/api/admin/textos", { cookie, corpo: { valores: { "medicao.ga4": "G-ABC1234XYZ" } } });
  const comGa = await pagina("/");
  certo("com GA4: a faixa de cookies aparece e o CSP libera SÓ o Google", ga.status === 200 && /id="consent"/.test(comGa.texto) && /googletagmanager/.test(comGa.cab.get("content-security-policy") || "") && !/facebook/.test(comGa.cab.get("content-security-policy") || ""));
  certo("…e o GA4 NÃO carrega antes do aceite (nenhum <script src> do Google no HTML)", !/<script[^>]+src="https:\/\/www\.googletagmanager/.test(comGa.texto));
  await pedir("PUT", "/api/admin/textos", { cookie, corpo: { valores: { "medicao.ga4": "" } } });

  console.log("\n— painel: imagens");
  const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000a49444154789c6300010000050001" + "0d0a2db40000000049454e44ae426082", "hex");
  const up = await pedir("POST", "/api/admin/upload", { cookie, corpo: { dataUrl: "data:image/png;base64," + png.toString("base64") } });
  certo("upload de PNG real: nome sorteado e servido pelo site", up.status === 201 && /^\/assets\/img\/uploads\/\d{4}-\d{2}-[a-f0-9]{12}\.png$/.test(up.j.caminho) && (await pagina(up.j.caminho)).status === 200, up.texto);
  certo("upload de SVG é recusado (executa script)", (await pedir("POST", "/api/admin/upload", { cookie, corpo: { dataUrl: "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString("base64") } })).status === 400);
  certo("HTML disfarçado de PNG é recusado (confere os bytes)", (await pedir("POST", "/api/admin/upload", { cookie, corpo: { dataUrl: "data:image/png;base64," + Buffer.from("<html>oi</html>").toString("base64") } })).status === 400);
  const gal = await pedir("POST", "/api/admin/t/galeria", { cookie, corpo: { imagem: up.j.caminho, legenda: "ZZ foto" } });
  certo("foto enviada entra na galeria", gal.status === 201);
  certo("tabela fora da lista branca não existe na API", (await pedir("GET", "/api/admin/t/usuarios", { cookie })).status === 404 && (await pedir("GET", "/api/admin/t/constructor", { cookie })).status === 404);

  console.log("\n— papéis");
  const novoU = await pedir("POST", "/api/admin/usuarios", { cookie, corpo: { usuario: "zzredator", nome: "ZZ Redator", papel: "redator" } });
  certo("criar redator devolve senha provisória", novoU.status === 201 && novoU.j.senha_provisoria);
  await esperar(1500);
  const entR = await pedir("POST", "/api/admin/entrar", { corpo: { usuario: "zzredator", senha: novoU.j.senha_provisoria } });
  let ck = (/cortesam_sessao=[^;]+/.exec(entR.cab.get("set-cookie") || "") || [""])[0];
  await pedir("POST", "/api/admin/senha", { cookie: ck, corpo: { atual: novoU.j.senha_provisoria, nova: "Redator-Forte-77" } });
  for (const [m, c] of [["GET", "/api/admin/agendamentos"], ["GET", "/api/admin/mensagens"], ["GET", "/api/admin/textos"], ["GET", "/api/admin/usuarios"], ["GET", "/api/admin/servicos"], ["GET", "/api/admin/auditoria"], ["GET", "/api/admin/acessos"]]) {
    certo(`redator NÃO acessa ${c}`, (await pedir(m, c, { cookie: ck })).status === 403);
  }
  certo("redator acessa o blog, a galeria e o FAQ", (await pedir("GET", "/api/admin/blog", { cookie: ck })).status === 200 && (await pedir("GET", "/api/admin/t/galeria", { cookie: ck })).status === 200 && (await pedir("GET", "/api/admin/t/faq", { cookie: ck })).status === 200);
  const painelR = await pedir("GET", "/api/admin/painel", { cookie: ck });
  certo("o início do redator não traz agenda nem dado de cliente", painelR.status === 200 && painelR.j.proximos === undefined && painelR.j.agenda_pendentes === undefined && painelR.j.mensagens_novas === undefined);
  const eu = (await pedir("GET", "/api/admin/usuarios", { cookie })).j.usuarios.find((x) => x.usuario === "admin");
  certo("o último administrador não se rebaixa", (await pedir("PUT", `/api/admin/usuarios/${eu.id}`, { cookie, corpo: { papel: "redator" } })).status === 409);
  const redId = (await pedir("GET", "/api/admin/usuarios", { cookie })).j.usuarios.find((x) => x.usuario === "zzredator").id;
  await pedir("PUT", `/api/admin/usuarios/${redId}`, { cookie, corpo: { ativo: false } });
  certo("desativar o usuário derruba a sessão dele na hora", (await pedir("GET", "/api/admin/blog", { cookie: ck })).status === 401);

  console.log("\n— auditoria e semeadura");
  const aud = await pedir("GET", "/api/admin/auditoria", { cookie });
  certo("auditoria registra quem fez o quê", aud.status === 200 && aud.j.itens.some((i) => i.acao === "textos alterados" && i.usuario === "admin") && aud.j.itens.some((i) => i.acao === "agendamento recebido"));
  /* O valor é do cliente: reiniciar (entregar versão nova) não pode
     sobrescrever o que ele editou no painel — lição do Alafcell 0.11.1. */
  await derrubar();
  subir();
  if (!(await esperarSubir())) { console.log("O servidor não voltou:\n" + log); process.exit(1); }
  certo("reiniciar o servidor NÃO apaga o texto editado no painel", /ZZ selo editado/.test((await pagina("/")).texto));
  certo("reiniciar NÃO recria a senha inicial (a trocada continua valendo)", (await pedir("POST", "/api/admin/entrar", { corpo: { usuario: "admin", senha: "Nova-Senha-Forte-9" } })).status === 200 && (log.match(/Primeiro acesso/g) || []).length === 1);
  const Database = require("better-sqlite3");
  const bd = new Database(path.join(DADOS, "site.db"));
  let travou = false; try { bd.prepare("DELETE FROM auditoria").run(); } catch { travou = true; }
  let travouUpd = false; try { bd.prepare("UPDATE auditoria SET usuario = 'x'").run(); } catch { travouUpd = true; }
  bd.close();
  certo("auditoria não se apaga nem se altera nem direto no banco", travou && travouUpd);

  await derrubar();
  for (const d of [DADOS, UPLOADS, DADOS_UNIT]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
  console.log(`\n  ${ok} provas passaram, ${falhas.length} falharam.`);
  if (falhas.length) { console.log("  Falharam:\n   - " + falhas.join("\n   - ")); process.exit(1); }
  process.exit(0);
})().catch(async (e) => { console.error(e); console.log(log.slice(-2000)); await derrubar(); process.exit(1); });
