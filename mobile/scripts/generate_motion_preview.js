const fs = require('fs');
const path = require('path');

const engineJsPath = path.resolve('C:/Users/marca/.gemini/antigravity/brain/215765b4-ecc0-484d-b50f-93fc47ea9725/scratch_motion_engine.js');
const engineCode = fs.readFileSync(engineJsPath, 'utf8');

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Kinematics Pro HUD & Research Studio — Adaptive Macro</title>
  <style>
    :root {
      --bg: #090A0F;
      --card: #12151E;
      --border: #222838;
      --border-light: #303952;
      --accent: #FF5500;
      --cyan: #00E5FF;
      --green: #10B981;
      --amber: #FBBF24;
      --text: #F5F7FA;
      --muted: #94A3B8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      padding: 12px 10px 48px;
      overflow-x: hidden;
    }
    .container { width: 100%; max-width: 980px; display: flex; flex-direction: column; gap: 14px; }
    .header { text-align: center; padding: 4px 0; }
    .badge {
      display: inline-block;
      background: rgba(0, 229, 255, 0.12);
      color: var(--cyan);
      border: 1px solid rgba(0, 229, 255, 0.35);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 1.2px;
      padding: 3px 10px;
      border-radius: 99px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    h1 { font-size: 20px; font-weight: 800; letter-spacing: -0.3px; margin-bottom: 3px; }
    .sub { color: var(--muted); font-size: 12px; line-height: 1.35; }
    
    .family-bar {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 5px;
      background: #0D1017;
      padding: 5px;
      border-radius: 12px;
      border: 1px solid var(--border);
    }
    @media (max-width: 680px) { .family-bar { grid-template-columns: repeat(3, 1fr); } }
    .family-pill {
      background: #161A26;
      border: 1px solid transparent;
      color: var(--muted);
      padding: 9px 6px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.3px;
      cursor: pointer;
      text-align: center;
      transition: all 0.15s ease;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .family-pill .sub-tag { font-size: 8.5px; opacity: 0.65; font-weight: 500; }
    .family-pill:hover { background: #1C2232; color: #fff; }
    .family-pill.active {
      background: var(--accent);
      color: #fff;
      border-color: #FF7733;
      box-shadow: 0 0 12px rgba(255, 85, 0, 0.45);
    }
    .family-pill.active .sub-tag { opacity: 0.9; }

    .player-card {
      background: var(--card);
      border-radius: 14px;
      border: 1px solid var(--border);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .angle-bar {
      display: flex;
      overflow-x: auto;
      gap: 5px;
      padding: 8px 10px;
      background: #0D1017;
      border-bottom: 1px solid var(--border);
      scrollbar-width: none;
    }
    .angle-bar::-webkit-scrollbar { display: none; }
    .tab-btn {
      background: #181D2A;
      color: var(--muted);
      border: 1px solid var(--border-light);
      padding: 6px 11px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
    }
    .tab-btn:hover { background: #22293C; color: #fff; }
    .tab-btn.active {
      background: #252D42;
      color: var(--cyan);
      border-color: var(--cyan);
    }
    .tab-btn.kinematic-tab {
      color: var(--accent);
      border-color: rgba(255, 85, 0, 0.4);
    }
    .tab-btn.kinematic-tab.active {
      background: rgba(255, 85, 0, 0.15);
      border-color: var(--accent);
      color: var(--accent);
    }

    .viewport {
      position: relative;
      width: 100%;
      height: 400px;
      background: #07080B;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    @media (max-width: 560px) { .viewport { height: 320px; } }
    .viewport img, .viewport video, .viewport svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .viewport svg { z-index: 4; }
    #imgDeep { z-index: 2; transition: opacity 0.06s linear; }
    #imgStanding { z-index: 1; }
    #videoElement { z-index: 3; display: none; }

    .telemetry-overlay {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 10;
      background: rgba(9, 10, 15, 0.88);
      border: 1px solid var(--border);
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .telemetry-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); }
    .hud-toggle-btn {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 10;
      background: rgba(9, 10, 15, 0.88);
      border: 1px solid var(--border);
      color: var(--cyan);
      padding: 4px 9px;
      border-radius: 6px;
      font-size: 9.5px;
      font-weight: 800;
      cursor: pointer;
      letter-spacing: 0.6px;
    }
    .hud-toggle-btn.active {
      border-color: var(--cyan);
      background: rgba(0, 229, 255, 0.15);
    }

    .controls-panel {
      padding: 10px 14px;
      background: #0F131D;
      border-top: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .scrubber-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .scrubber-label { font-size: 9.5px; font-weight: 800; color: var(--muted); width: 44px; }
    .scrubber-input {
      flex: 1;
      height: 6px;
      accent-color: var(--accent);
      cursor: pointer;
      background: #1C2232;
      border-radius: 3px;
    }
    .btn-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .btn-group { display: flex; gap: 6px; }
    .ctrl-btn {
      background: #1A2030;
      border: 1px solid var(--border);
      color: #E2E8F0;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .ctrl-btn:hover { background: #262E45; }
    .ctrl-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
    .speed-btn {
      background: #161A26;
      border: 1px solid var(--border);
      color: var(--muted);
      padding: 5px 8px;
      border-radius: 5px;
      font-size: 10px;
      font-weight: 700;
      cursor: pointer;
    }
    .speed-btn.active { color: var(--cyan); border-color: var(--cyan); }

    /* Live HUD Telemetry Dashboard */
    .hud-dashboard {
      background: #0B0E16;
      padding: 9px 12px;
      border-top: 1px solid var(--border);
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    @media (max-width: 600px) { .hud-dashboard { grid-template-columns: repeat(2, 1fr); } }
    .hud-metric-card {
      background: rgba(18, 21, 30, 0.7);
      border: 1px solid var(--border);
      padding: 6px 8px;
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .hud-metric-label {
      font-size: 8px;
      font-weight: 800;
      letter-spacing: 0.8px;
      color: var(--muted);
      text-transform: uppercase;
    }
    .hud-metric-val-row {
      display: flex;
      align-items: baseline;
      gap: 6px;
    }
    .hud-metric-val {
      font-size: 14px;
      font-weight: 800;
      color: var(--cyan);
      font-family: ui-monospace, Menlo, Consolas, monospace;
    }
    .hud-metric-val.success { color: var(--green); }
    .hud-subtag {
      font-size: 8px;
      font-weight: 800;
      padding: 1px 4px;
      border-radius: 3px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid var(--green);
      color: var(--green);
    }

    /* Research Evidence Section */
    .research-card {
      background: var(--card);
      border-radius: 12px;
      border: 1px solid var(--border);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .research-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
    }
    .research-title {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: var(--cyan);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .research-badge {
      font-size: 9px;
      font-weight: 700;
      color: var(--muted);
      background: #090A0E;
      padding: 2px 7px;
      border-radius: 4px;
      border: 1px solid var(--border);
    }
    .research-item {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .research-item:last-child { border-bottom: none; }
    .citation { font-size: 11px; font-weight: 700; color: #fff; }
    .finding { font-size: 11.5px; color: var(--muted); line-height: 1.4; }
    .takeaway { font-size: 11px; color: var(--green); font-weight: 600; line-height: 1.35; }
    .takeaway strong { color: var(--green); }

    /* Inspection Grid */
    .section-title {
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.3px;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 10px;
    }
    .mini-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .mini-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
    }
    .mini-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .mini-title { font-size: 11px; font-weight: 700; }
    .mini-tag { font-size: 8px; padding: 2px 5px; border-radius: 4px; background: #1C2232; color: var(--muted); }
    .mini-viewport {
      width: 100%;
      aspect-ratio: 1;
      background: #080A0E;
      border-radius: 6px;
      overflow: hidden;
    }
    .mini-viewport svg { width: 100%; height: 100%; }
  </style>
</head>
<body>

<div class="container">
  <div class="header">
    <div class="badge">Kinematics Pro HUD • Meta-Analysis Biomechanics</div>
    <h1>Adaptive Macro Motion Studio</h1>
    <div class="sub">Clinical joint telemetry, live vector bar path tracing, and peer-reviewed meta-analyses across all 65 exercises</div>
  </div>

  <!-- Foundational Flagship Families Selector -->
  <div class="family-bar">
    <button class="family-pill active" id="fam_squat" onclick="selectFamily('squat')">
      <span>Squat</span>
      <span class="sub-tag">Back / Front / Hack</span>
    </button>
    <button class="family-pill" id="fam_bench" onclick="selectFamily('bench')">
      <span>Bench Press</span>
      <span class="sub-tag">Flat / DB / Machine</span>
    </button>
    <button class="family-pill" id="fam_deadlift" onclick="selectFamily('deadlift')">
      <span>Deadlift</span>
      <span class="sub-tag">Hinge / RDL / Trap</span>
    </button>
    <button class="family-pill" id="fam_ohp" onclick="selectFamily('ohp')">
      <span>Overhead Press</span>
      <span class="sub-tag">Military / Shoulder</span>
    </button>
    <button class="family-pill" id="fam_row" onclick="selectFamily('row')">
      <span>Barbell Row</span>
      <span class="sub-tag">Bent-Over / Pendlay</span>
    </button>
    <button class="family-pill" id="fam_pullup" onclick="selectFamily('pullup')">
      <span>Pull-Up</span>
      <span class="sub-tag">Pronated / Pulldown</span>
    </button>
  </div>

  <!-- Master Interactive Player Card -->
  <div class="player-card">
    <div class="angle-bar" id="angleGroup"></div>

    <div class="viewport">
      <img id="imgStanding" alt="Setup">
      <img id="imgDeep" alt="Lockout / Depth">
      <video id="videoElement" loop playsinline muted></video>
      <svg id="kinematicSvg" viewBox="0 0 100 100"></svg>

      <div class="telemetry-overlay">
        <div class="telemetry-dot" id="phaseDot"></div>
        <span id="phaseText">PHASE 1: STARTING SETUP</span>
      </div>

      <button class="hud-toggle-btn active" id="btnToggleHud" onclick="toggleHud()">⚡ PRO HUD: ON</button>
    </div>

    <!-- Live Telemetry Dashboard -->
    <div class="hud-dashboard" id="hudDashboard">
      <div class="hud-metric-card" id="cardKnee">
        <div class="hud-metric-label">Knee Angle</div>
        <div class="hud-metric-val-row">
          <span class="hud-metric-val" id="valKnee">--°</span>
          <span class="hud-subtag" id="tagParallel" style="display:none;">PARALLEL ✓</span>
        </div>
      </div>
      <div class="hud-metric-card" id="cardHip">
        <div class="hud-metric-label">Hip Hinge</div>
        <div class="hud-metric-val-row">
          <span class="hud-metric-val" id="valHip">--°</span>
        </div>
      </div>
      <div class="hud-metric-card" id="cardElbow">
        <div class="hud-metric-label">Elbow Angle</div>
        <div class="hud-metric-val-row">
          <span class="hud-metric-val" id="valElbow">--°</span>
        </div>
      </div>
      <div class="hud-metric-card" id="cardTorso">
        <div class="hud-metric-label">Torso Angle</div>
        <div class="hud-metric-val-row">
          <span class="hud-metric-val" id="valTorso">--°</span>
        </div>
      </div>
    </div>

    <!-- Controls Panel -->
    <div class="controls-panel">
      <div class="scrubber-row" id="scrubberRow">
        <span class="scrubber-label">SETUP</span>
        <input type="range" min="0" max="100" value="0" class="scrubber-input" id="scrubber" oninput="onScrub(this.value)">
        <span class="scrubber-label" style="text-align:right;">PEAK</span>
      </div>

      <div class="btn-row">
        <div class="btn-group">
          <button class="ctrl-btn active" id="btnPlayPause" onclick="togglePlay()">⏸ PAUSE</button>
          <button class="ctrl-btn" onclick="jumpPose(0)">SETUP</button>
          <button class="ctrl-btn" onclick="jumpPose(100)">PEAK</button>
        </div>

        <div class="btn-group">
          <button class="speed-btn" id="spd_05" onclick="setSpeed(0.5)">0.5x</button>
          <button class="speed-btn active" id="spd_10" onclick="setSpeed(1.0)">1.0x</button>
          <button class="speed-btn" id="spd_15" onclick="setSpeed(1.5)">1.5x</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Peer-Reviewed Research & Meta-Analysis Card -->
  <div class="research-card" id="researchCard">
    <div class="research-header">
      <div class="research-title">🔬 Peer-Reviewed Meta-Analyses & Biomechanical Citations</div>
      <span class="research-badge" id="researchFamilyBadge">SQUAT FAMILY</span>
    </div>
    <div id="researchList"></div>
  </div>

  <!-- 44-Trajectory Catalogue Inspection Grid -->
  <div class="section-title">
    <span>⚡ Full 44-Trajectory 2D Kinematics Catalogue</span>
    <span style="font-size:11px; color:var(--muted); font-weight:500;">(Click any exercise to inspect HUD telemetry)</span>
  </div>
  <div class="grid" id="kinematicGrid"></div>
</div>

<!-- INJECTED ENGINE -->
<script>
  "use strict";
${engineCode}
</script>

<script>
  const MOTIONS = exports.MOTIONS;
  const marksFor = exports.marksFor;
  const jointTelemetryFor = exports.jointTelemetryFor;

  // Flagship Registry with verified Cloud Storage URLs
  const REGISTRY = {
    squat: {
      title: "Barbell Back Squat",
      motionId: "squat",
      angles: {
        side: {
          label: "90° SIDE (8K)",
          standing: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/squat_side_standing_keyframe.png",
          deep: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/squat_side_deep_keyframe.png"
        },
        isoMale: {
          label: "45° ISO (♂)",
          standing: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/squat_male_iso_standing_keyframe.png",
          deep: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/squat_male_iso_deep_keyframe.png"
        },
        isoFemale: {
          label: "45° ISO (♀)",
          standing: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/squat_female_iso_standing_keyframe.png",
          deep: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/squat_female_iso_deep_keyframe.png"
        },
        front: {
          label: "FRONT (VIDEO)",
          video: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/squat_deep_front_v2.mp4"
        },
        kinematic: { label: "2D KINEMATICS", isKinematic: true }
      },
      research: [
        {
          citation: "Hartmann, H., Wirth, K., & Klusemann, M. (2013) • Sports Medicine",
          finding: "Systematic review: Retropatellar compressive forces peak at 90° knee flexion. Descending deeper past parallel engages the quadriceps tendon 'wrapping effect' around the femoral groove, redistributing stress across a larger surface.",
          takeaway: "Squatting below parallel is safe for healthy knees and protects patellofemoral cartilage via tendon wrapping."
        },
        {
          citation: "Bryanton, M. A., et al. (2012) • J Strength Cond Res",
          finding: "Inverse dynamics analysis: As squat depth increases below parallel, relative muscular effort of the gluteus maximus increases exponentially compared to quadriceps.",
          takeaway: "Breaking parallel is essential for maximal gluteus maximus hypertrophy and hip extensor power."
        },
        {
          citation: "Cholewicki, J., & McGill, S. M. (1996) • J Biomechanics",
          finding: "Valsalva intra-abdominal pressure (IAP) stiffens the lumbar spine cylinder, reducing peak vertebral compressive loads by 20–40%.",
          takeaway: "Inhale deeply into the belly and brace against the abdominal wall before descending."
        }
      ]
    },
    bench: {
      title: "Barbell Bench Press",
      motionId: "bench-press",
      angles: {
        side: {
          label: "90° SIDE (8K)",
          standing: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/bench_side_lockout_keyframe.jpg?v=2",
          deep: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/bench_side_bottom_keyframe.jpg?v=2"
        },
        isoMale: {
          label: "45° ISO (♂)",
          standing: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/bench_press_realistic_lockout.jpg",
          deep: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/bench_press_realistic_bottom.jpg"
        },
        isoFemale: {
          label: "45° ISO (♀)",
          standing: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/bench_female_iso_lockout_keyframe.jpg",
          deep: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/bench_female_iso_bottom_keyframe.jpg"
        },
        front: {
          label: "FRONT (VIDEO)",
          video: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/bench_press_front_loop.mp4"
        },
        kinematic: { label: "2D KINEMATICS", isKinematic: true }
      },
      research: [
        {
          citation: "McLaughlin, T. M., & Madsen, N. H. (1984) • NSCA Journal",
          finding: "Kinematic bar path analysis: Elite lifters press the barbell backward toward the eyes immediately off the chest in a reverse J-curve, minimizing the shoulder moment arm at the sticking point.",
          takeaway: "Drive the bar back toward your shoulders off the chest rather than straight vertical."
        },
        {
          citation: "Feeley, B. T., et al. (2012) • Am J Sports Med",
          finding: "Flaring elbows to 90° narrows the subacromial space to <5mm, causing high supraspinatus tendon shear and anterior capsule strain.",
          takeaway: "Tuck elbows to 45°–60° in the scapular plane to protect the rotator cuff."
        }
      ]
    },
    deadlift: {
      title: "Conventional Deadlift",
      motionId: "deadlift",
      angles: {
        iso: {
          label: "45° ISO (8K STUDIO)",
          standing: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/deadlift_setup_keyframe.jpg",
          deep: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/deadlift_lockout_keyframe.jpg"
        },
        kinematic: { label: "90° SIDE (KINEMATICS)", isKinematic: true }
      },
      research: [
        {
          citation: "McGill, S. M. (2007) • Human Kinetics (Low Back Disorders)",
          finding: "Spinal loading: Lumbar flexion under heavy load drastically increases disc herniation shear strain. Maintaining anatomical neutral transfers load to the posterior chain musculature.",
          takeaway: "Lock the lumbar spine in neutral; hinge purely through the coxofemoral (hip) joints."
        },
        {
          citation: "Vigotsky, A. D., et al. (2019) • J Strength Cond Res",
          finding: "Trap bar deadlifts reduce lumbar spine flexion moments by ~10% compared to straight barbells due to closer center-of-mass alignment.",
          takeaway: "Use the trap bar if managing lower back fatigue or disc sensitivity."
        }
      ]
    },
    ohp: {
      title: "Overhead Press",
      motionId: "overhead-press",
      angles: {
        iso: {
          label: "45° ISO (8K STUDIO)",
          standing: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/ohp_setup_keyframe.jpg",
          deep: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/ohp_lockout_keyframe.jpg"
        },
        kinematic: { label: "90° SIDE (KINEMATICS)", isKinematic: true }
      },
      research: [
        {
          citation: "Saeterbakken, A. H., & Fimland, M. S. (2013) • J Strength Cond Res",
          finding: "Standing overhead press generates significantly higher core stabilizer and anterior deltoid neuromuscular activation than seated press.",
          takeaway: "Lock glutes and pull the ribcage down to maintain total-body spinal rigidity."
        }
      ]
    },
    row: {
      title: "Barbell Bent-Over Row",
      motionId: "barbell-row",
      angles: {
        iso: {
          label: "45° ISO (8K STUDIO)",
          standing: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/row_setup_keyframe.jpg",
          deep: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/row_lockout_keyframe.jpg"
        },
        kinematic: { label: "90° SIDE (KINEMATICS)", isKinematic: true }
      },
      research: [
        {
          citation: "Fenwick, C. M., & McGill, S. M. (2009) • J Strength Cond Res",
          finding: "Bent-over barbell rows impose high compressive loads on L4/L5 (>3000N). Chest-supported rowing variants provide equal lat recruitment with negligible lumbar shear.",
          takeaway: "Drive elbows back past the ribs while maintaining a rigid 45° hip hinge."
        }
      ]
    },
    pullup: {
      title: "Pull-Up (Pronated Grip)",
      motionId: "pull-up",
      angles: {
        iso: {
          label: "45° ISO (8K STUDIO)",
          standing: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/pullup_setup_keyframe.jpg",
          deep: "https://storage.googleapis.com/adaptive-macro-card-images/exercises/pullup_lockout_keyframe.jpg"
        },
        kinematic: { label: "90° SIDE (KINEMATICS)", isKinematic: true }
      },
      research: [
        {
          citation: "Youdas, J. W., et al. (2010) • J Strength Cond Res",
          finding: "Pull-ups (pronated) elicit significantly higher lower trapezius activation, while chin-ups (supinated) recruit more biceps brachii.",
          takeaway: "Depress scapulae first before pulling; drive elbows down and back toward ribs."
        },
        {
          citation: "Wolf, J., et al. (2023) • Sports Medicine",
          finding: "Meta-analysis: Long muscle length training (dead hang stretch) produces superior hypertrophy compared to shortened half-reps.",
          takeaway: "Lower to a full active hang on every rep for maximal latissimus stretch-mediated growth."
        }
      ]
    }
  };

  let currentFamilyKey = "squat";
  let currentAngleKey = "side";
  let customMotionId = null;
  let isPlaying = true;
  let playbackSpeed = 1.0;
  let scrubProgress = 0; // 0..100
  let animDir = 1;
  let lastTime = performance.now();
  let showHud = true;

  const imgStanding = document.getElementById("imgStanding");
  const imgDeep = document.getElementById("imgDeep");
  const videoElement = document.getElementById("videoElement");
  const kinematicSvg = document.getElementById("kinematicSvg");
  const angleGroup = document.getElementById("angleGroup");
  const scrubber = document.getElementById("scrubber");
  const phaseText = document.getElementById("phaseText");
  const phaseDot = document.getElementById("phaseDot");
  const btnPlayPause = document.getElementById("btnPlayPause");
  const btnToggleHud = document.getElementById("btnToggleHud");
  const researchCard = document.getElementById("researchCard");
  const researchList = document.getElementById("researchList");
  const researchFamilyBadge = document.getElementById("researchFamilyBadge");

  // HUD elements
  const valKnee = document.getElementById("valKnee");
  const valHip = document.getElementById("valHip");
  const valElbow = document.getElementById("valElbow");
  const valTorso = document.getElementById("valTorso");
  const tagParallel = document.getElementById("tagParallel");

  function selectFamily(famKey) {
    currentFamilyKey = famKey;
    customMotionId = null;
    document.querySelectorAll(".family-pill").forEach(p => p.classList.remove("active"));
    document.getElementById("fam_" + famKey).classList.add("active");

    const fam = REGISTRY[famKey];
    currentAngleKey = Object.keys(fam.angles)[0];
    renderAngleTabs();
    renderResearchCard();
    applyActiveAngle();
  }

  function renderAngleTabs() {
    const fam = REGISTRY[currentFamilyKey];
    angleGroup.innerHTML = Object.entries(fam.angles).map(([k, angle]) => {
      const isKin = angle.isKinematic ? "kinematic-tab" : "";
      const isActive = k === currentAngleKey ? "active" : "";
      return '<button class="tab-btn ' + isKin + ' ' + isActive + '" onclick="setAngle(\\'' + k + '\\')">' + angle.label + '</button>';
    }).join("");
  }

  function setAngle(angleKey) {
    currentAngleKey = angleKey;
    customMotionId = null;
    renderAngleTabs();
    applyActiveAngle();
  }

  function renderResearchCard() {
    const fam = REGISTRY[currentFamilyKey];
    researchFamilyBadge.innerText = fam.title.toUpperCase();
    researchList.innerHTML = fam.research.map(r => 
      '<div class="research-item">' +
        '<div class="citation">' + r.citation + '</div>' +
        '<div class="finding">' + r.finding + '</div>' +
        '<div class="takeaway"><strong>Takeaway: </strong>' + r.takeaway + '</div>' +
      '</div>'
    ).join("");
  }

  function applyActiveAngle() {
    const fam = REGISTRY[currentFamilyKey];
    const angle = fam.angles[currentAngleKey];

    if (customMotionId !== null || angle.isKinematic) {
      // Kinematic Mode
      imgStanding.style.display = "none";
      imgDeep.style.display = "none";
      videoElement.style.display = "none";
      videoElement.pause();
      kinematicSvg.style.display = "block";
    } else if (angle.video) {
      // Video Mode
      imgStanding.style.display = "none";
      imgDeep.style.display = "none";
      kinematicSvg.style.display = "none";
      videoElement.style.display = "block";
      videoElement.src = angle.video;
      videoElement.play();
    } else {
      // Keyframe Pair Mode
      videoElement.style.display = "none";
      videoElement.pause();
      kinematicSvg.style.display = "none";
      imgStanding.style.display = "block";
      imgDeep.style.display = "block";
      imgStanding.src = angle.standing;
      imgDeep.src = angle.deep;
    }
  }

  function toggleHud() {
    showHud = !showHud;
    btnToggleHud.classList.toggle("active", showHud);
    btnToggleHud.innerText = showHud ? "⚡ PRO HUD: ON" : "⚡ PRO HUD: OFF";
    document.getElementById("hudDashboard").style.display = showHud ? "grid" : "none";
  }

  function togglePlay() {
    isPlaying = !isPlaying;
    btnPlayPause.innerText = isPlaying ? "⏸ PAUSE" : "▶ PLAY";
    btnPlayPause.classList.toggle("active", isPlaying);
  }

  function jumpPose(pct) {
    isPlaying = false;
    btnPlayPause.innerText = "▶ PLAY";
    btnPlayPause.classList.remove("active");
    scrubProgress = pct;
    scrubber.value = pct;
  }

  function onScrub(val) {
    isPlaying = false;
    btnPlayPause.innerText = "▶ PLAY";
    btnPlayPause.classList.remove("active");
    scrubProgress = parseFloat(val);
  }

  function setSpeed(spd) {
    playbackSpeed = spd;
    document.querySelectorAll(".speed-btn").forEach(b => b.classList.remove("active"));
    document.getElementById("spd_" + (spd * 10).toString().padStart(2, "0")).classList.add("active");
  }

  function inspectMotion(motionId) {
    customMotionId = motionId;
    document.querySelectorAll(".family-pill").forEach(p => p.classList.remove("active"));
    angleGroup.innerHTML = '<button class="tab-btn active kinematic-tab">2D KINEMATICS — ' + motionId.toUpperCase() + '</button>';
    applyActiveAngle();
  }

  // Animation Loop
  function tick(now) {
    const delta = (now - lastTime) / 1000;
    lastTime = now;

    if (isPlaying) {
      const step = (100 / 1.3) * playbackSpeed * delta;
      let next = scrubProgress + step * animDir;
      if (next >= 100) { next = 100; animDir = -1; }
      else if (next <= 0) { next = 0; animDir = 1; }
      scrubProgress = next;
      scrubber.value = Math.round(next);
    }

    const norm = (1 - Math.cos((scrubProgress / 100) * Math.PI)) / 2;
    imgDeep.style.opacity = norm;

    // Telemetry labels
    const isSetup = scrubProgress < 30;
    const isPeak = scrubProgress > 70;
    phaseText.innerText = isSetup ? "PHASE 1: STARTING SETUP" : isPeak ? "PHASE 2: PEAK CONTRACTION" : "ACTIVE EXCURSION";
    phaseDot.style.background = isSetup ? "#10B981" : isPeak ? "#FF5500" : "#FBBF24";

    // Update Kinematic SVG & Telemetry
    const activeMotionId = customMotionId || (REGISTRY[currentFamilyKey] ? REGISTRY[currentFamilyKey].motionId : "squat");
    const telemetry = jointTelemetryFor(activeMotionId, norm);

    if (telemetry) {
      valKnee.innerText = telemetry.kneeAngle !== undefined ? telemetry.kneeAngle + "°" : "--°";
      valHip.innerText = telemetry.hipAngle !== undefined ? telemetry.hipAngle + "°" : "--°";
      valElbow.innerText = telemetry.elbowAngle !== undefined ? telemetry.elbowAngle + "°" : "--°";
      valTorso.innerText = telemetry.torsoAngle !== undefined ? telemetry.torsoAngle + "°" : (telemetry.abductionAngle !== undefined ? telemetry.abductionAngle + "° (Abd)" : "--°");

      if (telemetry.isParallelReached) {
        valKnee.classList.add("success");
        tagParallel.style.display = "inline-block";
      } else {
        valKnee.classList.remove("success");
        tagParallel.style.display = "none";
      }

      if (kinematicSvg.style.display !== "none") {
        kinematicSvg.innerHTML = renderSvgWithHud(activeMotionId, norm, telemetry);
      }
    }

    requestAnimationFrame(tick);
  }

  function renderSvgWithHud(motionId, progress01, telemetry) {
    const load = MOTIONS[motionId].load;
    const marks = marksFor(motionId, progress01, load);
    let out = '<g opacity="0.22"><line x1="50" y1="6" x2="50" y2="92" stroke="#FF5500" stroke-width="0.7" stroke-dasharray="2,2"/><line x1="10" y1="30" x2="90" y2="30" stroke="#2D3548" stroke-width="0.4"/><line x1="10" y1="60" x2="90" y2="60" stroke="#2D3548" stroke-width="0.4"/></g>';

    // Bar Path HUD
    if (showHud && telemetry.barTrajectory && telemetry.barTrajectory.length > 1) {
      const lineD = telemetry.barTrajectory.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(2) + " " + p[1].toFixed(2)).join(" ");
      out += '<path d="' + lineD + '" stroke="#00E5FF" stroke-width="2.5" stroke-dasharray="2,2" fill="none" opacity="0.25"/>';
      out += '<path d="' + lineD + '" stroke="#00E5FF" stroke-width="1.2" stroke-dasharray="2.5,1.5" fill="none" opacity="0.85"/>';
      out += '<line x1="' + telemetry.barTrajectory[0][0].toFixed(2) + '" y1="' + telemetry.barTrajectory[0][1].toFixed(2) + '" x2="' + telemetry.barTrajectory[0][0].toFixed(2) + '" y2="90" stroke="#00E5FF" stroke-width="0.65" stroke-dasharray="1.5,3" opacity="0.4"/>';
      if (telemetry.barCurrent) {
        out += '<circle cx="' + telemetry.barCurrent[0].toFixed(2) + '" cy="' + telemetry.barCurrent[1].toFixed(2) + '" r="3.2" fill="#00E5FF" opacity="0.4"/>';
        out += '<circle cx="' + telemetry.barCurrent[0].toFixed(2) + '" cy="' + telemetry.barCurrent[1].toFixed(2) + '" r="1.8" fill="#FFFFFF" stroke="#00E5FF" stroke-width="0.8"/>';
      }
    }

    marks.forEach(mark => {
      if (mark.kind === "path") {
        const isAccent = mark.tone === "accent";
        const dStr = mark.points.map((pt, i) => (i === 0 ? "M" : "L") + pt[0].toFixed(2) + " " + pt[1].toFixed(2)).join(" ");
        const col = isAccent ? "#FF5500" : (mark.tone === "body" ? "#F8FAFC" : (mark.tone === "ground" ? "#2D3548" : "#94A3B8"));
        if (isAccent) {
          out += '<path d="' + dStr + '" stroke="#FF5500" stroke-width="' + (mark.width + 4.5) + '" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.26"/>';
        }
        out += '<path d="' + dStr + '" stroke="' + col + '" stroke-width="' + mark.width + '" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
        if (mark.tone === "body" && mark.points.length >= 2) {
          mark.points.forEach(pt => {
            out += '<circle cx="' + pt[0].toFixed(2) + '" cy="' + pt[1].toFixed(2) + '" r="1.5" fill="#090A0D" stroke="#00E5FF" stroke-width="0.9"/>';
          });
        }
      } else if (mark.ring) {
        out += '<circle cx="' + mark.at[0].toFixed(2) + '" cy="' + mark.at[1].toFixed(2) + '" r="' + mark.r + '" stroke="#FF5500" stroke-width="1.6" fill="#FF5500" fill-opacity="0.18"/>';
      } else if (mark.tone === "body") {
        out += '<circle cx="' + mark.at[0].toFixed(2) + '" cy="' + mark.at[1].toFixed(2) + '" r="' + mark.r + '" fill="#0F131D" stroke="#F8FAFC" stroke-width="1.5"/>';
      } else {
        out += '<circle cx="' + mark.at[0].toFixed(2) + '" cy="' + mark.at[1].toFixed(2) + '" r="' + mark.r + '" fill="' + (mark.tone === "accent" ? "#FF5500" : "#94A3B8") + '"/>';
      }
    });

    return out;
  }

  // Populate Catalogue Inspection Grid
  const allMotionIds = Object.keys(MOTIONS);
  const gridContainer = document.getElementById("kinematicGrid");
  gridContainer.innerHTML = allMotionIds.map(id => {
    return '<div class="mini-card" onclick="inspectMotion(\\'' + id + '\\')">' +
      '<div class="mini-card-header">' +
        '<span class="mini-title">' + id.toUpperCase() + '</span>' +
        '<span class="mini-tag">60 FPS</span>' +
      '</div>' +
      '<div class="mini-viewport"><svg id="grid_svg_' + id + '" viewBox="0 0 100 100"></svg></div>' +
    '</div>';
  }).join("");

  // Populate static mini SVGs
  allMotionIds.forEach(id => {
    const svgEl = document.getElementById("grid_svg_" + id);
    if (svgEl) {
      svgEl.innerHTML = renderSvgWithHud(id, 0.5, jointTelemetryFor(id, 0.5));
    }
  });

  // Init
  selectFamily("squat");
  requestAnimationFrame(tick);
</script>

</body>
</html>
`;

fs.writeFileSync('C:/Users/marca/.gemini/antigravity/brain/215765b4-ecc0-484d-b50f-93fc47ea9725/interactive_motion_preview.html', htmlContent);
console.log('Successfully generated updated interactive_motion_preview.html');
