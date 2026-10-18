import { describe, expect, it } from 'vitest';
import { impactContent } from '../setImpact';

describe('impactContent', () => {
  it('reads a weighted set the way you would say it', () => {
    expect(impactContent(100, 8, 'normal').figure).toBe('100 × 8');
  });

  it('keeps one decimal on a fractional weight', () => {
    expect(impactContent(102.5, 8, 'normal').figure).toBe('102.5 × 8');
  });

  it('drops the decimal on a whole weight rather than printing 100.0', () => {
    expect(impactContent(100, 5, 'normal').figure).not.toContain('.');
  });

  it('rounds a weight carrying float noise to one decimal', () => {
    expect(impactContent(102.50000000000001, 8, 'normal').figure).toBe('102.5 × 8');
  });

  it('says BW for a bodyweight set rather than printing a zero', () => {
    expect(impactContent(null, 12, 'normal').figure).toBe('BW × 12');
  });

  it('distinguishes a warm-up from a working set', () => {
    expect(['WARM-UP', 'WARMED UP']).toContain(impactContent(60, 10, 'warmup').verdict);
    expect(['DONE', 'LOCKED IN', 'COUNT IT']).toContain(impactContent(100, 8, 'normal').verdict);
  });

  it('has a verdict for every set type the engine defines', () => {
    for (const setType of ['normal', 'warmup', 'dropset', 'failure'] as const) {
      expect(impactContent(80, 6, setType).verdict).not.toBe('');
    }
  });

  it('proclaims NEW PR! when a working set is an all-time PR', () => {
    expect(['NEW PR!', 'NEW PR! 🔥', 'NEW BEST!']).toContain(
      impactContent(100, 8, 'normal', true).verdict,
    );
    expect(['NEW PR!', 'NEW PR! 🔥', 'NEW BEST!']).toContain(
      impactContent(100, 8, 'failure', true).verdict,
    );
    // Warmups cannot be PRs:
    expect(['WARM-UP', 'WARMED UP']).toContain(impactContent(100, 8, 'warmup', true).verdict);
  });

  it('reflects gymrat and classic personality modes in verdicts', () => {
    const gymratPR = impactContent(120, 5, 'normal', true, 'gymrat');
    expect(gymratPR.verdict).toMatch(/PR|COOKED|UNSTOPPABLE/);

    const gymratNormal = impactContent(100, 8, 'normal', false, 'gymrat');
    expect(gymratNormal.verdict).toBeTruthy();

    const classicFailure = impactContent(100, 8, 'failure', false, 'classic');
    expect(classicFailure.verdict).toBe('TO FAILURE');
  });
});
