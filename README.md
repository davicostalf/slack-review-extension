# Revisor de mensagens do Slack

Extensão do Chrome que revisa sua mensagem no Slack web (https://app.slack.com) antes de enviar. A revisão usa o Claude Code que já está logado na sua máquina, por meio do Chrome Native Messaging. Não usa a API da Anthropic nem pede chave.

O popover de sugestão só aparece quando o Claude acha uma melhoria **significativa**. Nos outros casos a mensagem original é enviada sozinha, sem interrupção. As sugestões seguem o tom da conversa e o seu jeito habitual de escrever.

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

A extensão confere se há versão nova ao abrir o navegador e uma vez por dia. Quando há, aparece um **selo "1"** no ícone da extensão. Clique no ícone para abrir as configurações e use o botão **Atualizar** na seção **Versão**; a extensão se recarrega sozinha. "Verificar atualizações" confere na hora.

Nada é baixado nem executado sem o seu clique: a atualização é um `git pull --ff-only` na pasta de instalação. Se você mexeu em arquivos da pasta, o botão recusa e pede para atualizar com git. Depois de atualizar, recarregue as abas do Slack.

Manualmente: `git -C ~/.claude-slack-review pull` e depois recarregue a extensão em `chrome://extensions`.

## Como usar

- Escreva e envie normalmente. Ao apertar Enter (ou clicar em enviar), aparece "Claude revisando…" perto do campo, com o botão "Enviar sem revisar".
- Sem melhoria significativa: o original é enviado automaticamente, como sempre.
- Com melhoria significativa: **nada é enviado**. Um popover abre acima do campo (o foco continua no campo, então dá para seguir digitando) com o motivo e a sugestão marcada contra o seu texto: o que sai aparece riscado, o que entra aparece sublinhado e destacado. O texto do popover é selecionável, para copiar qualquer trecho.
- Passe o mouse ou use Tab sobre uma mudança para ver **Aplicar**: só aquele trecho vai para o campo. **Substituir tudo** troca o texto do campo pela sugestão inteira e **Copiar** leva a sugestão para a área de transferência. Nenhum botão envia: quem envia é sempre você.
- Se você editar o campo à mão, os botões **Aplicar** ficam desativados ("O texto mudou; use Substituir tudo ou copie"). Substituir tudo e Copiar continuam valendo.
- Feche o popover com o **×** do cabeçalho ou com Esc (também fecha ao esvaziar o campo, enviar ou trocar de conversa).
- Ao apertar Enter de novo, o texto é revisado outra vez (inclusive depois de aplicar trechos), e o popover aberto fecha. Exceção: se o texto for exatamente o que gerou a sugestão, ele é enviado direto, sem nova revisão.
- O Claude não inventa informação. Quando falta algo que só você sabe, a sugestão traz um marcador como ⟨qual era a causa⟩, e o envio (por qualquer caminho, exceto ⌥+Enter) fica bloqueado até você preencher ou apagar o marcador.
- Se a mensagem tiver menções ou canais, o popover avisa: substituir por texto simples perde as menções reais, então confira e refaça as menções antes de enviar.
- **⌥+Enter** (Option+Enter) envia sem passar pela revisão.
- Mensagens menores que o mínimo, só com emoji ou links passam direto.
- Se você mudar o texto enquanto a revisão roda, o resultado é descartado.
- Em erro ou tempo esgotado a mensagem **nunca** é enviada sozinha: aparece o erro com o botão "Enviar original".
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
node --test test/host.test.mjs test/diff.test.mjs
```

Usam `test/fake-claude.mjs`, não o CLI real. (Em Node 24, `node --test test/` tenta carregar a pasta como módulo; use o caminho do arquivo.)

## Estrutura

```
extension/    manifest, background, content, diff, selectors, opções, icons/
native-host/  host.js, install.sh, uninstall.sh (run.sh é gerado)
test/         host.test.mjs, diff.test.mjs, fake-claude.mjs
```
