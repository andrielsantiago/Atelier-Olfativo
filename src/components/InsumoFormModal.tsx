import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { createInsumo, updateInsumo } from '../lib/firestoreService';
import {
  computeAcquisitionCost,
  computeUnitCost,
  formatBRL,
  formatBRLPrecise,
} from '../lib/perfumeryEngine';
import {
  Insumo,
  InsumoMainCategory,
  PACKAGING_SUBCATEGORIES,
  RAW_MATERIAL_SUBCATEGORIES,
  Supplier,
  UnitType,
} from '../types/perfumery';
import { CurrencyInput } from './CurrencyInput';

interface InsumoFormModalProps {
  uid: string;
  open: boolean;
  editingInsumo: Insumo | null;
  suppliers: Supplier[];
  defaultCategory?: InsumoMainCategory;
  defaultSubcategory?: string;
  onClose: () => void;
  onSaved: (insumo: Insumo) => void;
}

export const InsumoFormModal: React.FC<InsumoFormModalProps> = ({
  uid,
  open,
  editingInsumo,
  suppliers,
  defaultCategory = 'Matéria-prima',
  defaultSubcategory,
  onClose,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<InsumoMainCategory>(defaultCategory);
  const [subcategory, setSubcategory] = useState<string>(
    defaultSubcategory || RAW_MATERIAL_SUBCATEGORIES[0]
  );
  const [supplierId, setSupplierId] = useState<string>('');
  const [supplierName, setSupplierName] = useState('');
  const [purchasedQty, setPurchasedQty] = useState('100');
  const [purchaseUnit, setPurchaseUnit] = useState<UnitType>('ml');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [freight, setFreight] = useState('0');
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [density, setDensity] = useState('');
  const [concentration, setConcentration] = useState('');
  const [stockEnabled, setStockEnabled] = useState(true);
  const [stockQty, setStockQty] = useState('');
  const [stockMinAlert, setStockMinAlert] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editingInsumo) {
      setName(editingInsumo.name);
      setCategory(editingInsumo.category);
      setSubcategory(editingInsumo.subcategory);
      setSupplierId(editingInsumo.supplierId ? String(editingInsumo.supplierId) : '');
      setSupplierName(editingInsumo.supplierName || '');
      setPurchasedQty(String(editingInsumo.purchasedQty));
      setPurchaseUnit(editingInsumo.purchaseUnit);
      setPurchasePrice(String(editingInsumo.purchasePrice));
      setFreight(String(editingInsumo.freight));
      setPurchaseDate(editingInsumo.purchaseDate);
      setDensity(editingInsumo.density !== null ? String(editingInsumo.density) : '');
      setConcentration(
        editingInsumo.concentration !== null ? String(editingInsumo.concentration) : ''
      );
      setStockEnabled(editingInsumo.stockEnabled);
      setStockQty(String(editingInsumo.stockQty));
      setStockMinAlert(String(editingInsumo.stockMinAlert));
      setNotes(editingInsumo.notes || '');
    } else {
      setName('');
      const cat = defaultCategory;
      setCategory(cat);
      const subList =
        cat === 'Matéria-prima'
          ? RAW_MATERIAL_SUBCATEGORIES
          : PACKAGING_SUBCATEGORIES;
      setSubcategory(defaultSubcategory || subList[0]);
      setSupplierId('');
      setSupplierName('');
      setPurchasedQty(cat === 'Embalagem' ? '10' : '100');
      setPurchaseUnit(cat === 'Embalagem' ? 'un' : 'ml');
      setPurchasePrice('');
      setFreight('0');
      setPurchaseDate(new Date().toISOString().slice(0, 10));
      setDensity('');
      setConcentration('');
      setStockEnabled(true);
      setStockQty('');
      setStockMinAlert('0');
      setNotes('');
    }
    setError(null);
  }, [open, editingInsumo, defaultCategory, defaultSubcategory]);

  if (!open) return null;

  const qtyNum = Number(purchasedQty) || 0;
  const priceNum = Number(purchasePrice) || 0;
  const freightNum = Number(freight) || 0;
  const acqCost = computeAcquisitionCost(priceNum, freightNum);
  const unitCost = computeUnitCost(qtyNum, priceNum, freightNum);

  const subOptions =
    category === 'Matéria-prima'
      ? RAW_MATERIAL_SUBCATEGORIES
      : PACKAGING_SUBCATEGORIES;

  const handleCategoryChange = (nextCat: InsumoMainCategory) => {
    setCategory(nextCat);
    const nextSubs =
      nextCat === 'Matéria-prima'
        ? RAW_MATERIAL_SUBCATEGORIES
        : PACKAGING_SUBCATEGORIES;
    setSubcategory(nextSubs[0]);
    if (nextCat === 'Embalagem') {
      setPurchaseUnit('un');
    } else if (purchaseUnit === 'un') {
      setPurchaseUnit('ml');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Informe o nome do insumo.');
      return;
    }
    if (qtyNum <= 0) {
      setError('Quantidade comprada deve ser maior que zero.');
      return;
    }
    const parsedDensity = density.trim() !== '' ? Number(density) : null;
    const parsedConcentration = concentration.trim() !== '' ? Number(concentration) : null;
    if (parsedDensity !== null && (!Number.isFinite(parsedDensity) || parsedDensity < 0 || parsedDensity > 50)) {
      setError('A densidade deve ser um valor entre 0,001 e 50 g/ml.');
      return;
    }
    if (
      parsedConcentration !== null &&
      (!Number.isFinite(parsedConcentration) || parsedConcentration < 0 || parsedConcentration > 100)
    ) {
      setError('A concentração deve ser um valor entre 0,001% e 100%.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        category,
        subcategory,
        supplierId: supplierId ? supplierId : null,
        supplierName: supplierId
          ? suppliers.find((s) => s.id === supplierId)?.name || supplierName
          : supplierName.trim(),
        purchasedQty: qtyNum,
        purchaseUnit,
        purchasePrice: priceNum,
        freight: freightNum,
        purchaseDate,
        density: parsedDensity && parsedDensity > 0 ? parsedDensity : null,
        concentration:
          parsedConcentration && parsedConcentration > 0 ? parsedConcentration : null,
        stockEnabled,
        stockQty: Math.max(0, stockQty !== '' ? Number(stockQty) || 0 : qtyNum),
        stockUsed: editingInsumo ? editingInsumo.stockUsed : 0,
        stockMinAlert: Math.max(0, Number(stockMinAlert) || 0),
        notes: notes.trim(),
      };

      const saved = editingInsumo
        ? await updateInsumo(uid, editingInsumo, payload)
        : await createInsumo(uid, payload);
      onSaved(saved);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar insumo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#171412]/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#FAF7F2] border border-[#E4D8C5] rounded-xl w-full max-w-2xl my-8 overflow-hidden shadow-xl">
        <div className="px-6 py-4 bg-[#F2ECE1] border-b border-[#E4D8C5] flex items-center justify-between">
          <h3 className="font-serif text-2xl font-semibold text-[#171412]">
            {editingInsumo ? 'Editar insumo' : 'Novo insumo na biblioteca'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#5C4332] hover:bg-[#E4D8C5]/60 cursor-pointer"
            aria-label="Fechar janela"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-lg border border-[#9E3B33]/30 bg-[#9E3B33]/5 text-xs text-[#7A2720]">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#5C4332] mb-1">
                Nome do insumo *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Ambroxan 10% em DPG, Frasco Vidro 100ml, Essência Bergamota"
                className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm focus:outline-none focus:border-[#B08D57]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C4332] mb-1">
                Categoria principal *
              </label>
              <select
                value={category}
                onChange={(e) =>
                  handleCategoryChange(e.target.value as InsumoMainCategory)
                }
                className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm focus:outline-none focus:border-[#B08D57]"
              >
                <option value="Matéria-prima">Matéria-prima</option>
                <option value="Embalagem">Embalagem</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C4332] mb-1">
                Subcategoria *
              </label>
              <select
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm focus:outline-none focus:border-[#B08D57]"
              >
                {subOptions.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C4332] mb-1">
                Fornecedor (opcional)
              </label>
              {suppliers.length > 0 ? (
                <select
                  value={supplierId}
                  onChange={(e) => {
                    setSupplierId(e.target.value);
                    const found = suppliers.find((s) => s.id === e.target.value);
                    if (found) setSupplierName(found.name);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm focus:outline-none focus:border-[#B08D57]"
                >
                  <option value="">Selecionar ou digitar abaixo...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Nome do fornecedor"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm focus:outline-none focus:border-[#B08D57]"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C4332] mb-1">
                Data da compra *
              </label>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm font-mono focus:outline-none focus:border-[#B08D57]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C4332] mb-1">
                Quantidade comprada *
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  required
                  value={purchasedQty}
                  onChange={(e) => setPurchasedQty(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm font-mono tabular-nums focus:outline-none focus:border-[#B08D57]"
                />
                <select
                  value={purchaseUnit}
                  onChange={(e) => setPurchaseUnit(e.target.value as UnitType)}
                  className="w-24 px-2.5 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm font-mono focus:outline-none focus:border-[#B08D57]"
                >
                  <option value="ml">ml</option>
                  <option value="L">L</option>
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                  <option value="un">un</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-[#5C4332] mb-1">
                  Valor compra (R$) *
                </label>
                <CurrencyInput
                  required
                  value={Number(purchasePrice) || 0}
                  onChange={(val) => setPurchasePrice(String(val))}
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5C4332] mb-1">
                  Frete (R$)
                </label>
                <CurrencyInput
                  value={Number(freight) || 0}
                  onChange={(val) => setFreight(String(val))}
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>

          {/* Live Calculated Cost Box */}
          <div className="rounded-lg bg-[#F2ECE1] border border-[#E4D8C5] p-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] text-[#6E5A49]">
                Custo total de aquisição (compra + frete)
              </p>
              <p className="font-mono text-lg font-semibold text-[#171412] tabular-nums mt-0.5">
                {formatBRL(acqCost)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#6E5A49]">
                Custo unitário automático (por {purchaseUnit})
              </p>
              <p className="font-mono text-lg font-semibold text-[#5C4332] tabular-nums mt-0.5">
                {formatBRLPrecise(unitCost)} / {purchaseUnit}
              </p>
            </div>
          </div>

          {/* Density & Concentration */}
          {category === 'Matéria-prima' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#5C4332] mb-1">
                  Densidade em g/ml (opcional)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0.01"
                  value={density}
                  onChange={(e) => setDensity(e.target.value)}
                  placeholder="Ex.: 0.81 para Álcool, 0.95 para Essência"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm font-mono tabular-nums focus:outline-none focus:border-[#B08D57]"
                />
                <p className="text-[11px] text-[#8C7A68] mt-1">
                  Necessária para converter entre massa (g/kg) e volume (ml/L).
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5C4332] mb-1">
                  Concentração / Diluição % (opcional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="100"
                  value={concentration}
                  onChange={(e) => setConcentration(e.target.value)}
                  placeholder="Ex.: 10 para Ambroxan 10%, 100 para puro"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm font-mono tabular-nums focus:outline-none focus:border-[#B08D57]"
                />
                <p className="text-[11px] text-[#8C7A68] mt-1">
                  Diferencia soluções diluídas (ex.: 10%) de ativos puros (100%).
                </p>
              </div>
            </div>
          )}

          {/* Optional Stock */}
          <div className="rounded-lg border border-[#E4D8C5] bg-white p-4 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={stockEnabled}
                onChange={(e) => setStockEnabled(e.target.checked)}
                className="w-4 h-4 accent-[#171412]"
              />
              <span className="text-xs font-medium text-[#171412]">
                Controlar estoque deste insumo
              </span>
            </label>

            {stockEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs text-[#6E5A49] mb-1">
                    Quantidade comprada acumulada ({purchaseUnit})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={stockQty === '' ? purchasedQty : stockQty}
                    onChange={(e) => setStockQty(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#FAF7F2] border border-[#D8CBB8] text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#6E5A49] mb-1">
                    Aviso de estoque baixo ({purchaseUnit})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={stockMinAlert}
                    onChange={(e) => setStockMinAlert(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#FAF7F2] border border-[#D8CBB8] text-sm font-mono tabular-nums"
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#5C4332] mb-1">
              Observações
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Lote, validade, notas olfativas ou características..."
              className="w-full px-3 py-2 rounded-lg bg-white border border-[#D8CBB8] text-sm focus:outline-none focus:border-[#B08D57]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#E4D8C5]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[#D8CBB8] text-sm text-[#5C4332] hover:bg-[#F2ECE1] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-sm font-medium hover:bg-[#3B2B20] disabled:opacity-60 cursor-pointer"
            >
              {saving
                ? 'Salvando...'
                : editingInsumo
                  ? 'Salvar alterações'
                  : 'Cadastrar insumo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
