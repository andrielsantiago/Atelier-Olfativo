import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { LogOut, Menu, X } from 'lucide-react';
import { AuthView } from './components/AuthView';
import { BasesView } from './components/BasesView';
import { AppSection, DashboardData, DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FormulasView } from './components/FormulasView';
import { HistoryView } from './components/HistoryView';
import { InsumosLibraryView } from './components/InsumosLibraryView';
import { PerfumeCalculatorView } from './components/PerfumeCalculatorView';
import { ReportsView } from './components/ReportsView';
import { StockView } from './components/StockView';
import { createEmptyFormulaDraft } from './lib/defaultDraft';
import { auth } from './lib/firebase';
import {
  AppUserProfile,
  ensureUserProfile,
  subscribeUserCollections,
  updateStockModuleSetting,
} from './lib/firestoreService';
import {
  Insumo,
  PerfumeFormulaDraft,
  SavedCalculationRecord,
  SavedCustomBase,
  SavedFormulaRecord,
  StockMovement,
  Supplier,
} from './types/perfumery';

function AppShell() {
  const [user, setUser] = useState<AppUserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [section, setSection] = useState<AppSection>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [savedBases, setSavedBases] = useState<SavedCustomBase[]>([]);
  const [formulas, setFormulas] = useState<SavedFormulaRecord[]>([]);
  const [calculations, setCalculations] = useState<SavedCalculationRecord[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [calculatorDraft, setCalculatorDraft] = useState<PerfumeFormulaDraft>(() =>
    createEmptyFormulaDraft([])
  );

  // Restore user's in-progress calculator draft from localStorage on login
  useEffect(() => {
    if (!user?.uid) return;
    try {
      const raw = localStorage.getItem(`atelier_active_draft_${user.uid}`);
      if (raw) {
        const parsed = JSON.parse(raw) as PerfumeFormulaDraft;
        if (parsed && parsed.rawMaterials && parsed.base && parsed.bottle) {
          setCalculatorDraft(parsed);
        }
      }
    } catch {
      // Ignore invalid localStorage payload
    }
  }, [user?.uid]);

  // Persist active draft locally as user edits
  useEffect(() => {
    if (!user?.uid) return;
    try {
      localStorage.setItem(
        `atelier_active_draft_${user.uid}`,
        JSON.stringify(calculatorDraft)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [user?.uid, calculatorDraft]);

  useEffect(() => {
    let unsubCollections: (() => void) | null = null;
    let active = true;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (unsubCollections) {
        unsubCollections();
        unsubCollections = null;
      }

      if (!fbUser) {
        if (!active) return;
        setUser(null);
        setInsumos([]);
        setSuppliers([]);
        setMovements([]);
        setSavedBases([]);
        setFormulas([]);
        setCalculations([]);
        setLoadingData(false);
        setAuthReady(true);
        return;
      }

      setLoadingData(true);
      setSyncError(null);
      try {
        const profile = await ensureUserProfile(fbUser);
        if (!active) return;
        setUser(profile);
        setAuthReady(true);

        unsubCollections = subscribeUserCollections(fbUser.uid, {
          onSuppliers: setSuppliers,
          onInsumos: (items) => {
            setInsumos(items);
            setLoadingData(false);
          },
          onMovements: setMovements,
          onBases: setSavedBases,
          onFormulas: setFormulas,
          onCalculations: setCalculations,
          onError: (err) => {
            setSyncError(err.message);
            setLoadingData(false);
          },
        });
      } catch (err: any) {
        if (!active) return;
        setSyncError(err?.message || 'Erro ao inicializar sessão no Firebase.');
        setLoadingData(false);
        setAuthReady(true);
      }
    });

    return () => {
      active = false;
      unsubAuth();
      if (unsubCollections) unsubCollections();
    };
  }, []);

  const dashboardData: DashboardData = useMemo(() => {
    const lowStockCount = insumos.filter((i) => {
      if (!i.stockEnabled || i.stockMinAlert <= 0) return false;
      const available = Math.max(0, i.stockQty - i.stockUsed);
      return available <= i.stockMinAlert;
    }).length;

    const last = calculations[0] || null;

    return {
      formulasCount: formulas.length,
      insumosCount: insumos.length,
      basesCount: savedBases.length,
      calculationsCount: calculations.length,
      lowStockCount,
      lastCalculation: last
        ? {
            id: last.id,
            name: last.perfumeName || last.inspiredBy,
            inspiredBy: last.inspiredBy,
            sizeMl: last.sizeMl,
            unitCost: last.unitCost,
            createdAt: last.createdAt,
          }
        : null,
      recentCalculations: calculations.slice(0, 6),
    };
  }, [insumos, formulas, savedBases, calculations]);

  const handleStartNewCalculation = () => {
    setCalculatorDraft(createEmptyFormulaDraft(insumos));
    setSection('calculator');
    setMobileMenuOpen(false);
  };

  const handleOpenDraftInCalculator = (draft: PerfumeFormulaDraft) => {
    setCalculatorDraft(draft);
    setSection('calculator');
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    await signOut(auth);
    setSection('dashboard');
  };

  const handleToggleStockModule = async (enabled: boolean) => {
    if (!user) return;
    await updateStockModuleSetting(user.uid, enabled);
    setUser((prev) => (prev ? { ...prev, stockModuleEnabled: enabled } : null));
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] text-[#171412] flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <p className="font-serif text-2xl font-semibold">Atelier Olfativo</p>
          <p className="text-xs text-[#6E5A49]">Verificando sessão...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  const primaryNav: Array<{ id: AppSection; label: string }> = [
    { id: 'dashboard', label: 'Painel' },
    { id: 'insumos', label: 'Insumos' },
    { id: 'formulas', label: 'Fórmulas' },
    { id: 'bases', label: 'Bases' },
    { id: 'history', label: 'Histórico' },
  ];

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#171412] flex flex-col">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[#FAF7F2]/95 backdrop-blur-sm border-b border-[#E4D8C5] no-print">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Title */}
          <button
            type="button"
            onClick={() => setSection('dashboard')}
            className="font-serif text-2xl font-semibold tracking-tight text-[#171412] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Atelier Olfativo
          </button>

          {/* Zone 2: 5 concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {primaryNav.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                  section === item.id
                    ? 'text-[#171412] border-[#B08D57]'
                    : 'text-[#6E5A49] border-transparent hover:text-[#171412]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 Primary CTA */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleStartNewCalculation}
              className="hidden sm:inline-flex px-4 py-2 rounded-lg bg-[#171412] text-[#FAF7F2] text-xs font-medium hover:bg-[#3B2B20] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Novo cálculo
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden p-2 rounded-lg border border-[#D8CBB8] text-[#171412] cursor-pointer"
              aria-label="Abrir menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#E4D8C5] bg-[#FAF7F2] px-4 py-4 space-y-2">
            {[
              ...primaryNav,
              { id: 'stock' as AppSection, label: 'Estoque' },
              { id: 'reports' as AppSection, label: 'Relatórios' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSection(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium ${
                  section === item.id
                    ? 'bg-[#171412] text-[#FAF7F2]'
                    : 'text-[#5C4332] hover:bg-[#F2ECE1]'
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={handleStartNewCalculation}
              className="block w-full text-center px-3 py-2.5 rounded-lg bg-[#B08D57] text-white text-sm font-medium"
            >
              Novo cálculo
            </button>
          </div>
        )}
      </header>

      {/* Secondary Workspace Bar (below header) */}
      <div className="border-b border-[#E4D8C5]/70 bg-[#F2ECE1]/60 no-print">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 text-[#5C4332]">
            <button
              type="button"
              onClick={() => setSection('stock')}
              className={`hover:text-[#171412] cursor-pointer whitespace-nowrap ${
                section === 'stock' ? 'font-semibold text-[#171412] underline underline-offset-4' : ''
              }`}
            >
              Controle de Estoque
            </button>
            <span aria-hidden="true" className="text-[#C7B8A1]">·</span>
            <button
              type="button"
              onClick={() => setSection('reports')}
              className={`hover:text-[#171412] cursor-pointer whitespace-nowrap ${
                section === 'reports' ? 'font-semibold text-[#171412] underline underline-offset-4' : ''
              }`}
            >
              Relatórios PDF
            </button>
          </div>

          <div className="flex items-center gap-3 text-[#6E5A49]">
            <span className="truncate max-w-[200px]">{user.name}</span>
            <span aria-hidden="true" className="text-[#C7B8A1]">·</span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1 hover:text-[#171412] cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-[1240px] w-full mx-auto px-4 sm:px-6 py-8">
        {syncError && (
          <div className="mb-6 p-4 rounded-xl border border-[#9E3B33]/30 bg-[#9E3B33]/5 text-xs text-[#7A2720]">
            Erro de sincronização com o banco de dados: {syncError}
          </div>
        )}

        {section === 'dashboard' && (
          <DashboardView
            data={dashboardData}
            loading={loadingData}
            stockModuleEnabled={user.stockModuleEnabled}
            onNavigate={(s) => setSection(s)}
            onNewCalculation={handleStartNewCalculation}
          />
        )}

        {section === 'calculator' && (
          <PerfumeCalculatorView
            uid={user.uid}
            draft={calculatorDraft}
            onChangeDraft={setCalculatorDraft}
            insumos={insumos}
            suppliers={suppliers}
            savedBases={savedBases}
            stockModuleEnabled={user.stockModuleEnabled}
            onCalculationSaved={() => {
              // Keep user in step 7 to inspect or download PDF
            }}
          />
        )}

        {section === 'formulas' && (
          <FormulasView
            uid={user.uid}
            formulas={formulas}
            insumos={insumos}
            onOpenInCalculator={handleOpenDraftInCalculator}
            onNewFormula={handleStartNewCalculation}
          />
        )}

        {section === 'insumos' && (
          <InsumosLibraryView
            uid={user.uid}
            insumos={insumos}
            suppliers={suppliers}
          />
        )}

        {section === 'bases' && (
          <BasesView
            uid={user.uid}
            savedBases={savedBases}
            insumos={insumos}
            onUseBaseInCalculator={handleOpenDraftInCalculator}
          />
        )}

        {section === 'history' && (
          <HistoryView
            uid={user.uid}
            calculations={calculations}
            insumos={insumos}
            onOpenSnapshotInCalculator={handleOpenDraftInCalculator}
          />
        )}

        {section === 'stock' && (
          <StockView
            uid={user.uid}
            insumos={insumos}
            movements={movements}
            stockModuleEnabled={user.stockModuleEnabled}
            onToggleStockModule={handleToggleStockModule}
          />
        )}

        {section === 'reports' && <ReportsView calculations={calculations} />}
      </main>

      <footer className="border-t border-[#E4D8C5] py-5 text-center text-xs text-[#8C7A68] no-print">
        Atelier Olfativo — Precificação e Gestão de Perfumaria Artesanal
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
