/**
 * The shapes a card over a photograph can take.
 *
 * A template is three things at once: a layout the drawing follows, the
 * information that layout is for, and where on the picture it starts. They are
 * not four skins of one card — a corner stamp that tried to carry the climb
 * would be a bad corner stamp — so each one says which blocks it can hold, and
 * the editor offers only those.
 *
 * Kept away from the canvas so the defaults can be tested and so the editor can
 * read them without importing the drawing.
 */

import { ALL_BLOCKS, type CardBlock, type CardBlocks, type Placement } from './shareCardPlacement';

export const TEMPLATE_IDS = ['block', 'bar', 'tag', 'figure'] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

export interface CardTemplate {
  id: TemplateId;
  /** What the chip says, and the only name anyone sees. */
  name: string;
  /** One line in the editor, so the choice is not four words and a guess. */
  about: string;
  /** The blocks this shape can draw. Anything else is not offered for it. */
  holds: CardBlock[];
  /** What it starts with — less than it holds, where the shape is better for it. */
  blocks: CardBlocks;
  /** Where it lands when it is chosen, and where RESET puts it back. */
  place: Placement;
}

/** The blocks named here, and nothing else. */
const only = (...on: CardBlock[]): CardBlocks => ({
  title: on.includes('title'),
  hero: on.includes('hero'),
  stats: on.includes('stats'),
  lifts: on.includes('lifts'),
  climb: on.includes('climb'),
});

export const TEMPLATES: Record<TemplateId, CardTemplate> = {
  block: {
    id: 'block',
    name: 'BLOCK',
    about: 'The whole workout, in a panel you put where you like.',
    holds: ['title', 'hero', 'stats', 'lifts', 'climb'],
    blocks: ALL_BLOCKS,
    // Low rather than centred: the middle of a photograph of a workout is
    // usually somebody's face, and a block that lands on the face is the first
    // thing anyone would move.
    place: { x: 0.5, y: 0.68, scale: 1 },
  },
  bar: {
    id: 'bar',
    name: 'BAR',
    about: 'A strip along one edge. The day in a line.',
    holds: ['title', 'hero', 'stats'],
    blocks: only('title', 'hero', 'stats'),
    place: { x: 0.5, y: 0.86, scale: 1 },
  },
  tag: {
    id: 'tag',
    name: 'TAG',
    about: 'A small stamp in a corner. One figure, and the mark.',
    holds: ['title', 'hero'],
    blocks: only('hero'),
    place: { x: 0.26, y: 0.12, scale: 1 },
  },
  figure: {
    id: 'figure',
    name: 'FIGURE',
    about: 'No panel. The type stands on the photograph itself.',
    holds: ['title', 'hero', 'stats'],
    blocks: only('title', 'hero'),
    place: { x: 0.5, y: 0.72, scale: 1 },
  },
};

export const DEFAULT_TEMPLATE: TemplateId = 'block';

/**
 * The blocks as this template can draw them.
 *
 * Switching template keeps what you had turned on where the new shape can hold
 * it, so going BLOCK → BAR → BLOCK does not quietly lose the climb you left on.
 */
export const blocksFor = (template: TemplateId, blocks: CardBlocks): CardBlocks => {
  const { holds } = TEMPLATES[template];
  return only(...holds.filter((block) => blocks[block]));
};
