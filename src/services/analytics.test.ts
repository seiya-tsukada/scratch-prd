import { afterEach, describe, expect, it, vi } from 'vitest';
import { track } from './analytics';

afterEach(() => vi.unstubAllGlobals());

describe('track', () => {
  it('イベント名とプロパティを keepalive で送る', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    track({ name: 'signup_prompt_shown', properties: { trigger: 'quota' } });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/events');
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin', keepalive: true });
    expect(JSON.parse(init.body)).toEqual({ name: 'signup_prompt_shown', properties: { trigger: 'quota' } });
  });

  it('送信に失敗しても例外を投げない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(() => track({ name: 'app_opened' })).not.toThrow();
    vi.stubGlobal('fetch', () => {
      throw new Error('sync failure');
    });
    expect(() => track({ name: 'app_opened' })).not.toThrow();
  });
});
