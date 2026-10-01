import { safeOutboundRequest } from "../../network/safeHttpClient.js";
import { toolCache } from "../../caching/toolCache.js";

const WMO_WEATHER_MAP = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snowfall",
  73: "Moderate snowfall",
  75: "Heavy snowfall",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

export const weatherTool = {
  name: "get_weather",
  description: "Get real-time live weather conditions, temperature in Celsius, forecast, and humidity for any city, state, or region.",
  category: "utility",
  risk: "low",
  timeoutMs: 5000,
  cacheTtlMs: 300000, // 5 min
  retryPolicy: { maxRetries: 1, backoffMs: 500 },
  authPolicy: "public",
  parameters: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "The city or region name (e.g. 'Jaipur', 'Delhi', 'Mumbai', 'London')",
      },
    },
    required: ["location"],
  },

  async execute(args, context = {}) {
    const location = String(args.location || args.city || "").trim();
    if (!location) {
      return {
        ok: false,
        tool: "get_weather",
        error: { code: "INVALID_ARGUMENT", message: "Location name is required.", retryable: false },
      };
    }

    const cached = toolCache.get("weather", location);
    if (cached) {
      return {
        ok: true,
        tool: "get_weather",
        data: cached,
        metadata: { cached: true },
      };
    }

    // 1. Open-Meteo Geocoding + Weather API
    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
      const geoRes = await safeOutboundRequest(geoUrl, { timeoutMs: 3000 });

      if (geoRes && geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData.results && geoData.results.length > 0) {
          const place = geoData.results[0];
          const lat = place.latitude;
          const lon = place.longitude;
          const placeName = `${place.name}${place.admin1 ? ", " + place.admin1 : ""}, ${place.country || ""}`;

          const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
          const weatherRes = await safeOutboundRequest(weatherUrl, { timeoutMs: 3000 });

          if (weatherRes && weatherRes.ok) {
            const wData = await weatherRes.json();
            const current = wData.current;
            const condition = WMO_WEATHER_MAP[current.weather_code] || "Clear";

            const data = {
              location: placeName,
              temperatureC: current.temperature_2m,
              condition,
              humidity: current.relative_humidity_2m,
              windSpeedKmH: current.wind_speed_10m,
              provider: "open-meteo",
            };

            toolCache.set("weather", location, data, 300);

            return {
              ok: true,
              tool: "get_weather",
              data,
              metadata: { cached: false, provider: "open-meteo" },
            };
          }
        }
      }
    } catch (_) {}

    // 2. wttr.in Fallback
    try {
      const wttrUrl = `https://wttr.in/${encodeURIComponent(location)}?format=%l:+%C+%t,+Humidity:+%h,+Wind:+%w`;
      const wttrRes = await safeOutboundRequest(wttrUrl, {
        timeoutMs: 3000,
        headers: { "User-Agent": "curl/7.68.0" },
      });

      if (wttrRes && wttrRes.ok) {
        const text = await wttrRes.text();
        if (text && !text.includes("Unknown location")) {
          const data = {
            location,
            summary: text.trim(),
            provider: "wttr.in",
          };
          toolCache.set("weather", location, data, 300);
          return {
            ok: true,
            tool: "get_weather",
            data,
            metadata: { cached: false, provider: "wttr.in" },
          };
        }
      }
    } catch (_) {}

    return {
      ok: false,
      tool: "get_weather",
      error: { code: "LOCATION_NOT_FOUND", message: `Could not find real-time weather data for "${location}".`, retryable: true },
    };
  },

  formatVoiceSummary(result) {
    if (!result.ok) {
      return `I could not check the weather right now: ${result.error?.message || "service unavailable"}.`;
    }

    const d = result.data;
    if (d.temperatureC !== undefined) {
      return `Currently in ${d.location}, the temperature is ${d.temperatureC}°C with ${d.condition.toLowerCase()}. Humidity is ${d.humidity}% and wind speed is ${d.windSpeedKmH} km/h.`;
    }
    return `Weather for ${d.location}: ${d.summary}`;
  },
};

export default weatherTool;
