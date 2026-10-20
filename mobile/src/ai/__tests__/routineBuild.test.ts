import { describe, expect, it } from 'vitest';
import {
  applyPrescription,
  buildRoutinePrompt,
  estimateMinutes,
  focusesFromCounts,
  isBodyweightOnly,
  missingEquipment,
  PRESCRIPTION,
  ROUTINE_BUILD_SYSTEM,
  ROUTINE_FOCUSES,
  routineNames,
  slotsFor,
  TRAINING_LEVELS,
} from '../routineBuild';

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

  it('letters a repeated day and asks the second to vary its exercises', () => {
    const prompt = buildRoutinePrompt(['push', 'pull', 'push'], []);

    expect(prompt).toContain('Write 3 routines.');
    expect(prompt).toContain('Routine named exactly "Push A"');
    expect(prompt).toContain('Routine named exactly "Pull"');
    expect(prompt).toContain('Routine named exactly "Push B"');
    expect(prompt).toContain('different exercises from "Push A"');
    // Only the repeat is asked to differ.
    expect(prompt.match(/different exercises from/g)).toHaveLength(1);
  });

  it('says nothing about history to someone with none', () => {
    expect(buildRoutinePrompt(['lower'], [])).not.toContain('already logs');
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

const totalSets = (focus: (typeof ROUTINE_FOCUSES)[number], level: (typeof TRAINING_LEVELS)[number]) =>
  slotsFor(focus, level).reduce((sum, slot) => sum + PRESCRIPTION[level][slot.role].sets, 0);

describe('level sets the volume, not the model', () => {
  // The bug this replaces: a beginner and an advanced lifter got the same six
  // exercises and 18 versus 19 sets, because volume was left to the model.
  it('gives each level more work than the one below, for every day', () => {
    for (const focus of ROUTINE_FOCUSES) {
      const beginner = totalSets(focus, 'beginner');
      const intermediate = totalSets(focus, 'intermediate');
      const advanced = totalSets(focus, 'advanced');
      expect(intermediate, focus).toBeGreaterThan(beginner + 2);
      expect(advanced, focus).toBeGreaterThan(intermediate + 2);
    }
  });

  it('keeps each level inside the volume it responds to', () => {
    for (const focus of ROUTINE_FOCUSES) {
      expect(totalSets(focus, 'beginner'), focus).toBeGreaterThanOrEqual(9);
      expect(totalSets(focus, 'beginner'), focus).toBeLessThanOrEqual(12);
      expect(totalSets(focus, 'intermediate'), focus).toBeGreaterThanOrEqual(14);
      expect(totalSets(focus, 'intermediate'), focus).toBeLessThanOrEqual(19);
      expect(totalSets(focus, 'advanced'), focus).toBeGreaterThanOrEqual(19);
      expect(totalSets(focus, 'advanced'), focus).toBeLessThanOrEqual(26);
    }
  });

  it('gives a beginner fewer exercises and an advanced lifter more', () => {
    for (const focus of ROUTINE_FOCUSES) {
      expect(slotsFor(focus, 'beginner').length, focus).toBeLessThan(slotsFor(focus, 'intermediate').length);
      expect(slotsFor(focus, 'intermediate').length, focus).toBeLessThan(slotsFor(focus, 'advanced').length);
    }
  });

  it('keeps every level on the same main lift, first', () => {
    for (const focus of ROUTINE_FOCUSES) {
      for (const level of TRAINING_LEVELS) expect(slotsFor(focus, level)[0].role, `${focus} ${level}`).toBe('main');
    }
  });

  it('loads the main lift heavier as the lifter advances', () => {
    expect(PRESCRIPTION.beginner.main.reps).toBe('8-10');
    expect(PRESCRIPTION.intermediate.main.reps).toBe('6-8');
    expect(PRESCRIPTION.advanced.main.reps).toBe('4-6');
  });
});

describe('the prompt', () => {
  it('writes the sets and reps on every slot', () => {
    const prompt = buildRoutinePrompt(['push'], [], { equipment: ['barbell', 'dumbbells', 'cables'], level: 'advanced' });
    expect(prompt).toContain('1. a horizontal chest press — 4 sets of "4-6"');
    expect(prompt).toContain('7. an overhead triceps extension — 3 sets of "10-15"');
  });

  it('lists only the core slots for a beginner', () => {
    const prompt = buildRoutinePrompt(['push'], [], { equipment: ['dumbbells'], level: 'beginner' });
    expect(prompt).toContain('4. a triceps exercise — 2 sets of "10-15"');
    expect(prompt).not.toContain('5.');
    expect(prompt).toContain('hard to do badly');
  });

  it('tells the model to copy the sets and reps, not invent them', () => {
    expect(ROUTINE_BUILD_SYSTEM).toContain('exactly the sets and reps written on its slot');
  });
});

describe('applyPrescription', () => {
  const answer = (count: number) => ({
    notProgram: false,
    routines: [{ name: 'Push', exercises: Array.from({ length: count }, (_, i) => ({ name: `E${i}`, sets: 5, reps: '20' })) }],
  });

  it('puts the level’s sets and reps on each exercise, by slot', () => {
    const [push] = applyPrescription(answer(4), ['push'], 'beginner').routines;
    expect(push.exercises.map((e) => [e.sets, e.reps])).toEqual([
      [3, '8-10'],
      [3, '8-12'],
      [2, '10-15'],
      [2, '10-15'],
    ]);
  });

  it('leaves a routine alone when it no longer lines up with its slots', () => {
    const [push] = applyPrescription(answer(3), ['push'], 'beginner').routines;
    expect(push.exercises.every((e) => e.sets === 5 && e.reps === '20')).toBe(true);
  });

  it('matches routines to days in the order they were asked for', () => {
    const two = {
      notProgram: false,
      routines: [answer(5).routines[0], { name: 'Legs', exercises: answer(5).routines[0].exercises }],
    };
    const [push, legs] = applyPrescription(two, ['push', 'legs'], 'intermediate').routines;
    expect(push.exercises[0]).toMatchObject({ sets: 4, reps: '6-8' });
    expect(legs.exercises[4]).toMatchObject({ sets: 3, reps: '10-15' });
  });
});

describe('estimateMinutes', () => {
  it('tells a short day from a long one', () => {
    expect(estimateMinutes(10)).toBe(25);
    expect(estimateMinutes(16)).toBe(40);
    expect(estimateMinutes(22)).toBe(55);
  });
});

describe('focusesFromCounts', () => {
  it('lays a week out round by round, in the order of the chips', () => {
    expect(focusesFromCounts({ legs: 2, push: 2, pull: 2 })).toEqual(['push', 'pull', 'legs', 'push', 'pull', 'legs']);
    expect(focusesFromCounts({ full: 3 })).toEqual(['full', 'full', 'full']);
    expect(focusesFromCounts({ upper: 2, lower: 1 })).toEqual(['upper', 'lower', 'upper']);
  });

  it('is empty when nothing is picked', () => {
    expect(focusesFromCounts({})).toEqual([]);
    expect(focusesFromCounts({ push: 0 })).toEqual([]);
  });
});

describe('routineNames', () => {
  it('uses the plain label for a day that appears once, and letters repeats', () => {
    expect(routineNames(['push', 'pull', 'legs'])).toEqual(['Push', 'Pull', 'Legs']);
    expect(routineNames(['upper', 'lower', 'upper'])).toEqual(['Upper A', 'Lower', 'Upper B']);
    expect(routineNames(['full', 'full', 'full'])).toEqual(['Full body A', 'Full body B', 'Full body C']);
  });
});
