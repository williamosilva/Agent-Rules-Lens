# Agent Rules Lens — CLI

See which AI instruction files apply to a file in your project.

A repository can carry `AGENTS.md`, Claude rules, Cursor rules and Copilot
instructions at the same time. This command opens a small dashboard on
`127.0.0.1` that lists them and explains why each one matches the file you pick.

```bash
arl                       # analyse the current directory
arl src/app.ts            # start with one file selected
arl ../other-project      # analyse another project
arl src/app.ts --json     # print the analysis and exit
arl --help
```

Options: `--workspace`, `--file`, `--port`, `--no-open`, `--locale pt-BR|en`,
`--json`, `--version`, `--help`.

Everything runs locally. The server binds to `127.0.0.1`, requires a token
generated for that run, reads only inside the directory you point it at, and
makes no network requests. The dashboard is read-only: clicking a rule opens a
preview in the page rather than an editor.

There is also a VS Code extension that follows the file you have open. Both
share the same catalog, parsers and resolver, so a rule cannot resolve
differently between them.

Interface in English and Brazilian Portuguese. Node 18 or newer.

Documentation, the extension and the issue tracker:
<https://github.com/williamosilva/Agent-Rules-Lens>

Distributed under the [MIT License](LICENSE). Tool marks belong to their owners
and are included for identification only; see
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
