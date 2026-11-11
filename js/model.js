/* Lumped-capacitance house + farm model and the station state machine. */
(function () {
  "use strict";

  const { clamp, mix } = window.HeatUtil;

  const START = 360;              // 6 AM in simulated minutes
  const END = 1080;               // 6 PM
  const SAMPLE_EVERY = 2;         // simulated minutes between chart samples
  const BASE_RATE = 8;            // simulated minutes per real second at 1x

  const MODEL = {
    capacity: { kitchen: 2.2, living: 3.2, bedroom: 2.8 },
    uOut: { kitchen: 0.045, living: 0.060, bedroom: 0.052 },
    uKL: 0.070,                   // kitchen <-> living doorway
    uLB: 0.050,                   // living <-> bedroom doorway
    solar: { kitchen: 0.05, living: 0.12, bedroom: 0.10 },
    stove: 0.42,                  // heat load at full power
    windowVent: 2.2,              // outdoor exchange multiplier with windows open
    windowMix: 1.5,               // room-to-room mixing multiplier with windows open
  };

  const PRESETS = {
    summer: {
      temps: { kitchen: 24.0, living: 23.7, bedroom: 24.2 },
      farm: { temp: 23.2, moisture: 38, growth: 22, stress: 0 },
    },
    rainy: {
      temps: { kitchen: 22.6, living: 22.4, bedroom: 22.8 },
      farm: { temp: 21.4, moisture: 76, growth: 36, stress: 0 },
    },
  };

  const state = {
    station: 1,
    visited: { 1: true, 2: false, 3: false },
    time: START,
    running: false,
    ended: false,
    speed: 1,
    season: "summer",
    weather: "clear",             // clear | sun | rain
    windows: false,
    stove: false,
    stovePower: 1,
    stoveLevel: 0,
    cookMinutes: 0,
    rain: 0,
    temps: { ...PRESETS.summer.temps },
    farm: { ...PRESETS.summer.farm },
    history: [],
    nextSample: START + SAMPLE_EVERY,
  };

  // ---------------------------------------------------------------- weather
  function warmAt(minutes) {
    // Peaks just after midday and falls toward evening.
    return Math.sin(Math.PI * clamp((minutes / 60 - 6) / 13.2, 0, 1));
  }

  function solarAt(minutes) {
    // Sun elevation: zero at 6 AM and 6 PM, one at noon.
    return Math.sin(Math.PI * clamp((minutes - START) / (END - START), 0, 1));
  }

  function rainTarget() {
    if (state.weather === "rain") return 0.9;
    if (state.season === "rainy" && state.weather === "clear") return 0.12;
    return 0;
  }

  function sunFactor() {
    if (state.weather === "sun") return state.season === "summer" ? 1.2 : 0.8;
    if (state.weather === "rain") return 0.22;
    return state.season === "summer" ? 1 : 0.35;
  }

  function outdoorAt(minutes) {
    const warm = warmAt(minutes);
    let out = state.season === "summer"
      ? 24.0 + 10.5 * warm
      : 21.3 + 4.8 * warm;
    if (state.weather === "sun") out += state.season === "summer" ? 6.5 : 4.5;
    out -= 2.8 * state.rain;
    return out;
  }

  function weatherText() {
    if (state.weather === "rain") {
      return {
        label: state.season === "summer" ? "Unseasonal shower" : "Rain showers",
        icon: "🌧",
        sky: "Rain",
      };
    }
    if (state.weather === "sun") {
      return {
        label: state.season === "summer" ? "Intense sun / heatwave" : "Monsoon-break sun",
        icon: "☀",
        sky: "Intense sun",
      };
    }
    if (state.season === "rainy") {
      return { label: "Overcast with drizzle", icon: "☁", sky: "Overcast" };
    }
    return { label: "Clear and warm", icon: "☀", sky: "Clear" };
  }

  // ---------------------------------------------------------------- colour
  const TEMP_STOPS = [
    [0.00, [61, 123, 214]],
    [0.18, [76, 201, 240]],
    [0.33, [127, 227, 176]],
    [0.50, [255, 224, 102]],
    [0.68, [255, 171, 74]],
    [0.84, [255, 107, 61]],
    [1.00, [255, 47, 74]],
  ];

  function tempColor(t) {
    const x = clamp((t - 15) / (45 - 15), 0, 1);
    for (let i = 0; i < TEMP_STOPS.length - 1; i++) {
      const a = TEMP_STOPS[i];
      const b = TEMP_STOPS[i + 1];
      if (x >= a[0] && x <= b[0]) {
        return mix(a[1], b[1], (x - a[0]) / Math.max(1e-6, b[0] - a[0]));
      }
    }
    return TEMP_STOPS[TEMP_STOPS.length - 1][1];
  }

  function healthColor(health) {
    const dry = [201, 162, 39];
    const good = [87, 190, 108];
    const bad = [150, 116, 62];
    if (health > 0.55) return mix(dry, good, clamp((health - 0.55) / 0.45, 0, 1));
    return mix(bad, dry, clamp(health / 0.55, 0, 1));
  }

  function farmHealth() {
    const F = state.farm;
    return clamp(1 - F.stress / 140 - Math.max(0, 20 - F.moisture) / 60, 0.25, 1);
  }

  // ---------------------------------------------------------------- physics
  function stepPhysics(dt) {
    const t = state.time;
    const T = state.temps;
    const F = state.farm;

    // Weather changes are smoothed over roughly two simulated minutes.
    const rTarget = rainTarget();
    state.rain += (rTarget - state.rain) * (1 - Math.exp(-dt / 2));

    const out = outdoorAt(t);
    const solar = solarAt(t);
    const sun = sunFactor();
    const cloud = 1 - 0.55 * state.rain;
    const vent = state.windows ? MODEL.windowVent : 1;
    const mixF = state.windows ? MODEL.windowMix : 1;

    let qk = (out - T.kitchen) * MODEL.uOut.kitchen * vent;
    let ql = (out - T.living) * MODEL.uOut.living * vent;
    let qb = (out - T.bedroom) * MODEL.uOut.bedroom * vent;

    qk += MODEL.solar.kitchen * solar * sun * cloud;
    ql += MODEL.solar.living * solar * sun * cloud;
    qb += MODEL.solar.bedroom * solar * sun * cloud;

    const kl = (T.living - T.kitchen) * MODEL.uKL * mixF;
    qk += kl;
    ql -= kl;

    const lb = (T.bedroom - T.living) * MODEL.uLB * mixF;
    ql += lb;
    qb -= lb;

    // Stove: a power-scaled local heat load with a short thermal ramp.
    const target = state.stove ? state.stovePower : 0;
    state.stoveLevel += (target - state.stoveLevel) * (1 - Math.exp(-dt / 1.5));
    qk += MODEL.stove * state.stoveLevel;
    if (state.stove) state.cookMinutes += dt;

    T.kitchen = clamp(T.kitchen + (qk / MODEL.capacity.kitchen) * dt, 5, 60);
    T.living = clamp(T.living + (ql / MODEL.capacity.living) * dt, 5, 60);
    T.bedroom = clamp(T.bedroom + (qb / MODEL.capacity.bedroom) * dt, 5, 60);

    // Farm canopy, soil water balance, growth and heat stress.
    const effSolar = solar * sun * cloud;
    const evap = (0.30 + 0.70 * clamp(F.moisture / 100, 0, 1)) *
      (state.season === "summer" ? 1.5 : 2.2);
    const canopyTarget = out +
      effSolar * (state.season === "summer" ? 6.0 : 2.2) -
      evap * (0.4 + 0.6 * solar) -
      state.rain * 1.5;
    F.temp += (canopyTarget - F.temp) * (1 - Math.exp(-dt / 8));
    F.temp = clamp(F.temp, 5, 55);

    const gain = state.rain * 0.24;
    const loss = (state.season === "summer" ? 0.016 : 0.010) +
      0.018 * solar +
      0.0004 * Math.max(0, F.temp - 32) +
      (state.weather === "sun" ? 0.006 : 0);
    F.moisture = clamp(F.moisture + (gain - loss) * dt, 0, 100);

    const moistureFactor = clamp(1 - Math.abs(F.moisture - 65) / 55, 0.05, 1);
    const tempFactor = clamp(1 - Math.max(0, F.temp - 31) / 12, 0.05, 1);
    const stressFactor = clamp(1 - F.stress / 100, 0.05, 1);
    F.growth = clamp(F.growth + 0.018 * moistureFactor * tempFactor * stressFactor * dt, 0, 100);

    const stressRate = (F.temp > 32 ? (F.temp - 32) * 0.022 : 0) +
      (F.moisture < 20 ? (20 - F.moisture) * 0.012 : 0);
    if (stressRate > 0) {
      F.stress = clamp(F.stress + stressRate * dt, 0, 100);
    } else {
      F.stress = clamp(F.stress - 0.035 * dt, 0, 100);
    }
  }

  function sample() {
    state.history.push({
      t: state.time,
      kitchen: state.temps.kitchen,
      living: state.temps.living,
      bedroom: state.temps.bedroom,
      out: outdoorAt(state.time),
      farm: state.farm.temp,
      moisture: state.farm.moisture,
      growth: state.farm.growth,
      stress: state.farm.stress,
      stove: state.stoveLevel > 0.1,
      rain: state.rain,
    });
    if (state.history.length > 1400) state.history.shift();
  }

  function advance(dtSim) {
    if (!(dtSim > 0) || state.ended || state.time >= END) return;
    let remaining = dtSim;
    let guard = 0;
    while (remaining > 0.0001 && state.time < END && guard++ < 20000) {
      const step = Math.min(0.25, remaining, END - state.time);
      stepPhysics(step);
      state.time += step;
      remaining -= step;
      if (state.time >= state.nextSample - 0.001) {
        sample();
        state.nextSample = state.time + SAMPLE_EVERY;
      }
    }
    if (state.time >= END) {
      state.time = END;
      state.running = false;
      state.ended = true;
      const last = state.history[state.history.length - 1];
      if (!last || last.t < END - 0.5) sample();
    }
  }

  function resetCore(season, weather) {
    state.season = season;
    state.weather = weather;
    state.temps = { ...PRESETS[season].temps };
    state.farm = { ...PRESETS[season].farm };
    state.stove = false;
    state.stoveLevel = 0;
    state.cookMinutes = 0;
    state.rain = rainTarget();
    state.time = START;
    state.history = [];
    state.nextSample = START;
    state.ended = false;
    state.running = false;
    sample();
    state.nextSample = START + SAMPLE_EVERY;
  }

  function rebuildAt(target) {
    const t = clamp(target, START, END);
    resetCore(state.season, state.weather);
    if (t > START) advance(t - START);
    state.time = t;
    state.running = false;
    state.ended = t >= END;
    if (!state.history.length || state.history[state.history.length - 1].t < t - 0.5) sample();
  }

  // ---------------------------------------------------------------- commands
  function markStation(n) {
    if (n >= 1 && n <= 3) state.visited[n] = true;
  }

  function switchStation(n) {
    const next = clamp(Math.round(n), 1, 3);

    // Keep stages isolated: the active driver is switched off when you leave
    // its station. The day, season and stored temperatures still carry over.
    if (state.station === 2 && next !== 2) {
      state.stove = false;
      state.stoveLevel = 0;
      state.cookMinutes = 0;
    }
    if (state.station === 3 && next !== 3) {
      state.weather = "clear";
      state.rain = rainTarget();
    }

    state.station = next;
    if (state.station !== 1) state.running = false;
    markStation(state.station);
    return state.station;
  }

  function setRunning(on) {
    if (state.station !== 1) return false;
    if (state.ended) return false;
    state.running = !!on;
    return state.running;
  }

  function seekTo(minutes) {
    rebuildAt(minutes);
    markStation(1);
  }

  function resetDay() {
    state.windows = false;
    state.weather = "clear";
    rebuildAt(START);
    markStation(state.station);
  }

  function setSeason(season) {
    if (!PRESETS[season] || season === state.season) return;
    const target = state.time;
    state.season = season;
    state.weather = "clear";
    rebuildAt(target);
    markStation(3);
  }

  function setWeather(weather) {
    if (!["clear", "sun", "rain"].includes(weather)) return;
    state.weather = weather;
    state.rain = rainTarget();
    markStation(3);
  }

  function setStove(on) {
    state.stove = !!on;
    markStation(2);
  }

  function setStovePower(power) {
    state.stovePower = clamp(Number(power) || 1, 0.4, 1.8);
    markStation(2);
  }

  function resetStove() {
    state.stove = false;
    state.stoveLevel = 0;
    state.cookMinutes = 0;
    markStation(2);
  }

  function resetFarm() {
    state.farm = { ...PRESETS[state.season].farm };
    state.rain = rainTarget();
    markStation(3);
  }

  function toggleWindows() {
    state.windows = !state.windows;
    markStation(1);
  }

  function statusText() {
    const F = state.farm;
    if (state.weather === "rain") {
      return state.season === "summer"
        ? "An unseasonal shower is cooling the canopy and soaking the beds. Growth picks up while heat stress eases."
        : "Steady rain is recharging the soil. The canopy is cooling and heat stress is falling.";
    }
    if (state.weather === "sun") {
      return state.season === "summer"
        ? "Intense sun is driving canopy temperature and water loss. Watch soil moisture fall and heat stress climb."
        : "A monsoon break brings strong sun to the wet plot. The canopy warms quickly even though the soil is still damp.";
    }
    if (state.season === "rainy") {
      return F.moisture > 82
        ? "Saturated soil and mild air: steady growth with very little heat stress."
        : "Overcast and humid. The crops are growing steadily with low heat stress.";
    }
    if (F.stress > 45) return "Heat stress is high — leaves are wilting and growth has stalled.";
    if (F.moisture < 25) return "The soil is drying out. Without rain, growth is slowing.";
    if (F.temp > 36) return "The canopy is running hot in the summer sun. Watch the stress meter climb.";
    return "Crops are holding up in the summer sun.";
  }

  window.HeatModel = {
    START,
    END,
    BASE_RATE,
    SAMPLE_EVERY,
    MODEL,
    PRESETS,
    state,
    warmAt,
    solarAt,
    rainTarget,
    sunFactor,
    outdoorAt,
    weatherText,
    tempColor,
    healthColor,
    farmHealth,
    statusText,
    advance,
    sample,
    rebuildAt,
    seekTo,
    resetDay,
    setSeason,
    setWeather,
    setStove,
    setStovePower,
    resetStove,
    resetFarm,
    toggleWindows,
    switchStation,
    setRunning,
    markStation,
  };
})();
