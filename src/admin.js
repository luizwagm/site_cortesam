"use strict";
/* ==========================================================================
   API DO PAINEL — /api/admin/*

   A TELA NÃO DECIDE O QUE GRAVA. Cada tabela tem a lista de campos que
   aceita e o tipo de cada um; o que chega fora da lista é descartado,
   inclusive `id`. E cada rota diz a ÁREA que exige — `pode()` confere o papel
   no servidor, qualquer que seja o botão que a tela mostrou.

   Toda escrita vai para a auditoria com o nome de quem fez.
   ========================================================================== */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Q, txt, gravarTxt, auditar } = require("./db");
const { sanitizarHtml, semHtml, emLinhas } = require("./html-seguro");
const U = require("./util");
const S = require("./sessao");
const F = require("./formularios");
const Medicao = require("./medicao");
const Email = require("./email");
const L = require("./layout");

const RAIZ = path.join(__dirname, "..");
const UPLOADS = process.env.CORTESAM_UPLOADS || path.join(RAIZ, "assets", "img", "uploads");

class Recusa extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const exigir = (cond, status, msg) => { if (!cond) throw new Recusa(status, msg); };

/* --------------------------------------------------------- normalização */
const BOOL = (v) => (v === true || v === 1 || v === "1" || v === "true" || v === "on" ? 1 : 0);
const IMG_OK = /^\/assets\/img\/(uploads|banco|oficina)\/[a-z0-9._-]+\.(webp|jpe?g|png)$/i;
function normalizar(tipo, v, nome) {
  const [t, lim] = String(tipo).split(":");
  if (t === "bool") return BOOL(v);
  if (t === "int") {
    const n = Number(v);
    exigir(Number.isInteger(n), 400, `${nome}: número inteiro.`);
    return n;
  }
  if (t === "nota") { const n = Number(v); exigir(Number.isInteger(n) && n >= 1 && n <= 5, 400, "Nota de 1 a 5."); return n; }
  if (t === "img" || t === "img?") {
    const s = String(v || "").trim();
    if (!s && t === "img?") return "";
    exigir(IMG_OK.test(s) && !s.includes(".."), 400, `${nome}: escolha uma imagem enviada pelo painel.`);
    return s;
  }
  if (t === "url") {
    const s = String(v || "").trim();
    exigir(!s || /^https:\/\/[^\s<>"']+$/i.test(s), 400, `${nome}: endereço precisa começar com https://`);
    return s;
  }
  if (t === "texto") return U.limitar(semHtml(v), Number(lim) || 200);
  if (t === "longo") return U.limitar(emLinhas(v), Number(lim) || 2000);
  return String(v ?? "");
}

/* Tabelas simples: [área exigida, campos, obrigatórios]. */
const TABELAS = {
  galeria: ["galeria", { imagem: "img", legenda: "texto:120", alt: "texto:200", ordem: "int", ativo: "bool" }, ["imagem"]],
  avaliacoes: ["avaliacoes", { autor: "texto:80", empresa: "texto:80", texto: "texto:600", nota: "nota", do_google: "bool", ordem: "int", ativo: "bool" }, ["texto"]],
  faq: ["faq", { pergunta: "texto:200", resposta: "texto:1200", ordem: "int", ativo: "bool" }, ["pergunta", "resposta"]],
};
const ORDEM_PADRAO = { galeria: "ordem, id", avaliacoes: "ordem, id", faq: "ordem, id" };

function montar(tabela, corpo, parcial) {
  const [, campos, obrig] = TABELAS[tabela];
  const saida = {};
  for (const [nome, tipo] of Object.entries(campos)) {
    if (!(nome in corpo)) continue;
    saida[nome] = normalizar(tipo, corpo[nome], nome);
  }
  if (!parcial) for (const o of obrig) exigir(saida[o] !== undefined && saida[o] !== "", 400, `Preencha: ${o}.`);
  return saida;
}

/* ------------------------------------------------------------- upload
   Imagem conferida pelos BYTES, não pela extensão nem pelo tipo declarado.
   Nome SORTEADO: o enviado pode ter "../" ou sobrescrever outra foto. SVG fica
   fora: SVG é XML e executa script na origem do site. */
function salvarImagem(dataUrl) {
  const m = /^data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  exigir(m, 400, "Envie uma imagem JPG, PNG ou WEBP.");
  const b = Buffer.from(m[1], "base64");
  exigir(b.length <= 5 * 1024 * 1024, 413, "Imagem grande demais (máx. 5 MB).");
  let ext = "";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ext = "jpg";
  else if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ext = "png";
  else if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") ext = "webp";
  exigir(ext, 400, "O arquivo não é uma imagem JPG, PNG ou WEBP.");
  fs.mkdirSync(UPLOADS, { recursive: true });
  const nome = `${U.hojeLocal().slice(0, 7)}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS, nome), b);
  return `/assets/img/uploads/${nome}`;
}

/* ------------------------------------------------------------- textos */
function valorTexto(tipo, chave, v) {
  if (tipo === "rico") return sanitizarHtml(v);
  if (tipo === "titulo") return L.tituloRico(v);
  if (tipo === "longo") return U.limitar(emLinhas(v), 2000);
  if (tipo === "url") return normalizar("url", v, chave);
  if (tipo === "email") {
    const s = String(v || "").trim();
    if (!s) return "";
    const lista = s.split(/[,;\s]+/).filter(Boolean);
    exigir(lista.every(U.emailValido), 400, `E-mail inválido em "${chave}".`);
    return lista.join(", ");
  }
  if (tipo === "numero") { const s = String(v || "").trim(); exigir(!s || /^\d{1,6}$/.test(s), 400, `"${chave}" aceita só números.`); return s; }
  if (chave === "medicao.ga4") { const s = String(v || "").trim(); exigir(!s || Medicao.ga4Valido(s), 400, "O ID do GA4 tem o formato G-XXXXXXX."); return s; }
  if (chave === "medicao.pixel") { const s = String(v || "").trim(); exigir(!s || Medicao.pixelValido(s), 400, "O Pixel da Meta é só números."); return s; }
  if (chave === "medicao.search_console") {
    /* Aceita a tag inteira colada do Search Console e guarda só o código. */
    const s = String(v || "").trim(); const m = /content=["']([\w-]+)["']/.exec(s); const cod = m ? m[1] : s;
    exigir(!cod || /^[\w-]{10,80}$/.test(cod), 400, "Cole o código de verificação do Search Console."); return cod;
  }
  if (chave === "casa.lat" || chave === "casa.lng") { const s = String(v || "").trim(); exigir(!s || (/^-?\d{1,3}\.\d{3,9}$/.test(s) && Math.abs(Number(s)) <= 180), 400, "Coordenada no formato -8.2858682."); return s; }
  if (chave === "agenda.horarios") {
    const l = String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
    exigir(l.every((h) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(h)), 400, "Horários no formato 08:00, separados por vírgula.");
    return l.map((h) => h.padStart(5, "0")).join(", ");
  }
  if (chave === "agenda.dias_fechados") {
    const l = String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
    exigir(l.every((d) => /^[0-6]$/.test(d)) && l.length < 7, 400, "Dias de 0 (domingo) a 6 (sábado), separados por vírgula — e ao menos um dia aberto.");
    return [...new Set(l)].join(",");
  }
  return U.limitar(semHtml(v), 300);
}

/* ------------------------------------------------------------- agendamentos */
function linhaAgendamento(a) {
  const quando = `${U.diaDaSemana(a.data)}, ${U.dataCurta(a.data)} às ${a.horario}`;
  const primeiro = String(a.nome).split(" ")[0];
  return {
    ...a, quando, telefone_fmt: U.telefoneBonito(a.telefone),
    zap_confirmar: U.zap(a.telefone, `Olá, ${primeiro}! Aqui é da Corte Sam. Seu agendamento está CONFIRMADO ✅\n${quando}${a.servico ? `\n${a.servico}` : ""}\nCódigo: ${a.codigo}\nEndereço: ${txt("casa.logradouro")}, ${txt("casa.cidade")}.\nAté lá!`),
    zap_recusar: U.zap(a.telefone, `Olá, ${primeiro}! Aqui é da Corte Sam, sobre o seu agendamento de ${quando} (código ${a.codigo}): esse horário não está disponível. Podemos combinar outro?`),
    zap: U.zap(a.telefone),
  };
}

function periodo(p) {
  const hoje = U.hojeLocal();
  if (p === "hoje") return ["data = ?", [hoje]];
  if (p === "proximos") return ["data >= ?", [hoje]];
  if (p === "passados") return ["data < ?", [hoje]];
  return ["1 = 1", []];
}

/* ------------------------------------------------------------- painel */
function pendencias() {
  const p = [];
  if (!txt("google.link")) p.push({ onde: "textos", texto: "Sem link do Perfil da Empresa no Google: é ele que põe a Corte Sam no mapa da busca. Crie ou reivindique a ficha e cole o link em Textos → Redes e Google." });
  if (!txt("casa.horario")) p.push({ onde: "textos", texto: "Horário de atendimento em branco: o site pede para consultar pelo WhatsApp e o Google não recebe o horário." });
  else if (!L.horarioEstruturado(txt("casa.horario"))) p.push({ onde: "textos", texto: "O horário foi escrito de um jeito que o Google não entende (ex.: \"Segunda a sexta · 8h às 12h\"). O site mostra, mas o dado estruturado sai sem horário." });
  if (!txt("agenda.email_aviso")) p.push({ onde: "textos", texto: "Nenhum e-mail recebe os avisos de agendamento — eles só aparecem aqui no painel." });
  else if (!Email.ativo()) p.push({ onde: "servidor", texto: "O servidor está sem SMTP (CORTESAM_SMTP): os avisos por e-mail não saem. Os pedidos continuam chegando aqui." });
  if (Q.um("SELECT 1 FROM servicos WHERE slug = 'modelagem' AND ativo = 1")) p.push({ onde: "servicos", texto: "Confira o serviço \"Modelagem\": ele veio do nome da empresa (Corte e Modelagem). Se a oficina não faz mais molde, desative-o em Serviços." });
  if (!Q.um("SELECT 1 FROM avaliacoes WHERE ativo = 1")) p.push({ onde: "avaliacoes", texto: "Nenhum depoimento: a seção fica escondida. Peça a clientes que avaliem no Google e copie as melhores para cá." });
  if (!txt("medicao.ga4") && !txt("medicao.pixel")) p.push({ onde: "textos", texto: "GA4 e Meta Pixel não configurados (opcional). A contagem própria de visitas funciona sem eles." });
  if (!txt("medicao.search_console")) p.push({ onde: "textos", texto: "Search Console não verificado: sem ele não dá para acompanhar as buscas nem enviar o sitemap ao Google." });
  return p;
}

/* ================================================================ rotas */
async function rotear({ metodo, caminho, corpo, usuario, query, ip, seguro, token }) {
  const u = usuario;
  const quem = u ? u.usuario : "";
  const area = (a) => { exigir(u, 401, "Entre no painel."); exigir(S.pode(u, a), 403, "O seu papel não tem acesso a esta área."); };
  let m;

  /* ------------------------------------------------ entrar / sair / eu */
  if (caminho === "/entrar" && metodo === "POST") {
    const usuarioNome = U.limitar(corpo.usuario, 60).toLowerCase();
    const v = S.limitador.verificar("painel", ip, usuarioNome);
    if (!v.ok) return { status: 429, json: { erro: v.mensagem }, cabecalhos: { "Retry-After": String(v.esperar) } };
    const reg = Q.um("SELECT * FROM usuarios WHERE usuario = ? AND ativo = 1", usuarioNome);
    /* Mesmo trabalho com usuário inexistente: sem isto, a resposta rápida
       denunciaria quais nomes de usuário existem. */
    const ok = S.confere(corpo.senha, reg ? reg.senha : "00:00");
    if (!reg || !ok) {
      S.limitador.errou("painel", ip, usuarioNome);
      auditar(usuarioNome || "?", "login recusado", "", `ip ${ip}`);
      return { status: 401, json: { erro: "Usuário ou senha incorretos." } };
    }
    S.limitador.acertou("painel", ip, usuarioNome);
    const t = S.abrir(reg.id);
    auditar(reg.usuario, "entrou");
    return { status: 200, json: { ok: true, trocar_senha: !!reg.trocar_senha }, cabecalhos: { "Set-Cookie": S.cookie(t, seguro) } };
  }
  if (caminho === "/sair" && metodo === "POST") {
    return { status: 200, json: { ok: true }, cabecalhos: { "Set-Cookie": S.cookieSair(seguro) }, sair: true };
  }
  exigir(u, 401, "Entre no painel.");

  if (caminho === "/eu" && metodo === "GET") {
    return { status: 200, json: { usuario: { id: u.id, usuario: u.usuario, nome: u.nome, papel: u.papel, trocar_senha: !!u.trocar_senha }, areas: S.AREAS[u.papel], versao: L.VERSAO, site: L.SITE() } };
  }
  if (caminho === "/senha" && metodo === "POST") {
    const v = S.limitador.verificar("senha", ip, u.usuario);
    if (!v.ok) return { status: 429, json: { erro: v.mensagem } };
    const reg = Q.um("SELECT senha FROM usuarios WHERE id = ?", u.id);
    if (!S.confere(corpo.atual, reg.senha)) { S.limitador.errou("senha", ip, u.usuario); return { status: 400, json: { erro: "A senha atual não confere." } }; }
    const ruim = S.senhaBoa(corpo.nova); exigir(!ruim, 400, ruim);
    Q.roda("UPDATE usuarios SET senha = ?, trocar_senha = 0 WHERE id = ?", S.cifrar(corpo.nova), u.id);
    S.fecharTodas(u.id, token);
    auditar(quem, "trocou a própria senha");
    return { status: 200, json: { ok: true } };
  }

  /* /eu e /senha valem para qualquer papel; daqui para baixo, a troca de
     senha provisória é obrigatória: quem recebeu a senha por mensagem não
     mexe em nada antes de trocar. */
  exigir(!u.trocar_senha, 403, "Troque a senha provisória antes de continuar.");

  /* ------------------------------------------------------------ painel */
  if (caminho === "/painel" && metodo === "GET") {
    area("painel");
    const hoje = U.hojeLocal();
    const j = { hoje };
    if (S.pode(u, "agendamentos")) {
      j.agenda_hoje = Q.um("SELECT COUNT(*) n FROM agendamentos WHERE data = ? AND status IN ('pendente','confirmado')", hoje).n;
      j.agenda_pendentes = Q.um("SELECT COUNT(*) n FROM agendamentos WHERE status = 'pendente' AND data >= ?", hoje).n;
      j.agenda_semana = Q.todos(`SELECT data, COUNT(*) n FROM agendamentos WHERE data BETWEEN ? AND ? AND status IN ('pendente','confirmado') GROUP BY data ORDER BY data`, hoje, U.somarDias(hoje, 13));
      j.proximos = Q.todos("SELECT * FROM agendamentos WHERE data >= ? AND status IN ('pendente','confirmado') ORDER BY data, horario LIMIT 8", hoje).map(linhaAgendamento);
    }
    if (S.pode(u, "mensagens")) j.mensagens_novas = Q.um("SELECT COUNT(*) n FROM mensagens WHERE lida = 0").n;
    if (S.pode(u, "blog")) j.blog = Q.um("SELECT COUNT(*) n, COALESCE(SUM(publicado = 0), 0) rascunhos FROM posts");
    if (S.pode(u, "acessos")) {
      j.acessos_hoje = Q.um("SELECT COALESCE(SUM(n),0) n FROM acessos WHERE dia = ?", hoje).n;
      j.visitantes_hoje = Q.um("SELECT COUNT(*) n FROM visitantes WHERE dia = ?", hoje).n;
      j.visitantes_7 = Q.um("SELECT COUNT(*) n FROM visitantes WHERE dia >= ?", U.somarDias(hoje, -6)).n;
      j.pendencias = pendencias();
    }
    return { status: 200, json: j };
  }

  /* ------------------------------------------------------ agendamentos */
  if (caminho === "/agendamentos" && metodo === "GET") {
    area("agendamentos");
    const [w, p] = periodo(query.periodo || "proximos");
    const cond = [w], par = [...p];
    if (query.status) { cond.push("status = ?"); par.push(String(query.status)); }
    if (query.q) {
      cond.push("(nome LIKE ? OR empresa LIKE ? OR telefone LIKE ? OR codigo LIKE ?)");
      const q = `%${String(query.q).slice(0, 40)}%`;
      par.push(q, q, `%${U.soDigitos(query.q) || "§"}%`, q.toUpperCase());
    }
    const ordem = query.periodo === "passados" ? "data DESC, horario DESC" : "data, horario";
    return { status: 200, json: { agendamentos: Q.todos(`SELECT * FROM agendamentos WHERE ${cond.join(" AND ")} ORDER BY ${ordem} LIMIT 300`, ...par).map(linhaAgendamento) } };
  }
  if (caminho === "/agendamentos" && metodo === "POST") {
    area("agendamentos");
    /* Agendamento que chegou por telefone: mesmas regras do site, e já confirmado. */
    const v = F.validarAgendamento(corpo);
    if (v.erros) return { status: 422, json: { erro: "Confira os campos.", erros: v.erros } };
    const d = v.dados;
    let codigo;
    for (let i = 0; i < 5; i++) { codigo = U.codigo(); if (!Q.um("SELECT 1 FROM agendamentos WHERE codigo=?", codigo)) break; }
    Q.roda(`INSERT INTO agendamentos (codigo, nome, empresa, telefone, email, servico, tecido, pecas, data, horario, observacoes, origem, status, atualizado_por)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,'painel','confirmado',?)`, codigo, d.nome, d.empresa, d.telefone, d.email, d.servico, d.tecido, d.pecas, d.data, d.horario, d.observacoes, quem);
    auditar(quem, "agendamento lançado no painel", codigo, `${d.data} ${d.horario}`);
    return { status: 201, json: { ok: true, codigo } };
  }
  if ((m = /^\/agendamentos\/(\d+)$/.exec(caminho)) && metodo === "PUT") {
    area("agendamentos");
    const a = Q.um("SELECT * FROM agendamentos WHERE id = ?", Number(m[1]));
    exigir(a, 404, "Agendamento não encontrado.");
    const novo = { status: a.status, nota: a.nota, data: a.data, horario: a.horario };
    if (corpo.status !== undefined) { exigir(["pendente", "confirmado", "recusado", "cancelado", "concluido"].includes(corpo.status), 400, "Situação inválida."); novo.status = corpo.status; }
    if (corpo.nota !== undefined) novo.nota = U.limitar(semHtml(corpo.nota), 1000);
    if (corpo.data !== undefined) { exigir(F.dataReal(corpo.data), 400, "Data inválida."); novo.data = corpo.data; }
    if (corpo.horario !== undefined) { exigir(/^([01]\d|2[0-3]):[0-5]\d$/.test(corpo.horario), 400, "Horário inválido."); novo.horario = corpo.horario; }
    Q.roda("UPDATE agendamentos SET status=?, nota=?, data=?, horario=?, atualizado=datetime('now'), atualizado_por=? WHERE id=?",
      novo.status, novo.nota, novo.data, novo.horario, quem, a.id);
    auditar(quem, "agendamento alterado", a.codigo, Object.entries(novo).filter(([k, v]) => v !== a[k]).map(([k, v]) => `${k}: ${k === "nota" ? "(nota)" : a[k] + " → " + v}`).join("; "));
    return { status: 200, json: { ok: true, agendamento: linhaAgendamento(Q.um("SELECT * FROM agendamentos WHERE id = ?", a.id)) } };
  }

  /* --------------------------------------------------------- mensagens */
  if (caminho === "/mensagens" && metodo === "GET") {
    area("mensagens");
    return { status: 200, json: { mensagens: Q.todos("SELECT * FROM mensagens ORDER BY lida, criado DESC LIMIT 300") } };
  }
  if ((m = /^\/mensagens\/(\d+)$/.exec(caminho))) {
    area("mensagens");
    const msg = Q.um("SELECT id FROM mensagens WHERE id = ?", Number(m[1])); exigir(msg, 404, "Mensagem não encontrada.");
    if (metodo === "PUT") { Q.roda("UPDATE mensagens SET lida = ? WHERE id = ?", BOOL(corpo.lida), msg.id); return { status: 200, json: { ok: true } }; }
    if (metodo === "DELETE") { Q.roda("DELETE FROM mensagens WHERE id = ?", msg.id); auditar(quem, "mensagem apagada", `#${msg.id}`); return { status: 200, json: { ok: true } }; }
  }

  /* ---------------------------------------------------------- serviços */
  if (caminho === "/servicos" && metodo === "GET") {
    area("servicos");
    return { status: 200, json: { servicos: Q.todos("SELECT * FROM servicos ORDER BY ordem, id") } };
  }
  if ((caminho === "/servicos" && metodo === "POST") || ((m = /^\/servicos\/(\d+)$/.exec(caminho)) && metodo === "PUT")) {
    area("servicos");
    const id = m ? Number(m[1]) : null;
    const atual = id ? Q.um("SELECT * FROM servicos WHERE id = ?", id) : null;
    if (id) exigir(atual, 404, "Serviço não encontrado.");
    const titulo = U.limitar(semHtml(corpo.titulo ?? atual?.titulo), 80);
    exigir(titulo.length >= 3, 400, "Dê um nome ao serviço.");
    /* O slug NASCE do título e CONGELA: renomear "Corte de tecidos" para
       "Corte de tecido" não pode derrubar o link que o Google já guardou. */
    let slug = atual ? atual.slug : U.slugify(corpo.slug || titulo);
    if (!atual) { let n = 2; const base = slug; while (Q.um("SELECT 1 FROM servicos WHERE slug = ?", slug)) slug = `${base}-${n++}`; }
    const d = {
      titulo, slug,
      resumo: U.limitar(semHtml(corpo.resumo ?? atual?.resumo ?? ""), 220),
      conteudo: sanitizarHtml(corpo.conteudo ?? atual?.conteudo ?? ""),
      para_quem: U.limitar(emLinhas(corpo.para_quem ?? atual?.para_quem ?? ""), 800),
      imagem: corpo.imagem !== undefined ? normalizar("img?", corpo.imagem, "Imagem") : (atual?.imagem || ""),
      imagem_alt: U.limitar(semHtml(corpo.imagem_alt ?? atual?.imagem_alt ?? ""), 200),
      medida: U.limitar(semHtml(corpo.medida ?? atual?.medida ?? ""), 30),
      ordem: corpo.ordem !== undefined ? normalizar("int", Number(corpo.ordem) || 0, "Ordem") : (atual ? atual.ordem : (Q.um("SELECT COALESCE(MAX(ordem),0)+1 n FROM servicos").n)),
      ativo: corpo.ativo !== undefined ? BOOL(corpo.ativo) : (atual ? atual.ativo : 1),
    };
    exigir(d.resumo.length >= 10, 400, "Escreva o resumo (uma frase) — é o texto do cartão e do Google.");
    if (id) {
      Q.roda("UPDATE servicos SET titulo=?, resumo=?, conteudo=?, para_quem=?, imagem=?, imagem_alt=?, medida=?, ordem=?, ativo=?, atualizado=datetime('now') WHERE id=?",
        d.titulo, d.resumo, d.conteudo, d.para_quem, d.imagem, d.imagem_alt, d.medida, d.ordem, d.ativo, id);
      auditar(quem, "serviço alterado", d.slug, d.ativo ? "ativo" : "desativado");
    } else {
      const novo = Number(Q.roda("INSERT INTO servicos (slug, titulo, resumo, conteudo, para_quem, imagem, imagem_alt, medida, ordem, ativo) VALUES (?,?,?,?,?,?,?,?,?,?)",
        d.slug, d.titulo, d.resumo, d.conteudo, d.para_quem, d.imagem, d.imagem_alt, d.medida, d.ordem, d.ativo).lastInsertRowid);
      auditar(quem, "serviço criado", d.slug);
      return { status: 201, json: { ok: true, id: novo, slug: d.slug } };
    }
    return { status: 200, json: { ok: true, id, slug: d.slug } };
  }
  if ((m = /^\/servicos\/(\d+)$/.exec(caminho)) && metodo === "DELETE") {
    area("servicos");
    const s = Q.um("SELECT slug FROM servicos WHERE id = ?", Number(m[1])); exigir(s, 404, "Serviço não encontrado.");
    Q.roda("DELETE FROM servicos WHERE id = ?", Number(m[1]));
    auditar(quem, "serviço apagado", s.slug);
    return { status: 200, json: { ok: true } };
  }

  /* ------------------------------------------------ tabelas simples */
  if ((m = /^\/t\/([a-z_]+)(?:\/(\d+))?$/.exec(caminho)) && Object.hasOwn(TABELAS, m[1])) {
    const tabela = m[1], id = m[2] ? Number(m[2]) : null;
    area(TABELAS[tabela][0]);
    if (!id && metodo === "GET") return { status: 200, json: { itens: Q.todos(`SELECT * FROM ${tabela} ORDER BY ${ORDEM_PADRAO[tabela]}`) } };
    if (!id && metodo === "POST") {
      const d = montar(tabela, corpo, false);
      if (d.ordem === undefined) d.ordem = Q.um(`SELECT COALESCE(MAX(ordem), 0) + 1 n FROM ${tabela}`).n;
      const cols = Object.keys(d);
      const novoId = Number(Q.roda(`INSERT INTO ${tabela} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, ...cols.map((c) => d[c])).lastInsertRowid);
      auditar(quem, `${tabela}: criou`, `#${novoId}`, d.pergunta || d.legenda || d.texto || "");
      return { status: 201, json: { ok: true, id: novoId } };
    }
    if (id) {
      const atual = Q.um(`SELECT * FROM ${tabela} WHERE id = ?`, id); exigir(atual, 404, "Item não encontrado.");
      if (metodo === "PUT") {
        const d = montar(tabela, corpo, true);
        const cols = Object.keys(d);
        if (cols.length) Q.roda(`UPDATE ${tabela} SET ${cols.map((c) => c + " = ?").join(", ")} WHERE id = ?`, ...cols.map((c) => d[c]), id);
        auditar(quem, `${tabela}: alterou`, `#${id}`, atual.pergunta || atual.legenda || atual.texto || "");
        return { status: 200, json: { ok: true } };
      }
      if (metodo === "DELETE") {
        Q.roda(`DELETE FROM ${tabela} WHERE id = ?`, id);
        auditar(quem, `${tabela}: apagou`, `#${id}`, atual.pergunta || atual.legenda || atual.texto || "");
        return { status: 200, json: { ok: true } };
      }
    }
  }

  /* -------------------------------------------------------------- blog */
  if (caminho === "/blog" && metodo === "GET") {
    area("blog");
    return { status: 200, json: { posts: Q.todos("SELECT id, title, slug, date, publicado, image, autor, tema FROM posts ORDER BY date DESC, id DESC") } };
  }
  if ((m = /^\/blog\/(\d+)$/.exec(caminho)) && metodo === "GET") {
    area("blog");
    const p = Q.um("SELECT * FROM posts WHERE id = ?", Number(m[1])); exigir(p, 404, "Texto não encontrado.");
    return { status: 200, json: { post: p } };
  }
  if ((caminho === "/blog" && metodo === "POST") || ((m = /^\/blog\/(\d+)$/.exec(caminho)) && metodo === "PUT")) {
    area("blog");
    const id = m ? Number(m[1]) : null;
    const atual = id ? Q.um("SELECT * FROM posts WHERE id = ?", id) : null;
    if (id) exigir(atual, 404, "Texto não encontrado.");
    const title = U.limitar(semHtml(corpo.title ?? atual?.title), 200);
    exigir(title.length >= 4, 400, "Dê um título ao texto.");
    const date = String(corpo.date ?? atual?.date ?? U.hojeLocal());
    exigir(F.dataReal(date), 400, "Data inválida.");
    const publicado = corpo.publicado !== undefined ? BOOL(corpo.publicado) : (atual ? atual.publicado : 0);
    /* Slug: livre enquanto é rascunho; publicado uma vez, congela (o link
       já pode estar no Google ou num grupo de WhatsApp). */
    const congelado = atual && atual.publicado === 1 && atual.date <= U.hojeLocal();
    let slug = congelado ? atual.slug : U.slugify(corpo.slug || atual?.slug || title);
    if (!congelado && Q.um("SELECT id FROM posts WHERE slug = ? AND id <> ?", slug, id || 0)) {
      let n = 2; const base = slug; while (Q.um("SELECT 1 FROM posts WHERE slug = ? AND id <> ?", `${base}-${n}`, id || 0)) n++; slug = `${base}-${n}`;
    }
    const d = {
      title, slug, date, publicado,
      excerpt: U.limitar(semHtml(corpo.excerpt ?? atual?.excerpt ?? ""), 300),
      content: sanitizarHtml(corpo.content ?? atual?.content ?? ""),
      image: corpo.image !== undefined ? normalizar("img?", corpo.image, "Imagem") : (atual?.image || ""),
      image_alt: U.limitar(semHtml(corpo.image_alt ?? atual?.image_alt ?? ""), 200),
      autor: U.limitar(semHtml(corpo.autor ?? atual?.autor ?? u.nome), 80),
      tema: U.limitar(semHtml(corpo.tema ?? atual?.tema ?? ""), 30),
    };
    exigir(semHtml(d.content).length >= 20, 400, "Escreva o texto.");
    if (id) {
      Q.roda(`UPDATE posts SET title=?, slug=?, date=?, excerpt=?, content=?, image=?, image_alt=?, autor=?, tema=?, publicado=?, atualizado=datetime('now') WHERE id=?`,
        d.title, d.slug, d.date, d.excerpt, d.content, d.image, d.image_alt, d.autor, d.tema, d.publicado, id);
      auditar(quem, "texto do blog alterado", d.slug, d.publicado ? "publicado" : "rascunho");
      return { status: 200, json: { ok: true, id, slug: d.slug } };
    }
    const novoId = Number(Q.roda(`INSERT INTO posts (title, slug, date, excerpt, content, image, image_alt, autor, tema, publicado, criado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      d.title, d.slug, d.date, d.excerpt, d.content, d.image, d.image_alt, d.autor, d.tema, d.publicado, quem).lastInsertRowid);
    auditar(quem, "texto do blog criado", d.slug, d.publicado ? "publicado" : "rascunho");
    return { status: 201, json: { ok: true, id: novoId, slug: d.slug } };
  }
  if ((m = /^\/blog\/(\d+)$/.exec(caminho)) && metodo === "DELETE") {
    area("blog");
    const p = Q.um("SELECT slug FROM posts WHERE id = ?", Number(m[1])); exigir(p, 404, "Texto não encontrado.");
    Q.roda("DELETE FROM posts WHERE id = ?", Number(m[1]));
    auditar(quem, "texto do blog apagado", p.slug);
    return { status: 200, json: { ok: true } };
  }

  /* ------------------------------------------------------------ upload */
  if (caminho === "/upload" && metodo === "POST") {
    area("upload");
    const caminhoImg = salvarImagem(corpo.dataUrl);
    auditar(quem, "imagem enviada", caminhoImg);
    return { status: 201, json: { ok: true, caminho: caminhoImg } };
  }

  /* ------------------------------------------------------------ textos */
  if (caminho === "/textos" && metodo === "GET") {
    area("textos");
    return { status: 200, json: { textos: Q.todos("SELECT * FROM config ORDER BY ordem"), servidor: { smtp: Email.ativo(), site: L.SITE(), indexavel: L.indexavel() } } };
  }
  if (caminho === "/textos" && metodo === "PUT") {
    area("textos");
    const valores = corpo.valores && typeof corpo.valores === "object" ? corpo.valores : {};
    const mudou = [];
    Q.transacao(() => {
      for (const [chave, v] of Object.entries(valores)) {
        const reg = Q.um("SELECT tipo, valor FROM config WHERE chave = ?", chave);
        if (!reg) continue;
        const novo = valorTexto(reg.tipo, chave, v);
        if (novo !== reg.valor) { gravarTxt(chave, novo); mudou.push(chave); }
      }
    });
    if (mudou.length) auditar(quem, "textos alterados", "", mudou.join(", "));
    return { status: 200, json: { ok: true, alterados: mudou } };
  }

  /* ---------------------------------------------------------- usuários */
  if (caminho === "/usuarios" && metodo === "GET") {
    area("usuarios");
    return { status: 200, json: { usuarios: Q.todos("SELECT id, usuario, nome, email, papel, ativo, trocar_senha, criado, entrou FROM usuarios ORDER BY ativo DESC, nome"), papeis: S.PAPEIS } };
  }
  if (caminho === "/usuarios" && metodo === "POST") {
    area("usuarios");
    const usuarioNome = String(corpo.usuario || "").trim().toLowerCase();
    exigir(/^[a-z0-9._-]{3,30}$/.test(usuarioNome), 400, "Usuário: 3 a 30 letras minúsculas, números, ponto ou traço.");
    exigir(!Q.um("SELECT 1 FROM usuarios WHERE usuario = ?", usuarioNome), 409, "Esse usuário já existe.");
    exigir(S.PAPEIS.includes(corpo.papel), 400, "Escolha o papel.");
    const nome = U.limitar(semHtml(corpo.nome), 80); exigir(nome.length >= 2, 400, "Informe o nome.");
    const email = U.limitar(corpo.email, 120); exigir(!email || U.emailValido(email), 400, "E-mail inválido.");
    const senha = crypto.randomBytes(9).toString("base64url");
    Q.roda("INSERT INTO usuarios (usuario, nome, email, senha, papel, trocar_senha) VALUES (?,?,?,?,?,1)", usuarioNome, nome, email, S.cifrar(senha), corpo.papel);
    auditar(quem, "usuário criado", usuarioNome, corpo.papel);
    return { status: 201, json: { ok: true, senha_provisoria: senha } };
  }
  if ((m = /^\/usuarios\/(\d+)(\/senha)?$/.exec(caminho)) && (metodo === "PUT" || metodo === "POST")) {
    area("usuarios");
    const alvo = Q.um("SELECT * FROM usuarios WHERE id = ?", Number(m[1])); exigir(alvo, 404, "Usuário não encontrado.");
    if (m[2]) {
      exigir(metodo === "POST", 405, "Use POST.");
      const senha = crypto.randomBytes(9).toString("base64url");
      Q.roda("UPDATE usuarios SET senha = ?, trocar_senha = 1 WHERE id = ?", S.cifrar(senha), alvo.id);
      S.fecharTodas(alvo.id, alvo.id === u.id ? token : "");
      auditar(quem, "senha redefinida", alvo.usuario);
      return { status: 200, json: { ok: true, senha_provisoria: senha } };
    }
    exigir(metodo === "PUT", 405, "Use PUT.");
    const papel = corpo.papel !== undefined ? corpo.papel : alvo.papel;
    const ativo = corpo.ativo !== undefined ? BOOL(corpo.ativo) : alvo.ativo;
    exigir(S.PAPEIS.includes(papel), 400, "Papel inválido.");
    if (alvo.id === u.id) exigir(ativo === 1 && papel === "administrador", 409, "Você não pode tirar o seu próprio acesso de administrador.");
    if (alvo.papel === "administrador" && (papel !== "administrador" || !ativo))
      exigir(Q.um("SELECT COUNT(*) n FROM usuarios WHERE papel = 'administrador' AND ativo = 1 AND id <> ?", alvo.id).n > 0, 409, "É preciso ficar ao menos um administrador ativo.");
    const nome = corpo.nome !== undefined ? U.limitar(semHtml(corpo.nome), 80) : alvo.nome;
    const email = corpo.email !== undefined ? U.limitar(corpo.email, 120) : alvo.email;
    exigir(nome.length >= 2, 400, "Informe o nome.");
    exigir(!email || U.emailValido(email), 400, "E-mail inválido.");
    Q.roda("UPDATE usuarios SET nome = ?, email = ?, papel = ?, ativo = ? WHERE id = ?", nome, email, papel, ativo, alvo.id);
    if (!ativo || papel !== alvo.papel) S.fecharTodas(alvo.id);
    auditar(quem, "usuário alterado", alvo.usuario, `${alvo.papel}/${alvo.ativo} → ${papel}/${ativo}`);
    return { status: 200, json: { ok: true } };
  }

  /* --------------------------------------------------------- auditoria */
  if (caminho === "/auditoria" && metodo === "GET") {
    area("auditoria");
    const pg = Math.max(1, Number(query.pagina) || 1);
    const total = Q.um("SELECT COUNT(*) n FROM auditoria").n;
    return { status: 200, json: { total, pagina: pg, por_pagina: 50, itens: Q.todos("SELECT * FROM auditoria ORDER BY id DESC LIMIT 50 OFFSET ?", (pg - 1) * 50) } };
  }

  /* ----------------------------------------------------------- acessos */
  if (caminho === "/acessos" && metodo === "GET") {
    area("acessos");
    const dias = Math.min(90, Math.max(7, Number(query.dias) || 30));
    const desde = U.somarDias(U.hojeLocal(), -(dias - 1));
    const porDia = Q.todos("SELECT dia, SUM(n) n FROM acessos WHERE dia >= ? GROUP BY dia ORDER BY dia", desde);
    const unicos = Q.todos("SELECT dia, COUNT(*) n FROM visitantes WHERE dia >= ? GROUP BY dia", desde);
    const paginas = Q.todos("SELECT caminho, SUM(n) n FROM acessos WHERE dia >= ? GROUP BY caminho ORDER BY n DESC LIMIT 15", desde);
    return { status: 200, json: { desde, dias, porDia, unicos, paginas } };
  }

  return null;
}

module.exports = { rotear, Recusa, salvarImagem, TABELAS, normalizar, pendencias, valorTexto, linhaAgendamento, UPLOADS };
