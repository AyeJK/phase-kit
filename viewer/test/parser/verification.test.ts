import { describe, expect, it } from 'vitest';
import type { VerificationConfig } from '../../src/core/model.js';
import { splitLines } from '../../src/core/parser/lines.js';
import { emptyVerification, normalizeVerificationKey, parseVerification } from '../../src/core/parser/verification.js';

const FILE = 'Phase-1-Test.md';

function parse(...lines: string[]) {
  return parseVerification(splitLines(lines.join('\n')), 40, FILE);
}

const config = (fields: Partial<VerificationConfig>): VerificationConfig => ({ ...emptyVerification(40), ...fields });

describe('parseVerification', () => {
  it('reads every documented key', () => {
    const { value, warnings } = parse(
      '- cli: npm run check',
      '- ui: /settings/profile, /library',
      '- skills: visual-qa-testing, responsive-testing',
      '- viewports: 375, 428, 768, 1280, 1536',
      '- skip-ui: false',
      '- assert: Profile form saves without a full reload; validation errors appear inline',
    );
    expect(warnings).toEqual([]);
    expect(value).toEqual(
      config({
        cli: 'npm run check',
        ui: ['/settings/profile', '/library'],
        skills: ['visual-qa-testing', 'responsive-testing'],
        viewports: [375, 428, 768, 1280, 1536],
        skipUi: false,
        assert: ['Profile form saves without a full reload; validation errors appear inline'],
      }),
    );
  });

  it('starts from an empty config with the heading line', () => {
    expect(parse('')).toEqual({ value: emptyVerification(40), warnings: [] });
    expect(emptyVerification()).toEqual({ ui: [], skills: [], viewports: [], assert: [], extra: {}, line: 0 });
  });

  it('splits on the first colon only, so values may contain colons', () => {
    const { value } = parse('- assert: Status reads: "Saved: 3 items"', '- cli: node -e "console.log(1)" && echo a:b');
    expect(value.assert).toEqual(['Status reads: "Saved: 3 items"']);
    expect(value.cli).toBe('node -e "console.log(1)" && echo a:b');
  });

  it('collects repeated assert, ui, skills and viewports keys; cli and skip-ui keep the last', () => {
    const { value, warnings } = parse(
      '- assert: one',
      '- ui: /a',
      '- assert: two',
      '- ui: /b',
      '- skills: a',
      '- skills: b',
      '- viewports: 375',
      '- viewports: 1280',
      '- cli: first',
      '- cli: second',
      '- skip-ui: true',
      '- skip-ui: false',
    );
    expect(warnings).toEqual([]);
    expect(value).toEqual(
      config({ assert: ['one', 'two'], ui: ['/a', '/b'], skills: ['a', 'b'], viewports: [375, 1280], cli: 'second', skipUi: false }),
    );
  });

  it('reads nested bullets under a key as more values', () => {
    const { value, warnings } = parse('- assert:', '  - Grid shows: every book', '  - No layout break', '- ui:', '  - /a', '  - /b, /c');
    expect(warnings).toEqual([]);
    expect(value.assert).toEqual(['Grid shows: every book', 'No layout break']);
    expect(value.ui).toEqual(['/a', '/b', '/c']);
  });

  it('joins indented continuation lines onto the value', () => {
    const { value } = parse('- assert: A long check that', '  wraps onto a second line');
    expect(value.assert).toEqual(['A long check that wraps onto a second line']);
  });

  it('treats keys case-insensitively and tolerates emphasis, spacing and small slips', () => {
    const { value, warnings } = parse(
      '- CLI: npm test',
      '- Skip-UI: TRUE',
      '- **UI:** /x',
      '- `skills`: a',
      '- Viewport: 375px, 768 px',
      '* Asserts: ok',
    );
    expect(warnings).toEqual([]);
    expect(value).toEqual(config({ cli: 'npm test', skipUi: true, ui: ['/x'], skills: ['a'], viewports: [375, 768], assert: ['ok'] }));
    expect(parse('- skip_ui: yes').value.skipUi).toBe(true);
    expect(parse('- Skip UI: no').value.skipUi).toBe(false);
    expect(normalizeVerificationKey(' **Skip_UI** ')).toBe('skip-ui');
  });

  it('unwraps values written in backticks', () => {
    const { value } = parse('- cli: `npm run check`', '- ui: `/a`, `/b`', '- skip-ui: `true`');
    expect(value).toEqual(config({ cli: 'npm run check', ui: ['/a', '/b'], skipUi: true }));
  });

  it('keeps unknown keys in extra under the normalized key, last value wins', () => {
    const { value, warnings } = parse('- timeout: 30', '- Base URL: http://localhost:5173', '- timeout: 60');
    expect(warnings).toEqual([]);
    expect(value.extra).toEqual({ timeout: '60', 'base-url': 'http://localhost:5173' });
    expect(Object.getPrototypeOf(value.extra)).toBe(Object.prototype);
    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
  });

  it('drops non-numeric viewports with a warning on their line', () => {
    const { value, warnings } = parse('- viewports: 375, wide, 1280', '- viewports: 375–1536');
    expect(value.viewports).toEqual([375, 1280]);
    expect(warnings.map((w) => [w.line, w.raw])).toEqual([
      [1, '- viewports: 375, wide, 1280'],
      [2, '- viewports: 375–1536'],
    ]);
    expect(warnings[0]!.message).toContain('"wide"');
    expect(warnings[1]!.message).toContain('"375–1536"');
  });

  it('warns about a skip-ui that is not a boolean and leaves skipUi unset', () => {
    const { value, warnings } = parse('- skip-ui: maybe');
    expect(value.skipUi).toBeUndefined();
    expect(warnings).toEqual([expect.objectContaining({ file: FILE, line: 1, raw: '- skip-ui: maybe' })]);
    expect(warnings[0]!.message).toMatch(/true or false/);
  });

  it('reads key: value lines written without bullets', () => {
    const { value, warnings } = parse('cli: npm test', 'skip-ui: true');
    expect(warnings).toEqual([]);
    expect(value).toEqual(config({ cli: 'npm test', skipUi: true }));
  });

  it('warns about lines that are not key: value pairs and keys with no value', () => {
    const { value, warnings } = parse('- just prose', '- cli:', '- assert:', 'Run this: stuff');
    expect(value.cli).toBeUndefined();
    expect(value.assert).toEqual([]);
    expect(value.extra).toEqual({ 'run-this': 'stuff' });
    expect(warnings.map((w) => w.line)).toEqual([1, 2, 3]);
    expect(warnings[0]!.message).toMatch(/key: value/);
    expect(warnings[1]!.message).toMatch(/"cli" has no value/);
  });
});
