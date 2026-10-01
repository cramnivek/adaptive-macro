import { describe, expect, it } from 'vitest';
import { PHOTO_PROMPT_ADDENDUM, SYSTEM_PROMPT } from '../describeMeal';
import { claudeContentFor, geminiPartsFor, systemInstructionFor } from '../mealRequest';

const photo = { base64: 'QUJD', mimeType: 'image/jpeg' };

describe('systemInstructionFor', () => {
  it('is byte-identical to SYSTEM_PROMPT without a photo', () => {
    // The meal-estimation eval compares providers on this prompt verbatim, so a
    // stray newline here would change what the eval measures silently.
    expect(systemInstructionFor(undefined)).toBe(SYSTEM_PROMPT);
  });

  it('appends the photo addendum with one', () => {
    expect(systemInstructionFor(photo)).toBe(`${SYSTEM_PROMPT}\n${PHOTO_PROMPT_ADDENDUM}`);
  });

  it('keeps the text instructions in place when a photo is sent', () => {
    // The addendum extends the rules rather than replacing them: portion
    // discipline and the kcal-macro consistency rule still apply to a photo.
    expect(systemInstructionFor(photo).startsWith(SYSTEM_PROMPT)).toBe(true);
  });
});

describe('geminiPartsFor', () => {
  it('sends text alone when there is no photo', () => {
    expect(geminiPartsFor('  two eggs  ', undefined)).toEqual([{ text: 'two eggs' }]);
  });

  it('puts the image first, because the text is context for it', () => {
    expect(geminiPartsFor('two eggs', photo)).toEqual([
      { inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } },
      { text: 'two eggs' },
    ]);
  });

  it('still sends a text part when nothing was typed', () => {
    // A photo with no words is the ordinary case; parts[1] must still exist.
    expect(geminiPartsFor('', photo)).toEqual([
      { inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } },
      { text: '' },
    ]);
  });

  it('carries the photo mime type rather than assuming JPEG', () => {
    const png = { base64: 'UE5H', mimeType: 'image/png' };
    expect(geminiPartsFor('', png)[0]).toEqual({
      inlineData: { mimeType: 'image/png', data: 'UE5H' },
    });
  });
});

describe('claudeContentFor', () => {
  it('is a plain string without a photo, as it is today', () => {
    expect(claudeContentFor('  two eggs  ', undefined)).toBe('two eggs');
  });

  it('is an image block followed by a text block with one', () => {
    expect(claudeContentFor('two eggs', photo)).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } },
      { type: 'text', text: 'two eggs' },
    ]);
  });
});
