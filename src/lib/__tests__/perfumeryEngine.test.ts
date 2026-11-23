import { describe, expect, it } from 'vitest';
import {
  calculatePerfumeCost,
  calculateSellingPrice,
  computeAcquisitionCost,
  computeProportionalMaterialCost,
  convertQuantity,
  evaluateBaseCost,
  roundCurrency,
} from '../perfumeryEngine';
import { Insumo, PerfumeFormulaDraft } from '../../types/perfumery';

function createBaseDraft(): PerfumeFormulaDraft {
  return {
    brandName: 'Maison Privée',
    perfumeName: 'Oud Imperial',
    inspiredBy: 'Oud Wood',
    version: 1,
    targetVolumeMl: 100,
    lossPercent: 0,
    inputMode: 'absolute',
    rawMaterials: [
      {
        id: 'ess-1',
        insumoId: 'ins-1',
        name: 'Essência Oud Imperial',
        role: 'essencia',
        purchasedQty: 100,
        purchaseUnit: 'ml',
        purchasePrice: 180,
        freight: 20, // Total 200 -> R$ 2.00 / ml
        density: 0.95,
        concentration: 100,
        usedQty: 20,
        usedUnit: 'ml',
      },
    ],
    qas: [],
    base: {
      mode: 'predefined',
      predefinedId: 'clean_nickson',
      propChoice: 'Propanediol',
      baseName: 'BASE CLEAN - NICKSON',
      purchasedQty: 1000,
      purchaseUnit: 'ml',
      purchasePrice: 0,
      freight: 0,
      batchVolumeQty: 1000,
      batchUnit: 'ml',
      ingredients: [
        {
          id: 'b-1',
          insumoId: 'ins-2',
          name: 'Álcool 96 GL',
          percentage: 93,
          purchasedQty: 1000,
          purchaseUnit: 'ml',
          purchasePrice: 40,
          freight: 10, // Total 50 -> R$ 0.05 / ml
          density: 0.81,
          concentration: 96,
          usedUnit: 'ml',
        },
        {
          id: 'b-2',
          insumoId: 'ins-3',
          name: 'Água Deionizada',
          percentage: 5,
          purchasedQty: 1000,
          purchaseUnit: 'ml',
          purchasePrice: 10,
          freight: 0, // R$ 0.01 / ml
          density: 1,
          concentration: 100,
          usedUnit: 'ml',
        },
        {
          id: 'b-3',
          insumoId: 'ins-4',
          name: 'Propanediol',
          percentage: 2,
          purchasedQty: 1000,
          purchaseUnit: 'ml',
          purchasePrice: 100,
          freight: 0, // R$ 0.10 / ml
          density: 1.05,
          concentration: 100,
          usedUnit: 'ml',
        },
      ],
      usedInFormulaQty: 80,
      usedInFormulaUnit: 'ml',
      density: 0.83,
    },
    bottle: {
      mode: 'complete',
      complete: {
        insumoId: 'ins-5',
        name: 'Frasco Retangular 100ml',
        capacityMl: 100,
        purchasedQty: 10,
        purchasePrice: 80,
        freight: 20, // Total 100 -> R$ 10.00 / un
        usedQty: 1,
      },
      parts: {
        vidro: { insumoId: null, name: '', purchasedQty: 1, purchasePrice: 0, freight: 0, usedQty: 1 },
        valvula: { insumoId: null, name: '', purchasedQty: 1, purchasePrice: 0, freight: 0, usedQty: 1 },
        sobretampa: { insumoId: null, name: '', purchasedQty: 1, purchasePrice: 0, freight: 0, usedQty: 1 },
      },
    },
    packaging: [
      {
        id: 'pkg-1',
        insumoId: 'ins-6',
        categoryType: 'Etiqueta',
        name: 'Etiqueta Minimalista',
        purchasedQty: 100,
        purchaseUnit: 'un',
        purchasePrice: 50,
        freight: 0, // R$ 0.50 / un
        usedQty: 1,
      },
    ],
    selectedSizes: [30, 50, 60, 100],
    customSizeMl: null,
    pricing: {
      enabled: false,
      pricingMode: 'margin',
      targetPercent: 40,
      paymentFeePercent: 5,
      taxPercent: 6,
      commissionPercent: 0,
      extraCostsValue: 0,
    },
  };
}

describe('Motor Matemático de Perfumaria Artesanal', () => {
  it('1. Calcula custo proporcional de ingredientes com precisão decimal', () => {
    const calc = computeProportionalMaterialCost({
      name: 'Essência Bergamota',
      purchasedQty: 500,
      purchaseUnit: 'ml',
      purchasePrice: 250,
      freight: 0,
      usedQty: 12.5,
      usedUnit: 'ml',
      density: null,
    });
    expect(calc.ok).toBe(true);
    expect(calc.unitCostInPurchaseUnit).toBeCloseTo(0.5, 6);
    expect(calc.proportionalCost).toBeCloseTo(6.25, 6);
  });

  it('2. Inclui frete no custo de aquisição sem duplicidade', () => {
    expect(computeAcquisitionCost(180, 20)).toBe(200);
    const calc = computeProportionalMaterialCost({
      name: 'Essência',
      purchasedQty: 100,
      purchaseUnit: 'ml',
      purchasePrice: 180,
      freight: 20,
      usedQty: 20,
      usedUnit: 'ml',
      density: null,
    });
    expect(calc.totalAcquisitionCost).toBe(200);
    expect(calc.proportionalCost).toBeCloseTo(40, 6); // 20% of 200
  });

  it('3. Converte unidades compatíveis e bloqueia massa<->volume sem densidade', () => {
    const lToMl = convertQuantity(1.5, 'L', 'ml', null);
    expect(lToMl.ok).toBe(true);
    expect(lToMl.value).toBe(1500);

    const kgToG = convertQuantity(0.25, 'kg', 'g', null);
    expect(kgToG.ok).toBe(true);
    expect(kgToG.value).toBe(250);

    const noDensity = convertQuantity(10, 'g', 'ml', null, 'Essência Teste');
    expect(noDensity.ok).toBe(false);
    expect(noDensity.error).toContain('densidade');

    const withDensity = convertQuantity(16, 'g', 'ml', 0.8, 'Álcool');
    expect(withDensity.ok).toBe(true);
    expect(withDensity.value).toBeCloseTo(20, 6);
  });

  it('4. Valida composição de 100% em bases personalizadas e calcula custo por ml', () => {
    const draft = createBaseDraft();
    draft.base.mode = 'custom_new';
    draft.base.ingredients[0].percentage = 90; // Soma = 97% (inválido)

    const invalidEval = evaluateBaseCost(draft.base);
    expect(invalidEval.valid).toBe(false);
    expect(invalidEval.compositionSum).toBeCloseTo(97, 2);

    draft.base.ingredients[0].percentage = 93; // Soma = 100%
    const validEval = evaluateBaseCost(draft.base);
    expect(validEval.valid).toBe(true);
    // 930ml * 0.05 + 50ml * 0.01 + 20ml * 0.10 = 46.5 + 0.5 + 2.0 = 49.00 / 1000ml = 0.049/ml
    expect(validEval.batchTotalCost).toBeCloseTo(49, 6);
    expect(validEval.unitCost).toBeCloseTo(0.049, 6);
    expect(validEval.usedInFormulaCost).toBeCloseTo(80 * 0.049, 6);
  });

  it('5. Exige escolha de Propanediol/Propilenoglicol na base predefinida e suporta base pronta comprada', () => {
    const draft = createBaseDraft();
    draft.base.propChoice = undefined;
    const missingProp = evaluateBaseCost(draft.base);
    expect(missingProp.valid).toBe(false);

    draft.base.mode = 'purchased_ready';
    draft.base.baseName = 'Base Pronta Fornecedor X';
    draft.base.purchasedQty = 1000;
    draft.base.purchaseUnit = 'ml';
    draft.base.purchasePrice = 90;
    draft.base.freight = 10; // R$ 100 / 1000ml = R$ 0.10/ml
    draft.base.usedInFormulaQty = 80;
    const readyEval = evaluateBaseCost(draft.base);
    expect(readyEval.valid).toBe(true);
    expect(readyEval.usedInFormulaCost).toBeCloseTo(8.0, 6);
  });

  it('6. Previne duplicidade de custos entre ingredientes na base e fórmula, e diferencia frasco completo vs partes', () => {
    const draft = createBaseDraft();
    // Usuário adiciona Álcool na etapa de matérias-primas sem marcar "isExtraOverBase"
    draft.rawMaterials.push({
      id: 'alc-dup',
      insumoId: 'ins-2',
      name: 'Álcool de cereais 96 GL',
      role: 'alcool',
      purchasedQty: 1000,
      purchaseUnit: 'ml',
      purchasePrice: 50,
      freight: 0,
      density: 0.81,
      concentration: 96,
      usedQty: 50,
      usedUnit: 'ml',
      isExtraOverBase: false,
    });

    const result = calculatePerfumeCost(draft);
    expect(result.duplicateWarnings.length).toBe(1);
    expect(result.alcoholCost).toBe(0); // Não cobrou em duplicidade!

    // Agora marca como extra explícito
    draft.rawMaterials[1].isExtraOverBase = true;
    const resultExtra = calculatePerfumeCost(draft);
    expect(resultExtra.duplicateWarnings.length).toBe(0);
    expect(resultExtra.alcoholCost).toBeCloseTo(2.5, 6);
  });

  it('7. Calcula diferentes tamanhos respeitando proporções reais definidas pelo usuário', () => {
    const draft = createBaseDraft();
    // 20ml essência (20%) + 80ml base (80%)
    // 100ml líquido: Essência 40.00 + Base 3.92 = 43.92
    // Embalagem: Frasco 10.00 + Etiqueta 0.50 = 10.50
    const res = calculatePerfumeCost(draft);
    expect(res.valid).toBe(true);
    expect(res.liquidCostTotal).toBeCloseTo(43.92, 4);
    expect(res.packagingTotalCost).toBeCloseTo(10.5, 4);
    expect(res.unitCostTotal).toBeCloseTo(54.42, 4);

    const row30 = res.sizeComparisons.find((r) => r.sizeMl === 30)!;
    expect(row30.essenceQty).toBeCloseTo(6, 4); // 20% de 30ml
    expect(row30.baseQty).toBeCloseTo(24, 4); // 80% de 30ml
    expect(row30.liquidCost).toBeCloseTo(43.92 * 0.3, 4);
    expect(row30.unitCost).toBeCloseTo(43.92 * 0.3 + 10.5, 4);

    const row50 = res.sizeComparisons.find((r) => r.sizeMl === 50)!;
    expect(row50.essenceQty).toBeCloseTo(10, 4);
    expect(row50.baseQty).toBeCloseTo(40, 4);
    expect(row50.liquidCost).toBeCloseTo(43.92 * 0.5, 4);
  });

  it('8. Arredonda apenas na apresentação monetária mantendo precisão interna', () => {
    // 1 / 3 = 0.333333... * 3 = 1.00 (não 0.33 * 3 = 0.99)
    const calc = computeProportionalMaterialCost({
      name: 'Ambroxan 10%',
      purchasedQty: 30,
      purchaseUnit: 'ml',
      purchasePrice: 10,
      freight: 0,
      usedQty: 1,
      usedUnit: 'ml',
      density: null,
    });
    expect(calc.proportionalCost).toBeCloseTo(0.3333333, 5);
    expect(roundCurrency(calc.proportionalCost * 3)).toBe(1);
    expect(roundCurrency(10.005)).toBe(10.01);
  });

  it('9. Estima capacidade máxima de produção pelo estoque disponível', () => {
    const draft = createBaseDraft();
    const insumos: Insumo[] = [
      {
        id: 'ins-1',
        supplierId: null,
        supplierName: '',
        name: 'Essência Oud Imperial',
        category: 'Matéria-prima',
        subcategory: 'Essências',
        purchasedQty: 100,
        purchaseUnit: 'ml',
        purchasePrice: 180,
        freight: 20,
        totalCost: 200,
        unitCost: 2,
        purchaseDate: '2026-11-01',
        density: 0.95,
        concentration: 100,
        stockEnabled: true,
        stockQty: 100,
        stockUsed: 35, // Disponível: 65ml -> com 20ml/perfume = 3 perfumes!
        stockMinAlert: 20,
        notes: '',
        priceUpdatedAt: '2026-11-01',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'ins-5',
        supplierId: null,
        supplierName: '',
        name: 'Frasco Retangular 100ml',
        category: 'Embalagem',
        subcategory: 'Frascos',
        purchasedQty: 10,
        purchaseUnit: 'un',
        purchasePrice: 80,
        freight: 20,
        totalCost: 100,
        unitCost: 10,
        purchaseDate: '2026-11-01',
        density: null,
        concentration: null,
        stockEnabled: true,
        stockQty: 10,
        stockUsed: 2, // Disponível: 8 un
        stockMinAlert: 5,
        notes: '',
        priceUpdatedAt: '2026-11-01',
        createdAt: '',
        updatedAt: '',
      },
    ];

    const res = calculatePerfumeCost(draft, insumos);
    expect(res.maxProducibleUnits).toBe(3);
    expect(res.limitingInsumoName).toBe('Essência Oud Imperial');
  });

  it('10. Diferencia Margem sobre Preço de Venda de Markup sobre o Custo', () => {
    const marginRes = calculateSellingPrice(50, {
      enabled: true,
      pricingMode: 'margin',
      targetPercent: 40, // 40% margem líquida sobre preço de venda
      paymentFeePercent: 5,
      taxPercent: 5,
      commissionPercent: 0,
      extraCostsValue: 0,
    });
    // Denominador = 1 - 0.40 - 0.10 = 0.50 -> Preço = 50 / 0.50 = 100.00
    expect(marginRes.suggestedPrice).toBeCloseTo(100, 4);
    expect(marginRes.effectiveMarginPercent).toBeCloseTo(40, 4);
    expect(marginRes.effectiveMarkupPercent).toBeCloseTo(100, 4);

    const markupRes = calculateSellingPrice(50, {
      enabled: true,
      pricingMode: 'markup',
      targetPercent: 100, // 100% markup sobre custo = 100.00
      paymentFeePercent: 5,
      taxPercent: 5,
      commissionPercent: 0,
      extraCostsValue: 0,
    });
    expect(markupRes.suggestedPrice).toBeCloseTo(100, 4);
    expect(markupRes.effectiveMarkupPercent).toBeCloseTo(100, 4);
    expect(markupRes.effectiveMarginPercent).toBeCloseTo(40, 4);
  });

  it('11. Calcula rendimento do lote por concentração da essência (100ml a 26% -> 384,6ml total) absorvendo sobra por padrão e permitindo desativar', () => {
    const draft = createBaseDraft();
    draft.targetVolumeMl = 50; // Frascos de 50ml
    draft.essenceConcentrationPct = 26;
    draft.autoCalcBaseFromEssence = true;
    draft.rawMaterials[0].usedQty = 100; // Usou os 100ml da essência (R$ 200,00)
    // Base a R$ 0.049/ml -> 284.6154ml * 0.049 = R$ 13.9462
    draft.base.usedInFormulaQty = 284.615385;

    // 1) Padrão: includeLeftoverInLiquidCost = true -> absorve sobra (~34,6ml) nos 7 frascos (350ml)
    const res = calculatePerfumeCost(draft);
    expect(res.valid).toBe(true);
    expect(res.batchSummary).not.toBeNull();
    expect(res.batchSummary!.isBatch).toBe(true);
    expect(res.batchSummary!.batchVolumeMl).toBeCloseTo(384.615, 2);
    expect(res.batchSummary!.baseNeededMl).toBeCloseTo(284.615, 2);
    expect(res.batchSummary!.bottlesCount).toBe(7); // floor(384.615 / 50) = 7 frascos
    expect(res.batchSummary!.totalBottledMl).toBeCloseTo(350, 2);
    expect(res.batchSummary!.leftoverMl).toBeCloseTo(34.615, 2);
    expect(res.batchSummary!.includeLeftoverInLiquidCost).toBe(true);

    const totalBatchLiquid = 200 + 284.615385 * 0.049;
    // Com absorção da sobra: cada um dos 7 frascos de 50ml recebe 50/350 = 1/7 do lote
    const expectedLiquidWithLeftover = totalBatchLiquid * (50 / 350);
    expect(res.liquidCostTotal).toBeCloseTo(expectedLiquidWithLeftover, 3);
    expect(res.liquidCostTotal * 7).toBeCloseTo(res.batchSummary!.batchLiquidCostTotal, 3);
    expect(res.unitCostTotal).toBeCloseTo(expectedLiquidWithLeftover + 10.5, 3);

    const row50 = res.sizeComparisons.find((r) => r.sizeMl === 50)!;
    expect(row50.essenceQty).toBeCloseTo(13, 3); // 26% de 50ml
    expect(row50.baseQty).toBeCloseTo(37, 3); // 74% de 50ml
    // Simulador puro + parcela da sobra absorvida = unitCostTotal
    expect(row50.unitCost + res.batchSummary!.leftoverAbsorbedPerPrimaryUnit).toBeCloseTo(
      res.unitCostTotal,
      3
    );

    // 2) Desativando includeLeftoverInLiquidCost: rateio puramente proporcional ao volume total (384,615 ml)
    const draftNoLeftover = { ...draft, includeLeftoverInLiquidCost: false };
    const resNoLeftover = calculatePerfumeCost(draftNoLeftover);
    const expectedLiquidPure = totalBatchLiquid * (50 / 384.615385);
    expect(resNoLeftover.liquidCostTotal).toBeCloseTo(expectedLiquidPure, 3);
    expect(resNoLeftover.batchSummary!.leftoverAbsorbedPerPrimaryUnit).toBe(0);
    const row50Pure = resNoLeftover.sizeComparisons.find((r) => r.sizeMl === 50)!;
    expect(row50Pure.unitCost).toBeCloseTo(resNoLeftover.unitCostTotal, 4);
  });

  it('12. Mantém QAs da Etapa 3 apenas como valores de referência quando addToPerfume=false', () => {
    const draft = createBaseDraft();
    draft.qas.push({
      id: 'qa-ref-1',
      insumoId: null,
      name: 'Iso E Super',
      presetType: 'Iso E Super',
      purchasedQty: 100,
      purchaseUnit: 'ml',
      purchasePrice: 120,
      freight: 0,
      density: null,
      concentration: 100,
      usedQty: 10,
      usedUnit: 'ml',
      addToPerfume: false,
    });

    const resRefOnly = calculatePerfumeCost(draft);
    expect(resRefOnly.qasCost).toBe(0);
    expect(resRefOnly.liquidVolumeTotalMl).toBeCloseTo(100, 4);

    draft.qas[0].addToPerfume = true;
    const resAdded = calculatePerfumeCost(draft);
    expect(resAdded.qasCost).toBeCloseTo(12, 4); // 10ml de 100ml por R$ 120
    expect(resAdded.liquidVolumeTotalMl).toBeCloseTo(110, 4);
  });

  it('13. Multiplica corretamente frascos completos, frascos por partes (vidro/válvula/sobretampa) e embalagens pela quantidade usada', () => {
    const draft = createBaseDraft();
    // Modo completo: 10 un por R$ 80 + R$ 20 frete = R$ 10/un; usando 2 un -> R$ 20,00
    draft.bottle.complete.usedQty = 2;
    // Embalagem: R$ 50 / 100 un = R$ 0.50/un; usando 3 un -> R$ 1.50
    draft.packaging[0].usedQty = 3;

    const resComplete = calculatePerfumeCost(draft);
    expect(resComplete.valid).toBe(true);
    expect(resComplete.bottleCost).toBeCloseTo(20, 4);
    expect(resComplete.bottleTotalCost).toBeCloseTo(20, 4);
    expect(resComplete.packagingItemsCost).toBeCloseTo(1.5, 4);
    expect(resComplete.packagingTotalCost).toBeCloseTo(21.5, 4);

    // Se usedQty = 0 no modo completo, deve acusar erro e não forçar 1
    draft.bottle.complete.usedQty = 0;
    const resZeroComplete = calculatePerfumeCost(draft);
    expect(resZeroComplete.valid).toBe(false);

    // Modo por partes: vidro=2un (R$5/un), válvula=1un (R$3/un), sobretampa=0un (não usada)
    draft.bottle.mode = 'parts';
    draft.bottle.parts = {
      vidro: { insumoId: null, name: 'Vidro 100ml', purchasedQty: 10, purchasePrice: 40, freight: 10, usedQty: 2 },
      valvula: { insumoId: null, name: 'Válvula Luxo', purchasedQty: 20, purchasePrice: 60, freight: 0, usedQty: 1 },
      sobretampa: { insumoId: null, name: 'Sobretampa', purchasedQty: 10, purchasePrice: 25, freight: 0, usedQty: 0 },
    };

    const resParts = calculatePerfumeCost(draft);
    expect(resParts.valid).toBe(true);
    expect(resParts.bottleCost).toBeCloseTo(10, 4); // 2 * R$ 5,00
    expect(resParts.valveCost).toBeCloseTo(3, 4);   // 1 * R$ 3,00
    expect(resParts.capCost).toBe(0);               // 0 * R$ 2,50 = R$ 0
    expect(resParts.bottleTotalCost).toBeCloseTo(13, 4);
  });

  it('14. Calcula custo total dos frascos e embalagens do lote em batchSummary', () => {
    const draft = createBaseDraft();
    draft.targetVolumeMl = 50;
    draft.essenceConcentrationPct = 26;
    draft.autoCalcBaseFromEssence = true;
    draft.rawMaterials[0].usedQty = 100; // 384.6 ml -> 7 frascos de 50ml
    draft.base.usedInFormulaQty = 284.615385;
    // Embalagem total por frasco = R$ 10,00 (frasco) + R$ 0,50 (etiqueta) = R$ 10,50
    const res = calculatePerfumeCost(draft);
    expect(res.batchSummary).not.toBeNull();
    expect(res.batchSummary!.bottlesCount).toBe(7);
    expect(res.batchSummary!.batchPackagingCostTotal).toBeCloseTo(7 * 10.5, 4);
    expect(res.batchSummary!.totalBatchCostWithBottles).toBeCloseTo(
      res.batchSummary!.batchLiquidCostTotal + 7 * 10.5,
      4
    );
  });

  it('15. Combina múltiplos tamanhos de frasco no mesmo lote (ex.: 50ml + 30ml) e distribui sobra proporcionalmente', () => {
    const draft = createBaseDraft();
    // 100ml essência a 27% -> 370.3704ml total (270.3704ml base)
    draft.targetVolumeMl = 50;
    draft.essenceConcentrationPct = 27;
    draft.autoCalcBaseFromEssence = true;
    draft.rawMaterials[0].usedQty = 100;
    draft.base.usedInFormulaQty = 270.37037;
    draft.includeLeftoverInLiquidCost = true;
    // Aproveita 2 frascos de 30ml (60ml) -> sobra 310.37ml -> 6 frascos de 50ml (300ml) -> 360ml envasados e 10.37ml sobra
    draft.additionalBottles = [
      {
        id: 'ab-30',
        capacityMl: 30,
        fillCount: 2,
        insumoId: null,
        name: 'Frasco 30ml Âmbar',
        purchasedQty: 10,
        purchasePrice: 60,
        freight: 0, // R$ 6,00/un
        usedQty: 1,
      },
    ];

    const res = calculatePerfumeCost(draft);
    expect(res.valid).toBe(true);
    expect(res.batchSummary).not.toBeNull();
    const bs = res.batchSummary!;

    expect(bs.primaryBottleFillCount).toBe(6);
    expect(bs.bottlesCount).toBe(8); // 6x 50ml + 2x 30ml
    expect(bs.totalBottledMl).toBeCloseTo(360, 2);
    expect(bs.leftoverMl).toBeCloseTo(10.37037, 2);
    expect(bs.allocations).toHaveLength(2);

    const alloc50 = bs.allocations.find((a) => a.isPrimary)!;
    const alloc30 = bs.allocations.find((a) => !a.isPrimary)!;
    expect(alloc50.capacityMl).toBe(50);
    expect(alloc50.fillCount).toBe(6);
    expect(alloc30.capacityMl).toBe(30);
    expect(alloc30.fillCount).toBe(2);
    expect(alloc30.bottleOnlyCostPerUnit).toBeCloseTo(6, 4);
    expect(alloc30.packagingItemsCostPerUnit).toBeCloseTo(0.5, 4); // Etiqueta da Etapa 6

    // 100% do custo do líquido do lote (incluindo os 10.37ml de sobra) é absorvido pelos 8 frascos proporcionalmente ao volume
    const summedLiquidAcrossBottles =
      alloc50.fillCount * alloc50.liquidCostPerUnit +
      alloc30.fillCount * alloc30.liquidCostPerUnit;
    expect(summedLiquidAcrossBottles).toBeCloseTo(bs.batchLiquidCostTotal, 3);

    // Custo total do lote = líquido total + (6 * 10,50) + (2 * 6,50)
    expect(bs.batchPackagingCostTotal).toBeCloseTo(6 * 10.5 + 2 * 6.5, 4);
    expect(bs.totalBatchCostWithBottles).toBeCloseTo(
      bs.batchLiquidCostTotal + bs.batchPackagingCostTotal,
      3
    );
  });
});
