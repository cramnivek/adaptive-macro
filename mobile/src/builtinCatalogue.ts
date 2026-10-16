import type { CatalogueEntry } from './db';

export interface BuiltinExerciseSpec extends Omit<CatalogueEntry, 'recordedName'> {
  aliases?: string[];
}

export const RAW_BUILTIN_CATALOGUE: BuiltinExerciseSpec[] = [
  // --- CHEST / PUSH ---
  {
    id: 'builtin:bench-press-barbell',
    canonicalName: 'Bench Press (Barbell)',
    aliases: ['Barbell Bench Press', 'Bench Press', 'Flat Barbell Bench Press', 'BB Bench Press'],
    movementPattern: 'push',
    primaryMuscle: 'Chest',
    equipment: 'Barbell',
    bodyweightBased: false,
    primaryRegion: 'chest',
    secondaryRegions: ['triceps', 'shoulders'],
    instructions: 'Lie flat on the bench, unrack the bar over your shoulders, lower to mid-chest with elbows tucked roughly 45°, and press back to lockout.',
    steps: [
      'Lie on the bench with eyes under the bar, feet planted firmly on the floor, and shoulder blades retracted into the pad.',
      'Grip the bar slightly wider than shoulder-width and unrack with straight arms over your shoulders.',
      'Lower the bar under control to your lower-to-mid sternum while keeping elbows tucked at roughly a 45–60° angle.',
      'Drive through the bar back up to full lockout without letting your shoulders roll forward.',
    ],
  },
  {
    id: 'builtin:bench-press-dumbbell',
    canonicalName: 'Bench Press (Dumbbell)',
    aliases: ['Dumbbell Bench Press', 'DB Bench Press', 'Flat Dumbbell Press'],
    movementPattern: 'push',
    primaryMuscle: 'Chest',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'chest',
    secondaryRegions: ['triceps', 'shoulders'],
    instructions: 'Lie on a flat bench holding dumbbells at chest level and press them overhead to lockout.',
    steps: [
      'Sit on the edge of a flat bench with dumbbells resting on your thighs, then kick them back as you lie down.',
      'Pinch your shoulder blades together and hold the dumbbells just outside chest level with wrists stacked over elbows.',
      'Press the dumbbells up in a slight arc until arms are extended over your shoulders.',
      'Lower slowly until the dumbbells reach chest level for a full pec stretch before pressing again.',
    ],
  },
  {
    id: 'builtin:incline-bench-press-dumbbell',
    canonicalName: 'Incline Bench Press (Dumbbell)',
    aliases: ['Incline Dumbbell Bench Press', 'Incline Dumbbell Press', 'Incline DB Press'],
    movementPattern: 'push',
    primaryMuscle: 'Chest',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'chest',
    secondaryRegions: ['shoulders', 'triceps'],
    instructions: 'Set a bench to 30°–45°, lower the dumbbells to the upper chest, and press overhead.',
    steps: [
      'Set an adjustable bench to a 30°–45° incline and lie back with a dumbbell in each hand.',
      'Retract your scapula and lower the weights until they are beside your upper chest with forearms vertical.',
      'Press the dumbbells upward until your elbows lock out directly above your collarbones.',
      'Control the eccentric for 2 seconds to maintain tension on the upper chest.',
    ],
  },
  {
    id: 'builtin:incline-bench-press-barbell',
    canonicalName: 'Incline Bench Press (Barbell)',
    aliases: ['Incline Barbell Bench Press', 'Incline Bench Press'],
    movementPattern: 'push',
    primaryMuscle: 'Chest',
    equipment: 'Barbell',
    bodyweightBased: false,
    primaryRegion: 'chest',
    secondaryRegions: ['shoulders', 'triceps'],
    instructions: 'On an incline bench, lower the barbell to your upper chest and press back to lockout.',
    steps: [
      'Lie back on an incline bench (30°–45°) with feet planted and upper back set tight against the pad.',
      'Unrack the barbell with a slightly wider than shoulder-width grip.',
      'Lower the bar in a controlled path to your upper chest just below the clavicle.',
      'Press the bar straight up to lockout while keeping glutes and shoulder blades anchored.',
    ],
  },
  {
    id: 'builtin:chest-press-machine',
    canonicalName: 'Chest Press (Machine)',
    aliases: ['Chest Press Machine', 'Machine Chest Press', 'Seated Chest Press'],
    movementPattern: 'push',
    primaryMuscle: 'Chest',
    equipment: 'Machine',
    bodyweightBased: false,
    primaryRegion: 'chest',
    secondaryRegions: ['triceps', 'shoulders'],
    instructions: 'Sit with handles at mid-chest height, press forward to extension, and return under control.',
    steps: [
      'Adjust the seat height so the handles align with your mid-to-lower chest.',
      'Pin your shoulder blades back into the backrest and grip the handles with wrists neutral.',
      'Press forward smoothly until arms are extended without shrugging your shoulders.',
      'Lower the weight back slowly until you feel a stretch across the chest before the weight stack touches.',
    ],
  },
  {
    id: 'builtin:chest-dip',
    canonicalName: 'Chest Dip',
    aliases: ['Dip', 'Dips', 'Parallel Bar Dip', 'Chest Dip (Weighted)', 'Tricep Dip'],
    movementPattern: 'push',
    primaryMuscle: 'Chest',
    equipment: 'Bodyweight',
    bodyweightBased: true,
    primaryRegion: 'chest',
    secondaryRegions: ['triceps', 'shoulders'],
    instructions: 'Support yourself on parallel bars, lean slightly forward, lower until shoulders are below elbows, and press back up.',
    steps: [
      'Grip the parallel bars and press up to a locked-out support position with shoulders depressed away from your ears.',
      'Lean your torso forward roughly 15–20° to emphasize the chest and bend your knees slightly.',
      'Lower your body under control until your shoulders dip just below elbow level.',
      'Drive through your palms to return to full elbow lockout at the top.',
    ],
  },
  {
    id: 'builtin:push-up',
    canonicalName: 'Push-Up',
    aliases: ['Push Up', 'Pushup', 'Push Up - Close Grip', 'Close Grip Push-Up'],
    movementPattern: 'push',
    primaryMuscle: 'Chest',
    equipment: 'Bodyweight',
    bodyweightBased: true,
    primaryRegion: 'chest',
    secondaryRegions: ['triceps', 'shoulders', 'abs'],
    instructions: 'Hold a rigid plank with hands just outside shoulder width, lower chest to the floor, and press back up.',
    steps: [
      'Place hands slightly wider than shoulder-width on the floor and brace your core and glutes in a straight plank line.',
      'Lower your body as a single unit with elbows tracking back at roughly 45° until your chest nearly touches the floor.',
      'Press through the floor to return to full arm extension without letting your hips sag.',
    ],
  },
  {
    id: 'builtin:cable-fly',
    canonicalName: 'Cable Fly',
    aliases: ['Cable Crossover', 'Chest Fly (Cable)', 'Chest Fly (Dumbbell)', 'Pec Deck', 'Butterfly (Pec Deck)'],
    movementPattern: 'isolation',
    primaryMuscle: 'Chest',
    equipment: 'Cable',
    bodyweightBased: false,
    primaryRegion: 'chest',
    secondaryRegions: ['shoulders'],
    instructions: 'Bring the handles together in a wide arc in front of your chest with a slight bend in the elbows.',
    steps: [
      'Set both pulleys to chest height, grab a handle in each hand, and step forward into a staggered stance.',
      'Keep a soft, fixed bend in your elbows and open your arms wide until you feel a stretch across the pecs.',
      'Squeeze your chest to bring your hands together in a wide hugging arc in front of your sternum.',
      'Return slowly along the same arc while keeping your shoulders pinned back.',
    ],
  },

  // --- SHOULDERS ---
  {
    id: 'builtin:overhead-press-barbell',
    canonicalName: 'Overhead Press (Barbell)',
    aliases: ['Overhead Press', 'Barbell Overhead Press', 'Military Press', 'Standing Overhead Press', 'OHP'],
    movementPattern: 'push',
    primaryMuscle: 'Shoulders',
    equipment: 'Barbell',
    bodyweightBased: false,
    primaryRegion: 'shoulders',
    secondaryRegions: ['triceps', 'upper_back', 'abs'],
    instructions: 'Stand tall with the bar at collarbone height, brace your core and glutes, and press the bar overhead to lockout.',
    steps: [
      'Unrack the bar resting on your front deltoids and collarbones with a grip just outside shoulder width.',
      'Squeeze your glutes and abs hard to keep your ribs down and lower back neutral.',
      'Tuck your chin slightly back and press the bar straight up, moving your head through once the bar clears your forehead.',
      'Lock out overhead with the bar balanced directly over your mid-foot and shoulders, then lower under control.',
    ],
  },
  {
    id: 'builtin:shoulder-press-dumbbell',
    canonicalName: 'Shoulder Press (Dumbbell)',
    aliases: ['Seated Dumbbell Shoulder Press', 'Dumbbell Shoulder Press', 'DB Shoulder Press', 'Overhead Press (Dumbbell)'],
    movementPattern: 'push',
    primaryMuscle: 'Shoulders',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'shoulders',
    secondaryRegions: ['triceps'],
    instructions: 'Press dumbbells from shoulder level to overhead lockout while seated or standing.',
    steps: [
      'Sit on an upright bench with back support and hold a dumbbell in each hand at shoulder height.',
      'Keep your elbows angled slightly forward (roughly 30° in front of the torso) in the scapular plane.',
      'Press the dumbbells overhead until arms are fully extended without clanking the weights together.',
      'Lower under control back to ear/chin level before starting the next rep.',
    ],
  },
  {
    id: 'builtin:lateral-raise-dumbbell',
    canonicalName: 'Lateral Raise (Dumbbell)',
    aliases: ['Lateral Raise', 'Dumbbell Lateral Raise', 'Side Lateral Raise', 'Lateral Raise (Cable)'],
    movementPattern: 'isolation',
    primaryMuscle: 'Shoulders',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'shoulders',
    secondaryRegions: ['traps'],
    instructions: 'Raise dumbbells out to your sides up to shoulder height with a slight bend in the elbows.',
    steps: [
      'Stand tall holding dumbbells at your sides with a slight, fixed bend in your elbows and a subtle forward torso lean.',
      'Raise your arms out to the sides in the scapular plane (slightly in front of your body) as if pushing the weights toward the walls.',
      'Stop when your elbows reach shoulder height, keeping your traps relaxed.',
      'Lower slowly for 2–3 seconds to keep tension on the lateral delts.',
    ],
  },
  {
    id: 'builtin:face-pull',
    canonicalName: 'Face Pull',
    aliases: ['Face Pull (Cable)', 'Rear Delt Fly', 'Reverse Fly (Dumbbell)', 'Rear Delt Reverse Fly'],
    movementPattern: 'pull',
    primaryMuscle: 'Shoulders',
    equipment: 'Cable',
    bodyweightBased: false,
    primaryRegion: 'shoulders',
    secondaryRegions: ['upper_back', 'traps'],
    instructions: 'Pull the rope attachment toward your forehead while externally rotating your shoulders so your hands finish beside your ears.',
    steps: [
      'Set a cable rope attachment at upper-chest to eye height and grasp the ends with thumbs pointing back.',
      'Step back to create tension and brace your stance.',
      'Pull the center of the rope toward your forehead while driving elbows high and wide and rotating hands back.',
      'Pause briefly in the contracted double-biceps position, then return with control.',
    ],
  },

  // --- BACK / PULL ---
  {
    id: 'builtin:lat-pulldown-cable',
    canonicalName: 'Lat Pulldown (Cable)',
    aliases: ['Lat Pulldown', 'Wide Grip Lat Pulldown', 'Close Grip Lat Pulldown', 'Pulldown'],
    movementPattern: 'pull',
    primaryMuscle: 'Lats',
    equipment: 'Cable',
    bodyweightBased: false,
    primaryRegion: 'lats',
    secondaryRegions: ['biceps', 'upper_back'],
    instructions: 'Sit with thighs anchored under the pad, grip the bar wider than shoulder width, and pull down to your upper chest.',
    steps: [
      'Adjust the thigh pad so your legs are locked snugly in place and grip the bar wider than shoulder width.',
      'Sit tall, depress your shoulder blades, and lean back slightly (about 10–15°).',
      'Drive your elbows down and in toward your hips to pull the bar to your upper chest just below the collarbone.',
      'Control the bar all the way back up until your arms are extended and lats are fully stretched.',
    ],
  },
  {
    id: 'builtin:pull-up',
    canonicalName: 'Pull-Up',
    aliases: ['Pull Up', 'Wide Pull Up', 'Chin-Up', 'Chin Up', 'Pull-Up (Weighted)', 'Neutral Grip Pull-Up'],
    movementPattern: 'pull',
    primaryMuscle: 'Lats',
    equipment: 'Bodyweight',
    bodyweightBased: true,
    primaryRegion: 'lats',
    secondaryRegions: ['biceps', 'upper_back', 'forearms'],
    instructions: 'Hang from an overhead bar with an overhand grip and pull your body up until your chin clears the bar.',
    steps: [
      'Hang from the bar with an overhand grip slightly wider than shoulder width and arms fully extended.',
      'Depress and retract your shoulder blades, then drive your elbows down toward your ribs.',
      'Pull yourself up until your chin clears the bar or your upper chest touches it.',
      'Lower yourself smoothly all the way back to a full dead hang without swinging.',
    ],
  },
  {
    id: 'builtin:bent-over-row-barbell',
    canonicalName: 'Bent Over Row (Barbell)',
    aliases: ['Barbell Row', 'Pendlay Row', 'Bent Over Barbell Row', 'Bent Over Row (Dumbbell)', 'Dumbbell Row'],
    movementPattern: 'pull',
    primaryMuscle: 'Upper Back',
    equipment: 'Barbell',
    bodyweightBased: false,
    primaryRegion: 'upper_back',
    secondaryRegions: ['lats', 'biceps', 'lower_back'],
    instructions: 'Hinge forward at the hips with a flat back and row the bar into your lower ribcage or upper abdomen.',
    steps: [
      'Stand with feet hip-width apart, hinge at the hips until your torso is roughly 30°–45° above horizontal, and keep your spine neutral.',
      'Grip the bar just outside knee width with arms hanging vertical under your shoulders.',
      'Drive your elbows back past your torso to pull the bar into your lower sternum or upper navel.',
      'Squeeze your shoulder blades together at the top, then lower the bar under control.',
    ],
  },
  {
    id: 'builtin:seated-cable-row',
    canonicalName: 'Seated Cable Row',
    aliases: ['Seated Row (Cable)', 'Cable Row', 'Chest Supported Row', 'T-Bar Row', 'Seated Row (Machine)'],
    movementPattern: 'pull',
    primaryMuscle: 'Upper Back',
    equipment: 'Cable',
    bodyweightBased: false,
    primaryRegion: 'upper_back',
    secondaryRegions: ['lats', 'biceps'],
    instructions: 'Sit upright with knees slightly bent and pull the cable handle into your abdomen while squeezing your shoulder blades.',
    steps: [
      'Place your feet on the platform with knees slightly bent and sit tall with a neutral spine.',
      'Let your shoulder blades protract slightly at the start for a stretch without rounding your lower back.',
      'Pull the handle into your stomach while driving elbows back and squeezing your shoulder blades together.',
      'Return the handle forward under control to full arm extension.',
    ],
  },

  // --- LEGS: SQUAT & HINGE ---
  {
    id: 'builtin:squat-barbell',
    canonicalName: 'Squat (Barbell)',
    aliases: ['Barbell Squat', 'Back Squat', 'Front Squat', 'Squat', 'High Bar Squat', 'Low Bar Squat'],
    movementPattern: 'squat',
    primaryMuscle: 'Quadriceps',
    equipment: 'Barbell',
    bodyweightBased: false,
    primaryRegion: 'quads',
    secondaryRegions: ['glutes', 'hamstrings', 'lower_back', 'abs'],
    instructions: 'Rest the bar across your upper back, brace your core, squat down until hips crease below the knees, and drive back up.',
    steps: [
      'Set the bar tightly across your upper traps (or rear delts), unrack, and step back with feet shoulder-width apart and toes slightly turned out.',
      'Take a deep breath into your belly, brace your core 360°, and break at the hips and knees simultaneously.',
      'Descend with knees tracking over your toes until your hip crease reaches parallel or below.',
      'Drive through your whole foot to stand back up while keeping your chest proud and back rigid.',
    ],
  },
  {
    id: 'builtin:leg-press',
    canonicalName: 'Leg Press',
    aliases: ['Leg Press (Machine)', '45 Degree Leg Press', 'Hack Squat', 'Hack Squat (Machine)'],
    movementPattern: 'squat',
    primaryMuscle: 'Quadriceps',
    equipment: 'Machine',
    bodyweightBased: false,
    primaryRegion: 'quads',
    secondaryRegions: ['glutes', 'hamstrings'],
    instructions: 'Sit in the leg press sled, lower the platform until knees reach roughly 90° without your lower back rounding, and press back up.',
    steps: [
      'Sit firmly against the backrest with hips and lower back pressed flat into the pad, feet shoulder-width on the sled.',
      'Release the safety catches and lower the sled under control by bending your knees toward your chest.',
      'Stop just before your pelvis or lower back begins to curl off the seat pad.',
      'Drive through your heels and mid-foot to extend your legs without locking your knees violently at the top.',
    ],
  },
  {
    id: 'builtin:bulgarian-split-squat',
    canonicalName: 'Bulgarian Split Squat',
    aliases: ['Split Squat (Dumbbell)', 'Lunges (Dumbbell)', 'Walking Lunge (Dumbbell)', 'Goblet Squat'],
    movementPattern: 'squat',
    primaryMuscle: 'Quadriceps',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'quads',
    secondaryRegions: ['glutes', 'hamstrings'],
    instructions: 'Elevate your rear foot on a bench behind you, lower your back knee toward the floor, and drive up through your front leg.',
    steps: [
      'Stand about two feet in front of a bench and rest the laces of your back foot on the pad.',
      'Keep most of your weight on your front foot and descend until your back knee nearly touches the floor.',
      'Drive through your front heel and mid-foot to return to the standing position.',
    ],
  },
  {
    id: 'builtin:deadlift-barbell',
    canonicalName: 'Deadlift (Barbell)',
    aliases: ['Barbell Deadlift', 'Deadlift', 'Conventional Deadlift', 'Sumo Deadlift', 'Trap Bar Deadlift'],
    movementPattern: 'hinge',
    primaryMuscle: 'Hamstrings',
    equipment: 'Barbell',
    bodyweightBased: false,
    primaryRegion: 'hamstrings',
    secondaryRegions: ['glutes', 'lower_back', 'upper_back', 'forearms'],
    instructions: 'Stand with the bar over mid-foot, hinge down to grip it, pull the slack out with a flat back, and drive the floor away to lockout.',
    steps: [
      'Stand with feet hip-width apart and the barbell directly over the middle of your feet (about an inch from your shins).',
      'Hinge at the hips to grip the bar just outside your legs, then bring your shins to touch the bar without rolling it forward.',
      'Brace your core, pull your lats tight ("protect your armpits"), and pull the slack out of the bar.',
      'Push the floor away with your legs while keeping the bar dragging close up your shins and thighs to standing lockout.',
    ],
  },
  {
    id: 'builtin:romanian-deadlift-barbell',
    canonicalName: 'Romanian Deadlift (Barbell)',
    aliases: ['Romanian Deadlift', 'RDL', 'Romanian Deadlift (Dumbbell)', 'Dumbbell RDL', 'Stiff-Legged Deadlift'],
    movementPattern: 'hinge',
    primaryMuscle: 'Hamstrings',
    equipment: 'Barbell',
    bodyweightBased: false,
    primaryRegion: 'hamstrings',
    secondaryRegions: ['glutes', 'lower_back'],
    instructions: 'Start standing at the top, keep a soft bend in the knees, push your hips straight back until your hamstrings reach full stretch, and drive hips forward.',
    steps: [
      'Unrack the bar or deadlift it to a standing lockout with feet hip-width apart and knees unlocked in a soft bend.',
      'Push your hips straight back toward the wall behind you while keeping the bar grazing your thighs and shins.',
      'Stop descending the moment your hips stop moving backward (usually mid-shin) so your lower back stays completely flat.',
      'Drive your hips forward and squeeze your glutes to return to standing.',
    ],
  },
  {
    id: 'builtin:hip-thrust-barbell',
    canonicalName: 'Hip Thrust (Barbell)',
    aliases: ['Hip Thrust', 'Barbell Hip Thrust', 'Glute Bridge'],
    movementPattern: 'hinge',
    primaryMuscle: 'Glutes',
    equipment: 'Barbell',
    bodyweightBased: false,
    primaryRegion: 'glutes',
    secondaryRegions: ['hamstrings'],
    instructions: 'Rest your upper back on a bench with a padded barbell across your hips and drive your hips up to full extension.',
    steps: [
      'Sit on the floor with your shoulder blades resting against the edge of a bench and roll a padded barbell over your hips.',
      'Plant your feet flat so that at the top of the rep your shins are vertical (90° knee angle).',
      'Keep your chin tucked, ribs down, and drive through your heels to extend your hips until your torso is parallel to the floor.',
      'Squeeze your glutes hard at the top for 1 second, then lower under control.',
    ],
  },
  {
    id: 'builtin:leg-extension-machine',
    canonicalName: 'Leg Extension (Machine)',
    aliases: ['Leg Extension', 'Seated Leg Extension'],
    movementPattern: 'isolation',
    primaryMuscle: 'Quadriceps',
    equipment: 'Machine',
    bodyweightBased: false,
    primaryRegion: 'quads',
    secondaryRegions: [],
    instructions: 'Sit in the machine with the ankle pad just above your feet and extend your knees to straight legs.',
    steps: [
      'Adjust the backrest so the back of your knees sits flush against the edge of the seat and the pad rests on your lower shins.',
      'Grip the side handles to pull your hips firmly into the seat.',
      'Extend your legs smoothly to full contraction at the top and pause briefly.',
      'Lower the weight under control without letting the stack slam.',
    ],
  },
  {
    id: 'builtin:leg-curl-machine',
    canonicalName: 'Seated Leg Curl (Machine)',
    aliases: ['Leg Curl', 'Lying Leg Curl (Machine)', 'Lying Leg Curl', 'Hamstring Curl'],
    movementPattern: 'isolation',
    primaryMuscle: 'Hamstrings',
    equipment: 'Machine',
    bodyweightBased: false,
    primaryRegion: 'hamstrings',
    secondaryRegions: ['calves'],
    instructions: 'Align your knees with the machine pivot and curl the pad back as far as possible using your hamstrings.',
    steps: [
      'Adjust the machine so your knee joint aligns with the pivot point and the ankle pad rests just above your heels.',
      'Lock the thigh pad tightly over your quads (if seated) or keep your hips pressed into the bench (if lying).',
      'Curl your heels back toward your glutes for a full hamstring contraction, then return slowly to a full stretch.',
    ],
  },
  {
    id: 'builtin:calf-raise',
    canonicalName: 'Standing Calf Raise',
    aliases: ['Calf Raise', 'Seated Calf Raise', 'Calf Raise (Machine)'],
    movementPattern: 'isolation',
    primaryMuscle: 'Calves',
    equipment: 'Machine',
    bodyweightBased: false,
    primaryRegion: 'calves',
    secondaryRegions: [],
    instructions: 'Stand with the balls of your feet on the step, lower your heels into a full stretch, and press up onto your toes.',
    steps: [
      'Place the balls of your feet on the edge of the platform with knees straight (standing) or bent 90° (seated).',
      'Lower your heels slowly as far as ankle mobility allows and pause 1 second in the bottom stretch.',
      'Drive through the ball of your big toe to rise as high as possible, squeezing the calves at the top.',
    ],
  },

  // --- ARMS: BICEPS & TRICEPS ---
  {
    id: 'builtin:bicep-curl-dumbbell',
    canonicalName: 'Bicep Curl (Dumbbell)',
    aliases: ['Dumbbell Curl', 'Bicep Curl (Barbell)', 'Barbell Curl', 'EZ Bar Curl', 'Hammer Curl (Dumbbell)', 'Hammer Curl', 'Incline Dumbbell Curl', 'Preacher Curl'],
    movementPattern: 'isolation',
    primaryMuscle: 'Biceps',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'biceps',
    secondaryRegions: ['forearms'],
    instructions: 'Stand tall with elbows pinned at your sides and curl the weights up to shoulder level without swinging your torso.',
    steps: [
      'Stand upright holding the weights with arms extended and elbows tucked comfortably by your ribs.',
      'Curl the weights upward by flexing at the elbow while keeping your upper arms stationary.',
      'Squeeze your biceps at the top of the rep, then lower all the way down to full elbow extension.',
    ],
  },
  {
    id: 'builtin:triceps-pushdown',
    canonicalName: 'Triceps Pushdown',
    aliases: ['Tricep Pushdown', 'Triceps Pushdown (Cable)', 'Rope Pushdown', 'Tricep Rope Pushdown', 'Overhead Tricep Extension'],
    movementPattern: 'isolation',
    primaryMuscle: 'Triceps',
    equipment: 'Cable',
    bodyweightBased: false,
    primaryRegion: 'triceps',
    secondaryRegions: [],
    instructions: 'Stand at a high pulley, keep elbows pinned to your sides, and extend your forearms down to full lockout.',
    steps: [
      'Attach a rope or bar to a high cable pulley, step back slightly, and hinge forward 10–15°.',
      'Pin your upper arms and elbows at your sides so only your forearms move.',
      'Press the attachment down until your elbows are completely locked out, spreading the rope apart at the bottom.',
      'Allow your forearms to rise slowly until your elbows bend past 90° before the next rep.',
    ],
  },
  {
    id: 'builtin:skullcrusher',
    canonicalName: 'Skullcrusher (Barbell)',
    aliases: ['Skullcrusher', 'Lying Tricep Extension', 'EZ Bar Skullcrusher', 'Dumbbell Skullcrusher'],
    movementPattern: 'isolation',
    primaryMuscle: 'Triceps',
    equipment: 'Barbell',
    bodyweightBased: false,
    primaryRegion: 'triceps',
    secondaryRegions: [],
    instructions: 'Lie on a flat bench, angle your upper arms slightly back toward your head, lower the bar toward your forehead, and extend back up.',
    steps: [
      'Lie on a flat bench holding an EZ-bar or dumbbells with arms extended and angled slightly back toward the wall behind you.',
      'Keep your upper arms fixed in space and bend only at the elbows to lower the weight toward your forehead or just behind the crown of your head.',
      'Extend your elbows to press the weight back to the starting angle.',
    ],
  },

  // --- CORE ---
  {
    id: 'builtin:plank',
    canonicalName: 'Plank',
    aliases: ['Ab Wheel Rollout', 'Crunch', 'Cable Crunch', 'Hanging Leg Raise'],
    movementPattern: 'core',
    primaryMuscle: 'Core',
    equipment: 'Bodyweight',
    bodyweightBased: true,
    primaryRegion: 'abs',
    secondaryRegions: ['obliques'],
    instructions: 'Brace your abs and glutes tightly while maintaining a rigid torso.',
    steps: [
      'Set your forearms on the floor directly beneath your shoulders with legs extended behind you.',
      'Tuck your pelvis slightly (posterior pelvic tilt), squeeze your glutes and quads, and brace your abs.',
      'Breathe steadily while holding a straight line from head to heels.',
    ],
  },
];

export const BUILTIN_CATALOGUE: CatalogueEntry[] = RAW_BUILTIN_CATALOGUE.map(
  ({ aliases: _aliases, ...entry }) => ({
    ...entry,
    recordedName: null,
  }),
);

const normalizeKey = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .sort()
    .join(' ');

/**
 * Finds a built-in catalogue entry matching the given exercise name (exact,
 * alias, or normalized word-set match like "Barbell Bench Press" <-> "Bench Press (Barbell)").
 */
export const findBuiltinCatalogueEntry = (name: string): CatalogueEntry | null => {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const norm = normalizeKey(trimmed);

  // 1. Exact or alias match
  for (const spec of RAW_BUILTIN_CATALOGUE) {
    if (spec.canonicalName.toLowerCase() === lower) {
      const { aliases: _a, ...rest } = spec;
      return { ...rest, recordedName: trimmed };
    }
    if (spec.aliases?.some((a) => a.toLowerCase() === lower)) {
      const { aliases: _a, ...rest } = spec;
      return { ...rest, recordedName: trimmed };
    }
  }

  // 2. Normalized token bag match (e.g. "Bench Press (Barbell)" <-> "Barbell Bench Press")
  for (const spec of RAW_BUILTIN_CATALOGUE) {
    if (normalizeKey(spec.canonicalName) === norm) {
      const { aliases: _a, ...rest } = spec;
      return { ...rest, recordedName: trimmed };
    }
    if (spec.aliases?.some((a) => normalizeKey(a) === norm)) {
      const { aliases: _a, ...rest } = spec;
      return { ...rest, recordedName: trimmed };
    }
  }

  // 3. Keyword fallback for common exercise stems so details are never blank
  const words = lower.replace(/[^a-z0-9]+/g, ' ');
  for (const spec of RAW_BUILTIN_CATALOGUE) {
    const canonLower = spec.canonicalName.toLowerCase();
    if (
      (words.includes('lat') && words.includes('pulldown') && canonLower.includes('lat pulldown')) ||
      (words.includes('incline') && words.includes('bench') && words.includes('dumbbell') && canonLower.includes('incline') && canonLower.includes('dumbbell')) ||
      (words.includes('incline') && words.includes('bench') && canonLower.includes('incline') && canonLower.includes('barbell')) ||
      (words.includes('bench') && words.includes('press') && words.includes('dumbbell') && canonLower === 'bench press (dumbbell)') ||
      (words.includes('bench') && words.includes('press') && canonLower === 'bench press (barbell)') ||
      (words.includes('overhead') && words.includes('press') && canonLower === 'overhead press (barbell)') ||
      (words.includes('shoulder') && words.includes('press') && canonLower === 'shoulder press (dumbbell)') ||
      (words.includes('lateral') && words.includes('raise') && canonLower.includes('lateral raise')) ||
      (words.includes('romanian') && words.includes('deadlift') && canonLower.includes('romanian deadlift')) ||
      (words.includes('deadlift') && !words.includes('romanian') && canonLower === 'deadlift (barbell)') ||
      (words.includes('squat') && words.includes('split') && canonLower.includes('split squat')) ||
      (words.includes('squat') && !words.includes('split') && !words.includes('hack') && canonLower === 'squat (barbell)') ||
      (words.includes('leg') && words.includes('press') && canonLower === 'leg press') ||
      (words.includes('leg') && words.includes('extension') && canonLower.includes('leg extension')) ||
      (words.includes('leg') && words.includes('curl') && canonLower.includes('leg curl')) ||
      (words.includes('calf') && words.includes('raise') && canonLower.includes('calf raise')) ||
      (words.includes('pull') && (words.includes('up') || words.includes('chin')) && canonLower === 'pull-up') ||
      (words.includes('dip') && canonLower === 'chest dip') ||
      (words.includes('push') && words.includes('up') && canonLower === 'push-up') ||
      (words.includes('pushdown') && canonLower === 'triceps pushdown') ||
      (words.includes('curl') && !words.includes('leg') && canonLower === 'bicep curl (dumbbell)') ||
      (words.includes('row') && words.includes('cable') && canonLower === 'seated cable row') ||
      (words.includes('row') && canonLower === 'bent over row (barbell)')
    ) {
      const { aliases: _a, ...rest } = spec;
      return { ...rest, recordedName: trimmed };
    }
  }

  return null;
};
