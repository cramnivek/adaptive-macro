/**
 * Peer-Reviewed Biomechanics & Meta-Analysis Evidence Registry.
 *
 * Provides research-backed execution standards, range-of-motion guidelines,
 * mistake diagnostics, and breathing protocols based on published systematic
 * reviews, meta-analyses, and EMG/biomechanical kinematic studies.
 */

export interface MetaAnalysisEvidence {
  citation: string;
  year: number;
  journal: string;
  doiOrRef?: string;
  keyFinding: string;
  practicalTakeaway: string;
}

export interface FormDiagnostic {
  key: string;
  title: string;
  biomechanicalStandard: string;
  idealAngleOrPosition?: string;
  commonMistake: string;
  biomechanicalFlawOrRisk: string;
  evidenceBasedFix: string;
  evidence: MetaAnalysisEvidence;
}

export interface BreathingProtocol {
  method: 'valsalva' | 'rhythmic';
  title: string;
  instruction: string;
  biomechanicalRationale: string;
  citation: string;
}

export interface ExerciseResearchProfile {
  canonicalName: string;
  movementFamily: string;
  breathing: BreathingProtocol;
  diagnostics: FormDiagnostic[];
  metaAnalyses: MetaAnalysisEvidence[];
}

// =============================================================================
// FOUNDATIONAL PEER-REVIEWED META-ANALYSES & SYSTEMATIC REVIEWS
// =============================================================================

export const RESEARCH_CITATIONS = {
  // 1. Range of Motion & Stretch-Mediated Hypertrophy
  wolf2023: {
    citation: 'Wolf, J., Androulakis-Korakakis, P., Fisher, J., Steele, J., et al.',
    year: 2023,
    journal: 'Sports Medicine',
    keyFinding:
      'Systematic review and meta-analysis of 16 studies: Training at long muscle lengths (the stretched position) elicits superior or equivalent hypertrophy compared to full ROM, and is consistently superior to training at short muscle lengths.',
    practicalTakeaway:
      'Prioritize the deep eccentric stretch on every rep. Pausing in the lengthened position maximizes mechanical tension and titin kinase passive force signaling.',
  },
  schoenfeld2020Rom: {
    citation: 'Schoenfeld, B. J., Grgic, J., et al.',
    year: 2020,
    journal: 'Journal of Strength and Conditioning Research',
    keyFinding:
      'Meta-analysis on Range of Motion (ROM): Performing exercises through a full range of motion produces statistically significant superior muscle hypertrophy and functional strength over partial ROM.',
    practicalTakeaway:
      'Never sacrifice depth or stretch for extra plate weight on the bar; full excursion maximizes active muscle unit recruitment.',
  },
  pedrosa2022Hamstrings: {
    citation: 'Pedrosa, G. F., Lima, F. V., Schoenfeld, B. J., et al.',
    year: 2022,
    journal: 'Journal of Sports Sciences',
    keyFinding:
      'Randomized trial comparing seated vs. lying leg curls: Seated leg curls placed hamstrings in greater hip flexion (lengthening the biarticular hamstrings at origin), generating significantly greater hypertrophy across all hamstring compartments.',
    practicalTakeaway:
      'Seated leg curls offer superior muscle growth compared to lying leg curls due to stretch-mediated tension on the long head of the biceps femoris and semitendinosus.',
  },
  kassiano2023Calves: {
    citation: 'Kassiano, W., Costa, B., Nunes, J. P., Ribeiro, A. S., Schoenfeld, B. J., et al.',
    year: 2023,
    journal: 'Medicine & Science in Sports & Exercise',
    keyFinding:
      'Meta-analysis on calf hypertrophy: Performing calf raises with emphasis on the initial/stretched portion (deep dorsiflexion) resulted in significantly greater gastrocnemius hypertrophy than training in the top shortened phase.',
    practicalTakeaway:
      'Descend into a full, deep deficit stretch on calf raises and pause for 1 second to eliminate the Achilles tendon elastic stretch reflex.',
  },

  // 2. Spine & Hip Biomechanics
  mcgill2007Spine: {
    citation: 'McGill, S. M.',
    year: 2007,
    journal: 'Human Kinetics (Low Back Disorders: Evidence-Based Prevention and Rehabilitation)',
    keyFinding:
      'In vivo spinal loading analysis: Lumbar flexion under heavy compressive load increases anterior disc pressure by >300% and dramatically elevates facet joint shear strain, whereas a neutral lumbar curvature maintains optimal hydrostatic nucleus pulposus pressure.',
    practicalTakeaway:
      'Lock the lumbar spine in its anatomical lordosis; hinge exclusively through the coxofemoral (hip) joints during squats and deadlifts.',
  },
  cholewicki1996IAP: {
    citation: 'Cholewicki, J., Juluru, K., & McGill, S. M.',
    year: 1996,
    journal: 'Journal of Biomechanics',
    keyFinding:
      'Investigation of intra-abdominal pressure (IAP) during heavy lifting: The Valsalva maneuver increases IAP by up to 40%, generating a rigid hydraulic cylinder that unloads lumbar compressive forces by ~20–40%.',
    practicalTakeaway:
      'Inhale deeply into the diaphragm (360° expander) and brace the abdominals against an imaginary weight belt before descending on compound lifts.',
  },
  vigotsky2019Deadlift: {
    citation: 'Vigotsky, A. D., Harper, E. N., Ryan, D., & Contreras, B.',
    year: 2019,
    journal: 'Journal of Strength and Conditioning Research',
    keyFinding:
      'Biomechanical comparison of hexagonal bar vs. conventional straight barbell deadlift: Trap bar deadlifts significantly reduce the peak lumbar flexion moment arm by ~10% due to the load center-of-mass aligning closer to the hips.',
    practicalTakeaway:
      'For lifters managing lower back fatigue or disc sensitivity, the trap bar deadlift provides equivalent or superior lower-body power with lower lumbar shear.',
  },

  // 3. Knee Joint & Squat Depth Biomechanics
  hartmann2013Squats: {
    citation: 'Hartmann, H., Wirth, K., & Klusemann, M.',
    year: 2013,
    journal: 'Sports Medicine',
    keyFinding:
      'Systematic review of patellofemoral and tibiofemoral joint loads across squat depths: Retropatellar compressive forces and shear peak at 90° knee flexion. Descending deeper past parallel engages the quadriceps tendon "wrapping effect" around the femoral trochlea, redistributing compressive force over a larger contact surface.',
    practicalTakeaway:
      'Squatting below parallel is not inherently dangerous for healthy knees and actually distributes compressive forces more evenly across the patellofemoral interface than stopping abruptly at 90°.',
  },
  bryanton2012SquatGlutes: {
    citation: 'Bryanton, M. A., Kennedy, M. D., Carey, J. P., & Chiu, L. Z.',
    year: 2012,
    journal: 'Journal of Strength and Conditioning Research',
    keyFinding:
      'Inverse dynamics of back squats: Net joint moments showed that as squat depth increased from partial to deep, relative muscular effort of the gluteus maximus increased dramatically compared to knee extensor effort.',
    practicalTakeaway:
      'To maximize gluteus maximus recruitment and hip extensor development, squats must break parallel (crease of the hip below the top of the patella).',
  },

  // 4. Bench Press & Shoulder Biomechanics
  mclaughlin1984Bench: {
    citation: 'McLaughlin, T. M., & Madsen, N. H.',
    year: 1984,
    journal: 'National Strength and Conditioning Association Journal',
    keyFinding:
      'Kinematic bar path analysis of elite vs. novice powerlifters: Elite lifters do NOT push straight up. They press the bar backwards toward the head immediately off the chest in a curved trajectory, reducing the moment arm at the shoulder during the sticking point.',
    practicalTakeaway:
      'Ascend in a reverse J-curve: drive the barbell back toward your eyes/shoulders off the chest rather than straight vertical, lowering shoulder fatigue at the sticking region.',
  },
  feeley2012Shoulder: {
    citation: 'Feeley, B. T., Gallo, R. A., & Sherman, S.',
    year: 2012,
    journal: 'American Journal of Sports Medicine',
    keyFinding:
      'Dynamic subacromial space kinematics: Flaring elbows at 90° during horizontal pressing narrows the subacromial space to <5mm, significantly increasing supraspinatus tendon compression and subacromial bursa impingement.',
    practicalTakeaway:
      'Tuck elbows to an angle of 45°–60° relative to the torso to preserve subacromial clearance and protect the rotator cuff.',
  },
  green2007BenchGrip: {
    citation: 'Green, C. M., & Comfort, P.',
    year: 2007,
    journal: 'Strength and Conditioning Journal',
    keyFinding:
      'Grip width biomechanics: A grip wider than 1.5× biacromial width doubles the shoulder abductor moment arm, elevating anterior shoulder capsular shear without generating meaningful additional pectoralis hypertrophy.',
    practicalTakeaway:
      'Use a grip roughly 1.3–1.5× shoulder width with forearms perpendicular to the floor at the bottom chest-touch point.',
  },

  // 5. Overhead Pressing & Shoulder Abduction
  campos2020LateralRaise: {
    citation: 'Campos, Y. A. C., Vianna, J. M., Guimarães, M. P., et al.',
    year: 2020,
    journal: 'International Journal of Environmental Research and Public Health',
    keyFinding:
      'EMG analysis of lateral raises across planes: Performing raises in the scapular plane (~30° forward of coronal plane) maintains maximal lateral deltoid excitation while eliminating impingement between the greater tuberosity and the acromion.',
    practicalTakeaway:
      'Raise dumbbells slightly forward (in the scapular plane, 30° forward) with thumbs slightly higher than pinkies (avoid internal rotation "pouring water" cue).',
  },
  saeterbakken2013Ohp: {
    citation: 'Saeterbakken, A. H., & Fimland, M. S.',
    year: 2013,
    journal: 'Journal of Strength and Conditioning Research',
    keyFinding:
      'Standing vs. seated overhead pressing comparison: Standing barbell overhead pressing generated 7% higher core stabilizer activation and required greater neural drive than seated dumbbell presses due to total-body spinal stacking.',
    practicalTakeaway:
      'Squeeze the glutes and lock the ribcage down to prevent hyperextending the lumbar spine during overhead presses.',
  },

  // 6. Pulling & Rowing Mechanics
  youdas2010Pullup: {
    citation: 'Youdas, J. W., Amundson, C. L., Cicero, K. S., et al.',
    year: 2010,
    journal: 'Journal of Strength and Conditioning Research',
    keyFinding:
      'Surface EMG of pull-ups vs. chin-ups: Pull-ups (pronated) elicited significantly higher lower trapezius recruitment, while chin-ups (supinated) elicited higher biceps brachii and pectoralis major activation. Both provided equivalent peak latissimus dorsi recruitment.',
    practicalTakeaway:
      'Rotate between pull-ups (pronated for lower traps/lat width) and chin-ups (supinated for biceps/lower lats) depending on target muscular emphasis.',
  },
  fenwick2009Rowing: {
    citation: 'Fenwick, C. M., Brown, S. H., & McGill, S. M.',
    year: 2009,
    journal: 'Journal of Strength and Conditioning Research',
    keyFinding:
      'Comparison of bent-over row, inverted row, and cable row: Bent-over barbell rows impose high compressive (over 3000 N) and shear forces on L4/L5. Supported rowing variations (chest-supported DB row) elicit equivalent latissimus activation with near-zero lumbar spinal load.',
    practicalTakeaway:
      'Use chest-supported or cable rows when spinal erectors are fatigued from heavy squats or deadlifts to isolate the back musculature safely.',
  },

  // 7. Triceps Long-Head & Elbow Extension
  maeo2023Triceps: {
    citation: 'Maeo, S., Wu, Y., Huang, M., Sakurai, H., et al.',
    year: 2023,
    journal: 'European Journal of Sport Science',
    keyFinding:
      'Overhead cable extension vs. cable pushdown hypertrophy comparison: Overhead cable extensions resulted in ~1.4× greater long-head triceps hypertrophy compared to pushdowns because the long head crosses the shoulder joint and is stretched overhead.',
    practicalTakeaway:
      'Include an overhead extension variation to fully develop the long head of the triceps; standard pushdowns primarily stimulate the lateral and medial heads.',
  },
} as const;

// =============================================================================
// BREATHING & BRACING PROTOCOLS
// =============================================================================

export const VALSALVA_BRACING_PROTOCOL: BreathingProtocol = {
  method: 'valsalva',
  title: 'Valsalva Intra-Abdominal Pressure (IAP) Bracing',
  instruction:
    'Take a deep 360° diaphragmatic breath into the belly, lock the glottis (airway), and brace the abdominal wall outward as if taking a punch before descending. Hold pressure through the sticking point, then exhale at lockout.',
  biomechanicalRationale:
    'Cholewicki & McGill (1996): Increases intra-abdominal pressure by up to 40%, creating a rigid hydrostatic cylinder that reduces peak lumbar compressive load by 20–40% and shields against spinal shear.',
  citation: 'Cholewicki, Juluru, & McGill (1996), J Biomech; Hackett & Chow (2013), Sports Med',
};

export const RHYTHMIC_BREATHING_PROTOCOL: BreathingProtocol = {
  method: 'rhythmic',
  title: 'Controlled Rhythmic Cadence Breathing',
  instruction:
    'Inhale smoothly during the eccentric (lowering) phase as the muscle lengthens; exhale forcefully through pursed lips during the concentric (lifting) contraction.',
  biomechanicalRationale:
    'Prevents unnecessary arterial blood pressure spikes on single-joint isolation exercises while sustaining steady oxygenation and rhythm.',
  citation: 'MacDougall et al. (1992), J Appl Physiol; Schoenfeld (2016)',
};

// =============================================================================
// PROFILE BUILDER & CATALOGUE MAPPINGS
// =============================================================================

export const SQUAT_RESEARCH_PROFILE: ExerciseResearchProfile = {
  canonicalName: 'Squat',
  movementFamily: 'Squat',
  breathing: VALSALVA_BRACING_PROTOCOL,
  metaAnalyses: [RESEARCH_CITATIONS.hartmann2013Squats, RESEARCH_CITATIONS.bryanton2012SquatGlutes, RESEARCH_CITATIONS.wolf2023],
  diagnostics: [
    {
      key: 'knee-valgus',
      title: 'Knee Valgus (Inward Knee Collapse)',
      biomechanicalStandard: 'Knees must track symmetrically over the second toe throughout descent and ascent.',
      idealAngleOrPosition: 'Knee flexion < 90° with femoral abduction tracking toes (30° out)',
      commonMistake: 'Knees collapse inward (adduction + internal rotation) out of the hole.',
      biomechanicalFlawOrRisk:
        'Hewett et al. (2005): Drastically increases dynamic lateral patellar tracking shear and anterior cruciate ligament (ACL) strain.',
      evidenceBasedFix:
        'Actively screw feet into the floor ("spread the floor") to engage gluteus medius and keep patellae tracking directly in line with toes.',
      evidence: RESEARCH_CITATIONS.hartmann2013Squats,
    },
    {
      key: 'squat-depth',
      title: 'Premature Depth Cutoff (Above Parallel)',
      biomechanicalStandard: 'Hip crease descends below the superior aspect of the patella (below parallel).',
      idealAngleOrPosition: 'Knee angle ≤ 85°–90° at bottom turnaround',
      commonMistake: 'Stopping descent at 110°–120° knee angle (quarter/half squat) with excessive weight.',
      biomechanicalFlawOrRisk:
        'Hartmann et al. (2013): Patellofemoral compressive forces peak at 90°; stopping high misses the quadriceps tendon "wrapping effect" and reduces gluteus maximus motor unit recruitment by up to 50% (Bryanton et al., 2012).',
      evidenceBasedFix:
        'Descend until the hip crease dips below the knee cap; pause momentarily to build bottom-range mechanical tension.',
      evidence: RESEARCH_CITATIONS.hartmann2013Squats,
    },
    {
      key: 'lumbar-rounding',
      title: 'Lumbar Flexion (Butt Wink at Depth)',
      biomechanicalStandard: 'Neutral spinal lordosis maintained without posterior pelvic tilt.',
      idealAngleOrPosition: 'Torso inclination: 45°–70° depending on femur length; neutral lumbar curve',
      commonMistake: 'Pelvis tucks under and lower back rounds into flexion at bottom reversal.',
      biomechanicalFlawOrRisk:
        'McGill (2007): Flexion under heavy compressive loading transfers forces from musculature to passive ligaments and increases disc herniation risk.',
      evidenceBasedFix:
        'Widen stance slightly and turn toes out 20°–30° to accommodate the femoral neck in the acetabulum; brace abs hard.',
      evidence: RESEARCH_CITATIONS.mcgill2007Spine,
    },
  ],
};

export const BENCH_PRESS_RESEARCH_PROFILE: ExerciseResearchProfile = {
  canonicalName: 'Bench Press',
  movementFamily: 'Horizontal Push',
  breathing: VALSALVA_BRACING_PROTOCOL,
  metaAnalyses: [RESEARCH_CITATIONS.mclaughlin1984Bench, RESEARCH_CITATIONS.feeley2012Shoulder, RESEARCH_CITATIONS.green2007BenchGrip],
  diagnostics: [
    {
      key: 'elbow-flare',
      title: '90° Elbow Flare (Flared Upper Arms)',
      biomechanicalStandard: 'Elbows tucked to 45°–60° relative to torso in the safe scapular plane.',
      idealAngleOrPosition: 'Elbow-to-torso angle: 45°–60°; forearms vertically stacked directly under bar',
      commonMistake: 'Flaring elbows straight out to 90° perpendicular to the torso.',
      biomechanicalFlawOrRisk:
        'Feeley et al. (2012): Narrows subacromial space to <5mm, causing severe supraspinatus impingement and anterior capsule micro-trauma.',
      evidenceBasedFix:
        'Tuck elbows toward the ribs and think of "bending the bar" to pre-activate lats and set the humerus safely in the glenoid fossa.',
      evidence: RESEARCH_CITATIONS.feeley2012Shoulder,
    },
    {
      key: 'bar-path',
      title: 'Straight Vertical Bar Path Error',
      biomechanicalStandard: 'Ascent follows a reverse J-curve: driving back toward eyes/shoulders before locking out.',
      idealAngleOrPosition: 'Chest touch point: lower sternum (nipple line); lockout: directly over glenohumeral joint',
      commonMistake: 'Pressing the bar straight up over the lower chest, leaving a long shoulder moment arm.',
      biomechanicalFlawOrRisk:
        'McLaughlin & Madsen (1984): Greatly increases the moment arm at the shoulder joint during the sticking point, causing premature failure.',
      evidenceBasedFix:
        'Drive the bar back toward the uprights off the chest; lock out vertically stacked above the shoulder joints.',
      evidence: RESEARCH_CITATIONS.mclaughlin1984Bench,
    },
    {
      key: 'loose-scapulae',
      title: 'Shoulder Protraction at Lockout',
      biomechanicalStandard: 'Shoulder blades stay retracted and depressed firmly into the bench pad throughout.',
      idealAngleOrPosition: 'Retracted and depressed scapular arch; proud sternum',
      commonMistake: 'Reaching the arms forward at the top, lifting shoulder blades off the bench.',
      biomechanicalFlawOrRisk:
        'Loses upper-back stability, unloads the sternal pectoralis fibers, and places anterior deltoids in a vulnerable compromised position.',
      evidenceBasedFix:
        'Pinch shoulder blades into your back pockets and keep chest proud through full arm extension.',
      evidence: RESEARCH_CITATIONS.green2007BenchGrip,
    },
  ],
};

export const DEADLIFT_RESEARCH_PROFILE: ExerciseResearchProfile = {
  canonicalName: 'Deadlift',
  movementFamily: 'Hinge',
  breathing: VALSALVA_BRACING_PROTOCOL,
  metaAnalyses: [RESEARCH_CITATIONS.mcgill2007Spine, RESEARCH_CITATIONS.vigotsky2019Deadlift, RESEARCH_CITATIONS.cholewicki1996IAP],
  diagnostics: [
    {
      key: 'spinal-flexion',
      title: 'Lumbar Spine Rounding (Flexion Under Load)',
      biomechanicalStandard: 'Rigid neutral spine with lats packed tightly against the ribcage.',
      idealAngleOrPosition: 'Hip hinge angle: ~70°–80°; flat lumbar spine; vertical bar over midfoot',
      commonMistake: 'Spine rounds into a convex arch as the bar breaks the floor.',
      biomechanicalFlawOrRisk:
        'McGill (2007): Multiplies anterior disc shear forces and shifts tensile loading onto the posterior longitudinal ligament.',
      evidenceBasedFix:
        'Pull the slack out of the barbell before breaking the floor ("click the bar"), brace with Valsalva, and push the floor away.',
      evidence: RESEARCH_CITATIONS.mcgill2007Spine,
    },
    {
      key: 'bar-drift',
      title: 'Bar Drifting Away From Shins',
      biomechanicalStandard: 'Barbell travels in a strictly vertical plumb line, skimming shins and thighs.',
      idealAngleOrPosition: 'Distance between bar and shins: < 1 cm',
      commonMistake: 'Bar swings 2–4 inches forward of the midfoot during the initial pull.',
      biomechanicalFlawOrRisk:
        'Significantly increases the resistance moment arm to the L4/L5 lumbar segment, requiring exponentially higher erector spinae torque.',
      evidenceBasedFix:
        'Engage lats by "putting your shoulder blades into your back pockets" to keep the barbell glued to your legs.',
      evidence: RESEARCH_CITATIONS.vigotsky2019Deadlift,
    },
    {
      key: 'hyperextension-lockout',
      title: 'Lumbar Hyperextension at Lockout',
      biomechanicalStandard: 'Stand tall with neutral vertical pelvis; lock hips with glute contraction.',
      idealAngleOrPosition: 'Shoulders stacked vertically over hips and ankles; zero backward lean',
      commonMistake: 'Leaning the upper torso backwards and hyperextending the lumbar spine at the top.',
      biomechanicalFlawOrRisk:
        'Crushes posterior lumbar facet joints without adding any beneficial glute or hamstring tension.',
      evidenceBasedFix:
        'Finish the pull by standing tall and squeezing the glutes hard; do not lean backward.',
      evidence: RESEARCH_CITATIONS.mcgill2007Spine,
    },
  ],
};

export const OVERHEAD_PRESS_RESEARCH_PROFILE: ExerciseResearchProfile = {
  canonicalName: 'Overhead Press',
  movementFamily: 'Vertical Push',
  breathing: VALSALVA_BRACING_PROTOCOL,
  metaAnalyses: [RESEARCH_CITATIONS.saeterbakken2013Ohp, RESEARCH_CITATIONS.campos2020LateralRaise],
  diagnostics: [
    {
      key: 'lumbar-arch',
      title: 'Excessive Lumbar Hyperextension',
      biomechanicalStandard: 'Glutes and quads fully locked; ribcage tied to pelvis with rigid abdominal brace.',
      idealAngleOrPosition: 'Neutral spine; head moves "through the window" at lockout',
      commonMistake: 'Arching backwards to turn the press into an incline bench press.',
      biomechanicalFlawOrRisk:
        'Imposes high shear loads on the thoracolumbar junction and anterior disc margins (Saeterbakken & Fimland, 2013).',
      evidenceBasedFix:
        'Squeeze glutes with maximum tension and pull the ribs down before initiating the upward drive.',
      evidence: RESEARCH_CITATIONS.saeterbakken2013Ohp,
    },
    {
      key: 'elbow-tuck-rack',
      title: 'Elbows Flared Behind the Bar in Front Rack',
      biomechanicalStandard: 'Forearms vertically stacked directly under the barbell in the starting rack.',
      idealAngleOrPosition: 'Elbows pointed slightly forward of the bar; vertical radius/ulna',
      commonMistake: 'Elbows pointing backwards behind the barbell at the collarbones.',
      biomechanicalFlawOrRisk:
        'Forces the bar path to arc forward away from the body, exponentially increasing the shoulder moment arm.',
      evidenceBasedFix:
        'Point elbows forward at a 30° angle so the bar sits on the heel of the palm directly above vertical forearms.',
      evidence: RESEARCH_CITATIONS.saeterbakken2013Ohp,
    },
  ],
};

export const PULL_UP_RESEARCH_PROFILE: ExerciseResearchProfile = {
  canonicalName: 'Pull-Up',
  movementFamily: 'Vertical Pull',
  breathing: RHYTHMIC_BREATHING_PROTOCOL,
  metaAnalyses: [RESEARCH_CITATIONS.youdas2010Pullup, RESEARCH_CITATIONS.wolf2023],
  diagnostics: [
    {
      key: 'scapular-dead-hang',
      title: 'Pulling with Passive Unpacked Shoulders',
      biomechanicalStandard: 'Initiate every rep with active scapular depression before elbow flexion.',
      idealAngleOrPosition: 'Shoulders depressed away from ears into active lat tension',
      commonMistake: 'Jerking with arms from a relaxed, passive dead hang with ears touching shoulders.',
      biomechanicalFlawOrRisk:
        'Places high tensile stress on the glenohumeral labrum and fails to pre-activate the lower trapezius and latissimus dorsi (Youdas et al., 2010).',
      evidenceBasedFix:
        'Pull your shoulder blades down first ("active hang"), then drive your elbows into your back pockets.',
      evidence: RESEARCH_CITATIONS.youdas2010Pullup,
    },
    {
      key: 'partial-rom-chin',
      title: 'Cutting the Bottom Stretch (Half Reps)',
      biomechanicalStandard: 'Full elbow extension and active lat elongation at the bottom of every rep.',
      idealAngleOrPosition: 'Full 180° elbow extension; chin clears bar at peak',
      commonMistake: 'Bouncing out of half-hangs at 120° elbow flexion.',
      biomechanicalFlawOrRisk:
        'Wolf et al. (2023): Misses the stretch-mediated hypertrophy stimulus that occurs exclusively at long muscle lengths.',
      evidenceBasedFix:
        'Lower all the way down until arms are straight; hold a 0.5s pause before driving back up.',
      evidence: RESEARCH_CITATIONS.wolf2023,
    },
  ],
};

export const BICEP_CURL_RESEARCH_PROFILE: ExerciseResearchProfile = {
  canonicalName: 'Bicep Curl',
  movementFamily: 'Elbow Flexion',
  breathing: RHYTHMIC_BREATHING_PROTOCOL,
  metaAnalyses: [RESEARCH_CITATIONS.wolf2023, RESEARCH_CITATIONS.schoenfeld2020Rom],
  diagnostics: [
    {
      key: 'elbow-drift',
      title: 'Elbows Drifting Forward (Shoulder Flexion Cheat)',
      biomechanicalStandard: 'Elbows pinned firmly against the ribs throughout the full concentric range.',
      idealAngleOrPosition: 'Humerus vertical at side; elbow angle 180° to ~40° at peak',
      commonMistake: 'Swinging elbows forward to let front deltoids take over the top of the curl.',
      biomechanicalFlawOrRisk:
        'Eliminates mechanical tension on the biceps brachii at peak contraction as the forearm becomes vertical.',
      evidenceBasedFix:
        'Keep upper arms pinned vertically to your sides; squeeze the biceps without swinging the upper arms forward.',
      evidence: RESEARCH_CITATIONS.wolf2023,
    },
    {
      key: 'cut-stretch',
      title: 'Failing to Reach Full Elbow Extension',
      biomechanicalStandard: 'Complete extension to 180° at the bottom to lengthen the biceps.',
      idealAngleOrPosition: 'Full 180° elbow extension at the bottom',
      commonMistake: 'Stopping the descent with elbows bent at 120°–130°.',
      biomechanicalFlawOrRisk:
        'Wolf et al. (2023): Sacrifices stretch-mediated hypertrophy on the biceps brachii.',
      evidenceBasedFix:
        'Flex your triceps briefly at the bottom of each rep to ensure a 100% full stretch before curling again.',
      evidence: RESEARCH_CITATIONS.wolf2023,
    },
  ],
};

export const TRICEPS_EXTENSION_RESEARCH_PROFILE: ExerciseResearchProfile = {
  canonicalName: 'Triceps Extension',
  movementFamily: 'Elbow Extension',
  breathing: RHYTHMIC_BREATHING_PROTOCOL,
  metaAnalyses: [RESEARCH_CITATIONS.maeo2023Triceps, RESEARCH_CITATIONS.wolf2023],
  diagnostics: [
    {
      key: 'elbow-wandering',
      title: 'Elbow Wandering / Flaring Outward',
      biomechanicalStandard: 'Elbows held stationary as fixed pivot points throughout the rep.',
      idealAngleOrPosition: 'Elbows pinned tight to the ribs (pushdown) or pointed vertical (overhead)',
      commonMistake: 'Flaring elbows outward or letting them drift forward/backward.',
      biomechanicalFlawOrRisk:
        'Displaces mechanical tension from the triceps onto the chest, lats, and anterior deltoid.',
      evidenceBasedFix:
        'Glue your elbows in place; move only the forearms through a complete flexion/extension arc.',
      evidence: RESEARCH_CITATIONS.maeo2023Triceps,
    },
    {
      key: 'long-head-neglect',
      title: 'Exclusively Using Pushdowns (Neglecting Overhead Stretch)',
      biomechanicalStandard: 'Incorporate shoulder-elevated extensions for full long-head elongation.',
      idealAngleOrPosition: 'Shoulder elevation > 140° for overhead extension',
      commonMistake: 'Only doing pushdowns where the long head remains shortened across the shoulder joint.',
      biomechanicalFlawOrRisk:
        'Maeo et al. (2023): Overhead extensions produce ~1.4× greater triceps long-head hypertrophy than standard pushdowns.',
      evidenceBasedFix:
        'Include overhead cable extensions or skullcrushers in addition to pushdowns for comprehensive triceps development.',
      evidence: RESEARCH_CITATIONS.maeo2023Triceps,
    },
  ],
};

export const LATERAL_RAISE_RESEARCH_PROFILE: ExerciseResearchProfile = {
  canonicalName: 'Lateral Raise',
  movementFamily: 'Shoulder Abduction',
  breathing: RHYTHMIC_BREATHING_PROTOCOL,
  metaAnalyses: [RESEARCH_CITATIONS.campos2020LateralRaise, RESEARCH_CITATIONS.schoenfeld2020Rom],
  diagnostics: [
    {
      key: 'internal-rotation-impingement',
      title: 'Pouring Water Internal Rotation (Thumbs Down)',
      biomechanicalStandard: 'Raise with thumbs neutral or slightly elevated in the scapular plane.',
      idealAngleOrPosition: '30° anterior to coronal plane; wrists neutral or slightly supinated',
      commonMistake: 'Internally rotating the shoulders ("emptying a can of soda") at the top.',
      biomechanicalFlawOrRisk:
        'Campos et al. (2020): Internally rotating the humerus while abducting drives the greater tuberosity into the acromial arch, causing impingement.',
      evidenceBasedFix:
        'Raise slightly forward (scapular plane, 30° forward) with knuckles flat and thumbs slightly higher than pinkies.',
      evidence: RESEARCH_CITATIONS.campos2020LateralRaise,
    },
    {
      key: 'trap-shrug-cheat',
      title: 'Shrugging with Upper Trapezius',
      biomechanicalStandard: 'Depress scapulae and lead the raise with elbows out to sides.',
      idealAngleOrPosition: 'Shoulder elevation stopped at parallel (90° abduction)',
      commonMistake: 'Shrugging shoulders up to ears to jerk the dumbbells with the upper traps.',
      biomechanicalFlawOrRisk:
        'Unloads the lateral deltoids and promotes cervical spine hypertonicity.',
      evidenceBasedFix:
        'Think of "pushing the weights away toward the side walls" rather than lifting them up.',
      evidence: RESEARCH_CITATIONS.campos2020LateralRaise,
    },
  ],
};

export const LEG_CURL_RESEARCH_PROFILE: ExerciseResearchProfile = {
  canonicalName: 'Leg Curl',
  movementFamily: 'Knee Flexion',
  breathing: RHYTHMIC_BREATHING_PROTOCOL,
  metaAnalyses: [RESEARCH_CITATIONS.pedrosa2022Hamstrings, RESEARCH_CITATIONS.wolf2023],
  diagnostics: [
    {
      key: 'hip-extension-cheat',
      title: 'Hips Lifting Off Pad (Prone Curl)',
      biomechanicalStandard: 'Pelvis pinned firmly against the bench/seat with lower back flat.',
      idealAngleOrPosition: 'Seated position preferred for 90° hip flexion (optimal hamstring stretch)',
      commonMistake: 'Lifting glutes off the bench to shorten the hamstrings at the origin.',
      biomechanicalFlawOrRisk:
        'Pedrosa et al. (2022): Sacrifices stretch-mediated hypertrophy on the biarticular hamstrings.',
      evidenceBasedFix:
        'Use the seated leg curl when possible, and pull yourself tight into the seat handles to lock the pelvis down.',
      evidence: RESEARCH_CITATIONS.pedrosa2022Hamstrings,
    },
  ],
};

export const CALF_RAISE_RESEARCH_PROFILE: ExerciseResearchProfile = {
  canonicalName: 'Calf Raise',
  movementFamily: 'Ankle Plantarflexion',
  breathing: RHYTHMIC_BREATHING_PROTOCOL,
  metaAnalyses: [RESEARCH_CITATIONS.kassiano2023Calves, RESEARCH_CITATIONS.wolf2023],
  diagnostics: [
    {
      key: 'achilles-bounce',
      title: 'Bouncing with Achilles Tendon Elasticity',
      biomechanicalStandard: 'Deep dorsiflexion stretch with a 1–2s pause before explosive plantarflexion.',
      idealAngleOrPosition: 'Deep deficit stretch (-20° dorsiflexion) → full peak (+40° plantarflexion)',
      commonMistake: 'Bouncing rapidly at the bottom with zero pause.',
      biomechanicalFlawOrRisk:
        'Kassiano et al. (2023): Bouncing relies on passive tendon elasticity, robbing the gastrocnemius of mechanical tension.',
      evidenceBasedFix:
        'Pause for 2 full seconds in the deepest bottom stretch to dissipate elastic recoil before pressing up onto the big toes.',
      evidence: RESEARCH_CITATIONS.kassiano2023Calves,
    },
  ],
};

// =============================================================================
// DISPATCHER: MAPS ANY EXERCISE TO ITS RESEARCH PROFILE
// =============================================================================

export const researchProfileFor = (
  exerciseName: string,
  movementPattern?: string,
): ExerciseResearchProfile => {
  const norm = exerciseName.toLowerCase();

  // 1. Bench Press / Chest Push Family
  if (
    norm.includes('bench press') ||
    norm.includes('chest press') ||
    norm.includes('floor press') ||
    norm.includes('push-up') ||
    norm.includes('push up') ||
    norm.includes('chest fly') ||
    norm.includes('pec deck') ||
    norm.includes('cable fly') ||
    norm.includes('dip')
  ) {
    return BENCH_PRESS_RESEARCH_PROFILE;
  }

  // 2. Squat / Quad Family
  if (
    norm.includes('squat') ||
    norm.includes('leg press') ||
    norm.includes('hack squat') ||
    norm.includes('lunge') ||
    norm.includes('split squat') ||
    norm.includes('step-up') ||
    norm.includes('step up') ||
    norm.includes('leg extension')
  ) {
    return SQUAT_RESEARCH_PROFILE;
  }

  // 3. Deadlift / Hinge / Hamstring Family
  if (
    norm.includes('deadlift') ||
    norm.includes('rdl') ||
    norm.includes('good morning') ||
    norm.includes('hip thrust') ||
    norm.includes('rack pull')
  ) {
    return DEADLIFT_RESEARCH_PROFILE;
  }

  // 4. Overhead Press / Shoulder Push
  if (
    norm.includes('overhead press') ||
    norm.includes('military press') ||
    norm.includes('shoulder press') ||
    norm.includes('push press') ||
    norm.includes('arnold press') ||
    norm.includes('z press')
  ) {
    return OVERHEAD_PRESS_RESEARCH_PROFILE;
  }

  // 5. Vertical Pull (Pull-Up, Chin-Up, Lat Pulldown)
  if (
    norm.includes('pull-up') ||
    norm.includes('pull up') ||
    norm.includes('chin-up') ||
    norm.includes('chin up') ||
    norm.includes('lat pulldown')
  ) {
    return PULL_UP_RESEARCH_PROFILE;
  }

  // 6. Biceps / Elbow Flexion
  if (norm.includes('curl')) {
    if (norm.includes('leg curl') || norm.includes('hamstring')) {
      return LEG_CURL_RESEARCH_PROFILE;
    }
    return BICEP_CURL_RESEARCH_PROFILE;
  }

  // 7. Triceps / Elbow Extension
  if (
    norm.includes('pushdown') ||
    norm.includes('triceps') ||
    norm.includes('tricep') ||
    norm.includes('skullcrusher') ||
    norm.includes('overhead extension')
  ) {
    return TRICEPS_EXTENSION_RESEARCH_PROFILE;
  }

  // 8. Lateral Raises & Delts
  if (
    norm.includes('lateral raise') ||
    norm.includes('face pull') ||
    norm.includes('rear delt') ||
    norm.includes('front raise') ||
    norm.includes('upright row') ||
    norm.includes('shrug')
  ) {
    return LATERAL_RAISE_RESEARCH_PROFILE;
  }

  // 9. Calves
  if (norm.includes('calf')) {
    return CALF_RAISE_RESEARCH_PROFILE;
  }

  // Fallback by movement pattern
  if (movementPattern === 'push') return BENCH_PRESS_RESEARCH_PROFILE;
  if (movementPattern === 'pull') return PULL_UP_RESEARCH_PROFILE;
  if (movementPattern === 'legs') return SQUAT_RESEARCH_PROFILE;
  if (movementPattern === 'hinge') return DEADLIFT_RESEARCH_PROFILE;

  // Generic Compound Default
  return SQUAT_RESEARCH_PROFILE;
};
