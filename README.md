# Corte Sam

Site da **Corte Sam — Corte e Modelagem**, uma oficina de corte de tecidos
para confecções em Caruaru-PE. O lema da casa é *"O corte certo da moda"*.

- **Site público**: início, serviços (com página própria cada um), calculadora
  de enfesto, agendamento de corte online, a oficina, blog, contato com mapa e
  política de privacidade.
- **Painel** (`/admin/`): agendamentos com confirmação pelo WhatsApp,
  mensagens, serviços, blog, galeria da oficina, depoimentos, perguntas
  frequentes, textos e dados, usuários (administrador e redator), acessos e
  auditoria.
- **SEO**: LocalBusiness com horário estruturado e área atendida, Service,
  BlogPosting, FAQPage, BreadcrumbList, sitemap, robots, `llms.txt`,
  manifesto, canonical, e `noindex` automático no endereço de trabalho.
- **Integrações**: WhatsApp, GA4 e Meta Pixel (só depois do aceite de
  cookies), Search Console, Perfil da Empresa no Google, mapa do Google (só
  carrega com clique), e-mail de aviso (SMTP).

A identidade visual e as razões de cada escolha estão em
[IDENTIDADE.md](IDENTIDADE.md). A subida no servidor está em
[SUBIR.md](SUBIR.md).

## Rodar local

```bash
npm install
npm start          # http://127.0.0.1:5208
```

Na primeira subida, o terminal mostra a senha do usuário `admin` **uma vez**.
O banco fica em `data/` (fora do git).

## Provas

```bash
npm test           # 163 provas: site, SEO, segurança, formulários, painel, papéis
node testes/vhost.cjs   # o vhost do nginx gerado pelo criar-site.sh
```

A suíte sobe o servidor de verdade num banco temporário, como se fosse o
domínio definitivo. Ela não toca em `data/`.

## Pilha

Node 20+ sem framework, SQLite (better-sqlite3), páginas geradas a cada
pedido, CSP com nonce, sessões com scrypt, freio de senha por IP e por conta,
formulários com campo-armadilha, ficha de tempo assinada e freio por IP (sem
CAPTCHA).

## Ferramentas

| Comando | Para quê |
|---|---|
| `node ferramentas/baixar-imagens.cjs` | Baixa as fotos de banco (Unsplash) listadas no arquivo, que também registra a origem de cada uma |
| `python ferramentas/fotos-oficina.py <pasta>` | Converte as fotos reais da oficina para WebP, sem ampliar |
| `node ferramentas/marca.cjs` | Gera logotipo, ícones, favicon e imagem de compartilhamento a partir de `assets/img/marca.svg` |
| `node ferramentas/usuario.cjs <usuario> [papel]` | Cria usuário ou sorteia senha provisória nova pelo terminal |
| `node ferramentas/backup.cjs` | Cópia consistente do banco (o timer diário roda às 03:30) |

Desenvolvido por LA Software House.
