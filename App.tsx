
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
    Play, Plus, Globe, ChevronLeft, ChevronRight, BarChart3,
    Trash2, Edit3, Terminal, AlertTriangle, X, Save,
    Folder, FolderOpen, FolderPlus, MoreVertical, ChevronDown, Pencil,
    PlayCircle, Cookie, Database, Loader2, StopCircle, Copy, ArrowRight,
    CheckCircle, XCircle, ChevronsDown, ChevronsUp, CheckSquare, Square,
    Fingerprint, Code2, CornerDownRight, FilePlus, Search, Settings
} from 'lucide-react';
import { TestCase, LogEntry, ActionType, PageElement, TestReport, Folder as IFolder } from './types.ts';
import { StepEditor } from './components/StepEditor.tsx';
import { LogConsole } from './components/LogConsole.tsx';
import { ReportsView } from './components/ReportsView.tsx';

// --- DEFAULTS LOCAIS (Substituindo constants.ts) ---
const API_URL = `http://${window.location.hostname}:3000`;
const DEFAULT_TEST_CASE: TestCase = {
    id: 'default-1',
    name: 'Novo Cenário',
    startUrl: '',
    browser: 'Chrome',
    steps: [],
    persistSession: false,
    useSession: true
};

type TestStatus = 'IDLE' | 'RUNNING' | 'PASSED' | 'FAILED';

const App: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'editor' | 'reports'>('editor');

    // Global States
    const [baseUrl, setBaseUrl] = useState<string>(''); // URL Global

    // Inicializa vazio para não sobrescrever dados salvos com constantes
    const [testCases, setTestCases] = useState<TestCase[]>([]);
    const [elementMap, setElementMap] = useState<PageElement[]>([]);
    const [folders, setFolders] = useState<IFolder[]>([]);
    const [selectedTestId, setSelectedTestId] = useState<string>('');

    // Controle de Seleção Múltipla (Checkboxes)
    const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());

    // Controle de Status e Execução
    const [testStatuses, setTestStatuses] = useState<Record<string, TestStatus>>({});
    const [isDataLoaded, setIsDataLoaded] = useState(false);

    // Controle de Abortar Execução
    const abortExecutionRef = useRef(false);

    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [reports, setReports] = useState<TestReport[]>([]);
    const [isRunning, setIsRunning] = useState(false);

    // Sidebar State (Resizable)
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(300); // Largura inicial
    const [isResizing, setIsResizing] = useState(false);
    const sidebarRef = useRef<HTMLDivElement>(null);

    // Sidebar Search State
    const [searchTerm, setSearchTerm] = useState('');

    const [isConsoleOpen, setIsConsoleOpen] = useState(true);

    // Modals state
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);

    // New Field Modal State
    const [isNewFieldModalOpen, setIsNewFieldModalOpen] = useState(false);
    // Adicionado 'tid' ao estado inicial
    const [newFieldData, setNewFieldData] = useState({ name: '', selector: '', tid: '', category: '', stepIndex: -1 });
    const [isCreatingNewCategory, setIsCreatingNewCategory] = useState(false);

    // Settings Modal
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [dbConnected, setDbConnected] = useState<boolean | null>(null);

    const [moveTestId, setMoveTestId] = useState<string | null>(null);

    // Sidebar Menu State
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    // Estado para renomear teste via duplo clique
    const [renamingTestId, setRenamingTestId] = useState<string | null>(null);

    // Element Management State
    const [editingElement, setEditingElement] = useState<{ current: string, newName: string, newCategory: string } | null>(null);
    const [isEditingNewCategory, setIsEditingNewCategory] = useState(false);
    const [deleteElementId, setDeleteElementId] = useState<string | null>(null);

    // Sequence Run State
    const [sequenceIndex, setSequenceIndex] = useState<number | null>(null);

    // Drag and Drop State
    const [draggedTestId, setDraggedTestId] = useState<string | null>(null);
    const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);

    const activeTest = testCases.find(t => t.id === selectedTestId) || testCases[0];

    const existingCategories = useMemo(() => {
        const cats = new Set(elementMap.map(el => el.category || 'Geral'));
        return Array.from(cats).sort();
    }, [elementMap]);

    // Load data from server
    useEffect(() => {
        const loadData = async () => {
            try {
                const res = await fetch(`${API_URL}/load-config`);
                const data = await res.json();

                // Load Global URL
                if (data.baseUrl) {
                    setBaseUrl(data.baseUrl);
                }

                // Lógica de Prioridade: Servidor > Defaults
                if (data.testCases && data.testCases.length > 0) {
                    setTestCases(data.testCases);
                    setSelectedTestId(data.testCases[0].id);
                } else {
                    setTestCases([DEFAULT_TEST_CASE]);
                    setSelectedTestId(DEFAULT_TEST_CASE.id);
                }

                if (data.elementMap && data.elementMap.length > 0) {
                    setElementMap(data.elementMap);
                }

                if (data.folders) {
                    setFolders(data.folders);
                }

                // Carrega Histórico de Relatórios
                try {
                    const reportsRes = await fetch(`${API_URL}/load-reports`);
                    const reportsData = await reportsRes.json();
                    if (reportsData.reports) setReports(reportsData.reports);
                } catch(e) {
                    console.error("Erro ao carregar relatórios", e);
                }
            } catch (e) {
                console.error("Erro ao carregar configurações do servidor. Usando padrões.", e);
                setTestCases([DEFAULT_TEST_CASE]);
                setSelectedTestId(DEFAULT_TEST_CASE.id);
            } finally {
                setIsDataLoaded(true);
            }
        };
        loadData();

        // Close sidebar menu on click outside
        const handleClickOutside = () => setActiveMenuId(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const openSettings = async () => {
        setIsSettingsModalOpen(true);
        try {
            const res = await fetch(`${API_URL}/status`);
            const data = await res.json();
            setDbConnected(!!data.dbConnected);
        } catch(e) {
            setDbConnected(false);
        }
    };

    // Save data to server whenever it changes
    useEffect(() => {
        if (!isDataLoaded) return;

        const saveData = async () => {
            try {
                await fetch(`${API_URL}/save-config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ testCases, elementMap, folders, baseUrl })
                });
            } catch (e) {
                console.error("Erro ao sincronizar com o servidor.");
            }
        };
        const timeout = setTimeout(saveData, 1000);
        return () => clearTimeout(timeout);
    }, [testCases, elementMap, folders, baseUrl, isDataLoaded]);

    // --- Sidebar Resizing Logic ---
    const startResizing = useCallback(() => {
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback((mouseMoveEvent: MouseEvent) => {
        if (isResizing) {
            const newWidth = mouseMoveEvent.clientX;
            if (newWidth > 200 && newWidth < 600) { // Min 200px, Max 600px
                setSidebarWidth(newWidth);
            }
        }
    }, [isResizing]);

    useEffect(() => {
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [resize, stopResizing]);

    // --- Search Logic (Optimized & Protected against loops) ---
    const searchResult = useMemo(() => {
        if (!searchTerm.trim()) return { visibleTestIds: null, visibleFolderIds: null };

        const lowerTerm = searchTerm.toLowerCase();
        const visibleTestIds = new Set<string>();
        const visibleFolderIds = new Set<string>();

        // Otimização: Mapa para acesso rápido a pais
        const folderMap = new Map<string, IFolder>();
        folders.forEach(f => folderMap.set(f.id, f));

        const addAncestors = (startParentId: string | undefined) => {
            let currentId = startParentId;
            const visited = new Set<string>(); // PROTEÇÃO CONTRA LOOP INFINITO

            while (currentId && !visited.has(currentId)) {
                visited.add(currentId);
                visibleFolderIds.add(currentId);

                const parent = folderMap.get(currentId);
                currentId = parent?.parentId;
            }
        };

        // 1. Encontra Testes que dão match
        testCases.forEach(tc => {
            if (tc.name.toLowerCase().includes(lowerTerm)) {
                visibleTestIds.add(tc.id);
                addAncestors(tc.folderId);
            }
        });

        // 2. Encontra Pastas que dão match
        folders.forEach(f => {
            if (f.name.toLowerCase().includes(lowerTerm)) {
                visibleFolderIds.add(f.id);
                addAncestors(f.parentId);
            }
        });

        return { visibleTestIds, visibleFolderIds };
    }, [searchTerm, testCases, folders]);


    const addLog = useCallback((message: string, level: LogEntry['level'] = 'INFO') => {
        const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        setLogs(prev => [...prev, { timestamp, level, message }]);
    }, []);

    // --- Selection Logic ---
    const toggleTestSelection = (id: string) => {
        const newSet = new Set(selectedTestIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedTestIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedTestIds.size === testCases.length) {
            setSelectedTestIds(new Set());
        } else {
            setSelectedTestIds(new Set(testCases.map(t => t.id)));
        }
    };

    // Recursivamente encontra todos os testes dentro de uma pasta e suas subpastas
    const getTestsInFolderRecursive = (folderId: string): string[] => {
        let ids: string[] = [];
        // Testes diretos
        const directTests = testCases.filter(t => t.folderId === folderId).map(t => t.id);
        ids = [...ids, ...directTests];

        // Subpastas
        const subFolders = folders.filter(f => f.parentId === folderId);
        subFolders.forEach(sub => {
            ids = [...ids, ...getTestsInFolderRecursive(sub.id)];
        });
        return ids;
    };

    const toggleFolderSelection = (folderId: string) => {
        const allIdsInFolder = getTestsInFolderRecursive(folderId);
        if(allIdsInFolder.length === 0) return;

        const newSet = new Set(selectedTestIds);

        // Verifica se todos estão selecionados para decidir se marca ou desmarca
        const allSelected = allIdsInFolder.every(id => newSet.has(id));

        if (allSelected) {
            allIdsInFolder.forEach(id => newSet.delete(id));
        } else {
            allIdsInFolder.forEach(id => newSet.add(id));
        }
        setSelectedTestIds(newSet);
    };


    const createNewTest = (folderId?: string) => {
        const newTest: TestCase = {
            id: crypto.randomUUID(),
            name: `Novo Teste ${testCases.length + 1}`,
            startUrl: '', // URL é gerenciada globalmente agora
            browser: 'Chrome',
            steps: [],
            folderId,
            persistSession: false,
            useSession: true
        };
        setTestCases([...testCases, newTest]);
        setSelectedTestId(newTest.id);
        setActiveTab('editor');
        // Ensure parent folder is expanded if created inside one
        if(folderId) {
            setFolders(prev => prev.map(f => f.id === folderId ? {...f, isExpanded: true} : f));
        }
        setActiveMenuId(null);
    };

    const duplicateTest = (testId: string) => {
        const original = testCases.find(t => t.id === testId);
        if(!original) return;

        const newTest: TestCase = {
            ...original,
            id: crypto.randomUUID(),
            name: `${original.name} (Cópia)`,
            steps: original.steps.map(s => ({...s, id: crypto.randomUUID()})) // Deep copy steps with new IDs
        };
        setTestCases([...testCases, newTest]);
        setSelectedTestId(newTest.id);
        setActiveMenuId(null);
    };

    const createNewFolder = (parentId?: string) => {
        const newFolder: IFolder = {
            id: crypto.randomUUID(),
            name: `Nova Pasta ${folders.length + 1}`,
            isExpanded: true,
            parentId // Define pai se houver
        };

        // Atualização atômica para evitar duplicação em renderizações rápidas
        setFolders(prev => {
            const updated = [...prev, newFolder];
            // Se tem pai, garante que o pai esteja expandido
            if(parentId) {
                return updated.map(f => f.id === parentId ? {...f, isExpanded: true} : f);
            }
            return updated;
        });

        setActiveMenuId(null);
    };

    const toggleAllFolders = (expand: boolean) => {
        setFolders(prev => prev.map(f => ({ ...f, isExpanded: expand })));
    };

    // Helper para deletar recursivamente
    const deleteFolder = () => {
        if (!deleteFolderId) return;

        // 1. Encontrar IDs de todas as pastas descendentes (filhos, netos, etc.)
        const getAllDescendantIds = (rootId: string, allFolders: IFolder[]): string[] => {
            let ids = [rootId];
            const children = allFolders.filter(f => f.parentId === rootId);
            children.forEach(child => {
                ids = [...ids, ...getAllDescendantIds(child.id, allFolders)];
            });
            return ids;
        };

        const idsToDelete = getAllDescendantIds(deleteFolderId, folders);
        const idsToDeleteSet = new Set(idsToDelete);

        // 2. Excluir testes que estão nessas pastas
        setTestCases(prev => prev.filter(tc => !tc.folderId || !idsToDeleteSet.has(tc.folderId)));

        // 3. Excluir as pastas
        setFolders(prev => prev.filter(f => !idsToDeleteSet.has(f.id)));

        setDeleteFolderId(null);
    };

    const moveFolderToRoot = (folderId: string) => {
        setFolders(prev => prev.map(f => f.id === folderId ? {...f, parentId: undefined} : f));
        setActiveMenuId(null);
    };

    const confirmDeleteTest = () => {
        if (!deleteConfirmId) return;
        const filtered = testCases.filter(t => t.id !== deleteConfirmId);
        setTestCases(filtered);

        // Remove from selection if deleted
        if (selectedTestIds.has(deleteConfirmId)) {
            const newSet = new Set(selectedTestIds);
            newSet.delete(deleteConfirmId);
            setSelectedTestIds(newSet);
        }

        if (selectedTestId === deleteConfirmId) setSelectedTestId(filtered[0]?.id || '');
        setDeleteConfirmId(null);
    };

    const toggleFolder = (id: string) => {
        setFolders(prev => prev.map(f => f.id === id ? { ...f, isExpanded: !f.isExpanded } : f));
    };

    const moveTestToFolder = (testId: string, folderId?: string) => {
        setTestCases(prev => prev.map(tc => tc.id === testId ? { ...tc, folderId } : tc));
        setMoveTestId(null);
    };

    const updateActiveTest = (updates: Partial<TestCase>) => {
        setTestCases(prev => prev.map(t => t.id === activeTest.id ? { ...t, ...updates } : t));
    };

    // --- Drag and Drop Logic ---

    // VERIFICA SE UMA PASTA É DESCENDENTE DA OUTRA (Evita Ciclos)
    const isDescendant = (targetId: string, ancestorId: string): boolean => {
        let current = folders.find(f => f.id === targetId);
        // Sobe na árvore procurando se o antepassado é igual ao ancestorId
        while(current && current.parentId) {
            if(current.parentId === ancestorId) return true;
            current = folders.find(f => f.id === current.parentId);
        }
        return false;
    };

    const handleDragStart = (e: React.DragEvent, testId: string) => {
        e.stopPropagation();
        setDraggedTestId(testId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleFolderDragStart = (e: React.DragEvent, folderId: string) => {
        e.stopPropagation();
        setDraggedFolderId(folderId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        e.stopPropagation();
        // Impede dropar uma pasta nela mesma ou em seus filhos (verificação simples de loop)
        if (draggedTestId === targetId) return;
        if (draggedFolderId === targetId) return;

        // CHECK DE CICLO: Se estou arrastando uma pasta, e o alvo é descendente dela, BLOQUEIA
        if (draggedFolderId && isDescendant(targetId, draggedFolderId)) {
            return; // Não permite o drop visualmente
        }

        setDragOverId(targetId);
    };

    const handleDrop = (e: React.DragEvent, targetId: string, targetFolderId?: string) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverId(null);

        if (draggedTestId) {
            if (draggedTestId === targetId) return;

            // BATCH MOVE LOGIC
            // Verifica se o item arrastado está na lista de selecionados
            const isDraggingSelection = selectedTestIds.has(draggedTestId);

            setTestCases(prev => prev.map(t => {
                // Cenário 1: Arrastando seleção -> Move TODOS os selecionados para a pasta de destino
                if (isDraggingSelection && selectedTestIds.has(t.id)) {
                    return { ...t, folderId: targetFolderId };
                }
                // Cenário 2: Arrastando item não selecionado -> Move APENAS ele
                if (!isDraggingSelection && t.id === draggedTestId) {
                    return { ...t, folderId: targetFolderId };
                }
                return t;
            }));

            setDraggedTestId(null);
            return;
        }
    };

    const handleDropOnFolder = (e: React.DragEvent, targetFolderId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverId(null);

        // Case 1: Dragging a Test into a Folder
        if (draggedTestId) {
            // BATCH MOVE LOGIC
            const isDraggingSelection = selectedTestIds.has(draggedTestId);

            setTestCases(prev => prev.map(t => {
                // Cenário 1: Arrastando seleção -> Move TODOS os selecionados
                if (isDraggingSelection && selectedTestIds.has(t.id)) {
                    return { ...t, folderId: targetFolderId };
                }
                // Cenário 2: Arrastando avulso -> Move só ele
                if (!isDraggingSelection && t.id === draggedTestId) {
                    return { ...t, folderId: targetFolderId };
                }
                return t;
            }));

            setDraggedTestId(null);
            // Expandir pasta alvo para feedback
            setFolders(prev => prev.map(f => f.id === targetFolderId ? {...f, isExpanded: true} : f));
            return;
        }

        // Case 2: Dragging a Folder onto a Folder (Nesting / Subfolders)
        if (draggedFolderId) {
            if (draggedFolderId === targetFolderId) return;

            // CHECK DE CICLO (SEGURANÇA):
            if (isDescendant(targetFolderId, draggedFolderId)) {
                addLog("Ação inválida: Pasta não pode ser movida para dentro de sua própria subpasta.", "ERROR");
                setDraggedFolderId(null);
                return;
            }

            setFolders(prev => {
                const dragIdx = prev.findIndex(f => f.id === draggedFolderId);
                const dragFolder = prev[dragIdx];
                const targetFolder = prev.find(f => f.id === targetFolderId);

                if (!dragFolder || !targetFolder) return prev;

                let updated = [...prev];
                let shouldExpand = false;

                if (dragFolder.parentId === targetFolder.parentId) {
                    // Reordenar no mesmo nível
                    updated.splice(dragIdx, 1);
                    const insertIdx = updated.findIndex(f => f.id === targetFolderId);
                    updated.splice(insertIdx, 0, dragFolder);
                } else {
                    // Aninhamento: Pasta arrastada vira filha da pasta alvo
                    updated[dragIdx] = { ...dragFolder, parentId: targetFolderId };
                    shouldExpand = true;
                }

                if (shouldExpand) {
                    updated = updated.map(f => f.id === targetFolderId ? {...f, isExpanded: true} : f);
                }
                return updated;
            });

            setDraggedFolderId(null);
            return;
        }
    };


    const handleCreateNewField = () => {
        let finalSelector = newFieldData.selector;

        // Se TID estiver preenchido, usa ele
        if (newFieldData.tid) {
            finalSelector = `[tid="${newFieldData.tid}"]`;
        }

        if (!newFieldData.name || !finalSelector) return;

        const newElement: PageElement = {
            friendlyName: newFieldData.name,
            selector: finalSelector,
            type: 'input',
            category: newFieldData.category || 'Geral' // Default category
        };

        setElementMap([...elementMap, newElement]);
        const newSteps = [...activeTest.steps];
        newSteps[newFieldData.stepIndex] = { ...newSteps[newFieldData.stepIndex], field: newFieldData.name };
        updateActiveTest({ steps: newSteps });
        setIsNewFieldModalOpen(false);
        setNewFieldData({ name: '', selector: '', tid: '', category: '', stepIndex: -1 });
        setIsCreatingNewCategory(false);
    };

    // --- Element Management Logic ---

    const openEditElementModal = (name: string) => {
        const el = elementMap.find(e => e.friendlyName === name);
        if (el) {
            setEditingElement({
                current: name,
                newName: name,
                newCategory: el.category || ''
            });
            setIsEditingNewCategory(false);
        }
    };

    const handleRenameElement = () => {
        if (!editingElement || !editingElement.newName) {
            setEditingElement(null);
            return;
        }

        // 1. Update Map (Name AND Category)
        setElementMap(prev => prev.map(el =>
            el.friendlyName === editingElement.current
                ? { ...el, friendlyName: editingElement.newName, category: editingElement.newCategory || 'Geral' }
                : el
        ));

        // 2. Update references in ALL test cases (Only Name matters here)
        if (editingElement.current !== editingElement.newName) {
            setTestCases(prev => prev.map(tc => ({
                ...tc,
                steps: tc.steps.map(s => s.field === editingElement.current ? { ...s, field: editingElement.newName } : s)
            })));
        }

        setEditingElement(null);
        setIsEditingNewCategory(false);
    };

    const handleDeleteElement = () => {
        if (!deleteElementId) return;

        // 1. Remove from Map
        setElementMap(prev => prev.filter(el => el.friendlyName !== deleteElementId));

        // 2. Clear references in steps (set to empty or keep as is? Setting to empty forces user to re-select)
        setTestCases(prev => prev.map(tc => ({
            ...tc,
            steps: tc.steps.map(s => s.field === deleteElementId ? { ...s, field: '' } : s)
        })));

        setDeleteElementId(null);
    };

    const handleResetDriver = async () => {
        try {
            await fetch(`${API_URL}/reset-driver`, { method: 'POST' });
            addLog("Navegador fechado e reiniciado com sucesso.", "INFO");
        } catch(e) {
            addLog("Erro ao resetar navegador.", "ERROR");
        }
    };

    // --- Runner Logic ---

    const executeTestSingle = async (testCase: TestCase) => {
        addLog(`Iniciando: ${testCase.name}`, 'INFO');
        setTestStatuses(prev => ({ ...prev, [testCase.id]: 'RUNNING' }));

        try {
            // INJETA URL GLOBAL NO TEST CASE ANTES DE ENVIAR
            const testCaseWithGlobalUrl = { ...testCase, startUrl: baseUrl };

            const response = await fetch(`${API_URL}/run-test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ testCase: testCaseWithGlobalUrl, elementMap })
            });

            if (!response.body) throw new Error("Sem resposta do servidor.");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let finalResult: any = null;

            while (true) {
                const { done, value } = await reader.read();
                if (value) {
                    buffer += decoder.decode(value, { stream: !done });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const event = JSON.parse(line);
                            if (event.type === 'LOG') {
                                addLog(event.data.message, event.data.level);
                            } else if (event.type === 'STEP_END' && event.data.status === 'ERROR') {
                                addLog(`[ERRO] Passo falhou: ${event.data.error}`, 'ERROR');
                            } else if (event.type === 'TEST_END') {
                                finalResult = event.data;
                            }
                        } catch(e) {}
                    }
                }
                if (done) break;
            }

            const result = finalResult;
            if (!result) throw new Error("Teste finalizado sem resultado ou conexão abortada.");

            const newReport: TestReport = {
                id: crypto.randomUUID(),
                testCaseId: testCase.id,
                testName: testCase.name,
                timestamp: new Date().toLocaleString('pt-BR'),
                status: result.status,
                duration: result.duration,
                steps: result.steps || [],
                errorMessage: result.error
            };

            setReports(prev => [...prev, newReport]);

            // Salva relatório no servidor MongoDB
            fetch(`${API_URL}/save-report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ report: newReport })
            }).catch(() => {});

            if(result.status === 'PASSED') {
                addLog(`[PASSOU] ${testCase.name} (${result.duration}ms)`, 'SUCCESS');
                if(testCase.persistSession) addLog(`> Sessão atualizada.`, 'SUCCESS');
                setTestStatuses(prev => ({ ...prev, [testCase.id]: 'PASSED' }));
            } else {
                addLog(`[FALHOU] ${testCase.name}: ${result.error}`, 'ERROR');
                setTestStatuses(prev => ({ ...prev, [testCase.id]: 'FAILED' }));
            }

            return result.status === 'PASSED';
        } catch (e) {
            // Se for um erro de fetch, pode ser que o servidor tenha caído ou o teste abortado
            addLog(`Teste interrompido ou erro de conexão.`, 'ERROR');
            setTestStatuses(prev => ({ ...prev, [testCase.id]: 'FAILED' }));
            return false;
        }
    };

    const runTest = async () => {
        if (isRunning) return;
        if (!baseUrl?.trim()) {
            addLog("ERRO: URL Global vazia.", "ERROR");
            return;
        }
        setIsRunning(true);
        setIsConsoleOpen(true);
        setLogs([]);

        await executeTestSingle(activeTest);

        setIsRunning(false);
    };

    const stopExecution = async () => {
        abortExecutionRef.current = true;
        addLog("INTERROMPENDO EXECUÇÃO IMEDIATAMENTE...", "ERROR");

        try {
            // Chama o endpoint de kill no servidor para parar o Selenium na hora
            await fetch(`${API_URL}/stop-test`, { method: 'POST' });
        } catch (e) {
            console.error("Erro ao enviar comando de stop:", e);
        }

        // Força parada visual no frontend também
        setIsRunning(false);
    };

    const runAllSequence = async () => {
        if (isRunning) return;
        setIsRunning(true);
        setIsConsoleOpen(true);
        setLogs([]);
        abortExecutionRef.current = false; // Reset da flag

        // Clear previous statuses
        setTestStatuses({});

        // 1. Build the full logical sequence (Folders + Orphans)
        // IMPORTANT: Recursive flattening for execution order needs a proper traversal
        const getTestsFromFolder = (folderId: string): TestCase[] => {
            const directTests = testCases.filter(t => t.folderId === folderId);
            const subFolders = folders.filter(f => f.parentId === folderId);
            let subTests: TestCase[] = [];
            subFolders.forEach(sub => {
                subTests = [...subTests, ...getTestsFromFolder(sub.id)];
            });
            return [...directTests, ...subTests];
        };

        let fullSequence: TestCase[] = [];
        // Root Folders
        const rootFolders = folders.filter(f => !f.parentId);
        rootFolders.forEach(f => {
            fullSequence.push(...getTestsFromFolder(f.id));
        });
        // Root Tests
        const orphans = testCases.filter(t => !t.folderId);
        fullSequence.push(...orphans);

        // 2. Filter if selections exist
        let executionQueue = fullSequence;
        const hasSelection = selectedTestIds.size > 0;

        if (hasSelection) {
            executionQueue = fullSequence.filter(t => selectedTestIds.has(t.id));
            addLog(`🚀 INICIANDO EXECUÇÃO SEQUENCIAL (${executionQueue.length} Selecionados)`, "INFO");
        } else {
            addLog("🚀 INICIANDO EXECUÇÃO SEQUENCIAL (Todos os Testes)", "INFO");
        }

        if (executionQueue.length === 0) {
            addLog("Nenhum teste encontrado para executar.", "ERROR");
            setIsRunning(false);
            return;
        }

        for (let i = 0; i < executionQueue.length; i++) {
            // Verifica solicitação de parada
            if (abortExecutionRef.current) {
                break; // Sai do loop imediatamente
            }

            const currentTest = executionQueue[i];
            setSequenceIndex(i);
            setSelectedTestId(currentTest.id);

            const passed = await executeTestSingle(currentTest);

            if (!passed) {
                addLog(`> O teste falhou. Continuando para o próximo...`, 'ERROR');
            }

            // Delay pequeno entre testes, se não foi abortado
            if (i < executionQueue.length - 1 && !abortExecutionRef.current) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        if (!abortExecutionRef.current) {
            addLog("🏁 EXECUÇÃO SEQUENCIAL FINALIZADA", "INFO");
        } else {
            addLog("🏁 EXECUÇÃO CANCELADA", "INFO");
        }

        setSequenceIndex(null);
        setIsRunning(false);
        abortExecutionRef.current = false;
    };

    const renderTestStatusIcon = (status?: TestStatus) => {
        if (status === 'RUNNING') return <Loader2 size={12} className="text-blue-500 animate-spin" />;
        if (status === 'PASSED') return <CheckCircle size={12} className="text-emerald-500" />;
        if (status === 'FAILED') return <XCircle size={12} className="text-rose-500" />;
        // Default dot
        return null;
    };

    // --- RECURSIVE RENDERERS ---

    const renderTestItem = (tc: TestCase) => {
        // Search Filter Logic
        if (searchResult.visibleTestIds && !searchResult.visibleTestIds.has(tc.id)) return null;

        const status = testStatuses[tc.id];
        const isSelected = selectedTestIds.has(tc.id);

        return (
            <div
                key={tc.id}
                title={tc.name}
                draggable
                onDragStart={(e) => handleDragStart(e, tc.id)}
                onDragOver={(e) => handleDragOver(e, tc.id)}
                onDrop={(e) => handleDrop(e, tc.id, tc.folderId)}
                onClick={() => { setSelectedTestId(tc.id); setActiveTab('editor'); }}
                className={`group relative flex items-center gap-2 px-2 py-2 rounded-xl text-xs cursor-pointer transition-all border border-transparent ml-2
          ${selectedTestId === tc.id && activeTab === 'editor' ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-slate-800'}
          ${dragOverId === tc.id ? 'border-t-2 border-t-blue-400 bg-slate-800' : ''}
          ${draggedTestId === tc.id ? 'opacity-50' : ''}
        `}
            >
                {isSidebarOpen && (
                    <div
                        onClick={(e) => { e.stopPropagation(); toggleTestSelection(tc.id); }}
                        className="shrink-0 cursor-pointer text-slate-500 hover:text-white"
                    >
                        {isSelected
                            ? <CheckSquare size={14} className={selectedTestId === tc.id ? "text-white" : "text-blue-400"} />
                            : <Square size={14} className="opacity-50" />}
                    </div>
                )}

                <div className="shrink-0 w-3 h-3 flex items-center justify-center">
                    {renderTestStatusIcon(status) || <div className={`w-1.5 h-1.5 rounded-full ${selectedTestId === tc.id ? 'bg-white' : 'bg-slate-700'}`} />}
                </div>

                {isSidebarOpen && (
                    <>
                        {renamingTestId === tc.id ? (
                            <input
                                autoFocus
                                value={tc.name}
                                onChange={(e) => setTestCases(prev => prev.map(t => t.id === tc.id ? { ...t, name: e.target.value } : t))}
                                onBlur={() => setRenamingTestId(null)}
                                onKeyDown={(e) => e.key === 'Enter' && setRenamingTestId(null)}
                                onClick={(e) => e.stopPropagation()}
                                className="flex-1 bg-slate-950 text-white text-xs font-bold border border-blue-500 rounded px-1 py-0.5 outline-none min-w-0"
                            />
                        ) : (
                            <span
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setRenamingTestId(tc.id);
                                }}
                                className="truncate flex-1 font-bold select-none"
                                title="Duplo clique para renomear"
                            >
                    {tc.name}
                </span>
                        )}

                        {tc.persistSession && (
                            <span title="Grava Sessão">
                <Database size={10} className="text-emerald-400" />
              </span>
                        )}
                        {tc.useSession && !tc.persistSession && (
                            <span title="Usa Sessão">
                <Cookie size={10} className="text-amber-400" />
              </span>
                        )}

                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="relative">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === tc.id ? null : tc.id); }}
                                    className="p-1 hover:text-blue-300 rounded"
                                >
                                    <MoreVertical size={12} />
                                </button>

                                {/* Context Menu for Test */}
                                {activeMenuId === tc.id && (
                                    <div className="absolute right-0 top-full mt-1 w-32 bg-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-hidden z-50 flex flex-col p-1 animate-in zoom-in-95 duration-200">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setMoveTestId(tc.id); setActiveMenuId(null); }}
                                            className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-slate-700 hover:text-white rounded-lg text-left"
                                        >
                                            <ArrowRight size={10} /> Mover
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); duplicateTest(tc.id); }}
                                            className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-slate-700 hover:text-white rounded-lg text-left"
                                        >
                                            <Copy size={10} /> Duplicar
                                        </button>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(tc.id); }}
                                className="p-1 hover:text-red-400"
                                title="Excluir"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    </>
                )}
            </div>
        );
    };

    const renderFolderNode = (folder: IFolder) => {
        // Search Filter Logic
        if (searchResult.visibleFolderIds && !searchResult.visibleFolderIds.has(folder.id)) return null;

        // Busca filhos
        const subFolders = folders.filter(f => f.parentId === folder.id);
        const folderTests = testCases.filter(t => t.folderId === folder.id);

        // Checkbox Logic: Are all tests in this folder selected?
        const allTestsInThisFolder = getTestsInFolderRecursive(folder.id);
        const hasTests = allTestsInThisFolder.length > 0;
        const allSelected = hasTests && allTestsInThisFolder.every(id => selectedTestIds.has(id));
        const someSelected = hasTests && !allSelected && allTestsInThisFolder.some(id => selectedTestIds.has(id));

        // Force expand if searching
        const isExpanded = searchResult.visibleFolderIds ? true : folder.isExpanded;

        return (
            <div
                key={folder.id}
                className={`pl-1 space-y-1 transition-all rounded-lg
           ${dragOverId === folder.id ? 'bg-slate-800/50' : ''}
        `}
                draggable
                onDragStart={(e) => handleFolderDragStart(e, folder.id)}
                onDragOver={(e) => handleDragOver(e, folder.id)}
                onDrop={(e) => handleDropOnFolder(e, folder.id)}
            >
                <div
                    className={`flex items-center gap-2 px-2 py-1.5 group hover:text-white cursor-pointer rounded-lg hover:bg-slate-800 border border-transparent
             ${dragOverId === folder.id && (draggedFolderId || draggedTestId) ? 'border-blue-500 bg-slate-800' : ''}
             ${draggedFolderId === folder.id ? 'opacity-40' : ''}
          `}
                    onClick={() => toggleFolder(folder.id)}
                >
                    {isExpanded ? <FolderOpen size={16} className="text-amber-400 shrink-0" /> : <Folder size={16} className="text-amber-500 shrink-0" />}

                    {isSidebarOpen && (
                        <div className="flex-1 flex items-center justify-between min-w-0 relative gap-2">
                            <input
                                value={folder.name}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setFolders(prev => prev.map(f => f.id === folder.id ? { ...f, name: e.target.value } : f))}
                                className="bg-transparent border-none text-[11px] font-bold outline-none truncate focus:text-white flex-1 min-w-0"
                            />

                            {/* Folder Checkbox */}
                            {hasTests && (
                                <div
                                    onClick={(e) => { e.stopPropagation(); toggleFolderSelection(folder.id); }}
                                    className="cursor-pointer text-slate-500 hover:text-white"
                                >
                                    {allSelected ? <CheckSquare size={12} className="text-blue-400" /> :
                                        someSelected ? <div className="w-3 h-3 bg-blue-900 border border-blue-400 rounded-sm flex items-center justify-center"><div className="w-1.5 h-1.5 bg-blue-400 rounded-[1px]" /></div> :
                                            <Square size={12} className="opacity-50" />}
                                </div>
                            )}

                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                {/* Folder Context Menu */}
                                <div className="relative">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === folder.id ? null : folder.id); }}
                                        className="p-1 hover:text-blue-300 rounded"
                                    >
                                        <MoreVertical size={12} />
                                    </button>
                                    {activeMenuId === folder.id && (
                                        <div className="absolute right-0 top-full mt-1 w-36 bg-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-hidden z-50 flex flex-col p-1 animate-in zoom-in-95 duration-200">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); createNewTest(folder.id); }}
                                                className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-slate-700 hover:text-white rounded-lg text-left"
                                            >
                                                <FilePlus size={10} /> Novo Teste
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); createNewFolder(folder.id); }}
                                                className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-slate-700 hover:text-white rounded-lg text-left"
                                            >
                                                <FolderPlus size={10} /> Nova Subpasta
                                            </button>
                                            {folder.parentId && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); moveFolderToRoot(folder.id); }}
                                                    className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-slate-700 hover:text-white rounded-lg text-left"
                                                >
                                                    <CornerDownRight size={10} /> Mover para Raiz
                                                </button>
                                            )}
                                            <div className="h-px bg-slate-700 my-1"></div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setDeleteFolderId(folder.id); setActiveMenuId(null); }}
                                                className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-rose-400 hover:bg-rose-900/30 rounded-lg text-left"
                                            >
                                                <Trash2 size={10} /> Excluir Pasta
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {isExpanded && isSidebarOpen && (
                    <div className="ml-2 pl-2 border-l border-slate-800 space-y-1 animate-in fade-in slide-in-from-left-2">
                        {/* Render Subfolders Recursively */}
                        {subFolders.map(renderFolderNode)}

                        {/* Render Tests inside this folder */}
                        {folderTests.map(renderTestItem)}

                        {!searchTerm && (
                            <button
                                onClick={() => createNewTest(folder.id)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] hover:bg-slate-800 transition-colors opacity-50 hover:opacity-100 ml-2"
                            >
                                <Plus size={10} /> Adicionar nesta pasta
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // --- LOADER SCREEN ---
    if (!isDataLoaded) {
        return (
            <div className="flex h-screen w-screen bg-slate-900 items-center justify-center flex-col gap-4">
                <Loader2 size={40} className="text-blue-500 animate-spin" />
                <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Carregando Biblioteca...</p>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden select-none">
            {/* Sidebar */}
            <aside
                ref={sidebarRef}
                className={`bg-slate-900 text-slate-400 flex flex-col border-r border-white/5 shrink-0 relative
          ${isResizing ? 'transition-none select-none' : 'transition-all duration-300'}
        `}
                style={{ width: isSidebarOpen ? sidebarWidth : 64 }}
            >
                {/* Resizer Handle */}
                {isSidebarOpen && (
                    <div
                        onMouseDown={startResizing}
                        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-500/50 z-50 transition-colors"
                    />
                )}

                <div className="p-4 border-b border-slate-800 flex flex-col gap-3 overflow-hidden">
                    <div className="flex items-center justify-between">
                        {isSidebarOpen && <span className="font-black text-white text-xs tracking-widest uppercase shrink-0 italic truncate">AutoQA Studio</span>}
                        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1 hover:text-white transition-colors shrink-0">
                            {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
                        </button>
                    </div>

                    {isSidebarOpen && (
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none">
                                <Search size={12} className="text-slate-500 group-focus-within:text-blue-400" />
                            </div>
                            <input
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Buscar..."
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 pl-7 pr-7 text-[11px] font-bold text-slate-300 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute inset-y-0 right-2 flex items-center text-slate-600 hover:text-white"
                                >
                                    <X size={10} />
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <nav className="p-2 space-y-1">
                    <button onClick={() => setActiveTab('editor')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'editor' ? 'bg-white/10 text-white' : 'hover:bg-white/5'}`}>
                        <Edit3 size={16} /> {isSidebarOpen && 'Editor'}
                    </button>
                    <button onClick={() => setActiveTab('reports')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'reports' ? 'bg-white/10 text-white' : 'hover:bg-white/5'}`}>
                        <BarChart3 size={16} /> {isSidebarOpen && 'Relatórios'}
                    </button>

                    {/* Run All / Cancel Button */}
                    {isSidebarOpen && (
                        isRunning ? (
                            <button
                                onClick={stopExecution}
                                className="mt-2 w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all bg-rose-900/50 text-rose-400 hover:bg-rose-900 hover:text-white border border-rose-900 animate-pulse"
                            >
                                <Square size={16} fill="currentColor" /> Cancelar Agora
                            </button>
                        ) : (
                            <button
                                onClick={runAllSequence}
                                className="mt-2 w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all bg-emerald-900/50 text-emerald-400 hover:bg-emerald-900 hover:text-white border border-emerald-900"
                            >
                                <PlayCircle size={16} /> {selectedTestIds.size > 0 ? `Rodar Selecionados (${selectedTestIds.size})` : 'Rodar Sequência'}
                            </button>
                        )
                    )}
                </nav>

                <div className="flex-1 p-2 space-y-2 overflow-y-auto overflow-x-hidden">
                    {!searchTerm && (
                        <div className="flex items-center justify-between px-2 mt-4">
                            {isSidebarOpen ? (
                                <div className="flex items-center gap-2 cursor-pointer hover:text-white" onClick={toggleSelectAll}>
                                    {testCases.length > 0 && selectedTestIds.size === testCases.length ? (
                                        <CheckSquare size={14} className="text-blue-400" />
                                    ) : (
                                        <Square size={14} className="opacity-50" />
                                    )}
                                    <p className="text-[10px] font-bold uppercase text-slate-500 tracking-tighter hover:text-slate-300">Marcar Tudo</p>
                                </div>
                            ) : (
                                <div className="w-full h-4"></div> // Spacer
                            )}

                            <div className="flex gap-1">
                                {isSidebarOpen && (
                                    <>
                                        <button onClick={() => toggleAllFolders(true)} className="p-1 hover:text-white" title="Expandir Tudo"><ChevronsDown size={14} /></button>
                                        <button onClick={() => toggleAllFolders(false)} className="p-1 hover:text-white" title="Recolher Tudo"><ChevronsUp size={14} /></button>
                                    </>
                                )}
                                <button onClick={() => createNewFolder()} className="p-1 hover:text-blue-400" title="Nova Pasta"><FolderPlus size={16} /></button>
                                <button onClick={() => createNewTest()} className="p-1 hover:text-blue-400" title="Novo Teste"><Plus size={16} /></button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-1 pb-10">
                        {/* Render Root Folders Recursively */}
                        {folders.filter(f => !f.parentId).map(renderFolderNode)}

                        {isSidebarOpen && !searchTerm && <div className="h-px bg-slate-800 my-2 mx-2" />}

                        {/* Render Orphans (Root Tests) */}
                        {testCases.filter(tc => !tc.folderId).map(renderTestItem)}
                    </div>
                </div>

                {/* Sidebar Footer - Configurações */}
                <div className="p-2 border-t border-slate-800 shrink-0 bg-slate-900">
                    <button onClick={openSettings} className="w-full flex items-center justify-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-all hover:bg-slate-800">
                        <Settings size={16} /> {isSidebarOpen && 'Configurações'}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
                <header className="h-12 bg-white border-b flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
                    <div className="flex items-center gap-4 flex-1 mr-4 min-w-0">
                        <div className="flex flex-col w-full">
                            <input
                                value={activeTab === 'editor' ? activeTest?.name || '' : 'Dashboard de Relatórios'}
                                readOnly={activeTab !== 'editor'}
                                onChange={(e) => updateActiveTest({ name: e.target.value })}
                                className={`font-black text-slate-800 text-base bg-transparent border-none focus:ring-0 p-0 outline-none w-full ${activeTab !== 'editor' ? 'pointer-events-none' : ''}`}
                            />
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                {activeTab === 'editor' ? 'Edição do Fluxo de Automação' : 'Visualização Consolidada'}
              </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                        {activeTab === 'editor' && (
                            <>
                                {/* Session Controls */}
                                <div className="flex items-center gap-2 mr-4 border-r pr-4 border-slate-200">
                                    <label className={`flex items-center gap-2 text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg cursor-pointer transition-colors border ${activeTest?.persistSession ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'text-slate-400 border-transparent hover:bg-slate-100'}`}>
                                        <input
                                            type="checkbox"
                                            checked={activeTest?.persistSession || false}
                                            onChange={(e) => updateActiveTest({ persistSession: e.target.checked })}
                                            className="hidden"
                                        />
                                        <Database size={12} /> Gravar Sessão (Login)
                                    </label>

                                    <label className={`flex items-center gap-2 text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg cursor-pointer transition-colors border ${activeTest?.useSession ? 'bg-amber-50 text-amber-600 border-amber-200' : 'text-slate-400 border-transparent hover:bg-slate-100'}`}>
                                        <input
                                            type="checkbox"
                                            checked={activeTest?.useSession || false}
                                            onChange={(e) => updateActiveTest({ useSession: e.target.checked })}
                                            className="hidden"
                                        />
                                        <Cookie size={12} /> Usar Sessão
                                    </label>
                                </div>

                                <button
                                    onClick={runTest}
                                    disabled={isRunning}
                                    className={`flex items-center gap-2 px-5 py-2 rounded-full font-bold text-xs text-white transition-all transform active:scale-95 ${isRunning ? 'bg-slate-300' : 'bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-500/20'}`}
                                >
                                    <Play size={14} fill="currentColor" /> {isRunning ? 'Rodando...' : 'Rodar Teste'}
                                </button>
                            </>
                        )}
                    </div>
                </header>

                <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
                    {activeTab === 'editor' ? (
                        activeTest ? (
                            <>
                                <div className="flex-1 min-h-0">
                                    <StepEditor
                                        steps={activeTest.steps}
                                        onUpdateSteps={(s) => updateActiveTest({ steps: s })}
                                        elementMap={elementMap}
                                        onUpdateElementMap={setElementMap}
                                        onRequestNewField={(idx) => {
                                            setNewFieldData({ ...newFieldData, stepIndex: idx });
                                            setIsCreatingNewCategory(false);
                                            setIsNewFieldModalOpen(true);
                                        }}
                                        onEditElement={openEditElementModal}
                                        onDeleteElement={(name) => setDeleteElementId(name)}
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
                                <Edit3 size={48} className="opacity-20" />
                                <p className="font-bold">Selecione ou crie um cenário para começar.</p>
                            </div>
                        )
                    ) : (
                        <ReportsView reports={reports} testCases={testCases} />
                    )}

                    <div className={`${isConsoleOpen ? 'h-48' : 'h-10'} transition-all duration-300 bg-slate-950 rounded-2xl flex flex-col overflow-hidden border border-slate-800 shadow-2xl`}>
                        <div className="h-10 bg-slate-900/50 px-6 flex items-center justify-between cursor-pointer" onClick={() => setIsConsoleOpen(!isConsoleOpen)}>
                            <div className="flex items-center gap-2">
                                <Terminal size={14} className="text-blue-400" />
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Console de Saída</span>
                            </div>
                            <ChevronLeft size={16} className={`transition-transform text-slate-500 ${isConsoleOpen ? '-rotate-90' : 'rotate-90'}`} />
                        </div>
                        {isConsoleOpen && <LogConsole logs={logs} onClear={() => setLogs([])} />}
                    </div>
                </div>
            </main>

            {/* --- MODALS --- */}
            {/* Settings Modal */}
            {isSettingsModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                    <Settings size={16} className="text-slate-500"/> Configurações Gerais
                                </h3>
                            </div>
                            <button onClick={() => setIsSettingsModalOpen(false)} className="p-1 hover:bg-slate-200 rounded-full text-slate-400 transition-colors">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <Database size={12} className="text-blue-500" /> Status do Banco de Dados
                                </label>
                                <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                                    {dbConnected === null ? (
                                        <Loader2 size={16} className="animate-spin text-slate-400" />
                                    ) : dbConnected ? (
                                        <>
                                            <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                                            <span className="text-sm font-bold text-emerald-700">Conectado (MongoDB)</span>
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"></div>
                                            <span className="text-sm font-bold text-rose-700">Desconectado</span>
                                        </>
                                    )}
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <Globe size={12} className="text-blue-500" /> URL Global do Projeto
                                </label>
                                <input
                                    type="text"
                                    value={baseUrl}
                                    onChange={(e) => setBaseUrl(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold text-sm text-slate-700 outline-none hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                                    placeholder="https://sua-url-padrao.com"
                                />
                                <p className="text-[10px] text-slate-400 font-medium ml-1">
                                    Ex: Usado onde for o Start URL principal do sistema.
                                </p>
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 flex justify-end">
                            <button
                                onClick={() => setIsSettingsModalOpen(false)}
                                className="px-6 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 active:scale-95 transition-all"
                            >
                                Concluir
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Existing Modals code remains identical (Edit Element, New Field, Delete Test, Delete Folder, Move Test, Delete Element) */}

            {/* Edit Element Modal */}
            {editingElement && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 border-b border-slate-100">
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Editar Elemento</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Elemento</label>
                                <input
                                    autoFocus
                                    value={editingElement.newName}
                                    onChange={e => setEditingElement({...editingElement, newName: e.target.value})}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</label>
                                {!isEditingNewCategory ? (
                                    <select
                                        value={editingElement.newCategory}
                                        onChange={(e) => {
                                            if(e.target.value === '___NEW___') {
                                                setIsEditingNewCategory(true);
                                                setEditingElement({...editingElement, newCategory: ''});
                                            } else {
                                                setEditingElement({...editingElement, newCategory: e.target.value});
                                            }
                                        }}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                                    >
                                        {existingCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                        <option value="___NEW___" className="text-blue-600 font-black">+ (Nova Categoria...)</option>
                                    </select>
                                ) : (
                                    <div className="flex gap-2">
                                        <input
                                            autoFocus
                                            value={editingElement.newCategory}
                                            onChange={e => setEditingElement({...editingElement, newCategory: e.target.value})}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                                            placeholder="Digite o nome da nova categoria..."
                                        />
                                        <button
                                            onClick={() => setIsEditingNewCategory(false)}
                                            className="px-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-500"
                                            title="Voltar para lista"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 flex gap-3">
                            <button onClick={() => setEditingElement(null)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-200">Cancelar</button>
                            <button
                                onClick={handleRenameElement}
                                disabled={!editingElement.newName}
                                className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* New Field Modal */}
            {isNewFieldModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Mapear Novo Elemento</h3>
                            <button onClick={() => setIsNewFieldModalOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"><X size={20}/></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome Amigável</label>
                                <input
                                    autoFocus
                                    value={newFieldData.name}
                                    onChange={e => setNewFieldData({...newFieldData, name: e.target.value})}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                                    placeholder="Ex: Botão de Login"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</label>
                                {!isCreatingNewCategory ? (
                                    <select
                                        value={newFieldData.category}
                                        onChange={(e) => {
                                            if(e.target.value === '___NEW___') {
                                                setIsCreatingNewCategory(true);
                                                setNewFieldData({...newFieldData, category: ''});
                                            } else {
                                                setNewFieldData({...newFieldData, category: e.target.value});
                                            }
                                        }}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                                    >
                                        <option value="">Selecione...</option>
                                        {existingCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                        <option value="___NEW___" className="text-blue-600 font-black">+ (Nova Categoria...)</option>
                                    </select>
                                ) : (
                                    <div className="flex gap-2">
                                        <input
                                            autoFocus
                                            value={newFieldData.category}
                                            onChange={e => setNewFieldData({...newFieldData, category: e.target.value})}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                                            placeholder="Digite o nome da nova categoria..."
                                        />
                                        <button
                                            onClick={() => setIsCreatingNewCategory(false)}
                                            className="px-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-500"
                                            title="Voltar para lista"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Campo TID */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                        <Fingerprint size={10} /> TID (Atributo)
                                    </label>
                                    <input
                                        value={newFieldData.tid}
                                        disabled={!!newFieldData.selector}
                                        onChange={e => setNewFieldData({...newFieldData, tid: e.target.value, selector: ''})}
                                        className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500/20 ${!!newFieldData.selector ? 'opacity-50 cursor-not-allowed bg-slate-100' : 'text-emerald-700 font-bold'}`}
                                        placeholder="Ex: login_usuario"
                                    />
                                </div>

                                {/* Campo CSS/XPath */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                        <Code2 size={10} /> CSS ou XPath
                                    </label>
                                    <input
                                        value={newFieldData.selector}
                                        disabled={!!newFieldData.tid}
                                        onChange={e => setNewFieldData({...newFieldData, selector: e.target.value, tid: ''})}
                                        className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500/20 ${!!newFieldData.tid ? 'opacity-50 cursor-not-allowed bg-slate-100' : 'text-slate-700'}`}
                                        placeholder="#id ou //xpath"
                                    />
                                </div>
                            </div>

                        </div>
                        <div className="p-6 bg-slate-50 flex gap-3">
                            <button onClick={() => setIsNewFieldModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition-colors">Cancelar</button>
                            <button
                                onClick={handleCreateNewField}
                                disabled={!newFieldData.name || (!newFieldData.selector && !newFieldData.tid)}
                                className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all disabled:bg-slate-300 disabled:shadow-none"
                            >
                                Salvar Elemento
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Test Modal */}
            {deleteConfirmId && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="p-8 text-center">
                            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4"><AlertTriangle size={32} /></div>
                            <h3 className="text-lg font-black text-slate-800 mb-2">Excluir Cenário?</h3>
                            <p className="text-sm text-slate-500">Apagar permanentemente este teste.</p>
                        </div>
                        <div className="flex p-4 gap-3 bg-slate-50">
                            <button onClick={() => setDeleteConfirmId(null)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-200">Cancelar</button>
                            <button onClick={confirmDeleteTest} className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-200">Excluir</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Folder Modal */}
            {deleteFolderId && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="p-8 text-center">
                            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4"><Folder size={32} /></div>
                            <h3 className="text-lg font-black text-slate-800 mb-2">Excluir Pasta?</h3>
                            <p className="text-sm text-slate-500 leading-relaxed">A pasta e todo o seu conteúdo (testes e subpastas) serão excluídos permanentemente.</p>
                        </div>
                        <div className="flex p-4 gap-3 bg-slate-50">
                            <button onClick={() => setDeleteFolderId(null)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-200">Cancelar</button>
                            <button onClick={deleteFolder} className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-200">Sim, Excluir</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Move Test Modal */}
            {moveTestId && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Mover Cenário</h3>
                            <button onClick={() => setMoveTestId(null)} className="p-1 text-slate-400 hover:text-slate-600"><X size={20}/></button>
                        </div>
                        <div className="p-4 space-y-1 max-h-60 overflow-y-auto">
                            <button
                                onClick={() => moveTestToFolder(moveTestId, undefined)}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 font-bold text-slate-600 text-sm transition-colors border border-transparent hover:border-slate-200"
                            >
                                <Globe size={16} /> Raiz (Sem Pasta)
                            </button>
                            {folders.map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => moveTestToFolder(moveTestId, f.id)}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-amber-50 font-bold text-amber-700 text-sm transition-colors border border-transparent hover:border-amber-200"
                                >
                                    <Folder size={16} /> {f.name} {f.parentId && <span className="opacity-50 text-[10px] ml-1">(Subpasta)</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Element Confirm Modal */}
            {deleteElementId && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
                        <div className="p-8 text-center">
                            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4"><Trash2 size={32} /></div>
                            <h3 className="text-lg font-black text-slate-800 mb-2">Excluir Elemento?</h3>
                            <p className="text-sm text-slate-500">
                                O elemento <strong>"{deleteElementId}"</strong> será removido. Passos que o utilizam ficarão sem referência.
                            </p>
                        </div>
                        <div className="flex p-4 gap-3 bg-slate-50">
                            <button onClick={() => setDeleteElementId(null)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-200">Cancelar</button>
                            <button onClick={handleDeleteElement} className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-200">Excluir</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
