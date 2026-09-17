"use strict";
/* ==========================================================================
   CONTEÚDO INICIAL

   O site nasce cheio — mas só do que foi CONFERIDO (17/09/2026):

     · site atual (cortesam.ueniweb.com): nome "Corte Sam - Corte e Modelagem",
       lema "O corte certo da moda!", WhatsApp (81) 99481-9330, e-mail
       cortesam2014@hotmail.com, "Corte em Tecidos e Modelos", cartões de
       débito e crédito, Wi-Fi, atendimento "Pernambuco e Região";
     · fotos do próprio site: a placa da fachada (99925-8962 | 99481-9330) e
       os cartazes de horário ("seg. a sexta, 8 às 12 e 14 às 18hs");
     · cadastro público do CNPJ 28.849.360/0001-81 (aberto em 13/10/2017),
       Rua 27 de Janeiro, 94, Nossa Senhora das Dores, Caruaru, 55004-470;
     · Facebook: facebook.com/www.cortesam.com.br.

   FORA, de propósito: o "R$ 30 mínimo" e o "10% OFF à vista" do site antigo
   (são de 2020 — preço velho publicado vira discussão no balcão), nota do
   Google (o perfil não foi encontrado) e depoimentos (nenhum foi fornecido; a
   seção só aparece quando o painel tiver algum).

   Tudo aqui roda A CADA SUBIDA e NUNCA sobrescreve o que o cliente editou:
   texto só entra quando o campo nasce (`semearTexto`), e cada tabela só recebe
   o conteúdo inicial se estiver VAZIA.
   ========================================================================== */
const crypto = require("node:crypto");
const { Q, semearTexto } = require("./db");

/* [chave, valor inicial, grupo, rótulo, ajuda, tipo]
   Tipos: texto · longo (várias linhas) · titulo (aceita só <em>) · rico · url · email · numero */
const TEXTOS = [
  // ---------------------------------------------------------- dados da casa
  ["casa.nome", "Corte Sam", "casa", "Nome", "Topo, aba do navegador, Google e rodapé.", "texto"],
  ["casa.lema", "O corte certo da moda", "casa", "Lema", "", "texto"],
  ["casa.razao", "Marcos Samuel Aragão de Moura", "casa", "Razão social", "Do cadastro público do CNPJ. Vai para o rodapé e para a política de privacidade.", "texto"],
  ["casa.cnpj", "28.849.360/0001-81", "casa", "CNPJ", "", "texto"],
  ["casa.desde", "2017", "casa", "Ano de abertura", "Data do CNPJ (13/10/2017). Se a oficina é mais antiga que o CNPJ, corrija aqui.", "numero"],
  ["casa.whatsapp", "(81) 99481-9330", "casa", "WhatsApp", "TODOS os botões de WhatsApp do site usam este número (é o do site antigo e do cartaz de horário).", "texto"],
  ["casa.telefone2", "(81) 99925-8962", "casa", "Segundo telefone", "O outro número da placa da fachada. Em branco, não aparece.", "texto"],
  ["casa.email", "cortesam2014@hotmail.com", "casa", "E-mail público", "Aparece no rodapé e no contato.", "email"],
  ["casa.logradouro", "Rua 27 de Janeiro, 94", "casa", "Endereço (rua e número)", "", "texto"],
  ["casa.bairro", "Nossa Senhora das Dores", "casa", "Bairro", "", "texto"],
  ["casa.cidade", "Caruaru", "casa", "Cidade", "", "texto"],
  ["casa.uf", "PE", "casa", "UF", "", "texto"],
  ["casa.cep", "55004-470", "casa", "CEP", "", "texto"],
  ["casa.lat", "-8.2858682", "casa", "Latitude", "Só mude se o pino do mapa estiver no lugar errado.", "texto"],
  ["casa.lng", "-35.9739293", "casa", "Longitude", "", "texto"],
  ["casa.horario", "Segunda a sexta · 8h às 12h\nSegunda a sexta · 14h às 18h", "casa", "Horário de atendimento", "Uma linha por faixa. Veio dos cartazes da oficina. Em branco, o site pede para consultar pelo WhatsApp.", "longo"],
  ["casa.aviso_zap", "Respondemos o WhatsApp em horário comercial.", "casa", "Aviso do WhatsApp", "Aparece junto aos botões de WhatsApp. Em branco, some.", "texto"],
  ["casa.pagamento", "Cartão de débito e de crédito", "casa", "Formas de pagamento", "Do site antigo. Vai para o Google (dado estruturado) e para o contato.", "texto"],

  // ------------------------------------------------------------ redes/google
  ["redes.instagram", "", "redes", "Instagram", "Endereço completo (https://www.instagram.com/…). Em branco, o ícone não aparece.", "url"],
  ["redes.facebook", "https://www.facebook.com/www.cortesam.com.br", "redes", "Facebook", "", "url"],
  ["google.link", "", "redes", "Link do Perfil da Empresa no Google", "Cole o link da ficha do Google Maps. Com ele, o site ganha o selo \"Ver no Google\" e o botão de avaliar.", "url"],
  ["google.nota", "", "redes", "Nota no Google", "Como aparece na ficha (ex.: 4,9). Em branco, o selo mostra só o link.", "texto"],
  ["google.total", "", "redes", "Total de avaliações no Google", "", "numero"],

  // ------------------------------------------------------------------ capa
  ["home.capa_selo", "Corte e modelagem · Caruaru-PE", "home", "Selo acima do título", "", "texto"],
  ["home.capa_titulo", "Corte de tecidos <em>certo</em> para a sua confecção.", "home", "Título da capa", "A palavra entre <em> fica em amarelo-giz. É o título principal do Google: mantenha \"corte de tecidos\".", "titulo"],
  ["home.capa_texto", "Traga o tecido e o molde. A gente estende, corta e devolve as peças prontas para a costura — com o encaixe que respeita o seu tecido.", "home", "Texto da capa", "", "longo"],

  // ------------------------------------------------------------ serviços
  ["home.servicos_titulo", "O que sai da <em>nossa mesa</em>.", "home", "Serviços — título", "Os cartões são os serviços cadastrados na área Serviços.", "titulo"],

  // ------------------------------------------------------------ processo
  ["home.processo_titulo", "Do rolo à <em>peça cortada</em>.", "home", "Processo — título", "", "titulo"],
  ["home.proc1_titulo", "Risco", "home", "Etapa 1 — nome", "", "texto"],
  ["home.proc1_texto", "Tudo começa no risco: o desenho das partes do molde encaixadas sobre a largura do tecido. Encaixe bem-feito é tecido que não vira retalho.", "home", "Etapa 1 — texto", "", "longo"],
  ["home.proc2_titulo", "Enfesto", "home", "Etapa 2 — nome", "", "texto"],
  ["home.proc2_texto", "O tecido é estendido na mesa, folha sobre folha, alinhado e sem tensão. Enfesto torto é peça torta — por isso esta é a etapa sem pressa.", "home", "Etapa 2 — texto", "", "longo"],
  ["home.proc3_titulo", "Corte", "home", "Etapa 3 — nome", "", "texto"],
  ["home.proc3_texto", "A máquina de faca vertical atravessa todas as folhas de uma vez, seguindo a linha do risco. É aqui que a precisão aparece na costura.", "home", "Etapa 3 — texto", "", "longo"],
  ["home.proc4_titulo", "Peças prontas", "home", "Etapa 4 — nome", "", "texto"],
  ["home.proc4_texto", "As partes saem separadas e conferidas, prontas para seguir para a costura da sua confecção ou da sua facção.", "home", "Etapa 4 — texto", "", "longo"],

  // ------------------------------------------------------------ oficina
  ["home.oficina_titulo", "Uma oficina de corte <em>de verdade</em>.", "home", "Oficina — título", "", "titulo"],
  ["home.oficina_texto", "Na Rua 27 de Janeiro, em Caruaru, a Corte Sam atende as confecções do Agreste na mesa de corte. Quem cuida do corte é o Samuel — e é com ele que você combina cada pedido.", "home", "Oficina — texto", "", "longo"],

  // ------------------------------------------------------------ região
  ["home.regiao_titulo", "No coração do <em>Polo de Confecções</em>.", "home", "Região — título", "", "titulo"],
  ["home.regiao_texto", "Caruaru, Toritama e Santa Cruz do Capibaribe formam o maior polo de confecções do Nordeste. A Corte Sam fica em Caruaru, a menos de uma hora das confecções de toda a região.", "home", "Região — texto", "", "longo"],

  // ------------------------------------------------------------ chamada
  ["home.chamada_titulo", "Sua produção na mesa <em>certa</em>.", "home", "Chamada final — título", "", "titulo"],
  ["home.chamada_texto", "Agende o corte em um minuto. A confirmação chega pelo WhatsApp.", "home", "Chamada final — texto", "", "longo"],

  // ------------------------------------------------------------ agendamento
  ["agenda.horarios", "08:00, 09:00, 10:00, 11:00, 14:00, 15:00, 16:00, 17:00", "agenda", "Horários oferecidos", "Separados por vírgula. Em branco, o cliente digita o horário.", "texto"],
  ["agenda.dias_fechados", "0,6", "agenda", "Dias sem atendimento", "Números dos dias da semana SEM atendimento: 0 = domingo, 1 = segunda … 6 = sábado. Padrão: 0,6 (fim de semana).", "texto"],
  ["agenda.antecedencia_dias", "45", "agenda", "Até quantos dias à frente", "", "numero"],
  ["agenda.aviso", "O agendamento é um pedido: a Corte Sam confirma o horário pelo WhatsApp. Traga o tecido, o molde ou o risco e a quantidade de peças por tamanho.", "agenda", "Aviso no formulário", "", "longo"],
  ["agenda.email_aviso", "cortesam2014@hotmail.com", "agenda", "E-mail que recebe os pedidos", "Cada agendamento e mensagem chega aqui (precisa do SMTP configurado no servidor). Vários? Separe por vírgula.", "email"],

  // ------------------------------------------------------------ sobre
  ["sobre.titulo", "O corte certo, <em>desde 2017</em>.", "sobre", "Sobre — título", "", "titulo"],
  ["sobre.texto", "<p>A Corte Sam é uma oficina de corte e modelagem em Caruaru, no Agreste de Pernambuco — a cidade que, ao lado de Toritama e Santa Cruz do Capibaribe, veste boa parte do Nordeste.</p><p>O trabalho é o elo entre a modelagem e a costura: receber o tecido e o molde da confecção, estender o enfesto, cortar com precisão e devolver as partes prontas para costurar.</p><p>À frente da mesa está o Samuel. O lema da casa diz o compromisso: <strong>o corte certo da moda</strong>.</p>", "sobre", "Sobre — texto", "", "rico"],

  // -------------------------------------------------------------- medição
  ["medicao.ga4", "", "medicao", "Google Analytics 4 (G-XXXXXXX)", "Só carrega depois que o visitante ACEITA os cookies. Em branco, nem a faixa de cookies aparece.", "texto"],
  ["medicao.pixel", "", "medicao", "Meta Pixel (só números)", "Mesma regra do GA4.", "texto"],
  ["medicao.search_console", "", "medicao", "Verificação do Google Search Console", "Só o código do content da meta tag (google-site-verification). Em branco, a tag não sai.", "texto"],

  // ------------------------------------------------------------------ SEO
  ["seo.descricao", "Corte de tecidos e modelagem para confecções em Caruaru-PE. Enfesto, corte com máquina e peças prontas para a costura. Agende pelo site ou WhatsApp.", "seo", "Descrição para o Google", "Até ~155 caracteres. É o texto que aparece embaixo do link na busca.", "longo"],
];

/* Serviços. "modelagem" vem do NOME da empresa ("Corte e Modelagem") — o
   painel cobra a conferência. Nenhum preço, nenhuma capacidade de máquina. */
const SERVICOS = [
  {
    slug: "corte-de-tecidos", titulo: "Corte de tecidos", medida: "enfesto + corte",
    resumo: "Enfesto e corte do seu tecido com máquina de faca vertical, seguindo o risco da sua modelagem.",
    imagem: "/assets/img/banco/rolos-azuis.webp", imagem_alt: "Rolos de tecido empilhados em tons de azul e verde",
    para_quem: "Confecções que compram o tecido e precisam do corte\nFacções que recebem o corte pronto para costurar\nQuem está começando uma marca e ainda não tem mesa de corte",
    conteudo: `<p>O corte é a etapa que decide o custo e o caimento de uma peça: <strong>tecido cortado errado não se conserta na costura</strong>. Na Corte Sam, o seu tecido é estendido em enfesto na mesa de corte e cortado com máquina de faca vertical, todas as folhas de uma vez, seguindo a linha do risco.</p>
<h2>Como funciona</h2>
<ol><li><strong>Você traz</strong> o tecido, o molde ou o risco impresso e a quantidade de peças por tamanho.</li><li><strong>A gente estende</strong> o enfesto: folha sobre folha, alinhado pela ourela, sem esticar o tecido.</li><li><strong>A gente corta</strong> seguindo o risco, com a máquina atravessando o enfesto inteiro.</li><li><strong>Você leva</strong> as partes cortadas e separadas, prontas para a costura.</li></ol>
<h2>Por que o enfesto importa</h2>
<p>Tecido estendido com tensão encolhe depois do corte, e a peça sai menor que o molde. Folha desalinhada gera partes tortas no fio. É por isso que o enfesto é feito com calma — e é por isso que ele define a qualidade do corte tanto quanto a máquina.</p>
<p>Quer calcular quanto tecido vai usar antes de vir? Use a <a href="/calculadora-de-enfesto/">calculadora de enfesto</a>.</p>`,
  },
  {
    slug: "corte-de-modelos", titulo: "Corte de modelos", medida: "do molde à peça",
    resumo: "Você traz o modelo e o tecido; a gente devolve as partes cortadas, prontas para costurar.",
    imagem: "/assets/img/banco/tesoura-molde.webp", imagem_alt: "Mãos cortando um molde de papel com tesoura sobre a mesa",
    para_quem: "Peça-piloto e primeira produção de um modelo novo\nReposição de modelos que já vendem\nLotes pequenos e médios",
    conteudo: `<p>Tem o molde e precisa das peças cortadas? O corte de modelos é para a confecção que já tem a modelagem pronta — em papel, em risco impresso ou a partir de uma peça-piloto — e quer as partes cortadas no tecido certo, na quantidade certa.</p>
<h2>O que trazer</h2>
<ul><li>O <strong>molde</strong> (ou o risco) de cada tamanho;</li><li>o <strong>tecido</strong>, com a largura útil anotada se possível;</li><li>a <strong>grade</strong>: quantas peças de cada tamanho;</li><li>qualquer detalhe do modelo — sentido do fio, estampa que precisa casar, partes em tecido diferente.</li></ul>
<h2>Combine antes</h2>
<p>Cada modelo tem um encaixe diferente. Agende pelo site ou chame no WhatsApp com os detalhes: assim o horário na mesa já fica reservado para o seu corte.</p>`,
  },
  {
    slug: "modelagem", titulo: "Modelagem", medida: "molde + grade",
    resumo: "Moldes para a sua peça, pensados para o corte: o encaixe começa na modelagem.",
    imagem: "/assets/img/banco/riscando-molde.webp", imagem_alt: "Mãos traçando um molde de roupa com giz sobre papel",
    para_quem: "Quem tem a ideia da peça e ainda não tem o molde\nConfecções que precisam ajustar um molde antes do corte",
    conteudo: `<p>A Corte Sam nasceu como <strong>Corte e Modelagem</strong>: o molde e o corte andam juntos. Um molde pensado para o corte encaixa melhor no tecido, desperdiça menos e chega à costura sem surpresa.</p>
<h2>Fale com a gente</h2>
<p>Conte qual é a peça, o tecido e a grade de tamanhos. O Samuel responde pelo WhatsApp em horário comercial e combina o que for preciso.</p>`,
  },
];

const FAQ = [
  ["Onde fica a Corte Sam?", "Na Rua 27 de Janeiro, 94, bairro Nossa Senhora das Dores, em Caruaru-PE (CEP 55004-470). A página Contato tem o mapa e o botão para abrir o caminho no Google Maps."],
  ["Qual é o horário de atendimento?", "De segunda a sexta, das 8h às 12h e das 14h às 18h. O WhatsApp é respondido dentro desse horário."],
  ["Preciso agendar o corte?", "O agendamento garante o seu horário na mesa de corte. Peça pelo site em um minuto; a Corte Sam confirma pelo WhatsApp."],
  ["O que eu levo para cortar?", "O tecido, o molde ou o risco de cada tamanho e a quantidade de peças por tamanho (a grade). Detalhes como sentido do fio ou estampa que precisa casar, avise na hora de agendar."],
  ["Quanto custa o corte?", "O valor depende do tecido, da quantidade de folhas e do modelo. Mande os detalhes pelo agendamento ou pelo WhatsApp e receba o orçamento."],
  ["Atendem confecções de Toritama e Santa Cruz do Capibaribe?", "Sim. O atendimento é na oficina, em Caruaru, e recebe confecções de todo o Polo do Agreste."],
  ["Quais as formas de pagamento?", "Cartão de débito e de crédito. Para outras formas, pergunte pelo WhatsApp."],
];

/* Fotos REAIS da oficina (enviadas pelo cliente ao site antigo). */
const GALERIA = [
  ["/assets/img/oficina/mesa-de-corte.webp", "A mesa de corte da oficina", "Tecido sendo cortado na mesa longa da oficina"],
  ["/assets/img/oficina/corte-malha.webp", "Corte com máquina de faca vertical", "Máquina de corte de faca vertical atravessando tecido rosa"],
  ["/assets/img/oficina/risco-encaixe.webp", "Risco com o encaixe das partes", "Risco impresso com as partes do molde coloridas encaixadas"],
  ["/assets/img/oficina/pecas-cortadas.webp", "Peças cortadas e separadas", "Partes de roupa em tecido rosa cortadas e empilhadas ao lado da máquina"],
  ["/assets/img/oficina/enfesto-rolo.webp", "Rolo no suporte do enfesto", "Rolo de tecido verde no suporte de enfesto ao lado da mesa"],
  ["/assets/img/oficina/maquina-estampa.webp", "Máquina, tecido estampado e moldes", "Máquina de corte sobre a mesa com rolo de tecido estampado e moldes"],
];

/* ------------------------------------------------------------ blog
   Textos EDUCATIVOS sobre o ofício — nada de fato inventado sobre a casa.
   É conteúdo que responde ao que o dono de confecção pesquisa, e é o que dá
   ao site assunto para subir no Google além da página inicial. */
const POSTS = [
  {
    title: "O que é enfesto e por que ele decide a qualidade do corte",
    slug: "o-que-e-enfesto",
    date: "2026-09-15", tema: "Enfesto",
    image: "/assets/img/banco/rolos-cores.webp", image_alt: "Rolos de tecido em tons de mostarda, marrom e vinho",
    excerpt: "Enfesto é o tecido estendido em folhas sobrepostas antes do corte. Entenda como ele é feito e os três erros que estragam um lote inteiro.",
    content: `<p><strong>Enfesto</strong> é o nome que a confecção dá ao tecido estendido em camadas — as <em>folhas</em> — sobre a mesa, uma em cima da outra, antes do corte. Em vez de cortar peça por peça, corta-se o enfesto inteiro de uma vez, e cada folha vira um conjunto de partes da roupa.</p>
<h2>Como o enfesto é montado</h2>
<p>O rolo é desenrolado ao longo da mesa até o comprimento do risco. No fim, o tecido é cortado e a próxima folha começa por cima, alinhada pela ourela (a borda do tecido). O número de folhas é o número de conjuntos que saem daquele corte.</p>
<h2>Os três erros que estragam um lote</h2>
<ol>
<li><strong>Tecido esticado.</strong> Estendido com tensão, o tecido — principalmente a malha — volta ao tamanho natural depois do corte, e a peça sai menor que o molde.</li>
<li><strong>Folhas desalinhadas.</strong> Se as bordas não coincidem, as partes de baixo saem fora do fio, e a roupa torce depois da lavagem.</li>
<li><strong>Enfesto alto demais para a máquina.</strong> Cada máquina e cada tecido têm um limite de altura em que o corte continua preciso. Passou dele, as folhas de baixo saem diferentes das de cima.</li>
</ol>
<h2>Direção do tecido</h2>
<p>Tecidos com pelo, brilho ou estampa com sentido precisam de todas as folhas na mesma direção. Tecido liso sem sentido permite o enfesto em "zigue-zague", mais rápido. Vale sempre avisar quem vai cortar.</p>
<h2>Quanto tecido o enfesto vai usar?</h2>
<p>A conta básica é o comprimento do risco, mais uma pequena folga nas pontas, vezes o número de folhas. Faça essa conta em segundos na nossa <a href="/calculadora-de-enfesto/">calculadora de enfesto</a> — e, se quiser o corte feito por quem entende, <a href="/agendamento/">agende na Corte Sam</a>.</p>`,
  },
  {
    title: "Risco e encaixe: como o molde bem encaixado economiza tecido",
    slug: "risco-e-encaixe-economia-de-tecido",
    date: "2026-09-08", tema: "Risco",
    image: "/assets/img/banco/marcando-molde.webp", image_alt: "Pessoa marcando o contorno de um molde sobre o tecido",
    excerpt: "O risco é o mapa do corte. Veja o que é encaixe, por que ele pesa tanto no custo da peça e o que conferir antes de mandar cortar.",
    content: `<p>Em confecção, o tecido costuma ser o item mais caro da peça. Por isso, a pergunta que mais importa antes do corte não é "quantas peças?", e sim <strong>"quanto tecido vai virar retalho?"</strong>. A resposta está no risco.</p>
<h2>O que é o risco</h2>
<p>O <strong>risco</strong> é o desenho de todas as partes do molde distribuídas sobre a largura do tecido — o mapa que a máquina segue no corte. Ele pode ser feito à mão, riscando os moldes sobre papel, ou impresso a partir de um programa de modelagem.</p>
<h2>O que é encaixe</h2>
<p><strong>Encaixe</strong> é a arte de arrumar as partes no risco ocupando o menor comprimento possível: virar uma manga, aproximar um bolso da gola, intercalar tamanhos grandes e pequenos. Um bom encaixe pode usar bem menos tecido que um encaixe feito às pressas — e essa diferença se repete em cada folha do enfesto.</p>
<h2>O que conferir antes de mandar cortar</h2>
<ul>
<li><strong>Largura útil do tecido:</strong> o risco precisa caber entre as ourelas, e a largura muda de um rolo para outro.</li>
<li><strong>Sentido do fio:</strong> toda parte tem uma direção; girar para "caber melhor" deforma a peça.</li>
<li><strong>Grade de tamanhos:</strong> quantas peças de cada tamanho vão no mesmo risco.</li>
<li><strong>Estampa e pelúcia:</strong> tecido com sentido não permite girar partes.</li>
</ul>
<h2>Do risco à mesa</h2>
<p>Com o risco pronto, o próximo passo é o <a href="/blog/o-que-e-enfesto/">enfesto</a> e o corte. Traga o seu risco para a <a href="/servicos/corte-de-tecidos/">Corte Sam</a>.</p>`,
  },
  {
    title: "Como preparar o seu pedido de corte: o checklist da confecção",
    slug: "como-preparar-pedido-de-corte",
    date: "2026-09-01", tema: "Produção",
    image: "/assets/img/banco/fita-metrica.webp", image_alt: "Fita métrica de costura enrolada sobre fundo branco",
    excerpt: "Tecido, molde, grade e prazo: o que separar antes de levar a produção para cortar, para o corte sair certo na primeira vez.",
    content: `<p>Boa parte dos problemas de corte não nasce na mesa, e sim antes dela: um tamanho que ficou de fora da grade, um rolo com largura diferente, um detalhe do modelo que ninguém avisou. Este checklist evita isso.</p>
<h2>1. O tecido</h2>
<ul><li>Quantidade suficiente para todas as folhas, com uma pequena sobra;</li><li>a <strong>largura útil</strong> anotada (medida entre as ourelas);</li><li>se o tecido tem sentido (pelo, brilho, estampa direcional).</li></ul>
<h2>2. O molde ou o risco</h2>
<ul><li>Todas as partes de todos os tamanhos, identificadas;</li><li>sentido do fio marcado em cada parte;</li><li>piques e marcações que a costura vai precisar.</li></ul>
<h2>3. A grade</h2>
<p>Quantas peças de cada tamanho. Parece óbvio, mas é o item que mais gera corte refeito.</p>
<h2>4. Os detalhes do modelo</h2>
<p>Partes em tecido de contraste, forro, entretela, estampa que precisa casar na frente da peça. Anote e entregue junto.</p>
<h2>5. O horário</h2>
<p>Com tudo separado, <a href="/agendamento/">agende o corte</a> e chegue com a produção pronta para ir à mesa. Se quiser estimar o tecido antes, use a <a href="/calculadora-de-enfesto/">calculadora de enfesto</a>.</p>`,
  },
];

/* --------------------------------------------------------------------- */
function semear() {
  TEXTOS.forEach(([chave, valor, grupo, rotulo, ajuda, tipo], i) =>
    semearTexto(chave, valor, { grupo, rotulo, ajuda, tipo, ordem: i }));

  Q.transacao(() => {
    if (!Q.um("SELECT COUNT(*) n FROM servicos").n)
      SERVICOS.forEach((s, i) => Q.roda(`INSERT INTO servicos (slug, titulo, resumo, conteudo, para_quem, imagem, imagem_alt, medida, ordem)
        VALUES (?,?,?,?,?,?,?,?,?)`, s.slug, s.titulo, s.resumo, s.conteudo, s.para_quem, s.imagem, s.imagem_alt, s.medida, i));
    if (!Q.um("SELECT COUNT(*) n FROM faq").n)
      FAQ.forEach(([p, r], i) => Q.roda("INSERT INTO faq (pergunta, resposta, ordem) VALUES (?,?,?)", p, r, i));
    if (!Q.um("SELECT COUNT(*) n FROM galeria").n)
      GALERIA.forEach(([img, leg, alt], i) => Q.roda("INSERT INTO galeria (imagem, legenda, alt, ordem) VALUES (?,?,?,?)", img, leg, alt, i));
    if (!Q.um("SELECT COUNT(*) n FROM posts").n)
      for (const p of POSTS)
        Q.roda(`INSERT INTO posts (title, slug, excerpt, content, image, image_alt, date, autor, tema, criado_por) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          p.title, p.slug, p.excerpt, p.content, p.image, p.image_alt, p.date, "Corte Sam", p.tema, "sistema");
  });
}

/* Primeiro acesso ao painel: senha SORTEADA, mostrada uma vez no log da
   primeira subida. `trocar_senha` obriga a troca no 1º login. */
function primeiroAdmin(cifrar) {
  if (Q.um("SELECT COUNT(*) n FROM usuarios").n) return null;
  const senha = process.env.CORTESAM_SENHA_INICIAL || crypto.randomBytes(9).toString("base64url");
  Q.roda("INSERT INTO usuarios (usuario, nome, senha, papel, trocar_senha) VALUES (?,?,?,?,1)",
    "admin", "Administrador", cifrar(senha), "administrador");
  return senha;
}

module.exports = { semear, primeiroAdmin, TEXTOS, SERVICOS, POSTS, GALERIA };
