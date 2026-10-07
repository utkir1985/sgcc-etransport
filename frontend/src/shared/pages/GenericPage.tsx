interface GenericPageProps {
  title: string;
  description: string;
  module?: string;
}

export default function GenericPage({ title, description, module }: GenericPageProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] sm:min-h-[400px] text-center px-2">
      <div className="w-16 h-16 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mb-4">
        <span className="text-primary-600 dark:text-primary-400 font-bold text-sm">{module ?? 'MVP'}</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{title}</h1>
      <p className="text-gray-500 dark:text-gray-400 max-w-md">{description}</p>
      <p className="mt-4 text-xs text-gray-400">Modulli arxitektura — keyingi bosqichda to'liq funksional</p>
    </div>
  );
}
