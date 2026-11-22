import React, { useState } from 'react';
import { Plus, Trash2, ArrowRight, Layers } from 'lucide-react';
import { createCustomBase, deleteCustomBase } from '../lib/firestoreService';
import {
  buildPredefinedBaseIngredients,
  createEmptyFormulaDraft,
} from '../lib/defaultDraft';
import {
  evaluateBaseCost,
  formatBRL,
  formatBRLPrecise,
} from '../lib/perfumeryEngine';
import {
  BaseIngredientLine,
  Insumo,
  PREDEFINED_BASES,
  PerfumeFormulaDraft,
  PropChoice,
  SavedCustomBase,
} from '../types/perfumery';

interface BasesViewProps {
  uid: string;
  savedBases: SavedCustomBase[];
  insumos: Insumo[];
  onUseBaseInCalculator: (draft: PerfumeFormulaDraft) => void;
}

export const BasesView: React.FC<BasesViewProps> = ({
  uid,
  savedBases,
  insumos,
  onUseBaseInCalculator,
}) => {
  const [selectedPropByPredef, setSelectedPropByPredef] = useState<
    Record<string, PropChoice>
  >({
    clean_nickson: 'Propanediol',
    turbo_nickson: 'Propanediol',
    clean_leandro: 'Propanediol',
    turbo_leandro: 'Propanediol',
  });

  // New custom base builder
  const [showCreator, setShowCreator] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBatchQty, setNewBatchQty] = useState(1000);
  const [newBatchUnit, setNewBatchUnit] = useState<'ml' | 'g'>('ml');
  const [newIngredients, setNewIngredients] = useState<BaseIngredientLine[]>([
    {
      id: 'nb-1',
      insumoId: null,
      name: 'Álcool de cereais 96 GL',
      percentage: 92,
      purchasedQty: 1000,
      purchaseUnit: 'ml',
      purchasePrice: 0,
      freight: 0,
      density: null,
      concentration: 96,
      usedUnit: 'ml',
    },
    {
      id: 'nb-2',
      insumoId: null,
      name: 'Água deionizada',
      percentage: 5,
      purchasedQty: 1000,
      purchaseUnit: 'ml',
      purchasePrice: 0,
      freight: 0,
      density: null,
      concentration: 100,
      usedUnit: 'ml',
    },
    {
      id: 'nb-3',
      insumoId: null,
      name: 'Propanediol',
      percentage: 3,
      purchasedQty: 1000,
      purchaseUnit: 'ml',
      purchasePrice: 0,
      freight: 0,
      density: null,
      concentration: 100,
      usedUnit: 'ml',
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rawMaterialInsumos = insumos.filter((i) => i.category === 'Matéria-prima');

  const creatorEval = evaluateBaseCost({
    mode: 'custom_new',
    baseName: newName || 'Nova Base',
    purchasedQty: 1000,
    purchaseUnit: 'ml',
    purchasePrice: 0,
    freight: 0,
    batchVolumeQty: newBatchQty,
    batchUnit: newBatchUnit,
    ingredients: newIngredients,
    usedInFormulaQty: 80,
    usedInFormulaUnit: newBatchUnit,
    density: null,
  });

  const handleSaveCustomBase = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newName.trim()) {
      setError('Informe o nome da base personalizada.');
      return;
    }
    if (Math.abs(creatorEval.compositionSum - 100) > 0.01) {
      setError(
        `A composição deve totalizar exatamente 100% (atual: ${creatorEval.compositionSum.toFixed(2)}%).`
      );
      return;
    }
    setSaving(true);
    try {
      await createCustomBase(uid, {
        name: newName.trim(),
        baseType: 'custom',
        propChoice: null,
        batchQty: newBatchQty,
        batchUnit: newBatchUnit,
        purchasePrice: 0,
        freight: 0,
        ingredients: newIngredients,
        notes: '',
      });
      setNewName('');
      setShowCreator(false);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar base.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBase = async (id: string) => {
    await deleteCustomBase(uid, id);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.15em] uppercase text-[#6E5A49]">
            Veículos e Diluições
          </p>
          <h1 className="font-serif text-3xl font-semibold text-[#171412] mt-1">
            Minhas Bases
          </h1>
          <p className="text-sm text-[#6E5A49] mt-1">
            Bases predefinidas do grupo e suas bases personalizadas para reutilização
            direta nas fórmulas.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreator((v) => !v)}
          className="px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium hover:bg-[#3B2B20] inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{showCreator ? 'Fechar criador' : 'Criar base personalizada'}</span>
        </button>
      </div>

      {/* Custom Base Creator */}
      {showCreator && (
        <form
          onSubmit={handleSaveCustomBase}
          className="rounded-xl border border-[#B08D57]/50 bg-white p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-2xl font-semibold text-[#171412]">
              Nova Base Personalizada
            </h2>
            <span
              className={`font-mono text-xs font-semibold ${
                Math.abs(creatorEval.compositionSum - 100) <= 0.01
                  ? 'text-[#3B2B20]'
                  : 'text-[#9E3B33]'
              }`}
            >
              Composição: {creatorEval.compositionSum.toFixed(1)}% / 100%
            </span>
          </div>

          {error && (
            <div className="p-3 rounded-lg border border-[#9E3B33]/30 bg-[#9E3B33]/5 text-xs text-[#7A2720]">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#5C4332] mb-1">
                Nome da base *
              </label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex.: Base Extrait 2026"
                className="w-full px-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#D8CBB8] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5C4332] mb-1">
                Volume/Massa do lote
              </label>
              <input
                type="number"
                min="1"
                value={newBatchQty}
                onChange={(e) => setNewBatchQty(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#D8CBB8] text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5C4332] mb-1">
                Unidade do lote
              </label>
              <select
                value={newBatchUnit}
                onChange={(e) => setNewBatchUnit(e.target.value as 'ml' | 'g')}
                className="w-full px-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#D8CBB8] text-sm font-mono"
              >
                <option value="ml">ml</option>
                <option value="g">g</option>
              </select>
            </div>
          </div>

          <div className="space-y-2.5">
            {newIngredients.map((ing, idx) => (
              <div
                key={ing.id}
                className="p-3 rounded-lg bg-[#FAF7F2] border border-[#E4D8C5] grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center"
              >
                <select
                  value={ing.insumoId ?? ''}
                  onChange={(e) => {
                    const ins = rawMaterialInsumos.find(
                      (i) => i.id === e.target.value
                    );
                    if (!ins) return;
                    const next = [...newIngredients];
                    next[idx] = {
                      ...ing,
                      insumoId: ins.id,
                      name: ins.name,
                      purchasedQty: ins.purchasedQty,
                      purchaseUnit: ins.purchaseUnit,
                      purchasePrice: ins.purchasePrice,
                      freight: ins.freight,
                      density: ins.density,
                    };
                    setNewIngredients(next);
                  }}
                  className="sm:col-span-4 px-2.5 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs"
                >
                  <option value="">Selecionar insumo...</option>
                  {rawMaterialInsumos.map((ins) => (
                    <option key={ins.id} value={ins.id}>
                      {ins.name} ({formatBRLPrecise(ins.unitCost)}/{ins.purchaseUnit})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={ing.name}
                  onChange={(e) => {
                    const next = [...newIngredients];
                    next[idx] = { ...ing, name: e.target.value };
                    setNewIngredients(next);
                  }}
                  className="sm:col-span-4 px-2.5 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs"
                />
                <div className="sm:col-span-3 flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={ing.percentage}
                    onChange={(e) => {
                      const next = [...newIngredients];
                      next[idx] = { ...ing, percentage: Number(e.target.value) };
                      setNewIngredients(next);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-md bg-white border border-[#D8CBB8] text-xs font-mono"
                  />
                  <span className="text-xs text-[#6E5A49]">%</span>
                </div>
                <div className="sm:col-span-1 text-right">
                  {newIngredients.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setNewIngredients(newIngredients.filter((_, i) => i !== idx))
                      }
                      className="p-1 text-[#8C7A68] hover:text-[#9E3B33] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() =>
                setNewIngredients([
                  ...newIngredients,
                  {
                    id: `nb-${Date.now()}`,
                    insumoId: null,
                    name: 'Novo componente',
                    percentage: 0,
                    purchasedQty: 1000,
                    purchaseUnit: 'ml',
                    purchasePrice: 0,
                    freight: 0,
                    density: null,
                    concentration: null,
                    usedUnit: newBatchUnit,
                  },
                ])
              }
              className="px-3 py-1.5 rounded-lg border border-[#D8CBB8] text-xs font-medium text-[#5C4332] cursor-pointer"
            >
              + Adicionar ingrediente
            </button>

            <div className="flex items-center gap-4">
              <span className="text-xs text-[#6E5A49]">
                Custo estimado:{' '}
                <strong className="font-mono text-[#171412]">
                  {formatBRLPrecise(creatorEval.unitCost)} / {newBatchUnit}
                </strong>
              </span>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium cursor-pointer"
              >
                {saving ? 'Salvando...' : 'Salvar base'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* 4 Predefined Group Bases */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-semibold text-[#171412]">
          Bases Predefinidas do Grupo
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PREDEFINED_BASES.map((spec) => {
            const prop = selectedPropByPredef[spec.id] || 'Propanediol';
            const lines = buildPredefinedBaseIngredients(spec.id, prop, insumos);
            const evaluation = evaluateBaseCost({
              mode: 'predefined',
              predefinedId: spec.id,
              propChoice: prop,
              baseName: spec.name,
              purchasedQty: 1000,
              purchaseUnit: 'ml',
              purchasePrice: 0,
              freight: 0,
              batchVolumeQty: 1000,
              batchUnit: 'ml',
              ingredients: lines,
              usedInFormulaQty: 1000,
              usedInFormulaUnit: 'ml',
              density: null,
            });

            return (
              <div
                key={spec.id}
                className="rounded-xl border border-[#E4D8C5] bg-white p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] text-[#6E5A49]">
                      Padrão {spec.author}
                    </p>
                    <h3 className="font-serif text-xl font-semibold text-[#171412]">
                      {spec.name}
                    </h3>
                    <p className="text-xs text-[#6E5A49] mt-0.5">{spec.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-[#8C7A68]">Custo por ml</p>
                    <p className="font-mono text-sm font-semibold text-[#171412] tabular-nums">
                      {formatBRLPrecise(evaluation.unitCost)}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs border-t border-[#F2ECE1] pt-3">
                  {lines.map((l) => (
                    <div key={l.id} className="flex justify-between">
                      <span className="text-[#5C4332]">
                        {l.percentage}% · {l.name}
                      </span>
                      <span className="font-mono text-[#6E5A49]">
                        {l.insumoId
                          ? `${formatBRLPrecise(
                              (l.purchasePrice + l.freight) / l.purchasedQty
                            )}/${l.purchaseUnit}`
                          : 'Vincule na biblioteca'}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F2ECE1]">
                  <div className="flex items-center gap-1.5">
                    {(['Propanediol', 'Propilenoglicol'] as const).map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        onClick={() =>
                          setSelectedPropByPredef((prev) => ({
                            ...prev,
                            [spec.id]: choice,
                          }))
                        }
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium border cursor-pointer ${
                          prop === choice
                            ? 'bg-[#171412] text-[#FAF7F2] border-[#171412]'
                            : 'bg-[#FAF7F2] text-[#5C4332] border-[#D8CBB8]'
                        }`}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const d = createEmptyFormulaDraft(insumos);
                      d.base = {
                        ...d.base,
                        mode: 'predefined',
                        predefinedId: spec.id,
                        propChoice: prop,
                        baseName: spec.name,
                        ingredients: lines,
                      };
                      onUseBaseInCalculator(d);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#F2ECE1] hover:bg-[#E4D8C5] text-[#171412] text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Usar em cálculo</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Saved Custom Bases */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-semibold text-[#171412]">
          Bases Personalizadas Salvas
        </h2>
        {savedBases.length === 0 ? (
          <div className="rounded-xl border border-[#E4D8C5] bg-white p-8 text-center">
            <Layers className="w-6 h-6 text-[#8C7A68] mx-auto mb-2" />
            <p className="text-sm text-[#5C4332]">
              Nenhuma base personalizada salva ainda.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {savedBases.map((sb) => {
              const ev = evaluateBaseCost({
                mode: 'custom_saved',
                baseName: sb.name,
                purchasedQty: 1000,
                purchaseUnit: 'ml',
                purchasePrice: sb.purchasePrice,
                freight: sb.freight,
                batchVolumeQty: sb.batchQty,
                batchUnit: sb.batchUnit,
                ingredients: sb.ingredients,
                usedInFormulaQty: sb.batchQty,
                usedInFormulaUnit: sb.batchUnit,
                density: null,
              });

              return (
                <div
                  key={sb.id}
                  className="rounded-xl border border-[#E4D8C5] bg-white p-5 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-serif text-xl font-semibold text-[#171412]">
                        {sb.name}
                      </h3>
                      <p className="text-xs text-[#6E5A49]">
                        Lote de {sb.batchQty} {sb.batchUnit} ·{' '}
                        {sb.ingredients.length} componente(s)
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-[#8C7A68]">Custo unitário</p>
                      <p className="font-mono text-sm font-semibold tabular-nums">
                        {formatBRLPrecise(ev.unitCost)} / {sb.batchUnit}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs border-t border-[#F2ECE1] pt-2">
                    {sb.ingredients.map((ing, i) => (
                      <div key={i} className="flex justify-between text-[#5C4332]">
                        <span>
                          {ing.percentage}% · {ing.name}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#F2ECE1]">
                    <button
                      type="button"
                      onClick={() => handleDeleteBase(sb.id)}
                      className="text-xs text-[#8C7A68] hover:text-[#9E3B33] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = createEmptyFormulaDraft(insumos);
                        d.base = {
                          ...d.base,
                          mode: 'custom_saved',
                          savedBaseId: sb.id,
                          baseName: sb.name,
                          batchVolumeQty: sb.batchQty,
                          batchUnit: sb.batchUnit,
                          ingredients: sb.ingredients,
                        };
                        onUseBaseInCalculator(d);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Usar em cálculo</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
