"use strict";
/* ==========================================================================
   BLOG — /blog/ e /blog/<slug>/

   Texto com data FUTURA não aparece (nem na lista, nem pelo endereço, nem no
   sitemap): é assim que se agenda. Rascunho (`publicado = 0`) só abre para
   quem está logado no painel, com a faixa "pré-visualização" e noindex.
   ========================================================================== */
const { Q } = require("./db");
const { esc, sanitizarHtml, semHtml } = require("./html-seguro");
const U = require("./util");
const L = require("./layout");
const P = require("./paginas");
const { ico, foto } = L;

const POR_PAGINA = 9;

function lista(ctx, pagina = 1, tema = "") {
  const hoje = U.hojeLocal();
  const temas = Q.todos("SELECT tema, COUNT(*) n FROM posts WHERE publicado = 1 AND date <= ? AND tema <> '' GROUP BY tema ORDER BY n DESC, tema", hoje);
  const temaOk = temas.some((t) => t.tema === tema) ? tema : "";
  const filtro = temaOk ? " AND tema = ?" : "";
  const par = temaOk ? [hoje, temaOk] : [hoje];
  const total = Q.um(`SELECT COUNT(*) n FROM posts WHERE publicado = 1 AND date <= ?${filtro}`, ...par).n;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pg = Math.min(Math.max(1, pagina), paginas);
  const itens = Q.todos(`SELECT * FROM posts WHERE publicado = 1 AND date <= ?${filtro} ORDER BY date DESC, sort, id DESC LIMIT ? OFFSET ?`,
    ...par, POR_PAGINA, (pg - 1) * POR_PAGINA);
  const q = (n) => { const s = new URLSearchParams(); if (temaOk) s.set("tema", temaOk); if (n > 1) s.set("pagina", n); const t = s.toString(); return `/blog/${t ? "?" + t : ""}`; };
  const navPag = paginas > 1 ? `<nav class="paginacao" aria-label="Páginas">${Array.from({ length: paginas }, (_, i) => i + 1)
    .map((n) => n === pg ? `<span aria-current="page">${n}</span>` : `<a href="${esc(q(n))}">${n}</a>`).join("")}</nav>` : "";
  const corpo = `
${P.capaInterna({ n: "06", selo: "Blog", titulo: "Para quem <em>vive de confecção</em>.", texto: "Enfesto, risco, tecidos e produção: o que ajuda a sua confecção a cortar melhor e gastar menos.", trilha: [["Blog", "/blog/"]] })}
<section class="secao secao--papel">
  <div class="envelope">
    ${temas.length > 1 ? `<nav class="temas" aria-label="Temas"><a href="/blog/"${!temaOk ? ' aria-current="page"' : ""}>Todos</a>${temas.map((t) => `<a href="/blog/?tema=${encodeURIComponent(t.tema)}"${t.tema === temaOk ? ' aria-current="page"' : ""}>${esc(t.tema)} <small>${t.n}</small></a>`).join("")}</nav>` : ""}
    ${itens.length ? `<div class="posts">${itens.map((p, n) => P.cartaoPost(p, { grande: pg === 1 && n === 0 && !temaOk })).join("")}</div>` : `<p class="vazio">Nenhum texto publicado ainda.</p>`}
    ${navPag}
  </div>
</section>`;
  return L.pagina({
    titulo: pg > 1 ? `Blog — página ${pg}` : temaOk ? `Blog: ${temaOk}` : "Blog sobre corte, enfesto e confecção",
    caminho: pg > 1 || temaOk ? q(pg) : "/blog/",
    corpo, nonce: ctx.nonce, host: ctx.host, classe: "pg-blog",
    semIndice: !!temaOk,
    descricao: "Blog da Corte Sam: enfesto, risco e encaixe, tecidos e dicas de produção para confecções de Caruaru e do Polo do Agreste.",
    jsonld: [L.jsonldTrilha([["Início", "/"], ["Blog", "/blog/"]]), { "@context": "https://schema.org", "@type": "Blog", name: "Blog da Corte Sam", url: L.absoluto("/blog/"), publisher: { "@id": L.SITE() + "/#empresa" } }],
  });
}

/* Tempo de leitura: 200 palavras por minuto, arredondado para cima. */
const minutos = (html) => Math.max(1, Math.ceil(semHtml(html).split(/\s+/).filter(Boolean).length / 200));

function post(ctx, slug, { logado = false } = {}) {
  const p = Q.um("SELECT * FROM posts WHERE slug = ?", slug);
  if (!p) return null;
  const visivel = p.publicado === 1 && p.date <= U.hojeLocal();
  if (!visivel && !logado) return null;
  const url = L.absoluto(`/blog/${p.slug}/`);
  const relacionados = Q.todos("SELECT * FROM posts WHERE publicado = 1 AND date <= ? AND id <> ? ORDER BY (tema = ?) DESC, date DESC LIMIT 3", U.hojeLocal(), p.id, p.tema);
  const zapShare = `https://wa.me/?text=${encodeURIComponent(p.title + " — " + url)}`;
  const faceShare = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const corpo = `
${!visivel ? `<p class="faixa-rascunho">Pré-visualização: este texto ${p.publicado ? "está agendado para " + U.dataCurta(p.date) : "é um rascunho"} e não aparece para o público.</p>` : ""}
<article class="post">
  <header class="capa-int capa-int--post">
    <div class="capa-int__grade" aria-hidden="true"></div>
    <div class="envelope envelope--texto capa-int__miolo">
      <nav class="trilha" aria-label="Você está em"><a href="/">Início</a><span aria-hidden="true">/</span><a href="/blog/">Blog</a><span aria-hidden="true">/</span><span aria-current="page">${p.tema ? esc(p.tema) : "Texto"}</span></nav>
      <p class="post__meta">${p.tema ? `<span>${esc(p.tema)}</span>` : ""}<time datetime="${esc(p.date)}">${U.dataExtenso(p.date)}</time><span>${minutos(p.content)} min de leitura</span></p>
      <h1 class="capa-int__titulo capa-int__titulo--post">${esc(p.title)}</h1>
      ${p.excerpt ? `<p class="capa-int__texto">${esc(p.excerpt)}</p>` : ""}
    </div>
    <div class="regua" aria-hidden="true"></div>
  </header>
  <div class="secao secao--papel post__corpo">
    <div class="envelope envelope--texto">
      ${p.image ? `<figure class="post__destaque">${foto(p.image, p.image_alt || p.title, { prioridade: true, tamanhos: "(min-width: 832px) 760px, calc(100vw - 32px)" })}${p.image_alt ? `<figcaption>${esc(p.image_alt)}</figcaption>` : ""}</figure>` : ""}
      <div class="texto-rico">${sanitizarHtml(p.content)}</div>
      ${p.autor ? `<p class="post__autor">Por ${esc(p.autor)}</p>` : ""}
      <div class="post__partilha">
        <span>Compartilhe</span>
        <a href="${esc(zapShare)}" target="_blank" rel="noopener" aria-label="Compartilhar no WhatsApp">${ico("zap")}</a>
        <a href="${esc(faceShare)}" target="_blank" rel="noopener" aria-label="Compartilhar no Facebook">${ico("face")}</a>
        <button type="button" data-copiar="${esc(url)}">Copiar link</button>
      </div>
      <aside class="post__chamada">
        <p class="ficha__rotulo">Corte Sam · Caruaru</p>
        <h2>Leve a sua produção para a mesa de corte.</h2>
        <div class="capa__botoes"><a class="btn btn--acao" href="/agendamento/">${ico("calendario")} Agendar corte</a><a class="btn btn--linha" href="/calculadora-de-enfesto/">${ico("calc")} Calculadora de enfesto</a></div>
      </aside>
    </div>
  </div>
</article>
${relacionados.length ? `
<section class="secao secao--kraft">
  <div class="envelope">
    <header class="secao__cab">${P.rotulo("+", "Continue lendo")}<h2 class="titulo-2" data-esticar>Mais do <em>blog</em>.</h2></header>
    <div class="posts posts--tres">${relacionados.map((r) => P.cartaoPost(r)).join("")}</div>
  </div>
</section>` : ""}`;
  const ld = {
    "@context": "https://schema.org", "@type": "BlogPosting", headline: semHtml(p.title).slice(0, 110),
    description: semHtml(p.excerpt) || undefined, datePublished: p.date, dateModified: String(p.atualizado || p.date).slice(0, 10),
    image: p.image ? [L.absoluto(p.image)] : [L.absoluto("/assets/img/og.png")], mainEntityOfPage: url, url, inLanguage: "pt-BR",
    articleSection: p.tema || undefined, wordCount: semHtml(p.content).split(/\s+/).filter(Boolean).length,
    author: { "@type": "Organization", name: p.autor || "Corte Sam", url: L.SITE() + "/" },
    publisher: { "@type": "Organization", name: "Corte Sam", logo: { "@type": "ImageObject", url: L.absoluto("/assets/img/logo.png") } },
  };
  return L.pagina({
    titulo: semHtml(p.title), caminho: `/blog/${p.slug}/`, corpo, nonce: ctx.nonce, host: ctx.host, classe: "pg-post",
    descricao: semHtml(p.excerpt) || semHtml(p.content).slice(0, 160), imagem: p.image || undefined, tipoOg: "article",
    semIndice: !visivel,
    jsonld: [ld, L.jsonldTrilha([["Início", "/"], ["Blog", "/blog/"], [semHtml(p.title), `/blog/${p.slug}/`]])],
  });
}

module.exports = { lista, post, POR_PAGINA, minutos };
