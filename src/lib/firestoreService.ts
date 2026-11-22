import { User } from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from './firebase';
import {
  calculatePerfumeCost,
  computeAcquisitionCost,
  computeUnitCost,
  convertQuantity,
} from './perfumeryEngine';
import {
  BaseIngredientLine,
  CalculationResult,
  Insumo,
  InsumoMainCategory,
  InsumoPriceHistory,
  PerfumeFormulaDraft,
  PropChoice,
  SavedCalculationRecord,
  SavedCustomBase,
  SavedFormulaRecord,
  StockMovement,
  Supplier,
  UnitType,
} from '../types/perfumery';

export interface AppUserProfile {
  uid: string;
  name: string;
  email: string;
  stockModuleEnabled: boolean;
}

function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

/**
 * Strips `undefined` recursively from objects/arrays because Firestore rejects `undefined`.
 */
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Timestamp)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

function generateDocId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now()}_${rand}`;
}

export async function ensureUserProfile(user: User): Promise<AppUserProfile> {
  const userPath = `users/${user.uid}`;
  const privatePath = `users/${user.uid}/private/info`;

  try {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const displayName = (user.displayName || user.email?.split('@')[0] || 'Perfumista').slice(0, 120);
    const email = (user.email || '').slice(0, 200);

    let stockModuleEnabled = true;

    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        displayName,
        stockModuleEnabled: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const data = snap.data();
      stockModuleEnabled = Boolean(data.stockModuleEnabled);
    }

    const privRef = doc(db, 'users', user.uid, 'private', 'info');
    const privSnap = await getDoc(privRef);
    if (!privSnap.exists()) {
      await setDoc(privRef, {
        uid: user.uid,
        email,
        updatedAt: serverTimestamp(),
      });
    }

    return {
      uid: user.uid,
      name: snap.exists() ? String(snap.data().displayName || displayName) : displayName,
      email,
      stockModuleEnabled,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${userPath} | ${privatePath}`);
  }
}

export async function updateStockModuleSetting(uid: string, enabled: boolean): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      stockModuleEnabled: enabled,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeUserCollections(
  uid: string,
  callbacks: {
    onSuppliers: (items: Supplier[]) => void;
    onInsumos: (items: Insumo[]) => void;
    onMovements: (items: StockMovement[]) => void;
    onBases: (items: SavedCustomBase[]) => void;
    onFormulas: (items: SavedFormulaRecord[]) => void;
    onCalculations: (items: SavedCalculationRecord[]) => void;
    onError?: (err: Error) => void;
  }
): () => void {
  const unsubs: Array<() => void> = [];

  const supPath = `users/${uid}/suppliers`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'suppliers'), where('ownerId', '==', uid)),
      (snap) => {
        const list: Supplier[] = snap.docs
          .map((d) => {
            const r = d.data();
            return {
              id: d.id,
              name: String(r.name || ''),
              contact: String(r.contact || ''),
              website: String(r.website || ''),
              notes: String(r.notes || ''),
              createdAt: toIsoString(r.createdAt),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        callbacks.onSuppliers(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, supPath);
        } catch (wrapped) {
          callbacks.onError?.(wrapped as Error);
        }
      }
    )
  );

  const insPath = `users/${uid}/insumos`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'insumos'), where('ownerId', '==', uid)),
      (snap) => {
        const list: Insumo[] = snap.docs
          .map((d) => {
            const r = d.data();
            return {
              id: d.id,
              supplierId: r.supplierId ? String(r.supplierId) : null,
              supplierName: String(r.supplierName || ''),
              name: String(r.name || ''),
              category: r.category as InsumoMainCategory,
              subcategory: String(r.subcategory || ''),
              purchasedQty: Number(r.purchasedQty),
              purchaseUnit: r.purchaseUnit as UnitType,
              purchasePrice: Number(r.purchasePrice),
              freight: Number(r.freight),
              totalCost: Number(r.totalCost),
              unitCost: Number(r.unitCost),
              purchaseDate: String(r.purchaseDate || ''),
              density: r.density !== null && r.density !== undefined ? Number(r.density) : null,
              concentration:
                r.concentration !== null && r.concentration !== undefined
                  ? Number(r.concentration)
                  : null,
              stockEnabled: Boolean(r.stockEnabled),
              stockQty: Number(r.stockQty || 0),
              stockUsed: Number(r.stockUsed || 0),
              stockMinAlert: Number(r.stockMinAlert || 0),
              notes: String(r.notes || ''),
              priceUpdatedAt: toIsoString(r.priceUpdatedAt),
              createdAt: toIsoString(r.createdAt),
              updatedAt: toIsoString(r.updatedAt),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        callbacks.onInsumos(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, insPath);
        } catch (wrapped) {
          callbacks.onError?.(wrapped as Error);
        }
      }
    )
  );

  const movPath = `users/${uid}/stockMovements`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'stockMovements'), where('ownerId', '==', uid)),
      (snap) => {
        const list: StockMovement[] = snap.docs
          .map((d) => {
            const r = d.data();
            return {
              id: d.id,
              insumoId: String(r.insumoId),
              insumoName: String(r.insumoName || ''),
              type: r.type as StockMovement['type'],
              quantity: Number(r.quantity),
              unit: r.unit as UnitType,
              reason: String(r.reason || ''),
              createdAt: toIsoString(r.createdAt),
            };
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 100);
        callbacks.onMovements(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, movPath);
        } catch (wrapped) {
          callbacks.onError?.(wrapped as Error);
        }
      }
    )
  );

  const basePath = `users/${uid}/customBases`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'customBases'), where('ownerId', '==', uid)),
      (snap) => {
        const list: SavedCustomBase[] = snap.docs
          .map((d) => {
            const r = d.data();
            return {
              id: d.id,
              name: String(r.name || ''),
              baseType: r.baseType as SavedCustomBase['baseType'],
              propChoice: (r.propChoice as PropChoice) || null,
              batchQty: Number(r.batchQty),
              batchUnit: r.batchUnit as 'ml' | 'g',
              purchasePrice: Number(r.purchasePrice || 0),
              freight: Number(r.freight || 0),
              ingredients: (r.ingredients || []) as BaseIngredientLine[],
              notes: String(r.notes || ''),
              createdAt: toIsoString(r.createdAt),
              updatedAt: toIsoString(r.updatedAt),
            };
          })
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        callbacks.onBases(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, basePath);
        } catch (wrapped) {
          callbacks.onError?.(wrapped as Error);
        }
      }
    )
  );

  const formPath = `users/${uid}/formulas`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'formulas'), where('ownerId', '==', uid)),
      (snap) => {
        const list: SavedFormulaRecord[] = snap.docs
          .map((d) => {
            const r = d.data();
            return {
              id: d.id,
              brandName: String(r.brandName || ''),
              perfumeName: String(r.perfumeName || ''),
              inspiredBy: String(r.inspiredBy || ''),
              version: Number(r.version || 1),
              status: r.status as 'rascunho' | 'finalizada',
              targetVolumeMl: Number(r.targetVolumeMl),
              unitCost: Number(r.unitCost || 0),
              data: r.data as PerfumeFormulaDraft,
              createdAt: toIsoString(r.createdAt),
              updatedAt: toIsoString(r.updatedAt),
            };
          })
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        callbacks.onFormulas(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, formPath);
        } catch (wrapped) {
          callbacks.onError?.(wrapped as Error);
        }
      }
    )
  );

  const calcPath = `users/${uid}/calculations`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'calculations'), where('ownerId', '==', uid)),
      (snap) => {
        const list: SavedCalculationRecord[] = snap.docs
          .map((d) => {
            const r = d.data();
            return {
              id: d.id,
              formulaId: r.formulaId ? String(r.formulaId) : null,
              brandName: String(r.brandName || ''),
              perfumeName: String(r.perfumeName || ''),
              inspiredBy: String(r.inspiredBy || ''),
              formulaVersion: Number(r.formulaVersion || 1),
              sizeMl: Number(r.sizeMl),
              liquidCost: Number(r.liquidCost),
              packagingCost: Number(r.packagingCost),
              unitCost: Number(r.unitCost),
              stockDeducted: Boolean(r.stockDeducted),
              result: r.result as CalculationResult,
              draftSnapshot: r.draftSnapshot as PerfumeFormulaDraft,
              createdAt: toIsoString(r.createdAt),
            };
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        callbacks.onCalculations(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, calcPath);
        } catch (wrapped) {
          callbacks.onError?.(wrapped as Error);
        }
      }
    )
  );

  return () => {
    unsubs.forEach((fn) => fn());
  };
}

// --- Suppliers ---
export async function createSupplier(
  uid: string,
  payload: { name: string; contact: string; website: string; notes: string }
): Promise<void> {
  const id = generateDocId('sup');
  const path = `users/${uid}/suppliers/${id}`;
  try {
    await setDoc(doc(db, 'users', uid, 'suppliers', id), {
      ownerId: uid,
      name: payload.name.slice(0, 140),
      contact: payload.contact.slice(0, 140),
      website: payload.website.slice(0, 240),
      notes: payload.notes.slice(0, 800),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteSupplier(uid: string, supplierId: string): Promise<void> {
  const path = `users/${uid}/suppliers/${supplierId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'suppliers', supplierId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Insumos ---
export interface InsumoMutationInput {
  supplierId: string | null;
  supplierName: string;
  name: string;
  category: InsumoMainCategory;
  subcategory: string;
  purchasedQty: number;
  purchaseUnit: UnitType;
  purchasePrice: number;
  freight: number;
  purchaseDate: string;
  density: number | null;
  concentration: number | null;
  stockEnabled: boolean;
  stockQty: number;
  stockUsed: number;
  stockMinAlert: number;
  notes: string;
}

export async function createInsumo(uid: string, d: InsumoMutationInput): Promise<Insumo> {
  const id = generateDocId('ins');
  const path = `users/${uid}/insumos/${id}`;
  const totalCost = computeAcquisitionCost(d.purchasePrice, d.freight);
  const unitCost = computeUnitCost(d.purchasedQty, d.purchasePrice, d.freight);

  try {
    const insRef = doc(db, 'users', uid, 'insumos', id);
    await setDoc(
      insRef,
      stripUndefinedDeep({
        ownerId: uid,
        supplierId: d.supplierId || null,
        supplierName: d.supplierName.slice(0, 140),
        name: d.name.slice(0, 160),
        category: d.category,
        subcategory: d.subcategory.slice(0, 80),
        purchasedQty: d.purchasedQty,
        purchaseUnit: d.purchaseUnit,
        purchasePrice: d.purchasePrice,
        freight: d.freight,
        totalCost,
        unitCost,
        purchaseDate: d.purchaseDate,
        density: d.density,
        concentration: d.concentration,
        stockEnabled: d.stockEnabled,
        stockQty: d.stockQty,
        stockUsed: d.stockUsed,
        stockMinAlert: d.stockMinAlert,
        notes: d.notes.slice(0, 1000),
        priceUpdatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    const histId = generateDocId('hist');
    await setDoc(doc(db, 'users', uid, 'insumos', id, 'priceHistory', histId), {
      ownerId: uid,
      insumoId: id,
      supplierName: d.supplierName.slice(0, 140),
      purchasedQty: d.purchasedQty,
      purchaseUnit: d.purchaseUnit,
      purchasePrice: d.purchasePrice,
      freight: d.freight,
      totalCost,
      unitCost,
      purchaseDate: d.purchaseDate,
      notes: (d.notes || 'Cadastro inicial').slice(0, 500),
      createdAt: serverTimestamp(),
    });

    if (d.stockEnabled && d.stockQty > 0) {
      const movId = generateDocId('mov');
      await setDoc(doc(db, 'users', uid, 'stockMovements', movId), {
        ownerId: uid,
        insumoId: id,
        insumoName: d.name.slice(0, 160),
        type: 'entrada',
        quantity: d.stockQty,
        unit: d.purchaseUnit,
        reason: 'Estoque inicial no cadastro',
        createdAt: serverTimestamp(),
      });
    }

    const nowIso = new Date().toISOString();
    return {
      id,
      ...d,
      totalCost,
      unitCost,
      priceUpdatedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateInsumo(
  uid: string,
  existing: Insumo,
  d: InsumoMutationInput
): Promise<Insumo> {
  const path = `users/${uid}/insumos/${existing.id}`;
  const totalCost = computeAcquisitionCost(d.purchasePrice, d.freight);
  const unitCost = computeUnitCost(d.purchasedQty, d.purchasePrice, d.freight);
  const priceChanged =
    existing.purchasePrice !== d.purchasePrice ||
    existing.freight !== d.freight ||
    existing.purchasedQty !== d.purchasedQty;

  try {
    await updateDoc(
      doc(db, 'users', uid, 'insumos', existing.id),
      stripUndefinedDeep({
        supplierId: d.supplierId || null,
        supplierName: d.supplierName.slice(0, 140),
        name: d.name.slice(0, 160),
        category: d.category,
        subcategory: d.subcategory.slice(0, 80),
        purchasedQty: d.purchasedQty,
        purchaseUnit: d.purchaseUnit,
        purchasePrice: d.purchasePrice,
        freight: d.freight,
        totalCost,
        unitCost,
        purchaseDate: d.purchaseDate,
        density: d.density,
        concentration: d.concentration,
        stockEnabled: d.stockEnabled,
        stockQty: d.stockQty,
        stockUsed: d.stockUsed,
        stockMinAlert: d.stockMinAlert,
        notes: d.notes.slice(0, 1000),
        ...(priceChanged ? { priceUpdatedAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp(),
      })
    );

    if (priceChanged) {
      const histId = generateDocId('hist');
      await setDoc(doc(db, 'users', uid, 'insumos', existing.id, 'priceHistory', histId), {
        ownerId: uid,
        insumoId: existing.id,
        supplierName: d.supplierName.slice(0, 140),
        purchasedQty: d.purchasedQty,
        purchaseUnit: d.purchaseUnit,
        purchasePrice: d.purchasePrice,
        freight: d.freight,
        totalCost,
        unitCost,
        purchaseDate: d.purchaseDate,
        notes: 'Atualização direta no cadastro',
        createdAt: serverTimestamp(),
      });
    }

    const nowIso = new Date().toISOString();
    return {
      ...existing,
      ...d,
      totalCost,
      unitCost,
      priceUpdatedAt: priceChanged ? nowIso : existing.priceUpdatedAt,
      updatedAt: nowIso,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function registerInsumoPurchase(
  uid: string,
  target: Insumo,
  payload: {
    supplierName: string;
    purchasedQty: number;
    purchaseUnit: UnitType;
    purchasePrice: number;
    freight: number;
    purchaseDate: string;
    addToStock: boolean;
    notes: string;
  }
): Promise<void> {
  const path = `users/${uid}/insumos/${target.id}`;
  const totalCost = computeAcquisitionCost(payload.purchasePrice, payload.freight);
  const unitCost = computeUnitCost(payload.purchasedQty, payload.purchasePrice, payload.freight);

  let addedStock = 0;
  if (payload.addToStock && target.stockEnabled) {
    const conv = convertQuantity(
      payload.purchasedQty,
      payload.purchaseUnit,
      target.purchaseUnit,
      target.density,
      target.name
    );
    if (!conv.ok) {
      throw new Error(conv.error);
    }
    addedStock = conv.value;
  }

  try {
    const batch = writeBatch(db);
    const histId = generateDocId('hist');
    batch.set(doc(db, 'users', uid, 'insumos', target.id, 'priceHistory', histId), {
      ownerId: uid,
      insumoId: target.id,
      supplierName: (payload.supplierName || target.supplierName).slice(0, 140),
      purchasedQty: payload.purchasedQty,
      purchaseUnit: payload.purchaseUnit,
      purchasePrice: payload.purchasePrice,
      freight: payload.freight,
      totalCost,
      unitCost,
      purchaseDate: payload.purchaseDate,
      notes: (payload.notes || 'Nova compra registrada').slice(0, 500),
      createdAt: serverTimestamp(),
    });

    batch.update(doc(db, 'users', uid, 'insumos', target.id), {
      supplierName: (payload.supplierName || target.supplierName).slice(0, 140),
      purchasedQty: payload.purchasedQty,
      purchaseUnit: payload.purchaseUnit,
      purchasePrice: payload.purchasePrice,
      freight: payload.freight,
      totalCost,
      unitCost,
      purchaseDate: payload.purchaseDate,
      stockQty: target.stockQty + addedStock,
      priceUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (addedStock > 0) {
      const movId = generateDocId('mov');
      batch.set(doc(db, 'users', uid, 'stockMovements', movId), {
        ownerId: uid,
        insumoId: target.id,
        insumoName: target.name.slice(0, 160),
        type: 'entrada',
        quantity: addedStock,
        unit: target.purchaseUnit,
        reason: (payload.notes || 'Nova compra registrada').slice(0, 300),
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getInsumoPriceHistory(
  uid: string,
  insumoId: string
): Promise<InsumoPriceHistory[]> {
  const path = `users/${uid}/insumos/${insumoId}/priceHistory`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'users', uid, 'insumos', insumoId, 'priceHistory'),
        where('ownerId', '==', uid)
      )
    );
    return snap.docs
      .map((d) => {
        const r = d.data();
        return {
          id: d.id,
          insumoId: String(r.insumoId),
          supplierName: String(r.supplierName || ''),
          purchasedQty: Number(r.purchasedQty),
          purchaseUnit: r.purchaseUnit as UnitType,
          purchasePrice: Number(r.purchasePrice),
          freight: Number(r.freight),
          totalCost: Number(r.totalCost),
          unitCost: Number(r.unitCost),
          purchaseDate: String(r.purchaseDate || ''),
          notes: String(r.notes || ''),
          createdAt: toIsoString(r.createdAt),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function duplicateInsumo(uid: string, orig: Insumo): Promise<void> {
  await createInsumo(uid, {
    supplierId: orig.supplierId,
    supplierName: orig.supplierName,
    name: `${orig.name} (Cópia)`.slice(0, 160),
    category: orig.category,
    subcategory: orig.subcategory,
    purchasedQty: orig.purchasedQty,
    purchaseUnit: orig.purchaseUnit,
    purchasePrice: orig.purchasePrice,
    freight: orig.freight,
    purchaseDate: orig.purchaseDate,
    density: orig.density,
    concentration: orig.concentration,
    stockEnabled: orig.stockEnabled,
    stockQty: 0,
    stockUsed: 0,
    stockMinAlert: orig.stockMinAlert,
    notes: orig.notes,
  });
}

export async function deleteInsumo(uid: string, insumoId: string): Promise<void> {
  const path = `users/${uid}/insumos/${insumoId}`;
  try {
    const histSnap = await getDocs(
      query(
        collection(db, 'users', uid, 'insumos', insumoId, 'priceHistory'),
        where('ownerId', '==', uid)
      )
    );
    const batch = writeBatch(db);
    histSnap.docs.forEach((h) => batch.delete(h.ref));
    batch.delete(doc(db, 'users', uid, 'insumos', insumoId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Stock ---
export async function adjustStock(
  uid: string,
  insumo: Insumo,
  type: 'entrada' | 'saida' | 'ajuste',
  quantity: number,
  reason: string
): Promise<void> {
  const path = `users/${uid}/insumos/${insumo.id}`;
  const nextStockQty =
    type === 'entrada'
      ? insumo.stockQty + quantity
      : type === 'ajuste'
        ? insumo.stockUsed + quantity
        : insumo.stockQty;
  const nextStockUsed = type === 'saida' ? insumo.stockUsed + quantity : insumo.stockUsed;

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', uid, 'insumos', insumo.id), {
      stockQty: nextStockQty,
      stockUsed: nextStockUsed,
      updatedAt: serverTimestamp(),
    });
    const movId = generateDocId('mov');
    batch.set(doc(db, 'users', uid, 'stockMovements', movId), {
      ownerId: uid,
      insumoId: insumo.id,
      insumoName: insumo.name.slice(0, 160),
      type,
      quantity,
      unit: insumo.purchaseUnit,
      reason: reason.slice(0, 300),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- Custom Bases ---
export async function createCustomBase(
  uid: string,
  payload: {
    name: string;
    baseType: 'predefined_override' | 'custom' | 'purchased_ready';
    propChoice: PropChoice | null;
    batchQty: number;
    batchUnit: 'ml' | 'g';
    purchasePrice: number;
    freight: number;
    ingredients: BaseIngredientLine[];
    notes: string;
  }
): Promise<void> {
  const id = generateDocId('base');
  const path = `users/${uid}/customBases/${id}`;
  try {
    await setDoc(
      doc(db, 'users', uid, 'customBases', id),
      stripUndefinedDeep({
        ownerId: uid,
        name: payload.name.slice(0, 140),
        baseType: payload.baseType,
        propChoice: payload.propChoice,
        batchQty: payload.batchQty,
        batchUnit: payload.batchUnit,
        purchasePrice: payload.purchasePrice,
        freight: payload.freight,
        ingredients: payload.ingredients.slice(0, 60),
        notes: payload.notes.slice(0, 800),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteCustomBase(uid: string, baseId: string): Promise<void> {
  const path = `users/${uid}/customBases/${baseId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'customBases', baseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Formulas ---
export async function saveFormulaDraft(
  uid: string,
  draft: PerfumeFormulaDraft,
  unitCost: number,
  status: 'rascunho' | 'finalizada' = 'rascunho'
): Promise<string> {
  const id = draft.id || generateDocId('form');
  const path = `users/${uid}/formulas/${id}`;
  const cleanDraft = stripUndefinedDeep({ ...draft, id });

  const safeVersion = Math.max(1, Math.round(draft.version || 1));

  try {
    if (draft.id) {
      await updateDoc(doc(db, 'users', uid, 'formulas', id), {
        brandName: (draft.brandName || '').slice(0, 140),
        perfumeName: (draft.perfumeName || '').slice(0, 160),
        inspiredBy: draft.inspiredBy.slice(0, 160),
        version: safeVersion,
        status,
        targetVolumeMl: draft.targetVolumeMl,
        unitCost,
        data: cleanDraft,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'users', uid, 'formulas', id), {
        ownerId: uid,
        brandName: (draft.brandName || '').slice(0, 140),
        perfumeName: (draft.perfumeName || '').slice(0, 160),
        inspiredBy: draft.inspiredBy.slice(0, 160),
        version: safeVersion,
        status,
        targetVolumeMl: draft.targetVolumeMl,
        unitCost,
        data: cleanDraft,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function duplicateFormula(
  uid: string,
  orig: SavedFormulaRecord,
  asNewVersion: boolean
): Promise<void> {
  const nextVersion = asNewVersion ? orig.version + 1 : 1;
  const nextName = asNewVersion
    ? orig.perfumeName
    : orig.perfumeName
      ? `${orig.perfumeName} (Cópia)`
      : '';
  const nextDraft: PerfumeFormulaDraft = structuredClone(orig.data);
  nextDraft.version = nextVersion;
  nextDraft.perfumeName = nextName;
  delete nextDraft.id;

  await saveFormulaDraft(uid, nextDraft, orig.unitCost, 'rascunho');
}

export async function deleteFormula(uid: string, formulaId: string): Promise<void> {
  const path = `users/${uid}/formulas/${formulaId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'formulas', formulaId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Calculations & Optional Stock Deduction ---
export async function saveCalculationAndDeductStock(params: {
  uid: string;
  draft: PerfumeFormulaDraft;
  insumos: Insumo[];
  deductStock: boolean;
  batchUnits: number;
}): Promise<SavedCalculationRecord> {
  const { uid, draft, insumos, deductStock, batchUnits } = params;
  const result = calculatePerfumeCost(draft, insumos);
  if (!result.valid) {
    throw new Error(result.errors[0] || 'Fórmula possui erros de validação.');
  }

  const formulaId = await saveFormulaDraft(uid, draft, result.unitCostTotal, 'finalizada');
  const calcId = generateDocId('calc');
  const calcPath = `users/${uid}/calculations/${calcId}`;

  try {
    const batch = writeBatch(db);
    let stockWasDeducted = false;

    if (deductStock) {
      const deductedByInsumo = new Map<string, number>();
      const liquidScale = result.unitLiquidScale ?? 1;
      for (const line of result.lines) {
        if (!line.insumoId || line.effectiveQtyWithLoss <= 0) continue;
        const ins = insumos.find((i) => i.id === line.insumoId);
        if (!ins || !ins.stockEnabled) continue;

        const perUnitEffective =
          line.group === 'Frasco' || line.group === 'Embalagem'
            ? line.effectiveQtyWithLoss
            : line.effectiveQtyWithLoss * liquidScale;

        const conv = convertQuantity(
          perUnitEffective * batchUnits,
          line.usedUnit,
          ins.purchaseUnit,
          ins.density,
          ins.name
        );
        if (!conv.ok || conv.value <= 0) continue;

        deductedByInsumo.set(
          ins.id,
          (deductedByInsumo.get(ins.id) || 0) + conv.value
        );
      }

      deductedByInsumo.forEach((totalUsed, insId) => {
        const ins = insumos.find((i) => i.id === insId);
        if (!ins) return;
        batch.update(doc(db, 'users', uid, 'insumos', ins.id), {
          stockUsed: ins.stockUsed + totalUsed,
          updatedAt: serverTimestamp(),
        });
        const movId = generateDocId('mov');
        batch.set(doc(db, 'users', uid, 'stockMovements', movId), {
          ownerId: uid,
          insumoId: ins.id,
          insumoName: ins.name.slice(0, 160),
          type: 'producao',
          quantity: totalUsed,
          unit: ins.purchaseUnit,
          reason: `Produção (${batchUnits}x): ${draft.perfumeName || draft.inspiredBy}`.slice(0, 300),
          createdAt: serverTimestamp(),
        });
        stockWasDeducted = true;
      });
    }

    const cleanResult = stripUndefinedDeep(result);
    const cleanSnapshot = stripUndefinedDeep({ ...draft, id: formulaId });

    const safeVersion = Math.max(1, Math.round(draft.version || 1));

    batch.set(doc(db, 'users', uid, 'calculations', calcId), {
      ownerId: uid,
      formulaId,
      brandName: (draft.brandName || '').slice(0, 140),
      perfumeName: (draft.perfumeName || '').slice(0, 160),
      inspiredBy: draft.inspiredBy.slice(0, 160),
      formulaVersion: safeVersion,
      sizeMl: draft.targetVolumeMl,
      liquidCost: result.liquidCostTotal,
      packagingCost: result.packagingTotalCost,
      unitCost: result.unitCostTotal,
      stockDeducted: stockWasDeducted,
      result: cleanResult,
      draftSnapshot: cleanSnapshot,
      createdAt: serverTimestamp(),
    });

    await batch.commit();

    return {
      id: calcId,
      formulaId,
      brandName: draft.brandName,
      perfumeName: draft.perfumeName,
      inspiredBy: draft.inspiredBy,
      formulaVersion: safeVersion,
      sizeMl: draft.targetVolumeMl,
      liquidCost: result.liquidCostTotal,
      packagingCost: result.packagingTotalCost,
      unitCost: result.unitCostTotal,
      stockDeducted: stockWasDeducted,
      result,
      draftSnapshot: cleanSnapshot,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, calcPath);
  }
}

export async function deleteCalculation(uid: string, calcId: string): Promise<void> {
  const path = `users/${uid}/calculations/${calcId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'calculations', calcId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function compareCalculationWithCurrent(
  calc: SavedCalculationRecord,
  currentInsumos: Insumo[]
) {
  const insumoMap = new Map(currentInsumos.map((i) => [i.id, i]));
  const refreshedDraft: PerfumeFormulaDraft = structuredClone(calc.draftSnapshot);

  for (const m of refreshedDraft.rawMaterials) {
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
  for (const q of refreshedDraft.qas) {
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
  for (const b of refreshedDraft.base.ingredients) {
    const ins = b.insumoId ? insumoMap.get(b.insumoId) : undefined;
    if (ins) {
      b.purchasedQty = ins.purchasedQty;
      b.purchaseUnit = ins.purchaseUnit;
      b.purchasePrice = ins.purchasePrice;
      b.freight = ins.freight;
      b.density = ins.density;
    }
  }
  if (refreshedDraft.base.purchasedBaseInsumoId) {
    const ins = insumoMap.get(refreshedDraft.base.purchasedBaseInsumoId);
    if (ins) {
      refreshedDraft.base.purchasedQty = ins.purchasedQty;
      refreshedDraft.base.purchaseUnit = ins.purchaseUnit;
      refreshedDraft.base.purchasePrice = ins.purchasePrice;
      refreshedDraft.base.freight = ins.freight;
    }
  }
  if (refreshedDraft.bottle.mode === 'complete' && refreshedDraft.bottle.complete.insumoId) {
    const ins = insumoMap.get(refreshedDraft.bottle.complete.insumoId);
    if (ins) {
      refreshedDraft.bottle.complete.purchasedQty = ins.purchasedQty;
      refreshedDraft.bottle.complete.purchasePrice = ins.purchasePrice;
      refreshedDraft.bottle.complete.freight = ins.freight;
    }
  } else {
    (['vidro', 'valvula', 'sobretampa'] as const).forEach((k) => {
      const part = refreshedDraft.bottle.parts[k];
      const ins = part.insumoId ? insumoMap.get(part.insumoId) : undefined;
      if (ins) {
        part.purchasedQty = ins.purchasedQty;
        part.purchasePrice = ins.purchasePrice;
        part.freight = ins.freight;
      }
    });
  }
  for (const p of refreshedDraft.packaging) {
    const ins = p.insumoId ? insumoMap.get(p.insumoId) : undefined;
    if (ins) {
      p.purchasedQty = ins.purchasedQty;
      p.purchaseUnit = ins.purchaseUnit;
      p.purchasePrice = ins.purchasePrice;
      p.freight = ins.freight;
    }
  }

  const currentResult = calculatePerfumeCost(refreshedDraft, currentInsumos);
  const oldCost = calc.unitCost;
  const newCost = currentResult.unitCostTotal;
  const diff = newCost - oldCost;
  const percentVariation = oldCost > 0 ? (diff / oldCost) * 100 : 0;

  const drivers = currentResult.lines.map((currLine, idx) => {
    const oldLine =
      calc.result.lines.find(
        (ol) => ol.name === currLine.name && ol.group === currLine.group
      ) || calc.result.lines[idx];
    const oldItemCost = oldLine ? Number(oldLine.proportionalCost) : 0;
    const itemDiff = currLine.proportionalCost - oldItemCost;
    return {
      name: currLine.name,
      group: currLine.group,
      oldCost: oldItemCost,
      currentCost: currLine.proportionalCost,
      diff: itemDiff,
      percentChange: oldItemCost > 0 ? (itemDiff / oldItemCost) * 100 : 0,
    };
  });

  return {
    calculationId: calc.id,
    perfumeName: calc.perfumeName || calc.inspiredBy,
    oldUnitCost: oldCost,
    currentUnitCost: newCost,
    diff,
    percentVariation,
    drivers,
    refreshedDraft,
    currentResult,
  };
}
