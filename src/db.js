"use strict";
/* ==========================================================================
   BANCO — SQLite (better-sqlite3, síncrono)

   Síncrono de propósito: uma página inteira é montada sem nenhum `await` no
   meio, então dois pedidos simultâneos nunca enxergam metade de uma gravação
   um do outro. Para uma oficina de corte, o gargalo nunca vai ser o banco.

   O arquivo mora em data/ (fora do git, fora da web). CORTESAM_DADOS aponta
   outra pasta — é assim que a suíte de provas roda num banco descartável
   sem tocar no do cliente.
   ========================================================================== */
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const DIR = process.env.CORTESAM_DADOS || path.join(__dirname, "..", "data");
fs.mkdirSync(DIR, { recursive: true });
const db = new Database(path.join(DIR, "site.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 4000");

db.exec(`
CREATE TABLE IF NOT EXISTS config (
  chave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL DEFAULT '',
  grupo  TEXT NOT NULL DEFAULT 'geral',
  rotulo TEXT NOT NULL DEFAULT '',
  ajuda  TEXT NOT NULL DEFAULT '',
  tipo   TEXT NOT NULL DEFAULT 'texto',      -- texto | longo | titulo | rico | url | numero | email
  ordem  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS usuarios (
  id      INTEGER PRIMARY KEY,
  usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nome    TEXT NOT NULL,
  email   TEXT NOT NULL DEFAULT '',
  senha   TEXT NOT NULL,                     -- sal:hash (scrypt)
  papel   TEXT NOT NULL CHECK (papel IN ('administrador','redator')),
  ativo   INTEGER NOT NULL DEFAULT 1,
  trocar_senha INTEGER NOT NULL DEFAULT 0,
  criado  TEXT NOT NULL DEFAULT (datetime('now')),
  entrou  TEXT
);

CREATE TABLE IF NOT EXISTS sessoes (
  token      TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira     TEXT NOT NULL,
  criado     TEXT NOT NULL DEFAULT (datetime('now'))
);

/* Blog. As colunas seguem o formato do conector do LA Publisher
   (title, slug, excerpt, content, image, date) — se um dia o cliente quiser
   escrever por lá, a tabela já recebe sem adaptador. */
CREATE TABLE IF NOT EXISTS posts (
  id        INTEGER PRIMARY KEY,
  title     TEXT NOT NULL,
  slug      TEXT NOT NULL UNIQUE,
  excerpt   TEXT NOT NULL DEFAULT '',
  content   TEXT NOT NULL DEFAULT '',
  image     TEXT NOT NULL DEFAULT '',
  image_alt TEXT NOT NULL DEFAULT '',
  date      TEXT NOT NULL,
  sort      INTEGER NOT NULL DEFAULT 0,
  publicado INTEGER NOT NULL DEFAULT 1,
  autor     TEXT NOT NULL DEFAULT '',
  tema      TEXT NOT NULL DEFAULT '',         -- rótulo curto: "Enfesto", "Tecidos"…
  criado_por TEXT NOT NULL DEFAULT '',
  atualizado TEXT NOT NULL DEFAULT (datetime('now'))
);

/* Serviços com página própria (/servicos/<slug>/). O slug CONGELA depois de
   publicado: mudar o título não pode quebrar o link que o Google já guardou
   (lição do Alafcell 0.13.0). */
CREATE TABLE IF NOT EXISTS servicos (
  id        INTEGER PRIMARY KEY,
  slug      TEXT NOT NULL UNIQUE,
  titulo    TEXT NOT NULL,
  resumo    TEXT NOT NULL DEFAULT '',        -- uma frase: cartão e descrição do Google
  conteudo  TEXT NOT NULL DEFAULT '',        -- rico
  para_quem TEXT NOT NULL DEFAULT '',        -- longo: uma linha por item
  imagem    TEXT NOT NULL DEFAULT '',
  imagem_alt TEXT NOT NULL DEFAULT '',
  medida    TEXT NOT NULL DEFAULT '',        -- o "número" do cartão, em mono: "até 60 folhas"
  ordem     INTEGER NOT NULL DEFAULT 0,
  ativo     INTEGER NOT NULL DEFAULT 1,
  atualizado TEXT NOT NULL DEFAULT (datetime('now'))
);

/* Agendamento de corte. É um PEDIDO: a casa confirma pelo WhatsApp. */
CREATE TABLE IF NOT EXISTS agendamentos (
  id          INTEGER PRIMARY KEY,
  codigo      TEXT NOT NULL UNIQUE,
  nome        TEXT NOT NULL,
  empresa     TEXT NOT NULL DEFAULT '',
  telefone    TEXT NOT NULL,
  email       TEXT NOT NULL DEFAULT '',
  servico     TEXT NOT NULL DEFAULT '',
  tecido      TEXT NOT NULL DEFAULT '',
  pecas       INTEGER,
  data        TEXT NOT NULL,                  -- AAAA-MM-DD
  horario     TEXT NOT NULL,                  -- HH:MM
  observacoes TEXT NOT NULL DEFAULT '',
  origem      TEXT NOT NULL DEFAULT 'site',   -- site | calculadora | painel
  status      TEXT NOT NULL DEFAULT 'pendente'
              CHECK (status IN ('pendente','confirmado','recusado','cancelado','concluido')),
  nota        TEXT NOT NULL DEFAULT '',       -- interna, nunca volta ao cliente
  criado      TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado  TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_por TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS agendamentos_data ON agendamentos(data, status);

CREATE TABLE IF NOT EXISTS mensagens (
  id       INTEGER PRIMARY KEY,
  nome     TEXT NOT NULL,
  contato  TEXT NOT NULL,
  assunto  TEXT NOT NULL DEFAULT '',
  mensagem TEXT NOT NULL,
  lida     INTEGER NOT NULL DEFAULT 0,
  criado   TEXT NOT NULL DEFAULT (datetime('now'))
);

/* Galeria da oficina: SÓ foto real. Foto de banco não entra aqui. */
CREATE TABLE IF NOT EXISTS galeria (
  id      INTEGER PRIMARY KEY,
  imagem  TEXT NOT NULL,
  legenda TEXT NOT NULL DEFAULT '',
  alt     TEXT NOT NULL DEFAULT '',
  ordem   INTEGER NOT NULL DEFAULT 0,
  ativo   INTEGER NOT NULL DEFAULT 1
);

/* "do_google" é DECLARADO por quem cadastra, nunca adivinhado. Tabela vazia =
   a seção de depoimentos não existe no site (nada de depoimento inventado). */
CREATE TABLE IF NOT EXISTS avaliacoes (
  id        INTEGER PRIMARY KEY,
  autor     TEXT NOT NULL DEFAULT '',
  empresa   TEXT NOT NULL DEFAULT '',
  texto     TEXT NOT NULL,
  nota      INTEGER NOT NULL DEFAULT 5 CHECK (nota BETWEEN 1 AND 5),
  do_google INTEGER NOT NULL DEFAULT 1,
  ordem     INTEGER NOT NULL DEFAULT 0,
  ativo     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS faq (
  id       INTEGER PRIMARY KEY,
  pergunta TEXT NOT NULL,
  resposta TEXT NOT NULL,
  ordem    INTEGER NOT NULL DEFAULT 0,
  ativo    INTEGER NOT NULL DEFAULT 1
);

/* Contagem própria: sem cookie, sem terceiro, só um hash do IP que troca de
   sal todo dia. Conta até quem recusou os cookies do GA4. */
CREATE TABLE IF NOT EXISTS acessos (
  dia     TEXT NOT NULL,
  caminho TEXT NOT NULL,
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, caminho)
);
CREATE TABLE IF NOT EXISTS visitantes (
  dia  TEXT NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY (dia, hash)
);

/* "Quem mudou isto?" precisa de resposta. Só acréscimo. */
CREATE TABLE IF NOT EXISTS auditoria (
  id      INTEGER PRIMARY KEY,
  quando  TEXT NOT NULL DEFAULT (datetime('now')),
  usuario TEXT NOT NULL,
  acao    TEXT NOT NULL,
  alvo    TEXT NOT NULL DEFAULT '',
  detalhe TEXT NOT NULL DEFAULT ''
);
CREATE TRIGGER IF NOT EXISTS auditoria_so_acrescimo_upd BEFORE UPDATE ON auditoria
  BEGIN SELECT RAISE(ABORT, 'auditoria não se altera'); END;
CREATE TRIGGER IF NOT EXISTS auditoria_so_acrescimo_del BEFORE DELETE ON auditoria
  BEGIN SELECT RAISE(ABORT, 'auditoria não se apaga'); END;
`);

/* `CREATE TABLE IF NOT EXISTS` não acrescenta coluna em tabela que já existe.
   Coluna nova entra aqui, idempotente. */
function colunaSeFaltar(tabela, coluna, definicao) {
  const tem = db.prepare(`PRAGMA table_info(${tabela})`).all().some((c) => c.name === coluna);
  if (!tem) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
}
void colunaSeFaltar;

/* ------------------------------------------------------------- consultas */
const cache = new Map();
const prep = (sql) => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); cache.set(sql, s); } return s; };
const Q = {
  um: (sql, ...p) => prep(sql).get(...p),
  todos: (sql, ...p) => prep(sql).all(...p),
  roda: (sql, ...p) => prep(sql).run(...p),
  transacao: (fn) => db.transaction(fn)(),
};

/* ------------------------------------------------------------- textos
   `txt(chave, padrao)`: valor vazio devolve o padrão — campo em branco no
   painel não pode virar buraco na página. */
function txt(chave, padrao = "") {
  const l = Q.um("SELECT valor FROM config WHERE chave = ?", chave);
  const v = l ? String(l.valor) : "";
  return v.trim() === "" ? padrao : v;
}
function gravarTxt(chave, valor) {
  Q.roda("UPDATE config SET valor = ? WHERE chave = ?", String(valor ?? ""), chave);
}

/* SEMEADURA EM DUAS METADES, separadas por DONO (lição do Alafcell 0.11.1):
     o `valor` é do cliente — só entra quando o campo NASCE;
     `rotulo`, `ajuda`, `grupo`, `tipo`, `ordem` são nossos — atualizam sempre. */
function semearTexto(chave, valor, meta = {}) {
  const ja = Q.um("SELECT chave FROM config WHERE chave = ?", chave);
  if (!ja) {
    Q.roda("INSERT INTO config (chave, valor, grupo, rotulo, ajuda, tipo, ordem) VALUES (?,?,?,?,?,?,?)",
      chave, String(valor ?? ""), meta.grupo || "geral", meta.rotulo || chave, meta.ajuda || "",
      meta.tipo || "texto", meta.ordem || 0);
  } else {
    Q.roda("UPDATE config SET grupo=?, rotulo=?, ajuda=?, tipo=?, ordem=? WHERE chave=?",
      meta.grupo || "geral", meta.rotulo || chave, meta.ajuda || "", meta.tipo || "texto", meta.ordem || 0, chave);
  }
}

function auditar(usuario, acao, alvo = "", detalhe = "") {
  Q.roda("INSERT INTO auditoria (usuario, acao, alvo, detalhe) VALUES (?,?,?,?)",
    String(usuario || "sistema"), acao, String(alvo), String(detalhe).slice(0, 2000));
}

module.exports = { db, Q, txt, gravarTxt, semearTexto, auditar, DIR, colunaSeFaltar };
