#!/usr/bin/env bash
# ==========================================================================
# CORTE SAM — entrega de versão nova
#
#   sudo -u deploy ./deploy.sh
#
# Puxa o código, instala, PROVA (suíte inteira, porta própria e banco
# descartável) e SÓ ENTÃO reinicia. Se a prova falha, o site segue no ar com a
# versão anterior.
#
# O QUE ELE NÃO FAZ, DE PROPÓSITO:
#  · não roda como root — `sudo npm ci` faz o root virar dono de node_modules/
#    e a entrega SEGUINTE falha com "exit 243", sem dizer por quê;
#  · não toca no banco — a semeadura roda na subida do servidor e nunca
#    sobrescreve o que o cliente editou no painel;
#  · não usa `npm ci --silent` — ele cala o npm INCLUSIVE no erro.
# ==========================================================================
set -uo pipefail

RAIZ="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
cd "$RAIZ" || exit 1
UNIDADE="cortesam"
PORTA="${PORT:-5208}"

verde()   { printf "\033[1;32m%s\033[0m\n" "$1"; }
amarelo() { printf "\033[1;33m%s\033[0m\n" "$1"; }
erro()    { printf "\033[1;31m%s\033[0m\n" "$1" >&2; }
azul()    { printf "\033[1;34m%s\033[0m\n" "$1"; }

ENDERECO=$(grep -m1 '^CORTESAM_SITE=' "$RAIZ/.env" 2>/dev/null | cut -d= -f2-)
[ -n "$ENDERECO" ] || ENDERECO="https://cortesam.projetos.luizaugust.me"

echo; azul "Corte Sam — deploy"; echo

if [ "$(id -u)" -eq 0 ]; then
  erro "Não rode o deploy como root. Rode:  sudo -u deploy ./deploy.sh"
  erro "Se já rodou com sudo, devolva a posse:  sudo chown -R deploy:deploy \"$RAIZ\""
  exit 1
fi
EU="$(id -un)"

# As pastas de escrita da unidade (ProtectSystem=strict) têm de existir antes.
mkdir -p "$RAIZ/data" "$RAIZ/assets/img/uploads" "$RAIZ/backups"

# ==========================================================================
# O REINÍCIO PRECISA DE SUDO SEM SENHA — conferido ANTES de mexer em nada
#
# Sem a regra no sudoers, a entrega instala o código novo e para no último
# passo com o serviço VELHO rodando: a pior metade de uma entrega, porque
# parece ter dado certo. `sudo -n -l` pergunta sem executar; como a resposta
# depende da configuração do sudo (e já deu falso alarme em outro site do
# parque), aqui ele AVISA — quem decide é o passo 5, que falha com a instrução.
# O sudo casa pelo caminho ABSOLUTO, que varia entre distribuições: por isso
# a regra leva /usr/bin e /bin.
# ==========================================================================
if ! sudo -n -l systemctl restart "${UNIDADE}.service" >/dev/null 2>&1; then
  amarelo "  ! não confirmei o sudo sem senha para reiniciar o serviço. Se o passo 5 falhar:"
  amarelo "    echo '$EU ALL=(root) NOPASSWD: /usr/bin/systemctl restart ${UNIDADE}.service, /bin/systemctl restart ${UNIDADE}.service' | sudo tee /etc/sudoers.d/${UNIDADE}"
  amarelo "    sudo chmod 440 /etc/sudoers.d/${UNIDADE} && sudo visudo -c"
fi

# ------------------------------------------------------------------ 1. código
azul "1/5  código"
ANTES="$(git rev-parse HEAD 2>/dev/null || echo '-')"
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  QUANTOS=$(git status --porcelain | wc -l)
  erro "     há $QUANTOS arquivo(s) não commitados NO SERVIDOR:"
  git status --short | head -10 | sed 's/^/       /' >&2
  erro "     resolva antes (commit, stash ou descarte consciente)."
  exit 1
fi
git fetch --quiet origin || { erro "     git fetch falhou"; exit 1; }
git pull --ff-only --quiet || { erro "     git pull --ff-only falhou — o ramo local divergiu."; exit 1; }
DEPOIS="$(git rev-parse HEAD)"
if [ "$ANTES" = "$DEPOIS" ]; then echo "     nada novo ($(git rev-parse --short HEAD))"
else echo "     $(git rev-parse --short "$ANTES") → $(git rev-parse --short "$DEPOIS")"; git log --oneline "$ANTES..$DEPOIS" | sed 's/^/       /'; fi

# ------------------------------------------------------------ 2. dependências
azul "2/5  dependências"
for PASTA in "$RAIZ/node_modules" "$HOME/.npm"; do
  [ -e "$PASTA" ] || continue
  DONO=$(stat -c '%U' "$PASTA" 2>/dev/null || echo "?")
  if [ "$DONO" != "$EU" ] && [ "$DONO" != "?" ]; then
    erro "     $PASTA pertence a '$DONO' (você é '$EU'); o 'npm ci' não vai conseguir apagá-la."
    erro "       sudo chown -R $EU:$EU \"$PASTA\""
    exit 1
  fi
done
if ! npm ci --omit=dev --no-audit --no-fund > /tmp/cortesam-npm.log 2>&1; then
  erro "     O 'npm ci' falhou:"; tail -25 /tmp/cortesam-npm.log | sed 's/^/       /' >&2
  exit 1
fi
echo "     ok"

# ----------------------------------------------------------------- 3. fotos
azul "3/5  fotos de banco (ambientação)"
QUANTAS=$(find "$RAIZ/assets/img/banco" -name '*.webp' 2>/dev/null | wc -l)
if [ "$QUANTAS" -lt 36 ]; then
  amarelo "     só $QUANTAS fotos em assets/img/banco/ — baixando o que falta"
  node ferramentas/baixar-imagens.cjs || { erro "     não consegui baixar as fotos"; exit 1; }
else
  echo "     $QUANTAS arquivos"
fi

# ---------------------------------------------------------------- 4. provas
# Porta própria e banco temporário: provar na porta do site conversaria com
# o processo que JÁ está no ar e aprovaria o código antigo.
azul "4/5  provando antes de subir"
# Porta das provas: a primeira LIVRE entre 5238 e 5259. Porta livre na máquina
# de quem desenvolve não diz nada sobre este servidor.
PORTA_PROVAS=""
for P in $(seq 5238 5259); do
  if ! ss -ltn 2>/dev/null | grep -qE "[:.]$P\s"; then PORTA_PROVAS=$P; break; fi
done
[ -n "$PORTA_PROVAS" ] || { erro "     nenhuma porta livre entre 5238 e 5259 para as provas"; exit 1; }
echo "     porta das provas: $PORTA_PROVAS"
if ! CORTESAM_PORTA_PROVAS="$PORTA_PROVAS" node testes/provar.cjs > /tmp/cortesam-provas.log 2>&1; then
  erro "     As provas FALHARAM. O serviço NÃO foi reiniciado; o site segue na versão anterior."
  grep -E '✖' /tmp/cortesam-provas.log | head -20 | sed 's/^/       /' >&2
  exit 1
fi
tail -1 /tmp/cortesam-provas.log | sed 's/^/     /'
# O vhost também é provado a cada entrega: o criar-site.sh é o mesmo código, e
# o Picanha 0.1.1 subiu com diretiva repetida que só o `nginx -t` do servidor viu.
if ! node testes/vhost.cjs > /tmp/cortesam-vhost.log 2>&1; then
  erro "     A prova do vhost FALHOU (o criar-site.sh geraria configuração inválida)."
  grep -E '✖' /tmp/cortesam-vhost.log | head -10 | sed 's/^/       /' >&2
  exit 1
fi
tail -1 /tmp/cortesam-vhost.log | sed 's/^/     /'

# --------------------------------------------------------------- 5. serviço
azul "5/5  reiniciando o serviço"
# `-n`: sem regra no sudoers, falha NA HORA com a instrução, em vez de ficar
# parado pedindo uma senha que ninguém vai digitar (no GitHub Actions, trava).
if ! sudo -n systemctl restart "${UNIDADE}.service"; then
  erro "  ✖ o código novo está instalado, mas o serviço NÃO reiniciou (sudo pediu senha)."
  erro "    Crie a regra uma vez:"
  erro "      echo '$EU ALL=(root) NOPASSWD: /usr/bin/systemctl restart ${UNIDADE}.service, /bin/systemctl restart ${UNIDADE}.service' | sudo tee /etc/sudoers.d/${UNIDADE}"
  erro "      sudo chmod 440 /etc/sudoers.d/${UNIDADE} && sudo visudo -c"
  erro "    e reinicie à mão agora:  sudo systemctl restart ${UNIDADE}"
  exit 1
fi
NOAR=0
for _ in $(seq 1 25); do
  if curl -fsS --max-time 2 "http://127.0.0.1:${PORTA}/saude" > /tmp/cortesam-saude.json 2>/dev/null; then NOAR=1; break; fi
  sleep 1
done
if [ "$NOAR" -ne 1 ]; then
  erro "  ✖ o serviço não respondeu em 25 s — journalctl -u ${UNIDADE} -n 40 --no-pager"
  exit 1
fi
VERSAO_NO_AR=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("/tmp/cortesam-saude.json","utf8")).versao)')
VERSAO_CODIGO=$(node -p 'require("./package.json").version')
[ "$VERSAO_NO_AR" = "$VERSAO_CODIGO" ] || { erro "  ✖ no ar está a $VERSAO_NO_AR, o código é $VERSAO_CODIGO — o serviço não reiniciou?"; exit 1; }
verde "  ✔ no ar — versão $VERSAO_NO_AR"

# O canonical errado manda o Google indexar outro endereço, e nada na tela
# denuncia. Conferido a cada entrega.
CANON=$(curl -fsS --max-time 5 "http://127.0.0.1:${PORTA}/" 2>/dev/null | grep -o 'rel="canonical" href="[^"]*"' | head -1 | sed 's/.*href="//;s/"//')
if [ -n "$CANON" ] && [ "${CANON#"$ENDERECO"}" != "$CANON" ]; then echo "    canonical: ${CANON} ✔"
else erro "  ! o canonical saiu '${CANON}', fora de '${ENDERECO}'. Confira o .env."; fi
if curl -fsS --max-time 5 -I "http://127.0.0.1:${PORTA}/" 2>/dev/null | grep -qi 'x-robots-tag.*noindex'; then
  echo "    fora do índice do Google (endereço de trabalho) ✔"
else
  amarelo "    INDEXÁVEL — endereço público."
fi
echo
