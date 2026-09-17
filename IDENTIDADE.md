# Corte Sam — identidade visual

## O problema que o site resolve

A Corte Sam já tem site (Ueni, 2020): um cartão de visita genérico, com a
mesma cara de milhares de outros, que não explica o que a casa faz e não
converte ninguém. O concorrente real não é outro site — é o **boca a boca do
Polo**: a confecção pergunta a um vizinho onde cortar. O site precisa ganhar a
pesquisa ("corte de tecidos Caruaru", "enfesto Caruaru") **e** convencer em
dez segundos o dono de confecção que chegou por ela.

Quem compra: dono ou encarregado de confecção pequena e média de Caruaru,
Toritama e Santa Cruz do Capibaribe. Lê no celular, entre uma entrega e outra,
e decide por **confiança técnica** (vai cortar certo? vai perder tecido? fica
pronto quando?) — não por beleza. Beleza aqui serve para sinalizar precisão.

## Conceito: **o corte certo**

O slogan da casa já é a ideia: *"O corte certo da moda"*. O site inteiro é
desenhado como **uma mesa de corte**:

- **a grade do tapete de corte** (base de 10 mm) é o fundo das seções claras;
- **a régua** numerada marca as seções e mede o avanço da rolagem;
- **a linha tracejada com tesoura** é o separador e o indicador de rolagem;
- **o enfesto** — camadas de tecido empilhadas — vira as ondas sobrepostas
  que já existiam no logotipo antigo (a "onda" azul), agora multiplicadas;
- **a lâmina vertical** da máquina de corte (a faca de 8" que aparece em todas
  as fotos do Samuel) atravessa as camadas: é o gesto do logotipo e da capa.

Por que não "moda" (modelos, passarela, rosa): a Corte Sam não vende moda,
vende **o passo industrial** entre o molde e a costura. Um visual de ateliê
de alta-costura afastaria exatamente o dono de facção que é o cliente.

## Marca modernizada

O logotipo original tem três ideias boas presas num desenho de 2014: a
**onda azul**, o **nome em serifa** e a **máquina de corte** ilustrada. A
versão nova mantém as três, em linguagem de hoje:

| Antes | Agora | Por quê |
|---|---|---|
| uma onda decorativa | **três ondas empilhadas** | são as folhas do enfesto — a onda passa a significar o trabalho |
| desenho da máquina inteira | **uma lâmina vertical** cortando as ondas | a máquina é reconhecível só pelo gesto; funciona em 16 px |
| "CORTE SAM" em serifa fina | **Anybody largo, pesado** | legível no celular, no letreiro e no bordado da farda |
| ondas contínuas | **ondas deslocadas depois da lâmina** | o deslocamento É o corte — o olho entende sem legenda |

O azul da placa da fachada (marinho profundo + azul vivo) continua: é o que o
cliente já reconhece na Rua 27 de Janeiro.

Arquivos: `assets/img/marca.svg` (símbolo), `logo.png` (fundo claro),
`logo-negativo.png` (fundo marinho), `icone-*.png`, `favicon.ico`, `og.jpg`.
Gerados por `node ferramentas/marca.cjs` (Chrome sem janela, com as fontes do
próprio site — nada de fonte do sistema no logotipo).

## Paleta

| Nome | Hex | Uso | Contraste |
|---|---|---|---|
| Tinta | `#0A1A3F` | texto, seções escuras, topo | 15,1:1 sobre papel |
| Azul Sam | `#1554D1` | ação, links, botão principal | 6,5:1 sobre branco; 5,8:1 sobre papel; 5,1:1 sobre kraft |
| Celeste | `#6FB3FF` | destaque sobre tinta | 7,8:1 sobre tinta |
| Papel | `#F4F1EA` | fundo (papel de risco, não branco de hospital) | — |
| Kraft | `#E9E3D6` | faixas alternadas, cartões | — |
| Giz | `#FFD23F` | o giz de alfaiate: marcações, medidas, 1 destaque por tela | 11,8:1 sobre tinta; **nunca** texto sobre papel |

O giz amarelo é a única cor quente, e é pouca de propósito: numa mesa de corte,
a marca amarela é o que se enxerga primeiro. No site, ela aponta para o que
importa (a medida, o botão de agendar no escuro, o número da calculadora).

## Tipografia

- **Anybody** (variável, eixo de largura 50–150 %) — títulos. O eixo de
  largura é o motivo da escolha: a MESMA família vai de condensada (84 % nos
  títulos, cabe muita palavra no celular) a larga (125 % nos números da
  calculadora e nas etapas do processo). E o título entra na tela **esticando**
  (de 86 % para 100 % de largura), como tecido estendido na mesa — feito com
  `transform`, não com o eixo da fonte: animar a largura real da letra
  recalcularia o layout a cada quadro e empurraria o texto de baixo.
- **Figtree** — texto. Humanista, muito legível em corpo 16–18 px no celular,
  neutra o bastante para não brigar com a Anybody.
- **IBM Plex Mono** — medidas, rótulos, números da régua, código do
  agendamento. Tipografia de ficha técnica: é onde o site "fala de fábrica".

Todas servidas pelo próprio site (woff2, só o subconjunto latino), licença
OFL — cópias das licenças em `assets/fonts/`.

## Movimento

- **Capa:** as camadas de tecido deslizam para dentro; uma lâmina desce e o
  título se abre em duas metades deslocadas (o corte). Uma vez só.
- **"Do rolo à peça":** a seção gruda na tela e quatro etapas (risco →
  enfesto → corte → peças) avançam com a régua marcando o progresso.
- **Tesoura na linha tracejada:** acompanha a rolagem no rodapé de cada seção.
- Com `prefers-reduced-motion`, nada anda: o conteúdo aparece no lugar.
- Só `transform` e `opacity` animam, num único laço de `requestAnimationFrame`.

## Fotografia

1. **Fotos reais da oficina** (enviadas pelo cliente ao site antigo): mesa de
   corte, rolo no enfesto, risco plotado, peças cortadas, a máquina. Baixa
   resolução (até 960 px) — por isso entram em **tamanho moderado**, em
   grade de "ficha de oficina", nunca esticadas numa capa de tela cheia.
2. **Banco (Unsplash)** para as capas grandes: textura de jeans em ondas,
   rolos de tecido, mãos riscando molde. Licença Unsplash (uso comercial
   livre); a lista com a origem de cada uma está em
   `ferramentas/baixar-imagens.cjs`.

Regra: foto de banco nunca finge ser a Corte Sam. A legenda "a oficina" só vai
em foto real.

## O que é inovação aqui

- **Calculadora de enfesto** (`/calculadora-de-enfesto/`): comprimento do
  risco × folhas + folga = metros de tecido e peças cortadas. É conta simples,
  mas é a conta que o dono da confecção faz no papel antes de ir cortar — e é
  uma página que a busca "como calcular consumo de tecido" encontra. O
  resultado vira pedido de agendamento com os números preenchidos.
- **Agendamento de corte** online com confirmação pelo WhatsApp, respeitando
  o horário real da casa (seg–sex, 8–12 e 14–18) e o "não respondo WhatsApp
  fora do horário" da placa.
