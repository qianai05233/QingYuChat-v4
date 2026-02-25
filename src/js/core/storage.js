/**
 * QingYu Chat v4 — core/storage.js
 * localStorage 工具函数 + 数据导入导出
 */

/* ── 基础读写 ── */

/**
 * 读取或写入 localStorage（JSON 自动序列化）
 * @param {string} key
 * @param {any}    [val]  不传则为读取
 * @returns {any}
 */
function ls(key, val){
  if(val === undefined){
    try{ return JSON.parse(localStorage.getItem(key)); }
    catch{ return null; }
  }
  try{
    localStorage.setItem(key, JSON.stringify(val));
  } catch(e){
    if(e.name === 'QuotaExceededError'){
      showToast('⚠️ 存储空间不足，请清理旧数据', 'error', 4000);
    }
    console.error('[Storage] write error:', e);
  }
}

/**
 * 删除某个 key
 */
function lsDel(key){
  localStorage.removeItem(key);
}

/* ── 存储空间统计 ── */

/**
 * 计算当前 localStorage 使用量（字节）
 * @returns {number}
 */
function calcStorageUsage(){
  let total = 0;
  for(let i = 0; i < localStorage.length; i++){
    const k = localStorage.key(i);
    const v = localStorage.getItem(k) || '';
    total += k.length + v.length;
  }
  return total * 2; // UTF-16 每字符 2 字节
}

/**
 * 格式化字节数为可读字符串
 */
function formatBytes(bytes){
  if(bytes < 1024) return bytes + ' B';
  if(bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1024/1024).toFixed(2) + ' MB';
}

/**
 * 更新设置页的存储空间显示
 */
function updateStorageInfo(){
  const el = document.getElementById('storage-info');
  if(!el) return;
  const used = calcStorageUsage();
  // 浏览器通常限制 5MB
  const limit = 5 * 1024 * 1024;
  const pct = Math.min(100, (used / limit * 100)).toFixed(1);
  el.textContent = `已使用 ${formatBytes(used)} / ~5 MB（${pct}%）`;
}

/* ── 全量导出 ── */

/**
 * 导出所有 QY 数据为 JSON 文件
 */
function exportAllData(){
  const keys = [
    'qy_config','qy_persona','qy_characters',
    'qy_wb_books','qy_active_wb_book','qy_wb_scan_depth',
    'qy_preset_groups','qy_active_preset_group',
    'qy_author_note','qy_regex_scripts','qy_plugins',
    'qy_active_char','qy_bg','qy_bg_opacity','qy_tts'
  ];

  // 导出所有聊天记录（qy_msgs_xxx）
  const msgKeys = [];
  for(let i = 0; i < localStorage.length; i++){
    const k = localStorage.key(i);
    if(k && k.startsWith('qy_msgs_')) msgKeys.push(k);
  }

  const data = { _version: State.version, _time: Date.now() };
  [...keys, ...msgKeys].forEach(k => {
    const v = localStorage.getItem(k);
    if(v !== null) data[k] = JSON.parse(v);
  });

  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `QingYuChat_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✓ 全部数据已导出', 'success');
  Bus.emit('data:exported');
}

/* ── 全量导入 ── */

/**
 * 触发文件选择，导入备份 JSON
 */
function importAllData(){
  const input = document.createElement('input');
  input.type  = 'file';
  input.accept = '.json,application/json';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', function(){
    const file = this.files?.[0];
    if(!file){ document.body.removeChild(input); return; }
    const reader = new FileReader();
    reader.onload = function(e){
      try{
        const data = JSON.parse(e.target.result);
        if(!data._version) throw new Error('非有效备份文件');
        if(!confirm(`导入备份将覆盖当前全部数据，确认？\n备份时间：${new Date(data._time).toLocaleString()}`)){
          document.body.removeChild(input); return;
        }
        Object.keys(data).forEach(k => {
          if(!k.startsWith('_')){
            localStorage.setItem(k, JSON.stringify(data[k]));
          }
        });
        showToast('✓ 导入成功，正在重载…', 'success');
        Bus.emit('data:imported');
        setTimeout(() => location.reload(), 800);
      } catch(err){
        showToast('导入失败：' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    document.body.removeChild(input);
  });
  input.click();
}

/* ── 清除全部数据 ── */

function clearAllData(){
  if(!confirm('⚠️ 确定要清除所有数据吗？此操作不可撤销！')) return;
  const keysToRemove = [];
  for(let i = 0; i < localStorage.length; i++){
    const k = localStorage.key(i);
    if(k && k.startsWith('qy_')) keysToRemove.push(k);
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
  showToast('✓ 已清除全部数据，正在重载…', 'success');
  Bus.emit('data:cleared');
  setTimeout(() => location.reload(), 800);
}

/* ── 初始化时从 localStorage 恢复 State ── */

function loadStateFromStorage(){
  // Config
  const cfg = ls('qy_config');
  if(cfg) State.config = { ...State.config, ...cfg };

  // Persona
  const persona = ls('qy_persona');
  if(persona) State.persona = { ...State.persona, ...persona };

  // Characters
  const chars = ls('qy_characters');
  if(chars?.length) State.characters = chars;

  // World Books（含旧版迁移）
  const wbBooks = ls('qy_wb_books');
  if(wbBooks?.length){
    State.wbBooks = wbBooks;
  } else {
    const oldWb = ls('qy_worldbook');
    if(oldWb?.length){
      State.wbBooks = [{ id:'wb_'+Date.now(), name:'默认世界书', entries: oldWb }];
      ls('qy_wb_books', State.wbBooks);
    }
  }
  const aWbId = ls('qy_active_wb_book');
  State.activeWbBookId = (aWbId && State.wbBooks.find(b => b.id === aWbId))
    ? aWbId : (State.wbBooks[0]?.id || null);
  const wbSd = ls('qy_wb_scan_depth');
  if(wbSd != null) State.wbScanDepth = wbSd;

  // Preset Groups（含旧版迁移）
  const presetGroups = ls('qy_preset_groups');
  if(presetGroups?.length){
    State.presetGroups = presetGroups;
  } else {
    const oldPre = ls('qy_presets');
    if(oldPre?.length){
      State.presetGroups = [{ id:'pg_'+Date.now(), name:'默认预设组', items: oldPre }];
      ls('qy_preset_groups', State.presetGroups);
    }
  }
  const aPgId = ls('qy_active_preset_group');
  State.activePresetGroupId = (aPgId && State.presetGroups.find(g => g.id === aPgId))
    ? aPgId : (State.presetGroups[0]?.id || null);

  // Author Note
  const an = ls('qy_author_note');
  if(an) State.authorNote = { ...State.authorNote, ...an };

  // Regex Scripts
  const regex = ls('qy_regex_scripts');
  if(regex?.length) State.regexScripts = regex;

  // Plugins
  const plugins = ls('qy_plugins');
  if(plugins?.length) State.plugins = plugins;

  // TTS
  const tts = ls('qy_tts');
  if(tts) State.tts = { ...State.tts, ...tts };

  // Stats
  const stats = ls('qy_stats');
  if(stats) State.stats = { ...State.stats, ...stats };
}

/**
 * 保存统计数据
 */
function saveStats(){
  ls('qy_stats', State.stats);
}
