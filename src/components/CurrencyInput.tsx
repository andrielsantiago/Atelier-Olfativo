import React, { useEffect, useState } from 'react';

function formatNumberPtBr(val: number): string {
  const safe = Number.isFinite(val) && val >= 0 ? val : 0;
  return safe.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parsePtBrNumber(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, '');
  if (!cleaned) return 0;

  let normalized = cleaned;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // Handles 1.250,50 -> 1250.50
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    // Handles 125,50 -> 125.50
    normalized = cleaned.replace(',', '.');
  }

  const num = Number(normalized);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  required?: boolean;
  title?: string;
  compact?: boolean;
  className?: string;
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onChange,
  placeholder = '0,00',
  required,
  title,
  compact = false,
  className = '',
}) => {
  const [focused, setFocused] = useState(false);
  const [draftText, setDraftText] = useState(() => formatNumberPtBr(value));

  useEffect(() => {
    if (!focused) {
      setDraftText(formatNumberPtBr(value));
    }
  }, [value, focused]);

  const handleFocus = () => {
    setFocused(true);
    setDraftText(value > 0 ? String(value).replace('.', ',') : '');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d.,]/g, '');
    setDraftText(raw);
    onChange(parsePtBrNumber(raw));
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = parsePtBrNumber(draftText);
    onChange(parsed);
    setDraftText(formatNumberPtBr(parsed));
  };

  return (
    <div
      className={`flex items-center bg-white border border-[#D8CBB8] focus-within:border-[#B08D57] overflow-hidden ${
        compact ? 'rounded-md' : 'rounded-lg'
      } ${className}`}
      title={title}
    >
      <span
        className={`select-none font-mono text-[#6E5A49] bg-[#FAF7F2] border-r border-[#E4D8C5] shrink-0 ${
          compact ? 'px-1.5 py-1.5 text-[11px]' : 'px-2.5 py-2 text-xs'
        }`}
      >
        R$
      </span>
      <input
        type="text"
        inputMode="decimal"
        required={required}
        value={focused ? draftText : formatNumberPtBr(value)}
        onFocus={handleFocus}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={`w-full min-w-0 bg-transparent font-mono tabular-nums text-[#171412] placeholder:text-[#9E8E7B] focus:outline-none ${
          compact ? 'px-1.5 py-1.5 text-xs' : 'px-2.5 py-2 text-sm'
        }`}
      />
    </div>
  );
};
