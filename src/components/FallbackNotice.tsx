import React from 'react';
import { Info } from 'lucide-react';
import { FALLBACK_REASON_MESSAGES, FallbackReason } from '../config/api';

interface FallbackNoticeProps {
  reason: FallbackReason;
  className?: string;
}

/** AI ではなく内蔵ジェネレータの結果であることを示す帯（AI の結果と誤認させないため） */
export const FallbackNotice: React.FC<FallbackNoticeProps> = ({ reason, className = '' }) => (
  <div
    role="status"
    className={`px-6 py-2 border-b border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2 shrink-0 ${className}`}
  >
    <Info className="w-4 h-4 shrink-0" />
    <span>{FALLBACK_REASON_MESSAGES[reason]}</span>
  </div>
);
