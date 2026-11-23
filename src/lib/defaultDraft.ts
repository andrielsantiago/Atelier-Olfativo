import {
  BaseIngredientLine,
  Insumo,
  PREDEFINED_BASES,
  PerfumeFormulaDraft,
  PredefinedBaseId,
  PropChoice,
} from '../types/perfumery';

export function buildPredefinedBaseIngredients(
  baseId: PredefinedBaseId,
  propChoice: PropChoice | undefined,
  insumos: Insumo[]
): BaseIngredientLine[] {
  const spec = PREDEFINED_BASES.find((b) => b.id === baseId) || PREDEFINED_BASES[0];

  return spec.ingredients.map((ing, idx) => {
    const label = ing.isPropSlot
      ? propChoice || 'Selecione Propanediol ou Propilenoglicol'
      : ing.label;
    const targetSub = ing.isPropSlot
      ? propChoice || ing.defaultSubcategory
      : ing.defaultSubcategory;

    // Try auto-matching an insumo from the user's library by subcategory or name
    const matched = insumos.find((item) => {
      if (item.category !== 'Matéria-prima') return false;
      const n = item.name.toLowerCase();
      if (ing.key === 'ambroxan_10') {
        return n.includes('ambroxan') && (item.concentration === 10 || n.includes('10'));
      }
      if (ing.isPropSlot && propChoice) {
        return (
          item.subcategory.toLowerCase() === propChoice.toLowerCase() ||
          n.includes(propChoice.toLowerCase())
        );
      }
      return (
        item.subcategory.toLowerCase() === targetSub.toLowerCase() ||
        n.includes(ing.label.toLowerCase())
      );
    });

    return {
      id: `base-ing-${baseId}-${idx}`,
      key: ing.key,
      insumoId: matched ? matched.id : null,
      name: matched ? matched.name : label,
      percentage: ing.percentage,
      purchasedQty: matched ? matched.purchasedQty : 1000,
      purchaseUnit: matched ? matched.purchaseUnit : 'ml',
      purchasePrice: matched ? matched.purchasePrice : 0,
      freight: matched ? matched.freight : 0,
      density: matched ? matched.density : null,
      concentration: matched ? matched.concentration : (ing.concentration ?? null),
      usedUnit: 'ml',
    };
  });
}

export function createEmptyFormulaDraft(insumos: Insumo[] = []): PerfumeFormulaDraft {
  return {
    brandName: '',
    perfumeName: '',
    inspiredBy: '',
    version: 1,
    targetVolumeMl: 50,
    essenceConcentrationPct: 26,
    autoCalcBaseFromEssence: true,
    lossPercent: 0,
    inputMode: 'absolute',
    rawMaterials: [
      {
        id: `mat-ess-${Date.now()}`,
        insumoId: null,
        name: 'Essência Principal',
        role: 'essencia',
        purchasedQty: 100,
        purchaseUnit: 'ml',
        purchasePrice: 0,
        freight: 0,
        density: null,
        concentration: 100,
        usedQty: 100,
        usedUnit: 'ml',
        usedPercentage: 26,
      },
    ],
    qas: [],
    base: {
      mode: 'predefined',
      predefinedId: 'clean_nickson',
      propChoice: undefined,
      baseName: 'BASE CLEAN - NICKSON',
      purchasedQty: 1000,
      purchaseUnit: 'ml',
      purchasePrice: 0,
      freight: 0,
      batchVolumeQty: 1000,
      batchUnit: 'ml',
      ingredients: buildPredefinedBaseIngredients('clean_nickson', undefined, insumos),
      usedInFormulaQty: 284.62,
      usedInFormulaUnit: 'ml',
      usedPercentage: 74,
      density: null,
    },
    bottle: {
      mode: 'complete',
      complete: {
        insumoId: null,
        name: 'Frasco Padrão 50ml',
        capacityMl: 50,
        purchasedQty: 10,
        purchasePrice: 0,
        freight: 0,
        usedQty: 1,
      },
      parts: {
        vidro: {
          insumoId: null,
          name: 'Vidro 50ml',
          purchasedQty: 10,
          purchasePrice: 0,
          freight: 0,
          usedQty: 1,
        },
        valvula: {
          insumoId: null,
          name: 'Válvula Spray',
          purchasedQty: 10,
          purchasePrice: 0,
          freight: 0,
          usedQty: 1,
        },
        sobretampa: {
          insumoId: null,
          name: 'Sobretampa',
          purchasedQty: 10,
          purchasePrice: 0,
          freight: 0,
          usedQty: 1,
        },
      },
    },
    primaryBottleFillCount: null,
    additionalBottles: [],
    includeLeftoverInLiquidCost: true,
    packaging: [],
    selectedSizes: [30, 50, 60, 100],
    customSizeMl: null,
    pricing: {
      enabled: true,
      pricingMode: 'margin',
      targetPercent: 45,
      paymentFeePercent: 4.5,
      taxPercent: 6,
      commissionPercent: 0,
      extraCostsValue: 0,
    },
  };
}
