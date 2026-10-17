import type { CatalogueEntry } from './db';

export interface BuiltinExerciseSpec extends Omit<CatalogueEntry, 'recordedName'> {
  aliases?: string[];
}

export const RAW_BUILTIN_CATALOGUE: BuiltinExerciseSpec[] = [
  // =========================================================================
  // CHEST / PUSH
  // =========================================================================
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
    aliases: ['Incline Barbell Bench Press', 'Incline Bench Press', 'Incline BB Bench Press'],
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
    aliases: ['Chest Press Machine', 'Machine Chest Press', 'Seated Chest Press', 'Incline Chest Press (Machine)'],
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
    aliases: ['Push Up', 'Pushup', 'Push Up - Close Grip', 'Close Grip Push-Up', 'Deficit Push-Up'],
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
    aliases: ['Cable Crossover', 'Chest Fly (Cable)', 'High-to-Low Cable Fly', 'Low-to-High Cable Fly'],
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
  {
    id: 'builtin:pec-deck-machine',
    canonicalName: 'Pec Deck (Machine)',
    aliases: ['Butterfly (Pec Deck)', 'Machine Chest Fly', 'Chest Fly (Machine)', 'Pec Fly Machine'],
    movementPattern: 'isolation',
    primaryMuscle: 'Chest',
    equipment: 'Machine',
    bodyweightBased: false,
    primaryRegion: 'chest',
    secondaryRegions: ['shoulders'],
    instructions: 'Sit tall against the back pad and bring the fly arms together in front of your chest.',
    steps: [
      'Adjust the seat so the handles are aligned with mid-chest level and sit with your back flat against the pad.',
      'Hold the handles with a slight, soft bend in your elbows.',
      'Sweep the arms together in front of your chest and squeeze the pecs for 1 second.',
      'Open your arms under control until you feel a comfortable stretch across your chest.',
    ],
  },
  {
    id: 'builtin:chest-fly-dumbbell',
    canonicalName: 'Chest Fly (Dumbbell)',
    aliases: ['Dumbbell Fly', 'Flat Dumbbell Chest Fly', 'Incline Dumbbell Fly'],
    movementPattern: 'isolation',
    primaryMuscle: 'Chest',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'chest',
    secondaryRegions: ['shoulders'],
    instructions: 'Lie on a bench holding dumbbells above your chest and open your arms wide in a controlled arc.',
    steps: [
      'Lie on a flat or slight-incline bench with dumbbells held over your chest and palms facing each other.',
      'Maintain a 15–20° bend in your elbows and lower your arms out to the sides in a wide arc.',
      'Stop when your elbows reach bench level for a deep pec stretch, then hug the weights back up over your sternum.',
    ],
  },

  // =========================================================================
  // SHOULDERS
  // =========================================================================
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
    id: 'builtin:shoulder-press-machine',
    canonicalName: 'Shoulder Press (Machine)',
    aliases: ['Machine Shoulder Press', 'Seated Machine Overhead Press'],
    movementPattern: 'push',
    primaryMuscle: 'Shoulders',
    equipment: 'Machine',
    bodyweightBased: false,
    primaryRegion: 'shoulders',
    secondaryRegions: ['triceps'],
    instructions: 'Sit upright in the shoulder press machine and press the handles overhead to full extension.',
    steps: [
      'Adjust the seat so the handles start at roughly jaw or ear height.',
      'Brace your back against the pad and grip the neutral or overhand handles.',
      'Press smoothly overhead to full elbow extension, then lower under control without letting the stack rest.',
    ],
  },
  {
    id: 'builtin:arnold-press-dumbbell',
    canonicalName: 'Arnold Press (Dumbbell)',
    aliases: ['Arnold Press', 'Dumbbell Arnold Press'],
    movementPattern: 'push',
    primaryMuscle: 'Shoulders',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'shoulders',
    secondaryRegions: ['triceps'],
    instructions: 'Start with palms facing you at chin height and rotate your wrists outward as you press the dumbbells overhead.',
    steps: [
      'Sit upright holding dumbbells in front of your chin with palms facing toward you.',
      'Open your elbows outward while rotating your palms forward and pressing the weights overhead.',
      'Reverse the rotation smoothly as you lower the dumbbells back to the starting position.',
    ],
  },
  {
    id: 'builtin:lateral-raise-dumbbell',
    canonicalName: 'Lateral Raise (Dumbbell)',
    aliases: ['Lateral Raise', 'Dumbbell Lateral Raise', 'Side Lateral Raise', 'DB Lateral Raise'],
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
    id: 'builtin:lateral-raise-cable',
    canonicalName: 'Lateral Raise (Cable)',
    aliases: ['Cable Lateral Raise', 'Single-Arm Cable Lateral Raise'],
    movementPattern: 'isolation',
    primaryMuscle: 'Shoulders',
    equipment: 'Cable',
    bodyweightBased: false,
    primaryRegion: 'shoulders',
    secondaryRegions: ['traps'],
    instructions: 'Stand beside a low pulley and sweep the handle out to shoulder height for constant lateral-delt tension.',
    steps: [
      'Set the cable pulley to wrist or ankle height and grab the handle with your outside hand.',
      'Sweep your arm out and up in the scapular plane until your hand reaches shoulder level.',
      'Lower slowly across your body while resisting the pull of the cable.',
    ],
  },
  {
    id: 'builtin:face-pull',
    canonicalName: 'Face Pull (Cable)',
    aliases: ['Face Pull', 'Rope Face Pull'],
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
  {
    id: 'builtin:rear-delt-fly',
    canonicalName: 'Rear Delt Fly (Dumbbell)',
    aliases: ['Reverse Fly (Dumbbell)', 'Rear Delt Reverse Fly', 'Reverse Pec Deck', 'Rear Delt Fly (Machine)'],
    movementPattern: 'isolation',
    primaryMuscle: 'Shoulders',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'shoulders',
    secondaryRegions: ['upper_back', 'traps'],
    instructions: 'Hinge forward at the hips and sweep your arms out wide to target the posterior deltoids.',
    steps: [
      'Hinge forward until your torso is nearly parallel to the floor (or sit chest-against-pad on an incline bench).',
      'Let the dumbbells hang beneath your chest with a soft bend in the elbows.',
      'Sweep your arms out to the sides toward the ceiling, leading with your elbows.',
      'Lower under control without swinging your torso.',
    ],
  },
  {
    id: 'builtin:shrug-dumbbell',
    canonicalName: 'Shrug (Dumbbell)',
    aliases: ['Dumbbell Shrug', 'Barbell Shrug', 'Shrug (Barbell)', 'Trap Shrug'],
    movementPattern: 'isolation',
    primaryMuscle: 'Traps',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'traps',
    secondaryRegions: ['forearms', 'upper_back'],
    instructions: 'Hold heavy weights at your sides and elevate your shoulders straight up toward your ears.',
    steps: [
      'Stand tall with dumbbells at your sides (or a barbell in front of your thighs) and arms completely straight.',
      'Elevate your shoulders up and slightly back toward your ears as high as possible.',
      'Hold the top contraction for 1 full second, then lower slowly into a full trap stretch.',
    ],
  },

  // =========================================================================
  // BACK / PULL
  // =========================================================================
  {
    id: 'builtin:lat-pulldown-cable',
    canonicalName: 'Lat Pulldown (Cable)',
    aliases: ['Lat Pulldown', 'Wide Grip Lat Pulldown', 'Pulldown'],
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
    id: 'builtin:close-grip-lat-pulldown',
    canonicalName: 'Close-Grip Lat Pulldown',
    aliases: ['Neutral Grip Lat Pulldown', 'V-Bar Lat Pulldown', 'Underhand Lat Pulldown'],
    movementPattern: 'pull',
    primaryMuscle: 'Lats',
    equipment: 'Cable',
    bodyweightBased: false,
    primaryRegion: 'lats',
    secondaryRegions: ['biceps', 'upper_back'],
    instructions: 'Use a neutral V-bar or close grip and drive your elbows down beside your ribs to pull the handle to your sternum.',
    steps: [
      'Attach a V-bar or close neutral-grip handle to the lat pulldown station and secure your thighs under the pad.',
      'Lean back slightly, lift your chest, and pull the handle down to your mid-to-upper sternum while keeping elbows tucked close.',
      'Extend your arms slowly overhead at the top of each rep for a full lat stretch.',
    ],
  },
  {
    id: 'builtin:pull-up',
    canonicalName: 'Pull-Up',
    aliases: ['Pull Up', 'Wide Pull Up', 'Pull-Up (Weighted)', 'Neutral Grip Pull-Up'],
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
    id: 'builtin:chin-up',
    canonicalName: 'Chin-Up',
    aliases: ['Chin Up', 'Underhand Pull-Up', 'Chin-Up (Weighted)'],
    movementPattern: 'pull',
    primaryMuscle: 'Lats',
    equipment: 'Bodyweight',
    bodyweightBased: true,
    primaryRegion: 'lats',
    secondaryRegions: ['biceps', 'upper_back', 'forearms'],
    instructions: 'Hang from an overhead bar with an underhand (supinated) shoulder-width grip and pull your chest to the bar.',
    steps: [
      'Grip the pull-up bar with palms facing toward you (supinated) at shoulder width.',
      'Pull your shoulder blades down and drive your elbows toward your hips until your chin clears the bar.',
      'Lower under control to full arm extension before starting the next rep.',
    ],
  },
  {
    id: 'builtin:bent-over-row-barbell',
    canonicalName: 'Bent Over Row (Barbell)',
    aliases: ['Barbell Row', 'Pendlay Row', 'Bent Over Barbell Row', 'BB Row'],
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
    id: 'builtin:dumbbell-row',
    canonicalName: 'Dumbbell Row',
    aliases: ['One-Arm Dumbbell Row', 'Single-Arm Dumbbell Row', 'Bent Over Row (Dumbbell)', 'DB Row'],
    movementPattern: 'pull',
    primaryMuscle: 'Lats',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'lats',
    secondaryRegions: ['upper_back', 'biceps'],
    instructions: 'Brace one hand on a bench, keep your back flat, and row the dumbbell back toward your hip.',
    steps: [
      'Place your non-working hand and knee on a flat bench (or brace your hand on the rack) with a flat, horizontal torso.',
      'Let the dumbbell hang straight down at arm’s length to stretch the lat.',
      'Row the dumbbell back in an arc toward your hip pocket, keeping your elbow close to your body.',
      'Lower slowly to the full stretch position.',
    ],
  },
  {
    id: 'builtin:chest-supported-row',
    canonicalName: 'Chest-Supported Row (Dumbbell)',
    aliases: ['Chest Supported Row', 'Incline Bench Dumbbell Row', 'Chest-Supported Row (Machine)', 'T-Bar Row'],
    movementPattern: 'pull',
    primaryMuscle: 'Upper Back',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'upper_back',
    secondaryRegions: ['lats', 'biceps'],
    instructions: 'Lie chest-down on an incline bench and row the weights up while squeezing your shoulder blades together.',
    steps: [
      'Set a bench to a 30°–45° incline and lie face-down with your chest supported on the pad.',
      'Let the dumbbells hang straight down with arms extended.',
      'Drive your elbows back and squeeze your upper back at the top of the rep, then lower slowly.',
    ],
  },
  {
    id: 'builtin:seated-cable-row',
    canonicalName: 'Seated Cable Row',
    aliases: ['Seated Row (Cable)', 'Cable Row', 'Seated Row (Machine)', 'Low Row'],
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
  {
    id: 'builtin:straight-arm-pulldown',
    canonicalName: 'Straight-Arm Pulldown (Cable)',
    aliases: ['Straight Arm Pulldown', 'Lat Prayer', 'Cable Pullover'],
    movementPattern: 'isolation',
    primaryMuscle: 'Lats',
    equipment: 'Cable',
    bodyweightBased: false,
    primaryRegion: 'lats',
    secondaryRegions: ['triceps', 'abs'],
    instructions: 'Hinge slightly forward at a high pulley and sweep the bar down to your thighs with arms kept nearly straight.',
    steps: [
      'Attach a bar or rope to a high pulley, step back, and hinge forward roughly 30°.',
      'With a slight, fixed bend in the elbows, sweep the attachment down in an arc until it touches your thighs.',
      'Control the return overhead until you feel a deep stretch through your lats.',
    ],
  },

  // =========================================================================
  // LEGS: QUADS / SQUAT
  // =========================================================================
  {
    id: 'builtin:squat-barbell',
    canonicalName: 'Squat (Barbell)',
    aliases: ['Barbell Squat', 'Back Squat', 'Squat', 'High Bar Squat', 'Low Bar Squat', 'BB Squat'],
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
    id: 'builtin:front-squat-barbell',
    canonicalName: 'Front Squat (Barbell)',
    aliases: ['Front Squat', 'Barbell Front Squat'],
    movementPattern: 'squat',
    primaryMuscle: 'Quadriceps',
    equipment: 'Barbell',
    bodyweightBased: false,
    primaryRegion: 'quads',
    secondaryRegions: ['glutes', 'upper_back', 'abs'],
    instructions: 'Hold the bar in a front-rack position across your front delts, keep elbows high and torso upright, and squat deep.',
    steps: [
      'Rack the barbell across your front deltoids and collarbones with elbows pointed high and forward.',
      'Brace your core and descend with an upright torso until your hips pass below knee level.',
      'Drive elbows up and push through your mid-foot to stand back to lockout.',
    ],
  },
  {
    id: 'builtin:goblet-squat',
    canonicalName: 'Goblet Squat (Dumbbell)',
    aliases: ['Goblet Squat', 'Kettlebell Goblet Squat', 'Dumbbell Squat'],
    movementPattern: 'squat',
    primaryMuscle: 'Quadriceps',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'quads',
    secondaryRegions: ['glutes', 'abs'],
    instructions: 'Hold a dumbbell or kettlebell vertically at chest height and squat down between your knees with an upright chest.',
    steps: [
      'Cup one end of a dumbbell or kettlebell tightly against your sternum with elbows tucked in.',
      'Stand with feet slightly wider than hip-width and sit down between your knees while keeping your chest tall.',
      'Drive through your whole foot to return to standing.',
    ],
  },
  {
    id: 'builtin:leg-press',
    canonicalName: 'Leg Press',
    aliases: ['Leg Press (Machine)', '45 Degree Leg Press', 'Seated Leg Press'],
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
    id: 'builtin:hack-squat-machine',
    canonicalName: 'Hack Squat (Machine)',
    aliases: ['Hack Squat', 'Machine Hack Squat', 'Pendulum Squat'],
    movementPattern: 'squat',
    primaryMuscle: 'Quadriceps',
    equipment: 'Machine',
    bodyweightBased: false,
    primaryRegion: 'quads',
    secondaryRegions: ['glutes'],
    instructions: 'Brace your back and shoulders against the sled pads, lower to full knee flexion, and drive back up.',
    steps: [
      'Position your shoulders under the pads and keep your entire back pressed flat against the sled.',
      'Place your feet shoulder-width apart on the lower-to-middle portion of the platform.',
      'Release the handles, descend to full controlled knee flexion, and drive powerfully back to the top.',
    ],
  },
  {
    id: 'builtin:bulgarian-split-squat',
    canonicalName: 'Bulgarian Split Squat',
    aliases: ['Split Squat (Dumbbell)', 'Rear-Foot Elevated Split Squat', 'RFESS'],
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
    id: 'builtin:walking-lunge-dumbbell',
    canonicalName: 'Walking Lunge (Dumbbell)',
    aliases: ['Lunges (Dumbbell)', 'Dumbbell Lunge', 'Reverse Lunge (Dumbbell)', 'Barbell Lunge'],
    movementPattern: 'squat',
    primaryMuscle: 'Quadriceps',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'quads',
    secondaryRegions: ['glutes', 'hamstrings'],
    instructions: 'Step forward into a deep lunge until both knees bend to roughly 90°, then drive through your front foot into the next step.',
    steps: [
      'Stand tall holding dumbbells at your sides.',
      'Step forward and lower your hips until your trailing knee hovers just above the floor.',
      'Push through your front heel and mid-foot to bring your back leg forward into the next stride.',
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

  // =========================================================================
  // LEGS: POSTERIOR CHAIN / HINGE, GLUTES & CALVES
  // =========================================================================
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
    aliases: ['Romanian Deadlift', 'RDL', 'Barbell RDL', 'Stiff-Legged Deadlift'],
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
    id: 'builtin:romanian-deadlift-dumbbell',
    canonicalName: 'Romanian Deadlift (Dumbbell)',
    aliases: ['Dumbbell RDL', 'DB RDL', 'Dumbbell Romanian Deadlift'],
    movementPattern: 'hinge',
    primaryMuscle: 'Hamstrings',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'hamstrings',
    secondaryRegions: ['glutes', 'lower_back'],
    instructions: 'Hold dumbbells in front of your thighs, push your hips straight back with a flat spine, and drive your hips forward to stand.',
    steps: [
      'Stand tall holding a pair of dumbbells against the front/sides of your thighs with knees softly unlocked.',
      'Hinge your hips straight back while sliding the dumbbells down along your legs until you feel a strong hamstring stretch.',
      'Drive your hips forward to return to standing lockout.',
    ],
  },
  {
    id: 'builtin:hip-thrust-barbell',
    canonicalName: 'Hip Thrust (Barbell)',
    aliases: ['Hip Thrust', 'Barbell Hip Thrust', 'Glute Bridge', 'Hip Thrust (Machine)'],
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
    id: 'builtin:leg-curl-machine',
    canonicalName: 'Seated Leg Curl (Machine)',
    aliases: ['Leg Curl', 'Seated Leg Curl', 'Hamstring Curl'],
    movementPattern: 'isolation',
    primaryMuscle: 'Hamstrings',
    equipment: 'Machine',
    bodyweightBased: false,
    primaryRegion: 'hamstrings',
    secondaryRegions: ['calves'],
    instructions: 'Align your knees with the machine pivot and curl the pad back as far as possible using your hamstrings.',
    steps: [
      'Adjust the machine so your knee joint aligns with the pivot point and the ankle pad rests just above your heels.',
      'Lock the thigh pad tightly over your quads to prevent your hips from rising.',
      'Curl your heels back toward your glutes for a full hamstring contraction, then return slowly to a full stretch.',
    ],
  },
  {
    id: 'builtin:lying-leg-curl-machine',
    canonicalName: 'Lying Leg Curl (Machine)',
    aliases: ['Lying Leg Curl', 'Prone Leg Curl'],
    movementPattern: 'isolation',
    primaryMuscle: 'Hamstrings',
    equipment: 'Machine',
    bodyweightBased: false,
    primaryRegion: 'hamstrings',
    secondaryRegions: ['calves'],
    instructions: 'Lie face-down on the leg curl bench, keep your hips pressed into the pad, and curl the roller toward your glutes.',
    steps: [
      'Lie face-down with your knees aligned with the hinge of the machine and the roller pad resting on your lower calves.',
      'Brace your abs and keep your pelvis pressed flat into the pad throughout the movement.',
      'Curl the weight up toward your glutes, squeeze briefly, and lower slowly to full extension.',
    ],
  },
  {
    id: 'builtin:calf-raise',
    canonicalName: 'Standing Calf Raise',
    aliases: ['Calf Raise', 'Calf Raise (Machine)', 'Leg Press Calf Raise'],
    movementPattern: 'isolation',
    primaryMuscle: 'Calves',
    equipment: 'Machine',
    bodyweightBased: false,
    primaryRegion: 'calves',
    secondaryRegions: [],
    instructions: 'Stand with the balls of your feet on the step, lower your heels into a full stretch, and press up onto your toes.',
    steps: [
      'Place the balls of your feet on the edge of the platform with knees straight.',
      'Lower your heels slowly as far as ankle mobility allows and pause 1 second in the bottom stretch.',
      'Drive through the ball of your big toe to rise as high as possible, squeezing the calves at the top.',
    ],
  },
  {
    id: 'builtin:seated-calf-raise',
    canonicalName: 'Seated Calf Raise',
    aliases: ['Seated Calf Raise (Machine)'],
    movementPattern: 'isolation',
    primaryMuscle: 'Calves',
    equipment: 'Machine',
    bodyweightBased: false,
    primaryRegion: 'calves',
    secondaryRegions: [],
    instructions: 'Sit with the thigh pad snug above your knees and press up onto the balls of your feet through a full stretch and contraction.',
    steps: [
      'Sit in the machine with the balls of your feet on the step and the pad secured just above your knees.',
      'Release the safety bar and lower your heels into a deep 1-second pause at the bottom stretch.',
      'Drive all the way up onto your toes to full soleus contraction before lowering slowly.',
    ],
  },

  // =========================================================================
  // ARMS: BICEPS, TRICEPS & FOREARMS
  // =========================================================================
  {
    id: 'builtin:bicep-curl-dumbbell',
    canonicalName: 'Bicep Curl (Dumbbell)',
    aliases: ['Dumbbell Curl', 'DB Curl', 'Alternating Dumbbell Curl'],
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
    id: 'builtin:barbell-curl',
    canonicalName: 'Barbell Curl',
    aliases: ['Bicep Curl (Barbell)', 'EZ-Bar Curl', 'EZ Bar Curl', 'BB Curl'],
    movementPattern: 'isolation',
    primaryMuscle: 'Biceps',
    equipment: 'Barbell',
    bodyweightBased: false,
    primaryRegion: 'biceps',
    secondaryRegions: ['forearms'],
    instructions: 'Hold a straight or EZ-bar with an underhand grip and curl the bar in a smooth arc without leaning back.',
    steps: [
      'Stand tall holding a barbell or EZ-bar at hip level with an underhand shoulder-width grip.',
      'Keep your elbows pinned to your sides and curl the bar upward to chest/shoulder height.',
      'Lower the bar slowly for 2–3 seconds to full arm extension.',
    ],
  },
  {
    id: 'builtin:hammer-curl-dumbbell',
    canonicalName: 'Hammer Curl (Dumbbell)',
    aliases: ['Hammer Curl', 'DB Hammer Curl', 'Rope Hammer Curl'],
    movementPattern: 'isolation',
    primaryMuscle: 'Biceps',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'biceps',
    secondaryRegions: ['forearms'],
    instructions: 'Hold dumbbells with a neutral (palms facing each other) grip and curl them up to target the brachialis and biceps.',
    steps: [
      'Stand tall with dumbbells at your sides and palms facing inward (neutral grip) throughout the set.',
      'Keep your upper arms stationary and curl the weights up until thumbs near shoulder level.',
      'Lower under control to full elbow extension.',
    ],
  },
  {
    id: 'builtin:incline-dumbbell-curl',
    canonicalName: 'Incline Dumbbell Curl',
    aliases: ['Incline Curl (Dumbbell)', 'Seated Incline Curl'],
    movementPattern: 'isolation',
    primaryMuscle: 'Biceps',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'biceps',
    secondaryRegions: ['forearms'],
    instructions: 'Lie back on a 45°–60° incline bench so your arms hang behind your torso for a deep long-head bicep stretch, then curl up.',
    steps: [
      'Set a bench to 45°–60° and sit back with your shoulders pinned against the pad and arms hanging straight down.',
      'Keep your elbows pointing toward the floor behind your torso as you curl the dumbbells up.',
      'Lower all the way down until your elbows lock out in a full bicep stretch.',
    ],
  },
  {
    id: 'builtin:preacher-curl',
    canonicalName: 'Preacher Curl',
    aliases: ['Preacher Curl (EZ-Bar)', 'Preacher Curl (Machine)', 'Dumbbell Preacher Curl'],
    movementPattern: 'isolation',
    primaryMuscle: 'Biceps',
    equipment: 'Barbell',
    bodyweightBased: false,
    primaryRegion: 'biceps',
    secondaryRegions: ['forearms'],
    instructions: 'Rest the back of your upper arms flat on the preacher pad and curl the weight from full stretch to contraction.',
    steps: [
      'Adjust the seat so your armpits sit snug near the top of the preacher pad with upper arms flat against it.',
      'Lower the bar under strict control until your arms are nearly fully extended.',
      'Curl the weight back up while keeping the backs of your arms glued to the pad.',
    ],
  },
  {
    id: 'builtin:triceps-pushdown',
    canonicalName: 'Triceps Pushdown',
    aliases: ['Tricep Pushdown', 'Triceps Pushdown (Cable)', 'Rope Pushdown', 'Tricep Rope Pushdown'],
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
    id: 'builtin:overhead-triceps-extension',
    canonicalName: 'Overhead Triceps Extension (Cable)',
    aliases: ['Overhead Tricep Extension', 'Overhead Triceps Extension (Dumbbell)', 'Cable Overhead Tricep Extension'],
    movementPattern: 'isolation',
    primaryMuscle: 'Triceps',
    equipment: 'Cable',
    bodyweightBased: false,
    primaryRegion: 'triceps',
    secondaryRegions: [],
    instructions: 'Hold the rope or dumbbell overhead with elbows pointed forward and extend your forearms to full lockout.',
    steps: [
      'Face away from a cable pulley (or hold a dumbbell overhead) with upper arms elevated beside your ears.',
      'Let your elbows bend deeply behind your head to stretch the long head of the triceps.',
      'Extend your forearms to full lockout without flaring your elbows wide.',
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
  {
    id: 'builtin:close-grip-bench-press',
    canonicalName: 'Close-Grip Bench Press (Barbell)',
    aliases: ['Close Grip Bench Press', 'CGBP'],
    movementPattern: 'push',
    primaryMuscle: 'Triceps',
    equipment: 'Barbell',
    bodyweightBased: false,
    primaryRegion: 'triceps',
    secondaryRegions: ['chest', 'shoulders'],
    instructions: 'Grip the barbell at shoulder width, keep elbows tucked close to your ribs on the descent, and press to lockout.',
    steps: [
      'Lie on a flat bench and grip the barbell at roughly shoulder width.',
      'Lower the bar to your lower sternum while keeping your elbows tucked close to your sides.',
      'Press forcefully back to full elbow lockout.',
    ],
  },

  // =========================================================================
  // CORE / ABS
  // =========================================================================
  {
    id: 'builtin:plank',
    canonicalName: 'Plank',
    aliases: ['Forearm Plank', 'Weighted Plank'],
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
  {
    id: 'builtin:hanging-leg-raise',
    canonicalName: 'Hanging Leg Raise',
    aliases: ['Hanging Knee Raise', 'Captain’s Chair Leg Raise', 'Toes to Bar'],
    movementPattern: 'isolation',
    primaryMuscle: 'Core',
    equipment: 'Bodyweight',
    bodyweightBased: true,
    primaryRegion: 'abs',
    secondaryRegions: ['forearms'],
    instructions: 'Hang from a pull-up bar and curl your pelvis and legs upward using your abs without swinging.',
    steps: [
      'Hang from an overhead bar with a firm grip and shoulders engaged.',
      'Raise your legs (or knees) upward while curling your pelvis up toward your ribs at the top.',
      'Lower your legs slowly under control to prevent momentum and swinging.',
    ],
  },
  {
    id: 'builtin:cable-crunch',
    canonicalName: 'Cable Crunch',
    aliases: ['Kneeling Cable Crunch', 'Ab Crunch (Machine)', 'Crunch'],
    movementPattern: 'isolation',
    primaryMuscle: 'Core',
    equipment: 'Cable',
    bodyweightBased: false,
    primaryRegion: 'abs',
    secondaryRegions: [],
    instructions: 'Kneel below a high pulley holding a rope behind your head and flex your spine to curl your ribs toward your pelvis.',
    steps: [
      'Kneel in front of a high pulley holding the rope ends beside your head with hips locked in place.',
      'Flex your abs to curl your upper torso down, bringing your elbows toward your knees.',
      'Extend your spine slowly at the top to stretch the abs before the next rep.',
    ],
  },
  {
    id: 'builtin:ab-wheel-rollout',
    canonicalName: 'Ab Wheel Rollout',
    aliases: ['Ab Rollout', 'Barbell Rollout'],
    movementPattern: 'core',
    primaryMuscle: 'Core',
    equipment: 'Bodyweight',
    bodyweightBased: true,
    primaryRegion: 'abs',
    secondaryRegions: ['lats', 'shoulders'],
    instructions: 'Kneel on a pad, brace your abs in a slight pelvic tuck, roll the wheel forward as far as you can without your lower back arching, and pull back.',
    steps: [
      'Kneel on a mat holding the ab wheel beneath your shoulders with glutes squeezed and ribs tucked down.',
      'Roll forward slowly while maintaining a rigid core and preventing your lower back from sagging.',
      'Brace your abs and lats to pull the wheel back under your shoulders.',
    ],
  },
  {
    id: 'builtin:decline-bench-press-barbell',
    canonicalName: 'Decline Bench Press (Barbell)',
    aliases: ['Decline Bench Press', 'Decline Barbell Bench Press', 'Decline Dumbbell Bench Press'],
    movementPattern: 'push',
    primaryMuscle: 'Chest',
    equipment: 'Barbell',
    bodyweightBased: false,
    primaryRegion: 'chest',
    secondaryRegions: ['triceps', 'shoulders'],
    instructions: 'Secure your legs at the end of a decline bench, lower the bar to your lower sternum, and press straight up to lockout.',
    steps: [
      'Lie back on a 15°–30° decline bench with your feet hooked securely under the leg pads and shoulder blades retracted.',
      'Unrack the bar and lower it under control to your lower chest.',
      'Press forcefully back to full elbow extension over your shoulders.',
    ],
  },
  {
    id: 'builtin:dumbbell-pullover',
    canonicalName: 'Dumbbell Pullover',
    aliases: ['Pullover (Dumbbell)', 'Straight-Arm Dumbbell Pullover'],
    movementPattern: 'pull',
    primaryMuscle: 'Lats',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'lats',
    secondaryRegions: ['chest', 'triceps'],
    instructions: 'Lie on a flat bench holding one dumbbell with both hands over your chest, lower it in an arc behind your head, and pull back over your sternum.',
    steps: [
      'Lie flat on a bench and cup the top plate of a single dumbbell with both hands above your chest.',
      'Keep a slight, fixed bend in your elbows and lower the dumbbell backward past your head until you feel a deep stretch in your lats.',
      'Contract your lats and chest to sweep the weight back over your chest.',
    ],
  },
  {
    id: 'builtin:front-raise-dumbbell',
    canonicalName: 'Front Raise (Dumbbell)',
    aliases: ['Front Raise', 'Dumbbell Front Raise', 'Cable Front Raise', 'Plate Front Raise'],
    movementPattern: 'isolation',
    primaryMuscle: 'Shoulders',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'shoulders',
    secondaryRegions: ['chest'],
    instructions: 'Stand tall holding weights in front of your thighs and raise your arms forward to shoulder height with a controlled tempo.',
    steps: [
      'Stand upright with dumbbells resting in front of your thighs and a soft bend in the elbows.',
      'Raise the weights forward and upward until your hands reach shoulder level without swinging your torso.',
      'Lower slowly for 2 seconds back to the starting position.',
    ],
  },
  {
    id: 'builtin:upright-row-barbell',
    canonicalName: 'Upright Row (Barbell)',
    aliases: ['Upright Row', 'Dumbbell Upright Row', 'Cable Upright Row', 'EZ-Bar Upright Row'],
    movementPattern: 'pull',
    primaryMuscle: 'Shoulders',
    equipment: 'Barbell',
    bodyweightBased: false,
    primaryRegion: 'shoulders',
    secondaryRegions: ['traps', 'biceps'],
    instructions: 'Hold a barbell or dumbbells at hip level with a shoulder-width grip and pull upward by leading with your elbows to shoulder height.',
    steps: [
      'Stand tall holding a bar or dumbbells at shoulder width in front of your thighs.',
      'Lead with your elbows out and up until your upper arms reach parallel with the floor.',
      'Lower the weight smoothly under control.',
    ],
  },
  {
    id: 'builtin:good-morning-barbell',
    canonicalName: 'Good Morning (Barbell)',
    aliases: ['Good Morning', 'Barbell Good Morning'],
    movementPattern: 'hinge',
    primaryMuscle: 'Hamstrings',
    equipment: 'Barbell',
    bodyweightBased: false,
    primaryRegion: 'hamstrings',
    secondaryRegions: ['glutes', 'lower_back'],
    instructions: 'Rest a barbell across your upper back, unlock your knees slightly, hinge your hips straight back keeping a flat spine, and drive hips forward.',
    steps: [
      'Set the barbell across your upper traps as in a back squat and stand with feet hip-width apart.',
      'Brace your core 360°, keep a soft bend in the knees, and push your hips straight back until your torso is nearly parallel to the floor.',
      'Drive your hips forward to return to standing lockout.',
    ],
  },
  {
    id: 'builtin:step-up-dumbbell',
    canonicalName: 'Step-Up (Dumbbell)',
    aliases: ['Step-Up', 'Step Up', 'Dumbbell Step-Up', 'Box Squat'],
    movementPattern: 'squat',
    primaryMuscle: 'Quadriceps',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'quads',
    secondaryRegions: ['glutes', 'hamstrings'],
    instructions: 'Place one foot flat on a box or bench, lean slightly over your front leg, drive through that heel to stand tall on the box, and step down slowly.',
    steps: [
      'Stand facing a knee-height box or bench holding dumbbells at your sides and place one foot flat on the surface.',
      'Drive through your elevated heel without pushing off your trailing foot to stand all the way up.',
      'Lower yourself back to the floor over 2–3 seconds under control.',
    ],
  },
  {
    id: 'builtin:lying-leg-raise',
    canonicalName: 'Lying Leg Raise',
    aliases: ['Flat Bench Leg Raise', 'Floor Leg Raise', 'Reverse Crunch'],
    movementPattern: 'core',
    primaryMuscle: 'Core',
    equipment: 'Bodyweight',
    bodyweightBased: true,
    primaryRegion: 'abs',
    secondaryRegions: [],
    instructions: 'Lie flat on your back with lower back pressed into the floor, raise your legs to vertical, and lower slowly without overarching.',
    steps: [
      'Lie flat on a mat or bench, press your lower back firmly into the pad, and extend your legs straight out.',
      'Contract your abs to raise your legs in an arc until they are perpendicular to the floor, curling your pelvis slightly at the top.',
      'Lower your legs slowly while keeping your lower back anchored.',
    ],
  },
  {
    id: 'builtin:farmers-walk',
    canonicalName: "Farmer's Walk",
    aliases: ['Farmers Walk', 'Farmer Carry', 'Suitcase Carry', 'Loaded Carry'],
    movementPattern: 'carry',
    primaryMuscle: 'Forearms',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    primaryRegion: 'forearms',
    secondaryRegions: ['traps', 'abs', 'glutes'],
    instructions: 'Hold heavy dumbbells or kettlebells at your sides with proud posture, braced abs, and walk with controlled, even steps.',
    steps: [
      'Deadlift a pair of heavy dumbbells or farmer handles to standing lockout with shoulders pulled back and down.',
      'Brace your core and glutes to keep your torso upright without leaning or swaying.',
      'Walk forward with controlled, steady steps for the target distance or time.',
    ],
  },
];

export const BUILTIN_CATALOGUE: CatalogueEntry[] = RAW_BUILTIN_CATALOGUE.map(
  ({ aliases: _aliases, ...entry }) => ({
    ...entry,
    recordedName: null,
  }),
);

export const BUILTIN_ALIASES_BY_CANONICAL: Record<string, string[]> = Object.fromEntries(
  RAW_BUILTIN_CATALOGUE.map((spec) => [spec.canonicalName.toLowerCase(), spec.aliases ?? []]),
);

const TOKEN_SYNONYM: Record<string, string> = {
  db: 'dumbbell',
  dumbbells: 'dumbbell',
  bb: 'barbell',
  barbells: 'barbell',
  kb: 'kettlebell',
  kettlebells: 'kettlebell',
  cables: 'cable',
  machines: 'machine',
  curls: 'curl',
  rows: 'row',
  squats: 'squat',
  deadlifts: 'deadlift',
  lunges: 'lunge',
  dips: 'dip',
  raises: 'raise',
  extensions: 'extension',
  pulldowns: 'pulldown',
  pushdowns: 'pushdown',
  pressdowns: 'pushdown',
  shrugs: 'shrug',
  flyes: 'fly',
  flies: 'fly',
  flys: 'fly',
  pullups: 'pull up',
  chinups: 'chin up',
  pushups: 'push up',
  tricep: 'triceps',
  bicep: 'biceps',
  glute: 'glutes',
};

/**
 * Normalizes an exercise name into a canonical sorted token bag (expanding
 * common equipment abbreviations and singularizing plurals) so that
 * "Barbell Bench Press", "BB Bench Press", and "Bench Press (Barbell)"
 * produce the exact same key.
 */
export const normalizeExerciseKey = (s: string): string => {
  const rawTokens = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const normalized: string[] = [];
  for (const t of rawTokens) {
    const mapped = TOKEN_SYNONYM[t] ?? t;
    for (const part of mapped.split(' ')) {
      if (part) normalized.push(part);
    }
  }
  return Array.from(new Set(normalized)).sort().join(' ');
};

// Precomputed O(1) lookup maps for built-in exercises
const BUILTIN_ENTRY_BY_ID = new Map<string, CatalogueEntry>();
const BUILTIN_BY_LOWER_NAME = new Map<string, CatalogueEntry>();
const BUILTIN_BY_NORM_KEY = new Map<string, CatalogueEntry>();

for (const spec of RAW_BUILTIN_CATALOGUE) {
  const { aliases, ...rest } = spec;
  const entry: CatalogueEntry = { ...rest, recordedName: null };
  BUILTIN_ENTRY_BY_ID.set(spec.id, entry);

  const canonLower = spec.canonicalName.toLowerCase();
  BUILTIN_BY_LOWER_NAME.set(canonLower, entry);
  BUILTIN_BY_NORM_KEY.set(normalizeExerciseKey(spec.canonicalName), entry);

  if (aliases) {
    for (const alias of aliases) {
      const aliasLower = alias.toLowerCase();
      if (!BUILTIN_BY_LOWER_NAME.has(aliasLower)) {
        BUILTIN_BY_LOWER_NAME.set(aliasLower, entry);
      }
      const aliasNorm = normalizeExerciseKey(alias);
      if (!BUILTIN_BY_NORM_KEY.has(aliasNorm)) {
        BUILTIN_BY_NORM_KEY.set(aliasNorm, entry);
      }
    }
  }
}

/**
 * Fast O(1) strict identity match against the built-in catalogue (exact name,
 * exact alias, or normalized token-bag match). Never uses loose stem guessing,
 * making it safe for deduplicating search results and database entries.
 */
export const findBuiltinByIdentity = (name: string | null | undefined): CatalogueEntry | null => {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const byLower = BUILTIN_BY_LOWER_NAME.get(trimmed.toLowerCase());
  if (byLower) return { ...byLower, recordedName: trimmed };

  const byNorm = BUILTIN_BY_NORM_KEY.get(normalizeExerciseKey(trimmed));
  if (byNorm) return { ...byNorm, recordedName: trimmed };

  return null;
};

/**
 * Returns a canonical deduplication key for any exercise name / canonicalName pair.
 * Exercises that map to the same built-in exercise share its `builtin:...` ID;
 * custom exercises share their normalized token-bag key.
 */
export const exerciseIdentityKey = (
  name: string,
  canonicalName?: string | null,
): string => {
  const builtin =
    (canonicalName ? findBuiltinByIdentity(canonicalName) : null) ??
    findBuiltinByIdentity(name);
  if (builtin) return builtin.id;
  return `custom:${normalizeExerciseKey(canonicalName || name)}`;
};

/**
 * Finds a built-in catalogue entry matching the given exercise name (exact,
 * alias, or normalized word-set match like "Barbell Bench Press" <-> "Bench Press (Barbell)"),
 * falling back to stem keywords for how-to modal enrichment.
 */
export const findBuiltinCatalogueEntry = (name: string): CatalogueEntry | null => {
  const strict = findBuiltinByIdentity(name);
  if (strict) return strict;

  const trimmed = name.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

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
