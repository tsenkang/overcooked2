import { useEffect, useRef, useState } from 'react';
import { isMuted, setMuted } from './game/audio';
import { createGame, starsFor, update } from './game/engine';
import { Input } from './game/input';
import { render, worldSize } from './game/render';
import type { ArenaDef, Avatar, GameState, LevelDef } from './game/types';
import { Controls } from './ui';

export interface Result {
  level: LevelDef;
  arena: ArenaDef;
  score: number;
  stars: number;
  delivered: number;
  failed: number;
  tips: number;
}

interface Props {
  level: LevelDef;
  arena: ArenaDef;
  avatars: [Avatar, Avatar];
  solo: boolean;
  onFinish: (r: Result) => void;
  onQuit: () => void;
}

export default function GameCanvas({ level, arena, avatars, solo, onFinish, onQuit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gsRef = useRef<GameState>(createGame(level, arena, solo, avatars));
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [runId, setRunId] = useState(0);

  const togglePause = (v?: boolean) => {
    const next = v ?? !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
  };

  useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const gs = createGame(level, arena, solo, avatars);
    gsRef.current = gs;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const input = new Input();
    input.attach();
    let finished = false;
    let raf = 0;
    let last = performance.now();

    const { W, H } = worldSize(gs);
    const fit = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const scale = Math.min(wrap.clientWidth / W, wrap.clientHeight / H);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = `${Math.floor(W * scale)}px`;
      canvas.style.height = `${Math.floor(H * scale)}px`;
      canvas.width = Math.floor(W * scale * dpr);
      canvas.height = Math.floor(H * scale * dpr);
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (wrapRef.current) ro.observe(wrapRef.current);

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (input.consumePause() && !gs.over) togglePause();
      const pads = input.poll();
      if (!pausedRef.current) update(gs, dt, pads);
      render(ctx, gs, pausedRef.current ? 0 : dt);
      if (gs.over && gs.overT > 2 && !finished) {
        finished = true;
        onFinish({
          level,
          arena,
          score: gs.score,
          stars: starsFor(gs),
          delivered: gs.delivered,
          failed: gs.failed,
          tips: gs.tipsTotal,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    pausedRef.current = false;
    setPaused(false);

    return () => {
      cancelAnimationFrame(raf);
      input.detach();
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, arena, avatars, solo, runId]);

  return (
    <div className="fixed inset-0 bg-[#1a100c] flex flex-col">
      <div ref={wrapRef} className="relative flex-1 min-h-0 flex items-center justify-center p-2">
        <canvas ref={canvasRef} className="rounded-2xl shadow-2xl" aria-label={`${level.name} — ${arena.name}`} />
        <button
          onClick={(e) => {
            e.currentTarget.blur();
            togglePause(true);
          }}
          className="absolute top-3 right-3 rounded-full bg-black/50 text-white/90 px-4 py-2 text-sm font-bold hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-amber-300"
        >
          Pausa (Esc)
        </button>
      </div>

      {paused && (
        <div className="absolute inset-0 bg-[#1a100c]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-3xl bg-[#fffaf0] p-6 sm:p-8 shadow-2xl text-[#2b1d16]">
            <h2 className="font-display text-4xl font-black text-center">Pausado</h2>
            <p className="text-center text-[#6b5446] mt-1">
              {level.name} · {arena.flag} {arena.name}
            </p>
            <div className="mt-6 grid gap-3">
              <button className="btn-primary" onClick={() => togglePause(false)} autoFocus>
                Continuar
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setRunId((n) => n + 1);
                }}
              >
                Recomeçar fase
              </button>
              <button className="btn-secondary" onClick={onQuit}>
                Voltar ao menu
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  setMuted(!muted);
                  setMutedState(!muted);
                }}
              >
                Som: {muted ? 'desligado' : 'ligado'}
              </button>
            </div>
            <div className="mt-6">
              <Controls solo={solo} compact names={[avatars[0].name, avatars[1].name]} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
