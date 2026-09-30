/**
 * Chatly Voice AI - Guest & Free Tier Quota Management Service
 * 
 * Free / Unauthenticated tier limits:
 * - 10 calls per hour
 * - 50 calls per day
 * - Strictly powered by Groq API (Groq LLM + Groq Whisper STT)
 */

class GuestQuotaService {
  constructor() {
    // Map of identifier -> Array of timestamp numbers
    this.guestCalls = new Map();
    this.MAX_HOURLY = 10;
    this.MAX_DAILY = 50;

    // Prune stale records every 30 minutes to keep memory clean
    setInterval(() => this.cleanup(), 30 * 60 * 1000);
  }

  getCalls(identifier) {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    let calls = this.guestCalls.get(identifier) || [];
    // Prune older than 24 hours
    calls = calls.filter((t) => t > oneDayAgo);
    this.guestCalls.set(identifier, calls);
    return calls;
  }

  /**
   * Check and record a guest voice interaction
   * @param {string} identifier - Client IP or guest session identifier
   * @returns {{allowed: boolean, error?: string, remainingHourly: number, remainingDaily: number, totalHourly: number, totalDaily: number, isGuest: boolean, waitMinutes?: number, waitHours?: number}}
   */
  checkAndRecordGuestCall(identifier) {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const calls = this.getCalls(identifier);

    const callsLastHour = calls.filter((t) => t > oneHourAgo);
    const callsLastDay = calls;

    // 1. Check Hourly Limit (10 calls/hour)
    if (callsLastHour.length >= this.MAX_HOURLY) {
      const oldestInHour = callsLastHour[0];
      const resetTimeMs = oldestInHour + 60 * 60 * 1000;
      const waitMinutes = Math.max(1, Math.ceil((resetTimeMs - now) / 60000));

      return {
        allowed: false,
        isGuest: true,
        error: `Free guest limit reached (10 calls/hour). Please wait ${waitMinutes} minute(s) or create a free account for 30 calls/hour & unlimited daily calls!`,
        waitMinutes,
        remainingHourly: 0,
        remainingDaily: Math.max(0, this.MAX_DAILY - callsLastDay.length),
        totalHourly: this.MAX_HOURLY,
        totalDaily: this.MAX_DAILY,
      };
    }

    // 2. Check Daily Limit (50 calls/day)
    if (callsLastDay.length >= this.MAX_DAILY) {
      const oldestInDay = callsLastDay[0];
      const resetTimeMs = oldestInDay + 24 * 60 * 60 * 1000;
      const waitHours = Math.max(1, Math.ceil((resetTimeMs - now) / 3600000));

      return {
        allowed: false,
        isGuest: true,
        error: `Free guest daily limit reached (50 calls/day). Sign up or log in for unlimited daily calls!`,
        waitHours,
        remainingHourly: Math.max(0, this.MAX_HOURLY - callsLastHour.length),
        remainingDaily: 0,
        totalHourly: this.MAX_HOURLY,
        totalDaily: this.MAX_DAILY,
      };
    }

    // Record call
    calls.push(now);
    this.guestCalls.set(identifier, calls);

    return {
      allowed: true,
      isGuest: true,
      remainingHourly: Math.max(0, this.MAX_HOURLY - callsLastHour.length - 1),
      remainingDaily: Math.max(0, this.MAX_DAILY - callsLastDay.length - 1),
      totalHourly: this.MAX_HOURLY,
      totalDaily: this.MAX_DAILY,
    };
  }

  /**
   * Get quota summary without recording a call
   * @param {string} identifier - Client IP or guest session identifier
   */
  getGuestQuota(identifier) {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const calls = this.getCalls(identifier);
    const callsLastHour = calls.filter((t) => t > oneHourAgo).length;
    const callsLastDay = calls.length;

    return {
      isGuest: true,
      remainingHourly: Math.max(0, this.MAX_HOURLY - callsLastHour),
      remainingDaily: Math.max(0, this.MAX_DAILY - callsLastDay),
      totalHourly: this.MAX_HOURLY,
      totalDaily: this.MAX_DAILY,
    };
  }

  cleanup() {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    for (const [id, calls] of this.guestCalls.entries()) {
      const active = calls.filter((t) => t > oneDayAgo);
      if (active.length === 0) {
        this.guestCalls.delete(id);
      } else {
        this.guestCalls.set(id, active);
      }
    }
  }
}

export const guestQuotaService = new GuestQuotaService();
export default guestQuotaService;
