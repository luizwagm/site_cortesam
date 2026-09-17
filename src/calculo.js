"use strict";
/* ==========================================================================
   CALCULADORA DE ENFESTO — a conta que a confecção faz no papel

     metros por folha = comprimento do risco + folga nas duas pontas
     metros no total  = metros por folha × folhas × (1 + sobra %)
     peças            = folhas × peças por risco
     peso (malha)     = metros × largura (m) × gramatura (g/m²) ÷ 1000

   A MESMA conta roda em dois lugares: aqui (a página funciona sem
   JavaScript — o formulário é GET e o servidor responde com o resultado) e no
   site.js (resultado ao vivo enquanto digita). A suíte de provas compara os
   dois: se um mudar sozinho, o visitante veria um número na tela e outro ao
   recarregar.

   É ESTIMATIVA, e a página diz isso: encolhimento, defeito de rolo e emenda
   mudam o consumo real.
   ========================================================================== */

/* [nome, mínimo, máximo, padrão, obrigatório] */
const CAMPOS = {
  comprimento: [0.1, 30, "", true],      // metros
  folhas: [1, 500, "", true],
  pecas_risco: [1, 500, "", false],
  folga: [0, 20, 2, false],              // cm em CADA ponta
  sobra: [0, 30, 0, false],              // %
  largura: [0.5, 3.5, "", false],        // metros
  gramatura: [50, 1000, "", false],      // g/m²
};

/* "1,5" e "1.5" valem; vazio devolve o padrão; fora da faixa é erro. */
function ler(bruto) {
  const valores = {}, erros = {};
  let algum = false;
  for (const [nome, [min, max, padrao, obrig]] of Object.entries(CAMPOS)) {
    const s = String(bruto[nome] ?? "").trim().replace(",", ".");
    if (s !== "") algum = true;
    if (s === "") { if (obrig) erros[nome] = "Obrigatório."; else valores[nome] = padrao === "" ? null : padrao; continue; }
    const n = Number(s);
    if (!/^\d+(\.\d+)?$/.test(s) || !Number.isFinite(n) || n < min || n > max) { erros[nome] = `Entre ${String(min).replace(".", ",")} e ${String(max).replace(".", ",")}.`; continue; }
    if ((nome === "folhas" || nome === "pecas_risco") && !Number.isInteger(n)) { erros[nome] = "Número inteiro."; continue; }
    valores[nome] = n;
  }
  return { valores, erros, preenchido: algum };
}

const r2 = (n) => Math.round(n * 100) / 100;

function calcular(v) {
  const porFolha = v.comprimento + (2 * (v.folga || 0)) / 100;
  const total = porFolha * v.folhas * (1 + (v.sobra || 0) / 100);
  const pecas = v.pecas_risco ? v.folhas * v.pecas_risco : null;
  const kg = v.largura && v.gramatura ? (total * v.largura * v.gramatura) / 1000 : null;
  return {
    metros_folha: r2(porFolha),
    metros: r2(total),
    pecas,
    metros_peca: pecas ? Math.round((total / pecas) * 1000) / 1000 : null,
    kg: kg === null ? null : r2(kg),
  };
}

module.exports = { CAMPOS, ler, calcular };
