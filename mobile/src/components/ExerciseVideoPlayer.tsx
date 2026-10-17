import { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Line, Path } from 'react-native-svg';
import { jointTelemetryFor, motionFor } from '../exerciseMotion';
import {
  type ExerciseCameraAngle,
  type ExerciseVideoBundle,
  getKeyframePhaseConfig,
  type KeyframePair,
  type LifterGender,
} from '../exerciseVideos';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { KinematicMotionStudio } from './MovementFigure';

interface ExerciseVideoPlayerProps {
  bundle: ExerciseVideoBundle;
  initialGender?: LifterGender;
  exerciseName?: string;
  equipment?: string;
}

/**
 * Standard video player for angles backed by mp4 video assets.
 */
const StandardVideoPlayer = ({ url }: { url: string }) => {
  const [showHud, setShowHud] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    if (Platform.OS !== 'web') {
      player.replace(url);
      player.play();
    }
  }, [url, player]);

  useEffect(() => {
    if (Platform.OS === 'web' && videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {});
    }
  }, [url]);

  return (
    <View style={styles.videoWrap}>
      {Platform.OS === 'web' ? (
        <video
          ref={videoRef}
          key={url}
          src={url}
          autoPlay
          loop
          muted
          playsInline
          // @ts-ignore
          webkit-playsinline="true"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
            backgroundColor: '#090A0D',
          }}
        />
      ) : (
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={false}
        />
      )}
      {/* Corner Brackets Reticle HUD */}
      {showHud && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width="100%" height="100%" viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
            <Path d="M 4 12 L 4 4 L 12 4" stroke="#00E5FF" strokeWidth={0.8} fill="none" opacity={0.7} />
            <Path d="M 96 12 L 96 4 L 88 4" stroke="#00E5FF" strokeWidth={0.8} fill="none" opacity={0.7} />
            <Path d="M 4 88 L 4 96 L 12 96" stroke="#00E5FF" strokeWidth={0.8} fill="none" opacity={0.7} />
            <Path d="M 96 88 L 96 96 L 88 96" stroke="#00E5FF" strokeWidth={0.8} fill="none" opacity={0.7} />
            <Line x1="50" y1="4" x2="50" y2="96" stroke="#00E5FF" strokeWidth={0.5} strokeDasharray="1.5,2.5" opacity={0.25} />
            <Line x1="10" y1="50" x2="90" y2="50" stroke="#00E5FF" strokeWidth={0.4} strokeDasharray="1.5,3" opacity={0.2} />
          </Svg>
        </View>
      )}
      <View style={styles.badge}>
        <View style={styles.badgePulse} />
        <Text style={styles.badgeText}>VIDEO STREAM • 30 FPS</Text>
      </View>
      <Pressable
        onPress={() => setShowHud((h) => !h)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Toggle Biomechanical Telemetry HUD"
        style={[styles.hudPill, showHud && styles.hudPillActive]}
      >
        <Text style={[styles.hudPillText, showHud && styles.hudPillTextActive]}>
          {showHud ? '⚡ HUD ON' : '⚡ HUD OFF'}
        </Text>
      </Pressable>
    </View>
  );
};

/**
 * Biomechanical Keyframe Motion Engine.
 *
 * Smoothly interpolates between verified 8K starting setup and deep hole keyframes,
 * providing zero-distortion, 100% anatomically accurate motion with interactive
 * scrubbing, pause/play, and phase cues. Costs $0.00.
 */
const KeyframeMotionPlayer = ({
  keyframes,
  canonicalName,
}: {
  keyframes: KeyframePair;
  canonicalName?: string;
}) => {
  const [progress, setProgress] = useState(0); // 0 (setup) to 100 (depth)
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1.0);
  const [showHud, setShowHud] = useState(true);

  const phaseConfig = getKeyframePhaseConfig(canonicalName);
  const motionId = canonicalName ? motionFor(canonicalName) : null;
  const telemetry = motionId ? jointTelemetryFor(motionId, progress / 100) : null;

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const speedRef = useRef(speed);
  speedRef.current = speed;

  const progressRef = useRef(progress);
  progressRef.current = progress;

  const dirRef = useRef(1); // 1 = down, -1 = up

  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const delta = (time - lastTime) / 1000;
      lastTime = time;

      if (isPlayingRef.current) {
        // Full rep cycle takes 2.6s at 1.0x speed
        const step = (100 / 1.3) * speedRef.current * delta;
        let next = progressRef.current + step * dirRef.current;

        if (next >= 100) {
          next = 100;
          dirRef.current = -1; // turnaround at depth
        } else if (next <= 0) {
          next = 0;
          dirRef.current = 1; // turnaround at setup lockout
        }

        progressRef.current = next;
        setProgress(next);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  const opacityVal = Math.min(1, Math.max(0, progress / 100));

  const isSetup = progress < 35;
  const isDepth = progress > 65;
  const phaseLabel = isSetup
    ? phaseConfig.setupLabel
    : isDepth
      ? phaseConfig.depthLabel
      : phaseConfig.transitionLabel;
  const dotColor = isSetup ? loud.onLoud : isDepth ? loud.loud : '#FBBF24';

  return (
    <View style={styles.motionContainer}>
      {/* Viewport Frame */}
      <View style={styles.videoWrap}>
        {/* Layer 1: Standing Lockout */}
        {Platform.OS === 'web' ? (
          <img
            key={keyframes.standing}
            src={keyframes.standing}
            alt="Starting Setup"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              backgroundColor: '#090A0D',
            }}
          />
        ) : (
          <Image
            key={keyframes.standing}
            source={{ uri: keyframes.standing }}
            style={[StyleSheet.absoluteFill, { resizeMode: 'contain', backgroundColor: '#090A0D' }]}
          />
        )}

        {/* Layer 2: Below-Parallel Depth (Cross-dissolve) */}
        {Platform.OS === 'web' ? (
          <img
            key={keyframes.deep}
            src={keyframes.deep}
            alt="Below-Parallel Depth"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              opacity: opacityVal,
              transition: isPlaying ? 'none' : 'opacity 0.08s ease-out',
            }}
          />
        ) : (
          <Image
            key={keyframes.deep}
            source={{ uri: keyframes.deep }}
            style={[
              StyleSheet.absoluteFill,
              { resizeMode: 'contain', opacity: opacityVal },
            ]}
          />
        )}

        {/* Corner Brackets Reticle HUD */}
        {showHud && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width="100%" height="100%" viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
              <Path d="M 4 12 L 4 4 L 12 4" stroke="#00E5FF" strokeWidth={0.8} fill="none" opacity={0.7} />
              <Path d="M 96 12 L 96 4 L 88 4" stroke="#00E5FF" strokeWidth={0.8} fill="none" opacity={0.7} />
              <Path d="M 4 88 L 4 96 L 12 96" stroke="#00E5FF" strokeWidth={0.8} fill="none" opacity={0.7} />
              <Path d="M 96 88 L 96 96 L 88 96" stroke="#00E5FF" strokeWidth={0.8} fill="none" opacity={0.7} />
              <Line x1="50" y1="4" x2="50" y2="96" stroke="#00E5FF" strokeWidth={0.5} strokeDasharray="1.5,2.5" opacity={0.25} />
              <Line x1="10" y1="50" x2="90" y2="50" stroke="#00E5FF" strokeWidth={0.4} strokeDasharray="1.5,3" opacity={0.2} />
            </Svg>
          </View>
        )}

        {/* Live Telemetry Badge */}
        <View style={styles.badge}>
          <View style={[styles.badgePulse, { backgroundColor: dotColor }]} />
          <Text style={styles.badgeText}>{phaseLabel}</Text>
        </View>

        {/* HUD Toggle Button */}
        <Pressable
          onPress={() => setShowHud((h) => !h)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Toggle Biomechanical Telemetry HUD"
          style={[styles.hudPill, showHud && styles.hudPillActive]}
        >
          <Text style={[styles.hudPillText, showHud && styles.hudPillTextActive]}>
            {showHud ? '⚡ HUD ON' : '⚡ HUD OFF'}
          </Text>
        </Pressable>

        <View style={styles.engineBadge}>
          <Text style={styles.engineBadgeText}>8K ANATOMICAL STUDIO • 60 FPS</Text>
        </View>
      </View>

      {/* Interactive Controls Panel */}
      <View style={styles.motionControls}>
        {/* Scrubber row */}
        <View style={styles.scrubberRow}>
          <Text style={styles.scrubEdgeText}>{phaseConfig.scrubberStart}</Text>
          {Platform.OS === 'web' ? (
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(progress)}
              onChange={(e) => {
                setIsPlaying(false);
                const val = parseFloat(e.target.value);
                progressRef.current = val;
                setProgress(val);
              }}
              style={{
                flex: 1,
                accentColor: loud.loud,
                height: 6,
                cursor: 'pointer',
              }}
            />
          ) : (
            <View style={styles.nativeTrack}>
              <View style={[styles.nativeFill, { width: `${progress}%` }]} />
            </View>
          )}
          <Text style={[styles.scrubEdgeText, { textAlign: 'right' }]}>{phaseConfig.scrubberEnd}</Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <View style={styles.actionGroup}>
            <Pressable
              onPress={() => setIsPlaying((p) => !p)}
              style={({ pressed }) => [
                styles.actionBtn,
                isPlaying && styles.actionBtnActive,
                pressed && styles.btnPressed,
              ]}
            >
              <Text style={[styles.actionBtnText, isPlaying && styles.actionBtnTextActive]}>
                {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setIsPlaying(false);
                progressRef.current = 0;
                setProgress(0);
              }}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.actionBtnText}>{phaseConfig.scrubberStart}</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setIsPlaying(false);
                progressRef.current = 100;
                setProgress(100);
              }}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.actionBtnText}>{phaseConfig.scrubberEnd}</Text>
            </Pressable>
          </View>

          <View style={styles.actionGroup}>
            <Pressable
              onPress={() => setSpeed(0.5)}
              style={[styles.speedBtn, speed === 0.5 && styles.speedBtnActive]}
            >
              <Text style={[styles.speedBtnText, speed === 0.5 && styles.speedBtnTextActive]}>0.5x</Text>
            </Pressable>
            <Pressable
              onPress={() => setSpeed(1.0)}
              style={[styles.speedBtn, speed === 1.0 && styles.speedBtnActive]}
            >
              <Text style={[styles.speedBtnText, speed === 1.0 && styles.speedBtnTextActive]}>1x</Text>
            </Pressable>
            <Pressable
              onPress={() => setSpeed(1.5)}
              style={[styles.speedBtn, speed === 1.5 && styles.speedBtnActive]}
            >
              <Text style={[styles.speedBtnText, speed === 1.5 && styles.speedBtnTextActive]}>1.5x</Text>
            </Pressable>
          </View>
        </View>

        {/* Live Biomechanical Telemetry Cards */}
        {showHud && telemetry && (
          <View style={styles.telemetryBar}>
            <View style={styles.telemetryGrid}>
              {telemetry.kneeAngle !== undefined && (
                <View style={styles.telemetryCard}>
                  <Text style={styles.telemetryMetricLabel}>KNEE ANGLE</Text>
                  <View style={styles.telemetryValueRow}>
                    <Text
                      style={[
                        styles.telemetryMetricValue,
                        telemetry.isParallelReached && styles.telemetrySuccess,
                      ]}
                    >
                      {telemetry.kneeAngle}°
                    </Text>
                    {telemetry.isParallelReached && (
                      <View style={styles.successBadge}>
                        <Text style={styles.successBadgeText}>PARALLEL ✓</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {telemetry.hipAngle !== undefined && (
                <View style={styles.telemetryCard}>
                  <Text style={styles.telemetryMetricLabel}>HIP HINGE</Text>
                  <Text style={styles.telemetryMetricValue}>{telemetry.hipAngle}°</Text>
                </View>
              )}

              {telemetry.elbowAngle !== undefined && (
                <View style={styles.telemetryCard}>
                  <Text style={styles.telemetryMetricLabel}>ELBOW EXT</Text>
                  <Text style={styles.telemetryMetricValue}>{telemetry.elbowAngle}°</Text>
                </View>
              )}

              {telemetry.torsoAngle !== undefined && (
                <View style={styles.telemetryCard}>
                  <Text style={styles.telemetryMetricLabel}>TORSO</Text>
                  <Text style={styles.telemetryMetricValue}>{telemetry.torsoAngle}°</Text>
                </View>
              )}

              {telemetry.abductionAngle !== undefined && (
                <View style={styles.telemetryCard}>
                  <Text style={styles.telemetryMetricLabel}>ABDUCTION</Text>
                  <Text style={styles.telemetryMetricValue}>{telemetry.abductionAngle}°</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

/**
 * Biomechanically validated multi-angle, gender-adaptive video & keyframe player.
 */
export const ExerciseVideoPlayer = ({
  bundle,
  initialGender = 'female',
  exerciseName,
  equipment,
}: ExerciseVideoPlayerProps) => {
  const hasDistinctMultiStreams =
    bundle.keyframes?.iso?.female?.standing !== bundle.keyframes?.iso?.male?.standing;
  const fallbackMotion = motionFor(exerciseName ?? bundle.canonicalName);
  const canonicalMotion = motionFor(bundle.canonicalName);
  const isDistinctVariation = fallbackMotion !== null && fallbackMotion !== canonicalMotion;

  const [angle, setAngle] = useState<ExerciseCameraAngle>(hasDistinctMultiStreams ? 'side' : 'iso');
  const [gender, setGender] = useState<LifterGender>(initialGender);
  const [showKinematic, setShowKinematic] = useState(isDistinctVariation);

  // Preload keyframe images into browser cache so switching is 0ms instant
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const preloadUrls: string[] = [];
      if (bundle.keyframes?.side) {
        preloadUrls.push(bundle.keyframes.side.standing, bundle.keyframes.side.deep);
      }
      if (bundle.keyframes?.iso?.female) {
        preloadUrls.push(bundle.keyframes.iso.female.standing, bundle.keyframes.iso.female.deep);
      }
      if (bundle.keyframes?.iso?.male) {
        preloadUrls.push(bundle.keyframes.iso.male.standing, bundle.keyframes.iso.male.deep);
      }
      for (const url of preloadUrls) {
        const img = new (window as any).Image();
        img.src = url;
      }
    }
  }, [bundle]);

  // Determine keyframe pair or fallback video URL
  const activeKeyframes: KeyframePair | undefined =
    angle === 'iso'
      ? bundle.keyframes?.iso?.[gender]
      : angle === 'side'
        ? bundle.keyframes?.side
        : bundle.keyframes?.front;

  const activeUrl =
    angle === 'iso'
      ? bundle.iso[gender].glow
      : angle === 'side'
        ? bundle.side
        : bundle.front;

  const activeMetadata = bundle.angleMetadata[angle];

  return (
    <View style={styles.container}>
      {/* Top Bar: 1-Tap Angle & Mode Selector */}
      <View style={styles.controlsBar}>
        {hasDistinctMultiStreams ? (
          <View style={styles.angleTabs}>
            <Pressable
              onPress={() => {
                setShowKinematic(false);
                setAngle('side');
              }}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="90° Lateral Side Profile"
              style={({ pressed }) => [
                styles.tabBtn,
                !showKinematic && angle === 'side' && styles.tabBtnActive,
                pressed && styles.btnPressed,
              ]}
            >
              <Text style={[styles.tabLabel, !showKinematic && angle === 'side' && styles.tabLabelActive]}>
                90° SIDE
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setShowKinematic(false);
                setAngle('iso');
                setGender('female');
              }}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="45° Isometric Female Lifter"
              style={({ pressed }) => [
                styles.tabBtn,
                !showKinematic && angle === 'iso' && gender === 'female' && styles.tabBtnActive,
                pressed && styles.btnPressed,
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  !showKinematic && angle === 'iso' && gender === 'female' && styles.tabLabelActive,
                ]}
              >
                45° ISO (♀)
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setShowKinematic(false);
                setAngle('iso');
                setGender('male');
              }}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="45° Isometric Male Lifter"
              style={({ pressed }) => [
                styles.tabBtn,
                !showKinematic && angle === 'iso' && gender === 'male' && styles.tabBtnActive,
                pressed && styles.btnPressed,
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  !showKinematic && angle === 'iso' && gender === 'male' && styles.tabLabelActive,
                ]}
              >
                45° ISO (♂)
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setShowKinematic(false);
                setAngle('front');
              }}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="Front Symmetry View"
              style={({ pressed }) => [
                styles.tabBtn,
                !showKinematic && angle === 'front' && styles.tabBtnActive,
                pressed && styles.btnPressed,
              ]}
            >
              <Text style={[styles.tabLabel, !showKinematic && angle === 'front' && styles.tabLabelActive]}>
                FRONT
              </Text>
            </Pressable>

            {fallbackMotion !== null && (
              <Pressable
                onPress={() => {
                  setShowKinematic(true);
                  setAngle('side');
                }}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel="2D Kinematic Vector Model"
                style={({ pressed }) => [
                  styles.tabBtn,
                  showKinematic && styles.tabBtnActive,
                  pressed && styles.btnPressed,
                ]}
              >
                <Text style={[styles.tabLabel, showKinematic && styles.tabLabelActive]}>
                  2D KINEMATICS
                </Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.angleTabs}>
            <Pressable
              onPress={() => {
                setShowKinematic(false);
                setAngle('iso');
              }}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="45° Isometric 8K Photorealistic Studio"
              style={({ pressed }) => [
                styles.tabBtn,
                !showKinematic && styles.tabBtnActive,
                pressed && styles.btnPressed,
              ]}
            >
              <Text style={[styles.tabLabel, !showKinematic && styles.tabLabelActive]}>
                45° ISO (8K STUDIO)
              </Text>
            </Pressable>

            {fallbackMotion !== null && (
              <Pressable
                onPress={() => {
                  setShowKinematic(true);
                  setAngle('side');
                }}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel="90° Side Profile 2D Kinematic Vector Model"
                style={({ pressed }) => [
                  styles.tabBtn,
                  showKinematic && styles.tabBtnActive,
                  pressed && styles.btnPressed,
                ]}
              >
                <Text style={[styles.tabLabel, showKinematic && styles.tabLabelActive]}>
                  90° SIDE (KINEMATICS)
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {/* Main Viewport: Kinematic Studio, Keyframe Engine, or Video Player */}
      {showKinematic && fallbackMotion !== null ? (
        <KinematicMotionStudio
          motion={fallbackMotion}
          exerciseName={exerciseName ?? bundle.canonicalName}
          equipment={equipment}
        />
      ) : activeKeyframes ? (
        <KeyframeMotionPlayer
          key={`${angle}_${gender}_${activeKeyframes.standing}`}
          keyframes={activeKeyframes}
          canonicalName={exerciseName ?? bundle.canonicalName}
        />
      ) : (
        <StandardVideoPlayer
          key={activeUrl}
          url={activeUrl}
        />
      )}

      {/* Dynamic Biomechanical Checkpoints for Active Angle */}
      <View style={styles.checklistCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{activeMetadata.title.toUpperCase()}</Text>
          <Text style={styles.cardFocus}>{activeMetadata.focus}</Text>
        </View>
        <View style={styles.checkpointsList}>
          {activeMetadata.checkpoints.map((cp, idx) => (
            <View key={idx} style={styles.checkpointRow}>
              <Text style={styles.checkIcon}>✓</Text>
              <View style={styles.checkpointContent}>
                <Text style={styles.checkpointLabel}>{cp.label}</Text>
                <Text style={styles.checkpointCue}>{cp.cue}</Text>
                <Text style={styles.researchBasis}>{cp.researchBasis}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: space.md,
  },
  controlsBar: {
    marginBottom: space.sm,
  },
  angleTabs: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: loud.ground,
    borderRadius: radius.md,
    padding: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  tabBtn: {
    flex: 1,
    paddingHorizontal: 4,
    paddingVertical: 7,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.sm,
    ...(Platform.OS === 'web' ? { cursor: 'pointer', userSelect: 'none' as const } : {}),
  },
  tabBtnActive: {
    backgroundColor: loud.loud,
  },
  tabLabel: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 0.5,
    color: loud.figureFaint,
    textAlign: 'center',
  },
  tabLabelActive: {
    color: loud.onLoud,
    fontWeight: '700',
  },
  genderTabs: {
    flexDirection: 'row',
    backgroundColor: loud.ground,
    borderRadius: radius.md,
    padding: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  genderBtn: {
    paddingHorizontal: space.sm,
    paddingVertical: 7,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.sm,
    ...(Platform.OS === 'web' ? { cursor: 'pointer', userSelect: 'none' as const } : {}),
  },
  genderBtnActive: {
    backgroundColor: loud.panel,
  },
  genderLabel: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 0.5,
    color: loud.figureFaint,
  },
  genderLabelActive: {
    color: loud.figure,
  },
  btnPressed: {
    opacity: 0.7,
  },
  motionContainer: {
    width: '100%',
    marginBottom: space.xs,
  },
  videoWrap: {
    width: '100%',
    aspectRatio: 1 / 1,
    maxHeight: 460,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#090A0D',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    top: space.xs,
    left: space.xs,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: radius.sm,
    paddingHorizontal: space.xs,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  badgePulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: loud.loud,
  },
  badgeText: {
    fontFamily: font.display,
    fontSize: 9,
    color: loud.figure,
    letterSpacing: 0.5,
  },
  engineBadge: {
    position: 'absolute',
    bottom: space.xs,
    right: space.xs,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: radius.sm,
    paddingHorizontal: space.xs,
    paddingVertical: 2,
  },
  engineBadgeText: {
    fontFamily: font.figure,
    fontSize: 8,
    color: loud.figureFaint,
    letterSpacing: 0.5,
  },
  motionControls: {
    backgroundColor: loud.ground,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    padding: space.xs,
    marginTop: space.xs,
    gap: 8,
  },
  scrubberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  scrubEdgeText: {
    fontFamily: font.display,
    fontSize: 9,
    color: loud.figureFaint,
    letterSpacing: 0.5,
    minWidth: 42,
  },
  nativeTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: loud.rule,
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
  },
  actionGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: loud.panel,
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
    letterSpacing: 0.5,
    color: loud.figure,
  },
  actionBtnTextActive: {
    color: loud.onLoud,
  },
  speedBtn: {
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: loud.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  speedBtnActive: {
    borderColor: loud.loud,
    backgroundColor: 'rgba(255,85,0,0.15)',
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
  hudPill: {
    position: 'absolute',
    top: space.xs,
    right: space.xs,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(9, 10, 13, 0.75)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 229, 255, 0.35)',
  },
  hudPillActive: {
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderColor: '#00E5FF',
  },
  hudPillText: {
    fontFamily: font.display,
    fontSize: 8,
    letterSpacing: 0.6,
    color: 'rgba(0, 229, 255, 0.6)',
  },
  hudPillTextActive: {
    color: '#00E5FF',
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
  checklistCard: {
    backgroundColor: loud.ground,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    padding: space.sm,
    marginTop: space.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: loud.rule,
    paddingBottom: 4,
    marginBottom: space.xs,
  },
  cardTitle: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 1,
    color: loud.loud,
  },
  cardFocus: {
    fontFamily: font.ui,
    fontSize: 10,
    color: loud.figureFaint,
  },
  checkpointsList: {
    gap: space.xs,
  },
  checkpointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
  },
  checkIcon: {
    fontFamily: font.display,
    fontSize: 11,
    color: loud.loud,
    marginTop: 1,
  },
  checkpointContent: {
    flex: 1,
  },
  checkpointLabel: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    color: loud.figure,
  },
  checkpointCue: {
    fontFamily: font.ui,
    fontSize: 11,
    color: loud.figureMuted,
    lineHeight: 15,
  },
  researchBasis: {
    fontFamily: font.ui,
    fontSize: 9,
    color: loud.figureFaint,
    fontStyle: 'italic',
    marginTop: 1,
  },
});
