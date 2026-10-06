# Carrossel Hero Banner Estilo Netflix & Ordenação Recente no Continuar Assistindo

Implementação da ordenação estritamente cronológica na seção "Continuar Assistindo" (do mais recentemente assistido para o mais antigo, com avanço inteligente para o próximo episódio ao terminar) e evolução do Hero Banner para um carrossel dinâmico estilo Netflix com até 5 destaques (priorizando os mais assistidos/recentes do usuário), troca automática a cada 7 segundos com pausa sob interação, indicadores elegantes e controles de navegação sem alterar a identidade visual.

## Decisões Confirmadas do Usuário

> [!IMPORTANT]
> As seguintes escolhas de experiência de uso foram alinhadas e confirmadas:

- **Tempo de rotação do Carrossel**: 7 segundos com troca suave e indicadores de progresso estilo Netflix (barras/traços discretos). Pausa automática ao passar o mouse ou interagir para não interromper a leitura.
- **Comportamento ao Concluir Episódio**: Quando o usuário finaliza um episódio (marcado como assistido ou assistido até o fim), o sistema identifica e posiciona automaticamente o **próximo episódio não assistido** da série no topo da fila do "Continuar Assistindo" com o timestamp mais recente.
- **Preenchimento dos 5 Slides do Hero**: O carrossel exibirá até 5 mídias. O slide 1 é sempre a mídia vista mais recentemente; as demais posições priorizam os títulos mais assistidos/em andamento do usuário. Caso o usuário tenha menos de 5 mídias no histórico, os slots restantes são preenchidos com os filmes e séries mais populares ou recentes da biblioteca.
- **Incremento de Versão**: Atualização da versão do CineLocal de `v1.4.2` para `v1.4.3`.

---

## 1. Visão Geral & Conceito Principal

- **O que faz**:
  1. **Ordenação Fidedigna do Continuar Assistindo**: Garante que qualquer interação de reprodução ou atualização de progresso registre timestamp exato (`lastWatchedAt`). O item assistido há poucos segundos sempre salta imediatamente para a primeira posição da fileira horizontal.
  2. **Avanço Automático de Episódio na Fila**: Séries cujo episódio atual foi concluído não desaparecem nem ficam estagnadas: o próximo episódio inédito (ex: S01E02 após S01E01) surge instantaneamente pronto para o play.
  3. **Carrossel Hero Banner Netflix-Grade**: Transforma o Hero Banner único em um carrossel rotativo de até 5 mídias, preservando 100% da tipografia, logos oficiais em alta resolução, metadados com marcadores discretos (`·`), botões de play e informações, agregando:
     - Indicadores de paginação lineares no canto inferior ou superior direito.
     - Botões sutis de navegação anterior/próximo que surgem no hover ou toque.
     - Suporte a swipe em telas touch/mobile para máxima fluidez.
     - Animação crossfade suave entre os backdrops e textos sem pulos de layout.

---

## 2. Experiência do Usuário & Design Visual

### Fluxos Chave
1. **Assistindo & Retornando**: O usuário assiste a um episódio ou filme no player. Ao pausar ou terminar, ao voltar para a Home, essa mídia estará no primeiríssimo lugar do "Continuar Assistindo" e será o primeiro slide (Slide 1/5) do Hero Banner.
2. **Navegação no Hero**:
   - O carrossel faz a transição a cada 7 segundos com animação sutil de fade-in/fade-out e escala leve no backdrop.
   - O usuário pode clicar nos indicadores de slide (barras horizontais) para pular para qualquer um dos 5 destaques.
   - Passar o mouse sobre o banner (ou segurar no mobile) pausa a contagem regressiva para leitura confortável da sinopse.
   - Setas discretas nas laterais permitem navegação manual imediata.
   - O botão "Continuar Assistindo" ou "Assistir" inicia diretamente o episódio correto daquele slide.

### Diretrizes de Anti-Slop & Design Preservado
- **Zero-Pill**: Sem cápsulas estáticas ou contornos artificiais nos metadados. O estilo atual já consagrado (ponto tipográfico `·`, classificação com nota ou resolução nítida) permanece idêntico.
- **Contraste & Scrim Cinematográfico**: Gradientes escuros inferiores e laterais (`from-[#141414] via-black/50 to-transparent`) mantidos para legibilidade perfeita sobre qualquer foto de fundo.
- **Ergonomia Mobile**: Hitboxes de botões e setas $\ge 44\text{px}$, suporte a gestos de deslize lateral (swipe), layout adaptável para smartphones sem quebra de texto.

---

## 3. Decisões de Produto & Arquitetura de Dados

### 1. Garantia de Timestamps em Todas as Mutações
- **Situação Anterior**: O endpoint `/api/library/mark-watched` e ações manuais de toggle watch nem sempre gravavam `media.lastWatchedAt` ou `episode.lastWatchedAt` com consistência.
- **Abordagem Adotada**: 
  - Centralizar a escrita de `lastWatchedAt = new Date().toISOString()` em `updateEpisodeProgress`, `toggleEpisodeWatched` e na API local.
  - No cliente (`App.tsx`), ordenar `continueWatchingItems` por `Math.max(media.lastWatchedAt, episode.lastWatchedAt)` em ordem decrescente (`b - a`).
  - Ao concluir um episódio, localizar sequencialmente o próximo episódio da mesma temporada ou da temporada seguinte e apontá-lo como o alvo de continuação.

### 2. Algoritmo de Seleção dos 5 Itens do Hero
- **Slide 1**: Sempre o item com `lastWatchedAt` mais recente.
- **Slides 2 a 5**:
  - Outros itens com histórico recente / em andamento (ordenados por atividade recente e percentual assistido).
  - Se houver menos de 5 itens no histórico, completar com itens da biblioteca ordenados por avaliação TMDb (`rating`), quantidade de votos e data de adição, garantindo que o catálogo sempre apresente 5 recomendações atraentes.

---

## 4. Arquitetura Técnica & Diagrama de Componentes

```
┌────────────────────────────────────────────────────────────────────────┐
│                               CineLocal                                │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ HeroBanner (Carousel Container)                                │   │
│   │  • Slide State (activeIndex: 0..4)                             │   │
│   │  • Auto-play Timer (7s interval, pause on hover/touch)         │   │
│   │  • Indicators (5 bars with progress animation)                 │   │
│   │  • Controls (Prev/Next Chevrons) & Touch Swipe Listener        │   │
│   │  • Active Slide: Backdrop Crossfade + Title/Logo + Action CTAs │   │
│   └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ MediaRow: "Continuar Assistindo"                               │   │
│   │  • Sorted strictly: newest lastWatchedAt -> oldest             │   │
│   │  • Finished episodes advanced to Next Episode in sequence      │   │
│   │  • MediaCard with progress bar & last position info            │   │
│   └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ State & Data Layer (App.tsx & server/storage.ts)               │   │
│   │  • lastWatchedAt tracking on progress and mark-watched         │   │
│   │  • heroMediaList: [mostRecent, ...watchedOthers, ...topRated]  │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

### Mapeamento de Arquivos e Alterações
1. `src/server/storage.ts`:
   - Atualizar `toggleEpisodeWatched` para gravar `ep.lastWatchedAt`, `media.lastWatchedEpisodeId` e `media.lastWatchedAt` quando marcado como assistido ou desmarcado.
   - Ajustar `updateEpisodeProgress` para preservar consistência.
2. `src/App.tsx`:
   - Refinar a geração de `continueWatchingItems`:
     - Se o último episódio assistido foi concluído, encontrar o próximo episódio não assistido da série.
     - Ordenar toda a lista de forma decrescente pelo timestamp mais recente.
   - Criar `heroMediaList`: array de até 5 mídias únicas, começando pela mais recente e completando com mais vistas/populares.
3. `src/components/HeroBanner.tsx`:
   - Transformar para receber `items: MediaItem[]` (ou manter compatibilidade com array de até 5 mídias).
   - Adicionar timer de 7 segundos com rotação suave.
   - Adicionar indicadores de progresso de slides estilo Netflix na base/lateral.
   - Adicionar botões discretos de navegação esquerda/direita com fade no hover.
   - Adicionar suporte a gestos touch (swipe left/right) para mobile.
   - Pausa no timer quando o mouse estiver sobre o Hero ou durante toque.
4. `package.json` & `public/manifest.webmanifest` / `metadata.json`:
   - Incrementar versão para `1.4.3`.
