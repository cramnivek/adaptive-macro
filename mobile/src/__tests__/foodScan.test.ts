import { describe, expect, it } from 'vitest';
import { scanPhaseOf } from '../ai/foodScan';

describe('scanPhaseOf: honest stages of image estimation', () => {
  it('begins by scanning the plate', () => {
    expect(scanPhaseOf(0)).toEqual({ label: 'Scanning plate…', code: 'SCANNING' });
    expect(scanPhaseOf(1)).toEqual({ label: 'Scanning plate…', code: 'SCANNING' });
  });

  it('moves to identifying foods', () => {
    expect(scanPhaseOf(2)).toEqual({ label: 'Identifying foods…', code: 'IDENTIFYING' });
    expect(scanPhaseOf(4)).toEqual({ label: 'Identifying foods…', code: 'IDENTIFYING' });
  });

  it('moves to estimating portions', () => {
    expect(scanPhaseOf(5)).toEqual({ label: 'Estimating portions…', code: 'PORTIONING' });
    expect(scanPhaseOf(8)).toEqual({ label: 'Estimating portions…', code: 'PORTIONING' });
  });

  it('settles on inferring macros for longer runs', () => {
    expect(scanPhaseOf(9)).toEqual({ label: 'Inferring macros…', code: 'ANALYZING' });
    expect(scanPhaseOf(25)).toEqual({ label: 'Inferring macros…', code: 'ANALYZING' });
  });

  it('clamps negative values to zero', () => {
    expect(scanPhaseOf(-5)).toEqual({ label: 'Scanning plate…', code: 'SCANNING' });
  });
});
