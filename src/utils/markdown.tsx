import React from 'react';

/** PRD 本文中の分類タグ。上から順に判定する */
const CLASSIFICATION_TAGS = [
  {
    token: '[FACT]',
    label: 'FACT',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
  {
    token: '[PROPOSAL]',
    label: 'PROPOSAL',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  },
  {
    token: '[OPEN_QUESTION]',
    label: 'OPEN QUESTION',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  },
];

const EMPTY_CONTENT_MESSAGE = '内容がありません';

// Lightweight, safe markdown renderer tailored for PRDs and notes
export function MarkdownRenderer({ content }: { content: string }) {
  if (!content) {
    return <p className="text-gray-400 italic">{EMPTY_CONTENT_MESSAGE}</p>;
  }

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block check
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <div key={`code-${i}`} className="my-3 rounded-lg bg-gray-900 p-4 text-xs font-mono text-gray-100 overflow-x-auto border border-gray-800">
            {codeBlockLang && <div className="text-gray-400 text-[10px] uppercase font-semibold mb-1 pb-1 border-b border-gray-800">{codeBlockLang}</div>}
            <pre className="whitespace-pre">{codeBlockContent.join('\n')}</pre>
          </div>
        );
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3);
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Horizontal Rule
    if (line.trim() === '---' || line.trim() === '***') {
      elements.push(<hr key={`hr-${i}`} className="my-4 border-gray-200 dark:border-zinc-800" />);
      continue;
    }

    // Headings
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={`h1-${i}`} className="text-2xl font-bold text-gray-900 dark:text-white mt-6 mb-3 tracking-tight border-b pb-2 border-gray-200 dark:border-zinc-800">
          {formatInline(line.slice(2))}
        </h1>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={`h2-${i}`} className="text-xl font-semibold text-gray-900 dark:text-zinc-100 mt-5 mb-2.5 tracking-tight">
          {formatInline(line.slice(3))}
        </h2>
      );
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={`h3-${i}`} className="text-base font-semibold text-gray-800 dark:text-zinc-200 mt-4 mb-2">
          {formatInline(line.slice(4))}
        </h3>
      );
      continue;
    }
    if (line.startsWith('#### ')) {
      elements.push(
        <h4 key={`h4-${i}`} className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mt-3 mb-1.5">
          {formatInline(line.slice(5))}
        </h4>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={`quote-${i}`} className="my-2 border-l-4 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 pl-3 py-1.5 text-sm text-gray-700 dark:text-zinc-300 rounded-r">
          {formatInline(line.slice(2))}
        </blockquote>
      );
      continue;
    }

    // Task Checklist
    if (/^-\s*\[([ xX])\]\s+(.*)/.test(line)) {
      const match = line.match(/^-\s*\[([ xX])\]\s+(.*)/);
      if (match) {
        const checked = match[1].toLowerCase() === 'x';
        elements.push(
          <div key={`task-${i}`} className="flex items-start gap-2 my-1 text-sm text-gray-800 dark:text-zinc-200">
            <input
              type="checkbox"
              readOnly
              checked={checked}
              className="mt-1 h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-default"
            />
            <span className={checked ? 'line-through text-gray-400 dark:text-zinc-500' : ''}>
              {formatInline(match[2])}
            </span>
          </div>
        );
        continue;
      }
    }

    // Bullet List
    if (/^[-*+]\s+(.*)/.test(line)) {
      const match = line.match(/^[-*+]\s+(.*)/);
      if (match) {
        elements.push(
          <li key={`bullet-${i}`} className="ml-5 list-disc my-1 text-sm text-gray-800 dark:text-zinc-200 leading-relaxed">
            {formatInline(match[1])}
          </li>
        );
        continue;
      }
    }

    // Numbered List
    if (/^\d+\.\s+(.*)/.test(line)) {
      const match = line.match(/^\d+\.\s+(.*)/);
      if (match) {
        elements.push(
          <li key={`num-${i}`} className="ml-5 list-decimal my-1 text-sm text-gray-800 dark:text-zinc-200 leading-relaxed">
            {formatInline(match[1])}
          </li>
        );
        continue;
      }
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={`empty-${i}`} className="h-2" />);
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${i}`} className="my-1.5 text-sm text-gray-800 dark:text-zinc-300 leading-relaxed">
        {formatInline(line)}
      </p>
    );
  }

  return <div className="markdown-body space-y-0.5">{elements}</div>;
}

// Inline formatting: **bold**, *italic*, `code`, [link](url), [FACT], [PROPOSAL], [OPEN_QUESTION] tags
function formatInline(text: string): React.ReactNode[] {
  // First split by code blocks `code`
  const parts = text.split(/(`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="rounded bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-pink-600 dark:text-pink-400 border border-gray-200 dark:border-zinc-700">
          {part.slice(1, -1)}
        </code>
      );
    }

    // Process bold **text**
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    return (
      <React.Fragment key={index}>
        {boldParts.map((bPart, bIndex) => {
          if (bPart.startsWith('**') && bPart.endsWith('**')) {
            const inner = bPart.slice(2, -2);
            return <strong key={bIndex} className="font-semibold text-gray-900 dark:text-white">{inner}</strong>;
          }

          // [FACT] などの分類タグをバッジ表示（最初に一致したタグのみ）
          const tag = CLASSIFICATION_TAGS.find((t) => bPart.includes(t.token));
          if (tag) {
            return (
              <React.Fragment key={bIndex}>
                {bPart.replace(tag.token, '')}
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${tag.className} ml-1`}>
                  {tag.label}
                </span>
              </React.Fragment>
            );
          }

          return bPart;
        })}
      </React.Fragment>
    );
  });
}
