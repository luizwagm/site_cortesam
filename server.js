"use strict";
/* ==========================================================================
   CORTE SAM — servidor

   Node puro, sem framework: um site de oficina tem umas vinte rotas, e
   framework aqui traria mais atualização de segurança do que economia de
   código. As páginas são geradas a cada pedido a partir do SQLite — "salvei no
   painel" já é "está no site".

   Porta 5208 (local). No servidor, a porta definitiva se escolhe com `ss`:
   porta livre aqui não é livre lá, e repasse para porta de vizinho devolve o
   site DELE com 200, sem erro nenhum.
   ========================================================================== */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { URL } = require("node:url");

const { Q, DIR } = require("./src/db");
const Inicial = require("./src/conteudo-inicial");
const S = require("./src/sessao");
const P = require("./src/paginas");
const B = require("./src/blog");
const Seo = require("./src/seo");
const F = require("./src/formularios");
const Admin = require("./src/admin");
const Medicao = require("./src/medicao");
const L = require("./src/layout");
const U = require("./src/util");

const VERSAO = require("./package.json").version;
const PORTA = Number(process.env.PORT) || 5208;
const HOST = process.env.HOST || "127.0.0.1";
const RAIZ = __dirname;

/* ------------------------------------------------------------ subida */
Inicial.semear();
const senhaInicial = Inicial.primeiroAdmin(S.cifrar);
if (senhaInicial) {
  console.log("\n  ┌──────────────────────────────────────────────────────────┐");
  console.log("  │ Primeiro acesso ao painel (/admin/) — anote, aparece 1 vez│");
  console.log(`  │   usuário: admin    senha: ${senhaInicial.padEnd(30)}│`);
  console.log("  │ O painel pede a troca da senha no primeiro login.         │");
  console.log("  └──────────────────────────────────────────────────────────┘\n");
}
S.limparVencidas();
setInterval(() => { try { S.limparVencidas(); } catch { } }, 6 * 3600e3).unref();

/* ------------------------------------------------------------ utilitários */
const TIPOS = {
  ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".html": "text/html; charset=utf-8",
};

/* IP de verdade. O nginx ACRESCENTA o IP real no FIM do X-Forwarded-For; o
   primeiro item é texto do visitante. Só se confia no cabeçalho quando a
   conexão vem do próprio nginx (loopback). */
const DO_PROXY = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
function ipDe(req) {
  const s = req.socket.remoteAddress || "";
  if (!DO_PROXY.has(s)) return s;
  const real = String(req.headers["x-real-ip"] || "").trim();
  if (real) return real;
  const l = String(req.headers["x-forwarded-for"] || "").split(",").map((x) => x.trim()).filter(Boolean);
  return l.length ? l[l.length - 1] : s;
}
const seguro = (req) => req.headers["x-forwarded-proto"] === "https" || !!req.socket.encrypted;

function cabecalhosSeguranca(nonce, { admin = false } = {}) {
  const m = Medicao.origensCsp();
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${!admin && m.script ? " " + m.script : ""}`,
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data:${!admin && m.imagem ? " " + m.imagem : ""}`,
    "font-src 'self'",
    `connect-src 'self'${!admin && m.conectar ? " " + m.conectar : ""}`,
    admin ? "frame-src 'none'" : "frame-src https://www.google.com",
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
  ].join("; ");
  return {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
}

/* COMPRESSÃO no próprio Node. Em produção o nginx também comprime (e não
   recomprime o que já vem com Content-Encoding); aqui é para o ambiente local
   e a medição não mentirem. */
const COMPRIMIVEL = /^(text\/|application\/(json|xml|manifest|javascript)|image\/svg)/;
function codificacao(req, tipo, tamanho) {
  if (!COMPRIMIVEL.test(tipo) || tamanho < 1024) return "";
  const a = String(req.headers["accept-encoding"] || "");
  return /\bbr\b/.test(a) ? "br" : /\bgzip\b/.test(a) ? "gzip" : "";
}
function responder(res, status, corpo, tipo = "text/html; charset=utf-8", extra = {}) {
  const req = res.req;
  const buf = Buffer.isBuffer(corpo) ? corpo : Buffer.from(String(corpo ?? ""));
  const cod = req && req.method !== "HEAD" ? codificacao(req, tipo, buf.length) : "";
  if (!cod) { res.writeHead(status, { "Content-Type": tipo, ...extra }); return res.end(req && req.method === "HEAD" ? undefined : buf); }
  const z = cod === "br" ? zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }) : zlib.gzipSync(buf, { level: 6 });
  res.writeHead(status, { "Content-Type": tipo, "Content-Encoding": cod, Vary: "Accept-Encoding", ...extra });
  res.end(z);
}
const json = (res, status, obj, extra = {}) => responder(res, status, JSON.stringify(obj), "application/json; charset=utf-8", { "Cache-Control": "no-store", ...extra });

function lerCorpo(req, limite = 64 * 1024) {
  return new Promise((ok, falha) => {
    let tam = 0; const partes = [];
    req.on("data", (c) => { tam += c.length; if (tam > limite) { falha(Object.assign(new Error("grande"), { status: 413 })); req.destroy(); } else partes.push(c); });
    req.on("end", () => ok(Buffer.concat(partes).toString("utf8")));
    req.on("error", falha);
  });
}
function interpretar(req, bruto) {
  const tipo = String(req.headers["content-type"] || "");
  if (/application\/json/.test(tipo)) { try { const o = JSON.parse(bruto || "{}"); return o && typeof o === "object" && !Array.isArray(o) ? o : null; } catch { return null; } }
  if (/application\/x-www-form-urlencoded/.test(tipo)) return Object.fromEntries(new URLSearchParams(bruto));
  return {};
}

/* Pedido que muda estado com Origin de OUTRO site é recusado. SameSite=Lax
   já segura o cookie; isto é a segunda tranca, barata. */
function origemOk(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}

/* ------------------------------------------------------------ estáticos
   Só de /assets/ e /admin/, por LUGAR e não por extensão: liberar ".js" em
   qualquer caminho serviu o server.js de outro site do parque (INNOVAR). O
   caminho resolvido tem de continuar dentro da pasta. */
const PASTA_ASSETS = path.join(RAIZ, "assets");
const PASTA_ADMIN = path.join(RAIZ, "admin");
function servirArquivo(res, raiz, relativo, cache) {
  const alvo = path.normalize(path.join(raiz, relativo));
  if (!alvo.startsWith(raiz + path.sep)) return false;
  const ext = path.extname(alvo).toLowerCase();
  if (!TIPOS[ext]) return false;
  let st; try { st = fs.statSync(alvo); } catch { return false; }
  if (!st.isFile()) return false;
  const base = { "Content-Type": TIPOS[ext], "Cache-Control": cache, "X-Content-Type-Options": "nosniff" };
  /* SVG servido pelo site nunca executa script: CSP própria, sandbox. */
  if (ext === ".svg") base["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  if (res.req.method === "HEAD") { res.writeHead(200, { ...base, "Content-Length": st.size }); res.end(); return true; }
  const cod = codificacao(res.req, TIPOS[ext], st.size);
  if (cod) {
    res.writeHead(200, { ...base, "Content-Encoding": cod, Vary: "Accept-Encoding" });
    fs.createReadStream(alvo).pipe(cod === "br" ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }) : zlib.createGzip()).pipe(res);
    return true;
  }
  res.writeHead(200, { ...base, "Content-Length": st.size });
  fs.createReadStream(alvo).pipe(res);
  return true;
}

/* ------------------------------------------------------------ contagem */
const SAL_VISITA = crypto.createHash("sha256").update(F.assinar("visitas")).digest("hex");
const ROBO = /bot|crawl|spider|slurp|facebookexternalhit|preview|lighthouse|headless|curl|wget/i;
function contar(req, caminho) {
  if (ROBO.test(String(req.headers["user-agent"] || ""))) return;
  const dia = U.hojeLocal();
  try {
    Q.roda("INSERT INTO acessos (dia, caminho, n) VALUES (?,?,1) ON CONFLICT(dia, caminho) DO UPDATE SET n = n + 1", dia, caminho.slice(0, 120));
    Q.roda("INSERT OR IGNORE INTO visitantes (dia, hash) VALUES (?,?)", dia, U.hashDoDia(ipDe(req), dia, SAL_VISITA));
  } catch { /* contagem nunca derruba página */ }
}

/* ================================================================ rotas */
const PAGINAS = {
  "/": P.home, "/servicos/": P.servicos, "/sobre/": P.sobre, "/privacidade/": P.privacidade,
};
const COM_QUERY = { "/agendamento/": P.agendamento, "/contato/": P.contato, "/calculadora-de-enfesto/": P.calculadora };
const FORMS = { "/agendamento": F.receberAgendamento, "/contato": F.receberContato };
/* Endereços do site antigo (Ueni) e variações óbvias: 301 para o lugar novo,
   para o link que já circula em grupo de WhatsApp não morrer. */
const ANTIGOS = {
  "/servicos": "/servicos/", "/services": "/servicos/", "/sobre-nos/": "/sobre/", "/quem-somos/": "/sobre/",
  "/agendar/": "/agendamento/", "/orcamento/": "/agendamento/", "/calculadora/": "/calculadora-de-enfesto/",
  "/noticias/": "/blog/", "/contact/": "/contato/", "/contatos/": "/contato/",
};

async function atender(req, res) {
  let url;
  try { url = new URL(req.url, "http://x"); } catch { return responder(res, 400, "Pedido inválido", "text/plain; charset=utf-8"); }
  let caminho;
  try { caminho = decodeURIComponent(url.pathname); } catch { return responder(res, 400, "Pedido inválido", "text/plain; charset=utf-8"); }
  const metodo = req.method;
  const nonce = crypto.randomBytes(16).toString("base64");
  const ctx = { nonce, host: req.headers.host || "" };
  const query = Object.fromEntries(url.searchParams);

  if (caminho === "/saude") return json(res, 200, { ok: true, versao: VERSAO, indexavel: L.indexavel() });

  /* ---------------------------------------------------- estáticos */
  if (caminho.startsWith("/assets/") && (metodo === "GET" || metodo === "HEAD")) {
    const rel = caminho.slice("/assets/".length);
    /* Em desenvolvimento (sem CORTESAM_SITE) nada é "imutável": o CSS e o JS
       mudam sem a versão mudar, e o navegador serviria o arquivo velho. */
    const cache = !process.env.CORTESAM_SITE ? "no-cache"
      : rel.startsWith("img/uploads/") ? "public, max-age=604800"
      : url.search.includes("v=") || /^(fonts|img)\//.test(rel) ? "public, max-age=31536000, immutable" : "public, max-age=3600";
    const ok = rel.startsWith("img/uploads/")
      ? servirArquivo(res, Admin.UPLOADS, rel.slice("img/uploads/".length), cache)
      : servirArquivo(res, PASTA_ASSETS, rel, cache);
    if (ok) return;
    return responder(res, 404, "Não encontrado", "text/plain; charset=utf-8");
  }
  if (caminho === "/favicon.ico" && servirArquivo(res, path.join(RAIZ, "assets", "img"), "favicon.ico", "public, max-age=604800")) return;
  if (caminho === "/robots.txt") return responder(res, 200, Seo.robots({ host: ctx.host }), "text/plain; charset=utf-8", { "Cache-Control": "public, max-age=3600" });
  if (caminho === "/sitemap.xml") return responder(res, 200, Seo.sitemap(), "application/xml; charset=utf-8", { "Cache-Control": "public, max-age=3600", ...(L.hostDeTrabalho(ctx.host) || !L.indexavel() ? { "X-Robots-Tag": "noindex" } : {}) });
  if (caminho === "/llms.txt") return responder(res, 200, Seo.llms(), "text/plain; charset=utf-8", { "Cache-Control": "public, max-age=3600" });
  if (caminho === "/manifest.webmanifest") return responder(res, 200, Seo.manifesto(), "application/manifest+json; charset=utf-8");

  /* ---------------------------------------------------- painel */
  if (caminho === "/admin") return responder(res, 301, "", "text/plain", { Location: "/admin/" });
  if (caminho.startsWith("/admin/") && (metodo === "GET" || metodo === "HEAD")) {
    const rel = caminho === "/admin/" ? "index.html" : caminho.slice("/admin/".length);
    const seg = cabecalhosSeguranca(nonce, { admin: true });
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    for (const [k, v] of Object.entries(seg)) res.setHeader(k, v);
    if (servirArquivo(res, PASTA_ADMIN, rel, rel === "index.html" ? "no-store" : "no-cache")) return;
    return responder(res, 404, "Não encontrado", "text/plain; charset=utf-8");
  }
  if (caminho.startsWith("/api/admin/")) {
    if (metodo !== "GET" && !origemOk(req)) return json(res, 403, { erro: "Origem recusada." });
    try {
      const bruto = metodo === "GET" ? "" : await lerCorpo(req, caminho === "/api/admin/upload" ? 8 * 1024 * 1024 : 2 * 1024 * 1024);
      const corpo = interpretar(req, bruto);
      if (corpo === null) return json(res, 400, { erro: "JSON inválido." });
      const usuario = S.ler(req);
      const token = (/(?:^|;\s*)cortesam_sessao=([^;]+)/.exec(req.headers.cookie || "") || [])[1] || "";
      const r = await Admin.rotear({ metodo, caminho: caminho.slice("/api/admin".length), corpo, usuario, query, ip: ipDe(req), seguro: seguro(req), token });
      if (r && r.sair) S.fechar(req);
      if (!r) return json(res, 404, { erro: "Rota não encontrada." });
      return json(res, r.status, r.json, { "X-Robots-Tag": "noindex", ...(r.cabecalhos || {}) });
    } catch (e) {
      if (e instanceof Admin.Recusa) return json(res, e.status, { erro: e.message });
      if (e.status === 413) return json(res, 413, { erro: "Envio grande demais." });
      console.error("  ✖ painel:", e);
      return json(res, 500, { erro: "Erro interno." });
    }
  }

  /* ---------------------------------------------------- formulários */
  if (FORMS[caminho] && metodo === "POST") {
    const querJson = /application\/json/.test(String(req.headers.accept || ""));
    if (!origemOk(req)) return json(res, 403, { ok: false, erro: "Origem recusada." });
    let r;
    try {
      const b = interpretar(req, await lerCorpo(req, 32 * 1024));
      r = b === null ? { status: 400, json: { ok: false, erro: "Envio inválido." } } : await FORMS[caminho](b, ipDe(req));
    } catch (e) {
      if (e.status !== 413) console.error("  ✖ formulário:", e);
      r = { status: e.status === 413 ? 413 : 500, json: { ok: false, erro: "Não foi possível enviar agora. Tente pelo WhatsApp." } };
    }
    if (querJson) return json(res, r.status, r.json);
    /* Sem JavaScript: sucesso vira 303 para a confirmação; erro mostra a
       mensagem com um "voltar" (o navegador guarda o que foi digitado). */
    if (r.json.ok && r.json.confirmacao) return responder(res, 303, "", "text/plain", { Location: r.json.confirmacao });
    if (r.json.ok) return responder(res, 303, "", "text/plain", { Location: caminho + "/?enviado=1" });
    const msg = r.json.erros ? Object.values(r.json.erros).join(" ") : r.json.erro;
    return responder(res, r.status, `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Confira o formulário · Corte Sam</title><link rel="stylesheet" href="/assets/css/site.css?v=${VERSAO}"><body class="pg-aviso"><main class="secao secao--papel"><div class="envelope envelope--estreito"><h1 class="titulo-2">Faltou um detalhe</h1><p>${U.esc(msg)}</p><p><a class="btn btn--acao" href="${caminho}/">Voltar e corrigir</a></p></div></main></body></html>`, "text/html; charset=utf-8", cabecalhosSeguranca(nonce));
  }

  if (metodo !== "GET" && metodo !== "HEAD") return responder(res, 405, "Método não permitido", "text/plain; charset=utf-8", { Allow: "GET, HEAD" });

  /* ---------------------------------------------------- endereço canônico:
     páginas terminam em barra. /servicos → /servicos/ (301), para o Google
     não enxergar duas páginas iguais. */
  if (ANTIGOS[caminho] || ANTIGOS[caminho + "/"]) return responder(res, 301, "", "text/plain", { Location: ANTIGOS[caminho] || ANTIGOS[caminho + "/"] });
  if (!caminho.endsWith("/") && !path.extname(caminho)) {
    const alvo = caminho + "/";
    if (PAGINAS[alvo] || COM_QUERY[alvo] || /^\/(blog|servicos)\/[a-z0-9-]+\/$/.test(alvo) || alvo === "/blog/")
      return responder(res, 301, "", "text/plain", { Location: alvo + url.search });
  }

  let html = null, m;
  if (PAGINAS[caminho]) html = PAGINAS[caminho](ctx);
  else if (COM_QUERY[caminho]) html = COM_QUERY[caminho](ctx, query);
  else if (caminho === "/blog/") html = B.lista(ctx, Number(query.pagina) || 1, String(query.tema || ""));
  else if ((m = /^\/blog\/([a-z0-9-]+)\/$/.exec(caminho))) html = B.post(ctx, m[1], { logado: !!S.ler(req) });
  else if ((m = /^\/servicos\/([a-z0-9-]+)\/$/.exec(caminho))) html = P.servico(ctx, m[1]);
  else if (caminho === "/agendamento/recebido/") {
    const c = query.c, t = query.t;
    if (F.confirmacaoValida(c, t)) html = P.agendamentoRecebido(ctx, c);
  }

  const seg = cabecalhosSeguranca(nonce);
  if (html) {
    if (metodo === "GET") contar(req, caminho);
    const extra = { ...seg, "Cache-Control": "no-cache" };
    if (!L.indexavel() || L.hostDeTrabalho(ctx.host)) extra["X-Robots-Tag"] = "noindex, nofollow";
    return responder(res, 200, html, "text/html; charset=utf-8", extra);
  }
  return responder(res, 404, P.naoEncontrada(ctx), "text/html; charset=utf-8", { ...seg, "Cache-Control": "no-store" });
}

const servidor = http.createServer((req, res) => {
  atender(req, res).catch((e) => {
    console.error("  ✖", req.method, req.url, e);
    try { if (!res.headersSent) responder(res, 500, "Erro interno", "text/plain; charset=utf-8"); else res.end(); } catch { }
  });
});
servidor.headersTimeout = 20000;
servidor.requestTimeout = 30000;

servidor.listen(PORTA, HOST, () => {
  console.log(`  ✂ Corte Sam ${VERSAO} em http://${HOST}:${PORTA}  (dados: ${DIR})`);
  console.log(`     endereço público: ${L.SITE()} · ${L.indexavel() ? "INDEXÁVEL" : "fora do índice (noindex)"}`);
  if (!process.env.CORTESAM_SMTP) console.log("     e-mail: modo seco (sem CORTESAM_SMTP)");
});

module.exports = { servidor };
