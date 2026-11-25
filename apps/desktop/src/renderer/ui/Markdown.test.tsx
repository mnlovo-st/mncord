import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { isJumbo, Markdown, type MdContext } from './Markdown';

const ctx: MdContext = { isMention: (u) => (u === 'mnlovo' ? 'me' : u === 'noor' ? 'other' : null) };
const html = (t: string) => renderToStaticMarkup(<Markdown text={t} ctx={ctx} />);

describe('Markdown (security)', () => {
  it('never renders HTML from message text', () => {
    const out = html('<img src=x onerror=alert(1)><script>alert(1)</script>');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;script&gt;');
  });
  it('only http(s) links become links', () => {
    expect(html('[click](javascript:alert(1))')).not.toContain('<a');
    expect(html('[click](https://mncord.app)')).toContain('href="https://mncord.app"');
    expect(html('see https://example.com/path.')).toContain('href="https://example.com/path"');
    expect(html('data:text/html,<b>x</b>')).not.toContain('<a');
  });
  it('attributes cannot be broken out of', () => {
    const out = html('https://example.com/"onmouseover="alert(1)');
    expect(out).not.toMatch(/onmouseover="alert/);
  });
});

describe('Markdown (formatting)', () => {
  it('bold, italic, underline, strike, inline code', () => {
    const out = html('**b** *i* __u__ ~~s~~ `c`');
    expect(out).toContain('<strong');
    expect(out).toContain('<em>i</em>');
    expect(out).toContain('<u>u</u>');
    expect(out).toContain('<s>s</s>');
    expect(out).toContain('<code');
  });
  it('code blocks keep markdown literal', () => {
    const out = html('```js\nconst a = **not bold**;\n```');
    expect(out).toContain('<pre');
    expect(out).toContain('**not bold**');
    expect(out).not.toContain('<strong');
  });
  it('quotes, lists, headings', () => {
    expect(html('> quoted')).toContain('<blockquote');
    expect(html('- a\n- b')).toContain('<li>');
    expect(html('# Title')).toContain('role="heading"');
  });
  it('mentions only for known users; escapes work', () => {
    expect(html('hi @mnlovo')).toContain('@mnlovo</button>');
    expect(html('hi @stranger')).not.toContain('<button');
    expect(html('\\*not italic\\*')).toBe('*not italic*');
  });
  it('Arabic text passes through untouched', () => {
    expect(html('**مرحبا** بالجميع')).toContain('<strong class="font-bold">مرحبا</strong> بالجميع');
  });
  it('jumbo emoji', () => {
    expect(isJumbo('🔥🔥')).toBe(true);
    expect(isJumbo('🇦🇪')).toBe(true);
    expect(isJumbo('hi 🔥')).toBe(false);
  });
});
