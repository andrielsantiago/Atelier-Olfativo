import React, { useState } from 'react';
import {
  GitCompare,
  FileDown,
  Trash2,
  ArrowUpRight,
  X,
} from 'lucide-react';
import {
  compareCalculationWithCurrent,
  deleteCalculation,
} from '../lib/firestoreService';
import { generatePerfumePdfReport } from '../lib/pdfGenerator';
import { formatBRL } from '../lib/perfumeryEngine';
import {
  CalculationResult,
  Insumo,
  PerfumeFormulaDraft,
  SavedCalculationRecord,
} from '../types/perfumery';

interface HistoryViewProps {
  uid: string;
  calculations: SavedCalculationRecord[];
  insumos: Insumo[];
  onOpenSnapshotInCalculator: (draft: PerfumeFormulaDraft) => void;
}

interface ComparisonResponse {
  calculationId: string;
  perfumeName: string;
  oldUnitCost: number;
  currentUnitCost: number;
  diff: number;
  percentVariation: number;
  drivers: Array<{
    name: string;
    group: string;
    oldCost: number;
    currentCost: number;
    diff: number;
    percentChange: number;
  }>;
  refreshedDraft: PerfumeFormulaDraft;
  currentResult: CalculationResult;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  uid,
  calculations,
  insumos,
  onOpenSnapshotInCalculator,
}) => {
  const [comparing, setComparing] = useState<ComparisonResponse | null>(null);

  const handleCompare = (calc: SavedCalculationRecord) => {
    const data = compareCalculationWithCurrent(calc, insumos);
    setComparing(data);
  };

  const handleDelete = async (id: string) => {
    await deleteCalculation(uid, id);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.15em] uppercase text-[#6E5A49]">
          Rastreabilidade Financeira
        </p>
        <h1 className="font-serif text-3xl font-semibold text-[#171412] mt-1">
          Histórico e Controle de Custos
        </h1>
        <p className="text-sm text-[#6E5A49] mt-1">
          Os custos históricos permanecem preservados mesmo após atualizações de
          preços na biblioteca. Compare qualquer registro antigo com os valores
          atuais.
        </p>
      </div>

      {calculations.length === 0 ? (
        <div className="rounded-xl border border-[#E4D8C5] bg-white p-10 text-center text-sm text-[#5C4332]">
          Nenhum cálculo salvo no histórico ainda. Finalize um cálculo na
          calculadora para registrar seu primeiro snapshot.
        </div>
      ) : (
        <div className="rounded-xl border border-[#E4D8C5] bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E4D8C5] bg-[#FAF7F2] text-[11px] font-medium text-[#6E5A49]">
                  <th className="py-3 px-5">Perfume</th>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Versão</th>
                  <th className="py-3 px-4 text-right">Tamanho</th>
                  <th className="py-3 px-4 text-right">Líquido</th>
                  <th className="py-3 px-4 text-right">Embalagem</th>
                  <th className="py-3 px-4 text-right">Custo Unitário</th>
                  <th className="py-3 px-5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2ECE1]">
                {calculations.map((calc) => (
                  <tr key={calc.id} className="hover:bg-[#FAF7F2]/60">
                    <td className="py-3.5 px-5">
                      <div className="font-medium text-[#171412]">
                        {calc.perfumeName || calc.inspiredBy}
                      </div>
                      <div className="text-xs text-[#6E5A49]">
                        {calc.brandName ? `${calc.brandName} · ` : ''}
                        Inspirado em {calc.inspiredBy}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-[#6E5A49]">
                      {new Date(calc.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-[#5C4332]">
                      v{calc.formulaVersion}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums">
                      {calc.sizeMl} ml
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-[#5C4332]">
                      {formatBRL(calc.liquidCost)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-[#5C4332]">
                      {formatBRL(calc.packagingCost)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-[#171412] tabular-nums">
                      {formatBRL(calc.unitCost)}
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCompare(calc)}
                          className="px-2.5 py-1.5 rounded-md bg-[#F2ECE1] hover:bg-[#E4D8C5] text-[#3B2B20] text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <GitCompare className="w-3.5 h-3.5" />
                          <span>Comparar atual</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            generatePerfumePdfReport({
                              draft: calc.draftSnapshot,
                              result: calc.result,
                              createdAt: calc.createdAt,
                            })
                          }
                          title="Exportar PDF histórico"
                          className="p-1.5 rounded-md text-[#6E5A49] hover:bg-[#F2ECE1] cursor-pointer"
                        >
                          <FileDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onOpenSnapshotInCalculator(calc.draftSnapshot)
                          }
                          title="Reabrir na calculadora"
                          className="p-1.5 rounded-md text-[#6E5A49] hover:bg-[#F2ECE1] cursor-pointer"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(calc.id)}
                          title="Excluir registro"
                          className="p-1.5 rounded-md text-[#8C7A68] hover:text-[#9E3B33] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Comparison Modal */}
      {comparing && (
        <div className="fixed inset-0 z-50 bg-[#171412]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF7F2] border border-[#E4D8C5] rounded-xl w-full max-w-3xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-[#F2ECE1] border-b border-[#E4D8C5] flex items-center justify-between">
              <div>
                <h3 className="font-serif text-2xl font-semibold text-[#171412]">
                  Comparativo de Custos: {comparing.perfumeName}
                </h3>
                <p className="text-xs text-[#6E5A49]">
                  Custo histórico preservado versus preços atuais da sua Biblioteca
                </p>
              </div>
              <button
                type="button"
                onClick={() => setComparing(null)}
                className="p-1.5 rounded-lg text-[#5C4332] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-white border border-[#E4D8C5]">
                  <p className="text-xs text-[#6E5A49]">Custo anterior (snapshot)</p>
                  <p className="font-mono text-xl font-semibold text-[#171412] tabular-nums mt-1">
                    {formatBRL(comparing.oldUnitCost)}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-white border border-[#E4D8C5]">
                  <p className="text-xs text-[#6E5A49]">Custo atual simulado</p>
                  <p className="font-mono text-xl font-semibold text-[#171412] tabular-nums mt-1">
                    {formatBRL(comparing.currentUnitCost)}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-[#F2ECE1] border border-[#E4D8C5]">
                  <p className="text-xs text-[#6E5A49]">Variação</p>
                  <p
                    className={`font-mono text-xl font-semibold tabular-nums mt-1 ${
                      comparing.diff > 0.005
                        ? 'text-[#9E3B33]'
                        : comparing.diff < -0.005
                          ? 'text-[#3B6E4C]'
                          : 'text-[#171412]'
                    }`}
                  >
                    {comparing.diff >= 0 ? '+' : ''}
                    {formatBRL(comparing.diff)} ({comparing.percentVariation >= 0 ? '+' : ''}
                    {comparing.percentVariation.toFixed(2)}%)
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-[#E4D8C5] bg-white overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E4D8C5] bg-[#FAF7F2] text-[#6E5A49]">
                      <th className="py-2.5 px-4">Ingrediente / Item</th>
                      <th className="py-2.5 px-3 text-right">Custo Anterior</th>
                      <th className="py-2.5 px-3 text-right">Custo Atual</th>
                      <th className="py-2.5 px-4 text-right">Impacto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2ECE1]">
                    {comparing.drivers.map((d, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-4">
                          <span className="font-medium text-[#171412]">{d.name}</span>
                          <span className="text-[#8C7A68] ml-2">({d.group})</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatBRL(d.oldCost)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatBRL(d.currentCost)}
                        </td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono font-semibold tabular-nums ${
                            d.diff > 0.005
                              ? 'text-[#9E3B33]'
                              : d.diff < -0.005
                                ? 'text-[#3B6E4C]'
                                : 'text-[#8C7A68]'
                          }`}
                        >
                          {d.diff >= 0 ? '+' : ''}
                          {formatBRL(d.diff)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setComparing(null)}
                  className="px-4 py-2 rounded-lg border border-[#D8CBB8] text-xs text-[#5C4332] cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextDraft = comparing.refreshedDraft;
                    setComparing(null);
                    onOpenSnapshotInCalculator(nextDraft);
                  }}
                  className="px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium cursor-pointer"
                >
                  Abrir cálculo atualizado na calculadora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
