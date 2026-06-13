import { LLMConfig, AgentRole } from "../types";
import {
  DEFAULT_DEFENDER_TEMPLATE,
  DEFAULT_PROSECUTOR_TEMPLATE,
  DEFAULT_JUDGE_TEMPLATE,
  EXTENSION_PERSONAS_POOL,
  WORKFLOWS
} from "../presets";

// Dynamic runner helper that handles Cloud Gemini, Server Proxied Custom LLMs, and Browser-Direct Ollama
export async function generateLocalSystemPrompts(params: {
  claim: string;
  workflowId: string;
  customJurors: any[];
  enabledExtensions: string[];
  modelConfig: LLMConfig;
}): Promise<any> {
  const { claim, workflowId, customJurors, enabledExtensions, modelConfig } = params;

  let rawEndpoint = modelConfig.endpointUrl || "http://localhost:11434/v1";
  rawEndpoint = rawEndpoint.trim();
  if (rawEndpoint.includes("/ap1/")) {
    rawEndpoint = rawEndpoint.replace("/ap1/", "/api/");
  } else if (rawEndpoint.endsWith("/ap1")) {
    rawEndpoint = rawEndpoint.slice(0, -4) + "/api";
  }
  const endpoint = rawEndpoint.replace(/\/$/, "");

  const currentWorkflow = WORKFLOWS.find((w) => w.id === workflowId) || WORKFLOWS[0];

  const architectPrompt = `You are an Expert Multi-Agent System Prompt Architect.
Your task is to craft highly detailed, professional, and optimized system prompts for a team of LLM agents acting in a debate workflow.

The topic of debate (the Claim) is: "${claim}"
The workflow is: "${currentWorkflow.name}" (${currentWorkflow.description}).
We have:
- Defending Role: "${currentWorkflow.defendingTitle}"
- Prosecuting Role: "${currentWorkflow.prosecutingTitle}"
- Judging Role: "${currentWorkflow.judgingTitle}"
- Jury Members: ${customJurors.length} members (non-experts who need to be genuinely convinced).

Below are the base templates. Please expand and tailor them specifically for the claim "${claim}". Integrate specific focus areas, domain jargon, and criteria for success.

--- BASE DEFENDER ATTORNEY TEMPLATE ---
${DEFAULT_DEFENDER_TEMPLATE}

--- BASE PROSECUTING ATTORNEY TEMPLATE ---
${DEFAULT_PROSECUTOR_TEMPLATE}

--- BASE JUDGE TEMPLATE ---
${DEFAULT_JUDGE_TEMPLATE}

--- JURY SPECIFICATIONS ---
Here are the profiles of the active jury members. Customise their system prompts to insert their personal bias, profession constraints, and specify how they (from their unique background) should analyze the claims about "${claim}". Make sure they maintain their specific identity.

${customJurors.map((j: any) => `- ID: ${j.id}, Name: ${j.name}, Bio: ${j.description}, Bias: ${j.juryBias}, Template:\n${j.systemPromptTemplate}`).join("\n\n")}

--- ADDITIONAL TRIBUNAL JUDICIAL EXTENSIONS ---
We also support optional specialized tribunal extension agents who analyze the debate. Please tailor their system prompts carefully to ensure they retain their strict guidelines, boundaries, and formatting output styles for the claim "${claim}".

${EXTENSION_PERSONAS_POOL.map((ext) => `* ROLE: ${ext.name}\n- Description: ${ext.description}\n- Base Template:\n${ext.systemPromptTemplate}`).join("\n\n")}

Your goal is to optimize these system prompts to produce rigorous, high-quality, and robust argumentative behaviors.
You MUST output a valid JSON block containing the fully populated and optimized system prompts.

Format output EXACTLY as this JSON structure:
{
  "defender": "detailed prompt text",
  "prosecutor": "detailed prompt text",
  "judge": "detailed prompt text",
  "jury": {
    ${customJurors.map((j: any) => `"${j.id}": "detailed prompt text for ${j.name}"`).join(",\n    ")}
  },
  "extensions": {
    "evidence_clerk": "detailed prompt text for Evidence Clerk",
    "practical_judge": "detailed prompt text for Practical Judge",
    "ethical_judge": "detailed prompt text for Ethical Judge",
    "scientific_judge": "detailed prompt text for Scientific Judge",
    "contrarian_auditor": "detailed prompt text for Contrarian Auditor"
  }
}`;

  let response;
  try {
    response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(modelConfig.apiKey ? { "Authorization": `Bearer ${modelConfig.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: modelConfig.modelName || "llama3.1",
        messages: [
          { role: "system", content: "You are a helpful assistant that outputs ONLY valid JSON response as instructed by user prompt." },
          { role: "user", content: architectPrompt }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      // If error is about response_format, retry without it
      if (response.status === 400 && (errorText.includes("response_format") || errorText.includes("schema") || errorText.includes("type"))) {
        response = await fetch(`${endpoint}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(modelConfig.apiKey ? { "Authorization": `Bearer ${modelConfig.apiKey}` } : {})
          },
          body: JSON.stringify({
            model: modelConfig.modelName || "llama3.1",
            messages: [
              { role: "system", content: "You are a helpful assistant that outputs ONLY valid JSON response as instructed by user prompt." },
              { role: "user", content: architectPrompt }
            ],
            temperature: 0.3
          })
        });
      } else {
        throw new Error(`Local model prompt generation returned status ${response.status}: ${errorText}`);
      }
    }
  } catch (err: any) {
    // If connection/fetch completely failed or has a bad parameter, try a clean call without response_format
    try {
      response = await fetch(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(modelConfig.apiKey ? { "Authorization": `Bearer ${modelConfig.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: modelConfig.modelName || "llama3.1",
          messages: [
            { role: "system", content: "You are a helpful assistant that outputs ONLY valid JSON response as instructed by user prompt." },
            { role: "user", content: architectPrompt }
          ],
          temperature: 0.3
        })
      });
    } catch (innerErr: any) {
      throw new Error(`Local model prompt generation failed: ${err.message || err}. Retry error: ${innerErr.message || innerErr}`);
    }
  }

  if (!response || !response.ok) {
    const errorText = response ? await response.text() : "No response";
    throw new Error(`Local model prompt generation returned status ${response ? response.status : "unknown"}: ${errorText}`);
  }

  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content || "";
  
  try {
    return JSON.parse(rawText.trim());
  } catch (jsonErr) {
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1].trim());
    }
    const curlyMatch = rawText.match(/\{[\s\S]*\}/);
    if (curlyMatch) {
      return JSON.parse(curlyMatch[0].trim());
    }
    throw jsonErr;
  }
}

// Dynamic runner helper that handles Cloud Gemini, Server Proxied Custom LLMs, and Browser-Direct Ollama
export async function runAgentTurn(params: {
  agentId: string;
  agentRole: AgentRole;
  systemPrompt: string;
  transcript: string;
  modelConfig: LLMConfig;
  temperature?: number;
  maxWords?: number;
}): Promise<string> {
  const { agentId, systemPrompt, transcript, modelConfig, temperature, maxWords = 1000 } = params;

  // Direct fetch for local or private IP-based model engines to prevent cloud subnet/firewall isolation
  const isDirectClientFetch =
    (modelConfig.provider === "local_ollama" || modelConfig.provider === "local_custom") &&
    (
      !modelConfig.endpointUrl ||
      modelConfig.endpointUrl.includes("localhost") ||
      modelConfig.endpointUrl.includes("127.0.0.1") ||
      modelConfig.endpointUrl.includes("0.0.0.0") ||
      modelConfig.endpointUrl.includes("192.168.") ||
      modelConfig.endpointUrl.includes("10.") ||
      modelConfig.endpointUrl.includes("172.") ||
      modelConfig.endpointUrl.includes("100.")
    );

  if (isDirectClientFetch) {
    let rawEndpoint = modelConfig.endpointUrl || "http://localhost:11434/v1";
    rawEndpoint = rawEndpoint.trim();
    if (rawEndpoint.includes("/ap1/")) {
      rawEndpoint = rawEndpoint.replace("/ap1/", "/api/");
    } else if (rawEndpoint.endsWith("/ap1")) {
      rawEndpoint = rawEndpoint.slice(0, -4) + "/api";
    }
    const endpoint = rawEndpoint.replace(/\/$/, "");
    
    const userPrompt = `The following is a verified, sequential historical log of our structured debate.
We are executing a separate sequential session to prevent message container poisoning. 

### DEBATE LOG TRANSCRIPT:
${transcript}

---
You are now speaking. Respond according to your assigned system instructions:
[YOUR SYSTEM PROMPT]
${systemPrompt}

Execute your turn. Speak as yourself and provide your argument, verdict, or evaluation under the guidelines.
CRITICAL CONSTRAINT: Your entire output MUST NOT exceed ${maxWords} words. Be concise, professional, and focus exclusively on core logical assertions.`;

    // Create abort controller for 15s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(modelConfig.apiKey ? { "Authorization": `Bearer ${modelConfig.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: modelConfig.modelName || "llama3.1",
          messages: [
            { role: "system", content: `${systemPrompt}\nNOTE: You MUST keep your answer under ${maxWords} words.` },
            { role: "user", content: userPrompt }
          ],
          temperature: temperature ?? 0.7,
          max_tokens: Math.min(2048, Math.max(500, Math.floor(maxWords * 1.5)))
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Local Ollama endpoint responded with status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return data?.choices?.[0]?.message?.content || "";
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Ollama connection timed out (15s limit). Please check your local server's performance, resource load, or if your network demands a proxy.`);
      }
      throw new Error(`Ollama connection failed: ${err.message || err}. Please ensure Ollama is running and started with OLLAMA_ORIGINS="*"`);
    }
  }

  // Otherwise, route through our Express server backend API
  const response = await fetch("/api/run-debate-step", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agentId,
      systemPrompt,
      transcript,
      modelConfig,
      temperature,
      maxWords,
    }),
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error || "Failed to execute debate turn via server.");
  }

  const result = await response.json();
  return result.text;
}

// Helper to extract jury metrics from structured agent texts
export function parseJuryMetric(text: string, defaultVal: number): { confidence: number; lean: "defender" | "prosecutor" | "undecided" } {
  try {
    // Look for standard ```json content ``` block
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      const data = JSON.parse(jsonMatch[1].trim());
      const confidence = Number(data.confidenceIndex || data.confidence || defaultVal);
      return {
        confidence: isNaN(confidence) ? defaultVal : Math.min(100, Math.max(0, confidence)),
        lean: data.lean || "undecided",
      };
    }

    // Direct JSON string search fallback if they returned it raw
    const rawMatch = text.match(/\{\s*"confidenceIndex"[\s\S]*?\}/);
    if (rawMatch) {
      const data = JSON.parse(rawMatch[0]);
      const confidence = Number(data.confidenceIndex || defaultVal);
      return {
        confidence: isNaN(confidence) ? defaultVal : Math.min(100, Math.max(0, confidence)),
        lean: data.lean || "undecided",
      };
    }
  } catch (e) {
    console.warn("Failed to parse jury feedback JSON block, using heuristics:", e);
  }

  // Pure heuristics fallback (regex scanning)
  let confidence = defaultVal;
  const ratingMatch = text.match(/(?:confidence|conviction|index|rating|score)\s*(?:index|level)?\s*(?::|of)?\s*(\d{1,3})/i);
  if (ratingMatch && ratingMatch[1]) {
    const val = parseInt(ratingMatch[1], 10);
    if (!isNaN(val) && val >= 0 && val <= 100) {
      confidence = val;
    }
  }

  let lean: "defender" | "prosecutor" | "undecided" = "undecided";
  if (/lean\s*:\s*(?:")?defender/i.test(text) || /vote\s*(?:for)?\s*defender/i.test(text) || /support\s*(?:the)?\s*claim/i.test(text)) {
    lean = "defender";
  } else if (/lean\s*:\s*(?:")?prosecutor/i.test(text) || /criticism|guilty|reject/i.test(text)) {
    lean = "prosecutor";
  }

  return { confidence, lean };
}
