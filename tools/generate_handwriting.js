/**
 * tools/generate_handwriting.js — 将文本渲染为手写风格图片
 *
 * 暴露给 Agent 调用的工具。前端工作台（workbench.html）里的 Canvas 渲染引擎
 * 跑在浏览器里；本工具在服务端提供一个同样语义的入口：接收 text / font / paper
 * 参数，整理成与 workbench 一致的渲染规格，并尝试在服务端直接出图（依赖 node-canvas），
 * 若运行环境没有 canvas，则返回可在 workbench 打开的渲染链接 + 结构化规格。
 */

export const name = 'generate_handwriting';
export const description = '将文本渲染为手写风格图片';
export const parameters = {
  type: 'object',
  properties: {
    text: { type: 'string', description: '要渲染的文本内容，支持 {错→正} 涂改标记' },
    font: { type: 'string', description: '中文字体名，如 "Jason Handwriting 9" / "Ma Shan Zheng" / "851 Lakeus Night Writing"；留空则使用默认手写体' },
    paper: { type: 'string', description: '纸张样式：lined / grid / blank / letter / composition' },
  },
  required: ['text'],
};

// 与 workbench.html 的纸张样式枚举保持一致
const PAPER_STYLES = ['lined', 'grid', 'blank', 'letter', 'composition'];

// 与 workbench.html 默认预设保持一致
const DEFAULT_FONT = 'Jason Handwriting 9';
const DEFAULT_PAPER = 'lined';

function resolveOptions(input) {
  const text = (input.text || '').toString();
  const font = PAPER_STYLES.includes(input.font) ? DEFAULT_FONT : (input.font || DEFAULT_FONT);
  const paper = PAPER_STYLES.includes(input.paper) ? input.paper : DEFAULT_PAPER;
  return { text, font, paper };
}

/**
 * 尝试在服务端用 node-canvas 渲染手写稿。
 * 返回 { ok, dataUrl, width, height } 或 { ok:false, reason }。
 * 该路径与 workbench.html 的 drawPaper()+drawText() 同款逻辑对应，
 * 真正的字形渲染依赖系统已安装的对应字体。
 */
async function renderServerSide({ text, font, paper }) {
  let createCanvas;
  try {
    ({ createCanvas } = await import('canvas'));
  } catch {
    return { ok: false, reason: 'node-canvas 未安装，回退到 workbench 渲染链接' };
  }
  try {
    const W = 794, H = 1123;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // 纸张底色（与 workbench 默认米黄一致）
    ctx.fillStyle = '#f5f0e8';
    ctx.fillRect(0, 0, W, H);

    // 横线纸：画浅灰横线 + 左侧红线
    if (paper === 'lined' || paper === 'grid') {
      ctx.strokeStyle = 'rgba(100,100,120,0.3)';
      ctx.lineWidth = 0.5;
      const gap = 36, left = 60, right = W - 60;
      for (let y = 80; y < H - 40; y += gap) {
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
      }
      if (paper === 'lined') {
        ctx.strokeStyle = 'rgba(200,100,100,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, 50);
        ctx.lineTo(left, H - 40);
        ctx.stroke();
      }
    }

    // 文字（字体模式；笔画模式需浏览器 StrokeEngine，服务端不模拟）
    ctx.fillStyle = '#2a2a3a';
    ctx.textBaseline = 'middle';
    const fontSize = 24;
    const lineH = 36;
    const marginL = 80, marginR = 80;
    const maxWidth = W - marginL - marginR;
    const lines = text.split('\n');
    let y = 80 + lineH / 2;
    for (const raw of lines) {
      // 简易按字符宽度换行（与 workbench 行为接近）
      let line = '';
      for (const ch of raw) {
        const test = line + ch;
        ctx.font = `${fontSize}px "${font}", serif`;
        if (ctx.measureText(test).width > maxWidth && line) {
          ctx.fillText(line, marginL, y);
          line = ch;
          y += lineH;
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, marginL, y);
      y += lineH;
    }

    const dataUrl = canvas.toDataURL('image/png');
    return { ok: true, dataUrl, width: W, height: H };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

export async function execute(input, ctx) {
  const opts = resolveOptions(input || {});
  if (!opts.text.trim()) {
    return { ok: false, error: 'text 不能为空' };
  }

  // 构造 workbench 渲染链接（与前端同款渲染规格）
  const base = ctx?.pluginBaseUrl || '/api/plugins/hanako-handwriting/handwriting';
  const query = new URLSearchParams({
    text: opts.text,
    font: opts.font,
    paper: opts.paper,
    auto: '1',
  }).toString();
  const workbenchUrl = `${base}?${query}`;

  // 优先服务端出图，失败则回退到链接
  const rendered = await renderServerSide(opts);

  return {
    ok: true,
    text: opts.text,
    font: opts.font,
    paper: opts.paper,
    image: rendered.ok ? rendered.dataUrl : null,
    renderNote: rendered.ok
      ? `已在服务端渲染为 ${rendered.width}x${rendered.height} PNG`
      : rendered.reason,
    workbenchUrl,
  };
}
