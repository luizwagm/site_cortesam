"use strict";
/* ==========================================================================
   PÁGINAS PÚBLICAS

   Tudo é gerado a cada pedido a partir do banco: "salvei no painel" já é
   "está no site". O HTML leva o conteúdo inteiro — a animação é camada por
   cima (site.js), e sem ela a página continua completa.
   ========================================================================== */
const { Q, txt } = require("./db");
const { esc, sanitizarHtml, semHtml, emLinhas } = require("./html-seguro");
const U = require("./util");
const L = require("./layout");
const F = require("./formularios");
const Calc = require("./calculo");
const { ico, foto, tituloRico } = L;

const T = (chave, padrao = "") => tituloRico(txt(chave, padrao));
const P = (chave, padrao = "") => esc(semHtml(txt(chave, padrao)));

/* ---------------------------------------------------------------- peças */
function rotulo(n, texto, { claro = false } = {}) {
  return `<p class="rotulo${claro ? " rotulo--claro" : ""}"><span class="rotulo__n">${esc(n)}</span><span class="rotulo__t">${esc(texto)}</span></p>`;
}

function capaInterna({ n = "", selo, titulo, texto = "", trilha = [], imagem = "", alt = "" }) {
  const migalhas = [["Início", "/"], ...trilha];
  return `
<section class="capa-int${imagem ? " capa-int--foto" : ""}">
  <div class="capa-int__grade" aria-hidden="true"></div>
  <div class="envelope capa-int__miolo">
    <nav class="trilha" aria-label="Você está em">${migalhas.map(([nome, url], i) => i === migalhas.length - 1 ? `<span aria-current="page">${esc(nome)}</span>` : `<a href="${esc(url)}">${esc(nome)}</a><span aria-hidden="true">/</span>`).join("")}</nav>
    ${rotulo(n, selo, { claro: true })}
    <h1 class="capa-int__titulo">${titulo}</h1>
    ${texto ? `<p class="capa-int__texto">${texto}</p>` : ""}
  </div>
  ${imagem ? `<figure class="capa-int__foto" aria-hidden="true">${foto(imagem, alt, { prioridade: true, tamanhos: "(min-width: 900px) 38vw, calc(100vw - 32px)" })}<span class="capa-int__lamina"></span></figure>` : ""}
  <div class="regua" aria-hidden="true"></div>
</section>`;
}

function cartaoPost(p, { grande = false } = {}) {
  return `
<article class="post-cartao${grande ? " post-cartao--grande" : ""}">
  <a href="/blog/${esc(p.slug)}/" class="post-cartao__link">
    <figure class="post-cartao__foto">${foto(p.image || "/assets/img/banco/rolos-azuis.webp", p.image_alt || "", { tamanhos: grande ? "(min-width: 900px) 56vw, calc(100vw - 32px)" : "(min-width: 900px) 30vw, (min-width: 600px) 46vw, calc(100vw - 32px)" })}</figure>
    <div class="post-cartao__corpo">
      <p class="post-cartao__meta">${p.tema ? `<span>${esc(p.tema)}</span>` : ""}<time datetime="${esc(p.date)}">${U.dataCurta(p.date)}</time></p>
      <h3>${esc(p.title)}</h3>
      ${p.excerpt ? `<p>${esc(p.excerpt)}</p>` : ""}
      <span class="post-cartao__ler">Ler ${ico("seta")}</span>
    </div>
  </a>
</article>`;
}

function botoesContato({ msg = L.MSG_ZAP, claro = false } = {}) {
  const c = L.casa();
  const zap = c.zap(msg);
  return `
  <a class="btn ${claro ? "btn--giz" : "btn--acao"} btn--lg" href="/agendamento/">${ico("calendario")} Agendar corte</a>
  ${zap ? `<a class="btn ${claro ? "btn--linha-clara" : "btn--linha"} btn--lg" href="${esc(zap)}" target="_blank" rel="noopener">${ico("zap")} WhatsApp</a>` : ""}`;
}

function faqs() { return Q.todos("SELECT pergunta, resposta FROM faq WHERE ativo = 1 ORDER BY ordem, id"); }
function secaoFaq({ n = "", titulo = "Perguntas <em>frequentes</em>." } = {}) {
  const l = faqs();
  if (!l.length) return "";
  return `
<section class="secao secao--papel faq" id="perguntas">
  <div class="envelope faq__grade">
    <header class="secao__cab">
      ${rotulo(n, "Dúvidas")}
      <h2 class="titulo-2" data-esticar>${titulo}</h2>
      <p>Não achou a sua? <a href="/contato/">Fale com a Corte Sam</a>.</p>
    </header>
    <div class="faq__lista">
      ${l.map((f, i) => `<details class="faq__item"${i === 0 ? " open" : ""}><summary><span class="faq__n">${String(i + 1).padStart(2, "0")}</span>${esc(f.pergunta)}<span class="faq__mais" aria-hidden="true"></span></summary><div class="faq__resp"><p>${esc(f.resposta)}</p></div></details>`).join("")}
    </div>
  </div>
</section>`;
}
const jsonldFaq = () => {
  const l = faqs();
  return l.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: l.map((f) => ({ "@type": "Question", name: semHtml(f.pergunta), acceptedAnswer: { "@type": "Answer", text: semHtml(f.resposta) } })) }] : [];
};

function faixaPalavras() {
  const palavras = ["Risco", "Enfesto", "Corte", "Modelagem", "Peças prontas para a costura", "Caruaru · PE"];
  const um = palavras.map((p) => `<span>${esc(p)}</span><i aria-hidden="true">${ico("tesoura")}</i>`).join("");
  return `<div class="faixa" aria-hidden="true"><div class="faixa__trilho">${um}${um}</div></div>`;
}

/* ================================================================ INÍCIO */
function home(ctx) {
  const c = L.casa();
  const servicos = Q.todos("SELECT * FROM servicos WHERE ativo = 1 ORDER BY ordem, id");
  const galeria = Q.todos("SELECT * FROM galeria WHERE ativo = 1 ORDER BY ordem, id LIMIT 6");
  const posts = Q.todos("SELECT * FROM posts WHERE publicado = 1 AND date <= ? ORDER BY date DESC, id DESC LIMIT 3", U.hojeLocal());
  const avaliacoes = Q.todos("SELECT * FROM avaliacoes WHERE ativo = 1 AND nota >= 4 ORDER BY ordem, id LIMIT 6");
  const horarioCurto = c.horario ? c.horario.split("\n").join(" · ").replace(/Segunda a sexta · /gi, "") : "";

  /* As fotos do processo são REAIS (a oficina). A etapa sem foto real usa a
     de banco e NÃO diz "foto da oficina". */
  const ETAPAS = [
    ["risco-encaixe", "/assets/img/oficina/risco-encaixe.webp", "Risco impresso com as partes do molde encaixadas", true],
    ["enfesto-rolo", "/assets/img/oficina/enfesto-rolo.webp", "Rolo de tecido no suporte ao lado da mesa de enfesto", true],
    ["corte-malha", "/assets/img/oficina/corte-malha.webp", "Máquina de faca vertical cortando tecido rosa", true],
    ["pecas-cortadas", "/assets/img/oficina/pecas-cortadas.webp", "Partes de roupa cortadas e empilhadas", true],
  ];

  const corpo = `
<section class="capa" data-capa>
  <div class="capa__grade" aria-hidden="true"></div>
  <div class="envelope capa__miolo">
    <div class="capa__texto">
      <p class="selo"><span class="selo__ponto" aria-hidden="true"></span>${P("home.capa_selo")}</p>
      <h1 class="capa__titulo">${T("home.capa_titulo", "Corte de tecidos <em>certo</em> para a sua confecção.")}</h1>
      <p class="capa__lead">${P("home.capa_texto")}</p>
      <div class="capa__botoes">${botoesContato({ claro: true })}</div>
      <dl class="capa__fichas">
        ${horarioCurto ? `<div><dt>Seg a sex</dt><dd>${esc(horarioCurto)}</dd></div>` : ""}
        <div><dt>Oficina</dt><dd>${esc(c.logradouro)}</dd></div>
        ${c.desde ? `<div><dt>Desde</dt><dd>${esc(c.desde)}</dd></div>` : ""}
      </dl>
    </div>
    <figure class="capa__foto" aria-hidden="true">
      <div class="capa__metade capa__metade--a">${foto("/assets/img/banco/denim-ondas.webp", "", { prioridade: true, tamanhos: "(min-width: 900px) 46vw, 92vw" })}</div>
      <div class="capa__metade capa__metade--b">${foto("/assets/img/banco/denim-ondas.webp", "", { prioridade: true, tamanhos: "(min-width: 900px) 46vw, 92vw" })}</div>
      <span class="capa__lamina"></span>
      <span class="capa__cota capa__cota--h"><span>largura útil</span></span>
      <span class="capa__cota capa__cota--v"><span>folhas</span></span>
    </figure>
  </div>
  <div class="regua" aria-hidden="true"></div>
</section>

${faixaPalavras()}

<section class="secao secao--papel" id="servicos">
  <div class="envelope">
    <header class="secao__cab secao__cab--linha">
      <div>${rotulo("01", "Serviços")}<h2 class="titulo-2" data-esticar>${T("home.servicos_titulo")}</h2></div>
      <a class="link-seta" href="/servicos/">Todos os serviços ${ico("seta")}</a>
    </header>
    <div class="servicos">
      ${servicos.map((s, i) => `
      <a class="servico" href="/servicos/${esc(s.slug)}/" data-revelar>
        <span class="servico__n">${String(i + 1).padStart(2, "0")}</span>
        <figure class="servico__foto">${foto(s.imagem, s.imagem_alt, { tamanhos: "(min-width: 900px) 30vw, (min-width: 600px) 46vw, calc(100vw - 32px)" })}</figure>
        <div class="servico__corpo">
          ${s.medida ? `<span class="servico__medida">${esc(s.medida)}</span>` : ""}
          <h3>${esc(s.titulo)}</h3>
          <p>${esc(s.resumo)}</p>
        </div>
        <span class="servico__seta" aria-hidden="true">${ico("seta")}</span>
      </a>`).join("")}
    </div>
  </div>
</section>

<section class="processo" data-processo aria-labelledby="processo-titulo">
  <div class="processo__fixo">
    <div class="envelope processo__miolo">
      <header class="processo__cab">
        ${rotulo("02", "Como funciona", { claro: true })}
        <h2 class="titulo-2" id="processo-titulo" data-esticar>${T("home.processo_titulo")}</h2>
        <div class="processo__regua" aria-hidden="true"><span data-processo-barra></span>${[1, 2, 3, 4].map((n) => `<i style="--p:${(n - 1) / 3}">${String(n).padStart(2, "0")}</i>`).join("")}</div>
        <p class="processo__nota">${ico("check")} As fotos desta seção são da oficina da Corte Sam.</p>
      </header>
      <ol class="processo__etapas">
        ${ETAPAS.map(([, img, alt], i) => `
        <li class="etapa${i === 0 ? " ativa" : ""}" data-etapa="${i}">
          <figure class="etapa__foto">${foto(img, alt, { tamanhos: "(min-width: 1100px) 34vw, (min-width: 600px) 42vw, calc(100vw - 64px)" })}</figure>
          <div class="etapa__txt">
            <span class="etapa__n">${String(i + 1).padStart(2, "0")} / 04</span>
            <h3>${P(`home.proc${i + 1}_titulo`)}</h3>
            <p>${P(`home.proc${i + 1}_texto`)}</p>
          </div>
        </li>`).join("")}
      </ol>
    </div>
  </div>
</section>

<section class="secao secao--kraft calc-chamada">
  <div class="envelope calc-chamada__grade">
    <div>
      ${rotulo("03", "Ferramenta grátis")}
      <h2 class="titulo-2" data-esticar>Quanto tecido o seu <em>enfesto</em> vai usar?</h2>
      <p>Comprimento do risco, número de folhas e pronto: a conta que você faz no papel antes de vir cortar — agora em segundos, com peso para malha.</p>
      <a class="link-seta" href="/calculadora-de-enfesto/">Abrir a calculadora completa ${ico("seta")}</a>
    </div>
    <form class="calc-mini" action="/calculadora-de-enfesto/" method="get" data-calc>
      <div class="calc-mini__campos">
        <label><span>Comprimento do risco <small>m</small></span><input name="comprimento" inputmode="decimal" placeholder="2,40" required></label>
        <label><span>Folhas</span><input name="folhas" inputmode="numeric" placeholder="40" required></label>
      </div>
      <output class="calc-mini__saida" data-calc-saida aria-live="polite"><small>Tecido estimado</small><strong data-calc-metros>— m</strong><span>com 2 cm de folga em cada ponta</span></output>
      <button class="btn btn--acao btn--bloco" type="submit">${ico("calc")} Calcular</button>
    </form>
  </div>
</section>

<section class="secao secao--papel oficina">
  <div class="envelope oficina__grade">
    <div class="oficina__texto">
      ${rotulo("04", "A oficina")}
      <h2 class="titulo-2" data-esticar>${T("home.oficina_titulo")}</h2>
      <p>${P("home.oficina_texto")}</p>
      <figure class="oficina__samuel" data-revelar>
        ${foto("/assets/img/oficina/samuel-fachada.webp", "Samuel, da Corte Sam, em frente à placa da oficina", { tamanhos: "(min-width: 900px) 220px, 45vw" })}
        <figcaption><strong>Samuel</strong><span>à frente da mesa de corte</span></figcaption>
      </figure>
      <a class="link-seta" href="/sobre/">Conheça a oficina ${ico("seta")}</a>
    </div>
    <div class="oficina__fotos">
      ${galeria.map((g, i) => `<figure class="oficina__foto oficina__foto--${i}" data-revelar>${foto(g.imagem, g.alt || g.legenda, { tamanhos: "(min-width: 900px) 25vw, 50vw" })}${g.legenda ? `<figcaption>${esc(g.legenda)}</figcaption>` : ""}</figure>`).join("")}
    </div>
  </div>
</section>

<section class="secao secao--tinta regiao">
  <div class="envelope regiao__grade">
    <div>
      ${rotulo("05", "Onde atendemos", { claro: true })}
      <h2 class="titulo-2" data-esticar>${T("home.regiao_titulo")}</h2>
      <p>${P("home.regiao_texto")}</p>
      <a class="btn btn--linha-clara" href="/contato/">${ico("pino")} Ver no mapa</a>
    </div>
    <div class="polo" aria-label="Caruaru, Toritama e Santa Cruz do Capibaribe no Polo de Confecções do Agreste">
      <svg class="polo__linhas" viewBox="0 0 400 300" aria-hidden="true">
        <path d="M70 70 L210 120 L330 230" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="6 7"/>
      </svg>
      <span class="polo__ponto" style="--x:17.5%;--y:23%"><i></i>Santa Cruz do Capibaribe</span>
      <span class="polo__ponto" style="--x:52.5%;--y:40%"><i></i>Toritama</span>
      <span class="polo__ponto polo__ponto--aqui" style="--x:82.5%;--y:76.6%"><i></i>Caruaru<small>Corte Sam está aqui</small></span>
    </div>
  </div>
</section>

${avaliacoes.length ? `
<section class="secao secao--papel depoimentos">
  <div class="envelope">
    <header class="secao__cab">${rotulo("06", "Quem corta aqui")}<h2 class="titulo-2" data-esticar>O que dizem as <em>confecções</em>.</h2>${L.seloGoogle()}</header>
    <div class="depoimentos__lista">
      ${avaliacoes.map((a) => `<figure class="depoimento" data-revelar><div class="depoimento__nota" aria-label="${a.nota} de 5">${ico("estrela").repeat(a.nota)}</div><blockquote>${esc(a.texto)}</blockquote><figcaption>${esc(a.autor || "Cliente")}${a.empresa ? ` · ${esc(a.empresa)}` : ""}${a.do_google ? " <small>via Google</small>" : ""}</figcaption></figure>`).join("")}
    </div>
  </div>
</section>` : ""}

${posts.length ? `
<section class="secao secao--kraft">
  <div class="envelope">
    <header class="secao__cab secao__cab--linha">
      <div>${rotulo(avaliacoes.length ? "07" : "06", "Blog")}<h2 class="titulo-2" data-esticar>Para quem <em>vive de confecção</em>.</h2></div>
      <a class="link-seta" href="/blog/">Todos os textos ${ico("seta")}</a>
    </header>
    <div class="posts posts--tres">${posts.map((p) => cartaoPost(p)).join("")}</div>
  </div>
</section>` : ""}

${secaoFaq({ n: "" })}`;

  return L.pagina({
    caminho: "/", corpo, nonce: ctx.nonce, host: ctx.host, classe: "pg-inicio",
    jsonld: [{ "@context": "https://schema.org", "@type": "WebSite", "@id": L.SITE() + "/#site", name: c.nome, url: L.SITE() + "/", inLanguage: "pt-BR", publisher: { "@id": L.SITE() + "/#empresa" } }, ...jsonldFaq()],
  });
}

/* ================================================================ SERVIÇOS */
function servicos(ctx) {
  const lista = Q.todos("SELECT * FROM servicos WHERE ativo = 1 ORDER BY ordem, id");
  const corpo = `
${capaInterna({ n: "01", selo: "Serviços", titulo: "Corte e modelagem para <em>confecções</em>.", texto: "Do molde às partes cortadas: o que a Corte Sam faz na mesa de corte, em Caruaru.", trilha: [["Serviços", "/servicos/"]], imagem: "/assets/img/banco/corte-regua.webp" })}
<section class="secao secao--papel">
  <div class="envelope">
    <div class="servicos servicos--lista">
      ${lista.map((s, i) => `
      <a class="servico servico--largo" href="/servicos/${esc(s.slug)}/" data-revelar>
        <span class="servico__n">${String(i + 1).padStart(2, "0")}</span>
        <figure class="servico__foto">${foto(s.imagem, s.imagem_alt, { tamanhos: "(min-width: 900px) 46vw, calc(100vw - 32px)" })}</figure>
        <div class="servico__corpo">
          ${s.medida ? `<span class="servico__medida">${esc(s.medida)}</span>` : ""}
          <h2>${esc(s.titulo)}</h2>
          <p>${esc(s.resumo)}</p>
          <span class="link-seta">Ver o serviço ${ico("seta")}</span>
        </div>
      </a>`).join("") || `<p class="vazio">Os serviços estão sendo atualizados. <a href="/contato/">Fale com a gente</a>.</p>`}
    </div>
  </div>
</section>
${secaoFaq()}`;
  return L.pagina({
    titulo: "Serviços de corte de tecidos e modelagem em Caruaru", caminho: "/servicos/", corpo, nonce: ctx.nonce, host: ctx.host, classe: "pg-servicos",
    descricao: `Corte de tecidos, corte de modelos e modelagem para confecções em Caruaru-PE: ${lista.map((s) => s.titulo.toLowerCase()).join(", ")}. Agende o corte online.`,
    jsonld: [L.jsonldTrilha([["Início", "/"], ["Serviços", "/servicos/"]]), ...jsonldFaq()],
  });
}

function servico(ctx, slug) {
  const s = Q.um("SELECT * FROM servicos WHERE slug = ? AND ativo = 1", slug);
  if (!s) return null;
  const outros = Q.todos("SELECT * FROM servicos WHERE ativo = 1 AND id <> ? ORDER BY ordem, id", s.id);
  const para = emLinhas(s.para_quem).split("\n").map((l) => l.trim()).filter(Boolean);
  const c = L.casa();
  const msg = `Olá, Corte Sam! Vim pelo site e quero saber sobre ${s.titulo.toLowerCase()}.`;
  const corpo = `
${capaInterna({ n: "01", selo: "Serviço", titulo: esc(s.titulo), texto: esc(s.resumo), trilha: [["Serviços", "/servicos/"], [s.titulo, `/servicos/${s.slug}/`]], imagem: s.imagem, alt: s.imagem_alt })}
<section class="secao secao--papel">
  <div class="envelope artigo-grade">
    <article class="texto-rico">${sanitizarHtml(s.conteudo)}</article>
    <aside class="ficha" aria-label="Agendar ${esc(s.titulo)}">
      <p class="ficha__rotulo">Ficha do serviço</p>
      <h2>${esc(s.titulo)}</h2>
      ${s.medida ? `<p class="ficha__medida">${esc(s.medida)}</p>` : ""}
      ${para.length ? `<h3>Para quem</h3><ul class="ficha__lista">${para.map((p) => `<li>${ico("check")}<span>${esc(p)}</span></li>`).join("")}</ul>` : ""}
      <div class="ficha__botoes">
        <a class="btn btn--acao btn--bloco" href="/agendamento/?servico=${encodeURIComponent(s.titulo)}">${ico("calendario")} Agendar este serviço</a>
        ${c.zap(msg) ? `<a class="btn btn--linha btn--bloco" href="${esc(c.zap(msg))}" target="_blank" rel="noopener">${ico("zap")} Perguntar no WhatsApp</a>` : ""}
      </div>
      ${c.avisoZap ? `<p class="ficha__nota">${esc(c.avisoZap)}</p>` : ""}
    </aside>
  </div>
</section>
${outros.length ? `
<section class="secao secao--kraft">
  <div class="envelope">
    <header class="secao__cab">${rotulo("02", "Outros serviços")}<h2 class="titulo-2" data-esticar>Também na <em>nossa mesa</em>.</h2></header>
    <div class="servicos">${outros.map((o, i) => `<a class="servico" href="/servicos/${esc(o.slug)}/" data-revelar><span class="servico__n">${String(i + 1).padStart(2, "0")}</span><figure class="servico__foto">${foto(o.imagem, o.imagem_alt, { tamanhos: "(min-width: 900px) 30vw, (min-width: 600px) 46vw, calc(100vw - 32px)" })}</figure><div class="servico__corpo">${o.medida ? `<span class="servico__medida">${esc(o.medida)}</span>` : ""}<h3>${esc(o.titulo)}</h3><p>${esc(o.resumo)}</p></div><span class="servico__seta" aria-hidden="true">${ico("seta")}</span></a>`).join("")}</div>
  </div>
</section>` : ""}`;
  const ld = {
    "@context": "https://schema.org", "@type": "Service", name: s.titulo, serviceType: s.titulo,
    description: semHtml(s.resumo), url: L.absoluto(`/servicos/${s.slug}/`), image: s.imagem ? L.absoluto(s.imagem) : undefined,
    provider: { "@id": L.SITE() + "/#empresa" },
    areaServed: [{ "@type": "City", name: "Caruaru" }, { "@type": "AdministrativeArea", name: "Agreste de Pernambuco" }],
    audience: { "@type": "BusinessAudience", name: "Confecções e facções" },
  };
  return L.pagina({
    titulo: `${semHtml(s.titulo)} em Caruaru`, caminho: `/servicos/${s.slug}/`, corpo, nonce: ctx.nonce, host: ctx.host, classe: "pg-servico",
    descricao: `${semHtml(s.resumo)} Corte Sam, Caruaru-PE.`, imagem: s.imagem || undefined,
    jsonld: [ld, L.jsonldTrilha([["Início", "/"], ["Serviços", "/servicos/"], [semHtml(s.titulo), `/servicos/${s.slug}/`]])],
  });
}

/* ================================================================ AGENDAMENTO */
function agendamento(ctx, query = {}) {
  const c = L.casa();
  const enviado = query.enviado === "1";
  const pre = {
    servico: String(query.servico || "").slice(0, 80), tecido: String(query.tecido || "").slice(0, 40),
    pecas: query.pecas, folhas: query.folhas, metros: query.metros, origem: query.origem === "calculadora" ? "calculadora" : "",
  };
  const corpo = `
${capaInterna({ n: "↗", selo: "Agendamento", titulo: "Agende o seu <em>corte</em>.", texto: "Três passos, um minuto. O pedido chega na oficina e a confirmação vai para o seu WhatsApp.", trilha: [["Agendamento", "/agendamento/"]] })}
<section class="secao secao--papel">
  <div class="envelope agenda-grade">
    <div class="agenda-form">
      ${enviado ? `<div class="form__sucesso"><div class="ico-ok">${ico("check")}</div><h2>Pedido recebido!</h2><p>A Corte Sam confirma o horário pelo seu WhatsApp.</p></div>` : F.formAgendamento({ pre })}
    </div>
    <aside class="agenda-lado">
      <div class="cartao-info">
        <h2>${ico("relogio")} Atendimento</h2>
        ${L.linhasHorario(c, { classe: "lista-horario" })}
        ${c.avisoZap ? `<p>${esc(c.avisoZap)}</p>` : ""}
      </div>
      <div class="cartao-info">
        <h2>${ico("check")} O que levar</h2>
        <ul class="lista-check">
          <li>O tecido</li><li>O molde ou o risco de cada tamanho</li><li>A grade: quantas peças por tamanho</li><li>Detalhes do modelo (fio, estampa, forro)</li>
        </ul>
        <a class="link-seta" href="/blog/como-preparar-pedido-de-corte/">Checklist completo ${ico("seta")}</a>
      </div>
      <div class="cartao-info">
        <h2>${ico("pino")} Oficina</h2>
        <p>${esc(c.logradouro)}<br>${esc(c.bairro)} · ${esc(c.cidade)}/${esc(c.uf)}</p>
        <a class="link-seta" href="${esc(L.linkMaps(c))}" target="_blank" rel="noopener">Abrir no Google Maps ${ico("seta")}</a>
      </div>
    </aside>
  </div>
</section>`;
  return L.pagina({
    titulo: "Agendar corte de tecidos em Caruaru", caminho: "/agendamento/", corpo, nonce: ctx.nonce, host: ctx.host, classe: "pg-agenda", semChamada: true,
    descricao: "Agende online o corte de tecidos na Corte Sam, em Caruaru-PE. Escolha o dia e o horário; a confirmação chega pelo WhatsApp.",
    jsonld: [L.jsonldTrilha([["Início", "/"], ["Agendamento", "/agendamento/"]])],
  });
}

function agendamentoRecebido(ctx, codigo) {
  const a = Q.um("SELECT codigo, data, horario, servico FROM agendamentos WHERE codigo = ?", codigo);
  if (!a) return null;
  const c = L.casa();
  const quando = `${U.diaDaSemana(a.data)}, ${U.dataCurta(a.data)} às ${a.horario}`;
  const zap = c.zap(`Olá, Corte Sam! Pedi um agendamento pelo site.\nCódigo: ${a.codigo}\nQuando: ${quando}`);
  const corpo = `
<section class="secao secao--papel recebido">
  <div class="envelope envelope--estreito">
    <div class="form__sucesso form__sucesso--pagina">
      <div class="ico-ok">${ico("check")}</div>
      <p class="selo">Pedido recebido</p>
      <h1 class="titulo-2">Seu horário está <em>reservado</em> para confirmação.</h1>
      <p class="recebido__quando">${esc(quando)}${a.servico ? ` · ${esc(a.servico)}` : ""}</p>
      <div class="codigo" aria-label="Código do agendamento">${esc(a.codigo)}</div>
      <p>A Corte Sam confirma pelo seu WhatsApp em horário comercial. Guarde o código.</p>
      ${zap ? `<a class="btn btn--acao btn--lg" href="${esc(zap)}" target="_blank" rel="noopener">${ico("zap")} Avisar também pelo WhatsApp</a>` : ""}
      <p><a class="link-seta" href="/">Voltar ao início ${ico("seta")}</a></p>
    </div>
  </div>
</section>`;
  return L.pagina({ titulo: "Agendamento recebido", caminho: "/agendamento/recebido/", corpo, nonce: ctx.nonce, host: ctx.host, semIndice: true, semChamada: true });
}

/* ================================================================ CALCULADORA */
function calculadora(ctx, query = {}) {
  const lido = Calc.ler(query);
  const temErro = Object.keys(lido.erros).length;
  const r = lido.preenchido && !temErro ? Calc.calcular(lido.valores) : null;
  const v = (n) => esc(String(query[n] ?? (Calc.CAMPOS[n][2] === "" ? "" : Calc.CAMPOS[n][2])).slice(0, 12));
  const num = (n, d = 2) => n === null || n === undefined ? "—" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const erro = (n) => lido.preenchido && lido.erros[n] ? `<small class="campo__erro" role="alert">${esc(lido.erros[n])}</small>` : `<small class="campo__erro" data-erro="${n}" role="alert"></small>`;
  const linkAgenda = r ? `/agendamento/?origem=calculadora&folhas=${lido.valores.folhas}&metros=${r.metros}${r.pecas ? `&pecas=${r.pecas}` : ""}` : "/agendamento/";
  const corpo = `
${capaInterna({ n: "03", selo: "Ferramenta grátis", titulo: "Calculadora de <em>enfesto</em>.", texto: "Quanto tecido o corte vai consumir, quantas peças saem e quanto pesa a malha — antes de comprar o rolo.", trilha: [["Calculadora de enfesto", "/calculadora-de-enfesto/"]] })}
<section class="secao secao--papel">
  <div class="envelope calc">
    <form class="calc__form" method="get" action="/calculadora-de-enfesto/" data-calc="completa" novalidate>
      <fieldset>
        <legend><span>01</span>O risco e o enfesto</legend>
        <div class="form__grade">
          <div class="campo"><label for="c-comprimento">Comprimento do risco <span>metros</span></label><input id="c-comprimento" name="comprimento" inputmode="decimal" value="${v("comprimento")}" placeholder="2,40" required>${erro("comprimento")}</div>
          <div class="campo"><label for="c-folhas">Número de folhas</label><input id="c-folhas" name="folhas" inputmode="numeric" value="${v("folhas")}" placeholder="40" required>${erro("folhas")}</div>
          <div class="campo"><label for="c-pecas">Peças por risco <span>opcional</span></label><input id="c-pecas" name="pecas_risco" inputmode="numeric" value="${v("pecas_risco")}" placeholder="6">${erro("pecas_risco")}<small class="campo__dica">Quantas peças inteiras cabem no risco.</small></div>
          <div class="campo"><label for="c-folga">Folga em cada ponta <span>cm</span></label><input id="c-folga" name="folga" inputmode="decimal" value="${v("folga")}">${erro("folga")}<small class="campo__dica">Sobra no início e no fim de cada folha.</small></div>
          <div class="campo"><label for="c-sobra">Sobra de segurança <span>%</span></label><input id="c-sobra" name="sobra" inputmode="decimal" value="${v("sobra")}">${erro("sobra")}<small class="campo__dica">Para emenda ou defeito de rolo. Pode deixar 0.</small></div>
        </div>
      </fieldset>
      <fieldset>
        <legend><span>02</span>Peso da malha <small>opcional</small></legend>
        <div class="form__grade">
          <div class="campo"><label for="c-largura">Largura do tecido <span>metros</span></label><input id="c-largura" name="largura" inputmode="decimal" value="${v("largura")}" placeholder="1,80">${erro("largura")}</div>
          <div class="campo"><label for="c-gramatura">Gramatura <span>g/m²</span></label><input id="c-gramatura" name="gramatura" inputmode="numeric" value="${v("gramatura")}" placeholder="160">${erro("gramatura")}</div>
        </div>
      </fieldset>
      <button class="btn btn--acao btn--lg btn--bloco" type="submit">${ico("calc")} Calcular</button>
    </form>

    <div class="calc__resultado" data-calc-resultado aria-live="polite">
      <p class="ficha__rotulo">Resultado estimado</p>
      <div class="calc__numero"><small>Tecido no total</small><strong data-r="metros">${r ? num(r.metros) : "—"}</strong><span>metros</span></div>
      <dl class="calc__lista">
        <div><dt>Por folha</dt><dd><b data-r="metros_folha">${r ? num(r.metros_folha) : "—"}</b> m</dd></div>
        <div><dt>Peças cortadas</dt><dd><b data-r="pecas">${r && r.pecas ? r.pecas.toLocaleString("pt-BR") : "—"}</b></dd></div>
        <div><dt>Tecido por peça</dt><dd><b data-r="metros_peca">${r && r.metros_peca ? num(r.metros_peca, 3) : "—"}</b> m</dd></div>
        <div><dt>Peso estimado</dt><dd><b data-r="kg">${r && r.kg !== null ? num(r.kg) : "—"}</b> kg</dd></div>
      </dl>
      <p class="calc__aviso">Estimativa. Encolhimento, defeito de rolo e emendas mudam o consumo real — na dúvida, sobre um pouco.</p>
      <a class="btn btn--giz btn--bloco" href="${esc(linkAgenda)}" data-calc-agendar>${ico("calendario")} Agendar este corte</a>
    </div>

    <div class="calc__como texto-rico">
      <h2>Como a conta é feita</h2>
      <p><strong>Metros por folha</strong> = comprimento do risco + a folga das duas pontas.<br>
      <strong>Tecido no total</strong> = metros por folha × número de folhas (+ a sobra de segurança).<br>
      <strong>Peças</strong> = folhas × peças que cabem no risco.<br>
      <strong>Peso</strong> = metros × largura × gramatura ÷ 1000 — útil para malha, que se compra por quilo.</p>
      <p>Exemplo: risco de 2,40 m, 40 folhas e 2 cm de folga em cada ponta dão 2,44 m por folha e 97,6 m de tecido. Com 1,80 m de largura e 160 g/m², são cerca de 28,1 kg de malha.</p>
      <p>Quer entender o enfesto a fundo? Leia <a href="/blog/o-que-e-enfesto/">o que é enfesto e por que ele decide a qualidade do corte</a>.</p>
    </div>
  </div>
</section>`;
  return L.pagina({
    titulo: "Calculadora de enfesto: consumo de tecido e peso da malha", caminho: "/calculadora-de-enfesto/", corpo, nonce: ctx.nonce, host: ctx.host, classe: "pg-calc",
    descricao: "Calcule grátis quanto tecido o enfesto vai consumir: comprimento do risco × folhas, peças cortadas e peso da malha pela gramatura. Ferramenta da Corte Sam, Caruaru.",
    /* Resultado com parâmetros é a mesma página: o canonical sem query evita
       mil "páginas" iguais no Google. */
    semIndice: lido.preenchido,
    jsonld: [
      { "@context": "https://schema.org", "@type": "WebApplication", name: "Calculadora de enfesto", url: L.absoluto("/calculadora-de-enfesto/"), applicationCategory: "BusinessApplication", operatingSystem: "Qualquer navegador", offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" }, provider: { "@id": L.SITE() + "/#empresa" } },
      L.jsonldTrilha([["Início", "/"], ["Calculadora de enfesto", "/calculadora-de-enfesto/"]]),
    ],
  });
}

/* ================================================================ SOBRE */
function sobre(ctx) {
  const c = L.casa();
  const galeria = Q.todos("SELECT * FROM galeria WHERE ativo = 1 ORDER BY ordem, id");
  const corpo = `
${capaInterna({ n: "04", selo: "A oficina", titulo: T("sobre.titulo", "O corte certo, <em>desde 2017</em>."), texto: esc(c.lema) + ".", trilha: [["A oficina", "/sobre/"]] })}
<section class="secao secao--papel">
  <div class="envelope sobre-grade">
    <div class="texto-rico sobre__texto">${sanitizarHtml(txt("sobre.texto"))}</div>
    <div class="sobre__fotos">
      <figure data-revelar>${foto("/assets/img/oficina/samuel-fachada.webp", "Samuel em frente à placa da Corte Sam", { tamanhos: "(min-width: 900px) 22vw, 50vw" })}<figcaption>Samuel, na frente da oficina</figcaption></figure>
      <figure data-revelar>${foto("/assets/img/oficina/fachada-placa.webp", "Placa da Corte Sam com o lema O corte certo da moda", { tamanhos: "(min-width: 900px) 22vw, 50vw" })}<figcaption>A placa da Rua 27 de Janeiro</figcaption></figure>
    </div>
  </div>
  <div class="envelope">
    <dl class="fatos">
      ${c.desde ? `<div><dt>Desde</dt><dd>${esc(c.desde)}</dd></div>` : ""}
      <div><dt>Cidade</dt><dd>${esc(c.cidade)}/${esc(c.uf)}</dd></div>
      <div><dt>Atende</dt><dd>Polo do Agreste</dd></div>
      <div><dt>Ofício</dt><dd>Corte e modelagem</dd></div>
    </dl>
  </div>
</section>
${galeria.length ? `
<section class="secao secao--kraft">
  <div class="envelope">
    <header class="secao__cab">${rotulo("02", "Galeria")}<h2 class="titulo-2" data-esticar>Por dentro da <em>oficina</em>.</h2><p>Fotos reais da Corte Sam.</p></header>
    <div class="galeria">${galeria.map((g) => `<figure class="galeria__item" data-revelar>${foto(g.imagem, g.alt || g.legenda, { tamanhos: "(min-width: 900px) 33vw, 50vw" })}${g.legenda ? `<figcaption>${esc(g.legenda)}</figcaption>` : ""}</figure>`).join("")}</div>
  </div>
</section>` : ""}`;
  return L.pagina({
    titulo: "A oficina: corte e modelagem em Caruaru", caminho: "/sobre/", corpo, nonce: ctx.nonce, host: ctx.host, classe: "pg-sobre",
    descricao: `Conheça a Corte Sam: oficina de corte de tecidos e modelagem na Rua 27 de Janeiro, em Caruaru-PE${c.desde ? `, desde ${c.desde}` : ""}. ${c.lema}.`,
    imagem: "/assets/img/oficina/fachada-placa.webp",
    jsonld: [L.jsonldTrilha([["Início", "/"], ["A oficina", "/sobre/"]]), { "@context": "https://schema.org", "@type": "AboutPage", url: L.absoluto("/sobre/"), about: { "@id": L.SITE() + "/#empresa" } }],
  });
}

/* ================================================================ CONTATO */
function contato(ctx, query = {}) {
  const c = L.casa();
  const zap = c.zap(L.MSG_ZAP);
  const corpo = `
${capaInterna({ n: "05", selo: "Contato", titulo: "Venha até a <em>mesa de corte</em>.", texto: `${esc(c.logradouro)} · ${esc(c.bairro)} · ${esc(c.cidade)}/${esc(c.uf)}`, trilha: [["Contato", "/contato/"]] })}
<section class="secao secao--papel">
  <div class="envelope contato-grade">
    <div class="contato__cartoes">
      <div class="cartao-info">
        <h2>${ico("pino")} Endereço</h2>
        <address>${esc(c.logradouro)}<br>${esc(c.bairro)} · ${esc(c.cidade)}/${esc(c.uf)}${c.cep ? `<br>CEP ${esc(c.cep)}` : ""}</address>
        <a class="btn btn--acao btn--sm" href="${esc(L.linkMaps(c))}" target="_blank" rel="noopener">Traçar rota ${ico("seta")}</a>
      </div>
      <div class="cartao-info">
        <h2>${ico("relogio")} Horário</h2>
        ${L.linhasHorario(c, { classe: "lista-horario" })}
      </div>
      <div class="cartao-info">
        <h2>${ico("fone")} Fale com a gente</h2>
        <ul class="lista-contato">
          ${zap ? `<li>${ico("zap")}<a href="${esc(zap)}" target="_blank" rel="noopener">${esc(U.telefoneBonito(c.whatsapp))}</a> <small>WhatsApp</small></li>` : ""}
          ${c.telefone2 ? `<li>${ico("fone")}<a href="tel:+55${esc(U.soDigitos(c.telefone2))}">${esc(U.telefoneBonito(c.telefone2))}</a></li>` : ""}
          ${c.email ? `<li>${ico("email")}<a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>` : ""}
        </ul>
        ${c.avisoZap ? `<p><small>${esc(c.avisoZap)}</small></p>` : ""}
        ${c.pagamento ? `<p><small>Pagamento: ${esc(c.pagamento)}.</small></p>` : ""}
        ${L.seloGoogle()}
      </div>
    </div>
    <div class="mapa" data-mapa="${esc(L.mapaEmbutido(c))}">
      <div class="mapa__capa">
        ${ico("pino")}
        <p><strong>${esc(c.nome)}</strong><br>${esc(c.logradouro)} · ${esc(c.cidade)}</p>
        <button class="btn btn--linha btn--sm" type="button" data-carregar-mapa>Mostrar o mapa</button>
        <small>O mapa é do Google e só carrega se você pedir.</small>
      </div>
    </div>
  </div>
</section>
<section class="secao secao--kraft">
  <div class="envelope envelope--estreito">
    <header class="secao__cab">${rotulo("02", "Mensagem")}<h2 class="titulo-2" data-esticar>Prefere <em>escrever</em>?</h2><p>Para agendar corte, use o <a href="/agendamento/">agendamento</a> — é mais rápido.</p></header>
    ${query.enviado === "1" ? `<div class="form__sucesso"><div class="ico-ok">${ico("check")}</div><h3>Mensagem recebida!</h3><p>Respondemos em horário comercial.</p></div>` : F.formContato()}
  </div>
</section>`;
  return L.pagina({
    titulo: "Contato, endereço e horário", caminho: "/contato/", corpo, nonce: ctx.nonce, host: ctx.host, classe: "pg-contato",
    descricao: `Corte Sam: ${c.logradouro}, ${c.bairro}, ${c.cidade}-${c.uf}. ${c.horario ? c.horario.split("\n").join("; ") + "." : ""} WhatsApp ${U.telefoneBonito(c.whatsapp)}.`,
    jsonld: [L.jsonldTrilha([["Início", "/"], ["Contato", "/contato/"]]), { "@context": "https://schema.org", "@type": "ContactPage", url: L.absoluto("/contato/"), about: { "@id": L.SITE() + "/#empresa" } }],
  });
}

/* ================================================================ PRIVACIDADE */
function privacidade(ctx) {
  const c = L.casa();
  const corpo = `
${capaInterna({ selo: "LGPD", titulo: "Política de <em>privacidade</em>.", texto: "O que o site guarda, para quê e por quanto tempo.", trilha: [["Privacidade", "/privacidade/"]] })}
<section class="secao secao--papel">
  <div class="envelope envelope--estreito texto-rico">
    <h2>Quem cuida dos seus dados</h2>
    <p>${esc(c.razao || c.nome)}${c.cnpj ? `, CNPJ ${esc(c.cnpj)}` : ""}, nome de fantasia ${esc(c.nome)}, ${esc(c.logradouro)}, ${esc(c.cidade)}/${esc(c.uf)}. Contato para assuntos de privacidade: ${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : "pelo WhatsApp da oficina"}.</p>
    <h2>O que coletamos</h2>
    <ul>
      <li><strong>Agendamento:</strong> nome, confecção (opcional), WhatsApp, e-mail (opcional), serviço, tecido, quantidade de peças, data, horário e observações.</li>
      <li><strong>Mensagem de contato:</strong> nome, e-mail ou WhatsApp e o texto enviado.</li>
      <li><strong>Contagem de visitas:</strong> páginas vistas por dia e um código que não identifica ninguém (um resumo do endereço IP que muda todos os dias). Não usa cookie.</li>
    </ul>
    <h2>Para que usamos</h2>
    <p>Só para responder ao seu pedido: confirmar o agendamento, fazer o orçamento e combinar o corte. Não vendemos nem cedemos dados a ninguém, e não mandamos propaganda.</p>
    <h2>Cookies</h2>
    <p>O site só usa cookies de medição (Google Analytics e Meta Pixel) <strong>se você aceitar</strong> na faixa de cookies. Recusando, tudo funciona igual. O mapa do Google na página de contato só carrega quando você clica em "Mostrar o mapa".</p>
    <h2>Por quanto tempo</h2>
    <p>Pedidos e mensagens ficam guardados enquanto forem úteis para o atendimento e as obrigações legais da empresa. Você pode pedir a exclusão a qualquer momento.</p>
    <h2>Seus direitos</h2>
    <p>Pela Lei Geral de Proteção de Dados (Lei 13.709/2018), você pode pedir acesso, correção ou exclusão dos seus dados, e saber com quem foram compartilhados. É só falar com a gente pelo contato acima.</p>
  </div>
</section>`;
  return L.pagina({ titulo: "Política de privacidade", caminho: "/privacidade/", corpo, nonce: ctx.nonce, host: ctx.host, classe: "pg-texto", semChamada: true, descricao: "Política de privacidade da Corte Sam: quais dados o site coleta, para quê e como pedir a exclusão." });
}

/* ================================================================ 404 */
function naoEncontrada(ctx) {
  const corpo = `
<section class="secao secao--tinta nao-encontrada">
  <div class="envelope envelope--estreito">
    <p class="nao-encontrada__n" aria-hidden="true">4<span>0</span>4</p>
    <h1 class="titulo-2">Essa página saiu do <em>risco</em>.</h1>
    <p>O endereço não existe ou mudou de lugar.</p>
    <div class="capa__botoes">
      <a class="btn btn--giz" href="/">Ir para o início</a>
      <a class="btn btn--linha-clara" href="/servicos/">Ver os serviços</a>
    </div>
  </div>
</section>`;
  return L.pagina({ titulo: "Página não encontrada", caminho: "/404", corpo, nonce: ctx.nonce, host: ctx.host, semIndice: true, classe: "pg-404" });
}

module.exports = {
  home, servicos, servico, agendamento, agendamentoRecebido, calculadora, sobre, contato, privacidade, naoEncontrada,
  capaInterna, cartaoPost, rotulo, secaoFaq,
};
