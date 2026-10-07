import type { WagonKind } from '../utils/wagonKinds';

const WAGON_IMAGE: Record<WagonKind, string> = {
  sisterna: '/wagons/wagon-tank-real.png',
  closed: '/wagons/wagon-closed-real.png',
  platform: '/wagons/wagon-platform-real.png',
};

const WAGON_ALT: Record<WagonKind, string> = {
  sisterna: 'Vagon-sisterna',
  closed: 'Yopiq turdagi vagon',
  platform: 'Fiting platforma',
};

const WAGON_COLOR: Record<WagonKind, string> = {
  sisterna: 'drop-shadow-[0_1px_1px_rgba(15,23,42,0.25)] dark:brightness-110 dark:drop-shadow-[0_1px_2px_rgba(255,255,255,0.18)]',
  closed: 'drop-shadow-[0_1px_1px_rgba(15,23,42,0.38)] dark:brightness-110 dark:drop-shadow-[0_1px_2px_rgba(255,255,255,0.22)]',
  platform: '[filter:saturate(1.3)_contrast(1.08)_drop-shadow(0_1px_1px_rgba(15,23,42,.38))] dark:[filter:saturate(1.2)_brightness(1.12)_contrast(1.04)_drop-shadow(0_1px_2px_rgba(255,255,255,.2))]',
};

export function WagonKindArt({ kind, className = 'h-10 w-full' }: { kind: WagonKind; className?: string }) {
  if (kind === 'sisterna') {
    return (
      <span className={`${className} relative inline-flex select-none items-center justify-center`}>
        <img
          src={WAGON_IMAGE[kind]}
          alt={WAGON_ALT[kind]}
          draggable={false}
          className={`h-full w-full object-contain object-center ${WAGON_COLOR[kind]}`}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[43%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[5px] font-black tracking-[-0.02em] text-emerald-800 dark:text-emerald-700 sm:text-[6px]"
        >
          SHURTAN GKM
        </span>
      </span>
    );
  }

  return (
    <img
      src={WAGON_IMAGE[kind]}
      alt={WAGON_ALT[kind]}
      draggable={false}
      className={`${className} select-none object-contain object-center ${WAGON_COLOR[kind]}`}
    />
  );
}
