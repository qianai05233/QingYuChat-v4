/**
 * QingYu Chat v4 — core/priority.js
 * 三级优先级合并系统
 *
 * 优先级（从低到高）：
 *   1. 全局 Global  — 用户手动设置的默认值（State.config）
 *   2. 预设 Preset  — 预设包内嵌的参数（getActivePreset().params）
 *   3. 角色 Char    — 角色卡内嵌的参数（State.currentChar.param_overrides）
 *
 * 冲突时高优先级覆盖低优先级。
 * 合并结果存入 State.runtimeParams，同时记录每个字段的来源。
 */

const Priority = (() => {

  /**
   * 字段来源记录表
   * { fieldName → 'global' | 'preset' | 'char' }
   */
  let _sources = {};

  /**
   * 重新计算合并后的运行时参数，并写入 State.runtimeParams
   * 调用时机：
   *   - 预设切换/修改
   *   - 角色激活/修改
   *   - 全局参数保存
   */
  function recalc(){
    _sources = {};

    // ── 第1层：全局参数 ──
    const merged = { ...State.config };
    Object.keys(merged).forEach(k => { _sources[k] = 'global'; });

    // ── 第2层：预设包覆盖 ──
    const preset = getActivePreset();
    if(preset?.params){
      const pp = preset.params;
      const paramFields = [
        'temperature','topP','maxTokens','contextSize',
        'freqPenalty','presPenalty','stopStrings'
      ];
      if(preset.enableParamOverride !== false){
        paramFields.forEach(k => {
          if(pp[k] !== undefined && pp[k] !== null){
            merged[k] = pp[k];
            _sources[k] = 'preset';
          }
        });
      }
      // 预设模型覆盖（可选）
      if(pp.model){ merged.model = pp.model; _sources.model = 'preset'; }
    }

    // ── 第3层：角色卡覆盖（最高优先级） ──
    const char = State.currentChar;
    if(char?.param_overrides){
      const cp = char.param_overrides;
      Object.keys(cp).forEach(k => {
        if(cp[k] !== undefined && cp[k] !== null){
          merged[k] = cp[k];
          _sources[k] = 'char';
        }
      });
    }

    State.runtimeParams = merged;

    // 广播：参数来源表已更新，UI 刷新覆盖标签
    Bus.emit('params:override:updated', _sources);
    Bus.emit('params:changed', merged);
  }

  /**
   * 获取某个字段的来源
   * @param {string} field
   * @returns {'global'|'preset'|'char'}
   */
  function sourceOf(field){
    return _sources[field] || 'global';
  }

  /**
   * 获取当前生效的作者注释（三级合并）
   * 优先级：角色 > 预设 > 全局
   */
  function getActiveAuthorNote(){
    const char   = State.currentChar;
    const preset = getActivePreset();

    if(char?.author_note?.content){
      return { ...char.author_note, _source:'char' };
    }
    if(preset?.authorNote?.content && preset?.authorNote?.enabled !== false){
      return { ...preset.authorNote, _source:'preset' };
    }
    return { ...State.authorNote, _source:'global' };
  }

  /**
   * 获取当前生效的人设（三级合并）
   */
  function getActivePersona(){
    const char   = State.currentChar;
    const preset = getActivePreset();

    if(char?.persona_override?.name){
      return { ...char.persona_override, _source:'char' };
    }
    if(preset?.persona?.name){
      return { ...preset.persona, _source:'preset' };
    }
    return { ...State.persona, _source:'global' };
  }

  /**
   * 获取当前生效的正则脚本列表（三级合并，带执行顺序）
   * 执行顺序：全局正则 → 预设正则 → 角色正则
   * （角色正则最后执行，优先级最高）
   */
  function getActiveRegexScripts(){
    const global = State.regexScripts.filter(s => s.enabled && s.scope === 'global');
    const preset = getActivePreset()?.regex?.filter(s => s.enabled !== false) || [];
    const char   = State.currentChar?.embedded_regex?.filter(s => s.enabled !== false) || [];
    return [...global, ...preset, ...char];
  }

  /**
   * 获取当前生效的世界书条目（三级合并）
   */
  function getActiveWorldbookEntries(){
    // 全局世界书（当前激活的书）
    const book  = getActiveWbBook();
    const global = book?.entries?.filter(e => e.enabled !== false) || [];

    // 预设内嵌世界书条目
    const preset = getActivePreset()?.worldbook?.filter(e => e.enabled !== false) || [];

    // 角色内嵌世界书（已在 activateCharacterBook 里加入 wbBooks）
    // 这里直接从 wbBooks 中找到角色专属书
    const charBookId = State.wbBooks.find(b => b._charId === State.currentChar?.id)?.id;
    const charBook   = charBookId ? State.wbBooks.find(b => b.id === charBookId) : null;
    const charEntries = charBook?.entries?.filter(e => e.enabled !== false) || [];

    return [...global, ...preset, ...charEntries];
  }

  /**
   * 生成设置页覆盖来源标签的 HTML
   * @param {string} field
   * @returns {string}
   */
  function renderSourceTag(field){
    const src = _sources[field];
    if(!src || src === 'global') return '';
    const label = src === 'preset' ? '预设覆盖' : '角色覆盖';
    const cls   = src === 'preset' ? 'badge-warn' : 'badge-cyan';
    return `<span class="badge ${cls} override-tag">${label}</span>`;
  }

  return {
    recalc,
    sourceOf,
    renderSourceTag,
    getActiveAuthorNote,
    getActivePersona,
    getActiveRegexScripts,
    getActiveWorldbookEntries
  };
})();
