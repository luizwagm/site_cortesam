# Changelog — Corte Sam

Versionamento: a 1ª casa não muda; a 2ª sobe com funcionalidade nova; a 3ª
sobe com correção.

## 0.1.1 — 17/09/2026

- Rodapé: a base (direitos e CNPJ, privacidade e crédito das fotos, assinatura
  da LA) cabe em **uma linha** a partir de 900 px. No celular continua
  empilhada, com espaço para o botão do WhatsApp.
- **Correção no `criar-site.sh`**: um comentário com crases dentro do heredoc
  do vhost era EXECUTADO na geração: rodava `nginx -t` e apagava o texto no
  arquivo gerado. No servidor, a saída do comando iria parar dentro do vhost.
  Crases escapadas; a prova do vhost confere que os comentários chegam
  inteiros (26 provas, e a nova falhou antes do conserto).
- Operação: pasta `backups/` criada pelo `deploy.sh` e pelo `criar-site.sh`
  (a unidade de cópia diária não consegue criá-la com `ProtectSystem=strict`);
  `.claude/` fora do repositório; subida preparada para
  cortesam.projetos.luizaugust.me.

## 0.1.0 — 17/09/2026

Primeira versão. Substitui o site antigo (cortesam.ueniweb.com).

### Identidade
- Conceito **"o corte certo"**: o site é uma mesa de corte, com a grade do
  tapete, a régua, a linha tracejada com tesoura e o giz amarelo.
- **Marca modernizada**: a onda do logotipo antigo virou três folhas de enfesto,
  cortadas por uma lâmina amarela e deslocadas depois dela. O nome vai em
  Anybody pesada, com o mesmo corte. Logotipo, ícones, favicon e imagem de
  compartilhamento são gerados das fontes do próprio site.
- Paleta tinta, azul Sam, celeste, papel, kraft e giz, com contraste medido.
  Tipografia Anybody + Figtree + IBM Plex Mono, servidas pelo próprio site.

### Site
- Início com capa cortada (a foto se divide na lâmina), faixa de palavras,
  serviços, **"Do rolo à peça"** (quatro etapas com fotos reais da oficina,
  presas na tela no desktop), calculadora de enfesto resumida, a oficina e o
  Samuel, o Polo de Confecções, depoimentos (só quando existirem), blog e
  perguntas frequentes.
- **Serviços** com página própria: corte de tecidos, corte de modelos e
  modelagem. O endereço congela ao renomear.
- **Calculadora de enfesto**: metros de tecido, peças, tecido por peça e peso
  da malha pela gramatura. Funciona sem JavaScript (o servidor calcula) e ao
  vivo com JavaScript, com a mesma conta nos dois lados, provada em 400 casos.
  O resultado vira agendamento já preenchido.
- **Agendamento de corte** em três passos, seg–sex, com horários da oficina, a
  partir de amanhã. A confirmação vai pelo WhatsApp, com código, página de
  confirmação assinada e aviso por e-mail.
- Blog com temas, tempo de leitura, agendamento por data futura e rascunho com
  pré-visualização. Nasce com três textos educativos (enfesto, risco e
  encaixe, checklist do pedido).
- A oficina (texto, fotos reais, fatos), contato com mapa sob demanda e
  política de privacidade (LGPD).

### SEO
- LocalBusiness com endereço, geo, telefone, CNPJ, pagamento, catálogo de
  serviços, área atendida (Caruaru, Toritama, Santa Cruz do Capibaribe,
  Agreste) e ação de agendar. O horário vai **estruturado** e só quando o texto
  é entendido com segurança.
- Service, BlogPosting, Blog, FAQPage, BreadcrumbList, WebSite, WebApplication
  (calculadora), AboutPage e ContactPage.
- sitemap (só o que está no ar), robots com um grupo só, `llms.txt`,
  manifesto, canonical, Search Console pelo painel e 301 dos endereços
  prováveis do site antigo.
- O endereço de trabalho fica fora do índice pelo endereço público **e pelo
  host do pedido**.
- Calculadora e blog com parâmetros levam `noindex`.

### Painel
- Agendamentos com confirmar/recusar abrindo o WhatsApp do cliente, nota
  interna e lançamento por telefone. Também: mensagens, serviços com editor,
  blog, galeria só de fotos reais, depoimentos, perguntas frequentes, textos e
  dados, usuários (administrador e redator), acessos sem cookie e auditoria só
  de acréscimo (travada também no banco).
- Tela Início com o que falta no site: Perfil do Google, SMTP, horário que o
  Google não entende, conferência da Modelagem, depoimentos, Search Console.

### Segurança
- CSP com nonce, estáticos servidos por lugar (não por extensão), SVG em
  sandbox e upload conferido pelos bytes, com nome sorteado.
- Sessão HttpOnly/SameSite. A senha provisória bloqueia o painel até a troca.
  Freio de senha por IP e por conta, e checagem de Origin.
- Formulários com campo-armadilha, ficha de tempo assinada e freio por IP.

### Operação
- `criar-site.sh` (confere DNS, porta e serviço; devolve o vhost anterior se o
  `nginx -t` recusar), `deploy.sh` (prova antes de reiniciar), `verificar.sh`,
  unidade systemd contida e cópia diária do banco.
- 163 provas no site e 24 no vhost. A suíte foi sabotada: 12 defeitos
  plantados, 12 pegos (três só depois de reforçar a prova: travessia de pasta
  com barra codificada, HTML limpo já na gravação, fim de linha LF).

### Medição (Lighthouse local, Windows)
- Desktop: desempenho 97–99. Acessibilidade, boas práticas e SEO: 100.
- Celular: desempenho 81–87 (início, serviço, blog) e 79 (calculadora).
  Acessibilidade, boas práticas e SEO: 100.
- Neste Windows, até uma página só de texto gasta 600–700 ms no primeiro
  layout com a CPU reduzida (fontes do sistema). Parte do tempo de bloqueio no
  celular é do ambiente de medição; o PageSpeed (Linux) deve medir menos.
- Sem transbordo lateral em 360, 390, 768, 1024 e 1440 px, em todas as páginas
  e no painel.
