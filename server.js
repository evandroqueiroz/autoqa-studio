import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright';
import { MongoClient } from 'mongodb';

const app = express();
app.use(cors());
app.use(express.json());

// --- Database Configuration ---
const mongoUrl = process.env.MONGO_URL || 'mongodb://mongo:27017/autoqa';
const dbName = 'autoqa';
let db;

async function connectDB(retries = 5) {
  while (retries > 0) {
    try {
      console.log(`Tentando conectar ao MongoDB em: ${mongoUrl.replace(/:([^:@]+)@/, ':****@')}...`);
      const client = new MongoClient(mongoUrl);
      await client.connect();
      db = client.db(dbName);
      console.log("Conectado ao MongoDB com sucesso!");
      return;
    } catch (error) {
      retries--;
      console.error(`Erro ao conectar ao MongoDB (${retries} tentativas restantes):`, error.message);
      if (retries === 0) {
        console.error("💀 Falha crítica: Não foi possível conectar ao banco de dados após várias tentativas.");
        process.exit(1);
      }
      // Espera 3 segundos antes de tentar novamente
      await new Promise(res => setTimeout(res, 3000));
    }
  }
}
connectDB();

app.get('/status', (req, res) => {
  res.json({ dbConnected: !!db });
});

// --- Global Driver (Singleton) ---
let globalBrowser = null;
let globalContext = null;
let globalPage = null; // optional caching for single window
let sessionCookies = [];

// --- Persistence Endpoints ---

app.get('/load-config', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: "Banco de dados ainda não está pronto. Tente novamente em instantes." });
    }
    const configColl = db.collection('config');
    const testsColl = db.collection('testCases');

    let globalData = await configColl.findOne({ _id: 'global' });
    if (!globalData) {
      globalData = { elementMap: [], folders: [], testOrder: [], baseUrl: '', customVariables: [] };
    }

    const loadedTestsCursor = await testsColl.find({});
    const loadedTestsMap = new Map();
    for await (const test of loadedTestsCursor) {
      if (test.id) {
        loadedTestsMap.set(test.id, test);
      }
    }

    const finalTestCases = [];
    const savedOrder = globalData.testOrder || [];

    savedOrder.forEach(id => {
      if (loadedTestsMap.has(id)) {
        finalTestCases.push(loadedTestsMap.get(id));
        loadedTestsMap.delete(id);
      }
    });

    loadedTestsMap.forEach(test => {
      finalTestCases.push(test);
    });

    res.json({
      testCases: finalTestCases,
      elementMap: globalData.elementMap || [],
      folders: globalData.folders || [],
      baseUrl: globalData.baseUrl || '',
      customVariables: globalData.customVariables || []
    });

  } catch (e) {
    console.error("Erro fatal no load-config:", e);
    res.status(500).json({ error: "Erro ao carregar configurações do MongoDB." });
  }
});

app.post('/save-config', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: "Banco de dados ainda não está pronto." });
    }
    const { testCases, elementMap, folders, baseUrl, customVariables } = req.body;
    const testOrder = testCases.map(t => t.id);

    const configColl = db.collection('config');
    await configColl.updateOne(
      { _id: 'global' },
      { $set: { elementMap, folders, testOrder, baseUrl, customVariables: customVariables || [] } },
      { upsert: true }
    );

    const currentIds = new Set();
    const testsColl = db.collection('testCases');

    if (testCases.length > 0) {
      const bulkOps = testCases.map(test => {
        currentIds.add(test.id);
        const { _id, ...testData } = test; 
        return {
          updateOne: {
            filter: { id: test.id },
            update: { $set: testData },
            upsert: true
          }
        };
      });
      await testsColl.bulkWrite(bulkOps);
    }

    if (currentIds.size > 0) {
      await testsColl.deleteMany({ id: { $nin: Array.from(currentIds) } });
    } else {
      await testsColl.deleteMany({}); // Delete all if zero cases exist
    }

    res.json({ success: true });
  } catch (e) {
    console.error("Erro ao salvar:", e);
    res.status(500).json({ error: "Erro ao salvar arquivo de armazenamento." });
  }
});

app.get('/load-reports', async (req, res) => {
  try {
    const coll = db.collection('reports');
    const reports = await coll.find().sort({_id: -1}).limit(50).toArray();
    res.json({ reports });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/save-report', async (req, res) => {
  try {
    const { report } = req.body;
    const coll = db.collection('reports');
    await coll.insertOne(report);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/clear-reports', async (req, res) => {
  try {
    const coll = db.collection('reports');
    await coll.deleteMany({});
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/reset-driver', async (req, res) => {
  if (globalBrowser) {
    try {
      if (globalContext) await globalContext.close();
      await globalBrowser.close();
    } catch (e) {
      console.log("Erro ao fechar driver (já estava fechado?)", e.message);
    }
    globalBrowser = null;
    globalContext = null;
    globalPage = null;
  }
  res.json({ success: true, message: "Navegador fechado e reiniciado." });
});

app.post('/stop-test', async (req, res) => {
  console.log("🛑 SOLICITAÇÃO DE PARADA DE EMERGÊNCIA RECEBIDA");
  if (globalBrowser) {
    try {
      if (globalContext) await globalContext.close();
      await globalBrowser.close();
      console.log("🛑 Driver eliminado com sucesso.");
    } catch (e) {
      console.log("Erro ao matar driver:", e.message);
    }
    globalBrowser = null;
    globalContext = null;
    globalPage = null;
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

function processDynamicValue(value, customVariables = []) {
  if (!value) return value;
  let finalValue = value;
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');

  // Loop de resolução (máximo 3 níveis para evitar loops infinitos)
  // Isso permite que uma variável customizada use outra ou use uma do sistema
  for (let iteration = 0; iteration < 3; iteration++) {
    const previousValue = finalValue;

    // 1. Variáveis de Sistema
    if (finalValue.includes('{HOJE}')) finalValue = finalValue.replace(/{HOJE}/g, getFormattedDate(now));
    if (finalValue.includes('{ANO_HOJE}') || finalValue.includes('{ANO_ATUAL}')) {
      finalValue = finalValue.replace(/{ANO_HOJE}|{ANO_ATUAL}/g, getYear(now).toString());
    }
    if (finalValue.includes('{MES_ATUAL}')) finalValue = finalValue.replace(/{MES_ATUAL}/g, pad(now.getMonth() + 1));
    if (finalValue.includes('{DIA_ATUAL}')) finalValue = finalValue.replace(/{DIA_ATUAL}/g, pad(now.getDate()));
    
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
    if (finalValue.includes('{AGORA}')) finalValue = finalValue.replace(/{AGORA}/g, getFormattedDateTime(now, true));
    if (finalValue.includes('{AGORA_SEM_SEGUNDOS}')) finalValue = finalValue.replace(/{AGORA_SEM_SEGUNDOS}/g, getFormattedDateTime(now, false));
    
    if (finalValue.includes('{ALEATORIO_NUM}')) {
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      finalValue = finalValue.replace(/{ALEATORIO_NUM}/g, randomNum.toString());
    }

    // 2. Variáveis Customizadas
    for (const cv of customVariables) {
      if (cv.name && cv.value !== undefined) {
        const token = `{${cv.name.toUpperCase()}}`;
        if (finalValue.includes(token)) {
          // Usamos string replacement simples aqui para o valor da variável
          finalValue = finalValue.split(token).join(cv.value);
        }
      }
    }

    // Se não mudou nada nesta iteração, podemos parar
    if (finalValue === previousValue) break;
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

// --- Playwright Engine ---

function resolveBy(elementInfo, fallbackSelector) {
  const selector = (elementInfo?.selector || fallbackSelector || '').trim();

  if (!selector) return null;

  if (selector.startsWith('LABEL:')) {
    const labelText = selector.replace('LABEL:', '').trim();
    return `xpath=(//*[contains(text(), '${labelText}')])[last()]/following::input[1]`;
  }

  if (selector.startsWith('//') || selector.startsWith('(')) {
    return `xpath=${selector}`;
  }

  if (/^[a-zA-Z0-9][a-zA-Z0-9_\-\.:]*$/.test(selector)) {
    return `css=[tid="${selector}"]`;
  }

  const by = elementInfo?.by || 'css';
  return by === 'xpath' ? `xpath=${selector}` : `css=${selector}`;
}

async function clicarDigitar(page, locatorStr, finalValue) {
  const locator = await resolveInputLocator(page, locatorStr);
  await locator.waitFor({state: 'visible', timeout: 10000});
  await locator.click();
  const actions = getActions(finalValue);
  for (let index = 0; index < actions.length; index++) {
    await makeAction(page, locator, actions[index]);
  }
}

function getActions(value) {
  return value.match(/\{[^}]+\}|[^{}]+/g) ?? [];
}

async function makeAction(page, input, action) {
  if (isSleep(action)) {
    let number = getNumber(action);
    return await page.waitForTimeout(number);
  }
  switch (action) {
    case "{CLEAR}":
      if (input) return await input.fill("");
      return;
    case "{ENTER}":
      return await page.keyboard.press("Enter");
    case "{SPACE}":
      return await page.keyboard.press("Space");
    case "{UP}":
      return await page.keyboard.press("ArrowUp");
    case "{DOWN}":
      return await page.keyboard.press("ArrowDown");
    case "{LEFT}":
      return await page.keyboard.press("ArrowLeft");
    case "{RIGHT}":
      return await page.keyboard.press("ArrowRight");
    case "{TAB}":
      return await page.keyboard.press("Tab");
    default:
      if (input) return await input.pressSequentially(action);
      return await page.keyboard.insertText(action);
  }
}

function isSleep(value) {
  return /^\{\d+\}$/.test(value);
}

function getNumber(value) {
  const match = value.match(/^\{(\d+)\}$/);
  return match ? Number(match[1]) : null;
}

async function autoAcceptCookies(page) {
  const selectors = [
    "xpath=//div[contains(@class, 'termo-privacidade')]//*[contains(text(), 'Aceitar')]",
    "xpath=//div[contains(@class, 'termo-privacidade')]//button",
    "xpath=//button[contains(., 'Aceitar cookies')]",
    "css=.termo-privacidade button"
  ];
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({timeout: 1000})) {
        await el.click({force: true});
        await page.waitForTimeout(1000);
        return true;
      }
    } catch (e) {}
  }
  return false;
}

async function resilientClick(page, locatorStr, value) {
  const locator = page.locator(locatorStr);

  try {
    if (value == null || value === "") {
      const count = await locator.count();
      let clicked = false;

      if (count > 0) {
        // Collect visible elements and score them by effective z-index.
        // The effective z-index is the MAX z-index found in the entire ancestor chain.
        // A button inside a modal (z-index: 1000) scores 1000 even if the button itself has no z-index.
        // A button in the background page scores 0 (or whatever its ancestors have).
        const candidates = [];

        for (let i = 0; i < count; i++) {
          const el = locator.nth(i);
          if (!await el.isVisible({ timeout: 500 }).catch(() => false)) continue;

          const zScore = await el.evaluate((node) => {
            let maxZ = 0;
            let current = node;
            while (current && current !== document.documentElement) {
              const z = parseInt(window.getComputedStyle(current).zIndex, 10);
              if (!isNaN(z) && z > maxZ) maxZ = z;
              current = current.parentElement;
            }
            return maxZ;
          }).catch(() => 0);

          candidates.push({ index: i, zScore });
          console.log(`🔍 Elemento [${i}] z-score efetivo: ${zScore}`);
        }

        if (candidates.length > 0) {
          // Sort: highest z-index first; ties broken by DOM order (last in DOM wins)
          candidates.sort((a, b) => b.zScore - a.zScore || b.index - a.index);

          const best = candidates[0];
          console.log(`🎯 Clique no elemento [${best.index}] (z-score: ${best.zScore})`);
          const el = locator.nth(best.index);
          await el.scrollIntoViewIfNeeded();
          await el.click();
          clicked = true;
        }
      }

      if (!clicked) {
        await locator.first().click();
      }
    } else {
      console.log(`🔄 Clique index ${value}`);
      const el = locator.nth(Number(value));
      await el.scrollIntoViewIfNeeded();
      await el.click();
    }
  } catch (err) {
    await autoAcceptCookies(page);
    try {
      console.log('🔄 Fallback Javascript click');
      await locator.first().evaluate((node) => node.click());
    } catch (e2) {
      throw err;
    }
  }
}


async function resolveInputLocator(page, locatorStr) {
  const parentLocator = page.locator(locatorStr).first();
  try {
    const isInput = await parentLocator.evaluate(e => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName) || e.isContentEditable).catch(() => true);
    if (!isInput) {
      return parentLocator.locator('input, textarea, select, [contenteditable="true"]').first();
    }
  } catch(e) {}
  return parentLocator;
}

app.post('/run-test', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked'
  });
  const sendEvent = (type, data) => res.write(JSON.stringify({ type, data }) + '\n');

  const { testCase, elementMap, customVariables } = req.body;
  const startTime = Date.now();
  const stepResults = [];

  let targetUrl = testCase.startUrl?.trim();
  if (targetUrl && !targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

  try {
    let isFreshInstance = false;
    
    if (globalContext && !globalContext.browser()?.isConnected()) {
        globalBrowser = null;
        globalContext = null;
        globalPage = null;
    }

    if (!globalContext) {
      isFreshInstance = true;
      console.log("🚀 Iniciando novo browser Playwright Chromium...");
      globalBrowser = await chromium.launch({
          headless: false,
          args: [
             '--disable-notifications',
             '--start-maximized',
             '--no-sandbox',
             '--disable-dev-shm-usage',
             '--disable-gpu',
             '--disable-extensions'
          ]
      });
      globalContext = await globalBrowser.newContext({
          viewport: null, // Start maximized
          ignoreHTTPSErrors: true
      });
      globalPage = await globalContext.newPage();
    }

    const page = globalPage;

    // Lógica de Navegação
    if (targetUrl) {
      if (!isFreshInstance) {
        console.log(`🔄 Reiniciando para o Menu Principal: ${targetUrl}`);
        await page.goto(targetUrl, {waitUntil: 'domcontentloaded'});
      } else {
        const currentUrl = page.url();
        if (currentUrl !== targetUrl) {
           await page.goto(targetUrl, {waitUntil: 'domcontentloaded'});
        }
      }
    }

    if (isFreshInstance && testCase.useSession && sessionCookies.length > 0) {
      console.log(`🍪 [Nova Instância] Injetando ${sessionCookies.length} cookies...`);
      try {
        await globalContext.addCookies(sessionCookies);
        await page.reload({waitUntil: 'domcontentloaded'});
        await page.waitForTimeout(1500);
      } catch (e) {
        console.warn("Falha ao injetar cookie:", e.message);
      }
    }

    await page.waitForTimeout(500);
    await autoAcceptCookies(page);

    for (const step of testCase.steps) {
      if (step.disabled) {
        stepResults.push({
          stepId: step.id,
          status: 'SKIPPED',
          duration: 0,
          action: step.action,
          field: step.field,
          value: step.value
        });
        continue;
      }
      
      const stepStartTime = Date.now();
      let reportValue = step.value;
      const elementInfo = elementMap.find(el => el.friendlyName === step.field);

      sendEvent('STEP_START', { stepId: step.id });
      sendEvent('LOG', { level: 'INFO', message: `▶ Início passo [${step.order}]: ${step.action}` });

      try {
        const locatorStr = resolveBy(elementInfo, step.selector); // Fallback para selector ad-hoc (nunca o value)
        const finalValue = processDynamicValue(step.value, customVariables);
        reportValue = finalValue;

        switch (step.action) {
          case 'TECLAS_ATALHO': {
            const shortcutActions = getActions(finalValue);
            const hasElement = !!(step.field && step.field.trim() !== '') || !!(step.selector && step.selector.trim() !== '');
            if (hasElement && locatorStr) {
               const locatorShortcut = await resolveInputLocator(page, locatorStr);
               await locatorShortcut.waitFor({state: 'visible', timeout: 5000});
               await locatorShortcut.click();
               for (const act of shortcutActions) {
                 await makeAction(page, locatorShortcut, act);
               }
            } else {
               // Sem elemento: envia teclas globalmente para a página
               for (const act of shortcutActions) {
                 await makeAction(page, null, act);
               }
            }
            break;
          }

          case 'DIGITAR':
            const locatorInput = await resolveInputLocator(page, locatorStr);
            await locatorInput.waitFor({state: 'visible', timeout: 10000});
            await locatorInput.click();
            await locatorInput.fill("");
            await page.waitForTimeout(500); // Aguarda focus e estabilização de frameworks (ex: React)
            await locatorInput.pressSequentially(finalValue, { delay: step.typingDelay || 50 });
            if (step.delay && step.delay > 0) await page.waitForTimeout(step.delay);
            break;

          case 'CLICAR':
            await resilientClick(page, locatorStr, finalValue);
            break;

          case 'ESPERAR':
            await page.waitForTimeout(parseInt(finalValue) || 1000);
            break;

          case 'ESPERAR_QUE':
            if (locatorStr) {
              const locatorWait = page.locator(locatorStr).first();

              if (finalValue && finalValue.trim() !== '') {
                  // Wait condition loop
                  const startWait = Date.now();
                  let conditionMet = false;
                  while (Date.now() - startWait < 15000) {
                      let text = await locatorWait.inputValue().catch(()=>null);
                      if (text == null) text = await locatorWait.innerText().catch(()=>"");
                      try {
                          checkCondition(text, finalValue, step.condition || 'CONTEM');
                          conditionMet = true;
                          break;
                      } catch(e) {}
                      await page.waitForTimeout(1000);
                  }
                  if (!conditionMet) throw new Error(`Condição '${step.condition}' não foi atingida para o valor '${finalValue}' no tempo estipulado.`);
              } else {
                 await locatorWait.waitFor({state: 'visible', timeout: 15000});
              }
            } else {
              throw new Error("Seletor inválido para ESPERAR_QUE.");
            }
            break;

          case 'VALIDAR_DESABILITADO':
            const locDis = await resolveInputLocator(page, locatorStr);
            const startWaitDis = Date.now();
            let isDisabled = false;
            while(Date.now() - startWaitDis < 15000) {
                const isDis = await locDis.evaluate(node => node.disabled || node.readOnly || node.hasAttribute('disabled')).catch(() => false);
                if (isDis) {
                    isDisabled = true;
                    break;
                }
                await page.waitForTimeout(500);
            }
            if (!isDisabled) throw new Error("Falha: O elemento está habilitado (editável), mas deveria estar desabilitado.");
            break;

          case 'VALIDAR_TEXTO':
            const locText = page.locator(locatorStr).first();
            const startWaitText = Date.now();
            let lastErrText;
            let textMet = false;
            while(Date.now() - startWaitText < 15000) {
              try {
                let text = await locText.inputValue().catch(()=>null);
                if (text == null) text = await locText.innerText().catch(()=>"");
                checkCondition(text, finalValue, step.condition || 'CONTEM');
                textMet = true;
                break;
              } catch(err) {
                lastErrText = err;
              }
              await page.waitForTimeout(500);
            }
            if (!textMet) throw lastErrText;
            break;

          case 'VALIDAR_PREENCHIMENTO':
            const locFilled = page.locator(locatorStr).first();
            const startWaitPreenc = Date.now();
            let lastErrPreenc;
            let preencMet = false;
            while(Date.now() - startWaitPreenc < 15000) {
              try {
                let valToCheck = await locFilled.inputValue().catch(()=>null);
                if (valToCheck == null) valToCheck = await locFilled.innerText().catch(()=>"");
                const actualLength = (valToCheck || '').length;

                if (!finalValue || finalValue.trim() === '') {
                  if (actualLength === 0) throw new Error("O campo está vazio.");
                } else {
                  const expectedLength = parseInt(finalValue);
                  if (isNaN(expectedLength)) throw new Error(`Para VALIDAR_PREENCHIMENTO, o valor informado deve ser numérico.`);
                  checkCondition(actualLength, expectedLength, step.condition || 'IGUAL');
                }
                preencMet = true;
                break;
              } catch(err) {
                lastErrPreenc = err;
              }
              await page.waitForTimeout(500);
            }
            if (!preencMet) throw lastErrPreenc;
            break;

          case 'DIGITAR_E_ENTER':
            const locDEE = await resolveInputLocator(page, locatorStr);
            await locDEE.waitFor({state: 'visible', timeout: 10000});
            await locDEE.click();
            await locDEE.fill("");
            await locDEE.fill(finalValue);
            await page.waitForTimeout(1000);
            await locDEE.press('Enter');
            break;

          case 'DIGITAR_DOWN_E_ENTER':
            const locDDEE = await resolveInputLocator(page, locatorStr);
            await locDDEE.waitFor({state: 'visible', timeout: 10000});
            await locDDEE.click();
            await locDDEE.fill("");
            await locDDEE.fill(finalValue);
            await page.waitForTimeout(1000);
            await locDDEE.press('Space');
            await page.waitForTimeout(5000);
            await locDDEE.press('ArrowDown');
            await page.waitForTimeout(1000);
            await locDDEE.press('Enter');
            break;

          case 'CLICAR_E_DIGITAR':
            await clicarDigitar(page, locatorStr, finalValue);
            break;

          case 'DIGITAR_E_SELECIONAR':
            const locCombo = await resolveInputLocator(page, locatorStr);
            await locCombo.waitFor({state: 'visible', timeout: 10000});
            await locCombo.click();
            await locCombo.fill("");
            await page.waitForTimeout(500); // Aguarda focus
            await locCombo.pressSequentially(finalValue, { delay: step.typingDelay || 50 }); // Digitação humana
            await locCombo.press('Space'); // O espaço solicitado para engatilhar pesquisa se necessário
            await page.waitForTimeout(step.delay || 1000); // Tempo para o autocomplete buscar do backend

            let optionXpath;
            const cleanVal = finalValue.replace(/'/g, "");

            switch (step.targetType) {
              case 'button': optionXpath = `xpath=//button[contains(., '${cleanVal}')]`; break;
              case 'table': optionXpath = `xpath=//td[contains(., '${cleanVal}')]`; break;
              case 'list': optionXpath = `xpath=//li[contains(., '${cleanVal}')]`; break;
              case 'div': optionXpath = `xpath=//div[contains(., '${cleanVal}')]`; break;
              case 'span': optionXpath = `xpath=//span[contains(., '${cleanVal}')]`; break;
              case 'input': optionXpath = `xpath=//input[@value='${cleanVal}' or @placeholder='${cleanVal}']`; break;
              default:
                optionXpath = `xpath=(//td[contains(@class, 'item') or contains(., '${cleanVal}')] | //li[contains(., '${cleanVal}')] | //div[contains(@class, 'item') and contains(., '${cleanVal}')] | //span[contains(., '${cleanVal}')] | *[text()='${cleanVal}'])[last()]`;
            }

            try {
              const option = page.locator(optionXpath).first();
              await option.waitFor({state: 'visible', timeout: 5000});
              await option.click();
            } catch (e) {
              if (!step.targetType || step.targetType === 'any') {
                const fallbackXpath = `xpath=//*[text()='${cleanVal}' and not(self::script)]`;
                const fallbackOption = page.locator(fallbackXpath).first();
                await fallbackOption.waitFor({state: 'visible', timeout: 3000});
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
        sendEvent('STEP_END', { stepId: step.id, status: 'SUCCESS' });
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
        sendEvent('STEP_END', { stepId: step.id, status: 'ERROR', error: err.message });
        throw err;
      }
    }

    if (testCase.persistSession) {
      sessionCookies = await globalContext.cookies();
      console.log(`💾 Sessão atualizada! ${sessionCookies.length} cookies em cache.`);
    }

    sendEvent('TEST_END', {
      success: true,
      status: 'PASSED',
      duration: Date.now() - startTime,
      steps: stepResults
    });
    res.end();
  } catch (error) {
    sendEvent('TEST_END', {
      success: false,
      status: 'FAILED',
      error: error.message,
      duration: Date.now() - startTime,
      steps: stepResults
    });
    res.end();
  }
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0',  () => console.log(`SERVIDOR AUTO-QA PRONTO NA PORTA ${PORT}`));