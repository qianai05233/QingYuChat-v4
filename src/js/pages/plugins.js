/**
 * QingYu Chat v4 — pages/plugins.js
 * 插件系统页面逻辑
 *
 * 功能：
 *  - 插件安装（URL / 插件源 / 本地文件 / 粘贴代码）
 *  - 插件市场（从源拉取列表）
 *  - 沙箱加载（隔离执行，错误不影响主线程）
 *  - 启用/禁用（实时生效）
 *  - 更新检测 + 一键全部更新
 *  - 插件详情弹窗
 *  - 清理插件专属数据
 */

/* ================================================================
   渲染插件列表
   ================================================================ */
function renderPluginList(){
  const container = document.getElementById('plugin-list');
  if(!container) return;

  if(!State.plugins.length){
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🧩</div>
        <p>暂无已安装的插件</p>
        <p>点击右上角"＋安装"添加插件</p>
      </div>`;
    return;
  }

  container.innerHTML = State.plugins.map(p => `
    <div class="list-item plugin-item" data-id="${p.id}">
      <div class="list-item-avatar" style="font-size:22px">${p.icon || '🧩'}</div>
      <div class="list-item-body">
        <div class="list-item-title">
          ${escapeHtmlSimple(p.name)}
          <span class="badge badge-blue" style="margin-left:6px;font-size:9px">v${p.version || '?'}</span>
          ${p.hasUpdate ? `<span class="badge badge-warn" style="margin-left:4px;font-size:9px">有更新</span>` : ''}
        </div>
        <div class="list-item-sub">${escapeHtmlSimple(p.description || '无描述')}</div>
        <div style="margin-top:4px;font-size:10px;color:var(--text-muted)">
          来源：${escapeHtmlSimple(p.source || '本地')}
        </div>
      </div>
      <div class="list-item-actions" style="flex-direction:column;gap:6px;align-items:flex-end">
        <label class="toggle-wrap">
          <input type="checkbox" ${p.enabled ? 'checked' : ''}
            onchange="togglePlugin('${p.id}', this.checked)">
          <span class="toggle-slider"></span>
        </label>
        <div style="display:flex;gap:4px">
          ${p.hasUpdate ? `<button class="btn btn-xs btn-warn" onclick="updatePlugin('${p.id}')">更新</button>` : ''}
          <button class="btn btn-xs btn-ghost" onclick="showPluginDetail('${p.id}')">详情</button>
          <button class="btn btn-xs btn-danger" onclick="removePlugin('${p.id}')">删除</button>
        </div>
      </div>
    </div>`).join('');
}

/* ================================================================
   插件安装入口
   ================================================================ */
function openInstallPluginModal(){
  openModal('modal-install-plugin');
}

/** 直链 URL 安装 */
async function installPluginByUrl(){
  closeModal('modal-install-plugin');
  const url = prompt('输入插件 .js 文件的直链 URL：');
  if(!url?.trim()) return;
  await _fetchAndInstall(url.trim(), url.trim());
}

/** 本地文件安装 */
function installPluginByFile(){
  closeModal('modal-install-plugin');
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '.js';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', async function(){
    const file = this.files?.[0];
    if(!file){ document.body.removeChild(input); return; }
    const reader = new FileReader();
    reader.onload = e => {
      _installFromCode(e.target.result, file.name.replace('.js',''), '本地文件');
    };
    reader.readAsText(file);
    document.body.removeChild(input);
  });
  input.click();
}

/** 粘贴代码安装 */
function installPluginByCode(){
  closeModal('modal-install-plugin');
  _openCodePasteModal();
}

/** 添加插件源 */
async function addPluginSource(){
  closeModal('modal-install-plugin');
  const url = prompt('输入插件源 index.json 的 URL：');
  if(!url?.trim()) return;
  await _loadPluginSource(url.trim());
}

/** 同步插件源（刷新市场列表） */
async function syncPluginSources(){
  const sources = ls('qy_plugin_sources') || [];
  if(!sources.length){ showToast('尚未添加任何插件源','warn'); return; }
  showToast('正在同步插件源…');
  let total = 0;
  for(const src of sources){
    try{
      const list = await _fetchPluginIndex(src.url);
      src.plugins = list;
      total += list.length;
    } catch(e){ console.error('[Plugin] sync error:', src.url, e); }
  }
  ls('qy_plugin_sources', sources);
  showToast(`✓ 同步完成，共 ${total} 个可用插件`, 'success');
  renderMarketplace();
}

/** 一键全部更新 */
async function updateAllPlugins(){
  const toUpdate = State.plugins.filter(p => p.hasUpdate && p.source);
  if(!toUpdate.length){ showToast('没有可更新的插件','warn'); return; }
  showToast(`正在更新 ${toUpdate.length} 个插件…`);
  for(const p of toUpdate) await updatePlugin(p.id);
  showToast('✓ 全部更新完成','success');
}

/** 更新单个插件 */
async function updatePlugin(id){
  const plugin = State.plugins.find(p => p.id === id);
  if(!plugin?.source) return;
  try{
    const code = await _fetchCode(plugin.source);
    const meta = _parsePluginMeta(code);
    plugin.code        = code;
    plugin.version     = meta.version || plugin.version;
    plugin.description = meta.description || plugin.description;
    plugin.hasUpdate   = false;
    ls('qy_plugins', State.plugins);
    if(plugin.enabled) _hotReloadPlugin(plugin);
    showToast(`✓ ${plugin.name} 已更新至 v${plugin.version}`, 'success');
    renderPluginList();
    Bus.emit('plugin:updated', plugin);
  } catch(e){
    showToast(`更新失败：${e.message}`, 'error');
  }
}

/* ================================================================
   启用 / 禁用
   ================================================================ */
function togglePlugin(id, enabled){
  const plugin = State.plugins.find(p => p.id === id);
  if(!plugin) return;
  plugin.enabled = enabled;
  ls('qy_plugins', State.plugins);
  if(enabled){
    loadPlugin(plugin);
    showToast(`✓ 已启用：${plugin.name}`, 'success');
  } else {
    showToast(`已禁用：${plugin.name}`);
    // 卸载：移除注册的钩子（通过插件自身的 onDisable 回调）
    try{ plugin._instance?.onDisable?.(); } catch{}
  }
  Bus.emit('plugin:toggled', { id, enabled });
}

/* ================================================================
   加载 / 执行插件
   ================================================================ */
/**
 * 在沙箱中加载插件
 * @param {object} plugin
 */
function loadPlugin(plugin){
  if(!plugin.code) return;
  try{
    // 注入 manifest，让插件知道自己是谁
    const patchedQY = { ...window.QY, manifest: { id:plugin.id, name:plugin.name, version:plugin.version } };

    // 使用 Function 构造器隔离作用域（比 eval 稍安全，不泄露全局写权限）
    const factory = new Function('QY', plugin.code + '\n//# sourceURL=plugin:' + plugin.id);
    const instance = factory(patchedQY);
    plugin._instance = instance || null;

    addLog({ type:'event', msg:`插件已加载：${plugin.name} v${plugin.version}` });
  } catch(e){
    console.error(`[Plugin] 加载失败 ${plugin.name}:`, e);
    showToast(`插件 ${plugin.name} 加载失败：${e.message}`, 'error');
    addLog({ type:'error', msg:`插件加载失败：${plugin.name} — ${e.message}` });
    plugin.enabled = false; // 自动禁用有错误的插件
    ls('qy_plugins', State.plugins);
    renderPluginList();
  }
}

/** 热重载（更新后重新执行） */
function _hotReloadPlugin(plugin){
  try{ plugin._instance?.onDisable?.(); } catch{}
  loadPlugin(plugin);
}

/* ================================================================
   插件详情弹窗
   ================================================================ */
function showPluginDetail(id){
  const plugin = State.plugins.find(p => p.id === id);
  if(!plugin) return;

  // 动态注入详情弹窗（如果不存在）
  if(!document.getElementById('modal-plugin-detail')){
    QY.ui.addModal({
      id: 'modal-plugin-detail',
      title: '🧩 插件详情',
      html: '<div id="plugin-detail-body"></div>'
    });
  }

  const dataKeys  = QY.data.keys(plugin.id + '_');
  const dataCount = dataKeys.length;

  QY.ui.updateModal('modal-plugin-detail', `
    <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:14px">
      <div style="font-size:36px">${plugin.icon || '🧩'}</div>
      <div>
        <div style="font-size:16px;font-weight:700;color:var(--text-primary)">${escapeHtmlSimple(plugin.name)}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">v${plugin.version || '?'}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${escapeHtmlSimple(plugin.author || '未知作者')}</div>
      </div>
    </div>
    <div class="field-group">
      <label class="field-label">描述</label>
      <div style="font-size:13px;color:var(--text-secondary)">${escapeHtmlSimple(plugin.description || '无')}</div>
    </div>
    <div class="field-group">
      <label class="field-label">来源</label>
      <div style="font-size:12px;color:var(--text-muted);word-break:break-all">${escapeHtmlSimple(plugin.source || '本地')}</div>
    </div>
    <div class="field-group">
      <label class="field-label">插件专属数据（${dataCount} 条）</label>
      ${dataCount > 0
        ? `<button class="btn btn-sm btn-danger" onclick="clearPluginData('${plugin.id}')">清空插件数据</button>`
        : `<div style="font-size:12px;color:var(--text-muted)">无数据</div>`
      }
    </div>
    ${plugin.homepage ? `<div class="field-group"><a href="${plugin.homepage}" target="_blank" class="btn btn-ghost btn-sm">🔗 插件主页</a></div>` : ''}
    <div class="divider"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${plugin.hasUpdate ? `<button class="btn btn-warn btn-sm" onclick="updatePlugin('${plugin.id}');closeModal('modal-plugin-detail')">⬆️ 更新</button>` : ''}
      <button class="btn btn-danger btn-sm" onclick="removePlugin('${plugin.id}');closeModal('modal-plugin-detail')">🗑️ 删除</button>
    </div>
  `);
  openModal('modal-plugin-detail');
}

/* ================================================================
   删除插件
   ================================================================ */
function removePlugin(id){
  const plugin = State.plugins.find(p => p.id === id);
  if(!plugin) return;
  if(!confirm(`确认删除插件"${plugin.name}"？`)) return;
  try{ plugin._instance?.onDisable?.(); } catch{}
  State.plugins = State.plugins.filter(p => p.id !== id);
  ls('qy_plugins', State.plugins);
  renderPluginList();
  showToast(`✓ 已删除：${plugin.name}`, 'success');
  Bus.emit('plugin:removed', { id });
}

/** 清空插件专属数据 */
function clearPluginData(pluginId){
  if(!confirm('确认清空该插件的所有本地数据？')) return;
  const prefix = 'qy_plugin_data_' + pluginId + '_';
  const keysToRemove = [];
  for(let i = 0; i < localStorage.length; i++){
    const k = localStorage.key(i);
    if(k?.startsWith(prefix)) keysToRemove.push(k);
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
  showToast(`✓ 已清空 ${keysToRemove.length} 条插件数据`, 'success');
  showPluginDetail(pluginId); // 刷新详情
}

/* ================================================================
   内部工具
   ================================================================ */

/**
 * 从 URL 拉取代码并安装
 */
async function _fetchAndInstall(url, source){
  showToast('正在下载插件…');
  try{
    const code = await _fetchCode(url);
    _installFromCode(code, url.split('/').pop().replace('.js',''), source);
  } catch(e){
    showToast('下载失败：' + e.message, 'error');
  }
}

/**
 * fetch 代码文本
 */
async function _fetchCode(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * 从代码字符串安装插件
 */
function _installFromCode(code, nameHint, source){
  const meta = _parsePluginMeta(code);
  const id   = meta.id || 'plugin_' + Date.now();

  // 去重：已存在则提示更新
  const existing = State.plugins.find(p => p.id === id);
  if(existing){
    if(!confirm(`插件 "${meta.name || nameHint}" 已安装，是否覆盖更新？`)) return;
    existing.code    = code;
    existing.version = meta.version || existing.version;
    ls('qy_plugins', State.plugins);
    if(existing.enabled) _hotReloadPlugin(existing);
    showToast(`✓ 已更新：${existing.name}`, 'success');
    renderPluginList(); return;
  }

  const plugin = {
    id,
    name:        meta.name        || nameHint || '未命名插件',
    version:     meta.version     || '1.0.0',
    description: meta.description || '',
    author:      meta.author      || '',
    icon:        meta.icon        || '🧩',
    homepage:    meta.homepage    || '',
    source,
    enabled:     true,
    hasUpdate:   false,
    code,
    _instance:   null
  };

  State.plugins.push(plugin);
  ls('qy_plugins', State.plugins);
  loadPlugin(plugin);
  renderPluginList();
  showToast(`✓ 插件已安装：${plugin.name} v${plugin.version}`, 'success');
  Bus.emit('plugin:installed', plugin);
}

/**
 * 解析插件元信息（从注释头读取）
 * 格式：
 *   // @id       my-plugin
 *   // @name     我的插件
 *   // @version  1.0.0
 *   // @description 描述
 *   // @author   作者
 *   // @icon     🎨
 *   // @homepage https://...
 */
function _parsePluginMeta(code){
  const meta = {};
  const fields = ['id','name','version','description','author','icon','homepage'];
  fields.forEach(f => {
    const m = code.match(new RegExp(`//\\s*@${f}\\s+(.+)`));
    if(m) meta[f] = m[1].trim();
  });
  return meta;
}

/**
 * 加载插件源（index.json）
 */
async function _loadPluginSource(url){
  showToast('正在加载插件源…');
  try{
    const list = await _fetchPluginIndex(url);
    const sources = ls('qy_plugin_sources') || [];
    const existing = sources.find(s => s.url === url);
    if(existing){
      existing.plugins = list;
    } else {
      sources.push({ url, plugins: list, addedAt: Date.now() });
    }
    ls('qy_plugin_sources', sources);
    showToast(`✓ 插件源已添加，共 ${list.length} 个插件`, 'success');
    renderMarketplace();
  } catch(e){
    showToast('加载失败：' + e.message, 'error');
  }
}

async function _fetchPluginIndex(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.plugins || []);
}

/**
 * 插件市场渲染
 */
function renderMarketplace(){
  const container = document.getElementById('plugin-marketplace');
  if(!container) return;
  const sources = ls('qy_plugin_sources') || [];
  if(!sources.length){
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🌐</div><p>点击"＋安装 → 添加插件源"浏览市场</p></div>`;
    return;
  }
  let html = '';
  sources.forEach(src => {
    html += `<div class="card-title" style="padding:10px 12px 0;font-size:10px">${escapeHtmlSimple(src.url)}</div>`;
    (src.plugins || []).forEach(p => {
      const installed = State.plugins.find(x => x.id === p.id);
      html += `
        <div class="list-item">
          <div class="list-item-avatar" style="font-size:20px">${p.icon || '🧩'}</div>
          <div class="list-item-body">
            <div class="list-item-title">${escapeHtmlSimple(p.name)} <span class="badge badge-blue">v${p.version||'?'}</span></div>
            <div class="list-item-sub">${escapeHtmlSimple(p.description||'')}</div>
          </div>
          <div class="list-item-actions">
            ${installed
              ? `<span class="badge badge-cyan">已安装</span>`
              : `<button class="btn btn-xs btn-primary" onclick="_fetchAndInstall('${p.url}','${p.url}')">安装</button>`
            }
          </div>
        </div>`;
    });
  });
  container.innerHTML = html;
}

/* 粘贴代码弹窗 */
function _openCodePasteModal(){
  if(!document.getElementById('modal-paste-code')){
    QY.ui.addModal({
      id: 'modal-paste-code',
      title: '📋 粘贴代码安装',
      html: `
        <div class="field-group">
          <label class="field-label">插件代码</label>
          <textarea id="paste-code-input" rows="12" placeholder="// @name   我的插件&#10;// @version 1.0.0&#10;// 在此粘贴插件代码…" style="font-family:monospace;font-size:12px"></textarea>
        </div>
        <button class="btn btn-primary btn-full" onclick="_installFromPaste()">安装</button>`
    });
  }
  openModal('modal-paste-code');
}

function _installFromPaste(){
  const code = document.getElementById('paste-code-input')?.value.trim();
  if(!code){ showToast('请粘贴插件代码','warn'); return; }
  closeModal('modal-paste-code');
  _installFromCode(code, '粘贴插件', '本地粘贴');
}

/* 检查更新（对比版本号） */
async function checkPluginUpdates(){
  let count = 0;
  for(const p of State.plugins){
    if(!p.source || !p.source.startsWith('http')) continue;
    try{
      const code = await _fetchCode(p.source);
      const meta = _parsePluginMeta(code);
      if(meta.version && meta.version !== p.version){
        p.hasUpdate  = true;
        p._newCode   = code;
        p._newVersion= meta.version;
        count++;
      }
    } catch{}
  }
  ls('qy_plugins', State.plugins);
  renderPluginList();
  if(count > 0) showToast(`发现 ${count} 个插件有更新`, 'warn');
  else showToast('所有插件已是最新版本', 'success');
}

/* 简易转义（避免循环依赖 Markdown） */
function escapeHtmlSimple(str = ''){
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ================================================================
   初始化 — 监听 Bus 事件
   ================================================================ */
Bus.on('plugin:installed', renderPluginList);
Bus.on('plugin:removed',   renderPluginList);
Bus.on('plugin:updated',   renderPluginList);
