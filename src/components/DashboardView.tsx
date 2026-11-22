import React, { useState } from 'react';
import {
  Calculator,
  FlaskConical,
  Package,
  Layers,
  History,
  FileText,
  ArrowUpRight,
  AlertTriangle,
  Boxes,
} from 'lucide-react';
import { formatBRL } from '../lib/perfumeryEngine';
import { SavedCalculationRecord } from '../types/perfumery';

export type AppSection =
  | 'dashboard'
  | 'calculator'
  | 'formulas'
  | 'insumos'
  | 'bases'
  | 'history'
  | 'reports'
  | 'stock';

export interface DashboardData {
  formulasCount: number;
  insumosCount: number;
  basesCount: number;
  calculationsCount: number;
  lowStockCount: number;
  lastCalculation: {
    id: string;
    name: string;
    inspiredBy: string;
    sizeMl: number;
    unitCost: number;
    createdAt: string;
  } | null;
  recentCalculations: SavedCalculationRecord[];
}

interface DashboardViewProps {
  data: DashboardData | null;
  loading: boolean;
  stockModuleEnabled: boolean;
  onNavigate: (section: AppSection) => void;
  onNewCalculation: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  loading,
  stockModuleEnabled,
  onNavigate,
  onNewCalculation,
}) => {
  const [heroImgErr, setHeroImgErr] = useState(false);

  const shortcuts: Array<{
    id: AppSection;
    title: string;
    desc: string;
    icon: React.ReactNode;
    primary?: boolean;
  }> = [
    {
      id: 'calculator',
      title: 'Novo cálculo',
      desc: 'Inicie uma fórmula passo a passo com simulador de tamanhos e preço de venda.',
      icon: <Calculator className="w-5 h-5" />,
      primary: true,
    },
    {
      id: 'formulas',
      title: 'Minhas fórmulas',
      desc: 'Gerencie rascunhos, versões e duplique composições existentes.',
      icon: <FlaskConical className="w-5 h-5" />,
    },
    {
      id: 'insumos',
      title: 'Biblioteca de insumos',
      desc: 'Cadastre essências, álcoois, QAs, frascos e embalagens com histórico de compra.',
      icon: <Package className="w-5 h-5" />,
    },
    {
      id: 'bases',
      title: 'Minhas bases',
      desc: 'Utilize as bases do grupo (Nickson e Leandro) ou crie bases personalizadas.',
      icon: <Layers className="w-5 h-5" />,
    },
    {
      id: 'history',
      title: 'Histórico de custos',
      desc: 'Consulte produções anteriores e compare variações de preço dos insumos.',
      icon: <History className="w-5 h-5" />,
    },
    {
      id: 'reports',
      title: 'Relatórios',
      desc: 'Exporte fichas técnicas em PDF e planilhas de composição para impressão.',
      icon: <FileText className="w-5 h-5" />,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <section className="rounded-xl border border-[#E4D8C5] bg-[#F2ECE1] overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-7 p-7 sm:p-10 flex flex-col justify-between">
          <div>
            <p className="text-xs tracking-[0.16em] uppercase text-[#6E5A49] font-medium">
              Painel do Atelier
            </p>
            <h1 className="font-serif text-3xl sm:text-4xl lg:text-[42px] font-semibold text-[#171412] mt-2 leading-[1.12]">
              Gestão de Perfumaria Artesanal
            </h1>
            <p className="text-sm sm:text-base text-[#5C4332] mt-3 max-w-xl leading-relaxed">
              Gerencie seus insumos, desenvolva suas fórmulas e descubra o custo
              real de cada fragrância.
            </p>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onNewCalculation}
              className="px-5 py-2.5 rounded-lg bg-[#171412] text-[#FAF7F2] text-sm font-medium hover:bg-[#3B2B20] transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Calculator className="w-4 h-4" />
              <span>Novo cálculo</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('insumos')}
              className="px-4 py-2.5 rounded-lg bg-[#FAF7F2] border border-[#D8CBB8] text-[#171412] text-sm font-medium hover:border-[#B08D57] transition-colors whitespace-nowrap cursor-pointer"
            >
              Cadastrar insumos
            </button>
            {stockModuleEnabled && data && data.lowStockCount > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('stock')}
                className="px-3.5 py-2 rounded-lg border border-[#B08D57]/40 bg-[#B08D57]/10 text-[#5C4332] text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[#B08D57]/15 cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-[#9A7239]" />
                <span>{data.lowStockCount} insumo(s) com estoque baixo</span>
              </button>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 min-h-[220px] lg:min-h-[280px] bg-[#E4D8C5]">
          {!heroImgErr ? (
            <img
              src="/src/assets/images/hero_perfume_atelier_1795373580553.jpg"
              alt="Bancada de perfumaria artesanal com frascos de essência e pipetas"
              referrerPolicy="no-referrer"
              onError={() => setHeroImgErr(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-8 bg-gradient-to-br from-[#E4D8C5] to-[#D4C3AA]">
              <span className="font-serif text-xl text-[#3B2B20]">Atelier Olfativo</span>
            </div>
          )}
        </div>
      </section>

      {/* 4 Key Indicators */}
      <section aria-label="Indicadores do atelier">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-[#E4D8C5] bg-white p-5">
            <p className="text-xs text-[#6E5A49]">Fórmulas cadastradas</p>
            <p className="mt-2 font-mono text-2xl font-semibold text-[#171412] tabular-nums">
              {loading ? '—' : (data?.formulasCount ?? 0)}
            </p>
            <p className="mt-1 text-xs text-[#8C7A68]">Rascunhos e finalizadas</p>
          </div>

          <div className="rounded-xl border border-[#E4D8C5] bg-white p-5">
            <p className="text-xs text-[#6E5A49]">Insumos cadastrados</p>
            <p className="mt-2 font-mono text-2xl font-semibold text-[#171412] tabular-nums">
              {loading ? '—' : (data?.insumosCount ?? 0)}
            </p>
            <p className="mt-1 text-xs text-[#8C7A68]">Matérias-primas e embalagens</p>
          </div>

          <div className="rounded-xl border border-[#E4D8C5] bg-white p-5">
            <p className="text-xs text-[#6E5A49]">Último perfume calculado</p>
            <p className="mt-2 font-serif text-xl font-semibold text-[#171412] truncate">
              {loading
                ? '—'
                : data?.lastCalculation
                  ? data.lastCalculation.name
                  : 'Nenhum registro'}
            </p>
            <p className="mt-1 text-xs text-[#8C7A68] truncate">
              {data?.lastCalculation
                ? `Inspirado em ${data.lastCalculation.inspiredBy} · ${data.lastCalculation.sizeMl} ml`
                : 'Inicie um cálculo para registrar'}
            </p>
          </div>

          <div className="rounded-xl border border-[#E4D8C5] bg-white p-5">
            <p className="text-xs text-[#6E5A49]">Custo da última produção</p>
            <p className="mt-2 font-mono text-2xl font-semibold text-[#171412] tabular-nums">
              {loading
                ? '—'
                : data?.lastCalculation
                  ? formatBRL(data.lastCalculation.unitCost)
                  : 'R$ 0,00'}
            </p>
            <p className="mt-1 text-xs text-[#8C7A68]">
              {data?.lastCalculation
                ? `Calculado em ${new Date(data.lastCalculation.createdAt).toLocaleDateString('pt-BR')}`
                : 'Custo unitário final'}
            </p>
          </div>
        </div>
      </section>

      {/* Shortcuts Grid */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-2xl font-semibold text-[#171412]">
            Atalhos de trabalho
          </h2>
          {stockModuleEnabled && (
            <button
              type="button"
              onClick={() => onNavigate('stock')}
              className="text-xs font-medium text-[#5C4332] hover:text-[#171412] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>Controle de estoque</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shortcuts.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                item.id === 'calculator' ? onNewCalculation() : onNavigate(item.id)
              }
              className={`text-left rounded-xl p-5 border transition-colors cursor-pointer group flex flex-col justify-between ${
                item.primary
                  ? 'bg-[#171412] text-[#FAF7F2] border-[#171412] hover:bg-[#2B231E]'
                  : 'bg-white text-[#171412] border-[#E4D8C5] hover:border-[#B08D57]'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div
                  className={`p-2.5 rounded-lg ${
                    item.primary
                      ? 'bg-[#FAF7F2]/10 text-[#E4D8C5]'
                      : 'bg-[#F2ECE1] text-[#5C4332]'
                  }`}
                >
                  {item.icon}
                </div>
                <ArrowUpRight
                  className={`w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${
                    item.primary ? 'text-[#E4D8C5]' : 'text-[#9E8E7B]'
                  }`}
                />
              </div>

              <div className="mt-4">
                <h3 className="text-base font-semibold">{item.title}</h3>
                <p
                  className={`text-xs mt-1 leading-relaxed ${
                    item.primary ? 'text-[#D8CBB8]' : 'text-[#6E5A49]'
                  }`}
                >
                  {item.desc}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Recent Calculations Table (only shows real stored rows) */}
      <section className="rounded-xl border border-[#E4D8C5] bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E4D8C5] flex items-center justify-between">
          <div>
            <h2 className="font-serif text-xl font-semibold text-[#171412]">
              Cálculos recentes
            </h2>
            <p className="text-xs text-[#6E5A49]">
              Histórico real das últimas fragrâncias apuradas
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="text-xs font-medium text-[#5C4332] hover:text-[#171412] underline underline-offset-4 cursor-pointer"
          >
            Ver histórico completo
          </button>
        </div>

        {!data || data.recentCalculations.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-[#5C4332]">
              Nenhum cálculo salvo ainda neste atelier.
            </p>
            <p className="text-xs text-[#8C7A68] mt-1">
              Cadastre seus insumos ou inicie diretamente um novo cálculo de perfume.
            </p>
            <button
              type="button"
              onClick={onNewCalculation}
              className="mt-4 px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium hover:bg-[#3B2B20] cursor-pointer"
            >
              Calcular primeiro perfume
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E4D8C5] bg-[#FAF7F2] text-[11px] font-medium text-[#6E5A49]">
                  <th className="py-2.5 px-5">Perfume / Inspiração</th>
                  <th className="py-2.5 px-4">Versão</th>
                  <th className="py-2.5 px-4 text-right">Volume</th>
                  <th className="py-2.5 px-4 text-right">Líquido</th>
                  <th className="py-2.5 px-4 text-right">Embalagem</th>
                  <th className="py-2.5 px-5 text-right">Custo Unitário</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2ECE1] text-sm">
                {data.recentCalculations.map((row) => (
                  <tr key={row.id} className="hover:bg-[#FAF7F2]/70 transition-colors">
                    <td className="py-3 px-5">
                      <div className="font-medium text-[#171412]">
                        {row.perfumeName || row.inspiredBy}
                      </div>
                      <div className="text-xs text-[#6E5A49]">
                        {row.brandName ? `${row.brandName} · ` : ''}
                        Inspirado em {row.inspiredBy}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-[#5C4332]">
                      v{row.formulaVersion}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                      {row.sizeMl} ml
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-[#5C4332]">
                      {formatBRL(row.liquidCost)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-[#5C4332]">
                      {formatBRL(row.packagingCost)}
                    </td>
                    <td className="py-3 px-5 text-right font-mono font-semibold text-[#171412] tabular-nums">
                      {formatBRL(row.unitCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
