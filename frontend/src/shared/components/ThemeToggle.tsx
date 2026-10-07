import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Kunduzgi rejimga o\'tish' : 'Tungi rejimga o\'tish'}
      className={`relative flex items-center w-[3.25rem] h-8 rounded-full p-1 transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[var(--color-dark-surface)] ${
        isDark
          ? 'bg-[var(--color-dark-elevated)] border border-[var(--color-dark-border)] shadow-inner'
          : 'bg-slate-200 shadow-sm'
      }`}
    >
      <Sun
        className={`absolute left-1.5 w-3.5 h-3.5 transition-all duration-300 ${
          isDark ? 'text-slate-500 scale-75 opacity-40' : 'text-amber-500 scale-100 opacity-100'
        }`}
      />
      <Moon
        className={`absolute right-1.5 w-3.5 h-3.5 transition-all duration-300 ${
          isDark ? 'text-slate-200 scale-100 opacity-100' : 'text-slate-400 scale-75 opacity-40'
        }`}
      />
      <span
        className={`relative z-10 w-6 h-6 rounded-full shadow-md transition-transform duration-300 ease-out ${
          isDark ? 'translate-x-[1.35rem] bg-blue-600 ring-1 ring-blue-400/30' : 'translate-x-0 bg-white'
        }`}
      />
    </button>
  );
}
