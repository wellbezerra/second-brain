# ADR 010 — Git opcional e explícito

**Status:** aceita · 2026-11-19

## Contexto

No projeto original, toda alteração vira um commit automático — é o que dá
histórico e permite desfazer. Aqui o vault é uma pasta local, e Git sobre ela é
uma escolha, não uma consequência da arquitetura.

Há uma tensão real: commit automático a cada nota salva produz um histórico
granular, mas polui o log com centenas de commits de uma linha e atrapalha se
eu quiser usar o Git do vault para outra coisa.

## Decisão

O vault **pode** ser um repositório Git. O Brain não exige isso e não inicializa
nada sozinho.

Quando o vault é um repositório e o commit automático está ligado na
configuração (`git: true`, desligado por padrão), os comandos que escrevem
notas fazem commit das alterações, com mensagem derivada da operação.

O `brain index` nunca faz commit: ele não altera notas, só o índice, e o índice
está no `.gitignore`.

## Alternativas consideradas

**Commit automático sempre, como no original.** Rejeitada como padrão. Lá o
commit é a única forma de histórico num acervo remoto compartilhado. Aqui eu
tenho Time Machine, snapshot do sistema de arquivos e o histórico de versões do
próprio Obsidian. O commit vira redundante e barulhento.

**Não tocar em Git de jeito nenhum.** Rejeitada. Dá para automatizar por fora
com um hook ou um cron, mas aí a mensagem de commit perde o contexto da
operação: "atualização automática" em vez de "nota: sqlite-vec e cosseno".

**Agrupar commits por sessão ou por dia.** Rejeitada por ora. Precisaria
rastrear o início de uma sessão sem daemon, o que não cabe no desenho atual.

## Consequências

- Quem não quer Git não paga nada por ele: o padrão é desligado, e nenhum
  comando falha por ausência de repositório.
- O histórico, quando ligado, é granular e com mensagem útil.
- `.brain/` precisa estar no `.gitignore`, senão cada indexação sujaria o
  repositório com um binário grande. O `brain init` escreve essa linha, e
  avisa se não conseguiu.
- Operações de Git podem falhar por motivos alheios ao Brain: conflito de
  merge, repositório em estado de rebase, hook do próprio usuário barrando o
  commit. A nota **já foi gravada** nesse ponto, então a falha de commit é um
  aviso, nunca um erro que descarte o trabalho.
- Sync entre máquinas por Git fica viável depois, sem mudança de desenho —
  mas está fora do escopo agora ([SPEC](../SPEC.md), "O que o Brain não é").
