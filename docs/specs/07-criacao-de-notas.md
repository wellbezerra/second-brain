# Spec 07 — Criação de notas pela CLI

**Commit:** `feat: criação de notas pela CLI`
**Depende de:** [05](05-indexacao-incremental.md)
**Decisão de referência:** [ADR 002](../adr/002-vault-como-fonte-de-verdade.md)

## Objetivo

Capturar uma ideia sem abrir o Obsidian. O atrito entre ter o pensamento e
registrá-lo é o que determina se o segundo cérebro é alimentado ou abandonado,
então o caminho precisa ser um comando curto.

## Escopo

**Entra:** `brain save`, diário por data, notas nomeadas, entrada por stdin,
indexação imediata do que foi escrito.

**Fica de fora:** editar nota existente (o Obsidian faz isso), apagar nota,
commit em Git (spec 09).

## Interface

```
brain save "texto da ideia" [--tag t]... [--title T] [--note P] [--open]
echo "texto" | brain save
brain save            # sem argumento e sem pipe: abre o $EDITOR
```

Três destinos, nesta ordem de precedência:

1. `--note Projetos/brain.md` — acrescenta ao fim do arquivo indicado,
   criando-o se não existir.
2. `--title "Decisão sobre fila"` — cria uma nota nova com esse título,
   em caminho derivado do título.
3. padrão — acrescenta à nota do dia, `Diario/AAAA-MM-DD.md`.

O diário como padrão é deliberado: captura rápida não deveria exigir decidir
onde a coisa mora. Organizar depois, no Obsidian, é barato; decidir na hora da
captura é o atrito que mata o hábito.

## Formato do que é escrito

Nota nova recebe frontmatter mínimo:

```markdown
---
title: Decisão sobre fila
created: 2026-11-19T09:30:00-03:00
tags: [arquitetura, sqlite]
---

texto da ideia
```

Acréscimo a nota existente entra como uma seção nova, com horário:

```markdown

## 09:30

texto da ideia
```

O frontmatter existente nunca é reescrito. Acrescentar é acrescentar ao fim do
corpo — reescrever o cabeçalho de um arquivo que o Obsidian também edita é
convite a conflito.

## Caminho derivado do título

Slug do título: minúsculas, acentos removidos, não-alfanuméricos viram hífen,
hífens repetidos colapsam. `Decisão sobre fila` vira `decisao-sobre-fila.md`.

Colisão não sobrescreve. Acrescenta sufixo numérico: `-2`, `-3`. Perder uma
nota existente porque o título repetiu seria o pior defeito possível numa
ferramenta cujo propósito é guardar coisas.

## Segurança do caminho

`--note` recebe caminho do usuário, então precisa ser validado: resolvido
contra a raiz do vault e recusado se cair fora dela. `--note ../../etc/algo`
é erro, não escrita.

## Indexação

Depois de gravar, a nota afetada é indexada na hora — só ela, não o vault
inteiro. Quem salvou acabou de criar a informação e pode querer buscá-la em
seguida; esperar o próximo `brain index` seria surpreendente.

Se a indexação falhar (Ollama fora do ar), **a nota permanece gravada** e o
comando avisa que ficará fora da busca até a próxima indexação. A nota é o que
importa; o índice é derivado e reconstruível.

## Critérios de aceite

- `brain save "x"` sem configuração prévia de diário cria `Diario/` e a nota
  do dia.
- Dois `save` no mesmo dia produzem duas seções no mesmo arquivo.
- `--title` com acento gera slug sem acento.
- Título que colide gera `-2`, sem tocar no arquivo existente.
- `--note` fora do vault é recusado.
- Pipe por stdin funciona; texto vazio é recusado com mensagem.
- Sem argumento e sem pipe, abre `$EDITOR`; sair sem salvar aborta sem criar
  arquivo.
- Com o Ollama fora do ar, a nota é gravada e o aviso aparece.
- Depois do `save`, `brain search` encontra o texto.

## Testes

Vault temporário. Cobrir: criação de diário, acréscimo ao diário existente,
slug com acentuação e pontuação, colisão de nome, escape do vault por `..`,
stdin vazio, falha do embedder durante o `save`.

O teste de `..` merece ser explícito e nominal: é a única entrada do usuário
que vira caminho de arquivo em todo o projeto.
