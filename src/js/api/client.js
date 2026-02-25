/**
 * QingYu Chat v4 — api/client.js
 * API 客户端（支持流式输出 / 停止生成 / 重试）
 */

/* ── 发送主函数 ── */

/**
 * 发送消息并处理流式响应
 * @param {string}   userMessage      用户输入
 * @param {function} onToken          每个 token 回调 fn(chunk: string)
 * @param {function} onDone           完成回调 fn(fullText: string)
 * @param {function} onError          错误回调 fn(error: Error)
 */
async function sendToAPI(userMessage, onToken, onDone, onError){
  const cfg = State.runtimeParams || State.config;

  if(!cfg.baseUrl){ onError(new Error('请先在设置页配置 Base URL')); return; }
  if(!cfg.apiKey)  { onError(new Error('请先在设置页配置 API Key')); return; }
  if(!cfg.model)   { onError(new Error('请先选择模型')); return; }

  // 应用插件 beforeSend 钩子
  let processedMsg = userMessage;
  for(const hook of (window._QY_HOOKS_?.beforeSend || [])){
    try{ processedMsg = (await hook(processedMsg)) || processedMsg; }
    catch(e){ console.warn('[Plugin] beforeSend hook error:', e); }
  }

  // 应用正则（用户消息发出前）
  processedMsg = RegexEngine.applyToOutput(processedMsg);

  // 构建 API Messages
  const { system, messages } = buildApiMessages(processedMsg);

  // 构建请求体
  const body = {
    model:       cfg.model,
    messages:    messages,
    max_tokens:  cfg.maxTokens  || 2048,
    temperature: cfg.temperature ?? 0.8,
    top_p:       cfg.topP       ?? 1.0,
    stream:      true
  };

  if(cfg.freqPenalty) body.frequency_penalty  = cfg.freqPenalty;
  if(cfg.presPenalty) body.presence_penalty   = cfg.presPenalty;
  if(cfg.stopStrings?.length) body.stop       = cfg.stopStrings;

  // system 字段（兼容 OpenAI / Claude 格式）
  if(system){
    // OpenAI 格式：messages 第一条 role=system
    body.messages = [{ role:'system', content: system }, ...messages];
  }

  // 记录日志
  const reqStart = Date.now();
  Bus.emit('api:request', { model: cfg.model, tokens: estimateMsgTokens(messages) });

  // 创建 AbortController
  State.abortCtrl = new AbortController();
  State.isStreaming = true;

  try{
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`
      },
      body:   JSON.stringify(body),
      signal: State.abortCtrl.signal
    });

    if(!res.ok){
      const errText = await res.text();
      let errMsg = `HTTP ${res.status}`;
      try{
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errMsg;
      } catch{}
      throw new Error(errMsg);
    }

    // ── 流式读取 ──
    const reader  = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText  = '';
    let buffer    = '';

    while(true){
      const { done, value } = await reader.read();
      if(done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留未完整的行

      for(const line of lines){
        const trimmed = line.trim();
        if(!trimmed || trimmed === 'data: [DONE]') continue;
        if(!trimmed.startsWith('data: ')) continue;

        try{
          const json   = JSON.parse(trimmed.slice(6));
          const delta  = json.choices?.[0]?.delta?.content || '';
          if(delta){
            fullText += delta;
            onToken(delta);
          }
        } catch{ /* 跳过解析失败的行 */ }
      }
    }

    // ── 完成后处理 ──
    State.isStreaming = false;
    State.abortCtrl  = null;

    // 应用正则（AI 回复内容）
    let finalText = RegexEngine.applyToInput(fullText);

    // 应用插件 afterReceive 钩子
    for(const hook of (window._QY_HOOKS_?.afterReceive || [])){
      try{ finalText = (await hook(finalText)) || finalText; }
      catch(e){ console.warn('[Plugin] afterReceive hook error:', e); }
    }

    const duration = Date.now() - reqStart;
    Bus.emit('api:response', {
      model:    cfg.model,
      tokens:   estimateTokens(finalText),
      duration: duration,
      status:   200
    });

    // 统计
    State.stats.totalTokens += estimateTokens(fullText);
    if(State.currentChar?.id){
      const cs = State.stats.byChar[State.currentChar.id] || { messages:0, tokens:0, lastTime:0 };
      cs.tokens   += estimateTokens(fullText);
      cs.messages += 1;
      cs.lastTime  = Date.now();
      State.stats.byChar[State.currentChar.id] = cs;
    }
    const today = new Date().toISOString().slice(0,10);
    State.stats.byDate[today] = (State.stats.byDate[today] || 0) + 1;
    saveStats();

    onDone(finalText);

  } catch(e){
    State.isStreaming = false;
    State.abortCtrl  = null;

    if(e.name === 'AbortError'){
      // 用户主动停止，不算错误
      Bus.emit('api:response', { status:'aborted', model: cfg.model });
      onDone(''); // 以已收到内容为准（由 chat.js 处理）
      return;
    }

    Bus.emit('api:error', { message: e.message, model: cfg.model });
    addLog({ type:'error', msg: e.message });
    onError(e);
  }
}

/* ── 停止生成 ── */
function stopGenerate(){
  if(State.abortCtrl){
    State.abortCtrl.abort();
  }
}

/* ── 获取模型列表 ── */
async function fetchModels(){
  const baseUrl = document.getElementById('cfg-baseurl').value.trim().replace(/\/$/,'');
  const apiKey  = document.getElementById('cfg-apikey').value.trim();
  if(!baseUrl || !apiKey){ showToast('请先填写 Base URL 和 API Key','error'); return; }

  showToast('正在获取模型列表…');
  try{
    const res  = await fetch(`${baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data   = await res.json();
    const models = (data.data || []).map(m => m.id).filter(Boolean).sort();

    const sel  = document.getElementById('cfg-model');
    const prev = sel.value;
    sel.innerHTML = '<option value="">— 请选择模型 —</option>';
    models.forEach(m => {
      const o = document.createElement('option');
      o.value = m; o.textContent = m;
      if(m === prev || m === State.config.model) o.selected = true;
      sel.appendChild(o);
    });
    showToast(`✓ 获取到 ${models.length} 个模型`, 'success');
  } catch(e){
    showToast('获取失败：' + e.message, 'error');
  }
}

/* ── 继续生成 ── */
/**
 * 发送"继续生成"指令，将结果拼接到最后一条 AI 消息
 */
async function continueGenerate(){
  if(State.isStreaming) return;
  const lastMsg = [...State.messages].reverse().find(m => m.role === 'assistant');
  if(!lastMsg){ showToast('没有可继续的 AI 消息','warn'); return; }

  const CONTINUE_PROMPT = '请继续（不要重复已输出内容，直接续写）';
  const msgEl = document.querySelector(`.msg-bubble[data-id="${lastMsg.id}"] .msg-content`);

  setStreamingUI(true);

  await sendToAPI(
    CONTINUE_PROMPT,
    (chunk) => {
      lastMsg.content += chunk;
      if(lastMsg.swipes?.length) lastMsg.swipes[lastMsg.swipeIndex] += chunk;
      if(msgEl) msgEl.innerHTML += escapeForDisplay(chunk);
    },
    (fullText) => {
      if(fullText) ls('qy_msgs_' + State.currentChar?.id, State.messages);
      setStreamingUI(false);
      finalizeLastMessage();
    },
    (err) => {
      showToast('继续生成失败：' + err.message, 'error');
      setStreamingUI(false);
    }
  );
}
