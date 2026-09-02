# Agent Rules Lens

Português | [English](README.en.md)

Veja quais instruções de agentes de código se aplicam ao arquivo aberto — e por quê.

[Instalar no VS Code](https://marketplace.visualstudio.com/items?itemName=williamosilva.agent-rules-lens) · [Executar localmente](#dashboard-local-no-navegador) · [Abrir uma issue](https://github.com/williamosilva/agent-rules-lens/issues/new) · [Repositório](https://github.com/williamosilva/agent-rules-lens)

![Sidebar do Agent Rules Lens no VS Code, listando por formato as instruções que se aplicam a um arquivo TypeScript aberto](https://raw.githubusercontent.com/williamosilva/agent-rules-lens/main/docs/images/agent-rules-lens.png)

Um mesmo projeto pode ter `AGENTS.md`, regras do Claude, regras do Cursor e instruções do Copilot ao mesmo tempo. Cada formato tem um escopo diferente: uns descem pela hierarquia de diretórios, outros dependem de um glob no frontmatter, outros valem para o repositório inteiro. Abra `src/backend/order.service.ts` e responder "qual desses arquivos se aplica agora?" já dá trabalho.

O Agent Rules Lens reúne esses arquivos e mostra, para o arquivo escolhido, quais se aplicam e o motivo.

## Escolha como usar

| Opção | Quando usar | Como começar |
| --- | --- | --- |
| Extensão do Marketplace | Uso diário no VS Code, acompanhando automaticamente o arquivo aberto | [Instalar pelo Marketplace](https://marketplace.visualstudio.com/items?itemName=williamosilva.agent-rules-lens) |
| Extensão pelo código-fonte | Desenvolver ou testar uma versão local da extensão | `npm run install:local` |
| Dashboard local | Analisar um projeto no navegador, sem depender da extensão | `arl` |
| Relatório JSON | Scripts, automações e integrações | `arl <arquivo> --json` |

O que cada comando faz:

- `npm run install:local` compila a extensão, gera o `.vsix` e o instala no VS Code.
- `arl` inicia o dashboard local para a pasta atual do terminal.

São caminhos independentes. A extensão não precisa da CLI, e a CLI e o dashboard não precisam da extensão instalada.

O pacote npm público da CLI ainda não foi lançado, então `arl` vem do código-fonte: rode `npm run local:link` uma vez no repositório clonado e o comando passa a existir na sua máquina.

## Extensão do VS Code

Pelo Marketplace, que é o caminho normal:

```powershell
code --install-extension williamosilva.agent-rules-lens
```

Ou pela [página da extensão](https://marketplace.visualstudio.com/items?itemName=williamosilva.agent-rules-lens).

Depois de instalada, clique no ícone do Agent Rules Lens na Activity Bar. A sidebar acompanha o workspace aberto e o arquivo em foco: trocar de aba refaz a comparação sozinha. Clicar em uma regra abre o arquivo; clicar em um aviso vai até a linha indicada. O `PT | EN` do cabeçalho troca o idioma.

Para desenvolver ou testar uma versão local da extensão:

```powershell
git clone https://github.com/williamosilva/agent-rules-lens.git
cd agent-rules-lens
npm install
npm run install:local
```

Recarregue a janela depois (`Ctrl + Shift + P` → `Developer: Reload Window`). Isso instala a extensão compilada do seu clone e não tem relação com o dashboard local.

## Dashboard local no navegador

Configuração única, no repositório clonado:

```powershell
git clone https://github.com/williamosilva/agent-rules-lens.git
cd agent-rules-lens
npm install
npm run local:link
```

Depois, no projeto que você quer analisar:

```powershell
cd C:\caminho\do\projeto
arl
```

![Dashboard local do Agent Rules Lens no navegador, com o seletor de arquivo à esquerda e a análise agrupada por formato à direita](https://raw.githubusercontent.com/williamosilva/agent-rules-lens/main/docs/images/local-dashboard.png)

Exemplos que funcionam:

```powershell
arl                          # analisa a pasta atual
arl src/app.ts               # já abre com esse arquivo selecionado
arl ..\outro-projeto         # analisa outro projeto
arl src/app.ts --json        # imprime a análise e encerra
arl --locale pt-BR           # interface em português
arl --no-open                # não abre o navegador
arl --help
```

O que vale saber:

- `arl` usa a pasta atual do terminal como projeto, então normalmente não é preciso informar nada.
- Um arquivo pode ser passado direto para já abrir a análise selecionada.
- O servidor escuta somente em `127.0.0.1` e exige um token gerado para aquela execução.
- Os arquivos permanecem no seu computador. Nada é enviado para nenhum serviço.
- O dashboard é somente leitura: clicar em uma regra abre uma pré-visualização na própria página, não um editor.
- A atualização é manual — use **Atualizar arquivos** depois de mudar um arquivo de regras.
- `Ctrl+C` encerra o servidor.

Também existem `--workspace` e `--file` para quando o padrão não serve, e `--port` para fixar a porta.

## Relatório JSON

Para scripts e automações, `--json` imprime a análise na saída padrão e encerra sem subir servidor:

```powershell
arl src/app.ts --json
```

A saída traz `schemaVersion`, o nome do projeto, o arquivo analisado, um resumo, os grupos por formato, os avisos, as regras não aplicáveis, as configurações apenas detectadas e os candidatos. Todos os caminhos são relativos ao projeto.

## Demonstração

Para ver o resultado sem usar um projeto seu:

```powershell
npm run demo
```

Ou, com o `arl` já disponível:

```powershell
cd examples\sample-workspace
arl src\backend\order.service.ts
```

O projeto de exemplo tem casos intencionais de `AGENTS.md`, `AGENTS.override.md`, Claude, Cursor e GitHub Copilot, além de um aviso de import ausente, uma configuração apenas detectada e um arquivo que parece instrução personalizada. Eles existem para mostrar cada situação de uma vez — um projeto real não precisa de nada disso.

## O que ele afirma e o que apenas detecta

Quando ele diz que uma regra se aplica, isso vem de um caminho documentado, de uma hierarquia de diretórios, de um glob ou de um metadado que ele sabe interpretar. Ele nunca deduz pelo nome do arquivo e nunca lê o texto da regra para julgar relevância.

Um `typescript.md` sem o campo `paths` vale para todos os arquivos, inclusive os de Python. Uma regra do Cursor chamada `frontend.mdc` cujos globs apontam para `src/backend/**` vale para o backend. O nome não é evidência.

Detectar um arquivo **não** significa confirmar que alguma ferramenta realmente o carregou. Para os formatos apenas detectados, o Agent Rules Lens diz que reconheceu o arquivo e a qual ferramenta ele pertence — nada além disso.

E ele analisa os arquivos de configuração que estão no projeto. Não inspeciona o contexto interno e em execução do Claude, do Cursor, do Copilot ou de qualquer outro agente.

## Formatos suportados

| Formato | Detectado | Aplicabilidade analisada |
| --- | ---: | ---: |
| `AGENTS.md`, `AGENTS.override.md` | Sim | Sim |
| Claude — `CLAUDE.md`, `CLAUDE.local.md`, `.claude/CLAUDE.md`, `.claude/rules/**/*.md` | Sim | Sim |
| Cursor — `.cursor/rules/**/*.mdc` | Sim | Sim |
| GitHub Copilot — `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md` | Sim | Sim |
| Gemini, Qwen | Sim | Não |
| Windsurf, Cline, Roo Code, Continue | Sim | Não |
| Kiro, Amazon Q Developer, Junie, Augment | Sim | Não |
| Replit Agent, Qoder, CodeBuddy, Trae, Zed | Sim | Não |
| Nomes escritos à mão, como `RULES.md` e `AI_RULES.md`, e arquivos em `.ai/rules/` | Como candidatos | Não |

**Detectado** quer dizer que o arquivo foi reconhecido e atribuído a uma ferramenta. **Aplicabilidade analisada** quer dizer que as regras de resolução documentadas daquele formato estão implementadas, então a comparação com o arquivo aberto é real. Um formato apenas detectado fica fora da contagem principal.

Definições de agentes, prompts e skills — `.github/agents/*.agent.md`, `.claude/agents/**`, `.github/prompts/*.prompt.md`, `.agents/skills/**/SKILL.md` — são reconhecidos justamente para nunca aparecerem como regras.

## Significado dos estados

| Estado | O que significa |
| --- | --- |
| Aplicação automática | Corresponde ao arquivo aberto por uma regra documentada |
| O agente decide | O agente avalia a relevância, a partir de uma `description` |
| Somente manual | Carregado apenas quando você menciona explicitamente |
| Não se aplica | A regra foi entendida, mas o escopo não cobre este arquivo |
| Não foi possível determinar | Um campo que define a aplicabilidade está malformado |
| Configuração inválida | O próprio arquivo está malformado |
| Aplicabilidade não analisada | Configuração detectada: a ferramenta é conhecida, mas as regras de resolução dela não estão implementadas |
| Carregamento não verificado | Candidato ou arquivo declarado pelo usuário: nenhum agente conhecido o carrega |

Só as regras com *aplicação automática* entram na contagem e no total de tokens.

## Tokens

O número de tokens é uma estimativa grosseira: um token a cada quatro caracteres do corpo da regra, sem tokenizer de verdade. Serve para dar noção de tamanho, não para prever cobrança. E não é uma única janela de contexto — cada formato é lido pelo seu próprio agente, então os números por formato dizem mais do que a soma. Configurações detectadas e candidatos não entram nesse total.

## Padrões personalizados

Se você guarda instruções em um arquivo que o catálogo não conhece, adicione o glob dele nas configurações do VS Code:

```json
{
  "agentRulesLens.customInstructionPatterns": [
    "**/AI_RULES.md",
    ".ai/rules/**/*.md"
  ]
}
```

Os arquivos correspondentes aparecem em *Possíveis instruções personalizadas*. A configuração apenas pede que esses arquivos sejam acompanhados; ela não faz o Claude, o Cursor nem nenhuma outra ferramenta carregá-los.

## Privacidade e segurança

Tudo roda localmente. Não há requisição de rede, telemetria nem envio de conteúdo para nenhum serviço.

A sidebar da extensão é uma Webview com uma Content-Security-Policy restritiva: `default-src 'none'`, scripts apenas com um nonce gerado a cada render, imagens apenas dos arquivos da própria extensão. As logos são empacotadas, não baixadas.

O dashboard local escuta somente em `127.0.0.1`, exige um token gerado para aquela execução, e a página roda sob `default-src 'self'` sem `unsafe-inline` e sem `unsafe-eval`. O navegador nunca recebe um caminho absoluto: cada linha carrega um identificador opaco que só o servidor sabe resolver, sempre dentro do projeto informado.

## Limitações

- Projetos com várias pastas são analisados apenas na primeira.
- Os formatos apenas detectados não têm aplicabilidade analisada, e arquivos candidatos não têm confirmação de que algum agente os carrega.
- O dashboard local atualiza sob demanda. A extensão, essa sim, observa as mudanças sozinha.
- O dashboard é somente leitura.
- A pré-visualização recusa arquivos acima de 512 KB.
- Diretórios acessados por symlink não são percorridos, então regras que existam apenas por um link não são vistas pelo modo local.
- O idioma escolhido no dashboard vale para o servidor, então abas locais abertas ao mesmo tempo compartilham a mesma escolha.
- As contagens de tokens são estimativas.
- O pacote npm da CLI ainda não foi publicado.
- E a ressalva principal: isto analisa configuração, não o contexto vivo que um agente montou. Os agentes também podem mudar a qualquer momento a forma como carregam instruções.

## Feedback e problemas

Encontrou um formato de instrução que deveria ser reconhecido, uma regra resolvida incorretamente ou algum problema na interface? [Abra uma issue](https://github.com/williamosilva/agent-rules-lens/issues/new).

Ao relatar, informe o agente ou ferramenta, o caminho relevante e o comportamento esperado. Não inclua instruções privadas, código proprietário, credenciais ou outros dados sensíveis do projeto.

## Desenvolvimento

```powershell
npm run check         # typecheck e testes
npm run compile       # bundle da extensão
npm run package       # gera o .vsix
npm run local:build   # bundle do modo local
npm run local:check   # testes do modo local
npm run demo          # abre o dashboard no projeto de exemplo
```

O `F5` abre um Extension Development Host já apontado para `examples/sample-workspace`, que é onde ficam os exemplos de cada formato. Os casos mais difíceis usados pelos testes estão em `test/fixtures/`.

## Licença e marcas

A extensão é distribuída sob a [licença MIT](LICENSE).

As logos pertencem aos seus proprietários e são usadas apenas para identificação. Este projeto não tem vínculo com nenhuma das ferramentas reconhecidas, nem é endossado ou patrocinado por elas. A origem, a licença e a data de obtenção de cada logo estão em [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) e em [`media/icons/agents/sources.json`](media/icons/agents/sources.json). Se você representa um desses projetos e deseja alterar algum asset ou crédito, [abra uma issue](https://github.com/williamosilva/agent-rules-lens/issues/new).
