# Agent Rules Lens

[English](README.md) | Português

[Repositório](https://github.com/williamosilva/Agent-Rules-Lens) · [Issues](https://github.com/williamosilva/Agent-Rules-Lens/issues)

Veja quais arquivos de instruções de IA valem para o código que você está editando.

Um mesmo repositório pode ter `AGENTS.md`, regras do Claude, regras do Cursor, instruções do Copilot e configurações de outros agentes ao mesmo tempo. O Agent Rules Lens reúne tudo isso em uma sidebar do VS Code e explica por que cada arquivo se aplica ao que você abriu — ou por que não se aplica.

![Sidebar do Agent Rules Lens mostrando os arquivos de instruções de IA aplicáveis a um arquivo TypeScript aberto](docs/images/agent-rules-lens.png)

## O problema

Os arquivos de instruções ficam espalhados e o escopo de cada um não é óbvio. O `AGENTS.md` desce pela hierarquia de diretórios. Um arquivo em `.claude/rules/` pode ter ou não um filtro `paths`. Um `.mdc` do Cursor muda de comportamento conforme três campos do frontmatter. O Copilot separa as instruções do repositório inteiro daquelas por glob.

Abra `src/backend/order.service.ts` e uma pergunta simples fica difícil: qual desses arquivos vale agora, e qual deles ganha quando dois cobrem o mesmo diretório?

## O que aparece no painel

A extensão encontra os arquivos de instruções que conhece, lê apenas os campos que cada formato documenta e compara esses escopos com o caminho aberto.

A sidebar agrupa o resultado por ferramenta. Cada seção traz a logo e uma contagem; cada regra ocupa duas linhas — nome do arquivo e estimativa de tokens, depois o estado e o motivo dele:

```
▾ CLAUDE                                3 aplicáveis
    global-style.md                            ~40
    ● Aplicação automática · Sempre se aplica

    typescript.md                              ~20
    ● Aplicação automática · Corresponde a **/*.ts
```

Depois vêm os avisos e três seções que começam recolhidas: regras entendidas que não se aplicam, configurações de outros agentes e arquivos que parecem instruções escritas à mão. Clicar em uma linha abre o arquivo; clicar em um aviso abre na linha indicada.

## O que a extensão faz — e o que ela não faz

O Agent Rules Lens analisa arquivos que estão no repositório. Ele não inspeciona o contexto privado e em execução do Claude, do Cursor, do Copilot ou de qualquer outro agente.

Quando ele diz que uma regra se aplica, isso vem de um caminho documentado, de uma hierarquia de diretórios, de um glob ou de um metadado que ele sabe interpretar. Ele nunca deduz pelo nome do arquivo e nunca lê o texto da regra para julgar relevância.

Isso faz diferença na prática. Um `typescript.md` sem o campo `paths` vale para todos os arquivos, inclusive os de Python. Uma regra do Cursor chamada `frontend.mdc` cujos globs apontam para `src/backend/**` vale para o backend. O nome não é evidência.

## Um exemplo concreto

Com `src/backend/order.service.ts` aberto, a sidebar pode listar o `AGENTS.md` da raiz como padrão do projeto, o `src/backend/AGENTS.override.md` substituindo o `AGENTS.md` ao lado dele, uma regra do Claude que corresponde a `**/*.ts`, uma regra do Cursor com `alwaysApply: true` e as instruções do Copilot para o repositório inteiro.

O `src/backend/AGENTS.md` que o override substituiu vai para *Não se aplica a este arquivo*, com o motivo: *Substituído pela regra do diretório*.

Um `GEMINI.md` no mesmo repositório aparece em *Outras configurações de agentes*. A extensão sabe a qual ferramenta ele pertence e nada além disso, então não afirma se ele se aplica.

## Funcionalidades

- A análise acompanha o editor ativo e é refeita quando arquivos de regras ou configurações mudam.
- Um motivo em cada linha: `Padrão do projeto`, `Regra do diretório`, `Corresponde a **/*.ts`, `Sempre se aplica`.
- Seis resultados em vez de um sim ou não, incluindo *não foi possível determinar* quando um campo está malformado.
- Avisos para metadados inutilizáveis, campos de frontmatter não suportados e importações `@caminho` do Claude que apontam para lugar nenhum.
- Estimativa aproximada de tokens por regra e por formato.
- Português e inglês, pelo seletor `PT | EN` no cabeçalho.
- Logos empacotadas, temas claro e escuro, e um layout que sobrevive a uma sidebar estreita.

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

**Detectado** significa que o arquivo foi reconhecido e atribuído a uma ferramenta. **Aplicabilidade avaliada** significa que a extensão implementa as regras de resolução documentadas daquele formato. Um formato apenas detectado fica fora da contagem principal até ter resolução: "encontramos suas regras do Windsurf" é honesto, "estas regras do Windsurf se aplicam aqui" não seria.

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

Só as regras com *aplicação automática* entram na contagem do cabeçalho e no total de tokens.

## Tokens

O número de tokens é uma estimativa grosseira: um token a cada quatro caracteres do corpo da regra, sem tokenizer de verdade. Serve para dar noção de tamanho, não para prever cobrança. E não é uma única janela de contexto — cada formato é lido pelo seu próprio agente, então os números por formato dizem mais do que a soma. Detectados e candidatos não entram nesse total.

## Instalação

A extensão não está publicada no Marketplace, então a instalação é pelo `.vsix`.

```bash
npm run package
code --install-extension agent-rules-lens-0.1.0.vsix
```

O `npm run package` gera o arquivo na raiz do projeto; ele não é versionado. Pela aba de extensões também funciona: menu `...` → **Install from VSIX...**.

## Como usar

Abra uma pasta e um arquivo de código, depois clique no ícone do Agent Rules Lens na Activity Bar. A sidebar acompanha o arquivo em foco. Clique em uma regra para abri-la, ou em um aviso para ir à linha indicada. Use o `PT | EN` do cabeçalho para trocar de idioma.

## Padrões personalizados

Se você guarda instruções em um arquivo que o catálogo não conhece, adicione o glob dele:

```json
{
  "agentRulesLens.customInstructionPatterns": [
    "**/AI_RULES.md",
    ".ai/rules/**/*.md"
  ]
}
```

Os arquivos correspondentes aparecem em *Possíveis instruções personalizadas*, com a marcação `Declarado pelo usuário · carregamento não verificado`.

A configuração apenas pede ao Lens que acompanhe esses arquivos. Ela não faz o Claude, o Cursor nem nenhuma outra ferramenta carregá-los. Caminhos absolutos e caminhos que saem do projeto são ignorados, com um registro no canal de saída.

## Privacidade e segurança

Tudo roda localmente, sobre o projeto aberto. A extensão não faz requisições de rede e não envia nada para nenhum serviço de IA.

A sidebar é uma Webview com uma Content-Security-Policy restritiva: `default-src 'none'`, scripts apenas com um nonce gerado a cada render, imagens apenas dos arquivos da própria extensão. As logos são empacotadas, não baixadas, e todo caminho que a Webview pede para abrir é validado contra a análise atual.

## Limitações atuais

Só os quatro formatos marcados acima têm resolução completa. Todo o resto é detectado, e a aplicabilidade fica deliberadamente sem avaliação. Arquivos candidatos não têm confirmação de que algum agente os carrega. As contagens de tokens são estimativas.

Projetos com várias pastas analisam apenas a primeira. Nomes de arquivo alternativos configuráveis não são adivinhados.

O seletor `PT | EN` troca a sidebar e as mensagens na hora. Títulos de comandos e a descrição da configuração vêm do `package.nls.json` e seguem o idioma do próprio VS Code, então esses exigem recarregar a janela.

E a ressalva principal: isto analisa configuração, não o contexto vivo que um agente montou. Os agentes também podem mudar a qualquer momento a forma como carregam instruções.

## Feedback e problemas

Encontrou um formato de instrução que deveria ser reconhecido, uma regra resolvida incorretamente ou algum problema na sidebar? [Abra uma issue](https://github.com/williamosilva/Agent-Rules-Lens/issues/new).

Ao relatar um problema, informe o agente ou ferramenta, o caminho relevante e o comportamento esperado. Não inclua instruções privadas, código proprietário, credenciais ou outros dados sensíveis do projeto.

## Desenvolvimento

```bash
git clone https://github.com/williamosilva/Agent-Rules-Lens.git
cd Agent-Rules-Lens
npm install
```

Depois, na raiz do projeto:

```bash
npm run check      # typecheck e testes
npm run compile    # bundle em dist/
npm run package    # gera o .vsix
```

O `F5` abre um Extension Development Host em `examples/sample-workspace`, que tem um exemplo de cada coisa: uma regra aplicável, um override, um `GEMINI.md` apenas detectado, um `AI_RULES.md` candidato e a definição de um agente que jamais deve aparecer como regra. Os casos mais difíceis ficam em `test/fixtures/`.

## Arquitetura

```
catálogo → descoberta → parsing → resolução → view model → webview
```

O catálogo declara todos os padrões de arquivo e a ferramenta dona de cada um. A descoberta encontra esses arquivos; os parsers leem apenas os campos de frontmatter que cada formato documenta; o resolver compara o resultado com o arquivo aberto e atribui um status; o view model transforma isso em textos prontos e traduzidos. A Webview renderiza e não decide nada.

Catálogo, parsers, resolver e view model não importam a API do `vscode` — é isso que permite testá-los diretamente.

## Licença e marcas

A extensão usa a licença MIT; veja o arquivo `LICENSE`.

As logos pertencem aos seus proprietários e são usadas apenas para identificação. Este projeto não tem vínculo com nenhuma das ferramentas reconhecidas, nem é endossado ou patrocinado por elas. A origem, a licença e a data de obtenção de cada logo estão em [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) e em `media/icons/agents/sources.json`. Se você representa um desses projetos e deseja alterar algum asset ou crédito, [abra uma issue](https://github.com/williamosilva/Agent-Rules-Lens/issues/new).
