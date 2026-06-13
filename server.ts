import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { JURY_PERSONAS_POOL, DEFAULT_DEFENDER_TEMPLATE, DEFAULT_PROSECUTOR_TEMPLATE, DEFAULT_JUDGE_TEMPLATE, WORKFLOWS, EXTENSION_PERSONAS_POOL } from "./src/presets.js";

// Load environment variables
dotenv.config();

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
} else {
  console.warn("Waring: GEMINI_API_KEY environment variable is missing.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Generate system prompts using Gemini 3.5 Flash or custom LLM
  app.post("/api/generate-system-prompts", async (req, res) => {
    try {
      const { claim, workflowId, juryCount, llmConfig } = req.body;
      if (!claim || !workflowId) {
        return res.status(400).json({ error: "Missing required fields: claim, workflowId" });
      }

      const isGemini = !llmConfig || llmConfig.provider === "gemini";

      const workflow = WORKFLOWS.find((w) => w.id === workflowId) || WORKFLOWS[0];
      const activeJuries = req.body.customJurors || JURY_PERSONAS_POOL.slice(0, juryCount || 0);

      const juryProperties: Record<string, any> = {};
      activeJuries.forEach((j: any) => {
        juryProperties[j.id] = { type: Type.STRING };
      });

      const architectPrompt = `You are an Expert Multi-Agent System Prompt Architect.
Your task is to craft highly detailed, professional, and optimized system prompts for a team of LLM agents acting in a debate workflow.

The topic of debate (the Claim) is: "${claim}"
The workflow is: "${workflow.name}" (${workflow.description}).
We have:
- Defending Role: "${workflow.defendingTitle}"
- Prosecuting Role: "${workflow.prosecutingTitle}"
- Judging Role: "${workflow.judgingTitle}"
- Jury Members: ${activeJuries.length} members (non-experts who need to be genuinely convinced).

Below are the base templates. Please expand and tailor them specifically for the claim "${claim}". Integrate specific focus areas, domain jargon, and criteria for success.

--- BASE DEFENDER ATTORNEY TEMPLATE ---
${DEFAULT_DEFENDER_TEMPLATE}

--- BASE PROSECUTING ATTORNEY TEMPLATE ---
${DEFAULT_PROSECUTOR_TEMPLATE}

--- BASE JUDGE TEMPLATE ---
${DEFAULT_JUDGE_TEMPLATE}

--- JURY SPECIFICATIONS ---
Here are the profiles of the active jury members. Customise their system prompts to insert their personal bias, profession constraints, and specify how they (from their unique background) should analyze the claims about "${claim}". Make sure they maintain their specific identity.

${activeJuries.map((j: any) => `- ID: ${j.id}, Name: ${j.name}, Bio: ${j.description}, Bias: ${j.juryBias}, Template:\n${j.systemPromptTemplate}`).join("\n\n")}

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
    ${activeJuries.map((j: any) => `"${j.id}": "detailed prompt text for ${j.name}"`).join(",\n    ")}
  },
  "extensions": {
    "evidence_clerk": "detailed prompt text for Evidence Clerk",
    "practical_judge": "detailed prompt text for Practical Judge",
    "ethical_judge": "detailed prompt text for Ethical Judge",
    "scientific_judge": "detailed prompt text for Scientific Judge",
    "contrarian_auditor": "detailed prompt text for Contrarian Auditor"
  }
}`;

      if (isGemini) {
        if (!ai) {
          return res.status(500).json({
            error: "Gemini API client is not initialized. Please ensure GEMINI_API_KEY is configured in your secrets."
          });
        }

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: architectPrompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                defender: { type: Type.STRING },
                prosecutor: { type: Type.STRING },
                judge: { type: Type.STRING },
                jury: {
                  type: Type.OBJECT,
                  properties: juryProperties
                },
                extensions: {
                  type: Type.OBJECT,
                  properties: {
                    evidence_clerk: { type: Type.STRING },
                    practical_judge: { type: Type.STRING },
                    ethical_judge: { type: Type.STRING },
                    scientific_judge: { type: Type.STRING },
                    contrarian_auditor: { type: Type.STRING }
                  }
                }
              },
              required: ["defender", "prosecutor", "judge", "jury", "extensions"]
            }
          }
        });

        const text = response.text;
        if (!text) {
          throw new Error("Empty response from Prompt Architect.");
        }

        const parsedPrompts = JSON.parse(text);
        return res.json({ prompts: parsedPrompts });
      } else {
        // Option to proxy to an internet-available local custom endpoint
        let endpointUrl = llmConfig.endpointUrl;
        const modelName = llmConfig.modelName;

        if (!endpointUrl) {
          return res.status(400).json({ error: "Endpoint URL is required for custom model providers." });
        }

        // Normalization
        endpointUrl = endpointUrl.trim();
        if (endpointUrl.includes("/ap1/")) {
          endpointUrl = endpointUrl.replace("/ap1/", "/api/");
        } else if (endpointUrl.endsWith("/ap1")) {
          endpointUrl = endpointUrl.substring(0, endpointUrl.length - 4) + "/api";
        }
        const cleanEndpoint = endpointUrl.replace(/\/$/, "");

        let response;
        try {
          response = await fetch(`${cleanEndpoint}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(llmConfig.apiKey ? { "Authorization": `Bearer ${llmConfig.apiKey}` } : {})
            },
            body: JSON.stringify({
              model: modelName || "llama3.1",
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
            if (response.status === 400 && (errorText.includes("response_format") || errorText.includes("schema") || errorText.includes("type"))) {
              // Retry without response_format
              response = await fetch(`${cleanEndpoint}/chat/completions`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(llmConfig.apiKey ? { "Authorization": `Bearer ${llmConfig.apiKey}` } : {})
                },
                body: JSON.stringify({
                  model: modelName || "llama3.1",
                  messages: [
                    { role: "system", content: "You are a helpful assistant that outputs ONLY valid JSON response as instructed by user prompt." },
                    { role: "user", content: architectPrompt }
                  ],
                  temperature: 0.3
                })
              });
            } else {
              throw new Error(`Custom LLM endpoint responded with status ${response.status}: ${errorText}`);
            }
          }
        } catch (err: any) {
          try {
            response = await fetch(`${cleanEndpoint}/chat/completions`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(llmConfig.apiKey ? { "Authorization": `Bearer ${llmConfig.apiKey}` } : {})
              },
              body: JSON.stringify({
                model: modelName || "llama3.1",
                messages: [
                  { role: "system", content: "You are a helpful assistant that outputs ONLY valid JSON response as instructed by user prompt." },
                  { role: "user", content: architectPrompt }
                ],
                temperature: 0.3
              })
            });
          } catch (innerErr: any) {
            throw new Error(`Prompt Architect generation call failed: ${err.message || err}. Retry call failure: ${innerErr.message || innerErr}`);
          }
        }

        if (!response || !response.ok) {
          const errorText = response ? await response.text() : "No response";
          throw new Error(`Custom LLM endpoint responded with status ${response ? response.status : "unknown"}: ${errorText}`);
        }

        const responseData: any = await response.json();
        const rawText = responseData?.choices?.[0]?.message?.content || "";
        let parsedPrompts;
        try {
          parsedPrompts = JSON.parse(rawText.trim());
        } catch (e) {
          const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
          if (jsonMatch && jsonMatch[1]) {
            parsedPrompts = JSON.parse(jsonMatch[1].trim());
          } else {
            const curlyMatch = rawText.match(/\{[\s\S]*\}/);
            if (curlyMatch) {
              parsedPrompts = JSON.parse(curlyMatch[0].trim());
            } else {
              throw e;
            }
          }
        }

        return res.json({ prompts: parsedPrompts });
      }

    } catch (error: any) {
      console.error("Error generating prompts:", error);
      res.status(500).json({ error: error.message || "Failed to generate system prompts." });
    }
  });

  // API Route: Scan local models from the server-side to bypass Mixed Content / CORS
  app.post("/api/scan-models", async (req, res) => {
    try {
      const { endpointUrl, apiKey } = req.body;
      if (!endpointUrl) {
        return res.status(400).json({ error: "Endpoint URL is required." });
      }

      // Automatically correct common typos like `/ap1/` to `/api/`
      let url = endpointUrl.trim();
      const urlsToTry: string[] = [url];
      
      if (url.includes("/ap1/")) {
        urlsToTry.push(url.replace("/ap1/", "/api/"));
      } else if (url.endsWith("/ap1")) {
        urlsToTry.push(url.substring(0, url.length - 4) + "/api");
      }

      let lastError: any = null;
      let finalModels: string[] = [];
      let correctedUrl: string | undefined;

      // 1. Try standard OpenAI compatible endpoint: /models
      for (const targetUrl of urlsToTry) {
        let cleanUrl = targetUrl.replace(/\/$/, "");
        try {
          const headers: Record<string, string> = {
            "Accept": "application/json",
          };
          if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
          }

          const response = await fetch(`${cleanUrl}/models`, {
            method: "GET",
            headers,
          });

          if (response.ok) {
            const data: any = await response.json();
            if (data && Array.isArray(data.data)) {
              finalModels = data.data.map((m: any) => m.id).filter(Boolean);
            } else if (data && Array.isArray(data.models)) {
              finalModels = data.models.map((m: any) => m.name || m.id).filter(Boolean);
            }

            if (finalModels.length > 0) {
              if (targetUrl !== url) {
                correctedUrl = targetUrl;
              }
              break;
            }
          }
        } catch (err: any) {
          lastError = err;
        }
      }

      // 2. If standard /models failed, try Ollama api/tags endpoint
      if (finalModels.length === 0) {
        for (const targetUrl of urlsToTry) {
          let cleanUrl = targetUrl.replace(/\/$/, "");
          try {
            const baseOllama = cleanUrl.replace(/\/v1\/?$/, ""); // strip /v1 if present
            const response = await fetch(`${baseOllama}/api/tags`, {
              method: "GET",
              headers: { "Accept": "application/json" },
            });

            if (response.ok) {
              const data: any = await response.json();
              if (data && Array.isArray(data.models)) {
                finalModels = data.models.map((m: any) => m.name || m.model).filter(Boolean);
                if (finalModels.length > 0) {
                  if (targetUrl !== url) {
                    correctedUrl = targetUrl;
                  }
                  break;
                }
              }
            }
          } catch (err: any) {
            lastError = err;
          }
        }
      }

      if (finalModels.length > 0) {
        return res.json({ success: true, models: finalModels, correctedUrl });
      }

      throw lastError || new Error("Failed to scan active models or map endpoints.");
    } catch (error: any) {
      console.error("Error scanning models:", error);
      res.status(500).json({ error: error.message || "Failed to scan models." });
    }
  });

  // API Route: Run an individual debate step via Gemini
  app.post("/api/run-debate-step", async (req, res) => {
    try {
      const { agentId, systemPrompt, transcript, modelConfig, temperature, maxWords } = req.body;

      if (!agentId || !systemPrompt) {
        return res.status(400).json({ error: "Missing required fields: agentId, systemPrompt" });
      }

      const limitWords = maxWords || 1000;
      const isGemini = !modelConfig || modelConfig.provider === "gemini";

      if (isGemini) {
        if (!ai) {
          return res.status(500).json({
            error: "Gemini API client is not initialized server-side. Set GEMINI_API_KEY in Secrets."
          });
        }

        const modelName = modelConfig?.modelName || "gemini-3.5-flash";

        const completionPrompt = `The following is a verified, sequential historical log of our structured debate.
We are executing a separate sequential session to prevent message container poisoning. 

### DEBATE LOG TRANSCRIPT:
${transcript}

---
You are now speaking. Respond according to your assigned system instructions:
[YOUR SYSTEM PROMPT]
${systemPrompt}

Execute your turn. Speak as yourself and provide your argument, verdict, or evaluation under the guidelines.
CRITICAL CONSTRAINT: Your entire output MUST NOT exceed ${limitWords} words. Be concise, direct, and make every sentence count. Do not cut off mid-sentence, find a natural conclusion within this budget.`;

        const response = await ai.models.generateContent({
          model: modelName,
          contents: completionPrompt,
          config: {
            temperature: temperature ?? 0.7
          }
        });

        const outputText = response.text || "";
        return res.json({ text: outputText });
      } else {
        // Option to proxy to an internet-available local custom endpoint
        let endpointUrl = modelConfig.endpointUrl;
        const modelName = modelConfig.modelName;

        if (!endpointUrl) {
          return res.status(400).json({ error: "Endpoint URL is required for custom model providers." });
        }

        // Typos handling & trailing slash normalization
        endpointUrl = endpointUrl.trim();
        if (endpointUrl.includes("/ap1/")) {
          endpointUrl = endpointUrl.replace("/ap1/", "/api/");
        } else if (endpointUrl.endsWith("/ap1")) {
          endpointUrl = endpointUrl.substring(0, endpointUrl.length - 4) + "/api";
        }
        const cleanEndpoint = endpointUrl.replace(/\/$/, "");

        const customPrompt = `The following is a verified sequential log of our debate.
### DEBATE LOG TRANSCRIPT:
${transcript}

Speak as yourself based on your system instructions.
CRITICAL CONSTRAINT: Your entire output MUST NOT exceed ${limitWords} words. Be concise, direct, and make every sentence count.`;

        // OpenAI compatible chat completion post
        const response = await fetch(`${cleanEndpoint}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(modelConfig.apiKey ? { "Authorization": `Bearer ${modelConfig.apiKey}` } : {})
          },
          body: JSON.stringify({
            model: modelName,
            messages: [
              { role: "system", content: `${systemPrompt}\nNOTE: You MUST keep your answer under ${limitWords} words.` },
              { role: "user", content: customPrompt }
            ],
            temperature: temperature ?? 0.7,
            max_tokens: Math.min(2048, Math.max(500, Math.floor(limitWords * 1.5)))
          })
        });

        if (!response.ok) {
          const errMsg = await response.text();
          throw new Error(`Custom LLM endpoint responded with status ${response.status}: ${errMsg}`);
        }

        const data: any = await response.json();
        const outputText = data?.choices?.[0]?.message?.content || "";
        return res.json({ text: outputText });
      }

    } catch (error: any) {
      console.error("Error running debate step:", error);
      res.status(500).json({ error: error.message || "Failed to execute debate step." });
    }
  });

  // API Route: Proxy local model scans to bypass CORS/mixed-content restrictions in HTTPS browser context
  app.post("/api/proxy-models", async (req, res) => {
    try {
      let { url, apiKey } = req.body;
      if (!url) {
        return res.status(400).json({ error: "Missing required field: url" });
      }

      // Auto-correct ap1 typo before proxying
      if (url.includes("ap1")) {
        url = url.replace(/ap1/g, "api");
      }

      if (url.endsWith("/")) {
        url = url.slice(0, -1);
      }

      const headers: Record<string, string> = {
        "Accept": "application/json",
      };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      let fetchedSuccessfully = false;
      let responseData: any = null;

      // 1. Try standard OpenAI compatible models list
      try {
        const response = await fetch(`${url}/models`, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(6000), // 6 seconds timeout
        });

        if (response.ok) {
          responseData = await response.json();
          fetchedSuccessfully = true;
        }
      } catch (e: any) {
        console.warn(`[Proxy Scan] Direct /models endpoint failed for ${url}:`, e.message || e);
      }

      // 2. Try Ollama specific /api/tags endpoint
      if (!fetchedSuccessfully) {
        try {
          const baseOllama = url.replace(/\/v1\/?$/, ""); // strip /v1 if present
          const response = await fetch(`${baseOllama}/api/tags`, {
            method: "GET",
            headers: { "Accept": "application/json" },
            signal: AbortSignal.timeout(6000),
          });

          if (response.ok) {
            responseData = await response.json();
            fetchedSuccessfully = true;
          }
        } catch (e: any) {
          console.warn(`[Proxy Scan] Ollama /api/tags fallback failed for ${url}:`, e.message || e);
        }
      }

      if (fetchedSuccessfully && responseData) {
        return res.json({ status: "ok", data: responseData });
      }

      return res.status(502).json({
        error: `Could not reach local models endpoint at ${url} from the cloud container. If it is on a private network, make sure it is publicly accessible, or run via an HTTP tunnel (like ngrok).`
      });
    } catch (err: any) {
      console.error("Error in /api/proxy-models:", err);
      res.status(500).json({ error: err.message || "Failed to proxy models request." });
    }
  });

  // Serve static files in production setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express-Vite server successfully running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
