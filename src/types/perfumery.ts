export type UnitType = 'ml' | 'L' | 'g' | 'kg' | 'un';

export type InsumoMainCategory = 'Matéria-prima' | 'Embalagem';

export const RAW_MATERIAL_SUBCATEGORIES = [
  'Essências',
  'Álcool de cereais',
  'Água deionizada',
  'Iso E Super',
  'Ambroxan',
  'Hedione',
  'Galaxolide',
  'Propanediol',
  'Propilenoglicol',
  'Select Blend Turbo',
  'Outros aditivos',
  'Base pronta',
] as const;

export const PACKAGING_SUBCATEGORIES = [
  'Frascos',
  'Vidros',
  'Válvulas',
  'Sobretampas',
  'Etiquetas',
  'Caixas',
  'Papel celofane',
  'Sacolas',
  'Panfletos',
  'Outros',
] as const;

export type PredefinedBaseId =
  | 'clean_nickson'
  | 'turbo_nickson'
  | 'clean_leandro'
  | 'turbo_leandro';

export type PropChoice = 'Propanediol' | 'Propilenoglicol';

export interface PredefinedBaseSpec {
  id: PredefinedBaseId;
  name: string;
  author: string;
  description: string;
  requiresPropChoice: true;
  ingredients: Array<{
    key: string;
    label: string;
    percentage: number;
    isPropSlot?: boolean;
    defaultSubcategory: string;
    concentration?: number;
  }>;
}

export const PREDEFINED_BASES: PredefinedBaseSpec[] = [
  {
    id: 'clean_nickson',
    name: 'BASE CLEAN - NICKSON',
    author: 'Nickson',
    description: 'Base limpa equilibrada com 93% de álcool de cereais e umectante.',
    requiresPropChoice: true,
    ingredients: [
      { key: 'alcool', label: 'Álcool 96 GL', percentage: 93, defaultSubcategory: 'Álcool de cereais' },
      { key: 'agua', label: 'Água Deionizada', percentage: 5, defaultSubcategory: 'Água deionizada' },
      { key: 'prop', label: 'Propanediol ou Propilenoglicol', percentage: 2, isPropSlot: true, defaultSubcategory: 'Propanediol' },
    ],
  },
  {
    id: 'turbo_nickson',
    name: 'BASE TURBO - NICKSON',
    author: 'Nickson',
    description: 'Base potencializada com Iso E Super e Ambroxan 10% integrados.',
    requiresPropChoice: true,
    ingredients: [
      { key: 'alcool', label: 'Álcool 96 GL', percentage: 90, defaultSubcategory: 'Álcool de cereais' },
      { key: 'agua', label: 'Água Deionizada', percentage: 5, defaultSubcategory: 'Água deionizada' },
      { key: 'prop', label: 'Propanediol ou Propilenoglicol', percentage: 2, isPropSlot: true, defaultSubcategory: 'Propanediol' },
      { key: 'iso_e', label: 'Iso E Super', percentage: 2, defaultSubcategory: 'Iso E Super' },
      { key: 'ambroxan_10', label: 'Ambroxan 10%', percentage: 1, defaultSubcategory: 'Ambroxan', concentration: 10 },
    ],
  },
  {
    id: 'clean_leandro',
    name: 'BASE CLEAN - LEANDRO',
    author: 'Leandro',
    description: 'Base limpa de alta volatilidade com 94,5% de álcool 96 GL.',
    requiresPropChoice: true,
    ingredients: [
      { key: 'alcool', label: 'Álcool 96 GL', percentage: 94.5, defaultSubcategory: 'Álcool de cereais' },
      { key: 'agua', label: 'Água Deionizada', percentage: 4, defaultSubcategory: 'Água deionizada' },
      { key: 'prop', label: 'Propanediol ou Propilenoglicol', percentage: 1.5, isPropSlot: true, defaultSubcategory: 'Propanediol' },
    ],
  },
  {
    id: 'turbo_leandro',
    name: 'BASE TURBO - LEANDRO',
    author: 'Leandro',
    description: 'Base estruturada com 4% de Select Blend Turbo incorporado.',
    requiresPropChoice: true,
    ingredients: [
      { key: 'alcool', label: 'Álcool 96 GL', percentage: 90.5, defaultSubcategory: 'Álcool de cereais' },
      { key: 'agua', label: 'Água Deionizada', percentage: 4, defaultSubcategory: 'Água deionizada' },
      { key: 'blend_turbo', label: 'Blend Turbo', percentage: 4, defaultSubcategory: 'Select Blend Turbo' },
      { key: 'prop', label: 'Propanediol ou Propilenoglicol', percentage: 1.5, isPropSlot: true, defaultSubcategory: 'Propanediol' },
    ],
  },
];

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  website: string;
  notes: string;
  createdAt: string;
}

export interface Insumo {
  id: string;
  supplierId: string | null;
  supplierName: string;
  name: string;
  category: InsumoMainCategory;
  subcategory: string;
  purchasedQty: number;
  purchaseUnit: UnitType;
  purchasePrice: number;
  freight: number;
  totalCost: number;
  unitCost: number;
  purchaseDate: string;
  density: number | null;
  concentration: number | null;
  stockEnabled: boolean;
  stockQty: number;
  stockUsed: number;
  stockMinAlert: number;
  notes: string;
  priceUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface InsumoPriceHistory {
  id: string;
  insumoId: string;
  supplierName: string;
  purchasedQty: number;
  purchaseUnit: UnitType;
  purchasePrice: number;
  freight: number;
  totalCost: number;
  unitCost: number;
  purchaseDate: string;
  notes: string;
  createdAt: string;
}

export interface StockMovement {
  id: string;
  insumoId: string;
  insumoName: string;
  type: 'entrada' | 'saida' | 'ajuste' | 'producao';
  quantity: number;
  unit: UnitType;
  reason: string;
  createdAt: string;
}

export interface FormulaMaterialInput {
  id: string;
  insumoId: string | null;
  name: string;
  role: 'essencia' | 'alcool' | 'agua' | 'outro';
  purchasedQty: number;
  purchaseUnit: UnitType;
  purchasePrice: number;
  freight: number;
  density: number | null;
  concentration: number | null;
  usedQty: number;
  usedUnit: UnitType;
  usedPercentage?: number;
  isExtraOverBase?: boolean;
}

export interface FormulaQAInput {
  id: string;
  insumoId: string | null;
  name: string;
  presetType: string;
  purchasedQty: number;
  purchaseUnit: UnitType;
  purchasePrice: number;
  freight: number;
  density: number | null;
  concentration: number | null;
  usedQty: number;
  usedUnit: UnitType;
  usedPercentage?: number;
  isExtraOverBase?: boolean;
  addToPerfume?: boolean;
}

export interface BaseIngredientLine {
  id: string;
  key?: string;
  insumoId: string | null;
  name: string;
  percentage: number;
  purchasedQty: number;
  purchaseUnit: UnitType;
  purchasePrice: number;
  freight: number;
  density: number | null;
  concentration: number | null;
  usedUnit: UnitType;
}

export type BaseMode =
  | 'predefined'
  | 'purchased_ready'
  | 'custom_new'
  | 'custom_saved';

export interface BaseConfig {
  mode: BaseMode;
  predefinedId?: PredefinedBaseId;
  propChoice?: PropChoice;
  savedBaseId?: string | null;
  baseName: string;
  purchasedBaseInsumoId?: string | null;
  purchasedQty: number;
  purchaseUnit: UnitType;
  purchasePrice: number;
  freight: number;
  batchVolumeQty: number;
  batchUnit: 'ml' | 'g';
  ingredients: BaseIngredientLine[];
  usedInFormulaQty: number;
  usedInFormulaUnit: 'ml' | 'g';
  usedPercentage?: number;
  density: number | null;
}

export interface BottleCompleteConfig {
  insumoId: string | null;
  name: string;
  capacityMl: number;
  purchasedQty: number;
  purchasePrice: number;
  freight: number;
  usedQty: number;
}

export interface BottlePartItem {
  insumoId: string | null;
  name: string;
  purchasedQty: number;
  purchasePrice: number;
  freight: number;
  usedQty: number;
}

export interface BottleConfig {
  mode: 'complete' | 'parts';
  complete: BottleCompleteConfig;
  parts: {
    vidro: BottlePartItem;
    valvula: BottlePartItem;
    sobretampa: BottlePartItem;
  };
}

export interface AdditionalBottleOption {
  id: string;
  insumoId: string | null;
  name: string;
  capacityMl: number;
  purchasedQty: number;
  purchasePrice: number;
  freight: number;
  usedQty: number;
  fillCount: number;
}

export interface BottleAllocationSummary {
  id: string;
  isPrimary: boolean;
  insumoId: string | null;
  name: string;
  capacityMl: number;
  fillCount: number;
  totalMl: number;
  liquidCostPerUnit: number;
  leftoverAbsorbedPerUnit: number;
  bottleOnlyCostPerUnit: number;
  packagingItemsCostPerUnit: number;
  packagingTotalCostPerUnit: number;
  unitCostTotal: number;
  totalAllocationCost: number;
}

export interface PackagingItemInput {
  id: string;
  insumoId: string | null;
  categoryType: string;
  name: string;
  purchasedQty: number;
  purchaseUnit: UnitType;
  purchasePrice: number;
  freight: number;
  usedQty: number;
}

export interface PricingConfig {
  enabled: boolean;
  pricingMode: 'margin' | 'markup';
  targetPercent: number;
  paymentFeePercent: number;
  taxPercent: number;
  commissionPercent: number;
  extraCostsValue: number;
}

export type PercentageBasis = 'absolute' | 'mass_percent' | 'volume_percent';

export interface PerfumeFormulaDraft {
  id?: string;
  brandName: string;
  perfumeName: string;
  inspiredBy: string;
  version: number;
  targetVolumeMl: number;
  essenceConcentrationPct?: number;
  autoCalcBaseFromEssence?: boolean;
  lossPercent: number;
  inputMode: PercentageBasis;
  rawMaterials: FormulaMaterialInput[];
  qas: FormulaQAInput[];
  base: BaseConfig;
  bottle: BottleConfig;
  primaryBottleFillCount?: number | null;
  additionalBottles?: AdditionalBottleOption[];
  includeLeftoverInLiquidCost?: boolean;
  packaging: PackagingItemInput[];
  selectedSizes: number[];
  customSizeMl: number | null;
  pricing: PricingConfig;
}

export interface SavedCustomBase {
  id: string;
  name: string;
  baseType: 'predefined_override' | 'custom' | 'purchased_ready';
  propChoice: PropChoice | null;
  batchQty: number;
  batchUnit: 'ml' | 'g';
  purchasePrice: number;
  freight: number;
  ingredients: BaseIngredientLine[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedFormulaRecord {
  id: string;
  brandName: string;
  perfumeName: string;
  inspiredBy: string;
  version: number;
  status: 'rascunho' | 'finalizada';
  targetVolumeMl: number;
  unitCost: number;
  data: PerfumeFormulaDraft;
  createdAt: string;
  updatedAt: string;
}

export interface CalculationCostLine {
  name: string;
  group: 'Essência' | 'Álcool' | 'Água' | 'QAs e Aditivos' | 'Base' | 'Outros Ingredientes' | 'Frasco' | 'Embalagem';
  insumoId: string | null;
  usedQty: number;
  usedUnit: UnitType;
  effectiveQtyWithLoss: number;
  unitCostAtCalc: number;
  totalAcquisitionCost: number;
  proportionalCost: number;
  concentration: number | null;
  pureActiveEquivalentQty: number | null;
}

export interface SizeSimulationRow {
  sizeMl: number;
  essenceQty: number;
  essenceUnit: UnitType;
  baseQty: number;
  baseUnit: UnitType;
  qasQty: number;
  alcoholQty: number;
  waterQty: number;
  liquidCost: number;
  bottleAndPackagingCost: number;
  unitCost: number;
  ingredientsBreakdown: Array<{
    name: string;
    group: string;
    qty: number;
    unit: UnitType;
    cost: number;
  }>;
}

export interface CalculationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  duplicateWarnings: string[];
  targetVolumeMl: number;
  liquidVolumeTotalMl: number;
  lossPercent: number;
  essenceCost: number;
  alcoholCost: number;
  waterCost: number;
  qasCost: number;
  baseCost: number;
  otherIngredientsCost: number;
  additionalIngredientsCost: number;
  liquidCostTotal: number;
  bottleCost: number;
  valveCost: number;
  capCost: number;
  bottleTotalCost: number;
  packagingItemsCost: number;
  packagingTotalCost: number;
  unitCostTotal: number;
  baseBatchTotalCost: number;
  baseUnitCost: number;
  baseCompositionSum: number;
  lines: CalculationCostLine[];
  sizeComparisons: SizeSimulationRow[];
  maxProducibleUnits: number | null;
  limitingInsumoName: string | null;
  unitLiquidScale: number;
  batchSummary: {
    isBatch: boolean;
    essenceQty: number;
    essenceUnit: UnitType;
    concentrationPct: number;
    batchVolumeMl: number;
    baseNeededMl: number;
    batchLiquidCostTotal: number;
    batchEssenceCost: number;
    batchBaseCost: number;
    bottlesCount: number;
    exactBottlesCount: number;
    leftoverMl: number;
    totalBottledMl: number;
    includeLeftoverInLiquidCost: boolean;
    leftoverLiquidCostTotal: number;
    leftoverAbsorbedPerPrimaryUnit: number;
    primaryBottleFillCount: number;
    allocations: BottleAllocationSummary[];
    batchPackagingCostTotal: number;
    totalBatchCostWithBottles: number;
    estimatedWithoutDensity: boolean;
  } | null;
  pricingSummary: {
    productionCost: number;
    extraCosts: number;
    deductionsValue: number;
    suggestedPrice: number;
    estimatedProfit: number;
    effectiveMarginPercent: number;
    effectiveMarkupPercent: number;
    warning?: string;
  } | null;
}

export interface SavedCalculationRecord {
  id: string;
  formulaId: string | null;
  brandName: string;
  perfumeName: string;
  inspiredBy: string;
  formulaVersion: number;
  sizeMl: number;
  liquidCost: number;
  packagingCost: number;
  unitCost: number;
  stockDeducted: boolean;
  result: CalculationResult;
  draftSnapshot: PerfumeFormulaDraft;
  createdAt: string;
}
