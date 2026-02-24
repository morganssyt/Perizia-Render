'use client';

interface ConfidenceBadgeProps {
  confidence: number;
  size?: 'sm' | 'md';
}

export default function ConfidenceBadge({ confidence, size = 'md' }: ConfidenceBadgeProps) {
  const pct = Math.round(confidence * 100);

  let color: string;
  let bg: string;
  let label: string;

  if (confidence >= 0.7) {
    color = 'text-green-700';
    bg = 'bg-green-100';
    label = 'Alta';
  } else if (confidence >= 0.4) {
    color = 'text-yellow-700';
    bg = 'bg-yellow-100';
    label = 'Media';
  } else {
    color = 'text-red-700';
    bg = 'bg-red-100';
    label = 'Bassa';
  }

  const sizeClasses = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${bg} ${color} ${sizeClasses}`}
      title={`Confidenza: ${pct}%`}
    >
      <span className="font-semibold">{pct}%</span>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}
