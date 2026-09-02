import { describe, expect, it, vi } from 'vitest';
import {
  createUi,
  formatDuration,
  shouldAnimate,
  shouldUseColor,
  type UiStream
} from '../../src/local/installUi';

const ESC = '';

function capture(isTTY: boolean): UiStream & { text: () => string } {
  const chunks: string[] = [];
  return {
    isTTY,
    write: (text) => void chunks.push(text),
    text: () => chunks.join('')
  };
}

describe('colour decisions', () => {
  it('uses colour on a terminal', () => {
    expect(shouldUseColor({}, true)).toBe(true);
  });

  it('drops colour when the output is piped', () => {
    expect(shouldUseColor({}, false)).toBe(false);
  });

  it.each([[''], ['0'], ['1'], ['always']])('honours NO_COLOR=%j', (value) => {
    expect(shouldUseColor({ NO_COLOR: value }, true)).toBe(false);
  });

  it('honours FORCE_COLOR for a pipe', () => {
    expect(shouldUseColor({ FORCE_COLOR: '1' }, false)).toBe(true);
    expect(shouldUseColor({ FORCE_COLOR: '0' }, false)).toBe(false);
  });

  it('drops colour on a dumb terminal', () => {
    expect(shouldUseColor({ TERM: 'dumb' }, true)).toBe(false);
  });
});

describe('animation decisions', () => {
  it('animates only on a terminal', () => {
    expect(shouldAnimate({}, true)).toBe(true);
    expect(shouldAnimate({}, false)).toBe(false);
  });

  it('never animates in CI or on a dumb terminal', () => {
    expect(shouldAnimate({ CI: 'true' }, true)).toBe(false);
    expect(shouldAnimate({ TERM: 'dumb' }, true)).toBe(false);
  });
});

describe('durations', () => {
  it.each([
    [95, '0.1s'],
    [1400, '1.4s'],
    [59_900, '59.9s'],
    [61_000, '1m 1s']
  ])('renders %ims as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('rendering without a terminal', () => {
  it('prints one static line per step, with no control characters', () => {
    const stream = capture(false);
    const ui = createUi({ stream, color: false, animate: false });
    ui.header('Agent Rules Lens', 'Local installation');
    ui.startStep(1, 4, 'Building local tools...').finish('done', 'Local tools built', '0.2s');
    ui.startStep(2, 4, 'Compiling...').finish('failed', 'Extension compiled', '0.1s');
    ui.startStep(4, 4, 'Installing...').finish('skipped', 'Installation skipped', 'dry run');
    ui.stop();

    const text = stream.text();
    expect(text).not.toContain('\r');
    expect(text).not.toContain(ESC);
    expect(text).not.toContain('⠋');
    expect(text).toContain('✓ [1/4] Local tools built');
    expect(text).toContain('✗ [2/4] Extension compiled');
    expect(text).toContain('– [4/4] Installation skipped');
    expect(text).toContain('dry run');
  });

  it('aligns the trailing column', () => {
    const stream = capture(false);
    const ui = createUi({ stream, color: false, animate: false });
    ui.startStep(1, 4, 'x').finish('done', 'Local tools built', '0.2s');
    ui.startStep(2, 4, 'x').finish('done', 'VSIX packaged', '1.4s');
    const lines = stream.text().trimEnd().split('\n');
    expect(lines[0]?.indexOf('0.2s')).toBe(lines[1]?.indexOf('1.4s'));
  });
});

describe('rendering on a terminal', () => {
  it('animates in place and then replaces the spinner with a mark', () => {
    vi.useFakeTimers();
    try {
      const stream = capture(true);
      const ui = createUi({ stream, color: true, animate: true, frameMs: 10 });
      const step = ui.startStep(1, 4, 'Building local tools...');
      vi.advanceTimersByTime(35);
      const during = stream.text();
      expect(during).toContain('⠋');
      expect(during).toContain('\r');
      expect(during).toContain(`${ESC}[36m`);

      step.finish('done', 'Local tools built', '0.2s');
      ui.stop();
      const after = stream.text();
      expect(after).toContain(`${ESC}[32m✓`);
      expect(after.trimEnd().endsWith('0.2s')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops the timer when the step finishes, so nothing keeps drawing', () => {
    vi.useFakeTimers();
    try {
      const stream = capture(true);
      const ui = createUi({ stream, color: false, animate: true, frameMs: 10 });
      const step = ui.startStep(1, 4, 'Working...');
      step.finish('done', 'Done', '0.1s');
      const settled = stream.text();
      vi.advanceTimersByTime(500);
      expect(stream.text()).toBe(settled);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears a live line on stop, leaving no spinner frame behind', () => {
    vi.useFakeTimers();
    try {
      const stream = capture(true);
      const ui = createUi({ stream, color: false, animate: true, frameMs: 10 });
      ui.startStep(1, 4, 'Working...');
      vi.advanceTimersByTime(15);
      ui.stop();
      // Everything after the last carriage return is blank.
      const tail = stream.text().split('\r').pop() ?? '';
      expect(tail.trim()).toBe('');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('paints each severity with its own colour', () => {
    const stream = capture(true);
    const ui = createUi({ stream, color: true, animate: false });
    ui.success('ok');
    ui.warning('careful');
    ui.error('broken');
    ui.muted('detail');
    const text = stream.text();
    expect(text).toContain(`${ESC}[32m✓`);
    expect(text).toContain(`${ESC}[33m`);
    expect(text).toContain(`${ESC}[31m`);
    expect(text).toContain(`${ESC}[90m`);
  });

  it('emits no escape codes when colour is off', () => {
    const stream = capture(true);
    const ui = createUi({ stream, color: false, animate: false });
    ui.header('Agent Rules Lens', 'Local installation');
    ui.success('ok');
    ui.warning('careful');
    ui.error('broken');
    ui.muted('detail');
    expect(stream.text()).not.toContain(ESC);
  });
});
