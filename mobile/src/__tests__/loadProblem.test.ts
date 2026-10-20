import { describe, expect, it } from 'vitest';
import { problemText } from '../loadProblem';

describe('problemText', () => {
  it('says what to do about the storage being held by another tab', () => {
    expect(problemText(new Error('Invalid VFS state'))).toMatch(/another tab/);
  });

  it('keeps any other message as one sentence', () => {
    expect(problemText(new Error('disk I/O error'))).toBe('disk I/O error.');
    expect(problemText(new Error('Out of space.'))).toBe('Out of space.');
  });

  it('never shows an empty or non-error value as it is', () => {
    expect(problemText({})).toBe('Something went wrong reading your log.');
    expect(problemText(new Error('  '))).toBe('Something went wrong reading your log.');
  });
});
