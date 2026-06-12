import React from "react";
import { LLMConfig, ModelProvider } from "../types";
import { Settings, Cpu, Cloud, HelpCircle, Terminal, RefreshCw, AlertCircle, ChevronRight } from "lucide-react";

interface ProviderSelectorProps {
  config: LLMConfig;
  onChange: (config: LLMConfig) => void;
  onDiscoveredModelsChange?: (models: string[]) => void;
}

export default function ProviderSelector({ config, onChange, onDiscoveredModelsChange }: ProviderSelectorProps) {
  const [fetchedModels, setFetchedModels] = React.useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = React.useState<boolean>(false);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = React.useState<boolean>(true);

  const handleProviderChange = (provider: ModelProvider) => {
    let defaultModel = "gemini-3.5-flash";
    let defaultUrl = "";

    if (provider === "local_ollama") {
      defaultModel = "llama3.1";
      defaultUrl = "http://localhost:11434/v1";
    } else if (provider === "local_custom") {
      defaultModel = "mistral";
      defaultUrl = "http://127.0.0.1:8080/v1";
    }

    setFetchedModels([]);
    setFetchError(null);

    onChange({
      provider,
      modelName: defaultModel,
      endpointUrl: defaultUrl,
      apiKey: config.apiKey || ""
    });
  };

  const handleFieldChange = (field: keyof LLMConfig, value: string) => {
    onChange({
      ...config,
      [field]: value
    });
  };

  const fetchLocalModels = async () => {
    setIsFetchingModels(true);
    setFetchError(null);
    setFetchedModels([]);

    let url = config.endpointUrl || "";
    if (config.provider === "local_ollama" && !url) {
      url = "http://localhost:11434/v1";
    } else if (config.provider === "local_custom" && !url) {
      url = "http://127.0.0.1:8080/v1";
    }

    if (!url) {
      setFetchError("Please specify an Endpoint API URL first.");
      setIsFetchingModels(false);
      return;
    }

    // Automatically correct "ap1" typo in state right away if it's there
    let correctedUrlFromInput = url;
    if (url.includes("/ap1/")) {
      correctedUrlFromInput = url.replace("/ap1/", "/api/");
    } else if (url.endsWith("/ap1")) {
      correctedUrlFromInput = url.slice(0, -4) + "/api";
    }
    
    if (correctedUrlFromInput !== url) {
      url = correctedUrlFromInput;
      handleFieldChange("endpointUrl", url);
    }

    if (url.endsWith("/")) {
      url = url.slice(0, -1);
    }

    try {
      const headers: Record<string, string> = {
        "Accept": "application/json",
      };
      if (config.apiKey) {
        headers["Authorization"] = `Bearer ${config.apiKey}`;
      }

      let fetchedSuccessfully = false;
      let finalModels: string[] = [];

      // 1. Try standard OpenAI compatible endpoint in the browser (works for localhost/same-host instances)
      try {
        const response = await fetch(`${url}/models`, {
          method: "GET",
          headers,
        });

        if (response.ok) {
          const data = await response.json();
          if (data && Array.isArray(data.data)) {
            finalModels = data.data.map((m: any) => m.id).filter(Boolean);
            fetchedSuccessfully = true;
          } else if (data && Array.isArray(data.models)) {
            finalModels = data.models.map((m: any) => m.name || m.id).filter(Boolean);
            fetchedSuccessfully = true;
          }
        }
      } catch (e) {
        console.warn("Direct browser /models endpoint failed, trying fallback:", e);
      }

      // 2. Try Ollama specific tags fallback endpoint (un-prefixed by v1 or direct)
      if (!fetchedSuccessfully) {
        try {
          const baseOllama = url.replace(/\/v1\/?$/, ""); // strip /v1 if present
          const tagsUrl = `${baseOllama}/api/tags`;
          const response = await fetch(tagsUrl, {
            method: "GET",
            headers: { "Accept": "application/json" }
          });

          if (response.ok) {
            const data = await response.json();
            if (data && Array.isArray(data.models)) {
              finalModels = data.models.map((m: any) => m.name || m.model).filter(Boolean);
              fetchedSuccessfully = true;
            }
          }
        } catch (e) {
          console.warn("Ollama fallback tags endpoint failed:", e);
        }
      }

      // 3. SECURE PROXY FALLBACK: If browser fetch failed (often due to HTTPS Mixed Content or CORS constraints with non-localhost IPs),
      // proxy via our Node.js back-end server which has full route capability and has no browser CORS restrictions!
      if (!fetchedSuccessfully) {
        try {
          const proxyResponse = await fetch("/api/scan-models", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              endpointUrl: url,
              apiKey: config.apiKey,
            }),
          });

          if (proxyResponse.ok) {
            const proxyData = await proxyResponse.json();
            if (proxyData.success && Array.isArray(proxyData.models)) {
              finalModels = proxyData.models;
              fetchedSuccessfully = true;
              
              if (proxyData.correctedUrl) {
                handleFieldChange("endpointUrl", proxyData.correctedUrl);
              }
            }
          }
        } catch (e) {
          console.warn("Server model-proxy fallback scan failed:", e);
        }
      }

      if (fetchedSuccessfully && finalModels.length > 0) {
        const uniqueModels = Array.from(new Set(finalModels)).sort();
        setFetchedModels(uniqueModels);
        if (onDiscoveredModelsChange) {
          onDiscoveredModelsChange(uniqueModels);
        }
        if (uniqueModels[0] && !uniqueModels.includes(config.modelName)) {
          handleFieldChange("modelName", uniqueModels[0]);
        }
      } else {
        throw new Error("No active models list returned from standard endpoints.");
      }
    } catch (err: any) {
      console.error(err);
      const isPrivateIP = url && (
        url.includes("192.168.") || 
        url.includes("10.") || 
        url.includes("172.") || 
        url.includes("100.")
      );

      if (window.location.protocol === "https:" && isPrivateIP && url.startsWith("http://")) {
        setFetchError(
          `Insecure Mixed Content Blocked: Browsers block HTTPS sites from querying local HTTP private IPs (like ${url}). To use this, either expose your LLM via a secure tunnel (e.g. "ngrok http 1234") or click the lock icon in Chrome next to the URL, open "Site settings", and change "Insecure content" to "Allow".`
        );
      } else {
        setFetchError(
          "Auto-scan failed. Verify your local model engine is running, the API URL is correct, or try exposing it via a secure HTTPS tunnel (e.g. ngrok)."
        );
      }
    } finally {
      setIsFetchingModels(false);
    }
  };

  return (
    <div id="provider-selector-container" className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between text-left focus:outline-none"
      >
        <div className="flex items-center gap-2 select-none">
          <Settings className="w-4 h-4 text-indigo-600" />
          <h4 className="font-sans font-bold text-slate-800 text-xs uppercase tracking-wider">LLM Core Engine</h4>
          {isCollapsed && (
            <span className="text-[10px] text-indigo-650 font-bold font-mono bg-indigo-50/70 px-2 py-0.5 rounded-md uppercase ml-1.5">
              {config.provider === "gemini" ? "Gemini" : "Local"} • {config.modelName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isCollapsed && (
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-mono font-semibold">
              {config.provider === "gemini" ? "Cloud Sync" : "Local Link"}
            </span>
          )}
          <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${!isCollapsed ? "rotate-90" : ""}`} />
        </div>
      </button>

      {!isCollapsed && (
        <div className="mt-4 pt-3 border-t border-slate-100 space-y-4 animate-in fade-in duration-200">
          <div className="grid grid-cols-3 gap-2.5">
        <button
          id="provider-btn-gemini"
          type="button"
          onClick={() => handleProviderChange("gemini")}
          className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all ${
            config.provider === "gemini"
              ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
              : "border-slate-200 hover:border-slate-300 text-slate-700 bg-slate-50 hover:bg-slate-100"
          }`}
        >
          <Cloud className="w-4 h-4 mb-1.5" />
          <span className="text-xs font-semibold font-sans">Gemini AI</span>
          <span className="text-[10px] opacity-75 mt-0.5 font-sans">Instance Free Tier</span>
        </button>

        <button
          id="provider-btn-ollama"
          type="button"
          onClick={() => handleProviderChange("local_ollama")}
          className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all ${
            config.provider === "local_ollama"
              ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
              : "border-slate-200 hover:border-slate-300 text-slate-700 bg-slate-50 hover:bg-slate-100"
          }`}
        >
          <Cpu className="w-4 h-4 mb-1.5" />
          <span className="text-xs font-semibold font-sans">Ollama</span>
          <span className="text-[10px] opacity-75 mt-0.5 font-sans">Local Port 11434</span>
        </button>

        <button
          id="provider-btn-custom"
          type="button"
          onClick={() => handleProviderChange("local_custom")}
          className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all ${
            config.provider === "local_custom"
              ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
              : "border-slate-200 hover:border-slate-300 text-slate-700 bg-slate-50 hover:bg-slate-100"
          }`}
        >
          <Terminal className="w-4 h-4 mb-1.5" />
          <span className="text-xs font-semibold font-sans">Custom URL</span>
          <span className="text-[10px] opacity-75 mt-0.5 font-sans">LM Studio / GPU</span>
        </button>
      </div>

      <div className="space-y-3.5">
        {config.provider !== "gemini" && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider text-slate-550" id="lbl-endpoint-url">
                ENDPOINT API URL
              </label>
              <button
                type="button"
                onClick={fetchLocalModels}
                disabled={isFetchingModels}
                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition"
              >
                <RefreshCw className={`w-3 h-3 ${isFetchingModels ? "animate-spin" : ""}`} />
                {isFetchingModels ? "Scanning..." : "Scan Available Models"}
              </button>
            </div>
            <input
              id="input-endpoint-url"
              type="text"
              value={config.endpointUrl || ""}
              onChange={(e) => {
                handleFieldChange("endpointUrl", e.target.value);
                setFetchedModels([]);
                setFetchError(null);
              }}
              placeholder="http://localhost:11434/v1"
              className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
            />
            {fetchError && (
              <p className="text-[10px] text-rose-600 mt-1.5 leading-normal flex items-start gap-1 font-sans bg-rose-50 border border-rose-150 p-2 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0 mt-0.5" />
                <span>{fetchError}</span>
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2" id="lbl-model-name animate-none">
            MODEL IDENTIFIER
          </label>
          <input
            id="input-model-name"
            type="text"
            value={config.modelName}
            onChange={(e) => handleFieldChange("modelName", e.target.value)}
            placeholder={config.provider === "gemini" ? "gemini-3.5-flash" : "llama3.1"}
            className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
          />

          {config.provider !== "gemini" && fetchedModels.length > 0 && (
            <div className="mt-2.5 bg-emerald-50/20 border border-emerald-100 rounded-lg p-2">
              <label className="block text-[9px] font-bold text-emerald-700 uppercase tracking-widest mb-1.5">
                ✦ Auto-Discovered Local Models
              </label>
              <select
                id="select-fetched-models"
                value={fetchedModels.includes(config.modelName) ? config.modelName : ""}
                onChange={(e) => {
                  if (e.target.value) {
                    handleFieldChange("modelName", e.target.value);
                  }
                }}
                className="w-full text-xs px-2.5 py-1.5 border border-emerald-200 rounded-lg bg-white text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">-- Select discovered model to autofill --</option>
                {fetchedModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {config.provider === "local_custom" && (
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2" id="lbl-custom-api-key">
              AUTHORIZATION TOKEN (OPTIONAL API KEY)
            </label>
            <input
              id="input-custom-api-key"
              type="password"
              value={config.apiKey || ""}
              onChange={(e) => handleFieldChange("apiKey", e.target.value)}
              placeholder="e.g. sk-..."
              className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        )}
      </div>

      {config.provider === "local_ollama" && (
        <div className="mt-4 bg-slate-50 border border-slate-200/60 rounded-lg p-3 text-xs text-slate-600 font-sans space-y-1.5 leading-relaxed">
          <div className="flex items-center gap-1.5 font-semibold text-slate-800">
            <HelpCircle className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
            <span>How to Bypass Local CORS Issues:</span>
          </div>
          <p>
            Standard browsers block requests from external websites to your <code className="bg-slate-200 text-slate-800 font-mono px-1 rounded">localhost</code> for security.
          </p>
          <p>
            To use Ollama, start it in your terminal with the following CORS origins enabled:
          </p>
          <pre className="g-slate-100 bg-slate-100/80 text-[10px] font-mono p-1.5 rounded border border-slate-200 text-slate-700 select-all overflow-x-auto whitespace-pre-wrap">
            OLLAMA_ORIGINS="*" ollama serve
          </pre>
          <p>
            If you load Ollama on a different hostname or via an <code className="bg-slate-200 text-slate-800 font-mono px-1 rounded">ngrok</code> tunnel, select <strong>Custom URL</strong> above to proxy through our cloud server.
          </p>
        </div>
      )}
      </div>
      )}
    </div>
  );
}
