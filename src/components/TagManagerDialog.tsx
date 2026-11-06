import React, { useEffect, useState } from 'react';
import { Tags, Trash2, X } from 'lucide-react';
import type { Note, Tag, TagColor } from '../types';
import { TAG_COLORS, TAG_COLOR_STYLES, TAG_LIMITS } from '../config/tags';
import { countNotesByTag, sortTags } from '../utils/tags';
import { TagChip } from './TagEditor';

interface TagManagerDialogProps {
  tags: Tag[];
  notes: Note[];
  onUpdate: (tagId: string, updates: { name?: string; color?: TagColor | null }) => Promise<void>;
  onDelete: (tagId: string) => Promise<void>;
  onClose: () => void;
}

const TagRow: React.FC<{
  tag: Tag;
  noteCount: number;
  onUpdate: TagManagerDialogProps['onUpdate'];
  onDelete: TagManagerDialogProps['onDelete'];
}> = ({ tag, noteCount, onUpdate, onDelete }) => {
  const [name, setName] = useState(tag.name);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setName(tag.name), [tag.name]);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : '保存できませんでした。');
    }
  };

  const commitName = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(tag.name);
      return;
    }
    if (trimmed === tag.name) return;
    void run(async () => {
      try {
        await onUpdate(tag.id, { name: trimmed });
      } catch (e) {
        setName(tag.name);
        throw e;
      }
    });
  };

  return (
    <li className="py-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <TagChip tag={tag} />
        <input
          type="text"
          value={name}
          maxLength={TAG_LIMITS.MAX_TAG_NAME_CHARS}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur();
            if (e.key === 'Escape') setName(tag.name);
          }}
          aria-label={`タグ「${tag.name}」の名前`}
          className="flex-1 min-w-0 px-2 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 outline-none focus:border-indigo-500"
        />
        <span className="text-[10px] text-zinc-400 shrink-0 w-14 text-right">{noteCount} 件</span>
        <button
          type="button"
          onClick={() => {
            const message =
              noteCount > 0
                ? `タグ「${tag.name}」を削除しますか？ ${noteCount} 件のメモから外れます（メモは残ります）。`
                : `タグ「${tag.name}」を削除しますか？`;
            if (window.confirm(message)) void run(() => onDelete(tag.id));
          }}
          className="p-1 text-zinc-400 hover:text-rose-500 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label={`タグ「${tag.name}」を削除`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-1" role="radiogroup" aria-label="色">
        <button
          type="button"
          role="radio"
          aria-checked={!tag.color}
          onClick={() => void run(() => onUpdate(tag.id, { color: null }))}
          className={`px-1.5 h-5 rounded-full text-[9px] border ${
            !tag.color
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-zinc-200 dark:border-zinc-700 text-zinc-400'
          }`}
        >
          なし
        </button>
        {TAG_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={tag.color === color}
            aria-label={TAG_COLOR_STYLES[color].label}
            title={TAG_COLOR_STYLES[color].label}
            onClick={() => void run(() => onUpdate(tag.id, { color }))}
            className={`w-4 h-4 rounded-full ${TAG_COLOR_STYLES[color].swatchClass} ${
              tag.color === color ? 'ring-2 ring-offset-1 ring-indigo-500 dark:ring-offset-zinc-900' : ''
            }`}
          />
        ))}
      </div>
      {error && <div className="text-[10px] text-rose-600 dark:text-rose-400 pl-1">{error}</div>}
    </li>
  );
};

/** タグの名前変更・色・削除 */
export const TagManagerDialog: React.FC<TagManagerDialogProps> = ({ tags, notes, onUpdate, onDelete, onClose }) => {
  const counts = countNotesByTag(notes);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="タグの管理"
      >
        <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Tags className="w-4 h-4 text-indigo-500" />
            <span>タグの管理</span>
          </h2>
          <button type="button" onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-700" aria-label="閉じる">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5">
          {tags.length === 0 ? (
            <p className="py-6 text-xs text-zinc-400 text-center">
              まだタグがありません。メモのタイトルの下の欄から追加できます。
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {sortTags(tags).map((tag) => (
                <TagRow key={tag.id} tag={tag} noteCount={counts.get(tag.id) ?? 0} onUpdate={onUpdate} onDelete={onDelete} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
