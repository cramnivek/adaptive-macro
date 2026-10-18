import type { Micronutrients, Nutrients, Sex } from './types.ts';
import { roundTo } from './units.ts';

export interface MicronutrientTarget {
  name: string;
  shortName: string;
  unit: string;
  category: 'vitamins' | 'minerals' | 'lipids';
  rda: number;
  upperLimit?: number;
  description: string;
}

export const MICRONUTRIENT_KEYS: (keyof Micronutrients)[] = [
  'vitaminAMcg',
  'vitaminCMg',
  'vitaminDIU',
  'vitaminEMg',
  'vitaminKMcg',
  'thiaminB1Mg',
  'riboflavinB2Mg',
  'niacinB3Mg',
  'pantothenicAcidB5Mg',
  'pyridoxineB6Mg',
  'biotinB7Mcg',
  'folateB9Mcg',
  'cobalaminB12Mcg',
  'cholineMg',
  'sodiumMg',
  'potassiumMg',
  'calciumMg',
  'magnesiumMg',
  'phosphorusMg',
  'ironMg',
  'zincMg',
  'copperMg',
  'manganeseMg',
  'seleniumMcg',
  'iodineMcg',
  'saturatedFatG',
  'monounsaturatedFatG',
  'polyunsaturatedFatG',
  'transFatG',
  'cholesterolMg',
  'sugarG',
  'addedSugarG',
];

/**
 * NIH / DRI Recommended Dietary Allowances (RDA) & Adequate Intakes (AI)
 * customized by biological sex.
 */
export const getClinicalRda = (sex: Sex = 'male'): Record<keyof Micronutrients, MicronutrientTarget> => {
  const isFemale = sex === 'female';

  return {
    // --- Vitamins ---
    vitaminAMcg: {
      name: 'Vitamin A',
      shortName: 'Vit A',
      unit: 'mcg',
      category: 'vitamins',
      rda: isFemale ? 700 : 900,
      upperLimit: 3000,
      description: 'Vision, cellular immune defense, and tissue repair.',
    },
    vitaminCMg: {
      name: 'Vitamin C',
      shortName: 'Vit C',
      unit: 'mg',
      category: 'vitamins',
      rda: isFemale ? 75 : 90,
      upperLimit: 2000,
      description: 'Collagen synthesis, potent antioxidant, and non-heme iron absorption.',
    },
    vitaminDIU: {
      name: 'Vitamin D',
      shortName: 'Vit D',
      unit: 'IU',
      category: 'vitamins',
      rda: 800,
      upperLimit: 4000,
      description: 'Bone mineral density, calcium absorption, and muscle force production.',
    },
    vitaminEMg: {
      name: 'Vitamin E',
      shortName: 'Vit E',
      unit: 'mg',
      category: 'vitamins',
      rda: 15,
      upperLimit: 1000,
      description: 'Lipid-membrane antioxidant and vascular endothelial support.',
    },
    vitaminKMcg: {
      name: 'Vitamin K',
      shortName: 'Vit K',
      unit: 'mcg',
      category: 'vitamins',
      rda: isFemale ? 90 : 120,
      description: 'Blood coagulation cascade and osteocalcin activation for bone strength.',
    },
    thiaminB1Mg: {
      name: 'Thiamin (B1)',
      shortName: 'B1',
      unit: 'mg',
      category: 'vitamins',
      rda: isFemale ? 1.1 : 1.2,
      description: 'Cofactor for carbohydrate and branched-chain amino acid metabolism.',
    },
    riboflavinB2Mg: {
      name: 'Riboflavin (B2)',
      shortName: 'B2',
      unit: 'mg',
      category: 'vitamins',
      rda: isFemale ? 1.1 : 1.3,
      description: 'FAD/FMN electron transport, mitochondrial cellular respiration.',
    },
    niacinB3Mg: {
      name: 'Niacin (B3)',
      shortName: 'B3',
      unit: 'mg',
      category: 'vitamins',
      rda: isFemale ? 14 : 16,
      upperLimit: 35,
      description: 'NAD+/NADH energy substrate pathway and DNA repair.',
    },
    pantothenicAcidB5Mg: {
      name: 'Pantothenic Acid (B5)',
      shortName: 'B5',
      unit: 'mg',
      category: 'vitamins',
      rda: 5,
      description: 'Coenzyme A synthesis essential for fatty acid beta-oxidation.',
    },
    pyridoxineB6Mg: {
      name: 'Vitamin B6',
      shortName: 'B6',
      unit: 'mg',
      category: 'vitamins',
      rda: isFemale ? 1.5 : 1.7,
      upperLimit: 100,
      description: 'Transamination of amino acids, glycogenolysis, and neurotransmitter synthesis.',
    },
    biotinB7Mcg: {
      name: 'Biotin (B7)',
      shortName: 'B7',
      unit: 'mcg',
      category: 'vitamins',
      rda: 30,
      description: 'Carboxylase coenzyme for fatty acid synthesis and gluconeogenesis.',
    },
    folateB9Mcg: {
      name: 'Folate (B9)',
      shortName: 'B9',
      unit: 'mcg',
      category: 'vitamins',
      rda: 400,
      upperLimit: 1000,
      description: 'One-carbon methylation, red blood cell synthesis, and nucleic acid production.',
    },
    cobalaminB12Mcg: {
      name: 'Vitamin B12',
      shortName: 'B12',
      unit: 'mcg',
      category: 'vitamins',
      rda: 2.4,
      description: 'Erythrocyte maturation, myelin sheath maintenance, and DNA synthesis.',
    },
    cholineMg: {
      name: 'Choline',
      shortName: 'Choline',
      unit: 'mg',
      category: 'vitamins',
      rda: isFemale ? 425 : 550,
      upperLimit: 3500,
      description: 'Acetylcholine neurotransmission, lipid transport, and cell membrane integrity.',
    },

    // --- Minerals & Electrolytes ---
    sodiumMg: {
      name: 'Sodium',
      shortName: 'Sodium',
      unit: 'mg',
      category: 'minerals',
      rda: 2000, // Athlete target / AI baseline
      upperLimit: 2300,
      description: 'Extracellular fluid volume, muscle action potential transmission, and blood volume.',
    },
    potassiumMg: {
      name: 'Potassium',
      shortName: 'Potassium',
      unit: 'mg',
      category: 'minerals',
      rda: isFemale ? 2600 : 3400,
      description: 'Intracellular electrolyte balance, cardiac repolarization, and vascular tone.',
    },
    calciumMg: {
      name: 'Calcium',
      shortName: 'Calcium',
      unit: 'mg',
      category: 'minerals',
      rda: 1000,
      upperLimit: 2500,
      description: 'Myofibril cross-bridge contraction, bone hydroxyapatite, and nerve signaling.',
    },
    magnesiumMg: {
      name: 'Magnesium',
      shortName: 'Magnesium',
      unit: 'mg',
      category: 'minerals',
      rda: isFemale ? 320 : 420,
      upperLimit: 350, // supplemental UL
      description: 'Mg-ATP enzymatic substrate, neuromuscular recovery, and sleep quality.',
    },
    phosphorusMg: {
      name: 'Phosphorus',
      shortName: 'Phosphorus',
      unit: 'mg',
      category: 'minerals',
      rda: 700,
      upperLimit: 4000,
      description: 'Phosphocreatine re-synthesis, cellular phosphate buffering, and bone matrix.',
    },
    ironMg: {
      name: 'Iron',
      shortName: 'Iron',
      unit: 'mg',
      category: 'minerals',
      rda: isFemale ? 18 : 8,
      upperLimit: 45,
      description: 'Hemoglobin and myoglobin oxygen transport, electron transport chain.',
    },
    zincMg: {
      name: 'Zinc',
      shortName: 'Zinc',
      unit: 'mg',
      category: 'minerals',
      rda: isFemale ? 8 : 11,
      upperLimit: 40,
      description: 'Protein translation, anabolic hormone signaling, and immune integrity.',
    },
    copperMg: {
      name: 'Copper',
      shortName: 'Copper',
      unit: 'mg',
      category: 'minerals',
      rda: 0.9,
      upperLimit: 10,
      description: 'Cytochrome c oxidase energy synthesis and superoxide dismutase defense.',
    },
    manganeseMg: {
      name: 'Manganese',
      shortName: 'Manganese',
      unit: 'mg',
      category: 'minerals',
      rda: isFemale ? 1.8 : 2.3,
      upperLimit: 11,
      description: 'Superoxide dismutase antioxidant enzyme and carbohydrate metabolism.',
    },
    seleniumMcg: {
      name: 'Selenium',
      shortName: 'Selenium',
      unit: 'mcg',
      category: 'minerals',
      rda: 55,
      upperLimit: 400,
      description: 'Glutathione peroxidase antioxidant protection and thyroid hormone conversion.',
    },
    iodineMcg: {
      name: 'Iodine',
      shortName: 'Iodine',
      unit: 'mcg',
      category: 'minerals',
      rda: 150,
      upperLimit: 1100,
      description: 'Thyroxine (T4) and triiodothyronine (T3) thyroid metabolic regulation.',
    },

    // --- Lipids & Quality ---
    saturatedFatG: {
      name: 'Saturated Fat',
      shortName: 'Sat Fat',
      unit: 'g',
      category: 'lipids',
      rda: 20, // Guideline threshold (<10% of 2000 kcal)
      upperLimit: 25,
      description: 'Dietary saturated fatty acids; keep within balanced limits for cardiovascular health.',
    },
    monounsaturatedFatG: {
      name: 'Monounsaturated Fat',
      shortName: 'MUFA',
      unit: 'g',
      category: 'lipids',
      rda: 30,
      description: 'Heart-healthy fats (olive oil, avocado, nuts) supporting lipid profile.',
    },
    polyunsaturatedFatG: {
      name: 'Polyunsaturated Fat',
      shortName: 'PUFA',
      unit: 'g',
      category: 'lipids',
      rda: 15,
      description: 'Essential omega-3 and omega-6 fatty acids supporting cellular membrane fluidity.',
    },
    transFatG: {
      name: 'Trans Fat',
      shortName: 'Trans Fat',
      unit: 'g',
      category: 'lipids',
      rda: 0,
      upperLimit: 1,
      description: 'Industrial trans fatty acids; keep as close to zero as possible.',
    },
    cholesterolMg: {
      name: 'Cholesterol',
      shortName: 'Cholesterol',
      unit: 'mg',
      category: 'lipids',
      rda: 300,
      upperLimit: 400,
      description: 'Cellular membrane precursor and steroid hormone building block.',
    },
    sugarG: {
      name: 'Total Sugars',
      shortName: 'Sugars',
      unit: 'g',
      category: 'lipids',
      rda: 50,
      description: 'Total simple carbohydrates from whole fruits, dairy, and added sources.',
    },
    addedSugarG: {
      name: 'Added Sugars',
      shortName: 'Added Sugar',
      unit: 'g',
      category: 'lipids',
      rda: isFemale ? 25 : 36,
      upperLimit: 50,
      description: 'Refined or concentrated sweeteners added during manufacturing or cooking.',
    },
  };
};

/**
 * Scales a micronutrient record by a portion factor (e.g. grams / 100).
 */
export const scaleMicros = (
  micros?: Micronutrients,
  factor = 1,
): Micronutrients | undefined => {
  if (!micros) return undefined;
  const scaled: Micronutrients = {};
  for (const key of MICRONUTRIENT_KEYS) {
    const val = micros[key];
    if (val !== undefined && Number.isFinite(val)) {
      scaled[key] = roundTo(val * factor, 2);
    }
  }
  return scaled;
};

/**
 * Sums two micronutrient records.
 */
export const addMicros = (
  a?: Micronutrients,
  b?: Micronutrients,
): Micronutrients | undefined => {
  if (!a && !b) return undefined;
  if (!a) return b ? { ...b } : undefined;
  if (!b) return a ? { ...a } : undefined;

  const result: Micronutrients = {};
  for (const key of MICRONUTRIENT_KEYS) {
    const valA = a[key] ?? 0;
    const valB = b[key] ?? 0;
    if (a[key] !== undefined || b[key] !== undefined) {
      result[key] = roundTo(valA + valB, 2);
    }
  }
  return result;
};

export interface MicronutrientAnalysis {
  key: keyof Micronutrients;
  target: MicronutrientTarget;
  consumed: number;
  pctOfRda: number;
  status: 'optimal' | 'adequate' | 'low' | 'deficient' | 'high';
}

/**
 * Evaluates daily micronutrients against clinical RDAs.
 */
export const analyzeMicronutrients = (
  consumedMicros: Micronutrients = {},
  sex: Sex = 'male',
): MicronutrientAnalysis[] => {
  const rdaMap = getClinicalRda(sex);

  return MICRONUTRIENT_KEYS.map((key) => {
    const target = rdaMap[key];
    const consumed = consumedMicros[key] ?? 0;
    const pctOfRda = target.rda > 0 ? Math.round((consumed / target.rda) * 100) : 100;

    let status: MicronutrientAnalysis['status'] = 'adequate';
    if (key === 'transFatG' || key === 'addedSugarG') {
      if (target.upperLimit && consumed > target.upperLimit) status = 'high';
      else status = 'optimal';
    } else {
      if (pctOfRda >= 100) status = 'optimal';
      else if (pctOfRda >= 75) status = 'adequate';
      else if (pctOfRda >= 40) status = 'low';
      else status = 'deficient';
    }

    return {
      key,
      target,
      consumed,
      pctOfRda,
      status,
    };
  });
};

/**
 * Evaluates electrolyte balance (Sodium to Potassium ratio).
 * Optimal clinical ratio is typically 1:1 to 1:2 (Na <= K).
 */
export const evaluateElectrolytes = (micros: Micronutrients = {}) => {
  const na = micros.sodiumMg ?? 0;
  const k = micros.potassiumMg ?? 0;
  const mg = micros.magnesiumMg ?? 0;

  const ratio = k > 0 ? roundTo(na / k, 2) : null;
  const isOptimalRatio = ratio !== null && ratio <= 1.2;

  let advice = '';
  if (ratio === null || (na === 0 && k === 0)) {
    advice = 'Log electrolyte-rich whole foods (leafy greens, potatoes, salt) to monitor electrolyte balance.';
  } else if (ratio > 2.0) {
    advice = `Sodium-to-potassium ratio is ${ratio}:1 (elevated). Increase potassium intake (potatoes, bananas, spinach) to support blood pressure and muscular pumps.`;
  } else if (ratio > 1.2) {
    advice = `Sodium-to-potassium ratio is ${ratio}:1 (moderate). A slight boost in potassium will optimize cellular hydration.`;
  } else {
    advice = `Sodium-to-potassium ratio is ${ratio}:1 (ideal). Excellent cellular electrolyte balance for training performance and cardiovascular health.`;
  }

  return {
    sodiumMg: na,
    potassiumMg: k,
    magnesiumMg: mg,
    ratio,
    isOptimalRatio,
    advice,
  };
};

/**
 * Computes an overall Nutrition Quality Index (0 - 100) based on:
 * - Micronutrient RDA coverage (40 pts)
 * - Fiber adequacy (20 pts)
 * - Electrolyte balance (20 pts)
 * - Healthy lipid profile vs trans/added sugars (20 pts)
 */
export const computeNutritionQualityScore = (
  nutrients: Nutrients,
  sex: Sex = 'male',
): {
  score: number;
  grade: 'Elite' | 'Great' | 'Fair' | 'Needs Focus';
  highlights: string[];
} => {
  const micros = nutrients.micros ?? {};
  const analyses = analyzeMicronutrients(micros, sex);

  // 1. Micronutrient score (out of 40)
  // Evaluates coverage across reported vitamins and minerals with a diversity factor
  const reportedVitsAndMins = analyses.filter(
    (a) => (a.target.category === 'vitamins' || a.target.category === 'minerals') && a.consumed > 0,
  );
  const diversityFactor = Math.min(1, (reportedVitsAndMins.length || 0) / 8);
  const avgReportedCoverage =
    reportedVitsAndMins.length > 0
      ? reportedVitsAndMins.reduce((sum, item) => sum + Math.min(100, item.pctOfRda), 0) /
        reportedVitsAndMins.length
      : 0;
  const microScore = roundTo((avgReportedCoverage / 100) * (20 + 20 * diversityFactor), 1);

  // 2. Fiber score (out of 20)
  const targetFiber = sex === 'female' ? 25 : 38;
  const consumedFiber = nutrients.fiberG ?? 0;
  const fiberScore = roundTo(Math.min(1, consumedFiber / targetFiber) * 20, 1);

  // 3. Electrolyte score (out of 20)
  const electrolytes = evaluateElectrolytes(micros);
  let electrolyteScore = 12;
  if (electrolytes.isOptimalRatio) electrolyteScore = 20;
  else if (electrolytes.ratio && electrolytes.ratio <= 2.0) electrolyteScore = 16;

  // 4. Lipid & sugar quality (out of 20)
  let lipidScore = 20;
  if (micros.transFatG && micros.transFatG > 1) lipidScore -= 8;
  if (micros.addedSugarG && micros.addedSugarG > (sex === 'female' ? 25 : 36)) lipidScore -= 6;
  if (micros.saturatedFatG && micros.saturatedFatG > 30) lipidScore -= 4;
  lipidScore = Math.max(0, lipidScore);

  const totalScore = Math.round(microScore + fiberScore + electrolyteScore + lipidScore);

  let grade: 'Elite' | 'Great' | 'Fair' | 'Needs Focus' = 'Needs Focus';
  if (totalScore >= 85) grade = 'Elite';
  else if (totalScore >= 70) grade = 'Great';
  else if (totalScore >= 50) grade = 'Fair';

  const highlights: string[] = [];
  if (consumedFiber >= targetFiber) {
    highlights.push(`Hit daily fiber goal (${Math.round(consumedFiber)}g)`);
  } else {
    highlights.push(`Fiber at ${Math.round(consumedFiber)}g / ${targetFiber}g goal`);
  }

  if (electrolytes.isOptimalRatio) {
    highlights.push('Balanced Na:K electrolyte ratio');
  }

  const topDeficiencies = analyses
    .filter((a) => a.status === 'deficient' || a.status === 'low')
    .slice(0, 3);
  if (topDeficiencies.length > 0) {
    highlights.push(
      `Gaps in: ${topDeficiencies.map((d) => d.target.shortName).join(', ')}`,
    );
  }

  return {
    score: totalScore,
    grade,
    highlights,
  };
};
