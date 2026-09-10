/*
  AgroSentra local soil analytics
  --------------------------------
  This module performs:
  - time-window filtering
  - linear trend estimation
  - historical baseline calculations
  - standard-deviation anomaly checks
  - soil stability scoring
  - simple NPK balance assessment
  - salinity risk classification
  - generated natural-language interpretation

  No external AI API is required.
*/

export function isFiniteNumber(value) {
  return value !== null &&
         value !== undefined &&
         Number.isFinite(Number(value));
}

export function mean(values) {
  const clean = values.map(Number).filter(Number.isFinite);

  if (!clean.length) return null;

  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

export function stdDev(values) {
  const clean = values.map(Number).filter(Number.isFinite);

  if (clean.length < 2) return 0;

  const avg = mean(clean);

  const variance =
    clean.reduce((sum, value) => {
      return sum + Math.pow(value - avg, 2);
    }, 0) / clean.length;

  return Math.sqrt(variance);
}

export function percentChange(first, last) {
  if (!isFiniteNumber(first) ||
      !isFiniteNumber(last) ||
      Number(first) === 0) {
    return null;
  }

  return ((Number(last) - Number(first)) / Math.abs(Number(first))) * 100;
}

function getTimestamp(sample) {
  if (!sample) return null;

  if (isFiniteNumber(sample.timestamp)) {
    const ts = Number(sample.timestamp);

    // Firmware stores Unix seconds.
    return ts > 1e12 ? ts : ts * 1000;
  }

  return null;
}

export function sortSamples(samples) {
  return [...samples]
    .filter(sample => getTimestamp(sample) !== null)
    .sort((a, b) => getTimestamp(a) - getTimestamp(b));
}

export function filterWindow(samples, minutes) {
  const sorted = sortSamples(samples);

  if (!sorted.length) return [];

  const newestTimestamp =
    getTimestamp(sorted[sorted.length - 1]);

  const cutoff =
    newestTimestamp - Number(minutes) * 60 * 1000;

  return sorted.filter(sample => getTimestamp(sample) >= cutoff);
}

export function linearTrend(samples, field) {
  const points = sortSamples(samples)
    .filter(sample =>
      isFiniteNumber(sample[field]) &&
      getTimestamp(sample) !== null
    );

  if (points.length < 2) {
    return {
      direction: "insufficient",
      slopePerMinute: 0,
      delta: 0,
      percent: null
    };
  }

  const t0 = getTimestamp(points[0]);

  const xs = points.map(sample =>
    (getTimestamp(sample) - t0) / 60000
  );

  const ys = points.map(sample =>
    Number(sample[field])
  );

  const xMean = mean(xs);
  const yMean = mean(ys);

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < xs.length; i++) {
    numerator +=
      (xs[i] - xMean) *
      (ys[i] - yMean);

    denominator +=
      Math.pow(xs[i] - xMean, 2);
  }

  const slope =
    denominator === 0
      ? 0
      : numerator / denominator;

  const first = ys[0];
  const last = ys[ys.length - 1];
  const delta = last - first;
  const percent = percentChange(first, last);

  // Relative noise threshold derived from the observed average.
  const magnitude = Math.max(Math.abs(yMean || 0), 1);
  const stableSlope = magnitude * 0.0015;

  let direction = "stable";

  if (slope > stableSlope) {
    direction = "increasing";
  } else if (slope < -stableSlope) {
    direction = "decreasing";
  }

  return {
    direction,
    slopePerMinute: slope,
    delta,
    percent
  };
}

export function baselineFor(samples, field) {
  const values = samples
    .map(sample => sample[field])
    .filter(isFiniteNumber)
    .map(Number);

  return {
    mean: mean(values),
    stdDev: stdDev(values),
    count: values.length
  };
}

export function anomalyFor(currentValue, baseline) {
  if (!isFiniteNumber(currentValue) ||
      !baseline ||
      !isFiniteNumber(baseline.mean) ||
      baseline.count < 5) {
    return {
      anomalous: false,
      severity: "unknown",
      zScore: null
    };
  }

  const sd = Number(baseline.stdDev);

  if (sd < 0.00001) {
    const diff =
      Math.abs(Number(currentValue) - Number(baseline.mean));

    const tolerance =
      Math.max(Math.abs(Number(baseline.mean)) * 0.05, 0.1);

    return {
      anomalous: diff > tolerance,
      severity: diff > tolerance ? "moderate" : "normal",
      zScore: null
    };
  }

  const z =
    Math.abs(
      (Number(currentValue) - Number(baseline.mean)) / sd
    );

  return {
    anomalous: z >= 2.5,
    severity:
      z >= 3.5
        ? "high"
        : z >= 2.5
          ? "moderate"
          : "normal",
    zScore: z
  };
}

export function nutrientBalance(live) {
  const n = Number(live.nitrogen);
  const p = Number(live.phosphorus);
  const k = Number(live.potassium);

  if (![n, p, k].every(Number.isFinite)) {
    return {
      label: "Unknown",
      detail: "NPK readings unavailable",
      scorePenalty: 5
    };
  }

  const avg = (n + p + k) / 3;

  if (avg <= 0) {
    return {
      label: "Very Low",
      detail: "NPK values are near zero",
      scorePenalty: 18
    };
  }

  const spread =
    (Math.max(n, p, k) - Math.min(n, p, k)) / avg;

  if (spread <= 0.35) {
    return {
      label: "Balanced",
      detail: `N ${n.toFixed(0)} · P ${p.toFixed(0)} · K ${k.toFixed(0)}`,
      scorePenalty: 0
    };
  }

  if (spread <= 0.75) {
    return {
      label: "Moderate",
      detail: `N ${n.toFixed(0)} · P ${p.toFixed(0)} · K ${k.toFixed(0)}`,
      scorePenalty: 6
    };
  }

  return {
    label: "Imbalanced",
    detail: `N ${n.toFixed(0)} · P ${p.toFixed(0)} · K ${k.toFixed(0)}`,
    scorePenalty: 12
  };
}

export function salinityRisk(live) {
  const value = Number(live.salinity);

  if (!Number.isFinite(value)) {
    return {
      label: "Unknown",
      detail: "Salinity reading unavailable",
      scorePenalty: 5
    };
  }

  // Generic prototype bands. Final bands should be calibrated
  // against the actual sensor's documented unit and crop/soil target.
  if (value < 300) {
    return {
      label: "Low",
      detail: `${value.toFixed(0)} sensor units`,
      scorePenalty: 0
    };
  }

  if (value < 700) {
    return {
      label: "Moderate",
      detail: `${value.toFixed(0)} sensor units`,
      scorePenalty: 6
    };
  }

  return {
    label: "High",
    detail: `${value.toFixed(0)} sensor units`,
    scorePenalty: 14
  };
}

function currentRangePenalty(live) {
  let penalty = 0;
  const flags = [];

  const moisture = Number(live.moisture);
  const ph = Number(live.ph);
  const temperature = Number(live.temperature);
  const ec = Number(live.ec);

  if (Number.isFinite(moisture)) {
    if (moisture < 30) {
      penalty += 12;
      flags.push({
        level: "warning",
        text: "Low moisture"
      });
    } else if (moisture > 80) {
      penalty += 10;
      flags.push({
        level: "warning",
        text: "High moisture"
      });
    }
  }

  if (Number.isFinite(ph)) {
    if (ph < 5.5 || ph > 7.5) {
      penalty += 14;
      flags.push({
        level: "warning",
        text: "pH outside preferred band"
      });
    }
  }

  if (Number.isFinite(temperature)) {
    if (temperature < 15 || temperature > 35) {
      penalty += 8;
      flags.push({
        level: "warning",
        text: "Temperature outside preferred band"
      });
    }
  }

  if (Number.isFinite(ec)) {
    if (ec > 2000) {
      penalty += 10;
      flags.push({
        level: "warning",
        text: "High conductivity"
      });
    }
  }

  return { penalty, flags };
}

function trendPenalty(trend, field) {
  if (!trend ||
      trend.direction === "insufficient" ||
      trend.direction === "stable") {
    return 0;
  }

  const pct = Math.abs(Number(trend.percent));

  if (!Number.isFinite(pct)) {
    return 0;
  }

  // Different fields naturally vary at different rates.
  const thresholds = {
    moisture: [8, 18],
    ph: [3, 8],
    temperature: [6, 14],
    ec: [12, 25],
    salinity: [12, 25]
  };

  const [moderate, strong] =
    thresholds[field] || [10, 20];

  if (pct >= strong) return 8;
  if (pct >= moderate) return 4;

  return 0;
}

function readableTrend(trend, unit = "") {
  if (!trend || trend.direction === "insufficient") {
    return {
      label: "Not enough data",
      detail: "At least two historical samples are required",
      className: ""
    };
  }

  const pct =
    Number.isFinite(Number(trend.percent))
      ? Math.abs(Number(trend.percent)).toFixed(1)
      : null;

  if (trend.direction === "stable") {
    return {
      label: "Stable",
      detail: pct !== null
        ? `${pct}% total change in selected period`
        : "Minimal variation",
      className: "trend-stable"
    };
  }

  if (trend.direction === "increasing") {
    return {
      label: "Increasing",
      detail: pct !== null
        ? `↑ ${pct}% in selected period`
        : "Upward trend detected",
      className: "trend-up"
    };
  }

  return {
    label: "Decreasing",
    detail: pct !== null
      ? `↓ ${pct}% in selected period`
      : "Downward trend detected",
    className: "trend-down"
  };
}

function baselineConfidence(sampleCount, requestedMinutes) {
  // One history entry is expected roughly each minute.
  const expected =
    Math.max(1, Math.min(Number(requestedMinutes), 1440));

  const ratio =
    Math.min(sampleCount / expected, 1);

  if (sampleCount < 5) {
    return {
      label: "Low",
      percent: Math.round(ratio * 100)
    };
  }

  if (ratio >= 0.7 || sampleCount >= 30) {
    return {
      label: "High",
      percent: Math.round(ratio * 100)
    };
  }

  return {
    label: "Moderate",
    percent: Math.round(ratio * 100)
  };
}

function buildInsight({
  live,
  trends,
  anomalies,
  nutrients,
  salinity,
  score,
  sampleCount
}) {
  if (sampleCount < 2) {
    return "AgroSentra has live soil data, but more historical samples are needed before reliable trend interpretation can be generated.";
  }

  const sentences = [];

  if (score >= 85) {
    sentences.push(
      "The monitored soil condition is currently stable with no major pattern-level concern detected."
    );
  } else if (score >= 65) {
    sentences.push(
      "The monitored soil condition is generally acceptable, although some parameters show changes that should continue to be observed."
    );
  } else {
    sentences.push(
      "Multiple indicators are moving away from the established historical pattern, so the soil condition deserves closer inspection."
    );
  }

  const moistureTrend = trends.moisture;

  if (moistureTrend.direction === "decreasing" &&
      Number.isFinite(Number(moistureTrend.percent)) &&
      Math.abs(Number(moistureTrend.percent)) >= 8) {
    sentences.push(
      `Moisture has fallen by about ${Math.abs(Number(moistureTrend.percent)).toFixed(1)}% during the selected period.`
    );
  } else if (moistureTrend.direction === "increasing" &&
             Number.isFinite(Number(moistureTrend.percent)) &&
             Math.abs(Number(moistureTrend.percent)) >= 8) {
    sentences.push(
      `Moisture has risen by about ${Math.abs(Number(moistureTrend.percent)).toFixed(1)}% during the selected period.`
    );
  }

  const phTrend = trends.ph;

  if (phTrend.direction !== "stable" &&
      phTrend.direction !== "insufficient" &&
      Number.isFinite(Number(phTrend.percent)) &&
      Math.abs(Number(phTrend.percent)) >= 3) {
    sentences.push(
      `Soil pH is ${phTrend.direction}, indicating a measurable shift from the beginning of the analysis window.`
    );
  }

  const abnormalFields =
    Object.entries(anomalies)
      .filter(([, result]) => result.anomalous)
      .map(([field]) => {
        const names = {
          moisture: "moisture",
          ph: "pH",
          temperature: "temperature",
          ec: "conductivity",
          salinity: "salinity"
        };

        return names[field] || field;
      });

  if (abnormalFields.length) {
    sentences.push(
      `The latest ${abnormalFields.join(", ")} reading${abnormalFields.length > 1 ? "s are" : " is"} unusual compared with the recent baseline.`
    );
  }

  if (nutrients.label === "Imbalanced") {
    sentences.push(
      "The NPK readings are uneven relative to one another, so nutrient balance should be interpreted together with soil type and crop requirements."
    );
  }

  if (salinity.label === "High") {
    sentences.push(
      "Salinity is elevated within the prototype risk bands and should be verified against the sensor's calibrated unit and the target soil profile."
    );
  }

  if (sentences.length < 2) {
    sentences.push(
      "Continue collecting history so AgroSentra can strengthen its baseline and detect smaller deviations over time."
    );
  }

  return sentences.join(" ");
}

export function analyseSoil(live, allSamples, requestedMinutes) {
  const samples = filterWindow(allSamples, requestedMinutes);

  const fields = [
    "moisture",
    "ph",
    "temperature",
    "ec",
    "salinity"
  ];

  const trends = {};
  const baselines = {};
  const anomalies = {};

  for (const field of fields) {
    trends[field] = linearTrend(samples, field);
    baselines[field] = baselineFor(samples, field);
    anomalies[field] = anomalyFor(live[field], baselines[field]);
  }

  const nutrients = nutrientBalance(live);
  const salinity = salinityRisk(live);
  const currentRange = currentRangePenalty(live);

  let score = 100;

  score -= currentRange.penalty;
  score -= nutrients.scorePenalty;
  score -= salinity.scorePenalty;

  for (const field of fields) {
    score -= trendPenalty(trends[field], field);

    if (anomalies[field].anomalous) {
      score -= anomalies[field].severity === "high" ? 10 : 6;
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const anomalyList =
    Object.entries(anomalies)
      .filter(([, result]) => result.anomalous);

  let status = "Stable";
  let statusClass = "state-good";
  let statusSub =
    "Measured conditions are close to the recent historical pattern.";

  if (score < 65 || anomalyList.length >= 2) {
    status = "Attention";
    statusClass = "state-danger";
    statusSub =
      "Several changes or deviations are present in the selected analysis window.";
  } else if (score < 85 || anomalyList.length === 1) {
    status = "Watch";
    statusClass = "state-warning";
    statusSub =
      "Some parameters are changing or differ from the recent baseline.";
  }

  const moistureDisplay =
    readableTrend(trends.moisture, "%");

  const phDisplay =
    readableTrend(trends.ph, "pH");

  const confidence =
    baselineConfidence(samples.length, requestedMinutes);

  const flags = [...currentRange.flags];

  if (anomalyList.length) {
    flags.push({
      level: anomalyList.length >= 2 ? "danger" : "warning",
      text: `${anomalyList.length} historical anomaly${anomalyList.length > 1 ? "ies" : ""}`
    });
  } else if (samples.length >= 5) {
    flags.push({
      level: "good",
      text: "No strong baseline anomaly"
    });
  }

  if (trends.moisture.direction === "decreasing" &&
      Number.isFinite(Number(trends.moisture.percent)) &&
      Math.abs(Number(trends.moisture.percent)) >= 8) {
    flags.push({
      level: "warning",
      text: "Moisture declining"
    });
  }

  if (nutrients.label === "Balanced") {
    flags.push({
      level: "good",
      text: "NPK relatively balanced"
    });
  } else if (nutrients.label === "Imbalanced") {
    flags.push({
      level: "warning",
      text: "NPK imbalance"
    });
  }

  if (salinity.label === "Low") {
    flags.push({
      level: "good",
      text: "Low salinity risk"
    });
  } else if (salinity.label === "High") {
    flags.push({
      level: "danger",
      text: "High salinity risk"
    });
  }

  if (!flags.length) {
    flags.push({
      level: "neutral",
      text: "Collecting data"
    });
  }

  const insight = buildInsight({
    live,
    trends,
    anomalies,
    nutrients,
    salinity,
    score,
    sampleCount: samples.length
  });

  return {
    score,
    status,
    statusClass,
    statusSub,
    samples,
    sampleCount: samples.length,
    confidence,
    moistureDisplay,
    phDisplay,
    nutrients,
    salinity,
    anomalies,
    trends,
    baselines,
    flags,
    insight
  };
}
