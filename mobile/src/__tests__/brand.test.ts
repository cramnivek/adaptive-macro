import { describe, expect, it } from 'vitest';
import appConfig from '../../app.json';
import manifest from '../../public/manifest.json';
import { BRAND } from '../brand';

describe('public rebrand without a new app identity', () => {
  it('uses the full name for installation and the short brand on the home screen', () => {
    expect(appConfig.expo.name).toBe(BRAND.fullName);
    expect(manifest.name).toBe(BRAND.fullName);
    expect(manifest.short_name).toBe(BRAND.name);
  });

  it('keeps existing installations, sign-in redirects and EAS builds attached to the same app', () => {
    expect(appConfig.expo.android.package).toBe('com.cramnivek.ascend');
    expect(appConfig.expo.ios.bundleIdentifier).toBe('com.cramnivek.ascend');
    expect(appConfig.expo.scheme).toBe('ascend');
    expect(appConfig.expo.slug).toBe('adaptive-macros');
    expect(appConfig.expo.extra.eas.projectId).toBe('1feb7a8d-afb9-479d-8e29-821bb5be74c6');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
  });
});
