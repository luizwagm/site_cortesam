/* ==========================================================================
   PAINEL DA CORTE SAM — aplicação de página única, sem biblioteca

   A tela mostra o que o papel pode usar, mas quem decide é o servidor
   (src/sessao.js → pode()). Esconder botão aqui é conforto, não trava.
   Todo texto que vem do banco passa por esc() antes de virar HTML.
   ========================================================================== */
(function () {
  "use strict";
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var app = $("#app");
  var EU = null, AREAS = null, SITE = "", CONT = {};

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function aviso(msg, erro) {
    var d = document.createElement("div"); d.className = "aviso" + (erro ? " aviso--erro" : ""); d.textContent = msg;
    $("#avisos").appendChild(d); setTimeout(function () { d.remove(); }, erro ? 6500 : 3200);
  }
  var DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  var MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  function dataBr(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : ""; }
  function quandoBr(ts) { if (!ts) return ""; var d = new Date(String(ts).replace(" ", "T") + (String(ts).length <= 19 ? "Z" : "")); return isNaN(d) ? ts : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); }
  function hojeIso() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  /* ------------------------------------------------------------ API */
  function api(metodo, caminho, corpo) {
    return fetch("/api/admin" + caminho, {
      method: metodo, credentials: "same-origin",
      headers: corpo !== undefined ? { "Content-Type": "application/json" } : {},
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && caminho !== "/entrar") { EU = null; telaLogin(); throw new Error(j.erro || "Entre de novo."); }
        if (!r.ok) throw new Error(j.erro || "Erro " + r.status);
        return j;
      });
    });
  }
  function falha(e) { aviso(e.message || String(e), true); }

  /* ------------------------------------------------------------ modal */
  function modal(titulo, html, opcoes) {
    opcoes = opcoes || {};
    var m = document.createElement("div"); m.className = "modal";
    m.innerHTML = '<div class="modal__caixa' + (opcoes.largo ? " modal__caixa--largo" : "") + '" role="dialog" aria-modal="true" aria-label="' + esc(titulo) + '">' +
      '<div class="modal__cab"><h2>' + esc(titulo) + '</h2><button class="modal__fechar" type="button" aria-label="Fechar">×</button></div>' +
      '<div class="modal__corpo">' + html + "</div></div>";
    document.body.appendChild(m);
    function fechar() { m.remove(); document.removeEventListener("keydown", tecla); }
    function tecla(e) { if (e.key === "Escape") fechar(); }
    document.addEventListener("keydown", tecla);
    $(".modal__fechar", m).addEventListener("click", fechar);
    m.addEventListener("mousedown", function (e) { if (e.target === m) fechar(); });
    var foco = $("input:not([type=hidden]), select, textarea, [contenteditable]", m); if (foco) setTimeout(function () { foco.focus(); }, 30);
    return { el: m, fechar: fechar };
  }
  function confirmar(texto) { return window.confirm(texto); }

  /* ------------------------------------------------------------ imagem
     Reduz no navegador antes de mandar: foto de celular tem 4 000 px e 5 MB;
     o site não mostra nada maior que 1 800 px. */
  function reduzirImagem(arquivo, max) {
    max = max || 1800;
    return new Promise(function (ok, erro) {
      if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) return erro(new Error("Envie JPG, PNG ou WEBP."));
      var leitor = new FileReader();
      leitor.onload = function () {
        var img = new Image();
        img.onload = function () {
          var k = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          ok(c.toDataURL("image/jpeg", 0.86));
        };
        img.onerror = function () { erro(new Error("A imagem parece corrompida.")); };
        img.src = leitor.result;
      };
      leitor.onerror = function () { erro(new Error("Não consegui ler o arquivo.")); };
      leitor.readAsDataURL(arquivo);
    });
  }
  function enviarImagem(arquivo, max) {
    return reduzirImagem(arquivo, max).then(function (dataUrl) { return api("POST", "/upload", { dataUrl: dataUrl }); }).then(function (r) { return r.caminho; });
  }
  var SEM_FOTO = "/assets/img/icone-192.png";
  function campoImagem(nome, valor, rotulo) {
    return '<div class="campo"><span>' + esc(rotulo || "Imagem") + '</span><div class="upload" data-upload="' + nome + '">' +
      '<img src="' + esc(valor || SEM_FOTO) + '" alt="">' +
      '<label class="btn btn--sm">Escolher foto<input type="file" accept="image/jpeg,image/png,image/webp"></label>' +
      (valor ? '<button type="button" class="btn btn--sm btn--perigo" data-tirar>Tirar</button>' : "") +
      '<input type="hidden" name="' + nome + '" value="' + esc(valor || "") + '"></div></div>';
  }
  function ligarUploads(raiz) {
    $$("[data-upload]", raiz).forEach(function (u) {
      var inp = $("input[type=file]", u), oculto = $("input[type=hidden]", u), img = $("img", u);
      inp.addEventListener("change", function () {
        if (!inp.files[0]) return;
        img.style.opacity = ".4";
        enviarImagem(inp.files[0]).then(function (c) { oculto.value = c; img.src = c; img.style.opacity = ""; aviso("Imagem enviada."); })
          .catch(function (e) { img.style.opacity = ""; falha(e); });
      });
      var tirar = $("[data-tirar]", u); if (tirar) tirar.addEventListener("click", function () { oculto.value = ""; img.src = SEM_FOTO; });
    });
  }

  /* ------------------------------------------------------------ editor rico
     O servidor higieniza tudo de novo (lista branca). A colagem entra como
     TEXTO: colar do Word traria fonte, cor e tamanho junto. */
  function editor(html, opcoes) {
    opcoes = opcoes || {};
    return '<div class="editor' + (opcoes.curto ? " editor--curto" : "") + '"><div class="editor__barra">' +
      '<button type="button" data-cmd="bold" title="Negrito"><b>N</b></button>' +
      '<button type="button" data-cmd="italic" title="Itálico"><i>I</i></button>' +
      (opcoes.curto ? "" : '<button type="button" data-cmd="formatBlock" data-val="h2" title="Subtítulo">T</button>' +
        '<button type="button" data-cmd="formatBlock" data-val="p" title="Parágrafo">¶</button>' +
        '<button type="button" data-cmd="insertUnorderedList" title="Lista">•</button>' +
        '<button type="button" data-cmd="insertOrderedList" title="Lista numerada">1.</button>' +
        '<button type="button" data-cmd="formatBlock" data-val="blockquote" title="Citação">“</button>') +
      '<button type="button" data-cmd="createLink" title="Link">🔗</button>' +
      '<button type="button" data-cmd="removeFormat" title="Limpar formatação">⌫</button>' +
      '</div><div class="editor__area" contenteditable="true" data-vazio="' + esc(opcoes.vazio || "Escreva aqui…") + '">' + (html || "") + "</div></div>";
  }
  function ligarEditores(raiz) {
    $$(".editor", raiz).forEach(function (ed) {
      var area = $(".editor__area", ed);
      $$("[data-cmd]", ed).forEach(function (b) {
        b.addEventListener("mousedown", function (e) { e.preventDefault(); });
        b.addEventListener("click", function () {
          var cmd = b.getAttribute("data-cmd"), val = b.getAttribute("data-val");
          if (cmd === "createLink") { val = window.prompt("Endereço do link (https://… ou /pagina/)"); if (!val) return; }
          document.execCommand(cmd, false, val ? (cmd === "formatBlock" ? "<" + val + ">" : val) : null);
          area.focus();
        });
      });
      area.addEventListener("paste", function (e) {
        e.preventDefault();
        var t = (e.clipboardData || window.clipboardData).getData("text/plain");
        var html = t.split(/\n{2,}/).map(function (p) { return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>"; }).join("");
        document.execCommand("insertHTML", false, html);
      });
    });
  }
  function lerEditor(raiz, indice) { var a = $$(".editor__area", raiz)[indice || 0]; return a ? a.innerHTML.trim() : ""; }
  function formDados(form) {
    var d = {};
    $$("input, select, textarea", form).forEach(function (el) {
      if (!el.name || el.type === "file") return;
      if (el.type === "radio") { if (el.checked) d[el.name] = el.value; return; }
      d[el.name] = el.type === "checkbox" ? el.checked : el.value;
    });
    return d;
  }

  /* ================================================================ LOGIN */
  function telaLogin(msg) {
    app.className = "";
    app.innerHTML = '<div class="login"><div class="login__arte" aria-hidden="true"></div><div class="login__caixa">' +
      '<form id="f-login" novalidate><img src="/assets/img/logo-negativo.png" alt="Corte Sam"><h1>Painel da oficina</h1>' +
      '<p>Agendamentos, serviços, blog e o site inteiro.</p>' +
      '<label>Usuário<input name="usuario" autocomplete="username" required autocapitalize="off"></label>' +
      '<label>Senha<input name="senha" type="password" autocomplete="current-password" required></label>' +
      '<div class="login__erro" role="alert">' + esc(msg || "") + '</div>' +
      '<button class="btn btn--brasa" type="submit">Entrar</button></form></div></div>';
    $("#f-login").addEventListener("submit", function (e) {
      e.preventDefault();
      var d = formDados(e.target), b = $("button", e.target); b.disabled = true;
      api("POST", "/entrar", { usuario: d.usuario, senha: d.senha }).then(iniciar).catch(function (er) { b.disabled = false; $(".login__erro").textContent = er.message; });
    });
    $("input[name=usuario]").focus();
  }

  function telaTrocarSenha(obrigatoria) {
    return (obrigatoria ? '<div class="aviso-caixa">Primeiro acesso: troque a senha provisória antes de continuar.</div>' : "") +
      '<form id="f-senha" class="form-grade" novalidate>' +
      '<label class="campo largo"><span>Senha atual</span><input name="atual" type="password" autocomplete="current-password" required></label>' +
      '<label class="campo"><span>Nova senha</span><input name="nova" type="password" autocomplete="new-password" required minlength="8"><small>8+ caracteres, com letras e números.</small></label>' +
      '<label class="campo"><span>Repita a nova senha</span><input name="nova2" type="password" autocomplete="new-password" required></label>' +
      '<div class="form-acoes largo"><button class="btn btn--brasa" type="submit">Trocar senha</button></div></form>';
  }
  function ligarTrocarSenha(raiz, depois) {
    $("#f-senha", raiz).addEventListener("submit", function (e) {
      e.preventDefault();
      var d = formDados(e.target);
      if (d.nova !== d.nova2) return aviso("As duas senhas novas não batem.", true);
      api("POST", "/senha", { atual: d.atual, nova: d.nova }).then(function () { aviso("Senha trocada."); if (EU) EU.trocar_senha = false; if (depois) depois(); }).catch(falha);
    });
  }

  /* ================================================================ CASCA */
  var TELAS = [
    { id: "painel", rot: "Início", area: "painel", g: "" },
    { id: "agendamentos", rot: "Agendamentos", area: "agendamentos", g: "Atendimento", cont: "agendamentos" },
    { id: "mensagens", rot: "Mensagens", area: "mensagens", g: "Atendimento", cont: "mensagens" },
    { id: "servicos", rot: "Serviços", area: "servicos", g: "Conteúdo" },
    { id: "blog", rot: "Blog", area: "blog", g: "Conteúdo" },
    { id: "galeria", rot: "Galeria da oficina", area: "galeria", g: "Conteúdo" },
    { id: "avaliacoes", rot: "Depoimentos", area: "avaliacoes", g: "Conteúdo" },
    { id: "faq", rot: "Perguntas frequentes", area: "faq", g: "Conteúdo" },
    { id: "textos", rot: "Textos e dados", area: "textos", g: "Site" },
    { id: "usuarios", rot: "Usuários", area: "usuarios", g: "Sistema" },
    { id: "acessos", rot: "Acessos", area: "acessos", g: "Sistema" },
    { id: "auditoria", rot: "Auditoria", area: "auditoria", g: "Sistema" },
    { id: "conta", rot: "Minha conta", area: null, g: "" },
  ];
  var PAPEL = { administrador: "Administrador", redator: "Redator" };
  function pode(area) { return !area || AREAS === "*" || (Array.isArray(AREAS) && AREAS.indexOf(area) >= 0); }

  function iniciar() {
    api("GET", "/eu").then(function (j) {
      EU = j.usuario; AREAS = j.areas; SITE = j.site;
      if (EU.trocar_senha) {
        app.className = "";
        app.innerHTML = '<div class="area" style="max-width:640px;margin:3rem auto"><div class="cabeca"><div><h1>Trocar a senha</h1><p>Olá, ' + esc(EU.nome) + '.</p></div></div><div class="cartao"><div class="cartao__corpo">' + telaTrocarSenha(true) + "</div></div></div>";
        ligarTrocarSenha(app, iniciar);
        return;
      }
      montarCasca();
      rotear();
    }).catch(function () { telaLogin(); });
  }

  function montarCasca() {
    app.className = "";
    var grupos = {}, ordem = [];
    TELAS.forEach(function (t) { if (t.id === "conta" || !pode(t.area)) return; if (!grupos[t.g]) { grupos[t.g] = []; ordem.push(t.g); } grupos[t.g].push(t); });
    var nav = ordem.map(function (g) {
      return (g ? '<div class="lateral__grupo">' + esc(g) + "</div>" : "") + grupos[g].map(function (t) {
        return '<a href="#/' + t.id + '" data-tela="' + t.id + '">' + esc(t.rot) + (t.cont ? '<span class="cont" data-cont="' + t.cont + '" hidden></span>' : "") + "</a>";
      }).join("");
    }).join("");
    app.innerHTML = '<div class="casca" id="casca">' +
      '<aside class="lateral"><a class="lateral__marca" href="#/painel"><img src="/assets/img/icone-192.png" alt=""><span><b>Corte Sam</b><small>painel</small></span></a>' +
      "<nav>" + nav + "</nav>" +
      '<div class="lateral__pe"><strong>' + esc(EU.nome) + '</strong><span class="papel">' + esc(PAPEL[EU.papel] || EU.papel) + "</span><br>" +
      '<a href="/" target="_blank" rel="noopener">Ver o site</a><a href="#/conta">Minha conta</a><button type="button" id="sair">Sair</button></div></aside>' +
      '<div><div class="topo-movel"><button type="button" id="abrir-menu">☰ Menu</button><b>Corte Sam</b><span></span></div><main class="area" id="area"></main></div></div>';
    $("#sair").addEventListener("click", function () { api("POST", "/sair", {}).finally(function () { EU = null; telaLogin(); }); });
    $("#abrir-menu").addEventListener("click", function () { $("#casca").classList.toggle("menu-aberto"); });
    $(".lateral").addEventListener("click", function (e) { if (e.target.closest("a")) $("#casca").classList.remove("menu-aberto"); });
    atualizarContadores();
  }

  function atualizarContadores() {
    if (!pode("agendamentos") && !pode("mensagens")) return;
    api("GET", "/painel").then(function (j) {
      CONT = { agendamentos: j.agenda_pendentes, mensagens: j.mensagens_novas };
      $$("[data-cont]").forEach(function (el) { var n = CONT[el.getAttribute("data-cont")]; el.hidden = !n; el.textContent = n || ""; });
    }).catch(function () {});
  }

  function rotear() {
    if (!EU) return;
    var id = (location.hash.replace(/^#\/?/, "") || "painel").split("?")[0];
    var tela = TELAS.find(function (t) { return t.id === id; }) || TELAS[0];
    if (!pode(tela.area)) tela = TELAS[0];
    $$(".lateral nav a").forEach(function (a) { a.classList.toggle("ativo", a.getAttribute("data-tela") === tela.id); });
    var area = $("#area");
    area.innerHTML = '<div class="vazio">Carregando…</div>';
    document.title = tela.rot + " · Painel · Corte Sam";
    try { TELA[tela.id](area); } catch (e) { falha(e); }
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", rotear);

  function cabeca(titulo, sub, acoes) {
    return '<div class="cabeca"><div><h1>' + esc(titulo) + "</h1>" + (sub ? "<p>" + sub + "</p>" : "") + '</div><div class="cabeca__acoes">' + (acoes || "") + "</div></div>";
  }

  /* ================================================================ TELAS */
  var TELA = {};

  /* ---------------------------------------------------------------- início */
  TELA.painel = function (area) {
    api("GET", "/painel").then(function (j) {
      var kpis = "";
      if (j.agenda_hoje !== undefined) kpis += '<div class="cartao kpi kpi--brasa"><small>Cortes hoje</small><strong>' + j.agenda_hoje + '</strong><span>pendentes e confirmados</span></div>' +
        '<div class="cartao kpi"><small>Aguardando confirmação</small><strong>' + j.agenda_pendentes + '</strong><span><a href="#/agendamentos">confirmar agora</a></span></div>';
      if (j.mensagens_novas !== undefined) kpis += '<div class="cartao kpi"><small>Mensagens não lidas</small><strong>' + j.mensagens_novas + '</strong><span><a href="#/mensagens">ler</a></span></div>';
      if (j.blog) kpis += '<div class="cartao kpi"><small>Textos no blog</small><strong>' + (j.blog.n || 0) + "</strong><span>" + (j.blog.rascunhos || 0) + ' em rascunho · <a href="#/blog?novo">escrever</a></span></div>';
      if (j.visitantes_hoje !== undefined) kpis += '<div class="cartao kpi"><small>Visitantes hoje</small><strong>' + j.visitantes_hoje + "</strong><span>" + j.visitantes_7 + ' nos últimos 7 dias · <a href="#/acessos">detalhes</a></span></div>';
      var semana = j.agenda_semana ? '<div class="cartao"><div class="cartao__cab"><h2>Próximos 14 dias</h2></div><div class="cartao__corpo"><ul class="lista-simples">' +
        (j.agenda_semana.length ? j.agenda_semana.map(function (d) { var dt = new Date(d.data + "T12:00:00"); return "<li><span>" + DIAS[dt.getDay()] + ", " + dataBr(d.data) + "</span><b>" + d.n + (d.n === 1 ? " corte" : " cortes") + "</b></li>"; }).join("") : "<li>Nenhum agendamento nos próximos dias.</li>") +
        "</ul></div></div>" : "";
      var prox = j.proximos ? '<div class="cartao"><div class="cartao__cab"><h2>Próximos agendamentos</h2><a class="btn btn--sm" href="#/agendamentos">Todos</a></div><div class="cartao__corpo">' +
        (j.proximos.length ? '<div class="agenda">' + j.proximos.map(cartaoAgendamento).join("") + "</div>" : '<div class="vazio">Nenhum agendamento pela frente.</div>') + "</div></div>" : "";
      var pend = j.pendencias && j.pendencias.length ? '<div class="cartao" style="margin-top:1.2rem"><div class="cartao__cab"><h2>O que falta no site</h2></div><div class="cartao__corpo"><ul class="pendencias">' +
        j.pendencias.map(function (p) { return "<li>" + esc(p.texto) + "</li>"; }).join("") + "</ul></div></div>" : "";
      area.innerHTML = cabeca("Olá, " + EU.nome.split(" ")[0], "Hoje é " + new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }) + ".",
        pode("agendamentos") ? '<button class="btn btn--brasa" type="button" id="novo-ag">+ Agendamento por telefone</button>' : pode("blog") ? '<a class="btn btn--brasa" href="#/blog?novo">+ Novo texto</a>' : "") +
        '<div class="grade-kpi">' + kpis + "</div>" +
        (prox || semana ? '<div class="duas"><div>' + prox + "</div><div>" + semana + pend + "</div></div>" : pend);
      ligarAgendamentos(area, function () { TELA.painel(area); });
      var na = $("#novo-ag"); if (na) na.addEventListener("click", function () { novoAgendamento(function () { TELA.painel(area); }); });
    }).catch(falha);
  };

  /* ---------------------------------------------------------------- agendamentos */
  var ROT_AG = { pendente: "Pendente", confirmado: "Confirmado", recusado: "Recusado", cancelado: "Cancelado", concluido: "Concluído" };
  function cartaoAgendamento(a) {
    var dt = new Date(a.data + "T12:00:00"), hoje = a.data === hojeIso();
    var acoes = "";
    if (a.status === "pendente") acoes += '<a class="btn btn--zap btn--sm" href="' + esc(a.zap_confirmar) + '" target="_blank" rel="noopener" data-status="confirmado" data-id="' + a.id + '">✓ Confirmar no WhatsApp</a>' +
      '<a class="btn btn--sm btn--perigo" href="' + esc(a.zap_recusar) + '" target="_blank" rel="noopener" data-status="recusado" data-id="' + a.id + '">Recusar</a>';
    if (a.status === "confirmado") acoes += '<button class="btn btn--sm" type="button" data-status="concluido" data-id="' + a.id + '">Cortado ✓</button>' +
      '<button class="btn btn--sm btn--perigo" type="button" data-status="cancelado" data-id="' + a.id + '">Cancelar</button>';
    if (a.status !== "pendente" && a.status !== "confirmado") acoes += '<button class="btn btn--sm" type="button" data-status="pendente" data-id="' + a.id + '">Voltar a pendente</button>';
    acoes += '<a class="btn btn--sm" href="' + esc(a.zap) + '" target="_blank" rel="noopener">WhatsApp</a><button class="btn btn--sm" type="button" data-editar-ag="' + a.id + '">Editar / nota</button>';
    return '<div class="cartao agendamento' + (hoje ? " agendamento--hoje" : "") + '" data-agendamento="' + a.id + '">' +
      '<div class="agendamento__quando"><span>' + DIAS[dt.getDay()] + " · " + MESES[dt.getMonth()] + "</span><b>" + dt.getDate() + "</b><strong>" + esc(a.horario) + "</strong></div>" +
      '<div class="agendamento__info"><h3>' + esc(a.nome) + ' <span class="etq etq--' + a.status + '">' + ROT_AG[a.status] + "</span></h3>" +
      "<p><b>" + esc(a.servico || "Serviço não informado") + "</b>" + (a.tecido ? " · " + esc(a.tecido) : "") + (a.pecas ? " · " + a.pecas + " peças" : "") + "</p>" +
      "<p>" + (a.empresa ? esc(a.empresa) + " · " : "") + esc(a.telefone_fmt) + (a.email ? " · " + esc(a.email) : "") + ' · código <b class="codigo-mono">' + esc(a.codigo) + "</b>" + (a.origem === "calculadora" ? " · veio da calculadora" : a.origem === "painel" ? " · lançado no painel" : "") + "</p>" +
      (a.observacoes ? '<div class="obs">💬 ' + esc(a.observacoes) + "</div>" : "") +
      (a.nota ? '<div class="obs">📝 <i>' + esc(a.nota) + "</i></div>" : "") + "</div>" +
      '<div class="agendamento__acoes">' + acoes + "</div></div>";
  }
  function ligarAgendamentos(raiz, recarregar) {
    $$("[data-status]", raiz).forEach(function (b) {
      b.addEventListener("click", function () {
        /* O link do WhatsApp abre JÁ (sem esperar o servidor): janela aberta
           depois de um `await` é bloqueada como pop-up. A situação grava junto. */
        var st = b.getAttribute("data-status");
        if ((st === "cancelado" || st === "recusado") && b.tagName !== "A" && !confirmar("Marcar este agendamento como " + ROT_AG[st].toLowerCase() + "?")) return;
        api("PUT", "/agendamentos/" + b.getAttribute("data-id"), { status: st }).then(function () { aviso("Agendamento " + ROT_AG[st].toLowerCase() + "."); atualizarContadores(); recarregar(); }).catch(falha);
      });
    });
    $$("[data-editar-ag]", raiz).forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-editar-ag");
        var m = modal("Editar agendamento", '<form class="form-grade" id="f-ea">' +
          '<label class="campo"><span>Data</span><input type="date" name="data"></label>' +
          '<label class="campo"><span>Horário</span><input type="time" name="horario"></label>' +
          '<label class="campo largo"><span>Nota interna</span><textarea name="nota" rows="3" placeholder="Só a equipe vê. Ex.: 40 folhas, trazer o risco impresso"></textarea></label>' +
          '<div class="form-acoes largo"><button class="btn btn--brasa" type="submit">Salvar</button></div></form>');
        api("GET", "/agendamentos?periodo=todos").then(function (j) {
          var a = j.agendamentos.find(function (x) { return String(x.id) === String(id); }); if (!a) return;
          var f = $("#f-ea", m.el); f.data.value = a.data; f.horario.value = a.horario; f.nota.value = a.nota || "";
        });
        $("#f-ea", m.el).addEventListener("submit", function (e) {
          e.preventDefault();
          api("PUT", "/agendamentos/" + id, formDados(e.target)).then(function () { m.fechar(); aviso("Agendamento salvo."); recarregar(); }).catch(falha);
        });
      });
    });
  }
  function novoAgendamento(depois) {
    Promise.all([api("GET", "/servicos"), api("GET", "/textos")]).then(function (r) {
      var servicos = r[0].servicos.filter(function (s) { return s.ativo; });
      var horarios = (r[1].textos.find(function (t) { return t.chave === "agenda.horarios"; }) || {}).valor || "";
      var lista = horarios.split(",").map(function (h) { return h.trim(); }).filter(Boolean);
      var m = modal("Agendamento por telefone", '<form class="form-grade" id="f-na">' +
        '<label class="campo"><span>Nome</span><input name="nome" required></label>' +
        '<label class="campo"><span>Confecção</span><input name="empresa"></label>' +
        '<label class="campo"><span>WhatsApp</span><input name="telefone" required placeholder="(81) 9 0000-0000"></label>' +
        '<label class="campo"><span>Serviço</span><select name="servico"><option value="">—</option>' + servicos.map(function (s) { return "<option>" + esc(s.titulo) + "</option>"; }).join("") + "</select></label>" +
        '<label class="campo"><span>Data</span><input type="date" name="data" required></label>' +
        '<label class="campo"><span>Horário</span>' + (lista.length ? '<select name="horario" required>' + lista.map(function (h) { return "<option>" + esc(h) + "</option>"; }).join("") + "</select>" : '<input type="time" name="horario" required>') + "</label>" +
        '<label class="campo"><span>Peças (aprox.)</span><input type="number" name="pecas" min="1"></label>' +
        '<label class="campo largo"><span>Observações</span><textarea name="observacoes" rows="2"></textarea></label>' +
        '<p class="largo" style="margin:0;color:var(--tinta-3)">Entra já como CONFIRMADO — quem ligou já combinou com a oficina. Valem as mesmas regras do site (a partir de amanhã, dias de atendimento).</p>' +
        '<div class="form-acoes largo"><button class="btn btn--brasa" type="submit">Lançar agendamento</button></div></form>');
      $("#f-na", m.el).addEventListener("submit", function (e) {
        e.preventDefault();
        api("POST", "/agendamentos", formDados(e.target)).then(function (res) { m.fechar(); aviso("Agendamento " + res.codigo + " lançado."); atualizarContadores(); if (depois) depois(); })
          .catch(falha);
      });
    }).catch(falha);
  }
  var filtroAg = { periodo: "proximos", status: "", q: "" };
  TELA.agendamentos = function (area) {
    area.innerHTML = cabeca("Agendamentos", "Pedidos do site e agendamentos por telefone. Confirmar abre o WhatsApp do cliente com a mensagem pronta.", '<button class="btn btn--brasa" type="button" id="novo-ag">+ Agendamento por telefone</button>') +
      '<div class="filtros"><div class="abas" id="abas-ag">' +
      [["hoje", "Hoje"], ["proximos", "Próximos"], ["passados", "Passados"], ["todos", "Todos"]].map(function (a) { return '<button type="button" data-p="' + a[0] + '"' + (filtroAg.periodo === a[0] ? ' class="ativo"' : "") + ">" + a[1] + "</button>"; }).join("") +
      '</div><select id="st-ag"><option value="">Todas as situações</option>' + Object.keys(ROT_AG).map(function (k) { return '<option value="' + k + '"' + (filtroAg.status === k ? " selected" : "") + ">" + ROT_AG[k] + "</option>"; }).join("") + "</select>" +
      '<input class="busca" id="q-ag" placeholder="Buscar nome, confecção, telefone ou código" value="' + esc(filtroAg.q) + '"></div><div id="lista-ag"><div class="vazio">Carregando…</div></div>';
    function carregar() {
      var qs = "?periodo=" + filtroAg.periodo + "&status=" + filtroAg.status + "&q=" + encodeURIComponent(filtroAg.q);
      api("GET", "/agendamentos" + qs).then(function (j) {
        var l = $("#lista-ag");
        if (!j.agendamentos.length) { l.innerHTML = '<div class="cartao vazio">Nenhum agendamento aqui.</div>'; return; }
        l.innerHTML = '<div class="agenda">' + j.agendamentos.map(cartaoAgendamento).join("") + "</div>";
        ligarAgendamentos(l, carregar);
      }).catch(falha);
    }
    $$("#abas-ag button").forEach(function (b) { b.addEventListener("click", function () { filtroAg.periodo = b.getAttribute("data-p"); $$("#abas-ag button").forEach(function (x) { x.classList.toggle("ativo", x === b); }); carregar(); }); });
    $("#st-ag").addEventListener("change", function (e) { filtroAg.status = e.target.value; carregar(); });
    var t; $("#q-ag").addEventListener("input", function (e) { clearTimeout(t); t = setTimeout(function () { filtroAg.q = e.target.value; carregar(); }, 300); });
    $("#novo-ag").addEventListener("click", function () { novoAgendamento(carregar); });
    carregar();
  };

  /* ---------------------------------------------------------------- mensagens */
  TELA.mensagens = function (area) {
    api("GET", "/mensagens").then(function (j) {
      area.innerHTML = cabeca("Mensagens", "Enviadas pelo formulário da página Contato.") +
        (j.mensagens.length ? '<div class="agenda">' + j.mensagens.map(function (m) {
          var dig = String(m.contato).replace(/\D/g, "");
          var resp = m.contato.indexOf("@") > 0 ? "mailto:" + m.contato : dig.length >= 10 ? "https://wa.me/55" + dig.replace(/^55/, "") : "";
          return '<div class="cartao" style="padding:1rem 1.2rem' + (m.lida ? ";opacity:.7" : "") + '"><div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap"><div><b>' + esc(m.nome) + "</b> · " + esc(m.contato) + (m.lida ? "" : ' <span class="etq etq--novo">nova</span>') +
            "<br><small>" + quandoBr(m.criado) + (m.assunto ? " · " + esc(m.assunto) : "") + '</small></div><div style="display:flex;gap:.4rem;flex-wrap:wrap">' +
            (resp ? '<a class="btn btn--sm" href="' + esc(resp) + '" target="_blank" rel="noopener">Responder</a>' : "") +
            '<button class="btn btn--sm" type="button" data-lida="' + m.id + '" data-v="' + (m.lida ? 0 : 1) + '">' + (m.lida ? "Marcar não lida" : "Marcar lida") + "</button>" +
            '<button class="btn btn--sm btn--perigo" type="button" data-apagar-msg="' + m.id + '">Apagar</button></div></div><p style="margin:.7rem 0 0;white-space:pre-wrap">' + esc(m.mensagem) + "</p></div>";
        }).join("") + "</div>" : '<div class="cartao vazio">Nenhuma mensagem.</div>');
      $$("[data-lida]", area).forEach(function (b) { b.addEventListener("click", function () { api("PUT", "/mensagens/" + b.getAttribute("data-lida"), { lida: b.getAttribute("data-v") === "1" }).then(function () { atualizarContadores(); TELA.mensagens(area); }).catch(falha); }); });
      $$("[data-apagar-msg]", area).forEach(function (b) { b.addEventListener("click", function () { if (!confirmar("Apagar esta mensagem?")) return; api("DELETE", "/mensagens/" + b.getAttribute("data-apagar-msg")).then(function () { TELA.mensagens(area); }).catch(falha); }); });
    }).catch(falha);
  };

  /* ---------------------------------------------------------------- serviços */
  TELA.servicos = function (area) {
    api("GET", "/servicos").then(function (j) {
      area.innerHTML = cabeca("Serviços", "Cada serviço tem página própria no site (/servicos/…). O endereço nasce do nome e não muda depois — renomear não quebra o link que já está no Google.", '<button class="btn btn--brasa" type="button" id="novo-sv">+ Serviço</button>') +
        (j.servicos.length ? '<div class="cartao">' + j.servicos.map(function (s) {
          return '<div class="servico-linha"' + (s.ativo ? "" : ' style="opacity:.55"') + '><img src="' + esc(s.imagem || SEM_FOTO) + '" alt=""><div><b>' + esc(s.titulo) + "</b>" + (s.ativo ? "" : ' <span class="etq etq--inativo">fora do site</span>') + "<small>" + esc(s.resumo) + '</small><small class="codigo-mono">/servicos/' + esc(s.slug) + "/</small></div>" +
            '<div style="display:flex;gap:.4rem"><a class="btn btn--sm" href="/servicos/' + esc(s.slug) + '/" target="_blank" rel="noopener">Ver</a><button class="btn btn--sm" type="button" data-editar-sv="' + s.id + '">Editar</button></div></div>';
        }).join("") + "</div>" : '<div class="cartao vazio">Nenhum serviço.</div>');
      function form(s) {
        var m = modal(s.id ? "Serviço" : "Novo serviço", '<form class="form-grade" id="f-sv">' +
          '<label class="campo"><span>Nome</span><input name="titulo" required maxlength="80" value="' + esc(s.titulo || "") + '"></label>' +
          '<label class="campo"><span>Etiqueta curta</span><input name="medida" maxlength="30" placeholder="Ex.: enfesto + corte" value="' + esc(s.medida || "") + '"></label>' +
          '<label class="campo largo"><span>Resumo (uma frase — cartão e Google)</span><input name="resumo" maxlength="220" value="' + esc(s.resumo || "") + '"></label>' +
          '<div class="largo">' + campoImagem("imagem", s.imagem, "Foto") + "</div>" +
          '<label class="campo largo"><span>Descrição da foto</span><input name="imagem_alt" value="' + esc(s.imagem_alt || "") + '"></label>' +
          '<div class="campo largo"><span>Texto da página</span>' + editor(s.conteudo, { vazio: "Como funciona, o que trazer, para quem é…" }) + "</div>" +
          '<label class="campo largo"><span>Para quem (uma linha por item)</span><textarea name="para_quem" rows="3">' + esc(s.para_quem || "") + "</textarea></label>" +
          '<label class="campo"><span>Ordem</span><input type="number" name="ordem" value="' + (s.ordem || 0) + '"></label>' +
          '<label class="campo--check"><input type="checkbox" name="ativo"' + (s.ativo !== 0 ? " checked" : "") + "> Aparece no site</label>" +
          '<div class="form-acoes largo">' + (s.id ? '<button class="btn btn--perigo" type="button" id="apagar-sv">Apagar</button>' : "") + '<button class="btn btn--brasa" type="submit">Salvar</button></div></form>', { largo: true });
        ligarUploads(m.el); ligarEditores(m.el);
        $("#f-sv", m.el).addEventListener("submit", function (e) {
          e.preventDefault(); var d = formDados(e.target); d.conteudo = lerEditor(m.el); d.ordem = Number(d.ordem) || 0;
          (s.id ? api("PUT", "/servicos/" + s.id, d) : api("POST", "/servicos", d)).then(function () { m.fechar(); aviso("Serviço salvo."); TELA.servicos(area); }).catch(falha);
        });
        var ap = $("#apagar-sv", m.el); if (ap) ap.addEventListener("click", function () {
          if (!confirmar("Apagar o serviço? A página dele sai do ar e o link passa a dar \"não encontrada\". Para só esconder, desmarque \"Aparece no site\".")) return;
          api("DELETE", "/servicos/" + s.id).then(function () { m.fechar(); TELA.servicos(area); }).catch(falha);
        });
      }
      $("#novo-sv").addEventListener("click", function () { form({ ativo: 1, ordem: j.servicos.length }); });
      $$("[data-editar-sv]", area).forEach(function (b) { b.addEventListener("click", function () { form(j.servicos.find(function (s) { return String(s.id) === b.getAttribute("data-editar-sv"); })); }); });
    }).catch(falha);
  };

  /* ---------------------------------------------------------------- blog */
  TELA.blog = function (area) {
    api("GET", "/blog").then(function (j) {
      var hoje = hojeIso();
      area.innerHTML = cabeca("Blog", "Textos que ensinam o ofício são o que faz o site subir no Google. Data no futuro = agendado.", '<button class="btn btn--brasa" type="button" id="novo-post">+ Novo texto</button>') +
        (j.posts.length ? '<div class="cartao tabela-caixa"><table class="tabela"><thead><tr><th></th><th>Título</th><th>Tema</th><th>Data</th><th>Situação</th><th></th></tr></thead><tbody>' +
          j.posts.map(function (p) {
            var sit = !p.publicado ? '<span class="etq etq--rascunho">Rascunho</span>' : p.date > hoje ? '<span class="etq etq--agendado">Agendado</span>' : '<span class="etq etq--publicado">No ar</span>';
            return "<tr><td>" + (p.image ? '<img src="' + esc(p.image) + '" alt="" style="width:64px;height:44px;object-fit:cover;border-radius:6px">' : "") + "</td><td><b>" + esc(p.title) + "</b></td><td>" + esc(p.tema || "—") + "</td><td class=num>" + dataBr(p.date) + "</td><td>" + sit + "</td>" +
              '<td style="white-space:nowrap"><button class="btn btn--sm" type="button" data-editar-post="' + p.id + '">Editar</button> <a class="btn btn--sm" href="/blog/' + esc(p.slug) + '/" target="_blank" rel="noopener">Ver</a></td></tr>';
          }).join("") + "</tbody></table></div>" : '<div class="cartao vazio">Nenhum texto ainda.</div>');
      $("#novo-post").addEventListener("click", function () { editarPost(null, function () { TELA.blog(area); }); });
      $$("[data-editar-post]", area).forEach(function (b) { b.addEventListener("click", function () { editarPost(Number(b.getAttribute("data-editar-post")), function () { TELA.blog(area); }); }); });
      if (/novo/.test(location.hash)) { history.replaceState(null, "", "#/blog"); editarPost(null, function () { TELA.blog(area); }); }
    }).catch(falha);
  };
  function editarPost(id, depois) {
    (id ? api("GET", "/blog/" + id) : Promise.resolve({ post: { title: "", date: hojeIso(), excerpt: "", content: "", image: "", image_alt: "", autor: "Corte Sam", tema: "", publicado: 0 } })).then(function (j) {
      var p = j.post;
      var m = modal(id ? "Editar texto" : "Novo texto", '<form id="f-post" class="form-grade">' +
        '<label class="campo largo"><span>Título</span><input name="title" required maxlength="200" value="' + esc(p.title) + '"></label>' +
        '<label class="campo"><span>Data</span><input name="date" type="date" required value="' + esc(p.date) + '"><small>No futuro, o texto fica agendado.</small></label>' +
        '<label class="campo"><span>Tema</span><input name="tema" maxlength="30" list="temas" placeholder="Enfesto, Tecidos, Produção…" value="' + esc(p.tema) + '"><datalist id="temas"><option>Enfesto</option><option>Risco</option><option>Tecidos</option><option>Produção</option><option>Modelagem</option></datalist></label>' +
        '<label class="campo largo"><span>Resumo (aparece na lista e no Google)</span><textarea name="excerpt" rows="2" maxlength="300">' + esc(p.excerpt) + "</textarea></label>" +
        '<div class="largo">' + campoImagem("image", p.image, "Foto de capa") + "</div>" +
        '<label class="campo"><span>Descrição da foto</span><input name="image_alt" value="' + esc(p.image_alt) + '"></label>' +
        '<label class="campo"><span>Autor</span><input name="autor" value="' + esc(p.autor) + '"></label>' +
        '<div class="campo largo"><span>Texto</span>' + editor(p.content, { vazio: "O texto…" }) + "</div>" +
        '<label class="campo--check largo"><input type="checkbox" name="publicado"' + (p.publicado ? " checked" : "") + "> Publicado (desmarcado = rascunho, só o painel vê)</label>" +
        '<div class="form-acoes largo">' + (id ? '<button class="btn btn--perigo" type="button" id="apagar-post">Apagar</button><a class="btn" href="/blog/' + esc(p.slug) + '/" target="_blank" rel="noopener">Pré-visualizar</a>' : "") + '<button class="btn btn--brasa" type="submit">Salvar</button></div></form>',
        { largo: true });
      ligarUploads(m.el); ligarEditores(m.el);
      $("#f-post", m.el).addEventListener("submit", function (e) {
        e.preventDefault();
        var d = formDados(e.target); d.content = lerEditor(m.el);
        (id ? api("PUT", "/blog/" + id, d) : api("POST", "/blog", d)).then(function () { aviso("Texto salvo."); m.fechar(); depois(); }).catch(falha);
      });
      var ap = $("#apagar-post", m.el); if (ap) ap.addEventListener("click", function () { if (!confirmar("Apagar este texto? Não tem volta.")) return; api("DELETE", "/blog/" + id).then(function () { m.fechar(); depois(); }).catch(falha); });
    }).catch(falha);
  }

  /* ---------------------------------------------------------------- galeria */
  TELA.galeria = function (area) {
    api("GET", "/t/galeria").then(function (j) {
      area.innerHTML = cabeca("Galeria da oficina", "Só fotos REAIS da Corte Sam: a mesa, o enfesto, peças cortadas, a fachada. Aparecem na página inicial e em A oficina.", '<label class="btn btn--brasa">+ Enviar fotos<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden id="novas"></label>') +
        (j.itens.length ? '<div class="fotos">' + j.itens.map(function (f) {
          return '<div class="cartao foto" data-foto="' + f.id + '"><img src="' + esc(f.imagem) + '" alt=""><div class="foto__corpo">' +
            '<input name="legenda" placeholder="Legenda curta" value="' + esc(f.legenda || "") + '">' +
            '<input name="alt" placeholder="Descrição da foto" value="' + esc(f.alt || "") + '">' +
            '<input name="ordem" type="number" title="Ordem" value="' + (f.ordem || 0) + '">' +
            '<label class="campo--check"><input type="checkbox" name="ativo"' + (f.ativo ? " checked" : "") + "> no site</label>" +
            '<div class="foto__acoes"><button class="btn btn--sm btn--brasa" type="button" data-salvar>Salvar</button><button class="btn btn--sm btn--perigo" type="button" data-apagar>Apagar</button></div></div></div>';
        }).join("") + "</div>" : '<div class="cartao vazio">Nenhuma foto ainda.</div>');
      $("#novas").addEventListener("change", function (e) {
        var arqs = Array.prototype.slice.call(e.target.files); if (!arqs.length) return;
        aviso("Enviando " + arqs.length + " foto(s)…");
        arqs.reduce(function (p, a) { return p.then(function () { return enviarImagem(a, 1600).then(function (c) { return api("POST", "/t/galeria", { imagem: c }); }); }); }, Promise.resolve())
          .then(function () { aviso("Fotos enviadas."); TELA.galeria(area); }).catch(falha);
      });
      $$("[data-foto]", area).forEach(function (card) {
        var id = card.getAttribute("data-foto");
        $("[data-salvar]", card).addEventListener("click", function () { var d = formDados(card); d.ordem = Number(d.ordem) || 0; api("PUT", "/t/galeria/" + id, d).then(function () { aviso("Salvo."); }).catch(falha); });
        $("[data-apagar]", card).addEventListener("click", function () { if (!confirmar("Apagar esta foto?")) return; api("DELETE", "/t/galeria/" + id).then(function () { TELA.galeria(area); }).catch(falha); });
      });
    }).catch(falha);
  };

  /* ---------------------------------------------------------------- listas */
  function telaLista(area, cfg) {
    api("GET", "/t/" + cfg.tabela).then(function (j) {
      area.innerHTML = cabeca(cfg.titulo, cfg.sub, '<button class="btn btn--brasa" type="button" id="novo">+ ' + esc(cfg.novo) + "</button>") +
        (j.itens.length ? '<div class="cartao tabela-caixa"><table class="tabela"><tbody>' + j.itens.map(function (i) {
          return "<tr><td>" + cfg.linha(i) + "</td><td style='white-space:nowrap;text-align:right'>" + (i.ativo ? "" : '<span class="etq etq--inativo">oculta</span> ') + '<button class="btn btn--sm" type="button" data-editar="' + i.id + '">Editar</button></td></tr>';
        }).join("") + "</tbody></table></div>" : '<div class="cartao vazio">' + esc(cfg.vazio || "Nada cadastrado.") + "</div>");
      function form(i) {
        var m = modal(cfg.novo, '<form class="form-grade" id="f-l">' + cfg.form(i) +
          '<label class="campo"><span>Ordem</span><input type="number" name="ordem" value="' + (i.ordem || 0) + '"></label>' +
          '<label class="campo--check"><input type="checkbox" name="ativo"' + (i.ativo !== 0 ? " checked" : "") + "> Aparece no site</label>" +
          '<div class="form-acoes largo">' + (i.id ? '<button class="btn btn--perigo" type="button" id="apagar">Apagar</button>' : "") + '<button class="btn btn--brasa" type="submit">Salvar</button></div></form>');
        $("#f-l", m.el).addEventListener("submit", function (e) {
          e.preventDefault(); var d = formDados(e.target); d.ordem = Number(d.ordem) || 0; if (d.nota) d.nota = Number(d.nota);
          (i.id ? api("PUT", "/t/" + cfg.tabela + "/" + i.id, d) : api("POST", "/t/" + cfg.tabela, d)).then(function () { m.fechar(); aviso("Salvo."); telaLista(area, cfg); }).catch(falha);
        });
        var ap = $("#apagar", m.el); if (ap) ap.addEventListener("click", function () { if (!confirmar("Apagar?")) return; api("DELETE", "/t/" + cfg.tabela + "/" + i.id).then(function () { m.fechar(); telaLista(area, cfg); }).catch(falha); });
      }
      $("#novo").addEventListener("click", function () { form({ ativo: 1, nota: 5, do_google: 1, ordem: j.itens.length }); });
      $$("[data-editar]", area).forEach(function (b) { b.addEventListener("click", function () { form(j.itens.find(function (i) { return String(i.id) === b.getAttribute("data-editar"); })); }); });
    }).catch(falha);
  }
  TELA.avaliacoes = function (area) {
    telaLista(area, { tabela: "avaliacoes", titulo: "Depoimentos", novo: "Depoimento", vazio: "Nenhum depoimento: a seção fica escondida no site. Copie as avaliações reais do Google para cá.",
      sub: "Só notas 4 e 5 aparecem no site. Copie da ficha do Google e marque a origem com honestidade — nunca escreva depoimento que o cliente não deu.",
      linha: function (i) { return "★".repeat(i.nota) + " <b>" + esc(i.autor || "Sem nome") + "</b>" + (i.empresa ? " · " + esc(i.empresa) : "") + " · <small>" + (i.do_google ? "Google" : "cliente") + "</small><br>“" + esc(i.texto) + "”"; },
      form: function (i) { return '<label class="campo largo"><span>Texto</span><textarea name="texto" rows="3" required>' + esc(i.texto || "") + "</textarea></label>" +
        '<label class="campo"><span>Autor</span><input name="autor" value="' + esc(i.autor || "") + '"></label>' +
        '<label class="campo"><span>Confecção</span><input name="empresa" value="' + esc(i.empresa || "") + '"></label>' +
        '<label class="campo"><span>Nota</span><select name="nota">' + [5, 4, 3, 2, 1].map(function (n) { return "<option" + (i.nota === n ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select></label>" +
        '<label class="campo--check"><input type="checkbox" name="do_google"' + (i.do_google ? " checked" : "") + "> Copiado da ficha do Google</label>"; } });
  };
  TELA.faq = function (area) {
    telaLista(area, { tabela: "faq", titulo: "Perguntas frequentes", novo: "Pergunta", sub: "Aparecem na home e em Serviços, e vão para o Google como FAQ. Responda com fatos.",
      linha: function (i) { return "<b>" + esc(i.pergunta) + "</b><br><small>" + esc(i.resposta) + "</small>"; },
      form: function (i) { return '<label class="campo largo"><span>Pergunta</span><input name="pergunta" required value="' + esc(i.pergunta || "") + '"></label>' +
        '<label class="campo largo"><span>Resposta</span><textarea name="resposta" rows="4" required>' + esc(i.resposta || "") + "</textarea></label>"; } });
  };

  /* ---------------------------------------------------------------- textos */
  var GRUPOS = { casa: "Dados da empresa", redes: "Redes e Google", home: "Página inicial", agenda: "Agendamento", sobre: "Página A oficina", seo: "Google (SEO)", medicao: "Medição (GA4, Pixel, Search Console)" };
  TELA.textos = function (area) {
    api("GET", "/textos").then(function (j) {
      var porGrupo = {}, ordem = [];
      j.textos.forEach(function (t) { if (!porGrupo[t.grupo]) { porGrupo[t.grupo] = []; ordem.push(t.grupo); } porGrupo[t.grupo].push(t); });
      var sv = j.servidor;
      area.innerHTML = cabeca("Textos e dados", "Tudo o que o site escreve. Salvou, está no ar.") +
        '<div class="aviso-caixa aviso-caixa--' + (sv.indexavel ? "ok" : "info") + '">Endereço público: <b>' + esc(sv.site) + "</b> · " + (sv.indexavel ? "aberto ao Google" : "FORA do Google (endereço de trabalho)") +
        " · e-mail de aviso: " + (sv.smtp ? "ligado" : "desligado no servidor") + "</div>" +
        ordem.map(function (g) {
          return '<form class="cartao textos-grupo" data-grupo="' + esc(g) + '"><div class="cartao__cab"><h2>' + esc(GRUPOS[g] || g) + '</h2><button class="btn btn--brasa btn--sm" type="submit">Salvar</button></div><div class="cartao__corpo form-grade">' +
            porGrupo[g].map(function (t) {
              var ajuda = t.ajuda ? "<small>" + esc(t.ajuda) + "</small>" : "";
              if (t.tipo === "rico") return '<div class="campo largo" data-rico="' + esc(t.chave) + '"><span>' + esc(t.rotulo) + "</span>" + editor(t.valor, { curto: true }) + ajuda + "</div>";
              if (t.tipo === "longo") return '<label class="campo largo"><span>' + esc(t.rotulo) + '</span><textarea name="' + esc(t.chave) + '" rows="3">' + esc(t.valor) + "</textarea>" + ajuda + "</label>";
              if (t.tipo === "titulo") return '<label class="campo largo"><span>' + esc(t.rotulo) + '</span><input name="' + esc(t.chave) + '" value="' + esc(t.valor) + '">' + (ajuda || "<small>A palavra entre &lt;em&gt; e &lt;/em&gt; ganha destaque.</small>") + "</label>";
              return '<label class="campo"><span>' + esc(t.rotulo) + '</span><input name="' + esc(t.chave) + '" value="' + esc(t.valor) + '"' + (t.tipo === "url" ? ' type="url"' : "") + ">" + ajuda + "</label>";
            }).join("") + "</div></form>";
        }).join("");
      ligarEditores(area);
      $$("form[data-grupo]", area).forEach(function (f) {
        f.addEventListener("submit", function (e) {
          e.preventDefault();
          var v = formDados(f);
          $$("[data-rico]", f).forEach(function (r) { v[r.getAttribute("data-rico")] = $(".editor__area", r).innerHTML.trim(); });
          api("PUT", "/textos", { valores: v }).then(function (r) { aviso(r.alterados.length ? r.alterados.length + " campo(s) salvo(s)." : "Nada mudou."); }).catch(falha);
        });
      });
    }).catch(falha);
  };

  /* ---------------------------------------------------------------- usuários */
  TELA.usuarios = function (area) {
    api("GET", "/usuarios").then(function (j) {
      area.innerHTML = cabeca("Usuários", "Administrador: tudo. Redator: blog, galeria e perguntas frequentes — sem agenda e sem dados de cliente.", '<button class="btn btn--brasa" type="button" id="novo-u">+ Usuário</button>') +
        '<div class="cartao tabela-caixa"><table class="tabela"><thead><tr><th>Nome</th><th>Usuário</th><th>Papel</th><th>Último acesso</th><th></th></tr></thead><tbody>' +
        j.usuarios.map(function (u) {
          return "<tr" + (u.ativo ? "" : " style='opacity:.55'") + "><td><b>" + esc(u.nome) + "</b>" + (u.email ? "<br><small>" + esc(u.email) + "</small>" : "") + "</td><td>" + esc(u.usuario) + "</td><td>" + esc(PAPEL[u.papel] || u.papel) + (u.ativo ? "" : ' <span class="etq etq--inativo">desativado</span>') + (u.trocar_senha ? ' <span class="etq etq--novo">senha provisória</span>' : "") + "</td><td class=num>" + (u.entrou ? quandoBr(u.entrou) : "nunca") + "</td>" +
            '<td style="white-space:nowrap"><button class="btn btn--sm" type="button" data-editar-u="' + u.id + '">Editar</button> <button class="btn btn--sm" type="button" data-senha-u="' + u.id + '">Nova senha</button></td></tr>';
        }).join("") + "</tbody></table></div>";
      function mostrarSenha(t, s) { modal(t, '<p>Entregue esta senha provisória à pessoa. Ela aparece <b>só agora</b>, e o painel pede a troca no primeiro acesso.</p><p class="senha-provisoria">' + esc(s) + "</p>"); }
      $("#novo-u").addEventListener("click", function () {
        var m = modal("Novo usuário", '<form class="form-grade" id="f-u"><label class="campo"><span>Nome</span><input name="nome" required></label><label class="campo"><span>Usuário (login)</span><input name="usuario" required pattern="[a-z0-9._-]{3,30}" autocapitalize="off"></label>' +
          '<label class="campo"><span>E-mail</span><input name="email" type="email"></label><label class="campo"><span>Papel</span><select name="papel">' + j.papeis.map(function (p) { return '<option value="' + p + '">' + (PAPEL[p] || p) + "</option>"; }).join("") + "</select></label>" +
          '<div class="form-acoes largo"><button class="btn btn--brasa" type="submit">Criar</button></div></form>');
        $("#f-u", m.el).addEventListener("submit", function (e) { e.preventDefault(); api("POST", "/usuarios", formDados(e.target)).then(function (r) { m.fechar(); TELA.usuarios(area); mostrarSenha("Usuário criado", r.senha_provisoria); }).catch(falha); });
      });
      $$("[data-editar-u]", area).forEach(function (b) {
        b.addEventListener("click", function () {
          var u = j.usuarios.find(function (x) { return String(x.id) === b.getAttribute("data-editar-u"); });
          var m = modal("Editar " + u.usuario, '<form class="form-grade" id="f-eu"><label class="campo"><span>Nome</span><input name="nome" value="' + esc(u.nome) + '"></label><label class="campo"><span>E-mail</span><input name="email" type="email" value="' + esc(u.email) + '"></label>' +
            '<label class="campo"><span>Papel</span><select name="papel">' + j.papeis.map(function (p) { return '<option value="' + p + '"' + (u.papel === p ? " selected" : "") + ">" + (PAPEL[p] || p) + "</option>"; }).join("") + "</select></label>" +
            '<label class="campo--check"><input type="checkbox" name="ativo"' + (u.ativo ? " checked" : "") + "> Pode entrar no painel</label>" +
            '<div class="form-acoes largo"><button class="btn btn--brasa" type="submit">Salvar</button></div></form>');
          $("#f-eu", m.el).addEventListener("submit", function (e) { e.preventDefault(); api("PUT", "/usuarios/" + u.id, formDados(e.target)).then(function () { m.fechar(); aviso("Usuário salvo."); TELA.usuarios(area); }).catch(falha); });
        });
      });
      $$("[data-senha-u]", area).forEach(function (b) {
        b.addEventListener("click", function () {
          if (!confirmar("Gerar uma senha provisória nova? A atual deixa de valer e a pessoa sai de todos os aparelhos.")) return;
          api("POST", "/usuarios/" + b.getAttribute("data-senha-u") + "/senha", {}).then(function (r) { TELA.usuarios(area); mostrarSenha("Nova senha", r.senha_provisoria); }).catch(falha);
        });
      });
    }).catch(falha);
  };

  /* ---------------------------------------------------------------- acessos */
  TELA.acessos = function (area) {
    api("GET", "/acessos?dias=30").then(function (j) {
      var mapaU = {}; j.unicos.forEach(function (u) { mapaU[u.dia] = u.n; });
      var max = Math.max.apply(null, [1].concat(j.porDia.map(function (d) { return mapaU[d.dia] || 0; })));
      var total = j.porDia.reduce(function (s, d) { return s + d.n; }, 0), unicos = j.unicos.reduce(function (s, d) { return s + d.n; }, 0);
      area.innerHTML = cabeca("Acessos", "Contagem própria, sem cookie e sem terceiro — conta até quem recusou o GA4, por isso não bate com o Google Analytics.") +
        '<div class="grade-kpi"><div class="cartao kpi"><small>Visitantes (30 dias)</small><strong>' + unicos + '</strong><span>por dia, somados</span></div><div class="cartao kpi"><small>Páginas vistas</small><strong>' + total + "</strong></div></div>" +
        '<div class="duas"><div class="cartao"><div class="cartao__cab"><h2>Visitantes por dia</h2></div><div class="cartao__corpo"><div class="grafico">' +
        (j.porDia.length ? j.porDia.map(function (d) { var u = mapaU[d.dia] || 0; return '<div style="height:' + Math.max(2, u / max * 100) + '%" data-dica="' + dataBr(d.dia) + ": " + u + ' visitantes"></div>'; }).join("") : '<p class="vazio">Sem visitas ainda.</p>') +
        '</div></div></div><div class="cartao"><div class="cartao__cab"><h2>Páginas mais vistas</h2></div><div class="cartao__corpo"><ul class="lista-simples">' +
        j.paginas.map(function (p) { return "<li><span>" + esc(p.caminho) + "</span><b>" + p.n + "</b></li>"; }).join("") + "</ul></div></div></div>";
    }).catch(falha);
  };

  /* ---------------------------------------------------------------- auditoria */
  TELA.auditoria = function (area, pg) {
    pg = pg || 1;
    api("GET", "/auditoria?pagina=" + pg).then(function (j) {
      var paginas = Math.max(1, Math.ceil(j.total / j.por_pagina));
      area.innerHTML = cabeca("Auditoria", "Quem fez o quê, e quando. Só acréscimo: nada aqui se apaga.") +
        '<div class="cartao tabela-caixa"><table class="tabela"><thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Detalhe</th></tr></thead><tbody>' +
        j.itens.map(function (a) { return "<tr><td class=num>" + quandoBr(a.quando) + "</td><td>" + esc(a.usuario) + "</td><td><b>" + esc(a.acao) + "</b> " + esc(a.alvo) + "</td><td><small>" + esc(a.detalhe) + "</small></td></tr>"; }).join("") +
        '</tbody></table></div><div class="filtros" style="justify-content:center;margin-top:1rem">' +
        (pg > 1 ? '<button class="btn btn--sm" type="button" data-pg="' + (pg - 1) + '">← Anterior</button>' : "") + "<span>Página " + pg + " de " + paginas + "</span>" +
        (pg < paginas ? '<button class="btn btn--sm" type="button" data-pg="' + (pg + 1) + '">Próxima →</button>' : "") + "</div>";
      $$("[data-pg]", area).forEach(function (b) { b.addEventListener("click", function () { TELA.auditoria(area, Number(b.getAttribute("data-pg"))); }); });
    }).catch(falha);
  };

  /* ---------------------------------------------------------------- minha conta */
  TELA.conta = function (area) {
    area.innerHTML = cabeca("Minha conta", esc(EU.nome) + " · " + esc(PAPEL[EU.papel] || EU.papel)) + '<div class="cartao" style="max-width:640px"><div class="cartao__corpo">' + telaTrocarSenha(false) + "</div></div>";
    ligarTrocarSenha(area);
  };

  iniciar();
})();
