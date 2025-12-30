
import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';
import { Terminal, XCircle, CheckCircle, Info, Trash2 } from 'lucide-react';

interface LogConsoleProps {
    logs: LogEntry[];
    onClear: () => void;
}

export const LogConsole: React.FC<LogConsoleProps> = ({ logs, onClear }) => {
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-[13px] bg-slate-950 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            {logs.length === 0 && (
                <div className="h-full flex items-center justify-center text-slate-600 italic gap-2 animate-pulse">
                    <Terminal size={16} />
                    Aguardando início do teste...
                </div>
            )}
            <div className="space-y-1">
                {logs.map((log, i) => (
                    <div key={i} className="flex gap-4 hover:bg-white/5 p-1 rounded transition-colors group">
                        <span className="text-slate-600 shrink-0 w-24 text-[11px] mt-0.5">{log.timestamp}</span>
                        <span className="shrink-0 mt-0.5">
                {log.level === 'INFO' && <Info size={14} className="text-blue-400" />}
                            {log.level === 'ERROR' && <XCircle size={14} className="text-red-400" />}
                            {log.level === 'SUCCESS' && <CheckCircle size={14} className="text-emerald-400" />}
            </span>
                        <span className={`flex-1 ${log.level === 'ERROR' ? 'text-red-400' : log.level === 'SUCCESS' ? 'text-emerald-300 font-bold' : 'text-slate-300'} break-all leading-relaxed`}>
                {log.message}
            </span>
                    </div>
                ))}
                <div ref={endRef} />
            </div>

            {logs.length > 0 && (
                <button
                    onClick={(e) => { e.stopPropagation(); onClear(); }}
                    className="fixed bottom-6 right-8 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white p-2 rounded-full shadow-2xl transition-all flex items-center gap-2 px-4"
                >
                    <Trash2 size={14} /> <span className="text-[10px] font-bold uppercase tracking-widest">Limpar Terminal</span>
                </button>
            )}
        </div>
    );
};
