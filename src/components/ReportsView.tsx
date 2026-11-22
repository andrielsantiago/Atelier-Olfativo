import React from 'react';
import { FileDown, Printer } from 'lucide-react';
import { generatePerfumePdfReport } from '../lib/pdfGenerator';
import { formatBRL, roundQuantity } from '../lib/perfumeryEngine';
import { SavedCalculationRecord } from '../types/perfumery';

interface ReportsViewProps {
  calculations: SavedCalculationRecord[];
}

export const ReportsView: React.FC<ReportsViewProps> = ({ calculations }) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 no-print">
        <div>
          <p className="text-xs tracking-[0.15em] uppercase text-[#6E5A49]">
            Documentação Técnica
          </p>
          <h1 className="font-serif text-3xl font-semibold text-[#171412] mt-1">
            Relatórios e Exportação PDF
          </h1>
          <p className="text-sm text-[#6E5A49] mt-1">
            Gere fichas técnicas completas em PDF com fórmula, custos individuais,
            comparativo por tamanho e preço de venda sugerido.
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="px-4 py-2 rounded-lg border border-[#D8CBB8] bg-white text-xs font-medium text-[#171412] hover:border-[#B08D57] inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Printer className="w-4 h-4" />
          <span>Imprimir resumo</span>
        </button>
      </div>

      {calculations.length === 0 ? (
        <div className="rounded-xl border border-[#E4D8C5] bg-white p-10 text-center text-sm text-[#5C4332]">
          Nenhum relatório disponível ainda. Salve um cálculo na calculadora para
          gerar sua primeira ficha técnica em PDF.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {calculations.map((calc) => {
            const liquidShare =
              calc.unitCost > 0 ? (calc.liquidCost / calc.unitCost) * 100 : 0;
            const packShare =
              calc.unitCost > 0 ? (calc.packagingCost / calc.unitCost) * 100 : 0;

            return (
              <div
                key={calc.id}
                className="rounded-xl border border-[#E4D8C5] bg-white p-6 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-[#6E5A49]">
                      {calc.brandName ? `${calc.brandName} · ` : ''}
                      v{calc.formulaVersion} ·{' '}
                      {new Date(calc.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                    <h2 className="font-serif text-2xl font-semibold text-[#171412] mt-0.5">
                      {calc.perfumeName || calc.inspiredBy}
                    </h2>
                    <p className="text-xs text-[#5C4332]">
                      Inspirado em {calc.inspiredBy} · {calc.sizeMl} ml
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      generatePerfumePdfReport({
                        draft: calc.draftSnapshot,
                        result: calc.result,
                        createdAt: calc.createdAt,
                      })
                    }
                    className="px-3.5 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium hover:bg-[#3B2B20] inline-flex items-center gap-1.5 cursor-pointer shrink-0 no-print"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>Baixar PDF</span>
                  </button>
                </div>

                {/* Cost Proportion Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-[#5C4332]">
                    <span>Líquido ({liquidShare.toFixed(0)}%)</span>
                    <span>Embalagem ({packShare.toFixed(0)}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#F2ECE1] overflow-hidden flex">
                    <div
                      className="bg-[#5C4332] h-full"
                      style={{ width: `${liquidShare}%` }}
                    />
                    <div
                      className="bg-[#B08D57] h-full"
                      style={{ width: `${packShare}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#F2ECE1] text-xs">
                  <div>
                    <p className="text-[#8C7A68]">Custo líquido</p>
                    <p className="font-mono font-semibold text-[#171412] tabular-nums">
                      {formatBRL(calc.liquidCost)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#8C7A68]">Embalagem</p>
                    <p className="font-mono font-semibold text-[#171412] tabular-nums">
                      {formatBRL(calc.packagingCost)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#8C7A68]">Unitário total</p>
                    <p className="font-mono font-semibold text-[#171412] tabular-nums">
                      {formatBRL(calc.unitCost)}
                    </p>
                  </div>
                </div>

                {calc.result.sizeComparisons?.length > 0 && (
                  <div className="pt-2 border-t border-[#F2ECE1] text-[11px] text-[#6E5A49] flex flex-wrap gap-x-3 gap-y-1">
                    {calc.result.sizeComparisons.map((s) => (
                      <span key={s.sizeMl} className="font-mono tabular-nums">
                        {roundQuantity(s.sizeMl, 0)}ml: {formatBRL(s.unitCost)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
