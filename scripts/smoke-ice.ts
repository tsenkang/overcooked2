// Teste de lógica pura pro piso escorregadio.
import { createGame, update } from '../src/game/engine';
import { LEVELS } from '../src/game/content';
import { ARENAS } from '../src/game/maps';
import { DEFAULT_AVATARS } from '../src/game/avatars';
import type { GameState, LevelDef, PadState } from '../src/game/types';

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

function countIce(gs: GameState) {
  let n = 0;
  for (const row of gs.tiles) for (const t of row) if (t.ice) n++;
  return n;
}

// ─── 1) A poça existe, tem (aproximadamente) o tamanho pedido, longe dos spawns ──
console.log('\n== Gelo: geração ==');
for (const arena of ARENAS) {
  const level: LevelDef = { ...LEVELS[0], ice: 6 };
  const gs = createGame(level, arena, false, DEFAULT_AVATARS);
  const n = countIce(gs);
  assert(n > 0 && n <= 6, `${arena.id}: gerou entre 1 e 6 tiles de gelo (achou ${n})`);
  for (const p of gs.players) {
    const t = gs.tiles[Math.floor(p.y)][Math.floor(p.x)];
    assert(!t.ice, `${arena.id}: o spawn do chef ${p.id} não nasce em cima do gelo`);
  }
}

// ─── 2) Sem `ice` no LevelDef, nenhum tile vira gelo ───────────────────────
console.log('\n== Gelo: desligado por padrão ==');
{
  const gs = createGame(LEVELS[0], ARENAS[0], false, DEFAULT_AVATARS);
  assert(countIce(gs) === 0, 'fase sem `ice` não gera nenhum tile de gelo');
}

// ─── 3) Em cima do gelo, o chef demora mais pra alcançar a velocidade alvo ─
console.log('\n== Gelo: física (desliza) ==');
function skipCountdown(gs: GameState) {
  let n = 0;
  while (gs.countdown > 0 && n++ < 500) update(gs, 0.05, [EMPTY, EMPTY]);
}
{
  const level: LevelDef = { ...LEVELS[0], ice: 10 };
  const gs = createGame(level, ARENAS[2], false, DEFAULT_AVATARS);
  skipCountdown(gs);
  let iceTile: { x: number; y: number } | null = null;
  for (const row of gs.tiles) for (const t of row) if (t.ice) iceTile = { x: t.x, y: t.y };
  if (!iceTile) throw new Error('sem gelo gerado pra testar física');

  // chef 1 parado bem no meio do tile de gelo, anda pra direita por 0.1s
  const onIce = gs.players[0];
  onIce.x = iceTile.x + 0.5;
  onIce.y = iceTile.y + 0.5;
  onIce.vx = 0;
  onIce.vy = 0;
  update(gs, 0.1, [{ ...EMPTY, mx: 1 }, EMPTY]);
  const vIce = Math.hypot(gs.players[0].vx, gs.players[0].vy);

  // mesma coisa, mas criando outra partida e forçando o chef pra bem longe do gelo
  const gs2 = createGame(level, ARENAS[2], false, DEFAULT_AVATARS);
  skipCountdown(gs2);
  const farPlayer = gs2.players[0];
  // acha um chão sem gelo
  let floorTile: { x: number; y: number } | null = null;
  for (const row of gs2.tiles) for (const t of row) if (t.type === 'floor' && !t.ice) floorTile = { x: t.x, y: t.y };
  if (!floorTile) throw new Error('sem chão livre de gelo pra comparar');
  farPlayer.x = floorTile.x + 0.5;
  farPlayer.y = floorTile.y + 0.5;
  farPlayer.vx = 0;
  farPlayer.vy = 0;
  update(gs2, 0.1, [{ ...EMPTY, mx: 1 }, EMPTY]);
  const vNormal = Math.hypot(gs2.players[0].vx, gs2.players[0].vy);

  assert(vIce < vNormal * 0.7, `no gelo ganha menos velocidade em 0.1s (gelo=${vIce.toFixed(2)}, normal=${vNormal.toFixed(2)})`);
  assert(vIce > 0, 'mesmo no gelo, o chef começa a ganhar alguma velocidade (não trava)');
}

// ─── 4) `rush` acelera o ritmo dos pedidos sem quebrar o padrão (rush=1) ───
// Mede o tempo até o 5º pedido (o teto de pedidos simultâneos é 5, então dá
// pra chegar lá sem nenhum jogador resolvendo nada — acima disso o jogo para
// de gerar pedido novo até algum ser entregue ou vencer, de propósito).
console.log('\n== Ritmo dos pedidos (rush) ==');
function timeToNthOrder(level: LevelDef, n: number): number {
  const gs = createGame(level, ARENAS[0], false, DEFAULT_AVATARS);
  let steps = 0;
  while (gs.countdown > 0 && steps++ < 500) update(gs, 0.05, [EMPTY, EMPTY]);
  let t = 0;
  while (gs.orderId < n && t < 300) {
    update(gs, 0.25, [EMPTY, EMPTY]);
    t += 0.25;
  }
  return t;
}
{
  const base = LEVELS[0];
  const rushed: LevelDef = { ...base, rush: 2 };
  const a = timeToNthOrder(base, 5);
  const b = timeToNthOrder(rushed, 5);
  assert(b < a, `rush=2 chega no 5º pedido mais rápido que o padrão (padrão=${a}s, rush=${b}s)`);
}
{
  // rush indefinido deve se comportar IDÊNTICO ao padrão de antes (sem regressão)
  const base = LEVELS[0];
  const explicit1: LevelDef = { ...base, rush: 1 };
  const a = timeToNthOrder(base, 5);
  const b = timeToNthOrder(explicit1, 5);
  assert(a === b, `rush=1 explícito é idêntico a não ter 'rush' (ambos ${a}s)`);
}

console.log(failed ? `\n${failed} falha(s)` : '\nTudo passou.');
process.exit(failed ? 1 : 0);
