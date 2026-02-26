/**
 * QingYu Chat v4 — pages/persona.js
 * 人设页完整逻辑（含三级覆盖来源显示）
 */

/* ── 渲染覆盖来源横幅 ── */
function renderPersonaOverrideBanner(){
  const banner = document.getElementById('persona-override-banner');
  if(!banner) return;

  const active = Priority.getActivePersona();
  if(!active._source || active._source === 'global'){
    banner.style.display = 'none';
    return;
  }

  const sourceLabel = active._source === 'preset'
    ? `🔓 预设"${getActivePreset()?.name || ''}"覆盖人设为：${active.name}`
    : `👤 角色"${State.currentChar?.name || ''}"覆盖人设为：${active.name}`;

  banner.style.display = 'block';
  banner.innerHTML = `
    <div style="margin:6px 10px;padding:8px 12px;background:rgba(255,180,0,.08);
      border:1px solid rgba(255,180,0,.25);border-radius:8px;font-size:12px;
      color:var(--warn);display:flex;align-items:center;gap:6px">
      ⚠️ ${sourceLabel}
    </div>`;
}

/* ── 渲染人设头像预览 ── */
function renderPersonaAvatar(){
  const preview = document.getElementById('persona-avatar-preview');
  if(!preview) return;
  const src = State.persona.avatar;
  preview.innerHTML = src
    ? `<img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : '👤';
}

/* ── 保存人设 ── */
function savePersona(){
  const name = document.getElementById('persona-name')?.value.trim() || '用户';
  const desc = document.getElementById('persona-desc')?.value || '';
  State.persona.name = name;
  State.persona.desc = desc;
  ls('qy_persona', State.persona);
  Bus.emit('persona:changed', State.persona);
  showToast('✓ 人设已保存', 'success');
}

/* ── 上传人设头像 ── */
function triggerPersonaAvatarUpload(){
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
      State.persona.avatar = e.target.result;
      ls('qy_persona', State.persona);
      renderPersonaAvatar();
      Bus.emit('persona:changed', State.persona);
      showToast('✓ 头像已更新', 'success');
    };
    reader.readAsDataURL(file);
    document.body.removeChild(input);
  });
  input.click();
}

/* ── 加载人设到表单 ── */
function loadPersonaForm(){
  const el_name = document.getElementById('persona-name');
  const el_desc = document.getElementById('persona-desc');
  if(el_name) el_name.value = State.persona.name || '';
  if(el_desc) el_desc.value = State.persona.desc || '';
  renderPersonaAvatar();
  renderPersonaOverrideBanner();
}

/* ── Bus 监听 ── */
Bus.on('persona:changed',  () => { renderPersonaAvatar(); renderPersonaOverrideBanner(); });
Bus.on('char:activated',   renderPersonaOverrideBanner);
Bus.on('preset:changed',   renderPersonaOverrideBanner);
Bus.on('params:override:updated', renderPersonaOverrideBanner);
