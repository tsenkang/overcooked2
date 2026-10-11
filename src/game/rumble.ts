// Vibração do controle em eventos marcantes — mesmo padrão do audio.ts
// (módulo com estado próprio), pra engine.ts poder chamar sem depender do
// React nem do componente que criou o Input.
import type { Input } from './input';

let current: Input | null = null;

/** GameCanvas chama isso uma vez, quando cria o Input da partida. */
export function bindRumble(input: Input | null) {
  current = input;
}

export function rumble(slot: 0 | 1, strength = 0.55, ms = 130) {
  current?.rumble(slot, strength, ms);
}
