// Teste de lógica pura pro suporte a controle — sem navegador de verdade,
// simula o objeto navigator.getGamepads() que o browser exporia.
import { Input } from '../src/game/input';

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.log('  ✗ ' + msg);
  } else {
    console.log('  ✓ ' + msg);
  }
}

function fakeGamepad(index: number, overrides: Partial<Gamepad> = {}): Gamepad {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  return {
    index,
    id: `pad-${index}`,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons,
    timestamp: 0,
    vibrationActuator: undefined,
    ...overrides,
  } as unknown as Gamepad;
}

// Node 22 já expõe um `navigator` global somente-getter; só completamos getGamepads nele.
if (typeof globalThis.navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
}

// ─── 1) O bug real: só 1 controle plugado, ocupando o índice 1 (não o 0) ───
console.log('\n== Um controle só, no índice 1 ==');
{
  const pad1 = fakeGamepad(1);
  pad1.buttons[0] = { pressed: true, touched: true, value: 1 } as GamepadButton; // A
  (globalThis.navigator as unknown as { getGamepads: () => (Gamepad | null)[] }).getGamepads = () => [null, pad1];

  const input = new Input();
  const [p1, p2] = input.poll();
  assert(p1.grab === true, 'jogador 1 recebe o botão A do único controle plugado (índice bruto 1)');
  assert(p2.grab === false, 'jogador 2 não recebe nada (não há 2º controle)');
  assert(input.gamepadCount() === 1, 'gamepadCount() reporta 1 controle conectado');
}

// ─── 2) Dois controles, em índices fora de ordem (2 e 0) ───────────────────
console.log('\n== Dois controles, índices brutos 2 e 0 ==');
{
  const padA = fakeGamepad(0); // deve virar jogador 1 (menor índice)
  const padB = fakeGamepad(2); // deve virar jogador 2
  padA.buttons[1] = { pressed: true, touched: true, value: 1 } as GamepadButton; // B no controle do índice 0
  padB.buttons[2] = { pressed: true, touched: true, value: 1 } as GamepadButton; // X no controle do índice 2
  (globalThis.navigator as unknown as { getGamepads: () => (Gamepad | null)[] }).getGamepads = () => [padA, null, padB];

  const input = new Input();
  const [p1, p2] = input.poll();
  assert(p1.dash === true, 'jogador 1 = controle de menor índice (dash/B)');
  assert(p2.use === true, 'jogador 2 = controle de maior índice (use/X)');
  assert(input.gamepadCount() === 2, 'gamepadCount() reporta 2 controles');
}

// ─── 3) Deadzone: analógico levemente fora do centro não deve mover ────────
console.log('\n== Deadzone do analógico ==');
{
  const pad = fakeGamepad(0, { axes: [0.05, 0.05, 0, 0] });
  (globalThis.navigator as unknown as { getGamepads: () => (Gamepad | null)[] }).getGamepads = () => [pad];
  const input = new Input();
  const [p1] = input.poll();
  assert(p1.mx === 0 && p1.my === 0, 'puxão bem de leve (0.05) fica zerado pela zona morta');
}
{
  const pad = fakeGamepad(0, { axes: [1, 0, 0, 0] });
  (globalThis.navigator as unknown as { getGamepads: () => (Gamepad | null)[] }).getGamepads = () => [pad];
  const input = new Input();
  const [p1] = input.poll();
  assert(Math.abs(p1.mx - 1) < 0.001, 'analógico no fim do curso dá velocidade máxima (mx=1)');
}

// ─── 4) "Apertou agora" não repete no quadro seguinte sem soltar ───────────
console.log('\n== Borda de aperto não repete ==');
{
  const pad = fakeGamepad(0);
  pad.buttons[0] = { pressed: true, touched: true, value: 1 } as GamepadButton;
  (globalThis.navigator as unknown as { getGamepads: () => (Gamepad | null)[] }).getGamepads = () => [pad];
  const input = new Input();
  const [a] = input.poll();
  const [b] = input.poll(); // botão continua pressed, mas já não é mais "borda"
  assert(a.grab === true, 'primeiro poll() com o botão já apertado conta como borda');
  assert(b.grab === false, 'segundo poll() seguido, com o botão ainda apertado, não repete');
}

console.log(failed ? `\n${failed} falha(s)` : '\nTudo passou.');
process.exit(failed ? 1 : 0);
