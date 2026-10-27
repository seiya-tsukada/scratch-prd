import type { Note, SaveStatus } from '../types';
import { ConflictError, type NoteFields } from './apiWorkspaceRepository';

export interface NoteSaveQueueOptions {
  save: (noteId: string, updates: NoteFields, baseUpdatedAt?: string) => Promise<Note>;
  onStatusChange: (status: SaveStatus) => void;
  /** 保存できた（サーバーの最新値） */
  onSaved: (note: Note) => void;
  /** 他で先に更新されていた。unsaved は送れなかった変更 */
  onConflict: (latest: Note, unsaved: NoteFields) => void;
  /** 自動再試行の待ち時間。尽きたら status は 'error' になり、retryAll() を待つ */
  retryDelaysMs?: number[];
}

export const DEFAULT_RETRY_DELAYS_MS = [1000, 3000, 10000];

/**
 * メモの自動保存。メモごとに送信は 1 件ずつ（送信中の変更はまとめて次に送る）。
 * baseUpdatedAt には最後にサーバーから受け取った updatedAt を使い、競合を検知する。
 */
export class NoteSaveQueue {
  private pending = new Map<string, NoteFields>();
  private inFlight = new Set<string>();
  private baseUpdatedAt = new Map<string, string>();
  private attempts = new Map<string, number>();
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private failed = new Set<string>();
  private status: SaveStatus = 'saved';
  private readonly retryDelaysMs: number[];

  constructor(private readonly options: NoteSaveQueueOptions) {
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  }

  /** サーバーから受け取ったメモの updatedAt を競合検知の基準にする */
  track(notes: Note[]): void {
    for (const note of notes) {
      if (!this.pending.has(note.id) && !this.inFlight.has(note.id)) {
        this.baseUpdatedAt.set(note.id, note.updatedAt);
      }
    }
  }

  enqueue(noteId: string, updates: NoteFields): void {
    this.pending.set(noteId, { ...this.pending.get(noteId), ...updates });
    this.failed.delete(noteId);
    this.clearRetry(noteId);
    this.attempts.delete(noteId);
    void this.flush(noteId);
  }

  /** 削除したメモの未送信の変更を捨てる */
  forget(noteId: string): void {
    this.pending.delete(noteId);
    this.failed.delete(noteId);
    this.clearRetry(noteId);
    this.attempts.delete(noteId);
    this.baseUpdatedAt.delete(noteId);
    this.updateStatus();
  }

  /** 失敗したままの保存をもう一度送る */
  retryAll(): void {
    for (const noteId of [...this.failed]) {
      this.failed.delete(noteId);
      this.attempts.delete(noteId);
      void this.flush(noteId);
    }
  }

  hasUnsaved(): boolean {
    return this.pending.size > 0 || this.inFlight.size > 0;
  }

  private async flush(noteId: string): Promise<void> {
    const updates = this.pending.get(noteId);
    if (!updates || this.inFlight.has(noteId)) {
      this.updateStatus();
      return;
    }
    this.pending.delete(noteId);
    this.inFlight.add(noteId);
    this.updateStatus();

    try {
      const saved = await this.options.save(noteId, updates, this.baseUpdatedAt.get(noteId));
      this.baseUpdatedAt.set(noteId, saved.updatedAt);
      this.attempts.delete(noteId);
      this.options.onSaved(saved);
    } catch (e) {
      if (e instanceof ConflictError) {
        // 送れなかった変更（送信中に増えた分も含む）は呼び出し側で退避してもらう
        const unsaved = { ...updates, ...this.pending.get(noteId) };
        this.pending.delete(noteId);
        this.baseUpdatedAt.set(noteId, e.latest.updatedAt);
        this.options.onConflict(e.latest, unsaved);
      } else {
        // 送信中に入力された新しい値を優先して戻す
        this.pending.set(noteId, { ...updates, ...this.pending.get(noteId) });
        this.scheduleRetry(noteId);
      }
    } finally {
      this.inFlight.delete(noteId);
    }

    if (this.pending.has(noteId) && !this.retryTimers.has(noteId) && !this.failed.has(noteId)) {
      void this.flush(noteId);
    } else {
      this.updateStatus();
    }
  }

  private scheduleRetry(noteId: string): void {
    const attempt = this.attempts.get(noteId) ?? 0;
    const delay = this.retryDelaysMs[attempt];
    if (delay === undefined) {
      this.failed.add(noteId);
      return;
    }
    this.attempts.set(noteId, attempt + 1);
    this.retryTimers.set(
      noteId,
      setTimeout(() => {
        this.retryTimers.delete(noteId);
        void this.flush(noteId);
      }, delay)
    );
  }

  private clearRetry(noteId: string): void {
    const timer = this.retryTimers.get(noteId);
    if (timer) clearTimeout(timer);
    this.retryTimers.delete(noteId);
  }

  private updateStatus(): void {
    const next: SaveStatus = this.failed.size > 0 ? 'error' : this.hasUnsaved() ? 'saving' : 'saved';
    if (next !== this.status) {
      this.status = next;
      this.options.onStatusChange(next);
    }
  }
}
