import { describe, expect, it } from 'vitest';
import { buildRoutinePrompt, isBodyweightOnly, missingEquipment, ROUTINE_BUILD_SYSTEM } from '../routineBuild';

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

describe('equipment', () => {
  it('lists everything as available by default, and nothing as missing', () => {
    const prompt = buildRoutinePrompt(['push'], []);
    expect(prompt).toContain('a barbell with plates, a rack and a bench');
    expect(prompt).toContain('a pull-up bar');
    expect(prompt).not.toContain('Not available');
  });

  it('names what is missing as well as what is there', () => {
    const prompt = buildRoutinePrompt(['pull'], [], { equipment: ['dumbbells'], level: 'intermediate' });
    expect(prompt).toContain('Equipment: dumbbells and an adjustable bench, and bodyweight.');
    expect(prompt).toContain('Not available: barbell with plates, a rack and a bench, cable station, weight machines, pull-up bar');
    expect(prompt).toContain('never use an exercise that needs them');
  });

  it('says how to fill a slot whose usual tool is missing', () => {
    const prompt = buildRoutinePrompt(['pull'], [], { equipment: ['dumbbells', 'machines'], level: 'intermediate' });
    expect(prompt).toContain('a pullover or a row for a vertical pull');
  });

  it('asks for harder variations rather than load when there is nothing at all', () => {
    const prompt = buildRoutinePrompt(['upper'], [], { equipment: [], level: 'intermediate' });
    expect(prompt).toContain('Every exercise must be bodyweight');
  });

  it('offers logged exercises only where they suit the equipment, after saying what that is', () => {
    const prompt = buildRoutinePrompt(['push'], ['Bench Press (Barbell)'], { equipment: ['dumbbells'], level: 'intermediate' });
    expect(prompt).toContain('needs only the equipment above');
    expect(prompt.indexOf('Not available')).toBeLessThan(prompt.indexOf('- Bench Press (Barbell)'));
  });
});

describe('level', () => {
  it('steers a beginner to movements that are hard to do badly, with lighter volume', () => {
    const prompt = buildRoutinePrompt(['legs'], [], { equipment: ['barbell', 'dumbbells', 'machines'], level: 'beginner' });
    expect(prompt).toContain('Level: beginner');
    expect(prompt).toContain('over technical barbell lifts');
    expect(prompt).toContain('2 or 3 sets');
  });

  it('gives an advanced lifter a heavy first compound', () => {
    const prompt = buildRoutinePrompt(['push'], [], { equipment: ['barbell'], level: 'advanced' });
    expect(prompt).toContain('4 or 5 sets of "3-6" or "4-6"');
  });

  it('leaves an intermediate on the default ranges', () => {
    expect(buildRoutinePrompt(['push'], [])).toContain('Use the set and rep ranges above');
  });
});

describe('isBodyweightOnly', () => {
  it('is true with nothing, or only a bar to hang from', () => {
    expect(isBodyweightOnly([])).toBe(true);
    expect(isBodyweightOnly(['pullUpBar'])).toBe(true);
  });

  it('is false once anything adds load', () => {
    expect(isBodyweightOnly(['dumbbells'])).toBe(false);
    expect(isBodyweightOnly(['pullUpBar', 'cables'])).toBe(false);
  });
});

describe('missingEquipment', () => {
  it('catches an exercise that needs something the person does not have', () => {
    expect(missingEquipment('Pull-Up', ['dumbbells'])).toEqual(['pullUpBar']);
    expect(missingEquipment('Lat Pulldown (Cable)', ['dumbbells'])).toEqual(['cables']);
    expect(missingEquipment('Barbell Back Squat', ['dumbbells'])).toEqual(['barbell']);
    expect(missingEquipment('Leg Press', ['barbell'])).toEqual(['machines']);
  });

  it('is quiet when the equipment is there', () => {
    expect(missingEquipment('Pull-Up', ['pullUpBar'])).toEqual([]);
    expect(missingEquipment('Bench Press (Barbell)', ['barbell'])).toEqual([]);
  });

  it('does not cry wolf on names that only sound like a machine', () => {
    expect(missingEquipment('Dumbbell Lying Leg Curl', ['dumbbells'])).toEqual([]);
    expect(missingEquipment('Goblet Squat', ['dumbbells'])).toEqual([]);
    expect(missingEquipment('Dumbbell Pullover', ['dumbbells'])).toEqual([]);
  });
});
