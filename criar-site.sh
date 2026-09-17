#!/usr/bin/env bash
# ==========================================================================
# CORTE SAM — criar o site no servidor (padrão do parque, ver Bonito)
#
#   sudo ./criar-site.sh                          → cortesam.projetos.luizaugust.me
#   sudo ./criar-site.sh cortesam.com.br    → o domínio de verdade
#   sudo ./criar-site.sh <dominio> <porta> [email]
#
# Cria o vhost do nginx, emite o certificado e testa a renovação. Roda UMA vez
# por domínio; depois é o deploy.sh que entrega versão nova.
#
# Sob *.projetos.luizaugust.me o navegador recusa http:// (HSTS do domínio
# pai): o certificado é PRÉ-REQUISITO para abrir a página a primeira vez. E não
# existe www num subdomínio — pedir certificado para ele derruba o pedido todo.
#
# MODO DE ENSAIO (sem root, sem nginx, sem DNS): gera só o vhost.
#   CORTESAM_VHOST_ENSAIO=/tmp/v.conf ./criar-site.sh cortesam.com.br
# ==========================================================================
set -uo pipefail

DOMINIO="${1:-cortesam.projetos.luizaugust.me}"
PORTA="${2:-5208}"
EMAIL="${3:-luizwagm@gmail.com}"
RAIZ="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
SERVICO="cortesam"
ENSAIO="${CORTESAM_VHOST_ENSAIO:-}"

verde()   { printf "\033[1;32m%s\033[0m\n" "$1"; }
amarelo() { printf "\033[1;33m%s\033[0m\n" "$1"; }
vermelho(){ printf "\033[1;31m%s\033[0m\n" "$1"; }
azul()    { printf "\033[1;34m%s\033[0m\n" "$1"; }

[ -n "$ENSAIO" ] || [ "$(id -u)" -eq 0 ] || { vermelho "Rode com sudo."; exit 1; }

PONTOS=$(echo "$DOMINIO" | tr -cd '.' | wc -c)
SUBDOMINIO=0
[ "$PONTOS" -ge 3 ] && SUBDOMINIO=1

echo
azul "Corte Sam — instalação de $DOMINIO na porta $PORTA"
echo

if [ -n "$ENSAIO" ]; then
  echo "     [ensaio] pulando DNS, porta e serviço"
  DOMINIOS="-d $DOMINIO"
  [ "$SUBDOMINIO" -eq 0 ] && DOMINIOS="$DOMINIOS -d www.$DOMINIO"
fi

if [ -z "$ENSAIO" ]; then
# ====================================================================== 1/7 DNS
echo "1/7  Conferindo o DNS"
MEUS_IPS=$(
  { ip -4 addr show scope global 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}';
    ip -6 addr show scope global 2>/dev/null | grep -oP '(?<=inet6\s)[0-9a-f:]+';
    curl -s --max-time 5 https://api.ipify.org 2>/dev/null;
    curl -s --max-time 5 https://api64.ipify.org 2>/dev/null; } | sort -u
)
resolve() { dig +short "$1" "$2" 2>/dev/null | grep -v '\.$' | head -1; }
daqui()   { [ -n "$1" ] && echo "$MEUS_IPS" | grep -qxF "$1"; }
A=$(resolve "$DOMINIO" A); AAAA=$(resolve "$DOMINIO" AAAA)
if daqui "$A" || daqui "$AAAA"; then
  verde "     $DOMINIO -> ${A:-$AAAA}  (é este servidor)"
else
  vermelho "     $DOMINIO -> ${A:-${AAAA:-nada}} — não aponta para este servidor. O certbot vai falhar."
  exit 1
fi
DOMINIOS="-d $DOMINIO"
if [ "$SUBDOMINIO" -eq 0 ]; then
  WA=$(resolve "www.$DOMINIO" A); WAAAA=$(resolve "www.$DOMINIO" AAAA)
  if daqui "$WA" || daqui "$WAAAA"; then DOMINIOS="$DOMINIOS -d www.$DOMINIO"; verde "     www.$DOMINIO entra no certificado"
  else amarelo "     www.$DOMINIO não resolve para cá — fica de fora do certificado"; fi
fi

# ==================================================================== 2/7 porta
# Porta livre na máquina de quem desenvolve NÃO é livre aqui (o Riacho Solar
# ocupa a 5196 e nunca esteve no launch.json). Repasse para porta de vizinho
# devolve o site DELE com 200 e sem erro nenhum.
echo "2/7  Conferindo a porta $PORTA"
DONO=$(ss -ltnp 2>/dev/null | grep -E "127\.0\.0\.1:$PORTA |:::$PORTA |0\.0\.0\.0:$PORTA " || true)
if [ -n "$DONO" ]; then
  if echo "$DONO" | grep -q "$RAIZ" || systemctl is-active --quiet "$SERVICO.service" 2>/dev/null; then
    verde "     porta $PORTA já é do $SERVICO.service — reinstalação"
  else
    vermelho "     a porta $PORTA está ocupada por OUTRO processo:"; echo "$DONO" | sed 's/^/       /'
    echo "     Escolha outra (e ajuste PORT na unidade):  ss -ltnp | grep -oP ':\\K52[0-9]{2}' | sort -u"
    exit 1
  fi
else
  verde "     porta $PORTA livre"
fi

# ================================================================== 3/7 serviço
echo "3/7  Conferindo o serviço"
ESTADO=$(systemctl show -p LoadState --value "$SERVICO.service" 2>/dev/null || echo "erro")
if [ "$ESTADO" != "loaded" ]; then
  amarelo "     $SERVICO.service ainda não existe (LoadState=$ESTADO). Instale antes:"
  echo "       sudo cp $RAIZ/operacao/$SERVICO.service /etc/systemd/system/"
  echo "       sudo systemctl daemon-reload && sudo systemctl enable --now $SERVICO"
  exit 1
fi
# As pastas de escrita: o serviço NÃO consegue criá-las (ProtectSystem=strict).
for P in data assets/img/uploads backups; do
  if [ ! -d "$RAIZ/$P" ]; then mkdir -p "$RAIZ/$P"; chown deploy:deploy "$RAIZ/$P"; amarelo "     criei $P/ (dona: deploy)"; fi
done
systemctl is-active --quiet "$SERVICO.service" || { systemctl start "$SERVICO.service" 2>/dev/null || true; sleep 2; }
SAUDE=$(curl -s --max-time 5 "http://127.0.0.1:$PORTA/saude" || echo "")
if echo "$SAUDE" | grep -q '"ok":true'; then
  verde "     $SERVICO responde em 127.0.0.1:$PORTA — $SAUDE"
else
  vermelho "     127.0.0.1:$PORTA não respondeu /saude. journalctl -u $SERVICO -n 40 --no-pager"
  exit 1
fi

# ===================================================================== 4/7 .env
echo "4/7  Gravando o endereço no .env"
ENV="$RAIZ/.env"
touch "$ENV"; chmod 600 "$ENV"
if grep -q '^CORTESAM_SITE=' "$ENV"; then sed -i "s|^CORTESAM_SITE=.*|CORTESAM_SITE=https://$DOMINIO|" "$ENV"
else echo "CORTESAM_SITE=https://$DOMINIO" >> "$ENV"; fi
chown deploy:deploy "$ENV" 2>/dev/null || true
verde "     CORTESAM_SITE=https://$DOMINIO"
if [ "$SUBDOMINIO" -eq 1 ]; then
  amarelo "     endereço de trabalho: FORA do índice do Google (robots, meta e X-Robots-Tag)"
else
  amarelo "     DOMÍNIO PÚBLICO. Antes de divulgar, confira no painel: horário, serviços, WhatsApp e e-mail de aviso."
fi
fi   # fim do trecho que o ensaio pula

# ==================================================================== 5/7 vhost
echo "5/7  Criando o vhost"
HSTS_SERVER=""; HSTS_ASSETS=""
if [ "$SUBDOMINIO" -eq 0 ]; then
  # SEM preload: a lista de precarga é praticamente irreversível — decisão do dono.
  HSTS_SERVER='    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'
  HSTS_ASSETS='        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'
fi

if [ -z "$ENSAIO" ]; then
  # Zonas do limitador: contexto http, nome GLOBAL. Dentro do vhost, o
  # segundo domínio do mesmo site derrubaria o nginx inteiro ("already bound").
  cat > /etc/nginx/conf.d/cortesam-limites.conf <<'LIMITES'
# Gerado por criar-site.sh — Corte Sam (vale para TODOS os vhosts do site)
limit_req_zone $binary_remote_addr zone=cortesam_login:10m rate=20r/m;
limit_req_zone $binary_remote_addr zone=cortesam_forms:10m rate=10r/m;
LIMITES
  verde "     zonas do limitador em /etc/nginx/conf.d/cortesam-limites.conf"
fi

ARQ="/etc/nginx/sites-available/$DOMINIO"
[ -n "$ENSAIO" ] && ARQ="$ENSAIO"
BAK=""
[ -f "$ARQ" ] && { BAK="$ARQ.bak-$(date +%F-%H%M%S)"; cp "$ARQ" "$BAK"; amarelo "     já existia — guardei uma cópia em $(basename "$BAK")"; }

BLOCO_WWW=""
if [ "$SUBDOMINIO" -eq 0 ] && echo "$DOMINIOS" | grep -q " -d www.$DOMINIO"; then
  # O www NÃO divide o server_name: duas cópias do site dividem a força dos
  # links. Bloco próprio, só com 301 — e o .well-known ANTES, senão o certbot
  # não valida o www.
  BLOCO_WWW=$(cat <<WWW
server {
    listen 80;
    listen [::]:80;
    server_name www.$DOMINIO;
    location ^~ /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$DOMINIO\$request_uri; }
}
WWW
)
fi

cat > "$ARQ" <<NGINX
# Gerado por criar-site.sh — Corte Sam
# Confira com \`nginx -T\` (o -t aprova bloco que o nginx nem carregou).
$BLOCO_WWW
server {
    listen 80;
    listen [::]:80;
    server_name $DOMINIO;

    location ^~ /.well-known/acme-challenge/ { root /var/www/html; }

    access_log /var/log/nginx/$DOMINIO.access.log;
    error_log  /var/log/nginx/$DOMINIO.error.log;

    # Teto baixo para o site todo; só o envio de foto do painel passa disso.
    client_max_body_size 1m;

    # Os tempos limite ficam AQUI, no server, e não no arquivo comum de proxy:
    # o nginx recusa a MESMA diretiva duas vezes no MESMO bloco (lição do
    # Picanha 0.1.1, em que o \`nginx -t\` do servidor recusou tudo). Quem
    # precisar de outro valor redefine num location — contexto interno.
    proxy_connect_timeout 10s;
    proxy_read_timeout    30s;
$HSTS_SERVER

    gzip on;
    gzip_vary on;
    gzip_min_length 512;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_types text/plain text/css text/javascript application/javascript application/json
               application/xml image/svg+xml application/manifest+json;

    # Estáticos direto do disco, sem acordar o Node. O CSS/JS vão com ?v= da
    # versão: muda a versão, muda o endereço, o navegador busca de novo.
    # ⚠ add_header aqui APAGA os do server — por isso o HSTS é repetido.
    location ^~ /assets/ {
        alias $RAIZ/assets/;
        expires 30d;
        add_header Cache-Control "public" always;
        add_header X-Content-Type-Options "nosniff" always;
$HSTS_ASSETS
        access_log off;
        try_files \$uri =404;
    }

    # Freio de borda do login e dos formulários: o abuso nem acorda o processo.
    location = /api/admin/entrar {
        limit_req zone=cortesam_login burst=5 nodelay;
        proxy_pass http://127.0.0.1:$PORTA;
        include /etc/nginx/proxy_cortesam.conf;
    }
    location ~ ^/(agendamento|contato)\$ {
        limit_req zone=cortesam_forms burst=5 nodelay;
        proxy_pass http://127.0.0.1:$PORTA;
        include /etc/nginx/proxy_cortesam.conf;
    }

    # Envio de foto do painel: o navegador já reduz, mas uma foto em base64
    # passa de 1 MB com folga.
    location = /api/admin/upload {
        client_max_body_size 9m;
        proxy_pass http://127.0.0.1:$PORTA;
        include /etc/nginx/proxy_cortesam.conf;
    }

    location / {
        proxy_pass http://127.0.0.1:$PORTA;
        include /etc/nginx/proxy_cortesam.conf;
    }
}
NGINX

# O arquivo comum de proxy: SÓ cabeçalhos e versão do HTTP — nada que algum
# location precise redefinir (tempo limite fica no server, ver acima).
# O X-Forwarded-For ACRESCENTA o IP real no FIM; a aplicação lê o último item
# (e prefere o X-Real-IP). Ler o primeiro já desligou a trava de força bruta
# em quatro servidores do parque.
# No ensaio ele sai ao lado do vhost, para a prova (testes/vhost.cjs) poder
# expandir o `include` e procurar diretiva repetida sem precisar de nginx.
PROXY_ARQ="/etc/nginx/proxy_cortesam.conf"
[ -n "$ENSAIO" ] && PROXY_ARQ="$ENSAIO.proxy.conf"
cat > "$PROXY_ARQ" <<'PROXY'
proxy_http_version 1.1;
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
PROXY

if [ -n "$ENSAIO" ]; then verde "[ensaio] vhost escrito em $ARQ (proxy em $PROXY_ARQ)"; exit 0; fi

ln -sf "$ARQ" "/etc/nginx/sites-enabled/$DOMINIO"
if ! nginx -t 2>&1 | sed 's/^/     /'; then
  # NÃO DEIXAR O VHOST QUEBRADO HABILITADO. O nginx no ar não foi recarregado,
  # mas o PRÓXIMO reload de qualquer site do servidor (inclusive a renovação
  # automática do certbot) falharia por causa deste arquivo — longe da causa.
  # Com versão anterior boa, ela volta; sem, o link sai.
  if [ -n "$BAK" ]; then
    cp "$BAK" "$ARQ"
    vermelho "     configuração inválida — voltei o vhost anterior ($(basename "$BAK"))"
  else
    rm -f "/etc/nginx/sites-enabled/$DOMINIO"
    vermelho "     configuração inválida — tirei o link de sites-enabled"
  fi
  if nginx -t >/dev/null 2>&1; then verde "     o nginx voltou a validar: o servidor ficou como estava"
  else vermelho "     ATENÇÃO: o nginx continua sem validar — rode 'sudo nginx -t' e veja qual arquivo"; fi
  exit 1
fi
systemctl reload nginx
verde "     vhost ativo em HTTP"

# ============================================================== 6/7 certificado
echo "6/7  Emitindo o certificado"
# shellcheck disable=SC2086
if certbot --nginx $DOMINIOS --redirect --agree-tos --no-eff-email -m "$EMAIL" --non-interactive; then
  verde "     certificado emitido e HTTPS ativo"
else
  vermelho "     o certbot falhou — /var/log/letsencrypt/letsencrypt.log"; exit 1
fi

# ================================================================ 7/7 conferir
echo "7/7  Reiniciando com o endereço novo e conferindo"
# O CORTESAM_SITE é lido na SUBIDA: sem reiniciar, o canonical continua o antigo.
systemctl restart "$SERVICO.service"; sleep 2
HTTPS=$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMINIO/" || echo 000)
CANON=$(curl -s "https://$DOMINIO/" | grep -o 'rel="canonical" href="[^"]*"' | head -1)
echo "     https://$DOMINIO -> $HTTPS"
echo "     $CANON"
certbot renew --dry-run >/dev/null 2>&1 && verde "     renovação automática testada" || amarelo "     rode 'certbot renew --dry-run'"
[ "$HTTPS" = "200" ] && verde "Pronto: https://$DOMINIO" || vermelho "Algo não respondeu 200. Rode ./verificar.sh $DOMINIO"
