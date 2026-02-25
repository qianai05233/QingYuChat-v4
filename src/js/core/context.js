/**
 * QingYu Chat v4 — core/context.js
 * 上下文构建器 / Token 计数 / System Prompt 组装
 *
 * 职责：
 *  1. estimateTokens      文本 token 数估算
 *  2. buildSystemPrompt   组装完整系统提示
 *  3. buildApiMessages    构建发送给 API 的 messages 数组
 *  4. trimContextMessages 按 token 预算裁切历史消息
 *  5. updateCtxBar        刷新进度条 UI
 *  6. previewContext      弹出完整 Prompt 预览弹窗
 */

/* ── Token 估算 ── */

/**
 * 估算文本的 token 数（粗略）
 * CJK 字符约 0.5 token，ASCII 约 0.25 token
 */
function estimateTokens(text){
  if(!text) return 0;
  let tok = 0;
  for(const ch of text){
    const code = ch.codePointAt(0);
    tok += (code > 0x2E7F) ? 0.5 : 0.25;
  }
  return Math.ceil(tok);
}

/**
 * 估算消息数组的总 token 数（每条消息额外 +4 overhead）
 */
function estimateMsgTokens(msgs){
  return msgs.reduce((s, m) => s + estimateTokens(m.content) + 4, 0);
}

/* ── System Prompt 构建 ── */

/**
 * 组装完整 System Prompt
 * 顺序：预设提示词条目 → 角色定义 → 世界书注入 → 作者注释
 *
 * @param {string} userMessage  当前用户消息（供世界书扫描使用）
 * @returns {string}
 */
function buildSystemPrompt(userMessage){
  const char   = State.currentChar;
  const preset = getActivePreset();
  const cfg    = State.runtimeParams || State.config;
  const parts  = [];

  // ── 1. 预设提示词条目（按顺序，已启用的） ──
  const presetItems = preset?.items || preset?.prompts || [];
  presetItems.filter(p => p.enabled !== false).forEach(p => {
    const content = applyMacros(p.content || '');
    if(content.trim()) parts.push(content.trim());
  });

  // ── 2. 角色系统提示（角色卡 system_prompt 字段） ──
  if(char?.system_prompt){
    parts.push(applyMacros(char.system_prompt));
  }

  // ── 3. 角色描述 / 性格 / 场景 ──
  if(char){
    const desc = [];
    if(char.description)  desc.push(`[角色描述]\n${applyMacros(char.description)}`);
    if(char.personality)  desc.push(`[性格]\n${applyMacros(char.personality)}`);
    if(char.scenario)     desc.push(`[场景]\n${applyMacros(char.scenario)}`);
    if(desc.length) parts.push(desc.join('\n\n'));
  }

  // ── 4. 世界书注入（position: before_char_def / after_char_def / top / bottom） ──
  const wbEntries = Priority.getActiveWorldbookEntries();
  const scanText  = [userMessage, ...(State.messages.slice(-State.wbScanDepth).map(m => m.content))].join('\n');
  const triggered = WBScanner.scan(wbEntries, scanText);

  const wbTop    = triggered.filter(e => e.position === 'top');
  const wbBefore = triggered.filter(e => e.position === 'before_char_def');
  const wbAfter  = triggered.filter(e => e.position === 'after_char_def' || !e.position);
  const wbBottom = triggered.filter(e => e.position === 'bottom');

  if(wbTop.length)    parts.unshift(...wbTop.map(e => applyMacros(e.content)));
  if(wbBefore.length) parts.splice(2, 0, ...wbBefore.map(e => applyMacros(e.content)));
  if(wbAfter.length)  parts.push(...wbAfter.map(e => applyMacros(e.content)));

  // ── 5. 人设（用户描述注入系统提示） ──
  const persona = Priority.getActivePersona();
  if(persona.desc){
    parts.push(`[用户（${persona.name}）]\n${applyMacros(persona.desc)}`);
  }

  // ── 6. 底部世界书 ──
  if(wbBottom.length) parts.push(...wbBottom.map(e => applyMacros(e.content)));

  let system = parts.filter(Boolean).join('\n\n---\n\n');

  // ── 7. 作者注释（插入位置由 depth 控制，这里先构建 system，后续在 buildApiMessages 处理） ──
  return system;
}

/* ── API Messages 构建 ── */

/**
 * 构建完整的 API messages 数组
 * @param {string} userMessage  即将发送的用户消息
 * @returns {{ system: string, messages: Array }}
 */
function buildApiMessages(userMessage){
  const system   = buildSystemPrompt(userMessage);
  const char     = State.currentChar;
  const cfg      = State.runtimeParams || State.config;
  const an       = Priority.getActiveAuthorNote();
  const messages = [];

  // 示例对话（mes_example）
  if(char?.mes_example){
    const exampleRaw = applyMacros(char.mes_example);
    // 解析 <START> 分隔的示例对话
    const blocks = exampleRaw.split('<START>').map(b => b.trim()).filter(Boolean);
    blocks.forEach(block => {
      const lines = block.split('\n').filter(Boolean);
      lines.forEach(line => {
        const userMatch = line.match(/^(?:用户|USER|{{user}})[：:]\s*(.+)/i);
        const charMatch = line.match(/^(?:{{char}}|角色|CHAR)[：:]\s*(.+)/i);
        if(userMatch) messages.push({ role:'user',      content: applyMacros(userMatch[1]) });
        if(charMatch) messages.push({ role:'assistant', content: applyMacros(charMatch[1]) });
      });
    });
  }

  // 聊天历史
  State.messages.forEach(m => {
    const content = m.swipes?.length
      ? applyMacros(m.swipes[m.swipeIndex] || m.content)
      : applyMacros(m.content);
    messages.push({ role: m.role, content });
  });

  // 作者注释（按 depth 插入，depth=0 表示最底部，depth=4 表示倒数第4条之后）
  if(an.enabled && an.content){
    const anContent = `[作者注释：${applyMacros(an.content)}]`;
    const depth     = Math.max(0, an.depth || 4);
    const insertAt  = Math.max(0, messages.length - depth);
    messages.splice(insertAt, 0, { role:'system', content: anContent });
  }

  // 追加当前用户消息
  messages.push({ role:'user', content: userMessage });

  // 历史后注入（post_history_instructions）
  if(char?.post_history_instructions){
    messages.push({ role:'system', content: applyMacros(char.post_history_instructions) });
  }

  // 裁切上下文
  const trimmed = trimContextMessages(messages, system);

  return { system, messages: trimmed };
}

/* ── 上下文裁切 ── */

/**
 * 按 token 预算裁切消息，从最旧的开始丢弃
 * @param {Array}  apiMessages
 * @param {string} systemPrompt
 * @returns {Array}
 */
function trimContextMessages(apiMessages, systemPrompt){
  const cfg    = State.runtimeParams || State.config;
  const maxCtx = cfg.contextSize || 4096;
  const maxNew = cfg.maxTokens   || 2048;
  const budget = maxCtx - maxNew - estimateTokens(systemPrompt) - 100;

  if(budget <= 0) return apiMessages.slice(-2);

  let total  = 0;
  const msgs = [...apiMessages];
  const result = [];

  for(let i = msgs.length - 1; i >= 0; i--){
    const t = estimateTokens(msgs[i].content) + 4;
    if(total + t > budget && result.length > 0){
      Bus.emit('context:overflow', { dropped: i + 1 });
      break;
    }
    total += t;
    result.unshift(msgs[i]);
  }
  return result;
}

/* ── Token 进度条 UI ── */

/**
 * 更新聊天页顶部的 token 进度条
 */
function updateCtxBar(){
  const cfg   = State.runtimeParams || State.config;
  const total = cfg.contextSize || 4096;
  const used  = estimateMsgTokens(State.messages) + estimateTokens(buildSystemPrompt(''));
  const pct   = Math.min(100, (used / total) * 100);

  const fill  = document.getElementById('ctx-bar-fill');
  const bar   = document.getElementById('ctx-bar');
  const info  = document.getElementById('ctx-info-txt');

  if(fill) fill.style.width = pct + '%';
  if(bar){
    bar.className = '';
    if(pct > 90) bar.className = 'crit';
    else if(pct > 70) bar.className = 'warn';
  }
  if(info) info.textContent = `~${used}/${total} tok`;

  if(pct > 95) Bus.emit('context:overflow', { pct });
}

/* ── 上下文预览弹窗 ── */

/**
 * 弹出完整 Prompt 预览（点击 token 计数触发）
 */
function previewContext(){
  const system = buildSystemPrompt('（当前输入框内容）');
  const el = document.getElementById('ctx-preview-content');
  if(!el){ openModal('modal-ctx-preview'); return; }

  const cfg   = State.runtimeParams || State.config;
  const total = cfg.contextSize || 4096;
  const used  = estimateTokens(system) + estimateMsgTokens(State.messages);

  let preview = `=== System Prompt (${estimateTokens(system)} tok) ===\n${system}\n\n`;
  preview += `=== 消息历史 (${estimateMsgTokens(State.messages)} tok) ===\n`;
  State.messages.forEach((m, i) => {
    preview += `\n[${i+1}] ${m.role === 'user' ? '用户' : State.currentChar?.name || 'AI'}:\n${m.content}\n`;
  });
  preview += `\n=== 总计：~${used}/${total} tokens ===`;

  el.textContent = preview;
  openModal('modal-ctx-preview');
}

/* ── 消息计数器 ── */

function updateMsgCounter(){
  const el = document.getElementById('msg-counter');
  if(!el) return;
  const total = State.messages.length;
  if(!total){ el.textContent = ''; return; }
  el.textContent = `${total}条`;
}

/* ── 初始化监听 ── */
Bus.on('context:recalc', updateCtxBar);
