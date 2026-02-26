/**
 * QingYu Chat v4 — pages/regex.js
 * 正则脚本页完整逻辑
 */

let _regexFilter = 'all'; // 当前筛选作用域

/* ── 渲染列表 ── */
function renderRegexList(){
  const container = document.getElementById('regex-list');
  if(!container) return;

  const scripts = State.regexScripts.filter(s => {
    if(_regexFilter === 'all') return true;
    return s.scope === _regexFilter;
  });

  if(!scripts.length){
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔧</div>
        <p>暂无正则脚本</p>
        <p>点击右上角"＋新建"创建脚本</p>
      </div>`;
    return;
  }

  container.innerHTML = scripts.map(s => `
    <div class="list-item" onclick="openRegexEdit('${s.id}')">
      <div class="list-item-body">
        <div class="list-item-title" style="display:flex;align-items:center;gap:6px">
          ${s.name || '未命名'}
          <span class="badge ${s.scope==='char'?'badge-cyan':s.scope==='preset'?'badge-warn':'badge-blue'}">${
            s.scope==='char'?'角色':s.scope==='preset'?'预设':'全局'
          }</span>
          ${!s.enabled ? '<span class="badge" style="background:var(--bg-input);color:var(--text-muted);border:1px solid var(--border)">已禁用</span>' : ''}
        </div>
        <div class="list-item-sub" style="font-family:monospace;font-size:11px">
          /${s.pattern}/ → ${s.replace || '(删除)'}
        </div>
      </div>
      <div class="list-item-actions">
        <label class="toggle-wrap" onclick="event.stopPropagation()">
          <input type="checkbox" ${s.enabled?'checked':''}
            onchange="toggleRegexEnabled('${s.id}',this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>`).join('');
}

/* ── 筛选 ── */
function filterRegex(scope){
  _regexFilter = scope;
  document.querySelectorAll('#regex-scope-filter .btn').forEach(btn => {
    btn.className = btn.textContent.toLowerCase().includes(
      scope==='all'?'全':scope==='global'?'全局':scope==='preset'?'预设':'角色'
    ) ? 'btn btn-xs badge-blue active-filter' : 'btn btn-xs btn-ghost';
  });
  renderRegexList();
}

/* ── 新建 ── */
function newRegexScript(){
  State.editingRegexId = null;
  document.getElementById('regex-name').value        = '';
  document.getElementById('regex-scope').value       = 'global';
  document.getElementById('regex-pattern').value     = '';
  document.getElementById('regex-replace').value     = '';
  document.getElementById('regex-global').checked    = true;
  document.getElementById('regex-insensitive').checked = false;
  document.getElementById('regex-enabled').checked   = true;
  document.getElementById('regex-test-input').value  = '';
  document.getElementById('regex-preview-out').textContent = '';
  openModal('modal-regex');
}

/* ── 编辑 ── */
function openRegexEdit(id){
  const s = State.regexScripts.find(x => x.id === id);
  if(!s) return;
  State.editingRegexId = id;
  document.getElementById('regex-name').value          = s.name || '';
  document.getElementById('regex-scope').value         = s.scope || 'global';
  document.getElementById('regex-pattern').value       = s.pattern || '';
  document.getElementById('regex-replace').value       = s.replace || '';
  document.getElementById('regex-global').checked      = s.flags?.g !== false;
  document.getElementById('regex-insensitive').checked = !!s.flags?.i;
  document.getElementById('regex-enabled').checked     = s.enabled !== false;
  document.getElementById('regex-test-input').value    = '';
  document.getElementById('regex-preview-out').textContent = '';
  openModal('modal-regex');
}

/* ── 保存 ── */
function saveRegexScript(){
  const name    = document.getElementById('regex-name').value.trim();
  const scope   = document.getElementById('regex-scope').value;
  const pattern = document.getElementById('regex-pattern').value.trim();
  const replace = document.getElementById('regex-replace').value;
  const gFlag   = document.getElementById('regex-global').checked;
  const iFlag   = document.getElementById('regex-insensitive').checked;
  const enabled = document.getElementById('regex-enabled').checked;

  if(!pattern){ showToast('请填写匹配模式','warn'); return; }

  // 验证正则表达式合法性
  try{
    new RegExp(pattern, (gFlag?'g':'') + (iFlag?'i':''));
  } catch(e){
    showToast('正则表达式无效：' + e.message, 'error'); return;
  }

  if(State.editingRegexId){
    const s = State.regexScripts.find(x => x.id === State.editingRegexId);
    if(s){
      Object.assign(s, { name, scope, pattern, replace, flags:{g:gFlag,i:iFlag}, enabled });
    }
  } else {
    State.regexScripts.push({
      id:      'rex_' + Date.now(),
      name, scope, pattern, replace,
      flags:   { g:gFlag, i:iFlag },
      enabled
    });
  }

  ls('qy_regex_scripts', State.regexScripts);
  closeModal('modal-regex');
  renderRegexList();
  Bus.emit('regex:changed', State.regexScripts);
  showToast('✓ 已保存', 'success');
}

/* ── 删除 ── */
function deleteRegexScript(){
  if(!State.editingRegexId) return;
  if(!confirm('确认删除此正则脚本？')) return;
  State.regexScripts = State.regexScripts.filter(s => s.id !== State.editingRegexId);
  ls('qy_regex_scripts', State.regexScripts);
  closeModal('modal-regex');
  renderRegexList();
  Bus.emit('regex:changed', State.regexScripts);
  showToast('已删除', 'success');
}

/* ── 启用/禁用（列表内快速切换） ── */
function toggleRegexEnabled(id, enabled){
  const s = State.regexScripts.find(x => x.id === id);
  if(s){
    s.enabled = enabled;
    ls('qy_regex_scripts', State.regexScripts);
    Bus.emit('regex:changed', State.regexScripts);
  }
}

/* ── 实时预览 ── */
function previewRegex(){
  const pattern = document.getElementById('regex-pattern').value;
  const replace = document.getElementById('regex-replace').value;
  const gFlag   = document.getElementById('regex-global').checked;
  const iFlag   = document.getElementById('regex-insensitive').checked;
  const testText= document.getElementById('regex-test-input').value;
  const outEl   = document.getElementById('regex-preview-out');
  if(!outEl) return;

  const { result, error } = RegexEngine.preview(pattern, replace, {g:gFlag,i:iFlag}, testText);
  if(error){
    outEl.style.color = 'var(--danger)';
    outEl.textContent = '⚠ ' + error;
  } else {
    outEl.style.color = 'var(--text-secondary)';
    outEl.textContent = result || '(空)';
  }
}

/* ── Bus 监听 ── */
Bus.on('regex:changed', renderRegexList);
Bus.on('char:activated', renderRegexList);
Bus.on('preset:changed', renderRegexList);
