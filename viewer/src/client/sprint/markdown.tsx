/**
 * A small, read-only markdown renderer for text that comes straight from a
 * phase file: task cells, goals, criteria, the phase intro, unknown sprint
 * sections and trailing sections (Risk Mitigations, Scope Guard).
 *
 * - {@link Inline}: `code` spans as code chips, `**strong**`, and
 *   `[text](url)` as its text only (the viewer never leaves the app for a
 *   phase file's links). `\|` (an escaped table pipe) shows as `|`.
 * - {@link MarkdownBlocks}: paragraphs, bullet and numbered lists, headings
 *   (as sub-headings), fenced code, and `---` dividers (dropped). Lines it
 *   doesn't recognize are kept as paragraph text, so nothing is lost.
 *
 * No HTML from the file is ever interpreted: everything renders as text.
 */
import type { ReactNode } from 'react';

const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\([^)\s]*\)/g;

function unescape(text: string): string {
  return text.replace(/\\\|/g, '|');
}

/** One line of phase-file text with its inline markdown rendered. */
export function Inline({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) out.push(unescape(text.slice(last, at)));
    if (match[1] !== undefined) out.push(<code key={key++}>{unescape(match[1])}</code>);
    else if (match[2] !== undefined) out.push(<strong key={key++}>{unescape(match[2])}</strong>);
    else if (match[3] !== undefined) out.push(unescape(match[3]));
    last = at + match[0].length;
  }
  if (last < text.length) out.push(unescape(text.slice(last)));
  return <>{out}</>;
}

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: { text: string; depth: number }[] }
  | { kind: 'h'; text: string }
  | { kind: 'pre'; text: string };

const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const NUMBERED = /^(\s*)\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

/** Split raw markdown into blocks. Exported for tests. */
export function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  let list: Extract<Block, { kind: 'ul' | 'ol' }> | null = null;

  const flushPara = (): void => {
    if (para.length > 0) blocks.push({ kind: 'p', text: para.join(' ') });
    para = [];
  };
  const flushList = (): void => {
    if (list) blocks.push(list);
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (FENCE.test(line)) {
      flushPara();
      flushList();
      const code: string[] = [];
      for (i++; i < lines.length && !FENCE.test(lines[i]!); i++) code.push(lines[i]!);
      blocks.push({ kind: 'pre', text: code.join('\n') });
      continue;
    }
    if (line.trim() === '') {
      flushPara();
      flushList();
      continue;
    }
    if (RULE.test(line)) {
      flushPara();
      flushList();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flushPara();
      flushList();
      blocks.push({ kind: 'h', text: heading[1]!.trim() });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      flushPara();
      const kind = bullet ? 'ul' : 'ol';
      const depth = item[1]!.replace(/\t/g, '  ').length >= 2 ? 1 : 0;
      const current = list as Extract<Block, { kind: 'ul' | 'ol' }> | null;
      if (!current || (current.kind !== kind && depth === 0)) {
        flushList();
        list = { kind, items: [] };
      }
      list!.items.push({ text: item[2]!.trim(), depth });
      continue;
    }
    const open = list as Extract<Block, { kind: 'ul' | 'ol' }> | null;
    if (open && /^\s+/.test(line)) {
      // A wrapped list item.
      const lastItem = open.items[open.items.length - 1]!;
      lastItem.text = `${lastItem.text} ${line.trim()}`;
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return blocks;
}

/**
 * Raw phase-file markdown as blocks. Lists use the `ul.plain` style (square
 * bullets); headings inside a body render as label-style `h3`s.
 */
export function MarkdownBlocks({ body }: { body: string }) {
  const blocks = parseBlocks(body);
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'p':
            return (
              <p key={i}>
                <Inline text={block.text} />
              </p>
            );
          case 'h':
            return (
              <h3 key={i} className="md-h">
                <Inline text={block.text} />
              </h3>
            );
          case 'pre':
            return (
              <pre key={i} className="md-pre">
                <code>{block.text}</code>
              </pre>
            );
          case 'ul':
          case 'ol': {
            const Tag = block.kind;
            return (
              <Tag key={i} className={block.kind === 'ul' ? 'plain' : 'plain ordered'}>
                {block.items.map((item, j) => (
                  <li key={j} className={item.depth > 0 ? 'nested' : undefined}>
                    <Inline text={item.text} />
                  </li>
                ))}
              </Tag>
            );
          }
        }
      })}
    </>
  );
}
