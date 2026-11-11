/* UI wiring, station gating and the animation loop. */
(function () {
  "use strict";

  const { clamp, formatClock, parseTime } = window.HeatUtil;
  const Model = window.HeatModel;
  const Scene = window.HeatScene;
  const Charts = window.HeatCharts;
  const state = Model.state;

  // True while the user drags the manual time slider, so the animation loop
  // doesn't fight the pointer by rewriting the slider value every frame.
  let scrubbing = false;

  const $ = (id) => document.getElementById(id);

  const els = {
    liveBadge: $("liveBadge"),
    liveLabel: $("liveLabel"),
    clock: $("clock"),
    clockAmPm: $("clockAmPm"),
    weatherIcon: $("weatherIcon"),
    weatherLabel: $("weatherLabel"),
    stageKicker: $("stageKicker"),
    stageTitle: $("stageTitle"),
    focusChip: $("focusChip"),
    hudOut: $("hudOut"),
    hudKitchen: $("hudKitchen"),
    hudFarm: $("hudFarm"),
    scene: $("scene"),
    playBtn: $("playBtn"),
    resetBtn: $("resetBtn"),
    windowBtn: $("windowBtn"),
    timeRange: $("timeRange"),
    timeReadout: $("timeReadout"),
    timeHint: $("timeHint"),
    timeInput: $("timeInput"),
    timeApply: $("timeApply"),
    dayPill: $("dayPill"),
    dayNote: $("dayNote"),
    stoveBtn: $("stoveBtn"),
    stoveBadge: $("stoveBadge"),
    stoveTitle: $("stoveTitle"),
    stoveSub: $("stoveSub"),
    cookTime: $("cookTime"),
    flowK: $("flowK"),
    flowL: $("flowL"),
    flowB: $("flowB"),
    gradientReadout: $("gradientReadout"),
    stoveNote: $("stoveNote"),
    seasonPill: $("seasonPill"),
    farmStatus: $("farmStatus"),
    farmNote: $("farmNote"),
    moistVal: $("moistVal"),
    moistBar: $("moistBar"),
    growthVal: $("growthVal"),
    growthBar: $("growthBar"),
    stressVal: $("stressVal"),
    stressBar: $("stressBar"),
    readPill: $("readPill"),
    readKitchen: $("readKitchen"),
    readLiving: $("readLiving"),
    readBedroom: $("readBedroom"),
    readOut: $("readOut"),
    readFarm: $("readFarm"),
    markerKitchen: $("markerKitchen"),
    markerOut: $("markerOut"),
    markerFarm: $("markerFarm"),
    houseChart: $("houseChart"),
    farmChart: $("farmChart"),
    state1: $("state1"),
    state2: $("state2"),
    state3: $("state3"),
    resetFarmBtn: $("resetFarmBtn"),
  };

  const stationTabs = Array.from(document.querySelectorAll(".station-tab"));
  const stationPanels = Array.from(document.querySelectorAll(".station-panel"));
  const speedButtons = Array.from(document.querySelectorAll("[data-speed]"));
  const quickJumps = Array.from(document.querySelectorAll("[data-jump]"));
  const powerButtons = Array.from(document.querySelectorAll("[data-power]"));
  const seasonButtons = Array.from(document.querySelectorAll("[data-season]"));
  const weatherButtons = Array.from(document.querySelectorAll("[data-weather]"));
  const advanceButtons = Array.from(document.querySelectorAll("[data-advance]"));
  const nextButtons = Array.from(document.querySelectorAll("[data-next]"));
  const panelActions = Array.from(document.querySelectorAll("[data-action]"));

  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }

  function tempText(t) {
    return t.toFixed(1) + " °C";
  }

  function setReading(el, temp, out, baselineLabel) {
    if (!el) return;
    const c = Model.tempColor(temp);
    el.style.setProperty("--zc", `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`);
    const num = el.querySelector(".reading-temp b");
    if (num) num.textContent = temp.toFixed(1);
    const delta = el.querySelector(".reading-delta");
    if (delta) {
      if (baselineLabel) {
        delta.textContent = baselineLabel;
      } else {
        const d = temp - out;
        delta.textContent = (d >= 0 ? "+" : "") + d.toFixed(1) + "° vs out";
      }
    }
    const bar = el.querySelector(".reading-bar i");
    if (bar) bar.style.width = clamp(((temp - 15) / 30) * 100, 2, 100).toFixed(1) + "%";
  }

  function setMarker(el, temp) {
    if (!el) return;
    el.style.left = clamp(((temp - 15) / 30) * 100, 0, 100).toFixed(1) + "%";
  }

  function stationLabel(n) {
    return ["Day cycle", "Kitchen heat", "Farm weather"][n - 1];
  }

  function syncControls() {
    document.body.dataset.station = String(state.station);

    stationTabs.forEach((tab) => {
      const n = Number(tab.dataset.station);
      const active = n === state.station;
      tab.classList.toggle("active", active);
      tab.classList.toggle("visited", !!state.visited[n]);
      if (active) tab.setAttribute("aria-current", "step");
      else tab.removeAttribute("aria-current");
    });

    stationPanels.forEach((panel) => {
      panel.classList.toggle("active", Number(panel.dataset.panel) === state.station);
    });

    ["state1", "state2", "state3"].forEach((key, i) => {
      const n = i + 1;
      const el = els[key];
      if (!el) return;
      if (n === state.station) el.textContent = "active";
      else if (state.visited[n]) el.textContent = "done";
      else el.textContent = "next";
    });

    const station1 = state.station === 1;
    els.playBtn.disabled = !station1;
    const playMode = state.ended ? "Replay day" : state.running ? "Pause" : "Play day";
    const playSpan = els.playBtn.querySelector("span");
    if (playSpan) setText(playSpan, playMode);
    const playIcon = els.playBtn.querySelector("svg path");
    if (playIcon) {
      playIcon.setAttribute("d", state.running
        ? "M4 2.5h3v11H4zM9 2.5h3v11H9z"
        : "M4 2.5v11l9-5.5z");
    }
    els.windowBtn.disabled = !station1;
    els.timeRange.disabled = !station1;
    els.timeInput.disabled = !station1;
    els.timeApply.disabled = !station1;
    speedButtons.forEach((b) => { b.disabled = !station1; });
    quickJumps.forEach((b) => { b.disabled = !station1; });
    panelActions.forEach((b) => {
      b.disabled = !station1;
      if (b.dataset.action === "play") setText(b, state.ended ? "Replay day" : "Play day");
    });

    els.windowBtn.setAttribute("aria-pressed", state.windows ? "true" : "false");
    const windowSpan = els.windowBtn.querySelector("span");
    if (windowSpan) windowSpan.textContent = "Windows: " + (state.windows ? "open" : "closed");

    speedButtons.forEach((b) => {
      b.classList.toggle("active", Number(b.dataset.speed) === state.speed);
    });

    quickJumps.forEach((b) => {
      b.classList.toggle("active", Math.abs(Number(b.dataset.jump) - state.time) < 0.5);
    });

    els.stoveBtn.setAttribute("aria-pressed", state.stove ? "true" : "false");
    powerButtons.forEach((b) => {
      b.classList.toggle("active", Math.abs(Number(b.dataset.power) - state.stovePower) < 0.01);
    });

    seasonButtons.forEach((b) => {
      const active = b.dataset.season === state.season;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", active ? "true" : "false");
    });

    weatherButtons.forEach((b) => {
      const active = b.dataset.weather === state.weather;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", active ? "true" : "false");
    });

    advanceButtons.forEach((b) => { b.disabled = state.ended; });

    els.timeHint.textContent = station1
      ? "Manual seek · drag or type"
      : "Locked · use station controls";
  }

  function updateUI() {
    const T = state.temps;
    const F = state.farm;
    const t = state.time;
    const out = Model.outdoorAt(t);
    const weather = Model.weatherText();
    const clock = formatClock(t);

    setText(els.clock, clock.hh + ":" + clock.mm);
    setText(els.clockAmPm, clock.suffix);
    setText(els.timeReadout, clock.text);
    if (!scrubbing) els.timeRange.value = String(Math.round(t));
    // Don't overwrite the field while the user is typing a time.
    if (document.activeElement !== els.timeInput) {
      els.timeInput.value = String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(Math.floor(t % 60)).padStart(2, "0");
    }

    if (els.weatherIcon) setText(els.weatherIcon, weather.icon);
    if (els.weatherLabel) setText(els.weatherLabel, weather.label);

    // Badge text follows the active station and the clock.
    let badgeText = "";
    let badgeClass = "badge";
    if (state.ended) {
      badgeText = "day complete";
      badgeClass = "badge done";
    } else if (state.station === 1 && state.running) {
      badgeText = "day running";
      badgeClass = "badge running";
    } else if (state.station === 1) {
      badgeText = "paused at " + clock.text;
    } else if (state.station === 2) {
      badgeText = "cooking lab";
      badgeClass = "badge lab";
    } else {
      badgeText = "farm lab";
      badgeClass = "badge lab";
    }
    els.liveBadge.className = badgeClass;
    setText(els.liveLabel, badgeText);

    // Stage heading and focus.
    const stationNames = ["Day cycle", "Kitchen heat", "Farm weather"];
    const stageTitles = [
      "The house through the day",
      "Cooking heat spreading through the house",
      "Season and weather on the farm",
    ];
    const focusLabels = ["FOCUS · HOUSE", "FOCUS · KITCHEN", "FOCUS · FARM"];
    setText(els.stageKicker, "Station 0" + state.station + " · " + stationNames[state.station - 1]);
    setText(els.stageTitle, stageTitles[state.station - 1]);
    setText(els.focusChip, focusLabels[state.station - 1]);
    els.focusChip.className = "stage-focus" + (state.station === 2 ? " kitchen" : state.station === 3 ? " farm" : "");

    setText(els.hudOut, tempText(out));
    setText(els.hudKitchen, tempText(T.kitchen));
    setText(els.hudFarm, tempText(F.temp));

    // Day panel.
    setText(els.dayPill, state.ended ? "complete" : state.running ? "running" : "paused");
    els.dayPill.className = "pill" + (state.running ? " on" : state.ended ? " good" : "");
    if (state.station === 1) {
      if (state.ended) {
        setText(els.dayNote, "The day is complete at 6 PM. Press Replay day or reset to 6 AM to run it again.");
      } else if (state.running) {
        setText(els.dayNote, "The day is running. The house is tracking the outdoor curve with a thermal lag. Pause or seek any hour to inspect it.");
      } else {
        setText(els.dayNote, "Paused at " + clock.text + ". Drag the manual time slider or type an hour. Seeking re-baselines the house with the stove off.");
      }
    }

    // Stove panel.
    const dKL = T.kitchen - T.living;
    const dLB = T.living - T.bedroom;
    els.stoveBtn.setAttribute("aria-pressed", state.stove ? "true" : "false");
    setText(els.stoveTitle, state.stove ? "Stove is on" : "Turn stove on");
    setText(els.stoveSub, state.stove ? "Radiating heat into the kitchen" : "Adds heat to the kitchen");
    setText(els.stoveBadge, state.stove ? "on" : "off");
    els.stoveBadge.className = "pill" + (state.stove ? " on" : "");
    setText(els.cookTime, Math.round(state.cookMinutes) + " min");
    setText(els.flowK, T.kitchen.toFixed(1) + "°");
    setText(els.flowL, T.living.toFixed(1) + "°");
    setText(els.flowB, T.bedroom.toFixed(1) + "°");

    if (state.stove) {
      setText(els.gradientReadout, "Kitchen is " + Math.abs(dKL).toFixed(1) + "° warmer than the living room. Heat is moving through the kitchen doorway.");
    } else if (dKL > 0.2) {
      setText(els.gradientReadout, "Stove off. The kitchen is still " + dKL.toFixed(1) + "° warmer as stored heat bleeds into the living room.");
    } else {
      setText(els.gradientReadout, "Rooms are within " + Math.abs(dKL).toFixed(1) + "° of each other. Turn the stove on and advance time to build a gradient.");
    }

    if (state.ended) {
      setText(els.stoveNote, "The day is complete at 6 PM. Press Reset 6 AM to run another cooking test.");
    } else if (state.stove) {
      setText(els.stoveNote, "Burner power is " + Math.round(state.stovePower * 100) + "%. Advance 10–30 minutes and watch the kitchen pull ahead, then the living room and bedroom follow.");
    } else if (dKL > 0.2) {
      setText(els.stoveNote, "Stove off. The kitchen is still " + dKL.toFixed(1) + "° above the living room and the doorway flow continues until the rooms equalise.");
    } else {
      setText(els.stoveNote, "Stove off. Room temperatures are following the outdoor curve. Turn it on, then advance time to see the plume build.");
    }

    // Farm panel.
    setText(els.seasonPill, state.season);
    els.seasonPill.className = "pill" + (state.season === "rainy" ? " rain" : "");
    setText(els.farmStatus, Model.statusText());
    setText(els.moistVal, Math.round(F.moisture) + "%");
    setText(els.growthVal, F.growth.toFixed(0) + "%");
    setText(els.stressVal, Math.round(F.stress) + "%");
    els.moistBar.style.width = clamp(F.moisture, 0, 100) + "%";
    els.growthBar.style.width = clamp(F.growth, 0, 100) + "%";
    els.stressBar.style.width = clamp(F.stress, 0, 100) + "%";

    if (state.ended) {
      setText(els.farmNote, "The day is complete at 6 PM. Press Reset 6 AM to run another weather test.");
    } else if (state.weather === "rain") {
      setText(els.farmNote, "Rain is active. The air cools immediately; soil moisture and canopy temperature move gradually as time advances.");
    } else if (state.weather === "sun") {
      setText(els.farmNote, "Intense sun is active. Canopy temperature rises quickly, soil moisture falls, and heat stress can accumulate if the plot is already dry.");
    } else if (state.season === "rainy") {
      setText(els.farmNote, "Rainy-season baseline: overcast, humid and lightly drizzling. The soil starts wet and heat stress stays low.");
    } else {
      setText(els.farmNote, "Summer baseline: clear and warm. The soil starts on the dry side; use intense sun or rain to push the plot in either direction.");
    }

    // Live readings.
    setReading(els.readKitchen, T.kitchen, out);
    setReading(els.readLiving, T.living, out);
    setReading(els.readBedroom, T.bedroom, out);
    setReading(els.readOut, out, out, "baseline");
    setReading(els.readFarm, F.temp, out);
    setText(els.readPill, state.season === "summer" ? "summer" : "rainy");

    // Temperature scale markers.
    setMarker(els.markerKitchen, T.kitchen);
    setMarker(els.markerOut, out);
    setMarker(els.markerFarm, F.temp);

    syncControls();
  }

  function refresh() {
    updateUI();
    Charts.draw();
  }

  function seek(minutes) {
    Model.seekTo(minutes);
    refresh();
  }

  function advanceBy(minutes) {
    if (state.ended) return;
    Model.advance(minutes);
    Model.markStation(state.station);
    refresh();
  }

  function switchStation(n) {
    Model.switchStation(n);
    refresh();
  }

  function playPause() {
    if (state.ended) {
      Model.resetDay();
      Model.setRunning(true);
    } else if (state.station !== 1) {
      return;
    } else {
      Model.setRunning(!state.running);
    }
    refresh();
  }

  // ---------------------------------------------------------------- events
  els.playBtn.addEventListener("click", playPause);

  els.resetBtn.addEventListener("click", () => {
    Model.resetDay();
    refresh();
  });

  els.windowBtn.addEventListener("click", () => {
    if (state.station !== 1) return;
    Model.toggleWindows();
    refresh();
  });

  speedButtons.forEach((b) => {
    b.addEventListener("click", () => {
      if (state.station !== 1) return;
      state.speed = Number(b.dataset.speed);
      refresh();
    });
  });

  stationTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchStation(Number(tab.dataset.station)));
  });

  quickJumps.forEach((b) => {
    b.addEventListener("click", () => {
      if (state.station !== 1) return;
      seek(Number(b.dataset.jump));
    });
  });

  els.timeRange.addEventListener("pointerdown", () => { scrubbing = true; });
  window.addEventListener("pointerup", () => { scrubbing = false; });
  window.addEventListener("pointercancel", () => { scrubbing = false; });

  els.timeRange.addEventListener("input", () => {
    if (state.station !== 1) return;
    seek(Number(els.timeRange.value));
  });

  els.timeApply.addEventListener("click", () => {
    if (state.station !== 1) return;
    const parsed = parseTime(els.timeInput.value);
    if (parsed === null) return;
    seek(clamp(parsed, Model.START, Model.END));
  });

  els.timeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      els.timeApply.click();
    }
  });

  panelActions.forEach((b) => {
    b.addEventListener("click", () => {
      if (b.dataset.action === "play") {
        if (state.ended) {
          Model.resetDay();
          Model.setRunning(true);
        } else {
          Model.setRunning(true);
        }
      } else {
        Model.setRunning(false);
      }
      refresh();
    });
  });

  els.stoveBtn.addEventListener("click", () => {
    Model.setStove(!state.stove);
    refresh();
  });

  powerButtons.forEach((b) => {
    b.addEventListener("click", () => {
      Model.setStovePower(Number(b.dataset.power));
      refresh();
    });
  });

  advanceButtons.forEach((b) => {
    b.addEventListener("click", () => {
      advanceBy(Number(b.dataset.advance));
    });
  });

  seasonButtons.forEach((b) => {
    b.addEventListener("click", () => {
      Model.setSeason(b.dataset.season);
      refresh();
    });
  });

  weatherButtons.forEach((b) => {
    b.addEventListener("click", () => {
      Model.setWeather(b.dataset.weather);
      refresh();
    });
  });

  if (els.resetFarmBtn) {
    els.resetFarmBtn.addEventListener("click", () => {
      Model.resetFarm();
      refresh();
    });
  }

  nextButtons.forEach((b) => {
    b.addEventListener("click", () => switchStation(Number(b.dataset.next)));
  });

  window.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
    if (e.code === "Space") {
      e.preventDefault();
      playPause();
    } else if (e.key === "s" || e.key === "S") {
      if (state.station === 2) {
        Model.setStove(!state.stove);
        refresh();
      }
    }
  });

  // ---------------------------------------------------------------- boot
  Scene.init(els.scene);
  Charts.init(els.houseChart, els.farmChart);

  Model.resetDay();
  Model.switchStation(1);
  refresh();

  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => {
      Scene.resize();
      Charts.resize();
      Charts.draw();
    });
    ro.observe(els.scene);
    ro.observe(els.houseChart);
    ro.observe(els.farmChart);
  } else {
    window.addEventListener("resize", () => {
      Scene.resize();
      Charts.resize();
      Charts.draw();
    });
  }

  let lastFrame = performance.now();
  let uiClock = 0;
  let chartClock = 0;

  function frame(now) {
    let dt = (now - lastFrame) / 1000;
    lastFrame = now;
    if (!(dt >= 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;

    if (state.running && state.station === 1 && !state.ended) {
      Model.advance(dt * Model.BASE_RATE * state.speed);
    }

    Scene.draw(now / 1000, dt);

    uiClock += dt;
    if (uiClock > 0.08) {
      updateUI();
      uiClock = 0;
    }

    chartClock += dt;
    if (chartClock > 0.14) {
      Charts.draw();
      chartClock = 0;
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame((t) => {
    lastFrame = t;
    requestAnimationFrame(frame);
  });

  window.__heatLab = { state, Model, Scene, Charts, refresh, seek, advanceBy, switchStation };
})();
