
import express from 'express';
import cors from 'cors';
import { Builder, By, until, Key } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

// --- Persistence Configuration ---
const STORAGE_DIR = path.join(process.cwd(), 'storage');
const TESTS_DIR = path.join(STORAGE_DIR, 'tests');
const GLOBAL_FILE = path.join(STORAGE_DIR, 'global.json');

// Garante que a estrutura de pastas existe ao iniciar
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR);
if (!fs.existsSync(TESTS_DIR)) fs.mkdirSync(TESTS_DIR);

// --- Global Driver (Singleton) ---
let globalDriver = null;
let sessionCookies = [];

// --- Persistence Endpoints ---

app.get('/load-config', (req, res) => {
  try {
    // 1. Carrega Configurações Globais (Elementos, Pastas, ORDEM e URL GLOBAL)
    let globalData = { elementMap: [], folders: [], testOrder: [], baseUrl: '' };
    if (fs.existsSync(GLOBAL_FILE)) {
      try {
        const rawGlobal = fs.readFileSync(GLOBAL_FILE, 'utf8');
        globalData = JSON.parse(rawGlobal);
      } catch (e) {
        console.error("Erro ao ler global.json:", e.message);
      }
    }

    // 2. Carrega cada arquivo de teste individualmente (sem ordem garantida pelo SO)
    const loadedTestsMap = new Map();
    if (fs.existsSync(TESTS_DIR)) {
      const files = fs.readdirSync(TESTS_DIR);
      files.forEach(file => {
        if (file.endsWith('.json')) {
          try {
            const content = fs.readFileSync(path.join(TESTS_DIR, file), 'utf8');
            const test = JSON.parse(content);
            if (test.id) {
              loadedTestsMap.set(test.id, test);
            }
          } catch (e) {
            console.error(`Erro ao ler teste ${file}:`, e.message);
          }
        }
      });
    }

    // 3. Reconstrói o array de testes baseado na ordem salva (testOrder)
    const finalTestCases = [];
    const savedOrder = globalData.testOrder || [];

    // Adiciona os testes na ordem que foram salvos
    savedOrder.forEach(id => {
      if (loadedTestsMap.has(id)) {
        finalTestCases.push(loadedTestsMap.get(id));
        loadedTestsMap.delete(id); // Remove do mapa para saber o que sobrou
      }
    });

    // Adiciona quaisquer testes restantes (que existam no disco mas não na lista de ordem)
    loadedTestsMap.forEach(test => {
      finalTestCases.push(test);
    });

    res.json({
      testCases: finalTestCases,
      elementMap: globalData.elementMap || [],
      folders: globalData.folders || [],
      baseUrl: globalData.baseUrl || '' // Retorna a URL Global
    });

  } catch (e) {
    console.error("Erro fatal no load-config:", e);
    res.status(500).json({ error: "Erro ao carregar configurações." });
  }
});

app.post('/save-config', (req, res) => {
  try {
    const { testCases, elementMap, folders, baseUrl } = req.body;

    // Extrai a ordem atual dos testes (IDs) para salvar no global
    const testOrder = testCases.map(t => t.id);

    // 1. Salva Configurações Globais incluindo a ORDEM e BASEURL
    fs.writeFileSync(GLOBAL_FILE, JSON.stringify({ elementMap, folders, testOrder, baseUrl }, null, 2));

    // 2. Salva Testes Individuais
    const currentIds = new Set();

    testCases.forEach(test => {
      if (test && test.id) {
        currentIds.add(test.id);
        const filePath = path.join(TESTS_DIR, `${test.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(test, null, 2));
      }
    });

    // 3. Limpeza (Garbage Collection)
    if (fs.existsSync(TESTS_DIR)) {
      const existingFiles = fs.readdirSync(TESTS_DIR);
      existingFiles.forEach(file => {
        if (file.endsWith('.json')) {
          const id = file.replace('.json', '');
          if (!currentIds.has(id)) {
            fs.unlinkSync(path.join(TESTS_DIR, file));
          }
        }
      });
    }

    res.json({ success: true });
  } catch (e) {
    console.error("Erro ao salvar:", e);
    res.status(500).json({ error: "Erro ao salvar arquivo de armazenamento." });
  }
});

// --- Endpoint para Resetar/Fechar o Navegador Manualmente ---
app.post('/reset-driver', async (req, res) => {
  if (globalDriver) {
    try {
      await globalDriver.quit();
    } catch (e) {
      console.log("Erro ao fechar driver (já estava fechado?)", e.message);
    }
    globalDriver = null;
  }
  res.json({ success: true, message: "Navegador fechado e reiniciado." });
});

// --- Endpoint para Parada DE EMERGÊNCIA (Kill Switch) ---
app.post('/stop-test', async (req, res) => {
  console.log("🛑 SOLICITAÇÃO DE PARADA DE EMERGÊNCIA RECEBIDA");
  if (globalDriver) {
    try {
      // Ao dar quit(), qualquer comando pendente no /run-test vai lançar exceção
      // e liberar a thread do teste.
      await globalDriver.quit();
      console.log("🛑 Driver eliminado com sucesso.");
    } catch (e) {
      console.log("Erro ao matar driver:", e.message);
    }
    globalDriver = null;
  }
  res.json({ success: true, message: "Execução abortada no servidor." });
});


// --- Helpers de Variáveis Dinâmicas ---

function getFormattedDate(date) {
  const d = new Date(date);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function getYear(date) {
  return new Date(date).getFullYear();
}

function getFormattedDateTime(date, withSeconds = true) {
  const d = new Date(date);
  const pad = (n) => n.toString().padStart(2, '0');
  let str = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (withSeconds) {
    str += `:${pad(d.getSeconds())}`;
  }
  return str;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function processDynamicValue(value) {
  if (!value) return value;
  let finalValue = value;

  const now = new Date();

  if (finalValue.includes('{HOJE}')) {
    finalValue = finalValue.replace(/{HOJE}/g, getFormattedDate(now));
  }
  if (finalValue.includes('{ANO_HOJE}')) {
    finalValue = finalValue.replace(/{ANO_HOJE}/g, getYear(now));
  }
  if (finalValue.includes('{AMANHA}')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    finalValue = finalValue.replace(/{AMANHA}/g, getFormattedDate(tomorrow));
  }
  if (finalValue.includes('{ONTEM}')) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    finalValue = finalValue.replace(/{ONTEM}/g, getFormattedDate(yesterday));
  }
  if (finalValue.includes('{AGORA}')) {
    finalValue = finalValue.replace(/{AGORA}/g, getFormattedDateTime(now, true));
  }
  if (finalValue.includes('{AGORA_SEM_SEGUNDOS}')) {
    finalValue = finalValue.replace(/{AGORA_SEM_SEGUNDOS}/g, getFormattedDateTime(now, false));
  }
  if (finalValue.includes('{AGORA_REGEX}')) {
    const datePart = getFormattedDateTime(now, false);
    const escapedDate = escapeRegExp(datePart);
    finalValue = finalValue.replace(/{AGORA_REGEX}/g, `REGEX:${escapedDate}:\\d{2}`);
  }
  if (finalValue.includes('{ALEATORIO_NUM}')) {
    const randomNum = Math.floor(1000 + Math.random() * 9000); // Gera entre 1000 e 9999
    finalValue = finalValue.replace(/{ALEATORIO_NUM}/g, randomNum.toString());
  }

  return finalValue;
}

function checkCondition(actual, expected, condition) {
  const act = (actual || '').toString().trim();
  const exp = (expected || '').toString().trim();
  const actLower = act.toLowerCase();
  const expLower = exp.toLowerCase();

  const actNum = parseFloat(act.replace(',', '.'));
  const expNum = parseFloat(exp.replace(',', '.'));
  const isNumeric = !isNaN(actNum) && !isNaN(expNum);

  switch (condition) {
    case 'IGUAL':
      if (act !== exp) throw new Error(`Esperado igual a "${exp}", encontrado "${act}"`);
      break;
    case 'DIFERENTE':
      if (act === exp) throw new Error(`Esperado diferente de "${exp}", mas encontrou igual.`);
      break;
    case 'CONTEM': // Default logic
    default:
      if (!actLower.includes(expLower)) throw new Error(`Esperado conter "${exp}", encontrado "${act}"`);
      break;
    case 'NAO_CONTEM':
      if (actLower.includes(expLower)) throw new Error(`Não deveria conter "${exp}", mas contém.`);
      break;
    case 'COMECA_COM':
      if (!actLower.startsWith(expLower)) throw new Error(`Esperado começar com "${exp}", encontrado "${act}"`);
      break;
    case 'TERMINA_COM':
      if (!actLower.endsWith(expLower)) throw new Error(`Esperado terminar com "${exp}", encontrado "${act}"`);
      break;
    case 'MAIOR_QUE':
      if (!isNumeric) throw new Error("Validação numérica falhou: Valores não são números.");
      if (!(actNum > expNum)) throw new Error(`Esperado ${actNum} > ${expNum}`);
      break;
    case 'MENOR_QUE':
      if (!isNumeric) throw new Error("Validação numérica falhou: Valores não são números.");
      if (!(actNum < expNum)) throw new Error(`Esperado ${actNum} < ${expNum}`);
      break;
    case 'REGEX':
      const regex = new RegExp(exp);
      if (!regex.test(act)) throw new Error(`Padrão Regex "${exp}" não encontrado em "${act}"`);
      break;
  }
}

// --- Selenium Engine ---

function resolveBy(elementInfo, fallbackSelector) {
  const selector = (elementInfo?.selector || fallbackSelector || '').trim();

  if (!selector) return null;

  if (selector.startsWith('LABEL:')) {
    const labelText = selector.replace('LABEL:', '').trim();
    return By.xpath(`(//*[contains(text(), '${labelText}')])[last()]/following::input[1]`);
  }

  if (selector.startsWith('//') || selector.startsWith('(')) {
    return By.xpath(selector);
  }

  // --- AUTOMAGIC TID SELECTOR ---
  // Se for uma string simples (letras, números, hífens, underscore, pontos, dois pontos), assume que é um TID.
  // Evita conflito com CSS classes (iniciam com .), IDs (#), atributos ([) ou hierarquia (space, >)
  // ATENÇÃO: Permite pontos e dois pontos no meio da string, mas não no início (para não confundir com classes)
  if (/^[a-zA-Z0-9][a-zA-Z0-9_\-\.:]*$/.test(selector)) {
    // Ex: "login_usuario" -> [tid="login_usuario"]
    // Ex: "AlEntrada.numeroDocumento" -> [tid="AlEntrada.numeroDocumento"]
    return By.css(`[tid="${selector}"]`);
  }

  const by = elementInfo?.by || 'css';
  return by === 'xpath' ? By.xpath(selector) : By.css(selector);
}

async function ensureInput(element) {
  const tagName = await element.getTagName();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return element;
  }
  try {
    return await element.findElement(By.css('input, textarea, select, button'));
  } catch (e) {
    return element;
  }
}

async function clicarDigitar(driver, locator, finalValue) {
  const driverAwait = await driver.wait(until.elementLocated(locator), 10000);
  const input = await ensureInput(driverAwait);
  await input.click();
  const actions = getActions(finalValue);
  for (let index = 0; index < actions.length; index++) {
    await makeAction(driver, input, actions[index]);
  }
}

function getActions(value) {
  return value.match(/\{[^}]+\}|[^{}]+/g) ?? [];
}

async function makeAction(driver, input, action) {
  if (isSleep(action)) {
    let number = getNumber(action);
    return await driver.sleep(number);
  }
  switch (action) {
    case "{CLEAR}":
      return await input.clear();
    case "{ENTER}":
      return await input.sendKeys(Key.ENTER);
    case "{SPACE}":
      return await input.sendKeys(Key.SPACE);
    case "{UP}":
      return await input.sendKeys(Key.UP);
    case "{DOWN}":
      return await input.sendKeys(Key.DOWN);
    case "{LEFT}":
      return await input.sendKeys(Key.LEFT);
    case "{RIGHT}":
      return await input.sendKeys(Key.RIGHT);
    case "{TAB}":
      return await input.sendKeys(Key.TAB);
    default:
      return await input.sendKeys(action);
  }
}

function isSleep(value) {
  return /^\{\d+\}$/.test(value);
}

function getNumber(value) {
  const match = value.match(/^\{(\d+)\}$/);
  return match ? Number(match[1]) : null;
}

async function autoAcceptCookies(driver) {
  const selectors = [
    "//div[contains(@class, 'termo-privacidade')]//*[contains(text(), 'Aceitar')]",
    "//div[contains(@class, 'termo-privacidade')]//button",
    "//button[contains(., 'Aceitar cookies')]",
    ".termo-privacidade button"
  ];
  for (const sel of selectors) {
    try {
      const locator = sel.startsWith('//') ? By.xpath(sel) : By.css(sel);
      const elements = await driver.findElements(locator);
      for (const el of elements) {
        if (await el.isDisplayed()) {
          await driver.executeScript("arguments[0].click();", el);
          await driver.sleep(1000);
          return true;
        }
      }
    } catch (e) {}
  }
  return false;
}

async function resilientClick(driver, locator, value) {
  let targetElement = null;

  try {
    // 1. Aguarda que pelo menos um elemento exista no DOM
    await driver.wait(until.elementLocated(locator), 10000);

    // 2. Busca TODOS os elementos que coincidem com o seletor
    const elements = await driver.findElements(locator);

    // 3. Estratégia de Prioridade para Modais:
    // Itera de TRÁS para FRENTE (do último para o primeiro no DOM).
    // Modais e Overlays geralmente são renderizados no final do <body>.
    // Filtra apenas os que estão VISÍVEIS.
    if (value == null || value === "") {
      for (let i = elements.length - 1; i >= 0; i--) {
        try {
          if (await elements[i].isDisplayed()) {
            targetElement = elements[i];
            break; // Encontrou o último visível (provavelmente o do modal)
          }
        } catch (e) {
          // Ignora StaleElementReferenceException durante a iteração
        }
      }
    } else {
      console.log(`🔄 ${value}`);
      targetElement = elements[Number(value)];
    }
    

    // Se não encontrou nenhum visível na iteração, tenta o padrão (primeiro encontrado)
    if (!targetElement) {
      targetElement = await driver.findElement(locator);
    }

    // 4. Fluxo de Clique Seguro
    await driver.wait(until.elementIsVisible(targetElement), 5000);
    await driver.executeScript("arguments[0].scrollIntoView({block: 'center'});", targetElement);
    await driver.sleep(500); // Pequeno delay para animações de modal terminarem
    await targetElement.click();

  } catch (err) {
    // Fallback: Tentativa de recuperação (Cookies ou JS Click)
    await autoAcceptCookies(driver);
    try {
      // Se falhou o clique normal, tenta pegar o elemento novamente e forçar JS
      // (Usa o primeiro encontrado se a lógica complexa falhou)
      const el = await driver.findElement(locator);
      await driver.executeScript("arguments[0].click();", el);
    } catch(e2) {
      throw err; // Lança o erro original se nada funcionar
    }
  }
}

app.post('/run-test', async (req, res) => {
  const { testCase, elementMap } = req.body;
  const startTime = Date.now();
  const stepResults = [];

  let targetUrl = testCase.startUrl?.trim();
  if (targetUrl && !targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

  try {
    // --- VERIFICAÇÃO DE DRIVER OTIMIZADA ---
    if (globalDriver) {
      try {
        // Tenta um comando leve apenas para ver se está vivo
        await globalDriver.getCurrentUrl();
      } catch (e) {
        console.log("⚠️ Driver antigo parece morto ou fechado. Recriando...");
        globalDriver = null;
      }
    }

    let isFreshInstance = false;
    if (!globalDriver) {
      isFreshInstance = true;
      console.log("🚀 Iniciando novo driver Chrome OTIMIZADO...");
      const options = new chrome.Options();
      options.addArguments('--disable-notifications');
      options.addArguments('--start-maximized'); // Abre já maximizado (mais rápido que comando separado)
      options.addArguments('--no-sandbox'); // Acelera em alguns ambientes
      options.addArguments('--disable-dev-shm-usage'); // Evita crash de memória compartilhada
      options.addArguments('--disable-gpu'); // Se não precisar de aceleração GPU
      options.addArguments('--disable-extensions'); // Remove extensões pesadas
      // options.setPageLoadStrategy('eager'); // Opcional: Não espera carregar todas as imagens para devolver controle (MUITO MAIS RÁPIDO)

      globalDriver = await new Builder()
          .forBrowser('chrome')
          .setChromeOptions(options)
          .build();

      // Removido: await globalDriver.manage().window().maximize(); // Usando --start-maximized
    }

    const driver = globalDriver;

    // Lógica de Navegação
    if (targetUrl) {
      if (!isFreshInstance) {
        console.log(`🔄 Reiniciando para o Menu Principal: ${targetUrl}`);
        await driver.get(targetUrl);
      } else {
        const currentUrl = await driver.getCurrentUrl().catch(() => '');
        if (currentUrl !== targetUrl) {
          await driver.get(targetUrl);
        }
      }
    }

    if (isFreshInstance && testCase.useSession && sessionCookies.length > 0) {
      console.log(`🍪 [Nova Instância] Injetando ${sessionCookies.length} cookies...`);
      for (const cookie of sessionCookies) {
        try {
          const { sameSite, httpOnly, secure, expiry, ...rest } = cookie;
          await driver.manage().addCookie(rest);
        } catch (e) {
          console.warn("Falha ao injetar cookie:", cookie.name);
        }
      }
      await driver.navigate().refresh();
      await driver.sleep(1500);
    }

    await driver.sleep(500);
    await autoAcceptCookies(driver);

    for (const step of testCase.steps) {
      const stepStartTime = Date.now();
      let reportValue = step.value;
      const elementInfo = elementMap.find(el => el.friendlyName === step.field);

      try {
        const locator = resolveBy(elementInfo, step.value); // Passa value como fallback selector
        const finalValue = processDynamicValue(step.value);
        reportValue = finalValue;

        switch (step.action) {
          case 'DIGITAR':
            const containerEl = await driver.wait(until.elementLocated(locator), 10000);
            const input = await ensureInput(containerEl);
            await input.click();
            await input.clear();
            await input.sendKeys(finalValue);
            break;

          case 'CLICAR':
            await resilientClick(driver, locator, finalValue);
            break;

          case 'ESPERAR':
            await driver.sleep(parseInt(finalValue) || 1000);
            break;

          case 'ESPERAR_QUE':
            if (locator) {
              const elWait = await driver.wait(until.elementLocated(locator), 15000);

              if (finalValue && finalValue.trim() !== '') {
                await driver.wait(async () => {
                  try {
                    let text = await elWait.getText();
                    if (!text) text = await driver.executeScript("return arguments[0].value", elWait);
                    if (!text && text !== "") text = await elWait.getAttribute('value');

                    try {
                      checkCondition(text, finalValue, step.condition || 'CONTEM');
                      return true;
                    } catch (err) {
                      return false;
                    }
                  } catch (e) {
                    return false;
                  }
                }, 15000, `Esperando que elemento '${step.field}' satisfaça a condição '${step.condition}' com valor '${finalValue}'`);
              } else {
                await driver.wait(until.elementIsVisible(elWait), 15000);
              }
            } else {
              throw new Error("Seletor inválido para ESPERAR_QUE.");
            }
            break;

          case 'VALIDAR_DESABILITADO':
            const elDisContainer = await driver.wait(until.elementLocated(locator), 10000);
            const elDis = await ensureInput(elDisContainer);
            const isEnabled = await elDis.isEnabled();
            if (isEnabled) throw new Error("Falha: O elemento está habilitado (editável), mas deveria estar desabilitado.");
            break;

          case 'VALIDAR_TEXTO':
            const elContainer = await driver.wait(until.elementLocated(locator), 10000);
            const el = await ensureInput(elContainer);
            let text = await el.getText();
            if (!text) text = await driver.executeScript("return arguments[0].value", el);
            if (!text && text !== "") text = await el.getAttribute('value');

            checkCondition(text, finalValue, step.condition || 'CONTEM');
            break;

          case 'VALIDAR_PREENCHIMENTO':
            const elFilled = await driver.wait(until.elementLocated(locator), 10000);
            let valToCheck = await driver.executeScript("return arguments[0].value", elFilled);
            if (valToCheck === null || valToCheck === undefined) valToCheck = await elFilled.getText();
            const actualLength = (valToCheck || '').length;

            if (!finalValue || finalValue.trim() === '') {
              if (actualLength === 0) throw new Error("O campo está vazio.");
            } else {
              const expectedLength = parseInt(finalValue);
              if (isNaN(expectedLength)) throw new Error(`Para VALIDAR_PREENCHIMENTO, o valor informado deve ser numérico.`);
              checkCondition(actualLength, expectedLength, step.condition || 'IGUAL');
            }
            break;

          case 'DIGITAR_E_ENTER':
            const teste = await driver.wait(until.elementLocated(locator), 10000);
            const inputteste = await ensureInput(teste);
            await inputteste.click();
            await inputteste.clear();
            await inputteste.sendKeys(finalValue);
            await driver.sleep(1000);
            await inputteste.sendKeys(Key.ENTER);
            break;

          case 'DIGITAR_DOWN_E_ENTER':
            const testeDown = await driver.wait(until.elementLocated(locator), 10000);
            const inputtesteDown = await ensureInput(testeDown);
            await inputtesteDown.click();
            await inputtesteDown.clear();
            await inputtesteDown.sendKeys(finalValue);
            await driver.sleep(1000);
            await inputtesteDown.sendKeys(Key.SPACE);
            await driver.sleep(5000);
            await inputtesteDown.sendKeys(Key.DOWN);
            await driver.sleep(1000);
            await inputtesteDown.sendKeys(Key.ENTER);
            break;

          case 'CLICAR_E_DIGITAR':
            await clicarDigitar(driver, locator, finalValue);
            break;

          case 'DIGITAR_E_SELECIONAR':
            const comboContainer = await driver.wait(until.elementLocated(locator), 10000);
            const comboInput = await ensureInput(comboContainer);
            await comboInput.click();
            await comboInput.clear();
            await comboInput.sendKeys(finalValue);
            await driver.sleep(1500);

            let optionXpath;
            const cleanVal = finalValue.replace(/'/g, "");

            switch (step.targetType) {
              case 'button': optionXpath = `//button[contains(., '${cleanVal}')]`; break;
              case 'table': optionXpath = `//td[contains(., '${cleanVal}')]`; break;
              case 'list': optionXpath = `//li[contains(., '${cleanVal}')]`; break;
              case 'div': optionXpath = `//div[contains(., '${cleanVal}')]`; break;
              case 'span': optionXpath = `//span[contains(., '${cleanVal}')]`; break;
              case 'input': optionXpath = `//input[@value='${cleanVal}' or @placeholder='${cleanVal}']`; break;
              default:
                optionXpath = `(//td[contains(@class, 'item') or contains(., '${cleanVal}')] | //li[contains(., '${cleanVal}')] | //div[contains(@class, 'item') and contains(., '${cleanVal}')] | //span[contains(., '${cleanVal}')] | *[text()='${cleanVal}'])[last()]`;
            }

            try {
              const option = await driver.wait(until.elementLocated(By.xpath(optionXpath)), 5000);
              await driver.wait(until.elementIsVisible(option), 5000);
              await option.click();
            } catch (e) {
              if (!step.targetType || step.targetType === 'any') {
                const fallbackXpath = `//*[text()='${cleanVal}' and not(self::script)]`;
                const fallbackOption = await driver.wait(until.elementLocated(By.xpath(fallbackXpath)), 3000);
                await fallbackOption.click();
              } else {
                throw new Error(`Opção "${finalValue}" não encontrada.`);
              }
            }
            break;
        }

        stepResults.push({
          stepId: step.id,
          status: 'SUCCESS',
          duration: Date.now() - stepStartTime,
          action: step.action,
          field: step.field,
          value: reportValue
        });
      } catch (err) {
        stepResults.push({
          stepId: step.id,
          status: 'ERROR',
          message: err.message,
          duration: Date.now() - stepStartTime,
          action: step.action,
          field: step.field,
          value: reportValue
        });
        throw err;
      }
    }

    if (testCase.persistSession) {
      sessionCookies = await driver.manage().getCookies();
      console.log(`💾 Sessão atualizada! ${sessionCookies.length} cookies em cache.`);
    }

    res.json({
      success: true,
      status: 'PASSED',
      duration: Date.now() - startTime,
      steps: stepResults
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'FAILED',
      error: error.message,
      duration: Date.now() - startTime,
      steps: stepResults
    });
  }
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0',  () => console.log(`🚀 SERVIDOR AUTO-QA PRONTO NA PORTA ${PORT}`));