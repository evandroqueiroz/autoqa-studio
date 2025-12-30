import React from 'react';
import { Loader2, Monitor, Globe, ChevronLeft, ChevronRight, RefreshCw, Lock, ShieldCheck } from 'lucide-react';

interface BrowserSimulatorProps {
  url: string;
  isRunning: boolean;
  currentStepIndex: number;
  logs: string[];
}

export const BrowserSimulator: React.FC<BrowserSimulatorProps> = ({ url, isRunning, currentStepIndex, logs }) => {
  const lastLog = logs[logs.length - 1] || "";

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-700/50">
      {/* Browser Chrome (UI) */}
      <div className="flex items-center gap-4 p-3 bg-slate-800 border-b border-slate-700">
        <div className="flex gap-2 shrink-0">
          <div className="w-3 h-3 rounded-full bg-rose-500 shadow-sm shadow-rose-900/50"></div>
          <div className="w-3 h-3 rounded-full bg-amber-500 shadow-sm shadow-amber-900/50"></div>
          <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-900/50"></div>
        </div>
        <div className="flex gap-4 text-slate-500 shrink-0">
            <ChevronLeft size={18} />
            <ChevronRight size={18} />
            <RefreshCw size={16} />
        </div>
        <div className="flex-1 bg-slate-950 rounded-lg px-4 py-1.5 text-xs font-mono text-slate-300 flex items-center gap-3 border border-slate-800 group">
          <Lock size={12} className="text-emerald-500" />
          <span className="truncate opacity-80">{url || 'about:blank'}</span>
        </div>
      </div>

      {/* Viewport Area */}
      <div className="flex-1 relative bg-slate-50 flex flex-col overflow-hidden">
        {!isRunning ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6 border-4 border-white shadow-sm">
                    <Monitor size={40} className="text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">WebDriver pronto para conexão</h3>
                <p className="text-sm text-slate-500 max-w-xs mx-auto">Configure seus passos à esquerda e clique em "Rodar Teste" para ver a mágica acontecer.</p>
            </div>
        ) : (
            <div className="flex-1 flex flex-col p-8">
                {/* Mock Application Frame */}
                <div className="flex-1 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-500">
                    <div className="h-10 bg-slate-50 border-b border-slate-100 flex items-center px-4 gap-2">
                        <ShieldCheck size={14} className="text-blue-500" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Sandbox de Teste Segura</span>
                    </div>
                    
                    <div className="flex-1 p-8 flex flex-col items-center justify-center space-y-8">
                        <div className="text-center space-y-2">
                            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Portal Corporativo</h2>
                            <p className="text-xs text-slate-400 font-medium italic">Ambiente de QA: {url}</p>
                        </div>

                        <div className="w-full max-w-xs space-y-4">
                            {/* Visual Reaction to steps */}
                            <div className={`p-4 rounded-xl border-2 transition-all duration-300 ${lastLog.includes('Username') || lastLog.includes('User') ? 'border-blue-500 bg-blue-50 scale-105 shadow-lg' : 'border-slate-100'}`}>
                                <div className="h-2 w-16 bg-slate-200 rounded mb-3"></div>
                                <div className="h-10 bg-slate-50 rounded-lg flex items-center px-3 border border-slate-200">
                                    {lastLog.includes('Typing') && lastLog.includes('User') ? (
                                        <span className="text-blue-600 font-mono text-sm animate-pulse">| {lastLog.split('"')[1]}</span>
                                    ) : (
                                        <div className="w-24 h-2 bg-slate-200 rounded animate-pulse"></div>
                                    )}
                                </div>
                            </div>

                            <div className={`p-4 rounded-xl border-2 transition-all duration-300 ${lastLog.includes('Password') ? 'border-blue-500 bg-blue-50 scale-105 shadow-lg' : 'border-slate-100'}`}>
                                <div className="h-2 w-16 bg-slate-200 rounded mb-3"></div>
                                <div className="h-10 bg-slate-50 rounded-lg flex items-center px-3 border border-slate-200">
                                    {lastLog.includes('Typing') && lastLog.includes('Password') ? (
                                        <span className="text-blue-600 font-mono text-sm animate-pulse">••••••••</span>
                                    ) : (
                                        <div className="w-32 h-2 bg-slate-200 rounded animate-pulse"></div>
                                    )}
                                </div>
                            </div>

                            <div className={`w-full py-3 rounded-xl font-bold text-sm transition-all duration-300 text-center ${lastLog.includes('Clicking') && lastLog.includes('Button') ? 'bg-blue-600 text-white scale-95 shadow-inner' : 'bg-slate-100 text-slate-400'}`}>
                                Entrar no Sistema
                            </div>
                        </div>

                        {lastLog.includes('Welcome') && (
                            <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl border border-emerald-200 animate-bounce flex items-center gap-3">
                                <ShieldCheck size={20} />
                                <span className="font-bold text-sm">Login Validado com Sucesso!</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Floating Driver Status */}
                <div className="absolute bottom-6 right-6 flex items-center gap-3 bg-slate-900/90 text-white px-4 py-2.5 rounded-full backdrop-blur-md border border-white/10 shadow-2xl">
                    <Loader2 size={16} className="text-blue-400 animate-spin" />
                    <span className="text-xs font-bold tracking-widest uppercase">Passo {currentStepIndex + 1} Ativo</span>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};