import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { drawArenaThumb, drawAvatarPreview, type ChefLook } from './game/render';
import type { ArenaDef } from './game/types';

function Key({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Stars({ n, size = 'text-3xl', lit = n }: { n: number; size?: string; lit?: number }) {
  return (
    <div className={`flex gap-1 ${size}`} aria-label={`${n} de 3 estrelas`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`transition-all duration-300 ${i < Math.min(n, lit) ? 'text-[#ffc72c] scale-100 drop-shadow-[0_2px_0_#b7791f]' : 'text-black/15 scale-90'}`}
        >
          ★
        </span>
      ))}
    </div>
  );
}

const ACTIONS = [
  { label: 'Andar', p1: ['W', 'A', 'S', 'D'], p2: ['↑', '←', '↓', '→'], pad: 'Analógico' },
  { label: 'Pegar / soltar', p1: ['Espaço'], p2: ['Enter'], pad: 'A' },
  { label: 'Cortar · lavar · jogar · extintor · taco', p1: ['E'], p2: ['Shift dir.'], pad: 'X' },
  { label: 'Correr (dash)', p1: ['Shift esq.'], p2: ['Ctrl dir.'], pad: 'B' },
];

export function Controls({
  solo, compact = false, names,
}: { solo: boolean; compact?: boolean; names?: [string, string] }) {
  const n1 = names?.[0]?.trim() || 'Chef 1';
  const n2 = names?.[1]?.trim() || 'Chef 2';
  return (
    <div className={`rounded-2xl bg-[#2b1d16]/5 ${compact ? 'p-3' : 'p-4'}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[#6b5446]">
            <th className="font-bold pb-2">Ação</th>
            <th className="font-bold pb-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#2f7de1] mr-1.5" />
              {n1}
            </th>
            {!solo && (
              <th className="font-bold pb-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#ef5a3c] mr-1.5" />
                {n2}
              </th>
            )}
            {!compact && <th className="font-bold pb-2">Controle</th>}
          </tr>
        </thead>
        <tbody>
          {ACTIONS.map((a) => (
            <tr key={a.label} className="border-t border-[#2b1d16]/10">
              <td className="py-1.5 pr-2">{a.label}</td>
              <td className="py-1.5 space-x-1">{a.p1.map((k) => <Key key={k}>{k}</Key>)}</td>
              {!solo && <td className="py-1.5 space-x-1">{a.p2.map((k) => <Key key={k}>{k}</Key>)}</td>}
              {!compact && (
                <td className="py-1.5">
                  <Key>{a.pad}</Key>
                </td>
              )}
            </tr>
          ))}
          {solo && (
            <tr className="border-t border-[#2b1d16]/10">
              <td className="py-1.5 pr-2">Trocar de chef</td>
              <td className="py-1.5 space-x-1">
                <Key>Q</Key> <Key>Tab</Key>
              </td>
              {!compact && (
                <td className="py-1.5">
                  <Key>LB / RB</Key>
                </td>
              )}
            </tr>
          )}
        </tbody>
      </table>
      {!solo && !compact && (
        <p className="mt-2 text-xs text-[#6b5446]">{n2} também pode usar K (pegar), L (usar) e ; (dash). Até 2 controles.</p>
      )}
    </div>
  );
}

/** Prévia do chef, desenhada com o mesmo código que o jogo usa. */
export function AvatarCanvas({ look, size = 120 }: { look: ChefLook; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // as cores entram no rAF por ref para não reiniciar a animação a cada troca
  const lookRef = useRef(look);
  lookRef.current = look;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, size, size);
      drawAvatarPreview(ctx, lookRef.current, size / 2, size * 0.86, size / 120, t * 2.2);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden="true" />;
}

/** Miniatura do mapa da arena. */
export function ArenaThumb({ arena, w = 240, h = 160 }: { arena: ArenaDef; w?: number; h?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawArenaThumb(ctx, arena, w, h);
  }, [arena, w, h]);
  return (
    <canvas
      ref={ref}
      style={{ width: w, height: h }}
      className="rounded-xl w-full"
      role="img"
      aria-label={`Planta da cozinha ${arena.name}`}
    />
  );
}

/** Fileira de cores selecionáveis. */
export function Swatches({
  label, value, options, onChange,
}: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-xs font-extrabold uppercase tracking-widest text-[#8a6f5e]">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={value === c}
            aria-label={c}
            onClick={() => onChange(c)}
            style={{ background: c }}
            className={`h-7 w-7 rounded-full border-2 transition-transform ${
              value === c ? 'border-[#2b1d16] scale-110' : 'border-black/15 hover:scale-105'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
