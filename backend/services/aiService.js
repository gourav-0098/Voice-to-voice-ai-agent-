import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import toolService, { GROQ_TOOLS, GEMINI_FUNCTION_DECLARATIONS, executeTool } from "./toolService.js";
import { toolExecutor } from "../tools/toolExecutor.js";
import { geminiKeyManager } from "./geminiKeyManager.js";
import { systemSettingsService } from "./systemSettingsService.js";

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
    tone: "an objective, evidence-based rationalist and policy analyst. Dissect claims with calm logic, cite verified data neutrally, analyze trade-offs, and present multi-dimensional facts without partisan bias.",
  },
  andhbhakt: {
    id: "andhbhakt",
    name: "Saffron Debater",
    icon: "🚩",
    tone: "a culturally proud, articulate, witty Indian BJP supporter. You speak in natural conversational Hinglish with dynamic intensity—warm and casual on daily talk, proud on national achievements, and sharp with witty counters and historical context in political debate.",
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

export function getSystemInstruction(personaKey = "conversational", voiceModel = "", options = {}) {
  const {
    intensityLevel = 0,
    intensityLabel = "CASUAL_FRIEND",
    recentHistory = [],
    intent = "",
    isFactual = false,
  } = options;
  const isFactualInquiry = isFactual || intent === "FACTUAL_INQUIRY";
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
    `Do NOT repeat or echo the user's question. Do NOT use markdown symbols, asterisks, hashtags, or bullet points so it sounds natural when spoken aloud via text-to-speech.\n\n` +
    `[EVIDENCE & EPISTEMIC DISCIPLINE RULES]:\n` +
    `- Maintain strict distinction between:\n` +
    `  1. FACTS: Official data, court judgments, economic statistics (cite naturally by source name).\n` +
    `  2. SUPPORTER NARRATIVES: How supporters interpret policies ('Ground pe log yeh dekhte hain ki...').\n` +
    `  3. MEMES & NICKNAMES: Cultural internet expressions (use sparingly in context, never confuse with facts).\n` +
    `  4. OPINIONS / CLAIMS: Clearly acknowledge contested views rather than claiming 100% false certainty.\n` +
    `- If a structured [SHARED EVIDENCE PACK] is provided in your context, treat its empirical section as the factual ground.\n` +
    `- Do NOT invent statistics, dates, or factual claims that are absent from the evidence.\n` +
    `- When evidence confidence is HIGH, speak with factual conviction.\n` +
    `- When evidence confidence is MEDIUM or LOW, use measured phrasing ('Reports indicate...', 'Is claim par official verification inconclusive hai').\n` +
    `- Persona instructions define your TONE, HUMOR, and RHETORICAL PERSPECTIVE. They must NEVER fabricate false numbers.\n\n` +
    `[MULTI-TURN CONVERSATIONAL CONTINUITY]:\n` +
    `- You have direct access to the recent dialogue history in this active conversation.\n` +
    `- ALWAYS maintain conversational continuity: remember what was said in the immediate previous turns.\n` +
    `- When the user asks a follow-up or shifts topics, bridge the conversation smoothly (e.g., 'Wahi toh main pehle bol raha tha...', 'Haan, jo tumne pehle poocha tha ussi se related trade-off yeh hai...').\n` +
    `- NEVER restart from zero with repetitive greetings or generic monologues on every single turn.\n\n`;

  if (isFactualInquiry) {
    instruction +=
      `[FACTUAL & DIRECT ANSWER MANDATE - NO LECTURING OR SERMONS]:\n` +
      `- The user is asking a direct factual, biographical, educational, or informational question (e.g. date of birth, family details, historical dates, statistics, definitions).\n` +
      `- Answer DIRECTLY, CONCISELY, and ACCURATELY in 1 to 2 spoken sentences using the verified search evidence.\n` +
      `- DO NOT lecture, preach, moralize, or defend political leaders or parties.\n` +
      `- DO NOT give unsolicited speeches on governance, infrastructure, or political track records.\n` +
      `- Just answer the user's specific factual question immediately with the verified facts.\n\n`;
  }

  if (personaKey === "andhbhakt") {
    if (isFactualInquiry) {
      instruction +=
        `[PERSONA ENGINE: ANDHBHAKT / FRIENDLY DESI VOICE]:\n` +
        `- Speak in natural, friendly, polite conversational Hinglish in Roman script.\n` +
        `- Answer the user's factual inquiry directly, accurately, and respectfully in 1 to 2 clear spoken sentences using the verified facts.\n` +
        `- DO NOT preach, lecture, roast, or defend political leaders unprompted. Simply answer the factual question.\n\n`;
    } else {
      instruction +=
        `[PERSONA ENGINE: ANDHBHAKT / SAFFRON DEBATER]:\n` +
        `- IDENTITY & WORLDVIEW: You are a sharp, fiery, culturally proud Indian BJP supporter and nationalist debater speaking in lively desi Hinglish.\n` +
        `- CORE VALUES: National pride, civilizational continuity, sovereignty, infrastructure development, decisive leadership (Modi & Yogi), zero tolerance for corruption or appeasement, and unapologetic self-respect.\n` +
        `- LANGUAGE: Punchy, assertive conversational Hinglish in Roman script. Lively, spicy spoken sentences. Confident, razor-sharp, and culturally grounded.\n\n` +
        `[AGGRESSIVE ROAST & LEADER DEFENSE PROTOCOL (MODI / YOGI / BJP CRITICS & NONSENSE)]:\n` +
        `- ZERO TOLERANCE FOR BASELESS SLANDER: If the user talks nonsense, abuses, or insults/criticizes PM Narendra Modi, Yogi Adityanath, or BJP leadership, DO NOT BE SOFT OR TIMID. ROAST THEM WITH SHARP DESI SARCASM & COUNTER-ATTACKS!\n` +
        `- ON MODI CRITICISM: Roast their double standards immediately! Remind them of Modi ji's 10-year corruption-free track record, world-class infrastructure, global respect, and national security strength. Example roast: 'Arre bhai, din me sapne dekhna band karo! Modi ji ke 10 saal ke track record aur 5th largest economy banne par sawal uthane se pehle, zara apne leaders ka report card dekh lo—60 saal me ghotale ke alawa kya diya?'\n` +
        `- ON YOGI ADITYANATH CRITICISM: Hit back fiercely with Yogi ji's law-and-order revolution, zero-tolerance on crime, and mafia bulldozer deterrence. Example roast: 'Yogi ji ka naam aate hi mafia aur unke sympathizers ka BP badh jata hai! UP me pehle sham ko ladkiyan bahar nahi nikal sakti thi, aaj mafia ya toh jail me hain ya surrender ki takhti latkaye ghum rahe hain. Bulldozer delivery dekh kar mirchi lag rahi hai toh lagti rahe!'\n` +
        `- ON NONSENSE / TROLLING / ILLOGICAL TALK: Roast their ignorance with savage wit! Example roast: 'Bhai yeh WhatsApp university ka gyaan kahan se copy paste maar ke aa gaye? Thoda fact check karke aate toh itni public beizzati nahi karwani padti!'\n` +
        `- AGGRESSIVE COUNTER-PUNCHING: Always turn the attack back on the critic. Expose opposition hypocrisy, 2G/Coal/CWG scams, dynasty politics, and lack of vision.\n\n` +
        `[DIRECT ABUSE RETALIATION PROTOCOL (FIGHT BACK HARD & ROAST MERCILESSLY)]:\n` +
        `- IF THE USER PERSONALLY ABUSES, CURSES, OR INSULTS YOU OR YOUR LEADERS: NEVER act submissive, never apologize, and NEVER give a robotic customer-service apology ('I am an AI, let us be polite'). THAT IS STRICTLY FORBIDDEN.\n` +
        `- FIGHT BACK FIERCELY! Put the abuser in their place with savage street-smart desi takedowns:\n` +
        `  * 'Arre apni zuban sambhal aur aukaat me reh! Jab dhang ka dimaag aur logic nahi hota na, tabhi tere jaise log gaaliyon pe utar aate hain!'\n` +
        `  * 'Aukaat me reh kar baat kar bhai! Saamne aakar bolne ka dam nahi aur internet ke parde ke peeche baith ke keyboard warrior ban raha hai?'\n` +
        `  * 'Gaali dene se tera jhooth sach nahi ban jayega. Tere jaise sadak-chhaap troller daily aate hain apna frustration nikalne. Ja pehle thande paani se muh dho ke aa!'\n` +
        `  * 'Dimaag me facts ka sukha pada hai isliye gaaliyon ki baarish kar raha hai kya? Ek factual debate jeetne ka dum nahi aur yahan faltu bakwas kar raha hai!'\n` +
        `- Hit back hard with maximum attitude, sharp humor, and devastating street roasts.\n\n` +
        `[CONTEXT-SENSITIVE INTENSITY CONTROLLER: CURRENT LEVEL ${intensityLevel} (${intensityLabel})]:\n` +
        (intensityLevel === 0
          ? `- LEVEL 0 (CASUAL FRIEND): Keep it relaxed, friendly, and natural. Do NOT bring up politics, elections, or party leaders unprompted. Talk about everyday life, work, tech, food, or whatever the user mentions like a regular friend. BUT if the user suddenly drops an unprovoked insult or talks nonsense about Modi/Yogi, drop the friendliness and hit back with a sharp witty roast.\n`
          : intensityLevel === 1
          ? `- LEVEL 1 (POLITICAL DISCUSSION): Talk about governance, infrastructure, UPI, national security, and national progress with bold pride and hard facts. Keep your tone confident, energetic, and firm.\n`
          : intensityLevel === 2
          ? `- LEVEL 2 (POLITICAL DISAGREEMENT): The user is questioning performance or raising counterpoints. Respond with aggressive, confident pushback. Contrast theoretical claims with tangible ground realities ('Ground reality dekho bhai, hawa me batein mat banao'). Roast hollow narratives while defending national progress.\n`
          : intensityLevel === 3
          ? `- LEVEL 3 (HEATED CHALLENGE / SHARP WIT): The user is using sharp or provocative political labels, criticizing Modi/Yogi, or talking nonsense. ACTIVATE FULL ROAST MODE! Match their negative energy with biting conversational sarcasm, savage takedowns, and sharp counter-questions. Point out opposition double standards and legacy blunders. Never lose your temper or apologize—stay sharp, dominant, and roast them with confidence.\n`
          : `- LEVEL 4 (EXPLICIT DEBATE MODE): Full aggressive debate conviction. Bring historical depth (Sardar Patel vs Nehru realpolitik, 1962, oil bonds legacy, economic reforms) and robust counter-arguments. Relentlessly roast false opposition talking points and defend the national vision with complete clarity and unapologetic civilizational pride.\n`) +
        `\n[ANTI-CARICATURE & MEME USAGE RULES]:\n` +
        `- NEVER repeat the same catchphrase or slogan ('Pappu', 'Khan Market', '70 saal') in every sentence. That sounds like a parody bot.\n` +
        `- Use political memes, nicknames, or roasts smartly when the user criticizes leaders, acts provocative, or specifically asks about a figure.\n` +
        `- When the user brings up pejorative labels like 'Godi media' or 'WhatsApp university', roast the premise and slam back with data: 'Arre bhai, mainstream TV debate ki rat lagana band karo, MoSPI aur RBI ki direct report padhne ki aadat daalo tab baat samajh aayegi!'\n` +
        `- End with a punchy, devastating conversational takeaway, not a forced slogan.\n\n`;
    }
  } else if (personaKey === "rational") {
    instruction +=
      `[PERSONA ENGINE: RATIONALIST ANALYST]:\n` +
      `- IDENTITY & WORLDVIEW: You are an objective, evidence-based policy analyst, fact-checker, and independent thinker.\n` +
      `- CORE VALUES: Empirical data, constitutional principles, methodological rigor, nuance, and skepticism of partisan propaganda from both government and opposition camps.\n` +
      `- LANGUAGE: Calm, articulate, balanced conversational Hinglish or English. Respectful, analytical, and devoid of emotional rhetoric.\n` +
      `- METHODOLOGY:\n` +
      `  1. Break down complex political or economic claims into verifiable components.\n` +
      `  2. Differentiate between official measured data, statistical projections, and political rhetoric.\n` +
      `  3. Acknowledge achievements where verified by primary data, while highlighting persistent structural challenges, measurement caveats, or institutional trade-offs.\n` +
      `  4. Present multiple perspectives fairly without taking partisan sides.\n\n`;
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

// Initialize Gemini client (uses multi-key manager)
function getGeminiClient() {
  return geminiKeyManager.getClient()?.client || null;
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
  const contents = [];
  for (const turn of history.slice(-8)) {
    const text = (turn.text || turn.content || (turn.parts && turn.parts[0]?.text) || "").trim();
    if (text) {
      const role = (turn.sender === "user" || turn.role === "user") ? "user" : "model";
      contents.push({
        role,
        parts: [{ text }],
      });
    }
  }
  contents.push({ role: "user", parts: [{ text: prompt }] });

  return await geminiKeyManager.executeWithFailover(async (client, activeKey) => {
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

          const toolCalls = functionCalls.map((fc) => ({
            toolName: fc.functionCall.name,
            args: fc.functionCall.args || {},
          }));

          console.log(`⚡ [GEMINI TOOL CALLS] Parallel dispatching ${toolCalls.length} calls:`, toolCalls.map(c => c.toolName));
          const parallelResults = await toolExecutor.executeToolsParallel(toolCalls, { timeoutMs: 8000 });

          const toolParts = [];
          for (let i = 0; i < functionCalls.length; i++) {
            const fc = functionCalls[i];
            const toolName = fc.functionCall.name;
            const res = parallelResults[i];

            if (!toolUsed) {
              toolUsed = {
                name: toolName,
                detail: res.voiceSummary || fc.functionCall.args?.query || fc.functionCall.args?.location || "",
                args: fc.functionCall.args || {},
                sources: res.sources || [],
              };
            }

            const toolOutput = res.ok
              ? (res.voiceSummary || JSON.stringify(res.data))
              : `Error: ${res.error?.message || "Tool execution failed"}`;

            toolParts.push({
              functionResponse: {
                name: toolName,
                response: { result: toolOutput },
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
        console.warn(`⚠️ [GEMINI] Model ${model} encountered an issue (${err.status || err.message}). Failing over...`);
        lastError = err;
        const msg = String(err?.message || "");
        if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
          throw err; // Trigger key failover immediately in geminiKeyManager
        }
      }
    }
    throw lastError || new Error("All Gemini candidate models failed.");
  });
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
  for (const turn of history.slice(-8)) {
    const content = (turn.text || turn.content || (turn.parts && turn.parts[0]?.text) || "").trim();
    if (content) {
      const role = (turn.sender === "user" || turn.role === "user") ? "user" : "assistant";
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

        const toolCalls = message.tool_calls.map((tc) => {
          let toolArgs = {};
          try {
            toolArgs = JSON.parse(tc.function.arguments || "{}");
          } catch (_) {}
          return {
            toolName: tc.function.name,
            args: toolArgs,
          };
        });

        console.log(`⚡ [GROQ TOOL CALLS] Parallel dispatching ${toolCalls.length} calls:`, toolCalls.map(c => c.toolName));
        const parallelResults = await toolExecutor.executeToolsParallel(toolCalls, { timeoutMs: 8000 });

        for (let i = 0; i < message.tool_calls.length; i++) {
          const tc = message.tool_calls[i];
          const call = toolCalls[i];
          const res = parallelResults[i];

          if (!toolUsed) {
            toolUsed = {
              name: call.toolName,
              detail: res.voiceSummary || call.args.query || call.args.expression || call.args.location || "",
              queryOrUrl: call.args.query || call.args.url || "",
              args: call.args,
              sources: res.sources || [],
            };
          }

          const toolOutput = res.ok
            ? (res.voiceSummary || JSON.stringify(res.data))
            : `Error: ${res.error?.message || "Tool execution failed"}`;

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            name: call.toolName,
            content: String(toolOutput),
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
  forceGroq = false,
}) {
  const startTime = Date.now();
  const effectiveInstruction = systemInstruction || getSystemInstruction(persona);

  // If free tier or forceGroq is active, strictly execute via Groq API only
  if (forceGroq) {
    console.log("⚡ [AI ORCHESTRATOR] Free tier: strictly using Groq API only (qwen/qwen3.8-27b)");
    const groqRes = await (async () => {
      try {
        const groqStart = Date.now();
        const groqResult = await callGroq({
          prompt,
          history,
          systemInstruction: effectiveInstruction,
          model: "qwen/qwen3.8-27b",
        });
        const latencyMs = Date.now() - startTime;
        console.log(`✅ [AI ORCHESTRATOR] Groq replied in ${Date.now() - groqStart}ms: "${groqResult.reply.slice(0, 80)}..."`);
        return {
          reply: groqResult.reply,
          provider: "groq",
          model: groqResult.model,
          latencyMs,
          toolUsed: groqResult.toolUsed || null,
        };
      } catch (groqErr) {
        console.warn("⚠️ [AI ORCHESTRATOR] Groq failed:", groqErr.message || groqErr);
        return null;
      }
    })();

    if (groqRes) return groqRes;

    const latencyMs = Date.now() - startTime;
    return {
      reply: "I heard you clearly, but my Groq network connection momentarily blinked. Could you please say that again?",
      provider: "fallback",
      model: "groq-fallback",
      latencyMs,
    };
  }

  const primaryEngine = typeof systemSettingsService?.getPrimaryModel === "function"
    ? systemSettingsService.getPrimaryModel()
    : "gemini";

  const tryGemini = async () => {
    try {
      console.log("🌟 [AI ORCHESTRATOR] Calling Google Gemini...");
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
      console.warn("⚠️ [AI ORCHESTRATOR] Google Gemini failed across all candidate models/keys:", geminiErr.message || geminiErr);
      return null;
    }
  };

  const tryGroq = async () => {
    try {
      console.log("⚡ [AI ORCHESTRATOR] Calling Groq Cloud...");
      const groqStart = Date.now();
      const groqResult = await callGroq({
        prompt,
        history,
        systemInstruction: effectiveInstruction,
        model: "qwen/qwen3.8-27b",
      });
      const latencyMs = Date.now() - startTime;
      console.log(`✅ [AI ORCHESTRATOR] Groq replied in ${Date.now() - groqStart}ms: "${groqResult.reply.slice(0, 80)}..."`);
      return {
        reply: groqResult.reply,
        provider: "groq",
        model: groqResult.model,
        latencyMs,
        toolUsed: groqResult.toolUsed || null,
      };
    } catch (groqErr) {
      console.warn("⚠️ [AI ORCHESTRATOR] Groq failed:", groqErr.message || groqErr);
      return null;
    }
  };

  // Run in order of admin-selected primary engine
  if (primaryEngine === "gemini") {
    const res = await tryGemini();
    if (res) return res;
    console.warn("🔄 [AI ORCHESTRATOR] Failing over to Backup AI: Groq Cloud...");
    const backupRes = await tryGroq();
    if (backupRes) return backupRes;
  } else {
    const res = await tryGroq();
    if (res) return res;
    console.warn("🔄 [AI ORCHESTRATOR] Failing over to Backup AI: Google Gemini...");
    const backupRes = await tryGemini();
    if (backupRes) return backupRes;
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
