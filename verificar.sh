#!/usr/bin/env bash
# ==========================================================================
# CORTE SAM — verificação de fora (de qualquer máquina com curl)
#
#   ./verificar.sh                         → endereço de trabalho
#   ./verificar.sh cortesam.com.br
#
# Pergunta primeiro se o site RESPONDE e para ali se não: verificador que
# segue com o site fora do ar inventa problemas (já gritou 27 onde havia um).
# ==========================================================================
set -uo pipefail
D="${1:-cortesam.projetos.luizaugust.me}"
U="https://$D"
F=0
ok()   { printf "  \033[1;32m✔\033[0m %s\n" "$1"; }
ruim() { printf "  \033[1;31m✖\033[0m %s\n" "$1"; F=$((F+1)); }
cod()  { curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$1"; }

echo; echo "Verificando $U"; echo
SAUDE=$(curl -s --max-time 10 "$U/saude" || true)
if ! echo "$SAUDE" | grep -q '"ok":true'; then
  ruim "o site não respondeu /saude — pare aqui: é queda, não é detalhe. (${SAUDE:-sem resposta})"
  exit 1
fi
ok "no ar: $SAUDE"
INDEX=$(echo "$SAUDE" | grep -o '"indexavel":[a-z]*' | cut -d: -f2)

for P in / /servicos/ /servicos/corte-de-tecidos/ /agendamento/ /calculadora-de-enfesto/ /sobre/ /blog/ /contato/ /privacidade/ /robots.txt /sitemap.xml /llms.txt /manifest.webmanifest /assets/img/og.png /assets/css/site.css; do
  C=$(cod "$U$P"); [ "$C" = "200" ] && ok "$P 200" || ruim "$P respondeu $C"
done
# O que NUNCA pode sair: por lugar, não por extensão.
for P in /server.js /package.json /src/db.js /data/site.db /.env /assets/../server.js /data/segredo.txt /testes/provar.cjs; do
  C=$(cod "$U$P"); [ "$C" = "404" ] || [ "$C" = "400" ] && ok "$P não é servido ($C)" || ruim "$P respondeu $C — VAZAMENTO"
done
C=$(cod "http://$D/"); [ "$C" = "301" ] && ok "http → https (301)" || ruim "http respondeu $C"

CAB=$(curl -s -I --max-time 10 "$U/")
echo "$CAB" | grep -qi 'content-security-policy' && ok "CSP presente" || ruim "sem CSP"
echo "$CAB" | grep -qi 'x-frame-options: DENY' && ok "X-Frame-Options DENY" || ruim "sem X-Frame-Options"
CANON=$(curl -s --max-time 10 "$U/" | grep -o 'rel="canonical" href="[^"]*"' | head -1)
echo "$CANON" | grep -q "href=\"$U/\"" && ok "canonical aponta para $U/" || ruim "canonical errado: $CANON"

if [ "$INDEX" = "true" ]; then
  curl -s "$U/robots.txt" | grep -q "Sitemap: $U/sitemap.xml" && ok "robots aponta o sitemap" || ruim "robots sem sitemap"
  echo "$CAB" | grep -qi 'strict-transport-security' && ok "HSTS na home" || ruim "sem HSTS na home"
  curl -s -I "$U/assets/css/site.css" | grep -qi 'strict-transport-security' && ok "HSTS nos estáticos" || ruim "sem HSTS em /assets/ (add_header do location apagou o do server)"
  C=$(cod "https://www.$D/"); { [ "$C" = "301" ] || [ "$C" = "000" ]; } && ok "www: $C" || ruim "www respondeu $C (deveria ser 301)"
else
  curl -s "$U/robots.txt" | grep -q "Disallow: /$" && ok "fora do índice (robots fecha tudo)" || ruim "endereço de trabalho ABERTO ao Google"
fi
echo; [ "$F" -eq 0 ] && printf "\033[1;32mTudo certo.\033[0m\n" || printf "\033[1;31m%s problema(s).\033[0m\n" "$F"
exit "$F"
