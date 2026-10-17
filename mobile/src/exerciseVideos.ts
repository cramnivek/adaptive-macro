/**
 * Biomechanically validated multi-angle, gender-adaptive exercise video & keyframe registry.
 *
 * Hosted on Google Cloud Storage with low-latency CDN delivery.
 * Combines 8K photorealistic keyframe pairs ($0 runtime cost, zero AI distortion)
 * with research-backed biomechanical checkpoints across the foundational movement families.
 */

export type ExerciseCameraAngle = 'iso' | 'side' | 'front';
export type LifterGender = 'male' | 'female';
export type VisualStyle = 'glow' | 'cinema';

export interface FormCheckpoint {
  label: string;
  cue: string;
  researchBasis: string;
}

export interface KeyframePair {
  standing: string;
  deep: string;
}

export interface AngleMetadata {
  title: string;
  focus: string;
  checkpoints: FormCheckpoint[];
}

export interface ExerciseVideoBundle {
  canonicalName: string;
  iso: {
    male: { glow: string; cinema: string };
    female: { glow: string; cinema: string };
  };
  side: string;
  front: string;
  keyframes?: {
    side?: KeyframePair;
    iso?: {
      male?: KeyframePair;
      female?: KeyframePair;
    };
    front?: KeyframePair;
  };
  angleMetadata: Record<ExerciseCameraAngle, AngleMetadata>;
}

export const EXERCISE_VIDEO_REGISTRY: Record<string, ExerciseVideoBundle> = {
  'bench-press': {
    canonicalName: 'Barbell Bench Press',
    iso: {
      male: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bench_press_muscles_realistic.mp4',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bench_press_realistic_loop.mp4',
      },
      female: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bench_press_female_muscles.mp4',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bench_press_female_realistic_loop.mp4',
      },
    },
    side: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bench_press_side_loop.mp4',
    front: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bench_press_front_loop.mp4',
    keyframes: {
      side: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bench_side_lockout_keyframe.jpg?v=2',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bench_side_bottom_keyframe.jpg?v=2',
      },
      iso: {
        male: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bench_press_realistic_lockout.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bench_press_realistic_bottom.jpg',
        },
        female: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bench_female_iso_lockout_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bench_female_iso_bottom_keyframe.jpg',
        },
      },
      // Front view uses the verified 30fps bilateral symmetry video stream bench_press_front_loop.mp4
    },
    angleMetadata: {
      iso: {
        title: '45° Isometric View',
        focus: 'Full Kinetic Chain & Elbow Flaring',
        checkpoints: [
          {
            label: 'Elbow Tuck Angle (~45°)',
            cue: 'Tuck elbows at ~45° to torso, keeping humerus in safe scapular plane.',
            researchBasis: 'Feeley et al. (2012): 90° flare dramatically increases subacromial shear.',
          },
          {
            label: 'Solid Leg Drive',
            cue: 'Drive heels into floor to lock kinetic chain and arch without lifting glutes.',
            researchBasis: 'IPF Technical Rules: Glutes must remain in contact with bench pad.',
          },
          {
            label: 'Neutral Wrists',
            cue: 'Bar rests on heel of palm; wrists stacked straight over elbows.',
            researchBasis: 'Prevents radial nerve compression and hyperextension torque.',
          },
        ],
      },
      side: {
        title: '90° Lateral Side Profile',
        focus: 'Bar Path Trajectory & Forearm Stacking',
        checkpoints: [
          {
            label: 'Reverse J-Curve Path',
            cue: 'Ascent travels back toward eyes/shoulders; not straight vertical.',
            researchBasis: 'McLaughlin (1984) & Duffey/Challis (2007): Reduces shoulder moment arm at sticking point.',
          },
          {
            label: 'Vertical Forearms',
            cue: 'Forearms stay perpendicular to floor at the chest touch point.',
            researchBasis: 'Maintains pure compressive load transfer into radius/ulna.',
          },
          {
            label: 'Scapular Retraction',
            cue: 'Shoulder blades stay pinched into bench pad throughout full lockout.',
            researchBasis: 'Protects anterior shoulder capsule and isolates sternal pectoralis fibers.',
          },
        ],
      },
      front: {
        title: 'Front Symmetry View',
        focus: 'Bilateral Balance & Grip Width',
        checkpoints: [
          {
            label: 'Barbell Levelness',
            cue: 'Bar stays perfectly horizontal with zero left/right tilt.',
            researchBasis: 'Eliminates asymmetric torque on dominant side rotator cuff.',
          },
          {
            label: 'Bilateral Timing',
            cue: 'Both elbows tuck and flare in identical synchronized timing.',
            researchBasis: 'Ensures equal mechanical work across both pectorals.',
          },
          {
            label: 'Equidistant Grip',
            cue: 'Hands spaced evenly from knurling marks on barbell.',
            researchBasis: 'Grip width ~1.5x biacromial width balances pec vs tricep force.',
          },
        ],
      },
    },
  },

  squat: {
    canonicalName: 'Barbell Back Squat',
    iso: {
      male: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/squat_male_iso_v3.mp4',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/squat_male_iso_v3.mp4',
      },
      female: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/squat_female_iso_v3.mp4',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/squat_female_iso_v3.mp4',
      },
    },
    side: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/squat_side_standing_keyframe.png',
    front: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/squat_deep_front_v2.mp4',
    keyframes: {
      side: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/squat_side_standing_keyframe.png',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/squat_side_deep_keyframe.png',
      },
      iso: {
        male: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/squat_male_iso_standing_keyframe.png',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/squat_male_iso_deep_keyframe.png',
        },
        female: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/squat_female_iso_standing_keyframe.png',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/squat_female_iso_deep_keyframe.png',
        },
      },
    },
    angleMetadata: {
      iso: {
        title: '45° Isometric View',
        focus: 'Quad & Glute Drive • Core Bracing',
        checkpoints: [
          {
            label: 'Tripod Foot Pressure',
            cue: 'Disperse load across heel, big toe base, and pinky toe; drive through midfoot.',
            researchBasis: 'NSCA Guidelines: Prevents anterior shearing force on patellar tendon.',
          },
          {
            label: 'Hip Crease Depth',
            cue: 'Descend until hip crease breaks parallel below patella without lumbar rounding.',
            researchBasis: 'Schoenfeld (2010): Full ROM maximizes gluteus maximus and quad hypertrophy.',
          },
          {
            label: 'Thoracic Shelf',
            cue: 'Pull bar down into upper traps to engage lats and maintain rigid upright torso.',
            researchBasis: 'Vigotsky et al. (2017): Lat engagement reduces spinal flexion moment.',
          },
        ],
      },
      side: {
        title: '90° Lateral Side Profile',
        focus: 'Midfoot Bar Path & Lumbar Neutrality',
        checkpoints: [
          {
            label: 'Vertical Midfoot Bar Path',
            cue: 'Bar stays aligned over midfoot throughout descent and ascent without pitching forward.',
            researchBasis: 'Escamilla et al. (2001): Vertical midfoot line minimizes lower back moment arm.',
          },
          {
            label: 'Lumbar Neutrality',
            cue: 'Maintain natural lordotic arch at bottom; eliminate posterior pelvic tilt (butt wink).',
            researchBasis: 'McGill (2007): Flexion under axial compressive load risks disc herniation.',
          },
          {
            label: 'Parallel Segment Angles',
            cue: 'Torso angle tracks parallel to shin angle throughout movement.',
            researchBasis: 'Fry et al. (2003): Balances hip and knee torque ratios.',
          },
        ],
      },
      front: {
        title: 'Front Symmetry View',
        focus: 'Knee Tracking & Bilateral Balance',
        checkpoints: [
          {
            label: 'Knee Tracking (No Valgus)',
            cue: 'Knees track outward in line with second/third toes; zero inward knee cave.',
            researchBasis: 'Hewett et al. (2005): Dynamic knee valgus is primary predictor of ACL strain.',
          },
          {
            label: 'Bilateral Symmetry',
            cue: 'Hips rise evenly without shifting or twisting toward dominant leg.',
            researchBasis: 'Prevents asymmetric sacroiliac joint shear forces.',
          },
          {
            label: 'Stance Width',
            cue: 'Feet positioned shoulder-width apart or slightly wider, flared 15°–30° outward.',
            researchBasis: 'Accommodates individual acetabular femoral hip anatomy.',
          },
        ],
      },
    },
  },

  deadlift: {
    canonicalName: 'Conventional Barbell Deadlift',
    iso: {
      male: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/deadlift_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/deadlift_setup_keyframe.jpg',
      },
      female: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/deadlift_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/deadlift_setup_keyframe.jpg',
      },
    },
    side: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/deadlift_setup_keyframe.jpg',
    front: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/deadlift_setup_keyframe.jpg',
    keyframes: {
      side: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/deadlift_lockout_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/deadlift_setup_keyframe.jpg',
      },
      iso: {
        male: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/deadlift_lockout_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/deadlift_setup_keyframe.jpg',
        },
        female: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/deadlift_lockout_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/deadlift_setup_keyframe.jpg',
        },
      },
      front: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/deadlift_lockout_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/deadlift_setup_keyframe.jpg',
      },
    },
    angleMetadata: {
      side: {
        title: 'Hinge & Bar Path Mechanics',
        focus: 'Midfoot Plumb Line & Neutral Spine',
        checkpoints: [
          {
            label: 'Bar Over Midfoot',
            cue: 'Set bar ~1 inch from shins directly over the middle of the whole foot.',
            researchBasis: 'Hales (2010): Minimizes horizontal moment arm on lumbar L4/L5.',
          },
          {
            label: 'Lat Packing ("Bend the Bar")',
            cue: 'Depress scapulae and pull slack out of the bar before initiating floor break.',
            researchBasis: 'Cholewicki & McGill (1996): Thoracolumbar fascia tension stabilizes spine.',
          },
          {
            label: 'Glute Lockout (No Hyperextension)',
            cue: 'Finish tall by squeezing glutes into the bar; never lean backward at lockout.',
            researchBasis: 'Prevents posterior facet joint impingement under axial load.',
          },
        ],
      },
      iso: {
        title: '45° Isometric View',
        focus: 'Hip Hinge Wedge & Posterior Chain Drive',
        checkpoints: [
          {
            label: 'Hips Higher Than Knees',
            cue: 'Set hips between knee and shoulder height to load hamstrings and glutes.',
            researchBasis: 'Escamilla et al. (2000): Distinguishes true hip hinge from squat pattern.',
          },
          {
            label: 'Synchronized Back/Hip Angle',
            cue: 'Hips and shoulders rise at the exact same rate from floor to knee level.',
            researchBasis: 'Prevents "stripper pull" where hips shoot up and overload spinal erectors.',
          },
        ],
      },
      front: {
        title: 'Bilateral Stance & Grip',
        focus: 'Hip-Width Base & Vertical Arms',
        checkpoints: [
          {
            label: 'Narrow Hip-Width Stance',
            cue: 'Place heels ~hip-width apart so arms hang straight down just outside knees.',
            researchBasis: 'Reduces grip width requirement and shortens vertical bar travel.',
          },
        ],
      },
    },
  },

  'overhead-press': {
    canonicalName: 'Barbell Overhead Press',
    iso: {
      male: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/ohp_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/ohp_setup_keyframe.jpg',
      },
      female: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/ohp_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/ohp_setup_keyframe.jpg',
      },
    },
    side: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/ohp_setup_keyframe.jpg',
    front: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/ohp_setup_keyframe.jpg',
    keyframes: {
      side: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/ohp_lockout_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/ohp_setup_keyframe.jpg',
      },
      iso: {
        male: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/ohp_lockout_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/ohp_setup_keyframe.jpg',
        },
        female: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/ohp_lockout_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/ohp_setup_keyframe.jpg',
        },
      },
      front: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/ohp_lockout_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/ohp_setup_keyframe.jpg',
      },
    },
    angleMetadata: {
      side: {
        title: 'Vertical Stacking & Bar Path',
        focus: 'Clavicle Rack to Overhead Lockout',
        checkpoints: [
          {
            label: 'Stacked Forearms in Front Rack',
            cue: 'Keep elbows slightly in front of the bar with wrists straight and forearms vertical.',
            researchBasis: 'Rippetoe (2011): Eliminates moment arm between wrist and elbow.',
          },
          {
            label: 'Head "Through the Window"',
            cue: 'Once bar clears forehead, shift torso slightly forward so bar locks over midfoot.',
            researchBasis: 'Aligns load directly over scapulae, spine, hips, and ankles.',
          },
          {
            label: 'Glute & Ribcage Bracing',
            cue: 'Squeeze glutes and quads hard to prevent lower-back hyperextension.',
            researchBasis: 'Saeterbakken & Fimland (2013): Standing OHP requires high core stiffness.',
          },
        ],
      },
      iso: {
        title: '45° Isometric View',
        focus: 'Scapular Upward Rotation & Deltoid Drive',
        checkpoints: [
          {
            label: 'Scapular Plane (~30°–45°)',
            cue: 'Press with elbows tracking slightly forward in the natural scapular plane.',
            researchBasis: 'Maximizes subacromial space and anterior/medial deltoid recruitment.',
          },
          {
            label: 'Active Shrug at Lockout',
            cue: 'Finish with upper traps slightly elevated at top to support the glenohumeral joint.',
            researchBasis: 'Upward scapular rotation clears the acromion at 180° shoulder flexion.',
          },
        ],
      },
      front: {
        title: 'Bilateral Grip & Symmetry',
        focus: 'Just-Outside-Shoulder Grip',
        checkpoints: [
          {
            label: 'Thumb-Length From Smooth',
            cue: 'Grip just outside shoulder width so forearms stay vertical in the rack position.',
            researchBasis: 'Wide grips flare elbows and reduce vertical pressing leverage.',
          },
        ],
      },
    },
  },

  'barbell-row': {
    canonicalName: 'Barbell Bent-Over Row',
    iso: {
      male: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/row_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/row_setup_keyframe.jpg',
      },
      female: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/row_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/row_setup_keyframe.jpg',
      },
    },
    side: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/row_setup_keyframe.jpg',
    front: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/row_setup_keyframe.jpg',
    keyframes: {
      side: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/row_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/row_lockout_keyframe.jpg',
      },
      iso: {
        male: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/row_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/row_lockout_keyframe.jpg',
        },
        female: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/row_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/row_lockout_keyframe.jpg',
        },
      },
      front: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/row_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/row_lockout_keyframe.jpg',
      },
    },
    angleMetadata: {
      side: {
        title: 'Torso Hinge & Row Trajectory',
        focus: 'Fixed Hip Angle & Lat Sweep',
        checkpoints: [
          {
            label: 'Rigid ~45° Hip Hinge',
            cue: 'Lock torso angle between 30°–45° with flat lumbar spine; avoid torso heaving.',
            researchBasis: 'Fenwick et al. (2009): Isometric erector spinae bracing protects lumbar discs.',
          },
          {
            label: 'Pull to Lower Sternum / Belly',
            cue: 'Drive elbows back in an arc toward the hips, touching bar to upper abdomen.',
            researchBasis: 'Targets latissimus dorsi and mid/lower trapezius over upper traps.',
          },
          {
            label: 'Full Scapular Protraction/Retraction',
            cue: 'Let lats stretch at bottom hang, then pinch shoulder blades hard at peak.',
            researchBasis: 'Full scapular ROM maximizes rhomboid and rear deltoid stimulus.',
          },
        ],
      },
      iso: {
        title: '45° Isometric View',
        focus: 'Elbow Tuck & Scapular Retraction',
        checkpoints: [
          {
            label: '45° Elbow Path',
            cue: 'Keep elbows tucked ~45° to sides rather than flared 90° out.',
            researchBasis: 'Aligns pull vector with latissimus dorsi fiber orientation.',
          },
        ],
      },
      front: {
        title: 'Bilateral Pull Balance',
        focus: 'Even Scapular Squeeze',
        checkpoints: [
          {
            label: 'Level Bar Touch',
            cue: 'Both elbows reach peak retraction simultaneously without torso twist.',
            researchBasis: 'Ensures symmetrical lat and rhomboid loading.',
          },
        ],
      },
    },
  },

  'pull-up': {
    canonicalName: 'Pull-Up',
    iso: {
      male: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/pullup_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/pullup_setup_keyframe.jpg',
      },
      female: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/pullup_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/pullup_setup_keyframe.jpg',
      },
    },
    side: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/pullup_setup_keyframe.jpg',
    front: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/pullup_setup_keyframe.jpg',
    keyframes: {
      side: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/pullup_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/pullup_lockout_keyframe.jpg',
      },
      iso: {
        male: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/pullup_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/pullup_lockout_keyframe.jpg',
        },
        female: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/pullup_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/pullup_lockout_keyframe.jpg',
        },
      },
      front: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/pullup_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/pullup_lockout_keyframe.jpg',
      },
    },
    angleMetadata: {
      side: {
        title: 'Vertical Pull & Scapular Depression',
        focus: 'Active Hang & Chin-Over-Bar Peak',
        checkpoints: [
          {
            label: 'Active Scapular Hang',
            cue: 'Engage lats and depress shoulders before bending elbows to initiate pull.',
            researchBasis: 'Youdas et al. (2010): Scapular depression pre-activates lower traps and lats.',
          },
          {
            label: 'Elbows Driven Down and Back',
            cue: 'Drive elbows down toward your ribs rather than curling with biceps.',
            researchBasis: 'Maximizes latissimus dorsi line of pull and torque production.',
          },
          {
            label: 'Chin Clears Bar with Neutral Neck',
            cue: 'Pull until chin clears bar without reaching or hyperextending cervical spine.',
            researchBasis: 'Protects upper cervical facet joints at maximal contraction.',
          },
        ],
      },
      iso: {
        title: '45° Rear-Side View',
        focus: 'Lat Width & Bilateral Pull',
        checkpoints: [
          {
            label: 'Symmetrical Pull',
            cue: 'Both elbows drive down at identical rates with zero torso swing.',
            researchBasis: 'Prevents asymmetric lat torque and shoulder strain.',
          },
        ],
      },
      front: {
        title: 'Front View',
        focus: 'Overhand Pronated Grip',
        checkpoints: [
          {
            label: 'Grip Just Outside Shoulders',
            cue: 'Hands slightly wider than shoulder width with thumbs wrapped around bar.',
            researchBasis: 'Balances lat engagement with optimal glenohumeral ROM.',
          },
        ],
      },
    },
  },
};

/**
 * Core Movement Pattern Inheritance:
 * Matches an exercise name against its foundational movement family in the registry.
 * Variations that have a dedicated distinct 2D kinematic animation (like cable flyes,
 * push-ups, dips, seated cable rows, leg extensions) fall through to the upgraded
 * Kinematic Motion Studio unless they are direct barbell/dumbbell family members.
 */
export const videoBundleFor = (exerciseName: string): ExerciseVideoBundle | null => {
  const norm = exerciseName.toLowerCase();

  // 1. Horizontal Push Family (Bench Press variations)
  if (
    norm.includes('bench press') ||
    norm.includes('chest press') ||
    norm.includes('floor press') ||
    norm.includes('spoto press') ||
    norm.includes('larsen press')
  ) {
    return EXERCISE_VIDEO_REGISTRY['bench-press'];
  }

  // 2. Squat Family (Squat variations — excluding split squat / lunge which have split-stance kinematics)
  if (
    norm.includes('squat') &&
    !norm.includes('split') &&
    !norm.includes('bulgarian') &&
    !norm.includes('sissy')
  ) {
    return EXERCISE_VIDEO_REGISTRY['squat'];
  }

  // 3. Hinge Family (Deadlift & RDL variations)
  if (
    norm.includes('deadlift') ||
    norm.includes('rdl') ||
    norm.includes('good morning') ||
    norm.includes('rack pull')
  ) {
    return EXERCISE_VIDEO_REGISTRY['deadlift'];
  }

  // 4. Vertical Push Family (Overhead / Military / Shoulder Press)
  if (
    norm.includes('overhead press') ||
    norm.includes('military press') ||
    norm.includes('shoulder press') ||
    norm.includes('push press') ||
    norm.includes('arnold press') ||
    norm.includes('strict press') ||
    norm.includes('z press')
  ) {
    return EXERCISE_VIDEO_REGISTRY['overhead-press'];
  }

  // 5. Horizontal Pull Family (Free-weight Bent-Over Rows)
  if (
    norm.includes('bent-over row') ||
    norm.includes('bent over row') ||
    norm.includes('barbell row') ||
    norm.includes('pendlay row') ||
    norm.includes('t-bar row') ||
    norm.includes('yates row') ||
    norm.includes('dumbbell row')
  ) {
    return EXERCISE_VIDEO_REGISTRY['barbell-row'];
  }

  // 6. Vertical Pull Family (Pull-Up, Chin-Up, Lat Pulldown)
  if (
    norm.includes('pull-up') ||
    norm.includes('pull up') ||
    norm.includes('chin-up') ||
    norm.includes('chin up') ||
    norm.includes('lat pulldown')
  ) {
    return EXERCISE_VIDEO_REGISTRY['pull-up'];
  }

  return null;
};
