import React, { useMemo, useRef, useState } from 'react';
import { Plus, Tag as TagIcon, X } from 'lucide-react';
import type { Tag } from '../types';
import { TAG_LIMITS, tagChipClass } from '../config/tags';
import { findTagByName, suggestTags } from '../utils/tags';

/** タグのチップ。onRemove を渡すと × が出る */
export const TagChip: React.FC<{ tag: Tag; onRemove?: () => void; size?: 'xs' | 'sm' }> = ({
  tag,
  onRemove,
  size = 'sm',
}) => (
  <span
    className={`inline-flex items-center gap-0.5 rounded-full border font-medium max-w-[10rem] ${tagChipClass(tag.color)} ${
      size === 'xs' ? 'px-1.5 py-0 text-[9px]' : 'px-2 py-0.5 text-[10px]'
    }`}
  >
    <span className="truncate">{tag.name}</span>
    {onRemove && (
      <button
        type="button"
        onClick={onRemove}
        className="-mr-0.5 p-0.5 rounded-full opacity-60 hover:opacity-100"
        aria-label={`タグ「${tag.name}」を外す`}
      >
        <X className="w-2.5 h-2.5" />
      </button>
    )}
  </span>
);

interface TagEditorProps {
  /** プロジェクトのすべてのタグ */
  tags: Tag[];
  /** このメモに付いているタグ（付けた順） */
  selectedIds: string[];
  /** 付け外しの結果（タグ ID の一覧全体）を保存する */
  onChange: (tagIds: string[]) => Promise<void>;
  /** 新しいタグを作る（同じ名前があれば既存のタグを返す） */
  onCreate: (name: string) => Promise<Tag>;
}

/** メモのタグの付け外し。入力補完で既存のタグを選び、無い名前なら新規作成する */
export const TagEditor: React.FC<TagEditorProps> = ({ tags, selectedIds, onChange, onCreate }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedTags = selectedIds.map((id) => tags.find((t) => t.id === id)).filter((t): t is Tag => Boolean(t));
  const trimmed = query.trim();
  const suggestions = useMemo(() => suggestTags(tags, query, selectedIds), [tags, query, selectedIds]);
  const exactMatch = findTagByName(tags, trimmed);
  const canCreate = trimmed.length > 0 && !exactMatch && trimmed.length <= TAG_LIMITS.MAX_TAG_NAME_CHARS;
  // 候補の末尾に「作成」を置く
  const options: ({ kind: 'tag'; tag: Tag } | { kind: 'create'; name: string })[] = [
    ...suggestions.map((tag) => ({ kind: 'tag' as const, tag })),
    ...(canCreate ? [{ kind: 'create' as const, name: trimmed }] : []),
  ];
  const isFull = selectedIds.length >= TAG_LIMITS.MAX_TAGS_PER_NOTE;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'タグを保存できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const attach = (tagId: string) =>
    run(async () => {
      setQuery('');
      setHighlight(0);
      if (!selectedIds.includes(tagId)) await onChange([...selectedIds, tagId]);
      inputRef.current?.focus();
    });

  const choose = (option: (typeof options)[number]) =>
    run(async () => {
      const tag = option.kind === 'tag' ? option.tag : await onCreate(option.name);
      setQuery('');
      setHighlight(0);
      if (!selectedIds.includes(tag.id)) await onChange([...selectedIds, tag.id]);
      inputRef.current?.focus();
    });

  const detach = (tagId: string) => run(() => onChange(selectedIds.filter((id) => id !== tagId)));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (exactMatch && !selectedIds.includes(exactMatch.id)) void attach(exactMatch.id);
      else if (options[highlight]) void choose(options[highlight]);
    } else if (e.key === 'Backspace' && !query && selectedIds.length > 0) {
      void detach(selectedIds[selectedIds.length - 1]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative px-3 py-1.5 border-b border-zinc-100 dark:border-zinc-800/80">
      <div className="flex flex-wrap items-center gap-1">
        <TagIcon className="w-3 h-3 text-zinc-400 shrink-0" aria-hidden />
        {selectedTags.map((tag) => (
          <TagChip key={tag.id} tag={tag} onRemove={busy ? undefined : () => void detach(tag.id)} />
        ))}
        {!isFull && (
          <input
            ref={inputRef}
            type="text"
            value={query}
            disabled={busy}
            maxLength={TAG_LIMITS.MAX_TAG_NAME_CHARS}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            // 候補のクリックが先に処理されるよう、閉じるのを少し遅らせる
            onBlur={() => setTimeout(() => setIsOpen(false), 120)}
            onKeyDown={handleKeyDown}
            placeholder={selectedTags.length === 0 ? 'タグを追加...' : '追加...'}
            aria-label="タグを追加"
            className="flex-1 min-w-[5rem] bg-transparent border-none outline-none text-[11px] text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 py-0.5"
          />
        )}
      </div>
      {error && <div className="mt-1 text-[10px] text-rose-600 dark:text-rose-400">{error}</div>}

      {isOpen && options.length > 0 && (
        <div
          className="absolute left-3 right-3 top-full mt-1 z-40 max-h-52 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg py-1 text-xs"
          role="listbox"
        >
          {options.map((option, index) => (
            <button
              key={option.kind === 'tag' ? option.tag.id : `create-${option.name}`}
              type="button"
              role="option"
              aria-selected={index === highlight}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => void choose(option)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left ${
                index === highlight ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''
              }`}
            >
              {option.kind === 'tag' ? (
                <TagChip tag={option.tag} />
              ) : (
                <>
                  <Plus className="w-3 h-3 text-indigo-500" />
                  <span className="text-zinc-700 dark:text-zinc-300">
                    「<span className="font-semibold">{option.name}</span>」を新しいタグとして作成
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
