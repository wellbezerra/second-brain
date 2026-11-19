# Specs

Uma spec por feature, uma feature por commit. A ordem e as dependências estão
no [ROADMAP](../ROADMAP.md); a visão geral do produto, na [SPEC](../SPEC.md).

| # | Spec | O que entrega |
|---|---|---|
| [01](01-esqueleto-e-configuracao.md) | Esqueleto e configuração | pacote instalável, `brain init` |
| [02](02-leitura-do-vault-e-chunking.md) | Leitura do vault e chunking | varredura e quebra em trechos |
| [03](03-embeddings-locais.md) | Embeddings locais | cliente Ollama, `brain doctor` |
| [04](04-esquema-do-indice.md) | Esquema do índice | SQLite com FTS5 e vetores, `brain status` |
| [05](05-indexacao-incremental.md) | Indexação incremental | `brain index` |
| [06](06-busca-hibrida.md) | Busca híbrida | `brain search` |
| [07](07-criacao-de-notas.md) | Criação de notas | `brain save` |
| [08](08-reconciliacao.md) | Reconciliação | `brain reconcile` |
| [09](09-historico-git.md) | Histórico Git opcional | commit automático, `brain log` |
| [10](10-empacotamento-e-avaliacao.md) | Empacotamento e avaliação | instalação, `brain eval`, CI |

## Formato

Cada spec traz: **objetivo**, **escopo** (o que entra e o que fica de fora),
**design** da feature, **critérios de aceite** e **testes**, mais o commit e as
dependências no cabeçalho.

A seção de escopo é a que mais evita retrabalho. Dizer o que *não* entra num
commit é o que impede a feature de crescer enquanto está sendo escrita.

Spec não é contrato: quando a implementação mostrar que ela estava errada, a
spec é corrigida no mesmo commit que a contradiz. O que não se reescreve é
[ADR](../adr/) aceito — esse se supera com um novo.
