const CITY_TIMEZONES = {
  delhi: "Asia/Kolkata",
  mumbai: "Asia/Kolkata",
  bangalore: "Asia/Kolkata",
  india: "Asia/Kolkata",
  kolkata: "Asia/Kolkata",
  chennai: "Asia/Kolkata",
  london: "Europe/London",
  uk: "Europe/London",
  "new york": "America/New_York",
  nyc: "America/New_York",
  california: "America/Los_Angeles",
  "san francisco": "America/Los_Angeles",
  tokyo: "Asia/Tokyo",
  japan: "Asia/Tokyo",
  dubai: "Asia/Dubai",
  singapore: "Asia/Singapore",
  sydney: "Australia/Sydney",
  berlin: "Europe/Berlin",
  paris: "Europe/Paris",
};

export const currentTimeTool = {
  name: "get_current_time",
  description: "Get the exact current real-time date, day of week, and time for India or any global city/timezone.",
  category: "utility",
  risk: "low",
  timeoutMs: 500,
  cacheTtlMs: 0,
  retryPolicy: { maxRetries: 0, backoffMs: 0 },
  authPolicy: "public",
  parameters: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "Optional city, country, or timezone name (e.g. 'Delhi', 'New York', 'London')",
      },
    },
  },

  async execute(args, context = {}) {
    const rawLoc = String(args.location || "").trim();
    const loc = rawLoc.toLowerCase();
    let timeZone = "Asia/Kolkata";
    let locationLabel = "India (IST)";

    if (loc) {
      let matched = false;
      for (const [city, tz] of Object.entries(CITY_TIMEZONES)) {
        if (loc.includes(city)) {
          timeZone = tz;
          locationLabel = city.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
          matched = true;
          break;
        }
      }
      if (!matched && rawLoc) {
        locationLabel = rawLoc.charAt(0).toUpperCase() + rawLoc.slice(1);
      }
    }

    const now = new Date();
    const formatted = now.toLocaleString("en-US", {
      timeZone,
      dateStyle: "full",
      timeStyle: "long",
    });

    const data = {
      location: locationLabel,
      timeZone,
      formattedTime: formatted,
      iso: now.toISOString(),
      timestampMs: now.getTime(),
    };

    return {
      ok: true,
      tool: "get_current_time",
      data,
      metadata: { timeZone },
    };
  },

  formatVoiceSummary(result) {
    if (!result.ok) {
      return "Could not retrieve the current time.";
    }
    return `The current date and time in ${result.data.location} is ${result.data.formattedTime}.`;
  },
};

export default currentTimeTool;
