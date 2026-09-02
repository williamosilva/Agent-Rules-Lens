# Agent Rules Lens

Português | [English](README.en.md)

[Repositório](https://github.com/williamosilva/Agent-Rules-Lens) · [Issues](https://github.com/williamosilva/Agent-Rules-Lens/issues)

Veja quais arquivos de instruções de IA valem para o arquivo que você está editando.

Um mesmo projeto pode ter `AGENTS.md`, regras do Claude, regras do Cursor e instruções do Copilot ao mesmo tempo. Cada formato tem um escopo diferente: uns descem pela hierarquia de diretórios, outros dependem de um glob no frontmatter, outros valem para o repositório inteiro. Abra `src/backend/order.service.ts` e responder "qual desses arquivos se aplica agora?" já dá trabalho.

O Agent Rules Lens reúne esses arquivos e diz, para o arquivo escolhido, quais se aplicam e por quê.

![Sidebar do Agent Rules Lens mostrando os arquivos de instruções aplicáveis a um arquivo TypeScript aberto](docs/images/agent-rules-lens.png)

## O que ele afirma e o que apenas detecta

Quando ele diz que uma regra se aplica, isso vem de um caminho documentado, de uma hierarquia de diretórios, de um glob ou de um metadado que ele sabe interpretar. Ele nunca deduz pelo nome do arquivo e nunca lê o texto da regra para julgar relevância.

Um `typescript.md` sem o campo `paths` vale para todos os arquivos, inclusive os de Python. Uma regra do Cursor chamada `frontend.mdc` cujos globs apontam para `src/backend/**` vale para o backend. O nome não é evidência.

Formatos de outras ferramentas são **detectados** e listados, mas sem nenhuma afirmação sobre aplicabilidade — porque a resolução deles ainda não está implementada. Dizer "encontramos suas regras do Windsurf" é honesto; dizer "estas regras do Windsurf se aplicam aqui" não seria.

Ele analisa os arquivos de configuração que estão no projeto. Não inspeciona o contexto interno e em execução do Claude, do Cursor, do Copilot ou de qualquer outro agente.

## Como você quer usar?

| Quero | Opção |
| --- | --- |
| Ver as regras dentro do VS Code | Extensão |
| Analisar um projeto pelo navegador | Dashboard local com `arl` |
| Testar sem usar um projeto próprio | Workspace de demonstração |
| Integrar a análise em outro processo | Saída JSON |

São duas coisas independentes:

- `npm run install:local` **instala a extensão compilada no VS Code**. Depois disso a sidebar existe em todos os projetos que você abrir, e ela acompanha sozinha o workspace e o arquivo em edição.
- `arl` **abre um dashboard no navegador** para a pasta em que o terminal está. É um processo separado e não depende da extensão estar instalada.

Nenhum dos dois precisa do outro.

## Usar a extensão no VS Code

Ela ainda não está publicada no Marketplace, então a instalação sai do repositório:

```powershell
git clone https://github.com/williamosilva/Agent-Rules-Lens.git
cd Agent-Rules-Lens
npm install
npm run install:local
```

Depois, no VS Code:

```text
Ctrl + Shift + P
Developer: Reload Window
```

A partir daí a sidebar fica disponível em qualquer projeto que você abrir. Clique no ícone do Agent Rules Lens na Activity Bar: ela acompanha o arquivo em foco, então trocar de aba refaz a comparação. Clicar em uma regra abre o arquivo; clicar em um aviso vai até a linha indicada. O `PT | EN` do cabeçalho troca o idioma.

## Usar o dashboard local no navegador

```powershell
git clone https://github.com/williamosilva/Agent-Rules-Lens.git
cd Agent-Rules-Lens
npm install
npm run local:link
```

O `npm run local:link` disponibiliza o comando `arl` na sua máquina. Depois, no projeto que você quer analisar:

```powershell
cd C:\caminho\do\projeto
arl
```

![Dashboard local do Agent Rules Lens analisando um arquivo do workspace de demonstração](docs/images/local-dashboard.png)

Casos que funcionam:

```powershell
arl                          # analisa a pasta atual
arl src\app.ts               # já abre com esse arquivo selecionado
arl ..\outro-projeto         # analisa outro projeto
arl --json src\app.ts        # imprime a análise e encerra
arl --locale pt-BR           # interface em português
arl --locale en              # interface em inglês
arl --no-open                # não abre o navegador
arl --help
```

O que vale saber:

- o `arl` usa a pasta atual como projeto, então normalmente não é preciso informar nada;
- um arquivo pode ser passado direto para já abrir analisado;
- o navegador abre automaticamente, a menos que você use `--no-open`;
- `Ctrl+C` encerra o servidor;
- tudo roda em `127.0.0.1`, e nenhum arquivo é enviado para serviço externo.

Também existe `--workspace` e `--file` para casos em que o padrão não serve, e `--port` para fixar a porta.

A distribuição pelo npm está sendo preparada. Enquanto isso, o caminho é o clone acima.

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

O workspace de demonstração tem exemplos intencionais de `AGENTS.md`, `AGENTS.override.md`, Claude, Cursor e GitHub Copilot, além de um aviso de import ausente, uma configuração apenas detectada e um arquivo que parece instrução personalizada. Eles existem para mostrar cada caso de uma vez — um projeto real não precisa de nada disso.

## Formatos suportados

| Formato | Detectado | Aplicabilidade avaliada |
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

**Detectado** significa que o arquivo foi reconhecido e atribuído a uma ferramenta. **Aplicabilidade avaliada** significa que as regras de resolução documentadas daquele formato estão implementadas. Um formato apenas detectado fica fora da contagem principal.

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

O número de tokens é uma estimativa grosseira: um token a cada quatro caracteres do corpo da regra, sem tokenizer de verdade. Serve para dar noção de tamanho, não para prever cobrança. E não é uma única janela de contexto — cada formato é lido pelo seu próprio agente, então os números por formato dizem mais do que a soma. Detectados e candidatos não entram nesse total.

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

O dashboard local escuta somente em `127.0.0.1`, exige um token gerado para aquela execução, e a página roda sob `default-src 'self'` sem `unsafe-inline` e sem `unsafe-eval`. O navegador nunca recebe um caminho absoluto: cada linha carrega um identificador opaco que só o servidor sabe resolver, e sempre dentro do projeto informado.

## Limitações

- Projetos com várias pastas são analisados apenas na primeira.
- Os formatos apenas detectados não têm aplicabilidade avaliada, e arquivos candidatos não têm confirmação de que algum agente os carrega.
- O dashboard local atualiza sob demanda: use **Atualizar** depois de mudar um arquivo de regras. A extensão, essa sim, observa as mudanças sozinha.
- O dashboard é somente leitura. Clicar em uma regra abre uma pré-visualização na própria página, não um editor.
- A pré-visualização recusa arquivos acima de 512 KB.
- Diretórios acessados por symlink não são percorridos, então regras que existam apenas por um link não são vistas pelo modo local.
- O idioma escolhido no dashboard vale para o servidor, então abas locais abertas ao mesmo tempo compartilham a mesma escolha.
- As contagens de tokens são estimativas.
- O pacote npm ainda não foi publicado, e a extensão ainda não está no Marketplace.
- E a ressalva principal: isto analisa configuração, não o contexto vivo que um agente montou. Os agentes também podem mudar a qualquer momento a forma como carregam instruções.

## Feedback e problemas

Encontrou um formato de instrução que deveria ser reconhecido, uma regra resolvida incorretamente ou algum problema na interface? [Abra uma issue](https://github.com/williamosilva/Agent-Rules-Lens/issues/new).

Ao relatar, informe o agente ou ferramenta, o caminho relevante e o comportamento esperado. Não inclua instruções privadas, código proprietário, credenciais ou outros dados sensíveis do projeto.

## Desenvolvimento

```powershell
npm run check         # typecheck e testes
npm run compile       # bundle da extensão
npm run package       # gera o .vsix
npm run local:build   # bundle do modo local
npm run local:check   # testes do modo local
npm run demo          # abre o dashboard na sample workspace
```

O `F5` abre um Extension Development Host já apontado para `examples/sample-workspace`, que é onde ficam os exemplos de cada formato. Os casos mais difíceis usados pelos testes estão em `test/fixtures/`.

## Licença e marcas

A extensão usa a licença MIT; veja o arquivo `LICENSE`.

As logos pertencem aos seus proprietários e são usadas apenas para identificação. Este projeto não tem vínculo com nenhuma das ferramentas reconhecidas, nem é endossado ou patrocinado por elas. A origem, a licença e a data de obtenção de cada logo estão em [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) e em `media/icons/agents/sources.json`. Se você representa um desses projetos e deseja alterar algum asset ou crédito, [abra uma issue](https://github.com/williamosilva/Agent-Rules-Lens/issues/new).
