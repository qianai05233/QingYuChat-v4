/**
 * QingYu Chat v4 — core/eventbus.js
 * 万物互联事件总线（App 的神经系统）
 *
 * 用法：
 *   Bus.on('preset:changed', handler)
 *   Bus.emit('preset:changed', payload)
 *   Bus.off('preset:changed', handler)
 *   Bus.once('char:activated', handler)
 */

const Bus = (() => {
  const _listeners = {};  // { eventName: Set<handler> }

  /**
   * 订阅事件
   * @param {string}   event
   * @param {function} handler
   */
  function on(event, handler){
    if(!_listeners[event]) _listeners[event] = new Set();
    _listeners[event].add(handler);
  }

  /**
   * 取消订阅
   */
  function off(event, handler){
    _listeners[event]?.delete(handler);
  }

  /**
   * 订阅一次（触发后自动取消）
   */
  function once(event, handler){
    function wrapper(payload){
      handler(payload);
      off(event, wrapper);
    }
    on(event, wrapper);
  }

  /**
   * 广播事件
   * @param {string} event
   * @param {any}    payload
   */
  function emit(event, payload){
    _listeners[event]?.forEach(fn => {
      try { fn(payload); }
      catch(e){ console.error(`[Bus] ${event} handler error:`, e); }
    });
    // debug
    if(window.__QY_DEBUG__){
      console.log(`[Bus] ${event}`, payload);
    }
  }

  return { on, off, once, emit };
})();


/* ============================================================
   内置联动逻辑 — 当某事件发生时，自动触发相关更新
   ============================================================ */

// 预设切换 → 重算上下文 + 刷新设置页覆盖标签
Bus.on('preset:changed', () => {
  Priority.recalc();
  Bus.emit('context:recalc');
  if(typeof renderPresetOverrideTags === 'function') renderPresetOverrideTags();
});

// 角色激活 → 刷新聊天头像栏 + 背景 + 重算上下文
Bus.on('char:activated', (char) => {
  Priority.recalc();
  if(typeof renderChatCharBar === 'function') renderChatCharBar(char);
  if(typeof applyCharBackground === 'function') applyCharBackground(char);
  if(typeof renderChatMessages === 'function') renderChatMessages();
  Bus.emit('context:recalc');
});

// 人设变更 → 刷新聊天头像 + 重算
Bus.on('persona:changed', () => {
  if(typeof renderPersonaAvatar === 'function') renderPersonaAvatar();
  Bus.emit('context:recalc');
});

// 上下文重算 → 刷新 token 进度条
Bus.on('context:recalc', () => {
  if(typeof updateCtxBar === 'function') updateCtxBar();
});

// 消息事件 → 刷新消息计数器
Bus.on('message:sent',     () => { if(typeof updateMsgCounter === 'function') updateMsgCounter(); });
Bus.on('message:received', () => { if(typeof updateMsgCounter === 'function') updateMsgCounter(); updateCtxBar(); });
Bus.on('message:deleted',  () => { if(typeof updateMsgCounter === 'function') updateMsgCounter(); updateCtxBar(); });

// API 请求 → 写日志
Bus.on('api:request',  (d) => addLog({ type:'api', msg:'请求发出', ...d }));
Bus.on('api:response', (d) => addLog({ type:'api', msg:'响应收到', ...d }));
Bus.on('api:error',    (d) => addLog({ type:'error', msg: d.message || '未知错误', ...d }));

// 预设内嵌参数变化 → 重算优先级 + 更新设置页滑块标签
Bus.on('preset:params:changed', () => {
  Priority.recalc();
  if(typeof renderPresetOverrideTags === 'function') renderPresetOverrideTags();
});

// 角色内嵌参数变化 → 重算优先级
Bus.on('char:params:changed', () => {
  Priority.recalc();
});

// 网络状态
window.addEventListener('online',  () => Bus.emit('network:online'));
window.addEventListener('offline', () => Bus.emit('network:offline'));

Bus.on('network:offline', () => {
  if(typeof showToast === 'function') showToast('⚠️ 网络已断开，无法发送消息','warn', 4000);
});
Bus.on('network:online', () => {
  if(typeof showToast === 'function') showToast('✓ 网络已恢复','success');
});


/* ============================================================
   完整事件列表（文档注释，供插件开发者参考）
   ============================================================
   preset:changed           预设切换/修改
   preset:params:changed    预设内嵌参数变化
   preset:regex:changed     预设内嵌正则变化
   preset:worldbook:changed 预设内嵌世界书变化
   preset:persona:changed   预设内嵌人设变化
   preset:authornote:changed 预设内嵌作者注释变化

   char:activated           角色激活
   char:updated             角色信息修改
   char:deactivated         角色取消激活
   char:regex:changed       角色内嵌正则变化
   char:params:changed      角色内嵌参数变化
   char:persona:changed     角色内嵌人设变化

   worldbook:changed        世界书条目变化
   worldbook:scan           世界书扫描触发

   regex:changed            正则脚本变化
   regex:applied            正则脚本执行完成

   persona:changed          人设变化
   persona:switched         人设切换

   params:changed           API 参数变化（最终合并后的值）
   params:override:updated  覆盖来源变化

   authorNote:changed       作者注释变化

   context:recalc           触发上下文重算
   context:overflow         上下文超出限制

   message:sent             消息发送
   message:received         消息接收完成
   message:edited           消息编辑
   message:deleted          消息删除
   message:bookmarked       消息收藏
   message:branched         消息分支创建

   chat:cleared             对话清空
   chat:exported            对话导出

   plugin:installed         插件安装
   plugin:updated           插件更新
   plugin:toggled           插件启用/禁用
   plugin:removed           插件删除

   tts:speak                触发朗读
   tts:stop                 停止朗读
   tts:finished             朗读完成

   draw:generate            触发绘画
   draw:completed           绘画完成
   draw:failed              绘画失败

   api:request              API 请求发出
   api:response             API 响应收到
   api:error                API 错误

   ui:tab:changed           页面切换
   ui:modal:opened          弹窗打开
   ui:modal:closed          弹窗关闭
   ui:theme:changed         主题切换

   network:online           网络恢复
   network:offline          网络断开

   data:exported            数据导出
   data:imported            数据导入
   data:cleared             数据清除

   log:added                新日志添加
   ============================================================ */
