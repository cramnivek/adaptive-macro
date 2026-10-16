import type { Food } from '@adaptive-macros/engine';

/**
 * Curated offline catalogue of verified core foods.
 *
 * Provides zero-latency, high-accuracy staples with realistic household portions
 * (eggs, chicken breast, rice, oats, banana, olive oil, whey protein, etc.) so
 * users can log everyday meals effortlessly without having to weigh everything in grams
 * or rely on slow/inconsistent external APIs.
 */

export const BUILTIN_FOODS: Food[] = [
  // ==========================================
  // PROTEINS
  // ==========================================
  {
    id: 'builtin:egg-whole',
    name: 'Whole Egg',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 143, proteinG: 12.6, carbsG: 0.7, fatG: 9.5, fiberG: 0 },
    portions: [
      { label: '1 large egg (50 g)', grams: 50 },
      { label: '2 large eggs (100 g)', grams: 100 },
      { label: '3 large eggs (150 g)', grams: 150 },
      { label: '1 medium egg (44 g)', grams: 44 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:egg-boiled',
    name: 'Hard Boiled Egg',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 155, proteinG: 12.6, carbsG: 1.1, fatG: 10.6, fiberG: 0 },
    portions: [
      { label: '1 large egg (50 g)', grams: 50 },
      { label: '2 large eggs (100 g)', grams: 100 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:egg-white',
    name: 'Egg Whites',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 52, proteinG: 10.9, carbsG: 0.7, fatG: 0.2, fiberG: 0 },
    portions: [
      { label: '1 large white (33 g)', grams: 33 },
      { label: '3 whites / 100 ml (100 g)', grams: 100 },
      { label: '1/2 cup liquid (120 g)', grams: 120 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:chicken-breast-cooked',
    name: 'Chicken Breast (Cooked, Skinless)',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 165, proteinG: 31.0, carbsG: 0, fatG: 3.6, fiberG: 0 },
    portions: [
      { label: '1 medium breast (172 g)', grams: 172 },
      { label: '1 small breast (120 g)', grams: 120 },
      { label: '1 cup diced (140 g)', grams: 140 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:chicken-breast-raw',
    name: 'Chicken Breast (Raw, Skinless)',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 120, proteinG: 22.5, carbsG: 0, fatG: 2.6, fiberG: 0 },
    portions: [
      { label: '1 raw breast (200 g)', grams: 200 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:chicken-thigh-cooked',
    name: 'Chicken Thigh (Cooked, Skinless)',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 209, proteinG: 26.0, carbsG: 0, fatG: 10.9, fiberG: 0 },
    portions: [
      { label: '1 thigh meat (105 g)', grams: 105 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:ground-beef-90-10',
    name: 'Ground Beef (90/10 Lean, Cooked)',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 217, proteinG: 26.1, carbsG: 0, fatG: 11.8, fiberG: 0 },
    portions: [
      { label: '1 patty / serving (113 g / 4 oz)', grams: 113 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:ground-beef-80-20',
    name: 'Ground Beef (80/20, Cooked)',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 254, proteinG: 24.2, carbsG: 0, fatG: 17.3, fiberG: 0 },
    portions: [
      { label: '1 patty (113 g / 4 oz)', grams: 113 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:ground-turkey-93-7',
    name: 'Ground Turkey (93/7 Lean, Cooked)',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 198, proteinG: 27.2, carbsG: 0, fatG: 9.3, fiberG: 0 },
    portions: [
      { label: '1 serving (113 g / 4 oz)', grams: 113 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:sirloin-steak',
    name: 'Top Sirloin Steak (Cooked, Trimmed)',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 211, proteinG: 30.5, carbsG: 0, fatG: 9.1, fiberG: 0 },
    portions: [
      { label: '6 oz steak (170 g)', grams: 170 },
      { label: '8 oz steak (227 g)', grams: 227 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:salmon-cooked',
    name: 'Atlantic Salmon (Cooked, Baked)',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 206, proteinG: 22.1, carbsG: 0, fatG: 12.3, fiberG: 0 },
    portions: [
      { label: '1 fillet (150 g)', grams: 150 },
      { label: '1/2 fillet (75 g)', grams: 75 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:canned-tuna',
    name: 'Tuna (Canned in Water, Drained)',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 116, proteinG: 25.5, carbsG: 0, fatG: 0.8, fiberG: 0 },
    portions: [
      { label: '1 can drained (120 g)', grams: 120 },
      { label: '1/2 can (60 g)', grams: 60 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:shrimp-cooked',
    name: 'Shrimp (Cooked, Steamed)',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 99, proteinG: 24.0, carbsG: 0.2, fatG: 0.3, fiberG: 0 },
    portions: [
      { label: '1 medium shrimp (8 g)', grams: 8 },
      { label: '6 large shrimp (85 g / 3 oz)', grams: 85 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:whey-protein',
    name: 'Whey Protein Powder',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 390, proteinG: 80.0, carbsG: 6.0, fatG: 4.5, fiberG: 1.0 },
    portions: [
      { label: '1 scoop (30 g)', grams: 30 },
      { label: '1.5 scoops (45 g)', grams: 45 },
      { label: '2 scoops (60 g)', grams: 60 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:casein-protein',
    name: 'Casein Protein Powder',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 370, proteinG: 78.0, carbsG: 5.0, fatG: 3.5, fiberG: 1.0 },
    portions: [
      { label: '1 scoop (32 g)', grams: 32 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:greek-yogurt-0',
    name: 'Greek Yogurt (0% Fat, Plain)',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 59, proteinG: 10.3, carbsG: 3.6, fatG: 0.4, fiberG: 0 },
    portions: [
      { label: '1 single container (170 g)', grams: 170 },
      { label: '1 cup (227 g)', grams: 227 },
      { label: '1/2 cup (113 g)', grams: 113 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:greek-yogurt-whole',
    name: 'Greek Yogurt (Whole Milk, Plain)',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 97, proteinG: 9.0, carbsG: 3.9, fatG: 5.0, fiberG: 0 },
    portions: [
      { label: '1 single container (170 g)', grams: 170 },
      { label: '1 cup (227 g)', grams: 227 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:cottage-cheese-2',
    name: 'Cottage Cheese (Low Fat 2%)',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 81, proteinG: 11.0, carbsG: 4.8, fatG: 2.3, fiberG: 0 },
    portions: [
      { label: '1/2 cup (113 g)', grams: 113 },
      { label: '1 cup (226 g)', grams: 226 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:tofu-firm',
    name: 'Tofu (Firm)',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 83, proteinG: 10.0, carbsG: 1.2, fatG: 5.3, fiberG: 1.0 },
    portions: [
      { label: '1/2 block (125 g)', grams: 125 },
      { label: '1 block (250 g)', grams: 250 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:tempeh',
    name: 'Tempeh',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 192, proteinG: 20.3, carbsG: 7.6, fatG: 10.8, fiberG: 4.8 },
    portions: [
      { label: '1/2 package (115 g)', grams: 115 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:pork-tenderloin',
    name: 'Pork Tenderloin (Cooked, Lean)',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 143, proteinG: 26.2, carbsG: 0, fatG: 3.5, fiberG: 0 },
    portions: [
      { label: '1 chop / portion (120 g)', grams: 120 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:deli-turkey',
    name: 'Turkey Breast (Sliced Deli Meat)',
    source: 'builtin',
    category: 'protein',
    per100g: { kcal: 104, proteinG: 18.0, carbsG: 3.0, fatG: 2.0, fiberG: 0 },
    portions: [
      { label: '2 slices (56 g / 2 oz)', grams: 56 },
      { label: '3 slices (85 g / 3 oz)', grams: 85 },
      { label: '100 g', grams: 100 },
    ],
  },

  // ==========================================
  // CARBOHYDRATES & GRAINS
  // ==========================================
  {
    id: 'builtin:white-rice-cooked',
    name: 'White Rice (Cooked, Jasmine / Grain)',
    source: 'builtin',
    category: 'carbs',
    per100g: { kcal: 130, proteinG: 2.7, carbsG: 28.2, fatG: 0.3, fiberG: 0.4 },
    portions: [
      { label: '1 cup cooked (158 g)', grams: 158 },
      { label: '1/2 cup cooked (79 g)', grams: 79 },
      { label: '1.5 cups cooked (237 g)', grams: 237 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:brown-rice-cooked',
    name: 'Brown Rice (Cooked)',
    source: 'builtin',
    category: 'carbs',
    per100g: { kcal: 123, proteinG: 2.7, carbsG: 25.6, fatG: 1.0, fiberG: 1.6 },
    portions: [
      { label: '1 cup cooked (195 g)', grams: 195 },
      { label: '1/2 cup cooked (98 g)', grams: 98 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:oats-dry',
    name: 'Rolled Oats (Dry)',
    source: 'builtin',
    category: 'carbs',
    per100g: { kcal: 379, proteinG: 13.2, carbsG: 67.7, fatG: 6.5, fiberG: 10.1 },
    portions: [
      { label: '1/2 cup dry (40 g)', grams: 40 },
      { label: '1 cup dry (80 g)', grams: 80 },
      { label: '1 packet instant (28 g)', grams: 28 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:oats-cooked',
    name: 'Oatmeal (Cooked with Water)',
    source: 'builtin',
    category: 'carbs',
    per100g: { kcal: 71, proteinG: 2.5, carbsG: 12.0, fatG: 1.5, fiberG: 1.7 },
    portions: [
      { label: '1 cup cooked (234 g)', grams: 234 },
      { label: '1/2 cup cooked (117 g)', grams: 117 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:sweet-potato-baked',
    name: 'Sweet Potato (Baked, Flesh & Skin)',
    source: 'builtin',
    category: 'carbs',
    per100g: { kcal: 90, proteinG: 2.0, carbsG: 20.7, fatG: 0.1, fiberG: 3.3 },
    portions: [
      { label: '1 medium potato (114 g)', grams: 114 },
      { label: '1 large potato (180 g)', grams: 180 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:russet-potato-baked',
    name: 'Russet Potato (Baked, Flesh & Skin)',
    source: 'builtin',
    category: 'carbs',
    per100g: { kcal: 95, proteinG: 2.6, carbsG: 21.6, fatG: 0.1, fiberG: 2.3 },
    portions: [
      { label: '1 medium potato (173 g)', grams: 173 },
      { label: '1 small potato (138 g)', grams: 138 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:pasta-cooked',
    name: 'Pasta (Cooked, Enriched)',
    source: 'builtin',
    category: 'carbs',
    per100g: { kcal: 158, proteinG: 5.8, carbsG: 30.9, fatG: 0.9, fiberG: 1.8 },
    portions: [
      { label: '1 cup cooked (140 g)', grams: 140 },
      { label: '1.5 cups cooked (210 g)', grams: 210 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:bread-sourdough',
    name: 'Sourdough Bread',
    source: 'builtin',
    category: 'carbs',
    per100g: { kcal: 247, proteinG: 9.3, carbsG: 48.2, fatG: 1.2, fiberG: 2.2 },
    portions: [
      { label: '1 slice (45 g)', grams: 45 },
      { label: '2 slices (90 g)', grams: 90 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:bread-whole-wheat',
    name: 'Whole Wheat Bread',
    source: 'builtin',
    category: 'carbs',
    per100g: { kcal: 247, proteinG: 12.0, carbsG: 41.3, fatG: 3.4, fiberG: 6.0 },
    portions: [
      { label: '1 slice (38 g)', grams: 38 },
      { label: '2 slices (76 g)', grams: 76 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:bread-white',
    name: 'White Bread',
    source: 'builtin',
    category: 'carbs',
    per100g: { kcal: 265, proteinG: 9.0, carbsG: 49.1, fatG: 3.2, fiberG: 2.7 },
    portions: [
      { label: '1 slice (35 g)', grams: 35 },
      { label: '2 slices (70 g)', grams: 70 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:bagel-plain',
    name: 'Bagel (Plain)',
    source: 'builtin',
    category: 'carbs',
    per100g: { kcal: 250, proteinG: 10.0, carbsG: 49.0, fatG: 1.5, fiberG: 2.3 },
    portions: [
      { label: '1 medium bagel (105 g)', grams: 105 },
      { label: '1/2 bagel (52 g)', grams: 52 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:corn-tortilla',
    name: 'Corn Tortilla',
    source: 'builtin',
    category: 'carbs',
    per100g: { kcal: 218, proteinG: 5.7, carbsG: 45.0, fatG: 2.8, fiberG: 6.3 },
    portions: [
      { label: '1 tortilla (28 g)', grams: 28 },
      { label: '2 tortillas (56 g)', grams: 56 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:flour-tortilla',
    name: 'Flour Tortilla',
    source: 'builtin',
    category: 'carbs',
    per100g: { kcal: 304, proteinG: 8.4, carbsG: 51.5, fatG: 7.5, fiberG: 2.8 },
    portions: [
      { label: '1 medium tortilla (45 g)', grams: 45 },
      { label: '1 large burrito tortilla (70 g)', grams: 70 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:quinoa-cooked',
    name: 'Quinoa (Cooked)',
    source: 'builtin',
    category: 'carbs',
    per100g: { kcal: 120, proteinG: 4.4, carbsG: 21.3, fatG: 1.9, fiberG: 2.8 },
    portions: [
      { label: '1 cup cooked (185 g)', grams: 185 },
      { label: '1/2 cup cooked (93 g)', grams: 93 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:black-beans-canned',
    name: 'Black Beans (Canned, Drained)',
    source: 'builtin',
    category: 'carbs',
    per100g: { kcal: 132, proteinG: 8.9, carbsG: 23.7, fatG: 0.5, fiberG: 8.7 },
    portions: [
      { label: '1/2 cup (130 g)', grams: 130 },
      { label: '1 cup (260 g)', grams: 260 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:chickpeas-canned',
    name: 'Chickpeas / Garbanzo Beans (Canned, Drained)',
    source: 'builtin',
    category: 'carbs',
    per100g: { kcal: 139, proteinG: 7.0, carbsG: 22.5, fatG: 2.6, fiberG: 6.4 },
    portions: [
      { label: '1/2 cup (130 g)', grams: 130 },
      { label: '1 cup (260 g)', grams: 260 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:lentils-cooked',
    name: 'Lentils (Cooked, Boiled)',
    source: 'builtin',
    category: 'carbs',
    per100g: { kcal: 116, proteinG: 9.0, carbsG: 20.1, fatG: 0.4, fiberG: 7.9 },
    portions: [
      { label: '1/2 cup cooked (100 g)', grams: 100 },
      { label: '1 cup cooked (198 g)', grams: 198 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:rice-cakes',
    name: 'Rice Cakes (Brown / White Rice)',
    source: 'builtin',
    category: 'carbs',
    per100g: { kcal: 387, proteinG: 8.0, carbsG: 82.0, fatG: 2.8, fiberG: 4.0 },
    portions: [
      { label: '1 cake (9 g)', grams: 9 },
      { label: '2 cakes (18 g)', grams: 18 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:honey',
    name: 'Honey',
    source: 'builtin',
    category: 'carbs',
    per100g: { kcal: 304, proteinG: 0.3, carbsG: 82.4, fatG: 0, fiberG: 0.2 },
    portions: [
      { label: '1 tbsp (21 g)', grams: 21 },
      { label: '1 tsp (7 g)', grams: 7 },
      { label: '100 g', grams: 100 },
    ],
  },

  // ==========================================
  // PRODUCE (FRUITS & VEGETABLES)
  // ==========================================
  {
    id: 'builtin:banana',
    name: 'Banana (Fresh)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 89, proteinG: 1.1, carbsG: 22.8, fatG: 0.3, fiberG: 2.6 },
    portions: [
      { label: '1 medium banana (118 g)', grams: 118 },
      { label: '1 large banana (136 g)', grams: 136 },
      { label: '1 small banana (101 g)', grams: 101 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:apple',
    name: 'Apple (Fresh, with Skin)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 52, proteinG: 0.3, carbsG: 13.8, fatG: 0.2, fiberG: 2.4 },
    portions: [
      { label: '1 medium apple (182 g)', grams: 182 },
      { label: '1 large apple (223 g)', grams: 223 },
      { label: '1 small apple (149 g)', grams: 149 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:blueberries',
    name: 'Blueberries (Fresh)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 57, proteinG: 0.7, carbsG: 14.5, fatG: 0.3, fiberG: 2.4 },
    portions: [
      { label: '1/2 cup (74 g)', grams: 74 },
      { label: '1 cup (148 g)', grams: 148 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:strawberries',
    name: 'Strawberries (Fresh)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 32, proteinG: 0.7, carbsG: 7.7, fatG: 0.3, fiberG: 2.0 },
    portions: [
      { label: '1 cup sliced (166 g)', grams: 166 },
      { label: '5 large berries (90 g)', grams: 90 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:orange',
    name: 'Orange (Navel, Peeled)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 47, proteinG: 0.9, carbsG: 11.8, fatG: 0.1, fiberG: 2.4 },
    portions: [
      { label: '1 medium orange (131 g)', grams: 131 },
      { label: '1 large orange (184 g)', grams: 184 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:watermelon',
    name: 'Watermelon (Fresh, Diced)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 30, proteinG: 0.6, carbsG: 7.6, fatG: 0.2, fiberG: 0.4 },
    portions: [
      { label: '1 cup diced (152 g)', grams: 152 },
      { label: '1 wedge (286 g)', grams: 286 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:grapes',
    name: 'Grapes (Red / Green, Seedless)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 69, proteinG: 0.7, carbsG: 18.1, fatG: 0.2, fiberG: 0.9 },
    portions: [
      { label: '1 cup (151 g)', grams: 151 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:mango',
    name: 'Mango (Fresh, Diced)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 60, proteinG: 0.8, carbsG: 15.0, fatG: 0.4, fiberG: 1.6 },
    portions: [
      { label: '1 cup pieces (165 g)', grams: 165 },
      { label: '1 medium fruit (200 g)', grams: 200 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:pineapple',
    name: 'Pineapple (Fresh, Chunks)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 50, proteinG: 0.5, carbsG: 13.1, fatG: 0.1, fiberG: 1.4 },
    portions: [
      { label: '1 cup chunks (165 g)', grams: 165 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:broccoli-cooked',
    name: 'Broccoli (Cooked / Steamed)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 35, proteinG: 2.4, carbsG: 7.2, fatG: 0.4, fiberG: 3.3 },
    portions: [
      { label: '1 cup chopped (156 g)', grams: 156 },
      { label: '1/2 cup (78 g)', grams: 78 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:spinach-raw',
    name: 'Spinach (Baby, Raw)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 23, proteinG: 2.9, carbsG: 3.6, fatG: 0.4, fiberG: 2.2 },
    portions: [
      { label: '2 cups raw (60 g)', grams: 60 },
      { label: '1 cup raw (30 g)', grams: 30 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:spinach-cooked',
    name: 'Spinach (Cooked, Boiled)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 23, proteinG: 3.0, carbsG: 3.8, fatG: 0.3, fiberG: 2.4 },
    portions: [
      { label: '1 cup cooked (180 g)', grams: 180 },
      { label: '1/2 cup cooked (90 g)', grams: 90 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:asparagus',
    name: 'Asparagus (Cooked)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 22, proteinG: 2.4, carbsG: 4.1, fatG: 0.2, fiberG: 2.0 },
    portions: [
      { label: '6 medium spears (90 g)', grams: 90 },
      { label: '1 cup (180 g)', grams: 180 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:green-beans',
    name: 'Green Beans (Cooked)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 35, proteinG: 1.9, carbsG: 7.9, fatG: 0.3, fiberG: 3.2 },
    portions: [
      { label: '1 cup (125 g)', grams: 125 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:bell-pepper',
    name: 'Bell Pepper (Red / Green, Raw)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 31, proteinG: 1.0, carbsG: 6.0, fatG: 0.3, fiberG: 2.1 },
    portions: [
      { label: '1 medium pepper (119 g)', grams: 119 },
      { label: '1 cup chopped (150 g)', grams: 150 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:carrots',
    name: 'Carrots (Raw)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 41, proteinG: 0.9, carbsG: 9.6, fatG: 0.2, fiberG: 2.8 },
    portions: [
      { label: '1 medium carrot (61 g)', grams: 61 },
      { label: '1 cup chopped (128 g)', grams: 128 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:cucumber',
    name: 'Cucumber (with Peel, Sliced)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 15, proteinG: 0.7, carbsG: 3.6, fatG: 0.1, fiberG: 0.5 },
    portions: [
      { label: '1 cup sliced (104 g)', grams: 104 },
      { label: '1/2 medium cucumber (100 g)', grams: 100 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:tomato',
    name: 'Tomato (Fresh, Red)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 18, proteinG: 0.9, carbsG: 3.9, fatG: 0.2, fiberG: 1.2 },
    portions: [
      { label: '1 medium tomato (123 g)', grams: 123 },
      { label: '1 cup cherry tomatoes (149 g)', grams: 149 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:zucchini',
    name: 'Zucchini (Cooked, Sliced)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 17, proteinG: 1.2, carbsG: 3.1, fatG: 0.3, fiberG: 1.0 },
    portions: [
      { label: '1 cup sliced (180 g)', grams: 180 },
      { label: '1 medium zucchini (196 g)', grams: 196 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:mushrooms',
    name: 'Mushrooms (White / Cremini, Sliced)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 22, proteinG: 3.1, carbsG: 3.3, fatG: 0.3, fiberG: 1.0 },
    portions: [
      { label: '1 cup sliced (70 g)', grams: 70 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:onion',
    name: 'Yellow Onion (Raw / Diced)',
    source: 'builtin',
    category: 'produce',
    per100g: { kcal: 40, proteinG: 1.1, carbsG: 9.3, fatG: 0.1, fiberG: 1.7 },
    portions: [
      { label: '1 medium onion (110 g)', grams: 110 },
      { label: '1/2 cup chopped (80 g)', grams: 80 },
      { label: '100 g', grams: 100 },
    ],
  },

  // ==========================================
  // FATS & OILS
  // ==========================================
  {
    id: 'builtin:olive-oil',
    name: 'Olive Oil (Extra Virgin)',
    source: 'builtin',
    category: 'fats',
    per100g: { kcal: 884, proteinG: 0, carbsG: 0, fatG: 100.0, fiberG: 0 },
    portions: [
      { label: '1 tbsp (14 g / 15 ml)', grams: 14 },
      { label: '1 tsp (4.5 g / 5 ml)', grams: 4.5 },
      { label: '2 tbsp (28 g / 30 ml)', grams: 28 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:butter',
    name: 'Butter (Salted / Unsalted)',
    source: 'builtin',
    category: 'fats',
    per100g: { kcal: 717, proteinG: 0.9, carbsG: 0.1, fatG: 81.1, fiberG: 0 },
    portions: [
      { label: '1 tbsp (14 g)', grams: 14 },
      { label: '1 pat (5 g)', grams: 5 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:coconut-oil',
    name: 'Coconut Oil',
    source: 'builtin',
    category: 'fats',
    per100g: { kcal: 862, proteinG: 0, carbsG: 0, fatG: 100.0, fiberG: 0 },
    portions: [
      { label: '1 tbsp (14 g)', grams: 14 },
      { label: '1 tsp (4.5 g)', grams: 4.5 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:avocado',
    name: 'Avocado (Hass, Fresh)',
    source: 'builtin',
    category: 'fats',
    per100g: { kcal: 160, proteinG: 2.0, carbsG: 8.5, fatG: 14.7, fiberG: 6.7 },
    portions: [
      { label: '1/2 medium avocado (68 g)', grams: 68 },
      { label: '1 whole avocado (136 g)', grams: 136 },
      { label: '1/4 avocado (34 g)', grams: 34 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:peanut-butter',
    name: 'Peanut Butter (Smooth / Natural)',
    source: 'builtin',
    category: 'fats',
    per100g: { kcal: 588, proteinG: 25.1, carbsG: 20.0, fatG: 50.4, fiberG: 6.0 },
    portions: [
      { label: '2 tbsp (32 g)', grams: 32 },
      { label: '1 tbsp (16 g)', grams: 16 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:almond-butter',
    name: 'Almond Butter',
    source: 'builtin',
    category: 'fats',
    per100g: { kcal: 614, proteinG: 21.0, carbsG: 18.8, fatG: 55.5, fiberG: 10.3 },
    portions: [
      { label: '2 tbsp (32 g)', grams: 32 },
      { label: '1 tbsp (16 g)', grams: 16 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:almonds',
    name: 'Almonds (Whole, Raw / Roasted)',
    source: 'builtin',
    category: 'fats',
    per100g: { kcal: 579, proteinG: 21.2, carbsG: 21.6, fatG: 49.9, fiberG: 12.5 },
    portions: [
      { label: '1 handful / 1 oz (28 g)', grams: 28 },
      { label: '1/4 cup (36 g)', grams: 36 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:walnuts',
    name: 'Walnuts (Halves)',
    source: 'builtin',
    category: 'fats',
    per100g: { kcal: 654, proteinG: 15.2, carbsG: 13.7, fatG: 65.2, fiberG: 6.7 },
    portions: [
      { label: '1 oz / 14 halves (28 g)', grams: 28 },
      { label: '1/4 cup chopped (30 g)', grams: 30 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:chia-seeds',
    name: 'Chia Seeds',
    source: 'builtin',
    category: 'fats',
    per100g: { kcal: 486, proteinG: 16.5, carbsG: 42.1, fatG: 30.7, fiberG: 34.4 },
    portions: [
      { label: '1 tbsp (12 g)', grams: 12 },
      { label: '2 tbsp (24 g)', grams: 24 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:dark-chocolate-85',
    name: 'Dark Chocolate (70-85% Cacao)',
    source: 'builtin',
    category: 'fats',
    per100g: { kcal: 598, proteinG: 7.8, carbsG: 45.9, fatG: 42.6, fiberG: 10.9 },
    portions: [
      { label: '1 square / serving (30 g)', grams: 30 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:mayonnaise',
    name: 'Mayonnaise (Regular)',
    source: 'builtin',
    category: 'fats',
    per100g: { kcal: 680, proteinG: 1.0, carbsG: 0.6, fatG: 75.0, fiberG: 0 },
    portions: [
      { label: '1 tbsp (14 g)', grams: 14 },
      { label: '1 tsp (4.7 g)', grams: 4.7 },
      { label: '100 g', grams: 100 },
    ],
  },

  // ==========================================
  // DAIRY & BEVERAGES
  // ==========================================
  {
    id: 'builtin:milk-whole',
    name: 'Whole Milk (3.25% Fat)',
    source: 'builtin',
    category: 'dairy',
    per100g: { kcal: 61, proteinG: 3.2, carbsG: 4.8, fatG: 3.3, fiberG: 0 },
    portions: [
      { label: '1 cup (244 g / 240 ml)', grams: 244 },
      { label: '1/2 cup (122 g)', grams: 122 },
      { label: '1 splash / 2 tbsp (30 g)', grams: 30 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:milk-2-percent',
    name: 'Semi-Skimmed Milk (2% Fat)',
    source: 'builtin',
    category: 'dairy',
    per100g: { kcal: 50, proteinG: 3.3, carbsG: 4.8, fatG: 2.0, fiberG: 0 },
    portions: [
      { label: '1 cup (244 g / 240 ml)', grams: 244 },
      { label: '1/2 cup (122 g)', grams: 122 },
      { label: '1 splash / 2 tbsp (30 g)', grams: 30 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:milk-skim',
    name: 'Skim Milk (Non-Fat)',
    source: 'builtin',
    category: 'dairy',
    per100g: { kcal: 35, proteinG: 3.4, carbsG: 4.9, fatG: 0.1, fiberG: 0 },
    portions: [
      { label: '1 cup (245 g / 240 ml)', grams: 245 },
      { label: '1/2 cup (122 g)', grams: 122 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:almond-milk-unsweetened',
    name: 'Almond Milk (Unsweetened)',
    source: 'builtin',
    category: 'dairy',
    per100g: { kcal: 15, proteinG: 0.5, carbsG: 0.3, fatG: 1.1, fiberG: 0.2 },
    portions: [
      { label: '1 cup (240 g / 240 ml)', grams: 240 },
      { label: '1/2 cup (120 g)', grams: 120 },
      { label: '1 splash (30 g)', grams: 30 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:oat-milk',
    name: 'Oat Milk (Plain)',
    source: 'builtin',
    category: 'dairy',
    per100g: { kcal: 48, proteinG: 1.2, carbsG: 6.8, fatG: 1.5, fiberG: 0.8 },
    portions: [
      { label: '1 cup (240 g / 240 ml)', grams: 240 },
      { label: '1/2 cup (120 g)', grams: 120 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:cheddar-cheese',
    name: 'Cheddar Cheese',
    source: 'builtin',
    category: 'dairy',
    per100g: { kcal: 403, proteinG: 24.9, carbsG: 1.3, fatG: 33.1, fiberG: 0 },
    portions: [
      { label: '1 slice (28 g / 1 oz)', grams: 28 },
      { label: '2 slices (56 g)', grams: 56 },
      { label: '1/4 cup shredded (28 g)', grams: 28 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:mozzarella-cheese',
    name: 'Mozzarella Cheese (Part-Skim)',
    source: 'builtin',
    category: 'dairy',
    per100g: { kcal: 300, proteinG: 28.0, carbsG: 2.2, fatG: 20.0, fiberG: 0 },
    portions: [
      { label: '1 slice / stick (28 g)', grams: 28 },
      { label: '1/4 cup shredded (28 g)', grams: 28 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:parmesan-cheese',
    name: 'Parmesan Cheese (Grated)',
    source: 'builtin',
    category: 'dairy',
    per100g: { kcal: 431, proteinG: 38.5, carbsG: 4.1, fatG: 28.6, fiberG: 0 },
    portions: [
      { label: '1 tbsp grated (5 g)', grams: 5 },
      { label: '2 tbsp (10 g)', grams: 10 },
      { label: '1 oz (28 g)', grams: 28 },
      { label: '100 g', grams: 100 },
    ],
  },
  {
    id: 'builtin:coffee-black',
    name: 'Coffee (Black, Brewed)',
    source: 'builtin',
    category: 'dairy',
    per100g: { kcal: 1, proteinG: 0.1, carbsG: 0, fatG: 0, fiberG: 0 },
    portions: [
      { label: '1 mug / cup (240 ml)', grams: 240 },
      { label: '1 espresso shot (30 ml)', grams: 30 },
      { label: '100 g', grams: 100 },
    ],
  },
];

/**
 * Searches the built-in catalogue in-memory with instant response time.
 */
export const searchBuiltinFoods = (query: string, category?: string): Food[] => {
  const trimmed = query.trim().toLowerCase();
  let list = BUILTIN_FOODS;

  if (category && category !== 'all') {
    list = list.filter((food) => food.category === category);
  }

  if (!trimmed) {
    return list;
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return list.filter((food) => {
    const hay = `${food.name} ${food.category ?? ''}`.toLowerCase();
    return tokens.every((token) => hay.includes(token));
  });
};

/**
 * Returns popular core foods for display when no query is typed yet.
 */
export const getPopularBuiltinFoods = (category?: string, limit = 20): Food[] => {
  if (category && category !== 'all') {
    return BUILTIN_FOODS.filter((f) => f.category === category).slice(0, limit);
  }
  return BUILTIN_FOODS.slice(0, limit);
};
