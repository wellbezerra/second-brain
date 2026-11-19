# Spec 09 — Histórico Git opcional

**Commit:** `feat: histórico Git opcional do vault`
**Depende de:** [07](07-criacao-de-notas.md)
**Decisão de referência:** [ADR 010](../adr/010-git-opcional-e-explicito.md)

## Objetivo

Quando o vault é um repositório Git e o commit automático está ligado, as
escritas feitas pela CLI viram commits com mensagem útil.

É a menor feature do conjunto e a única inteiramente opcional. Vem depois de
tudo que escreve nota, porque é um acréscimo ao `save`, não um pré-requisito
dele.

## Escopo

**Entra:** detecção de repositório, commit após escrita, configuração,
`brain log`.

**Fica de fora:** push, pull, resolução de conflito, inicializar repositório.
O Brain não gerencia Git; ele registra as próprias escritas num Git que já
existe.

## Comportamento

Ativado só quando as duas condições valem:

1. o vault é um repositório Git (há `.git` na raiz ou acima);
2. `git: true` na configuração, ou `--git` na chamada.

O padrão é desligado.

Quando ativo, depois de uma escrita bem-sucedida: `git add` do arquivo afetado
e `git commit` só dele. Nunca `git add -A` — o vault pode ter alterações do
Obsidian que não são deste comando, e varrê-las para dentro de um commit que
diz respeito a outra coisa é apropriar-se de trabalho alheio no histórico.

Mensagens:

| Operação | Mensagem |
|---|---|
| nota nova | `nota: <título>` |
| acréscimo ao diário | `diário: <AAAA-MM-DD>` |
| acréscimo a nota existente | `nota: <título> (acréscimo)` |

`brain index` nunca faz commit. Ele não altera notas, e o índice está no
`.gitignore`.

## Falha nunca perde a nota

Esta é a regra que governa a feature. Quando o commit falha — conflito de
merge, rebase em andamento, hook do usuário barrando, `user.email` não
configurado — a nota **já está gravada no disco**. A falha é um aviso:

```
Nota gravada em Diario/2026-11-19.md
⚠ não consegui fazer o commit: hook pre-commit retornou 1
  A nota está salva; faça o commit manualmente se quiser.
```

Código de saída 0. A operação pedida — salvar a nota — foi concluída.

## `brain log`

```
brain log [-n 20] [--note P]
```

Atalho sobre `git log` restrito ao vault, ou a uma nota. Existe para fechar o
ciclo: se o histórico está sendo criado, deve dar para consultá-lo sem sair da
ferramenta.

Com `--note`, lista as revisões daquele arquivo. Útil para responder "quando
foi que eu mudei de ideia sobre isso".

## Implementação

`subprocess` chamando o `git` do sistema. Sem biblioteca.

O projeto faz quatro operações de Git — `rev-parse`, `add`, `commit`, `log` —
e trazer uma dependência que reimplementa o Git para isso seria desproporcional.
O `git` já está instalado em qualquer máquina que vá usar isto.

Cuidados: nunca interpolar caminho em string de shell (lista de argumentos,
sempre); definir `cwd` na raiz do vault; timeout, para que um hook travado não
pendure a CLI.

## Critérios de aceite

- Vault sem Git: `save` funciona normalmente, sem erro e sem menção a Git.
- Vault com Git e `git: false`: nenhum commit é criado.
- Vault com Git e `git: true`: cada `save` cria exatamente um commit, contendo
  só o arquivo afetado.
- Alterações não relacionadas, pendentes no vault, não entram no commit.
- Commit que falha não impede a gravação da nota, e a saída é 0.
- Caminho com espaço ou acento é tratado corretamente.
- `brain log --note P` lista as revisões daquele arquivo.

## Testes

Repositório Git temporário criado pelo teste, com `user.name` e `user.email`
locais.

Cobrir: commit criado com a mensagem certa; só o arquivo esperado no commit;
arquivo sujo não relacionado permanece fora e continua sujo depois; hook
`pre-commit` que retorna 1 produz aviso e saída 0, com a nota no disco; vault
sem Git não tenta commit.
