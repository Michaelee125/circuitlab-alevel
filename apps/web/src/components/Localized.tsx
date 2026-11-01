import type { ReactNode } from 'react';
import { useCircuitStore } from '../store';

export interface LocalizedValue {
  en: string;
  zh: string;
}

/** Renders English, Chinese or both depending on the selected language. */
export function LT({
  value,
  block = false,
  className,
}: {
  value: LocalizedValue;
  block?: boolean;
  className?: string;
}): ReactNode {
  const language = useCircuitStore((s) => s.language);
  if (language === 'en') return <span className={className}>{value.en}</span>;
  if (language === 'zh') return <span className={className}>{value.zh}</span>;
  if (block) {
    return (
      <span className={className}>
        {value.en}
        <br />
        <span style={{ color: 'var(--muted)' }}>{value.zh}</span>
      </span>
    );
  }
  return (
    <span className={className}>
      {value.en}
      <span style={{ color: 'var(--muted)' }}> · {value.zh}</span>
    </span>
  );
}
