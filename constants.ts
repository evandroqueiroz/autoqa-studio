
import { PageElement, TestCase, ActionType } from './types.ts';

/**
 * 🛠️ PASSO 1: MAPEAMENTO DE ELEMENTOS
 * Adicione aqui os campos do seu sistema real.
 * friendlyName: Nome que aparece no seletor da tela.
 * selector: Seletor CSS ou XPath.
 * by: 'css' (padrão) ou 'xpath'.
 */
export const ELEMENT_MAP: PageElement[] = [
  // Exemplo de Cookie
  { friendlyName: 'Botão Cookies', selector: "//button[contains(., 'Aceitar') or contains(., 'Concordar')]", type: 'button', by: 'xpath', category: 'Geral' },

  // Campos de Login
  { friendlyName: 'Campo Usuário', selector: '[tid="login_usuario"]', type: 'input', category: 'Página de Login' },
  { friendlyName: 'Campo Senha', selector: '[tid="login_senha"]', type: 'input', category: 'Página de Login' },
  { friendlyName: 'Botão Entrar', selector: '[tid="login_btn_entrar_prosseguir"]', type: 'button', category: 'Página de Login' },

  // Exemplo de botão sem ID
  { friendlyName: 'Botão Fechar', selector: "//button[contains(., 'Fechar')]", type: 'button', category: 'Modais' },

  // Elementos Pós-Login
  { friendlyName: 'Menu Lateral', selector: '.menu-container', type: 'button', category: 'Navegação' },
  { friendlyName: 'Título da Home', selector: 'h1.page-title', type: 'text', category: 'Home' },
];

export const INITIAL_TEST_CASE: TestCase = {
  id: 'test-1',
  name: 'Cenário: Login e Acesso Principal',
  startUrl: 'https://eps-dev.cloud.el.com.br/ServerExec/acessoBase/',
  browser: 'Chrome',
  steps: [
    { id: 'step-1', order: 1, action: ActionType.TYPE, field: 'Campo Usuário', value: 'evandro.queiroz' },
    { id: 'step-2', order: 2, action: ActionType.TYPE, field: 'Campo Senha', value: '200%Smart' },
    { id: 'step-3', order: 3, action: ActionType.CLICK, field: 'Botão Entrar', value: '' },
    { id: 'step-4', order: 4, action: ActionType.WAIT, field: '', value: '2000' },
  ]
};
