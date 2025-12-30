
import React, { useState } from 'react';
import { CheckCircle, XCircle, Clock, BarChart3, ChevronDown, ChevronRight, FileText, Activity, Printer, MousePointerClick, Keyboard, Search, AlertCircle, Hourglass } from 'lucide-react';
import { TestReport, TestCase, ActionType } from '../types';

interface ReportsViewProps {
    reports: TestReport[];
    testCases: TestCase[];
}

export const ReportsView: React.FC<ReportsViewProps> = ({ reports, testCases }) => {
    const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

    const stats = {
        total: reports.length,
        passed: reports.filter(r => r.status === 'PASSED').length,
        failed: reports.filter(r => r.status === 'FAILED').length,
        avgDuration: reports.length ? (reports.reduce((acc, r) => acc + r.duration, 0) / reports.length / 1000).toFixed(1) : 0,
        successRate: reports.length ? Math.round((reports.filter(r => r.status === 'PASSED').length / reports.length) * 100) : 0
    };

    const getActionIcon = (action: string) => {
        switch (action) {
            case ActionType.CLICK: return <MousePointerClick size={14} className="text-blue-500" />;
            case ActionType.TYPE: return <Keyboard size={14} className="text-slate-500" />;
            case ActionType.VALIDATE_TEXT:
            case ActionType.VALIDATE_FILLED: return <Search size={14} className="text-purple-500" />;
            case ActionType.WAIT: return <Hourglass size={14} className="text-amber-500" />;
            case ActionType.SMART_SELECT: return <MousePointerClick size={14} className="text-indigo-500" />;
            default: return <Activity size={14} className="text-slate-400" />;
        }
    };

    const printReport = (report: TestReport) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const htmlContent = `
      <html>
        <head>
          <title>Relatório de Teste - ${report.testName}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @media print { body { -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body class="p-8 font-sans bg-white">
          <div class="border-b-2 border-slate-800 pb-4 mb-6 flex justify-between items-end">
            <div>
              <h1 class="text-2xl font-black text-slate-800 uppercase tracking-widest">Relatório de Execução</h1>
              <p class="text-sm text-slate-500">AutoQA Studio</p>
            </div>
            <div class="text-right">
              <p class="text-lg font-bold ${report.status === 'PASSED' ? 'text-emerald-600' : 'text-rose-600'}">
                ${report.status === 'PASSED' ? 'APROVADO' : 'REPROVADO'}
              </p>
              <p class="text-xs text-slate-400">${report.timestamp}</p>
            </div>
          </div>

          <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
            <h2 class="text-sm font-bold text-slate-700 uppercase mb-2">Resumo</h2>
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div><span class="font-bold text-slate-500">Cenário:</span> ${report.testName}</div>
              <div><span class="font-bold text-slate-500">Duração:</span> ${(report.duration / 1000).toFixed(2)}s</div>
              <div><span class="font-bold text-slate-500">Total Passos:</span> ${report.steps.length}</div>
              ${report.errorMessage ? `<div class="col-span-2 text-rose-600 font-bold bg-rose-50 p-2 rounded">Erro: ${report.errorMessage}</div>` : ''}
            </div>
          </div>

          <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Detalhamento dos Passos</h3>
          <table class="w-full text-left text-xs border-collapse border border-slate-200">
            <thead class="bg-slate-100">
              <tr>
                <th class="p-3 border border-slate-200">#</th>
                <th class="p-3 border border-slate-200">Ação</th>
                <th class="p-3 border border-slate-200">Elemento</th>
                <th class="p-3 border border-slate-200">Valor/Dados</th>
                <th class="p-3 border border-slate-200">Resultado</th>
                <th class="p-3 border border-slate-200">Tempo</th>
              </tr>
            </thead>
            <tbody>
              ${report.steps.map((step, idx) => `
                <tr class="${step.status === 'ERROR' ? 'bg-rose-50' : 'even:bg-slate-50'}">
                  <td class="p-3 border border-slate-200 font-bold text-center">${idx + 1}</td>
                  <td class="p-3 border border-slate-200 font-mono">${step.action || '-'}</td>
                  <td class="p-3 border border-slate-200 font-bold text-slate-700">${step.field || '-'}</td>
                  <td class="p-3 border border-slate-200 italic text-slate-500">${step.value || '-'}</td>
                  <td class="p-3 border border-slate-200 font-bold ${step.status === 'SUCCESS' ? 'text-emerald-600' : 'text-rose-600'}">
                    ${step.status === 'SUCCESS' ? 'OK' : 'ERRO'}
                    ${step.message ? `<div class="text-[10px] text-rose-500 font-normal mt-1">${step.message}</div>` : ''}
                  </td>
                  <td class="p-3 border border-slate-200 text-slate-400">${(step.duration || 0) / 1000}s</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="mt-8 text-center text-[10px] text-slate-300">
            Gerado automaticamente por AutoQA Studio
          </div>
          <script>
            window.onload = () => { window.print(); }
          </script>
        </body>
      </html>
    `;

        printWindow.document.write(htmlContent);
        printWindow.document.close();
    };

    return (
        <div className="flex flex-col h-full gap-6 overflow-hidden">
            {/* Dashboard Stats */}
            <div className="grid grid-cols-4 gap-4">
                {[
                    { label: 'Total de Testes', value: stats.total, icon: <FileText size={20} />, color: 'bg-blue-500' },
                    { label: 'Sucessos', value: stats.passed, icon: <CheckCircle size={20} />, color: 'bg-emerald-500' },
                    { label: 'Falhas', value: stats.failed, icon: <XCircle size={20} />, color: 'bg-rose-500' },
                    { label: 'Eficiência', value: `${stats.successRate}%`, icon: <Activity size={20} />, color: 'bg-amber-500' },
                ].map((s, i) => (
                    <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className={`p-3 rounded-xl text-white ${s.color}`}>{s.icon}</div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.label}</p>
                            <p className="text-xl font-black text-slate-800">{s.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Reports List */}
            <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <BarChart3 size={14} className="text-blue-500" /> Histórico de Execuções
                    </h3>
                    <span className="text-[10px] text-slate-400 font-bold">{reports.length} registros encontrados</span>
                </div>

                <div className="flex-1 overflow-auto">
                    {reports.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 opacity-50">
                            <BarChart3 size={40} />
                            <p className="text-sm font-bold">Nenhum teste executado nesta sessão.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-white sticky top-0 z-10 border-b border-slate-100">
                            <tr className="text-slate-400 font-bold uppercase tracking-tighter">
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Nome do Cenário</th>
                                <th className="px-6 py-4">Data/Hora</th>
                                <th className="px-6 py-4">Duração</th>
                                <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                            {reports.slice().reverse().map((report) => (
                                <React.Fragment key={report.id}>
                                    <tr
                                        className={`cursor-pointer transition-colors ${expandedReportId === report.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
                                        onClick={() => setExpandedReportId(expandedReportId === report.id ? null : report.id)}
                                    >
                                        <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-[10px] uppercase ${
                            report.status === 'PASSED' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {report.status === 'PASSED' ? <CheckCircle size={10} /> : <XCircle size={10} />}
                            {report.status === 'PASSED' ? 'Passou' : 'Falhou'}
                        </span>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-slate-700">{report.testName}</td>
                                        <td className="px-6 py-4 text-slate-500 font-mono">{report.timestamp}</td>
                                        <td className="px-6 py-4 text-slate-500 flex items-center gap-1">
                                            <Clock size={12} /> {(report.duration / 1000).toFixed(2)}s
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {expandedReportId === report.id ? <ChevronDown size={16} className="text-blue-500" /> : <ChevronRight size={16} className="text-slate-300" />}
                                        </td>
                                    </tr>

                                    {expandedReportId === report.id && (
                                        <tr>
                                            <td colSpan={5} className="bg-slate-50 p-6 border-b border-slate-100">
                                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-top-2 duration-300">

                                                    {/* Detailed Header */}
                                                    <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-[10px] font-black uppercase tracking-widest">Detalhes da Execução</span>
                                                            {report.errorMessage && (
                                                                <span className="flex items-center gap-1 text-[10px] bg-rose-500/20 text-rose-200 px-2 py-0.5 rounded font-bold border border-rose-500/50">
                                    <AlertCircle size={10} /> {report.errorMessage}
                                  </span>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); printReport(report); }}
                                                            className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-colors"
                                                        >
                                                            <Printer size={14} /> Imprimir / PDF
                                                        </button>
                                                    </div>

                                                    {/* Detailed Steps Table */}
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-xs text-left">
                                                            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                                                            <tr>
                                                                <th className="px-4 py-3 w-10 text-center">#</th>
                                                                <th className="px-4 py-3 w-32">Ação</th>
                                                                <th className="px-4 py-3">Elemento</th>
                                                                <th className="px-4 py-3">Valor / Dados</th>
                                                                <th className="px-4 py-3 w-24">Resultado</th>
                                                                <th className="px-4 py-3 w-20 text-right">Tempo</th>
                                                            </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-50">
                                                            {report.steps.map((s, idx) => (
                                                                <tr key={idx} className={`hover:bg-slate-50/80 ${s.status === 'ERROR' ? 'bg-rose-50/50' : ''}`}>
                                                                    <td className="px-4 py-3 text-center font-bold text-slate-300">{idx + 1}</td>
                                                                    <td className="px-4 py-3">
                                                                        <div className="flex items-center gap-2 font-mono text-slate-600">
                                                                            {getActionIcon(s.action || '')}
                                                                            <span>{s.action || 'Desconhecido'}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-3 font-bold text-slate-700">
                                                                        {s.field || <span className="text-slate-300 italic">-</span>}
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        {s.value ? (
                                                                            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 border border-slate-200">{s.value}</code>
                                                                        ) : (
                                                                            <span className="text-slate-300 italic">-</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        {s.status === 'SUCCESS' ? (
                                                                            <span className="text-emerald-600 font-bold flex items-center gap-1"><CheckCircle size={12} /> OK</span>
                                                                        ) : (
                                                                            <div className="flex flex-col">
                                                                                <span className="text-rose-600 font-bold flex items-center gap-1"><XCircle size={12} /> Erro</span>
                                                                                {s.message && <span className="text-[9px] text-rose-500 leading-tight mt-1">{s.message}</span>}
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right text-slate-400 font-mono">
                                                                        {(s.duration || 0) / 1000}s
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};
