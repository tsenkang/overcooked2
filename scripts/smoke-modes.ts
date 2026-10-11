// Teste de lógica pura pros modos fora da campanha (Livre / Sobrevivência).
import { createGame, update, starsFor } from '../src/game/engine';
import { ZEN_LEVEL, SURVIVAL_LEVEL } from '../src/game/content';
import { ARENAS } from '../src/game/maps';
import { DEFAULT_AVATARS } from '../src/game/avatars';
import type { GameState, PadState } from '../src/game/types';

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.log('  ✗ ' + msg);
  } else {
    console.log('  ✓ ' + msg);
  }
}

const EMPTY: PadState = { mx: 0, my: 0, grab: false, use: false, useHeld: false, dash: false, swap: false };
function skipCountdown(gs: GameState) {
  let n = 0;
  while (gs.countdown > 0 && n++ < 500) update(gs, 0.05, [EMPTY, EMPTY]);
}

// ─── 1) Modo Livre: não acaba sozinho em tempo de partida normal ───────────
console.log('\n== Modo Livre ==');
{
  const gs = createGame(ZEN_LEVEL, ARENAS[0], false, DEFAULT_AVATARS);
  skipCountdown(gs);
  // simula 5 minutos de partida (bem mais que qualquer sessão real)
  for (let i = 0; i < 300 * 4; i++) update(gs, 0.25, [EMPTY, EMPTY]);
  assert(!gs.over, 'depois de 5 minutos simulados, a partida ainda está rolando');
  assert(gs.time > 290, `o relógio avançou normalmente (gs.time=${gs.time.toFixed(0)})`);
  assert(starsFor(gs) === 0, 'estrela nunca "conta" no modo livre (limiar inalcançável de propósito)');
}

// ─── 2) Sobrevivência: o tempo conta PRA CIMA, não pra baixo ───────────────
console.log('\n== Sobrevivência: relógio ==');
{
  const gs = createGame(SURVIVAL_LEVEL, ARENAS[0], false, DEFAULT_AVATARS);
  assert(gs.time === 0, 'começa em 0 (tempo decorrido, não tempo restante)');
  skipCountdown(gs);
  for (let i = 0; i < 40; i++) update(gs, 0.25, [EMPTY, EMPTY]);
  assert(gs.time > 9, `depois de 10s de jogo, gs.time subiu (achou ${gs.time.toFixed(1)})`);
  assert(!gs.over, 'não acaba só por causa do tempo passando');
}

// ─── 3) Sobrevivência: 3 pedidos perdidos encerram a partida ───────────────
console.log('\n== Sobrevivência: strikes ==');
{
  const gs = createGame(SURVIVAL_LEVEL, ARENAS[0], false, DEFAULT_AVATARS);
  skipCountdown(gs);
  // deixa o tempo passar bastante sem entregar nada — os pedidos vão vencer sozinhos
  let steps = 0;
  while (!gs.over && steps++ < 4000) update(gs, 0.25, [EMPTY, EMPTY]);
  assert(gs.over, `a partida acabou sozinha depois de pedidos perdidos (steps=${steps})`);
  assert(gs.strikes >= 3, `strikes bateu o limite (achou ${gs.strikes})`);
  assert(gs.failed >= 3, `pelo menos 3 pedidos foram contados como perdidos (achou ${gs.failed})`);
}

// ─── 4) Sobrevivência: o ritmo dos pedidos acelera com o tempo (mesma régua do rush) ──
console.log('\n== Sobrevivência: ritmo acelera ==');
{
  const gs = createGame(SURVIVAL_LEVEL, ARENAS[0], false, DEFAULT_AVATARS);
  skipCountdown(gs);
  let t = 0;
  while (gs.orderId < 3 && t < 120) {
    update(gs, 0.25, [EMPTY, EMPTY]);
    t += 0.25;
  }
  const earlyGap = t; // tempo até o 3º pedido, bem cedo na partida

  const gs2 = createGame(SURVIVAL_LEVEL, ARENAS[0], false, DEFAULT_AVATARS);
  skipCountdown(gs2);
  // avança bastante o relógio (sem deixar nenhum pedido vencer) antes de medir de novo
  gs2.time = 400;
  let t2 = 0;
  const startId = gs2.orderId;
  while (gs2.orderId < startId + 3 && t2 < 120) {
    update(gs2, 0.25, [EMPTY, EMPTY]);
    gs2.orders.length = 0; // evita bater no teto de 5 simultâneos nesse teto de tempo alto
    t2 += 0.25;
  }
  assert(t2 <= earlyGap, `mais tarde na partida, os pedidos chegam no mesmo ritmo ou mais rápido (cedo=${earlyGap}s, tarde=${t2}s)`);
}

console.log(failed ? `\n${failed} falha(s)` : '\nTudo passou.');
process.exit(failed ? 1 : 0);
