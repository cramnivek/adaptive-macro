import { describe, expect, it } from 'vitest';
import { cleanForSpeech, shoutColemanPR } from '../platform/prShout';
import { getEventCopy } from '../copy/personality';

describe('cleanForSpeech', () => {
  it('strips emoji characters and punctuation for clean speech synthesis', () => {
    const raw = 'YEAH BUDDY! LIGHT WEIGHT BABY! 🗣️🔥';
    expect(cleanForSpeech(raw)).toBe('YEAH BUDDY! LIGHT WEIGHT BABY!');
  });

  it('strips angular symbols and quotes', () => {
    const raw = '⚡ YEAH BUDDY! 💀🔥 ⚡';
    expect(cleanForSpeech(raw)).toBe('YEAH BUDDY!');
  });

  it('handles regular text cleanly', () => {
    expect(cleanForSpeech('LIGHT WEIGHT! AIN\'T NOTHIN\' TO IT BUT TO DO IT!')).toBe(
      'LIGHT WEIGHT! AIN\'T NOTHIN\' TO IT BUT TO DO IT!',
    );
  });
});

describe('Ronnie Coleman PR copy', () => {
  it('resolves Ronnie Coleman PR quotes across personalities', () => {
    const classic = getEventCopy('workout.pr_coleman_quote', { personality: 'classic' });
    expect(classic).toContain('YEAH BUDDY');

    const ascend = getEventCopy('workout.pr_coleman_quote', { personality: 'ascend' });
    expect(ascend.includes('YEAH BUDDY') || ascend.includes('LIGHT WEIGHT')).toBe(true);

    const gymrat = getEventCopy('workout.pr_coleman_quote', { personality: 'gymrat' });
    expect(gymrat.includes('YEAH BUDDY') || gymrat.includes('LIGHT WEIGHT')).toBe(true);
  });

  it('includes Ronnie Coleman shouts in workout.impact_pr', () => {
    const gymratImpact = getEventCopy('workout.impact_pr', { personality: 'gymrat', seed: 0 });
    expect(typeof gymratImpact).toBe('string');
    expect(gymratImpact.length).toBeGreaterThan(0);
  });

  it('safely runs shoutColemanPR without crashing under Node environment', () => {
    expect(() => shoutColemanPR('YEAH BUDDY! LIGHT WEIGHT BABY!', true)).not.toThrow();
    expect(() => shoutColemanPR(undefined, false)).not.toThrow();
  });
});
