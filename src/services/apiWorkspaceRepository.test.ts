import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiWorkspaceRepository, ConflictError } from './apiWorkspaceRepository';
import { ApiError } from './apiClient';

const repo = new ApiWorkspaceRepository();

const respond = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const mockFetch = (status: number, body?: unknown) => {
  const fetchMock = vi.fn().mockImplementation(async () => respond(status, body));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const lastCall = (fetchMock: ReturnType<typeof vi.fn>) => {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined, init };
};

afterEach(() => vi.unstubAllGlobals());

describe('ApiWorkspaceRepository', () => {
  it('bootstrap は前回のプロジェクトを指定し、ペインの noteId を null に揃える', async () => {
    const fetchMock = mockFetch(200, {
      projects: [],
      currentProjectId: 'p1',
      data: {
        sections: [],
        notes: [],
        prds: [],
        preferences: { userId: 'u', projectId: 'p1', paneCount: 2, panes: [{ id: 'pane-0' }], activePaneId: 'pane-0' },
      },
    });

    const result = await repo.bootstrap('p 1');

    expect(lastCall(fetchMock).url).toBe('/api/workspace/bootstrap?projectId=p%201');
    expect(lastCall(fetchMock).init.credentials).toBe('same-origin');
    expect(result.data?.preferences.panes).toEqual([{ id: 'pane-0', noteId: null }]);
  });

  it('メモの部分更新は PATCH で baseUpdatedAt を送る', async () => {
    const fetchMock = mockFetch(200, { id: 'n1' });
    await repo.updateNote('n1', { content: 'x' }, '2026-01-01T00:00:00.123456Z');
    expect(lastCall(fetchMock)).toMatchObject({
      url: '/api/notes/n1',
      method: 'PATCH',
      body: { content: 'x', baseUpdatedAt: '2026-01-01T00:00:00.123456Z' },
    });
  });

  it('409 は最新のメモを持つ ConflictError になる', async () => {
    const latest = { id: 'n1', content: 'other tab' };
    mockFetch(409, { detail: { code: 'conflict', note: latest } });
    const error = await repo.updateNote('n1', { content: 'mine' }, 'old').catch((e) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.latest).toEqual(latest);
  });

  it('その他のエラーは ApiError（code つき）', async () => {
    mockFetch(422, { detail: { code: 'limit_exceeded', resource: 'notes', limit: 2000 } });
    const error = await repo.createNote('p1', 's1').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('limit_exceeded');
  });

  it('PRD は新規作成が POST、更新が PUT で、余計な項目を送らない', async () => {
    const fetchMock = mockFetch(201, { id: 'prd1' });
    const prd = {
      title: 'T',
      content: 'c',
      generationMode: 'suggest' as const,
      detailLevel: 'standard' as const,
      sourceNoteIds: ['n1'],
      facts: [],
      proposals: [],
      openQuestions: [],
      contradictions: [],
    };
    await repo.createPrd('p1', { ...prd, versions: [], userId: 'u' } as typeof prd);
    expect(lastCall(fetchMock)).toMatchObject({ url: '/api/projects/p1/prds', method: 'POST', body: prd });

    await repo.savePrdVersion('prd1', prd);
    expect(lastCall(fetchMock)).toMatchObject({ url: '/api/prds/prd1', method: 'PUT', body: prd });
  });

  it('削除は 204 を受け取って undefined を返す', async () => {
    const fetchMock = mockFetch(204);
    await expect(repo.deleteNote('n1')).resolves.toBeUndefined();
    expect(lastCall(fetchMock)).toMatchObject({ url: '/api/notes/n1', method: 'DELETE' });
  });
});
