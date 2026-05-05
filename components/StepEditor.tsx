
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Trash2, Code2, Pencil, Info, X, GripVertical, Fingerprint, Square, CheckSquare, MoreHorizontal, Clipboard, Copy, ArrowRight } from 'lucide-react';
import { TestStep, ActionType, PageElement, ConditionType, CustomVariable } from '../types.ts';

const generateUUID = () => {
    return crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

interface StepEditorProps {
    steps: TestStep[];
    onUpdateSteps: (steps: TestStep[]) => void;
    elementMap: PageElement[];
    onUpdateElementMap: (map: PageElement[]) => void;
    onRequestNewField: (index: number) => void;
    onEditElement: (name: string) => void;
    onDeleteElement: (name: string) => void;
    customVariables: CustomVariable[];
    onUpdateCustomVariables: (vars: CustomVariable[]) => void;
}

export const StepEditor: React.FC<StepEditorProps> = ({
                                                          steps,
                                                          onUpdateSteps,
                                                          elementMap,
                                                          onUpdateElementMap,
                                                          onRequestNewField,
                                                          onEditElement,
                                                          onDeleteElement,
                                                          customVariables,
                                                          onUpdateCustomVariables
                                                      }) => {

    const [showHelp, setShowHelp] = useState(false);
    const [colWidths, setColWidths] = useState<number[]>([50, 40, 110, 180, 100, 180, 110, 180, 70]);
    const resizingRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

    // Selection & Clipboard States
    const [selectedSteps, setSelectedSteps] = useState<Set<string>>(new Set());
    const [clipboardCount, setClipboardCount] = useState<number>(0);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    // Value Edit State (For Tag View)
    const [editingValueId, setEditingValueId] = useState<string | null>(null);

    // Drag and Drop States
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const canDragRef = useRef(false);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, stepIndex: number } | null>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);

    // Check clipboard on mount
    useEffect(() => {
        const checkClipboard = () => {
            try {
                const data = localStorage.getItem('AUTOQA_CLIPBOARD');
                if (data) {
                    const parsed = JSON.parse(data);
                    if (Array.isArray(parsed)) setClipboardCount(parsed.length);
                } else {
                    setClipboardCount(0);
                }
            } catch(e) {}
        };
        checkClipboard();
        // Opcional: ouvir evento de storage para atualizar entre abas
        window.addEventListener('storage', checkClipboard);
        return () => window.removeEventListener('storage', checkClipboard);
    }, []);

    // Fecha menu ao clicar fora
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (contextMenuRef.current && contextMenuRef.current.contains(e.target as Node)) {
                return;
            }
            setOpenMenuId(null);
            setContextMenu(null);
            // Não fechamos o editingValueId aqui pois o onBlur do input já cuida disso
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // --- Clipboard Logic ---

    const handleCopySelected = () => {
        const stepsToCopy = steps.filter(s => selectedSteps.has(s.id));
        if (stepsToCopy.length === 0) return;

        localStorage.setItem('AUTOQA_CLIPBOARD', JSON.stringify(stepsToCopy));
        setClipboardCount(stepsToCopy.length);
        setOpenMenuId(null);
        // Feedback visual poderia ser adicionado aqui
    };

    const handlePaste = () => {
        try {
            const data = localStorage.getItem('AUTOQA_CLIPBOARD');
            if (!data) return;
            const parsed = JSON.parse(data) as TestStep[];

            // Regenerate IDs for pasted steps
            const newSteps = parsed.map(s => ({
                ...s,
                id: generateUUID(),
                order: 0 // Will be recalculated
            }));

            const updatedSteps = [...steps, ...newSteps].map((s, i) => ({ ...s, order: i + 1 }));
            onUpdateSteps(updatedSteps);

            // Limpa a área de transferência após colar
            localStorage.removeItem('AUTOQA_CLIPBOARD');
            setClipboardCount(0);
        } catch(e) {
            console.error("Erro ao colar passos", e);
        }
    };

    const handleDeleteSelected = () => {
        const newSteps = steps.filter(s => !selectedSteps.has(s.id)).map((s, i) => ({ ...s, order: i + 1 }));
        onUpdateSteps(newSteps);
        setSelectedSteps(new Set());
        setOpenMenuId(null);
    };

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedSteps);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedSteps(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedSteps.size === steps.length && steps.length > 0) {
            setSelectedSteps(new Set());
        } else {
            setSelectedSteps(new Set(steps.map(s => s.id)));
        }
    };

    // --- Resize Logic ---
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (resizingRef.current) {
                const { index, startX, startWidth } = resizingRef.current;
                const diff = e.clientX - startX;
                const newWidth = Math.max(30, startWidth + diff);

                setColWidths((prev) => {
                    const newWidths = [...prev];
                    newWidths[index] = newWidth;
                    return newWidths;
                });
            }
        };

        const handleMouseUp = () => {
            if (resizingRef.current) {
                resizingRef.current = null;
                document.body.style.cursor = 'default';
                document.body.style.userSelect = 'auto';
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const startResize = (index: number, e: React.MouseEvent) => {
        e.preventDefault();
        resizingRef.current = {
            index,
            startX: e.clientX,
            startWidth: colWidths[index],
        };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    // --- CRUD Operations ---

    const addStep = () => {
        const newStep: TestStep = {
            id: generateUUID(),
            order: steps.length + 1,
            action: ActionType.TYPE,
            field: '',
            value: ''
        };
        onUpdateSteps([...steps, newStep]);
    };

    const removeStep = (index: number) => {
        const newSteps = steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 }));
        onUpdateSteps(newSteps);
    };

    const handleContextMenu = (e: React.MouseEvent, index: number) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, stepIndex: index });
    };

    const handleDuplicateStep = (index: number) => {
        const stepToDuplicate = steps[index];
        const newStep = { ...stepToDuplicate, id: generateUUID() };
        const newSteps = [...steps];
        newSteps.splice(index + 1, 0, newStep);
        const reorderedSteps = newSteps.map((s, i) => ({ ...s, order: i + 1 }));
        onUpdateSteps(reorderedSteps);
    };

    const handleToggleDisableStep = (index: number) => {
        const newSteps = [...steps];
        newSteps[index] = { ...newSteps[index], disabled: !newSteps[index].disabled };
        onUpdateSteps(newSteps);
    };

    const moveStep = (index: number, direction: -1 | 1) => {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= steps.length) return;

        const newSteps = [...steps];
        const temp = newSteps[index];
        newSteps[index] = newSteps[newIndex];
        newSteps[newIndex] = temp;
        const reorderedSteps = newSteps.map((s, i) => ({ ...s, order: i + 1 }));
        onUpdateSteps(reorderedSteps);
    };

    const updateStepAction = (index: number, newAction: ActionType) => {
        const newSteps = [...steps];
        const updates: Partial<TestStep> = { action: newAction };

        if (newAction === ActionType.VALIDATE_TEXT || newAction === ActionType.WAIT_FOR) {
            if (!newSteps[index].condition) {
                updates.condition = ConditionType.CONTAINS;
            }
        } else {
            updates.condition = undefined;
        }

        if (newAction === ActionType.WAIT) {
            updates.field = '';
        } else if (newAction === ActionType.WAIT_FOR) {
            // Mantém campo existente
        } else if (newAction === ActionType.VALIDATE_DISABLED || newAction === ActionType.CLICK) {
            updates.value = '';
            updates.condition = undefined;
        }

        newSteps[index] = { ...newSteps[index], ...updates };
        onUpdateSteps(newSteps);
    };

    const updateStep = (index: number, field: keyof TestStep, value: any) => {
        const newSteps = [...steps];
        newSteps[index] = { ...newSteps[index], [field]: value };
        onUpdateSteps(newSteps);
    };

    // Lógica Híbrida: Se tem FriendlyName, atualiza o mapa global. Se não tem, atualiza o passo local (Selector Ad-Hoc).
    const handleSelectorUpdate = (index: number, friendlyName: string, newSelector: string) => {
        if (friendlyName) {
            // Modo Mapeado: Atualiza o Mapa Global
            const exists = elementMap.find(el => el.friendlyName === friendlyName);
            if (exists) {
                const newMap = elementMap.map(el =>
                    el.friendlyName === friendlyName ? { ...el, selector: newSelector } : el
                );
                onUpdateElementMap(newMap);
            } else {
                const newElement: PageElement = {
                    friendlyName: friendlyName,
                    selector: newSelector,
                    type: 'input',
                    category: 'Geral'
                };
                onUpdateElementMap([...elementMap, newElement]);
            }
        } else {
            // Modo Ad-Hoc: Atualiza direto no passo
            updateStep(index, 'selector', newSelector);
        }
    };

    // --- Drag and Drop Handlers ---

    const handleDragStart = (e: React.DragEvent, index: number) => {
        if (!canDragRef.current) {
            e.preventDefault();
            return;
        }
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;
        setDragOverIndex(index);
    };

    const handleDrop = (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        setDragOverIndex(null);
        canDragRef.current = false;

        if (draggedIndex === null || draggedIndex === targetIndex) return;

        const newSteps = [...steps];
        const [draggedItem] = newSteps.splice(draggedIndex, 1);
        newSteps.splice(targetIndex, 0, draggedItem);

        const reorderedSteps = newSteps.map((s, i) => ({ ...s, order: i + 1 }));
        onUpdateSteps(reorderedSteps);
        setDraggedIndex(null);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
        canDragRef.current = false;
    };

    const getPlaceholder = (action: ActionType) => {
        switch (action) {
            case ActionType.WAIT: return "Tempo em ms (ex: 2000)";
            case ActionType.WAIT_FOR: return "Texto esperado (Opcional)";
            case ActionType.VALIDATE_FILLED: return "Opcional: Qtd exata caracteres";
            case ActionType.VALIDATE_TEXT: return "Texto esperado...";
            case ActionType.SMART_SELECT: return "Opção para selecionar...";
            case ActionType.VALIDATE_DISABLED: return "Sem parâmetro";
            case ActionType.CLICK: return "Sem parâmetro";
            case ActionType.SHORTCUT: return "Ex: {TAB}, {ENTER}...";
            default: return "Valor a digitar...";
        }
    };

    const shouldShowCondition = (action: ActionType) => {
        return action === ActionType.VALIDATE_TEXT || action === ActionType.WAIT_FOR;
    };

    // --- Helper to Render Trello-like Tags ---
    const renderStyledValue = (text: string) => {
        if (!text) return <span className="text-slate-300 italic text-[10px]">Vazio</span>;

        const parts = text.split(/(\{.*?\})/g);

        return (
            <div className="flex items-center flex-wrap gap-1 text-xs truncate">
                {parts.map((part, i) => {
                    if (part.match(/^\{.*\}$/)) {
                        const content = part.replace(/^\{|\}$/g, '');
                        return (
                            <span key={i} className="bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide select-none">
                            {content}
                        </span>
                        );
                    }
                    if (!part) return null;
                    return <span key={i} className="text-slate-700 font-medium whitespace-pre">{part}</span>;
                })}
            </div>
        );
    };

    const headers = [
        { label: '', index: 0 }, // Checkbox Column
        { label: '#', index: 1 },
        { label: 'Ação', index: 2 },
        { label: 'Elemento', index: 3 },
        { label: 'TID', index: 4 },
        // { label: 'CSS / XPath', index: 5 }, // COLUNA OCULTA
        { label: 'Condição', index: 6 },
        { label: 'Valor / Texto', index: 7 },
        { label: 'Atraso (ms)', index: 8 },
    ];

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Fluxo de Passos</h3>
                </div>
                <div className="flex items-center gap-2">
                    {clipboardCount > 0 && (
                        <button
                            onClick={handlePaste}
                            className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-blue-300 hover:text-blue-600 transition-colors shadow-sm"
                            title={`Colar ${clipboardCount} passos`}
                        >
                            <Clipboard size={14} /> Colar ({clipboardCount})
                        </button>
                    )}

                    <button
                        onClick={() => setShowHelp(true)}
                        className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors"
                        title="Variáveis" // RENOMEADO
                    >
                        <Info size={18} />
                    </button>
                    <button
                        onClick={addStep}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                    >
                        <Plus size={16} strokeWidth={3} /> Adicionar Passo
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                <table className="w-full text-left text-xs border-collapse table-fixed">
                    <thead className="bg-white text-slate-400 font-bold uppercase tracking-widest sticky top-0 z-10 border-b border-slate-100 shadow-sm">
                    <tr>
                        {headers.map((h) => (
                            <th key={h.index} style={{ width: colWidths[h.index] }} className="px-2 py-4 relative group select-none">
                                {h.index === 0 ? (
                                    <div className="flex justify-center">
                                        <button onClick={toggleSelectAll} className="hover:text-blue-500 transition-colors">
                                            {selectedSteps.size > 0 && selectedSteps.size === steps.length
                                                ? <CheckSquare size={16} className="text-blue-500"/>
                                                : <Square size={16} />}
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="px-1 truncate">{h.label}</div>
                                        <div
                                            onMouseDown={(e) => startResize(h.index, e)}
                                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 transition-colors z-20 flex items-center justify-center group-hover:bg-slate-200"
                                        >
                                            <div className="h-4 w-[1px] bg-slate-300 opacity-0 group-hover:opacity-100" />
                                        </div>
                                    </>
                                )}
                            </th>
                        ))}
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                    {steps.map((step, index) => {
                        const element = elementMap.find(e => e.friendlyName === step.field);
                        const isKnownElement = !!element;
                        const isWaitAction = step.action === ActionType.WAIT || step.action === ActionType.SHORTCUT;
                        const isWaitFor = step.action === ActionType.WAIT_FOR;
                        const isDisabledCheck = step.action === ActionType.VALIDATE_DISABLED || step.action === ActionType.CLICK; // AGORA INCLUI CLICK
                        const isSelected = selectedSteps.has(step.id);
                        const isEditingValue = editingValueId === step.id;

                        const showCondition = shouldShowCondition(step.action);

                        // Lógica de Separação TID / CSS (COM FALLBACK PARA step.selector)
                        // Prioridade: Mapa Global > Passo Local (Ad-Hoc)
                        const rawSelector = element?.selector || step.selector || '';

                        const tidMatch = rawSelector.match(/^\[tid="(.+)"\]$/);
                        const currentTid = tidMatch ? tidMatch[1] : '';
                        const currentCss = tidMatch ? '' : rawSelector;

                        return (
                            <tr
                                key={step.id}
                                draggable="true"
                                onContextMenu={(e) => handleContextMenu(e, index)}
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDrop={(e) => handleDrop(e, index)}
                                onDragEnd={handleDragEnd}
                                className={`hover:bg-blue-50/30 transition-colors group/row relative
                    ${draggedIndex === index ? 'opacity-40 bg-slate-100' : ''}
                    ${dragOverIndex === index ? 'border-t-4 border-t-blue-500' : ''} 
                    ${isSelected ? 'bg-blue-50/60' : ''}
                    ${step.disabled ? 'opacity-50 grayscale bg-slate-50 line-through decoration-slate-300' : ''}
                  `}
                            >
                                {/* Checkbox Column */}
                                <td className="px-2 py-3 text-center">
                                    <button onClick={() => toggleSelection(step.id)} className="text-slate-400 hover:text-blue-500">
                                        {isSelected ? <CheckSquare size={16} className="text-blue-500" /> : <Square size={16} />}
                                    </button>
                                </td>

                                {/* ID / Grip */}
                                <td className="px-2 py-3 text-center text-slate-300 font-bold truncate flex items-center gap-2">
                                    <div
                                        className="p-1 cursor-grab active:cursor-grabbing hover:text-blue-500 text-slate-300"
                                        onMouseDown={() => { canDragRef.current = true; }}
                                        onMouseUp={() => { canDragRef.current = false; }}
                                        onMouseLeave={() => { if(!draggedIndex) canDragRef.current = false; }}
                                    >
                                        <GripVertical size={14} />
                                    </div>
                                    {step.order}
                                </td>
                                {/* Ação */}
                                <td className="px-1">
                                    <select
                                        value={step.action}
                                        onChange={(e) => updateStepAction(index, e.target.value as ActionType)}
                                        className="w-full bg-transparent font-bold text-slate-700 outline-none cursor-pointer truncate"
                                    >
                                        {Object.values(ActionType).map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
                                    </select>
                                </td>
                                {/* Elemento (Input Texto Direto) */}
                                <td className="px-1">
                                    <div className="flex items-center gap-1 group/field relative">
                                        <input
                                            type="text"
                                            value={step.field}
                                            disabled={isWaitAction}
                                            onChange={(e) => {
                                                // Se apagar o nome, mantemos o selector no step.selector (se houver)
                                                // mas limpamos o step.field
                                                updateStep(index, 'field', e.target.value);
                                            }}
                                            placeholder={isWaitAction ? "(Nenhum)" : "Opcional"}
                                            className={`w-full bg-transparent font-bold outline-none truncate pr-6 border-b border-transparent hover:border-slate-300 focus:border-blue-500 transition-colors ${
                                                isWaitAction ? 'text-slate-300 cursor-not-allowed' : 'text-blue-600'
                                            }`}
                                        />

                                        {isKnownElement && !isWaitAction && (
                                            <div className="flex items-center absolute right-0 bg-white/80 backdrop-blur-sm opacity-0 group-hover/field:opacity-100 transition-opacity shadow-sm rounded-md border border-slate-100 z-10">
                                                <button
                                                    onClick={() => onDeleteElement(step.field)}
                                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-r-md"
                                                >
                                                    <Trash2 size={10} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </td>

                                {/* COLUNA TID */}
                                <td className="px-1">
                                    <div className={`flex items-center gap-2 px-2 py-1 rounded-lg border 
                        ${isWaitAction || !!currentCss
                                        ? 'bg-slate-100/50 border-transparent opacity-50'
                                        : 'bg-white border-slate-200 focus-within:ring-2 focus-within:ring-blue-100'}`}>
                                        <Fingerprint size={12} className={!!currentCss ? "text-slate-300" : "text-emerald-500"} />
                                        <input
                                            type="text"
                                            value={isWaitAction ? '' : currentTid}
                                            disabled={isWaitAction || !!currentCss}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const newSelector = val ? `[tid="${val}"]` : '';
                                                handleSelectorUpdate(index, step.field, newSelector);
                                            }}
                                            placeholder={isWaitAction ? "-" : (!!currentCss ? "(Bloqueado)" : "Ex: login_usuario")}
                                            className={`w-full bg-transparent font-mono text-[10px] outline-none truncate 
                            ${(isWaitAction || !!currentCss) ? 'cursor-not-allowed text-slate-400' : 'text-slate-600 focus:text-blue-600 font-bold'}`}
                                        />
                                    </div>
                                </td>

                                {/* COLUNA CSS / XPATH - OCULTA */}
                                {/* <td className="px-1">
                                    <div className={`flex items-center gap-2 px-2 py-1 rounded-lg border 
                        ${isWaitAction || !!currentTid
                                        ? 'bg-slate-100/50 border-transparent opacity-50'
                                        : 'bg-white border-slate-200 focus-within:ring-2 focus-within:ring-blue-100'}`}>
                                        <Code2 size={12} className={!!currentTid ? "text-slate-300" : "text-slate-400"} />
                                        <input
                                            type="text"
                                            value={isWaitAction ? '' : currentCss}
                                            disabled={isWaitAction || !!currentTid}
                                            onChange={(e) => handleSelectorUpdate(index, step.field, e.target.value)}
                                            placeholder={isWaitAction ? "-" : (!!currentTid ? "(Bloqueado)" : "#id ou //xpath")}
                                            className={`w-full bg-transparent font-mono text-[10px] outline-none truncate 
                             ${(isWaitAction || !!currentTid) ? 'cursor-not-allowed text-slate-400' : 'text-slate-500 focus:text-blue-600'}`}
                                        />
                                    </div>
                                </td> */}

                                {/* Condição */}
                                <td className="px-1">
                                    {showCondition ? (
                                        <select
                                            value={step.condition || ConditionType.CONTAINS}
                                            onChange={(e) => updateStep(index, 'condition', e.target.value)}
                                            className="w-full bg-slate-100/50 rounded px-1 py-1 font-bold text-slate-600 text-[10px] outline-none cursor-pointer border border-transparent hover:border-slate-200 focus:border-blue-200"
                                        >
                                            {Object.values(ConditionType).map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                                        </select>
                                    ) : (
                                        <div className="text-center text-slate-300 font-bold text-[10px]">-</div>
                                    )}
                                </td>
                                {/* Valor */}
                                <td className="px-1" onClick={() => !isDisabledCheck && setEditingValueId(step.id)}>
                                    <div className="flex items-center gap-2 pr-2">
                                        {isDisabledCheck ? (
                                            <input
                                                disabled
                                                placeholder="Bloqueado para esta ação"
                                                className="flex-1 border text-xs px-2 py-1.5 rounded-md font-medium w-full min-w-0 bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed italic"
                                            />
                                        ) : isEditingValue ? (
                                            <input
                                                autoFocus
                                                type="text"
                                                value={step.value}
                                                onBlur={() => setEditingValueId(null)}
                                                onKeyDown={(e) => e.key === 'Enter' && setEditingValueId(null)}
                                                onChange={(e) => updateStep(index, 'value', e.target.value)}
                                                placeholder={getPlaceholder(step.action)}
                                                className="flex-1 border border-blue-300 bg-white text-slate-700 text-xs px-2 py-1.5 rounded-md font-medium w-full min-w-0 shadow-sm outline-none ring-2 ring-blue-100"
                                            />
                                        ) : (
                                            <div className="flex-1 border border-slate-300 bg-white text-slate-700 text-xs px-2 py-1.5 rounded-md font-medium w-full min-w-0 shadow-sm cursor-text min-h-[26px]">
                                                {renderStyledValue(step.value)}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                {/* Atraso */}
                                <td className="px-1 text-center">
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="50"
                                        value={step.typingDelay === undefined ? '' : step.typingDelay}
                                        onChange={(e) => updateStep(index, 'typingDelay', e.target.value ? parseInt(e.target.value) : undefined)}
                                        disabled={step.action !== ActionType.TYPE && step.action !== ActionType.SMART_SELECT && step.action !== ActionType.CLICAR_E_DIGITAR}
                                        title="Lentidão humana (ms) a cada tecla digitada"
                                        className={`w-full text-center bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 rounded px-1 py-1.5 text-xs font-bold text-slate-600 outline-none transition-colors
                                            ${(step.action !== ActionType.TYPE && step.action !== ActionType.SMART_SELECT && step.action !== ActionType.CLICAR_E_DIGITAR) ? 'opacity-30 cursor-not-allowed' : 'bg-slate-50'}`}
                                    />
                                </td>
                            </tr>
                        );
                    })}
                    {steps.length === 0 && (
                        <tr>
                            <td colSpan={10} className="py-12 text-center">
                                <p className="text-slate-400 font-bold italic">Nenhum passo definido para este cenário.</p>
                            </td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>

            {/* Help Modal */}
            {showHelp && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest">Variáveis do Sistema</h3>
                                <p className="text-xs text-slate-500">Use estes códigos no campo "Valor" para gerar dados dinâmicos.</p>
                            </div>
                            <button onClick={() => setShowHelp(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {/* Variáveis Nativas */}
                            <section>
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Padrão do Sistema</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {[
                                        { code: '{HOJE}', desc: 'Data atual DD/MM/AAAA' },
                                        { code: '{ANO_ATUAL}', desc: 'Ano atual (Ex: 2026)' },
                                        { code: '{MES_ATUAL}', desc: 'Mês atual (Ex: 05)' },
                                        { code: '{DIA_ATUAL}', desc: 'Dia atual (Ex: 05)' },
                                        { code: '{AMANHA}', desc: 'Data de amanhã (D+1)' },
                                        { code: '{ONTEM}', desc: 'Data de ontem (D-1)' },
                                        { code: '{AGORA}', desc: 'Data e hora com segundos' },
                                        { code: '{ALEATORIO_NUM}', desc: '4 dígitos aleatórios' },
                                        { code: '{CLEAR}', desc: 'Limpar campo' },
                                        { code: '{ENTER}', desc: 'Tecla Enter' },
                                        { code: '{TAB}', desc: 'Tecla Tab' },
                                    ].map(item => (
                                        <div key={item.code} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <code className="text-blue-600 font-bold text-xs">{item.code}</code>
                                                <span className="text-[10px] text-slate-500">{item.desc}</span>
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    navigator.clipboard.writeText(item.code);
                                                    // Opcional: feedback de copiado
                                                }}
                                                className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-white rounded-lg transition-all"
                                                title="Copiar código"
                                            >
                                                <Copy size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* Variáveis Customizadas */}
                            <section className="pt-4 border-t border-slate-100">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Suas Variáveis</h4>
                                    <button 
                                        onClick={() => {
                                            const newVar = { id: crypto.randomUUID(), name: 'NOVA_VAR', value: 'valor' };
                                            onUpdateCustomVariables([...customVariables, newVar]);
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black text-white bg-fuchsia-600 rounded-lg hover:bg-fuchsia-700 transition-colors shadow-lg shadow-fuchsia-500/20"
                                    >
                                        <Plus size={12} strokeWidth={3} /> Criar Variável
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {customVariables.length === 0 ? (
                                        <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                            <p className="text-xs font-bold text-slate-400 italic">Nenhuma variável customizada criada.</p>
                                        </div>
                                    ) : (
                                        customVariables.map((cv, idx) => (
                                            <div key={cv.id} className="p-3 bg-white border border-slate-200 rounded-xl flex items-center gap-3 group">
                                                <div className="flex-1 flex items-center gap-2">
                                                    <span className="text-fuchsia-600 font-black text-xs">{"{"}</span>
                                                    <input 
                                                        value={cv.name}
                                                        onChange={(e) => {
                                                            const newVars = [...customVariables];
                                                            newVars[idx] = { ...cv, name: e.target.value.toUpperCase().replace(/\s/g, '_') };
                                                            onUpdateCustomVariables(newVars);
                                                        }}
                                                        placeholder="NOME"
                                                        className="w-32 bg-fuchsia-50 text-fuchsia-700 font-bold text-xs px-2 py-1 rounded-md outline-none focus:ring-2 focus:ring-fuchsia-200"
                                                    />
                                                    <span className="text-fuchsia-600 font-black text-xs">{"}"}</span>
                                                    
                                                    <ArrowRight size={14} className="text-slate-300" />
                                                    
                                                    <input 
                                                        value={cv.value}
                                                        onChange={(e) => {
                                                            const newVars = [...customVariables];
                                                            newVars[idx] = { ...cv, value: e.target.value };
                                                            onUpdateCustomVariables(newVars);
                                                        }}
                                                        placeholder="Valor..."
                                                        className="flex-1 bg-slate-50 text-slate-700 font-medium text-xs px-2 py-1 rounded-md outline-none focus:ring-2 focus:ring-blue-100"
                                                    />
                                                </div>
                                                
                                                <div className="flex items-center gap-1">
                                                    <button 
                                                        onClick={() => navigator.clipboard.writeText(`{${cv.name}}`)}
                                                        className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-slate-100 rounded-lg transition-all"
                                                        title="Copiar código"
                                                    >
                                                        <Copy size={14} />
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            onUpdateCustomVariables(customVariables.filter(v => v.id !== cv.id));
                                                        }}
                                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                        title="Excluir"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            )}

            {/* Context Menu Modal */}
            {contextMenu && (
                <div 
                    ref={contextMenuRef}
                    className="fixed z-[100] bg-white rounded-xl shadow-xl border border-slate-100 py-1 w-32 animate-in zoom-in-95"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()} 
                >
                    <button 
                        onClick={() => { handleToggleDisableStep(contextMenu.stepIndex); setContextMenu(null); }}
                        className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        {steps[contextMenu.stepIndex]?.disabled ? 'Habilitar' : 'Inabilitar'}
                    </button>
                    <button 
                        onClick={() => { handleDuplicateStep(contextMenu.stepIndex); setContextMenu(null); }}
                        className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        Duplicar
                    </button>
                    <div className="h-px bg-slate-100 my-1"></div>
                    <button 
                        onClick={() => { removeStep(contextMenu.stepIndex); setContextMenu(null); }}
                        className="w-full text-left px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                        Excluir
                    </button>
                </div>
            )}
        </div>
    );
};
