
export enum ActionType {
  TYPE = 'DIGITAR',
  CLICK = 'CLICAR',
  WAIT = 'ESPERAR',
  WAIT_FOR = 'ESPERAR_QUE',
  VALIDATE_TEXT = 'VALIDAR_TEXTO',
  VALIDATE_FILLED = 'VALIDAR_PREENCHIMENTO',
  VALIDATE_DISABLED = 'VALIDAR_DESABILITADO',
  SMART_SELECT = 'DIGITAR_E_SELECIONAR'
}

export enum ConditionType {
  CONTAINS = 'CONTEM',
  EQUALS = 'IGUAL',
  NOT_EQUALS = 'DIFERENTE',
  STARTS_WITH = 'COMECA_COM',
  ENDS_WITH = 'TERMINA_COM',
  GREATER_THAN = 'MAIOR_QUE',
  LESS_THAN = 'MENOR_QUE',
  REGEX = 'REGEX'
}

export interface TestStep {
  id: string;
  order: number;
  action: ActionType;
  field: string;
  value: string;
  condition?: ConditionType;
  targetType?: string;
}

export interface Folder {
  id: string;
  name: string;
  isExpanded: boolean;
  parentId?: string;
}

export interface TestCase {
  id: string;
  name: string;
  startUrl: string;
  browser: 'Chrome' | 'Firefox' | 'Edge';
  steps: TestStep[];
  folderId?: string;
  persistSession?: boolean;
  useSession?: boolean;
}

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'ERROR' | 'SUCCESS';
  message: string;
}

export interface PageElement {
  friendlyName: string;
  selector: string;
  type: 'input' | 'button' | 'text';
  by?: 'css' | 'xpath';
  category?: string; // Nova propriedade para agrupamento
}

export interface StepExecutionResult {
  stepId: string;
  status: 'SUCCESS' | 'ERROR';
  message?: string;
  duration?: number;
  action?: string;
  field?: string;
  value?: string;
}

export interface TestReport {
  id: string;
  testCaseId: string;
  testName: string;
  timestamp: string;
  status: 'PASSED' | 'FAILED';
  duration: number;
  steps: StepExecutionResult[];
  errorMessage?: string;
}
