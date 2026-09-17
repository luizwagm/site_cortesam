/* ==========================================================================
   CORTE SAM — o movimento do site

   Regras deste arquivo:
   · UM laço de requestAnimationFrame para tudo que depende da rolagem
     (barra de progresso, topo, processo, tesoura) — vários ouvintes de scroll
     brigando entre si é o que deixa site animado "engasgado";
   · só `transform` e `opacity` se animam;
   · com movimento reduzido, nada anda — o conteúdo aparece no lugar;
   · o conteúdo está no HTML: se este arquivo falhar, o site continua inteiro
     (o <head> tira a classe `js` em 2,5 s se `__corteSamOk` não chegar).
   ========================================================================== */
(function () {
  "use strict";
  window.__corteSamOk = true;
  var raiz = document.documentElement;
  var calmo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ------------------------------------------------ calculadora de enfesto
     A MESMA conta de src/calculo.js (a suíte de provas compara as duas). */
  var CAMPOS = {
    comprimento: [0.1, 30, "", true], folhas: [1, 500, "", true], pecas_risco: [1, 500, "", false],
    folga: [0, 20, 2, false], sobra: [0, 30, 0, false], largura: [0.5, 3.5, "", false], gramatura: [50, 1000, "", false],
  };
  function lerCalc(bruto) {
    var valores = {}, erros = {}, algum = false;
    Object.keys(CAMPOS).forEach(function (nome) {
      var c = CAMPOS[nome], min = c[0], max = c[1], padrao = c[2], obrig = c[3];
      var s = String(bruto[nome] == null ? "" : bruto[nome]).trim().replace(",", ".");
      if (s !== "") algum = true;
      if (s === "") { if (obrig) erros[nome] = "Obrigatório."; else valores[nome] = padrao === "" ? null : padrao; return; }
      var n = Number(s);
      if (!/^\d+(\.\d+)?$/.test(s) || !isFinite(n) || n < min || n > max) { erros[nome] = "Entre " + String(min).replace(".", ",") + " e " + String(max).replace(".", ",") + "."; return; }
      if ((nome === "folhas" || nome === "pecas_risco") && Math.floor(n) !== n) { erros[nome] = "Número inteiro."; return; }
      valores[nome] = n;
    });
    return { valores: valores, erros: erros, preenchido: algum };
  }
  function r2(n) { return Math.round(n * 100) / 100; }
  function calcular(v) {
    var porFolha = v.comprimento + (2 * (v.folga || 0)) / 100;
    var total = porFolha * v.folhas * (1 + (v.sobra || 0) / 100);
    var pecas = v.pecas_risco ? v.folhas * v.pecas_risco : null;
    var kg = v.largura && v.gramatura ? (total * v.largura * v.gramatura) / 1000 : null;
    return { metros_folha: r2(porFolha), metros: r2(total), pecas: pecas, metros_peca: pecas ? Math.round((total / pecas) * 1000) / 1000 : null, kg: kg === null ? null : r2(kg) };
  }
  window.__corteSamCalc = { ler: lerCalc, calcular: calcular };   // para a suíte de provas
  var num = function (n, d) { return n == null ? "—" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); };

  function iniciar() {
  /* ------------------------------------------------ revelar ao aparecer */
  var alvos = $$("[data-revelar], [data-esticar]");
  if (calmo || !("IntersectionObserver" in window)) {
    alvos.forEach(function (el) { el.classList.add("visivel"); });
  } else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("visivel"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.05 });
    alvos.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------ o laço da rolagem */
  var topo = $("[data-topo]"), barra = $("[data-progresso]"), zapFlut = $(".zap-flut"), chamada = $(".rodape__chamada");
  var tesoura = $("[data-tesoura]");
  var processo = $("[data-processo]"), etapas = processo ? $$(".etapa", processo) : [], barraProc = processo && $("[data-processo-barra]", processo);
  var largo = window.matchMedia("(min-width: 1100px)");
  var ultimoY = window.scrollY, pedido = null, etapaAtual = 0;

  function pinar() {
    if (!processo) return;
    processo.classList.toggle("processo--pinado", largo.matches && !calmo && etapas.length > 1);
  }
  pinar();
  if (largo.addEventListener) largo.addEventListener("change", function () { pinar(); agendar(); });

  function quadro() {
    pedido = null;
    var y = window.scrollY, h = window.innerHeight, dy = y - ultimoY; ultimoY = y;
    /* Todas as LEITURAS antes das escritas. */
    var max = barra ? document.documentElement.scrollHeight - h : 0;
    var rCham = chamada ? chamada.getBoundingClientRect() : null;
    var rProc = processo && processo.classList.contains("processo--pinado") ? processo.getBoundingClientRect() : null;
    var rTes = tesoura && !calmo ? tesoura.getBoundingClientRect() : null;

    if (topo) {
      topo.classList.toggle("rolou", y > 30);
      if (Math.abs(dy) > 4 && !raiz.classList.contains("menu-aberto")) topo.classList.toggle("escondido", dy > 0 && y > 600);
    }
    if (barra) barra.style.transform = "scaleX(" + (max > 0 ? Math.min(1, y / max) : 0).toFixed(4) + ")";
    if (zapFlut && rCham) zapFlut.classList.toggle("oculto", rCham.top < h * 0.75 && rCham.bottom > 0);
    if (rProc) {
      var prog = Math.min(1, Math.max(0, -rProc.top / (rProc.height - h)));
      var i = Math.min(etapas.length - 1, Math.floor(prog * etapas.length * 0.999));
      if (i !== etapaAtual) {
        etapas.forEach(function (e, k) { e.classList.toggle("ativa", k === i); e.classList.toggle("passou", k < i); });
        etapaAtual = i;
      }
      if (barraProc) barraProc.style.transform = "scaleX(" + ((i + 1) / etapas.length).toFixed(3) + ")";
    }
    if (rTes) {
      /* A tesoura percorre a linha tracejada enquanto a chamada final sobe. */
      var t = Math.min(1, Math.max(0, (h - rTes.top) / (h * 0.9)));
      tesoura.style.setProperty("--t", t.toFixed(3));
    }
  }
  function agendar() { if (!pedido) pedido = requestAnimationFrame(quadro); }
  window.addEventListener("scroll", agendar, { passive: true });
  window.addEventListener("resize", agendar);
  agendar();

  /* ------------------------------------------------ menu do celular */
  var menu = $("[data-menu-movel]"), abrir = $("[data-abrir-menu]");
  function fecharMenu() {
    if (!menu || menu.hidden) return;
    menu.classList.remove("aberto"); raiz.classList.remove("menu-aberto");
    abrir.setAttribute("aria-expanded", "false");
    setTimeout(function () { menu.hidden = true; }, calmo ? 0 : 300);
    abrir.focus();
  }
  if (menu && abrir) {
    abrir.addEventListener("click", function () {
      menu.hidden = false; requestAnimationFrame(function () { menu.classList.add("aberto"); });
      raiz.classList.add("menu-aberto"); abrir.setAttribute("aria-expanded", "true");
      var p = $("a", menu); if (p) p.focus();
    });
    $("[data-fechar-menu]", menu).addEventListener("click", fecharMenu);
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) fecharMenu(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") fecharMenu(); });
  }

  /* ------------------------------------------------ mapa sob demanda
     O iframe do Google só nasce no clique: sem clique, nenhum cookie do
     Google e nenhum meio megabyte de mapa no celular. */
  $$("[data-carregar-mapa]").forEach(function (b) {
    b.addEventListener("click", function () {
      var m = b.closest("[data-mapa]"), src = m && m.getAttribute("data-mapa");
      if (!src || !/^https:\/\/www\.google\.com\/maps\?/.test(src)) return;
      var f = document.createElement("iframe");
      f.src = src; f.title = "Mapa da Corte Sam"; f.loading = "lazy"; f.referrerPolicy = "no-referrer-when-downgrade";
      m.appendChild(f); var capa = $(".mapa__capa", m); if (capa) capa.remove();
    });
  });

  /* ------------------------------------------------ copiar link */
  $$("[data-copiar]").forEach(function (b) {
    b.addEventListener("click", function () {
      var t = b.getAttribute("data-copiar");
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { b.textContent = "Link copiado ✓"; }, function () { window.prompt("Copie o link:", t); });
    });
  });

  /* ------------------------------------------------ máscara de telefone */
  $$("[data-mascara=telefone]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      var d = inp.value.replace(/\D/g, "").slice(0, 11), s = d;
      if (d.length > 2) s = "(" + d.slice(0, 2) + ") " + d.slice(2);
      if (d.length > 7) s = "(" + d.slice(0, 2) + ") " + d.slice(2, d.length === 11 ? 7 : 6) + "-" + d.slice(d.length === 11 ? 7 : 6);
      inp.value = s;
    });
  });

  /* ------------------------------------------------ calculadoras */
  $$("[data-calc]").forEach(function (form) {
    var completa = form.getAttribute("data-calc") === "completa";
    var saida = completa ? $("[data-calc-resultado]") : $("[data-calc-saida]", form);
    var agendar = completa ? $("[data-calc-agendar]") : null;
    function atualizar(mostrarErros) {
      var bruto = {};
      $$("input", form).forEach(function (i) { bruto[i.name] = i.value; });
      var l = lerCalc(bruto), temErro = Object.keys(l.erros).length;
      if (completa) $$("[data-erro]", form).forEach(function (e) { var n = e.getAttribute("data-erro"); e.textContent = mostrarErros && l.erros[n] && bruto[n] !== "" ? l.erros[n] : ""; });
      var r = !temErro ? calcular(l.valores) : null;
      if (!completa) { $("[data-calc-metros]", form).textContent = r ? num(r.metros) + " m" : "— m"; return; }
      $("[data-r=metros]", saida).textContent = r ? num(r.metros) : "—";
      $("[data-r=metros_folha]", saida).textContent = r ? num(r.metros_folha) : "—";
      $("[data-r=pecas]", saida).textContent = r && r.pecas ? r.pecas.toLocaleString("pt-BR") : "—";
      $("[data-r=metros_peca]", saida).textContent = r && r.metros_peca ? num(r.metros_peca, 3) : "—";
      $("[data-r=kg]", saida).textContent = r && r.kg != null ? num(r.kg) : "—";
      if (agendar) agendar.href = r ? "/agendamento/?origem=calculadora&folhas=" + l.valores.folhas + "&metros=" + r.metros + (r.pecas ? "&pecas=" + r.pecas : "") : "/agendamento/";
    }
    form.addEventListener("input", function () { atualizar(true); });
    if (completa) form.addEventListener("submit", function (e) {
      /* Com JS o resultado já está na tela; o envio só acontece sem JS. */
      e.preventDefault(); atualizar(true);
      if (window.innerWidth < 900 && saida) saida.scrollIntoView({ behavior: calmo ? "auto" : "smooth", block: "start" });
    });
    atualizar(false);
  });

  /* ------------------------------------------------ formulários */
  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ZAP = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Z" fill="currentColor"/></svg>';

  $$("[data-form]").forEach(function (form) {
    var tipo = form.getAttribute("data-form");
    var fechados = (form.getAttribute("data-fechados") || "").split(",").filter(Boolean).map(Number);
    var data = $("input[name=data]", form);
    /* Dia sem atendimento: avisa NA HORA, não depois do envio. */
    if (data && fechados.length) data.addEventListener("change", function () {
      var v = data.value; if (!v) return;
      var d = new Date(v + "T12:00:00").getDay();
      var cx = $('[data-erro="data"]', form), campo = data.closest(".campo");
      if (fechados.indexOf(d) >= 0) { cx.textContent = "A oficina não atende nesse dia. Escolha de segunda a sexta."; campo.classList.add("com-erro"); }
      else { cx.textContent = ""; campo.classList.remove("com-erro"); }
    });

    form.addEventListener("submit", function (e) {
      if (!window.fetch || !window.FormData || !window.URLSearchParams) return;   // sem fetch: envio normal (303)
      e.preventDefault();
      var btn = $("button[type=submit]", form), retorno = $("[data-retorno]", form);
      $$(".campo", form).forEach(function (c) { c.classList.remove("com-erro"); });
      $$("[data-erro]", form).forEach(function (c) { c.textContent = ""; });
      retorno.className = "form__retorno"; retorno.textContent = "";
      btn.disabled = true; btn.classList.add("carregando");
      fetch(form.action, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(new FormData(form)) })
        .then(function (r) { return r.json().catch(function () { return { ok: false, erro: "Resposta inesperada do servidor." }; }); })
        .then(function (j) {
          btn.disabled = false; btn.classList.remove("carregando");
          if (j.ok) {
            if (window.corteSamConverteu) window.corteSamConverteu(tipo);
            var html = '<div class="form__sucesso"><div class="ico-ok">' + CHECK + "</div>";
            if (tipo === "agendamento" && j.codigo) {
              html += "<h3>Pedido recebido!</h3><p class=\"recebido__quando\">" + esc(j.quando) + '</p><div class="codigo">' + esc(j.codigo) + "</div>" +
                "<p>A Corte Sam confirma pelo seu WhatsApp em horário comercial.</p>" +
                (j.zap ? '<a class="btn btn--acao btn--bloco" href="' + esc(j.zap) + '" target="_blank" rel="noopener">' + ZAP + " Avisar também pelo WhatsApp</a>" : "");
            } else {
              html += "<h3>Recebido!</h3><p>" + esc(j.mensagem || "Obrigado!") + "</p>";
            }
            form.innerHTML = html + "</div>";
            form.scrollIntoView({ behavior: calmo ? "auto" : "smooth", block: "center" });
            return;
          }
          if (j.erros) Object.keys(j.erros).forEach(function (k) {
            var campo = form.querySelector('[name="' + k + '"]');
            if (!campo) return;
            var caixa = campo.closest(".campo"); if (!caixa) return;
            caixa.classList.add("com-erro");
            var cx = $("[data-erro]", caixa); if (cx) cx.textContent = j.erros[k];
          });
          retorno.classList.add("erro"); retorno.textContent = j.erro || "Não foi possível enviar.";
          var primeiro = $(".com-erro input, .com-erro select, .com-erro textarea", form); if (primeiro) primeiro.focus();
        })
        .catch(function () {
          btn.disabled = false; btn.classList.remove("carregando");
          retorno.classList.add("erro"); retorno.textContent = "Sem conexão agora. Tente de novo ou fale pelo WhatsApp.";
        });
    });
  });
  }
  /* Depois do primeiro quadro E das fontes: cada troca de fonte refaz o layout
     da página inteira, e o JavaScript que mede posição (a rolagem, o processo)
     no meio dessas trocas obrigava o navegador a refazer tudo DE NOVO, na hora
     — o Lighthouse mediu 1 s de tarefa longa no celular. Teto de 1,2 s: fonte
     que atrasa não segura o menu. Sem JavaScript os formulários já funcionam. */
  function comecar() { requestAnimationFrame(function () { setTimeout(iniciar, 0); }); }
  if (document.fonts && document.fonts.ready) Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 1200); })]).then(comecar, comecar);
  else comecar();
})();
