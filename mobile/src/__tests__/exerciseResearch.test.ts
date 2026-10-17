import { describe, expect, it } from 'vitest';
import { RAW_BUILTIN_CATALOGUE } from '../builtinCatalogue';
import { researchProfileFor, RESEARCH_CITATIONS } from '../exerciseResearch';
import { MOTIONS, jointTelemetryFor, type MotionId } from '../exerciseMotion';

describe('exerciseResearch module', () => {
  it('every canonical catalogue exercise resolves to a complete research profile', () => {
    for (const entry of RAW_BUILTIN_CATALOGUE) {
      const profile = researchProfileFor(entry.canonicalName, entry.movementPattern);
      expect(profile).toBeDefined();
      expect(profile.canonicalName).toBeTruthy();
      expect(profile.movementFamily).toBeTruthy();

      // Breathing protocol validation
      expect(['valsalva', 'rhythmic']).toContain(profile.breathing.method);
      expect(profile.breathing.instruction.length).toBeGreaterThan(15);
      expect(profile.breathing.biomechanicalRationale.length).toBeGreaterThan(15);
      expect(profile.breathing.citation.length).toBeGreaterThan(5);

      // Meta-analyses validation
      expect(profile.metaAnalyses.length).toBeGreaterThan(0);
      for (const meta of profile.metaAnalyses) {
        expect(meta.citation).toBeTruthy();
        expect(meta.year).toBeGreaterThanOrEqual(1980);
        expect(meta.journal).toBeTruthy();
        expect(meta.keyFinding.length).toBeGreaterThan(20);
        expect(meta.practicalTakeaway.length).toBeGreaterThan(20);
      }

      // Diagnostics validation
      expect(profile.diagnostics.length).toBeGreaterThan(0);
      for (const diag of profile.diagnostics) {
        expect(diag.key).toBeTruthy();
        expect(diag.title).toBeTruthy();
        expect(diag.biomechanicalStandard).toBeTruthy();
        expect(diag.commonMistake).toBeTruthy();
        expect(diag.biomechanicalFlawOrRisk).toBeTruthy();
        expect(diag.evidenceBasedFix).toBeTruthy();
        expect(diag.evidence.citation).toBeTruthy();
      }
    }
  });

  it('contains verified peer-reviewed meta-analyses', () => {
    expect(RESEARCH_CITATIONS.wolf2023.journal).toBe('Sports Medicine');
    expect(RESEARCH_CITATIONS.wolf2023.year).toBe(2023);
    expect(RESEARCH_CITATIONS.schoenfeld2020Rom.journal).toBe(
      'Journal of Strength and Conditioning Research',
    );
    expect(RESEARCH_CITATIONS.hartmann2013Squats.journal).toBe('Sports Medicine');
    expect(RESEARCH_CITATIONS.mcgill2007Spine.citation).toContain('McGill');
    expect(RESEARCH_CITATIONS.mclaughlin1984Bench.citation).toContain('McLaughlin');
  });
});

describe('jointTelemetryFor engine', () => {
  it('computes valid joint angles and bar path for every motion in the catalogue', () => {
    const allMotionIds = Object.keys(MOTIONS) as MotionId[];

    for (const motionId of allMotionIds) {
      for (const progress of [0, 0.25, 0.5, 0.75, 1.0]) {
        const telemetry = jointTelemetryFor(motionId, progress);
        expect(telemetry).toBeDefined();
        expect(['side', 'front']).toContain(telemetry.view);
        expect(telemetry.phaseLabel).toBeTruthy();

        if (telemetry.view === 'side') {
          if (telemetry.kneeAngle !== undefined) {
            expect(Number.isFinite(telemetry.kneeAngle)).toBe(true);
            expect(telemetry.kneeAngle).toBeGreaterThanOrEqual(0);
            expect(telemetry.kneeAngle).toBeLessThanOrEqual(180);
          }
          if (telemetry.hipAngle !== undefined) {
            expect(Number.isFinite(telemetry.hipAngle)).toBe(true);
            expect(telemetry.hipAngle).toBeGreaterThanOrEqual(0);
            expect(telemetry.hipAngle).toBeLessThanOrEqual(180);
          }
          if (telemetry.elbowAngle !== undefined) {
            expect(Number.isFinite(telemetry.elbowAngle)).toBe(true);
            expect(telemetry.elbowAngle).toBeGreaterThanOrEqual(0);
            expect(telemetry.elbowAngle).toBeLessThanOrEqual(180);
          }
          if (telemetry.torsoAngle !== undefined) {
            expect(Number.isFinite(telemetry.torsoAngle)).toBe(true);
          }
          if (telemetry.barTrajectory !== undefined) {
            expect(telemetry.barTrajectory.length).toBe(21);
            for (const pt of telemetry.barTrajectory) {
              expect(Number.isFinite(pt[0])).toBe(true);
              expect(Number.isFinite(pt[1])).toBe(true);
            }
          }
          if (telemetry.barCurrent !== undefined) {
            expect(Number.isFinite(telemetry.barCurrent[0])).toBe(true);
            expect(Number.isFinite(telemetry.barCurrent[1])).toBe(true);
          }
        } else {
          expect(telemetry.abductionAngle).toBeDefined();
          expect(Number.isFinite(telemetry.abductionAngle)).toBe(true);
        }
      }
    }
  });

  it('detects parallel depth accurately on squats', () => {
    // At bottom of squat (progress = 1.0 or deep hole), knee angle should be <= 92°
    const deepSquat = jointTelemetryFor('squat', 1.0);
    expect(deepSquat.kneeAngle).toBeDefined();
    expect(deepSquat.kneeAngle).toBeLessThanOrEqual(92);
    expect(deepSquat.isParallelReached).toBe(true);

    // At top of squat (progress = 0.0 standing), knee angle should be near 180°
    const topSquat = jointTelemetryFor('squat', 0.0);
    expect(topSquat.kneeAngle).toBeDefined();
    expect(topSquat.kneeAngle).toBeGreaterThan(160);
    expect(topSquat.isParallelReached).toBe(false);
  });
});
