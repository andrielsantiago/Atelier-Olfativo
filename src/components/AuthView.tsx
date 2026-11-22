import React, { useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import atelierFlaconImg from '../assets/images/atelier_flacon_showcase_1795373579845.jpg';

export const AuthView: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setError('A janela de autenticação foi fechada antes da conclusão.');
      } else if (code === 'auth/popup-blocked') {
        setError(
          'O navegador bloqueou o pop-up de login. Permita pop-ups para este site e tente novamente.'
        );
      } else if (code === 'auth/unauthorized-domain') {
        setError(
          `Este domínio (${window.location.hostname}) ainda não está autorizado no Firebase Authentication. Adicione "${window.location.hostname}" em Authentication → Settings → Authorized domains no Console do Firebase.`
        );
      } else {
        setError(err?.message || 'Não foi possível autenticar com o Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#171412] flex flex-col lg:flex-row">
      {/* Editorial Imagery Column */}
      <div className="lg:w-1/2 bg-[#F2ECE1] border-b lg:border-b-0 lg:border-r border-[#E4D8C5] relative flex flex-col justify-between p-8 lg:p-14">
        <div>
          <p className="text-xs tracking-[0.18em] uppercase text-[#6E5A49] font-medium">
            Atelier Olfativo
          </p>
          <h1 className="font-serif text-4xl lg:text-5xl font-semibold text-[#171412] mt-4 leading-[1.12] max-w-lg">
            Gestão de Perfumaria Artesanal
          </h1>
          <p className="text-sm lg:text-base text-[#5C4332] mt-4 max-w-md leading-relaxed">
            Plataforma de precisão matemática para perfumistas independentes:
            controle insumos, desenvolva bases e fórmulas exclusivas e apure o
            custo real de cada mililitro produzido.
          </p>
        </div>

        <div className="my-8 lg:my-10 overflow-hidden rounded-xl border border-[#E4D8C5] bg-[#FAF7F2] aspect-[4/3] max-h-[380px] w-full">
          {!imgError ? (
            <img
              src={atelierFlaconImg}
              alt="Frasco minimalista de alta perfumaria sobre pedra travertino"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#F2ECE1] to-[#E4D8C5] p-8 text-center">
              <div>
                <p className="font-serif text-2xl text-[#3B2B20]">Atelier Olfativo</p>
                <p className="text-xs text-[#6E5A49] mt-1">Alta Perfumaria Artesanal</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6E5A49]">
          <span>Cálculo proporcional</span>
          <span aria-hidden="true">·</span>
          <span>Bases predefinidas e personalizadas</span>
          <span aria-hidden="true">·</span>
          <span>Sincronização em nuvem (Firebase)</span>
        </div>
      </div>

      {/* Authentication Column */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-10 lg:p-16">
        <div className="w-full max-w-md space-y-6">
          <div>
            <p className="text-xs tracking-[0.16em] uppercase text-[#6E5A49] font-medium">
              Acesso Seguro
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[#171412] mt-2">
              Acesse sua bancada
            </h2>
            <p className="text-sm text-[#6E5A49] mt-2 leading-relaxed">
              Entre com sua conta Google para manter seus insumos, fórmulas,
              bases personalizadas e histórico de custos sincronizados em nuvem
              com privacidade individual.
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-lg border border-[#9E3B33]/30 bg-[#9E3B33]/5 text-sm text-[#7A2720]">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3.5 px-5 rounded-lg bg-[#171412] text-[#FAF7F2] text-sm font-medium hover:bg-[#3B2B20] transition-colors flex items-center justify-center gap-3 disabled:opacity-60 cursor-pointer"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.9-5.4 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.5 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"
              />
            </svg>
            <span>
              {loading ? 'Conectando...' : 'Entrar com Google'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="p-4 rounded-xl border border-[#E4D8C5] bg-[#F2ECE1]/60 flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-[#5C4332] shrink-0 mt-0.5" />
            <p className="text-xs text-[#5C4332] leading-relaxed">
              Cada perfumista possui um espaço isolado no Cloud Firestore
              protegido por regras de acesso por usuário autenticado.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
