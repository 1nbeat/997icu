export function calculateTime(dailyHours, weeklyDays) {
  const hours = Number(dailyHours);
  const days = Number(weeklyDays);
  if (!Number.isFinite(hours) || !Number.isFinite(days) || hours < 1 || hours > 16 || days < 1 || days > 7 || !Number.isInteger(days)) {
    throw new RangeError('请输入有效的每日工时和每周工作天数');
  }
  const weekly = hours * days;
  const extra = Math.max(0, weekly - 40);
  return { weekly, extra, monthlyDays: extra * 4.345 / 24 };
}

if (typeof document !== 'undefined') {
  const dailyInput = document.querySelector('#daily-hours');
  const daysInput = document.querySelector('#weekly-days');
  const format = number => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(number);
  function updateCalculator() {
    const { weekly, extra, monthlyDays } = calculateTime(dailyInput.value, daysInput.value);
    document.querySelector('#daily-output').textContent = `${format(Number(dailyInput.value))} 小时`;
    document.querySelector('#days-output').textContent = `${daysInput.value} 天`;
    document.querySelector('#weekly-total').innerHTML = `${format(weekly)}<small>小时</small>`;
    document.querySelector('#weekly-extra').innerHTML = `${format(extra)}<small>小时 / 周</small>`;
    document.querySelector('#calculator-insight').innerHTML = extra > 0
      ? `相当于每月约 <strong>${monthlyDays.toFixed(1)} 天</strong> 的完整 24 小时，被额外的工作占据。`
      : '本次输入未超过每周 <strong>40 小时</strong>。也请留意每日工时、休息日和实际排班。';
  }
  dailyInput.addEventListener('input', updateCalculator);
  daysInput.addEventListener('input', updateCalculator);
  updateCalculator();

  const menuButton = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('#navigation');
  function closeMenu() {
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', '展开导航');
    navigation.classList.remove('is-open');
  }
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? '收起导航' : '展开导航');
    navigation.classList.toggle('is-open', open);
  });
  navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  document.addEventListener('click', event => { if (!event.target.closest('.header')) closeMenu(); });

  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function selectTab(tab, focus = false) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') next = tabs[(index + tabs.length - 1) % tabs.length];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs.at(-1);
      if (next) { event.preventDefault(); selectTab(next, true); }
    });
  });

  const dialog = document.querySelector('#evidence-dialog');
  const checkboxes = [...dialog.querySelectorAll('input[type="checkbox"]')];
  const storageKey = '997icu-evidence-v1';
  let storageAvailable = true;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(saved)) checkboxes.forEach(input => { input.checked = saved.includes(input.value); });
  } catch { storageAvailable = false; }
  function updateProgress() {
    document.querySelector('#checklist-progress').textContent = `已准备 ${checkboxes.filter(input => input.checked).length} / ${checkboxes.length} 项`;
  }
  function explainStorage() {
    document.querySelector('#storage-note').textContent = '浏览器未允许本地保存，勾选仅在当前页面有效。可下载清单留存；请合法收集证据并保留原始记录。';
  }
  if (!storageAvailable) explainStorage();
  updateProgress();
  checkboxes.forEach(input => input.addEventListener('change', () => {
    updateProgress();
    try { localStorage.setItem(storageKey, JSON.stringify(checkboxes.filter(item => item.checked).map(item => item.value))); }
    catch { explainStorage(); }
  }));
  document.querySelector('.evidence-open').addEventListener('click', () => {
    dialog.showModal();
    document.body.classList.add('modal-open');
  });
  document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.body.classList.remove('modal-open');
    document.querySelector('.evidence-open').focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  let toastTimer;
  document.querySelector('#download-checklist').addEventListener('click', () => {
    const items = checkboxes.map(input => {
      const label = input.closest('label');
      return `${input.checked ? '☑' : '☐'} ${label.querySelector('strong').textContent}\n   ${label.querySelector('small').textContent}`;
    });
    const content = `997ICU · 我的维权证据清单\nhttps://997icu.cn/\n\n${items.join('\n\n')}\n\n温馨提示：合法收集证据，保留完整记录与原始载体。具体材料及受理要求以当地机构为准。\n劳动保障咨询：12333 / https://si.12333.gov.cn/\n公共法律服务：12348 / https://www.12348.gov.cn/\n本清单不替代个案法律意见。\n`;
    const url = URL.createObjectURL(new Blob(['\ufeff', content], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '997ICU-维权证据清单.txt';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const toast = document.querySelector('#toast');
    toast.textContent = '清单已生成，请查看浏览器下载记录。';
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
  });
  document.querySelector('#year').textContent = String(new Date().getFullYear());
}
