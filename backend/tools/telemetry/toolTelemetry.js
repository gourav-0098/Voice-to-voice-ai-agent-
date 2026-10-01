/**
 * Production Tool Observability & Telemetry System
 * Tracks tool call volume, success rates, latency percentiles (p50/p95),
 * cache hit rates, and provider failure metrics.
 */

class ToolTelemetryCollector {
  constructor(historySize = 500) {
    this.historySize = historySize;
    this.callLogs = [];
    this.toolStats = new Map(); // toolName -> stats
  }

  /**
   * Record a completed or failed tool invocation
   * @param {Object} event
   */
  record(event) {
    const {
      toolName = "unknown",
      requestId = null,
      userId = null,
      durationMs = 0,
      success = false,
      errorCode = null,
      provider = "default",
      cacheHit = false,
      retryCount = 0,
      resultSize = 0,
      sourceCount = 0,
    } = event;

    const logEntry = {
      toolName,
      requestId,
      userId: userId ? String(userId) : "anonymous",
      timestamp: Date.now(),
      durationMs,
      success: !!success,
      errorCode: errorCode || null,
      provider,
      cacheHit: !!cacheHit,
      retryCount,
      resultSize,
      sourceCount,
    };

    this.callLogs.push(logEntry);
    if (this.callLogs.length > this.historySize) {
      this.callLogs.shift();
    }

    // Update aggregated stats for tool
    let stats = this.toolStats.get(toolName);
    if (!stats) {
      stats = {
        totalCalls: 0,
        successCount: 0,
        failureCount: 0,
        cacheHits: 0,
        latencies: [],
        providersUsed: new Map(),
        errorsByCode: new Map(),
      };
      this.toolStats.set(toolName, stats);
    }

    stats.totalCalls++;
    if (success) {
      stats.successCount++;
    } else {
      stats.failureCount++;
      if (errorCode) {
        stats.errorsByCode.set(errorCode, (stats.errorsByCode.get(errorCode) || 0) + 1);
      }
    }

    if (cacheHit) {
      stats.cacheHits++;
    }

    stats.latencies.push(durationMs);
    if (stats.latencies.length > 200) {
      stats.latencies.shift();
    }

    stats.providersUsed.set(provider, (stats.providersUsed.get(provider) || 0) + 1);
  }

  /**
   * Get metrics summary for all tools or a specific tool
   * @param {string} [toolName]
   * @returns {Object}
   */
  getMetrics(toolName = null) {
    if (toolName) {
      const stats = this.toolStats.get(toolName);
      if (!stats) return { totalCalls: 0, successRate: 0, p50LatencyMs: 0, p95LatencyMs: 0 };

      const sortedLatencies = [...stats.latencies].sort((a, b) => a - b);
      const p50 = sortedLatencies.length ? sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] : 0;
      const p95 = sortedLatencies.length ? sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] : 0;

      return {
        toolName,
        totalCalls: stats.totalCalls,
        successCount: stats.successCount,
        failureCount: stats.failureCount,
        successRate: stats.totalCalls ? Number((stats.successCount / stats.totalCalls).toFixed(3)) : 0,
        cacheHitRate: stats.totalCalls ? Number((stats.cacheHits / stats.totalCalls).toFixed(3)) : 0,
        p50LatencyMs: p50,
        p95LatencyMs: p95,
        providers: Object.fromEntries(stats.providersUsed),
        errors: Object.fromEntries(stats.errorsByCode),
      };
    }

    const summary = {};
    for (const [name] of this.toolStats.entries()) {
      summary[name] = this.getMetrics(name);
    }
    return summary;
  }

  /**
   * Reset telemetry counters (useful for benchmarks/tests)
   */
  reset() {
    this.callLogs = [];
    this.toolStats.clear();
  }
}

export const toolTelemetry = new ToolTelemetryCollector();
export default toolTelemetry;
