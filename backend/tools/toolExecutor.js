import { toolRegistry } from "./toolRegistry.js";
import { toolTelemetry } from "./telemetry/toolTelemetry.js";
import { toolCache } from "./caching/toolCache.js";

const MAX_TOOL_CALLS_PER_TURN = 6;
const MAX_TOTAL_TOOL_TIME_MS = 15000;

/**
 * Validate input arguments against basic schema requirements
 */
function validateArgs(tool, args) {
  if (!tool.parameters || !tool.parameters.required) return null;

  for (const requiredField of tool.parameters.required) {
    if (args[requiredField] === undefined || args[requiredField] === null || String(args[requiredField]).trim() === "") {
      return `Missing required parameter: '${requiredField}'.`;
    }
  }

  return null;
}

/**
 * Production Tool Execution Engine
 */
export class ToolExecutor {
  constructor(registry = toolRegistry) {
    this.registry = registry;
  }

  /**
   * Execute a single tool call with validation, timeout, retry, backoff, and telemetry
   * 
   * @param {string} toolName - Name of tool to execute
   * @param {Object} [args={}] - Arguments for the tool
   * @param {Object} [context={}] - Execution context (requestId, userId, signal, etc.)
   * @returns {Promise<Object>} Normalized tool response contract
   */
  async executeTool(toolName, args = {}, context = {}) {
    const tStart = Date.now();
    const requestId = context.requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const userId = context.userId || null;

    const tool = this.registry.get(toolName);
    if (!tool) {
      const errResponse = {
        ok: false,
        tool: toolName,
        error: { code: "UNKNOWN_TOOL", message: `Tool "${toolName}" is not registered.`, retryable: false },
      };
      toolTelemetry.record({
        toolName,
        requestId,
        userId,
        durationMs: Date.now() - tStart,
        success: false,
        errorCode: "UNKNOWN_TOOL",
      });
      return errResponse;
    }

    // 1. Schema Validation
    const validationError = validateArgs(tool, args);
    if (validationError) {
      const errResponse = {
        ok: false,
        tool: toolName,
        error: { code: "INVALID_ARGUMENTS", message: validationError, retryable: false },
      };
      toolTelemetry.record({
        toolName,
        requestId,
        userId,
        durationMs: Date.now() - tStart,
        success: false,
        errorCode: "INVALID_ARGUMENTS",
      });
      return errResponse;
    }

    // 2. Retry Loop with Exponential Backoff
    const maxRetries = tool.retryPolicy?.maxRetries || 0;
    const baseBackoff = tool.retryPolicy?.backoffMs || 300;
    let attempt = 0;
    let lastError = null;

    while (attempt <= maxRetries) {
      attempt++;
      const timeoutMs = tool.timeoutMs || 5000;

      try {
        // Execute tool with timeout
        const toolPromise = tool.execute(args, { ...context, requestId });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout: Tool "${toolName}" exceeded limit of ${timeoutMs}ms.`)), timeoutMs)
        );

        const rawResult = await Promise.race([toolPromise, timeoutPromise]);

        // Normalize success response contract
        const normalized = {
          ok: rawResult.ok !== undefined ? rawResult.ok : true,
          tool: toolName,
          data: rawResult.data !== undefined ? rawResult.data : rawResult,
          sources: Array.isArray(rawResult.sources) ? rawResult.sources : [],
          metadata: {
            durationMs: Date.now() - tStart,
            retries: attempt - 1,
            cached: !!rawResult.metadata?.cached,
            ...(rawResult.metadata || {}),
          },
          voiceSummary: tool.formatVoiceSummary(rawResult),
        };

        toolTelemetry.record({
          toolName,
          requestId,
          userId,
          durationMs: Date.now() - tStart,
          success: normalized.ok,
          errorCode: normalized.ok ? null : normalized.error?.code,
          retryCount: attempt - 1,
          cacheHit: normalized.metadata.cached,
          sourceCount: normalized.sources.length,
        });

        return normalized;
      } catch (err) {
        lastError = err;
        console.warn(`⚠️ [TOOL EXECUTOR] Attempt ${attempt} failed for tool "${toolName}":`, err.message);

        // If not timeout and retries remaining, wait with exponential backoff
        if (attempt <= maxRetries && !err.message.includes("Timeout")) {
          const backoff = baseBackoff * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, backoff));
        } else {
          break;
        }
      }
    }

    // Failure contract
    const failureResponse = {
      ok: false,
      tool: toolName,
      error: {
        code: lastError?.message?.includes("Timeout") ? "TIMEOUT" : "EXECUTION_ERROR",
        message: lastError?.message || "Tool execution failed after maximum attempts.",
        retryable: false,
      },
      metadata: { durationMs: Date.now() - tStart, retries: attempt - 1 },
      voiceSummary: `I attempted to look up information using ${toolName}, but the service did not respond in time.`,
    };

    toolTelemetry.record({
      toolName,
      requestId,
      userId,
      durationMs: Date.now() - tStart,
      success: false,
      errorCode: failureResponse.error.code,
      retryCount: attempt - 1,
    });

    return failureResponse;
  }

  /**
   * Execute multiple independent tool calls in parallel with budget limit and deduplication
   * 
   * @param {Array<{name?: string, toolName?: string, args: Object}>} toolCalls
   * @param {Object} [context={}]
   * @returns {Promise<Array<Object>>} Normalized results array
   */
  async executeToolsParallel(toolCalls = [], context = {}) {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      return [];
    }

    const tStart = Date.now();
    const requestId = context.requestId || `batch_${Date.now()}`;

    // 1. Budget bounds (max 6 tool calls per turn)
    const callsToRun = toolCalls.slice(0, MAX_TOOL_CALLS_PER_TURN);

    // 2. Duplicate Call Prevention (execute unique signature once, fan results back to all callers)
    const executionMap = new Map();
    for (const call of callsToRun) {
      const toolName = call.toolName || call.name;
      const args = call.args || {};
      const sig = `${toolName}:${JSON.stringify(args)}`;

      if (!executionMap.has(sig)) {
        executionMap.set(
          sig,
          this.executeTool(toolName, args, { ...context, requestId })
        );
      } else {
        console.log(`⚡ [TOOL DEDUPLICATION] Reusing simultaneous call: "${toolName}" with identical args`);
      }
    }

    // 3. Parallel Execution with Promise.allSettled
    const settledEntries = await Promise.all(
      Array.from(executionMap.entries()).map(async ([sig, promise]) => {
        try {
          const res = await promise;
          return [sig, res];
        } catch (err) {
          return [
            sig,
            {
              ok: false,
              tool: sig.split(":")[0],
              error: { code: "UNHANDLED_ERROR", message: err.message, retryable: false },
              voiceSummary: "Tool execution failed unexpectedly.",
            },
          ];
        }
      })
    );

    const resultMap = new Map(settledEntries);

    // 4. Return results mapped back in original call order
    return callsToRun.map((call) => {
      const toolName = call.toolName || call.name;
      const args = call.args || {};
      const sig = `${toolName}:${JSON.stringify(args)}`;
      return resultMap.get(sig);
    });
  }
}

export const toolExecutor = new ToolExecutor();
export default toolExecutor;
