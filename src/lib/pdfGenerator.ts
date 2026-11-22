import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CalculationResult,
  PerfumeFormulaDraft,
} from '../types/perfumery';
import { formatBRL, formatBRLPrecise, roundQuantity } from './perfumeryEngine';

export function generatePerfumePdfReport(params: {
  draft: PerfumeFormulaDraft;
  result: CalculationResult;
  createdAt?: string;
}) {
  const { draft, result, createdAt } = params;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const dateStr = createdAt
    ? new Date(createdAt).toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR');

  // Header
  doc.setFillColor(23, 20, 18); // #171412
  doc.rect(0, 0, 210, 32, 'F');

  doc.setTextColor(250, 247, 242);
  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  doc.text(draft.perfumeName || draft.inspiredBy || 'Fórmula Olfativa', 14, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(228, 216, 197);
  const subtitleParts = [
    draft.brandName ? `Marca: ${draft.brandName}` : null,
    `Inspirado em: ${draft.inspiredBy}`,
    draft.essenceConcentrationPct ? `Conc. Essência: ${draft.essenceConcentrationPct}%` : null,
    `Versão v${draft.version}`,
    `Data: ${dateStr}`,
  ].filter(Boolean);
  doc.text(subtitleParts.join('  ·  '), 14, 23);

  // Summary strip
  doc.setTextColor(23, 20, 18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('RESUMO DE PRODUÇÃO', 14, 42);

  const summaryHead = result.batchSummary?.isBatch
    ? [['Frasco', 'Lote', 'Rendimento', 'Líquido / Frasco', 'Embalagem', 'Custo Unitário', 'Total do Lote']]
    : [['Volume Final', 'Custo do Líquido', 'Frasco & Embalagem', 'Custo Total Unitário', 'Perdas']];

  const summaryBody = result.batchSummary?.isBatch
    ? [[
        `${draft.targetVolumeMl} ml`,
        `${roundQuantity(result.batchSummary.batchVolumeMl, 1)} ml`,
        `${result.batchSummary.bottlesCount} frascos`,
        formatBRL(result.liquidCostTotal),
        formatBRL(result.packagingTotalCost),
        formatBRL(result.unitCostTotal),
        formatBRL(result.batchSummary.totalBatchCostWithBottles),
      ]]
    : [[
        `${roundQuantity(result.liquidVolumeTotalMl, 2)} ml`,
        formatBRL(result.liquidCostTotal),
        formatBRL(result.packagingTotalCost),
        formatBRL(result.unitCostTotal),
        `${result.lossPercent}%`,
      ]];

  autoTable(doc, {
    startY: 45,
    theme: 'grid',
    headStyles: { fillColor: [242, 236, 225], textColor: [23, 20, 18], fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 3, textColor: [23, 20, 18] },
    head: summaryHead,
    body: summaryBody,
  });

  // Detailed ingredients & packaging table
  const afterSummaryY = (doc as any).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('COMPOSIÇÃO DA FÓRMULA E CUSTOS PROPORCIONAIS', 14, afterSummaryY);

  autoTable(doc, {
    startY: afterSummaryY + 3,
    theme: 'striped',
    headStyles: { fillColor: [92, 67, 50], textColor: [250, 247, 242], fontStyle: 'bold' },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    head: [['Categoria', 'Item / Insumo', 'Qtd. Utilizada', 'Custo Unit. Ref.', 'Custo Proporcional']],
    body: result.lines.map((line) => [
      line.group,
      line.concentration && line.concentration < 100
        ? `${line.name} (Conc. ${line.concentration}%)`
        : line.name,
      `${roundQuantity(line.usedQty, 3)} ${line.usedUnit}`,
      formatBRLPrecise(line.unitCostAtCalc),
      formatBRL(line.proportionalCost),
    ]),
  });

  // Size comparisons
  let nextY = (doc as any).lastAutoTable.finalY + 8;
  if (result.sizeComparisons.length > 0) {
    if (nextY > 235) {
      doc.addPage();
      nextY = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('SIMULADOR DE TAMANHOS (ESCALA PROPORCIONAL)', 14, nextY);

    autoTable(doc, {
      startY: nextY + 3,
      theme: 'grid',
      headStyles: { fillColor: [242, 236, 225], textColor: [23, 20, 18], fontStyle: 'bold' },
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      head: [['Tamanho', 'Essência', 'Base', 'QAs / Aditivos', 'Custo Líquido', 'Embalagem', 'Custo Unitário']],
      body: result.sizeComparisons.map((row) => [
        `${row.sizeMl} ml`,
        `${roundQuantity(row.essenceQty, 2)} ${row.essenceUnit}`,
        `${roundQuantity(row.baseQty, 2)} ${row.baseUnit}`,
        `${roundQuantity(row.qasQty, 2)}`,
        formatBRL(row.liquidCost),
        formatBRL(row.bottleAndPackagingCost),
        formatBRL(row.unitCost),
      ]),
    });
    nextY = (doc as any).lastAutoTable.finalY + 8;
  }

  // Pricing summary if configured
  if (result.pricingSummary) {
    if (nextY > 240) {
      doc.addPage();
      nextY = 18;
    }
    const p = result.pricingSummary;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('PRECIFICAÇÃO E PREÇO DE VENDA SUGERIDO', 14, nextY);

    autoTable(doc, {
      startY: nextY + 3,
      theme: 'grid',
      headStyles: { fillColor: [176, 141, 87], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
      head: [['Custo Produção', 'Custos Adicionais', 'Taxas / Impostos', 'Preço Sugerido', 'Lucro Estimado', 'Margem / Markup']],
      body: [[
        formatBRL(p.productionCost),
        formatBRL(p.extraCosts),
        formatBRL(p.deductionsValue),
        formatBRL(p.suggestedPrice),
        formatBRL(p.estimatedProfit),
        `${p.effectiveMarginPercent.toFixed(1)}% margem · ${p.effectiveMarkupPercent.toFixed(1)}% markup`,
      ]],
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120, 110, 100);
    doc.text(
      `Atelier Olfativo — Ficha Técnica de Precificação  ·  Página ${i} de ${pageCount}`,
      14,
      290
    );
  }

  const safeFile = (draft.perfumeName || draft.inspiredBy || 'perfume')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  doc.save(`ficha-tecnica-${safeFile}-v${draft.version}.pdf`);
}
