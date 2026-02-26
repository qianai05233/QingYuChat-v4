/**
 * QingYu Chat v4 — pages/settings.js
 * 设置页逻辑 + 全局 init() 函数（App 启动入口）
 */

/* ================================================================
   CONFIG SAVE / LOAD
   ================================================================ */
function saveConfig(){
  const baseUrl    = document.getElementById('cfg-baseurl')?.value.trim().replace(/\/$/,'') || '';
  const apiKey     = document.getElementById('cfg-apikey')?.value.trim() || '';
  const selModel   = document.getElementById('cfg-model')?.value || '';
  const cusModel   = document.getElementById('cfg-model-custom')?.value.trim() || '';
  const model      = cusModel || selModel;
  const stopRaw    = document.getElementById('cfg-stop')?.value || '';
  const stopStrings= stopRaw.split('\n').map(s=>s.trim()).filter(Boolean);

  if(!baseUrl){ showToast('请填写 Base URL','error'); return; }
  if(!apiKey)  { showToast('请填写 API Key','error'); return; }
  if(!model)   { showToast('请选择或输入模型名','error'); return; }

  State.config = {
    baseUrl, apiKey, model, stopStrings,
    temperature: parseFloat(document.getElementById('cfg-temp')?.value   ?? 0.8),
    topP:        parseFloat(document.getElementById('cfg-topp')?.value   ?? 1.0),
    maxTokens:   parseInt(document.getElementById('cfg-maxtok')?.value   ?? 2048),
    contextSize: parseInt(document.getElementById('cfg-ctxsize')?.value  ?? 4096),
    freqPenalty: parseFloat(document.getElementById('cfg-freq')?.value   ?? 0),
    presPenalty: parseFloat(document.getElementById('cfg-pres')?.value   ?? 0),
  };
  ls('qy_config', State.config);
  Priority.recalc();
  updateStorageInfo();
  showToast('✓ 配置已保存', 'success');
  Bus.emit('params:changed', State.config);
}

/* ── 设置页覆盖标签刷新 ── */
function renderPresetOverrideTags(){
  const fields = ['temperature','topP','maxTokens','contextSize','freqPenalty','presPenalty'];
  const tagMap  = {
    temperature: 'temp-override-tag',
    topP:        'topp-override-tag'
  };
  fields.forEach(f => {
    const tagId = tagMap[f];
    if(!tagId) return;
    const el = document.getElementById(tagId);
    if(!el) return;
    const src = Priority.sourceOf(f);
    if(src === 'global'){
      el.style.display = 'none';
    } else {
      el.style.display = 'inline';
      el.textContent   = src === 'preset' ? '预设覆盖' : '角色覆盖';
    }
  });
}

/* ── 背景图 ── */
function triggerBgUpload(){
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', function(){
    const file = this.files?.[0];
    if(!file){ document.body.removeChild(input); return; }
    const reader = new FileReader();
    reader.onload = e => {
      ls('qy_bg', e.target.result);
      applyBg(e.target.result);
      showToast('✓ 背景已更新', 'success');
    };
    reader.readAsDataURL(file);
    document.body.removeChild(input);
  });
  input.click();
}

function applyBg(dataUrl){
  let layer = document.getElementById('bg-layer');
  if(!layer){
    layer = document.createElement('div');
    layer.id = 'bg-layer';
    document.body.prepend(layer);
  }
  layer.style.cssText = `
    position:fixed;inset:0;z-index:0;pointer-events:none;
    background-image:url(${dataUrl});
    background-size:cover;background-position:center;
    opacity:${ls('qy_bg_opacity') ?? 0.5};
  `;
}

function applyBgOpacity(val){
  const v = parseFloat(val);
  document.getElementById('bg-opacity-val')?.setAttribute !== undefined &&
    (document.getElementById('bg-opacity-val').textContent = v.toFixed(2));
  const layer = document.getElementById('bg-layer');
  if(layer) layer.style.opacity = v;
  ls('qy_bg_opacity', v);
}

function clearBg(){
  lsDel('qy_bg');
  const layer = document.getElementById('bg-layer');
  if(layer){ layer.style.backgroundImage = ''; layer.style.opacity = 0; }
  showToast('✓ 背景已清除', 'success');
}

/* ── 滑块辅助 ── */
function setSlider(id, valId, value, dec){
  const el = document.getElementById(id);
  const ve = document.getElementById(valId);
  if(el) el.value = value;
  if(ve) ve.textContent = parseFloat(value).toFixed(dec);
}

/* ================================================================
   INIT — App 全局启动入口
   必须在所有其他脚本加载完毕后执行（DOMContentLoaded）
   ================================================================ */
function init(){

  /* ── 1. 从 localStorage 恢复所有状态 ── */
  loadStateFromStorage();

  /* ── 2. 填充设置页表单 ── */
  const cfg = State.config;
  document.getElementById('cfg-baseurl')?.setAttribute('value', cfg.baseUrl  || '');
  if(document.getElementById('cfg-baseurl'))
    document.getElementById('cfg-baseurl').value = cfg.baseUrl || '';
  if(document.getElementById('cfg-apikey'))
    document.getElementById('cfg-apikey').value  = cfg.apiKey  || '';

  setSlider('cfg-temp',   'temp-val',   cfg.temperature ?? 0.8,  2);
  setSlider('cfg-topp',   'topp-val',   cfg.topP        ?? 1.0,  2);
  setSlider('cfg-maxtok', 'maxtok-val', cfg.maxTokens   ?? 2048, 0);
  setSlider('cfg-ctxsize','ctxsize-val',cfg.contextSize  ?? 4096, 0);
  setSlider('cfg-freq',   'freq-val',   cfg.freqPenalty ?? 0,    2);
  setSlider('cfg-pres',   'pres-val',   cfg.presPenalty ?? 0,    2);
  if(document.getElementById('cfg-stop'))
    document.getElementById('cfg-stop').value = (cfg.stopStrings||[]).join('\n');

  /* ── 3. 填充人设表单 ── */
  loadPersonaForm();

  /* ── 4. 恢复模型选项 ── */
  if(cfg.model){
    const sel = document.getElementById('cfg-model');
    if(sel){
      const exists = [...sel.options].some(o => o.value === cfg.model);
      if(!exists){
        const o = document.createElement('option');
        o.value = cfg.model; o.textContent = cfg.model; o.selected = true;
        sel.appendChild(o);
      } else {
        sel.value = cfg.model;
      }
    }
    if(document.getElementById('cfg-model-custom'))
      document.getElementById('cfg-model-custom').value = cfg.model;
  }

  /* ── 5. 恢复背景 ── */
  const bg = ls('qy_bg');
  if(bg) applyBg(bg);
  const bgOp = ls('qy_bg_opacity');
  if(bgOp != null){
    const opEl = document.getElementById('cfg-bg-opacity');
    if(opEl){ opEl.value = bgOp; applyBgOpacity(bgOp); }
  }

  /* ── 6. 恢复世界书扫描深度 ── */
  const wbSdEl = document.getElementById('wb-scan-depth');
  if(wbSdEl) wbSdEl.value = State.wbScanDepth;

  /* ── 7. 初始计算优先级 ── */
  Priority.recalc();

  /* ── 8. 渲染各页面列表 ── */
  renderCharList();
  renderWbBookTabs();
  renderWbList();
  renderPresetGroupSelect();
  renderPresetList();
  renderPresetParamsPanel();
  renderRegexList();
  renderPluginList();

  /* ── 9. 激活上次选中的角色 ── */
  const activeCharId = ls('qy_active_char');
  if(activeCharId){
    const c = State.characters.find(x => x.id === activeCharId);
    if(c) activateCharacter(c, true);
  } else {
    renderChatMessages();
  }

  /* ── 10. 初始化聊天页 ── */
  initChatPage();

  /* ── 11. 加载已启用的插件 ── */
  State.plugins.filter(p => p.enabled).forEach(p => loadPlugin(p));

  /* ── 12. 更新存储统计 ── */
  updateStorageInfo();

  /* ── 13. 触发插件 onInit 钩子 ── */
  (window._QY_HOOKS_?.onInit || []).forEach(fn => {
    try{ fn(); } catch(e){ console.warn('[Plugin] onInit error:', e); }
  });

  /* ── 14. Bus 监听：设置页参数覆盖标签 ── */
  Bus.on('params:override:updated', renderPresetOverrideTags);

  addLog({ type:'event', msg:`QingYu Chat v${State.version} 启动完成` });
}

/* ================================================================
   TTS 设置页
   ================================================================ */
function saveTtsConfig(){
  State.tts = {
    enabled:   document.getElementById('tts-enabled')?.checked    ?? false,
    autoSpeak: document.getElementById('tts-auto')?.checked       ?? false,
    voice:     document.getElementById('tts-voice')?.value        || '',
    rate:      parseFloat(document.getElementById('tts-rate')?.value   ?? 1.0),
    pitch:     parseFloat(document.getElementById('tts-pitch')?.value  ?? 1.0),
    volume:    parseFloat(document.getElementById('tts-volume')?.value ?? 1.0),
  };
  ls('qy_tts', State.tts);
  showToast('✓ 语音设置已保存', 'success');
}

function loadTtsVoices(){
  const sel = document.getElementById('tts-voice');
  if(!sel || !window.speechSynthesis) return;
  const voices = speechSynthesis.getVoices();
  sel.innerHTML = voices.map(v =>
    `<option value="${v.name}" ${v.name===State.tts.voice?'selected':''}>${v.name} (${v.lang})</option>`
  ).join('');
}

function testTts(){
  const text = document.getElementById('tts-test-text')?.value || '你好，这是语音测试。';
  QY.tts.speak(text);
}

// 语音列表异步加载
if(window.speechSynthesis){
  speechSynthesis.addEventListener('voiceschanged', loadTtsVoices);
  loadTtsVoices();
}

/* ================================================================
   世界书扫描深度保存
   ================================================================ */
function saveWbScanDepth(){
  const v = parseInt(document.getElementById('wb-scan-depth')?.value) || 5;
  State.wbScanDepth = Math.max(1, Math.min(50, v));
  ls('qy_wb_scan_depth', State.wbScanDepth);
  showToast('✓ 扫描深度已保存', 'success');
}

/* ================================================================
   Bus 监听
   ================================================================ */
Bus.on('params:override:updated', renderPresetOverrideTags);
