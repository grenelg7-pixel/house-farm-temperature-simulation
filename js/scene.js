/* Canvas cross-section renderer for the house, kitchen and farm. */
(function () {
  "use strict";

  const { clamp, lerp, mix, rgba, rgbString, rr, smooth } = window.HeatUtil;
  const Model = window.HeatModel;

  const W = 1000;
  const H = 560;
  const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

  const ROOMS = {
    bedroom: { x: 58, y: 228, w: 188, h: 236 },
    living: { x: 258, y: 228, w: 178, h: 236 },
    kitchen: { x: 448, y: 228, w: 174, h: 236 },
  };

  let canvas = null;
  let ctx = null;
  let view = { w: W, h: H };

  function init(el) {
    canvas = el;
    ctx = canvas.getContext("2d");
    resize();
  }

  function resize() {
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view = { w, h };
  }

  // ---------------------------------------------------------------- sky
  function skyColours() {
    const state = Model.state;
    const p = clamp((state.time / 60 - 6) / 12, 0, 1);
    let top, mid, bot;
    if (p < 0.5) {
      const k = smooth(p / 0.5);
      top = mix([38, 62, 96], [42, 124, 196], k);
      mid = mix([118, 124, 152], [130, 196, 240], k);
      bot = mix([255, 178, 120], [205, 235, 250], k);
    } else {
      const k = smooth((p - 0.5) / 0.5);
      top = mix([42, 124, 196], [48, 56, 96], k);
      mid = mix([130, 196, 240], [190, 120, 130], k);
      bot = mix([205, 235, 250], [255, 150, 100], k);
    }

    if (state.weather === "rain" || state.rain > 0.25) {
      const g = 0.45 + state.rain * 0.35;
      top = mix(top, [64, 78, 96], g);
      mid = mix(mid, [104, 118, 134], g);
      bot = mix(bot, [150, 162, 174], g);
    } else if (state.weather === "sun") {
      top = mix(top, [40, 118, 198], 0.12);
      mid = mix(mid, [150, 206, 248], 0.16);
      bot = mix(bot, [255, 222, 176], 0.22);
    }
    return { top, mid, bot };
  }

  function drawSky() {
    const state = Model.state;
    const c = skyColours();
    const g = ctx.createLinearGradient(0, 0, 0, 480);
    g.addColorStop(0, rgba(c.top, 1));
    g.addColorStop(0.58, rgba(c.mid, 1));
    g.addColorStop(1, rgba(c.bot, 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, 480);
    if (state.rain > 0.01) {
      ctx.fillStyle = `rgba(28,38,52,${state.rain * 0.16})`;
      ctx.fillRect(0, 0, W, 480);
    }
  }

  function drawSun() {
    const state = Model.state;
    const p = clamp((state.time - Model.START) / (Model.END - Model.START), 0, 1);
    const x = 80 + p * 840;
    const y = 402 - Math.sin(Math.PI * p) * 312;
    const a = (1 - state.rain * 0.88) * (state.weather === "sun" ? 1 : 0.9);
    if (a <= 0.03) return;

    const radius = state.weather === "sun" ? 165 : 130;
    const glow = ctx.createRadialGradient(x, y, 6, x, y, radius);
    glow.addColorStop(0, `rgba(255,244,210,${0.95 * a})`);
    glow.addColorStop(0.16, `rgba(255,214,140,${0.5 * a})`);
    glow.addColorStop(0.55, `rgba(255,180,100,${0.14 * a})`);
    glow.addColorStop(1, "rgba(255,180,100,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255,250,232,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, state.weather === "sun" ? 28 : 24, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCloud(x, y, s, alpha, col) {
    ctx.fillStyle = rgba(col, alpha);
    ctx.beginPath();
    ctx.ellipse(x, y, 54 * s, 20 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 34 * s, y + 6 * s, 30 * s, 15 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 36 * s, y + 7 * s, 32 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 4 * s, y - 12 * s, 30 * s, 17 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawClouds(nowSec) {
    const state = Model.state;
    const rain = state.rain;
    const col = rain > 0.04 ? [188, 200, 214] : [255, 255, 255];
    const alpha = state.weather === "sun" ? 0.18 : 0.30 + 0.34 * rain;
    const count = state.weather === "sun" ? 2 : 4;
    for (let i = 0; i < count; i++) {
      const speed = 4 + i * 1.6;
      const x = ((nowSec * speed + i * 327) % 1320) - 160;
      const y = 54 + i * 33 + Math.sin(nowSec * 0.25 + i) * 5;
      drawCloud(x, y, 0.62 + i * 0.17, alpha, col);
    }
  }

  // ---------------------------------------------------------------- ground
  function drawGround() {
    const state = Model.state;
    const summer = state.season === "summer";
    ctx.fillStyle = summer ? "#243b33" : "#20382f";
    ctx.beginPath();
    ctx.moveTo(0, 452);
    ctx.bezierCurveTo(120, 424, 250, 444, 380, 430);
    ctx.bezierCurveTo(540, 412, 690, 442, 840, 428);
    ctx.bezierCurveTo(910, 421, 960, 430, 1000, 424);
    ctx.lineTo(1000, 500);
    ctx.lineTo(0, 500);
    ctx.closePath();
    ctx.fill();

    const g = ctx.createLinearGradient(0, 448, 0, H);
    g.addColorStop(0, summer ? "#465536" : "#30503b");
    g.addColorStop(0.55, summer ? "#33482e" : "#234334");
    g.addColorStop(1, summer ? "#1a2a1e" : "#142a20");
    ctx.fillStyle = g;
    ctx.fillRect(0, 452, W, H - 452);

    ctx.fillStyle = summer ? "rgba(255,215,150,0.10)" : "rgba(170,210,200,0.07)";
    ctx.fillRect(0, 452, W, 3);

    ctx.strokeStyle = summer ? "rgba(150,170,100,0.28)" : "rgba(120,190,140,0.30)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 46; i++) {
      const x = (i * 137.5 + 31) % W;
      const y = 478 + ((i * 53) % 68);
      const s = 3 + (i % 4);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x - 3, y - s, x - 5, y - s - 2);
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 2, y - s, x + 5, y - s - 1);
      ctx.stroke();
    }

    ctx.fillStyle = summer ? "rgba(168,160,136,0.32)" : "rgba(140,150,138,0.30)";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(630 + i * 14, 492 + (i % 2) * 7, 9 - i * 0.7, 4, -0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------- rain
  const rainDrops = Array.from({ length: 150 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    len: 9 + Math.random() * 17,
    sp: 500 + Math.random() * 420,
  }));

  function drawRain(dt) {
    const state = Model.state;
    if (state.rain <= 0.015) return;
    ctx.save();
    ctx.strokeStyle = `rgba(184,216,255,${0.10 + 0.30 * state.rain})`;
    ctx.lineWidth = 1.15;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < rainDrops.length; i++) {
      const d = rainDrops[i];
      d.y += d.sp * dt;
      d.x -= d.sp * 0.20 * dt;
      if (d.y > H + 20) { d.y = -20; d.x = Math.random() * W; }
      if (d.x < -20) d.x += W + 40;
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.len * 0.20, d.y + d.len);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- annotations
  function drawChip(x, y, label, value, accent) {
    const w = 128;
    const h = 46;
    rr(ctx, x, y, w, h, 10);
    ctx.fillStyle = "rgba(7,12,20,0.80)";
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.34);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = rgba(accent, 0.95);
    rr(ctx, x + 1, y + 10, 3, h - 20, 2);
    ctx.fill();

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(190,212,235,0.62)";
    ctx.font = `600 9px ${FONT}`;
    ctx.fillText(label.toUpperCase(), x + 13, y + 17);

    ctx.fillStyle = "#f4f8ff";
    ctx.font = `700 21px ${FONT}`;
    const txt = value.toFixed(1) + "°";
    ctx.fillText(txt, x + 13, y + 38);
    const tw = ctx.measureText(txt).width;
    ctx.fillStyle = "rgba(190,212,235,0.55)";
    ctx.font = `600 10px ${FONT}`;
    ctx.fillText("C", x + 15 + tw, y + 38);
  }

  function drawFlow(wallX, y, delta, nowSec) {
    const mag = Math.abs(delta);
    if (mag < 0.12) return;
    const dir = delta > 0 ? 1 : -1;
    const len = 46;
    const x1 = wallX - (dir * len) / 2;
    const x2 = wallX + (dir * len) / 2;
    const a = clamp(0.20 + mag * 0.22, 0.20, 0.85);

    ctx.save();
    ctx.strokeStyle = `rgba(255,166,88,${a})`;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -((nowSec * 26) % 13);
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = `rgba(255,190,130,${a})`;
    ctx.beginPath();
    ctx.moveTo(x2, y);
    ctx.lineTo(x2 - dir * 8, y - 5);
    ctx.lineTo(x2 - dir * 8, y + 5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = `rgba(255,205,160,${Math.min(0.92, a + 0.1)})`;
    ctx.font = `600 10px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(`Δ ${mag.toFixed(1)}°`, wallX, y - 9);
    ctx.restore();
  }

  function drawHeatWaves(x, y, nowSec, level) {
    if (level < 0.04) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      const bx = x + i * 13;
      ctx.beginPath();
      for (let k = 0; k <= 20; k++) {
        const py = y - k * 3.4;
        const px = bx + Math.sin(k * 0.52 + nowSec * 3.1 + i * 1.7) * (4 + k * 0.12);
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = `rgba(255,158,78,${0.32 * level})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- house
  function drawWindow(x, y, w, h) {
    const state = Model.state;
    const c = skyColours();
    const glassTop = mix(c.mid, [255, 255, 255], 0.16 + 0.1 * (1 - state.rain));
    const glassBot = mix(c.bot, [255, 245, 220], 0.18);

    ctx.fillStyle = "rgba(0,0,0,0.25)";
    rr(ctx, x - 4, y - 4, w + 8, h + 8, 4);
    ctx.fill();

    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, rgba(glassTop, 0.95));
    g.addColorStop(1, rgba(glassBot, 0.88));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = "rgba(10,18,28,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h);
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();

    ctx.strokeStyle = "#33475f";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);

    ctx.fillStyle = "#41566f";
    ctx.fillRect(x - 5, y + h + 1, w + 10, 4);
  }

  function drawBedroom() {
    ctx.fillStyle = "rgba(120,160,200,0.10)";
    ctx.beginPath();
    ctx.ellipse(148, 452, 72, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#2b3850";
    rr(ctx, 72, 396, 120, 62, 6);
    ctx.fill();
    ctx.fillStyle = "#26324a";
    rr(ctx, 66, 372, 11, 82, 4);
    ctx.fill();
    ctx.fillStyle = "#93a7bf";
    rr(ctx, 78, 386, 108, 26, 6);
    ctx.fill();
    ctx.fillStyle = "#e4edf8";
    rr(ctx, 86, 389, 34, 18, 4);
    ctx.fill();
    ctx.fillStyle = "#3c6c98";
    rr(ctx, 78, 408, 108, 50, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(220,236,252,0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(80, 421);
    ctx.lineTo(184, 421);
    ctx.stroke();

    ctx.fillStyle = "#2a3648";
    rr(ctx, 198, 424, 28, 38, 4);
    ctx.fill();
    ctx.strokeStyle = "#7d8fa3";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(212, 424);
    ctx.lineTo(212, 404);
    ctx.stroke();
    ctx.fillStyle = "#ffd9a0";
    ctx.beginPath();
    ctx.moveTo(201, 404);
    ctx.lineTo(223, 404);
    ctx.lineTo(217, 391);
    ctx.lineTo(207, 391);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#42586f";
    ctx.lineWidth = 2;
    ctx.strokeRect(205, 314, 34, 25);
    ctx.fillStyle = "rgba(127,227,176,0.18)";
    ctx.fillRect(207, 316, 30, 21);
  }

  function drawLiving() {
    ctx.fillStyle = "rgba(120,160,200,0.10)";
    ctx.beginPath();
    ctx.ellipse(346, 452, 84, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#294258";
    rr(ctx, 274, 398, 122, 58, 10);
    ctx.fill();
    ctx.fillStyle = "#335069";
    rr(ctx, 274, 378, 122, 28, 10);
    ctx.fill();
    ctx.fillStyle = "#3f637f";
    rr(ctx, 286, 402, 38, 26, 6);
    ctx.fill();
    rr(ctx, 330, 402, 38, 26, 6);
    ctx.fill();
    ctx.fillStyle = "#22384b";
    rr(ctx, 268, 394, 12, 56, 5);
    ctx.fill();
    rr(ctx, 390, 394, 12, 56, 5);
    ctx.fill();
    ctx.fillStyle = "#1a2a3a";
    ctx.fillRect(280, 456, 8, 6);
    ctx.fillRect(382, 456, 8, 6);

    ctx.fillStyle = "#0a1017";
    rr(ctx, 386, 298, 38, 30, 3);
    ctx.fill();
    ctx.strokeStyle = "#3c4e66";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "rgba(127,227,255,0.16)";
    ctx.beginPath();
    ctx.moveTo(389, 301);
    ctx.lineTo(408, 301);
    ctx.lineTo(389, 323);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#8a5a3a";
    rr(ctx, 410, 440, 16, 18, 3);
    ctx.fill();
    ctx.strokeStyle = "#4fa86f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(418, 440);
    ctx.quadraticCurveTo(414, 424, 407, 420);
    ctx.moveTo(418, 440);
    ctx.quadraticCurveTo(422, 424, 430, 419);
    ctx.moveTo(418, 440);
    ctx.quadraticCurveTo(418, 426, 418, 416);
    ctx.stroke();
  }

  function drawKitchen(nowSec, level) {
    ctx.fillStyle = "#283543";
    rr(ctx, 536, 404, 86, 58, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(190,212,235,0.12)";
    ctx.fillRect(536, 404, 86, 3);

    ctx.fillStyle = "#0e1824";
    rr(ctx, 548, 408, 28, 14, 3);
    ctx.fill();
    ctx.strokeStyle = "#7d8fa3";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(556, 408);
    ctx.lineTo(556, 396);
    ctx.quadraticCurveTo(556, 392, 562, 392);
    ctx.stroke();

    ctx.fillStyle = "#7d8fa3";
    rr(ctx, 578, 352, 42, 112, 5);
    ctx.fill();
    ctx.strokeStyle = "#43536a";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = "#43536a";
    ctx.beginPath();
    ctx.moveTo(578, 390);
    ctx.lineTo(620, 390);
    ctx.stroke();
    ctx.fillStyle = "#43536a";
    ctx.fillRect(612, 372, 3, 12);
    ctx.fillRect(612, 400, 3, 18);

    ctx.fillStyle = "#18212e";
    rr(ctx, 452, 358, 84, 106, 6);
    ctx.fill();
    ctx.strokeStyle = "#33475c";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#0f1823";
    rr(ctx, 450, 354, 88, 12, 4);
    ctx.fill();

    for (let i = 0; i < 2; i++) {
      const bx = 470 + i * 28;
      ctx.strokeStyle = "#3a4a5e";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(bx, 360, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(bx, 360, 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#0b131d";
    rr(ctx, 462, 396, 64, 52, 4);
    ctx.fill();
    ctx.strokeStyle = "#2c3c50";
    ctx.stroke();
    ctx.fillStyle = "#5b6f86";
    ctx.fillRect(474, 404, 40, 3);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(470 + i * 12, 386, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = "#3f5268";
      ctx.fill();
    }

    ctx.fillStyle = "#66788c";
    rr(ctx, 470, 330, 38, 26, 5);
    ctx.fill();
    ctx.fillStyle = "#8ea3ba";
    ctx.beginPath();
    ctx.ellipse(489, 331, 19, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#a9b8c9";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(470, 340);
    ctx.lineTo(461, 336);
    ctx.moveTo(508, 340);
    ctx.lineTo(517, 336);
    ctx.stroke();

    if (level > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(490, 352, 4, 490, 352, 150);
      glow.addColorStop(0, `rgba(255,150,60,${0.34 * level})`);
      glow.addColorStop(0.45, `rgba(255,110,40,${0.12 * level})`);
      glow.addColorStop(1, "rgba(255,110,40,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(490, 352, 150, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < 5; i++) {
        const fx = 468 + i * 10;
        const fh = 6 + Math.abs(Math.sin(nowSec * 8 + i * 1.3)) * 7;
        ctx.fillStyle = `rgba(255,${150 + i * 10},70,${0.55 * level})`;
        ctx.beginPath();
        ctx.moveTo(fx, 356);
        ctx.quadraticCurveTo(fx + 3, 356 - fh * 0.6, fx + 1.5, 356 - fh);
        ctx.quadraticCurveTo(fx - 2, 356 - fh * 0.5, fx, 356);
        ctx.fill();
      }
      ctx.restore();
      drawHeatWaves(485, 322, nowSec, level);
    }
  }

  function drawHouse(nowSec) {
    const state = Model.state;
    const T = state.temps;

    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.beginPath();
    ctx.ellipse(340, 486, 312, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#2c3b52";
    ctx.beginPath();
    ctx.moveTo(20, 224);
    ctx.lineTo(340, 86);
    ctx.lineTo(660, 224);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#4a5f80";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const yy = 224 - i * 24;
      const half = (224 - yy) * 1.52;
      ctx.beginPath();
      ctx.moveTo(340 - half, yy);
      ctx.lineTo(340 + half, yy);
      ctx.stroke();
    }

    ctx.fillStyle = "#39445a";
    ctx.fillRect(500, 112, 26, 44);
    ctx.fillStyle = "#4b5770";
    ctx.fillRect(496, 108, 34, 8);

    ctx.fillStyle = "#1a2636";
    rr(ctx, 48, 218, 584, 252, 8);
    ctx.fill();
    ctx.strokeStyle = "#3a4f6a";
    ctx.lineWidth = 2;
    ctx.stroke();

    const roomTemp = {
      bedroom: T.bedroom,
      living: T.living,
      kitchen: T.kitchen,
    };
    for (const key of Object.keys(ROOMS)) {
      const r = ROOMS[key];
      const bg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      bg.addColorStop(0, "#1c2839");
      bg.addColorStop(1, "#131c28");
      ctx.fillStyle = bg;
      ctx.fillRect(r.x, r.y, r.w, r.h);

      const c = Model.tempColor(roomTemp[key]);
      const tint = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      tint.addColorStop(0, rgba(c, 0.04));
      tint.addColorStop(0.55, rgba(c, 0.13));
      tint.addColorStop(1, rgba(c, 0.27));
      ctx.fillStyle = tint;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }

    drawBedroom();
    drawLiving();
    drawKitchen(nowSec, state.stoveLevel);

    for (const key of Object.keys(ROOMS)) {
      const r = ROOMS[key];
      const c = Model.tempColor(roomTemp[key]);
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      ctx.globalCompositeOperation = "color";
      ctx.globalAlpha = 0.46;
      ctx.fillStyle = rgbString(c);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.restore();
    }

    drawWindow(96, 296, 80, 60);
    drawWindow(300, 296, 80, 60);
    drawWindow(540, 298, 60, 54);

    ctx.fillStyle = "#0d1724";
    ctx.fillRect(246, 228, 12, 168);
    ctx.fillRect(436, 228, 12, 168);
    ctx.fillStyle = "#1f3046";
    ctx.fillRect(246, 228, 2, 168);
    ctx.fillRect(436, 228, 2, 168);
    ctx.fillStyle = "#2a3d55";
    ctx.fillRect(246, 394, 12, 4);
    ctx.fillRect(436, 394, 12, 4);

    const floor = ctx.createLinearGradient(0, 462, 0, 470);
    floor.addColorStop(0, "#3a4b61");
    floor.addColorStop(1, "#1c2938");
    ctx.fillStyle = floor;
    ctx.fillRect(58, 462, 564, 8);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.moveTo(70 + i * 46, 463);
      ctx.lineTo(70 + i * 46, 469);
      ctx.stroke();
    }

    drawChip(68, 238, "Bedroom", T.bedroom, Model.tempColor(T.bedroom));
    drawChip(268, 238, "Living", T.living, Model.tempColor(T.living));
    drawChip(458, 238, "Kitchen", T.kitchen, Model.tempColor(T.kitchen));

    drawFlow(252, 430, T.bedroom - T.living, nowSec);
    drawFlow(442, 430, T.living - T.kitchen, nowSec);
  }

  // ---------------------------------------------------------------- farm
  function drawFarm(nowSec) {
    const state = Model.state;
    const F = state.farm;
    const season = state.season;
    const rain = state.rain;
    const wet = clamp(F.moisture / 100, 0, 1);
    const health = Model.farmHealth();
    const droop = clamp(F.stress / 100, 0, 1);

    ctx.strokeStyle = season === "summer" ? "#5a4a35" : "#463d30";
    ctx.fillStyle = season === "summer" ? "#5a4a35" : "#463d30";
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const px = 664 + i * 58;
      ctx.fillRect(px, 396, 5, 74);
      ctx.fillStyle = season === "summer" ? "#6b5940" : "#544a3b";
      ctx.fillRect(px - 2, 392, 9, 5);
      ctx.fillStyle = season === "summer" ? "#5a4a35" : "#463d30";
    }
    ctx.beginPath();
    ctx.moveTo(664, 414);
    ctx.lineTo(954, 414);
    ctx.moveTo(664, 438);
    ctx.lineTo(954, 438);
    ctx.stroke();

    const soilTop = mix([112, 85, 56], [57, 42, 30], wet);
    const soilBot = mix([74, 55, 38], [38, 28, 21], wet);
    const soil = ctx.createLinearGradient(0, 432, 0, 472);
    soil.addColorStop(0, rgba(soilTop, 1));
    soil.addColorStop(1, rgba(soilBot, 1));
    ctx.fillStyle = soil;
    rr(ctx, 666, 432, 286, 40, 7);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = "rgba(0,0,0,0.16)";
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(674, 432 + i * 9);
      ctx.quadraticCurveTo(810, 429 + i * 9, 944, 432 + i * 9);
      ctx.stroke();
    }

    const stem = Model.healthColor(health);
    const leafCol = mix(stem, [208, 184, 86], droop * 0.55);
    for (let i = 0; i < 9; i++) {
      const x = 684 + i * 30;
      const baseY = 450;
      const h = 20 + F.growth * 0.42;
      const sway = Math.sin(nowSec * 1.5 + i * 1.1) * 2.4;
      const topX = x + sway + droop * 11;
      const topY = baseY - h;

      ctx.strokeStyle = rgba(stem, 0.95);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.quadraticCurveTo(x + sway * 0.4, baseY - h * 0.55, topX, topY);
      ctx.stroke();

      for (let k = 0; k < 3; k++) {
        const f = 0.45 + k * 0.22;
        const lx = lerp(x, topX, f) + (k % 2 ? 2 : -2);
        const ly = lerp(baseY, topY, f);
        const ang = (k % 2 ? 1 : -1) * (1.05 - droop * 0.75) + sway * 0.02;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(ang);
        ctx.fillStyle = rgba(k === 2 ? leafCol : stem, 0.9);
        ctx.beginPath();
        ctx.ellipse(0, -7, 4.2, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.fillStyle = rgba(leafCol, 0.85);
      ctx.beginPath();
      ctx.arc(topX, topY, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#3f4d5a";
    rr(ctx, 902, 390, 32, 46, 5);
    ctx.fill();
    ctx.strokeStyle = "#586b7e";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const waterH = clamp(wet * 34, 2, 34);
    ctx.fillStyle = "rgba(76,201,240,0.55)";
    rr(ctx, 906, 432 - waterH, 24, waterH, 2);
    ctx.fill();
    ctx.strokeStyle = "#2a3542";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(902, 404);
    ctx.lineTo(934, 404);
    ctx.moveTo(902, 422);
    ctx.lineTo(934, 422);
    ctx.stroke();

    if (rain > 0.04 || F.moisture > 82) {
      const a = Math.max(rain * 0.45, (F.moisture - 82) / 60);
      ctx.fillStyle = `rgba(130,190,230,${clamp(a, 0, 0.4)})`;
      const puddles = [[702, 486, 20, 4], [806, 500, 26, 5], [890, 482, 16, 3.5], [742, 470, 12, 2.5]];
      for (const p of puddles) {
        ctx.beginPath();
        ctx.ellipse(p[0], p[1], p[2], p[3], 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (F.temp > 34.5) {
      const a = clamp((F.temp - 34.5) / 8, 0, 1);
      ctx.save();
      ctx.strokeStyle = `rgba(255,190,120,${0.10 + 0.16 * a})`;
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        for (let k = 0; k <= 24; k++) {
          const px = 690 + k * 11;
          const py = 392 + i * 11 + Math.sin(k * 0.6 + nowSec * 2.2 + i) * 2.2;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    drawChip(700, 300, "Farm canopy", F.temp, Model.tempColor(F.temp));
  }

  // ---------------------------------------------------------------- focus
  function outline(x, y, w, h, color, alpha) {
    ctx.save();
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 7]);
    ctx.lineDashOffset = -((performance.now() / 60) % 14);
    rr(ctx, x, y, w, h, 10);
    ctx.stroke();
    ctx.restore();
  }

  function drawFocus(nowSec) {
    const state = Model.state;
    const pulse = 0.55 + 0.2 * Math.sin(nowSec * 2.2);

    if (state.station === 1) {
      ctx.fillStyle = "rgba(4,9,16,0.34)";
      ctx.fillRect(650, 268, 350, 260);
      outline(40, 86, 600, 400, [127, 227, 255], pulse);
    } else if (state.station === 2) {
      ctx.fillStyle = "rgba(4,9,16,0.46)";
      ctx.fillRect(48, 218, 390, 252);
      ctx.fillRect(650, 268, 350, 260);
      outline(448, 228, 174, 236, [255, 171, 74], pulse);
    } else {
      ctx.fillStyle = "rgba(4,9,16,0.46)";
      ctx.fillRect(40, 86, 600, 400);
      outline(660, 376, 300, 130, [111, 227, 161], pulse);
    }
  }

  function drawVignette() {
    const v = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.2, W / 2, H * 0.45, H * 0.95);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  // ---------------------------------------------------------------- frame
  function draw(nowSec, dt) {
    if (!ctx) return;
    const { w, h } = view;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.scale(w / W, h / H);

    drawSky();
    drawSun();
    drawClouds(nowSec);
    drawGround();
    drawFarm(nowSec);
    drawRain(dt);
    drawHouse(nowSec);
    drawVignette();
    drawFocus(nowSec);

    ctx.restore();
  }

  window.HeatScene = { init, resize, draw, W, H };
})();
