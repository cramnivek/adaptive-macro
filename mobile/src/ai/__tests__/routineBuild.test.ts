import { describe, expect, it } from 'vitest';
import { buildRoutinePrompt, ROUTINE_BUILD_SYSTEM } from '../routineBuild';

describe('buildRoutinePrompt', () => {
  it('names each routine and lays out its slots in order', () => {
    const prompt = buildRoutinePrompt(['push'], []);

    expect(prompt).toContain('Routine named exactly "Push"');
    const press = prompt.indexOf('1. a horizontal chest press');
    const overhead = prompt.indexOf('2. a vertical overhead press');
    const triceps = prompt.indexOf('5. a triceps exercise');
    expect(press).toBeGreaterThan(-1);
    expect(overhead).toBeGreaterThan(press);
    expect(triceps).toBeGreaterThan(overhead);
  });

  it('asks for one routine per focus, in the order picked', () => {
    const prompt = buildRoutinePrompt(['pull', 'push', 'legs'], []);

    expect(prompt).toContain('Write 3 routines.');
    expect(prompt.indexOf('"Pull"')).toBeLessThan(prompt.indexOf('"Push"'));
    expect(prompt.indexOf('"Push"')).toBeLessThan(prompt.indexOf('"Legs"'));
    expect(prompt).toContain('a hip hinge');
  });

  it('says "one routine" for one', () => {
    expect(buildRoutinePrompt(['full'], [])).toMatch(/^Write one routine\./);
    expect(buildRoutinePrompt(['full'], [])).toContain('"Full body"');
  });

  it('offers the exercises the person already logs, to be named exactly', () => {
    const prompt = buildRoutinePrompt(['upper'], ['Bench Press (Barbell)', 'Lat Pulldown (Cable)']);

    expect(prompt).toContain('- Bench Press (Barbell)\n- Lat Pulldown (Cable)');
    expect(prompt).toContain('written exactly as here');
  });

  it('keeps the most-used sixty and drops the rest', () => {
    const known = Array.from({ length: 80 }, (_, i) => `Exercise ${i + 1}`);
    const prompt = buildRoutinePrompt(['legs'], known);

    expect(prompt.endsWith('- Exercise 60')).toBe(true);
    expect(prompt).not.toContain('Exercise 61');
  });

  it('says nothing about history to someone with none', () => {
    expect(buildRoutinePrompt(['lower'], [])).not.toContain('already logs');
  });
});

describe('ROUTINE_BUILD_SYSTEM', () => {
  it('prescribes working sets in ranges the import rules accept', () => {
    // The answer goes through toRoutineDrafts, which caps sets at ten and keeps
    // reps as written; these are the numbers the prompt commits to.
    expect(ROUTINE_BUILD_SYSTEM).toContain('3 or 4 sets');
    expect(ROUTINE_BUILD_SYSTEM).toContain('Never list the same exercise twice');
  });
});
