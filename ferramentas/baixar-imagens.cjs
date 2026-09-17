"use strict";
/* ==========================================================================
   FOTOS DE BANCO — Unsplash (licença Unsplash: uso comercial livre, sem
   exigência de crédito; o crédito à plataforma fica no rodapé por cortesia).

   A lista É o registro de origem: cada foto tem o id da Unsplash ao lado do
   nome que o site usa. A curadoria foi feita por FOLHA DE CONTATO, olhando
   cada candidata — título de banco de imagem mente.

   Regra da casa (IDENTIDADE.md): foto de banco NUNCA finge ser a oficina.
   Ela ilustra o ofício; as fotos reais moram em assets/img/oficina/.

   Três larguras (`-p` pequena, `-m` média e a cheia) para o `srcset` entregar
   ao celular o que ele usa. WebP direto do CDN (`fm=webp`), conferido pela
   ASSINATURA (RIFF…WEBP): erro do CDN chega como HTML com status 200.

   Uso:  node ferramentas/baixar-imagens.cjs          (só o que falta)
         node ferramentas/baixar-imagens.cjs --todas  (refaz tudo)
   ========================================================================== */
const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(__dirname, "..", "assets", "img", "banco");

/* nome · id Unsplash · larguras [média, cheia, pequena] · para quê · qualidade */
const FOTOS = [
  ["denim-ondas",     "1706802196230-91ebd3174483", [720, 1200, 460], "capa: camadas de jeans em ondas — o enfesto visto de lado", 48],
  ["rolos-azuis",     "1705250466297-90035b3a2b26", [700, 1300, 420], "rolos de tecido azul, branco e verde"],
  ["rolos-cores",     "1705248383815-c6bc07898592", [700, 1300, 420], "rolos de tecido mostarda, marrom e vinho"],
  ["tesoura-molde",   "1786276479250-e5840e89742e", [700, 1300, 420], "tesoura cortando molde de papel"],
  ["corte-regua",     "1718184021018-d2158af6b321", [700, 1300, 420], "corte de tecido escuro junto à régua"],
  ["riscando-molde",  "1787005241178-c9006ea9610b", [700, 1300, 420], "mãos traçando molde com giz"],
  ["marcando-molde",  "1771587756631-6cffb69fc434", [700, 1300, 420], "marcando o contorno do molde sobre o tecido"],
  ["cortando-mesa",   "1708234114270-16a791390e8d", [700, 1100, 420], "modelista cortando na mesa (retrato)"],
  ["jeans-pilhas",    "1565084888279-aca607ecce0c", [700, 1300, 420], "pilhas de jeans dobrados — a produção"],
  ["fita-metrica",    "1523901839036-a3030662f220", [700, 1300, 420], "fita métrica de costura"],
  ["tapete-corte",    "1771440048473-93e9171ad7d9", [700, 1300, 420], "tecido vermelho sobre tapete de corte quadriculado"],
  ["costura-industrial", "1768745888568-b3ef7c7ba366", [700, 1300, 420], "máquina de costura industrial — a etapa depois do corte"],
];

const eWebp = (b) => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";

async function baixar(id, largura, destino, q = 70) {
  const url = `https://images.unsplash.com/photo-${id}?w=${largura}&q=${q}&fm=webp&fit=max`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const b = Buffer.from(await r.arrayBuffer());
  if (!eWebp(b)) throw new Error("não veio WebP (assinatura errada)");
  fs.writeFileSync(destino, b);
  return b.length;
}

/* Só baixa quando RODADO: o layout faz `require` deste arquivo para ler as
   larguras (srcset) — sem a guarda, cada subida dispararia os downloads. */
if (require.main === module) (async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const todas = process.argv.includes("--todas");
  let ok = 0, falhas = 0, bytes = 0;
  for (const [nome, id, [m, g, p], , q] of FOTOS) {
    for (const [sufixo, w] of [["-m", m], ["", g], ...(p ? [["-p", p]] : [])]) {
      const destino = path.join(DIR, `${nome}${sufixo}.webp`);
      if (!todas && fs.existsSync(destino) && eWebp(fs.readFileSync(destino))) { ok++; continue; }
      try { bytes += await baixar(id, w, destino, q); ok++; }
      catch (e) { falhas++; console.error(`  ✖ ${nome}${sufixo}: ${e.message}`); }
    }
  }
  console.log(`  ${ok} arquivos ok, ${falhas} falhas, ${(bytes / 1048576).toFixed(1)} MB baixados agora`);
  process.exit(falhas ? 1 : 0);
})();

module.exports = { FOTOS };
