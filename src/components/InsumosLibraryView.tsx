import React, { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Copy,
  Edit2,
  Trash2,
  RefreshCw,
  History,
  Building2,
  X,
} from 'lucide-react';
import {
  createSupplier,
  deleteInsumo,
  deleteSupplier,
  duplicateInsumo,
  getInsumoPriceHistory,
  registerInsumoPurchase,
} from '../lib/firestoreService';
import {
  computeAcquisitionCost,
  computeUnitCost,
  formatBRL,
  formatBRLPrecise,
} from '../lib/perfumeryEngine';
import {
  Insumo,
  InsumoMainCategory,
  InsumoPriceHistory,
  Supplier,
  UnitType,
} from '../types/perfumery';
import { CurrencyInput } from './CurrencyInput';
import { InsumoFormModal } from './InsumoFormModal';

interface InsumosLibraryViewProps {
  uid: string;
  insumos: Insumo[];
  suppliers: Supplier[];
}

export const InsumosLibraryView: React.FC<InsumosLibraryViewProps> = ({
  uid,
  insumos,
  suppliers,
}) => {
  const [activeTab, setActiveTab] = useState<'insumos' | 'fornecedores'>('insumos');
  const [categoryFilter, setCategoryFilter] = useState<'Todos' | InsumoMainCategory>('Todos');
  const [search, setSearch] = useState('');

  // Insumo create/edit modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingInsumo, setEditingInsumo] = useState<Insumo | null>(null);

  // New purchase modal
  const [purchaseTarget, setPurchaseTarget] = useState<Insumo | null>(null);
  const [newQty, setNewQty] = useState('');
  const [newUnit, setNewUnit] = useState<UnitType>('ml');
  const [newPrice, setNewPrice] = useState('');
  const [newFreight, setNewFreight] = useState('0');
  const [newSupplier, setNewSupplier] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [addToStock, setAddToStock] = useState(true);
  const [newNotes, setNewNotes] = useState('');
  const [purchaseSaving, setPurchaseSaving] = useState(false);

  // Price history modal
  const [historyTarget, setHistoryTarget] = useState<Insumo | null>(null);
  const [historyRows, setHistoryRows] = useState<InsumoPriceHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Supplier form
  const [supName, setSupName] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supWebsite, setSupWebsite] = useState('');
  const [supNotes, setSupNotes] = useState('');
  const [supSaving, setSupSaving] = useState(false);

  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return insumos.filter((item) => {
      if (categoryFilter !== 'Todos' && item.category !== categoryFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.subcategory.toLowerCase().includes(q) ||
          item.supplierName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [insumos, categoryFilter, search]);

  const handleOpenNewPurchase = (item: Insumo) => {
    setPurchaseTarget(item);
    setNewQty(String(item.purchasedQty));
    setNewUnit(item.purchaseUnit);
    setNewPrice(String(item.purchasePrice));
    setNewFreight(String(item.freight));
    setNewSupplier(item.supplierName || '');
    setNewDate(new Date().toISOString().slice(0, 10));
    setAddToStock(true);
    setNewNotes('');
  };

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseTarget) return;
    setPurchaseSaving(true);
    try {
      await registerInsumoPurchase(uid, purchaseTarget, {
        supplierName: newSupplier,
        purchasedQty: Number(newQty),
        purchaseUnit: newUnit,
        purchasePrice: Number(newPrice),
        freight: Number(newFreight) || 0,
        purchaseDate: newDate,
        addToStock,
        notes: newNotes,
      });
      setPurchaseTarget(null);
      setFeedback(
        'Nova compra registrada. Preço de referência atualizado e cálculos antigos preservados.'
      );
    } catch (err: any) {
      setFeedback(err.message || 'Erro ao registrar nova compra.');
    } finally {
      setPurchaseSaving(false);
    }
  };

  const handleViewHistory = async (item: Insumo) => {
    setHistoryTarget(item);
    setHistoryLoading(true);
    try {
      const rows = await getInsumoPriceHistory(uid, item.id);
      setHistoryRows(rows);
    } catch {
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDuplicate = async (item: Insumo) => {
    await duplicateInsumo(uid, item);
  };

  const handleDelete = async (item: Insumo) => {
    await deleteInsumo(uid, item.id);
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supName.trim()) return;
    setSupSaving(true);
    try {
      await createSupplier(uid, {
        name: supName.trim(),
        contact: supContact.trim(),
        website: supWebsite.trim(),
        notes: supNotes.trim(),
      });
      setSupName('');
      setSupContact('');
      setSupWebsite('');
      setSupNotes('');
    } finally {
      setSupSaving(false);
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    await deleteSupplier(uid, id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.15em] uppercase text-[#6E5A49]">
            Catálogo Central
          </p>
          <h1 className="font-serif text-3xl font-semibold text-[#171412] mt-1">
            Biblioteca de Insumos
          </h1>
          <p className="text-sm text-[#6E5A49] mt-1">
            Cadastre cada material uma única vez e reutilize em qualquer fórmula ou base.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 bg-[#F2ECE1] rounded-lg border border-[#E4D8C5]">
            <button
              type="button"
              onClick={() => setActiveTab('insumos')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'insumos'
                  ? 'bg-white text-[#171412] shadow-xs'
                  : 'text-[#6E5A49] hover:text-[#171412]'
              }`}
            >
              Insumos ({insumos.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('fornecedores')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'fornecedores'
                  ? 'bg-white text-[#171412] shadow-xs'
                  : 'text-[#6E5A49] hover:text-[#171412]'
              }`}
            >
              Fornecedores ({suppliers.length})
            </button>
          </div>

          {activeTab === 'insumos' && (
            <button
              type="button"
              onClick={() => {
                setEditingInsumo(null);
                setFormOpen(true);
              }}
              className="px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium hover:bg-[#3B2B20] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>+ Novo insumo</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-lg border border-[#B08D57]/40 bg-[#F2ECE1] text-xs text-[#3B2B20] flex items-center justify-between gap-4">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[#5C4332] hover:text-[#171412] cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {activeTab === 'insumos' ? (
        <>
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-[#F2ECE1] rounded-lg border border-[#E4D8C5] self-start">
              {(['Todos', 'Matéria-prima', 'Embalagem'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    categoryFilter === cat
                      ? 'bg-white text-[#171412] shadow-xs'
                      : 'text-[#6E5A49] hover:text-[#171412]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-[#8C7A68] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, categoria ou fornecedor..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm focus:outline-none focus:border-[#B08D57]"
              />
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-[#E4D8C5] bg-white overflow-hidden">
            {filtered.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm text-[#5C4332]">
                  {insumos.length === 0
                    ? 'Sua biblioteca ainda não possui insumos cadastrados.'
                    : 'Nenhum insumo encontrado com os filtros aplicados.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingInsumo(null);
                    setFormOpen(true);
                  }}
                  className="mt-4 px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium hover:bg-[#3B2B20] cursor-pointer"
                >
                  + Cadastrar primeiro insumo
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E4D8C5] bg-[#FAF7F2] text-[11px] font-medium text-[#6E5A49]">
                      <th className="py-3 px-5">Insumo</th>
                      <th className="py-3 px-4">Categoria</th>
                      <th className="py-3 px-4 text-right">Compra</th>
                      <th className="py-3 px-4 text-right">Aquisição (c/ frete)</th>
                      <th className="py-3 px-4 text-right">Custo Unitário</th>
                      <th className="py-3 px-4">Última atualização</th>
                      <th className="py-3 px-5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2ECE1] text-sm">
                    {filtered.map((item) => (
                      <tr key={item.id} className="hover:bg-[#FAF7F2]/60 transition-colors">
                        <td className="py-3.5 px-5">
                          <div className="font-medium text-[#171412]">{item.name}</div>
                          <div className="text-xs text-[#6E5A49] flex flex-wrap items-center gap-x-2">
                            {item.supplierName && <span>{item.supplierName}</span>}
                            {item.density && (
                              <>
                                {item.supplierName && <span aria-hidden="true">·</span>}
                                <span className="font-mono">d={item.density} g/ml</span>
                              </>
                            )}
                            {item.concentration && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono">Conc. {item.concentration}%</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-[#5C4332]">
                          <div>{item.subcategory}</div>
                          <div className="text-[#8C7A68]">{item.category}</div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums">
                          {item.purchasedQty} {item.purchaseUnit}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums">
                          <div>{formatBRL(item.totalCost)}</div>
                          {item.freight > 0 && (
                            <div className="text-[11px] text-[#8C7A68]">
                              frete {formatBRL(item.freight)}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold text-[#171412] tabular-nums">
                          {formatBRLPrecise(item.unitCost)} / {item.purchaseUnit}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-[#6E5A49] font-mono">
                          {new Date(item.priceUpdatedAt).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="py-3.5 px-5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenNewPurchase(item)}
                              title="Registrar nova compra / atualizar preço"
                              className="px-2.5 py-1.5 rounded-md bg-[#F2ECE1] hover:bg-[#E4D8C5] text-[#3B2B20] text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Nova compra</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleViewHistory(item)}
                              title="Histórico de preços"
                              className="p-1.5 rounded-md text-[#6E5A49] hover:bg-[#F2ECE1] hover:text-[#171412] cursor-pointer"
                            >
                              <History className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingInsumo(item);
                                setFormOpen(true);
                              }}
                              title="Editar insumo"
                              className="p-1.5 rounded-md text-[#6E5A49] hover:bg-[#F2ECE1] hover:text-[#171412] cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDuplicate(item)}
                              title="Duplicar insumo"
                              className="p-1.5 rounded-md text-[#6E5A49] hover:bg-[#F2ECE1] hover:text-[#171412] cursor-pointer"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              title="Excluir insumo"
                              className="p-1.5 rounded-md text-[#8C7A68] hover:bg-[#9E3B33]/10 hover:text-[#9E3B33] cursor-pointer"
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
            )}
          </div>
        </>
      ) : (
        /* Suppliers Management */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateSupplier}
            className="lg:col-span-4 rounded-xl border border-[#E4D8C5] bg-white p-6 space-y-4 self-start"
          >
            <div className="flex items-center gap-2 text-[#171412]">
              <Building2 className="w-4 h-4 text-[#B08D57]" />
              <h2 className="font-serif text-xl font-semibold">Novo fornecedor</h2>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C4332] mb-1">
                Nome *
              </label>
              <input
                type="text"
                required
                value={supName}
                onChange={(e) => setSupName(e.target.value)}
                placeholder="Ex.: Casa das Essências"
                className="w-full px-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#D8CBB8] text-sm focus:outline-none focus:border-[#B08D57]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C4332] mb-1">
                Contato / WhatsApp / E-mail
              </label>
              <input
                type="text"
                value={supContact}
                onChange={(e) => setSupContact(e.target.value)}
                placeholder="(11) 99999-0000"
                className="w-full px-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#D8CBB8] text-sm focus:outline-none focus:border-[#B08D57]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C4332] mb-1">
                Site / Catálogo
              </label>
              <input
                type="text"
                value={supWebsite}
                onChange={(e) => setSupWebsite(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#D8CBB8] text-sm focus:outline-none focus:border-[#B08D57]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C4332] mb-1">
                Observações / Prazo de entrega
              </label>
              <textarea
                rows={2}
                value={supNotes}
                onChange={(e) => setSupNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#D8CBB8] text-sm focus:outline-none focus:border-[#B08D57]"
              />
            </div>

            <button
              type="submit"
              disabled={supSaving}
              className="w-full py-2.5 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium hover:bg-[#3B2B20] cursor-pointer"
            >
              {supSaving ? 'Salvando...' : 'Cadastrar fornecedor'}
            </button>
          </form>

          <div className="lg:col-span-8 rounded-xl border border-[#E4D8C5] bg-white overflow-hidden">
            {suppliers.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#6E5A49]">
                Nenhum fornecedor cadastrado ainda.
              </div>
            ) : (
              <div className="divide-y divide-[#F2ECE1]">
                {suppliers.map((sup) => (
                  <div
                    key={sup.id}
                    className="p-5 flex items-start justify-between gap-4 hover:bg-[#FAF7F2]/60"
                  >
                    <div>
                      <h3 className="font-medium text-[#171412]">{sup.name}</h3>
                      <div className="text-xs text-[#6E5A49] mt-1 flex flex-wrap gap-x-3">
                        {sup.contact && <span>{sup.contact}</span>}
                        {sup.website && <span>{sup.website}</span>}
                      </div>
                      {sup.notes && (
                        <p className="text-xs text-[#8C7A68] mt-1.5">{sup.notes}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteSupplier(sup.id)}
                      className="p-1.5 rounded-md text-[#8C7A68] hover:text-[#9E3B33] hover:bg-[#9E3B33]/10 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Insumo Add/Edit Modal */}
      <InsumoFormModal
        uid={uid}
        open={formOpen}
        editingInsumo={editingInsumo}
        suppliers={suppliers}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFeedback('Insumo salvo com sucesso na biblioteca.');
        }}
      />

      {/* Register New Purchase Modal */}
      {purchaseTarget && (
        <div className="fixed inset-0 z-50 bg-[#171412]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF7F2] border border-[#E4D8C5] rounded-xl w-full max-w-lg overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-[#F2ECE1] border-b border-[#E4D8C5] flex items-center justify-between">
              <div>
                <h3 className="font-serif text-xl font-semibold text-[#171412]">
                  Registrar nova compra
                </h3>
                <p className="text-xs text-[#6E5A49]">{purchaseTarget.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setPurchaseTarget(null)}
                className="p-1.5 rounded-lg text-[#5C4332] hover:bg-[#E4D8C5]/60 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePurchase} className="p-6 space-y-4">
              <p className="text-xs text-[#5C4332] bg-[#F2ECE1] p-3 rounded-lg border border-[#E4D8C5]">
                Esta operação atualiza o preço de referência do insumo e registra a
                compra no histórico, preservando intactos os custos de cálculos
                anteriores.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#5C4332] mb-1">
                    Quantidade comprada *
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      step="any"
                      min="0.0001"
                      required
                      value={newQty}
                      onChange={(e) => setNewQty(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm font-mono tabular-nums"
                    />
                    <select
                      value={newUnit}
                      onChange={(e) => setNewUnit(e.target.value as UnitType)}
                      className="w-20 px-2 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm font-mono"
                    >
                      <option value="ml">ml</option>
                      <option value="L">L</option>
                      <option value="g">g</option>
                      <option value="kg">kg</option>
                      <option value="un">un</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#5C4332] mb-1">
                    Data da compra *
                  </label>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#5C4332] mb-1">
                    Valor da compra (R$) *
                  </label>
                  <CurrencyInput
                    required
                    value={Number(newPrice) || 0}
                    onChange={(val) => setNewPrice(String(val))}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#5C4332] mb-1">
                    Frete (R$)
                  </label>
                  <CurrencyInput
                    value={Number(newFreight) || 0}
                    onChange={(val) => setNewFreight(String(val))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5C4332] mb-1">
                  Fornecedor
                </label>
                <input
                  type="text"
                  value={newSupplier}
                  onChange={(e) => setNewSupplier(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm"
                />
              </div>

              <div className="p-3 rounded-lg bg-white border border-[#E4D8C5] flex justify-between text-xs">
                <span className="text-[#6E5A49]">
                  Novo custo total:{' '}
                  <strong className="font-mono text-[#171412]">
                    {formatBRL(
                      computeAcquisitionCost(Number(newPrice), Number(newFreight))
                    )}
                  </strong>
                </span>
                <span className="text-[#6E5A49]">
                  Novo unitário:{' '}
                  <strong className="font-mono text-[#171412]">
                    {formatBRLPrecise(
                      computeUnitCost(
                        Number(newQty),
                        Number(newPrice),
                        Number(newFreight)
                      )
                    )}{' '}
                    / {newUnit}
                  </strong>
                </span>
              </div>

              {purchaseTarget.stockEnabled && (
                <label className="flex items-center gap-2 text-xs text-[#171412] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addToStock}
                    onChange={(e) => setAddToStock(e.target.checked)}
                    className="w-4 h-4 accent-[#171412]"
                  />
                  <span>Somar quantidade comprada ao estoque disponível</span>
                </label>
              )}

              <div>
                <label className="block text-xs font-medium text-[#5C4332] mb-1">
                  Observações
                </label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Ex.: Reajuste de tabela do fornecedor"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPurchaseTarget(null)}
                  className="px-4 py-2 rounded-lg border border-[#D8CBB8] text-xs text-[#5C4332] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={purchaseSaving}
                  className="px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium cursor-pointer"
                >
                  {purchaseSaving ? 'Salvando...' : 'Confirmar nova compra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Price History Modal */}
      {historyTarget && (
        <div className="fixed inset-0 z-50 bg-[#171412]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF7F2] border border-[#E4D8C5] rounded-xl w-full max-w-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-[#F2ECE1] border-b border-[#E4D8C5] flex items-center justify-between">
              <div>
                <h3 className="font-serif text-xl font-semibold text-[#171412]">
                  Histórico de preços
                </h3>
                <p className="text-xs text-[#6E5A49]">{historyTarget.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryTarget(null)}
                className="p-1.5 rounded-lg text-[#5C4332] hover:bg-[#E4D8C5]/60 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {historyLoading ? (
                <p className="text-sm text-[#6E5A49]">Carregando histórico...</p>
              ) : historyRows.length === 0 ? (
                <p className="text-sm text-[#6E5A49]">Nenhum registro encontrado.</p>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E4D8C5] text-[#6E5A49]">
                      <th className="py-2 pr-3">Data</th>
                      <th className="py-2 px-3">Fornecedor</th>
                      <th className="py-2 px-3 text-right">Qtd.</th>
                      <th className="py-2 px-3 text-right">Aquisição</th>
                      <th className="py-2 pl-3 text-right">Unitário</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2ECE1]">
                    {historyRows.map((h) => (
                      <tr key={h.id}>
                        <td className="py-2.5 pr-3 font-mono">{h.purchaseDate}</td>
                        <td className="py-2.5 px-3 text-[#5C4332]">
                          <div>{h.supplierName || '—'}</div>
                          {h.notes && (
                            <div className="text-[11px] text-[#8C7A68]">{h.notes}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {h.purchasedQty} {h.purchaseUnit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatBRL(h.totalCost)}
                        </td>
                        <td className="py-2.5 pl-3 text-right font-mono font-semibold tabular-nums">
                          {formatBRLPrecise(h.unitCost)} / {h.purchaseUnit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
