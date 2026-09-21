# ADR-001: Reescrita do jogo em canvas com motor separado

**Status:** Aceito · **Data:** 2026-09-16

## Contexto
A versão anterior tinha todo o jogo em um único `App.tsx` (1.832 linhas) desenhado com `div`s e re-renderizado pelo React 30x por segundo. Problemas encontrados:

| Problema | Efeito | Gravidade |
|---|---|---|
| Re-render de centenas de `div`s por quadro | travadas, uso alto de CPU | Alta |
| Interação escolhia a estação mais próxima em qualquer direção | chef pegava coisa atrás dele | Alta |
| Estações de ingrediente/entrega criadas na mesma célula das paredes | duas estações no mesmo lugar | Média |
| Movimento em eixo da grade num mapa isométrico | W/A/S/D andava na diagonal da tela | Média |
| README dizia `/` para o jogador 2, código usava `M`; tutorial dizia "aperte de novo para cortar", código cortava sozinho | instruções erradas | Média |
| `setTimeout` do primeiro pedido sem limpeza | pedido aparecia depois de sair da fase | Baixa |
| 9 dependências sem uso (supabase, dnd-kit, recharts...) | install mais lento | Baixa |
| Nome e imagem de capa de um jogo comercial | risco de marca/direitos | Alta |

## Decisão
- **Canvas 2D** para o jogo; React só para menus, pausa e resultado.
- **Motor puro** (`engine.ts`) que recebe `(estado, dt, controles)` e não sabe nada de tela → dá para testar sem navegador.
- **Visão de cima levemente inclinada** (bancadas com face frontal), desenhada em ordem de profundidade por linha.
- **Alvo = estação à frente do chef** (ponto projetado na direção do olhar + produto escalar), com destaque visual.
- **Mapas em ASCII** e **constantes em `TUNING`** para ajustar dificuldade sem mexer na lógica.

## Opções consideradas
- **Manter DOM e otimizar (memo/virtualização):** menos reescrita, mas a lógica continuaria presa à UI e a interação continuaria errada.
- **Phaser/PixiJS:** mais recursos, porém +300–600 kB e curva de aprendizado; o jogo cabe bem em Canvas 2D puro (~65 kB gzip com React).

## Consequências
- Mais fácil: testar regras, criar fases, ajustar tempos.
- Mais difícil: acessibilidade dentro do canvas (os menus seguem em HTML acessível).
- Revisar depois: controles por toque no celular; online multiplayer exigiria mover o motor para um servidor autoritativo.
