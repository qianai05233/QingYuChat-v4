/**
 * QingYu Chat v4 — features/plugin-api.js
 * 插件公开 API（QY 对象）
 *
 * 插件通过 window.QY 访问所有能力：
 *   QY.hooks.*        生命周期钩子
 *   QY.ui.*           UI 扩展（按钮/页面/弹窗/工具栏）
 *   QY.data.*         插件专属持久化存储
 *   QY.chat.*         消息读写操作
 *   QY.state          全局状态（只读代理）
 *   QY.bus            事件总线
 *   QY.tts.*          TTS 朗读控制
 *   QY.draw.*         绘画生成
 *   QY.api.*          直接调用 AI API
 *   QY.utils.*        工具函数
 *   QY.manifest       当前插件信息（由加载器注入）
 */

const QY = (() => {

  /* ================================================================
     HOOKS — 生命周期钩子
     插件 fn 的返回值会替换原始值（链式管道）
     ================================================================ */
  const _hooks = {
    beforeSend:      [],  // fn(userMessage) → string
    afterReceive:    [],  // fn(aiReply)     → string
    onRender:        [],  // fn(el, text)    → void
    onPresetChange:  [],  // fn(preset)      → void
    onCharChange:    [],  // fn(char)        → void
    onMessageAdd:    [],  // fn(msg)         → msg | void
    onContextBuild:  [],  // fn(messages)    → messages
    onInit:          [],  // fn()            → void
  };
  window._QY_HOOKS_ = _hooks;

  const hooks = {
    beforeSend(fn)    { _hooks.beforeSend.push(fn); },
    afterReceive(fn)  { _hooks.afterReceive.push(fn); },
    onRender(fn)      { _hooks.onRender.push(fn); },
    onPresetChange(fn){ _hooks.onPresetChange.push(fn); Bus.on('preset:changed', fn); },
    onCharChange(fn)  { _hooks.onCharChange.push(fn);  Bus.on('char:activated', fn); },
    onMessageAdd(fn)  { _hooks.onMessageAdd.push(fn); },
    onContextBuild(fn){ _hooks.onContextBuild.push(fn); },
    onInit(fn)        { _hooks.onInit.push(fn); },
    remove(hookName, fn){
      if(_hooks[hookName]) _hooks[hookName] = _hooks[hookName].filter(f => f !== fn);
      Bus.off(hookName === 'onPresetChange' ? 'preset:changed'
            : hookName === 'onCharChange'   ? 'char:activated' : hookName, fn);
    }
  };

  /* ================================================================
     UI — 界面扩展
     ================================================================ */
  const _customPages    = [];
  const _customChatBtns = [];

  const ui = {
    /**
     * 聊天工具栏注册快捷按钮
     * @param {{ id, label, icon, onClick, tooltip }} opts
     */
    addChatButton(opts){
      _customChatBtns.push(opts);
      _renderPluginChatBtns();
    },

    /**
     * 注册新导航页
     * @param {{ id, label, icon, html|render, onShow }} opts
     *   html: string | fn() → string
     *   render: fn(container) → void  (更灵活的渲染方式)
     */
    addPage(opts){
      if(_customPages.find(p => p.id === opts.id)) return; // 去重
      _customPages.push(opts);
      _renderPluginPages();
    },

    /**
     * 注册自定义弹窗
     * @param {{ id, title, html, width }} opts
     */
    addModal(opts){
      if(document.getElementById(opts.id)) return;
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.id        = opts.id;
      overlay.addEventListener('click', e => { if(e.target === overlay) closeModal(opts.id); });
      const w = opts.width ? `max-width:${opts.width}` : '';
      overlay.innerHTML = `
        <div class="modal-box" style="${w}">
          <div class="modal-title">${opts.title || ''}</div>
          <div id="${opts.id}-content">${typeof opts.html === 'function' ? opts.html() : (opts.html || '')}</div>
          <button class="btn btn-ghost btn-full" style="margin-top:10px" onclick="closeModal('${opts.id}')">关闭</button>
        </div>`;
      document.body.appendChild(overlay);
    },

    openModal(id)    { openModal(id); },
    closeModal(id)   { closeModal(id); },
    toast(m, t, d)   { showToast(m, t, d); },
    navigateTo(id)   { switchTabById(id); },

    /**
     * 向插件快捷栏添加内容（可以是按钮/HTML）
     * @param {string} html
     */
    addPluginBarContent(html){
      const bar = document.getElementById('plugin-shortcut-bar');
      if(bar){ bar.insertAdjacentHTML('beforeend', html); }
    },

    /**
     * 更新某个自定义页面的内容（适合响应式插件）
     * @param {string} pageId
     * @param {string|fn} html
     */
    updatePage(pageId, html){
      const el = document.getElementById('page-' + pageId);
      if(!el) return;
      el.innerHTML = typeof html === 'function' ? html() : html;
    },

    /**
     * 更新弹窗内容区
     * @param {string} modalId
     * @param {string|fn} html
     */
    updateModal(modalId, html){
      const el = document.getElementById(modalId + '-content');
      if(!el) return;
      el.innerHTML = typeof html === 'function' ? html() : html;
    }
  };

  function _renderPluginChatBtns(){
    const bar = document.getElementById('plugin-shortcut-bar');
    if(!bar) return;
    bar.innerHTML = '';
    _customChatBtns.forEach(btn => {
      const el = document.createElement('button');
      el.className   = 'btn btn-xs btn-ghost plugin-chat-btn';
      el.title       = btn.tooltip || btn.label;
      el.dataset.id  = btn.id || '';
      el.textContent = (btn.icon ? btn.icon + ' ' : '') + btn.label;
      el.addEventListener('click', () => {
        try{ btn.onClick(); } catch(e){ console.error('[Plugin] chatButton error:', e); }
      });
      bar.appendChild(el);
    });
    if(_customChatBtns.length) bar.style.display = 'flex';
  }

  function _renderPluginPages(){
    const navTabs = document.getElementById('nav-tabs');
    const pages   = document.getElementById('pages');
    if(!navTabs || !pages) return;
    _customPages.forEach(pg => {
      if(document.querySelector(`.nav-tab[data-page="${pg.id}"]`)) return;
      const tab = document.createElement('div');
      tab.className    = 'nav-tab';
      tab.dataset.page = pg.id;
      tab.innerHTML    = `<span class="ti">${pg.icon || '🧩'}</span><span>${pg.label}</span>`;
      tab.addEventListener('click', () => {
        switchTab(tab);
        try{ pg.onShow?.(); } catch(e){ console.error('[Plugin] onShow error:', e); }
      });
      navTabs.appendChild(tab);

      const pageEl = document.createElement('div');
      pageEl.className = 'page';
      pageEl.id        = 'page-' + pg.id;
      if(pg.render){
        pg.render(pageEl);
      } else {
        pageEl.innerHTML = typeof pg.html === 'function' ? pg.html() : (pg.html || '');
      }
      pages.appendChild(pageEl);
    });
  }

  /* ================================================================
     DATA — 插件专属持久化存储
     ================================================================ */
  const data = {
    get(key)      { return ls('qy_plugin_data_' + key); },
    set(key, val) { ls('qy_plugin_data_' + key, val); },
    del(key)      { lsDel('qy_plugin_data_' + key); },
    keys(ns){
      const prefix = 'qy_plugin_data_' + (ns || '');
      const out = [];
      for(let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if(k?.startsWith(prefix)) out.push(k.slice(prefix.length));
      }
      return out;
    }
  };

  /* ================================================================
     CHAT — 消息操作
     ================================================================ */
  const chat = {
    getMessages()           { return [...State.messages]; },
    getCurrentChar()        { return State.currentChar ? { ...State.currentChar } : null; },
    getLastAssistantMessage(){ return [...State.messages].reverse().find(m => m.role==='assistant') || null; },
    getLastUserMessage()    { return [...State.messages].reverse().find(m => m.role==='user') || null; },

    sendAsUser(text){
      const el = document.getElementById('chat-input');
      if(el) el.value = text;
      sendMessage();
    },

    sendAsChar(text){
      const msg = {
        id: 'msg_' + Date.now(), role:'assistant', content: text,
        swipes:[text], swipeIndex:0, timestamp:Date.now(), bookmarked:false, branchId:null
      };
      State.messages.push(msg);
      ls('qy_msgs_' + State.currentChar?.id, State.messages);
      renderChatMessages();
      Bus.emit('message:received', msg);
    },

    editMessage(id, content){
      const msg = State.messages.find(m => m.id === id);
      if(!msg) return false;
      msg.content = content;
      if(msg.swipes) msg.swipes[msg.swipeIndex] = content;
      ls('qy_msgs_' + State.currentChar?.id, State.messages);
      finalizeMarkdown(id, content);
      Bus.emit('message:edited', { id, content });
      return true;
    },

    deleteMessage(id){
      const idx = State.messages.findIndex(m => m.id === id);
      if(idx === -1) return false;
      State.messages.splice(idx, 1);
      ls('qy_msgs_' + State.currentChar?.id, State.messages);
      renderChatMessages();
      Bus.emit('message:deleted', { id });
      return true;
    },

    clear(){ clearChat(); },

    /**
     * 搜索消息
     * @param {string} keyword
     * @returns {MessageObject[]}
     */
    search(keyword){
      if(!keyword) return [];
      const kw = keyword.toLowerCase();
      return State.messages.filter(m => m.content.toLowerCase().includes(kw));
    },

    /**
     * 获取消息的 token 总数
     */
    getTokenCount(){ return estimateMsgTokens(State.messages); }
  };

  /* ================================================================
     STATE — 只读代理
     ================================================================ */
  const stateProxy = new Proxy(State, {
    get(t, k)  { return t[k]; },
    set()      { console.warn('[QY] State 只读，请通过模块函数修改'); return false; }
  });

  /* ================================================================
     BUS — 事件总线
     ================================================================ */
  const busProxy = {
    on(e, fn)   { Bus.on(e, fn); },
    off(e, fn)  { Bus.off(e, fn); },
    once(e, fn) { Bus.once(e, fn); },
    emit(e, d)  { Bus.emit(e, d); }
  };

  /* ================================================================
     TTS — 语音
     ================================================================ */
  const tts = {
    speak(text, opts){
      if(!window.speechSynthesis) { showToast('浏览器不支持TTS','error'); return; }
      const cfg = { ...State.tts, ...(opts||{}) };
      const utt = new SpeechSynthesisUtterance(text);
      if(cfg.voice){
        const v = speechSynthesis.getVoices().find(v => v.name === cfg.voice);
        if(v) utt.voice = v;
      }
      utt.rate   = cfg.rate   ?? 1.0;
      utt.pitch  = cfg.pitch  ?? 1.0;
      utt.volume = cfg.volume ?? 1.0;
      utt.onend  = () => Bus.emit('tts:finished');
      speechSynthesis.speak(utt);
      Bus.emit('tts:speak', { text });
    },
    stop()       { speechSynthesis.cancel(); Bus.emit('tts:stop'); },
    isSpeaking() { return speechSynthesis.speaking; },
    getVoices()  { return speechSynthesis.getVoices(); }
  };

  /* ================================================================
     DRAW — 绘画
     ================================================================ */
  const draw = {
    async generate(prompt, opts = {}){
      const cfg = ls('qy_draw_config') || {};
      if(!cfg.baseUrl) throw new Error('请先配置绘画 API 地址');
      Bus.emit('draw:generate', { prompt });
      const body = {
        prompt, negative_prompt: opts.negative || cfg.negative || '',
        width:      opts.width   || cfg.width   || 512,
        height:     opts.height  || cfg.height  || 512,
        steps:      opts.steps   || cfg.steps   || 20,
        cfg_scale:  opts.cfg     || cfg.cfg     || 7,
        sampler_name: opts.sampler || cfg.sampler || 'Euler a',
        seed: opts.seed ?? -1, n_iter:1, batch_size:1
      };
      const res  = await fetch(`${cfg.baseUrl}/sdapi/v1/txt2img`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
      });
      if(!res.ok) throw new Error(`SD API HTTP ${res.status}`);
      const json = await res.json();
      const img  = 'data:image/png;base64,' + json.images?.[0];
      Bus.emit('draw:completed', { img }); return img;
    }
  };

  /* ================================================================
     API — AI 直连
     ================================================================ */
  const api = {
    async complete(messages, opts = {}){
      const cfg = State.runtimeParams || State.config;
      if(!cfg.baseUrl || !cfg.apiKey) throw new Error('API 未配置');
      const body = {
        model: opts.model || cfg.model,
        messages: typeof messages === 'string' ? [{ role:'user', content:messages }] : messages,
        max_tokens: opts.maxTokens || 1024,
        temperature: opts.temperature ?? cfg.temperature,
        stream: false
      };
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${cfg.apiKey}`},
        body:JSON.stringify(body)
      });
      if(!res.ok) throw new Error(`API HTTP ${res.status}`);
      const json = await res.json();
      return json.choices?.[0]?.message?.content || '';
    }
  };

  /* ================================================================
     UTILS — 工具
     ================================================================ */
  const utils = {
    applyMacros,
    estimateTokens,
    renderMarkdown: t => Markdown.render(t),
    escapeHtml:     Markdown.escapeHtml,
    generateId:     () => 'pid_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
    formatBytes,
    formatDuration,
    deepClone: obj => JSON.parse(JSON.stringify(obj)),
    confirm:   msg => window.confirm(msg),
    debounce(fn, delay = 300){
      let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
    },
    throttle(fn, wait = 200){
      let last = 0;
      return (...args) => { const now = Date.now(); if(now-last>wait){ last=now; fn(...args); } };
    }
  };

  return {
    get hooks(){ return hooks; },
    get ui(){ return ui; },
    get data(){ return data; },
    get chat(){ return chat; },
    get state(){ return stateProxy; },
    get bus(){ return busProxy; },
    get tts(){ return tts; },
    get draw(){ return draw; },
    get api(){ return api; },
    get utils(){ return utils; },
    version: '4.0.0',
    manifest: null
  };
})();

window.QY = QY;
