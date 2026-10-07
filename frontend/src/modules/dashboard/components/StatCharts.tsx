import { useEffect, useRef, useState } from 'react';

/**
 * Statistika grafiklari — tashqi kutubxonasiz, SVG va oddiy HTML bilan.
 * Ranglar `.viz` blokidagi CSS o'zgaruvchilaridan olinadi (index.css), shuning uchun
 * yorug'/qorong'i rejim bitta joyda almashadi.
 */

/** Konteyner enini o'lchaydi — matn o'lchami cho'zilib ketmasligi uchun SVG haqiqiy pikselda chiziladi. */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(Math.round(w));
    });
    observer.observe(node);
    setWidth(Math.round(node.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/** O'qdagi qiymatlarni yaxlit sonlarga keltiradi. */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const rough = max / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= rough) ?? mag * 10;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

function fmtNum(n: number): string {
  return n.toLocaleString('uz-UZ', { maximumFractionDigits: 1 });
}

/** Ustunning tepasi yumaloq, poydevori tekis. */
function columnPath(x: number, y: number, w: number, h: number, r = 4): string {
  const radius = Math.min(r, w / 2, h);
  if (h <= 0) return '';
  return `M${x},${y + h} L${x},${y + radius} Q${x},${y} ${x + radius},${y} `
    + `L${x + w - radius},${y} Q${x + w},${y} ${x + w},${y + radius} L${x + w},${y + h} Z`;
}

export type ColumnSeries = { key: string; label: string; color: string };
export type ColumnPoint = { key: string; label: string; values: Record<string, number> };

/**
 * Guruhlangan ustunli diagramma — davrlar bo'yicha bir nechta ko'rsatkich.
 * Ustunlar 24px dan qalin emas, oralarida 2px bo'shliq qoldiriladi.
 */
export function GroupedColumnsChart({
  points, series, unit, emptyText = 'Bu davrda ma’lumot yo‘q',
}: {
  points: ColumnPoint[];
  series: ColumnSeries[];
  unit: string;
  emptyText?: string;
}) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const height = 260;
  const pad = { top: 14, right: 12, bottom: 38, left: 48 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;

  const max = Math.max(0, ...points.flatMap(p => series.map(s => p.values[s.key] ?? 0)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const yOf = (v: number) => pad.top + plotH - (v / top) * plotH;

  const groupW = points.length > 0 ? plotW / points.length : 0;
  const gap = 2;
  const barW = Math.max(3, Math.min(24, (groupW - 14) / series.length - gap));
  const groupInner = barW * series.length + gap * (series.length - 1);

  return (
    <div className="viz" ref={ref}>
      <div className="viz-legend">
        {series.map(s => (
          <span key={s.key} className="viz-legend__item">
            <i className="viz-legend__swatch" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <span className="viz-legend__unit">{unit}</span>
      </div>

      {points.length === 0 || width === 0 ? (
        <p className="viz-empty">{emptyText}</p>
      ) : (
        <div className="viz-plot">
          <svg width={width} height={height} role="img" aria-label={`Tendensiya, ${unit}`}>
            {ticks.map(t => (
              <g key={t}>
                <line x1={pad.left} x2={width - pad.right} y1={yOf(t)} y2={yOf(t)} className="viz-grid" />
                <text x={pad.left - 8} y={yOf(t) + 4} textAnchor="end" className="viz-axis-text">{fmtNum(t)}</text>
              </g>
            ))}

            {points.map((p, i) => {
              const gx = pad.left + i * groupW;
              const startX = gx + (groupW - groupInner) / 2;
              return (
                <g
                  key={p.key}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(h => (h === i ? null : h))}
                >
                  <rect
                    x={gx} y={pad.top} width={groupW} height={plotH}
                    className={`viz-hit${hover === i ? ' is-on' : ''}`}
                  />
                  {series.map((s, si) => {
                    const v = p.values[s.key] ?? 0;
                    const h = top > 0 ? (v / top) * plotH : 0;
                    const x = startX + si * (barW + gap);
                    return (
                      <path key={s.key} d={columnPath(x, yOf(v), barW, h)} fill={s.color} />
                    );
                  })}
                  <text x={gx + groupW / 2} y={height - 14} textAnchor="middle" className="viz-axis-text">
                    {p.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {hover !== null && points[hover] && (
            <div
              className="viz-tip"
              style={{
                left: `${Math.min(Math.max(pad.left + hover * groupW + groupW / 2, 90), width - 90)}px`,
              }}
            >
              <strong>{points[hover].label}</strong>
              {series.map(s => (
                <span key={s.key}>
                  <i style={{ background: s.color }} />
                  {s.label}: <b>{fmtNum(points[hover].values[s.key] ?? 0)}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type RankedRow = { id: string; label: string; sub?: string; value: number };

/**
 * Reyting — gorizontal ustunlar. Bitta ko'rsatkich bo'lgani uchun bitta rang ishlatiladi,
 * qiymat har doim ustun yonida yoziladi.
 */
export function RankedBars({
  rows, unit, maxRows = 10, emptyText = 'Bu davrda ma’lumot yo‘q',
}: {
  rows: RankedRow[];
  unit: string;
  maxRows?: number;
  emptyText?: string;
}) {
  if (rows.length === 0) return <p className="viz-empty">{emptyText}</p>;

  const shown = rows.slice(0, maxRows);
  const rest = rows.slice(maxRows);
  const restValue = rest.reduce((sum, r) => sum + r.value, 0);
  const all = restValue > 0
    ? [...shown, { id: '__rest', label: `Boshqalar (${rest.length})`, value: Math.round(restValue * 10) / 10 }]
    : shown;
  const max = Math.max(1, ...all.map(r => r.value));

  return (
    <div className="viz">
      <div className="viz-legend"><span className="viz-legend__unit">{unit}</span></div>
      <ul className="viz-rank">
        {all.map(row => (
          <li key={row.id} className="viz-rank__row" title={`${row.label}: ${fmtNum(row.value)} ${unit}`}>
            <span className="viz-rank__label">
              {row.label}
              {'sub' in row && row.sub ? <em>{row.sub}</em> : null}
            </span>
            <span className="viz-rank__track">
              <i className="viz-rank__bar" style={{ width: `${Math.max(1.5, (row.value / max) * 100)}%` }} />
            </span>
            <span className="viz-rank__value">{fmtNum(row.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
