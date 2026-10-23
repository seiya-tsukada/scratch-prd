import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownRenderer } from './markdown';

const render = (content: string) => renderToStaticMarkup(<MarkdownRenderer content={content} />);

describe('MarkdownRenderer', () => {
  it('空なら「内容がありません」', () => {
    expect(render('')).toContain('内容がありません');
  });

  it('見出し・リスト・チェックリスト・引用を変換する', () => {
    const html = render('# H1\n## H2\n- item\n1. num\n- [x] done\n> quote');
    expect(html).toContain('<h1');
    expect(html).toContain('<h2');
    expect(html).toMatch(/<li[^>]*list-disc[^>]*>item<\/li>/);
    expect(html).toMatch(/<li[^>]*list-decimal[^>]*>num<\/li>/);
    expect(html).toMatch(/<input[^>]*checked=""/);
    expect(html).toContain('<blockquote');
  });

  it('コードブロックの中身は変換しない', () => {
    const html = render('```ts\n# not heading\n```');
    expect(html).not.toContain('<h1');
    expect(html).toContain('# not heading');
  });

  it('インラインの太字・コードと分類タグを変換する', () => {
    const html = render('**bold** `code` 事実 [FACT] 案 [PROPOSAL]');
    expect(html).toContain('<strong');
    expect(html).toContain('<code');
    expect(html).toContain('>FACT</span>');
    expect(html).not.toContain('[FACT]');
  });

  it('[OPEN_QUESTION] は OPEN QUESTION と表示する', () => {
    expect(render('論点 [OPEN_QUESTION]')).toContain('>OPEN QUESTION</span>');
  });
});
