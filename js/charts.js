/* Canvas charts for the house and farm histories. */
(function () {
  "use strict";

  const { clamp, formatClock } = window.HeatUtil;
  const Model = window.HeatModel;
  const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

  let houseCanvas = null;
  let farmCanvas = null;
  let houseCtx = null;
  let farmCtx = null;
  let houseView = { w: 600, h: 190 };
  let farmView = { w: 600, h: 190 };

  function init(houseEl, farmEl) {
    houseCanvas = houseEl;
    farmCanvas = farmEl;
    houseCtx = houseCanvas.getContext("2d");
    farmCtx = farmCanvas.getContext("2d");
    resize();
  }

  function fit(canvas, ctx) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function resize() {
    if (houseCanvas) houseView = fit(houseCanvas, houseCtx);
    if (farmCanvas) farmView = fit(farmCanvas, farmCtx);
  }

  function emptyMessage(ctx, view, pad) {
    ctx.fillStyle = "#61748f";
    ctx.font = `11px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Advance time to build the curve", view.w / 2, pad.t + (view.h - pad.t - pad.b) / 2);
  }

  function drawHouseChart() {
    const { w, h } = houseView;
    const g = houseCtx;
    g.clearRect(0, 0, w, h);
    if (w < 80 || h < 70) return;

    const pad = { l: 40, r: 18, t: 14, b: 24 };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    const yMin = 15;
    const yMax = 45;
    const xFor = (t) => pad.l + clamp((t - Model.START) / (Model.END - Model.START), 0, 1) * pw;
    const yFor = (T) => pad.t + ph - ((clamp(T, yMin, yMax) - yMin) / (yMax - yMin)) * ph;
    const hist = Model.state.history;

    g.font = `10px ${FONT}`;
    g.textBaseline = "middle";

    for (let i = 0; i < hist.length - 1; i++) {
      if (!hist[i].stove) continue;
      const x1 = xFor(hist[i].t);
      const x2 = xFor(hist[i + 1].t);
      g.fillStyle = "rgba(255,122,61,0.08)";
      g.fillRect(x1, pad.t, Math.max(1, x2 - x1), ph);
    }
    for (let i = 0; i < hist.length - 1; i++) {
      if (!hist[i].rain || hist[i].rain < 0.04) continue;
      const x1 = xFor(hist[i].t);
      const x2 = xFor(hist[i + 1].t);
      g.fillStyle = `rgba(76,201,240,${0.02 + hist[i].rain * 0.04})`;
      g.fillRect(x1, pad.t, Math.max(1, x2 - x1), ph);
    }

    for (let v = yMin; v <= yMax; v += 5) {
      const y = yFor(v);
      g.strokeStyle = "rgba(140,180,230,0.08)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(pad.l, y + 0.5);
      g.lineTo(pad.l + pw, y + 0.5);
      g.stroke();
      g.fillStyle = "#61748f";
      g.textAlign = "right";
      g.fillText(v + "°", pad.l - 7, y);
    }

    g.textAlign = "center";
    for (let hh = 6; hh <= 18; hh += 3) {
      const x = xFor(hh * 60);
      g.strokeStyle = "rgba(140,180,230,0.07)";
      g.beginPath();
      g.moveTo(x + 0.5, pad.t);
      g.lineTo(x + 0.5, pad.t + ph);
      g.stroke();
      g.fillStyle = "#61748f";
      g.fillText(formatClock(hh * 60).text, x, pad.t + ph + 12);
    }

    if (hist.length < 2) {
      emptyMessage(g, houseView, pad);
      return;
    }

    const series = (key, color, lw, dash) => {
      g.beginPath();
      for (let i = 0; i < hist.length; i++) {
        const x = xFor(hist[i].t);
        const y = yFor(hist[i][key]);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokeStyle = color;
      g.lineWidth = lw;
      g.lineJoin = "round";
      g.lineCap = "round";
      g.setLineDash(dash || []);
      g.stroke();
      g.setLineDash([]);
    };

    series("out", "rgba(142,163,192,0.75)", 1.4, [4, 4]);
    series("bedroom", "#b39dff", 1.6);
    series("living", "#4cc9f0", 1.8);
    series("kitchen", "#ff8a4c", 2.2);

    const nx = xFor(Model.state.time);
    g.strokeStyle = "rgba(232,239,250,0.22)";
    g.lineWidth = 1;
    g.setLineDash([3, 4]);
    g.beginPath();
    g.moveTo(nx, pad.t);
    g.lineTo(nx, pad.t + ph);
    g.stroke();
    g.setLineDash([]);

    const last = hist[hist.length - 1];
    const dots = [["kitchen", "#ff8a4c"], ["living", "#4cc9f0"], ["bedroom", "#b39dff"]];
    for (const d of dots) {
      g.beginPath();
      g.arc(xFor(last.t), yFor(last[d[0]]), 2.6, 0, Math.PI * 2);
      g.fillStyle = d[1];
      g.fill();
    }
  }

  function drawFarmChart() {
    const { w, h } = farmView;
    const g = farmCtx;
    g.clearRect(0, 0, w, h);
    if (w < 80 || h < 70) return;

    const pad = { l: 36, r: 34, t: 14, b: 24 };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    const xFor = (t) => pad.l + clamp((t - Model.START) / (Model.END - Model.START), 0, 1) * pw;
    const yPct = (v) => pad.t + ph - (clamp(v, 0, 100) / 100) * ph;
    const yTemp = (v) => pad.t + ph - ((clamp(v, 15, 45) - 15) / 30) * ph;
    const hist = Model.state.history;

    g.font = `10px ${FONT}`;
    g.textBaseline = "middle";

    for (let i = 0; i < hist.length - 1; i++) {
      if (!hist[i].rain || hist[i].rain < 0.04) continue;
      const x1 = xFor(hist[i].t);
      const x2 = xFor(hist[i + 1].t);
      g.fillStyle = `rgba(76,201,240,${0.03 + hist[i].rain * 0.05})`;
      g.fillRect(x1, pad.t, Math.max(1, x2 - x1), ph);
    }

    for (let v = 0; v <= 100; v += 25) {
      const y = yPct(v);
      g.strokeStyle = "rgba(140,180,230,0.08)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(pad.l, y + 0.5);
      g.lineTo(pad.l + pw, y + 0.5);
      g.stroke();
      g.fillStyle = "#61748f";
      g.textAlign = "right";
      g.fillText(v + "%", pad.l - 6, y);
    }

    g.textAlign = "left";
    for (let v = 15; v <= 45; v += 10) {
      g.fillStyle = "rgba(255,179,71,0.65)";
      g.fillText(v + "°", pad.l + pw + 7, yTemp(v));
    }

    g.textAlign = "center";
    for (let hh = 6; hh <= 18; hh += 3) {
      const x = xFor(hh * 60);
      g.strokeStyle = "rgba(140,180,230,0.07)";
      g.beginPath();
      g.moveTo(x + 0.5, pad.t);
      g.lineTo(x + 0.5, pad.t + ph);
      g.stroke();
      g.fillStyle = "#61748f";
      g.fillText(formatClock(hh * 60).text, x, pad.t + ph + 12);
    }

    if (hist.length < 2) {
      emptyMessage(g, farmView, pad);
      return;
    }

    const series = (key, color, lw, mapper) => {
      g.beginPath();
      for (let i = 0; i < hist.length; i++) {
        const x = xFor(hist[i].t);
        const y = mapper(hist[i][key]);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokeStyle = color;
      g.lineWidth = lw;
      g.lineJoin = "round";
      g.lineCap = "round";
      g.stroke();
    };

    series("moisture", "#4cc9f0", 1.8, yPct);
    series("growth", "#6fe3a1", 1.8, yPct);
    series("stress", "#ff5d5d", 1.8, yPct);
    series("farm", "#ffb347", 2, yTemp);

    const nx = xFor(Model.state.time);
    g.strokeStyle = "rgba(232,239,250,0.22)";
    g.lineWidth = 1;
    g.setLineDash([3, 4]);
    g.beginPath();
    g.moveTo(nx, pad.t);
    g.lineTo(nx, pad.t + ph);
    g.stroke();
    g.setLineDash([]);

    const last = hist[hist.length - 1];
    g.beginPath();
    g.arc(xFor(last.t), yTemp(last.farm), 2.6, 0, Math.PI * 2);
    g.fillStyle = "#ffb347";
    g.fill();
  }

  function draw() {
    drawHouseChart();
    drawFarmChart();
  }

  window.HeatCharts = { init, resize, draw };
})();
