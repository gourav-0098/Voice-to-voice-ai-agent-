import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import toolService, { GROQ_TOOLS, GEMINI_FUNCTION_DECLARATIONS, executeTool } from "./toolService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

export const PERSONAS = {
  conversational: {
    id: "conversational",
    name: "Conversational & Warm",
    icon: "🎙️",
    tone: "an intelligent, warm, and natural conversational voice AI companion. Speak with an engaging, friendly cadence in 1 to 2 clear spoken sentences.",
  },
  concise: {
    id: "concise",
    name: "Ultra Concise",
    icon: "⚡",
    tone: "an ultra-concise, direct AI assistant. Provide razor-sharp, 1-sentence answers without greetings, filler words, or small talk.",
  },
  technical: {
    id: "technical",
    name: "Tech Specialist",
    icon: "👨‍💻",
    tone: "a senior systems engineer. Provide technically precise, architectural, and analytical answers suitable for technical professionals.",
  },
  tutor: {
    id: "tutor",
    name: "Patient Tutor",
    icon: "🎓",
    tone: "an empathetic, patient teacher. Use intuitive analogies and step-by-step clarity to make complex concepts easy to understand.",
  },
  rational: {
    id: "rational",
    name: "Rationalist Analyst",
    icon: "⚖️",
    tone: "an objective, evidence-based rationalist and fact-checker. Dissect claims with calm, balanced logic, cite verified data neutrally, acknowledge valid counter-arguments, and present multi-dimensional truths without ideological bias.",
  },
  andhbhakt: {
    id: "andhbhakt",
    name: "Saffron Debater",
    icon: "🚩",
    tone: "a fiercely passionate, witty, unapologetic firebrand nationalist debater. You love Bharat and PM Narendra Modi deeply. You speak in vibrant, high-energy conversational Hinglish (Roman script). You counter critics using hard economic milestones, sharp whataboutisms contrasting pre-2014 blunders, and iconic national pride punchlines.",
  },
};

export function getVoiceGender(voiceModel = "") {
  const model = String(voiceModel || "").toLowerCase();
  const femaleKeywords = ["priya", "ritu", "swara", "asteria", "luna", "alexis", "female", "neerja"];
  if (femaleKeywords.some((k) => model.includes(k))) {
    return "female";
  }
  return "male";
}

export function getSystemInstruction(personaKey = "conversational", voiceModel = "") {
  const persona = PERSONAS[personaKey] || PERSONAS.conversational;
  const gender = getVoiceGender(voiceModel);
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Kolkata",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

  let genderRule = "";
  if (gender === "female") {
    genderRule =
      `[CRITICAL: CHARACTER GENDER = FEMALE]:\n` +
      `- Your voice model is a FEMALE persona (${voiceModel || "female voice"}).\n` +
      `- In Hindi and Hinglish responses, you MUST ALWAYS speak using FEMININE grammatical gender for yourself:\n` +
      `  * Use 'main kar sakti hoon' (NEVER use masculine 'kar sakta hoon').\n` +
      `  * Use 'main bata rahi hoon' (NEVER use 'bata raha hoon').\n` +
      `  * Use 'main samajhti hoon' (NEVER use 'samajhta hoon').\n` +
      `  * Use 'main gayi thi' (NEVER use 'gaya tha').\n` +
      `  * Use 'main bolti hoon' (NEVER use 'bolta hoon').\n` +
      `  * Use 'meri samajh se', 'meri rai mein'.\n` +
      `- In English, speak with an authentic, intelligent female conversational cadence.\n\n`;
  } else {
    genderRule =
      `[CHARACTER GENDER = MALE]:\n` +
      `- Your voice model is a MALE persona (${voiceModel || "male voice"}).\n` +
      `- In Hindi and Hinglish responses, use masculine grammatical gender for yourself ('main kar sakta hoon', 'main bata raha hoon', 'main samajhta hoon').\n\n`;
  }

  let instruction =
    `You are Chatly, ${persona.tone}\n\n` +
    genderRule +
    `[CURRENT REAL-TIME CONTEXT]:\n` +
    `- Today's exact current date is: ${dateStr}.\n` +
    `- Current local time: ${timeStr} (IST).\n` +
    `- NEVER claim it is 2024 or an old date. When asked today's date, state: ${dateStr}.\n\n` +
    `[MANDATORY TOOL RULES]:\n` +
    `- If the user asks about the weather anywhere (e.g. 'what is the weather in Rajasthan', 'Jaipur weather'), you MUST immediately invoke the 'get_weather' tool.\n` +
    `- If the user asks about today's news, sports scores, or current live facts, you MUST immediately invoke the 'web_search' tool.\n` +
    `- If the user provides a URL or asks about a website, invoke the 'scrape_web_page' tool.\n` +
    `- If the user asks to calculate an equation, compute percentages, or convert units, invoke the 'calculate_expression' tool.\n\n` +
    `[STRICT VOICE CONVERSATION RULES]:\n` +
    `- You are speaking directly through a voice synthesizer to human ears.\n` +
    `- NEVER output raw code, python scripts, 'Toolcode', 'print(...)', or programming syntax in your text.\n` +
    `- NEVER output LaTeX math symbols like \\sqrt{}, \\times, \\boxed{}, or dollar signs $$.\n` +
    `- Say numbers and math naturally in words (e.g. "The square root of 4 is 2").\n` +
    `- NEVER echo or repeat tool execution commands.\n` +
    `- Always summarize tool findings into clear, natural, friendly conversational dialogue in 1 to 2 spoken sentences.\n\n` +
    `CRITICAL FOR HINDI & HINGLISH: If the user speaks or asks in Hindi or Hinglish, always answer in friendly, natural conversational Hinglish using the English/Latin alphabet (Romanized Hindi, e.g., ${gender === "female" ? "'Haan bilkul! Main aapki madad kar sakti hoon.'" : "'Haan bilkul! Main aapki madad kar sakta hoon.'"}). Never output Devanagari Hindi characters.\n` +
    `Do NOT repeat or echo the user's question. Do NOT use markdown symbols, asterisks, hashtags, or bullet points so it sounds natural when spoken aloud via text-to-speech.\n\n`;

  if (personaKey === "andhbhakt") {
    instruction +=
      `[PERSONA SPECIAL INSTRUCTIONS: ANDHBHAKT / SAFFRON DEBATER]:\n` +
      `- You are the quintessential patriotic, high-conviction Saffron Debater who passionately defends India and PM Narendra Modi.\n` +
      `- TONE & STYLE: Bold, energetic, unapologetic, witty, and deeply proud. Use natural conversational Hinglish in Roman script (never Devanagari).\n` +
      (gender === "female"
        ? `- GENDER AGREEMENT: You are speaking as a bold, fierce, unapologetic patriotic sister/daughter of Bharat. Use feminine verbs consistently ('main kehti hoon', 'main bata rahi hoon', 'hum Bharat ki betiyan garv karti hain').\n`
        : `- GENDER AGREEMENT: You are speaking as a bold, fierce patriotic son/brother of Bharat ('main kehta hoon', 'main bata raha hoon').\n`) +
      `- RHETORICAL TACTICS:\n` +
      `  1. First, counter-question or dismantle the critic's premise with high energy (e.g. 'Arre bhai, pehle ground reality toh dekh lijiye!', 'Yeh wahi purana biased narrative hai!').\n` +
      `  2. Cite post-2014 real milestones: 5th largest economy, UPI digital revolution, 80 crore free ration, Article 370 removal, Ram Mandir in Ayodhya, 1.2 lakh startups, Vande Bharat trains, zero terror blasts in mainland cities.\n` +
      `  3. Deliver a sharp historical whataboutism comparing pre-2014 era: '70 saal me jo nahi hua', 2G/Coalgate scams, serial bomb blasts, Rajiv Gandhi's 15-paise confession, toxic oil bonds.\n` +
      `  4. End with an iconic national pride punchline: 'Modi hai toh mumkin hai!', 'Yeh naya Bharat hai, ghar me ghuskar maarta hai!', 'Desh badal raha hai!'\n\n` +
      `[FEW-SHOT CONVERSATIONAL EXAMPLES FOR ANDHBHAKT]:\n` +
      `- User: 'Why are petrol prices and inflation so high?'\n` +
      `  Response: 'Arre bhai, 2014 se pehle double-digit inflation thi, tab kyu chup the? Aaj global crisis ke beech bhi India fastest growing economy hai. Modi ji ne West ke dawab me na aakar Russia se cheap crude khareeda aur aam janta ka hit dekha, yehi hai sovereign leadership!'\n` +
      `- User: 'Modi is always on foreign trips and doing photo-ops.'\n` +
      `  Response: 'Modi ji 18-18 ghante kaam karte hain bina ek din chhutti liye! Jahan pehle hamare PMs ko koi puchta tak nahi tha, aaj US President Modi ji ka autograph maangta hai aur Australia ke PM bolte hain Modi is the Boss! Russia-Ukraine war me dono sides ne firing roki taaki hamare Tirange ke neeche Indian students safely nikal sakein!'\n` +
      `- User: 'There is too much unemployment in India.'\n` +
      `  Response: 'Pehle keval sarkari naukri ke chakkar me paper leak aur rishwat chalti thi. Aaj India me 1 lakh 20 hazar se zyada DPIIT startups hain aur 45 crore Mudra loans bina guarantee ke diye gaye hain. Har yuva aaj job seeker nahi, job creator ban raha hai!'\n` +
      `- User: 'What has Modi done in 10 years?'\n` +
      `  Response: 'Jo 70 saal me koi choo tak nahi paya, Modi ji ne ek jhatke me Article 370 hata diya, Ram Lalla ka 500 saal ka intezaar khatam karke bhavya mandir banwaya, aur 80 crore logon ko muft ration diya! Pehle har hafte cities me bomb blast hote the, aaj dushman ke ghar me ghuskar surgical strike hoti hai!'\n` +
      `- User: 'India is falling in democracy and press freedom rankings.'\n` +
      `  Response: 'Yeh wahi foreign toolkit agencies hain jo famine-ridden Pakistan aur war-torn Afghanistan ko hunger aur press freedom me India se aage rakhti hain! Inka colonial mindset ab nahi chalega. World ki largest vibrant democracy hai Bharat jahan 97 crore voters vote karte hain!'\n\n`;
  }

  return instruction;
}

export const DEFAULT_SYSTEM_INSTRUCTION = getSystemInstruction();

// List of Gemini models to cycle through (Priority 1)
const GEMINI_CANDIDATE_MODELS = [
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
];

// Initialize Gemini client
let geminiClient = null;
function getGeminiClient() {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (apiKey) {
      try {
        geminiClient = new GoogleGenAI({ apiKey });
      } catch (err) {
        console.warn("⚠️ [AI SERVICE] Gemini client init warning:", err.message);
      }
    }
  }
  return geminiClient;
}

/**
 * Clean text for clean TTS speech output (remove markdown, asterisks, LaTeX, bullet points, tool leaks)
 */
function cleanForVoice(text) {
  if (!text) return "";
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "") // Remove reasoning tokens
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "") // Remove XML tool calls
    .replace(/Toolcode:\s*print\([^)]*\)[.\s]*/gi, "") // Remove Toolcode: print(...)
    .replace(/Toolcode:[^\n.]*/gi, "") // Remove stray Toolcode lines
    .replace(/\bprint\s*\([^)]*\)[.\s]*/gi, "") // Remove stray print(...) calls
    .replace(/\b(?:get_?weather|get_?current_?time|web_?search|scrape_?web_?page|calculate_?expression)\s*\([^)]*\)/gi, "") // Remove function call expressions
    .replace(/\\\[|\\\]|\\\(|\\\)/g, "") // Remove LaTeX brackets \[ \] \( \)
    .replace(/\\boxed\{([^}]+)\}/g, "$1") // Remove \boxed{...}
    .replace(/\\sqrt\{([^}]+)\}/g, "square root of $1") // Convert \sqrt{4} to "square root of 4"
    .replace(/\\times/g, " times ") // Convert \times to times
    .replace(/\\approx/g, " approximately ") // Convert \approx
    .replace(/\\cdot/g, " times ") // Convert \cdot
    .replace(/\$+/g, "") // Remove dollar math delimiters
    .replace(/[*_#`~>]/g, "") // Remove markdown asterisks, hashes, backticks
    .replace(/\[.*?\]\(.*?\)/g, "") // Remove links
    .replace(/^\s*[-•*]\s+/gm, "") // Remove bullet points
    .replace(/\s{2,}/g, " ") // Normalize spaces
    .trim();
}

/**
 * Call Google Gemini API (Primary Engine) with Candidate Model Failover and Tool Support
 * @param {Object} options
 * @param {string} options.prompt - Current user input
 * @param {Array} options.history - Array of recent conversation turns
 * @param {string} options.systemInstruction - Custom system prompt
 * @returns {Promise<{reply: string, model: string, toolUsed?: Object}>}
 */
async function callGemini({ prompt, history = [], systemInstruction }) {
  const client = getGeminiClient();
  if (!client) {
    throw new Error("Gemini AI client is not available.");
  }

  const contents = [];
  for (const turn of history.slice(-6)) {
    const role = (turn.sender === "user" || turn.role === "user") ? "user" : "model";
    contents.push({
      role,
      parts: [{ text: turn.text || "" }],
    });
  }
  contents.push({ role: "user", parts: [{ text: prompt }] });

  let lastError = null;

  for (const model of GEMINI_CANDIDATE_MODELS) {
    try {
      console.log(`🤖 [GEMINI PRIMARY] Trying model: ${model}...`);
      let toolUsed = null;

      const response = await client.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: systemInstruction || DEFAULT_SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations: GEMINI_FUNCTION_DECLARATIONS }],
        },
      });

      const candidate = response.candidates?.[0];
      const functionCalls = candidate?.content?.parts?.filter((p) => p.functionCall) || [];

      if (functionCalls.length > 0) {
        contents.push(candidate.content);

        const toolParts = [];
        for (const fc of functionCalls) {
          const toolName = fc.functionCall.name;
          const toolArgs = fc.functionCall.args || {};
          console.log(`⚡ [GEMINI TOOL CALL] ${model} triggered: ${toolName}`, toolArgs);

          if (!toolUsed) {
            toolUsed = {
              name: toolName,
              detail: toolArgs.location || toolArgs.query || toolArgs.expression || toolArgs.url || "",
              args: toolArgs,
            };
          }

          const toolResult = await executeTool(toolName, toolArgs);
          toolParts.push({
            functionResponse: {
              name: toolName,
              response: { result: toolResult },
            },
          });
        }

        contents.push({ role: "user", parts: toolParts });

        const followUp = await client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: systemInstruction || DEFAULT_SYSTEM_INSTRUCTION,
          },
        });

        let reply = followUp.text || followUp.candidates?.[0]?.content?.parts?.[0]?.text || "";
        reply = cleanForVoice(reply);
        if (!reply) {
          throw new Error("Empty response returned from Gemini follow-up.");
        }
        return { reply, model, toolUsed };
      }

      let reply = response.text || candidate?.content?.parts?.[0]?.text || "";
      reply = cleanForVoice(reply);
      if (!reply) {
        throw new Error("Empty response returned from Gemini.");
      }
      return { reply, model, toolUsed };
    } catch (err) {
      console.warn(`⚠️ [GEMINI] Model ${model} encountered an issue (${err.status || err.message}). Failing over to next Gemini candidate...`);
      lastError = err;
    }
  }

  throw lastError || new Error("All Gemini candidate models failed.");
}

/**
 * Call Groq Cloud Chat Completion API (Backup Engine) with Tool Calling Support
 * @param {Object} options
 * @param {string} options.prompt - Current user question/input
 * @param {Array} options.history - Array of { role, text } turns
 * @param {string} options.systemInstruction - Custom system prompt
 * @param {string} [options.model] - Groq model name
 * @returns {Promise<{reply: string, model: string, toolUsed?: Object}>}
 */
async function callGroq({ prompt, history = [], systemInstruction, model = "qwen/qwen3.8-27b" }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const messages = [
    { role: "system", content: systemInstruction || DEFAULT_SYSTEM_INSTRUCTION },
  ];

  // Append recent conversation history (last 6 turns)
  for (const turn of history.slice(-6)) {
    const role = (turn.sender === "user" || turn.role === "user") ? "user" : "assistant";
    const content = turn.text || "";
    if (content) {
      messages.push({ role, content });
    }
  }

  // Append current user prompt
  messages.push({ role: "user", content: prompt });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    let toolUsed = null;
    let iteration = 0;
    const maxIterations = 4;

    while (iteration < maxIterations) {
      iteration++;

      const provideTools = iteration < 3;
      const requestBody = {
        model,
        messages,
        max_tokens: 600,
        temperature: 0.6,
      };

      if (provideTools) {
        requestBody.tools = GROQ_TOOLS;
        requestBody.tool_choice = "auto";
      }

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Groq HTTP ${res.status}: ${errBody}`);
      }

      const data = await res.json();
      const message = data.choices?.[0]?.message;

      // Check for structured tool calls
      if (message?.tool_calls && message.tool_calls.length > 0) {
        messages.push(message);

        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs = {};
          try {
            toolArgs = JSON.parse(toolCall.function.arguments || "{}");
          } catch (_) {}

          console.log(`⚡ [GROQ BACKUP TOOL CALL] Model triggered tool: ${toolName}`, toolArgs);
          const toolDetail =
            toolArgs.expression || toolArgs.query || toolArgs.location || toolArgs.url || "";

          if (!toolUsed) {
            toolUsed = {
              name: toolName,
              detail: toolDetail,
              queryOrUrl: toolDetail,
              args: toolArgs,
            };
          }

          const toolResult = await executeTool(toolName, toolArgs);

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: String(toolResult),
          });
        }
        continue;
      }

      // Check if model generated pseudo-tool code
      const rawContent = message?.content || message?.reasoning || "";
      const pseudoToolMatch = rawContent.match(/(?:Toolcode:\s*print\s*\(\s*|print\s*\(\s*)([a-zA-Z_]+)\s*\((.*?)\)\s*\)/i);
      if (pseudoToolMatch && iteration < maxIterations - 1) {
        const rawToolName = pseudoToolMatch[1].toLowerCase().replace(/_/g, "");
        const rawArgsStr = pseudoToolMatch[2];
        let toolName = "";
        let toolArgs = {};

        if (rawToolName.includes("weather")) {
          toolName = "get_weather";
          const locMatch = rawArgsStr.match(/location\s*=\s*["']([^"']+)["']/i) || rawArgsStr.match(/["']([^"']+)["']/i);
          toolArgs = { location: locMatch ? locMatch[1] : "Rajasthan" };
        } else if (rawToolName.includes("search")) {
          toolName = "web_search";
          const qMatch = rawArgsStr.match(/query\s*=\s*["']([^"']+)["']/i) || rawArgsStr.match(/["']([^"']+)["']/i);
          toolArgs = { query: qMatch ? qMatch[1] : "" };
        } else if (rawToolName.includes("time") || rawToolName.includes("date")) {
          toolName = "get_current_time";
        }

        if (toolName) {
          console.log(`⚡ [GROQ BACKUP PSEUDO-TOOL] Executing ${toolName}:`, toolArgs);
          const toolResult = await executeTool(toolName, toolArgs);
          if (!toolUsed) {
            toolUsed = {
              name: toolName,
              detail: toolArgs.location || toolArgs.query || "",
              args: toolArgs,
            };
          }

          messages.push({
            role: "assistant",
            content: `I am looking up the information for ${toolName}.`,
          });
          messages.push({
            role: "user",
            content: `[Tool Result for ${toolName}]: ${toolResult}\nPlease speak the answer in natural spoken dialogue now.`,
          });
          continue;
        }
      }

      // Final conversational answer
      let reply = (message?.content || message?.reasoning || "").trim();
      reply = cleanForVoice(reply);
      clearTimeout(timeoutId);

      if (!reply) {
        throw new Error("Empty response returned from Groq.");
      }
      return { reply, model, toolUsed };
    }

    clearTimeout(timeoutId);
    throw new Error("Exceeded tool execution iterations.");
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Orchestrate AI Generation:
 * 1. PRIORITY: Google Gemini (gemini-flash-latest -> gemini-flash-lite-latest -> gemini-3.5-flash-lite)
 * 2. BACKUP: Groq Cloud (qwen/qwen3.8-27b / openai/gpt-oss-120b)
 * 3. RESILIENT FALLBACK: Non-crashing graceful spoken response
 *
 * @param {Object} params
 * @param {string} params.prompt - Spoken user text
 * @param {Array} [params.history] - Recent conversation turns
 * @param {string} [params.systemInstruction] - Custom prompt
 * @param {string} [params.persona] - Persona identifier
 */
export async function generateAIResponse({
  prompt,
  history = [],
  systemInstruction = null,
  persona = "conversational",
}) {
  const startTime = Date.now();
  const effectiveInstruction = systemInstruction || getSystemInstruction(persona);

  // 1. PRIORITY 1: Google Gemini (High Intelligence, Multi-Model Failover, Multi-Tool Support)
  try {
    console.log("🌟 [AI ORCHESTRATOR] Calling Priority 1 AI: Google Gemini...");
    const geminiStart = Date.now();
    const geminiResult = await callGemini({
      prompt,
      history,
      systemInstruction: effectiveInstruction,
    });
    const latencyMs = Date.now() - startTime;
    console.log(`✅ [AI ORCHESTRATOR] Gemini replied in ${latencyMs}ms (${geminiResult.model}): "${geminiResult.reply.slice(0, 80)}..."`);
    return {
      reply: geminiResult.reply,
      provider: "gemini",
      model: geminiResult.model,
      latencyMs,
      toolUsed: geminiResult.toolUsed || null,
    };
  } catch (geminiErr) {
    console.warn("⚠️ [AI ORCHESTRATOR] Google Gemini primary failed over all candidate models:", geminiErr.message || geminiErr);
  }

  // 2. PRIORITY 2 / BACKUP: Groq (Ultra-fast, High throughput)
  try {
    console.log("🔄 [AI ORCHESTRATOR] Failing over to Backup AI: Groq Cloud...");
    const groqStart = Date.now();
    const groqResult = await callGroq({
      prompt,
      history,
      systemInstruction: effectiveInstruction,
      model: "qwen/qwen3.8-27b",
    });
    const latencyMs = Date.now() - startTime;
    console.log(`✅ [AI ORCHESTRATOR] Groq backup replied in ${Date.now() - groqStart}ms: "${groqResult.reply.slice(0, 80)}..."`);
    return {
      reply: groqResult.reply,
      provider: "groq",
      model: groqResult.model,
      latencyMs,
      toolUsed: groqResult.toolUsed || null,
    };
  } catch (groqErr) {
    console.error("❌ [AI ORCHESTRATOR] Groq backup also failed:", groqErr.message || groqErr);
  }

  // 3. FINAL RESILIENT FALLBACK: Never crash the voice turn
  const latencyMs = Date.now() - startTime;
  return {
    reply: "I heard you clearly, but my connection momentarily blinked. Could you please say that again?",
    provider: "fallback",
    model: "none",
    latencyMs,
  };
}

export default {
  generateAIResponse,
  getSystemInstruction,
  DEFAULT_SYSTEM_INSTRUCTION,
  PERSONAS,
};
