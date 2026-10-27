import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteSaveQueue } from './noteSaveQueue';
import { ConflictError, type NoteFields } from './apiWorkspaceRepository';
import type { Note, SaveStatus } from '../types';

const note = (id: string, updatedAt: string, extra: Partial<Note> = {}): Note => ({
  id,
  sectionId: 's',
  projectId: 'p',
  userId: 'u',
  title: '',
  content: '',
  position: 0,
  createdAt: updatedAt,
  updatedAt,
  ...extra,
});

/** 呼び出しごとに外から resolve / reject できる save */
const controllableSave = () => {
  const calls: { noteId: string; updates: NoteFields; base?: string; resolve: (n: Note) => void; reject: (e: unknown) => void }[] =
    [];
  const save = vi.fn(
    (noteId: string, updates: NoteFields, base?: string) =>
      new Promise<Note>((resolve, reject) => calls.push({ noteId, updates, base, resolve, reject }))
  );
  return { save, calls };
};

const setup = (retryDelaysMs = [1000, 3000, 10000]) => {
  const { save, calls } = controllableSave();
  const statuses: SaveStatus[] = [];
  const saved: Note[] = [];
  const conflicts: { latest: Note; unsaved: NoteFields }[] = [];
  const queue = new NoteSaveQueue({
    save,
    retryDelaysMs,
    onStatusChange: (s) => statuses.push(s),
    onSaved: (n) => saved.push(n),
    onConflict: (latest, unsaved) => conflicts.push({ latest, unsaved }),
  });
  queue.track([note('n1', 't0')]);
  return { queue, save, calls, statuses, saved, conflicts };
};

const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => vi.useRealTimers());

describe('NoteSaveQueue', () => {
  it('保存のたびに最新の updatedAt を基準にする', async () => {
    const { queue, calls, statuses } = setup();

    queue.enqueue('n1', { content: 'a' });
    expect(calls[0]).toMatchObject({ updates: { content: 'a' }, base: 't0' });
    expect(statuses).toEqual(['saving']);

    calls[0].resolve(note('n1', 't1'));
    await vi.waitFor(() => expect(statuses).toEqual(['saving', 'saved']));

    queue.enqueue('n1', { title: 'b' });
    expect(calls[1]).toMatchObject({ updates: { title: 'b' }, base: 't1' });
  });

  it('送信中の変更はまとめて、送信が終わってから 1 回で送る', async () => {
    const { queue, save, calls } = setup();

    queue.enqueue('n1', { content: 'a' });
    queue.enqueue('n1', { title: 'T' });
    queue.enqueue('n1', { content: 'ab' });
    expect(save).toHaveBeenCalledTimes(1);

    calls[0].resolve(note('n1', 't1'));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(calls[1]).toMatchObject({ updates: { title: 'T', content: 'ab' }, base: 't1' });
  });

  it('競合したら送れなかった変更を渡し、最新の updatedAt を基準にする', async () => {
    const { queue, calls, conflicts } = setup();

    queue.enqueue('n1', { content: 'mine' });
    queue.enqueue('n1', { title: 'typed while sending' });
    calls[0].reject(new ConflictError(note('n1', 't9', { content: 'theirs' })));

    await vi.waitFor(() => expect(conflicts).toHaveLength(1));
    expect(conflicts[0].unsaved).toEqual({ content: 'mine', title: 'typed while sending' });
    expect(queue.hasUnsaved()).toBe(false);

    queue.enqueue('n1', { content: 'next' });
    expect(calls[1].base).toBe('t9');
  });

  it('通信エラーは待ち時間を置いて再試行し、尽きたら error になって retryAll を待つ', async () => {
    const { queue, save, calls, statuses } = setup([1000, 3000]);

    queue.enqueue('n1', { content: 'a' });
    calls[0].reject(new Error('network'));
    await settle();
    expect(save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(2);
    calls[1].reject(new Error('network'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(3);
    calls[2].reject(new Error('network'));
    await settle();
    expect(statuses.at(-1)).toBe('error');
    expect(queue.hasUnsaved()).toBe(true);

    queue.retryAll();
    expect(save).toHaveBeenCalledTimes(4);
    expect(calls[3].updates).toEqual({ content: 'a' });
    calls[3].resolve(note('n1', 't1'));
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('saved'));
  });

  it('再試行を待つ間の入力は失った変更と合わせて送り直す', async () => {
    const { queue, calls } = setup();

    queue.enqueue('n1', { title: 'T' });
    calls[0].reject(new Error('network'));
    await settle();
    queue.enqueue('n1', { content: 'new' });

    expect(calls[1].updates).toEqual({ title: 'T', content: 'new' });
  });

  it('削除したメモの未送信の変更は捨てる', async () => {
    const { queue, save, calls } = setup();
    queue.enqueue('n1', { content: 'a' });
    calls[0].reject(new Error('network'));
    await settle();

    queue.forget('n1');
    await vi.advanceTimersByTimeAsync(20000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(queue.hasUnsaved()).toBe(false);
  });
});
