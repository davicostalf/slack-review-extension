# Revisor de mensagens do Slack

Extensão do Chrome que revisa sua mensagem no Slack web (https://app.slack.com) antes de enviar. A revisão usa o Claude Code que já está logado na sua máquina, por meio do Chrome Native Messaging. Não usa a API da Anthropic nem pede chave.

O popover de sugestão só aparece quando o Claude acha uma melhoria **significativa**. Nos outros casos a mensagem original é enviada sozinha, sem interrupção. As sugestões seguem o tom da conversa e o seu jeito habitual de escrever.

## Por quê

No trabalho, boa parte do que a gente escreve vai pelo Slack, e quase sempre com pressa. A mensagem sai ambígua, sem o contexto que o leitor precisa (um link sem explicação, um "aquilo que falei") ou mais seca do que a gente queria, e aí vira ida e volta para explicar.

O revisor confere a mensagem antes de sair e só interrompe quando há uma melhora que vale a pena. Ele segue o tom da conversa e o seu jeito de escrever, não corrige estilo nem informalidade, e a decisão de usar a sugestão é sempre sua. Na maioria das mensagens, ele nem aparece.

**ID da extensão (fixo):** `mnjmjomadajemdflfgeeaggadoobokdn`

## Requisitos

- Navegador da família Chrome: Chrome, Chrome Beta, Chromium, Brave, Edge ou Arc (macOS ou Linux).
- git.
- Node 18 ou superior.
- Claude Code instalado e com login feito (rode `claude` no terminal uma vez).

## Instalação

1. Cole este comando no terminal:
   ```
   git clone https://github.com/davicostalf/slack-review-extension ~/.claude-slack-review && ~/.claude-slack-review/native-host/install.sh
   ```
   Ele baixa a extensão para `~/.claude-slack-review`, acha o `node` e o `claude` no seu PATH e registra o conector local em todos os navegadores compatíveis que encontrar. No fim, copia para a área de transferência o caminho da pasta `extension/` e tenta abrir `chrome://extensions` (no macOS).
2. Em `chrome://extensions`, ative o **Modo do desenvolvedor** (canto superior direito) e clique em **Carregar sem compactação**. Abre uma janela para escolher a pasta. A pasta `~/.claude-slack-review` começa com ponto e fica escondida, então não a procure clicando:
   - no macOS, aperte **⌘ + Shift + G**, cole o caminho com ⌘V, aperte Enter e clique em **Selecionar**;
   - no Linux, aperte **Ctrl + L**, cole o caminho e confirme.

   Confira que o ID é o de cima.
3. A página de configurações abre sozinha na primeira vez. Confira se a seção **Conexão** está toda ok e preencha **Seu nome no Slack** do jeito que ele aparece nas mensagens. As mudanças são salvas sozinhas.

   Em **Ajustes opcionais** dá para trocar o modelo (Sonnet 5.5 é o padrão, Haiku 5.5 é mais rápido), o tamanho mínimo da mensagem (padrão 15 caracteres) e o tempo limite (padrão 30 s).
4. Recarregue a aba do Slack.

O `install.sh` também funciona a partir de qualquer outra cópia do repositório. Para remover o conector: `./native-host/uninstall.sh`. Se mover a pasta, rode o `install.sh` de novo.

## Atualizações

A extensão confere se há versão nova ao abrir o navegador, uma vez por dia e sempre que você abre a página de configurações. Quando há, aparece um **selo "1"** no ícone da extensão. Clique no ícone, depois em **Regras e configurações**, e use o botão **Atualizar** no aviso do topo da página; a extensão se recarrega sozinha. "Verificar atualizações" confere na hora.

Nada é baixado nem executado sem o seu clique: a atualização é um `git pull --ff-only` na pasta de instalação. Se você mexeu em arquivos da pasta, o botão recusa e pede para atualizar com git. Depois de atualizar, recarregue as abas do Slack.

Manualmente: `git -C ~/.claude-slack-review pull` e depois recarregue a extensão em `chrome://extensions`.

## Como usar

- **Ícone da extensão:** abre um popup pequeno com o nome da conversa aberta no Slack e a chave **Revisar nesta conversa**. Desligada, as mensagens dessa conversa saem sem revisão nenhuma. Para voltar, ligue a chave de novo (ou use **Ligar de novo** nas configurações).
- **Peça um ajuste:** no mesmo popup, escreva em texto livre quando ou como quer a revisão ("aqui pode ser mais informal", "não revise mensagens em inglês", "nunca troque 'vcs' por 'vocês'") e clique em **Pedir** (ou ⌘/Ctrl + Enter). O Claude reescreve o pedido como uma regra curta e mostra com o alcance, "Nesta conversa" ou "Em todas as conversas". Só vale depois de **Salvar**; **Ajustar pedido** volta para o texto. Se o pedido for "não revisar aqui", Salvar só desliga a chave da conversa. Cada revisão leva as regras que valem para a conversa, e elas têm prioridade sobre os padrões do revisor.
- **Onde ficam as regras:** na seção **Regras** das configurações, agrupadas por "Em todas as conversas" e por conversa, junto com a lista de conversas sem revisão. Para remover uma regra, clique no **×** dela. Máximo de 50 regras, guardadas só neste navegador.
- Escreva e envie normalmente. Ao apertar Enter (ou clicar em enviar), o texto do campo começa a brilhar enquanto o Claude revisa.
- Sem melhoria significativa: o original é enviado automaticamente, como sempre.
- Com melhoria significativa: **nada é enviado**. Um popover abre acima do campo (o foco continua no campo, então dá para seguir digitando) com o motivo e a sugestão marcada contra o seu texto: o que sai aparece riscado, o que entra aparece sublinhado e destacado. O texto do popover é selecionável, para copiar qualquer trecho.
- Passe o mouse ou use Tab sobre uma mudança para ver **Aplicar**: só aquele trecho vai para o campo. **Substituir tudo** troca o texto do campo pela sugestão inteira e **Copiar** leva a sugestão para a área de transferência. Nenhum botão envia: quem envia é sempre você.
- Se você editar o campo à mão, os botões **Aplicar** ficam desativados ("O texto mudou; use Substituir tudo ou copie"). Substituir tudo e Copiar continuam valendo.
- Feche o popover com o **×** do cabeçalho ou com Esc (também fecha ao esvaziar o campo, enviar ou trocar de conversa).
- Ao apertar Enter de novo, o texto é revisado outra vez (inclusive depois de aplicar trechos), e o popover aberto fecha. Exceção: se o texto for exatamente o que gerou a sugestão, ele é enviado direto, sem nova revisão.
- O Claude não inventa informação. Quando falta algo que só você sabe, a sugestão traz um marcador como ⟨qual era a causa⟩, e o envio (por qualquer caminho, exceto ⌥+Enter) fica bloqueado até você preencher ou apagar o marcador.
- Se a mensagem tiver menções ou canais, o popover avisa: substituir por texto simples perde as menções reais, então confira e refaça as menções antes de enviar.
- **⌥+Enter** (Option+Enter) envia sem passar pela revisão.
- Enquanto o Claude revisa, o próprio texto da mensagem no campo brilha em movimento (com a opção de reduzir movimento do sistema, fica só levemente colorido). **Esc** cancela a revisão e deixa o texto no campo para você editar; **⌥+Enter** envia na hora, sem revisar. Mexer no texto durante a revisão também a descarta.
- Erros e tempo esgotado aparecem num aviso acima do campo (com **×** para fechar) e o botão "Enviar original"; a mensagem nunca é enviada sozinha.
- **Entender links sem explicação** (opcional, em Ajustes opcionais): quando a mensagem é basicamente um link, a extensão abre o link com a sua sessão do navegador (por isso funciona em páginas privadas, como Google Docs, Figma, Jira e GitHub privado) e lê só o título e a descrição da página, para o Claude dizer o que ele é. Nada do conteúdo da página é enviado. Ao ligar, o Chrome pede permissão para acessar os sites. Se a página pedir login ou falhar, o Claude deduz pelo nome do link, como antes.
- Mensagens menores que o mínimo, só com emoji ou links passam direto.
- Se você mudar o texto enquanto a revisão roda, o resultado é descartado.
- Estilo: toda mensagem enviada pela extensão entra nas amostras (últimas 40, guardadas no navegador), junto com mensagens suas visíveis no contexto. Esses textos e as últimas mensagens da conversa são enviados ao Claude para a revisão. O botão "Limpar amostras" fica nas opções.

## Problemas comuns

A mensagem de erro aparece no aviso perto do campo e na seção Status das opções.

| Erro | O que fazer |
| --- | --- |
| **Falta instalar o conector local** (`host_missing`) | Rode o comando da seção Instalação (as configurações mostram o comando com botão Copiar) e recarregue o Slack. Confira se o ID da extensão é o desta página. |
| **Claude Code não encontrado** (`cli_missing`) | Instale o Claude Code e rode `~/.claude-slack-review/native-host/install.sh` de novo (ele grava o caminho do `claude`). |
| **Você não está logado no Claude Code** (`not_logged_in`) | Rode `claude` no terminal e faça login. Depois clique em "Verificar conexão" nas opções. |
| **O Claude demorou demais** (`timeout`) | Tente de novo, aumente o tempo limite nas opções ou use um modelo mais rápido (ex.: `claude-haiku-5-5`). |
| **Limite de uso atingido** (`limit`) | Espere o limite do seu plano renovar e tente de novo. |
| **Erro desconhecido** (`unknown`) | Rode `claude -p "oi"` no terminal para ver se o CLI funciona. Veja `chrome://extensions` > Erros. |

Depois de um erro de login ou de conector ausente, a extensão guarda o erro por 5 minutos e o mostra na hora, sem chamar o conector de novo. "Verificar conexão" nas opções limpa esse aviso.

## Se o Slack mudar

Todos os seletores de DOM ficam em `extension/selectors.js`, cada um com uma lista de alternativas tentadas em ordem. Se a revisão parar de aparecer, ou o contexto vier vazio, ajuste só esse arquivo e recarregue a extensão em `chrome://extensions`.

## Testes

```
node --test test/host.test.mjs test/diff.test.mjs test/linkinfo.test.mjs test/convo.test.mjs
```

Usam `test/fake-claude.mjs`, não o CLI real. (Em Node 24, `node --test test/` tenta carregar a pasta como módulo; use o caminho do arquivo.)

## Estrutura

```
extension/    manifest, background, content, convo, diff, linkinfo, selectors, popup, opções, icons/
native-host/  host.js, install.sh, uninstall.sh (run.sh é gerado)
test/         host.test.mjs, diff.test.mjs, linkinfo.test.mjs, convo.test.mjs, fake-claude.mjs
```
