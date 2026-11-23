import {
  BaseConfig,
  BottleAllocationSummary,
  CalculationCostLine,
  CalculationResult,
  Insumo,
  PREDEFINED_BASES,
  PerfumeFormulaDraft,
  PricingConfig,
  SizeSimulationRow,
  UnitType,
} from '../types/perfumery';

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundQuantity(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundCurrency(value));
}

export function formatBRLPrecise(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}

export function computeAcquisitionCost(purchasePrice: number, freight: number): number {
  const safePrice = Math.max(0, Number(purchasePrice) || 0);
  const safeFreight = Math.max(0, Number(freight) || 0);
  return safePrice + safeFreight;
}

export function computeUnitCost(
  purchasedQty: number,
  purchasePrice: number,
  freight: number
): number {
  if (!purchasedQty || purchasedQty <= 0) return 0;
  return computeAcquisitionCost(purchasePrice, freight) / purchasedQty;
}

export function isVolumeUnit(unit: UnitType): boolean {
  return unit === 'ml' || unit === 'L';
}

export function isMassUnit(unit: UnitType): boolean {
  return unit === 'g' || unit === 'kg';
}

export interface UnitConversionResult {
  ok: boolean;
  value: number;
  error?: string;
}

/**
 * Converts a quantity from `fromUnit` to `toUnit`.
 * Never converts mass <-> volume unless `densityGPerMl` (> 0) is provided.
 */
export function convertQuantity(
  quantity: number,
  fromUnit: UnitType,
  toUnit: UnitType,
  densityGPerMl: number | null | undefined,
  itemLabel = 'Ingrediente'
): UnitConversionResult {
  if (quantity === 0) return { ok: true, value: 0 };
  if (fromUnit === toUnit) return { ok: true, value: quantity };

  // Volume -> Volume
  if (isVolumeUnit(fromUnit) && isVolumeUnit(toUnit)) {
    const inMl = fromUnit === 'L' ? quantity * 1000 : quantity;
    return { ok: true, value: toUnit === 'L' ? inMl / 1000 : inMl };
  }

  // Mass -> Mass
  if (isMassUnit(fromUnit) && isMassUnit(toUnit)) {
    const inG = fromUnit === 'kg' ? quantity * 1000 : quantity;
    return { ok: true, value: toUnit === 'kg' ? inG / 1000 : inG };
  }

  // Unit -> Unit
  if (fromUnit === 'un' || toUnit === 'un') {
    return {
      ok: false,
      value: 0,
      error: `${itemLabel}: não é possível converter entre "${fromUnit}" e "${toUnit}".`,
    };
  }

  // Mass <-> Volume requires density (g/ml)
  if (!densityGPerMl || densityGPerMl <= 0) {
    return {
      ok: false,
      value: 0,
      error: `${itemLabel}: conversão entre massa (${fromUnit}) e volume (${toUnit}) exige densidade cadastrada (g/ml).`,
    };
  }

  if (isMassUnit(fromUnit) && isVolumeUnit(toUnit)) {
    const grams = fromUnit === 'kg' ? quantity * 1000 : quantity;
    const ml = grams / densityGPerMl;
    return { ok: true, value: toUnit === 'L' ? ml / 1000 : ml };
  }

  // Volume -> Mass
  const ml = fromUnit === 'L' ? quantity * 1000 : quantity;
  const grams = ml * densityGPerMl;
  return { ok: true, value: toUnit === 'kg' ? grams / 1000 : grams };
}

/**
 * Computes proportional cost using full internal floating-point precision:
 * Acquisition = PurchasePrice + Freight
 * Cost per purchase unit = Acquisition / PurchasedQty
 * Effective used (converted to purchase unit) * Cost per purchase unit
 */
export function computeProportionalMaterialCost(params: {
  name: string;
  purchasedQty: number;
  purchaseUnit: UnitType;
  purchasePrice: number;
  freight: number;
  usedQty: number;
  usedUnit: UnitType;
  density: number | null | undefined;
  lossPercent?: number;
}): {
  ok: boolean;
  error?: string;
  totalAcquisitionCost: number;
  unitCostInPurchaseUnit: number;
  effectiveUsedInUsedUnit: number;
  effectiveUsedInPurchaseUnit: number;
  proportionalCost: number;
} {
  const totalAcquisitionCost = computeAcquisitionCost(params.purchasePrice, params.freight);
  if (params.purchasedQty <= 0) {
    return {
      ok: false,
      error: `${params.name}: quantidade comprada deve ser maior que zero.`,
      totalAcquisitionCost,
      unitCostInPurchaseUnit: 0,
      effectiveUsedInUsedUnit: 0,
      effectiveUsedInPurchaseUnit: 0,
      proportionalCost: 0,
    };
  }

  const lossFactor = 1 + Math.max(0, Number(params.lossPercent) || 0) / 100;
  const effectiveUsedInUsedUnit = Math.max(0, Number(params.usedQty) || 0) * lossFactor;

  const conv = convertQuantity(
    effectiveUsedInUsedUnit,
    params.usedUnit,
    params.purchaseUnit,
    params.density,
    params.name
  );

  if (!conv.ok) {
    return {
      ok: false,
      error: conv.error,
      totalAcquisitionCost,
      unitCostInPurchaseUnit: totalAcquisitionCost / params.purchasedQty,
      effectiveUsedInUsedUnit,
      effectiveUsedInPurchaseUnit: 0,
      proportionalCost: 0,
    };
  }

  const unitCostInPurchaseUnit = totalAcquisitionCost / params.purchasedQty;
  const proportionalCost = unitCostInPurchaseUnit * conv.value;

  return {
    ok: true,
    totalAcquisitionCost,
    unitCostInPurchaseUnit,
    effectiveUsedInUsedUnit,
    effectiveUsedInPurchaseUnit: conv.value,
    proportionalCost,
  };
}

/**
 * Calculates base production cost (for produced bases) or acquisition cost (for ready-made bases).
 */
export function evaluateBaseCost(base: BaseConfig, lossPercent = 0): {
  valid: boolean;
  errors: string[];
  compositionSum: number;
  batchTotalCost: number;
  unitCost: number;
  usedInFormulaCost: number;
  includedIngredientKeywords: string[];
} {
  const errors: string[] = [];
  const includedIngredientKeywords: string[] = [];

  if (base.mode === 'purchased_ready') {
    if (!base.baseName.trim()) {
      errors.push('Base pronta comprada: informe o nome da base.');
    }
    const totalAcq = computeAcquisitionCost(base.purchasePrice, base.freight);
    if (base.purchasedQty <= 0) {
      errors.push('Base pronta comprada: quantidade comprada deve ser maior que zero.');
      return {
        valid: false,
        errors,
        compositionSum: 100,
        batchTotalCost: totalAcq,
        unitCost: 0,
        usedInFormulaCost: 0,
        includedIngredientKeywords: ['alcool', 'agua', 'base'],
      };
    }

    const res = computeProportionalMaterialCost({
      name: base.baseName || 'Base pronta',
      purchasedQty: base.purchasedQty,
      purchaseUnit: base.purchaseUnit,
      purchasePrice: base.purchasePrice,
      freight: base.freight,
      usedQty: base.usedInFormulaQty,
      usedUnit: base.usedInFormulaUnit,
      density: base.density,
      lossPercent,
    });

    if (!res.ok && res.error) errors.push(res.error);

    return {
      valid: errors.length === 0,
      errors,
      compositionSum: 100,
      batchTotalCost: totalAcq,
      unitCost: res.unitCostInPurchaseUnit,
      usedInFormulaCost: res.proportionalCost,
      includedIngredientKeywords: ['alcool', 'agua', 'base'],
    };
  }

  // Predefined or Custom produced base
  if (base.mode === 'predefined') {
    const spec = PREDEFINED_BASES.find((b) => b.id === base.predefinedId);
    if (!spec) {
      errors.push('Selecione uma base predefinida válida.');
    } else if (spec.requiresPropChoice && !base.propChoice) {
      errors.push(`Base "${spec.name}": a escolha entre Propanediol e Propilenoglicol é obrigatória.`);
    }
  }

  const compositionSum = base.ingredients.reduce(
    (sum, item) => sum + (Number(item.percentage) || 0),
    0
  );

  if (Math.abs(compositionSum - 100) > 0.01) {
    errors.push(
      `A composição da base deve totalizar exatamente 100% (atual: ${compositionSum.toFixed(2)}%).`
    );
  }

  if (base.batchVolumeQty <= 0) {
    errors.push('Quantidade produzida da base deve ser maior que zero.');
  }

  let batchTotalCost = 0;
  for (const ing of base.ingredients) {
    const ingQtyInBatch = (base.batchVolumeQty * (Number(ing.percentage) || 0)) / 100;
    if (ingQtyInBatch > 0 && ing.purchasedQty > 0) {
      const calc = computeProportionalMaterialCost({
        name: `Base -> ${ing.name}`,
        purchasedQty: ing.purchasedQty,
        purchaseUnit: ing.purchaseUnit,
        purchasePrice: ing.purchasePrice,
        freight: ing.freight,
        usedQty: ingQtyInBatch,
        usedUnit: ing.usedUnit || base.batchUnit,
        density: ing.density,
        lossPercent: 0, // loss is applied once at perfume level to avoid double loss
      });
      if (!calc.ok && calc.error) errors.push(calc.error);
      batchTotalCost += calc.proportionalCost;
    } else if (ingQtyInBatch > 0 && ing.purchasePrice > 0 && ing.purchasedQty <= 0) {
      errors.push(`Base -> ${ing.name}: informe a quantidade comprada.`);
    }

    const lower = ing.name.toLowerCase();
    if (lower.includes('álcool') || lower.includes('alcool')) includedIngredientKeywords.push('alcool');
    if (lower.includes('água') || lower.includes('agua')) includedIngredientKeywords.push('agua');
    if (lower.includes('iso e')) includedIngredientKeywords.push('iso e');
    if (lower.includes('ambroxan')) includedIngredientKeywords.push('ambroxan');
    if (lower.includes('propanediol')) includedIngredientKeywords.push('propanediol');
    if (lower.includes('propilenoglicol')) includedIngredientKeywords.push('propilenoglicol');
    if (lower.includes('blend turbo')) includedIngredientKeywords.push('blend turbo');
    if (lower.includes('hedione')) includedIngredientKeywords.push('hedione');
    if (lower.includes('galaxolide')) includedIngredientKeywords.push('galaxolide');
  }

  const unitCost = base.batchVolumeQty > 0 ? batchTotalCost / base.batchVolumeQty : 0;

  // Convert usedInFormulaQty to base.batchUnit if needed
  const convUsed = convertQuantity(
    base.usedInFormulaQty * (1 + Math.max(0, lossPercent) / 100),
    base.usedInFormulaUnit,
    base.batchUnit,
    base.density,
    base.baseName || 'Base'
  );

  if (!convUsed.ok && convUsed.error) {
    errors.push(convUsed.error);
  }

  const usedInFormulaCost = convUsed.ok ? unitCost * convUsed.value : 0;

  return {
    valid: errors.length === 0,
    errors,
    compositionSum,
    batchTotalCost,
    unitCost,
    usedInFormulaCost,
    includedIngredientKeywords: Array.from(new Set(includedIngredientKeywords)),
  };
}

/**
 * Selling price calculation strictly separating Margin on Selling Price vs Markup on Cost.
 */
export function calculateSellingPrice(
  productionCost: number,
  pricing: PricingConfig
): {
  productionCost: number;
  extraCosts: number;
  deductionsValue: number;
  suggestedPrice: number;
  estimatedProfit: number;
  effectiveMarginPercent: number;
  effectiveMarkupPercent: number;
  warning?: string;
} {
  const extraCosts = Math.max(0, Number(pricing.extraCostsValue) || 0);
  const totalBaseCost = Math.max(0, productionCost) + extraCosts;
  const feesRate =
    (Math.max(0, Number(pricing.paymentFeePercent) || 0) +
      Math.max(0, Number(pricing.taxPercent) || 0) +
      Math.max(0, Number(pricing.commissionPercent) || 0)) /
    100;

  let suggestedPrice = 0;
  let warning: string | undefined;

  if (pricing.pricingMode === 'margin') {
    const desiredMarginRate = Math.max(0, Number(pricing.targetPercent) || 0) / 100;
    const denominator = 1 - desiredMarginRate - feesRate;
    if (denominator <= 0.0001) {
      warning =
        'A soma de margem desejada + taxas + impostos + comissão atingiu ou superou 100% do preço de venda.';
      suggestedPrice = totalBaseCost * 2;
    } else {
      suggestedPrice = totalBaseCost / denominator;
    }
  } else {
    // Markup sobre o custo: Preço bruto antes de taxas = custo * (1 + markup),
    // e caso haja taxas sobre venda, ajustamos para preservar o lucro ou aplicamos direto.
    // Fórmula clara: Preço = (CustoTotal * (1 + Markup%)) / (1 - TaxasVenda%) quando taxas > 0,
    // ou se usuário quer markup simples sobre custo sem embutir taxas: vamos calcular markup direto sobre custo total e deduzir taxas no lucro estimado!
    const markupRate = Math.max(0, Number(pricing.targetPercent) || 0) / 100;
    suggestedPrice = totalBaseCost * (1 + markupRate);
  }

  const deductionsValue = suggestedPrice * feesRate;
  const estimatedProfit = suggestedPrice - totalBaseCost - deductionsValue;
  const effectiveMarginPercent =
    suggestedPrice > 0 ? (estimatedProfit / suggestedPrice) * 100 : 0;
  const effectiveMarkupPercent =
    totalBaseCost > 0 ? ((suggestedPrice - totalBaseCost) / totalBaseCost) * 100 : 0;

  return {
    productionCost,
    extraCosts,
    deductionsValue,
    suggestedPrice,
    estimatedProfit,
    effectiveMarginPercent,
    effectiveMarkupPercent,
    warning,
  };
}

export interface EssenceYieldSummary {
  hasEssence: boolean;
  essenceQty: number;
  essenceUnit: UnitType;
  essenceMlEquivalent: number;
  concentrationPct: number;
  totalPerfumeMl: number;
  baseNeededMl: number;
  bottlesCount: number;
  exactBottlesCount: number;
  leftoverMl: number;
  estimatedWithoutDensity: boolean;
}

/**
 * Computes total perfume batch yield and required base from total essence quantity and target concentration (%).
 * Example: 100 ml essence at 26% -> 384.62 ml total perfume -> 284.62 ml base.
 */
export function computeEssenceYieldSummary(
  draft: PerfumeFormulaDraft
): EssenceYieldSummary {
  const concentrationPct = Math.max(0, Number(draft.essenceConcentrationPct) || 0);
  let essenceQty = 0;
  let essenceMlEquivalent = 0;
  let essenceUnit: UnitType = 'ml';
  let estimatedWithoutDensity = false;

  for (const mat of draft.rawMaterials) {
    if (mat.role !== 'essencia') continue;
    const rawQty =
      draft.inputMode === 'absolute'
        ? Math.max(0, Number(mat.usedQty) || 0)
        : (draft.targetVolumeMl * Math.max(0, Number(mat.usedPercentage) || 0)) / 100;
    if (rawQty <= 0) continue;

    essenceQty += rawQty;
    essenceUnit = mat.usedUnit;

    const convMl = convertQuantity(rawQty, mat.usedUnit, 'ml', mat.density, mat.name);
    if (convMl.ok) {
      essenceMlEquivalent += convMl.value;
    } else if (isMassUnit(mat.usedUnit)) {
      const grams = mat.usedUnit === 'kg' ? rawQty * 1000 : rawQty;
      essenceMlEquivalent += grams;
      estimatedWithoutDensity = true;
    }
  }

  let extraNonBaseMl = 0;
  for (const mat of draft.rawMaterials) {
    if (mat.role === 'essencia') continue;
    if ((mat.role === 'alcool' || mat.role === 'agua') && !mat.isExtraOverBase) continue;
    const rawQty =
      draft.inputMode === 'absolute'
        ? Math.max(0, Number(mat.usedQty) || 0)
        : (draft.targetVolumeMl * Math.max(0, Number(mat.usedPercentage) || 0)) / 100;
    if (rawQty <= 0) continue;
    const convMl = convertQuantity(rawQty, mat.usedUnit, 'ml', mat.density, mat.name);
    if (convMl.ok) extraNonBaseMl += convMl.value;
  }

  for (const qa of draft.qas) {
    if (!qa.addToPerfume) continue;
    const rawQty =
      draft.inputMode === 'absolute'
        ? Math.max(0, Number(qa.usedQty) || 0)
        : (draft.targetVolumeMl * Math.max(0, Number(qa.usedPercentage) || 0)) / 100;
    if (rawQty <= 0) continue;
    const convMl = convertQuantity(rawQty, qa.usedUnit, 'ml', qa.density, qa.name);
    if (convMl.ok) extraNonBaseMl += convMl.value;
  }

  const totalPerfumeMl =
    essenceMlEquivalent > 0 && concentrationPct > 0
      ? essenceMlEquivalent / (concentrationPct / 100)
      : 0;
  const baseNeededMl =
    totalPerfumeMl > 0
      ? Math.max(0, totalPerfumeMl - essenceMlEquivalent - extraNonBaseMl)
      : 0;

  const bottleSize = Math.max(0, Number(draft.targetVolumeMl) || 0);
  const exactBottlesCount = bottleSize > 0 && totalPerfumeMl > 0 ? totalPerfumeMl / bottleSize : 0;
  const bottlesCount = Math.floor(exactBottlesCount);
  const leftoverMl =
    bottleSize > 0 && totalPerfumeMl > 0
      ? Math.max(0, totalPerfumeMl - bottlesCount * bottleSize)
      : 0;

  return {
    hasEssence: essenceMlEquivalent > 0,
    essenceQty,
    essenceUnit,
    essenceMlEquivalent,
    concentrationPct,
    totalPerfumeMl,
    baseNeededMl,
    bottlesCount,
    exactBottlesCount,
    leftoverMl,
    estimatedWithoutDensity,
  };
}

/**
 * Resolves effective used quantity when formula is specified in absolute units OR mass/volume percentage.
 */
function resolveEffectiveQtyAndUnit(
  item: {
    name: string;
    usedQty: number;
    usedUnit: UnitType;
    usedPercentage?: number;
    density: number | null;
  },
  draft: PerfumeFormulaDraft,
  errors: string[],
  allowMassFallbackForVolume = false
): { qty: number; unit: UnitType; volumeMl: number } {
  if (draft.inputMode === 'absolute') {
    const convMl = convertQuantity(
      item.usedQty,
      item.usedUnit,
      'ml',
      item.density,
      item.name
    );
    const fallbackMl =
      !convMl.ok && allowMassFallbackForVolume && isMassUnit(item.usedUnit)
        ? item.usedUnit === 'kg'
          ? item.usedQty * 1000
          : item.usedQty
        : 0;
    return {
      qty: item.usedQty,
      unit: item.usedUnit,
      volumeMl: convMl.ok ? convMl.value : fallbackMl,
    };
  }

  const pct = Math.max(0, Number(item.usedPercentage) || 0);
  if (draft.inputMode === 'volume_percent') {
    const volMl = (draft.targetVolumeMl * pct) / 100;
    const convTarget = convertQuantity(volMl, 'ml', item.usedUnit, item.density, item.name);
    if (!convTarget.ok && convTarget.error) errors.push(convTarget.error);
    return {
      qty: convTarget.ok ? convTarget.value : volMl,
      unit: convTarget.ok ? item.usedUnit : 'ml',
      volumeMl: volMl,
    };
  }

  // mass_percent: requires knowing total mass or density
  // Let's compute total mass using targetVolumeMl as base mass reference (1g/ml nominal unless density given, or targetVolumeMl grams)
  // Better: in mass_percent mode, target mass in grams = targetVolumeMl (assuming 1:1 batch mass in g if user enters g, or converted via density)
  const grams = (draft.targetVolumeMl * pct) / 100;
  const convTarget = convertQuantity(grams, 'g', item.usedUnit, item.density, item.name);
  if (!convTarget.ok && convTarget.error) errors.push(convTarget.error);
  const convMl = convertQuantity(grams, 'g', 'ml', item.density, item.name);
  return {
    qty: convTarget.ok ? convTarget.value : grams,
    unit: convTarget.ok ? item.usedUnit : 'g',
    volumeMl: convMl.ok ? convMl.value : grams,
  };
}

/**
 * Main calculation engine for the complete perfume formulation.
 */
export function calculatePerfumeCost(
  draft: PerfumeFormulaDraft,
  insumosLibrary: Insumo[] = []
): CalculationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const duplicateWarnings: string[] = [];
  const lines: CalculationCostLine[] = [];

  if (!draft.inspiredBy.trim()) {
    errors.push('Etapa 1: o campo "Perfume inspirado em" é obrigatório.');
  }

  if (draft.targetVolumeMl <= 0) {
    errors.push('O volume alvo da preparação deve ser maior que zero.');
  }

  // Validate percentage mode sum if applicable
  if (draft.inputMode !== 'absolute') {
    const matPct = draft.rawMaterials.reduce((s, m) => s + (Number(m.usedPercentage) || 0), 0);
    const qaPct = draft.qas.reduce(
      (s, q) => s + (q.addToPerfume === false ? 0 : Number(q.usedPercentage) || 0),
      0
    );
    const basePct = Number(draft.base.usedPercentage) || 0;
    const totalPct = matPct + qaPct + basePct;
    if (Math.abs(totalPct - 100) > 0.05) {
      errors.push(
        `No modo percentual (${draft.inputMode === 'mass_percent' ? '% m/m' : '% v/v'}), a soma dos ingredientes e da base deve totalizar 100% (atual: ${totalPct.toFixed(2)}%).`
      );
    }
  }

  // 1. Evaluate Base first so we know what ingredients are already inside it
  const baseForCalc: BaseConfig = { ...draft.base };
  if (draft.inputMode !== 'absolute' && draft.base.usedPercentage !== undefined) {
    const basePct = Math.max(0, Number(draft.base.usedPercentage) || 0);
    if (draft.inputMode === 'volume_percent') {
      baseForCalc.usedInFormulaQty = (draft.targetVolumeMl * basePct) / 100;
      baseForCalc.usedInFormulaUnit = 'ml';
    } else {
      const grams = (draft.targetVolumeMl * basePct) / 100;
      const conv = convertQuantity(grams, 'g', baseForCalc.usedInFormulaUnit, baseForCalc.density, 'Base');
      if (conv.ok) baseForCalc.usedInFormulaQty = conv.value;
    }
  }

  const baseEval = evaluateBaseCost(baseForCalc, draft.lossPercent);
  errors.push(...baseEval.errors);

  if (baseForCalc.usedInFormulaQty <= 0) {
    warnings.push('Quantidade utilizada da base está zerada.');
  } else {
    lines.push({
      name: baseForCalc.baseName || 'Base do Perfume',
      group: 'Base',
      insumoId: baseForCalc.purchasedBaseInsumoId || null,
      usedQty: baseForCalc.usedInFormulaQty,
      usedUnit: baseForCalc.usedInFormulaUnit,
      effectiveQtyWithLoss: baseForCalc.usedInFormulaQty * (1 + Math.max(0, draft.lossPercent) / 100),
      unitCostAtCalc: baseEval.unitCost,
      totalAcquisitionCost: baseEval.batchTotalCost,
      proportionalCost: baseEval.usedInFormulaCost,
      concentration: null,
      pureActiveEquivalentQty: null,
    });
  }

  // 2. Evaluate Raw Materials (Essência, Álcool, Água, Outros)
  let essenceCost = 0;
  let alcoholCost = 0;
  let waterCost = 0;
  let otherIngredientsCost = 0;
  let totalLiquidMl = 0;

  const baseConvMl = convertQuantity(
    baseForCalc.usedInFormulaQty,
    baseForCalc.usedInFormulaUnit,
    'ml',
    baseForCalc.density,
    'Base'
  );
  if (baseConvMl.ok) totalLiquidMl += baseConvMl.value;

  const hasEssence = draft.rawMaterials.some(
    (m) => m.role === 'essencia' && (draft.inputMode === 'absolute' ? m.usedQty > 0 : (m.usedPercentage || 0) > 0)
  );
  if (!hasEssence) {
    errors.push('Etapa 2: a Essência é obrigatória e deve ter quantidade maior que zero.');
  }

  for (const mat of draft.rawMaterials) {
    const resolved = resolveEffectiveQtyAndUnit(
      mat,
      draft,
      errors,
      mat.role === 'essencia'
    );
    if (resolved.qty <= 0) continue;

    // Duplicate check against base
    const lowerName = mat.name.toLowerCase();
    const matchesBaseAlcohol =
      (mat.role === 'alcool' || lowerName.includes('álcool') || lowerName.includes('alcool')) &&
      baseEval.includedIngredientKeywords.includes('alcool');
    const matchesBaseWater =
      (mat.role === 'agua' || lowerName.includes('água') || lowerName.includes('agua')) &&
      baseEval.includedIngredientKeywords.includes('agua');

    if ((matchesBaseAlcohol || matchesBaseWater) && !mat.isExtraOverBase) {
      duplicateWarnings.push(
        `"${mat.name}" já está incorporado na Base selecionada. Para evitar custo duplicado, zere este item ou marque explicitamente como "Quantidade extra fora da base".`
      );
      // Do not double-charge unless explicitly marked as extra!
      continue;
    }

    const calc = computeProportionalMaterialCost({
      name: mat.name,
      purchasedQty: mat.purchasedQty,
      purchaseUnit: mat.purchaseUnit,
      purchasePrice: mat.purchasePrice,
      freight: mat.freight,
      usedQty: resolved.qty,
      usedUnit: resolved.unit,
      density: mat.density,
      lossPercent: draft.lossPercent,
    });

    if (!calc.ok && calc.error) errors.push(calc.error);

    totalLiquidMl += resolved.volumeMl;

    const group: CalculationCostLine['group'] =
      mat.role === 'essencia'
        ? 'Essência'
        : mat.role === 'alcool'
          ? 'Álcool'
          : mat.role === 'agua'
            ? 'Água'
            : 'Outros Ingredientes';

    if (group === 'Essência') essenceCost += calc.proportionalCost;
    else if (group === 'Álcool') alcoholCost += calc.proportionalCost;
    else if (group === 'Água') waterCost += calc.proportionalCost;
    else otherIngredientsCost += calc.proportionalCost;

    const pureEq =
      mat.concentration && mat.concentration > 0 && mat.concentration < 100
        ? resolved.qty * (mat.concentration / 100)
        : null;

    lines.push({
      name: mat.isExtraOverBase ? `${mat.name} (Extra)` : mat.name,
      group,
      insumoId: mat.insumoId,
      usedQty: resolved.qty,
      usedUnit: resolved.unit,
      effectiveQtyWithLoss: calc.effectiveUsedInUsedUnit,
      unitCostAtCalc: calc.unitCostInPurchaseUnit,
      totalAcquisitionCost: calc.totalAcquisitionCost,
      proportionalCost: calc.proportionalCost,
      concentration: mat.concentration,
      pureActiveEquivalentQty: pureEq,
    });
  }

  // 3. Evaluate QAs and Additives (only those explicitly added directly to the perfume;
  // by default QAs in Etapa 3 hold reference pricing for Etapa 4 Base)
  let qasCost = 0;
  for (const qa of draft.qas) {
    if (qa.addToPerfume === false) continue;
    const resolved = resolveEffectiveQtyAndUnit(qa, draft, errors);
    if (resolved.qty <= 0) continue;

    const lower = qa.name.toLowerCase();
    const matchedKeyword = baseEval.includedIngredientKeywords.find((kw) => lower.includes(kw));
    if (matchedKeyword && !qa.isExtraOverBase) {
      duplicateWarnings.push(
        `QA "${qa.name}" já compõe a Base selecionada. Para evitar cobrança duplicada, ele foi desconsiderado do custo adicional — marque como "Extra fora da base" caso deseje somar uma dose extra.`
      );
      continue;
    }

    const calc = computeProportionalMaterialCost({
      name: qa.name,
      purchasedQty: qa.purchasedQty,
      purchaseUnit: qa.purchaseUnit,
      purchasePrice: qa.purchasePrice,
      freight: qa.freight,
      usedQty: resolved.qty,
      usedUnit: resolved.unit,
      density: qa.density,
      lossPercent: draft.lossPercent,
    });

    if (!calc.ok && calc.error) errors.push(calc.error);
    totalLiquidMl += resolved.volumeMl;
    qasCost += calc.proportionalCost;

    const pureEq =
      qa.concentration && qa.concentration > 0
        ? resolved.qty * (qa.concentration / 100)
        : null;

    lines.push({
      name: qa.isExtraOverBase ? `${qa.name} (Extra)` : qa.name,
      group: 'QAs e Aditivos',
      insumoId: qa.insumoId,
      usedQty: resolved.qty,
      usedUnit: resolved.unit,
      effectiveQtyWithLoss: calc.effectiveUsedInUsedUnit,
      unitCostAtCalc: calc.unitCostInPurchaseUnit,
      totalAcquisitionCost: calc.totalAcquisitionCost,
      proportionalCost: calc.proportionalCost,
      concentration: qa.concentration,
      pureActiveEquivalentQty: pureEq,
    });
  }

  // 4. Bottle and Components (Mutually exclusive!)
  let bottleCost = 0;
  let valveCost = 0;
  let capCost = 0;

  if (draft.bottle.mode === 'complete') {
    const c = draft.bottle.complete;
    const effectiveUsedQty = Math.max(0, Number(c.usedQty ?? 1));
    if (!c.name.trim()) {
      errors.push('Etapa 5: informe o modelo do frasco completo.');
    } else if (c.purchasedQty <= 0) {
      errors.push('Etapa 5: quantidade comprada do frasco deve ser maior que zero.');
    } else if (effectiveUsedQty <= 0) {
      errors.push('Etapa 5: quantidade usada do frasco deve ser maior que zero.');
    } else {
      const calc = computeProportionalMaterialCost({
        name: c.name,
        purchasedQty: c.purchasedQty,
        purchaseUnit: 'un',
        purchasePrice: c.purchasePrice,
        freight: c.freight,
        usedQty: effectiveUsedQty,
        usedUnit: 'un',
        density: null,
        lossPercent: 0,
      });
      if (!calc.ok && calc.error) errors.push(calc.error);
      bottleCost = calc.proportionalCost;
      lines.push({
        name: c.name,
        group: 'Frasco',
        insumoId: c.insumoId,
        usedQty: effectiveUsedQty,
        usedUnit: 'un',
        effectiveQtyWithLoss: effectiveUsedQty,
        unitCostAtCalc: calc.unitCostInPurchaseUnit,
        totalAcquisitionCost: calc.totalAcquisitionCost,
        proportionalCost: calc.proportionalCost,
        concentration: null,
        pureActiveEquivalentQty: null,
      });
    }
  } else {
    const parts = [
      { key: 'vidro', label: 'Vidro', item: draft.bottle.parts.vidro },
      { key: 'valvula', label: 'Válvula', item: draft.bottle.parts.valvula },
      { key: 'sobretampa', label: 'Sobretampa', item: draft.bottle.parts.sobretampa },
    ];
    let hasAnyPart = false;
    for (const p of parts) {
      const effectiveUsedQty = Math.max(0, Number(p.item.usedQty ?? 1));
      if ((!p.item.name.trim() && p.item.purchasePrice === 0) || effectiveUsedQty <= 0) {
        continue;
      }
      hasAnyPart = true;
      const calc = computeProportionalMaterialCost({
        name: `${p.label}: ${p.item.name || p.label}`,
        purchasedQty: p.item.purchasedQty,
        purchaseUnit: 'un',
        purchasePrice: p.item.purchasePrice,
        freight: p.item.freight,
        usedQty: effectiveUsedQty,
        usedUnit: 'un',
        density: null,
        lossPercent: 0,
      });
      if (!calc.ok && calc.error) errors.push(calc.error);
      if (p.key === 'vidro') bottleCost += calc.proportionalCost;
      if (p.key === 'valvula') valveCost += calc.proportionalCost;
      if (p.key === 'sobretampa') capCost += calc.proportionalCost;

      lines.push({
        name: `${p.label}: ${p.item.name || p.label}`,
        group: 'Frasco',
        insumoId: p.item.insumoId,
        usedQty: effectiveUsedQty,
        usedUnit: 'un',
        effectiveQtyWithLoss: effectiveUsedQty,
        unitCostAtCalc: calc.unitCostInPurchaseUnit,
        totalAcquisitionCost: calc.totalAcquisitionCost,
        proportionalCost: calc.proportionalCost,
        concentration: null,
        pureActiveEquivalentQty: null,
      });
    }
    if (!hasAnyPart) {
      errors.push('Etapa 5: selecione ou informe ao menos um componente do frasco (vidro, válvula ou sobretampa) com quantidade usada maior que zero.');
    }
  }

  const bottleTotalCost = bottleCost + valveCost + capCost;

  // 5. Packaging & Finishing (Optional)
  let packagingItemsCost = 0;
  for (const pkg of draft.packaging) {
    if (!pkg.name.trim() || pkg.usedQty <= 0) continue;
    const calc = computeProportionalMaterialCost({
      name: pkg.name,
      purchasedQty: pkg.purchasedQty,
      purchaseUnit: pkg.purchaseUnit || 'un',
      purchasePrice: pkg.purchasePrice,
      freight: pkg.freight,
      usedQty: pkg.usedQty,
      usedUnit: pkg.purchaseUnit || 'un',
      density: null,
      lossPercent: 0,
    });
    if (!calc.ok && calc.error) errors.push(calc.error);
    packagingItemsCost += calc.proportionalCost;

    lines.push({
      name: pkg.name,
      group: 'Embalagem',
      insumoId: pkg.insumoId,
      usedQty: pkg.usedQty,
      usedUnit: pkg.purchaseUnit || 'un',
      effectiveQtyWithLoss: pkg.usedQty,
      unitCostAtCalc: calc.unitCostInPurchaseUnit,
      totalAcquisitionCost: calc.totalAcquisitionCost,
      proportionalCost: calc.proportionalCost,
      concentration: null,
      pureActiveEquivalentQty: null,
    });
  }

  const baseCostRaw = baseEval.usedInFormulaCost;
  const additionalIngredientsCostRaw =
    essenceCost + alcoholCost + waterCost + qasCost + otherIngredientsCost;
  const batchLiquidCostTotal = baseCostRaw + additionalIngredientsCostRaw;
  const packagingTotalCost = bottleTotalCost + packagingItemsCost;

  const batchLiquidVolumeMl = totalLiquidMl > 0 ? totalLiquidMl : draft.targetVolumeMl;
  const concentrationPct = Math.max(0, Number(draft.essenceConcentrationPct) || 0);
  const yieldSummary = computeEssenceYieldSummary(draft);

  const activeAdditionalBottles = (draft.additionalBottles || []).filter(
    (b) => Number(b.capacityMl) > 0 && Math.floor(Number(b.fillCount) || 0) > 0
  );

  for (const b of activeAdditionalBottles) {
    if ((Number(b.purchasedQty) || 0) <= 0) {
      errors.push(`Etapa 5: quantidade comprada de "${b.name || 'frasco adicional'}" deve ser maior que zero.`);
    }
  }

  const isMultiBottleBatch =
    draft.inputMode === 'absolute' &&
    draft.targetVolumeMl > 0 &&
    ((concentrationPct > 0 &&
      draft.autoCalcBaseFromEssence !== false &&
      batchLiquidVolumeMl > draft.targetVolumeMl * 1.01) ||
      activeAdditionalBottles.length > 0);

  const primaryCapacityMl = Math.max(0, Number(draft.targetVolumeMl) || 0);
  const additionalBottledMl = activeAdditionalBottles.reduce(
    (s, b) => s + Number(b.capacityMl) * Math.floor(Number(b.fillCount) || 0),
    0
  );
  const additionalBottlesCount = activeAdditionalBottles.reduce(
    (s, b) => s + Math.floor(Number(b.fillCount) || 0),
    0
  );

  const primaryBottleFillCount =
    draft.primaryBottleFillCount !== undefined && draft.primaryBottleFillCount !== null
      ? Math.max(0, Math.floor(Number(draft.primaryBottleFillCount) || 0))
      : primaryCapacityMl > 0
        ? Math.max(
            0,
            Math.floor(
              Math.max(0, batchLiquidVolumeMl - additionalBottledMl) / primaryCapacityMl
            )
          )
        : 0;

  const primaryBottledMl = primaryBottleFillCount * primaryCapacityMl;
  const totalBottledMl = primaryBottledMl + additionalBottledMl;
  const batchBottlesCount = primaryBottleFillCount + additionalBottlesCount;
  const batchExactBottlesCount =
    primaryCapacityMl > 0 ? batchLiquidVolumeMl / primaryCapacityMl : 0;
  const batchLeftoverMl = Math.max(0, batchLiquidVolumeMl - totalBottledMl);

  if (isMultiBottleBatch && totalBottledMl > batchLiquidVolumeMl + 0.05) {
    warnings.push(
      `O volume total selecionado nos frascos (${roundQuantity(totalBottledMl, 1)} ml) excede o líquido disponível no lote (${roundQuantity(batchLiquidVolumeMl, 1)} ml).`
    );
  }

  const includeLeftoverInLiquidCost = draft.includeLeftoverInLiquidCost !== false;
  const canAbsorbLeftover =
    isMultiBottleBatch &&
    includeLeftoverInLiquidCost &&
    totalBottledMl > 0 &&
    totalBottledMl <= batchLiquidVolumeMl + 0.05;

  const effectiveDivisorMl = canAbsorbLeftover ? totalBottledMl : batchLiquidVolumeMl;

  const unitLiquidScale = isMultiBottleBatch
    ? effectiveDivisorMl > 0
      ? primaryCapacityMl / effectiveDivisorMl
      : 1
    : 1;

  const scaledEssenceCost = essenceCost * unitLiquidScale;
  const scaledAlcoholCost = alcoholCost * unitLiquidScale;
  const scaledWaterCost = waterCost * unitLiquidScale;
  const scaledQasCost = qasCost * unitLiquidScale;
  const scaledBaseCost = baseCostRaw * unitLiquidScale;
  const scaledOtherIngredientsCost = otherIngredientsCost * unitLiquidScale;
  const scaledAdditionalIngredientsCost = additionalIngredientsCostRaw * unitLiquidScale;
  const liquidCostTotal = batchLiquidCostTotal * unitLiquidScale;
  const unitCostTotal = liquidCostTotal + packagingTotalCost;

  const allocations: BottleAllocationSummary[] = [];
  const primaryName =
    draft.bottle.mode === 'complete'
      ? draft.bottle.complete.name.trim() || `Frasco ${primaryCapacityMl} ml`
      : `Frasco por partes ${primaryCapacityMl} ml`;

  if (primaryBottleFillCount > 0 || activeAdditionalBottles.length === 0) {
    const baseLiquidPerUnit =
      batchLiquidVolumeMl > 0
        ? batchLiquidCostTotal * (primaryCapacityMl / batchLiquidVolumeMl)
        : 0;
    const effectiveLiquidPerUnit =
      effectiveDivisorMl > 0
        ? batchLiquidCostTotal * (primaryCapacityMl / effectiveDivisorMl)
        : 0;
    const absorbedPerUnit = canAbsorbLeftover
      ? Math.max(0, effectiveLiquidPerUnit - baseLiquidPerUnit)
      : 0;
    const unitTotal = effectiveLiquidPerUnit + packagingTotalCost;
    allocations.push({
      id: 'primary',
      isPrimary: true,
      insumoId: draft.bottle.mode === 'complete' ? draft.bottle.complete.insumoId : null,
      name: primaryName,
      capacityMl: primaryCapacityMl,
      fillCount: primaryBottleFillCount,
      totalMl: primaryBottledMl,
      liquidCostPerUnit: effectiveLiquidPerUnit,
      leftoverAbsorbedPerUnit: absorbedPerUnit,
      bottleOnlyCostPerUnit: bottleTotalCost,
      packagingItemsCostPerUnit: packagingItemsCost,
      packagingTotalCostPerUnit: packagingTotalCost,
      unitCostTotal: unitTotal,
      totalAllocationCost: primaryBottleFillCount * unitTotal,
    });
  }

  for (const b of activeAdditionalBottles) {
    const fill = Math.floor(Number(b.fillCount) || 0);
    const capMl = Number(b.capacityMl) || 0;
    const usedCount = Math.max(0, Number(b.usedQty ?? 1));
    const unitBottleOnly =
      computeUnitCost(b.purchasedQty, b.purchasePrice, b.freight) * usedCount;
    const pkgTotal = unitBottleOnly + packagingItemsCost;
    const baseLiquidPerUnit =
      batchLiquidVolumeMl > 0 ? batchLiquidCostTotal * (capMl / batchLiquidVolumeMl) : 0;
    const effectiveLiquidPerUnit =
      effectiveDivisorMl > 0 ? batchLiquidCostTotal * (capMl / effectiveDivisorMl) : 0;
    const absorbedPerUnit = canAbsorbLeftover
      ? Math.max(0, effectiveLiquidPerUnit - baseLiquidPerUnit)
      : 0;
    const unitTotal = effectiveLiquidPerUnit + pkgTotal;

    allocations.push({
      id: b.id,
      isPrimary: false,
      insumoId: b.insumoId,
      name: b.name.trim() || `Frasco ${capMl} ml`,
      capacityMl: capMl,
      fillCount: fill,
      totalMl: fill * capMl,
      liquidCostPerUnit: effectiveLiquidPerUnit,
      leftoverAbsorbedPerUnit: absorbedPerUnit,
      bottleOnlyCostPerUnit: unitBottleOnly,
      packagingItemsCostPerUnit: packagingItemsCost,
      packagingTotalCostPerUnit: pkgTotal,
      unitCostTotal: unitTotal,
      totalAllocationCost: fill * unitTotal,
    });
  }

  const batchPackagingCostTotal = allocations.reduce(
    (s, a) => s + a.fillCount * a.packagingTotalCostPerUnit,
    0
  );
  const totalBatchCostWithBottles = batchLiquidCostTotal + batchPackagingCostTotal;
  const leftoverLiquidCostTotal =
    batchLiquidVolumeMl > 0 ? batchLiquidCostTotal * (batchLeftoverMl / batchLiquidVolumeMl) : 0;
  const primaryAllocation = allocations.find((a) => a.isPrimary);

  const batchSummary =
    concentrationPct > 0 || isMultiBottleBatch
      ? {
          isBatch: isMultiBottleBatch,
          essenceQty: yieldSummary.essenceQty,
          essenceUnit: yieldSummary.essenceUnit,
          concentrationPct,
          batchVolumeMl: batchLiquidVolumeMl,
          baseNeededMl: yieldSummary.baseNeededMl,
          batchLiquidCostTotal,
          batchEssenceCost: essenceCost,
          batchBaseCost: baseCostRaw,
          bottlesCount: batchBottlesCount,
          exactBottlesCount: batchExactBottlesCount,
          leftoverMl: batchLeftoverMl,
          totalBottledMl,
          includeLeftoverInLiquidCost,
          leftoverLiquidCostTotal,
          leftoverAbsorbedPerPrimaryUnit: primaryAllocation
            ? primaryAllocation.leftoverAbsorbedPerUnit
            : 0,
          primaryBottleFillCount,
          allocations,
          batchPackagingCostTotal,
          totalBatchCostWithBottles,
          estimatedWithoutDensity: yieldSummary.estimatedWithoutDensity,
        }
      : null;

  // Consistency check between liquid volume and target volume
  const referenceVolume = totalLiquidMl > 0 ? totalLiquidMl : draft.targetVolumeMl;
  if (
    !isMultiBottleBatch &&
    draft.inputMode === 'absolute' &&
    totalLiquidMl > 0 &&
    Math.abs(totalLiquidMl - draft.targetVolumeMl) > 1
  ) {
    warnings.push(
      `Soma dos volumes líquidos (${totalLiquidMl.toFixed(1)} ml) difere do volume alvo (${draft.targetVolumeMl} ml). O simulador de tamanhos escalará proporcionalmente com base na composição real (${totalLiquidMl.toFixed(1)} ml).`
    );
  }

  // 6. Multi-size Simulator (strictly scales by user's real formula proportions!)
  const sizesToSimulate = Array.from(
    new Set([
      ...(draft.selectedSizes || []),
      ...(draft.customSizeMl && draft.customSizeMl > 0 ? [draft.customSizeMl] : []),
    ])
  ).sort((a, b) => a - b);

  const liquidBaselineMl = referenceVolume > 0 ? referenceVolume : 1;

  const sizeComparisons: SizeSimulationRow[] = sizesToSimulate.map((sizeMl) => {
    const scaleFactor = sizeMl / liquidBaselineMl;

    let simEssenceQty = 0;
    let simEssenceUnit: UnitType = 'ml';
    let simBaseQty = 0;
    let simBaseUnit: UnitType = baseForCalc.usedInFormulaUnit;
    let simQasQty = 0;
    let simAlcoholQty = 0;
    let simWaterQty = 0;
    let simLiquidCost = 0;

    const breakdown: SizeSimulationRow['ingredientsBreakdown'] = [];

    for (const line of lines) {
      if (line.group === 'Frasco' || line.group === 'Embalagem') continue;

      const scaledQty = line.usedQty * scaleFactor;
      const scaledCost = line.proportionalCost * scaleFactor;
      simLiquidCost += scaledCost;

      if (line.group === 'Essência') {
        simEssenceQty += scaledQty;
        simEssenceUnit = line.usedUnit;
      } else if (line.group === 'Base') {
        simBaseQty += scaledQty;
        simBaseUnit = line.usedUnit;
      } else if (line.group === 'QAs e Aditivos') {
        simQasQty += scaledQty;
      } else if (line.group === 'Álcool') {
        simAlcoholQty += scaledQty;
      } else if (line.group === 'Água') {
        simWaterQty += scaledQty;
      }

      breakdown.push({
        name: line.name,
        group: line.group,
        qty: scaledQty,
        unit: line.usedUnit,
        cost: scaledCost,
      });
    }

    return {
      sizeMl,
      essenceQty: simEssenceQty,
      essenceUnit: simEssenceUnit,
      baseQty: simBaseQty,
      baseUnit: simBaseUnit,
      qasQty: simQasQty,
      alcoholQty: simAlcoholQty,
      waterQty: simWaterQty,
      liquidCost: simLiquidCost,
      bottleAndPackagingCost: packagingTotalCost,
      unitCost: simLiquidCost + packagingTotalCost,
      ingredientsBreakdown: breakdown,
    };
  });

  // 7. Stock Capacity Estimate (how many units can be produced with available stock)
  let maxProducibleUnits: number | null = null;
  let limitingInsumoName: string | null = null;

  if (insumosLibrary.length > 0) {
    for (const line of lines) {
      if (!line.insumoId || line.effectiveQtyWithLoss <= 0) continue;
      const ins = insumosLibrary.find((i) => i.id === line.insumoId);
      if (!ins || !ins.stockEnabled) continue;

      const perUnitQty =
        line.group === 'Frasco' || line.group === 'Embalagem'
          ? line.effectiveQtyWithLoss
          : line.effectiveQtyWithLoss * unitLiquidScale;

      const available = Math.max(0, ins.stockQty - ins.stockUsed);
      const convNeeded = convertQuantity(
        perUnitQty,
        line.usedUnit,
        ins.purchaseUnit,
        ins.density,
        ins.name
      );
      if (!convNeeded.ok || convNeeded.value <= 0) continue;

      const possible = Math.floor(available / convNeeded.value);
      if (maxProducibleUnits === null || possible < maxProducibleUnits) {
        maxProducibleUnits = possible;
        limitingInsumoName = ins.name;
      }
    }
  }

  // 8. Selling Price Simulator
  const pricingSummary = draft.pricing.enabled
    ? calculateSellingPrice(unitCostTotal, draft.pricing)
    : null;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    duplicateWarnings,
    targetVolumeMl: draft.targetVolumeMl,
    liquidVolumeTotalMl: isMultiBottleBatch
      ? draft.targetVolumeMl
      : totalLiquidMl > 0
        ? totalLiquidMl
        : draft.targetVolumeMl,
    lossPercent: draft.lossPercent,
    essenceCost: scaledEssenceCost,
    alcoholCost: scaledAlcoholCost,
    waterCost: scaledWaterCost,
    qasCost: scaledQasCost,
    baseCost: scaledBaseCost,
    otherIngredientsCost: scaledOtherIngredientsCost,
    additionalIngredientsCost: scaledAdditionalIngredientsCost,
    liquidCostTotal,
    bottleCost,
    valveCost,
    capCost,
    bottleTotalCost,
    packagingItemsCost,
    packagingTotalCost,
    unitCostTotal,
    baseBatchTotalCost: baseEval.batchTotalCost,
    baseUnitCost: baseEval.unitCost,
    baseCompositionSum: baseEval.compositionSum,
    lines,
    sizeComparisons,
    maxProducibleUnits,
    limitingInsumoName,
    unitLiquidScale,
    batchSummary,
    pricingSummary,
  };
}
