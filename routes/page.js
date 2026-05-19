/**
 * routes/page.js — 手写稿生成器工作台
 */
import fs from 'node:fs';
import path from 'node:path';

export default function (app, ctx) {
  const pluginDir = ctx.pluginDir;

  // ── 静态资源：assets/* ——
  app.get('/assets/:dir/:file', async (c) => {
    const filePath = path.join(pluginDir, 'assets', c.req.param('dir'), c.req.param('file'));
    try {
      const ext = path.extname(filePath).toLowerCase();
      const mime = {
        '.ttf': 'font/ttf',
        '.woff2': 'font/woff2',
        '.woff': 'font/woff',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
      }[ext] || 'application/octet-stream';
      const data = fs.readFileSync(filePath);
      return new Response(data, {
        headers: { 'Content-Type': mime, 'Cache-Control': 'max-age=86400' },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });

  // ── 获取助手列表 ──
  app.get('/api/agents', async (c) => {
    try {
      const agentsDir = path.resolve(pluginDir, '..', '..', 'agents');
      if (!fs.existsSync(agentsDir)) {
        return c.json({ agents: [] });
      }
      const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
      const agents = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const configPath = path.join(agentsDir, entry.name, 'config.yaml');
          let displayName = entry.name;
          if (fs.existsSync(configPath)) {
            const yaml = fs.readFileSync(configPath, 'utf-8');
            const nameMatch = yaml.match(/^displayName:\s*(.+)$/m);
            if (nameMatch) displayName = nameMatch[1].trim();
            else if (yaml.includes('name:')) {
              const m2 = yaml.match(/^name:\s*(.+)$/m);
              if (m2) displayName = m2[1].trim();
            }
          }
          agents.push({ id: entry.name, displayName });
        }
      }
      return c.json({ agents });
    } catch (e) {
      return c.json({ agents: [], error: e.message });
    }
  });

  // ── 工作台页面 ──
  app.get('/handwriting', async (c) => {
    const htmlPath = path.join(pluginDir, 'workbench.html');
    try {
      const html = fs.readFileSync(htmlPath, 'utf-8');
      return c.html(html);
    } catch {
      return c.html(`<!doctype html>
<html>
<body style="background:#1a1a2e;color:#3dc5ff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui">
  <div style="text-align:center">
    <h1>✎ 手写稿生成器</h1>
    <p style="color:#666;font-size:13px;margin-top:8px">工作台文件未找到</p>
  </div>
</body>
</html>`);
    }
  });
}
