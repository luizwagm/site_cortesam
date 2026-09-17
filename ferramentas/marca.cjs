"use strict";
/* ==========================================================================
   MARCA — gera os arquivos da marca a partir de assets/img/marca.svg

   Uso:  node ferramentas/marca.cjs

   Por que Chrome sem janela e não um editor de imagem: o nome "CORTE SAM" é
   escrito na ANYBODY do próprio site (assets/fonts). Rasterizar com fonte do
   sistema daria um logotipo diferente do que o visitante vê no topo — e ninguém
   perceberia até imprimir a farda.

   Gera em assets/img/:
     logo.png            símbolo + nome, fundo transparente, para fundo claro
     logo-negativo.png   o mesmo para fundo marinho (e-mail, painel escuro)
     icone-192/512.png   manifesto (PWA) — o símbolo com margem de segurança
     icone-180.png       apple-touch-icon (o iOS arredonda sozinho: vai sem canto)
     favicon.ico         PNG de 48 px embrulhado em ICO
     og.png              1200×630 para WhatsApp, Facebook e LinkedIn
   ========================================================================== */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const RAIZ = path.join(__dirname, "..");
const IMG = path.join(RAIZ, "assets", "img");
const FONTES = path.join(RAIZ, "assets", "fonts").replace(/\\/g, "/");
const CHROME = process.env.CHROME || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].find((c) => fs.existsSync(c));
if (!CHROME) { console.error("Chrome não encontrado (defina CHROME=/caminho)."); process.exit(1); }

const svg = fs.readFileSync(path.join(IMG, "marca.svg"), "utf8");
/* Sem o fundo arredondado: para o ícone do iOS, que recorta sozinho. */
const svgSemCanto = svg.replace('rx="15"', 'rx="0"');

const cabeca = `<meta charset="utf-8"><style>
@font-face{font-family:Anybody;src:url(file:///${FONTES}/anybody.woff2);font-weight:100 900;font-stretch:50% 150%}
@font-face{font-family:Plex;src:url(file:///${FONTES}/plex-mono-500.woff2)}
html,body{margin:0;background:transparent}
.m{display:flex;align-items:center;gap:26px;padding:10px}
.m svg{width:150px;height:150px;flex:none}
.nome{font:900 96px/0.86 Anybody;font-stretch:104%;letter-spacing:.01em;position:relative;white-space:nowrap}
/* O nome também é cortado: a metade de baixo desliza 4 px — o mesmo gesto do símbolo. */
.nome span{display:block}
.nome .b{position:absolute;inset:0;clip-path:inset(52% 0 0 0);transform:translateX(4px)}
.nome .a{clip-path:inset(0 0 48% 0)}
.lema{font:500 25px/1 Plex;letter-spacing:.2em;text-transform:uppercase;margin-top:16px}
</style>`;

function logo(cor, lema) {
  return `<!doctype html>${cabeca}<body><div class="m">${svg}<div><div class="nome" style="color:${cor}"><span class="a">CORTE SAM</span><span class="b">CORTE SAM</span></div><div class="lema" style="color:${lema}">O corte certo da moda</div></div></div>`;
}
const icone = (tam, s) => `<!doctype html>${cabeca}<body style="width:${tam}px;height:${tam}px">${s.replace("<svg ", `<svg width="${tam}" height="${tam}" `)}`;

const og = `<!doctype html>${cabeca}<style>
body{width:1200px;height:630px;background:#0A1A3F;overflow:hidden;position:relative;font-family:Anybody}
.grade{position:absolute;inset:0;background-image:linear-gradient(rgba(111,179,255,.09) 1px,transparent 1px),linear-gradient(90deg,rgba(111,179,255,.09) 1px,transparent 1px);background-size:30px 30px}
.ondas{position:absolute;right:-40px;top:0;width:620px;height:630px}
.txt{position:absolute;left:84px;top:96px;color:#fff}
.txt .m{padding:0;gap:22px}.txt .m svg{width:112px;height:112px}
.txt .nome{font-size:78px}
h1{font:800 70px/0.98 Anybody;font-stretch:88%;margin:58px 0 0;max-width:640px;color:#fff}
h1 em{font-style:normal;color:#FFD23F}
.pe{position:absolute;left:84px;bottom:62px;font:500 22px Plex;letter-spacing:.16em;color:#6FB3FF;text-transform:uppercase}
</style><body><div class="grade"></div>
<svg class="ondas" viewBox="0 0 620 630" fill="none" stroke-linecap="round">
<defs><clipPath id="og-e"><rect x="0" y="0" width="303" height="630"/></clipPath><clipPath id="og-d"><rect x="303" y="0" width="320" height="630"/></clipPath></defs>
${["og-e", "og-d"].map((c, lado) => `<g clip-path="url(#${c})">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => { const y = 120 + i * 50 - lado * 26; const cor = ["#FFFFFF", "#6FB3FF", "#3B7BFF", "#1554D1"][i % 4]; return `<path d="M-20 ${y}c80-44 160-44 250 0s170 44 250 0 150-44 200 0" stroke="${cor}" stroke-width="16" opacity="${(0.95 - i * 0.07).toFixed(2)}"/>`; }).join("")}</g>`).join("")}
<rect x="300" y="40" width="7" height="560" rx="3.5" fill="#FFD23F"/>
</svg>
<div class="txt"><div class="m">${svg}<div><div class="nome" style="color:#fff"><span class="a">CORTE SAM</span><span class="b">CORTE SAM</span></div></div></div>
<h1>Corte de tecidos para <em>confecções</em>.</h1></div>
<div class="pe">Caruaru · Pernambuco · desde 2017</div>`;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "cortesam-marca-"));
function foto(nome, html, w, h, transparente = true) {
  const arq = path.join(TMP, nome + ".html");
  fs.writeFileSync(arq, html);
  const saida = path.join(IMG, nome + ".png");
  execFileSync(CHROME, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    ...(transparente ? ["--default-background-color=00000000"] : []),
    `--window-size=${w},${h}`, `--screenshot=${saida}`, "file:///" + arq.replace(/\\/g, "/"),
  ], { stdio: "ignore", timeout: 60000 });
  console.log("  ✓", path.relative(RAIZ, saida), fs.statSync(saida).size, "bytes");
  return saida;
}

/* O Chrome fotografa a JANELA inteira; o recorte tira a sobra transparente
   (o PIL já está na máquina de quem mexe na marca — ver README). */
const aparar = (arq) => execFileSync("python", ["-c", "import sys;from PIL import Image;i=Image.open(sys.argv[1]);i.crop(i.getbbox()).save(sys.argv[1],optimize=True)", arq]);
aparar(foto("logo", logo("#0A1A3F", "#1554D1"), 1100, 190));
aparar(foto("logo-negativo", logo("#FFFFFF", "#6FB3FF"), 1100, 190));
foto("icone-512", icone(512, svg), 512, 512);
foto("icone-192", icone(192, svg), 192, 192);
foto("icone-180", icone(180, svgSemCanto), 180, 180);
const p48 = foto("favicon-48", icone(48, svg), 48, 48);
foto("og", og, 1200, 630, false);

/* ICO com PNG dentro (aceito por todo navegador desde o IE 11): cabeçalho de
   6 bytes + uma entrada de 16 + o PNG. Nada de biblioteca para isso. */
const png = fs.readFileSync(p48);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico.writeUInt8(48, 6); ico.writeUInt8(48, 7); ico.writeUInt8(0, 8); ico.writeUInt8(0, 9);
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(IMG, "favicon.ico"), Buffer.concat([ico, png]));
fs.unlinkSync(p48);
console.log("  ✓ assets/img/favicon.ico");
fs.rmSync(TMP, { recursive: true, force: true });
