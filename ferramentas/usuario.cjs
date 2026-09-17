"use strict";
/* ==========================================================================
   RECUPERAR O ACESSO AO PAINEL — pelo terminal do servidor

     sudo -u deploy node ferramentas/usuario.cjs admin
     sudo -u deploy node ferramentas/usuario.cjs maria redator "Maria Souza"

   Cria o usuário (se não existir) ou SORTEIA uma senha provisória nova para
   ele (se existir), e mostra a senha UMA vez. O painel exige a troca no
   primeiro acesso e derruba as outras sessões da conta.

   Ninguém recebe senha fixa escrita aqui: estaria no repositório.
   ========================================================================== */
const crypto = require("node:crypto");
const { Q, auditar } = require("../src/db");
const S = require("../src/sessao");

const [usuario, papel = "administrador", nome] = process.argv.slice(2);
if (!usuario || !/^[a-z0-9._-]{3,30}$/.test(usuario)) {
  console.log("Uso: node ferramentas/usuario.cjs <usuario> [administrador|redator] [\"Nome\"]");
  process.exit(1);
}
if (!S.PAPEIS.includes(papel)) { console.log(`Papel inválido. Use: ${S.PAPEIS.join(", ")}`); process.exit(1); }

const senha = crypto.randomBytes(9).toString("base64url");
const ja = Q.um("SELECT id FROM usuarios WHERE usuario = ?", usuario);
if (ja) {
  Q.roda("UPDATE usuarios SET senha = ?, trocar_senha = 1, ativo = 1 WHERE id = ?", S.cifrar(senha), ja.id);
  S.fecharTodas(ja.id);
  auditar("terminal", "senha redefinida pelo terminal", usuario);
  console.log(`\n  Senha provisória de "${usuario}": ${senha}\n  (o painel pede a troca no primeiro acesso)\n`);
} else {
  Q.roda("INSERT INTO usuarios (usuario, nome, senha, papel, trocar_senha) VALUES (?,?,?,?,1)", usuario, nome || usuario, S.cifrar(senha), papel);
  auditar("terminal", "usuário criado pelo terminal", usuario, papel);
  console.log(`\n  Usuário "${usuario}" (${papel}) criado. Senha provisória: ${senha}\n`);
}
