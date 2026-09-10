/*
  AgroSentra External Environmental Context
  ------------------------------------------
  Uses Open-Meteo's public forecast API.
  No client-side API key is required for this prototype.

  Variables:
  - temperature_2m
  - relative_humidity_2m
  - precipitation
  - rain
  - weather_code
  - soil_temperature_0cm
  - soil_moisture_0_to_1cm

  External soil values are model estimates and should only be
  used as contextual references, not as replacements for the
  physical AgroSentra soil probe.
*/

export function validCoordinate(value, type) {
  const number = Number(value);

  if (!Number.isFinite(number)) return false;

  if (type === "latitude") {
    return number >= -90 && number <= 90;
  }

  if (type === "longitude") {
    return number >= -180 && number <= 180;
  }

  return false;
}

export function weatherCodeLabel(code) {
  const value = Number(code);

  if (value === 0) return "Clear";
  if ([1, 2].includes(value)) return "Partly cloudy";
  if (value === 3) return "Overcast";
  if ([45, 48].includes(value)) return "Fog";
  if ([51, 53, 55].includes(value)) return "Drizzle";
  if ([56, 57].includes(value)) return "Freezing drizzle";
  if ([61, 63, 65].includes(value)) return "Rain";
  if ([66, 67].includes(value)) return "Freezing rain";
  if ([71, 73, 75, 77].includes(value)) return "Snow";
  if ([80, 81, 82].includes(value)) return "Rain showers";
  if ([85, 86].includes(value)) return "Snow showers";
  if ([95, 96, 99].includes(value)) return "Thunderstorm";

  return "Weather available";
}

function finite(value) {
  return value !== null &&
         value !== undefined &&
         Number.isFinite(Number(value));
}

function sumRecentHourly(hourly, field, hours = 6) {
  if (!hourly ||
      !Array.isArray(hourly.time) ||
      !Array.isArray(hourly[field])) {
    return null;
  }

  const now = Date.now();

  const rows = hourly.time
    .map((time, index) => ({
      time: new Date(time).getTime(),
      value: Number(hourly[field][index])
    }))
    .filter(row =>
      Number.isFinite(row.time) &&
      Number.isFinite(row.value) &&
      row.time <= now &&
      row.time >= now - hours * 60 * 60 * 1000
    );

  if (!rows.length) return null;

  return rows.reduce((sum, row) => sum + row.value, 0);
}

export async function fetchEnvironmentalContext(latitude, longitude) {
  if (!validCoordinate(latitude, "latitude") ||
      !validCoordinate(longitude, "longitude")) {
    throw new Error("Invalid monitoring coordinates.");
  }

  const params = new URLSearchParams({
    latitude: Number(latitude).toFixed(6),
    longitude: Number(longitude).toFixed(6),
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "precipitation",
      "rain",
      "weather_code",
      "soil_temperature_0cm",
      "soil_moisture_0_to_1cm"
    ].join(","),
    hourly: [
      "temperature_2m",
      "relative_humidity_2m",
      "precipitation",
      "rain",
      "soil_temperature_0cm",
      "soil_moisture_0_to_1cm"
    ].join(","),
    past_hours: "24",
    forecast_hours: "1",
    timezone: "auto"
  });

  const url =
    `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

  const response =
    await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      },
      cache: "no-store"
    });

  if (!response.ok) {
    throw new Error(
      `External context request failed (${response.status}).`
    );
  }

  const data = await response.json();
  const current = data.current || {};

  const rainfall6h =
    sumRecentHourly(data.hourly, "precipitation", 6);

  const rain6h =
    sumRecentHourly(data.hourly, "rain", 6);

  return {
    latitude: Number(data.latitude ?? latitude),
    longitude: Number(data.longitude ?? longitude),
    timezone: data.timezone || null,
    elevation: finite(data.elevation) ? Number(data.elevation) : null,

    airTemperature:
      finite(current.temperature_2m)
        ? Number(current.temperature_2m)
        : null,

    humidity:
      finite(current.relative_humidity_2m)
        ? Number(current.relative_humidity_2m)
        : null,

    precipitationNow:
      finite(current.precipitation)
        ? Number(current.precipitation)
        : null,

    rainNow:
      finite(current.rain)
        ? Number(current.rain)
        : null,

    weatherCode:
      finite(current.weather_code)
        ? Number(current.weather_code)
        : null,

    weatherLabel:
      weatherCodeLabel(current.weather_code),

    modelSoilTemperature:
      finite(current.soil_temperature_0cm)
        ? Number(current.soil_temperature_0cm)
        : null,

    modelSoilMoistureVolumetric:
      finite(current.soil_moisture_0_to_1cm)
        ? Number(current.soil_moisture_0_to_1cm)
        : null,

    modelSoilMoisturePercent:
      finite(current.soil_moisture_0_to_1cm)
        ? Number(current.soil_moisture_0_to_1cm) * 100
        : null,

    rainfall6h:
      finite(rainfall6h)
        ? Number(rainfall6h)
        : null,

    rain6h:
      finite(rain6h)
        ? Number(rain6h)
        : null,

    dataTime:
      current.time || null,

    fetchedAt:
      Date.now(),

    source:
      "Open-Meteo"
  };
}

export function classifyRain(context) {
  if (!context || !finite(context.rainfall6h)) {
    return {
      label: "Unknown",
      detail: "Recent rainfall data unavailable"
    };
  }

  const value = Number(context.rainfall6h);

  if (value < 0.2) {
    return {
      label: "No meaningful rain",
      detail: "Less than 0.2 mm modelled precipitation in the last 6 hours"
    };
  }

  if (value < 2.5) {
    return {
      label: "Light recent rain",
      detail: `${value.toFixed(1)} mm modelled precipitation in the last 6 hours`
    };
  }

  if (value < 10) {
    return {
      label: "Recent rain detected",
      detail: `${value.toFixed(1)} mm modelled precipitation in the last 6 hours`
    };
  }

  return {
    label: "Heavy recent rain",
    detail: `${value.toFixed(1)} mm modelled precipitation in the last 6 hours`
  };
}

export function contextRelations(live, analyticsResult, context) {
  if (!live || !context) {
    return {
      moisture: {
        label: "Waiting for data",
        detail: "Both probe data and external context are required."
      },
      temperature: {
        label: "Waiting for data",
        detail: "Both probe data and external context are required."
      },
      confidence: {
        label: "Unavailable",
        detail: "Monitoring location has not been synced."
      },
      flags: [],
      sentence: ""
    };
  }

  const flags = [];
  const sentences = [];

  const rain =
    classifyRain(context);

  const moistureTrend =
    analyticsResult?.trends?.moisture;

  let moistureRelation = {
    label: "No strong relation yet",
    detail: rain.detail
  };

  const moistureChanging =
    moistureTrend &&
    ["increasing", "decreasing"].includes(moistureTrend.direction) &&
    Number.isFinite(Number(moistureTrend.percent)) &&
    Math.abs(Number(moistureTrend.percent)) >= 5;

  if (moistureChanging &&
      moistureTrend.direction === "increasing" &&
      Number(context.rainfall6h) >= 0.2) {
    moistureRelation = {
      label: "Increase consistent with rain",
      detail:
        `Probe moisture is rising while ${Number(context.rainfall6h).toFixed(1)} mm of recent precipitation is modelled.`
    };

    flags.push({
      level: "good",
      text: "Moisture rise matches rainfall"
    });

    sentences.push(
      "The rise in measured soil moisture is consistent with recent modelled rainfall."
    );
  } else if (
    moistureChanging &&
    moistureTrend.direction === "increasing" &&
    Number(context.rainfall6h) < 0.2
  ) {
    moistureRelation = {
      label: "Unexplained moisture rise",
      detail:
        "Probe moisture is rising without meaningful recent rainfall in the external weather context."
    };

    flags.push({
      level: "warning",
      text: "Moisture rise without rain"
    });

    sentences.push(
      "Measured soil moisture is increasing without corresponding modelled rainfall, so local irrigation, ponding, drainage change, or another local water source may be contributing."
    );
  } else if (
    moistureChanging &&
    moistureTrend.direction === "decreasing" &&
    Number(context.rainfall6h) < 0.2
  ) {
    moistureRelation = {
      label: "Drying pattern",
      detail:
        "Measured moisture is falling and no meaningful recent rainfall is modelled."
    };

    flags.push({
      level: "warning",
      text: "Drying without recent rain"
    });

    sentences.push(
      "The falling soil moisture trend is consistent with the absence of meaningful recent rainfall."
    );
  } else if (
    Number(context.rainfall6h) >= 2.5 &&
    moistureTrend?.direction === "stable"
  ) {
    moistureRelation = {
      label: "Limited probe response",
      detail:
        "Recent rainfall is modelled, but the measured moisture trend remains relatively stable."
    };

    flags.push({
      level: "neutral",
      text: "Rain with limited moisture response"
    });

    sentences.push(
      "Recent rainfall is present in the environmental context, while the measured moisture trend remains relatively stable."
    );
  }

  let temperatureRelation = {
    label: "Reference available",
    detail:
      "Probe and model temperatures are shown as separate references."
  };

  const probeTemp = Number(live.temperature);
  const modelTemp = Number(context.modelSoilTemperature);

  if (Number.isFinite(probeTemp) &&
      Number.isFinite(modelTemp)) {
    const difference =
      probeTemp - modelTemp;

    if (Math.abs(difference) <= 3) {
      temperatureRelation = {
        label: "Broadly aligned",
        detail:
          `Probe is ${Math.abs(difference).toFixed(1)} °C ${difference >= 0 ? "warmer" : "cooler"} than the near-surface model reference.`
      };
    } else {
      temperatureRelation = {
        label: "Local difference detected",
        detail:
          `Probe differs from the near-surface model reference by ${Math.abs(difference).toFixed(1)} °C. Depth and local conditions can explain this.`
      };

      flags.push({
        level: "neutral",
        text: "Probe/model temperature differ"
      });
    }
  }

  const ageMinutes =
    Math.max(
      0,
      Math.round(
        (Date.now() - Number(context.fetchedAt)) / 60000
      )
    );

  const confidence =
    ageMinutes <= 20
      ? {
          label: "Good",
          detail: "Location configured and external context is recently synced."
        }
      : {
          label: "Reduced",
          detail: "External context is becoming stale and will refresh automatically."
        };

  return {
    moisture: moistureRelation,
    temperature: temperatureRelation,
    confidence,
    flags,
    sentence: sentences.join(" ")
  };
}
