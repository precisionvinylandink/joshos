import { gardenStage } from './engine';

/**
 * The pixel garden — a persistent, original visualization of progress. Calm and
 * subtle (Parts XV–XVI): the garden's maturity tracks lifetime xp; the number of
 * grown plots tracks *today's* meaningful completions, so acting fills it in.
 * Never mandatory, never punishing — it only ever grows.
 */
const GROUND = '#241811';
const SOIL = '#3a2a1e';
const STEM = '#5f9a3d';
const LEAF = '#7ec062';

function Plant({ x, g }: { x: number; g: number }) {
  const base = 92;
  const stemH = g <= 1 ? 0 : g === 2 ? 10 : g === 3 ? 18 : g === 4 ? 24 : 28;
  return (
    <g style={{ transition: 'transform .4s ease' }}>
      <rect x={x} y={base} width={20} height={12} rx={2} fill={SOIL} />
      {g >= 1 && stemH === 0 && <rect x={x + 8} y={base - 4} width={4} height={4} fill={LEAF} />}
      {stemH > 0 && <rect x={x + 9} y={base - stemH} width={2} height={stemH} fill={STEM} />}
      {g >= 2 && <rect x={x + 4} y={base - stemH + 4} width={5} height={2} fill={LEAF} />}
      {g >= 3 && <rect x={x + 11} y={base - stemH + 9} width={5} height={2} fill={LEAF} />}
      {g >= 4 && <rect x={x + 6} y={base - stemH - 4} width={8} height={6} rx={2} fill="var(--accent)" />}
      {g >= 5 && (
        <>
          <rect x={x + 1} y={base - stemH + 2} width={5} height={4} rx={1} fill="var(--accent2)" />
          <rect x={x + 14} y={base - stemH} width={5} height={4} rx={1} fill="var(--accent2)" />
        </>
      )}
    </g>
  );
}

export function PixelGarden({
  xp,
  todayCount = 0,
  className,
}: {
  xp: number;
  todayCount?: number;
  className?: string;
}) {
  const stage = gardenStage(xp);
  const plots = 8;
  const grown = Math.min(todayCount, plots);
  const matureG = Math.min(stage.level, 5);
  const baselineG = stage.level >= 1 ? 1 : 0;

  return (
    <svg
      viewBox="0 0 320 110"
      role="img"
      aria-label={`Garden stage: ${stage.label}. ${todayCount} grown today.`}
      className={className}
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      <rect x="0" y="100" width="320" height="10" fill={GROUND} />
      {Array.from({ length: plots }).map((_, i) => (
        <Plant key={i} x={12 + i * 38} g={i < grown ? matureG : baselineG} />
      ))}
    </svg>
  );
}
