"use strict";
/* ==========================================================================
   CÓPIA DE SEGURANÇA DO BANCO — backups/site-AAAA-MM-DD-HHMM.db

   Usa a API de backup do SQLite (cópia consistente com o site NO AR — copiar
   o arquivo com `cp` no meio de uma gravação em WAL gera uma cópia que abre
   corrompida). Guarda as 14 mais recentes. O LA Backup leva a pasta backups/
   para o Cloudflare R2 às 04:00 — a cópia local sozinha morre junto com o
   disco.

   Leva também o segredo dos formulários (assina os links de confirmação de
   agendamento): sem ele, os links já enviados deixariam de abrir.
   ========================================================================== */
const fs = require("node:fs");
const path = require("node:path");
const { db, DIR } = require("../src/db");

const PASTA = process.env.CORTESAM_BACKUPS || path.join(__dirname, "..", "backups");
fs.mkdirSync(PASTA, { recursive: true });
const agora = new Date(Date.now() - 3 * 3600e3).toISOString().replace(/T(\d\d):(\d\d).*/, "-$1$2");
const destino = path.join(PASTA, `site-${agora}.db`);

db.backup(destino).then(() => {
  for (const extra of ["segredo.txt"]) {
    const o = path.join(DIR, extra);
    if (fs.existsSync(o)) fs.copyFileSync(o, path.join(PASTA, `${extra}.${agora}`));
  }
  const todos = fs.readdirSync(PASTA).filter((f) => /^site-.*\.db$/.test(f)).sort();
  for (const velho of todos.slice(0, Math.max(0, todos.length - 14))) {
    fs.unlinkSync(path.join(PASTA, velho));
    for (const extra of ["segredo.txt"]) {
      const e = path.join(PASTA, `${extra}.${velho.slice(5, -3)}`);
      if (fs.existsSync(e)) fs.unlinkSync(e);
    }
  }
  console.log(`  ✔ cópia em ${destino} (${(fs.statSync(destino).size / 1024).toFixed(0)} KB) · ${Math.min(todos.length, 14)} guardadas`);
}).catch((e) => { console.error("  ✖ backup falhou:", e.message); process.exit(1); });
