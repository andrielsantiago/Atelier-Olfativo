import React, { useMemo, useState } from 'react';
import {
  Copy,
  Edit3,
  GitBranch,
  Plus,
  Search,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { deleteFormula, duplicateFormula } from '../lib/firestoreService';
import { calculatePerfumeCost, formatBRL } from '../lib/perfumeryEngine';
import { Insumo, PerfumeFormulaDraft, SavedFormulaRecord } from '../types/perfumery';

interface FormulasViewProps {
  uid: string;
  formulas: SavedFormulaRecord[];
  insumos: Insumo[];
  onOpenInCalculator: (draft: PerfumeFormulaDraft) => void;
  onNewFormula: () => void;
}

export const FormulasView: React.FC<FormulasViewProps> = ({
  uid,
  formulas,
  insumos,
  onOpenInCalculator,
  onNewFormula,
}) => {
  const [statusFilter, setStatusFilter] = useState<'todas' | 'rascunho' | 'finalizada'>('todas');
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const insumoMap = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos]);

  const filtered = useMemo(() => {
    return formulas.filter((f) => {
      if (statusFilter !== 'todas' && f.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          f.perfumeName.toLowerCase().includes(q) ||
          f.inspiredBy.toLowerCase().includes(q) ||
          f.brandName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [formulas, statusFilter, search]);

  const handleDuplicate = async (formula: SavedFormulaRecord, asNewVersion: boolean) => {
    await duplicateFormula(uid, formula, asNewVersion);
    setFeedback(
      asNewVersion
        ? `Nova versão v${formula.version + 1} criada para "${formula.perfumeName || formula.inspiredBy}".`
        : `Fórmula duplicada com sucesso.`
    );
  };

  const handleDelete = async (id: string) => {
    await deleteFormula(uid, id);
  };

  const handleOpenWithCurrentPrices = (formula: SavedFormulaRecord) => {
    const updatedDraft: PerfumeFormulaDraft = structuredClone(formula.data);
    updatedDraft.id = formula.id;

    for (const m of updatedDraft.rawMaterials) {
      const ins = m.insumoId ? insumoMap.get(m.insumoId) : undefined;
      if (ins) {
        m.purchasedQty = ins.purchasedQty;
        m.purchaseUnit = ins.purchaseUnit;
        m.purchasePrice = ins.purchasePrice;
        m.freight = ins.freight;
        m.density = ins.density;
        m.concentration = ins.concentration;
      }
    }
    for (const q of updatedDraft.qas) {
      const ins = q.insumoId ? insumoMap.get(q.insumoId) : undefined;
      if (ins) {
        q.purchasedQty = ins.purchasedQty;
        q.purchaseUnit = ins.purchaseUnit;
        q.purchasePrice = ins.purchasePrice;
        q.freight = ins.freight;
        q.density = ins.density;
        q.concentration = ins.concentration;
      }
    }
    for (const b of updatedDraft.base.ingredients) {
      const ins = b.insumoId ? insumoMap.get(b.insumoId) : undefined;
      if (ins) {
        b.purchasedQty = ins.purchasedQty;
        b.purchaseUnit = ins.purchaseUnit;
        b.purchasePrice = ins.purchasePrice;
        b.freight = ins.freight;
      }
    }
    if (updatedDraft.base.purchasedBaseInsumoId) {
      const ins = insumoMap.get(updatedDraft.base.purchasedBaseInsumoId);
      if (ins) {
        updatedDraft.base.purchasedQty = ins.purchasedQty;
        updatedDraft.base.purchaseUnit = ins.purchaseUnit;
        updatedDraft.base.purchasePrice = ins.purchasePrice;
        updatedDraft.base.freight = ins.freight;
      }
    }
    if (updatedDraft.bottle.mode === 'complete' && updatedDraft.bottle.complete.insumoId) {
      const ins = insumoMap.get(updatedDraft.bottle.complete.insumoId);
      if (ins) {
        updatedDraft.bottle.complete.purchasedQty = ins.purchasedQty;
        updatedDraft.bottle.complete.purchasePrice = ins.purchasePrice;
        updatedDraft.bottle.complete.freight = ins.freight;
      }
    } else {
      (['vidro', 'valvula', 'sobretampa'] as const).forEach((k) => {
        const part = updatedDraft.bottle.parts[k];
        const ins = part.insumoId ? insumoMap.get(part.insumoId) : undefined;
        if (ins) {
          part.purchasedQty = ins.purchasedQty;
          part.purchasePrice = ins.purchasePrice;
          part.freight = ins.freight;
        }
      });
    }
    for (const p of updatedDraft.packaging) {
      const ins = p.insumoId ? insumoMap.get(p.insumoId) : undefined;
      if (ins) {
        p.purchasedQty = ins.purchasedQty;
        p.purchaseUnit = ins.purchaseUnit;
        p.purchasePrice = ins.purchasePrice;
        p.freight = ins.freight;
      }
    }
    onOpenInCalculator(updatedDraft);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.15em] uppercase text-[#6E5A49]">
            Acervo Olfativo
          </p>
          <h1 className="font-serif text-3xl font-semibold text-[#171412] mt-1">
            Minhas Fórmulas
          </h1>
          <p className="text-sm text-[#6E5A49] mt-1">
            Salve rascunhos, crie novas versões, duplique composições e recalcule
            com preços atualizados.
          </p>
        </div>

        <button
          type="button"
          onClick={onNewFormula}
          className="px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium hover:bg-[#3B2B20] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Nova fórmula</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-lg border border-[#B08D57]/40 bg-[#F2ECE1] text-xs text-[#3B2B20] flex justify-between">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-[#F2ECE1] rounded-lg border border-[#E4D8C5] self-start">
          {(
            [
              { id: 'todas', label: 'Todas' },
              { id: 'rascunho', label: 'Rascunhos' },
              { id: 'finalizada', label: 'Finalizadas' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-white text-[#171412] shadow-xs'
                  : 'text-[#6E5A49] hover:text-[#171412]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#8C7A68] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar fórmula, marca ou inspiração..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm focus:outline-none focus:border-[#B08D57]"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-[#E4D8C5] bg-white p-10 text-center">
          <p className="text-sm text-[#5C4332]">Nenhuma fórmula encontrada.</p>
          <button
            type="button"
            onClick={onNewFormula}
            className="mt-4 px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium cursor-pointer"
          >
            Criar primeira fórmula
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((formula) => {
            const liveWithCurrent = calculatePerfumeCost(
              {
                ...formula.data,
                rawMaterials: formula.data.rawMaterials.map((m) => {
                  const ins = m.insumoId ? insumoMap.get(m.insumoId) : undefined;
                  return ins
                    ? {
                        ...m,
                        purchasedQty: ins.purchasedQty,
                        purchaseUnit: ins.purchaseUnit,
                        purchasePrice: ins.purchasePrice,
                        freight: ins.freight,
                      }
                    : m;
                }),
                qas: (formula.data.qas || []).map((q) => {
                  const ins = q.insumoId ? insumoMap.get(q.insumoId) : undefined;
                  return ins
                    ? {
                        ...q,
                        purchasedQty: ins.purchasedQty,
                        purchaseUnit: ins.purchaseUnit,
                        purchasePrice: ins.purchasePrice,
                        freight: ins.freight,
                      }
                    : q;
                }),
                base: {
                  ...formula.data.base,
                  ingredients: formula.data.base.ingredients.map((b) => {
                    const ins = b.insumoId ? insumoMap.get(b.insumoId) : undefined;
                    return ins
                      ? {
                          ...b,
                          purchasedQty: ins.purchasedQty,
                          purchaseUnit: ins.purchaseUnit,
                          purchasePrice: ins.purchasePrice,
                          freight: ins.freight,
                        }
                      : b;
                  }),
                },
                bottle: {
                  ...formula.data.bottle,
                  complete: (() => {
                    const ins = formula.data.bottle.complete.insumoId
                      ? insumoMap.get(formula.data.bottle.complete.insumoId)
                      : undefined;
                    return ins
                      ? {
                          ...formula.data.bottle.complete,
                          purchasedQty: ins.purchasedQty,
                          purchasePrice: ins.purchasePrice,
                          freight: ins.freight,
                        }
                      : formula.data.bottle.complete;
                  })(),
                  parts: {
                    vidro: (() => {
                      const p = formula.data.bottle.parts.vidro;
                      const ins = p.insumoId ? insumoMap.get(p.insumoId) : undefined;
                      return ins
                        ? { ...p, purchasedQty: ins.purchasedQty, purchasePrice: ins.purchasePrice, freight: ins.freight }
                        : p;
                    })(),
                    valvula: (() => {
                      const p = formula.data.bottle.parts.valvula;
                      const ins = p.insumoId ? insumoMap.get(p.insumoId) : undefined;
                      return ins
                        ? { ...p, purchasedQty: ins.purchasedQty, purchasePrice: ins.purchasePrice, freight: ins.freight }
                        : p;
                    })(),
                    sobretampa: (() => {
                      const p = formula.data.bottle.parts.sobretampa;
                      const ins = p.insumoId ? insumoMap.get(p.insumoId) : undefined;
                      return ins
                        ? { ...p, purchasedQty: ins.purchasedQty, purchasePrice: ins.purchasePrice, freight: ins.freight }
                        : p;
                    })(),
                  },
                },
                packaging: (formula.data.packaging || []).map((p) => {
                  const ins = p.insumoId ? insumoMap.get(p.insumoId) : undefined;
                  return ins
                    ? {
                        ...p,
                        purchasedQty: ins.purchasedQty,
                        purchaseUnit: ins.purchaseUnit,
                        purchasePrice: ins.purchasePrice,
                        freight: ins.freight,
                      }
                    : p;
                }),
              },
              insumos
            );

            return (
              <div
                key={formula.id}
                className="rounded-xl border border-[#E4D8C5] bg-white p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-[#6E5A49]">
                        {formula.brandName ? `${formula.brandName} · ` : ''}
                        Versão v{formula.version} ·{' '}
                        {formula.status === 'rascunho' ? 'Rascunho' : 'Finalizada'}
                      </div>
                      <h2 className="font-serif text-2xl font-semibold text-[#171412] mt-0.5">
                        {formula.perfumeName || formula.inspiredBy}
                      </h2>
                      <p className="text-xs text-[#5C4332]">
                        Inspirado em {formula.inspiredBy} · {formula.targetVolumeMl} ml
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-[11px] text-[#8C7A68]">Custo salvo</p>
                      <p className="font-mono text-lg font-semibold text-[#171412] tabular-nums">
                        {formatBRL(formula.unitCost)}
                      </p>
                      {Math.abs(liveWithCurrent.unitCostTotal - formula.unitCost) > 0.01 && (
                        <p className="font-mono text-[11px] text-[#9A7239] tabular-nums">
                          Atual: {formatBRL(liveWithCurrent.unitCostTotal)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-[#F2ECE1] text-xs text-[#6E5A49] flex flex-wrap gap-x-3 gap-y-1">
                    <span>Base: {formula.data.base?.baseName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formula.data.rawMaterials?.length || 0} matéria(s)-prima(s)</span>
                    <span aria-hidden="true">·</span>
                    <span>{formula.data.qas?.length || 0} QA(s)</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F2ECE1]">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenInCalculator({ ...formula.data, id: formula.id })
                      }
                      className="px-3 py-1.5 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Abrir / Editar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenWithCurrentPrices(formula)}
                      className="px-3 py-1.5 rounded-lg bg-[#F2ECE1] text-[#3B2B20] text-xs font-medium inline-flex items-center gap-1 hover:bg-[#E4D8C5] cursor-pointer"
                      title="Abrir recalculando insumos com os preços atuais da Biblioteca"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Recalcular atual</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleDuplicate(formula, true)}
                      title="Criar nova versão (v+1)"
                      className="p-1.5 rounded-md text-[#5C4332] hover:bg-[#F2ECE1] cursor-pointer"
                    >
                      <GitBranch className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicate(formula, false)}
                      title="Duplicar fórmula para outro perfume"
                      className="p-1.5 rounded-md text-[#5C4332] hover:bg-[#F2ECE1] cursor-pointer"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(formula.id)}
                      title="Excluir fórmula"
                      className="p-1.5 rounded-md text-[#8C7A68] hover:text-[#9E3B33] hover:bg-[#9E3B33]/10 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
