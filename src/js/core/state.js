/**
 * QingYu Chat v4 — core/state.js
 * 全局状态中心
 * 所有模块通过 State 对象读取数据，通过 Bus 广播变更。
 * 直接修改 State 不会触发事件，必须通过对应模块函数操作。
 */

const State = {

  /* ── API 配置（全局最低优先级） ── */
  config: {
    baseUrl:     '',
    apiKey:      '',
    model:       '',
    temperature: 0.8,
    topP:        1.0,
    maxTokens:   2048,
    contextSize: 4096,
    freqPenalty: 0,
    presPenalty: 0,
    stopStrings: []
  },

  /* ── 三级合并后的运行时参数（只读，由 Priority.merge() 更新） ── */
  runtimeParams: null,

  /* ── 人设 ── */
  persona: {
    name:   '用户',
    desc:   '',
    avatar: ''      // base64 dataUrl
  },

  /* ── 角色 ── */
  characters:   [],   // CharacterBundle[]
  currentChar:  null, // 当前激活的角色

  /* ── 消息 ── */
  messages: [],
  /*
    每条消息格式：
    {
      id:         string,
      role:       'user' | 'assistant',
      content:    string,
      swipes:     string[],   // 多次回复（swipe）
      swipeIndex: number,
      timestamp:  number,
      bookmarked: boolean,
      branchId:   string | null
    }
  */

  /* ── 流式输出 ── */
  isStreaming: false,
  abortCtrl:  null,

  /* ── 世界书 ── */
  wbBooks:        [],   // WorldBook[]  { id, name, entries[], _charId? }
  activeWbBookId: null,
  wbScanDepth:    5,

  /* ── 预设包 ── */
  presetGroups:        [],  // PresetBundle[]
  activePresetGroupId: null,

  /* ── 作者注释 ── */
  authorNote: {
    content: '',
    depth:   4,
    enabled: true
  },

  /* ── 正则脚本 ── */
  regexScripts: [],
  /*
    { id, name, scope:'global'|'preset'|'char',
      pattern, replace, flags:{g,i}, enabled }
  */

  /* ── 插件 ── */
  plugins: [],
  /*
    { id, name, version, description, source, enabled, code }
  */

  /* ── TTS ── */
  tts: {
    enabled:    false,
    autoSpeak:  false,
    voice:      '',
    rate:       1.0,
    pitch:      1.0,
    volume:     1.0,
    isSpeaking: false,
    queue:      []
  },

  /* ── 统计 ── */
  stats: {
    totalChats:    0,
    totalMessages: 0,
    totalTokens:   0,
    byChar:        {},  // charId → { messages, tokens, lastTime }
    byPreset:      {},  // presetId → count
    byDate:        {}   // 'YYYY-MM-DD' → count
  },

  /* ── API 请求日志 ── */
  logs: [],  // 最多 100 条
  /*
    { time, model, tokens, status, duration, type:'api'|'error'|'event', msg }
  */

  /* ── UI 编辑状态（临时） ── */
  editingCharId:    null,
  editingWbId:      null,
  editingRegexId:   null,
  wbKeywords:       [],
  dragSrcIndex:     null,
  currentCharTab:   0,

  /* ── 版本 ── */
  version: '4.0.0'
};

/**
 * 便捷访问：当前预设包
 */
function getActivePreset(){
  return State.presetGroups.find(g => g.id === State.activePresetGroupId) || null;
}

/**
 * 便捷访问：当前世界书
 */
function getActiveWbBook(){
  return State.wbBooks.find(b => b.id === State.activeWbBookId) || null;
}

/**
 * 激活角色（会触发 EventBus 事件）
 * @param {object} char
 * @param {boolean} loadMessages
 */
function activateCharacter(char, loadMessages = true){
  State.currentChar = char;
  ls('qy_active_char', char?.id || null);

  // 加载角色消息历史
  if(loadMessages && char){
    const saved = ls('qy_msgs_' + char.id);
    State.messages = saved?.length ? saved : [];
    if(!State.messages.length && char.first_mes){
      State.messages = [{
        id:         'msg_' + Date.now(),
        role:       'assistant',
        content:    applyMacros(char.first_mes),
        swipes:     [applyMacros(char.first_mes)],
        swipeIndex: 0,
        timestamp:  Date.now(),
        bookmarked: false,
        branchId:   null
      }];
      ls('qy_msgs_' + char.id, State.messages);
    }
  }

  // 激活角色内嵌世界书
  if(char?.character_book?.entries?.length){
    activateCharacterBook(char.id, char.character_book);
  }

  // 触发事件，所有关联模块自动响应
  Bus.emit('char:activated', char);
  Bus.emit('context:recalc');
}

/**
 * 添加日志（自动限制 100 条）
 */
function addLog(entry){
  State.logs.unshift({ time: Date.now(), ...entry });
  if(State.logs.length > 100) State.logs.length = 100;
  Bus.emit('log:added', entry);
}
