import React, { useState } from 'react';
import { AlertTriangle, SlidersHorizontal, X } from 'lucide-react';
import { adjustStock } from '../lib/firestoreService';
import { formatBRLPrecise, roundQuantity } from '../lib/perfumeryEngine';
import { Insumo, StockMovement } from '../types/perfumery';

interface StockViewProps {
  uid: string;
  insumos: Insumo[];
  movements: StockMovement[];
  stockModuleEnabled: boolean;
  onToggleStockModule: (enabled: boolean) => Promise<void>;
}

export const StockView: React.FC<StockViewProps> = ({
  uid,
  insumos,
  movements,
  stockModuleEnabled,
  onToggleStockModule,
}) => {
  const [adjustTarget, setAdjustTarget] = useState<Insumo | null>(null);
  const [adjustType, setAdjustType] = useState<'entrada' | 'saida' | 'ajuste'>('ajuste');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [saving, setSaving] = useState(false);

  const trackedInsumos = insumos.filter((i) => i.stockEnabled);

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    setSaving(true);
    try {
      await adjustStock(
        uid,
        adjustTarget,
        adjustType,
        Number(adjustQty),
        adjustReason.trim() || 'Ajuste manual de inventário'
      );
      setAdjustTarget(null);
      setAdjustQty('');
      setAdjustReason('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.15em] uppercase text-[#6E5A49]">
            Inventário do Atelier
          </p>
          <h1 className="font-serif text-3xl font-semibold text-[#171412] mt-1">
            Controle de Estoque
          </h1>
          <p className="text-sm text-[#6E5A49] mt-1">
            Acompanhe saldos disponíveis, alertas de reposição e movimentações. O
            módulo é opcional e pode ser ativado ou desativado a qualquer momento.
          </p>
        </div>

        <label className="flex items-center gap-2.5 px-4 py-2 rounded-lg bg-white border border-[#E4D8C5] text-xs font-medium text-[#171412] cursor-pointer self-start sm:self-auto">
          <input
            type="checkbox"
            checked={stockModuleEnabled}
            onChange={(e) => onToggleStockModule(e.target.checked)}
            className="w-4 h-4 accent-[#171412]"
          />
          <span>Módulo de estoque ativo</span>
        </label>
      </div>

      {!stockModuleEnabled && (
        <div className="p-4 rounded-xl border border-[#B08D57]/40 bg-[#F2ECE1] text-xs text-[#5C4332]">
          O controle automático de estoque está desativado. Você continua usando a
          calculadora normalmente sem baixas automáticas.
        </div>
      )}

      {/* Stock Table */}
      <div className="rounded-xl border border-[#E4D8C5] bg-white overflow-hidden">
        {trackedInsumos.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#5C4332]">
            Nenhum insumo com controle de estoque habilitado. Cadastre ou edite um
            insumo na Biblioteca para acompanhar seu saldo.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E4D8C5] bg-[#FAF7F2] text-[11px] font-medium text-[#6E5A49]">
                  <th className="py-3 px-5">Insumo</th>
                  <th className="py-3 px-4 text-right">Qtd. Comprada</th>
                  <th className="py-3 px-4 text-right">Qtd. Utilizada</th>
                  <th className="py-3 px-4 text-right">Disponível</th>
                  <th className="py-3 px-4 text-right">Custo Médio</th>
                  <th className="py-3 px-4">Última Compra</th>
                  <th className="py-3 px-5 text-right">Ajuste</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2ECE1]">
                {trackedInsumos.map((item) => {
                  const available = Math.max(0, item.stockQty - item.stockUsed);
                  const isLow =
                    item.stockMinAlert > 0 && available <= item.stockMinAlert;

                  return (
                    <tr key={item.id} className="hover:bg-[#FAF7F2]/60">
                      <td className="py-3.5 px-5">
                        <div className="font-medium text-[#171412] flex items-center gap-2">
                          <span>{item.name}</span>
                          {isLow && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#9E3B33] font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Estoque baixo (mín. {item.stockMinAlert}{' '}
                              {item.purchaseUnit})
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#6E5A49]">{item.subcategory}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums">
                        {roundQuantity(item.stockQty, 2)} {item.purchaseUnit}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-[#6E5A49]">
                        {roundQuantity(item.stockUsed, 2)} {item.purchaseUnit}
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-mono text-xs font-semibold tabular-nums ${
                          isLow ? 'text-[#9E3B33]' : 'text-[#171412]'
                        }`}
                      >
                        {roundQuantity(available, 2)} {item.purchaseUnit}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums">
                        {formatBRLPrecise(item.unitCost)} / {item.purchaseUnit}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-[#6E5A49]">
                        {item.purchaseDate}
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setAdjustTarget(item);
                            setAdjustType('ajuste');
                            setAdjustQty(String(roundQuantity(available, 2)));
                            setAdjustReason('');
                          }}
                          className="px-2.5 py-1.5 rounded-md bg-[#F2ECE1] hover:bg-[#E4D8C5] text-[#3B2B20] text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                          <span>Ajustar</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Movements Log */}
      <div className="rounded-xl border border-[#E4D8C5] bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E4D8C5] bg-[#FAF7F2]">
          <h2 className="font-serif text-xl font-semibold text-[#171412]">
            Movimentações recentes
          </h2>
        </div>
        {movements.length === 0 ? (
          <div className="p-6 text-xs text-[#6E5A49]">
            Nenhuma movimentação registrada ainda.
          </div>
        ) : (
          <div className="divide-y divide-[#F2ECE1] text-xs">
            {movements.slice(0, 20).map((m) => (
              <div
                key={m.id}
                className="px-5 py-3 flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <span className="font-medium text-[#171412]">{m.insumoName}</span>
                  <span className="text-[#8C7A68] mx-2">·</span>
                  <span className="text-[#5C4332]">{m.reason}</span>
                </div>
                <div className="flex items-center gap-4 font-mono tabular-nums">
                  <span className="text-[#6E5A49] uppercase">{m.type}</span>
                  <span className="font-semibold text-[#171412]">
                    {roundQuantity(m.quantity, 2)} {m.unit}
                  </span>
                  <span className="text-[#8C7A68]">
                    {new Date(m.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Adjustment Modal */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 bg-[#171412]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF7F2] border border-[#E4D8C5] rounded-xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="px-5 py-4 bg-[#F2ECE1] border-b border-[#E4D8C5] flex items-center justify-between">
              <div>
                <h3 className="font-serif text-xl font-semibold text-[#171412]">
                  Ajuste manual de estoque
                </h3>
                <p className="text-xs text-[#6E5A49]">{adjustTarget.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustTarget(null)}
                className="p-1 text-[#5C4332] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#5C4332] mb-1">
                  Tipo de movimento
                </label>
                <select
                  value={adjustType}
                  onChange={(e) =>
                    setAdjustType(e.target.value as 'entrada' | 'saida' | 'ajuste')
                  }
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-xs"
                >
                  <option value="ajuste">Definir saldo disponível exato</option>
                  <option value="entrada">Adicionar entrada ao estoque</option>
                  <option value="saida">Registrar saída / perda</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5C4332] mb-1">
                  Quantidade ({adjustTarget.purchaseUnit}) *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  required
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5C4332] mb-1">
                  Motivo do ajuste *
                </label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Ex.: Conferência física de frascos"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustTarget(null)}
                  className="px-4 py-2 rounded-lg border border-[#D8CBB8] text-xs text-[#5C4332] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium cursor-pointer"
                >
                  {saving ? 'Aplicando...' : 'Aplicar ajuste'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
