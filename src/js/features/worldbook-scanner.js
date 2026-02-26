/**
 * QingYu Chat v4 — features/worldbook-scanner.js
 * 世界书扫描引擎
 *
 * 职责：
 *  根据最近 N 条消息（扫描深度）中的关键词
 *  触发世界书条目注入，按优先级排序后返回。
 */

const WBScanner = (() => {

  /**
   * 扫描文本，返回应注入的条目列表（已去重，已排序）
   *
   * @param {WBEntry[]} entries     所有可用条目
   * @param {string}    scanText    用于扫描的文本（合并最近 N 条消息）
   * @returns {WBEntry[]}           触发的条目，按 priority 升序（数字越小越先注入）
   */
  function scan(entries, scanText){
    if(!entries?.length) return [];

    const text    = scanText.toLowerCase();
    const matched = new Map(); // id → entry（去重）

    entries.forEach(entry => {
      if(entry.enabled === false) return;

      // 始终注入
      if(entry.always){
        matched.set(entry.id, entry);
        return;
      }

      // 关键词匹配
      const keywords = entry.keywords || [];
      const hit = keywords.some(kw => {
        if(!kw) return false;
        const k = kw.toLowerCase().trim();
        if(!k) return false;
        // 支持正则关键词（以 / 包裹）
        if(k.startsWith('/') && k.lastIndexOf('/') > 0){
          try{
            const lastSlash = k.lastIndexOf('/');
            const pattern   = k.slice(1, lastSlash);
            const flags     = k.slice(lastSlash + 1) || 'i';
            return new RegExp(pattern, flags).test(scanText);
          } catch{ return false; }
        }
        return text.includes(k);
      });

      if(hit) matched.set(entry.id, entry);
    });

    // 按 priority 升序排列（数字越小越先注入）
    return [...matched.values()].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  /**
   * 构建用于扫描的文本（最近 N 条消息 + 当前用户输入）
   * @param {string} userMessage
   * @param {number} depth
   * @returns {string}
   */
  function buildScanText(userMessage, depth){
    const recent = State.messages.slice(-Math.max(1, depth)).map(m => m.content);
    return [userMessage, ...recent].join('\n');
  }

  return { scan, buildScanText };
})();
