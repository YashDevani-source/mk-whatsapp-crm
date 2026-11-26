// Small hand-made charts for the dashboard (DEMO-35, Decision 36): HTML/CSS bars and SVG rings,
// no chart library. Every chart has text labels or a legend, so nothing depends on colour alone,
// and each mark has a hover title with its exact value.

export interface Part {
  label: string;
  value: number;
  // A CSS colour, normally a `var(--series-n)` or `var(--status-…)` token.
  color: string;
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

// A rounded top for the axis: 1, 2, 5 or 10 times a power of ten.
function niceMax(max: number): number {
  if (max <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 5, 10].map((m) => m * p).find((v) => v >= max) ?? max;
}

// Vertical bars with a y axis of three ticks; each bar shows its value on hover and focus.
export function BarChart({
  bars,
  unit,
  label,
}: {
  bars: { key: string; label: string; title: string; value: number }[];
  unit: string;
  label: string;
}) {
  const top = niceMax(Math.max(0, ...bars.map((b) => b.value)));
  const ticks = [top, top / 2, 0];
  return (
    <figure className="bar-chart" aria-label={label}>
      <div className="bar-axis" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className="bar-plot">
        {bars.map((b) => (
          <div
            key={b.key}
            className="bar-col"
            tabIndex={0}
            role="img"
            aria-label={`${b.title}: ${plural(b.value, unit)}`}
            data-tip={plural(b.value, unit)}
          >
            <div className="bar-track">
              <div
                className={b.value === 0 ? 'bar zero' : 'bar'}
                style={{ height: `${(b.value / top) * 100}%` }}
              />
            </div>
            <span className="bar-label" aria-hidden="true">
              {b.label}
            </span>
          </div>
        ))}
      </div>
    </figure>
  );
}

// A sparkline for a number card: a 2 px line with the last point marked.
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 120;
  const h = 36;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const points = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 6)] as const);
  const last = points.at(-1);
  return (
    <svg
      className="sparkline"
      viewBox={`-3 0 ${w + 6} ${h}`}
      width={w}
      height={h}
      role="img"
      aria-label={label}
    >
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {last && <circle cx={last[0]} cy={last[1]} r={3} fill="currentColor" />}
    </svg>
  );
}

// A donut with the total in the middle; 2 px gaps between the parts.
export function Donut({ parts, total, unit }: { parts: Part[]; total: number; unit: string }) {
  const r = 60;
  const c = 2 * Math.PI * r;
  const shown = parts.filter((p) => p.value > 0);
  const gap = shown.length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <svg
      className="donut"
      viewBox="0 0 160 160"
      role="img"
      aria-label={`${plural(total, unit)}: ${shown.map((p) => `${p.label} ${p.value}`).join(', ')}`}
    >
      <circle cx={80} cy={80} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={22} />
      {total > 0 &&
        shown.map((p) => {
          const len = (p.value / total) * c;
          const dash = Math.max(len - gap, 0.5);
          const el = (
            <circle
              key={p.label}
              cx={80}
              cy={80}
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth={22}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
            >
              <title>{`${p.label}: ${p.value}`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
      <text x={80} y={78} textAnchor="middle" className="donut-total">
        {total}
      </text>
      <text x={80} y={98} textAnchor="middle" className="donut-unit">
        {total === 1 ? unit : `${unit}s`}
      </text>
    </svg>
  );
}

// The legend every multi-part chart carries: swatch, label, count (and share).
export function Legend({ parts, share }: { parts: Part[]; share?: boolean }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  return (
    <ul className="legend">
      {parts.map((p) => (
        <li key={p.label}>
          <span className="swatch" style={{ background: p.color }} aria-hidden="true" />
          <span className="legend-label">{p.label}</span>
          <span className="legend-value">
            {p.value}
            {share && total > 0 && (
              <span className="muted"> · {Math.round((p.value / total) * 100)}%</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

// One horizontal bar split into parts. `max` lets several bars share one scale.
export function StackedBar({ parts, max, label }: { parts: Part[]; max?: number; label: string }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  const scale = Math.max(max ?? total, 1);
  return (
    <div
      className="stacked"
      role="img"
      aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.value}`).join(', ')}`}
    >
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <span
            key={p.label}
            className="stacked-part"
            style={{ width: `${(p.value / scale) * 100}%`, background: p.color }}
            title={`${p.label}: ${p.value}`}
          />
        ))}
    </div>
  );
}
