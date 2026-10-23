import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactDir = join(root, '.artifacts');
const baseURL = process.env.TEST_URL || 'http://localhost:3000';
const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
let browserPath;
for (const candidate of candidates) { try { await access(candidate); browserPath = candidate; break; } catch {} }
if (!browserPath) throw new Error('未找到 Chrome / Edge，请设置 CHROME_PATH。测试前请启动 npm run dev。');
await mkdir(artifactDir, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), '997icu-browser-'));
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let browserLog = '';
browser.stderr.on('data', chunk => { browserLog += chunk.toString(); });
let socket;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); }
  }
  if (!port) throw new Error('浏览器启动超时');
  let targets;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await delay(100); }
  }
  if (!targets) throw new Error(`无法读取浏览器调试接口。${browserLog}`);
  const debuggerURL = targets.find(target => target.type === 'page').webSocketDebuggerUrl.replace('localhost', '127.0.0.1');
  socket = new WebSocket(debuggerURL);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', event => reject(new Error(`无法连接浏览器 ${debuggerURL}: ${event.message || event.error?.message || 'WebSocket error'}`)), { once: true }); });
  let nextId = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (!message.id) return;
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    clearTimeout(task.timeout);
    if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result);
  });
  function command(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} 超时`)); }, 10000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function navigate() {
    await command('Page.navigate', { url: baseURL });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate('document.readyState === "complete" && !!document.querySelector("#daily-hours")')) break;
      await delay(50);
    }
    await delay(100);
  }
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const [width, height] of [[1440, 1000], [1024, 900], [768, 1024], [390, 844], [320, 700]]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await navigate();
    const dimensions = await evaluate('({scroll:document.documentElement.scrollWidth, viewport:innerWidth})');
    assert.ok(dimensions.scroll <= dimensions.viewport, `${width}px 横向溢出：${JSON.stringify(dimensions)}`);
    const screenshot = await command('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(artifactDir, `homepage-${width}.png`), Buffer.from(screenshot.data, 'base64'));
    console.log(`✓ ${width}px 布局无横向溢出，截图已保存`);
  }
  assert.equal(await evaluate('document.querySelectorAll("h1").length'), 1);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('a[href^="#"]')].filter(a=>a.hash && !document.getElementById(a.hash.slice(1))).map(a=>a.hash)`), []);
  assert.deepEqual(await evaluate('(()=>{const ids=[...document.querySelectorAll("[id]")].map(el=>el.id);return ids.filter((id,i)=>ids.indexOf(id)!==i)})()'), []);
  assert.equal(await evaluate('document.querySelector("#weekly-total").textContent'), '77小时');
  await evaluate('document.querySelector("#daily-hours").value=8;document.querySelector("#weekly-days").value=5;document.querySelector("#daily-hours").dispatchEvent(new Event("input",{bubbles:true}))');
  assert.equal(await evaluate('document.querySelector("#weekly-extra").textContent'), '0小时 / 周');
  assert.ok(await evaluate('document.querySelector("#calculator-insight").textContent.includes("未超过")'));
  await evaluate('document.querySelector("#tab-pay").click()');
  assert.ok(await evaluate('!document.querySelector("#panel-pay").hidden && document.querySelector("#panel-hours").hidden'));
  await evaluate('document.querySelector("#tab-pay").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}))');
  assert.equal(await evaluate('document.activeElement.id'), 'tab-action');
  assert.ok(await evaluate('!document.querySelector("#panel-action").hidden'));
  await evaluate('document.querySelector(".menu-toggle").click()');
  assert.equal(await evaluate('document.querySelector(".menu-toggle").getAttribute("aria-expanded")'), 'true');
  await evaluate('document.querySelector("#navigation a").click()');
  assert.equal(await evaluate('document.querySelector(".menu-toggle").getAttribute("aria-expanded")'), 'false');
  await evaluate('document.querySelector(".evidence-open").click()');
  assert.ok(await evaluate('document.querySelector("#evidence-dialog").open'));
  await evaluate('document.querySelector(".checklist input").click()');
  assert.equal(await evaluate('document.querySelector("#checklist-progress").textContent'), '已准备 1 / 5 项');
  await command('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: artifactDir });
  await evaluate('document.querySelector("#download-checklist").click()');
  let download;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { download = await readFile(join(artifactDir, '997ICU-维权证据清单.txt'), 'utf8'); break; } catch { await delay(100); }
  }
  assert.ok(download?.includes('☑ 劳动关系证明'));
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.equal(await evaluate('document.querySelector("#evidence-dialog").open'), false);
  await delay(100);
  assert.equal(await evaluate('document.activeElement.className'), 'evidence-open');
  await navigate();
  assert.ok(await evaluate('document.querySelector(".checklist input").checked'));
  await evaluate('document.querySelector(".faq-list summary").click()');
  assert.ok(await evaluate('document.querySelector(".faq-list details").open'));
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate();
  const metrics = await command('Page.getLayoutMetrics');
  const fullScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1440, height: metrics.cssContentSize.height, scale: 1 } });
  await writeFile(join(artifactDir, 'homepage-full.png'), Buffer.from(fullScreenshot.data, 'base64'));
  assert.deepEqual(errors, []);
  for (const filename of ['/', '/styles.css', '/app.js', '/favicon.svg', '/robots.txt']) {
    assert.equal((await fetch(baseURL + filename)).status, 200);
  }
  for (const filename of ['/package.json', '/README.md', '/server.mjs', '/.env', '/missing', '/%E0%A4%A']) {
    const status = (await fetch(baseURL + filename)).status;
    assert.ok(status === 404 || status === 400, `${filename} 不应公开`);
  }
  console.log('✓ 计算器、标签页与键盘导航、移动菜单、证据保存与下载、弹窗 Escape 与焦点恢复、FAQ、静态资源及文件访问限制全部通过');
} catch (error) {
  console.error(browserLog);
  throw error;
} finally {
  socket?.close();
  browser.kill();
  await delay(500);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
