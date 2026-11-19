---
title: Projeto Alfa
tags: [arquitetura, decisoes]
autor: "Wellington"
---

Introdução do projeto, antes de qualquer heading, explicando o contexto geral.

# Arquitetura

Visão geral da arquitetura: componentes, fronteiras e responsabilidades principais.

## Decisões

### Qdrant

Rejeitada pelo custo de manter um processo rodando e um segundo armazenamento em sincronia.

## Riscos

O maior risco é a latência da busca vetorial quando o vault crescer além do previsto.
