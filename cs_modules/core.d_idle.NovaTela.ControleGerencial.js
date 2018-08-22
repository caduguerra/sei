function ControleGerencial() {
  var data = {
    MenuId: "menu-gerencial",
    MenuTexto: "Controle Gerencial",
    MenuAcao: null
  };

  data.MenuAcao = function (BaseName) {
    var ModName = BaseName + ".NovaTela";
    var mconsole = new __mconsole(ModName);
    var IdTabela = "TabelaGR";
    var $tabela = null;
    var $progressbar = null;
    var Marcadores = [];
    var GrupoAcompanhamentos = [];

    /** Recuperar os dados dos processos pelo wssei */
    var dataprocessos = [];
    var progressbar_val = 0;

    mconsole.log("Criando nova tela de controle gerencial...");

    /** Verifica a versão mínima do navegador */
    if (!isChrome) {
      browser.storage.local.get("version").then(function (params) {
        var version = parseInt(params.version);
        if (version < 60) {
          $("#divInfraAreaDados").append("Firefox versão: " + version + " - é necessário a versão igual ou maior que 60 do navegador.").css({ backgroundColor: "red" });
        }
      }, null);
    }

    /** Cria a tabela gerencial */
    TabelaCriar();

    /** Verifica se o WebService do SEI está ativo */
    ws_get(wsapi.orgao.listar).then(() => ws_token(true)).catch(err => {
      console.log(err.message);
      if (err.message.indexOf("Módulo inativo") != -1) {
        /** Modulo inativo no sei: 1º requisição */
        return Promise.reject(err);
      } else {
        /** Erro na autenticação: 2º requisição */
        return ws_autenticar();
      }
    }).then(Login => {
      /** Verifica a unidade atual do sei com o wssei e atualiza se necessário */
      var unidade_atual = $("#selInfraUnidades > option[selected]").val();
      if (unidade_atual != Login.loginData.IdUnidadeAtual) {
        console.log("unidade_atual: " + unidade_atual, "wssei: " + Login.loginData.IdUnidadeAtual);
        return ws_post(wsapi.usuario.alterar_unidade, { unidade: unidade_atual }).then(LoginNovo => {
          console.log("Troca de unidade:", LoginNovo);
          return LoginNovo;
        });
      } else {
        return Login;
      }
    }).then(Login => {
      return Promise.all([
        /** Pega a lista de marcadores */
        ext_ws_get(seipp_api.marcador.listar).then(function (marc) {
          Marcadores = marc.filter(obj => obj.ativo);
          console.log("marcadores: ", Marcadores);
        }),
        /** Pega a lista de acompanhamento especial */
        ws_get(wsapi.grupoacompanhamento.listar, null, Login.loginData.IdUnidadeAtual).then(function (grupoacomp) {
          GrupoAcompanhamentos = grupoacomp;
          console.log("GrupoAcompanhamentos: ", GrupoAcompanhamentos);
        }),
        /** Pega a lista de processos da unidade e os dados dos processos */
        ext_ws_get(seipp_api.listar.processos).then(listaProcessos => {
          console.log("Lista de processos:", listaProcessos);
          listaProcessos.sort(
            (a, b) => !a.status.visualizado && b.status.visualizado ? 1 : a.status.visualizado && !b.status.visualizado ? -1 : 0
          );
          if (listaProcessos.length == 0) {
            $progressbar.progressbar("value", 100);
          } else {
            progressbar_val = 100.0 / listaProcessos.reduce((a, b) => b.status.visualizado ? a + 1 : a, 0);
          }
          listaProcessos.forEach(processo => {
            processo.$trrow = TabelaPreencherLista(processo);
          });
          return listaProcessos;
        })
      ]);
    }).then(dados => {
      console.log(dados);
      return dados[2].reduce(function (sequence, processo) {
        return sequence.then(function () {
          if (processo.status.visualizado) {
            return CarregarDadosProcesso(processo);
          } else {
            processo.$trrow.find("#tdprocesso > div:first > a").on("click", function () {
              $(this).removeClass("processoNaoVisualizado").addClass("processoVisualizado processoVisitado");
              CarregarDadosProcesso(processo).then(DadosExtras => {
                return TabelaPreencherDados(processo.$trrow, DadosExtras);
              }).then();
            });
            return Promise.resolve(null);
          }
        }).then(function (DadosExtras) {
          $progressbar.progressbar("value", $progressbar.progressbar("value") + progressbar_val);
          if (DadosExtras != null) {
            TabelaPreencherDados(processo.$trrow, DadosExtras);
          }
        });
      }, Promise.resolve());
    }).then(() => {
      //console.log(dados[2]);
      /** Adicioan a tabela na tela do sei */
      console.log("************ DADOS FINALIZADOS ***************");
      $progressbar.hide();

      /** Atualiza a tabela */
      //https://mottie.github.io/tablesorter/docs/example-empty-table.html
      $tabela.find("thead > tr > th").removeClass("sorter-false");
      $tabela.trigger("update");

    }).catch(erro => {
      console.error(erro);
      $progressbar.progressbar("destroy");
      $("#progressbar div.progress-label").text("");
      if (erro.message.indexOf("Módulo inativo") != -1) {
        $("#divInfraAreaDados").append(erro.toString() + " Esta funcionalidade necessita que o módulo WebService esteja ativo.");
      } else {
        $("#divInfraAreaDados").append(erro);
      }
    });

    /**  */
    function TabelaCriar() {
      /** Título da nova tela */
      $("#divInfraBarraLocalizacao").text("Controle Gerencial de Processos");
      $("#divInfraAreaDados").removeAttr("style");
      var $comandos = $('<div id="cg_comandos"/>');

      $progressbar = $('<div id="progressbar"><div class="progress-label">0%</div></div>');
      $progressbar.progressbar({
        value: false,
        change: function () {
          $("#progressbar div.progress-label").text($progressbar.progressbar("value").toFixed(1) + "%");
        },
        complete: function () {
          $("#progressbar div.progress-label").text("");
        },
        create: function () {
          $("#progressbar div.progress-label").text("Aguarde...");
        }
      });

      /* Botão e tela de configuração */
      var $dialog = $("<div/>")
        .attr("id", "cg_configuracao")
        .attr("title", "Configurações")
        .append($('<div id="columnSelector" class="columnSelector"/>'))
        .appendTo("body")
        .dialog({
          autoOpen: false, modal: true,
          buttons: {
            Fechar: function () {
              $dialog.dialog("close");
            }
          },
        });
      var $bt_configuracao = $("<button>").button({
        icon: "ui-icon-gear"
      }).on("click", () => $dialog.dialog("open"));
      $comandos.append($bt_configuracao, $progressbar);

      /** Criar o html da tabela de processos */
      $tabela = $("<table/>").attr("id", IdTabela).addClass("tablesorter").append("<thead/>").append("<tbody/>");
      var $thead = $("thead", $tabela);
      /** Cabeçalho da tabela */
      var $throw = $("<tr/>");
      $throw.append($("<th/>").text("Processo").attr("data-priority", "critical").addClass("sorter-false"));
      $throw.append($("<th/>").text("tipo").attr("data-priority", "1").addClass("sorter-false columnSelector-false"));
      $throw.append($("<th/>").text("Anotação").attr("data-priority", "2").addClass("sorter-false"));
      $throw.append($("<th/>").text("Marcador").attr("data-priority", "3").addClass("sorter-false"));
      $throw.append($("<th/>").text("Acompanhamento").attr("data-priority", "4").addClass("sorter-false columnSelector-false"));
      $throw.append($("<th/>").text("Ações").attr("data-priority", "5").addClass("columnNowrap"));
      $thead.append($throw);

      /** Aplica o tablesorter */
      $("#divInfraAreaDados").append($comandos, $tabela);
      $tabela.tablesorter({
        theme: 'blue',
        headers: {
          5: { sorter: false, filter: false }
        },
        widgets: ["zebra", "columnSelector", "stickyHeaders"],
        widgetOptions: {
          // target the column selector markup
          columnSelector_container: $('#columnSelector'),
          columnSelector_name: 'data-selector-name',
          columnSelector_mediaquery: false
        },
        textExtraction: {
          0: function (node, table, cellIndex) {
            if ($(node).find("div[id^='proc'] > a").hasClass("processoVisualizado")) {
              return 1;
            } else {
              return 0;
            }
          },
          2: function (node, table, cellIndex) {
            var texto = $(node).find("div[class='anotacao']").text();
            texto = texto == "" ? -99999 : texto;
            return texto;
          },
          3: function (node, table, cellIndex) {
            var texto = $(node).find("img").attr('src');
            texto = texto == undefined ? 0 : texto;
            return texto;
          }
        }
      });
    }

    function TabelaPreencherLista(processo) {
      var $tbody = $("tbody", $tabela);
      /** Cria uma nova linha na tabela */
      var $trrow = $("<tr/>");

      /** Processo / Observação da unidade */
      $processo_obs_unidade = $("<div/>");
      var $processo = $("<td/>")
        .attr("id", "tdprocesso")
        .append($("<div/>")
          .attr("id", "proc" + processo.id)
          .attr("title", processo.tipo)
          .append($("<a/>")
            .attr("href", "controlador.php?acao=procedimento_trabalhar&id_procedimento=" + processo.id)
            .attr("target", "_blank")
            .text(processo.numDoc))
          .append($('<img id="aguarde" src="/infra_css/imagens/aguarde_pequeno.gif" />').hide()))
        .append($processo_obs_unidade);
      $trrow.append($processo);
      if (processo.status.visualizado) {
        $processo.find("div[id^='proc'] > a").addClass('processoVisualizado');
      } else {
        $processo.find("div[id^='proc'] > a").addClass('processoNaoVisualizado');
      }
      if (processo.status.visitado) {
        $processo.find("div[id^='proc'] > a").addClass('processoVisitado');
      }

      /** (HIDE) Tipo de processo */
      $trrow.append($("<td/>").append($("<div/>").text(processo.tipo)));

      /** Anotação */
      var $anotacao = $("<div/>").addClass("anotacao").attr("idproc", processo.id);
      var $nova_anotacao = $("<div/>").addClass("centralizado").append("<button/>");
      var $tdanotacao = $("<td/>").attr("id", "tdanotacao").append($anotacao, $nova_anotacao);

      if (processo.anotacao != null) {
        $anotacao.text(processo.anotacao.descricao)
          .attr("prioridade", processo.anotacao.prioridade ? true : false);
      } else {
        $anotacao.hide();
      }
      $nova_anotacao.hide();

      $("button", $nova_anotacao).button({ icon: "ui-icon-plus" }).on("click", () => $anotacao.trigger("dblclick"));
      $trrow.append($tdanotacao);

      /** (Marcador) Despacho da autoridade */
      var $marcador = $("<div/>").addClass("marcador").attr("idproc", processo.id);
      var $novo_marcador = $("<div/>").addClass("centralizado").append("<button/>");
      var $tdmarcador = $("<td/>").attr("id", "tdmarcador").append($marcador, $novo_marcador);

      $marcador.append($("<div/>").attr("id", "img")
        .append($("<img/>"))
        .append($("<label/>"))
      );
      $marcador.append($("<div/>").attr("id", "text"));
      if (processo.marcador != null) {
        $marcador.find("#img > img")
          .attr("src", "imagens/marcador_" + processo.marcador.cor + ".png")
          .attr("title", processo.marcador.nome);
        $marcador.find("#img > label")
          .text(processo.marcador.nome);
        $marcador.find("#text").text(processo.marcador.descricao);
      } else {
        $marcador.find("#img").hide();
        $marcador.hide();
      }
      $novo_marcador.hide();
      $("button", $novo_marcador).button({ icon: "ui-icon-plus" }).on("click", () => {
        if (Marcadores.length > 0) {
          $marcador.trigger("dblclick");
        } else {
          alert("Não existem marcadores para adicionar!");
        }
      });

      $trrow.append($tdmarcador);

      /** Acompanhamento Especial */
      var $acompanhamento = $("<div/>").addClass("acompanhamento").attr("idproc", processo.id).attr("idacomp", "-1").hide();
      var $novo_acompanhamento = $("<div/>").addClass("centralizado").append("<button/>").hide();
      var $tdacompanhamento = $("<td/>").attr("id", "tdacompanhamento").append($acompanhamento, $novo_acompanhamento);

      $acompanhamento.append($("<div/>").attr("id", "img")
        .append($("<img/>"))
        .append($("<label/>"))
      );
      $acompanhamento.append($("<div/>").attr("id", "text"));

      $("button", $novo_acompanhamento).button({ icon: "ui-icon-plus" }).on("click", () => {
        $acompanhamento.trigger("dblclick");
      });

      $acompanhamento.on("dblclick", dblclick_acompanhamento);
      $trrow.append($tdacompanhamento);

      /** Açoes */
      var $acoes = $("<td/>").attr('id', 'tdacoes');
      var $acao_acompanhamento = $("<div/>");
      var $acao_concluir = $("<div/>");

      $acao_acompanhamento.append($("<img/>").attr("src", "imagens/sei_acompanhamento_especial_pequeno.png"))
        .attr("idproc", processo.id)
        .on("click", click_acao_acompanhamento)
        .hide();
      $acao_concluir.append($("<img/>").attr("src", "imagens/sei_concluir_processo.gif"))
        .attr("idproc", processo.numDoc)
        .on("click", click_acao_concluir)
        .hide();

      $acoes.append($acao_acompanhamento, $acao_concluir);
      $trrow.append($acoes);

      /** FIM */
      $tbody.append($trrow);
      /* Atualiza a tabela */
      $tabela.trigger("update");
      return $trrow;
    }
    /**
     *
     * @param {ws_ProcessoListar} processo
     * @param {*} DadosExtras
     */
    function TabelaPreencherDados($trrow, DadosExtras) {
      /** Processo / Observação da unidade */
      var $processo_obs_unidade = $trrow.find('td:first > div:nth-child(2)');
      if (DadosExtras.dados.ObservacaoOutrasUnidades.length) {
        var obs_unidade = DadosExtras.dados.ObservacaoOutrasUnidades[DadosExtras.dados.ObservacaoOutrasUnidades.length - 1];
        $processo_obs_unidade.text(obs_unidade.observacao).attr("title", "Observação da unidade: " + obs_unidade.unidade);
      } else if (DadosExtras.dados.Observacao != "") {
        $processo_obs_unidade.text(DadosExtras.dados.Observacao).attr("title", "Observação da unidade atual.");
      }
      /* Preenche as flags do processo */
      if (DadosExtras.processo.Flags.Restrito != null) {
        $("div[id^='proc']", $trrow).append($("<img/>")
          .attr("src", "imagens/sei_chave_restrito.gif")
          .attr("title", DadosExtras.processo.Flags.Restrito)
        );
      }
      if (DadosExtras.processo.Flags.PontoControle != null) {
        $("div[id^='proc']", $trrow).append($("<img/>")
          .attr("src", "imagens/sei_situacao_pequeno.png")
          .attr("title", DadosExtras.processo.Flags.PontoControle)
        );
      }
      if (DadosExtras.processo.Flags.Marcador.Nome != null) {
        $("div[id^='proc']", $trrow).append($("<img/>")
          .attr("src", "imagens/marcador_" + DadosExtras.processo.Flags.Marcador.Cor + ".png")
          .attr("title", DadosExtras.processo.Flags.Marcador.Nome)
        );
      }
      if (DadosExtras.acompanhamento.id != -1) {
        $("div[id^='proc']", $trrow).append($("<img/>")
          .attr("src", "imagens/sei_acompanhamento_especial_pequeno.png")
          .attr("title", "Acompanhamento Especial")
        );
      }
      if (DadosExtras.ciencias.length > 0) { /** Ciência */
        var list_ciencia = "";
        var $ciencia = $("<img/>").attr("src", "imagens/sei_ciencia_pequeno.gif");

        DadosExtras.ciencias.forEach(function (ciencia) {
          list_ciencia = list_ciencia.concat(ciencia.nome, " - ", ciencia.data, "\n");
        });
        $ciencia.attr("title", list_ciencia);
        $("div[id^='proc']", $trrow).append($ciencia);
      }

      /* Anotação já retornado pela lista de processos */
      var $anotacao = $trrow.find('#tdanotacao > div.anotacao');
      var $nova_anotacao = $trrow.find('#tdanotacao > div.centralizado');
      $anotacao.on("dblclick", dblclick_anotacao);
      if (!$anotacao.is(':visible')) { $nova_anotacao.show(); }

      /* Marcador já retornado pela lista de processos */
      var $marcador = $trrow.find('#tdmarcador > div.marcador');
      var $novo_marcador = $trrow.find('#tdmarcador > div.centralizado');
      $marcador.on("dblclick", dblclick_marcador);
      if (!$marcador.is(':visible')) { $novo_marcador.show(); }

      /** Acompanhamento Especial */
      var $acompanhamento = $trrow.find("#tdacompanhamento div.acompanhamento");
      var $novo_acompanhamento = $trrow.find("#tdacompanhamento div.centralizado");

      if (DadosExtras.acompanhamento.id != -1) {
        $novo_acompanhamento.hide();
        $acompanhamento.attr('idacomp', DadosExtras.acompanhamento.id);
        $acompanhamento.find("#img > img")
          .attr("src", "imagens/sei_acompanhamento_especial_pequeno.png")
          .attr("title", "Acompanhamento Especial");
        if (DadosExtras.acompanhamento.grupo != null) {
          $acompanhamento.find("#img > label")
            .text(DadosExtras.acompanhamento.grupo.nome);
        }
        $acompanhamento.find("#text").text(DadosExtras.acompanhamento.observacao);
        $acompanhamento.show()
      } else {
        $acompanhamento.find("#img").hide();
        $acompanhamento.hide();
        $novo_acompanhamento.show();
      }

      /** Açoes */
      $trrow.find("#tdacoes > div").show();

      /* Atualiza a tabela */
      $trrow.find("#tdprocesso #aguarde").hide()
      $tabela.trigger("update");
    }
    /**
     *
     * @param {*} processo
     */
    function CarregarDadosProcesso(processo) {
      var linkHashProcesso = processo.linkHash
      /** Pega informações extras */
      processo.$trrow.find("#tdprocesso #aguarde").show();
      processo.$trrow.find("#tdprocesso > div[id^='proc'] > a").addClass("processoVisitado");
      return ext_ws_get(seipp_api.processo.consultar, linkHashProcesso).then(function (proc) {
        console.log(proc);
        return Promise.all([
          ext_ws_get(seipp_api.processo.consultar_dados, proc),
          ext_ws_get(seipp_api.processo.marcador, proc),
          ext_ws_get(seipp_api.processo.acompanhamento, proc),
          ws_get(wsapi.processo.listar_ciencia, null, proc.id)
        ]).then(dados => {
          return Promise.resolve({ processo: proc, dados: dados[0], marcador: dados[1], acompanhamento: dados[2], ciencias: dados[3] })
        });
      });
    }

    function dblclick_anotacao() {
      var $dialog = $("<div/>")
        .attr("id", "dblclick_anotacao")
        .attr("title", "Editar anotação")
        .append($("<textarea/>").text($(this).text()).css({ width: "250px", height: "150px", resize: "none" }))
        .append($("<input/>").attr("type", "checkbox"))
        .append($("<label/>").text("Prioridade"));
      var $anotacao = $(this);
      if ($anotacao.attr("prioridade") == "true") $dialog.find("input").attr("checked", "checked");
      $("body").append($dialog);
      $dialog = $dialog.dialog({
        autoOpen: false, height: 270, width: 275, modal: true, resizable: false,
        buttons: {
          Salvar: Salvar,
          Cancelar: function () {
            $dialog.dialog("close");
          }
        },
        close: function () {
          $dialog.dialog("destroy");
          $("#dblclick_anotacao").remove();
        }
      });
      $dialog.dialog("open");

      function Salvar() {
        ws_token().then(Login => {
          var data = {
            descricao: $dialog.find("textarea").val(),
            protocolo: $anotacao.attr("idproc"),
            unidade: Login.loginData.IdUnidadeAtual,
            usuario: Login.loginData.IdUsuario,
            prioridade: $dialog.find("input").prop("checked") ? "S" : "N"
          };
          console.log($dialog.find("input[checked]"));
          return ws_post(wsapi.anotacao, data);
        }).then(function (params) {
          console.log(params);
          $anotacao.text($dialog.find("textarea").val());
          if ($dialog.find("input").prop("checked")) {
            $anotacao.attr("prioridade", true);
          } else {
            $anotacao.attr("prioridade", false);
          }
          if ($anotacao.text() == "") {
            $anotacao.removeAttr("prioridade");
            $anotacao.hide();
            $("div.centralizado", $anotacao.parent()).show();
          } else {
            $anotacao.show();
            $("div.centralizado", $anotacao.parent()).hide();
          }
          $tabela.trigger("update");
          $dialog.dialog("close");
        }).catch(function (err) {
          alert(err);
        });
      }
    }

    function dblclick_marcador() {
      var $select = $("<select/>");
      var $textarea = $("<textarea/>").attr("maxlength", 250).css({ width: "250px", height: "150px", resize: "none" });
      var $dialog = $("<div/>")
        .attr("id", "dblclick_marcador")
        .attr("title", "Editar Marcador")
        .append($("<label/>").text("Marcador:"))
        .append($select)
        .append($textarea);
      var $marcador = $(this);
      $select.append($("<option/>").text("").val(null));
      Marcadores.forEach(function (Marcador) {
        $select.append($("<option/>").text(Marcador.nome).val(Marcador.id)
          .attr("data-url", "imagens/marcador_" + Marcador.cor + ".png"));
      });
      $select.find("option").each(function () {
        if ($marcador.find("#img > label").text() == $(this).text()) {
          $(this).attr("selected", "selected");
        }
      });
      $textarea.text($marcador.find("#text").text());
      $("body").append($dialog);
      $dialog = $dialog.dialog({
        autoOpen: false, height: 270, width: 275, modal: true, resizable: false,
        buttons: {
          Salvar: Salvar,
          Cancelar: function () {
            $dialog.dialog("close");
          }
        },
        close: function () {
          $dialog.dialog("destroy");
          $("#dblclick_marcador").remove();
        },
        open: function (event, ui) {
          $(this).find("select").iconselectmenu()
            .addClass("ui-menu-icons");
        }
      });
      $dialog.dialog("open");

      function Salvar() {
        var Marcador = {
          id: $select.val(),
          texto: $textarea.val()
        }
        ext_ws_get(seipp_api.processo.consultar, null, $marcador.attr("idproc")).then(
          proc => ext_ws_post(seipp_api.processo.marcador, Marcador, proc)
        ).then(ret => {
          $throw = $marcador.parent().parent();
          if (Marcador.id == "") { /** Remover o marcador */
            $marcador.find("#img").hide();
            $marcador.find("#text").text("");

            /** Remove o flag */
            $throw.find("td:first > div[id^='proc'] > img[src*='imagens/marcador_']").remove();

            $marcador.hide();
            $("div.centralizado", $marcador.parent()).show();
          } else { /** Adicionar/Alterar o marcador */
            var m = Marcadores.find(m => m.id == Marcador.id);
            $marcador.find("#img > img")
              .attr("src", "imagens/marcador_" + m.cor + ".png")
              .attr("title", m.nome);
            $marcador.find("#img > label")
              .text(m.nome);
            $marcador.find("#img").show();
            $marcador.find("#text").text(Marcador.texto);

            /** Atualiza a flag no processo */
            var $flag_marcador = $throw.find("td:first > div[id^='proc'] > img[src*='imagens/marcador_']");
            if ($flag_marcador.length == 0) {
              $throw.find("td:first > div[id^='proc']").append($("<img/>")
                .attr("src", "imagens/marcador_" + m.cor + ".png")
                .attr("title", m.nome));
            } else {
              $flag_marcador.attr("src", "imagens/marcador_" + m.cor + ".png")
                .attr("title", m.nome);
            }

            $marcador.show();
            $("div.centralizado", $marcador.parent()).hide();
          }
          $tabela.trigger("update");
          $dialog.dialog("close");
        }).catch(function (err) {
          console.log(err);
          alert(err);
        });
      }
    }

    function dblclick_acompanhamento() {
      var $select = $("<select/>");
      var $textarea = $("<textarea/>").attr("maxlength", 250).css({ width: "250px", height: "150px", resize: "none" });
      var $dialog = $("<div/>")
        .attr("id", "dblclick_acompanhamento")
        .attr("title", "Editar Acompanhamento Especial")
        .append($("<label/>").text("Grupo:"))
        .append($select)
        .append($textarea);
      var $acompanhamento = $(this);
      var id = $acompanhamento.attr("idacomp");
      $select.append($("<option/>").text("").val(null));
      GrupoAcompanhamentos.forEach(function (Grupo) {
        $select.append($("<option/>").text(Grupo.nome).val(Grupo.id));
      });
      $select.find("option").each(function () {
        if ($acompanhamento.find("#img > label").text() == $(this).text()) {
          $(this).attr("selected", "selected");
        }
      });
      $textarea.text($acompanhamento.find("#text").text());
      $("body").append($dialog);
      var dialog_buttons = {};
      if (id != -1) { dialog_buttons.Excluir = Excluir };
      dialog_buttons.Salvar = Salvar;
      dialog_buttons.Cancelar = () => $dialog.dialog("close");

      $dialog = $dialog.dialog({
        autoOpen: false, height: 270, width: 275, modal: true, resizable: false,
        buttons: dialog_buttons,
        close: function () {
          $dialog.dialog("destroy");
          $("#dblclick_acompanhamento").remove();
        }
      });
      $dialog.dialog("open");

      function Salvar() {
        var Acompanhamento = {
          grupo: $select.val(),
          protocolo: $acompanhamento.attr("idproc"),
          observacao: $textarea.val()
        }
        var ws;
        if (id == -1) { /** Novo acompanhamento */
          ws = ws_post(wsapi.processo.acompanhar, Acompanhamento);
        } else { /** Alterar acompanhamento */
          var acomp = {
            id: id,
            grupo: Acompanhamento.grupo,
            observacao: Acompanhamento.observacao
          }
          ws = ext_ws_get(seipp_api.processo.consultar, null, Acompanhamento.protocolo).then(
            proc => ext_ws_post(seipp_api.processo.acompanhamento, acomp, proc)
          );
          console.log("Alterar o acompanhamento");
        }
        ws.then(ret => {
          console.log(ret);
          if (Array.isArray(ret)) {
            return ext_ws_get(seipp_api.processo.consultar, null, $acompanhamento.attr("idproc")).then(
              ret => ext_ws_get(seipp_api.processo.acompanhamento, ret)
            );
          } else {
            return ret;
          }
        }).then(ret => {
          var $throw = $acompanhamento.parent().parent();
          var m = GrupoAcompanhamentos.find(m => m.id == Acompanhamento.grupo);
          $acompanhamento.find("#img > img")
            .attr("src", "imagens/sei_acompanhamento_especial_pequeno.png")
            .attr("title", "Acompanhamento Especial");

          $acompanhamento.find("#img > label").text(m == undefined ? "" : m.nome);
          $acompanhamento.find("#img").show();
          $acompanhamento.find("#text").text(Acompanhamento.observacao);
          $acompanhamento.attr("idacomp", ret.id);

          /** Atualiza a flag no processo */
          var $flag_acompanhamento = $throw.find("td:first > div[id^='proc'] > img[src*='sei_acompanhamento_especial_pequeno']");
          if ($flag_acompanhamento.length == 0) {
            $throw.find("td:first > div[id^='proc']").append($("<img/>")
              .attr("src", "imagens/sei_acompanhamento_especial_pequeno.png")
              .attr("title", "Acompanhamento Especial"));

            $acompanhamento.show();
            $("div.centralizado", $acompanhamento.parent()).hide();
          }
          $tabela.trigger("update");
          $dialog.dialog("close");
        }).catch(function (err) {
          console.log(err);
          alert(err);
        });
      }

      function Excluir() {
        var Acomp = {
          idProcesso: $acompanhamento.attr("idproc"),
          excluir: true
        };
        ext_ws_get(seipp_api.processo.consultar, $acompanhamento.attr("idproc")).then(
          proc => ext_ws_post(seipp_api.processo.acompanhamento, Acomp, proc)
        ).then(ret => {
          $throw = $acompanhamento.parent().parent();

          $acompanhamento.attr("idacomp", "-1");
          $acompanhamento.find("#img label").text("");
          $acompanhamento.find("#text").text("");

          /** Remove o flag */
          $throw.find("td:first > div[id^='proc'] > img[src*='imagens/sei_acompanhamento_especial_pequeno']").remove();

          $acompanhamento.hide();
          $("div.centralizado", $acompanhamento.parent()).show();
          $tabela.trigger("update");
          $dialog.dialog("close");
        }).catch(function (err) {
          console.log(err);
          alert(err);
        });
      }
    }

    function click_acao_acompanhamento() {
      var $throw = $(this).parent().parent();
      var $acompanhamento = $throw.find("#tdacompanhamento .acompanhamento");
      $acompanhamento.trigger("dblclick");
    }
    function click_acao_concluir() {
      var $acao_concluir = $(this);
      var nprocesso = $acao_concluir.attr("idproc");
      if (confirm("Deseja concluir o processo " + $acao_concluir.parent().parent().find("div > a").text() + "?")) {
        ws_post(wsapi.processo.concluir, { numeroProcesso: nprocesso }).then(resp => {
          /** Remove o processo da tabela */
          $acao_concluir.parent().parent().remove();
          $tabela.trigger("update");
          alert("Processo concluído");
        }).catch(err => {
          alert(err);
        });
      }
    }
  };

  return data;
}