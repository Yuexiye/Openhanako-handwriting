/**
 * stroke-engine.js — 汉字笔画渲染引擎
 * 基于 Hanzi Writer 数据，将汉字拆分为笔画，逐笔渲染到 Canvas
 * 支持：路径扰动、笔压模拟、飞白效果、连笔线
 */

(function() {
  'use strict';

  // ── 配置 ──
  const STROKE_ENGINE = {
    // 笔画数据加载
    _cache: {},
    _loading: {},
    _baseUrl: '/assets/strokes/',  // 扁平化笔画数据目录

    /**
     * 加载单个汉字的笔画数据
     * @param {string} char - 单个汉字
     * @returns {Promise<{strokes: string[], medians: number[][][]}>}
     */
    async loadChar(char) {
      if (this._cache[char]) return this._cache[char];
      if (this._loading[char]) return this._loading[char];

      this._loading[char] = fetch(this._baseUrl + encodeURIComponent(char) + '.json')
        .then(r => {
          if (!r.ok) throw new Error(`Char ${char} not found`);
          return r.json();
        })
        .then(data => {
          this._cache[char] = data;
          delete this._loading[char];
          return data;
        })
        .catch(err => {
          delete this._loading[char];
          throw err;
        });

      return this._loading[char];
    },

    /**
     * 预加载一批汉字
     * @param {string[]} chars
     */
    async preload(chars) {
      await Promise.allSettled(chars.map(c => this.loadChar(c).catch(() => {})));
    },

    // ── 扰动参数 ──
    perturbations: {
      jitter: 0.5,        // 路径点抖动幅度 (px)
      pressureStart: 1.2, // 起笔粗细倍率
      pressureEnd: 0.6,   // 收笔粗细倍率
      fadeStart: 0.0,     // 飞白起始位置 (0-1)
      fadeEnd: 0.8,       // 飞白结束位置 (0-1)
      fadeOpacity: 0.35,  // 飞白最低透明度
      connectStrokes: true, // 是否连笔
      connectThreshold: 30, // 连笔阈值 (px)
    },

    /**
     * 解析 SVG 路径字符串为点数组
     * @param {string} pathStr - SVG path 字符串，如 "M 100 200 Q 150 250 200 300..."
     * @returns {{type: string, points: {x: number, y: number}[]}[]} 路径段数组
     */
    parsePath(pathStr) {
      const segments = [];
      const tokens = pathStr.trim().split(/\s+/);
      let i = 0;

      while (i < tokens.length) {
        const cmd = tokens[i];
        if (cmd === 'M') {
          segments.push({
            type: 'M',
            points: [{ x: +tokens[i+1], y: +tokens[i+2] }]
          });
          i += 3;
        } else if (cmd === 'L') {
          segments.push({
            type: 'L',
            points: [{ x: +tokens[i+1], y: +tokens[i+2] }]
          });
          i += 3;
        } else if (cmd === 'Q') {
          segments.push({
            type: 'Q',
            points: [
              { x: +tokens[i+1], y: +tokens[i+2] }, // 控制点
              { x: +tokens[i+3], y: +tokens[i+4] }  // 终点
            ]
          });
          i += 5;
        } else if (cmd === 'C') {
          segments.push({
            type: 'C',
            points: [
              { x: +tokens[i+1], y: +tokens[i+2] },
              { x: +tokens[i+3], y: +tokens[i+4] },
              { x: +tokens[i+5], y: +tokens[i+6] }
            ]
          });
          i += 7;
        } else if (cmd === 'Z' || cmd === 'z') {
          segments.push({ type: 'Z', points: [] });
          i += 1;
        } else {
          i += 1; // 跳过未知命令
        }
      }

      return segments;
    },

    /**
     * 对路径点应用节奏性抖动
     * 不是均匀抖，而是模拟手写的节奏：
     * - 长笔画中间稳、两端抖
     * - 短笔画整体微抖
     * - 拐弯处（控制点）顿一下
     * @param {{type: string, points: {x: number, y: number}[]}[]} segments
     * @param {number} jitter - 抖动幅度
     * @param {number} seed - 随机种子
     * @param {number} strokeIndex - 笔画序号（用于字内节奏）
     * @returns {typeof segments}
     */
    applyRhythmicJitter(segments, jitter, seed = 0, strokeIndex = 0) {
      if (jitter <= 0) return segments;
      let counter = seed;
      const seededRandom = () => {
        counter = (counter * 1103515245 + 12345) & 0x7fffffff;
        return (counter / 0x7fffffff) * 2 - 1; // -1 to 1
      };

      // 总点数用于计算全局进度
      let totalPoints = 0;
      for (const seg of segments) totalPoints += seg.points.length;

      // 拐弯处（Q/C 命令的控制点）额外抖动
      let globalIdx = 0; // 跟踪全局进度
      const turnJitter = jitter * 1.8;

      return segments.map(seg => {
        const isCurve = seg.type === 'Q' || seg.type === 'C';
        return {
          type: seg.type,
          points: seg.points.map((p, segIdx) => {
            const localIdx = globalIdx++; // 用全局索引计算进度
            // 位置权重：起笔和收笔抖多一点，中间稳
            const progress = totalPoints > 1 ? localIdx / (totalPoints - 1) : 0.5;
            const positionWeight = Math.sin(progress * Math.PI); // 0→1→0
            // 笔画序号权重：字内靠后的笔画更容易抖（手累了）
            const strokeWeight = 1 + strokeIndex * 0.15;
            // 拐弯处额外抖
            const isControlPoint = isCurve && segIdx === 0; // Q 的第一个点是控制点
            const localJitter = jitter * positionWeight * strokeWeight * (isControlPoint ? 1.5 : 1);

            return {
              x: p.x + seededRandom() * localJitter,
              y: p.y + seededRandom() * localJitter
            };
          })
        };
      });
    },

    /**
     * 对采样点应用微颤（更细粒度的抖动）
     * 模拟笔尖在纸面上的微小颤动
     */
    applyMicroTremor(points, amount, seed = 0) {
      if (amount <= 0 || points.length < 2) return points;
      let counter = seed;
      const seededRandom = () => {
        counter = (counter * 1103515245 + 12345) & 0x7fffffff;
        return (counter / 0x7fffffff) * 2 - 1;
      };

      return points.map((p, i) => {
        // 每隔几个点才抖，模拟颤动频率
        const tremorPhase = Math.sin(i * 0.3 + seed) * amount;
        return {
          x: p.x + seededRandom() * tremorPhase * 0.3,
          y: p.y + seededRandom() * tremorPhase * 0.3
        };
      });
    },

    /**
     * 将路径段采样为等距点序列
     * @param {{type: string, points: {x: number, y: number}[]}[]} segments
     * @param {number} sampleDist - 采样间距 (px)
     * @returns {{x: number, y: number}[]}
     */
    samplePoints(segments, sampleDist = 2) {
      const points = [];
      for (const seg of segments) {
        if (seg.type === 'M') {
          points.push(seg.points[0]);
        } else if (seg.type === 'L') {
          const from = points[points.length - 1] || seg.points[0];
          const to = seg.points[0];
          const dx = to.x - from.x, dy = to.y - from.y;
          const len = Math.sqrt(dx*dx + dy*dy);
          const steps = Math.max(1, Math.floor(len / sampleDist));
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            points.push({ x: from.x + dx * t, y: from.y + dy * t });
          }
        } else if (seg.type === 'Q') {
          const from = points[points.length - 1] || { x: 0, y: 0 };
          const cp = seg.points[0];
          const to = seg.points[1];
          // 二次贝塞尔曲线采样
          const steps = Math.max(2, Math.floor(
            (Math.sqrt((to.x-from.x)**2 + (to.y-from.y)**2) +
             Math.sqrt((cp.x-from.x)**2 + (cp.y-from.y)**2) +
             Math.sqrt((to.x-cp.x)**2 + (to.y-cp.y)**2)) / sampleDist
          ));
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const mt = 1 - t;
            points.push({
              x: mt*mt*from.x + 2*mt*t*cp.x + t*t*to.x,
              y: mt*mt*from.y + 2*mt*t*cp.y + t*t*to.y
            });
          }
        } else if (seg.type === 'C') {
          const from = points[points.length - 1] || { x: 0, y: 0 };
          const cp1 = seg.points[0];
          const cp2 = seg.points[1];
          const to = seg.points[2];
          const steps = Math.max(3, Math.floor(
            (Math.sqrt((to.x-from.x)**2 + (to.y-from.y)**2) +
             Math.sqrt((cp1.x-from.x)**2 + (cp1.y-from.y)**2) +
             Math.sqrt((cp2.x-cp1.x)**2 + (cp2.y-cp1.y)**2) +
             Math.sqrt((to.x-cp2.x)**2 + (to.y-cp2.y)**2)) / sampleDist
          ));
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const mt = 1 - t;
            points.push({
              x: mt*mt*mt*from.x + 3*mt*mt*t*cp1.x + 3*mt*t*t*cp2.x + t*t*t*to.x,
              y: mt*mt*mt*from.y + 3*mt*mt*t*cp1.y + 3*mt*t*t*cp2.y + t*t*t*to.y
            });
          }
        }
      }
      return points;
    },

    /**
     * 渲染单条笔画到 Canvas
     * 使用"重轻重"三档笔压模拟真实手写节奏
     */
    renderStroke(ctx, pathStr, options) {
      const {
        baseWidth = 3,
        color = '#333',
        jitter = 0.5,
        seed = 0,
        pressureStart = 1.2,
        pressureEnd = 0.6,
        fadeStart = 0.0,
        fadeEnd = 0.8,
        fadeOpacity = 0.35,
        strokeIndex = 0, // 笔画在字中的序号
        // 三档笔压参数
        pressureMiddle = 0.85, // 中间档（默认起收之间）
        pressurePhase = 0.3,   // 重-轻-重 相位（0-1 处从轻转重）
      } = options;

      // 解析并扰动路径
      const segments = this.parsePath(pathStr);
      const perturbed = this.applyRhythmicJitter(segments, jitter, seed, strokeIndex);
      let points = this.samplePoints(perturbed, 1.2);

      // 应用微颤
      points = this.applyMicroTremor(points, jitter * 0.4, seed + 1);

      if (points.length < 2) return;

      // ── 三档笔压：重(起笔) → 轻(中间) → 重(收笔) ──
      // 构建一条连续路径，分段设置线宽
      const n = points.length;
      const third = Math.floor(n / 3);

      // 第一段（重）：起笔用力
      if (third > 1) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < third; i++) {
          const p0 = points[i - 1];
          const p1 = points[i];
          const p2 = points[Math.min(i + 1, n - 1)];
          const cpX = (p1.x + p2.x) / 2;
          const cpY = (p1.y + p2.y) / 2;
          ctx.quadraticCurveTo(p1.x, p1.y, cpX, cpY);
        }
        ctx.lineWidth = baseWidth * pressureStart;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = this._applyAlpha(color, 0.9);
        ctx.stroke();
      }

      // 第二段（轻）：中间提笔 — 从第一段的终点开始，保证连续
      if (n > third * 2) {
        ctx.beginPath();
        ctx.moveTo(points[third].x, points[third].y); // 用精确点，不用中点
        for (let i = third + 1; i < third * 2; i++) {
          const p0 = points[i - 1];
          const p1 = points[i];
          const p2 = points[Math.min(i + 1, n - 1)];
          const cpX = (p1.x + p2.x) / 2;
          const cpY = (p1.y + p2.y) / 2;
          ctx.quadraticCurveTo(p1.x, p1.y, cpX, cpY);
        }
        ctx.lineWidth = baseWidth * pressureMiddle;
        ctx.strokeStyle = this._applyAlpha(color, 0.6);
        ctx.stroke();
      }

      // 第三段（重）：收笔再用力 — 从第二段终点开始
      if (third * 2 < n) {
        ctx.beginPath();
        ctx.moveTo(points[third * 2].x, points[third * 2].y); // 用精确点
        for (let i = third * 2 + 1; i < n; i++) {
          const p0 = points[i - 1];
          const p1 = points[i];
          const p2 = points[Math.min(i + 1, n - 1)];
          const cpX = (p1.x + p2.x) / 2;
          const cpY = (p1.y + p2.y) / 2;
          ctx.quadraticCurveTo(p1.x, p1.y, cpX, cpY);
        }
        ctx.lineWidth = baseWidth * pressureEnd;
        ctx.strokeStyle = this._applyAlpha(color, 0.8);
        ctx.stroke();
      }

      // ── 飞白效果：在笔画末端叠加半透明细线 ──
      const fadeZone = Math.floor(n * fadeEnd);
      if (fadeZone > 0 && fadeOpacity < 0.9) {
        const fadeStartIdx = Math.floor(n * fadeStart);
        ctx.beginPath();
        let started = false;
        for (let i = fadeStartIdx; i < fadeZone; i++) {
          if (!started) {
            ctx.moveTo(points[i].x, points[i].y);
            started = true;
          } else {
            const p1 = points[i];
            const p2 = points[Math.min(i + 1, n - 1)];
            ctx.lineTo(p1.x, p1.y);
          }
        }
        const fadeAlpha = fadeOpacity * (1 - (fadeZone - fadeStartIdx) / n);
        ctx.lineWidth = baseWidth * 0.5;
        ctx.strokeStyle = this._applyAlpha(color, fadeAlpha);
        ctx.stroke();
      }
    },

    /**
     * 估算路径总长度
     */
    _estimatePathLength(segments) {
      let len = 0;
      let lastPoint = null;
      for (const seg of segments) {
        for (const p of seg.points) {
          if (lastPoint) {
            len += Math.sqrt((p.x-lastPoint.x)**2 + (p.y-lastPoint.y)**2);
          }
          lastPoint = p;
        }
      }
      return len;
    },

    /**
     * 解析颜色的 alpha 值
     */
    _parseColorAlpha(color) {
      if (color.startsWith('rgba')) {
        const m = color.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*([\d.]+))?\s*\)/);
        return m ? parseFloat(m[1] || 1) : 1;
      }
      return 1;
    },

    /**
     * 应用 alpha 到颜色
     */
    _applyAlpha(color, alpha) {
      if (color.startsWith('rgba')) {
        const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+)?\s*\)/);
        if (m) return `rgba(${m[1]},${m[2]},${m[3]},${alpha})`;
      } else if (color.startsWith('#')) {
        const hex = color.slice(1);
        let r, g, b;
        if (hex.length === 3) {
          r = parseInt(hex[0]+hex[0], 16);
          g = parseInt(hex[1]+hex[1], 16);
          b = parseInt(hex[2]+hex[2], 16);
        } else {
          r = parseInt(hex.slice(0,2), 16);
          g = parseInt(hex.slice(2,4), 16);
          b = parseInt(hex.slice(4,6), 16);
        }
        return `rgba(${r},${g},${b},${alpha})`;
      }
      return color;
    },

    /**
     * 获取连笔线路径
     * @param {{x: number, y: number}} from - 上一笔终点
     * @param {{x: number, y: number}} to - 下一笔起点
     * @param {number} threshold - 距离阈值
     * @returns {string|null} SVG 路径或 null
     */
    getConnectPath(from, to, threshold = 30) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist > threshold) return null;
      // 用一条平滑曲线连接
      const cpX = (from.x + to.x) / 2 + (Math.random() - 0.5) * dist * 0.3;
      const cpY = (from.y + to.y) / 2 + (Math.random() - 0.5) * dist * 0.3;
      return `M ${from.x} ${from.y} Q ${cpX} ${cpY} ${to.x} ${to.y}`;
    },

    /**
     * 直接用 Canvas API 画连笔线（canvas 坐标系，不需要坐标变换）
     */
    drawConnectLine(ctx, from, to, options = {}) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 1 || dist > (options.maxDist || 60)) return;

      const cpX = (from.x + to.x) / 2 + (Math.random() - 0.5) * dist * 0.3;
      const cpY = (from.y + to.y) / 2 + (Math.random() - 0.5) * dist * 0.3;

      const bw = (options.baseWidth || 2) * 0.35;
      if (bw < 0.3) return;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(cpX, cpY, to.x, to.y);
      ctx.lineWidth = bw;
      ctx.lineCap = 'round';
      ctx.strokeStyle = this._applyAlpha(options.color || '#333', 0.2);
      ctx.stroke();
      ctx.restore();
    },

    /**
     * 获取缩放变换参数
     * @param {number} targetWidth - 目标宽度
     * @param {number} targetHeight - 目标高度
     * @param {number} padding - 内边距
     * @returns {{scale: number, tx: number, ty: number}}
     */
    getScalingTransform(targetWidth, targetHeight, padding = 0) {
      const availW = targetWidth - padding * 2;
      const availH = targetHeight - padding * 2;
      // Hanzi Writer 数据坐标系：900x900 左右
      const dataW = 900, dataH = 900;
      const scale = Math.min(availW / dataW, availH / dataH);
      const tx = (targetWidth - dataW * scale) / 2;
      const ty = (targetHeight - dataH * scale) / 2 + padding;
      return { scale, tx, ty };
    },

    /**
     * 渲染单个汉字
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} char - 汉字
     * @param {number} x - 起始 X
     * @param {number} y - 起始 Y
     * @param {number} size - 字号
     * @param {{
     *   color: string,
     *   baseWidth: number,
     *   jitter: number,
     *   seed: number,
     *   pressureStart: number,
     *   pressureEnd: number,
     *   pressureMiddle: number,
     *   fadeStart: number,
     *   fadeEnd: number,
     *   fadeOpacity: number,
     *   connectStrokes: boolean,
     *   connectThreshold: number,
     *   momentum: {{dx: number, dy: number, force: number}} | null
     * }} options
     * @returns {Promise<{width: number, lastPoint: {x: number, y: number}, momentumOut: {dx: number, dy: number, force: number}}>}
     */
    async renderChar(ctx, char, x, y, size, options = {}) {
      const {
        color = '#333',
        baseWidth = 3,
        jitter = 0.5,
        seed = 0,
        pressureStart = 1.3,
        pressureMiddle = 0.85,
        pressureEnd = 0.7,
        fadeStart = 0.0,
        fadeEnd = 0.75,
        fadeOpacity = 0.35,
      } = options;

      try {
        const data = await this.loadChar(char);
        const transform = this.getScalingTransform(size, size, 2);

        ctx.save();

        // 应用字间势：如果上一个字有笔势，微调位置和角度
        const momentum = options.momentum || null;
        let shiftX = 0, shiftY = 0, rotation = 0;
        if (momentum && momentum.force > 0.1) {
          // 笔势带动下一个字的起笔位置
          shiftX = momentum.dx * momentum.force * size * 0.08;
          shiftY = momentum.dy * momentum.force * size * 0.06;
          // 微旋转（字向前一笔的运动方向倾斜）
          rotation = Math.atan2(momentum.dy, momentum.dx) * momentum.force * 0.015;
        }

        ctx.translate(x + shiftX, y + shiftY);
        if (Math.abs(rotation) > 0.001) {
          ctx.rotate(rotation);
        }
        ctx.scale(transform.scale, transform.scale);

        let lastPoint = null;
        let firstPoint = null;
        let charSeed = seed;

        // 笔画内的连笔状态
        for (let i = 0; i < data.strokes.length; i++) {
          const strokePath = data.strokes[i];
          charSeed = (charSeed * 1103515245 + 12345 + i) & 0x7fffffff;

          // 字内笔画间连笔
          if (i > 0 && lastPoint && options.connectStrokes) {
            // 获取下一个笔画的起点
            const nextSegments = this.parsePath(strokePath);
            const nextPoints = this.samplePoints(nextSegments, 1);
            const nextStart = nextPoints.length > 0 ? nextPoints[0] : { x: 500, y: 300 };

            const dist = Math.sqrt(
              (nextStart.x - lastPoint.x) ** 2 + (nextStart.y - lastPoint.y) ** 2
            ) / transform.scale;
            const threshold = options.connectThreshold || 30;

            if (dist < threshold) {
              const connectPath = this.getConnectPath(lastPoint, nextStart, threshold);
              if (connectPath) {
                const connectSeed = (charSeed + i * 73) & 0x7fffffff;
                this.renderStroke(ctx, connectPath, {
                  baseWidth: (baseWidth / transform.scale) * 0.35,
                  color,
                  jitter: jitter * 0.5,
                  seed: connectSeed,
                  pressureStart: 0.6,
                  pressureMiddle: 0.4,
                  pressureEnd: 0.25,
                  fadeStart: 0.2,
                  fadeEnd: 0.9,
                  fadeOpacity: 0.2,
                  strokeIndex: -1,
                });
              }
            }
          }

          // 渲染笔画
          this.renderStroke(ctx, strokePath, {
            baseWidth: baseWidth / transform.scale,
            color,
            jitter,
            seed: charSeed,
            pressureStart,
            pressureMiddle: pressureMiddle + (Math.random() - 0.5) * 0.1, // 每笔微调
            pressureEnd: pressureEnd + (Math.random() - 0.5) * 0.1,
            fadeStart,
            fadeEnd,
            fadeOpacity,
            strokeIndex: i,
          });

          // 获取当前笔画的终点
          const segments = this.parsePath(strokePath);
          const points = this.samplePoints(segments, 1);
          if (points.length > 0) {
            if (!firstPoint) firstPoint = points[0];
            lastPoint = points[points.length - 1];
          }
        }

        ctx.restore();

        // 计算字间势：最后一个笔画的方向
        let momentumOut = { dx: 0, dy: 0, force: 0 };
        if (lastPoint) {
          const canvasLastX = x + shiftX + lastPoint.x * transform.scale;
          const canvasLastY = y + shiftY + lastPoint.y * transform.scale;
          // 势的方向：向右下（正常书写方向）
          momentumOut = {
            dx: lastPoint.x - 450, // 450 是坐标中心
            dy: lastPoint.y - 450,
            force: Math.min(1, Math.sqrt(
              (lastPoint.x - 450) ** 2 + (lastPoint.y - 450) ** 2
            ) / 600),
          };
          return {
            width: size,
            lastPoint: { x: canvasLastX, y: canvasLastY },
            momentumOut,
          };
        }

        return {
          width: size,
          lastPoint: { x: x + size / 2, y: y + size / 2 },
          momentumOut: { dx: 0, dy: 1, force: 0.3 },
        };
      } catch (e) {
        // 回退：必须 restore 变换状态
        try { ctx.restore(); } catch (_) {}
        // 回退到普通文字渲染
        ctx.font = `${size}px sans-serif`;
        ctx.fillStyle = color;
        ctx.textBaseline = 'top';
        ctx.fillText(char, x, y);
        return {
          width: size,
          lastPoint: { x: x + size, y: y + size / 2 },
          momentumOut: { dx: 1, dy: 0, force: 0.2 },
        };
      }
    },

    /**
     * 渲染一行文字
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} text - 文字
     * @param {number} x - 起始 X
     * @param {number} y - 起始 Y
     * @param {number} size - 字号
     * @param {number} charSpacing - 字间距
     * @param {object} options - 同 renderChar
     * @returns {Promise<{totalWidth: number, lastPoint: {x: number, y: number}}>}
     */
    async renderLine(ctx, text, x, y, size, charSpacing = 4, options = {}) {
      let currentX = x;
      let lastPoint = { x, y: y + size / 2 };
      let lastMomentum = null; // 字间势

      for (let ci = 0; ci < text.length; ci++) {
        const char = text[ci];
        if (char === ' ' || char === '\n' || char === '\r') {
          currentX += size * 0.5;
          lastMomentum = null;
          continue;
        }

        const result = await this.renderChar(ctx, char, currentX, y, size, {
          ...options,
          momentum: lastMomentum,
        });
        lastPoint = result.lastPoint;
        lastMomentum = result.momentumOut;

        // 字间连笔（字与字之间）
        if (options.connectStrokes && lastMomentum && lastMomentum.force > 0.3) {
          const nextX = currentX + size + charSpacing;
          const nextStart = { x: nextX - size * 0.2, y: y + size * 0.3 };

          // 直接用 Canvas API 画连笔线（不依赖坐标变换）
          this.drawConnectLine(ctx, lastPoint, nextStart, {
            baseWidth: options.baseWidth || 3,
            color: options.color || '#333',
          });
        }

        currentX += size + charSpacing;
      }

      return {
        totalWidth: currentX - x,
        lastPoint
      };
    }
  };

  // 暴露到全局
  window.StrokeEngine = STROKE_ENGINE;
})();
