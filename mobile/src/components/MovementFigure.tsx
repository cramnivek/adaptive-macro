import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import {
  type Load,
  type MotionId,
  type Tone,
  FLOOR_Y,
  jointTelemetryFor,
  loadFor,
  marksFor,
  repProgress,
  svgAngleArc,
} from '../exerciseMotion';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';

interface MovementFigureProps {
  motion: MotionId;
  exerciseName: string;
  /** Catalogued equipment, when the name alone does not say what is held. */
  equipment?: string;
  size?: number;
  colours: Record<Tone, string>;
  /** Optional external progress (0..1) when driven by an interactive scrubber. */
  progressOverride?: number;
  /** When true, renders live biomechanical bar path traces and plumb lines. */
  showHud?: boolean;
}

const line = (points: [number, number][]) =>
  points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');

/**
 * Upgraded Anatomical Kinematic Renderer.
 *
 * Draws the mathematical joint-angle solution from `marksFor` with volumetric
 * rounded limb capsules, glowing active load/muscle highlights, joint articulation
 * pivot nodes, and a technical plumb-line reference grid.
 */
export const MovementFigure = ({
  motion,
  exerciseName,
  equipment,
  size = 150,
  colours,
  progressOverride,
  showHud = false,
}: MovementFigureProps) => {
  const load: Load = loadFor(motion, exerciseName, equipment);
  const [internalProgress, setInternalProgress] = useState(1);
  const [still, setStill] = useState<boolean | null>(null);

  useEffect(() => {
    if (progressOverride !== undefined) return;
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => live && setStill(reduce))
      .catch(() => live && setStill(false));
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduce) => setStill(reduce));
    return () => {
      live = false;
      subscription?.remove();
    };
  }, [progressOverride]);

  useEffect(() => {
    if (progressOverride !== undefined) return;
    if (still !== false) {
      setInternalProgress(1);
      return;
    }
    let frame = 0;
    const started = Date.now();
    const tick = () => {
      setInternalProgress(repProgress(Date.now() - started));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [still, progressOverride]);

  const activeProgress = progressOverride !== undefined ? progressOverride : internalProgress;
  const marks = marksFor(motion, activeProgress, load);
  const marksStart = marksFor(motion, 0, load);
  const marksEnd = marksFor(motion, 1, load);
  const telemetry = showHud ? jointTelemetryFor(motion, activeProgress) : null;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel={`A figure doing ${exerciseName}`}>
      {/* Kinematics Pro HUD: Viewport Corner Reticles, Reference Grid, Bar Path & Live Joint Angle Arcs */}
      {showHud && (
        <G>
          {/* Viewport Corner Brackets */}
          <Path d="M 4 12 L 4 4 L 12 4" stroke="#00E5FF" strokeWidth={0.8} fill="none" opacity={0.65} />
          <Path d="M 96 12 L 96 4 L 88 4" stroke="#00E5FF" strokeWidth={0.8} fill="none" opacity={0.65} />
          <Path d="M 4 88 L 4 96 L 12 96" stroke="#00E5FF" strokeWidth={0.8} fill="none" opacity={0.65} />
          <Path d="M 96 88 L 96 96 L 88 96" stroke="#00E5FF" strokeWidth={0.8} fill="none" opacity={0.65} />

          {/* Reference Grid & Plumb Line */}
          <Line x1="50" y1="4" x2="50" y2="92" stroke="#00E5FF" strokeWidth={0.6} strokeDasharray="1.5,2.5" opacity={0.35} />
          <Line x1="10" y1="30" x2="90" y2="30" stroke={colours.ground} strokeWidth="0.4" opacity={0.25} />
          <Line x1="10" y1="60" x2="90" y2="60" stroke={colours.ground} strokeWidth="0.4" opacity={0.25} />

          {/* Bar Path Trajectory & Plumb Line */}
          {telemetry?.barTrajectory && telemetry.barTrajectory.length > 1 && (
            <G>
              <Path d={line(telemetry.barTrajectory)} stroke="#00E5FF" strokeWidth={2.4} strokeDasharray="2,2" fill="none" opacity={0.25} />
              <Path d={line(telemetry.barTrajectory)} stroke="#00E5FF" strokeWidth={1.2} strokeDasharray="2.5,1.5" fill="none" opacity={0.85} />
              <Line
                x1={telemetry.barTrajectory[0][0]}
                y1={telemetry.barTrajectory[0][1]}
                x2={telemetry.barTrajectory[0][0]}
                y2={FLOOR_Y}
                stroke="#00E5FF"
                strokeWidth={0.65}
                strokeDasharray="1.5,3"
                opacity={0.4}
              />
              {telemetry.barCurrent && (
                <G>
                  <Circle cx={telemetry.barCurrent[0]} cy={telemetry.barCurrent[1]} r={3.2} fill="#00E5FF" opacity={0.4} />
                  <Circle cx={telemetry.barCurrent[0]} cy={telemetry.barCurrent[1]} r={1.8} fill="#FFFFFF" stroke="#00E5FF" strokeWidth={0.8} />
                </G>
              )}
            </G>
          )}

          {/* Clinical Joint Angle Arcs & Degree Badges */}
          {telemetry?.joints && (
            <G>
              {/* Knee Flexion Angle Arc */}
              {telemetry.kneeAngle !== undefined && (
                <G>
                  {(() => {
                    const arc = svgAngleArc(telemetry.joints.knee, telemetry.joints.hip, telemetry.joints.ankle, 6.0);
                    const isParallel = telemetry.isParallelReached;
                    const strokeCol = isParallel ? '#10B981' : '#00E5FF';
                    return (
                      <G>
                        <Path d={arc.path} stroke={strokeCol} strokeWidth={1.4} fill="none" opacity={0.9} />
                        <Circle cx={arc.labelAt[0]} cy={arc.labelAt[1]} r={4.5} fill="#090A0D" opacity={0.88} stroke={strokeCol} strokeWidth={0.5} />
                        <SvgText
                          x={arc.labelAt[0]}
                          y={arc.labelAt[1] + 1.5}
                          fill={strokeCol}
                          fontSize={4.0}
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {`${telemetry.kneeAngle}°`}
                        </SvgText>
                        {isParallel && (
                          <SvgText
                            x={arc.labelAt[0] + (arc.labelAt[0] < 50 ? -6 : 6)}
                            y={arc.labelAt[1] - 4}
                            fill="#10B981"
                            fontSize={3.0}
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            PARALLEL
                          </SvgText>
                        )}
                      </G>
                    );
                  })()}
                </G>
              )}

              {/* Hip Hinge Angle Arc */}
              {telemetry.hipAngle !== undefined && (
                <G>
                  {(() => {
                    const arc = svgAngleArc(telemetry.joints.hip, telemetry.joints.shoulder, telemetry.joints.knee, 6.5);
                    return (
                      <G>
                        <Path d={arc.path} stroke="#F59E0B" strokeWidth={1.3} fill="none" opacity={0.9} />
                        <Circle cx={arc.labelAt[0]} cy={arc.labelAt[1]} r={4.5} fill="#090A0D" opacity={0.88} stroke="#F59E0B" strokeWidth={0.5} />
                        <SvgText
                          x={arc.labelAt[0]}
                          y={arc.labelAt[1] + 1.5}
                          fill="#F59E0B"
                          fontSize={4.0}
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {`${telemetry.hipAngle}°`}
                        </SvgText>
                      </G>
                    );
                  })()}
                </G>
              )}

              {/* Elbow Flexion Angle Arc */}
              {telemetry.elbowAngle !== undefined && (
                <G>
                  {(() => {
                    const arc = svgAngleArc(telemetry.joints.elbow, telemetry.joints.shoulder, telemetry.joints.hand, 5.5);
                    return (
                      <G>
                        <Path d={arc.path} stroke="#A855F7" strokeWidth={1.3} fill="none" opacity={0.9} />
                        <Circle cx={arc.labelAt[0]} cy={arc.labelAt[1]} r={4.5} fill="#090A0D" opacity={0.88} stroke="#A855F7" strokeWidth={0.5} />
                        <SvgText
                          x={arc.labelAt[0]}
                          y={arc.labelAt[1] + 1.5}
                          fill="#A855F7"
                          fontSize={4.0}
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {`${telemetry.elbowAngle}°`}
                        </SvgText>
                      </G>
                    );
                  })()}
                </G>
              )}
            </G>
          )}

          {/* Front Abduction Angle Arc */}
          {telemetry?.frontJoints && telemetry.abductionAngle !== undefined && (
            <G>
              {(() => {
                const j = telemetry.frontJoints;
                const arc = svgAngleArc(j.shoulder, [j.shoulder[0], j.shoulder[1] + 20], j.elbow, 7.0);
                return (
                  <G>
                    <Path d={arc.path} stroke="#00E5FF" strokeWidth={1.4} fill="none" opacity={0.9} />
                    <Circle cx={arc.labelAt[0]} cy={arc.labelAt[1]} r={4.5} fill="#090A0D" opacity={0.88} stroke="#00E5FF" strokeWidth={0.5} />
                    <SvgText
                      x={arc.labelAt[0]}
                      y={arc.labelAt[1] + 1.5}
                      fill="#00E5FF"
                      fontSize={4.0}
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {`${telemetry.abductionAngle}°`}
                    </SvgText>
                  </G>
                );
              })()}
            </G>
          )}
        </G>
      )}

      {marks.map((mark, index) => {
        if (mark.kind === 'path') {
          const isBody = mark.tone === 'body';
          const isAccent = mark.tone === 'accent';
          const isFar = mark.tone === 'far';

          // Automatically highlight limbs that actively articulate during the rep
          let isActiveLimb = false;
          const m0 = marksStart[index];
          const m1 = marksEnd[index];
          if (isBody && m0?.kind === 'path' && m1?.kind === 'path' && m0.points.length === m1.points.length) {
            const maxTravel = m0.points.reduce((acc, pt, i) => {
              const other = m1.points[i];
              return Math.max(acc, Math.hypot(pt[0] - other[0], pt[1] - other[1]));
            }, 0);
            isActiveLimb = maxTravel > 4.0;
          }

          const limbColor = isActiveLimb ? colours.accent : colours[mark.tone];

          return (
            <G key={index}>
              {/* Outer glow / volumetric muscle halo for active limbs and load */}
              {(isActiveLimb || isAccent) && (
                <Path
                  d={line(mark.points)}
                  stroke={colours.accent}
                  strokeWidth={mark.width + 4.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.26}
                />
              )}
              <Path
                d={line(mark.points)}
                stroke={limbColor}
                strokeWidth={isBody ? mark.width * 1.12 : mark.width}
                strokeLinecap={mark.tone === 'ground' ? 'square' : 'round'}
                strokeLinejoin="round"
                fill="none"
                opacity={isFar ? 0.38 : 1}
              />
              {/* Joint articulation pivot rings on primary body limbs only when HUD is active */}
              {showHud &&
                isBody &&
                mark.points.length >= 2 &&
                mark.points.map(([jx, jy], jIdx) => (
                  <Circle
                    key={`joint-${jIdx}`}
                    cx={jx}
                    cy={jy}
                    r={mark.width >= 5.5 ? 2.0 : 1.5}
                    fill="#090A0D"
                    stroke="#00E5FF"
                    strokeWidth={0.95}
                  />
                ))}
            </G>
          );
        }

        if (mark.ring) {
          return (
            <G key={index}>
              <Circle
                cx={mark.at[0]}
                cy={mark.at[1]}
                r={mark.r}
                stroke={colours[mark.tone]}
                strokeWidth={1.6}
                fill={colours[mark.tone]}
                fillOpacity={0.18}
              />
            </G>
          );
        }

        // Anatomical head circle vs load collar/dumbbell
        if (mark.tone === 'body') {
          return (
            <Circle
              key={index}
              cx={mark.at[0]}
              cy={mark.at[1]}
              r={mark.r}
              fill="#0F131D"
              stroke={colours.body}
              strokeWidth={1.5}
            />
          );
        }

        return (
          <G key={index}>
            {mark.tone === 'accent' && (
              <Circle cx={mark.at[0]} cy={mark.at[1]} r={mark.r + 2} fill={colours.accent} opacity={0.25} />
            )}
            <Circle
              cx={mark.at[0]}
              cy={mark.at[1]}
              r={mark.r}
              fill={mark.tone === 'accent' && mark.r <= 2.2 ? '#FFFFFF' : colours[mark.tone]}
            />
          </G>
        );
      })}
    </Svg>
  );
};

/**
 * Interactive 60 FPS Kinematic Motion Studio for all 130+ catalogued exercises.
 * Provides Play/Pause, Setup/Peak jump buttons, 0–100% scrubber, speed selector,
 * and live phase telemetry around the upgraded anatomical figure.
 */
export const KinematicMotionStudio = ({
  motion,
  exerciseName,
  equipment,
}: {
  motion: MotionId;
  exerciseName: string;
  equipment?: string;
}) => {
  const [progressPct, setProgressPct] = useState(0); // 0..100
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1.0);
  const [showHud, setShowHud] = useState(true);

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const speedRef = useRef(speed);
  speedRef.current = speed;

  const progressRef = useRef(progressPct);
  progressRef.current = progressPct;

  const dirRef = useRef(1);

  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const delta = (time - lastTime) / 1000;
      lastTime = time;

      if (isPlayingRef.current) {
        const step = (100 / 1.25) * speedRef.current * delta;
        let next = progressRef.current + step * dirRef.current;

        if (next >= 100) {
          next = 100;
          dirRef.current = -1;
        } else if (next <= 0) {
          next = 0;
          dirRef.current = 1;
        }

        progressRef.current = next;
        setProgressPct(next);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [motion]);

  // Smooth cosine easing for natural biomechanical acceleration/deceleration
  const normalized = (1 - Math.cos((progressPct / 100) * Math.PI)) / 2;
  const telemetry = jointTelemetryFor(motion, normalized);

  const isSetup = progressPct < 30;
  const isPeak = progressPct > 70;
  const phaseLabel = isSetup
    ? 'PHASE 1: STARTING SETUP'
    : isPeak
      ? 'PHASE 2: PEAK CONTRACTION'
      : 'ACTIVE CONCENTRIC / ECCENTRIC';
  const dotColor = isSetup ? '#10B981' : isPeak ? loud.loud : '#FBBF24';

  return (
    <View style={studioStyles.container}>
      <View style={studioStyles.viewport}>
        <MovementFigure
          motion={motion}
          exerciseName={exerciseName}
          equipment={equipment}
          size={240}
          progressOverride={normalized}
          showHud={showHud}
          colours={{
            body: loud.figure,
            far: loud.figureMuted,
            ground: loud.rule,
            accent: loud.loud,
          }}
        />

        <View style={studioStyles.badge}>
          <View style={[studioStyles.badgeDot, { backgroundColor: dotColor }]} />
          <Text style={studioStyles.badgeText}>{phaseLabel}</Text>
        </View>

        <Pressable
          onPress={() => setShowHud((h) => !h)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Toggle Biomechanical Telemetry HUD"
          style={[studioStyles.hudPill, showHud && studioStyles.hudPillActive]}
        >
          <Text style={[studioStyles.hudPillText, showHud && studioStyles.hudPillTextActive]}>
            {showHud ? '⚡ HUD ON' : '⚡ HUD OFF'}
          </Text>
        </Pressable>

        <View style={studioStyles.engineBadge}>
          <Text style={studioStyles.engineBadgeText}>KINEMATIC PRO • 60 FPS</Text>
        </View>
      </View>

      {/* Interactive Coaching Scrubber & Controls */}
      <View style={studioStyles.controls}>
        <View style={studioStyles.scrubberRow}>
          <Text style={studioStyles.scrubEdge}>SETUP</Text>
          {Platform.OS === 'web' ? (
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(progressPct)}
              onChange={(e) => {
                setIsPlaying(false);
                const val = parseFloat(e.target.value);
                progressRef.current = val;
                setProgressPct(val);
              }}
              style={{
                flex: 1,
                accentColor: loud.loud,
                height: 6,
                cursor: 'pointer',
              }}
            />
          ) : (
            <View style={studioStyles.nativeTrack}>
              <View style={[studioStyles.nativeFill, { width: `${progressPct}%` }]} />
            </View>
          )}
          <Text style={[studioStyles.scrubEdge, { textAlign: 'right' }]}>PEAK</Text>
        </View>

        <View style={studioStyles.actionRow}>
          <View style={studioStyles.actionGroup}>
            <Pressable
              onPress={() => setIsPlaying((p) => !p)}
              style={[studioStyles.actionBtn, isPlaying && studioStyles.actionBtnActive]}
            >
              <Text style={[studioStyles.actionBtnText, isPlaying && studioStyles.actionBtnTextActive]}>
                {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setIsPlaying(false);
                progressRef.current = 0;
                setProgressPct(0);
              }}
              style={studioStyles.actionBtn}
            >
              <Text style={studioStyles.actionBtnText}>SETUP</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setIsPlaying(false);
                progressRef.current = 100;
                setProgressPct(100);
              }}
              style={studioStyles.actionBtn}
            >
              <Text style={studioStyles.actionBtnText}>PEAK</Text>
            </Pressable>
          </View>

          <View style={studioStyles.actionGroup}>
            {[0.5, 1.0, 1.5].map((spd) => (
              <Pressable
                key={spd}
                onPress={() => setSpeed(spd)}
                style={[studioStyles.speedBtn, speed === spd && studioStyles.speedBtnActive]}
              >
                <Text style={[studioStyles.speedBtnText, speed === spd && studioStyles.speedBtnTextActive]}>
                  {spd}x
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Live Biomechanical Telemetry Cards */}
        {showHud && (
          <View style={studioStyles.telemetryBar}>
            <View style={studioStyles.telemetryGrid}>
              {telemetry.kneeAngle !== undefined && (
                <View style={studioStyles.telemetryCard}>
                  <Text style={studioStyles.telemetryMetricLabel}>KNEE ANGLE</Text>
                  <View style={studioStyles.telemetryValueRow}>
                    <Text
                      style={[
                        studioStyles.telemetryMetricValue,
                        telemetry.isParallelReached && studioStyles.telemetrySuccess,
                      ]}
                    >
                      {telemetry.kneeAngle}°
                    </Text>
                    {telemetry.isParallelReached && (
                      <View style={studioStyles.successBadge}>
                        <Text style={studioStyles.successBadgeText}>PARALLEL ✓</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {telemetry.hipAngle !== undefined && (
                <View style={studioStyles.telemetryCard}>
                  <Text style={studioStyles.telemetryMetricLabel}>HIP HINGE</Text>
                  <Text style={studioStyles.telemetryMetricValue}>{telemetry.hipAngle}°</Text>
                </View>
              )}

              {telemetry.elbowAngle !== undefined && (
                <View style={studioStyles.telemetryCard}>
                  <Text style={studioStyles.telemetryMetricLabel}>ELBOW EXT</Text>
                  <Text style={studioStyles.telemetryMetricValue}>{telemetry.elbowAngle}°</Text>
                </View>
              )}

              {telemetry.torsoAngle !== undefined && (
                <View style={studioStyles.telemetryCard}>
                  <Text style={studioStyles.telemetryMetricLabel}>TORSO</Text>
                  <Text style={studioStyles.telemetryMetricValue}>{telemetry.torsoAngle}°</Text>
                </View>
              )}

              {telemetry.abductionAngle !== undefined && (
                <View style={studioStyles.telemetryCard}>
                  <Text style={studioStyles.telemetryMetricLabel}>ABDUCTION</Text>
                  <Text style={studioStyles.telemetryMetricValue}>{telemetry.abductionAngle}°</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

const studioStyles = StyleSheet.create({
  container: {
    marginBottom: space.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    backgroundColor: '#090A0D',
  },
  viewport: {
    width: '100%',
    aspectRatio: 1.15,
    backgroundColor: '#090A0D',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(9, 10, 13, 0.85)',
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    gap: 6,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontFamily: font.figure,
    fontSize: 9,
    letterSpacing: 0.8,
    color: loud.figure,
  },
  hudPill: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    backgroundColor: 'rgba(9, 10, 13, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  hudPillActive: {
    borderColor: '#00E5FF',
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
  },
  hudPillText: {
    fontFamily: font.display,
    fontSize: 8.5,
    letterSpacing: 0.6,
    color: loud.figureFaint,
  },
  hudPillTextActive: {
    color: '#00E5FF',
    fontWeight: '700',
  },
  engineBadge: {
    position: 'absolute',
    bottom: space.sm,
    right: space.sm,
    backgroundColor: 'rgba(9, 10, 13, 0.75)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  engineBadgeText: {
    fontFamily: font.figure,
    fontSize: 8,
    letterSpacing: 0.6,
    color: loud.figureFaint,
  },
  controls: {
    padding: space.sm,
    backgroundColor: loud.panel,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: loud.rule,
    gap: space.xs,
  },
  scrubberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  scrubEdge: {
    fontFamily: font.figure,
    fontSize: 9,
    color: loud.figureFaint,
    width: 42,
  },
  nativeTrack: {
    flex: 1,
    height: 6,
    backgroundColor: loud.ground,
    borderRadius: 3,
    overflow: 'hidden',
  },
  nativeFill: {
    height: '100%',
    backgroundColor: loud.loud,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  actionGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: loud.ground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  actionBtnActive: {
    backgroundColor: loud.loud,
    borderColor: loud.loud,
  },
  actionBtnText: {
    fontFamily: font.display,
    fontSize: 9,
    letterSpacing: 0.6,
    color: loud.figureMuted,
  },
  actionBtnTextActive: {
    color: loud.onLoud,
    fontWeight: '700',
  },
  speedBtn: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: loud.ground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  speedBtnActive: {
    borderColor: loud.loud,
  },
  speedBtnText: {
    fontFamily: font.figure,
    fontSize: 9,
    color: loud.figureFaint,
  },
  speedBtnTextActive: {
    color: loud.loud,
    fontWeight: '700',
  },
  telemetryBar: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: loud.rule,
  },
  telemetryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  telemetryCard: {
    flex: 1,
    minWidth: 80,
    backgroundColor: 'rgba(9, 10, 13, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  telemetryMetricLabel: {
    fontFamily: font.display,
    fontSize: 7.5,
    letterSpacing: 0.7,
    color: loud.figureFaint,
    marginBottom: 2,
  },
  telemetryValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  telemetryMetricValue: {
    fontFamily: font.figure,
    fontSize: 13,
    fontWeight: '700',
    color: '#00E5FF',
  },
  telemetrySuccess: {
    color: '#10B981',
  },
  successBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#10B981',
  },
  successBadgeText: {
    fontFamily: font.display,
    fontSize: 7,
    color: '#10B981',
    fontWeight: '700',
  },
});
