import { useCallback, useState } from 'react';
import { TIMING } from '../config/app';

/** クリップボードへコピーし、一定時間 copied=true を返す */
export function useCopyFeedback(durationMs: number = TIMING.COPY_FEEDBACK_MS) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), durationMs);
    },
    [durationMs]
  );

  return { copied, copy };
}
