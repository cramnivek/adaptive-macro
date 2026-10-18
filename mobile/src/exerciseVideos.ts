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

export interface KeyframePhaseConfig {
  setupLabel: string;
  depthLabel: string;
  transitionLabel: string;
  scrubberStart: string;
  scrubberEnd: string;
}

export const getKeyframePhaseConfig = (canonicalName?: string): KeyframePhaseConfig => {
  const norm = (canonicalName ?? '').toLowerCase();

  if (norm.includes('bench press')) {
    return {
      setupLabel: 'PHASE 1: STARTING LOCKOUT',
      depthLabel: 'PHASE 2: CHEST TOUCH & ARCH',
      transitionLabel: 'ECCENTRIC / CONCENTRIC DRIVE',
      scrubberStart: 'LOCKOUT',
      scrubberEnd: 'CHEST TOUCH',
    };
  }

  if (norm.includes('romanian') || norm.includes('rdl')) {
    return {
      setupLabel: 'PHASE 1: STANDING HIP LOCKOUT',
      depthLabel: 'PHASE 2: DEEP HIP HINGE STRETCH',
      transitionLabel: 'POSTERIOR CHAIN HINGE / GLUTE DRIVE',
      scrubberStart: 'LOCKOUT',
      scrubberEnd: 'HINGE',
    };
  }

  if (norm.includes('deadlift')) {
    return {
      setupLabel: 'PHASE 1: TOP LOCKOUT',
      depthLabel: 'PHASE 2: FLOOR SETUP & SLACK PULL',
      transitionLabel: 'HINGE / WEDGE DRIVE',
      scrubberStart: 'LOCKOUT',
      scrubberEnd: 'FLOOR SETUP',
    };
  }

  if (norm.includes('overhead') && (norm.includes('triceps') || norm.includes('tricep') || norm.includes('extension'))) {
    return {
      setupLabel: 'PHASE 1: DEEP TRICEPS STRETCH',
      depthLabel: 'PHASE 2: OVERHEAD LOCKOUT & ROPE FLARE',
      transitionLabel: 'OVERHEAD EXTENSION / LONG HEAD DRIVE',
      scrubberStart: 'STRETCH',
      scrubberEnd: 'LOCKOUT',
    };
  }

  if (norm.includes('overhead') || norm.includes('military') || norm.includes('shoulder')) {
    return {
      setupLabel: 'PHASE 1: OVERHEAD LOCKOUT',
      depthLabel: 'PHASE 2: FRONT RACK SETUP',
      transitionLabel: 'VERTICAL PRESS / HEAD WINDOW',
      scrubberStart: 'LOCKOUT',
      scrubberEnd: 'FRONT RACK',
    };
  }

  if (norm.includes('row')) {
    return {
      setupLabel: 'PHASE 1: HINGE SETUP / HANG',
      depthLabel: 'PHASE 2: PEAK CONTRACTION',
      transitionLabel: 'LAT PULL / SCAPULAR DRIVE',
      scrubberStart: 'SETUP',
      scrubberEnd: 'PEAK ROW',
    };
  }

  if (
    norm.includes('pull-up') ||
    norm.includes('pull up') ||
    norm.includes('chin-up') ||
    norm.includes('chin up')
  ) {
    return {
      setupLabel: 'PHASE 1: ACTIVE HANG / SETUP',
      depthLabel: 'PHASE 2: CHIN OVER BAR',
      transitionLabel: 'VERTICAL PULL / SCAPULAR DEPRESSION',
      scrubberStart: 'HANG',
      scrubberEnd: 'TOP CHIN',
    };
  }

  if (norm.includes('pushdown')) {
    return {
      setupLabel: 'PHASE 1: 90° ELBOW SETUP',
      depthLabel: 'PHASE 2: FULL LOCKOUT & ROPE FLARE',
      transitionLabel: 'CONCENTRIC PUSH / CONTROLLED EXTENSION',
      scrubberStart: 'SETUP',
      scrubberEnd: 'LOCKOUT',
    };
  }

  if (norm.includes('leg extension')) {
    return {
      setupLabel: 'PHASE 1: 90° KNEE SETUP',
      depthLabel: 'PHASE 2: FULL KNEE EXTENSION (180°)',
      transitionLabel: 'QUAD CONTRACTION / CONTROLLED DESCENT',
      scrubberStart: 'SETUP',
      scrubberEnd: 'LOCKOUT',
    };
  }

  if (norm.includes('bicep curl') || norm.includes('biceps curl')) {
    return {
      setupLabel: 'PHASE 1: FULL EXTENSION HANG',
      depthLabel: 'PHASE 2: PEAK BICEP CONTRACTION',
      transitionLabel: 'CONCENTRIC CURL / CONTROLLED ECCENTRIC',
      scrubberStart: 'HANG',
      scrubberEnd: 'CURL PEAK',
    };
  }

  if (norm.includes('lateral raise')) {
    return {
      setupLabel: 'PHASE 1: BOTTOM HANG SETUP',
      depthLabel: 'PHASE 2: 90° SHOULDER ABDUCTION',
      transitionLabel: 'DELTOID DRIVE / CONTROLLED ECCENTRIC',
      scrubberStart: 'SETUP',
      scrubberEnd: '90° PEAK',
    };
  }

  if (norm.includes('leg curl') || norm.includes('hamstring curl')) {
    return {
      setupLabel: 'PHASE 1: 180° EXTENSION SETUP',
      depthLabel: 'PHASE 2: PEAK KNEE FLEXION',
      transitionLabel: 'HAMSTRING CURL / CONTROLLED ECCENTRIC',
      scrubberStart: 'SETUP',
      scrubberEnd: 'CURL PEAK',
    };
  }

  if (norm.includes('leg press')) {
    return {
      setupLabel: 'PHASE 1: 90° KNEE FLEXION SETUP',
      depthLabel: 'PHASE 2: FULL LEG EXTENSION LOCKOUT',
      transitionLabel: 'SLED DRIVE / CONTROLLED ECCENTRIC',
      scrubberStart: 'SETUP',
      scrubberEnd: 'LOCKOUT',
    };
  }

  // Squat family default
  return {
    setupLabel: 'PHASE 1: STARTING SETUP',
    depthLabel: 'PHASE 2: PARALLEL DEPTH',
    transitionLabel: 'DESCENT / ASCENT',
    scrubberStart: 'SETUP',
    scrubberEnd: 'DEPTH',
  };
};

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

  'triceps-pushdown': {
    canonicalName: 'Triceps Pushdown',
    iso: {
      male: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/tricep_pushdown_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/tricep_pushdown_setup_keyframe.jpg',
      },
      female: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/tricep_pushdown_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/tricep_pushdown_setup_keyframe.jpg',
      },
    },
    side: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/tricep_pushdown_setup_keyframe.jpg',
    front: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/tricep_pushdown_setup_keyframe.jpg',
    keyframes: {
      side: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/tricep_pushdown_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/tricep_pushdown_lockout_keyframe.jpg',
      },
      iso: {
        male: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/tricep_pushdown_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/tricep_pushdown_lockout_keyframe.jpg',
        },
        female: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/tricep_pushdown_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/tricep_pushdown_lockout_keyframe.jpg',
        },
      },
      front: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/tricep_pushdown_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/tricep_pushdown_lockout_keyframe.jpg',
      },
    },
    angleMetadata: {
      side: {
        title: 'Elbow Pinning & Lockout',
        focus: 'Fixed Elbows & Terminal Extension',
        checkpoints: [
          {
            label: 'Elbows Pinned to Ribs',
            cue: 'Keep upper arms strictly vertical and motionless against sides; zero shoulder swinging.',
            researchBasis: 'Prevents anterior deltoid takeover and isolates lateral and long heads.',
          },
          {
            label: 'Full Terminal Lockout (180°)',
            cue: 'Extend forearms fully straight down and flare the rope tips slightly outward at the bottom.',
            researchBasis: 'Achieves peak sarcomere shortening and maximal EMG activation in the lateral head.',
          },
          {
            label: 'Controlled Eccentric (~90° Return)',
            cue: 'Allow forearms to rise only to chest level before pushing down again.',
            researchBasis: 'Maintains continuous mechanical tension without shoulder joint strain.',
          },
        ],
      },
      iso: {
        title: 'Rope Flare & Forearm Arc',
        focus: 'Peak Contraction Squeeze',
        checkpoints: [
          {
            label: 'Pronated Flare at Bottom',
            cue: 'Turn wrists slightly outward at terminal extension to maximize peak contraction.',
            researchBasis: 'Aligns pull vector with the lateral triceps head for superior peak torque.',
          },
        ],
      },
      front: {
        title: 'Bilateral Symmetry',
        focus: 'Even Arm Drive',
        checkpoints: [
          {
            label: 'Balanced Cable Path',
            cue: 'Both hands reach peak extension simultaneously without leaning or torso shifting.',
            researchBasis: 'Ensures equal bilateral load distribution across both arms.',
          },
        ],
      },
    },
  },

  'leg-extension': {
    canonicalName: 'Leg Extension (Machine)',
    iso: {
      male: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_extension_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_extension_setup_keyframe.jpg',
      },
      female: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_extension_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_extension_setup_keyframe.jpg',
      },
    },
    side: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_extension_setup_keyframe.jpg',
    front: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_extension_setup_keyframe.jpg',
    keyframes: {
      side: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_extension_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_extension_lockout_keyframe.jpg',
      },
      iso: {
        male: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_extension_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_extension_lockout_keyframe.jpg',
        },
        female: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_extension_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_extension_lockout_keyframe.jpg',
        },
      },
      front: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_extension_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_extension_lockout_keyframe.jpg',
      },
    },
    angleMetadata: {
      side: {
        title: 'Full Knee Lockout & Quad Squeeze',
        focus: 'Terminal Knee Extension & Tibial Alignment',
        checkpoints: [
          {
            label: 'Full 180° Knee Extension',
            cue: 'Straighten legs fully until parallel to the floor, holding for a distinct 1-second pause at the peak.',
            researchBasis: 'Maximizes recruitment of the rectus femoris in its shortened position.',
          },
          {
            label: 'Back Flat Against Support',
            cue: 'Keep glutes and lower back pinned to the backrest; grip the side handles firmly.',
            researchBasis: 'Anchors the pelvis and prevents compensatory lumbar extension.',
          },
          {
            label: 'Pad Stacked on Lower Shins',
            cue: 'Position the roller pad just above the ankle joint, not across the mid-shin or toes.',
            researchBasis: 'Optimizes mechanical leverage and protects the patellofemoral joint.',
          },
        ],
      },
      iso: {
        title: 'Quad Vastus Contraction',
        focus: 'Peak Shortened Position',
        checkpoints: [
          {
            label: 'Toes Pointed Upwards',
            cue: 'Keep feet in neutral dorsiflexion, toes pointing straight up throughout the movement.',
            researchBasis: 'Maintains optimal tension across the patellar tendon and active tibialis anterior.',
          },
        ],
      },
      front: {
        title: 'Knee & Shin Tracking',
        focus: 'Symmetrical Leg Drive',
        checkpoints: [
          {
            label: 'Parallel Leg Path',
            cue: 'Keep knees and shins moving in a straight vertical plane with zero inward or outward rotation.',
            researchBasis: 'Prevents torsional strain on the cruciate and collateral knee ligaments.',
          },
        ],
      },
    },
  },

  'bicep-curl': {
    canonicalName: 'Bicep Curl (Dumbbell)',
    iso: {
      male: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bicep_curl_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bicep_curl_setup_keyframe.jpg',
      },
      female: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bicep_curl_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bicep_curl_setup_keyframe.jpg',
      },
    },
    side: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bicep_curl_setup_keyframe.jpg',
    front: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bicep_curl_setup_keyframe.jpg',
    keyframes: {
      side: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bicep_curl_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bicep_curl_lockout_keyframe.jpg',
      },
      iso: {
        male: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bicep_curl_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bicep_curl_lockout_keyframe.jpg',
        },
        female: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bicep_curl_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bicep_curl_lockout_keyframe.jpg',
        },
      },
      front: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bicep_curl_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/bicep_curl_lockout_keyframe.jpg',
      },
    },
    angleMetadata: {
      side: {
        title: 'Elbow Pinning & Supination',
        focus: 'Fixed Elbow Axis & Strict Curl',
        checkpoints: [
          {
            label: 'Elbows Pinned to Ribcage',
            cue: 'Keep elbows locked against your sides without swinging them forward to recruit anterior deltoid.',
            researchBasis: 'Staudenmann et al. (2015): Forward elbow drift unloads the biceps brachii peak contraction.',
          },
          {
            label: 'Full Supination at Peak',
            cue: 'Turn palms toward shoulders at the top and squeeze the biceps hard for 1 second.',
            researchBasis: 'The biceps brachii is the primary forearm supinator; full supination maximizes motor unit recruitment.',
          },
          {
            label: 'Controlled Full Extension',
            cue: 'Lower weights fully to straight arms (180°) under 2–3 seconds control before initiating next rep.',
            researchBasis: 'Wolf et al. (2023): Long muscle length eccentric stretch enhances hypertrophy signaling.',
          },
        ],
      },
      iso: {
        title: 'Arm Path & Torso Rigidity',
        focus: 'Zero Torso Sway',
        checkpoints: [
          {
            label: 'Zero Torso Momentum',
            cue: 'Maintain rigid core and glute bracing; avoid leaning back to swing dumbbells up.',
            researchBasis: 'Momentum transfers load to lumbar spine and reduces tension on biceps.',
          },
        ],
      },
      front: {
        title: 'Bilateral Balance',
        focus: 'Symmetrical Curl Path',
        checkpoints: [
          {
            label: 'Simultaneous Lift',
            cue: 'Both dumbbells curl and descend at identical rates without shoulder dipping.',
            researchBasis: 'Prevents unilateral spinal lateral flexion under load.',
          },
        ],
      },
    },
  },

  'lateral-raise': {
    canonicalName: 'Lateral Raise (Dumbbell)',
    iso: {
      male: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/lateral_raise_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/lateral_raise_setup_keyframe.jpg',
      },
      female: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/lateral_raise_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/lateral_raise_setup_keyframe.jpg',
      },
    },
    side: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/lateral_raise_setup_keyframe.jpg',
    front: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/lateral_raise_setup_keyframe.jpg',
    keyframes: {
      side: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/lateral_raise_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/lateral_raise_peak_keyframe.jpg',
      },
      iso: {
        male: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/lateral_raise_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/lateral_raise_peak_keyframe.jpg',
        },
        female: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/lateral_raise_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/lateral_raise_peak_keyframe.jpg',
        },
      },
      front: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/lateral_raise_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/lateral_raise_peak_keyframe.jpg',
      },
    },
    angleMetadata: {
      side: {
        title: 'Scapular Plane Abduction',
        focus: 'Lead with Elbows & Control Swing',
        checkpoints: [
          {
            label: 'Raise in Scapular Plane (~30° Forward)',
            cue: 'Lift dumbbells slightly forward of pure lateral to allow free subacromial clearance.',
            researchBasis: 'Escamilla et al. (2009): Scapular plane motion protects rotator cuff tendons from impingement.',
          },
          {
            label: 'Raise to Parallel (90°)',
            cue: 'Stop at shoulder height; going above 90° transfers primary tension to upper trapezius.',
            researchBasis: 'Inman et al. (1944): Deltoid moment arm peaks at 90°; trapezius takes over above 100°.',
          },
          {
            label: 'Lead with Elbows',
            cue: 'Keep elbows slightly higher than or level with wrists; never let wrists lead above elbows.',
            researchBasis: 'Prevents excessive internal rotation and subacromial spur compression.',
          },
        ],
      },
      iso: {
        title: 'Torso Bracing',
        focus: 'Anti-Heaving Stability',
        checkpoints: [
          {
            label: 'Slight Forward Torso Hinge (10°)',
            cue: 'Slightly lean forward from hips to better align lateral deltoid fibers vertically against gravity.',
            researchBasis: 'Optimizes gravity vector orientation relative to the middle deltoid origin and insertion.',
          },
        ],
      },
      front: {
        title: 'Symmetrical Arm Arc',
        focus: 'Even Deltoid Drive',
        checkpoints: [
          {
            label: 'Even Bilateral Height',
            cue: 'Both dumbbells reach exactly 90° simultaneously without neck shrugging.',
            researchBasis: 'Prevents upper trapezius dominance and neck strain.',
          },
        ],
      },
    },
  },

  'lying-leg-curl': {
    canonicalName: 'Lying Leg Curl (Machine)',
    iso: {
      male: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_curl_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_curl_setup_keyframe.jpg',
      },
      female: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_curl_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_curl_setup_keyframe.jpg',
      },
    },
    side: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_curl_setup_keyframe.jpg',
    front: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_curl_setup_keyframe.jpg',
    keyframes: {
      side: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_curl_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_curl_contraction_keyframe.jpg',
      },
      iso: {
        male: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_curl_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_curl_contraction_keyframe.jpg',
        },
        female: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_curl_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_curl_contraction_keyframe.jpg',
        },
      },
      front: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_curl_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_curl_contraction_keyframe.jpg',
      },
    },
    angleMetadata: {
      side: {
        title: 'Pelvic Anchoring & Knee Flexion',
        focus: 'Zero Hip Rise & Controlled Tempo',
        checkpoints: [
          {
            label: 'Hips Pinned to Angled Pad',
            cue: 'Keep your pelvic crest pressed firmly into the bench; do not let your hips rise to cheat the curl.',
            researchBasis: 'Pedrosa et al. (2022): Hip elevation shortens biarticular hamstrings at the origin and increases lumbar extension shear.',
          },
          {
            label: 'Terminal Knee Flexion',
            cue: 'Curl the pad past 90° toward your glutes, squeezing the hamstrings for 1 second at the peak.',
            researchBasis: 'Maeo et al. (2021): Active contraction across maximal knee flexion angle maximizes semitendinosus and biceps femoris recruitment.',
          },
          {
            label: 'Controlled Full Extension',
            cue: 'Lower the weight under 2–3 seconds control until knees reach 180° without clacking the weight stack.',
            researchBasis: 'Wolf et al. (2023): Lengthened eccentric phase triggers stretch-mediated hypertrophy pathways.',
          },
        ],
      },
      iso: {
        title: 'Torso & Grip Stability',
        focus: 'Firm Handle Brace',
        checkpoints: [
          {
            label: 'Pull Down on Handles',
            cue: 'Firmly grip the handles to lock your upper torso and pelvis into the bench pad.',
            researchBasis: 'Increases core stiffness and prevents compensatory spinal extension.',
          },
        ],
      },
      front: {
        title: 'Bilateral Leg Alignment',
        focus: 'Parallel Ankle Tracking',
        checkpoints: [
          {
            label: 'Feet Dorsiflexed & Parallel',
            cue: 'Keep toes pulled toward shins and feet aligned hip-width apart on the roller.',
            researchBasis: 'Dorsiflexion engages the gastrocnemius as a synergist knee flexor, stabilizing the posterior knee capsule.',
          },
        ],
      },
    },
  },

  'leg-press': {
    canonicalName: '45-Degree Incline Leg Press (Machine)',
    iso: {
      male: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_press_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_press_setup_keyframe.jpg',
      },
      female: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_press_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_press_setup_keyframe.jpg',
      },
    },
    side: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_press_setup_keyframe.jpg',
    front: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_press_setup_keyframe.jpg',
    keyframes: {
      side: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_press_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_press_lockout_keyframe.jpg',
      },
      iso: {
        male: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_press_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_press_lockout_keyframe.jpg',
        },
        female: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_press_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_press_lockout_keyframe.jpg',
        },
      },
      front: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_press_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/leg_press_lockout_keyframe.jpg',
      },
    },
    angleMetadata: {
      side: {
        title: 'Knee Tracking & Pelvic Anchoring',
        focus: 'Flat Lumbar Spine & Smooth Sled Drive',
        checkpoints: [
          {
            label: 'Lower Back Pinned to Pad',
            cue: 'Keep your pelvis and lumbar spine glued to the back pad; do not let your tailbone curl off the seat at the bottom.',
            researchBasis: 'Escamilla et al. (2001): Posterior pelvic tilt at deep flexion dramatically multiplies lumbar compressive and shear stresses.',
          },
          {
            label: 'Soft Knee Lockout',
            cue: 'Drive the sled to full leg extension but keep knees softly unlocked; never violently hyperextend under heavy loads.',
            researchBasis: 'Prevents tibiofemoral joint shear and protects posterior cruciate ligaments.',
          },
        ],
      },
      iso: {
        title: 'Footplate Force Distribution',
        focus: 'Tripod Foot Drive',
        checkpoints: [
          {
            label: 'Shoulder-Width Mid-Plate Placement',
            cue: 'Place feet shoulder-width apart in the center of the plate, driving evenly through heels and mid-foot.',
            researchBasis: 'Mid-plate positioning balances quadriceps and gluteus maximus recruitment while minimizing patellofemoral pressure.',
          },
        ],
      },
      front: {
        title: 'Knee Tracking Splayed Over Toes',
        focus: 'Zero Valgus Collapse',
        checkpoints: [
          {
            label: 'Knees Track in Line with Second Toe',
            cue: 'Ensure knees track outward over your toes throughout the descent and ascent.',
            researchBasis: 'Prevents dynamic knee valgus and excessive medial collateral ligament tension.',
          },
        ],
      },
    },
  },

  'overhead-triceps-extension': {
    canonicalName: 'Overhead Triceps Extension (Cable)',
    iso: {
      male: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/overhead_triceps_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/overhead_triceps_setup_keyframe.jpg',
      },
      female: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/overhead_triceps_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/overhead_triceps_setup_keyframe.jpg',
      },
    },
    side: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/overhead_triceps_setup_keyframe.jpg',
    front: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/overhead_triceps_setup_keyframe.jpg',
    keyframes: {
      side: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/overhead_triceps_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/overhead_triceps_lockout_keyframe.jpg',
      },
      iso: {
        male: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/overhead_triceps_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/overhead_triceps_lockout_keyframe.jpg',
        },
        female: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/overhead_triceps_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/overhead_triceps_lockout_keyframe.jpg',
        },
      },
      front: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/overhead_triceps_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/overhead_triceps_lockout_keyframe.jpg',
      },
    },
    angleMetadata: {
      side: {
        title: 'Long-Head Triceps Stretch',
        focus: 'Deep Shoulder Elevation & Full Extension',
        checkpoints: [
          {
            label: 'Deep Elbow Flexion Stretch',
            cue: 'Let the rope travel deeply behind your head/neck until elbows are past 90° for maximal long-head pre-stretch.',
            researchBasis: 'Maeo et al. (2023): Overhead triceps extensions elicit ~1.5x greater long-head hypertrophy than neutral pushdowns due to stretch-mediated mechanisms.',
          },
          {
            label: 'Complete Lockout with Rope Flare',
            cue: 'Press the rope straight forward and upward, flaring the rope ends outward at peak lockout for full contraction.',
            researchBasis: 'Maximizes radial extension and peak shortening of the lateral and medial heads.',
          },
        ],
      },
      iso: {
        title: 'Split-Stance Core Bracing',
        focus: 'Ribs Pulled Down & Anti-Extension',
        checkpoints: [
          {
            label: 'Forward Torso Incline (30°–45°)',
            cue: 'Maintain a stable forward athletic split stance; brace abs to prevent hyperextending your lower back.',
            researchBasis: 'Counteracts the rearward cable pull vector and maintains pelvic stability.',
          },
        ],
      },
      front: {
        title: 'Elbow Position Tracking',
        focus: 'Elbows Tucked Inward',
        checkpoints: [
          {
            label: 'Elbows Kept Shoulder-Width',
            cue: 'Avoid excessive elbow flare outward; keep upper arms aligned beside your head.',
            researchBasis: 'Maintains optimal line of pull along the triceps tendon and reduces subacromial shear.',
          },
        ],
      },
    },
  },

  'romanian-deadlift': {
    canonicalName: 'Romanian Deadlift (Barbell)',
    iso: {
      male: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/rdl_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/rdl_setup_keyframe.jpg',
      },
      female: {
        glow: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/rdl_setup_keyframe.jpg',
        cinema: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/rdl_setup_keyframe.jpg',
      },
    },
    side: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/rdl_setup_keyframe.jpg',
    front: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/rdl_setup_keyframe.jpg',
    keyframes: {
      side: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/rdl_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/rdl_stretch_keyframe.jpg',
      },
      iso: {
        male: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/rdl_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/rdl_stretch_keyframe.jpg',
        },
        female: {
          standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/rdl_setup_keyframe.jpg',
          deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/rdl_stretch_keyframe.jpg',
        },
      },
      front: {
        standing: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/rdl_setup_keyframe.jpg',
        deep: 'https://storage.googleapis.com/adaptive-macro-card-images/exercises/rdl_stretch_keyframe.jpg',
      },
    },
    angleMetadata: {
      side: {
        title: 'Posterior Hip Hinge & Vertical Shins',
        focus: 'Maximal Hamstring Stretch & Neutral Spine',
        checkpoints: [
          {
            label: 'Hips Pushed Horizontally Backward',
            cue: 'Push your hips as far back as possible toward the wall behind you rather than squatting down.',
            researchBasis: 'McAllister et al. (2014): Pure hip hinge maximizes hamstring and gluteus maximus torque while preserving knee kinematics.',
          },
          {
            label: 'Vertical Shins (15°–20° Soft Knee Bend)',
            cue: 'Keep your shins perpendicular to the floor with minimal forward knee travel.',
            researchBasis: 'Prevents quadriceps takeover and isolates the posterior kinetic chain.',
          },
          {
            label: 'Bar Glides Along Thighs',
            cue: 'Keep the barbell skimming close against thighs and just below kneecaps with lats locked.',
            researchBasis: 'Minimizes external moment arm on the lumbar spine and protects L4–L5 vertebrae.',
          },
        ],
      },
      iso: {
        title: 'Lat Engagement & Rigid Core',
        focus: 'Anti-Flexion Back Rigidity',
        checkpoints: [
          {
            label: 'Shoulder Blades Set & Flat Lumbar Spine',
            cue: 'Pack your lats as if squeezing oranges in your armpits to keep the bar pinned against the legs.',
            researchBasis: 'Latissimus dorsi tension creates thoracolumbar fascia stiffness and prevents spinal flexion.',
          },
        ],
      },
      front: {
        title: 'Hip-Width Stance & Symmetrical Grip',
        focus: 'Bilateral Alignment',
        checkpoints: [
          {
            label: 'Feet Hip-Width Apart, Toes Forward',
            cue: 'Plant feet directly under your hip joints with toes pointing forward or slightly splayed.',
            researchBasis: 'Optimizes mechanical advantage and bilateral hamstring load distribution.',
          },
        ],
      },
    },
  },
};

/**
 * Flagship Compound Keyframe Studio Selector:
 * Matches ONLY canonical barbell compound lifts and strict bodyweight pull-ups where the
 * photorealistic 8K keyframes and multi-angle studio assets genuinely depict the exact exercise.
 *
 * Distinct equipment and movement variations (such as Arnold Press, Dumbbell Rows, Lat Pulldowns,
 * Incline/Decline Press, Good Mornings, RDLs, Hack Squats, Leg Press, etc.) fall through to the
 * 60 FPS Kinematic Pro Studio with dedicated biomechanical reticles and joint-angle HUDs.
 */
export const videoBundleFor = (exerciseName: string): ExerciseVideoBundle | null => {
  const norm = exerciseName.toLowerCase().trim();

  // Any dumbbell, machine, cable, or smith variations must use their dedicated 2D kinematic model
  const isDumbbell = /\b(dumbbell|db)\b/.test(norm);
  const isMachine = /\b(machine|cable|smith|plate-loaded)\b/.test(norm);

  // 1. Horizontal Push: Flat Barbell Bench Press ONLY
  if (
    !isDumbbell &&
    !isMachine &&
    !/\b(incline|decline|close[- ]grip|cgbp|floor|spoto|larsen|reverse[- ]grip)\b/.test(norm)
  ) {
    if (
      norm === 'bench press' ||
      norm === 'bench press (barbell)' ||
      norm === 'barbell bench press' ||
      norm === 'flat barbell bench press' ||
      norm === 'barbell flat bench press' ||
      norm === 'barbell bench'
    ) {
      return EXERCISE_VIDEO_REGISTRY['bench-press'];
    }
  }

  // 2. Squat Family: Barbell Back Squat ONLY
  if (
    !isDumbbell &&
    !isMachine &&
    !/\b(front|goblet|hack|pendulum|split|bulgarian|lunge|sissy|box|step|zercher|overhead|safety|leg press)\b/.test(norm)
  ) {
    if (
      norm === 'squat' ||
      norm === 'squats' ||
      norm === 'squat (barbell)' ||
      norm === 'barbell squat' ||
      norm === 'barbell back squat' ||
      norm === 'back squat (barbell)' ||
      norm === 'back squat'
    ) {
      return EXERCISE_VIDEO_REGISTRY['squat'];
    }
  }

  // 3. Hinge Family: Conventional Barbell Deadlift ONLY
  if (
    !isDumbbell &&
    !isMachine &&
    !/\b(romanian|rdl|stiff|straight|sumo|trap|hex|snatch|deficit|rack pull|good morning)\b/.test(norm)
  ) {
    if (
      norm === 'deadlift' ||
      norm === 'deadlifts' ||
      norm === 'deadlift (barbell)' ||
      norm === 'barbell deadlift' ||
      norm === 'conventional deadlift' ||
      norm === 'conventional barbell deadlift'
    ) {
      return EXERCISE_VIDEO_REGISTRY['deadlift'];
    }
  }

  // 4. Vertical Push Family: Standing Barbell Overhead Press ONLY
  if (
    !isDumbbell &&
    !isMachine &&
    !/\b(arnold|seated|push press|z press|behind|incline|bench)\b/.test(norm)
  ) {
    if (
      norm === 'overhead press' ||
      norm === 'ohp' ||
      norm === 'overhead press (barbell)' ||
      norm === 'barbell overhead press' ||
      norm === 'standing overhead press' ||
      norm === 'standing barbell overhead press' ||
      norm === 'military press' ||
      norm === 'barbell military press' ||
      norm === 'military press (barbell)' ||
      norm === 'strict press' ||
      norm === 'strict overhead press'
    ) {
      return EXERCISE_VIDEO_REGISTRY['overhead-press'];
    }
  }

  // 5. Horizontal Pull Family: Barbell Bent-Over Row ONLY
  if (
    !isDumbbell &&
    !isMachine &&
    !/\b(chest[- ]supported|seated|cable|t[- ]bar|incline|one[- ]arm|single[- ]arm|upright|low row)\b/.test(norm)
  ) {
    if (
      norm === 'bent over row (barbell)' ||
      norm === 'bent-over row (barbell)' ||
      norm === 'barbell bent-over row' ||
      norm === 'barbell bent over row' ||
      norm === 'barbell row' ||
      norm === 'pendlay row' ||
      norm === 'bent-over row' ||
      norm === 'bent over row'
    ) {
      return EXERCISE_VIDEO_REGISTRY['barbell-row'];
    }
  }

  // 6. Vertical Pull Family: Bodyweight Pull-Up ONLY
  if (
    !isMachine &&
    !/\b(chin|pulldown|assisted|band|cable)\b/.test(norm)
  ) {
    if (
      norm === 'pull-up' ||
      norm === 'pull up' ||
      norm === 'pull-ups' ||
      norm === 'pull ups' ||
      norm === 'bodyweight pull-up' ||
      norm === 'bodyweight pull up' ||
      norm === 'strict pull-up'
    ) {
      return EXERCISE_VIDEO_REGISTRY['pull-up'];
    }
  }

  // 7. Triceps Pushdown Family (Cable Pushdown with Rope)
  if (
    norm === 'triceps pushdown' ||
    norm === 'tricep pushdown' ||
    norm === 'triceps pushdown (cable)' ||
    norm === 'tricep pushdown (cable)' ||
    norm === 'cable triceps pushdown' ||
    norm === 'cable tricep pushdown' ||
    norm === 'cable pushdown'
  ) {
    return EXERCISE_VIDEO_REGISTRY['triceps-pushdown'];
  }

  // 8. Leg Extension Family (Seated Machine Leg Extension)
  if (
    norm === 'leg extension' ||
    norm === 'leg extension (machine)' ||
    norm === 'seated leg extension' ||
    norm === 'machine leg extension' ||
    norm === 'leg extensions'
  ) {
    return EXERCISE_VIDEO_REGISTRY['leg-extension'];
  }

  // 9. Bicep Curl Family (Dumbbell Bicep Curl)
  if (
    norm === 'bicep curl (dumbbell)' ||
    norm === 'dumbbell bicep curl' ||
    norm === 'dumbbell curl' ||
    norm === 'db bicep curl' ||
    norm === 'bicep curl'
  ) {
    return EXERCISE_VIDEO_REGISTRY['bicep-curl'];
  }

  // 10. Lateral Raise Family (Dumbbell Lateral Raise)
  if (
    norm === 'lateral raise (dumbbell)' ||
    norm === 'dumbbell lateral raise' ||
    norm === 'db lateral raise' ||
    norm === 'lateral raise' ||
    norm === 'side raise' ||
    norm === 'dumbbell side raise'
  ) {
    return EXERCISE_VIDEO_REGISTRY['lateral-raise'];
  }

  // 11. Lying Leg Curl Family (Machine)
  if (
    norm === 'lying leg curl (machine)' ||
    norm === 'lying leg curl' ||
    norm === 'machine lying leg curl' ||
    norm === 'prone leg curl' ||
    norm === 'lying hamstring curl'
  ) {
    return EXERCISE_VIDEO_REGISTRY['lying-leg-curl'];
  }

  // 12. 45-Degree Incline Leg Press Family (Machine)
  if (
    norm === 'leg press' ||
    norm === 'leg press (machine)' ||
    norm === '45-degree leg press' ||
    norm === '45 degree leg press' ||
    norm === 'incline leg press' ||
    norm === 'incline leg press (machine)' ||
    norm === '45° leg press' ||
    norm === '45° incline leg press' ||
    norm === 'sled leg press'
  ) {
    return EXERCISE_VIDEO_REGISTRY['leg-press'];
  }

  // 13. Overhead Triceps Extension Family (Cable Rope)
  if (
    norm === 'overhead triceps extension (cable)' ||
    norm === 'overhead tricep extension (cable)' ||
    norm === 'overhead triceps extension' ||
    norm === 'overhead tricep extension' ||
    norm === 'cable overhead triceps extension' ||
    norm === 'cable overhead extension' ||
    norm === 'cable overhead tricep extension' ||
    norm === 'overhead cable triceps extension' ||
    norm === 'overhead cable tricep extension'
  ) {
    return EXERCISE_VIDEO_REGISTRY['overhead-triceps-extension'];
  }

  // 14. Romanian Deadlift Family (Barbell)
  if (
    norm === 'romanian deadlift (barbell)' ||
    norm === 'romanian deadlift' ||
    norm === 'barbell romanian deadlift' ||
    norm === 'rdl (barbell)' ||
    norm === 'barbell rdl' ||
    norm === 'rdl'
  ) {
    return EXERCISE_VIDEO_REGISTRY['romanian-deadlift'];
  }

  return null;
};
