"use strict";
/* ==========================================================================
   PROVAS DO VHOST — o `nginx -t` que a máquina de desenvolvimento não tem

   Gera o vhost pelo MODO DE ENSAIO do criar-site.sh (sem root, sem nginx, sem
   DNS), expande o `include` do arquivo comum de proxy e confere, bloco a bloco,
   o que já derrubou a instalação:

     · o Picanha 0.1.1 tinha `proxy_read_timeout` DUAS vezes no location do chat (uma
       vinda do include, outra escrita à mão). O nginx recusa diretiva repetida
       no MESMO bloco — e só o servidor descobriu, com o link já habilitado;
     · chaves desbalanceadas e linha de shell vazada para dentro do arquivo
       (o heredoc ancorado no delimitador errado já fez isso no Alafcell);
     · www em server_name compartilhado, HSTS no subdomínio, formulário sem freio.

   Uso:  node testes/vhost.cjs
   ========================================================================== */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");
/* No Windows, o `bash` do PATH é o do WSL, que não enxerga este disco. */
const BASH = process.platform === "win32" && fs.existsSync("C:/Program Files/Git/bin/bash.exe") ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), "cortesam-vhost-")).replace(/\\/g, "/");

/* Diretivas que o nginx aceita UMA vez por bloco (as que usamos). */
const UNICAS = new Set(["proxy_read_timeout", "proxy_connect_timeout", "proxy_send_timeout", "proxy_http_version",
  "client_max_body_size", "proxy_pass", "root", "alias", "expires", "try_files", "gzip", "gzip_comp_level",
  "gzip_min_length", "gzip_proxied", "gzip_vary", "server_name", "return", "limit_req"]);

let ok = 0; const falhas = [];
const certo = (nome, cond, detalhe = "") => {
  if (cond) { ok++; console.log(`  ✔ ${nome}`); }
  else { falhas.push(nome); console.log(`  ✖ ${nome}${detalhe ? "\n      " + detalhe : ""}`); }
};

function gerar(dominio) {
  const arq = `${PASTA}/${dominio}.conf`;
  const r = spawnSync(BASH, ["criar-site.sh", dominio], { cwd: RAIZ, encoding: "utf8", env: { ...process.env, CORTESAM_VHOST_ENSAIO: arq } });
  if (r.status !== 0) throw new Error(`ensaio de ${dominio} falhou: ${r.stderr || r.stdout}`);
  return { vhost: fs.readFileSync(arq, "utf8"), proxy: fs.readFileSync(`${arq}.proxy.conf`, "utf8") };
}

/* Analisador mínimo: comandos terminam em ';', blocos em '{' '}'. Comentários
   (# até o fim da linha) saem antes. O `include` do arquivo comum é expandido
   DENTRO do bloco onde aparece — é assim que o nginx o lê. */
function analisar(texto, proxy) {
  const limpo = (t) => t.split("\n").map((l) => l.replace(/(^|\s)#.*$/, "")).join("\n");
  const tokens = [];
  let buf = "";
  for (const ch of limpo(texto)) {
    if (ch === "{" || ch === "}" || ch === ";") { tokens.push(buf.trim(), ch); buf = ""; }
    else buf += ch;
  }
  const raiz = { nome: "(topo)", diretivas: [], filhos: [] };
  const pilha = [raiz];
  let equilibrio = 0;
  for (let i = 0; i < tokens.length; i += 2) {
    const frase = tokens[i], sinal = tokens[i + 1];
    const atual = pilha[pilha.length - 1];
    if (sinal === "{") { const b = { nome: frase.replace(/\s+/g, " "), diretivas: [], filhos: [] }; atual.filhos.push(b); pilha.push(b); equilibrio++; }
    else if (sinal === "}") { pilha.pop(); equilibrio--; if (equilibrio < 0) return { erro: "fecha chave a mais" }; }
    else if (frase) {
      const nome = frase.split(/\s+/)[0];
      if (nome === "include" && /proxy_cortesam\.conf/.test(frase)) {
        for (const linha of limpo(proxy).split(";").map((x) => x.trim()).filter(Boolean)) atual.diretivas.push(linha.replace(/\s+/g, " "));
      } else atual.diretivas.push(frase.replace(/\s+/g, " "));
    }
  }
  return { raiz, equilibrio };
}
function blocos(b, lista = []) { lista.push(b); b.filhos.forEach((f) => blocos(f, lista)); return lista; }
function repetidas(b) {
  const conta = {};
  for (const d of b.diretivas) { const n = d.split(" ")[0]; if (UNICAS.has(n)) conta[n] = (conta[n] || 0) + 1; }
  return Object.entries(conta).filter(([, n]) => n > 1).map(([k, n]) => `${k} ×${n}`);
}

for (const [dominio, sub] of [["cortesam.projetos.luizaugust.me", true], ["cortesam.com.br", false]]) {
  console.log(`\n— ${dominio}`);
  const { vhost, proxy } = gerar(dominio);
  const a = analisar(vhost, proxy);
  certo("chaves balanceadas", !a.erro && a.equilibrio === 0, a.erro || `sobrou ${a.equilibrio}`);
  const todos = blocos(a.raiz);
  const ruins = todos.map((b) => [b.nome, repetidas(b)]).filter(([, r]) => r.length);
  /* A prova que teria segurado a 0.1.1: diretiva única repetida no mesmo bloco. */
  certo("nenhuma diretiva única repetida no mesmo bloco (include expandido)", ruins.length === 0, ruins.map(([n, r]) => `${n}: ${r.join(", ")}`).join(" | "));
  /* Crase sem escape dentro do heredoc EXECUTA o comando na geração (a 0.1.0
     rodava `nginx -t` e apagava o texto do comentário). */
  certo("comentários do vhost chegam inteiros (nenhuma crase executada no heredoc)", vhost.includes("em que o `nginx -t` do servidor recusou tudo") && vhost.includes("Confira com `nginx -T`"));
  certo("nenhuma linha de shell vazou para o vhost", !/^\s*(verde|amarelo|vermelho|azul|echo|if \[|fi$|\[ensaio\])/m.test(vhost));
  certo("o arquivo comum de proxy não traz tempo limite (quem precisa redefinir, redefine no location)", !/timeout/.test(proxy));
  const servidores = todos.filter((b) => b.nome === "server");
  const principal = servidores.find((b) => b.diretivas.includes(`server_name ${dominio}`));
  certo("existe o server principal com o domínio certo", !!principal);
  const loc = (prefixo) => principal && principal.filhos.find((f) => f.nome.startsWith(prefixo));
  const forms = loc("location ~ ^/(agendamento|contato)$");
  certo("formulários (agendamento e contato) com freio de borda", forms && forms.diretivas.some((d) => /^limit_req zone=cortesam_forms/.test(d)));
  const login = loc("location = /api/admin/entrar");
  certo("login do painel com freio de borda", login && login.diretivas.some((d) => /^limit_req zone=cortesam_login/.test(d)));
  const up = loc("location = /api/admin/upload");
  certo("envio de foto do painel com teto próprio (9m)", up && up.diretivas.includes("client_max_body_size 9m"));
  certo("tempo limite padrão no server (30s)", principal && principal.diretivas.includes("proxy_read_timeout 30s"));
  certo("toda rota que repassa ao Node leva os cabeçalhos do proxy", principal && principal.filhos.filter((f) => f.diretivas.some((d) => d.startsWith("proxy_pass"))).every((f) => f.diretivas.some((d) => d.startsWith("proxy_set_header X-Forwarded-For"))));
  const www = vhost.match(/server_name[^;]*\bwww\./g) || [];
  const hsts = (vhost.match(/Strict-Transport-Security/g) || []).length;
  if (sub) {
    certo("subdomínio: sem www", www.length === 0);
    certo("subdomínio: sem HSTS (o domínio pai já anuncia)", hsts === 0);
  } else {
    certo("domínio: o www aparece em UM server_name só (bloco de 301)", www.length === 1 && /return 301 https:\/\/cortesam\.com\.br\$request_uri/.test(vhost));
    certo("domínio: HSTS no server E nos estáticos (add_header do location apaga o do server)", hsts === 2);
  }
}

try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch { }
console.log(falhas.length ? `\n  ✖ ${ok} passaram, ${falhas.length} falharam` : `\n  ✔ ${ok}/${ok} — vhost em ordem`);
process.exit(falhas.length ? 1 : 0);
