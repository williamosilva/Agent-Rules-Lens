/**
 * Terminal presentation for `npm run install:local`. Kept apart from the
 * orchestration so the steps can be tested without a terminal, and so a pipe,
 * a CI log and a real console each get output they can actually read.
 */

export interface UiStream {
  write(text: string): void;
  isTTY: boolean;
}

export interface UiOptions {
  stream: UiStream;
  /** ANSI colours. Off for a pipe, a dumb terminal or NO_COLOR. */
  color: boolean;
  /** In-place spinner. Off whenever the stream is not a terminal. */
  animate: boolean;
  /** Milliseconds between spinner frames. */
  frameMs?: number;
}

export type StepOutcome = 'done' | 'failed' | 'skipped';

export interface StepHandle {
  finish(outcome: StepOutcome, label: string, trailing: string): void;
}

export interface Ui {
  header(title: string, subtitle: string): void;
  startStep(index: number, total: number, label: string): StepHandle;
  blank(): void;
  line(text: string): void;
  success(text: string): void;
  warning(text: string): void;
  error(text: string): void;
  muted(text: string): void;
  /** Clears any live animation. Safe to call twice. */
  stop(): void;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const MARKS: Record<StepOutcome, string> = {
  done: '✓',
  failed: '✗',
  skipped: '–'
};

const COLORS = {
  cyan: '[36m',
  green: '[32m',
  yellow: '[33m',
  red: '[31m',
  gray: '[90m',
  bold: '[1m',
  reset: '[0m'
} as const;

type ColorName = keyof Omit<typeof COLORS, 'reset'>;

/** Column the trailing duration is aligned to, when there is room for it. */
const LABEL_WIDTH = 46;

export function shouldUseColor(env: NodeJS.ProcessEnv, isTTY: boolean): boolean {
  // NO_COLOR is honoured whatever its value, per the convention.
  if (env['NO_COLOR'] !== undefined) {
    return false;
  }
  if (env['FORCE_COLOR'] !== undefined && env['FORCE_COLOR'] !== '0') {
    return true;
  }
  if (env['TERM'] === 'dumb') {
    return false;
  }
  return isTTY;
}

/** Animation needs a terminal; CI logs and pipes get static lines instead. */
export function shouldAnimate(env: NodeJS.ProcessEnv, isTTY: boolean): boolean {
  return isTTY && env['CI'] === undefined && env['TERM'] !== 'dumb';
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds < 60_000) {
    return `${(milliseconds / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.round((milliseconds % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function createUi(options: UiOptions): Ui {
  const { stream } = options;
  const frameMs = options.frameMs ?? 90;
  let timer: ReturnType<typeof setInterval> | undefined;
  let liveLine = '';

  const paint = (text: string, color: ColorName | undefined): string =>
    options.color && color !== undefined ? `${COLORS[color]}${text}${COLORS.reset}` : text;

  const clearLive = (): void => {
    if (liveLine.length > 0) {
      // Overwrite with spaces before returning, so a shorter line cannot leave
      // characters from the previous frame behind.
      stream.write(`\r${' '.repeat(liveLine.length)}\r`);
      liveLine = '';
    }
  };

  const stopTimer = (): void => {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  const stepPrefix = (index: number, total: number): string => `[${index}/${total}]`;

  const composeLine = (mark: string, prefix: string, label: string, trailing: string): string => {
    const body = `${mark} ${prefix} ${label}`;
    if (trailing.length === 0) {
      return body;
    }
    const padding = Math.max(1, LABEL_WIDTH - body.length);
    return `${body}${' '.repeat(padding)}${trailing}`;
  };

  return {
    header(title, subtitle) {
      stream.write(`${paint(title, 'bold')}\n${paint(subtitle, 'gray')}\n\n`);
    },

    startStep(index, total, label) {
      const prefix = stepPrefix(index, total);
      let frame = 0;

      if (options.animate) {
        const render = (): void => {
          clearLive();
          liveLine = `${SPINNER_FRAMES[frame % SPINNER_FRAMES.length] as string} ${prefix} ${label}`;
          stream.write(paint(liveLine, 'cyan'));
          frame += 1;
        };
        render();
        timer = setInterval(render, frameMs);
        // A spinner must never hold the process open on its own.
        timer.unref?.();
      }

      return {
        finish(outcome, finalLabel, trailing) {
          stopTimer();
          clearLive();
          const color: ColorName =
            outcome === 'done' ? 'green' : outcome === 'failed' ? 'red' : 'gray';
          const line = composeLine(MARKS[outcome], prefix, finalLabel, trailing);
          stream.write(
            `${paint(MARKS[outcome], color)}${line.slice(MARKS[outcome].length)}\n`
          );
        }
      };
    },

    blank() {
      clearLive();
      stream.write('\n');
    },

    line(text) {
      clearLive();
      stream.write(`${text}\n`);
    },

    success(text) {
      clearLive();
      stream.write(`${paint('✓', 'green')} ${text}\n`);
    },

    warning(text) {
      clearLive();
      stream.write(`${paint('!', 'yellow')} ${paint(text, 'yellow')}\n`);
    },

    error(text) {
      clearLive();
      stream.write(`${paint(text, 'red')}\n`);
    },

    muted(text) {
      clearLive();
      stream.write(`${paint(text, 'gray')}\n`);
    },

    stop() {
      stopTimer();
      clearLive();
    }
  };
}
