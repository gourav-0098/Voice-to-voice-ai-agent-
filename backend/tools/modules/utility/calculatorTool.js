/**
 * Calculator & Math Evaluation Tool
 * Performs secure AST-based mathematical evaluation, percentages, and unit conversions.
 * Zero eval() or Function() usage - 100% sandboxed recursive-descent parser.
 */

export function safeEvaluate(expr) {
  let pos = 0;
  const tokens = expr.match(/(?:\d+\.\d+|\d+|\+|-|\*|\/|\*\*|%|\(|\))/g) || [];

  function parseExpression() { return parseAddition(); }
  function parseAddition() {
    let value = parseMultiplication();
    while (pos < tokens.length) {
      let token = tokens[pos];
      if (token === "+") { pos++; value += parseMultiplication(); }
      else if (token === "-") { pos++; value -= parseMultiplication(); }
      else break;
    }
    return value;
  }
  function parseMultiplication() {
    let value = parseExponentiation();
    while (pos < tokens.length) {
      let token = tokens[pos];
      if (token === "*") { pos++; value *= parseExponentiation(); }
      else if (token === "/") { pos++; value /= parseExponentiation(); }
      else if (token === "%") { pos++; value %= parseExponentiation(); }
      else break;
    }
    return value;
  }
  function parseExponentiation() {
    let value = parsePrimary();
    if (pos < tokens.length && tokens[pos] === "**") {
      pos++;
      value = Math.pow(value, parseExponentiation());
    }
    return value;
  }
  function parsePrimary() {
    if (pos >= tokens.length) throw new Error("Unexpected end");
    let token = tokens[pos++];
    if (token === "(") {
      let value = parseExpression();
      if (tokens[pos++] !== ")") throw new Error("Expected )");
      return value;
    }
    if (token === "+") return parsePrimary();
    if (token === "-") return -parsePrimary();
    return parseFloat(token);
  }

  const result = parseExpression();
  if (pos < tokens.length) throw new Error("Unexpected token");
  return result;
}

export function computeExpression(rawInput) {
  const rawExpr = String(rawInput || "").trim();
  if (!rawExpr) {
    return {
      ok: false,
      tool: "calculate_expression",
      error: { code: "INVALID_ARGUMENT", message: "Expression is required.", retryable: false },
    };
  }

  // Code injection and dangerous identifier detection
  if (/\b(process|require|import|global|window|document|eval|Function|prototype|constructor|__proto__)\b/i.test(rawExpr)) {
    return {
      ok: false,
      tool: "calculate_expression",
      error: { code: "SECURITY_VIOLATION", message: `Could not evaluate unsafe expression "${rawExpr}".`, retryable: false },
    };
  }

  let expr = rawExpr;

  try {
    // 1. Unit conversions
    const kmToMiles = expr.match(/^([\d.]+)\s*(?:km|kilometers?)\s*(?:to|in)\s*(?:miles?|mi)$/i);
    if (kmToMiles) {
      const val = parseFloat(kmToMiles[1]);
      const res = (val * 0.621371).toFixed(2);
      return {
        ok: true,
        tool: "calculate_expression",
        data: { expression: rawExpr, result: `${val} km = ${res} miles`, numericResult: Number(res) },
      };
    }

    const milesToKm = expr.match(/^([\d.]+)\s*(?:miles?|mi)\s*(?:to|in)\s*(?:km|kilometers?)$/i);
    if (milesToKm) {
      const val = parseFloat(milesToKm[1]);
      const res = (val * 1.60934).toFixed(2);
      return {
        ok: true,
        tool: "calculate_expression",
        data: { expression: rawExpr, result: `${val} miles = ${res} km`, numericResult: Number(res) },
      };
    }

    const cToF = expr.match(/^([\d.-]+)\s*(?:c|celsius)\s*(?:to|in)\s*(?:f|fahrenheit)$/i);
    if (cToF) {
      const val = parseFloat(cToF[1]);
      const res = ((val * 9) / 5 + 32).toFixed(1);
      return {
        ok: true,
        tool: "calculate_expression",
        data: { expression: rawExpr, result: `${val}°C = ${res}°F`, numericResult: Number(res) },
      };
    }

    const fToC = expr.match(/^([\d.-]+)\s*(?:f|fahrenheit)\s*(?:to|in)\s*(?:c|celsius)$/i);
    if (fToC) {
      const val = parseFloat(fToC[1]);
      const res = (((val - 32) * 5) / 9).toFixed(1);
      return {
        ok: true,
        tool: "calculate_expression",
        data: { expression: rawExpr, result: `${val}°F = ${res}°C`, numericResult: Number(res) },
      };
    }

    const kgToLbs = expr.match(/^([\d.]+)\s*(?:kg|kilograms?)\s*(?:to|in)\s*(?:lbs?|pounds?)$/i);
    if (kgToLbs) {
      const val = parseFloat(kgToLbs[1]);
      const res = (val * 2.20462).toFixed(2);
      return {
        ok: true,
        tool: "calculate_expression",
        data: { expression: rawExpr, result: `${val} kg = ${res} lbs`, numericResult: Number(res) },
      };
    }

    // 2. Percentages ("18% of 4500" -> "(18 / 100 * 4500)")
    expr = expr.replace(/([\d.]+)%\s*of\s*([\d.]+)/gi, "($1 / 100 * $2)");
    expr = expr.replace(/([\d.]+)%/g, "($1 / 100)");

    // 3. Word transformations
    expr = expr
      .replace(/\bplus\b/gi, "+")
      .replace(/\bminus\b/gi, "-")
      .replace(/\btimes\b|\bmultiplied by\b/gi, "*")
      .replace(/\bdivided by\b|\bover\b/gi, "/")
      .replace(/\^/g, "**")
      .replace(/x/gi, "*")
      .replace(/sqrt\(([^)]+)\)/gi, "Math.sqrt($1)")
      .replace(/abs\(([^)]+)\)/gi, "Math.abs($1)")
      .replace(/round\(([^)]+)\)/gi, "Math.round($1)");

    const sanitized = expr.replace(/[^0-9+\-*/().\s,Math.sqrtabsroundePI]/g, "");
    if (!sanitized.trim()) {
      return {
        ok: false,
        tool: "calculate_expression",
        error: { code: "INVALID_EXPRESSION", message: `Could not evaluate math expression "${rawExpr}".`, retryable: false },
      };
    }

    const val = safeEvaluate(sanitized);
    if (val === undefined || val === null || isNaN(val)) {
      return {
        ok: false,
        tool: "calculate_expression",
        error: { code: "EVALUATION_ERROR", message: "Result is undefined or NaN.", retryable: false },
      };
    }

    const formatted = Number.isInteger(val) ? val : Number(val.toFixed(4));

    return {
      ok: true,
      tool: "calculate_expression",
      data: {
        expression: rawExpr,
        result: `${rawExpr} = ${formatted}`,
        numericResult: formatted,
      },
    };
  } catch (err) {
    return {
      ok: false,
      tool: "calculate_expression",
      error: { code: "CALCULATION_ERROR", message: `Could not evaluate math expression "${rawExpr}": ${err.message}`, retryable: false },
    };
  }
}

export const calculatorTool = {
  name: "calculate_expression",
  description: "Perform precise arithmetic calculations, percentage computations (e.g. '18% of 5000'), and unit conversions (km to miles, Celsius to Fahrenheit, kg to lbs).",
  category: "utility",
  risk: "low",
  timeoutMs: 1000,
  cacheTtlMs: 0, // Instant
  retryPolicy: { maxRetries: 0, backoffMs: 0 },
  authPolicy: { required: false },

  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "The mathematical expression or conversion to evaluate (e.g. '18% of 4500', '(250 * 12) + 300', '100 km to miles')",
      },
    },
    required: ["expression"],
  },

  execute(args, context = {}) {
    return computeExpression(args.expression || args.expr);
  },

  formatVoiceSummary(result) {
    if (!result.ok) {
      return `I could not calculate that: ${result.error?.message || "invalid expression"}.`;
    }
    return result.data.result;
  },
};

export default calculatorTool;
