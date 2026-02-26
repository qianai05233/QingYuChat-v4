/**
 * QingYu Chat v4 — features/regex-engine.js
 * 正则脚本执行引擎
 *
 * 执行顺序（由低优先级到高优先级逐层覆盖）：
 *   全局脚本 → 预设内嵌脚本 → 角色内嵌脚本
 *
 * 作用对象：
 *   applyToInput  对 AI 回复内容执行正则（收到后处理）
 *   applyToOutput 对用户发送内容执行正则（发送前处理）
 */

const RegexEngine = (() => {

  /**
   * 对文本应用所有启用的正则脚本
   * @param {string}   text
   * @param {'input'|'output'|'both'} [scope='both']
   * @returns {string}
   */
  function apply(text, scope = 'both'){
    if(!text) return text;

    const scripts = Priority.getActiveRegexScripts();
    let result = text;

    scripts.forEach(script => {
      // 检查应用方向（默认双向）
      const dir = script.direction || 'both';
      if(scope === 'input'  && dir === 'output') return;
      if(scope === 'output' && dir === 'input')  return;

      try{
        const flags = [
          script.flags?.g !== false ? 'g' : '',
          script.flags?.i ? 'i' : '',
          script.flags?.m ? 'm' : '',
          script.flags?.s ? 's' : ''
        ].filter(Boolean).join('');

        const re      = new RegExp(script.pattern, flags);
        const replace = (script.replace || '').replace(/\$\$original\$\$/g, text); // 支持 $$original$$ 引用原文
        result = result.replace(re, replace);
      } catch(e){
        console.warn(`[RegexEngine] 脚本"${script.name}"执行出错:`, e.message);
      }
    });

    if(result !== text) Bus.emit('regex:applied', { original: text, result, scope });
    return result;
  }

  /**
   * 对 AI 回复内容执行正则（收到后）
   */
  function applyToInput(text) { return apply(text, 'input'); }

  /**
   * 对用户输入内容执行正则（发送前）
   */
  function applyToOutput(text) { return apply(text, 'output'); }

  /**
   * 对任意文本实时预览正则效果（用于编辑弹窗预览）
   * @param {string} pattern
   * @param {string} replace
   * @param {{ g, i, m }} flags
   * @param {string} testText
   * @returns {{ result: string, error: string|null }}
   */
  function preview(pattern, replace, flags, testText){
    if(!pattern || !testText) return { result: testText, error: null };
    try{
      const f = [flags.g?'g':'', flags.i?'i':'', flags.m?'m':''].filter(Boolean).join('');
      const re = new RegExp(pattern, f);
      const result = testText.replace(re, replace || '');
      return { result, error: null };
    } catch(e){
      return { result: testText, error: e.message };
    }
  }

  return { apply, applyToInput, applyToOutput, preview };
})();
