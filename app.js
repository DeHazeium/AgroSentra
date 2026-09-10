import {
  database
} from "./firebase-config.js";

import {
  ref,
  onValue,
  query,
  orderByChild,
  limitToLast
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

import {
  analyseSoil,
  isFiniteNumber
} from "./analytics.js";

import {
  fetchEnvironmentalContext,
  classifyRain,
  contextRelations,
  validCoordinate
} from "./external-context.js";

lucide.createIcons();


/* =======================================
   DOM
======================================= */

const elements = {
  voltage: document.getElementById("voltage"),
  current: document.getElementById("current"),
  temperature: document.getElementById("temperature"),
  moisture: document.getElementById("moisture"),
  ph: document.getElementById("ph"),
  ec: document.getElementById("ec"),
  nitrogen: document.getElementById("nitrogen"),
  phosphorus: document.getElementById("phosphorus"),
  potassium: document.getElementById("potassium"),
  salinity: document.getElementById("salinity")
};

const analyticsElements = {
  window: document.getElementById("analyticsWindow"),
  score: document.getElementById("analyticsScore"),
  scoreRing: document.getElementById("analyticsScoreRing"),
  status: document.getElementById("analysisStatus"),
  statusSub: document.getElementById("analysisStatusSub"),
  moistureTrend: document.getElementById("moistureTrend"),
  moistureTrendDetail: document.getElementById("moistureTrendDetail"),
  phTrend: document.getElementById("phTrend"),
  phTrendDetail: document.getElementById("phTrendDetail"),
  nutrientBalance: document.getElementById("nutrientBalance"),
  nutrientBalanceDetail: document.getElementById("nutrientBalanceDetail"),
  salinityRisk: document.getElementById("salinityRisk"),
  salinityRiskDetail: document.getElementById("salinityRiskDetail"),
  anomalyState: document.getElementById("anomalyState"),
  anomalyDetail: document.getElementById("anomalyDetail"),
  sampleCount: document.getElementById("historySampleCount"),
  coverage: document.getElementById("historyCoverage"),
  confidence: document.getElementById("insightConfidence"),
  insight: document.getElementById("analyticsInsight"),

  flags: document.getElementById("insightFlags")
};

const contextElements = {
  syncBadge: document.getElementById("contextSyncBadge"),
  openLocationButton: document.getElementById("openLocationButton"),
  locationButtonLabel: document.getElementById("locationButtonLabel"),
  monitoringLocation: document.getElementById("monitoringLocation"),
  coordinates: document.getElementById("contextCoordinates"),
  updated: document.getElementById("contextUpdated"),
  rainfall6h: document.getElementById("rainfall6h"),
  rainfallInterpretation: document.getElementById("rainfallInterpretation"),
  airTemperature: document.getElementById("externalAirTemperature"),
  humidity: document.getElementById("externalHumidity"),
  humidityInterpretation: document.getElementById("humidityInterpretation"),
  modelSoilTemperature: document.getElementById("modelSoilTemperature"),
  modelSoilMoisture: document.getElementById("modelSoilMoisture"),
  weatherState: document.getElementById("weatherContextState"),
  weatherDetail: document.getElementById("weatherContextDetail"),
  moistureRelation: document.getElementById("moistureWeatherRelation"),
  moistureRelationDetail: document.getElementById("moistureWeatherRelationDetail"),
  temperatureRelation: document.getElementById("temperatureRelation"),
  temperatureRelationDetail: document.getElementById("temperatureRelationDetail"),
  confidence: document.getElementById("environmentConfidence"),
  confidenceDetail: document.getElementById("environmentConfidenceDetail"),

  modal: document.getElementById("locationModal"),
  closeButton: document.getElementById("closeLocationButton"),
  currentLocationButton: document.getElementById("useCurrentLocationButton"),
  latitudeInput: document.getElementById("latitudeInput"),
  longitudeInput: document.getElementById("longitudeInput"),
  locationNameInput: document.getElementById("locationNameInput"),
  error: document.getElementById("locationError"),
  clearButton: document.getElementById("clearLocationButton"),
  saveButton: document.getElementById("saveLocationButton")
};


/* =======================================
   HELPERS
======================================= */

function validNumber(value) {
  return isFiniteNumber(value);
}

function format(value, decimalPlaces = 1) {
  if (!validNumber(value)) {
    return "--";
  }

  return Number(value).toFixed(decimalPlaces);
}

function formatUptime(ms) {
  if (!validNumber(ms)) {
    return "--";
  }

  const seconds = Math.floor(Number(ms) / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function clearStateClasses(element) {
  element.classList.remove(
    "trend-up",
    "trend-down",
    "trend-stable",
    "state-good",
    "state-warning",
    "state-danger"
  );
}


/* =======================================
   LIVE CHART
======================================= */

const chartCanvas =
  document.getElementById("sensorChart");

const sensorChart =
  new Chart(chartCanvas, {
    type: "line",

    data: {
      labels: [],

      datasets: [
        {
          label: "Temperature °C",
          data: [],
          borderColor: "#46f28b",
          backgroundColor: "#46f28b",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.35
        },
        {
          label: "Moisture %",
          data: [],
          borderColor: "#328cff",
          backgroundColor: "#328cff",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.35
        },
        {
          label: "pH",
          data: [],
          borderColor: "#a75cff",
          backgroundColor: "#a75cff",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.35
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      animation: {
        duration: 250
      },

      interaction: {
        intersect: false,
        mode: "index"
      },

      plugins: {
        legend: {
          position: "bottom",

          labels: {
            color: "#788995",
            usePointStyle: true,
            boxWidth: 7,
            padding: 18,

            font: {
              size: 10
            }
          }
        }
      },

      scales: {
        x: {
          ticks: {
            color: "#536571",
            maxTicksLimit: 7,

            font: {
              size: 9
            }
          },

          grid: {
            color: "rgba(255,255,255,.035)"
          },

          border: {
            color: "rgba(255,255,255,.06)"
          }
        },

        y: {
          ticks: {
            color: "#536571",

            font: {
              size: 9
            }
          },

          grid: {
            color: "rgba(255,255,255,.035)"
          },

          border: {
            color: "rgba(255,255,255,.06)"
          }
        }
      }
    }
  });

let lastChartTimestamp = null;

function addChartReading(data) {
  if (
    !validNumber(data.temperature) ||
    !validNumber(data.moisture) ||
    !validNumber(data.ph)
  ) {
    return;
  }

  const updateKey =
    validNumber(data.timestamp)
      ? Number(data.timestamp)
      : Date.now();

  // Prevent the same Firebase snapshot being plotted more than once.
  if (updateKey === lastChartTimestamp) {
    return;
  }

  lastChartTimestamp = updateKey;

  const label =
    new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });

  sensorChart.data.labels.push(label);
  sensorChart.data.datasets[0].data.push(Number(data.temperature));
  sensorChart.data.datasets[1].data.push(Number(data.moisture));
  sensorChart.data.datasets[2].data.push(Number(data.ph));

  const maxPoints = 40;

  while (sensorChart.data.labels.length > maxPoints) {
    sensorChart.data.labels.shift();

    sensorChart.data.datasets.forEach(dataset => {
      dataset.data.shift();
    });
  }

  sensorChart.update("none");
}


/* =======================================
   LIVE VALUES
======================================= */

function updateSensorValues(data) {
  elements.voltage.textContent =
    format(data.voltage, 2);

  elements.current.textContent =
    format(data.current, 1);

  elements.temperature.textContent =
    format(data.temperature, 1);

  elements.moisture.textContent =
    format(data.moisture, 1);

  elements.ph.textContent =
    format(data.ph, 1);

  elements.ec.textContent =
    format(data.ec, 0);

  elements.nitrogen.textContent =
    format(data.nitrogen, 0);

  elements.phosphorus.textContent =
    format(data.phosphorus, 0);

  elements.potassium.textContent =
    format(data.potassium, 0);

  elements.salinity.textContent =
    format(data.salinity, 0);

  document.getElementById("quickTemperature").textContent =
    `${format(data.temperature, 1)} °C`;

  document.getElementById("quickMoisture").textContent =
    `${format(data.moisture, 1)} %`;

  document.getElementById("quickPh").textContent =
    format(data.ph, 1);

  document.getElementById("quickEc").textContent =
    `${format(data.ec, 0)} µS/cm`;

  document.getElementById("rssi").textContent =
    validNumber(data.rssi)
      ? `${data.rssi} dBm`
      : "--";

  document.getElementById("uptime").textContent =
    formatUptime(data.uptime_ms);
}


/* =======================================
   HARDWARE STATUS
======================================= */

function updateHardwareStatus(data) {
  const soil =
    document.getElementById("soilStatus");

  const power =
    document.getElementById("powerStatus");

  soil.textContent =
    data.soil_ok === false
      ? "Probe Error"
      : "Online";

  power.textContent =
    data.power_ok === false
      ? "INA219 Error"
      : "Online";
}


/* =======================================
   SIMPLE LIVE HEALTH INDICATOR
======================================= */

function calculateHealth(data) {
  let score = 100;

  const moisture = Number(data.moisture);
  const ph = Number(data.ph);
  const temperature = Number(data.temperature);
  const ec = Number(data.ec);

  if (validNumber(moisture)) {
    if (moisture < 30 || moisture > 80) {
      score -= 20;
    }
  }

  if (validNumber(ph)) {
    if (ph < 5.5 || ph > 7.5) {
      score -= 25;
    }
  }

  if (validNumber(temperature)) {
    if (temperature < 15 || temperature > 35) {
      score -= 15;
    }
  }

  if (validNumber(ec)) {
    if (ec > 2000) {
      score -= 15;
    }
  }

  return Math.max(0, Math.min(100, score));
}

function updateHealth(data) {
  const score = calculateHealth(data);

  const scoreElement =
    document.getElementById("healthScore");

  const badge =
    document.getElementById("healthBadge");

  const message =
    document.getElementById("healthMessage");

  const ring =
    document.getElementById("healthRing");

  scoreElement.textContent = score;

  ring.style.background =
    `conic-gradient(
      #46f28b ${score}%,
      rgba(255,255,255,.05) ${score}%
    )`;

  if (score >= 80) {
    badge.textContent = "Healthy";
    message.textContent =
      "Current monitored soil conditions are within the preferred prototype range.";
  } else if (score >= 60) {
    badge.textContent = "Attention";
    message.textContent =
      "Some monitored soil parameters are outside the preferred prototype range.";
  } else {
    badge.textContent = "Warning";
    message.textContent =
      "Multiple monitored soil parameters require attention.";
  }
}


/* =======================================
   STAGE 1 + STAGE 2 ANALYTICS
======================================= */

let currentLiveData = null;
let historicalSamples = [];

let environmentalContext = null;
let monitoringLocation = null;
let externalRefreshTimer = null;

const LOCATION_STORAGE_KEY = "agrosentra-monitoring-location-v1";
const EXTERNAL_REFRESH_MS = 10 * 60 * 1000;

const DEFAULT_LOCATION = {
  latitude: 1.560,
  longitude: 110.345,
  label: "The Waterfront Hotel, Kuching",
  source: "default"
};

function historyCoverageText(samples) {
  if (!samples.length) {
    return "No historical data yet";
  }

  const timestamps =
    samples
      .map(sample => Number(sample.timestamp))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

  if (timestamps.length < 2) {
    return "1 historical sample available";
  }

  const seconds =
    timestamps[timestamps.length - 1] -
    timestamps[0];

  const minutes =
    Math.max(0, Math.round(seconds / 60));

  if (minutes >= 1440) {
    return `${(minutes / 1440).toFixed(1)} days of data`;
  }

  if (minutes >= 60) {
    return `${(minutes / 60).toFixed(1)} hours of data`;
  }

  return `${minutes} minutes of data`;
}

function applyTrendDisplay(
  valueElement,
  detailElement,
  trendDisplay
) {
  clearStateClasses(valueElement);

  valueElement.textContent =
    trendDisplay.label;

  detailElement.textContent =
    trendDisplay.detail;

  if (trendDisplay.className) {
    valueElement.classList.add(
      trendDisplay.className
    );
  }
}

function renderAnalytics() {
  if (!currentLiveData) {
    return;
  }

  const windowMinutes =
    Number(analyticsElements.window.value);

  const result =
    analyseSoil(
      currentLiveData,
      historicalSamples,
      windowMinutes
    );

  analyticsElements.score.textContent =
    result.score;

  analyticsElements.scoreRing.style.background =
    `conic-gradient(
      #46f28b ${result.score}%,
      rgba(255,255,255,.05) ${result.score}%
    )`;

  clearStateClasses(
    analyticsElements.status
  );

  analyticsElements.status.textContent =
    result.status;

  analyticsElements.status.classList.add(
    result.statusClass
  );

  analyticsElements.statusSub.textContent =
    result.statusSub;

  applyTrendDisplay(
    analyticsElements.moistureTrend,
    analyticsElements.moistureTrendDetail,
    result.moistureDisplay
  );

  applyTrendDisplay(
    analyticsElements.phTrend,
    analyticsElements.phTrendDetail,
    result.phDisplay
  );

  analyticsElements.nutrientBalance.textContent =
    result.nutrients.label;

  analyticsElements.nutrientBalanceDetail.textContent =
    result.nutrients.detail;

  analyticsElements.salinityRisk.textContent =
    result.salinity.label;

  analyticsElements.salinityRiskDetail.textContent =
    result.salinity.detail;

  const anomalyEntries =
    Object.entries(result.anomalies)
      .filter(([, anomaly]) => anomaly.anomalous);

  if (result.sampleCount < 5) {
    analyticsElements.anomalyState.textContent =
      "Learning";

    analyticsElements.anomalyDetail.textContent =
      "At least 5 history samples recommended";
  } else if (!anomalyEntries.length) {
    analyticsElements.anomalyState.textContent =
      "Normal";

    analyticsElements.anomalyDetail.textContent =
      "Latest values follow recent baseline";
  } else {
    analyticsElements.anomalyState.textContent =
      `${anomalyEntries.length} detected`;

    analyticsElements.anomalyDetail.textContent =
      anomalyEntries
        .map(([field]) => {
          const names = {
            moisture: "moisture",
            ph: "pH",
            temperature: "temperature",
            ec: "EC",
            salinity: "salinity"
          };

          return names[field] || field;
        })
        .join(", ");
  }

  analyticsElements.sampleCount.textContent =
    result.sampleCount;

  analyticsElements.coverage.textContent =
    historyCoverageText(
      result.samples
    );

  analyticsElements.confidence.textContent =
    `Baseline: ${result.confidence.label}`;

  const relations =
    contextRelations(
      currentLiveData,
      result,
      environmentalContext
    );

  let combinedInsight =
    result.insight;

  if (relations.sentence) {
    combinedInsight +=
      " " +
      relations.sentence;
  }

  analyticsElements.insight.textContent =
    combinedInsight;

  analyticsElements.flags.innerHTML =
    "";

  const allFlags = [
    ...result.flags,
    ...relations.flags
  ];

  const uniqueFlags = [];

  for (const flag of allFlags) {
    if (!uniqueFlags.some(item => item.text === flag.text)) {
      uniqueFlags.push(flag);
    }
  }

  uniqueFlags
    .slice(0, 8)
    .forEach(flag => {
      const chip =
        document.createElement("span");

      chip.className =
        `insight-chip ${flag.level}`;

      chip.textContent =
        flag.text;

      analyticsElements.flags
        .appendChild(chip);
    });

  renderContextRelations(relations);
}
analyticsElements.window.addEventListener(
  "change",
  renderAnalytics
);


/* =======================================
   EXTERNAL ENVIRONMENTAL CONTEXT
======================================= */

function safeFixed(value, digits = 1) {
  return validNumber(value)
    ? Number(value).toFixed(digits)
    : "--";
}

function savedLocationFromStorage() {
  try {
    const raw =
      localStorage.getItem(
        LOCATION_STORAGE_KEY
      );

    if (!raw) return null;

    const parsed =
      JSON.parse(raw);

    if (
      validCoordinate(parsed.latitude, "latitude") &&
      validCoordinate(parsed.longitude, "longitude")
    ) {
      return parsed;
    }
  } catch (error) {
    console.warn(
      "Could not read saved AgroSentra location.",
      error
    );
  }

  return null;
}

function saveLocationToStorage(location) {
  localStorage.setItem(
    LOCATION_STORAGE_KEY,
    JSON.stringify(location)
  );
}

function removeSavedLocation() {
  localStorage.removeItem(
    LOCATION_STORAGE_KEY
  );
}

function locationFromLiveData(data) {
  if (!data) return null;

  if (
    validCoordinate(data.latitude, "latitude") &&
    validCoordinate(data.longitude, "longitude")
  ) {
    return {
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      label:
        typeof data.location_label === "string" &&
        data.location_label.trim()
          ? data.location_label.trim()
          : "Probe location",
      source: "firebase"
    };
  }

  return null;
}

function setContextBadge(state, text) {
  contextElements.syncBadge.classList.remove(
    "synced",
    "error"
  );

  if (state) {
    contextElements.syncBadge.classList.add(
      state
    );
  }

  contextElements.syncBadge.innerHTML =
    `<span class="context-sync-dot"></span>${text}`;
}

function updateLocationDisplay() {
  if (!monitoringLocation) {
    contextElements.monitoringLocation.textContent =
      "Not configured";

    contextElements.coordinates.textContent =
      "--";

    contextElements.locationButtonLabel.textContent =
      "Change Location";

    return;
  }

  contextElements.monitoringLocation.textContent =
    monitoringLocation.label ||
    "Monitoring location";

  contextElements.coordinates.textContent =
    `${Number(monitoringLocation.latitude).toFixed(5)}, ${Number(monitoringLocation.longitude).toFixed(5)}`;

  contextElements.locationButtonLabel.textContent =
    "Change Location";
}

function rainfallDescription(value) {
  if (!validNumber(value)) {
    return "Recent rainfall unavailable";
  }

  const rainfall =
    Number(value);

  if (rainfall < 0.2) {
    return "No meaningful recent rainfall";
  }

  if (rainfall < 2.5) {
    return "Light recent rainfall";
  }

  if (rainfall < 10) {
    return "Recent rainfall detected";
  }

  return "Heavy recent rainfall";
}

function humidityDescription(value) {
  if (!validNumber(value)) {
    return "Humidity unavailable";
  }

  const humidity =
    Number(value);

  if (humidity >= 85) {
    return "Very humid atmospheric conditions";
  }

  if (humidity >= 65) {
    return "Humid atmospheric conditions";
  }

  if (humidity >= 40) {
    return "Moderate atmospheric humidity";
  }

  return "Relatively dry atmospheric conditions";
}

function renderEnvironmentalContext() {
  updateLocationDisplay();

  if (!environmentalContext) {
    contextElements.rainfall6h.textContent = "--";
    contextElements.airTemperature.textContent = "--";
    contextElements.humidity.textContent = "--";
    contextElements.modelSoilTemperature.textContent = "--";
    contextElements.modelSoilMoisture.textContent = "--";
    contextElements.weatherState.textContent = "Not available";

    return;
  }

  contextElements.rainfall6h.textContent =
    safeFixed(
      environmentalContext.rainfall6h,
      1
    );

  contextElements.rainfallInterpretation.textContent =
    rainfallDescription(
      environmentalContext.rainfall6h
    );

  contextElements.airTemperature.textContent =
    safeFixed(
      environmentalContext.airTemperature,
      1
    );

  contextElements.humidity.textContent =
    safeFixed(
      environmentalContext.humidity,
      0
    );

  contextElements.humidityInterpretation.textContent =
    humidityDescription(
      environmentalContext.humidity
    );

  contextElements.modelSoilTemperature.textContent =
    safeFixed(
      environmentalContext.modelSoilTemperature,
      1
    );

  contextElements.modelSoilMoisture.textContent =
    safeFixed(
      environmentalContext.modelSoilMoisturePercent,
      1
    );

  contextElements.weatherState.textContent =
    environmentalContext.weatherLabel ||
    "Context synced";

  const precipNow =
    validNumber(environmentalContext.precipitationNow)
      ? `${Number(environmentalContext.precipitationNow).toFixed(1)} mm current precipitation`
      : "Current precipitation unavailable";

  contextElements.weatherDetail.textContent =
    precipNow;

  contextElements.updated.textContent =
    "External sync " +
    new Date(
      environmentalContext.fetchedAt
    ).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
}

function renderContextRelations(relations = null) {
  if (!relations) {
    if (!currentLiveData || !environmentalContext) {
      return;
    }

    const windowMinutes =
      Number(
        analyticsElements.window.value
      );

    const result =
      analyseSoil(
        currentLiveData,
        historicalSamples,
        windowMinutes
      );

    relations =
      contextRelations(
        currentLiveData,
        result,
        environmentalContext
      );
  }

  contextElements.moistureRelation.textContent =
    relations.moisture.label;

  contextElements.moistureRelationDetail.textContent =
    relations.moisture.detail;

  contextElements.temperatureRelation.textContent =
    relations.temperature.label;

  contextElements.temperatureRelationDetail.textContent =
    relations.temperature.detail;

  contextElements.confidence.textContent =
    relations.confidence.label;

  contextElements.confidenceDetail.textContent =
    relations.confidence.detail;
}

async function syncExternalContext(force = false) {
  if (!monitoringLocation) {
    environmentalContext = null;

    setContextBadge(
      "",
      "Awaiting location"
    );

    renderEnvironmentalContext();
    renderAnalytics();

    return;
  }

  const age =
    environmentalContext
      ? Date.now() -
        Number(environmentalContext.fetchedAt)
      : Infinity;

  if (!force &&
      environmentalContext &&
      age < EXTERNAL_REFRESH_MS) {
    return;
  }

  setContextBadge(
    "",
    "Syncing context..."
  );

  try {
    const context =
      await fetchEnvironmentalContext(
        monitoringLocation.latitude,
        monitoringLocation.longitude
      );

    environmentalContext =
      context;

    setContextBadge(
      "synced",
      "Context synced"
    );

    renderEnvironmentalContext();
    renderAnalytics();

  } catch (error) {
    console.error(
      "External environmental context error:",
      error
    );

    setContextBadge(
      "error",
      "Context unavailable"
    );

    contextElements.updated.textContent =
      "External sync failed";

    contextElements.weatherState.textContent =
      "Unavailable";

    contextElements.weatherDetail.textContent =
      "Check internet access or monitoring coordinates.";

    renderAnalytics();
  }
}

function applyMonitoringLocation(location, save = false) {
  monitoringLocation =
    location;

  if (save &&
      location?.source !== "firebase") {
    saveLocationToStorage(
      location
    );
  }

  updateLocationDisplay();
  syncExternalContext(true);

  if (externalRefreshTimer) {
    clearInterval(
      externalRefreshTimer
    );
  }

  externalRefreshTimer =
    setInterval(
      () => {
        syncExternalContext(true);
      },
      EXTERNAL_REFRESH_MS
    );
}

function openLocationModal() {
  contextElements.error.textContent =
    "";

  if (monitoringLocation) {
    contextElements.latitudeInput.value =
      monitoringLocation.latitude;

    contextElements.longitudeInput.value =
      monitoringLocation.longitude;

    contextElements.locationNameInput.value =
      monitoringLocation.label || "";
  }

  contextElements.modal.classList.add(
    "open"
  );

  contextElements.modal.setAttribute(
    "aria-hidden",
    "false"
  );
}

function closeLocationModal() {
  contextElements.modal.classList.remove(
    "open"
  );

  contextElements.modal.setAttribute(
    "aria-hidden",
    "true"
  );
}

contextElements.openLocationButton.addEventListener(
  "click",
  openLocationModal
);

contextElements.closeButton.addEventListener(
  "click",
  closeLocationModal
);

contextElements.modal.addEventListener(
  "click",
  event => {
    if (event.target === contextElements.modal) {
      closeLocationModal();
    }
  }
);

document.addEventListener(
  "keydown",
  event => {
    if (event.key === "Escape") {
      closeLocationModal();
    }
  }
);

contextElements.currentLocationButton.addEventListener(
  "click",
  () => {
    contextElements.error.textContent =
      "";

    if (!navigator.geolocation) {
      contextElements.error.textContent =
        "Geolocation is not supported by this browser.";

      return;
    }

    contextElements.currentLocationButton.disabled =
      true;

    contextElements.currentLocationButton.textContent =
      "Requesting location...";

    navigator.geolocation.getCurrentPosition(
      position => {
        contextElements.latitudeInput.value =
          position.coords.latitude.toFixed(6);

        contextElements.longitudeInput.value =
          position.coords.longitude.toFixed(6);

        contextElements.currentLocationButton.disabled =
          false;

        contextElements.currentLocationButton.innerHTML =
          '<i data-lucide="locate-fixed"></i>Use this device location';

        lucide.createIcons();
      },
      error => {
        contextElements.currentLocationButton.disabled =
          false;

        contextElements.currentLocationButton.innerHTML =
          '<i data-lucide="locate-fixed"></i>Use this device location';

        lucide.createIcons();

        contextElements.error.textContent =
          error.message ||
          "Location permission was not granted.";
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  }
);

contextElements.saveButton.addEventListener(
  "click",
  () => {
    const latitude =
      Number(
        contextElements.latitudeInput.value
      );

    const longitude =
      Number(
        contextElements.longitudeInput.value
      );

    if (!validCoordinate(latitude, "latitude")) {
      contextElements.error.textContent =
        "Enter a valid latitude between -90 and 90.";

      return;
    }

    if (!validCoordinate(longitude, "longitude")) {
      contextElements.error.textContent =
        "Enter a valid longitude between -180 and 180.";

      return;
    }

    const label =
      contextElements.locationNameInput.value.trim() ||
      "Monitoring site";

    const location = {
      latitude,
      longitude,
      label,
      source: "browser"
    };

    applyMonitoringLocation(
      location,
      true
    );

    closeLocationModal();
  }
);

contextElements.clearButton.addEventListener(
  "click",
  () => {
    removeSavedLocation();

    const firebaseLocation =
      locationFromLiveData(
        currentLiveData
      );

    environmentalContext =
      null;

    if (firebaseLocation) {
      applyMonitoringLocation(
        firebaseLocation,
        false
      );
    } else {
      applyMonitoringLocation(
        DEFAULT_LOCATION,
        false
      );
    }

    closeLocationModal();
  }
);

const initiallySavedLocation =
  savedLocationFromStorage();

if (initiallySavedLocation) {
  applyMonitoringLocation(
    {
      ...initiallySavedLocation,
      source: "browser"
    },
    false
  );
} else {
  applyMonitoringLocation(
    DEFAULT_LOCATION,
    false
  );
}


/* =======================================
   ONLINE / OFFLINE
======================================= */

let lastFirebaseUpdate = 0;

function setOnline() {
  lastFirebaseUpdate = Date.now();

  const dot =
    document.getElementById("statusDot");

  dot.className =
    "status-dot online";

  document.getElementById(
    "connectionStatus"
  ).textContent =
    "Device Online";

  document.getElementById(
    "firebaseStatus"
  ).textContent =
    "Connected";

  document.getElementById(
    "lastUpdated"
  ).textContent =
    "Updated " +
    new Date().toLocaleTimeString();
}

function setOffline() {
  const dot =
    document.getElementById("statusDot");

  dot.className =
    "status-dot offline";

  document.getElementById(
    "connectionStatus"
  ).textContent =
    "Device Offline";
}

setInterval(() => {
  if (lastFirebaseUpdate === 0) {
    return;
  }

  const elapsed =
    Date.now() - lastFirebaseUpdate;

  if (elapsed > 15000) {
    setOffline();
  }
}, 3000);


/* =======================================
   FIREBASE LIVE DATA
======================================= */

const livePath =
  ref(
    database,
    "devices/agrosentra-001/live"
  );

onValue(
  livePath,

  snapshot => {
    if (!snapshot.exists()) {
      document.getElementById(
        "firebaseStatus"
      ).textContent =
        "No Data";

      return;
    }

    const data =
      snapshot.val();

    currentLiveData =
      data;

    const firebaseLocation =
      locationFromLiveData(
        data
      );

    if (firebaseLocation) {
      const locationChanged =
        !monitoringLocation ||
        monitoringLocation.source !== "firebase" ||
        Number(monitoringLocation.latitude) !==
          Number(firebaseLocation.latitude) ||
        Number(monitoringLocation.longitude) !==
          Number(firebaseLocation.longitude);

      if (locationChanged) {
        applyMonitoringLocation(
          firebaseLocation,
          false
        );
      }
    }

    console.log(
      "AgroSentra live:",
      data
    );

    setOnline();
    updateSensorValues(data);
    updateHardwareStatus(data);
    updateHealth(data);
    addChartReading(data);
    renderAnalytics();
  },

  error => {
    console.error(
      "Firebase live error:",
      error
    );

    document.getElementById(
      "firebaseStatus"
    ).textContent =
      "Firebase Error";

    setOffline();
  }
);


/* =======================================
   FIREBASE HISTORY
   Stage 2: loads up to the latest 1440
   1-minute samples (about 24 hours).
======================================= */

const historyRef =
  ref(
    database,
    "devices/agrosentra-001/history"
  );

const historyQuery =
  query(
    historyRef,
    orderByChild("timestamp"),
    limitToLast(1440)
  );

onValue(
  historyQuery,

  snapshot => {
    const rows = [];

    snapshot.forEach(childSnapshot => {
      const value =
        childSnapshot.val();

      if (value) {
        rows.push({
          id: childSnapshot.key,
          ...value
        });
      }
    });

    historicalSamples =
      rows;

    console.log(
      `AgroSentra history: ${rows.length} samples`
    );

    renderAnalytics();
  },

  error => {
    console.error(
      "Firebase history error:",
      error
    );

    analyticsElements.coverage.textContent =
      "History unavailable";

    analyticsElements.insight.textContent =
      "Live monitoring is available, but Firebase history could not be loaded. Check the Realtime Database rules and timestamp index.";
  }
);
