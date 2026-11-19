# Spec 02 — Leitura do vault e chunking de Markdown

**Commit:** `feat: leitura do vault e chunking de Markdown`
**Depende de:** [01](01-esqueleto-e-configuracao.md)
**Decisão de referência:** [ADR 008](../adr/008-chunking-guiado-por-headings.md)

## Objetivo

Transformar uma pasta de arquivos `.md` numa lista de trechos prontos para
indexar. Esta feature é pura: lê arquivos, devolve estruturas de dados, não
toca em banco nem em rede.

É a parte mais testável do projeto e a que mais afeta a qualidade da busca, o
que justifica ela vir cedo e sozinha.

## Escopo

**Entra:** varredura do vault, leitura de nota, frontmatter, quebra em trechos,
caminho de headings.

**Fica de fora:** hash e manifesto (spec 05), embeddings (spec 03), gravação.

## Módulos

- `vault.ts` — varrer o vault, ler uma nota, extrair título.
- `chunk.ts` — quebrar o texto em trechos.
- `markdown.ts` — o que os dois compartilham: cercas de código e headings.

## Varredura

Percorre o vault recursivamente atrás de `.md`. Pula:

- qualquer caminho que passe por uma pasta da lista de exclusões
- pastas e arquivos ocultos (começando com `.`)
- links simbólicos, para não correr risco de ciclo
- arquivos ilegíveis, que viram aviso, não interrupção

Devolve caminhos **relativos à raiz do vault**, em ordem estável. O manifesto
guarda caminho relativo para que mover o vault não invalide o índice.

O separador é sempre `/`, inclusive no Windows, e a ordem é por unidade de
código (não por locale) — assim o mesmo vault produz o mesmo manifesto em
qualquer máquina. A extensão `.md` é reconhecida sem diferenciar maiúsculas.
Uma exclusão casa com o nome da pasta em qualquer profundidade ou com o
caminho relativo inteiro (`Arquivo/Velho`).

Ao ler, BOM é removido e `\r\n` vira `\n`.

## Título da nota

Na ordem: campo `title` do frontmatter, primeiro heading `#` do corpo, nome do
arquivo sem extensão.

O título prefixa o caminho de headings de todo trecho da nota, o que dá
contexto a trechos que não estão sob nenhum heading.

## Frontmatter

Parsing deliberadamente raso: só pares `chave: valor` de primeiro nível,
delimitados por `---` na primeira linha e numa linha seguinte.

Não quero YAML como dependência para ler um título e umas tags. Lista e bloco
aninhado são ignorados sem erro. Se o delimitador de fechamento não existe, o
arquivo inteiro é tratado como corpo.

O frontmatter **não** entra no texto indexado.

## Quebra em trechos

Alvo de 1.200 caracteres, sobreposição de 150, mínimo de 60. Constantes do
módulo, não configuração — mudá-las invalida a comparação entre índices.

Algoritmo:

1. Separa frontmatter do corpo.
2. Percorre o corpo acumulando o caminho de headings corrente. Um heading fecha
   a seção anterior e abre outra. **`#` dentro de bloco de código não é
   heading** — o estado de "dentro de fence" precisa ser rastreado.
3. Cada seção vira um ou mais trechos:
   - abaixo do alvo: um trecho;
   - acima: reparte por parágrafo, com sobreposição;
   - parágrafo que sozinho estoura o alvo: reparte por sentença;
   - bloco de código conta como um parágrafo, e nunca é repartido por
     sentença (um `.` em código não termina nada);
   - sentença ou bloco que ainda estoura: corta no espaço — de preferência
     numa quebra de linha — mais próximo do alvo, e só no meio de uma palavra
     se não houver espaço nenhum.

   Com isso nenhum trecho passa de 1.200 caracteres. A sobreposição é a cauda
   do trecho anterior, começando no início de uma palavra, e encolhe quando o
   pedaço seguinte não deixaria espaço para ela.
4. Monta o heading final como `título > h1 > h2 > ...`, descartando níveis
   vazios (uma nota que pula de `#` para `###`). Se o primeiro nível é igual
   ao título — o caso comum, em que o título veio do próprio `#` —, ele não
   se repete: `Diário > Ação`, não `Diário > Diário > Ação`.
5. Descarta trechos abaixo do mínimo, **exceto** quando a nota não geraria
   nenhum trecho — nota curta precisa continuar buscável.

O texto que vai ao modelo de embedding é `heading + "\n\n" + texto`; o heading
também vai para uma coluna própria do FTS5.

## Critérios de aceite

- Nota sem heading gera ao menos um trecho, com o título como heading.
- Nota com headings aninhados produz caminho completo no trecho mais profundo.
- `#` dentro de ```` ``` ```` não quebra a nota.
- Nota vazia ou só com frontmatter gera zero trechos, sem erro.
- Nota de 10.000 caracteres sem parágrafo nenhum é repartida mesmo assim.
- Caminhos devolvidos são relativos e estáveis entre execuções.
- `.obsidian/`, `.brain/` e `.git/` nunca aparecem na varredura.

## Testes

Um vault de exemplo em `tests/fixtures/vault/` cobrindo: nota simples, nota com
headings aninhados, nota com bloco de código contendo `#`, nota só com
frontmatter, nota sem frontmatter, nota longa, nota com acentuação, nota dentro
de `.obsidian/` que deve ser ignorada.

Testes de propriedade que valem a pena:

- concatenar os trechos de uma nota recupera todo o conteúdo significativo
  (descontada a sobreposição);
- nenhum trecho excede o alvo em mais que o maior parágrafo indivisível;
- a quebra é determinística: mesma entrada, mesma saída.
