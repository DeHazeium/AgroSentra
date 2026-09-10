import {
  database
} from "./firebase-config.js";

import {
  ref,
  onValue
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

lucide.createIcons();

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

function validNumber(value) {
  return (
    value !== null &&
    value !== undefined &&
    Number.isFinite(Number(value))
  );
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

const chartCanvas = document.getElementById("sensorChart");

const sensorChart = new Chart(chartCanvas, {
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

function addChartReading(data) {
  if (
    !validNumber(data.temperature) ||
    !validNumber(data.moisture) ||
    !validNumber(data.ph)
  ) {
    return;
  }

  const label = new Date().toLocaleTimeString([], {
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

function updateSensorValues(data) {
  elements.voltage.textContent = format(data.voltage, 2);
  elements.current.textContent = format(data.current, 1);
  elements.temperature.textContent = format(data.temperature, 1);
  elements.moisture.textContent = format(data.moisture, 1);
  elements.ph.textContent = format(data.ph, 1);
  elements.ec.textContent = format(data.ec, 0);
  elements.nitrogen.textContent = format(data.nitrogen, 0);
  elements.phosphorus.textContent = format(data.phosphorus, 0);
  elements.potassium.textContent = format(data.potassium, 0);
  elements.salinity.textContent = format(data.salinity, 0);

  document.getElementById("quickTemperature").textContent =
    `${format(data.temperature, 1)} °C`;

  document.getElementById("quickMoisture").textContent =
    `${format(data.moisture, 1)} %`;

  document.getElementById("quickPh").textContent =
    format(data.ph, 1);

  document.getElementById("quickEc").textContent =
    `${format(data.ec, 0)} µS/cm`;

  document.getElementById("rssi").textContent =
    validNumber(data.rssi) ? `${data.rssi} dBm` : "--";

  document.getElementById("uptime").textContent =
    formatUptime(data.uptime_ms);
}

function updateHardwareStatus(data) {
  const soil = document.getElementById("soilStatus");
  const power = document.getElementById("powerStatus");

  soil.textContent =
    data.soil_ok === false
      ? "Sensor Error"
      : "Online";

  power.textContent =
    data.power_ok === false
      ? "INA219 Error"
      : "Online";
}

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

  const scoreElement = document.getElementById("healthScore");
  const badge = document.getElementById("healthBadge");
  const message = document.getElementById("healthMessage");
  const ring = document.getElementById("healthRing");

  scoreElement.textContent = score;

  ring.style.background =
    `conic-gradient(
      #46f28b ${score}%,
      rgba(255,255,255,.05) ${score}%
    )`;

  if (score >= 80) {
    badge.textContent = "Healthy";
    message.textContent =
      "Current monitored soil conditions are within the preferred range.";
  } else if (score >= 60) {
    badge.textContent = "Attention";
    message.textContent =
      "Some monitored parameters are outside the preferred range.";
  } else {
    badge.textContent = "Warning";
    message.textContent =
      "Multiple soil parameters require attention.";
  }
}

let lastFirebaseUpdate = 0;

function setOnline() {
  lastFirebaseUpdate = Date.now();

  const dot = document.getElementById("statusDot");

  dot.className = "status-dot online";

  document.getElementById("connectionStatus").textContent =
    "Device Online";

  document.getElementById("firebaseStatus").textContent =
    "Connected";

  document.getElementById("lastUpdated").textContent =
    "Updated " + new Date().toLocaleTimeString();
}

function setOffline() {
  const dot = document.getElementById("statusDot");

  dot.className = "status-dot offline";

  document.getElementById("connectionStatus").textContent =
    "Device Offline";
}

setInterval(() => {
  if (lastFirebaseUpdate === 0) {
    return;
  }

  const elapsed = Date.now() - lastFirebaseUpdate;

  if (elapsed > 15000) {
    setOffline();
  }
}, 3000);

const livePath = ref(
  database,
  "devices/agrosentra-001/live"
);

onValue(
  livePath,

  snapshot => {
    if (!snapshot.exists()) {
      document.getElementById("firebaseStatus").textContent =
        "No Data";

      return;
    }

    const data = snapshot.val();

    console.log("AgroSentra:", data);

    setOnline();
    updateSensorValues(data);
    updateHardwareStatus(data);
    updateHealth(data);
    addChartReading(data);
  },

  error => {
    console.error("Firebase error:", error);

    document.getElementById("firebaseStatus").textContent =
      "Firebase Error";

    setOffline();
  }
);
