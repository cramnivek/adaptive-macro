import { describe, expect, it } from 'vitest';
import { matchKnownExercise, resolveAgainstLog, type RoutineImport, toRoutineDrafts } from '../routineImport';

const programme = (routines: RoutineImport['routines'], notProgram = false): RoutineImport => ({
  notProgram,
  routines,
});

const lift = (name: string, sets = 3, reps = '8') => ({ name, sets, reps });

describe('toRoutineDrafts', () => {
  it('keeps a clean programme as written', () => {
    const drafts = toRoutineDrafts(
      programme([
        { name: 'Push', exercises: [lift('Bench Press', 4, '6-8'), lift('Overhead Press', 3, '8-10')] },
        { name: 'Pull', exercises: [lift('Barbell Row', 4, '8')] },
      ]),
    );

    expect(drafts).toEqual([
      {
        name: 'Push',
        exercises: [
          { name: 'Bench Press', sets: 4, reps: '6-8' },
          { name: 'Overhead Press', sets: 3, reps: '8-10' },
        ],
      },
      { name: 'Pull', exercises: [{ name: 'Barbell Row', sets: 4, reps: '8' }] },
    ]);
  });

  it('returns nothing for a document that is not a programme, whatever else came back', () => {
    const drafts = toRoutineDrafts(programme([{ name: 'Menu', exercises: [lift('Pasta')] }], true));
    expect(drafts).toEqual([]);
  });

  it('merges an exercise listed twice, because the save would otherwise overwrite the first', () => {
    const [push] = toRoutineDrafts(
      programme([
        {
          name: 'Push',
          exercises: [lift('Bench Press', 3, '5'), lift('Dips', 3, '10'), lift('bench press', 2, '12')],
        },
      ]),
    );

    expect(push.exercises).toEqual([
      // Sets add up; the first rep target stands, since it is the main work.
      { name: 'Bench Press', sets: 5, reps: '5' },
      { name: 'Dips', sets: 3, reps: '10' },
    ]);
  });

  it('caps merged sets at ten', () => {
    const [day] = toRoutineDrafts(
      programme([{ name: 'Day', exercises: [lift('Squat', 6), lift('Squat', 6)] }]),
    );
    expect(day.exercises[0].sets).toBe(10);
  });

  it('takes the second rep target when the first entry gave none', () => {
    const [day] = toRoutineDrafts(
      programme([{ name: 'Day', exercises: [lift('Squat', 3, ''), lift('Squat', 2, '5')] }]),
    );
    expect(day.exercises[0]).toEqual({ name: 'Squat', sets: 5, reps: '5' });
  });

  it('keeps set counts whole and between one and ten', () => {
    const [day] = toRoutineDrafts(
      programme([
        {
          name: 'Day',
          exercises: [
            lift('A', 3.5),
            lift('B', 40),
            lift('C', 0),
            lift('D', -2),
            lift('E', Number.NaN),
            lift('F', 1),
          ],
        },
      ]),
    );

    expect(day.exercises.map((e) => e.sets)).toEqual([4, 10, 3, 3, 3, 1]);
  });

  it('records a missing rep target as none rather than an empty label', () => {
    const [day] = toRoutineDrafts(programme([{ name: 'Day', exercises: [lift('Plank', 3, '   ')] }]));
    expect(day.exercises[0].reps).toBeNull();
  });

  it('cuts a rep target that is really a paragraph', () => {
    const [day] = toRoutineDrafts(
      programme([{ name: 'Day', exercises: [lift('Squat', 3, 'work up to a heavy single then back off for two sets')] }]),
    );
    expect(day.exercises[0].reps).toHaveLength(20);
  });

  it('tidies whitespace in names and targets', () => {
    const [day] = toRoutineDrafts(
      programme([{ name: '  Day 1:\n Upper ', exercises: [lift('  Incline   Dumbbell\tPress ', 3, ' 8 - 10 ')] }]),
    );

    expect(day.name).toBe('Day 1: Upper');
    expect(day.exercises[0]).toEqual({ name: 'Incline Dumbbell Press', sets: 3, reps: '8 - 10' });
  });

  it('drops blank exercises, and routines left with none', () => {
    const drafts = toRoutineDrafts(
      programme([
        { name: 'Rest day', exercises: [] },
        { name: 'Legs', exercises: [lift('  '), lift('Squat')] },
        { name: 'Notes', exercises: [lift('')] },
      ]),
    );

    expect(drafts.map((d) => d.name)).toEqual(['Legs']);
    expect(drafts[0].exercises.map((e) => e.name)).toEqual(['Squat']);
  });

  it('names an unnamed routine by its place in the document', () => {
    const drafts = toRoutineDrafts(
      programme([
        { name: 'Upper', exercises: [lift('Bench Press')] },
        { name: ' ', exercises: [lift('Squat')] },
      ]),
    );
    expect(drafts[1].name).toBe('Imported routine 2');
  });

  it('tells apart routines that share a name', () => {
    const drafts = toRoutineDrafts(
      programme([
        { name: 'Day 1', exercises: [lift('Squat')] },
        { name: 'day 1', exercises: [lift('Bench Press')] },
        { name: 'Day 1', exercises: [lift('Deadlift')] },
      ]),
    );
    expect(drafts.map((d) => d.name)).toEqual(['Day 1', 'day 1 (2)', 'Day 1 (3)']);
  });
});

describe('matchKnownExercise', () => {
  const known = [
    'Bench Press (Barbell)',
    'Incline Bench Press (Dumbbell)',
    'Lat Pulldown (Cable)',
    'Pull Up',
    'Bicep Curl (Dumbbell)',
    'Bicep Curl (Barbell)',
  ];

  it('finds the logged exercise behind a reordered name', () => {
    expect(matchKnownExercise('Barbell Bench Press', known)).toBe('Bench Press (Barbell)');
    expect(matchKnownExercise('Cable Lat Pulldown', known)).toBe('Lat Pulldown (Cable)');
  });

  it('ignores case, punctuation and a plural', () => {
    expect(matchKnownExercise('pull-ups', known)).toBe('Pull Up');
    expect(matchKnownExercise('Biceps curl, dumbbell', known)).toBe('Bicep Curl (Dumbbell)');
  });

  it('fills in the equipment when only one logged exercise fits', () => {
    expect(matchKnownExercise('Bench Press', known)).toBe('Bench Press (Barbell)');
    expect(matchKnownExercise('Lat Pulldown', known)).toBe('Lat Pulldown (Cable)');
  });

  it('does not guess between two pieces of equipment', () => {
    expect(matchKnownExercise('Bicep Curl', known)).toBeNull();
  });

  it('does not match a different movement that shares words', () => {
    // "Incline" is not equipment, so a flat press is not an incline one.
    expect(matchKnownExercise('Dumbbell Bench Press', known)).toBeNull();
    expect(matchKnownExercise('Close Grip Bench Press', known)).toBeNull();
  });

  it('leaves a new exercise new', () => {
    expect(matchKnownExercise('Bulgarian Split Squat', known)).toBeNull();
    expect(matchKnownExercise('Squat', [])).toBeNull();
  });

  it('prefers the exact match over one that adds equipment', () => {
    expect(matchKnownExercise('Pull Up', ['Pull Up (Band)', 'Pull Up'])).toBe('Pull Up');
  });
});

describe('resolveAgainstLog', () => {
  const known = ['Bench Press (Barbell)', 'Squat (Barbell)'];

  it('renames to the logged exercise and says what the document called it', () => {
    const resolved = resolveAgainstLog(
      { name: 'Day 1', exercises: [{ name: 'Barbell Bench Press', sets: 4, reps: '6' }] },
      known,
    );
    expect(resolved.exercises).toEqual([
      { name: 'Bench Press (Barbell)', sets: 4, reps: '6', importedAs: 'Barbell Bench Press', known: true },
    ]);
  });

  it('marks an exercise the log has never seen as new', () => {
    const resolved = resolveAgainstLog(
      { name: 'Day 1', exercises: [{ name: 'Nordic Curl', sets: 3, reps: null }] },
      known,
    );
    expect(resolved.exercises[0]).toEqual({ name: 'Nordic Curl', sets: 3, reps: null, importedAs: null, known: false });
  });

  it('does not flag a rename when the document already used the logged name', () => {
    const resolved = resolveAgainstLog(
      { name: 'Day 1', exercises: [{ name: 'Squat (Barbell)', sets: 5, reps: '5' }] },
      known,
    );
    expect(resolved.exercises[0]).toMatchObject({ importedAs: null, known: true });
  });

  it('merges two names that turn out to be one logged exercise', () => {
    const resolved = resolveAgainstLog(
      {
        name: 'Day 1',
        exercises: [
          { name: 'Barbell Bench Press', sets: 3, reps: '8' },
          { name: 'Squat', sets: 3, reps: '5' },
          { name: 'Bench Press', sets: 2, reps: '10' },
        ],
      },
      known,
    );
    expect(resolved.exercises.map((e) => [e.name, e.sets, e.reps])).toEqual([
      // The first rep target stands, as it does within a document.
      ['Bench Press (Barbell)', 5, '8'],
      ['Squat (Barbell)', 3, '5'],
    ]);
  });

  it('caps sets merged this way at ten too', () => {
    const resolved = resolveAgainstLog(
      {
        name: 'Day 1',
        exercises: [
          { name: 'Bench Press', sets: 6, reps: null },
          { name: 'Barbell Bench Press', sets: 6, reps: null },
        ],
      },
      known,
    );
    expect(resolved.exercises[0].sets).toBe(10);
  });
});
