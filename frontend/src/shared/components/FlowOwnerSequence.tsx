/** Jarayon zanjiridagi ishtirokchilar: 1 → 2 → 3 */
export function FlowOwnerSequence({
  names,
  doneFlags,
  activeIndex,
  currentIndex,
  className = '',
  title,
}: {
  names: string[];
  /** Har bir ishtirokchi bosqichi bajarilganmi */
  doneFlags?: boolean[];
  /** Hozir navbati kelgan ishtirokchi */
  activeIndex?: number;
  /** Joriy foydalanuvchining ishtirokchilar orasidagi indeksi */
  currentIndex?: number;
  className?: string;
  title?: string;
}) {
  if (names.length <= 1) return null;
  return (
    <div
      className={`flow__owner-seq flow__owner-seq--stack ${className}`.trim()}
      title={title ?? names.join(' · ')}
    >
      {names.map((name, idx) => {
        const done = Boolean(doneFlags?.[idx]);
        const active = !done && activeIndex === idx;
        const mine = currentIndex === idx;
        const stateLabel = done
          ? 'bajarildi'
          : active
            ? (mine ? 'sizning navbatingiz' : 'navbatda')
            : 'oldingi tasdiq kutilmoqda';
        return (
          <span
            key={`${name}-${idx}`}
            className={`flow__owner-step${done ? ' is-done' : ''}${active ? ' is-active' : ''}${!done && !active ? ' is-locked' : ''}`}
            title={`${name}: ${stateLabel}`}
          >
            <em className={done ? 'is-done' : undefined}>{done ? '✓' : idx + 1}</em>
            <span>{name}</span>
          </span>
        );
      })}
    </div>
  );
}

export function ownerChainLabel(names: string[]): string {
  return names.join(' · ');
}
