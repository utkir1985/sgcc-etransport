interface SidebarToggleIconProps {
  collapsed: boolean;
  className?: string;
}

export default function SidebarToggleIcon({ collapsed, className = 'size-5' }: SidebarToggleIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      {/* Chap sidebar rail */}
      <rect
        x="3"
        y="4"
        width="3.5"
        height="12"
        rx="1.75"
        className="fill-current opacity-90"
      />

      {collapsed ? (
        /* Yopiq — o'ngga strelka */
        <path
          d="M10.5 10H15M15 10L13 8.25M15 10L13 11.75"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        /* Ochiq — kontent chiziqlari */
        <>
          <line x1="10.5" y1="7.5" x2="16.5" y2="7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <line x1="10.5" y1="10" x2="14.5" y2="10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <line x1="10.5" y1="12.5" x2="16.5" y2="12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
