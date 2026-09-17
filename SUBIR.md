# Subir a Corte Sam no servidor

Endereço de trabalho: **cortesam.projetos.luizaugust.me**. Ele fica fora do
Google sozinho. Quando o domínio da oficina existir (`cortesam.com.br` estava
**livre** no Registro.br em 17/09/2026), repete-se só o passo 4.

## 0. Antes: a porta

A porta local é a 5208, mas **porta livre aqui não é livre lá**. O servidor
tem sites que não estão no `launch.json`, como o Riacho Solar na 5196. Se o
nginx repassar para a porta de um vizinho, o domínio abre o site **dele**, com
200 e sem nenhum erro.

```bash
ss -ltnp | grep -oP ':\K52[0-9]{2}' | sort -u
```

Se a 5208 estiver ocupada, escolha outra. Depois ajuste `PORT=` em
`operacao/cortesam.service` e passe a porta como 2º argumento do
`criar-site.sh`.

## 0b. O repositório (na sua máquina)

O `git init` já foi feito na pasta (ramo `main`, nada commitado). Crie o
repositório no GitHub **privado** (há foto do Samuel e dados da empresa nas
imagens) e suba:

```bash
git add -A && git commit -m "Corte Sam 0.1.1"
git remote add origin https://github.com/luizwagm/site_cortesam.git
git push -u origin main
```

## 1. O código (como `deploy`, nunca como root)

```bash
sudo -u deploy git clone <repositório> /var/www/projetos/Corte-Sam
cd /var/www/projetos/Corte-Sam
sudo -u deploy npm ci --omit=dev
sudo -u deploy cp .env.exemplo .env && sudo chmod 600 .env
sudo -u deploy node ferramentas/baixar-imagens.cjs
```

Se você rodar `sudo npm ci` sem o `-u deploy`, o root vira dono de
`node_modules/` e a **próxima** entrega falha com "exit 243". Para consertar:
`sudo chown -R deploy:deploy /var/www/projetos/Corte-Sam`.

As fotos de banco (`assets/img/banco/`) estão no repositório, e o
`baixar-imagens.cjs` só baixa o que faltar. As fotos reais da oficina
(`assets/img/oficina/`) também estão no repositório.

## 2. O serviço e a cópia diária

```bash
sudo cp operacao/cortesam.service operacao/cortesam-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cortesam cortesam-backup.timer
```

## 2b. O reinício sem senha (uma vez por servidor)

```bash
echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart cortesam.service, /bin/systemctl restart cortesam.service' | sudo tee /etc/sudoers.d/cortesam
sudo chmod 440 /etc/sudoers.d/cortesam && sudo visudo -c
```

Sem essa regra, a entrega instala o código novo e para no último passo com o
serviço **velho** rodando. Parece que deu certo, e não deu.

## 3. O primeiro boot: a senha aparece UMA vez no log

```bash
sudo journalctl -u cortesam -n 40 --no-pager
```

O usuário é `admin`, com uma senha sorteada. O painel exige a troca antes de
liberar qualquer tela. Se perder a senha:
`sudo -u deploy node ferramentas/usuario.cjs admin`.

## 4. O vhost e o certificado

```bash
sudo ./criar-site.sh                    # cortesam.projetos.luizaugust.me
sudo ./criar-site.sh cortesam.com.br    # quando o domínio existir
```

O script confere o DNS, a porta (com `ss`) e o serviço antes de mexer no nginx.
Se o `nginx -t` recusar o vhost novo, ele devolve o anterior (ou tira o link de
`sites-enabled`). Um arquivo ruim deixado habilitado derrubaria o **próximo**
reload de qualquer site do servidor. O script também grava o `CORTESAM_SITE`
no `.env` e reinicia o serviço, porque o canonical é lido na subida.

**Os dois endereços ao mesmo tempo.** O site pode continuar respondendo pelo
endereço de trabalho depois que o domínio subir. Quem chega pelo host
`*.projetos.luizaugust.me` recebe `noindex` e um `robots.txt` fechado, qualquer
que seja o `CORTESAM_SITE`. A cópia de trabalho não concorre com o site no
Google (lição do Alafcell).

## 5. Conferir de fora

```bash
./verificar.sh                     # cortesam.projetos.luizaugust.me
./verificar.sh cortesam.com.br     # quando o domínio existir
```

## 6. Entregas seguintes

```bash
sudo -u deploy ./deploy.sh
```

O script puxa, instala e **prova**: roda a suíte inteira numa porta livre
entre 5238 e 5259, escolhida com `ss`, com banco temporário, mais a prova do
vhost. Só então reinicia. Depois confere se a versão no ar é a do código e se o
canonical está certo.

## 7. E-mail de aviso dos agendamentos

No `.env`, coloque `CORTESAM_SMTP=smtps://usuario:senha@smtp.provedor.com:465`
e reinicie. No painel, em **Textos e dados › Agendamento**, o campo "E-mail que
recebe os pedidos" já vem com `cortesam2014@hotmail.com`. Sem SMTP, os pedidos
continuam chegando ao painel; só o aviso por e-mail não sai.

## 8. Google (o que dá ranking local)

1. **Perfil da Empresa no Google**: crie ou reivindique a ficha da Corte Sam
   (Rua 27 de Janeiro, 94) e cole o link em **Textos e dados › Redes e
   Google**. Isso vale mais que qualquer outra coisa para "corte de tecidos
   Caruaru".
2. **Search Console**: verifique o domínio. Cole a meta tag em **Textos e
   dados › Medição** (o painel guarda só o código) e envie
   `https://cortesam.com.br/sitemap.xml`.
3. **GA4 e Meta Pixel** (opcionais): cole os IDs em **Medição**. Eles só
   carregam depois que o visitante aceita os cookies.

## O que depende do cliente

A tela **Início** do painel lista o que falta. Hoje:

- **confirmar o horário** seg–sex 8–12 e 14–18. Ele veio dos cartazes da
  oficina; o site antigo dizia 8–18 corridos;
- **confirmar o serviço "Modelagem"**, que veio do nome "Corte e Modelagem";
- **confirmar os dois telefones** da placa e se o WhatsApp é o 99481-9330;
- **preço**: o site não publica. O "R$ 30 mínimo" e os "10% à vista" do site
  antigo são de 2020;
- **Perfil da Empresa no Google**: não foi encontrado;
- **depoimentos reais**: a seção fica escondida até existir um;
- **registrar `cortesam.com.br`**, que está livre.
