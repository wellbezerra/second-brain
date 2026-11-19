# ADR 001 — CLI local no lugar de servidor MCP

**Status:** aceita · 2026-11-19

## Contexto

O projeto de referência é um servidor MCP remoto, rodando como Cloudflare
Worker, que serve as mesmas notas para Claude Code, Claude web, Claude no
celular e ChatGPT. Quase toda a complexidade daquele projeto — Worker, OAuth,
Durable Object para serializar escrita, fila de indexação, workflow de
reconciliação — existe para resolver **vários clientes remotos escrevendo no
mesmo acervo ao mesmo tempo**.

Meu caso é outro: uma máquina, um usuário, um vault. Não tenho clientes
concorrentes nem acesso remoto nos requisitos.

## Decisão

A interface é uma CLI local, `brain`, executada no mesmo computador onde o
vault está.

Sem servidor, sem porta aberta, sem autenticação. Cada comando abre o índice,
faz o trabalho e fecha.

## Alternativas consideradas

**Manter o MCP.** Rejeitada. Pagaria toda a complexidade de concorrência e de
autenticação para resolver um problema que não tenho. E exigiria um servidor
rodando para a busca funcionar.

**Plugin do Obsidian.** Rejeitada por ora. Prenderia a busca ao editor aberto,
e eu quero chamar a busca de scripts e do terminal. Além disso, desenvolver
plugin é mais lento de iterar do que uma CLI.

**API REST em localhost.** Rejeitada por ora, mas é o próximo passo natural se
eu precisar plugar outras ferramentas. A lógica fica em módulos que não sabem
da CLI, justamente para que uma API — ou um servidor MCP — possa ser uma casca
fina por cima depois.

## Consequências

- Nada de concorrência: um processo por vez, escrita direta no SQLite. Some a
  necessidade de Durable Object, fila e serialização de escrita.
- Nada de autenticação: o controle de acesso é o do sistema de arquivos.
- A busca não existe fora da máquina. Aceito por ora.
- A porta de saída fica aberta: se eu quiser MCP ou HTTP depois, é uma camada
  nova sobre os mesmos módulos, não uma reescrita. Isso é um requisito de
  estrutura, não só uma esperança — a fronteira entre lógica e interface está
  especificada na [spec 01](../specs/01-esqueleto-e-configuracao.md).
