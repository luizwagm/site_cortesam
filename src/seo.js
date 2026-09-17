"use strict";
/* ==========================================================================
   SEO de máquina: sitemap, robots, llms.txt e manifesto.
   ========================================================================== */
const { Q, txt } = require("./db");
const { semHtml } = require("./html-seguro");
const U = require("./util");
const L = require("./layout");

const FIXAS = ["/", "/servicos/", "/agendamento/", "/calculadora-de-enfesto/", "/sobre/", "/blog/", "/contato/", "/privacidade/"];
const PRIORIDADE = { "/": "1.0", "/servicos/": "0.9", "/agendamento/": "0.9", "/calculadora-de-enfesto/": "0.8", "/privacidade/": "0.2" };

function sitemap() {
  const hoje = U.hojeLocal();
  /* Só o que está NO AR: texto agendado ou rascunho no sitemap é 404 servido
     ao Google, que lê isso como site descuidado. */
  const posts = Q.todos("SELECT slug, date, atualizado FROM posts WHERE publicado = 1 AND date <= ? ORDER BY date DESC", hoje);
  const servicos = Q.todos("SELECT slug, atualizado FROM servicos WHERE ativo = 1 ORDER BY ordem, id");
  const url = (loc, mod, pri) => `  <url><loc>${L.absoluto(loc)}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ""}<priority>${pri}</priority></url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${FIXAS.map((c) => url(c, "", PRIORIDADE[c] || "0.7")).join("\n")}
${servicos.map((s) => url(`/servicos/${s.slug}/`, String(s.atualizado || "").slice(0, 10), "0.8")).join("\n")}
${posts.map((p) => url(`/blog/${p.slug}/`, String(p.atualizado || p.date).slice(0, 10) > p.date ? String(p.atualizado).slice(0, 10) : p.date, "0.6")).join("\n")}
</urlset>`;
}

/* UM GRUPO SÓ. Cada robô obedece a UM grupo (o mais específico que casa com o
   nome dele) e ignora o `User-agent: *` inteiro — dar grupo próprio a um robô
   de IA com só `Allow: /` liberou o painel no Alafcell. E `Disallow` é
   PREFIXO: "/agendamento" tiraria do Google a página de agendamento inteira;
   o que sai é só "/agendamento/recebido/". Fora do índice, fecha tudo. */
function robots({ host = "" } = {}) {
  if (!L.indexavel() || L.hostDeTrabalho(host)) return "User-agent: *\nDisallow: /\n";
  return `User-agent: *
Disallow: /admin/
Disallow: /api/
Disallow: /agendamento/recebido/
Allow: /

Sitemap: ${L.absoluto("/sitemap.xml")}
`;
}

/* llms.txt (llmstxt.org): resumo em texto puro para assistentes de IA
   citarem. Só FATO — campo vazio não vira linha. */
function llms() {
  const c = L.casa();
  const servicos = Q.todos("SELECT slug, titulo, resumo FROM servicos WHERE ativo = 1 ORDER BY ordem, id");
  const posts = Q.todos("SELECT slug, title FROM posts WHERE publicado = 1 AND date <= ? ORDER BY date DESC LIMIT 20", U.hojeLocal());
  const linhas = [
    `# ${c.nome}`,
    "",
    `> ${semHtml(txt("seo.descricao"))}`,
    "",
    "## A empresa",
    `- Oficina de corte de tecidos e modelagem para confecções${c.desde ? `, desde ${c.desde}` : ""}.`,
    c.lema && `- Lema: "${c.lema}".`,
    `- Endereço: ${c.logradouro}, ${c.bairro}, ${c.cidade}/${c.uf}${c.cep ? `, CEP ${c.cep}` : ""}.`,
    "- Atende confecções de Caruaru e do Polo de Confecções do Agreste (Toritama, Santa Cruz do Capibaribe).",
    c.horario ? `- Horário: ${c.horario.split("\n").join("; ")}.` : "- Horário: consultar pelo WhatsApp.",
    c.whatsapp && `- WhatsApp: ${U.telefoneBonito(c.whatsapp)}.`,
    c.telefone2 && `- Telefone: ${U.telefoneBonito(c.telefone2)}.`,
    c.email && `- E-mail: ${c.email}.`,
    c.pagamento && `- Pagamento: ${c.pagamento}.`,
    c.cnpj && `- CNPJ: ${c.cnpj}.`,
    "- Preços: sob orçamento (dependem do tecido, das folhas e do modelo); não há tabela publicada.",
    "",
    "## Serviços",
    ...servicos.map((s) => `- [${s.titulo}](${L.absoluto(`/servicos/${s.slug}/`)}): ${semHtml(s.resumo)}`),
    "",
    "## Ferramentas",
    `- [Agendamento de corte online](${L.absoluto("/agendamento/")}): o pedido é confirmado pelo WhatsApp.`,
    `- [Calculadora de enfesto](${L.absoluto("/calculadora-de-enfesto/")}): metros de tecido = (comprimento do risco + folga das pontas) × folhas; peso = metros × largura × gramatura ÷ 1000.`,
    "",
    posts.length && "## Blog",
    ...posts.map((p) => `- [${semHtml(p.title)}](${L.absoluto(`/blog/${p.slug}/`)})`),
  ].filter((l) => l !== false && l !== null && l !== undefined && l !== 0 && l !== "");
  /* As linhas em branco entre seções são "", filtradas acima; recoloca antes de cada título. */
  return linhas.map((l, i) => (i > 0 && /^#/.test(l) ? "\n" + l : l)).join("\n").replace(/^(# .*)\n/, "$1\n\n") + "\n";
}

function manifesto() {
  const c = L.casa();
  return JSON.stringify({
    name: `${c.nome} · Corte e modelagem`, short_name: c.nome, lang: "pt-BR", start_url: "/", display: "standalone",
    background_color: "#F4F1EA", theme_color: "#0A1A3F",
    icons: [
      { src: "/assets/img/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/assets/img/icone-512.png", sizes: "512x512", type: "image/png" },
    ],
  });
}

module.exports = { sitemap, robots, llms, manifesto, FIXAS };
