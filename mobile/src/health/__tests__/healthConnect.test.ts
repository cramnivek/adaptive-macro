import { beforeEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({
  initialize: vi.fn(), getGrantedPermissions: vi.fn(), readRecords: vi.fn(), aggregateGroupByPeriod: vi.fn(),
  requestPermission: vi.fn(), getSdkStatus: vi.fn(),
}));
const account = vi.hoisted(() => ({ current: { owner: 'alice' } }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('react-native-health-connect', () => ({ ...native, SdkAvailabilityStatus: { SDK_AVAILABLE: 3 } }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {} } }));
vi.mock('../../db', () => ({ getDb: async () => account.current, bulkSaveDailySteps: vi.fn(), listWeights: async () => [], saveWeight: vi.fn() }));
vi.mock('../../db/stepQueries', () => ({ getDailyStepsBetween: async () => [] }));
vi.mock('../../db/sleepQueries', () => ({ saveSleepSessions: vi.fn() }));
import { syncHealthConnect, healthConnectState } from '../healthConnect';
import { saveSleepSessions } from '../../db/sleepQueries';

beforeEach(() => {
  vi.clearAllMocks();
  native.getSdkStatus.mockResolvedValue(3);
  native.aggregateGroupByPeriod.mockResolvedValue([]);
  native.readRecords.mockResolvedValue({ records: [] });
  account.current = { owner: 'alice' };
});
describe('optional Health Connect reads', () => {
  it('keeps steps useful when weight and sleep are refused', async () => {
    native.getGrantedPermissions.mockResolvedValue([{ accessType: 'read', recordType: 'Steps' }]);
    await syncHealthConnect();
    expect(native.aggregateGroupByPeriod).toHaveBeenCalledOnce();
    expect(native.readRecords).not.toHaveBeenCalled();
  });
  it('reads sleep alone when it is the only granted record type', async () => {
    native.getGrantedPermissions.mockResolvedValue([{ accessType: 'read', recordType: 'SleepSession' }]);
    expect(await healthConnectState()).toBe('connected');
    await syncHealthConnect();
    expect(native.aggregateGroupByPeriod).not.toHaveBeenCalled();
    expect(native.readRecords).toHaveBeenCalledWith('SleepSession', expect.anything());
    expect(saveSleepSessions).toHaveBeenCalledWith([], account.current, expect.objectContaining({ start: expect.any(Number), end: expect.any(Number) }));
  });
  it('binds sleep to the database selected before the native read starts', async () => {
    native.getGrantedPermissions.mockResolvedValue([{ accessType: 'read', recordType: 'SleepSession' }]);
    const original = account.current;
    native.readRecords.mockImplementation(async () => {
      account.current = { owner: 'bob' };
      return { records: [] };
    });
    await syncHealthConnect();
    expect(saveSleepSessions).toHaveBeenCalledWith([], original, expect.objectContaining({ start: expect.any(Number), end: expect.any(Number) }));
  });
  it('bounds sleep reads to the recent month instead of re-reading five years of stages', async () => {
    native.getGrantedPermissions.mockResolvedValue([{ accessType: 'read', recordType: 'SleepSession' }]);
    await syncHealthConnect(new Date('2026-10-22T00:00:00.000Z'));
    expect(native.readRecords).toHaveBeenCalledWith('SleepSession', {
      timeRangeFilter: { operator: 'between', startTime: '2026-09-22T00:00:00.000Z', endTime: '2026-10-22T00:00:00.000Z' },
      pageSize: 1000, pageToken: undefined,
    });
  });
  it('keeps the cached snapshot when the native read fails', async () => {
    native.getGrantedPermissions.mockResolvedValue([{ accessType: 'read', recordType: 'SleepSession' }]);
    native.readRecords.mockRejectedValue(new Error('Native read failed'));
    await expect(syncHealthConnect()).rejects.toThrow('Native read failed');
    expect(saveSleepSessions).not.toHaveBeenCalled();
  });
});
