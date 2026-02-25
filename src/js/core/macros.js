/**
 * QingYu Chat v4 — core/macros.js
 * 宏变量系统（增强版）
 *
 * 支持的宏：
 *   {{char}}            当前角色名
 *   {{user}}            当前用户名
 *   {{persona}}         当前用户描述
 *   {{date}}            当前日期
 *   {{time}}            当前时间（HH:MM）
 *   {{weekday}}         星期几
 *   {{original}}        原始内容（正则替换用）
 *   {{random}}          随机数 1-100
 *   {{roll:XdY}}        掷骰子，如 {{roll:2d6}}
 *   {{idle_duration}}   距上次消息的时间
 *   {{msg_count}}       当前消息总数
 *   {{char_msg_count}}  角色消息数
 *   {{user_msg_count}}  用户消息数
 *   {{last_char}}       角色最后一条消息
 *   {{last_user}}       用户最后一条消息
 *   {{scenario}}        当前场景描述
 *   {{personality}}     当前角色性格
 *   {{model}}           当前使用的模型名
 *   {{tokens_used}}     已使用 token 数（估算）
 *   {{tokens_max}}      最大 token 数
 */

/**
 * 处理所有宏变量替换
 * @param {string} text            输入文本
 * @param {string} [originalContent] 用于 {{original}}
 * @returns {string}
 */
function applyMacros(text, originalContent = ''){
  if(!text) return text;

  const char    = State.currentChar;
  const persona = State.persona;
  const cfg     = State.runtimeParams || State.config;
  const msgs    = State.messages;
  const now     = new Date();

  // 日期时间
  const dateStr    = now.toLocaleDateString('zh-CN');
  const timeStr    = now.toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' });
  const weekdays   = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  const weekdayStr = weekdays[now.getDay()];

  // 消息统计
  const charMsgs = msgs.filter(m => m.role === 'assistant');
  const userMsgs = msgs.filter(m => m.role === 'user');
  const lastChar = charMsgs[charMsgs.length - 1]?.content || '';
  const lastUser = userMsgs[userMsgs.length - 1]?.content || '';

  // 空闲时间
  const lastMsgTime = msgs[msgs.length - 1]?.timestamp;
  const idleDuration = lastMsgTime
    ? formatDuration(Date.now() - lastMsgTime)
    : '未知';

  // Token 信息
  const tokensUsed = estimateMsgTokens(msgs);
  const tokensMax  = cfg.contextSize || 4096;

  return text
    // 基础
    .replace(/\{\{char\}\}/gi,         char?.name          || '角色')
    .replace(/\{\{user\}\}/gi,         persona.name        || '用户')
    .replace(/\{\{persona\}\}/gi,      persona.desc        || persona.name || '用户')
    // 时间
    .replace(/\{\{date\}\}/gi,         dateStr)
    .replace(/\{\{time\}\}/gi,         timeStr)
    .replace(/\{\{weekday\}\}/gi,      weekdayStr)
    // 原始内容
    .replace(/\{\{original\}\}/gi,     originalContent)
    // 随机数
    .replace(/\{\{random\}\}/gi,       () => String(Math.floor(Math.random() * 100) + 1))
    // 掷骰子 {{roll:XdY}}
    .replace(/\{\{roll:(\d+)d(\d+)\}\}/gi, (_, x, y) => rollDice(parseInt(x), parseInt(y)))
    // 消息统计
    .replace(/\{\{msg_count\}\}/gi,       String(msgs.length))
    .replace(/\{\{char_msg_count\}\}/gi,  String(charMsgs.length))
    .replace(/\{\{user_msg_count\}\}/gi,  String(userMsgs.length))
    // 最后一条消息
    .replace(/\{\{last_char\}\}/gi,    lastChar.slice(0, 200))
    .replace(/\{\{last_user\}\}/gi,    lastUser.slice(0, 200))
    // 角色属性
    .replace(/\{\{scenario\}\}/gi,     char?.scenario    || '')
    .replace(/\{\{personality\}\}/gi,  char?.personality || '')
    // 模型 & Token
    .replace(/\{\{model\}\}/gi,        cfg.model         || '未知')
    .replace(/\{\{tokens_used\}\}/gi,  String(tokensUsed))
    .replace(/\{\{tokens_max\}\}/gi,   String(tokensMax))
    // 空闲时间
    .replace(/\{\{idle_duration\}\}/gi, idleDuration);
}

/**
 * 掷骰子：XdY → 返回 X 个 Y 面骰子的总和
 */
function rollDice(count, sides){
  if(count < 1 || sides < 1) return '0';
  let total = 0;
  for(let i = 0; i < Math.min(count, 20); i++){
    total += Math.floor(Math.random() * sides) + 1;
  }
  return String(total);
}

/**
 * 格式化毫秒为可读字符串
 */
function formatDuration(ms){
  const s = Math.floor(ms / 1000);
  if(s < 60)   return `${s} 秒`;
  const m = Math.floor(s / 60);
  if(m < 60)   return `${m} 分钟`;
  const h = Math.floor(m / 60);
  if(h < 24)   return `${h} 小时`;
  return `${Math.floor(h / 24)} 天`;
}

/**
 * 检测文本中包含哪些宏（用于编辑器提示）
 * @param {string} text
 * @returns {string[]}
 */
function detectMacros(text){
  const matches = text.match(/\{\{[^}]+\}\}/g) || [];
  return [...new Set(matches)];
}

/** 所有可用宏列表（供编辑器自动补全） */
const MACRO_LIST = [
  { macro:'{{char}}',            desc:'当前角色名' },
  { macro:'{{user}}',            desc:'当前用户名' },
  { macro:'{{persona}}',         desc:'用户描述' },
  { macro:'{{date}}',            desc:'当前日期' },
  { macro:'{{time}}',            desc:'当前时间' },
  { macro:'{{weekday}}',         desc:'星期几' },
  { macro:'{{original}}',        desc:'原始内容（正则用）' },
  { macro:'{{random}}',          desc:'随机数 1-100' },
  { macro:'{{roll:2d6}}',        desc:'掷骰子示例' },
  { macro:'{{idle_duration}}',   desc:'距上次消息时间' },
  { macro:'{{msg_count}}',       desc:'消息总数' },
  { macro:'{{char_msg_count}}',  desc:'角色消息数' },
  { macro:'{{user_msg_count}}',  desc:'用户消息数' },
  { macro:'{{last_char}}',       desc:'角色最后一条消息' },
  { macro:'{{last_user}}',       desc:'用户最后一条消息' },
  { macro:'{{scenario}}',        desc:'当前场景描述' },
  { macro:'{{personality}}',     desc:'角色性格' },
  { macro:'{{model}}',           desc:'当前模型名' },
  { macro:'{{tokens_used}}',     desc:'已用 token 数' },
  { macro:'{{tokens_max}}',      desc:'最大 token 数' },
];
