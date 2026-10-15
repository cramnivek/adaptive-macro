import { describe, expect, it } from 'vitest';
import { ALL_BLOCKS, CARD_BLOCKS, clampPlacement } from '../shareCardPlacement';
import { blocksFor, DEFAULT_TEMPLATE, TEMPLATE_IDS, TEMPLATES } from '../shareCardTemplate';

const frame = { width: 1080, height: 1920 };

describe('the templates', () => {
  it('each start with blocks the shape can actually hold', () => {
    for (const id of TEMPLATE_IDS) {
      const { blocks, holds } = TEMPLATES[id];
      const on = CARD_BLOCKS.filter((block) => blocks[block]);
      expect(on.length).toBeGreaterThan(0);
      expect(on.every((block) => holds.includes(block))).toBe(true);
    }
  });

  it('each start somewhere the block can legally be, at the size it is drawn', () => {
    // Near enough the tallest any of them comes out: if the starting place
    // survives this it survives the smaller ones.
    const tall = { width: 1000, height: 1200 };
    for (const id of TEMPLATE_IDS) {
      expect(clampPlacement(TEMPLATES[id].place, tall, frame)).toEqual(TEMPLATES[id].place);
    }
  });

  it('is the whole card by default, which is what the card has always been', () => {
    expect(TEMPLATES[DEFAULT_TEMPLATE].blocks).toEqual(ALL_BLOCKS);
  });
});

describe('blocksFor', () => {
  it('drops what the shape cannot draw', () => {
    expect(blocksFor('tag', ALL_BLOCKS)).toEqual({
      title: true,
      hero: true,
      stats: false,
      lifts: false,
      climb: false,
    });
  });

  it('keeps what it can, so a trip through another shape loses nothing', () => {
    const mine = { ...ALL_BLOCKS, lifts: false };
    expect(blocksFor('block', blocksFor('block', mine))).toEqual(mine);
  });
});
