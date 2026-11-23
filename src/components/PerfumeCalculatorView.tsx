import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Copy,
  AlertTriangle,
  CheckCircle2,
  Save,
  FileDown,
  Printer,
  Share2,
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  X,
} from 'lucide-react';
import {
  createCustomBase,
  saveCalculationAndDeductStock,
  saveFormulaDraft,
} from '../lib/firestoreService';
import { buildPredefinedBaseIngredients } from '../lib/defaultDraft';
import { generatePerfumePdfReport } from '../lib/pdfGenerator';
import {
  calculatePerfumeCost,
  computeEssenceYieldSummary,
  computeProportionalMaterialCost,
  computeUnitCost,
  evaluateBaseCost,
  formatBRL,
  formatBRLPrecise,
  roundQuantity,
} from '../lib/perfumeryEngine';
import {
  AdditionalBottleOption,
  BaseIngredientLine,
  FormulaQAInput,
  Insumo,
  InsumoMainCategory,
  PREDEFINED_BASES,
  PercentageBasis,
  PerfumeFormulaDraft,
  PredefinedBaseId,
  PropChoice,
  SavedCalculationRecord,
  SavedCustomBase,
  Supplier,
  UnitType,
} from '../types/perfumery';
import { CurrencyInput } from './CurrencyInput';
import { InsumoFormModal } from './InsumoFormModal';

function matchesQAForBaseIngredient(
  ingName: string,
  ingKey: string | undefined,
  qa: FormulaQAInput
): boolean {
  const ingLower = ingName.toLowerCase().trim();
  const qaLower = qa.name.toLowerCase().trim();
  const presetLower = (qa.presetType || '').toLowerCase().trim();

  if (ingKey === 'iso_e' || ingLower.includes('iso e')) {
    return presetLower.includes('iso e') || qaLower.includes('iso e');
  }
  if (ingKey === 'ambroxan_10' || ingLower.includes('ambroxan')) {
    return presetLower.includes('ambroxan') || qaLower.includes('ambroxan');
  }
  if (ingKey === 'blend_turbo' || ingLower.includes('blend turbo')) {
    return presetLower.includes('blend turbo') || qaLower.includes('blend turbo');
  }
  if (ingLower.includes('propanediol')) {
    return presetLower === 'propanediol' || qaLower.includes('propanediol');
  }
  if (ingLower.includes('propilenoglicol')) {
    return presetLower === 'propilenoglicol' || qaLower.includes('propilenoglicol');
  }
  if (ingLower.includes('hedione')) {
    return presetLower === 'hedione' || qaLower.includes('hedione');
  }
  if (ingLower.includes('galaxolide')) {
    return presetLower === 'galaxolide' || qaLower.includes('galaxolide');
  }
  return Boolean(qaLower && ingLower === qaLower);
}

function syncQAsToBaseIngredients(
  ingredients: BaseIngredientLine[],
  qas: FormulaQAInput[]
): BaseIngredientLine[] {
  if (!qas.length) return ingredients;
  return ingredients.map((ing) => {
    const matched = qas.find((qa) => matchesQAForBaseIngredient(ing.name, ing.key, qa));
    if (!matched) return ing;
    // Only override if QA has a configured insumo or price/freight > 0
    if (!matched.insumoId && matched.purchasePrice <= 0 && matched.freight <= 0) {
      return ing;
    }
    return {
      ...ing,
      insumoId: matched.insumoId ?? ing.insumoId,
      purchasedQty: matched.purchasedQty,
      purchaseUnit: matched.purchaseUnit,
      purchasePrice: matched.purchasePrice,
      freight: matched.freight,
      density: matched.density,
      concentration: matched.concentration ?? ing.concentration,
      usedUnit: matched.purchaseUnit === 'un' ? 'ml' : matched.purchaseUnit,
    };
  });
}

interface PerfumeCalculatorViewProps {
  uid: string;
  draft: PerfumeFormulaDraft;
  onChangeDraft: (next: PerfumeFormulaDraft) => void;
  insumos: Insumo[];
  suppliers: Supplier[];
  savedBases: SavedCustomBase[];
  stockModuleEnabled: boolean;
  onCalculationSaved: (calc: SavedCalculationRecord) => void;
}

const QA_PRESETS = [
  'Iso E Super',
  'Ambroxan',
  'Hedione',
  'Galaxolide',
  'Propanediol',
  'Propilenoglicol',
  'Select Blend Turbo',
  'Outro',
] as const;

const PACKAGING_PRESETS = [
  'Etiqueta do frasco',
  'Caixa externa',
  'Papel celofane',
  'Sacola personalizada',
  'Panfleto de agradecimento',
  'Outro material',
] as const;

export const PerfumeCalculatorView: React.FC<PerfumeCalculatorViewProps> = ({
  uid,
  draft,
  onChangeDraft,
  insumos,
  suppliers,
  savedBases,
  stockModuleEnabled,
  onCalculationSaved,
}) => {
  const [openStep, setOpenStep] = useState<number>(1);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savingCalc, setSavingCalc] = useState(false);
  const [savingBase, setSavingBase] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Stock deduction confirmation modal
  const [confirmStockModalOpen, setConfirmStockModalOpen] = useState(false);
  const [batchUnitsToDeduct, setBatchUnitsToDeduct] = useState('1');

  // Inline create insumo modal
  const [inlineInsumoModal, setInlineInsumoModal] = useState<{
    open: boolean;
    category: InsumoMainCategory;
    subcategory?: string;
    onSelectCreated?: (ins: Insumo) => void;
  }>({ open: false, category: 'Matéria-prima' });

  // Custom size input
  const [customSizeInput, setCustomSizeInput] = useState(
    draft.customSizeMl ? String(draft.customSizeMl) : ''
  );

  // Save custom base name prompt
  const [customBaseSaveName, setCustomBaseSaveName] = useState('');
  const [showSaveBaseBox, setShowSaveBaseBox] = useState(false);

  // Track last saved calculation signature to avoid duplicate saves on repeated PDF exports
  const [lastSavedSignature, setLastSavedSignature] = useState<string | null>(null);
  const draftSignature = useMemo(
    () => JSON.stringify({ ...draft, id: undefined }),
    [draft]
  );
  const isCurrentCalcSaved = lastSavedSignature === draftSignature;

  const result = useMemo(
    () => calculatePerfumeCost(draft, insumos),
    [draft, insumos]
  );

  const yieldSummary = useMemo(
    () => computeEssenceYieldSummary(draft),
    [draft]
  );

  const baseEval = useMemo(
    () => evaluateBaseCost(draft.base, draft.lossPercent),
    [draft.base, draft.lossPercent]
  );

  const applyDraftWithAutoBase = (nextDraft: PerfumeFormulaDraft) => {
    if (
      nextDraft.inputMode === 'absolute' &&
      nextDraft.autoCalcBaseFromEssence !== false &&
      (nextDraft.essenceConcentrationPct || 0) > 0
    ) {
      const y = computeEssenceYieldSummary(nextDraft);
      if (y.hasEssence && y.totalPerfumeMl > 0) {
        onChangeDraft({
          ...nextDraft,
          base: {
            ...nextDraft.base,
            usedInFormulaQty: roundQuantity(y.baseNeededMl, 2),
            usedInFormulaUnit: 'ml',
          },
        });
        return;
      }
    }
    onChangeDraft(nextDraft);
  };

  const stepStatuses = useMemo(() => {
    const s1 = Boolean(draft.inspiredBy.trim() && draft.targetVolumeMl > 0);
    const s2 = draft.rawMaterials.some(
      (m) =>
        m.role === 'essencia' &&
        (draft.inputMode === 'absolute' ? m.usedQty > 0 : (m.usedPercentage || 0) > 0)
    );
    const s3 = true; // QAs are optional
    const s4 = baseEval.valid && draft.base.usedInFormulaQty > 0;
    const s5 =
      draft.bottle.mode === 'complete'
        ? Boolean(draft.bottle.complete.name.trim())
        : Boolean(
            draft.bottle.parts.vidro.name.trim() ||
              draft.bottle.parts.valvula.name.trim() ||
              draft.bottle.parts.sobretampa.name.trim()
          );
    const s6 = true; // Packaging optional
    const s7 = result.valid;
    return [s1, s2, s3, s4, s5, s6, s7];
  }, [draft, baseEval, result.valid]);

  const completedCount = stepStatuses.filter(Boolean).length;
  const progressPct = Math.round((completedCount / 7) * 100);

  const rawMaterialInsumos = useMemo(
    () => insumos.filter((i) => i.category === 'Matéria-prima'),
    [insumos]
  );
  const packagingInsumos = useMemo(
    () => insumos.filter((i) => i.category === 'Embalagem'),
    [insumos]
  );

  const openInlineCreate = (
    category: InsumoMainCategory,
    subcategory: string | undefined,
    onSelectCreated: (ins: Insumo) => void
  ) => {
    setInlineInsumoModal({
      open: true,
      category,
      subcategory,
      onSelectCreated,
    });
  };

  // Handlers for Etapa 2 (Raw Materials)
  const addRawMaterial = (role: 'essencia' | 'alcool' | 'agua' | 'outro') => {
    const defaultName =
      role === 'alcool'
        ? 'Álcool de cereais 96 GL'
        : role === 'agua'
          ? 'Água deionizada'
          : role === 'essencia'
            ? 'Essência'
            : 'Outro ingrediente';
    applyDraftWithAutoBase({
      ...draft,
      rawMaterials: [
        ...draft.rawMaterials,
        {
          id: `mat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          insumoId: null,
          name: defaultName,
          role,
          purchasedQty: 1000,
          purchaseUnit: 'ml',
          purchasePrice: 0,
          freight: 0,
          density: null,
          concentration: 100,
          usedQty: 0,
          usedUnit: 'ml',
          usedPercentage: 0,
          isExtraOverBase: false,
        },
      ],
    });
  };

  const updateRawMaterial = (idx: number, patch: Partial<PerfumeFormulaDraft['rawMaterials'][0]>) => {
    const next = [...draft.rawMaterials];
    next[idx] = { ...next[idx], ...patch };
    applyDraftWithAutoBase({ ...draft, rawMaterials: next });
  };

  const applyInsumoToRawMaterial = (idx: number, insumoIdStr: string) => {
    if (!insumoIdStr) {
      updateRawMaterial(idx, { insumoId: null });
      return;
    }
    const ins = insumos.find((i) => i.id === insumoIdStr);
    if (!ins) return;
    updateRawMaterial(idx, {
      insumoId: ins.id,
      name: ins.name,
      purchasedQty: ins.purchasedQty,
      purchaseUnit: ins.purchaseUnit,
      purchasePrice: ins.purchasePrice,
      freight: ins.freight,
      density: ins.density,
      concentration: ins.concentration,
      usedUnit: ins.purchaseUnit === 'un' ? 'ml' : ins.purchaseUnit,
    });
  };

  // Handlers for Etapa 3 (QAs & Aditivos - Reference pricing for Base)
  const addQA = (presetType: string = 'Iso E Super') => {
    const nextQAs: FormulaQAInput[] = [
      ...draft.qas,
      {
        id: `qa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        insumoId: null,
        name: presetType === 'Outro' ? 'Aditivo personalizado' : presetType,
        presetType,
        purchasedQty: 100,
        purchaseUnit: 'ml',
        purchasePrice: 0,
        freight: 0,
        density: null,
        concentration: presetType === 'Ambroxan' ? 10 : 100,
        usedQty: 0,
        usedUnit: 'ml',
        usedPercentage: 0,
        isExtraOverBase: false,
        addToPerfume: false,
      },
    ];
    onChangeDraft({
      ...draft,
      qas: nextQAs,
    });
  };

  const updateQA = (idx: number, patch: Partial<PerfumeFormulaDraft['qas'][0]>) => {
    const nextQAs = [...draft.qas];
    nextQAs[idx] = { ...nextQAs[idx], ...patch };
    const nextBaseIngredients =
      draft.base.mode !== 'purchased_ready'
        ? syncQAsToBaseIngredients(draft.base.ingredients, nextQAs)
        : draft.base.ingredients;
    applyDraftWithAutoBase({
      ...draft,
      qas: nextQAs,
      base: {
        ...draft.base,
        ingredients: nextBaseIngredients,
      },
    });
  };

  const applyInsumoToQA = (idx: number, insumoIdStr: string) => {
    if (!insumoIdStr) {
      updateQA(idx, { insumoId: null });
      return;
    }
    const ins = insumos.find((i) => i.id === insumoIdStr);
    if (!ins) return;
    updateQA(idx, {
      insumoId: ins.id,
      name: ins.name,
      purchasedQty: ins.purchasedQty,
      purchaseUnit: ins.purchaseUnit,
      purchasePrice: ins.purchasePrice,
      freight: ins.freight,
      density: ins.density,
      concentration: ins.concentration,
      usedUnit: ins.purchaseUnit === 'un' ? 'ml' : ins.purchaseUnit,
    });
  };

  // Handlers for Etapa 4 (Bases)
  const selectPredefinedBase = (baseId: PredefinedBaseId, propChoice?: PropChoice) => {
    const spec = PREDEFINED_BASES.find((b) => b.id === baseId)!;
    const chosenProp = propChoice ?? draft.base.propChoice;
    const built = buildPredefinedBaseIngredients(baseId, chosenProp, insumos);
    onChangeDraft({
      ...draft,
      base: {
        ...draft.base,
        mode: 'predefined',
        predefinedId: baseId,
        propChoice: chosenProp,
        baseName: spec.name,
        batchVolumeQty: draft.base.batchVolumeQty || 1000,
        batchUnit: draft.base.batchUnit || 'ml',
        ingredients: syncQAsToBaseIngredients(built, draft.qas),
      },
    });
  };

  const updateBaseIngredient = (idx: number, patch: Partial<BaseIngredientLine>) => {
    const next = [...draft.base.ingredients];
    next[idx] = { ...next[idx], ...patch };
    onChangeDraft({
      ...draft,
      base: { ...draft.base, ingredients: next },
    });
  };

  const applyInsumoToBaseIngredient = (idx: number, insumoIdStr: string) => {
    if (!insumoIdStr) {
      updateBaseIngredient(idx, { insumoId: null });
      return;
    }
    const ins = insumos.find((i) => i.id === insumoIdStr);
    if (!ins) return;
    updateBaseIngredient(idx, {
      insumoId: ins.id,
      name: ins.name,
      purchasedQty: ins.purchasedQty,
      purchaseUnit: ins.purchaseUnit,
      purchasePrice: ins.purchasePrice,
      freight: ins.freight,
      density: ins.density,
      concentration: ins.concentration,
      usedUnit: ins.purchaseUnit === 'un' ? 'ml' : ins.purchaseUnit,
    });
  };

  const handleSaveCustomBaseToLibrary = async () => {
    if (Math.abs(baseEval.compositionSum - 100) > 0.01) {
      setErrorMessage('A composição da base personalizada deve totalizar 100% antes de salvar.');
      return;
    }
    const baseNameToSave = customBaseSaveName.trim() || draft.base.baseName || 'Base Personalizada';
    setSavingBase(true);
    try {
      await createCustomBase(uid, {
        name: baseNameToSave,
        baseType: 'custom',
        propChoice: null,
        batchQty: draft.base.batchVolumeQty,
        batchUnit: draft.base.batchUnit,
        purchasePrice: 0,
        freight: 0,
        ingredients: draft.base.ingredients,
        notes: 'Salva diretamente pela calculadora de perfumes',
      });
      onChangeDraft({
        ...draft,
        base: { ...draft.base, baseName: baseNameToSave },
      });
      setShowSaveBaseBox(false);
      setCustomBaseSaveName('');
      setStatusMessage(`Base "${baseNameToSave}" salva em Minhas Bases.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao salvar base.');
    } finally {
      setSavingBase(false);
    }
  };

  // Save draft formula
  const handleSaveDraft = async () => {
    if (!draft.inspiredBy.trim()) {
      setErrorMessage('Informe o campo "Perfume inspirado em" na Etapa 1 para salvar o rascunho.');
      setOpenStep(1);
      return;
    }
    setErrorMessage(null);
    setSavingDraft(true);
    try {
      const savedId = await saveFormulaDraft(
        uid,
        draft,
        result.unitCostTotal,
        'rascunho'
      );
      onChangeDraft({ ...draft, id: savedId });
      setStatusMessage('Rascunho salvo com sucesso em Minhas Fórmulas.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao salvar rascunho.');
    } finally {
      setSavingDraft(false);
    }
  };

  // Finalize & save calculation (optionally deducting stock)
  const executeSaveCalculation = async (deductStock: boolean) => {
    setConfirmStockModalOpen(false);
    setErrorMessage(null);
    setSavingCalc(true);
    try {
      const saved = await saveCalculationAndDeductStock({
        uid,
        draft,
        insumos,
        deductStock,
        batchUnits: Math.max(1, Number(batchUnitsToDeduct) || 1),
      });
      const updatedDraft = { ...draft, id: saved.formulaId ?? draft.id };
      onChangeDraft(updatedDraft);
      setLastSavedSignature(JSON.stringify({ ...updatedDraft, id: undefined }));
      setStatusMessage(
        deductStock
          ? 'Cálculo salvo no histórico e estoque atualizado.'
          : 'Cálculo salvo no histórico com sucesso.'
      );
      onCalculationSaved(saved);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao salvar cálculo.');
    } finally {
      setSavingCalc(false);
    }
  };

  const handleGeneratePdf = async () => {
    generatePerfumePdfReport({ draft, result });
    if (result.valid && !savingCalc && lastSavedSignature !== draftSignature) {
      setErrorMessage(null);
      setSavingCalc(true);
      try {
        const saved = await saveCalculationAndDeductStock({
          uid,
          draft,
          insumos,
          deductStock: false,
          batchUnits: result.batchSummary?.isBatch
            ? Math.max(1, result.batchSummary.bottlesCount)
            : 1,
        });
        const updatedDraft = { ...draft, id: saved.formulaId ?? draft.id };
        onChangeDraft(updatedDraft);
        setLastSavedSignature(JSON.stringify({ ...updatedDraft, id: undefined }));
        setStatusMessage(
          'PDF gerado e cálculo salvo automaticamente em Minhas Fórmulas e Histórico.'
        );
        onCalculationSaved(saved);
      } catch (err: any) {
        setErrorMessage(
          `PDF gerado, mas houve erro ao salvar automaticamente: ${err?.message || 'erro desconhecido'}`
        );
      } finally {
        setSavingCalc(false);
      }
    }
  };

  const handleClickSaveCalculation = () => {
    if (!result.valid) {
      setErrorMessage(result.errors[0] || 'Corrija os campos obrigatórios antes de salvar.');
      return;
    }
    const hasLinkedStockInsumos =
      stockModuleEnabled &&
      (result.lines.some((l) => {
        if (!l.insumoId) return false;
        const ins = insumos.find((i) => i.id === l.insumoId);
        return Boolean(ins?.stockEnabled);
      }) ||
        (draft.additionalBottles || []).some((ab) => {
          if (!ab.insumoId || ab.fillCount <= 0) return false;
          const ins = insumos.find((i) => i.id === ab.insumoId);
          return Boolean(ins?.stockEnabled);
        }));

    if (hasLinkedStockInsumos) {
      if (result.batchSummary?.isBatch && result.batchSummary.bottlesCount >= 1) {
        setBatchUnitsToDeduct(String(result.batchSummary.bottlesCount));
      } else {
        setBatchUnitsToDeduct('1');
      }
      setConfirmStockModalOpen(true);
    } else {
      executeSaveCalculation(false);
    }
  };

  const handleShareSummary = async () => {
    const title = draft.perfumeName || draft.inspiredBy || 'Perfume Artesanal';
    const textLines = [
      `ATELIER OLFATIVO — ${title}`,
      draft.brandName ? `Marca: ${draft.brandName}` : '',
      `Inspirado em: ${draft.inspiredBy} (v${draft.version})`,
      `Volume: ${roundQuantity(result.liquidVolumeTotalMl, 1)} ml`,
      `Custo do líquido: ${formatBRL(result.liquidCostTotal)}`,
      `Custo de embalagem: ${formatBRL(result.packagingTotalCost)}`,
      `Custo unitário total: ${formatBRL(result.unitCostTotal)}`,
      result.pricingSummary
        ? `Preço de venda sugerido: ${formatBRL(result.pricingSummary.suggestedPrice)} (Margem ${result.pricingSummary.effectiveMarginPercent.toFixed(1)}%)`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(textLines);
      setStatusMessage('Resumo copiado para a área de transferência.');
    } catch {
      setStatusMessage('Use Gerar PDF ou Imprimir para compartilhar esta ficha.');
    }
  };

  const renderAccordionHeader = (
    stepNum: number,
    title: string,
    subtitle: string,
    isComplete: boolean,
    badgeCost?: string
  ) => {
    const isOpen = openStep === stepNum;
    return (
      <button
        type="button"
        onClick={() => setOpenStep(isOpen ? 0 : stepNum)}
        className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-[#FAF7F2]/80 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <span
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-semibold shrink-0 border ${
              isComplete
                ? 'bg-[#171412] text-[#FAF7F2] border-[#171412]'
                : 'bg-[#F2ECE1] text-[#5C4332] border-[#D8CBB8]'
            }`}
          >
            {isComplete ? <CheckCircle2 className="w-4 h-4" /> : stepNum}
          </span>
          <div className="min-w-0">
            <h2 className="font-serif text-xl font-semibold text-[#171412] truncate">
              {title}
            </h2>
            <p className="text-xs text-[#6E5A49] truncate">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {badgeCost && (
            <span className="font-mono text-xs font-medium text-[#5C4332] tabular-nums">
              {badgeCost}
            </span>
          )}
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-[#5C4332]" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[#8C7A68]" />
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Progress Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <p className="text-xs tracking-[0.15em] uppercase text-[#6E5A49]">
            Formulação & Precificação · Versão v{draft.version}
          </p>
          <h1 className="font-serif text-3xl font-semibold text-[#171412] mt-1">
            {draft.perfumeName || draft.inspiredBy || 'Novo Cálculo de Perfume'}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isCurrentCalcSaved && (
            <span className="text-[11px] font-medium text-[#3B6E4C] bg-[#3B6E4C]/10 border border-[#3B6E4C]/30 px-2.5 py-1 rounded-md">
              Salvo no histórico
            </span>
          )}
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={savingDraft}
            className="px-4 py-2 rounded-lg border border-[#D8CBB8] bg-white text-[#171412] text-xs font-medium hover:border-[#B08D57] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{savingDraft ? 'Salvando...' : 'Salvar rascunho'}</span>
          </button>
          <button
            type="button"
            onClick={handleClickSaveCalculation}
            disabled={savingCalc}
            className="px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium hover:bg-[#3B2B20] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{savingCalc ? 'Finalizando...' : 'Salvar cálculo'}</span>
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="rounded-xl border border-[#E4D8C5] bg-white p-4 no-print">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-[#5C4332] font-medium">
            Progresso da formulação ({completedCount} de 7 etapas válidas)
          </span>
          <span className="font-mono font-semibold text-[#171412] tabular-nums">
            {progressPct}%
          </span>
        </div>
        <div className="h-1.5 bg-[#F2ECE1] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#B08D57] transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[
            '1. Identificação',
            '2. Matérias-primas',
            '3. QAs e Aditivos',
            '4. Base',
            '5. Frasco',
            '6. Embalagens',
            '7. Resultado',
          ].map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setOpenStep(i + 1)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                openStep === i + 1
                  ? 'bg-[#171412] text-[#FAF7F2]'
                  : stepStatuses[i]
                    ? 'bg-[#F2ECE1] text-[#3B2B20]'
                    : 'bg-[#FAF7F2] text-[#8C7A68] border border-[#E4D8C5]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl border border-[#9E3B33]/30 bg-[#9E3B33]/5 text-xs text-[#7A2720] flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="underline cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {statusMessage && (
        <div className="p-4 rounded-xl border border-[#B08D57]/40 bg-[#F2ECE1] text-xs text-[#3B2B20] flex items-center justify-between gap-4 no-print">
          <span>{statusMessage}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="underline cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Main Layout: Accordion Steps + Sticky Summary Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-4">
          {/* ETAPA 1 — IDENTIFICAÇÃO */}
          <div className="rounded-xl border border-[#E4D8C5] bg-white overflow-hidden no-print">
            {renderAccordionHeader(
              1,
              'Etapa 1 — Identificação',
              draft.inspiredBy
                ? `${draft.perfumeName || draft.inspiredBy} · ${draft.targetVolumeMl} ml`
                : 'Marca, nome do perfume e inspiração olfativa',
              stepStatuses[0]
            )}

            {openStep === 1 && (
              <div className="px-5 pb-5 pt-2 border-t border-[#F2ECE1] space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#5C4332] mb-1">
                      Nome da marca (opcional)
                    </label>
                    <input
                      type="text"
                      value={draft.brandName}
                      onChange={(e) =>
                        onChangeDraft({ ...draft, brandName: e.target.value })
                      }
                      placeholder="Ex.: Maison Privée"
                      className="w-full px-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#D8CBB8] text-sm focus:outline-none focus:border-[#B08D57]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#5C4332] mb-1">
                      Nome do perfume (opcional)
                    </label>
                    <input
                      type="text"
                      value={draft.perfumeName}
                      onChange={(e) =>
                        onChangeDraft({ ...draft, perfumeName: e.target.value })
                      }
                      placeholder="Ex.: Âmbar Noir"
                      className="w-full px-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#D8CBB8] text-sm focus:outline-none focus:border-[#B08D57]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-[#5C4332] mb-1">
                      Perfume inspirado em *
                    </label>
                    <input
                      type="text"
                      required
                      value={draft.inspiredBy}
                      onChange={(e) =>
                        onChangeDraft({ ...draft, inspiredBy: e.target.value })
                      }
                      placeholder="Ex.: Oud Wood / Baccarat Rouge 540 / Criação Autoral"
                      className="w-full px-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#D8CBB8] text-sm focus:outline-none focus:border-[#B08D57]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#5C4332] mb-1">
                      Volume de cada frasco (ml) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      value={draft.targetVolumeMl}
                      onChange={(e) =>
                        onChangeDraft({
                          ...draft,
                          targetVolumeMl: Math.max(0, Number(e.target.value)),
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#D8CBB8] text-sm font-mono tabular-nums focus:outline-none focus:border-[#B08D57]"
                    />
                    <p className="text-[11px] text-[#8C7A68] mt-1">
                      Tamanho de cada vidro que será envasado (ex.: 50 ml ou 100 ml).
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#5C4332] mb-1">
                      Concentração de essência desejada (%)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="100"
                        value={draft.essenceConcentrationPct ?? ''}
                        placeholder="Ex.: 26"
                        onChange={(e) => {
                          const conc = e.target.value ? Math.max(0, Math.min(100, Number(e.target.value))) : 0;
                          applyDraftWithAutoBase({
                            ...draft,
                            essenceConcentrationPct: conc,
                            autoCalcBaseFromEssence: conc > 0 ? (draft.autoCalcBaseFromEssence ?? true) : false,
                          });
                        }}
                        className="w-28 px-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#D8CBB8] text-sm font-mono tabular-nums focus:outline-none focus:border-[#B08D57]"
                      />
                      <div className="flex flex-wrap gap-1">
                        {[15, 20, 26, 30].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() =>
                              applyDraftWithAutoBase({
                                ...draft,
                                essenceConcentrationPct: pct,
                                autoCalcBaseFromEssence: true,
                              })
                            }
                            className={`px-2 py-1 rounded-md text-[11px] font-mono border cursor-pointer ${
                              draft.essenceConcentrationPct === pct
                                ? 'bg-[#171412] text-[#FAF7F2] border-[#171412]'
                                : 'bg-[#FAF7F2] text-[#5C4332] border-[#D8CBB8] hover:border-[#B08D57]'
                            }`}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-[11px] text-[#8C7A68] mt-1">
                      Calcula quanto perfume total e quanta Base sua essência gera.
                    </p>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-[#5C4332] mb-1">
                      Perda estimada de produção (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="50"
                      value={draft.lossPercent}
                      onChange={(e) =>
                        onChangeDraft({
                          ...draft,
                          lossPercent: Math.max(0, Number(e.target.value)),
                        })
                      }
                      className="w-full sm:w-44 px-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#D8CBB8] text-sm font-mono tabular-nums focus:outline-none focus:border-[#B08D57]"
                    />
                    <p className="text-[11px] text-[#8C7A68] mt-1">
                      Ex.: 2% para compensar resíduos em béquer, funil e pipeta.
                    </p>
                  </div>
                </div>

                {/* Live Yield Preview from Essence + Concentration */}
                {yieldSummary.hasEssence && yieldSummary.concentrationPct > 0 && (
                  <div className="rounded-lg border border-[#B08D57]/40 bg-[#F2ECE1] p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#171412]">
                        Previsão de rendimento a {yieldSummary.concentrationPct}% de essência
                      </span>
                      <span className="text-[11px] font-mono text-[#5C4332]">
                        Baseado em {roundQuantity(yieldSummary.essenceQty, 2)} {yieldSummary.essenceUnit} de essência na Etapa 2
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
                      <div className="p-2.5 rounded-md bg-white border border-[#E4D8C5]">
                        <span className="block text-[11px] text-[#6E5A49]">Perfume total gerado</span>
                        <strong className="font-mono text-sm text-[#171412] tabular-nums">
                          {roundQuantity(yieldSummary.totalPerfumeMl, 1)} ml
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-md bg-white border border-[#E4D8C5]">
                        <span className="block text-[11px] text-[#6E5A49]">Base a adicionar</span>
                        <strong className="font-mono text-sm text-[#171412] tabular-nums">
                          {roundQuantity(yieldSummary.baseNeededMl, 1)} ml
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-md bg-white border border-[#E4D8C5]">
                        <span className="block text-[11px] text-[#6E5A49]">
                          Frascos de {draft.targetVolumeMl} ml
                        </span>
                        <strong className="font-mono text-sm text-[#171412] tabular-nums">
                          {yieldSummary.bottlesCount} un
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-md bg-white border border-[#E4D8C5]">
                        <span className="block text-[11px] text-[#6E5A49]">Sobra após envase</span>
                        <strong className="font-mono text-sm text-[#5C4332] tabular-nums">
                          {roundQuantity(yieldSummary.leftoverMl, 1)} ml
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-[#5C4332] mb-1.5">
                    Modo de entrada das quantidades na fórmula
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'absolute', title: 'Quantidade direta (ml / g)' },
                        { id: 'volume_percent', title: 'Percentual em Volume (% v/v)' },
                        { id: 'mass_percent', title: 'Percentual em Massa (% m/m)' },
                      ] as Array<{ id: PercentageBasis; title: string }>
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onChangeDraft({ ...draft, inputMode: m.id })}
                        className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer text-left ${
                          draft.inputMode === m.id
                            ? 'bg-[#171412] text-[#FAF7F2] border-[#171412]'
                            : 'bg-[#FAF7F2] text-[#5C4332] border-[#D8CBB8] hover:border-[#B08D57]'
                        }`}
                      >
                        {m.title}
                      </button>
                    ))}
                  </div>
                  {draft.inputMode !== 'absolute' && (
                    <p className="text-[11px] text-[#6E5A49] mt-1.5">
                      Percentuais em massa (% m/m) e em volume (% v/v) são tratados
                      separadamente. Conversões entre g e ml exigem densidade cadastrada.
                    </p>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setOpenStep(2)}
                    className="px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Avançar para Matérias-primas</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ETAPA 2 — MATÉRIAS-PRIMAS */}
          <div className="rounded-xl border border-[#E4D8C5] bg-white overflow-hidden no-print">
            {renderAccordionHeader(
              2,
              'Etapa 2 — Matérias-primas',
              'Essência obrigatória, álcool de cereais, água deionizada e outros ingredientes',
              stepStatuses[1],
              formatBRL(
                result.essenceCost +
                  result.alcoholCost +
                  result.waterCost +
                  result.otherIngredientsCost
              )
            )}

            {openStep === 2 && (
              <div className="px-5 pb-5 pt-3 border-t border-[#F2ECE1] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => addRawMaterial('essencia')}
                      className="px-3 py-1.5 rounded-lg bg-[#F2ECE1] text-[#3B2B20] text-xs font-medium hover:bg-[#E4D8C5] cursor-pointer"
                    >
                      + Essência
                    </button>
                    <button
                      type="button"
                      onClick={() => addRawMaterial('alcool')}
                      className="px-3 py-1.5 rounded-lg bg-[#F2ECE1] text-[#3B2B20] text-xs font-medium hover:bg-[#E4D8C5] cursor-pointer"
                    >
                      + Álcool de cereais
                    </button>
                    <button
                      type="button"
                      onClick={() => addRawMaterial('agua')}
                      className="px-3 py-1.5 rounded-lg bg-[#F2ECE1] text-[#3B2B20] text-xs font-medium hover:bg-[#E4D8C5] cursor-pointer"
                    >
                      + Água deionizada
                    </button>
                    <button
                      type="button"
                      onClick={() => addRawMaterial('outro')}
                      className="px-3 py-1.5 rounded-lg border border-[#D8CBB8] text-[#5C4332] text-xs font-medium hover:bg-[#FAF7F2] cursor-pointer"
                    >
                      + Outro ingrediente
                    </button>
                  </div>
                </div>

                {draft.rawMaterials.map((mat, idx) => {
                  const calc = computeProportionalMaterialCost({
                    name: mat.name,
                    purchasedQty: mat.purchasedQty,
                    purchaseUnit: mat.purchaseUnit,
                    purchasePrice: mat.purchasePrice,
                    freight: mat.freight,
                    usedQty:
                      draft.inputMode === 'absolute'
                        ? mat.usedQty
                        : (draft.targetVolumeMl * (mat.usedPercentage || 0)) / 100,
                    usedUnit: mat.usedUnit,
                    density: mat.density,
                    lossPercent: draft.lossPercent,
                  });

                  const isAlcoholOrWater =
                    mat.role === 'alcool' || mat.role === 'agua';

                  return (
                    <div
                      key={mat.id}
                      className="rounded-lg border border-[#E4D8C5] bg-[#FAF7F2] p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#3B2B20]">
                          {mat.role === 'essencia'
                            ? 'Essência (Obrigatória)'
                            : mat.role === 'alcool'
                              ? 'Álcool de cereais'
                              : mat.role === 'agua'
                                ? 'Água deionizada'
                                : 'Ingrediente adicional'}
                        </span>

                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-[#171412] tabular-nums">
                            {calc.ok ? formatBRL(calc.proportionalCost) : '—'}
                          </span>
                          {draft.rawMaterials.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                onChangeDraft({
                                  ...draft,
                                  rawMaterials: draft.rawMaterials.filter(
                                    (_, i) => i !== idx
                                  ),
                                })
                              }
                              className="p-1 text-[#8C7A68] hover:text-[#9E3B33] cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-medium text-[#5C4332]">
                              Selecionar da Biblioteca
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                openInlineCreate(
                                  'Matéria-prima',
                                  mat.role === 'essencia'
                                    ? 'Essências'
                                    : mat.role === 'alcool'
                                      ? 'Álcool de cereais'
                                      : mat.role === 'agua'
                                        ? 'Água deionizada'
                                        : 'Outros aditivos',
                                  (created) => {
                                    updateRawMaterial(idx, {
                                      insumoId: created.id,
                                      name: created.name,
                                      purchasedQty: created.purchasedQty,
                                      purchaseUnit: created.purchaseUnit,
                                      purchasePrice: created.purchasePrice,
                                      freight: created.freight,
                                      density: created.density,
                                      concentration: created.concentration,
                                      usedUnit:
                                        created.purchaseUnit === 'un'
                                          ? 'ml'
                                          : created.purchaseUnit,
                                    });
                                  }
                                )
                              }
                              className="text-[11px] text-[#9A7239] hover:underline cursor-pointer"
                            >
                              + Cadastrar novo
                            </button>
                          </div>
                          <select
                            value={mat.insumoId ?? ''}
                            onChange={(e) =>
                              applyInsumoToRawMaterial(idx, e.target.value)
                            }
                            className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-xs"
                          >
                            <option value="">Preenchimento manual...</option>
                            {rawMaterialInsumos.map((ins) => (
                              <option key={ins.id} value={ins.id}>
                                {ins.name} ({formatBRLPrecise(ins.unitCost)}/{ins.purchaseUnit})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-[#5C4332] mb-1">
                            Nome do ingrediente
                          </label>
                          <input
                            type="text"
                            value={mat.name}
                            onChange={(e) =>
                              updateRawMaterial(idx, { name: e.target.value })
                            }
                            className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        <div>
                          <label className="block text-[11px] text-[#6E5A49] mb-1">
                            Qtd. comprada
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              step="any"
                              min="0.0001"
                              value={mat.purchasedQty}
                              onChange={(e) =>
                                updateRawMaterial(idx, {
                                  purchasedQty: Number(e.target.value),
                                })
                              }
                              className="w-full px-2 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono tabular-nums"
                            />
                            <select
                              value={mat.purchaseUnit}
                              onChange={(e) =>
                                updateRawMaterial(idx, {
                                  purchaseUnit: e.target.value as UnitType,
                                })
                              }
                              className="w-16 px-1 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                            >
                              <option value="ml">ml</option>
                              <option value="L">L</option>
                              <option value="g">g</option>
                              <option value="kg">kg</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] text-[#6E5A49] mb-1">
                            Valor compra (R$)
                          </label>
                          <CurrencyInput
                            compact
                            value={mat.purchasePrice}
                            onChange={(val) =>
                              updateRawMaterial(idx, { purchasePrice: val })
                            }
                            title="Valor de compra (R$)"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] text-[#6E5A49] mb-1">
                            Frete (R$)
                          </label>
                          <CurrencyInput
                            compact
                            value={mat.freight}
                            onChange={(val) =>
                              updateRawMaterial(idx, { freight: val })
                            }
                            title="Frete (R$)"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <label className="text-[11px] text-[#6E5A49]">
                              {draft.inputMode === 'absolute'
                                ? 'Qtd. utilizada'
                                : 'Proporção (%)'}
                            </label>
                            {draft.inputMode === 'absolute' &&
                              mat.role === 'essencia' &&
                              mat.purchasedQty > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateRawMaterial(idx, {
                                      usedQty: mat.purchasedQty,
                                      usedUnit:
                                        mat.purchaseUnit === 'L'
                                          ? 'ml'
                                          : mat.purchaseUnit === 'kg'
                                            ? 'g'
                                            : mat.purchaseUnit === 'un'
                                              ? 'ml'
                                              : mat.purchaseUnit,
                                    })
                                  }
                                  className="text-[10px] font-medium text-[#9A7239] hover:underline cursor-pointer whitespace-nowrap"
                                  title="Usar toda a quantidade comprada para produzir o lote"
                                >
                                  Usar tudo ({mat.purchasedQty} {mat.purchaseUnit})
                                </button>
                              )}
                          </div>
                          <div className="flex gap-1">
                            {draft.inputMode === 'absolute' ? (
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={mat.usedQty}
                                onChange={(e) =>
                                  updateRawMaterial(idx, {
                                    usedQty: Number(e.target.value),
                                  })
                                }
                                className="w-full px-2 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono tabular-nums"
                              />
                            ) : (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                value={mat.usedPercentage ?? 0}
                                onChange={(e) =>
                                  updateRawMaterial(idx, {
                                    usedPercentage: Number(e.target.value),
                                  })
                                }
                                className="w-full px-2 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono tabular-nums"
                              />
                            )}
                            <select
                              value={mat.usedUnit}
                              onChange={(e) =>
                                updateRawMaterial(idx, {
                                  usedUnit: e.target.value as UnitType,
                                })
                              }
                              className="w-16 px-1 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                            >
                              <option value="ml">ml</option>
                              <option value="g">g</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] text-[#6E5A49] mb-1">
                            Densidade (g/ml)
                          </label>
                          <input
                            type="number"
                            step="0.001"
                            value={mat.density ?? ''}
                            onChange={(e) =>
                              updateRawMaterial(idx, {
                                density: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                            placeholder="Opcional"
                            className="w-full px-2 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono tabular-nums"
                          />
                        </div>
                      </div>

                      {calc.ok && (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6E5A49] pt-1 border-t border-[#E4D8C5]/70">
                          <span>
                            Valor unitário:{' '}
                            <strong className="font-mono text-[#3B2B20] tabular-nums">
                              {formatBRLPrecise(calc.unitCostInPurchaseUnit)} / {mat.purchaseUnit}
                            </strong>
                          </span>
                          <span className="font-mono tabular-nums">
                            {roundQuantity(calc.effectiveUsedInPurchaseUnit, 3)} {mat.purchaseUnit} ×{' '}
                            {formatBRLPrecise(calc.unitCostInPurchaseUnit)} ={' '}
                            <strong className="text-[#171412]">{formatBRL(calc.proportionalCost)}</strong>
                          </span>
                        </div>
                      )}

                      {mat.role === 'essencia' &&
                        draft.inputMode === 'absolute' &&
                        (draft.essenceConcentrationPct || 0) > 0 &&
                        mat.usedQty > 0 && (
                          <div className="px-3 py-2 rounded-md bg-[#F2ECE1] border border-[#E4D8C5] text-[11px] text-[#3B2B20] flex flex-wrap items-center justify-between gap-2">
                            <span>
                              A <strong>{draft.essenceConcentrationPct}%</strong>,{' '}
                              <strong>
                                {mat.usedQty} {mat.usedUnit}
                              </strong>{' '}
                              de essência geram{' '}
                              <strong className="font-mono">
                                {roundQuantity(yieldSummary.totalPerfumeMl, 1)} ml
                              </strong>{' '}
                              de perfume (<strong>{roundQuantity(yieldSummary.baseNeededMl, 1)} ml</strong> de base)
                            </span>
                            <span className="font-mono font-semibold text-[#171412]">
                              ≈ {yieldSummary.bottlesCount} frasco(s) de {draft.targetVolumeMl} ml
                            </span>
                          </div>
                        )}

                      {!calc.ok && calc.error && (
                        <p className="text-[11px] text-[#9E3B33]">{calc.error}</p>
                      )}

                      {isAlcoholOrWater && (
                        <label className="flex items-center gap-2 text-[11px] text-[#5C4332] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(mat.isExtraOverBase)}
                            onChange={(e) =>
                              updateRawMaterial(idx, {
                                isExtraOverBase: e.target.checked,
                              })
                            }
                            className="w-3.5 h-3.5 accent-[#171412]"
                          />
                          <span>
                            Quantidade extra adicionada separadamente fora da Base
                            (desmarque se já estiver na Base da Etapa 4)
                          </span>
                        </label>
                      )}
                    </div>
                  );
                })}

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setOpenStep(1)}
                    className="px-4 py-2 rounded-lg border border-[#D8CBB8] text-xs text-[#5C4332] inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenStep(3)}
                    className="px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Avançar para QAs e Aditivos</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ETAPA 3 — QAs E ADITIVOS (VALORES PARA A BASE) */}
          <div className="rounded-xl border border-[#E4D8C5] bg-white overflow-hidden no-print">
            {renderAccordionHeader(
              3,
              'Etapa 3 — QAs e Aditivos',
              `${draft.qas.length} valor(es) cadastrado(s) para uso na Base (Etapa 4)`,
              stepStatuses[2],
              draft.qas.some((q) => q.addToPerfume)
                ? formatBRL(result.qasCost)
                : `${draft.qas.length} ref.`
            )}

            {openStep === 3 && (
              <div className="px-5 pb-5 pt-3 border-t border-[#F2ECE1] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5 max-w-xl">
                    <p className="text-xs font-medium text-[#171412]">
                      Tabela de valores dos QAs e Aditivos para a Base
                    </p>
                    <p className="text-xs text-[#6E5A49]">
                      Informe aqui apenas os valores de compra dos aditivos (Iso E Super,
                      Ambroxan, Propanediol, Select Blend Turbo, etc.). Eles não são
                      adicionados ao perfume nesta etapa — serão aplicados na Base da
                      Etapa 4.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addQA('Iso E Super')}
                    className="px-3 py-1.5 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Adicionar QA</span>
                  </button>
                </div>

                {draft.qas.length === 0 ? (
                  <div className="p-6 rounded-lg border border-dashed border-[#D8CBB8] bg-[#FAF7F2] text-center">
                    <p className="text-xs text-[#6E5A49]">
                      Adicione QAs ou aditivos para informar seus valores de referência para
                      a Base da Etapa 4.
                    </p>
                    <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                      {QA_PRESETS.slice(0, 7).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => addQA(preset)}
                          className="px-2.5 py-1 rounded-md bg-white border border-[#D8CBB8] text-[11px] text-[#3B2B20] hover:border-[#B08D57] cursor-pointer"
                        >
                          + {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  draft.qas.map((qa, idx) => {
                    const unitCostRef = computeUnitCost(
                      qa.purchasedQty,
                      qa.purchasePrice,
                      qa.freight
                    );
                    const extraCalc = qa.addToPerfume
                      ? computeProportionalMaterialCost({
                          name: qa.name,
                          purchasedQty: qa.purchasedQty,
                          purchaseUnit: qa.purchaseUnit,
                          purchasePrice: qa.purchasePrice,
                          freight: qa.freight,
                          usedQty:
                            draft.inputMode === 'absolute'
                              ? qa.usedQty
                              : (draft.targetVolumeMl * (qa.usedPercentage || 0)) / 100,
                          usedUnit: qa.usedUnit,
                          density: qa.density,
                          lossPercent: draft.lossPercent,
                        })
                      : null;

                    return (
                      <div
                        key={qa.id}
                        className="rounded-lg border border-[#E4D8C5] bg-[#FAF7F2] p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <select
                              value={qa.presetType}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateQA(idx, {
                                  presetType: val,
                                  name: val === 'Outro' ? qa.name : val,
                                  concentration: val === 'Ambroxan' ? 10 : qa.concentration,
                                });
                              }}
                              className="px-2.5 py-1 rounded-md bg-white border border-[#D8CBB8] text-xs font-medium"
                            >
                              {QA_PRESETS.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                            {qa.concentration && qa.concentration < 100 && (
                              <span className="text-[11px] font-mono text-[#6E5A49]">
                                Solução diluída ({qa.concentration}%)
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-[#171412] tabular-nums">
                              {formatBRLPrecise(unitCostRef)} / {qa.purchaseUnit}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                onChangeDraft({
                                  ...draft,
                                  qas: [
                                    ...draft.qas,
                                    { ...qa, id: `qa-copy-${Date.now()}` },
                                  ],
                                })
                              }
                              title="Duplicar QA"
                              className="p-1 text-[#6E5A49] hover:text-[#171412] cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onChangeDraft({
                                  ...draft,
                                  qas: draft.qas.filter((_, i) => i !== idx),
                                })
                              }
                              title="Remover QA"
                              className="p-1 text-[#8C7A68] hover:text-[#9E3B33] cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[11px] font-medium text-[#5C4332]">
                                Insumo da Biblioteca
                              </label>
                              <button
                                type="button"
                                onClick={() =>
                                  openInlineCreate(
                                    'Matéria-prima',
                                    qa.presetType === 'Outro'
                                      ? 'Outros aditivos'
                                      : qa.presetType,
                                    (created) => {
                                      updateQA(idx, {
                                        insumoId: created.id,
                                        name: created.name,
                                        purchasedQty: created.purchasedQty,
                                        purchaseUnit: created.purchaseUnit,
                                        purchasePrice: created.purchasePrice,
                                        freight: created.freight,
                                        density: created.density,
                                        concentration: created.concentration,
                                        usedUnit:
                                          created.purchaseUnit === 'un'
                                            ? 'ml'
                                            : created.purchaseUnit,
                                      });
                                    }
                                  )
                                }
                                className="text-[11px] text-[#9A7239] hover:underline cursor-pointer"
                              >
                                + Cadastrar novo
                              </button>
                            </div>
                            <select
                              value={qa.insumoId ?? ''}
                              onChange={(e) => applyInsumoToQA(idx, e.target.value)}
                              className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-xs"
                            >
                              <option value="">Preenchimento manual...</option>
                              {rawMaterialInsumos.map((ins) => (
                                <option key={ins.id} value={ins.id}>
                                  {ins.name} ({formatBRLPrecise(ins.unitCost)}/{ins.purchaseUnit})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-[#5C4332] mb-1">
                              Nome do aditivo / diluição
                            </label>
                            <input
                              type="text"
                              value={qa.name}
                              onChange={(e) =>
                                updateQA(idx, { name: e.target.value })
                              }
                              className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-xs"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          <div>
                            <label className="block text-[11px] text-[#6E5A49] mb-1">
                              Qtd. comprada
                            </label>
                            <div className="flex gap-1">
                              <input
                                type="number"
                                step="any"
                                min="0.0001"
                                value={qa.purchasedQty}
                                onChange={(e) =>
                                  updateQA(idx, {
                                    purchasedQty: Number(e.target.value),
                                  })
                                }
                                className="w-full px-2 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono tabular-nums"
                              />
                              <select
                                value={qa.purchaseUnit}
                                onChange={(e) =>
                                  updateQA(idx, {
                                    purchaseUnit: e.target.value as UnitType,
                                  })
                                }
                                className="w-14 px-1 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                              >
                                <option value="ml">ml</option>
                                <option value="L">L</option>
                                <option value="g">g</option>
                                <option value="kg">kg</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] text-[#6E5A49] mb-1">
                              Valor (R$)
                            </label>
                            <CurrencyInput
                              compact
                              value={qa.purchasePrice}
                              onChange={(val) =>
                                updateQA(idx, { purchasePrice: val })
                              }
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] text-[#6E5A49] mb-1">
                              Frete (R$)
                            </label>
                            <CurrencyInput
                              compact
                              value={qa.freight}
                              onChange={(val) => updateQA(idx, { freight: val })}
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] text-[#6E5A49] mb-1">
                              Concentração %
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              max="100"
                              value={qa.concentration ?? 100}
                              onChange={(e) =>
                                updateQA(idx, {
                                  concentration: Number(e.target.value),
                                })
                              }
                              className="w-full px-2 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono tabular-nums"
                            />
                          </div>
                        </div>

                        <div className="pt-1 border-t border-[#E4D8C5]/70 flex flex-wrap items-center justify-between gap-3">
                          <label className="flex items-center gap-2 text-[11px] text-[#5C4332] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(qa.addToPerfume)}
                              onChange={(e) =>
                                updateQA(idx, {
                                  addToPerfume: e.target.checked,
                                  isExtraOverBase: e.target.checked,
                                  usedQty: e.target.checked ? (qa.usedQty || 1) : 0,
                                })
                              }
                              className="w-3.5 h-3.5 accent-[#171412]"
                            />
                            <span>
                              Adicionar também como dose extra direta no perfume (fora da base)
                            </span>
                          </label>

                          {qa.addToPerfume && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-[#6E5A49]">
                                {draft.inputMode === 'absolute' ? 'Qtd. extra:' : 'Uso %:'}
                              </span>
                              {draft.inputMode === 'absolute' ? (
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={qa.usedQty}
                                  onChange={(e) =>
                                    updateQA(idx, {
                                      usedQty: Number(e.target.value),
                                    })
                                  }
                                  className="w-20 px-2 py-1 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono tabular-nums"
                                />
                              ) : (
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max="100"
                                  value={qa.usedPercentage ?? 0}
                                  onChange={(e) =>
                                    updateQA(idx, {
                                      usedPercentage: Number(e.target.value),
                                    })
                                  }
                                  className="w-20 px-2 py-1 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono tabular-nums"
                                />
                              )}
                              <select
                                value={qa.usedUnit}
                                onChange={(e) =>
                                  updateQA(idx, {
                                    usedUnit: e.target.value as UnitType,
                                  })
                                }
                                className="w-14 px-1 py-1 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                              >
                                <option value="ml">ml</option>
                                <option value="g">g</option>
                              </select>
                              {extraCalc && extraCalc.ok && (
                                <span className="font-mono text-[11px] font-semibold text-[#171412]">
                                  ({formatBRL(extraCalc.proportionalCost)})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setOpenStep(2)}
                    className="px-4 py-2 rounded-lg border border-[#D8CBB8] text-xs text-[#5C4332] inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenStep(4)}
                    className="px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Avançar para Base</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ETAPA 4 — GERENCIAMENTO DE BASES */}
          <div className="rounded-xl border border-[#E4D8C5] bg-white overflow-hidden no-print">
            {renderAccordionHeader(
              4,
              'Etapa 4 — Gerenciamento de Bases (Obrigatória)',
              `${draft.base.baseName} · ${draft.base.usedInFormulaQty} ${draft.base.usedInFormulaUnit}`,
              stepStatuses[3],
              formatBRL(result.baseCost)
            )}

            {openStep === 4 && (
              <div className="px-5 pb-5 pt-3 border-t border-[#F2ECE1] space-y-5">
                {/* Base Mode Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {(
                    [
                      { id: 'predefined', title: 'Bases do Grupo (Prontas)' },
                      { id: 'purchased_ready', title: 'Base Comprada (3ºs)' },
                      { id: 'custom_saved', title: 'Minhas Bases Salvas' },
                      { id: 'custom_new', title: 'Criar Base do Zero' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        if (m.id === 'predefined') {
                          selectPredefinedBase(
                            draft.base.predefinedId || 'clean_nickson',
                            draft.base.propChoice
                          );
                        } else if (m.id === 'purchased_ready') {
                          onChangeDraft({
                            ...draft,
                            base: {
                              ...draft.base,
                              mode: 'purchased_ready',
                              baseName: 'Base Pronta Comprada',
                            },
                          });
                        } else if (m.id === 'custom_new') {
                          const defaultCustomIngredients = [
                            {
                              id: `c-1`,
                              insumoId: null,
                              name: 'Álcool de cereais 96 GL',
                              percentage: 90,
                              purchasedQty: 1000,
                              purchaseUnit: 'ml' as UnitType,
                              purchasePrice: 0,
                              freight: 0,
                              density: null,
                              concentration: 96,
                              usedUnit: 'ml' as UnitType,
                            },
                            {
                              id: `c-2`,
                              insumoId: null,
                              name: 'Água deionizada',
                              percentage: 10,
                              purchasedQty: 1000,
                              purchaseUnit: 'ml' as UnitType,
                              purchasePrice: 0,
                              freight: 0,
                              density: null,
                              concentration: 100,
                              usedUnit: 'ml' as UnitType,
                            },
                          ];
                          onChangeDraft({
                            ...draft,
                            base: {
                              ...draft.base,
                              mode: 'custom_new',
                              baseName: 'Minha Base Personalizada',
                              batchVolumeQty: draft.base.batchVolumeQty || 1000,
                              batchUnit: draft.base.batchUnit || 'ml',
                              ingredients: syncQAsToBaseIngredients(
                                draft.base.ingredients.length > 0
                                  ? draft.base.ingredients
                                  : defaultCustomIngredients,
                                draft.qas
                              ),
                            },
                          });
                        } else {
                          onChangeDraft({
                            ...draft,
                            base: { ...draft.base, mode: 'custom_saved' },
                          });
                        }
                      }}
                      className={`px-3 py-2.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        draft.base.mode === m.id
                          ? 'bg-[#171412] text-[#FAF7F2] border-[#171412]'
                          : 'bg-[#FAF7F2] text-[#5C4332] border-[#D8CBB8] hover:border-[#B08D57]'
                      }`}
                    >
                      {m.title}
                    </button>
                  ))}
                </div>

                {/* Predefined Group Bases */}
                {draft.base.mode === 'predefined' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {PREDEFINED_BASES.map((spec) => (
                        <button
                          key={spec.id}
                          type="button"
                          onClick={() => selectPredefinedBase(spec.id)}
                          className={`text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                            draft.base.predefinedId === spec.id
                              ? 'border-[#171412] bg-[#F2ECE1]'
                              : 'border-[#E4D8C5] bg-[#FAF7F2] hover:border-[#B08D57]'
                          }`}
                        >
                          <div className="font-semibold text-xs text-[#171412]">
                            {spec.name}
                          </div>
                          <div className="text-[11px] text-[#6E5A49] mt-1">
                            {spec.ingredients
                              .map((i) => `${i.percentage}% ${i.label}`)
                              .join(' · ')}
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* MANDATORY Propanediol / Propilenoglicol choice */}
                    <div className="p-4 rounded-lg border border-[#B08D57]/50 bg-[#F2ECE1]/70">
                      <p className="text-xs font-semibold text-[#171412]">
                        Escolha obrigatória do veículo umectante na base *
                      </p>
                      <p className="text-[11px] text-[#5C4332] mt-0.5 mb-2.5">
                        Todas as bases predefinidas do grupo exigem definir entre
                        Propanediol ou Propilenoglicol:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(['Propanediol', 'Propilenoglicol'] as const).map((choice) => (
                          <button
                            key={choice}
                            type="button"
                            onClick={() =>
                              selectPredefinedBase(
                                draft.base.predefinedId || 'clean_nickson',
                                choice
                              )
                            }
                            className={`px-4 py-2 rounded-lg text-xs font-medium border cursor-pointer transition-colors ${
                              draft.base.propChoice === choice
                                ? 'bg-[#171412] text-[#FAF7F2] border-[#171412]'
                                : 'bg-white text-[#171412] border-[#D8CBB8] hover:border-[#B08D57]'
                            }`}
                          >
                            {choice}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Saved Custom Bases Selector */}
                {draft.base.mode === 'custom_saved' && (
                  <div className="space-y-3">
                    {savedBases.length === 0 ? (
                      <p className="text-xs text-[#6E5A49] p-4 rounded-lg bg-[#FAF7F2] border border-[#E4D8C5]">
                        Você ainda não salvou nenhuma base personalizada em Minhas Bases.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {savedBases.map((sb) => (
                          <button
                            key={sb.id}
                            type="button"
                            onClick={() => {
                              // Refresh costs from current insumos where insumoId exists
                              const refreshedIngs = sb.ingredients.map((ing) => {
                                const lib = ing.insumoId
                                  ? insumos.find((i) => i.id === ing.insumoId)
                                  : undefined;
                                return lib
                                  ? {
                                      ...ing,
                                      purchasedQty: lib.purchasedQty,
                                      purchaseUnit: lib.purchaseUnit,
                                      purchasePrice: lib.purchasePrice,
                                      freight: lib.freight,
                                      density: lib.density,
                                    }
                                  : ing;
                              });
                              onChangeDraft({
                                ...draft,
                                base: {
                                  ...draft.base,
                                  mode: 'custom_saved',
                                  savedBaseId: sb.id,
                                  baseName: sb.name,
                                  batchVolumeQty: sb.batchQty,
                                  batchUnit: sb.batchUnit,
                                  ingredients: refreshedIngs,
                                },
                              });
                            }}
                            className={`text-left p-3.5 rounded-lg border cursor-pointer ${
                              draft.base.savedBaseId === sb.id
                                ? 'border-[#171412] bg-[#F2ECE1]'
                                : 'border-[#E4D8C5] bg-[#FAF7F2] hover:border-[#B08D57]'
                            }`}
                          >
                            <div className="font-semibold text-xs text-[#171412]">
                              {sb.name}
                            </div>
                            <div className="text-[11px] text-[#6E5A49] mt-1">
                              Lote {sb.batchQty} {sb.batchUnit} · {sb.ingredients.length}{' '}
                              ingredientes
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Purchased Ready-Made Base */}
                {draft.base.mode === 'purchased_ready' && (
                  <div className="rounded-lg border border-[#E4D8C5] bg-[#FAF7F2] p-4 space-y-3">
                    <p className="text-xs text-[#5C4332]">
                      Base comprada pronta de terceiros: o sistema considera apenas o
                      valor de aquisição da base pronta, sem somar ingredientes
                      internos novamente.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-[#5C4332] mb-1">
                          Selecionar da Biblioteca (opcional)
                        </label>
                        <select
                          value={draft.base.purchasedBaseInsumoId ?? ''}
                          onChange={(e) => {
                            const ins = insumos.find(
                              (i) => i.id === e.target.value
                            );
                            if (!ins) return;
                            onChangeDraft({
                              ...draft,
                              base: {
                                ...draft.base,
                                purchasedBaseInsumoId: ins.id,
                                baseName: ins.name,
                                purchasedQty: ins.purchasedQty,
                                purchaseUnit: ins.purchaseUnit,
                                purchasePrice: ins.purchasePrice,
                                freight: ins.freight,
                                density: ins.density,
                              },
                            });
                          }}
                          className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-xs"
                        >
                          <option value="">Informar manualmente...</option>
                          {rawMaterialInsumos.map((ins) => (
                            <option key={ins.id} value={ins.id}>
                              {ins.name} ({formatBRLPrecise(ins.unitCost)}/{ins.purchaseUnit})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#5C4332] mb-1">
                          Nome da base pronta *
                        </label>
                        <input
                          type="text"
                          value={draft.base.baseName}
                          onChange={(e) =>
                            onChangeDraft({
                              ...draft,
                              base: { ...draft.base, baseName: e.target.value },
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#6E5A49] mb-1">
                          Volume/Qtd comprada
                        </label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            step="any"
                            min="0.0001"
                            value={draft.base.purchasedQty}
                            onChange={(e) =>
                              onChangeDraft({
                                ...draft,
                                base: {
                                  ...draft.base,
                                  purchasedQty: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full px-2 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                          />
                          <select
                            value={draft.base.purchaseUnit}
                            onChange={(e) =>
                              onChangeDraft({
                                ...draft,
                                base: {
                                  ...draft.base,
                                  purchaseUnit: e.target.value as UnitType,
                                },
                              })
                            }
                            className="w-16 px-1 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                          >
                            <option value="ml">ml</option>
                            <option value="L">L</option>
                            <option value="g">g</option>
                            <option value="kg">kg</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#6E5A49] mb-1">
                          Valor compra (R$)
                        </label>
                        <CurrencyInput
                          compact
                          value={draft.base.purchasePrice}
                          onChange={(val) =>
                            onChangeDraft({
                              ...draft,
                              base: {
                                ...draft.base,
                                purchasePrice: val,
                              },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#6E5A49] mb-1">
                          Frete (R$)
                        </label>
                        <CurrencyInput
                          compact
                          value={draft.base.freight}
                          onChange={(val) =>
                            onChangeDraft({
                              ...draft,
                              base: {
                                ...draft.base,
                                freight: val,
                              },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#6E5A49] mb-1">
                          Custo unitário
                        </label>
                        <div className="px-2 py-1.5 rounded-md bg-white border border-[#E4D8C5] text-xs font-mono font-semibold tabular-nums">
                          {formatBRLPrecise(baseEval.unitCost)} / {draft.base.purchaseUnit}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Ingredients list for Predefined, Custom New, or Custom Saved */}
                {draft.base.mode !== 'purchased_ready' && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <label className="text-xs font-medium text-[#5C4332]">
                          Quantidade do lote da base (padrão 1000 ml):
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="1"
                          value={draft.base.batchVolumeQty}
                          onChange={(e) =>
                            onChangeDraft({
                              ...draft,
                              base: {
                                ...draft.base,
                                batchVolumeQty: Math.max(1, Number(e.target.value)),
                              },
                            })
                          }
                          className="w-24 px-2.5 py-1 rounded-md bg-[#FAF7F2] border border-[#D8CBB8] text-xs font-mono tabular-nums"
                        />
                        <select
                          value={draft.base.batchUnit}
                          onChange={(e) =>
                            onChangeDraft({
                              ...draft,
                              base: {
                                ...draft.base,
                                batchUnit: e.target.value as 'ml' | 'g',
                              },
                            })
                          }
                          className="px-2 py-1 rounded-md bg-[#FAF7F2] border border-[#D8CBB8] text-xs font-mono"
                        >
                          <option value="ml">ml</option>
                          <option value="g">g</option>
                        </select>
                        <div className="flex gap-1">
                          {[500, 1000, 2000].map((vol) => (
                            <button
                              key={vol}
                              type="button"
                              onClick={() =>
                                onChangeDraft({
                                  ...draft,
                                  base: {
                                    ...draft.base,
                                    batchVolumeQty: vol,
                                  },
                                })
                              }
                              className={`px-2 py-1 rounded-md text-[11px] font-mono border cursor-pointer ${
                                draft.base.batchVolumeQty === vol
                                  ? 'bg-[#171412] text-[#FAF7F2] border-[#171412]'
                                  : 'bg-[#FAF7F2] text-[#5C4332] border-[#D8CBB8]'
                              }`}
                            >
                              {vol} {draft.base.batchUnit}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-mono font-semibold tabular-nums ${
                            Math.abs(baseEval.compositionSum - 100) <= 0.01
                              ? 'text-[#3B2B20]'
                              : 'text-[#9E3B33]'
                          }`}
                        >
                          Soma: {baseEval.compositionSum.toFixed(1)}%
                        </span>
                        {draft.base.mode === 'custom_new' && (
                          <button
                            type="button"
                            onClick={() =>
                              onChangeDraft({
                                ...draft,
                                base: {
                                  ...draft.base,
                                  ingredients: [
                                    ...draft.base.ingredients,
                                    {
                                      id: `c-${Date.now()}`,
                                      insumoId: null,
                                      name: 'Novo componente da base',
                                      percentage: 0,
                                      purchasedQty: 1000,
                                      purchaseUnit: 'ml',
                                      purchasePrice: 0,
                                      freight: 0,
                                      density: null,
                                      concentration: null,
                                      usedUnit: draft.base.batchUnit,
                                    },
                                  ],
                                },
                              })
                            }
                            className="px-2.5 py-1 rounded-md bg-[#F2ECE1] text-[#171412] text-xs font-medium hover:bg-[#E4D8C5] cursor-pointer"
                          >
                            + Ingrediente
                          </button>
                        )}
                      </div>
                    </div>

                    {Math.abs(baseEval.compositionSum - 100) > 0.01 && (
                      <div className="p-3 rounded-lg bg-[#9E3B33]/5 border border-[#9E3B33]/30 text-xs text-[#7A2720]">
                        A soma da composição da base deve totalizar exatamente 100%
                        (atual: {baseEval.compositionSum.toFixed(2)}%). Ajuste os
                        percentuais para confirmar.
                      </div>
                    )}

                    <div className="space-y-2.5">
                      {draft.base.ingredients.map((ing, idx) => {
                        const qtyBatch =
                          (draft.base.batchVolumeQty * (Number(ing.percentage) || 0)) /
                          100;
                        const ingCost = computeProportionalMaterialCost({
                          name: ing.name,
                          purchasedQty: ing.purchasedQty,
                          purchaseUnit: ing.purchaseUnit,
                          purchasePrice: ing.purchasePrice,
                          freight: ing.freight,
                          usedQty: qtyBatch,
                          usedUnit: ing.usedUnit || draft.base.batchUnit,
                          density: ing.density,
                        });

                        return (
                          <div
                            key={ing.id}
                            className="p-3.5 rounded-lg border border-[#E4D8C5] bg-[#FAF7F2] space-y-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-[#171412]">
                                  {ing.name}
                                </span>
                                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#F2ECE1] text-[#5C4332]">
                                  {ing.percentage}%
                                </span>
                              </div>
                              <div className="flex items-center gap-2.5">
                                <span className="text-[11px] font-mono text-[#6E5A49] tabular-nums">
                                  {roundQuantity(qtyBatch, 1)} {draft.base.batchUnit} ·{' '}
                                  {ingCost.ok
                                    ? `${formatBRLPrecise(ingCost.unitCostInPurchaseUnit)}/${ing.purchaseUnit}`
                                    : '—'}
                                </span>
                                <span className="font-mono text-xs font-semibold text-[#171412] tabular-nums">
                                  {ingCost.ok ? formatBRL(ingCost.proportionalCost) : '—'}
                                </span>
                                {draft.base.mode === 'custom_new' &&
                                  draft.base.ingredients.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onChangeDraft({
                                          ...draft,
                                          base: {
                                            ...draft.base,
                                            ingredients: draft.base.ingredients.filter(
                                              (_, i) => i !== idx
                                            ),
                                          },
                                        })
                                      }
                                      className="p-1 text-[#8C7A68] hover:text-[#9E3B33] cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                              {draft.base.mode === 'custom_new' && (
                                <>
                                  <div className="sm:col-span-4">
                                    <label className="block text-[11px] text-[#6E5A49] mb-1">
                                      Nome do componente
                                    </label>
                                    <input
                                      type="text"
                                      value={ing.name}
                                      onChange={(e) =>
                                        updateBaseIngredient(idx, { name: e.target.value })
                                      }
                                      className="w-full px-2.5 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs"
                                    />
                                  </div>

                                  <div className="sm:col-span-2">
                                    <label className="block text-[11px] text-[#6E5A49] mb-1">
                                      % na base
                                    </label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      max="100"
                                      value={ing.percentage}
                                      onChange={(e) =>
                                        updateBaseIngredient(idx, {
                                          percentage: Number(e.target.value),
                                        })
                                      }
                                      className="w-full px-2.5 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono tabular-nums"
                                    />
                                  </div>
                                </>
                              )}

                              <div
                                className={
                                  draft.base.mode === 'custom_new'
                                    ? 'sm:col-span-6'
                                    : 'sm:col-span-5'
                                }
                              >
                                <label className="block text-[11px] text-[#6E5A49] mb-1">
                                  Vincular da Biblioteca / Etapa 3
                                </label>
                                <select
                                  value={ing.insumoId ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val.startsWith('qa:')) {
                                      const qaId = val.slice(3);
                                      const qa = draft.qas.find((q) => q.id === qaId);
                                      if (qa) {
                                        updateBaseIngredient(idx, {
                                          insumoId: qa.insumoId,
                                          name: qa.name,
                                          purchasedQty: qa.purchasedQty,
                                          purchaseUnit: qa.purchaseUnit,
                                          purchasePrice: qa.purchasePrice,
                                          freight: qa.freight,
                                          density: qa.density,
                                          concentration: qa.concentration,
                                          usedUnit: qa.purchaseUnit === 'un' ? 'ml' : qa.purchaseUnit,
                                        });
                                      }
                                      return;
                                    }
                                    applyInsumoToBaseIngredient(idx, val);
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs"
                                >
                                  <option value="">Informar custo ao lado...</option>
                                  {draft.qas.length > 0 && (
                                    <optgroup label="Valores da Etapa 3 (QAs e Aditivos)">
                                      {draft.qas.map((qa) => (
                                        <option key={qa.id} value={`qa:${qa.id}`}>
                                          [Etapa 3] {qa.name} (
                                          {formatBRLPrecise(
                                            computeUnitCost(
                                              qa.purchasedQty,
                                              qa.purchasePrice,
                                              qa.freight
                                            )
                                          )}
                                          /{qa.purchaseUnit})
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                  <optgroup label="Biblioteca de Insumos">
                                    {rawMaterialInsumos.map((ins) => (
                                      <option key={ins.id} value={ins.id}>
                                        {ins.name} ({formatBRLPrecise(ins.unitCost)}/{ins.purchaseUnit})
                                      </option>
                                    ))}
                                  </optgroup>
                                </select>
                              </div>

                              <div
                                className={
                                  draft.base.mode === 'custom_new'
                                    ? 'sm:col-span-6'
                                    : 'sm:col-span-4'
                                }
                              >
                                <label className="block text-[11px] text-[#6E5A49] mb-1">
                                  Valor compra + frete (R$)
                                </label>
                                <CurrencyInput
                                  compact
                                  value={ing.purchasePrice + ing.freight}
                                  onChange={(val) =>
                                    updateBaseIngredient(idx, {
                                      purchasePrice: val,
                                      freight: 0,
                                    })
                                  }
                                  title="Valor total pago + frete (R$)"
                                />
                              </div>

                              <div
                                className={
                                  draft.base.mode === 'custom_new'
                                    ? 'sm:col-span-6'
                                    : 'sm:col-span-3'
                                }
                              >
                                <label className="block text-[11px] text-[#6E5A49] mb-1">
                                  Qtd. comprada
                                </label>
                                <div className="flex gap-1.5">
                                  <input
                                    type="number"
                                    step="any"
                                    min="0.0001"
                                    value={ing.purchasedQty}
                                    onChange={(e) =>
                                      updateBaseIngredient(idx, {
                                        purchasedQty: Number(e.target.value),
                                      })
                                    }
                                    title={`Quantidade comprada (${ing.purchaseUnit})`}
                                    className="w-full min-w-[70px] px-2.5 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono tabular-nums"
                                  />
                                  <select
                                    value={ing.purchaseUnit}
                                    onChange={(e) =>
                                      updateBaseIngredient(idx, {
                                        purchaseUnit: e.target.value as UnitType,
                                      })
                                    }
                                    className="w-16 shrink-0 px-1.5 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                                  >
                                    <option value="ml">ml</option>
                                    <option value="L">L</option>
                                    <option value="g">g</option>
                                    <option value="kg">kg</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {draft.base.mode === 'custom_new' && (
                      <div className="pt-1">
                        {!showSaveBaseBox ? (
                          <button
                            type="button"
                            onClick={() => setShowSaveBaseBox(true)}
                            className="text-xs font-medium text-[#5C4332] hover:text-[#171412] inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <BookmarkPlus className="w-4 h-4 text-[#B08D57]" />
                            <span>Salvar esta base em "Minhas Bases" para reutilização</span>
                          </button>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-[#F2ECE1] border border-[#E4D8C5]">
                            <input
                              type="text"
                              value={customBaseSaveName}
                              onChange={(e) => setCustomBaseSaveName(e.target.value)}
                              placeholder="Nome da base personalizada..."
                              className="flex-1 min-w-[200px] px-3 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs"
                            />
                            <button
                              type="button"
                              onClick={handleSaveCustomBaseToLibrary}
                              disabled={savingBase}
                              className="px-3 py-1.5 rounded-md bg-[#171412] text-[#FAF7F2] text-xs font-medium cursor-pointer"
                            >
                              {savingBase ? 'Salvando...' : 'Confirmar salvamento'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowSaveBaseBox(false)}
                              className="px-2 py-1.5 text-xs text-[#6E5A49] cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Quantity of Base used in this perfume + Discriminated Summary */}
                <div className="rounded-lg bg-[#F2ECE1] border border-[#E4D8C5] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#171412]">
                        {draft.inputMode === 'absolute'
                          ? 'Quantidade da Base adicionada ao perfume'
                          : 'Proporção da Base na fórmula (%)'}
                      </label>
                      <p className="text-[11px] text-[#6E5A49]">
                        Custo por {draft.base.batchUnit}:{' '}
                        <span className="font-mono font-medium">
                          {formatBRLPrecise(baseEval.unitCost)}
                        </span>{' '}
                        · Custo do lote de {draft.base.batchVolumeQty} {draft.base.batchUnit}:{' '}
                        {formatBRL(baseEval.batchTotalCost)}
                      </p>
                      {draft.inputMode === 'absolute' && (draft.essenceConcentrationPct || 0) > 0 && (
                        <label className="mt-1.5 flex items-center gap-2 text-[11px] text-[#3B2B20] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draft.autoCalcBaseFromEssence !== false}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              applyDraftWithAutoBase({
                                ...draft,
                                autoCalcBaseFromEssence: checked,
                              });
                            }}
                            className="w-3.5 h-3.5 accent-[#171412]"
                          />
                          <span>
                            Calcular automaticamente ({roundQuantity(yieldSummary.totalPerfumeMl, 1)} ml perfume −{' '}
                            {roundQuantity(yieldSummary.essenceQty, 1)} {yieldSummary.essenceUnit} essência ={' '}
                            <strong>{roundQuantity(yieldSummary.baseNeededMl, 1)} ml</strong>)
                          </span>
                        </label>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {draft.inputMode === 'absolute' ? (
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={draft.base.usedInFormulaQty}
                          onChange={(e) =>
                            onChangeDraft({
                              ...draft,
                              autoCalcBaseFromEssence: false,
                              base: {
                                ...draft.base,
                                usedInFormulaQty: Number(e.target.value),
                              },
                            })
                          }
                          className="w-28 px-3 py-1.5 rounded-lg bg-white border border-[#D8CBB8] text-sm font-mono tabular-nums"
                        />
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={draft.base.usedPercentage ?? 0}
                          onChange={(e) =>
                            onChangeDraft({
                              ...draft,
                              base: {
                                ...draft.base,
                                usedPercentage: Number(e.target.value),
                              },
                            })
                          }
                          className="w-28 px-3 py-1.5 rounded-lg bg-white border border-[#D8CBB8] text-sm font-mono tabular-nums"
                        />
                      )}
                      <select
                        value={draft.base.usedInFormulaUnit}
                        onChange={(e) =>
                          onChangeDraft({
                            ...draft,
                            base: {
                              ...draft.base,
                              usedInFormulaUnit: e.target.value as 'ml' | 'g',
                            },
                          })
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-[#D8CBB8] text-sm font-mono"
                      >
                        <option value="ml">ml</option>
                        <option value="g">g</option>
                      </select>
                    </div>
                  </div>

                  {/* Discriminated Summary */}
                  <div className="pt-3 border-t border-[#D8CBB8] grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-[#6E5A49]">Custo da Base no lote:</span>{' '}
                      <strong className="font-mono text-[#171412] tabular-nums">
                        {formatBRL(baseEval.usedInFormulaCost)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#6E5A49]">Essência + extras no lote:</span>{' '}
                      <strong className="font-mono text-[#171412] tabular-nums">
                        {formatBRL(
                          result.batchSummary
                            ? result.batchSummary.batchLiquidCostTotal - result.batchSummary.batchBaseCost
                            : result.additionalIngredientsCost
                        )}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#6E5A49]">Líquido total do lote:</span>{' '}
                      <strong className="font-mono text-[#171412] tabular-nums">
                        {formatBRL(
                          result.batchSummary
                            ? result.batchSummary.batchLiquidCostTotal
                            : result.liquidCostTotal
                        )}
                      </strong>
                    </div>
                  </div>
                </div>

                {result.duplicateWarnings.length > 0 && (
                  <div className="p-3.5 rounded-lg border border-[#B08D57] bg-[#B08D57]/10 text-xs text-[#5C4332] space-y-1">
                    {result.duplicateWarnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-[#9A7239] shrink-0 mt-0.5" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setOpenStep(3)}
                    className="px-4 py-2 rounded-lg border border-[#D8CBB8] text-xs text-[#5C4332] inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenStep(5)}
                    className="px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Avançar para Frasco</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ETAPA 5 — FRASCO E COMPONENTES */}
          <div className="rounded-xl border border-[#E4D8C5] bg-white overflow-hidden no-print">
            {renderAccordionHeader(
              5,
              'Etapa 5 — Frasco e Componentes (Obrigatória)',
              draft.bottle.mode === 'complete'
                ? `Frasco completo: ${draft.bottle.complete.name}`
                : 'Frasco montado por partes (Vidro + Válvula + Sobretampa)',
              stepStatuses[4],
              formatBRL(result.bottleTotalCost)
            )}

            {openStep === 5 && (
              <div className="px-5 pb-5 pt-3 border-t border-[#F2ECE1] space-y-4">
                <div className="flex items-center gap-2 p-1 bg-[#F2ECE1] rounded-lg border border-[#E4D8C5] w-fit">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeDraft({
                        ...draft,
                        bottle: { ...draft.bottle, mode: 'complete' },
                      })
                    }
                    className={`px-3.5 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                      draft.bottle.mode === 'complete'
                        ? 'bg-white text-[#171412] shadow-xs'
                        : 'text-[#6E5A49]'
                    }`}
                  >
                    Frasco completo
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeDraft({
                        ...draft,
                        bottle: { ...draft.bottle, mode: 'parts' },
                      })
                    }
                    className={`px-3.5 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                      draft.bottle.mode === 'parts'
                        ? 'bg-white text-[#171412] shadow-xs'
                        : 'text-[#6E5A49]'
                    }`}
                  >
                    Montado por partes (Vidro + Válvula + Sobretampa)
                  </button>
                </div>

                {draft.bottle.mode === 'complete' ? (() => {
                  const c = draft.bottle.complete;
                  const unitBottleCost = computeUnitCost(
                    c.purchasedQty,
                    c.purchasePrice,
                    c.freight
                  );
                  const usedCount = Math.max(0, Number(c.usedQty ?? 1));
                  const completeSubtotal = unitBottleCost * usedCount;
                  const batchCount = result.batchSummary?.isBatch
                    ? result.batchSummary.bottlesCount
                    : 0;
                  return (
                    <div className="rounded-lg border border-[#E4D8C5] bg-[#FAF7F2] p-4 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-medium text-[#5C4332]">
                              Selecionar Frasco da Biblioteca
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                openInlineCreate('Embalagem', 'Frascos', (created) => {
                                  onChangeDraft({
                                    ...draft,
                                    bottle: {
                                      ...draft.bottle,
                                      complete: {
                                        ...draft.bottle.complete,
                                        insumoId: created.id,
                                        name: created.name,
                                        purchasedQty: created.purchasedQty,
                                        purchasePrice: created.purchasePrice,
                                        freight: created.freight,
                                      },
                                    },
                                  });
                                })
                              }
                              className="text-[11px] text-[#9A7239] hover:underline cursor-pointer"
                            >
                              + Cadastrar frasco
                            </button>
                          </div>
                          <select
                            value={c.insumoId ?? ''}
                            onChange={(e) => {
                              const ins = packagingInsumos.find(
                                (i) => i.id === e.target.value
                              );
                              if (!ins) return;
                              onChangeDraft({
                                ...draft,
                                bottle: {
                                  ...draft.bottle,
                                  complete: {
                                    ...draft.bottle.complete,
                                    insumoId: ins.id,
                                    name: ins.name,
                                    purchasedQty: ins.purchasedQty,
                                    purchasePrice: ins.purchasePrice,
                                    freight: ins.freight,
                                  },
                                },
                              });
                            }}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-xs"
                          >
                            <option value="">Preenchimento manual...</option>
                            {packagingInsumos.map((ins) => (
                              <option key={ins.id} value={ins.id}>
                                {ins.name} ({formatBRL(ins.unitCost)}/un)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-[#5C4332] mb-1">
                            Nome / Modelo do frasco *
                          </label>
                          <input
                            type="text"
                            value={c.name}
                            onChange={(e) =>
                              onChangeDraft({
                                ...draft,
                                bottle: {
                                  ...draft.bottle,
                                  complete: {
                                    ...draft.bottle.complete,
                                    name: e.target.value,
                                  },
                                },
                              })
                            }
                            className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        <div>
                          <label className="block text-[11px] text-[#6E5A49] mb-1">
                            Capacidade (ml)
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={c.capacityMl}
                            onChange={(e) =>
                              onChangeDraft({
                                ...draft,
                                bottle: {
                                  ...draft.bottle,
                                  complete: {
                                    ...draft.bottle.complete,
                                    capacityMl: Number(e.target.value),
                                  },
                                },
                              })
                            }
                            className="w-full px-2 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#6E5A49] mb-1">
                            Qtd. comprada (un)
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="1"
                            value={c.purchasedQty}
                            onChange={(e) =>
                              onChangeDraft({
                                ...draft,
                                bottle: {
                                  ...draft.bottle,
                                  complete: {
                                    ...draft.bottle.complete,
                                    purchasedQty: Number(e.target.value),
                                  },
                                },
                              })
                            }
                            className="w-full px-2 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#6E5A49] mb-1">
                            Valor total compra (R$)
                          </label>
                          <CurrencyInput
                            compact
                            value={c.purchasePrice}
                            onChange={(val) =>
                              onChangeDraft({
                                ...draft,
                                bottle: {
                                  ...draft.bottle,
                                  complete: {
                                    ...draft.bottle.complete,
                                    purchasePrice: val,
                                  },
                                },
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#6E5A49] mb-1">
                            Frete (R$)
                          </label>
                          <CurrencyInput
                            compact
                            value={c.freight}
                            onChange={(val) =>
                              onChangeDraft({
                                ...draft,
                                bottle: {
                                  ...draft.bottle,
                                  complete: {
                                    ...draft.bottle.complete,
                                    freight: val,
                                  },
                                },
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#6E5A49] mb-1">
                            Qtd. usada / perfume
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={c.usedQty}
                            onChange={(e) =>
                              onChangeDraft({
                                ...draft,
                                bottle: {
                                  ...draft.bottle,
                                  complete: {
                                    ...draft.bottle.complete,
                                    usedQty: Number(e.target.value),
                                  },
                                },
                              })
                            }
                            className="w-full px-2 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                          />
                        </div>
                      </div>

                      {/* Inline Unit Cost & Multiplication Breakdown */}
                      <div className="pt-2.5 border-t border-[#E4D8C5] flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="text-[#5C4332]">
                          Valor unitário:{' '}
                          <strong className="font-mono text-[#171412] tabular-nums">
                            {formatBRLPrecise(unitBottleCost)} / un
                          </strong>
                          {c.purchasedQty > 1 && (
                            <span className="text-[11px] text-[#8C7A68] ml-1.5">
                              ({formatBRL(c.purchasePrice + c.freight)} ÷ {c.purchasedQty} un)
                            </span>
                          )}
                        </div>
                        <div className="font-mono tabular-nums text-[#171412]">
                          {usedCount} un × {formatBRLPrecise(unitBottleCost)} ={' '}
                          <strong>{formatBRL(completeSubtotal)}</strong>
                        </div>
                      </div>

                      {batchCount > 1 && (
                        <div className="px-3 py-2 rounded-md bg-[#F2ECE1] border border-[#E4D8C5] text-[11px] text-[#3B2B20] flex flex-wrap items-center justify-between gap-2">
                          <span>
                            Para o lote completo de <strong>{batchCount} frascos</strong> ({draft.targetVolumeMl} ml):
                          </span>
                          <span className="font-mono font-semibold text-[#171412] tabular-nums">
                            {batchCount} × {formatBRL(completeSubtotal)} = {formatBRL(batchCount * completeSubtotal)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <div className="space-y-3">
                    {(
                      [
                        { key: 'vidro', label: 'Vidro', sub: 'Vidros' },
                        { key: 'valvula', label: 'Válvula', sub: 'Válvulas' },
                        { key: 'sobretampa', label: 'Sobretampa', sub: 'Sobretampas' },
                      ] as const
                    ).map(({ key, label, sub }) => {
                      const part = draft.bottle.parts[key];
                      const unitPartCost = computeUnitCost(
                        part.purchasedQty,
                        part.purchasePrice,
                        part.freight
                      );
                      const usedCount = Math.max(0, Number(part.usedQty ?? 1));
                      const pCost = unitPartCost * usedCount;
                      return (
                        <div
                          key={key}
                          className="rounded-lg border border-[#E4D8C5] bg-[#FAF7F2] p-3.5 space-y-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <span className="text-xs font-semibold text-[#171412]">
                                {label}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  openInlineCreate('Embalagem', sub, (created) => {
                                    onChangeDraft({
                                      ...draft,
                                      bottle: {
                                        ...draft.bottle,
                                        parts: {
                                          ...draft.bottle.parts,
                                          [key]: {
                                            ...part,
                                            insumoId: created.id,
                                            name: created.name,
                                            purchasedQty: created.purchasedQty,
                                            purchasePrice: created.purchasePrice,
                                            freight: created.freight,
                                          },
                                        },
                                      },
                                    });
                                  })
                                }
                                className="text-[11px] text-[#9A7239] hover:underline cursor-pointer"
                              >
                                + Cadastrar
                              </button>
                            </div>
                            <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
                              <span className="text-[#6E5A49]">
                                {formatBRLPrecise(unitPartCost)}/un × {usedCount}
                              </span>
                              <span className="font-semibold text-[#171412]">
                                {formatBRL(pCost)}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                            <div className="col-span-2">
                              <label className="block text-[10px] text-[#6E5A49] mb-1">
                                Biblioteca ({sub})
                              </label>
                              <select
                                value={part.insumoId ?? ''}
                                onChange={(e) => {
                                  const ins = packagingInsumos.find(
                                    (i) => i.id === e.target.value
                                  );
                                  if (!ins) return;
                                  onChangeDraft({
                                    ...draft,
                                    bottle: {
                                      ...draft.bottle,
                                      parts: {
                                        ...draft.bottle.parts,
                                        [key]: {
                                          ...part,
                                          insumoId: ins.id,
                                          name: ins.name,
                                          purchasedQty: ins.purchasedQty,
                                          purchasePrice: ins.purchasePrice,
                                          freight: ins.freight,
                                        },
                                      },
                                    },
                                  });
                                }}
                                className="w-full px-2 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs"
                              >
                                <option value="">Selecionar ou manual...</option>
                                {packagingInsumos.map((ins) => (
                                  <option key={ins.id} value={ins.id}>
                                    {ins.name} ({formatBRL(ins.unitCost)}/un)
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="col-span-2 sm:col-span-1">
                              <label className="block text-[10px] text-[#6E5A49] mb-1">
                                Nome
                              </label>
                              <input
                                type="text"
                                value={part.name}
                                placeholder={`Nome do ${label.toLowerCase()}`}
                                onChange={(e) =>
                                  onChangeDraft({
                                    ...draft,
                                    bottle: {
                                      ...draft.bottle,
                                      parts: {
                                        ...draft.bottle.parts,
                                        [key]: { ...part, name: e.target.value },
                                      },
                                    },
                                  })
                                }
                                className="w-full px-2 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] text-[#6E5A49] mb-1">
                                Qtd. comprada
                              </label>
                              <input
                                type="number"
                                step="any"
                                min="1"
                                value={part.purchasedQty}
                                onChange={(e) =>
                                  onChangeDraft({
                                    ...draft,
                                    bottle: {
                                      ...draft.bottle,
                                      parts: {
                                        ...draft.bottle.parts,
                                        [key]: {
                                          ...part,
                                          purchasedQty: Number(e.target.value),
                                        },
                                      },
                                    },
                                  })
                                }
                                className="w-full px-2 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] text-[#6E5A49] mb-1">
                                Valor compra (R$)
                              </label>
                              <CurrencyInput
                                compact
                                value={part.purchasePrice}
                                onChange={(val) =>
                                  onChangeDraft({
                                    ...draft,
                                    bottle: {
                                      ...draft.bottle,
                                      parts: {
                                        ...draft.bottle.parts,
                                        [key]: {
                                          ...part,
                                          purchasePrice: val,
                                        },
                                      },
                                    },
                                  })
                                }
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] text-[#6E5A49] mb-1">
                                Frete (R$) / Uso
                              </label>
                              <div className="flex gap-1">
                                <CurrencyInput
                                  compact
                                  value={part.freight}
                                  onChange={(val) =>
                                    onChangeDraft({
                                      ...draft,
                                      bottle: {
                                        ...draft.bottle,
                                        parts: {
                                          ...draft.bottle.parts,
                                          [key]: {
                                            ...part,
                                            freight: val,
                                          },
                                        },
                                      },
                                    })
                                  }
                                  title="Frete (R$)"
                                  className="flex-1 min-w-0"
                                />
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={part.usedQty}
                                  onChange={(e) =>
                                    onChangeDraft({
                                      ...draft,
                                      bottle: {
                                        ...draft.bottle,
                                        parts: {
                                          ...draft.bottle.parts,
                                          [key]: {
                                            ...part,
                                            usedQty: Number(e.target.value),
                                          },
                                        },
                                      },
                                    })
                                  }
                                  title="Qtd. usada por perfume"
                                  className="w-12 shrink-0 px-1.5 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {result.batchSummary?.isBatch && result.batchSummary.bottlesCount > 1 && (
                      <div className="px-3.5 py-2.5 rounded-lg bg-[#F2ECE1] border border-[#E4D8C5] text-xs text-[#3B2B20] flex flex-wrap items-center justify-between gap-2">
                        <span>
                          Conjunto para o lote ({result.batchSummary.bottlesCount} frascos × {formatBRL(result.bottleTotalCost)}/frasco):
                        </span>
                        <strong className="font-mono text-[#171412] tabular-nums">
                          {formatBRL(result.batchSummary.bottlesCount * result.bottleTotalCost)}
                        </strong>
                      </div>
                    )}
                  </div>
                )}

                {/* Multi-bottle Batch Planning & Leftover Absorption */}
                {(() => {
                  const additionalList = draft.additionalBottles || [];
                  const batchSum = result.batchSummary;
                  const showMultiPanel =
                    Boolean(batchSum?.isBatch) || additionalList.length > 0;

                  const handleAddAdditionalBottle = (presetMl: number) => {
                    const matched = packagingInsumos.find((ins) => {
                      const n = ins.name.toLowerCase();
                      return (
                        n.includes(`${presetMl}ml`) || n.includes(`${presetMl} ml`)
                      );
                    });
                    const remainingMl = batchSum ? batchSum.leftoverMl : 0;
                    const suggestedFill =
                      remainingMl >= presetMl
                        ? Math.max(1, Math.floor(remainingMl / presetMl))
                        : 1;
                    const nextItem: AdditionalBottleOption = {
                      id: `add-bot-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                      insumoId: matched ? matched.id : null,
                      name: matched ? matched.name : `Frasco ${presetMl} ml`,
                      capacityMl: presetMl,
                      purchasedQty: matched ? matched.purchasedQty : 10,
                      purchasePrice: matched ? matched.purchasePrice : 0,
                      freight: matched ? matched.freight : 0,
                      usedQty: 1,
                      fillCount: suggestedFill,
                    };
                    onChangeDraft({
                      ...draft,
                      additionalBottles: [...additionalList, nextItem],
                    });
                  };

                  return (
                    <div className="rounded-xl border border-[#B08D57]/40 bg-[#F2ECE1]/70 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-xs font-semibold text-[#171412]">
                            Envase do Lote, Múltiplos Frascos e Sobra Líquida
                          </h3>
                          <p className="text-[11px] text-[#6E5A49]">
                            Combine tamanhos diferentes de frasco no mesmo lote (ex.: 50 ml + 30 ml) e defina se a sobra entra no custo do líquido.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {[30, 50, 60, 100].map((sz) => (
                            <button
                              key={sz}
                              type="button"
                              onClick={() => handleAddAdditionalBottle(sz)}
                              className="px-2.5 py-1 rounded-md bg-white border border-[#D8CBB8] hover:border-[#B08D57] text-[11px] font-medium text-[#3B2B20] cursor-pointer"
                            >
                              + Frasco {sz} ml
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => handleAddAdditionalBottle(20)}
                            className="px-2.5 py-1 rounded-md bg-[#171412] text-[#FAF7F2] text-[11px] font-medium cursor-pointer"
                          >
                            + Outro tamanho
                          </button>
                        </div>
                      </div>

                      {showMultiPanel && (
                        <>
                          {batchSum && (
                            <label className="flex items-start gap-2.5 p-3 rounded-lg bg-white border border-[#E4D8C5] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={draft.includeLeftoverInLiquidCost !== false}
                                onChange={(e) =>
                                  onChangeDraft({
                                    ...draft,
                                    includeLeftoverInLiquidCost: e.target.checked,
                                  })
                                }
                                className="w-4 h-4 accent-[#171412] mt-0.5 shrink-0"
                              />
                              <div className="text-xs space-y-0.5">
                                <span className="font-semibold text-[#171412] block">
                                  Incluir o valor da sobra líquida no custo do líquido por frasco
                                </span>
                                <span className="text-[11px] text-[#6E5A49] block">
                                  {batchSum.leftoverMl > 0.05 ? (
                                    batchSum.includeLeftoverInLiquidCost ? (
                                      <>
                                        Sobra de <strong>{roundQuantity(batchSum.leftoverMl, 1)} ml</strong> ({formatBRL(batchSum.leftoverLiquidCostTotal)}) rateada nos{' '}
                                        <strong>{roundQuantity(batchSum.totalBottledMl, 1)} ml</strong> envasados (+{formatBRL(batchSum.leftoverAbsorbedPerPrimaryUnit)} no frasco principal).
                                      </>
                                    ) : (
                                      <>
                                        Sobra de <strong>{roundQuantity(batchSum.leftoverMl, 1)} ml</strong> ({formatBRL(batchSum.leftoverLiquidCostTotal)}) não está sendo somada ao custo unitário.
                                      </>
                                    )
                                  ) : (
                                    <>Todo o líquido do lote está alocado nos frascos selecionados.</>
                                  )}
                                </span>
                              </div>
                            </label>
                          )}

                          {/* Primary Bottle Row inside Batch Allocation */}
                          {batchSum && (
                            <div className="p-3 rounded-lg bg-white border border-[#E4D8C5] flex flex-wrap items-center justify-between gap-3 text-xs">
                              <div>
                                <span className="font-semibold text-[#171412]">
                                  Frasco principal: {draft.targetVolumeMl} ml
                                </span>
                                <span className="block text-[11px] text-[#6E5A49]">
                                  {draft.bottle.mode === 'complete'
                                    ? draft.bottle.complete.name
                                    : 'Frasco montado por partes'}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <label className="text-[11px] text-[#6E5A49]">
                                  Qtd. envasada:
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={
                                    draft.primaryBottleFillCount ??
                                    batchSum.primaryBottleFillCount
                                  }
                                  onChange={(e) =>
                                    onChangeDraft({
                                      ...draft,
                                      primaryBottleFillCount: Math.max(
                                        0,
                                        Math.floor(Number(e.target.value) || 0)
                                      ),
                                    })
                                  }
                                  className="w-20 px-2.5 py-1.5 rounded-md bg-[#FAF7F2] border border-[#D8CBB8] text-xs font-mono text-center"
                                />
                                {draft.primaryBottleFillCount != null && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onChangeDraft({
                                        ...draft,
                                        primaryBottleFillCount: null,
                                      })
                                    }
                                    className="px-2 py-1 rounded border border-[#D8CBB8] text-[11px] text-[#5C4332] hover:bg-[#F2ECE1] cursor-pointer"
                                  >
                                    Auto
                                  </button>
                                )}
                                <span className="font-mono text-[11px] text-[#5C4332] ml-1">
                                  ({roundQuantity(batchSum.primaryBottleFillCount * draft.targetVolumeMl, 1)} ml)
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Additional Bottle Options List */}
                          {additionalList.map((ab, abIdx) => {
                            const unitBotCost = computeUnitCost(
                              ab.purchasedQty,
                              ab.purchasePrice,
                              ab.freight
                            );
                            const botOnlyCost = unitBotCost * Math.max(0, ab.usedQty ?? 1);
                            const alloc = batchSum?.allocations.find((a) => a.id === ab.id);

                            return (
                              <div
                                key={ab.id}
                                className="p-3.5 rounded-lg bg-white border border-[#E4D8C5] space-y-2.5"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-[#171412]">
                                    Opção adicional #{abIdx + 1}: {ab.name} ({ab.capacityMl} ml)
                                  </span>
                                  <div className="flex items-center gap-3 text-[11px] font-mono">
                                    <span className="text-[#5C4332]">
                                      Frasco: {formatBRL(botOnlyCost)}/un
                                    </span>
                                    {alloc && (
                                      <span className="font-semibold text-[#171412]">
                                        Unitário: {formatBRL(alloc.unitCostTotal)} (Líq. {formatBRL(alloc.liquidCostPerUnit)})
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onChangeDraft({
                                          ...draft,
                                          additionalBottles: additionalList.filter(
                                            (_, i) => i !== abIdx
                                          ),
                                        })
                                      }
                                      className="p-1 text-[#8C7A68] hover:text-[#9E3B33] cursor-pointer"
                                      title="Remover opção de frasco"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
                                  <div className="col-span-2 sm:col-span-4">
                                    <label className="block text-[10px] text-[#6E5A49] mb-1">
                                      Biblioteca (Frascos)
                                    </label>
                                    <select
                                      value={ab.insumoId ?? ''}
                                      onChange={(e) => {
                                        const ins = packagingInsumos.find(
                                          (i) => i.id === e.target.value
                                        );
                                        const next = [...additionalList];
                                        if (!ins) {
                                          next[abIdx] = { ...ab, insumoId: null };
                                        } else {
                                          next[abIdx] = {
                                            ...ab,
                                            insumoId: ins.id,
                                            name: ins.name,
                                            purchasedQty: ins.purchasedQty,
                                            purchasePrice: ins.purchasePrice,
                                            freight: ins.freight,
                                          };
                                        }
                                        onChangeDraft({
                                          ...draft,
                                          additionalBottles: next,
                                        });
                                      }}
                                      className="w-full px-2 py-1.5 rounded-md bg-[#FAF7F2] border border-[#D8CBB8] text-xs"
                                    >
                                      <option value="">Manual...</option>
                                      {packagingInsumos.map((ins) => (
                                        <option key={ins.id} value={ins.id}>
                                          {ins.name} ({formatBRL(ins.unitCost)}/un)
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="col-span-2 sm:col-span-3">
                                    <label className="block text-[10px] text-[#6E5A49] mb-1">
                                      Nome / Modelo
                                    </label>
                                    <input
                                      type="text"
                                      value={ab.name}
                                      onChange={(e) => {
                                        const next = [...additionalList];
                                        next[abIdx] = { ...ab, name: e.target.value };
                                        onChangeDraft({
                                          ...draft,
                                          additionalBottles: next,
                                        });
                                      }}
                                      className="w-full px-2 py-1.5 rounded-md bg-[#FAF7F2] border border-[#D8CBB8] text-xs"
                                    />
                                  </div>

                                  <div className="sm:col-span-2">
                                    <label className="block text-[10px] text-[#6E5A49] mb-1">
                                      Volume (ml)
                                    </label>
                                    <input
                                      type="number"
                                      min="1"
                                      step="any"
                                      value={ab.capacityMl}
                                      onChange={(e) => {
                                        const next = [...additionalList];
                                        next[abIdx] = {
                                          ...ab,
                                          capacityMl: Math.max(1, Number(e.target.value) || 0),
                                        };
                                        onChangeDraft({
                                          ...draft,
                                          additionalBottles: next,
                                        });
                                      }}
                                      className="w-full px-2 py-1.5 rounded-md bg-[#FAF7F2] border border-[#D8CBB8] text-xs font-mono"
                                    />
                                  </div>

                                  <div className="sm:col-span-3">
                                    <label className="block text-[10px] text-[#6E5A49] mb-1">
                                      Qtd. envasar no lote
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={ab.fillCount}
                                      onChange={(e) => {
                                        const next = [...additionalList];
                                        next[abIdx] = {
                                          ...ab,
                                          fillCount: Math.max(
                                            0,
                                            Math.floor(Number(e.target.value) || 0)
                                          ),
                                        };
                                        onChangeDraft({
                                          ...draft,
                                          additionalBottles: next,
                                        });
                                      }}
                                      className="w-full px-2 py-1.5 rounded-md bg-[#FAF7F2] border border-[#B08D57] text-xs font-mono font-semibold"
                                    />
                                  </div>

                                  <div className="sm:col-span-3">
                                    <label className="block text-[10px] text-[#6E5A49] mb-1">
                                      Qtd. comprada (un)
                                    </label>
                                    <input
                                      type="number"
                                      min="1"
                                      step="any"
                                      value={ab.purchasedQty}
                                      onChange={(e) => {
                                        const next = [...additionalList];
                                        next[abIdx] = {
                                          ...ab,
                                          purchasedQty: Number(e.target.value),
                                        };
                                        onChangeDraft({
                                          ...draft,
                                          additionalBottles: next,
                                        });
                                      }}
                                      className="w-full px-2 py-1.5 rounded-md bg-[#FAF7F2] border border-[#D8CBB8] text-xs font-mono"
                                    />
                                  </div>

                                  <div className="sm:col-span-4">
                                    <label className="block text-[10px] text-[#6E5A49] mb-1">
                                      Valor compra (R$)
                                    </label>
                                    <CurrencyInput
                                      compact
                                      value={ab.purchasePrice}
                                      onChange={(val) => {
                                        const next = [...additionalList];
                                        next[abIdx] = { ...ab, purchasePrice: val };
                                        onChangeDraft({
                                          ...draft,
                                          additionalBottles: next,
                                        });
                                      }}
                                    />
                                  </div>

                                  <div className="sm:col-span-3">
                                    <label className="block text-[10px] text-[#6E5A49] mb-1">
                                      Frete (R$)
                                    </label>
                                    <CurrencyInput
                                      compact
                                      value={ab.freight}
                                      onChange={(val) => {
                                        const next = [...additionalList];
                                        next[abIdx] = { ...ab, freight: val };
                                        onChangeDraft({
                                          ...draft,
                                          additionalBottles: next,
                                        });
                                      }}
                                    />
                                  </div>

                                  <div className="sm:col-span-2">
                                    <label className="block text-[10px] text-[#6E5A49] mb-1">
                                      Uso / un
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      step="any"
                                      value={ab.usedQty}
                                      onChange={(e) => {
                                        const next = [...additionalList];
                                        next[abIdx] = {
                                          ...ab,
                                          usedQty: Number(e.target.value),
                                        };
                                        onChangeDraft({
                                          ...draft,
                                          additionalBottles: next,
                                        });
                                      }}
                                      className="w-full px-2 py-1.5 rounded-md bg-[#FAF7F2] border border-[#D8CBB8] text-xs font-mono"
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {batchSum && (
                            <div className="pt-2 border-t border-[#D8CBB8] flex flex-wrap items-center justify-between gap-2 text-xs text-[#3B2B20]">
                              <span>
                                Total envasado:{' '}
                                <strong className="font-mono text-[#171412]">
                                  {roundQuantity(batchSum.totalBottledMl, 1)} ml ({batchSum.bottlesCount} frascos)
                                </strong>
                              </span>
                              <span>
                                Sobra restante:{' '}
                                <strong className="font-mono text-[#171412]">
                                  {roundQuantity(batchSum.leftoverMl, 1)} ml
                                </strong>
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setOpenStep(4)}
                    className="px-4 py-2 rounded-lg border border-[#D8CBB8] text-xs text-[#5C4332] inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenStep(6)}
                    className="px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Avançar para Embalagens</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ETAPA 6 — EMBALAGEM E ACABAMENTO */}
          <div className="rounded-xl border border-[#E4D8C5] bg-white overflow-hidden no-print">
            {renderAccordionHeader(
              6,
              'Etapa 6 — Embalagem e Acabamento (Opcional)',
              `${draft.packaging.length} item(ns) · Etiqueta, caixa, celofane, sacola, panfleto`,
              stepStatuses[5],
              formatBRL(result.packagingItemsCost)
            )}

            {openStep === 6 && (
              <div className="px-5 pb-5 pt-3 border-t border-[#F2ECE1] space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {PACKAGING_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        onChangeDraft({
                          ...draft,
                          packaging: [
                            ...draft.packaging,
                            {
                              id: `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                              insumoId: null,
                              categoryType: preset,
                              name: preset,
                              purchasedQty: 100,
                              purchaseUnit: 'un',
                              purchasePrice: 0,
                              freight: 0,
                              usedQty: 1,
                            },
                          ],
                        })
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-[#F2ECE1] text-[#3B2B20] text-xs font-medium hover:bg-[#E4D8C5] cursor-pointer"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>

                {draft.packaging.map((pkg, idx) => {
                  const unitPkgCost = computeUnitCost(
                    pkg.purchasedQty,
                    pkg.purchasePrice,
                    pkg.freight
                  );
                  const pCost = unitPkgCost * Math.max(0, Number(pkg.usedQty) || 0);
                  return (
                    <div
                      key={pkg.id}
                      className="rounded-lg border border-[#E4D8C5] bg-[#FAF7F2] p-3.5 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#171412]">
                          {pkg.categoryType}
                        </span>
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-[11px] text-[#6E5A49] tabular-nums">
                            {formatBRLPrecise(unitPkgCost)}/{pkg.purchaseUnit || 'un'} × {pkg.usedQty}
                          </span>
                          <span className="font-mono text-xs font-semibold text-[#171412] tabular-nums">
                            {formatBRL(pCost)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onChangeDraft({
                                ...draft,
                                packaging: draft.packaging.filter(
                                  (_, i) => i !== idx
                                ),
                              })
                            }
                            className="p-1 text-[#8C7A68] hover:text-[#9E3B33] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                        <div className="col-span-2">
                          <label className="block text-[10px] text-[#6E5A49] mb-1">
                            Biblioteca
                          </label>
                          <select
                            value={pkg.insumoId ?? ''}
                            onChange={(e) => {
                              const ins = packagingInsumos.find(
                                (i) => i.id === e.target.value
                              );
                              if (!ins) return;
                              const next = [...draft.packaging];
                              next[idx] = {
                                ...pkg,
                                insumoId: ins.id,
                                name: ins.name,
                                purchasedQty: ins.purchasedQty,
                                purchaseUnit: ins.purchaseUnit,
                                purchasePrice: ins.purchasePrice,
                                freight: ins.freight,
                              };
                              onChangeDraft({ ...draft, packaging: next });
                            }}
                            className="w-full px-2 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs"
                          >
                            <option value="">Da Biblioteca...</option>
                            {packagingInsumos.map((ins) => (
                              <option key={ins.id} value={ins.id}>
                                {ins.name} ({formatBRL(ins.unitCost)}/un)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="col-span-2 sm:col-span-1">
                          <label className="block text-[10px] text-[#6E5A49] mb-1">
                            Nome
                          </label>
                          <input
                            type="text"
                            value={pkg.name}
                            onChange={(e) => {
                              const next = [...draft.packaging];
                              next[idx] = { ...pkg, name: e.target.value };
                              onChangeDraft({ ...draft, packaging: next });
                            }}
                            className="w-full px-2 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-[#6E5A49] mb-1">
                            Qtd. comprada
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="1"
                            value={pkg.purchasedQty}
                            onChange={(e) => {
                              const next = [...draft.packaging];
                              next[idx] = {
                                ...pkg,
                                purchasedQty: Number(e.target.value),
                              };
                              onChangeDraft({ ...draft, packaging: next });
                            }}
                            className="w-full px-2 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-[#6E5A49] mb-1">
                            Valor compra (R$)
                          </label>
                          <CurrencyInput
                            compact
                            value={pkg.purchasePrice}
                            onChange={(val) => {
                              const next = [...draft.packaging];
                              next[idx] = {
                                ...pkg,
                                purchasePrice: val,
                              };
                              onChangeDraft({ ...draft, packaging: next });
                            }}
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-[#6E5A49] mb-1">
                            Frete (R$) / Uso
                          </label>
                          <div className="flex gap-1">
                            <CurrencyInput
                              compact
                              value={pkg.freight}
                              onChange={(val) => {
                                const next = [...draft.packaging];
                                next[idx] = {
                                  ...pkg,
                                  freight: val,
                                };
                                onChangeDraft({ ...draft, packaging: next });
                              }}
                              title="Frete (R$)"
                              className="flex-1 min-w-0"
                            />
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={pkg.usedQty}
                              onChange={(e) => {
                                const next = [...draft.packaging];
                                next[idx] = {
                                  ...pkg,
                                  usedQty: Number(e.target.value),
                                };
                                onChangeDraft({ ...draft, packaging: next });
                              }}
                              title="Qtd utilizada por perfume"
                              className="w-12 shrink-0 px-1.5 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setOpenStep(5)}
                    className="px-4 py-2 rounded-lg border border-[#D8CBB8] text-xs text-[#5C4332] inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenStep(7)}
                    className="px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Ver Resultado Final</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ETAPA 7 — RESULTADO FINAL, SIMULADOR DE TAMANHOS & PRECIFICAÇÃO */}
          <div className="rounded-xl border border-[#E4D8C5] bg-white overflow-hidden print-only-clean">
            {renderAccordionHeader(
              7,
              'Etapa 7 — Resultado Final, Tamanhos e Preço de Venda',
              `Custo unitário total: ${formatBRL(result.unitCostTotal)}`,
              stepStatuses[6]
            )}

            {(openStep === 7 || typeof window === 'undefined') && (
              <div className="px-5 pb-6 pt-3 border-t border-[#F2ECE1] space-y-6">
                {/* Warnings / Validation errors */}
                {result.errors.length > 0 && (
                  <div className="p-4 rounded-lg border border-[#9E3B33]/30 bg-[#9E3B33]/5 text-xs text-[#7A2720] space-y-1">
                    {result.errors.map((err, i) => (
                      <div key={i}>• {err}</div>
                    ))}
                  </div>
                )}
                {result.warnings.length > 0 && (
                  <div className="p-4 rounded-lg border border-[#B08D57]/40 bg-[#F2ECE1] text-xs text-[#5C4332] space-y-1">
                    {result.warnings.map((w, i) => (
                      <div key={i}>• {w}</div>
                    ))}
                  </div>
                )}

                {/* Batch Yield Banner (when producing a batch from total essence) */}
                {result.batchSummary?.isBatch && (
                  <div className="rounded-xl border border-[#B08D57]/50 bg-[#F2ECE1] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#171412]">
                        Produção do Lote ({roundQuantity(result.batchSummary.essenceQty, 1)}{' '}
                        {result.batchSummary.essenceUnit} de essência a {result.batchSummary.concentrationPct}%)
                      </span>
                      <span className="font-mono text-xs font-semibold text-[#171412]">
                        Total do lote ({result.batchSummary.bottlesCount} un):{' '}
                        {formatBRL(result.batchSummary.totalBatchCostWithBottles)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                      <div className="p-2.5 rounded-md bg-white border border-[#E4D8C5]">
                        <span className="block text-[11px] text-[#6E5A49]">Total de perfume</span>
                        <strong className="font-mono text-sm text-[#171412]">
                          {roundQuantity(result.batchSummary.batchVolumeMl, 1)} ml
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-md bg-white border border-[#E4D8C5]">
                        <span className="block text-[11px] text-[#6E5A49]">Base adicionada</span>
                        <strong className="font-mono text-sm text-[#171412]">
                          {roundQuantity(result.batchSummary.baseNeededMl, 1)} ml
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-md bg-white border border-[#E4D8C5]">
                        <span className="block text-[11px] text-[#6E5A49]">
                          Envasado / Sobra
                        </span>
                        <strong className="font-mono text-sm text-[#171412]">
                          {result.batchSummary.bottlesCount} un (+{roundQuantity(result.batchSummary.leftoverMl, 1)} ml)
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-md bg-white border border-[#E4D8C5]">
                        <span className="block text-[11px] text-[#6E5A49]">Líquido do lote</span>
                        <strong className="font-mono text-sm text-[#171412]">
                          {formatBRL(result.batchSummary.batchLiquidCostTotal)}
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-md bg-white border border-[#E4D8C5]">
                        <span className="block text-[11px] text-[#6E5A49]">
                          Frascos/emb. ({result.batchSummary.bottlesCount} un)
                        </span>
                        <strong className="font-mono text-sm text-[#171412]">
                          {formatBRL(result.batchSummary.batchPackagingCostTotal)}
                        </strong>
                      </div>
                    </div>

                    {result.batchSummary.leftoverMl > 0.05 && (
                      <label className="flex items-center gap-2 text-xs text-[#3B2B20] pt-1 cursor-pointer no-print">
                        <input
                          type="checkbox"
                          checked={draft.includeLeftoverInLiquidCost !== false}
                          onChange={(e) =>
                            onChangeDraft({
                              ...draft,
                              includeLeftoverInLiquidCost: e.target.checked,
                            })
                          }
                          className="w-4 h-4 accent-[#171412]"
                        />
                        <span>
                          Incluir sobra de{' '}
                          <strong>{roundQuantity(result.batchSummary.leftoverMl, 1)} ml</strong>{' '}
                          ({formatBRL(result.batchSummary.leftoverLiquidCostTotal)}) no valor do líquido dos frascos
                        </span>
                      </label>
                    )}

                    {result.batchSummary.allocations.length > 1 && (
                      <div className="overflow-x-auto rounded-lg border border-[#E4D8C5] bg-white">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-[#FAF7F2] border-b border-[#E4D8C5] text-[#6E5A49]">
                              <th className="py-2 px-3">Opção de Frasco</th>
                              <th className="py-2 px-3 text-right">Qtd.</th>
                              <th className="py-2 px-3 text-right">Volume</th>
                              <th className="py-2 px-3 text-right">Líquido / un</th>
                              <th className="py-2 px-3 text-right">Embalagem / un</th>
                              <th className="py-2 px-3 text-right">Custo Unitário</th>
                              <th className="py-2 px-3 text-right">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F2ECE1]">
                            {result.batchSummary.allocations.map((alloc) => (
                              <tr key={alloc.id}>
                                <td className="py-2 px-3 font-medium text-[#171412]">
                                  {alloc.name} ({alloc.capacityMl} ml)
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums">
                                  {alloc.fillCount} un
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-[#5C4332]">
                                  {roundQuantity(alloc.totalMl, 1)} ml
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums">
                                  {formatBRL(alloc.liquidCostPerUnit)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-[#6E5A49]">
                                  {formatBRL(alloc.packagingTotalCostPerUnit)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-semibold text-[#171412] tabular-nums">
                                  {formatBRL(alloc.unitCostTotal)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-semibold text-[#171412] tabular-nums">
                                  {formatBRL(alloc.totalAllocationCost)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Highlight Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-4 rounded-lg bg-[#FAF7F2] border border-[#E4D8C5]">
                    <p className="text-[11px] text-[#6E5A49]">
                      {result.batchSummary?.isBatch ? 'Frasco principal' : 'Volume final'}
                    </p>
                    <p className="font-mono text-xl font-semibold text-[#171412] tabular-nums mt-1">
                      {roundQuantity(result.liquidVolumeTotalMl, 1)} ml
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-[#FAF7F2] border border-[#E4D8C5]">
                    <p className="text-[11px] text-[#6E5A49]">
                      {result.batchSummary?.isBatch
                        ? `Líquido (${draft.targetVolumeMl} ml)`
                        : 'Custo do líquido'}
                    </p>
                    <p className="font-mono text-xl font-semibold text-[#171412] tabular-nums mt-1">
                      {formatBRL(result.liquidCostTotal)}
                    </p>
                    {result.batchSummary?.isBatch &&
                      result.batchSummary.includeLeftoverInLiquidCost &&
                      result.batchSummary.leftoverAbsorbedPerPrimaryUnit > 0.004 && (
                        <p className="text-[10px] text-[#6E5A49] mt-0.5">
                          Inclui +{formatBRL(result.batchSummary.leftoverAbsorbedPerPrimaryUnit)} da sobra
                        </p>
                      )}
                  </div>
                  <div className="p-4 rounded-lg bg-[#FAF7F2] border border-[#E4D8C5]">
                    <p className="text-[11px] text-[#6E5A49]">Custo embalagem</p>
                    <p className="font-mono text-xl font-semibold text-[#171412] tabular-nums mt-1">
                      {formatBRL(result.packagingTotalCost)}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-[#171412] text-[#FAF7F2]">
                    <p className="text-[11px] text-[#D8CBB8]">Custo total unitário</p>
                    <p className="font-mono text-xl font-semibold tabular-nums mt-1">
                      {formatBRL(result.unitCostTotal)}
                    </p>
                  </div>
                </div>

                {result.maxProducibleUnits !== null && (
                  <div className="p-3.5 rounded-lg bg-[#F2ECE1] border border-[#E4D8C5] text-xs text-[#3B2B20] flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Capacidade estimada com o estoque disponível:{' '}
                      <strong className="font-mono text-[#171412]">
                        {result.maxProducibleUnits} unidade(s)
                      </strong>
                    </span>
                    {result.limitingInsumoName && (
                      <span className="text-[#6E5A49]">
                        Limitado por: {result.limitingInsumoName}
                      </span>
                    )}
                  </div>
                )}

                {/* Identification + Breakdown Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border border-[#E4D8C5] space-y-2 text-xs">
                    <h3 className="font-serif text-lg font-semibold text-[#171412]">
                      Custos da Fórmula
                    </h3>
                    <div className="flex justify-between py-1 border-b border-[#F2ECE1]">
                      <span className="text-[#6E5A49]">Essência</span>
                      <span className="font-mono tabular-nums">{formatBRL(result.essenceCost)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#F2ECE1]">
                      <span className="text-[#6E5A49]">Base ({draft.base.baseName})</span>
                      <span className="font-mono tabular-nums">{formatBRL(result.baseCost)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#F2ECE1]">
                      <span className="text-[#6E5A49]">Álcool (adicional)</span>
                      <span className="font-mono tabular-nums">{formatBRL(result.alcoholCost)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#F2ECE1]">
                      <span className="text-[#6E5A49]">Água (adicional)</span>
                      <span className="font-mono tabular-nums">{formatBRL(result.waterCost)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#F2ECE1]">
                      <span className="text-[#6E5A49]">QAs e Aditivos</span>
                      <span className="font-mono tabular-nums">{formatBRL(result.qasCost)}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-[#6E5A49]">Outros ingredientes</span>
                      <span className="font-mono tabular-nums">
                        {formatBRL(result.otherIngredientsCost)}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border border-[#E4D8C5] space-y-2 text-xs">
                    <h3 className="font-serif text-lg font-semibold text-[#171412]">
                      Custos de Embalagem
                    </h3>
                    <div className="flex justify-between py-1 border-b border-[#F2ECE1]">
                      <span className="text-[#6E5A49]">
                        {draft.bottle.mode === 'complete' ? 'Frasco completo' : 'Vidro'}
                      </span>
                      <span className="font-mono tabular-nums">{formatBRL(result.bottleCost)}</span>
                    </div>
                    {draft.bottle.mode === 'parts' && (
                      <>
                        <div className="flex justify-between py-1 border-b border-[#F2ECE1]">
                          <span className="text-[#6E5A49]">Válvula</span>
                          <span className="font-mono tabular-nums">{formatBRL(result.valveCost)}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-[#F2ECE1]">
                          <span className="text-[#6E5A49]">Sobretampa</span>
                          <span className="font-mono tabular-nums">{formatBRL(result.capCost)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between py-1 border-b border-[#F2ECE1]">
                      <span className="text-[#6E5A49]">Acabamentos e acessórios</span>
                      <span className="font-mono tabular-nums">
                        {formatBRL(result.packagingItemsCost)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 font-semibold text-[#171412]">
                      <span>Total Embalagem</span>
                      <span className="font-mono tabular-nums">
                        {formatBRL(result.packagingTotalCost)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Simulador de Tamanhos */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-serif text-xl font-semibold text-[#171412]">
                        Simulador de Tamanhos
                      </h3>
                      <p className="text-xs text-[#6E5A49]">
                        Escala automaticamente todas as matérias-primas preservando a
                        proporção real da sua fórmula.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 no-print">
                      {[30, 50, 60, 100].map((size) => {
                        const active = draft.selectedSizes.includes(size);
                        return (
                          <button
                            key={size}
                            type="button"
                            onClick={() => {
                              const next = active
                                ? draft.selectedSizes.filter((s) => s !== size)
                                : [...draft.selectedSizes, size];
                              onChangeDraft({ ...draft, selectedSizes: next });
                            }}
                            className={`px-2.5 py-1 rounded-md text-xs font-mono cursor-pointer border ${
                              active
                                ? 'bg-[#171412] text-[#FAF7F2] border-[#171412]'
                                : 'bg-[#FAF7F2] text-[#5C4332] border-[#D8CBB8]'
                            }`}
                          >
                            {size} ml
                          </button>
                        );
                      })}
                      <input
                        type="number"
                        min="1"
                        placeholder="Outro ml"
                        value={customSizeInput}
                        onChange={(e) => {
                          setCustomSizeInput(e.target.value);
                          onChangeDraft({
                            ...draft,
                            customSizeMl: e.target.value
                              ? Number(e.target.value)
                              : null,
                          });
                        }}
                        className="w-24 px-2 py-1 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-[#E4D8C5]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#FAF7F2] border-b border-[#E4D8C5] text-[#6E5A49]">
                          <th className="py-2.5 px-3">Tamanho</th>
                          <th className="py-2.5 px-3 text-right">Essência</th>
                          <th className="py-2.5 px-3 text-right">Base</th>
                          <th className="py-2.5 px-3 text-right">QAs / Álcool / Água</th>
                          <th className="py-2.5 px-3 text-right">Custo líquido</th>
                          <th className="py-2.5 px-3 text-right">Embalagem</th>
                          <th className="py-2.5 px-3 text-right">Custo unitário</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F2ECE1]">
                        {result.sizeComparisons.map((row) => (
                          <tr key={row.sizeMl} className="hover:bg-[#FAF7F2]/60">
                            <td className="py-2.5 px-3 font-mono font-semibold text-[#171412]">
                              {row.sizeMl} ml
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#5C4332]">
                              {roundQuantity(row.essenceQty, 2)} {row.essenceUnit}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#5C4332]">
                              {roundQuantity(row.baseQty, 2)} {row.baseUnit}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#6E5A49]">
                              {roundQuantity(
                                row.qasQty + row.alcoholQty + row.waterQty,
                                2
                              )}{' '}
                              ml/g
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                              {formatBRL(row.liquidCost)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#6E5A49]">
                              {formatBRL(row.bottleAndPackagingCost)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#171412] tabular-nums">
                              {formatBRL(row.unitCost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Simulador Opcional de Preço de Venda */}
                <div className="rounded-xl border border-[#E4D8C5] bg-[#FAF7F2] p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-serif text-xl font-semibold text-[#171412]">
                        Simulador de Preço de Venda
                      </h3>
                      <p className="text-xs text-[#6E5A49]">
                        Diferencia rigorosamente Margem sobre o Preço de Venda de
                        Acréscimo sobre o Custo (Markup).
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-medium text-[#171412] cursor-pointer no-print">
                      <input
                        type="checkbox"
                        checked={draft.pricing.enabled}
                        onChange={(e) =>
                          onChangeDraft({
                            ...draft,
                            pricing: {
                              ...draft.pricing,
                              enabled: e.target.checked,
                            },
                          })
                        }
                        className="w-4 h-4 accent-[#171412]"
                      />
                      <span>Ativar simulador</span>
                    </label>
                  </div>

                  {draft.pricing.enabled && result.pricingSummary && (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 no-print">
                        <div className="col-span-2">
                          <label className="block text-[11px] font-medium text-[#5C4332] mb-1">
                            Modelo de precificação
                          </label>
                          <select
                            value={draft.pricing.pricingMode}
                            onChange={(e) =>
                              onChangeDraft({
                                ...draft,
                                pricing: {
                                  ...draft.pricing,
                                  pricingMode: e.target.value as 'margin' | 'markup',
                                },
                              })
                            }
                            className="w-full px-2.5 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs"
                          >
                            <option value="margin">
                              Margem líquida sobre preço de venda (%)
                            </option>
                            <option value="markup">
                              Markup (acréscimo sobre custo %)
                            </option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-[#5C4332] mb-1">
                            {draft.pricing.pricingMode === 'margin'
                              ? 'Margem (%)'
                              : 'Markup (%)'}
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={draft.pricing.targetPercent}
                            onChange={(e) =>
                              onChangeDraft({
                                ...draft,
                                pricing: {
                                  ...draft.pricing,
                                  targetPercent: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full px-2 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] text-[#6E5A49] mb-1">
                            Taxa pagto (%)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={draft.pricing.paymentFeePercent}
                            onChange={(e) =>
                              onChangeDraft({
                                ...draft,
                                pricing: {
                                  ...draft.pricing,
                                  paymentFeePercent: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full px-2 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] text-[#6E5A49] mb-1">
                            Impostos (%)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={draft.pricing.taxPercent}
                            onChange={(e) =>
                              onChangeDraft({
                                ...draft,
                                pricing: {
                                  ...draft.pricing,
                                  taxPercent: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full px-2 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] text-[#6E5A49] mb-1">
                            Comissão (%) / Extras (R$)
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              value={draft.pricing.commissionPercent}
                              onChange={(e) =>
                                onChangeDraft({
                                  ...draft,
                                  pricing: {
                                    ...draft.pricing,
                                    commissionPercent: Number(e.target.value),
                                  },
                                })
                              }
                              title="Comissão %"
                              className="w-1/2 px-1.5 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                            />
                            <CurrencyInput
                              compact
                              value={draft.pricing.extraCostsValue}
                              onChange={(val) =>
                                onChangeDraft({
                                  ...draft,
                                  pricing: {
                                    ...draft.pricing,
                                    extraCostsValue: val,
                                  },
                                })
                              }
                              title="Outros custos adicionais (R$)"
                              className="w-2/3"
                            />
                          </div>
                        </div>
                      </div>

                      {result.pricingSummary.warning && (
                        <p className="text-xs text-[#9E3B33]">
                          {result.pricingSummary.warning}
                        </p>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
                        <div className="p-3 rounded-lg bg-white border border-[#E4D8C5]">
                          <p className="text-[11px] text-[#6E5A49]">Custo produção</p>
                          <p className="font-mono text-sm font-semibold tabular-nums mt-0.5">
                            {formatBRL(result.pricingSummary.productionCost)}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-white border border-[#E4D8C5]">
                          <p className="text-[11px] text-[#6E5A49]">
                            Adicionais + taxas
                          </p>
                          <p className="font-mono text-sm font-semibold tabular-nums mt-0.5">
                            {formatBRL(
                              result.pricingSummary.extraCosts +
                                result.pricingSummary.deductionsValue
                            )}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-[#B08D57]/15 border border-[#B08D57]/40">
                          <p className="text-[11px] text-[#5C4332] font-medium">
                            Preço sugerido
                          </p>
                          <p className="font-mono text-base font-bold text-[#171412] tabular-nums mt-0.5">
                            {formatBRL(result.pricingSummary.suggestedPrice)}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-white border border-[#E4D8C5]">
                          <p className="text-[11px] text-[#6E5A49]">Lucro estimado</p>
                          <p className="font-mono text-sm font-semibold text-[#3B2B20] tabular-nums mt-0.5">
                            {formatBRL(result.pricingSummary.estimatedProfit)}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-white border border-[#E4D8C5]">
                          <p className="text-[11px] text-[#6E5A49]">Margem / Markup</p>
                          <p className="font-mono text-xs font-semibold tabular-nums mt-1">
                            {result.pricingSummary.effectiveMarginPercent.toFixed(1)}% /{' '}
                            {result.pricingSummary.effectiveMarkupPercent.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Final Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E4D8C5] no-print">
                  <button
                    type="button"
                    onClick={() => setOpenStep(6)}
                    className="px-4 py-2 rounded-lg border border-[#D8CBB8] text-xs text-[#5C4332] inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar</span>
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleShareSummary}
                      className="px-3.5 py-2 rounded-lg border border-[#D8CBB8] bg-white text-xs font-medium text-[#171412] hover:border-[#B08D57] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Compartilhar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-3.5 py-2 rounded-lg border border-[#D8CBB8] bg-white text-xs font-medium text-[#171412] hover:border-[#B08D57] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Imprimir</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleGeneratePdf}
                      className="px-3.5 py-2 rounded-lg border border-[#D8CBB8] bg-white text-xs font-medium text-[#171412] hover:border-[#B08D57] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      <span>Gerar PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleClickSaveCalculation}
                      disabled={savingCalc}
                      className="px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium hover:bg-[#3B2B20] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{savingCalc ? 'Salvando...' : 'Salvar cálculo'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sticky Live Cost Summary Sidebar */}
        <aside className="lg:col-span-4 lg:sticky lg:top-6 space-y-4 no-print">
          <div className="rounded-xl border border-[#E4D8C5] bg-white p-5 space-y-4">
            <div className="border-b border-[#F2ECE1] pb-3">
              <p className="text-[11px] tracking-[0.14em] uppercase text-[#6E5A49]">
                Resumo em Tempo Real
              </p>
              <h3 className="font-serif text-2xl font-semibold text-[#171412] mt-0.5 truncate">
                {draft.perfumeName || draft.inspiredBy || 'Sem título'}
              </h3>
              {draft.inspiredBy && (
                <p className="text-xs text-[#6E5A49] truncate">
                  Inspirado em {draft.inspiredBy}
                </p>
              )}
            </div>

            <div className="space-y-2 text-xs">
              {result.batchSummary?.isBatch && (
                <div className="p-2.5 rounded-lg bg-[#F2ECE1] border border-[#E4D8C5] space-y-1 mb-2">
                  <div className="flex justify-between font-medium text-[#171412]">
                    <span>Lote total ({result.batchSummary.concentrationPct}%)</span>
                    <span className="font-mono tabular-nums">
                      {roundQuantity(result.batchSummary.batchVolumeMl, 1)} ml
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] text-[#5C4332]">
                    <span>Base necessária</span>
                    <span className="font-mono tabular-nums">
                      {roundQuantity(result.batchSummary.baseNeededMl, 1)} ml
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] text-[#5C4332]">
                    <span>Rende ({result.batchSummary.bottlesCount} un)</span>
                    <span className="font-mono font-semibold text-[#171412] tabular-nums">
                      {result.batchSummary.allocations.length > 1
                        ? result.batchSummary.allocations
                            .map((a) => `${a.fillCount}×${a.capacityMl}ml`)
                            .join(' + ')
                        : `${result.batchSummary.bottlesCount} frascos`}{' '}
                      (+{roundQuantity(result.batchSummary.leftoverMl, 1)} ml)
                    </span>
                  </div>
                  {result.batchSummary.includeLeftoverInLiquidCost &&
                    result.batchSummary.leftoverAbsorbedPerPrimaryUnit > 0.004 && (
                      <div className="flex justify-between text-[11px] text-[#5C4332]">
                        <span>Sobra rateada no líquido</span>
                        <span className="font-mono tabular-nums">
                          +{formatBRL(result.batchSummary.leftoverAbsorbedPerPrimaryUnit)}/un
                        </span>
                      </div>
                    )}
                  <div className="flex justify-between text-[11px] text-[#5C4332]">
                    <span>Frascos/emb. lote ({result.batchSummary.bottlesCount}×)</span>
                    <span className="font-mono tabular-nums">
                      {formatBRL(result.batchSummary.batchPackagingCostTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] font-semibold text-[#171412] pt-1 border-t border-[#D8CBB8]">
                    <span>Custo total do lote</span>
                    <span className="font-mono tabular-nums">
                      {formatBRL(result.batchSummary.totalBatchCostWithBottles)}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[#6E5A49]">
                  {result.batchSummary?.isBatch
                    ? `Por frasco (${draft.targetVolumeMl} ml)`
                    : 'Volume líquido apurado'}
                </span>
                <span className="font-mono font-medium tabular-nums">
                  {roundQuantity(result.liquidVolumeTotalMl, 1)} ml
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6E5A49]">Essência</span>
                <span className="font-mono tabular-nums">{formatBRL(result.essenceCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6E5A49]">Base ({draft.base.baseName})</span>
                <span className="font-mono tabular-nums">{formatBRL(result.baseCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6E5A49]">QAs, Álcool e Aditivos</span>
                <span className="font-mono tabular-nums">
                  {formatBRL(
                    result.qasCost +
                      result.alcoholCost +
                      result.waterCost +
                      result.otherIngredientsCost
                  )}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#F2ECE1] font-medium text-[#171412]">
                <span>Subtotal Líquido</span>
                <span className="font-mono tabular-nums">
                  {formatBRL(result.liquidCostTotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6E5A49]">Frasco + Componentes</span>
                <span className="font-mono tabular-nums">
                  {formatBRL(result.bottleTotalCost)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6E5A49]">Embalagem e Acabamento</span>
                <span className="font-mono tabular-nums">
                  {formatBRL(result.packagingItemsCost)}
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-[#171412] text-[#FAF7F2] p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-[#D8CBB8]">Custo unitário final</span>
                <span className="font-mono text-2xl font-semibold tabular-nums">
                  {formatBRL(result.unitCostTotal)}
                </span>
              </div>
              {result.pricingSummary && (
                <div className="mt-2 pt-2 border-t border-[#FAF7F2]/15 flex items-baseline justify-between text-xs">
                  <span className="text-[#D8CBB8]">Venda sugerida</span>
                  <span className="font-mono font-semibold text-[#E4D8C5] tabular-nums">
                    {formatBRL(result.pricingSummary.suggestedPrice)}
                  </span>
                </div>
              )}
            </div>

            {!result.valid && (
              <div className="text-[11px] text-[#9E3B33] space-y-1">
                {result.errors.slice(0, 3).map((e, idx) => (
                  <p key={idx}>• {e}</p>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Inline Create Insumo Modal */}
      <InsumoFormModal
        uid={uid}
        open={inlineInsumoModal.open}
        editingInsumo={null}
        suppliers={suppliers}
        defaultCategory={inlineInsumoModal.category}
        defaultSubcategory={inlineInsumoModal.subcategory}
        onClose={() =>
          setInlineInsumoModal((prev) => ({ ...prev, open: false }))
        }
        onSaved={(created) => {
          inlineInsumoModal.onSelectCreated?.(created);
        }}
      />

      {/* Stock Deduction Confirmation Modal */}
      {confirmStockModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#171412]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF7F2] border border-[#E4D8C5] rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-xl font-semibold text-[#171412]">
                Confirmar baixa de estoque
              </h3>
              <button
                type="button"
                onClick={() => setConfirmStockModalOpen(false)}
                className="p-1 text-[#6E5A49] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#5C4332] leading-relaxed">
              Deseja registrar esta produção como concluída e descontar
              automaticamente os insumos vinculados do seu estoque?
            </p>
            <div>
              <label className="block text-xs font-medium text-[#5C4332] mb-1">
                Quantidade de frascos produzidos neste lote
              </label>
              <input
                type="number"
                min="1"
                max="10000"
                value={batchUnitsToDeduct}
                onChange={(e) => setBatchUnitsToDeduct(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm font-mono"
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => executeSaveCalculation(false)}
                className="px-3.5 py-2 rounded-lg border border-[#D8CBB8] text-xs font-medium text-[#5C4332] hover:bg-[#F2ECE1] cursor-pointer"
              >
                Salvar sem baixar estoque
              </button>
              <button
                type="button"
                onClick={() => executeSaveCalculation(true)}
                className="px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium hover:bg-[#3B2B20] cursor-pointer"
              >
                Confirmar e baixar estoque
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
