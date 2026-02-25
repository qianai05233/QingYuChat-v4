/**
 * QingYu Chat v4 — features/markdown.js
 * Markdown 渲染器（零依赖，纯原生实现）
 *
 * 支持：
 *  标题（h1-h6）/ 粗体 / 斜体 / 删除线 / 行内代码 / 代码块（带语法高亮标识）
 *  无序列表 / 有序列表 / 引用块 / 水平线 / 链接 / 图片 / 表格
 *  代码块一键复制按钮
 */

const Markdown = (() => {

  /**
   * 将 Markdown 文本渲染为 HTML 字符串
   * @param {string} text
   * @returns {string}
   */
  function render(text){
    if(!text) return '';
    let html = escapeHtml(text);

    // ── 代码块（多行，最先处理防止内部内容被误解析）──
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const langLabel = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '';
      const copyBtn   = `<button class="code-copy-btn" onclick="copyCode(this)" title="复制">⎘</button>`;
      return `<div class="code-block-wrap">`
           + `<div class="code-block-header">${langLabel}${copyBtn}</div>`
           + `<pre class="code-block" data-lang="${lang}"><code>${code}</code></pre>`
           + `</div>`;
    });

    // ── 行内代码 ──
    html = html.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');

    // ── 标题 ──
    html = html.replace(/^######\s(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s(.+)$/gm,  '<h5>$1</h5>');
    html = html.replace(/^####\s(.+)$/gm,   '<h4>$1</h4>');
    html = html.replace(/^###\s(.+)$/gm,    '<h3>$1</h3>');
    html = html.replace(/^##\s(.+)$/gm,     '<h2>$1</h2>');
    html = html.replace(/^#\s(.+)$/gm,      '<h1>$1</h1>');

    // ── 水平线 ──
    html = html.replace(/^[-*_]{3,}$/gm, '<hr>');

    // ── 引用块 ──
    html = html.replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>');
    // 合并连续引用
    html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

    // ── 粗斜体 ──
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/___(.+?)___/g,        '<strong><em>$1</em></strong>');

    // ── 粗体 ──
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g,     '<strong>$1</strong>');

    // ── 斜体 ──
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g,   '<em>$1</em>');

    // ── 删除线 ──
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // ── 图片（先于链接处理）──
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
      '<img class="md-image" src="$2" alt="$1" loading="lazy" onerror="this.style.display=\'none\'">');

    // ── 链接 ──
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // ── 自动链接 ──
    html = html.replace(/(https?:\/\/[^\s<"]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

    // ── 无序列表 ──
    html = processLists(html);

    // ── 有序列表 ──
    html = processOrderedLists(html);

    // ── 表格 ──
    html = processTables(html);

    // ── 换行：双换行 → 段落，单换行 → <br> ──
    html = html
      .split(/\n{2,}/)
      .map(para => {
        para = para.trim();
        if(!para) return '';
        // 不对块级元素包裹 <p>
        if(/^<(h[1-6]|pre|div|table|blockquote|ul|ol|hr|img)/.test(para)) return para;
        return `<p>${para.replace(/\n/g, '<br>')}</p>`;
      })
      .join('\n');

    return html;
  }

  /* ── 无序列表处理 ── */
  function processLists(html){
    const lines = html.split('\n');
    const out   = [];
    let inList  = false;

    for(const line of lines){
      const match = line.match(/^(\s*)[-*+]\s(.+)$/);
      if(match){
        if(!inList){ out.push('<ul>'); inList = true; }
        out.push(`<li>${match[2]}</li>`);
      } else {
        if(inList){ out.push('</ul>'); inList = false; }
        out.push(line);
      }
    }
    if(inList) out.push('</ul>');
    return out.join('\n');
  }

  /* ── 有序列表处理 ── */
  function processOrderedLists(html){
    const lines = html.split('\n');
    const out   = [];
    let inList  = false;

    for(const line of lines){
      const match = line.match(/^\d+\.\s(.+)$/);
      if(match){
        if(!inList){ out.push('<ol>'); inList = true; }
        out.push(`<li>${match[1]}</li>`);
      } else {
        if(inList){ out.push('</ol>'); inList = false; }
        out.push(line);
      }
    }
    if(inList) out.push('</ol>');
    return out.join('\n');
  }

  /* ── 表格处理 ── */
  function processTables(html){
    // 匹配标准 Markdown 表格：至少两行，第一行是 header，第二行是分隔符
    return html.replace(
      /^(\|.+\|)\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/gm,
      (_, header, body) => {
        const ths = header.split('|').slice(1,-1).map(h =>
          `<th>${h.trim()}</th>`).join('');
        const rows = body.trim().split('\n').map(row => {
          const tds = row.split('|').slice(1,-1).map(d =>
            `<td>${d.trim()}</td>`).join('');
          return `<tr>${tds}</tr>`;
        }).join('');
        return `<div class="md-table-wrap"><table class="md-table"><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table></div>`;
      }
    );
  }

  /* ── HTML 转义（只在最开始对原始输入转义一次） ── */
  function escapeHtml(str){
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { render, escapeHtml };
})();

/* ── 代码块复制功能 ── */

/**
 * 复制代码块内容到剪贴板
 * @param {HTMLElement} btn  复制按钮元素
 */
function copyCode(btn){
  const pre  = btn.closest('.code-block-wrap').querySelector('code');
  const text = pre?.textContent || '';
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '✓';
    setTimeout(() => { btn.textContent = '⎘'; }, 1500);
  }).catch(() => {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity  = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = '✓';
    setTimeout(() => { btn.textContent = '⎘'; }, 1500);
  });
}

/**
 * 流式输出期间追加文本时，快速转义（不做完整 Markdown 解析，防止中间状态混乱）
 */
function escapeForDisplay(text){
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

/**
 * 流式输出完成后，对完整消息重新做 Markdown 渲染
 * @param {string} id   消息 id
 * @param {string} text 完整文本
 */
function finalizeMarkdown(id, text){
  const el = document.querySelector(`.msg-bubble[data-id="${id}"] .msg-content`);
  if(el){
    el.innerHTML = Markdown.render(text);
    // 触发插件 onRender 钩子
    (window._QY_HOOKS_?.onRender || []).forEach(fn => {
      try{ fn(el, text); } catch(e){ console.warn('[Plugin] onRender error:', e); }
    });
  }
}
