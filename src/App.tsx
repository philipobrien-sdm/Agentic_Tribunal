import React, { useState, useEffect, useCallback } from "react";
import { WORKFLOWS, JURY_PERSONAS_POOL, EXTENSION_PERSONAS_POOL, JURY_PROFESSIONS } from "./presets";
import { LLMConfig, AgentPersona, DebateMessage, DebateWorkflow } from "./types";
import { runAgentTurn, parseJuryMetric, generateLocalSystemPrompts } from "./utils/llm";

// Components
import ProviderSelector from "./components/ProviderSelector";
import AgentCard from "./components/AgentCard";
import JuryPanel from "./components/JuryPanel";
import DebateTimeline from "./components/DebateTimeline";

// Icons
import {
  Gavel,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Award,
  Users,
  CheckCircle,
  Clock,
  ChevronRight,
  Database,
  HelpCircle,
  FileText,
  MessageSquare,
  Save,
  FolderOpen,
  Download,
  Upload,
  Info,
  AlertTriangle,
  Sliders,
  X
} from "lucide-react";

const getIsolatedTranscript = (
  step: { id: string; role: any; agentId: string; round: number },
  messages: DebateMessage[],
  claim: string
): string => {
  if (messages.length === 0) {
    return `The debate is now in session to analyze the following claim:\n"${claim}"\n\nLet the debate begin.`;
  }

  const role = step.role;
  const currentRound = step.round;

  // 1. Extract summaries
  const summaries = messages.filter((m) => m.agentId === "system_summary");
  
  // 2. Extract standard messages
  const rawPastMessages = messages.filter((m) => m.agentId !== "system_summary");

  let result = `### CORE CLAIM UNDER ADJUDICATION:\n"${claim}"\n\n`;

  if (summaries.length > 0) {
    result += `### CONSOLIDATED SUMMARIES OF PRIOR DEBATE ROUNDS:\n`;
    summaries.forEach((s) => {
      // Clean display of the summary text
      result += `${s.content}\n\n`;
    });
    result += `---\n\n`;
  }

  // Focus on isolating Defender/Prosecutor based on concurrent blind drafting
  if (role === "defender") {
    // Defender cannot see Prosecutor concurrent posts from the currentRound
    const visibleRaw = rawPastMessages.filter((m) => {
      if (m.round < currentRound) return true;
      if (m.round === currentRound) {
        if (m.agentRole === "prosecutor") return false; // Hide concurrent prosecutor draft
        return true; // Keep Defender's own or system notes
      }
      return false;
    });

    if (visibleRaw.length > 0) {
      result += `### DETAILED RECORD OF PERMITTED HISTORICAL DIALOGUE:\n`;
      result += visibleRaw
        .map((m) => `#### ${m.agentName} (${m.agentRole.toUpperCase()}):\n${m.content}`)
        .join("\n\n---\n\n");
    }
  } else if (role === "prosecutor") {
    // Prosecutor cannot see Defender concurrent posts from the currentRound
    const visibleRaw = rawPastMessages.filter((m) => {
      if (m.round < currentRound) return true;
      if (m.round === currentRound) {
        if (m.agentRole === "defender") return false; // Hide concurrent defender draft
        return true;
      }
      return false;
    });

    if (visibleRaw.length > 0) {
      result += `### DETAILED RECORD OF PERMITTED HISTORICAL DIALOGUE:\n`;
      result += visibleRaw
        .map((m) => `#### ${m.agentName} (${m.agentRole.toUpperCase()}):\n${m.content}`)
        .join("\n\n---\n\n");
    }
  } else if (role === "judge") {
    // Neutral judge sees all round summaries and raw progress up to current point
    const visibleRaw = rawPastMessages.filter((m) => m.round <= currentRound);
    if (visibleRaw.length > 0) {
      result += `### SYSTEMATIC DIALOGUE PROGRESS (ALL TRANSCRIPTS):\n`;
      result += visibleRaw
        .map((m) => `#### ${m.agentName} (${m.agentRole.toUpperCase()}):\n${m.content}`)
        .join("\n\n---\n\n");
    }
  } else if (role === "jury") {
    // Jury sees everything up to current step
    const visibleRaw = rawPastMessages.filter((m) => m.round <= currentRound);
    if (visibleRaw.length > 0) {
      result += `### TRANSCRIPT BODY FOR JURY REVIEW:\n`;
      result += visibleRaw
        .map((m) => `#### ${m.agentName} (${m.agentRole.toUpperCase()}):\n${m.content}`)
        .join("\n\n---\n\n");
    }
  } else {
    // Extensions or other neutral actors
    const visibleRaw = rawPastMessages.filter((m) => m.round <= currentRound);
    if (visibleRaw.length > 0) {
      result += `### COMPREHENSIVE DIALOGUE HISTORY:\n`;
      result += visibleRaw
        .map((m) => `#### ${m.agentName} (${m.agentRole.toUpperCase()}):\n${m.content}`)
        .join("\n\n---\n\n");
    }
  }

  return result;
};

export default function App() {
  // ----------------------------------------------------
  // --- STATE DECLARATIONS ---
  // ----------------------------------------------------
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("courtroom");
  const [claim, setClaim] = useState<string>(WORKFLOWS[0].defaultClaim);
  const [juryCount, setJuryCount] = useState<number>(3); // Default 3 members
  const [juryPersonas, setJuryPersonas] = useState<AgentPersona[]>(() => {
    return JURY_PERSONAS_POOL.slice(0, 3).map((j) => ({
      ...j,
      modelName: "",
      temperature: 0.7,
      isEnabled: true,
    }));
  });
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [showReadmeModal, setShowReadmeModal] = useState<boolean>(false);
  const [enabledExtensions, setEnabledExtensions] = useState<string[]>([]);
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState<boolean>(false);
  const [roundsCount, setRoundsCount] = useState<number>(3); // Debate rounds (1..5)
  const [maxWords, setMaxWords] = useState<number>(1000); // Word limit restriction
  const [dynamicJuryEnabled, setDynamicJuryEnabled] = useState<boolean>(false); // Enable dynamic jury checks
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    workflow: false,
    jury: false,
    extensions: true,
    claim: false,
    performance: false,
  });
  
  const [session, setSession] = useState<{
    status: "idle" | "ready" | "running" | "paused" | "completed" | "error";
    currentRound: number;
    currentStepIndex: number;
    agents: AgentPersona[];
    messages: DebateMessage[];
    error?: string;
  }>({
    status: "idle",
    currentRound: 1,
    currentStepIndex: 0,
    agents: [],
    messages: [],
  });

  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    provider: "gemini",
    modelName: "gemini-3.5-flash",
  });

  const [isStepActive, setIsStepActive] = useState<boolean>(false);
  const [autoPlay, setAutoPlay] = useState<boolean>(false);

  // --- STATE FOR SESSION PERSISTENCE & TOAST ALERTS ---
  const [showSaveDropdown, setShowSaveDropdown] = useState<boolean>(false);
  const [showLoadDropdown, setShowLoadDropdown] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const triggerToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const saveStateToLocalStorage = () => {
    try {
      const dataToSave = {
        selectedWorkflowId,
        claim,
        juryCount,
        juryPersonas,
        enabledExtensions,
        session,
        llmConfig,
        roundsCount,
        maxWords,
        dynamicJuryEnabled
      };
      localStorage.setItem("agentic_tribunal_state", JSON.stringify(dataToSave));
      triggerToast("Tribunal state saved to browser storage!", "success");
      setShowSaveDropdown(false);
    } catch (err: any) {
      triggerToast(`Could not save state: ${err.message || err}`, "error");
    }
  };

  const loadStateFromLocalStorage = () => {
    const saved = localStorage.getItem("agentic_tribunal_state");
    if (!saved) {
      triggerToast("No saved tribunal session found in browser storage.", "info");
      setShowLoadDropdown(false);
      return;
    }
    try {
      const data = JSON.parse(saved);
      if (data.selectedWorkflowId) setSelectedWorkflowId(data.selectedWorkflowId);
      if (data.claim !== undefined) setClaim(data.claim);
      if (data.juryCount !== undefined) setJuryCount(data.juryCount);
      if (data.juryPersonas) setJuryPersonas(data.juryPersonas);
      if (data.enabledExtensions !== undefined) setEnabledExtensions(data.enabledExtensions);
      if (data.session) setSession(data.session);
      if (data.llmConfig) setLlmConfig(data.llmConfig);
      if (data.roundsCount !== undefined) setRoundsCount(data.roundsCount);
      if (data.maxWords !== undefined) setMaxWords(data.maxWords);
      if (data.dynamicJuryEnabled !== undefined) setDynamicJuryEnabled(data.dynamicJuryEnabled);
      triggerToast("Tribunal state loaded successfully from browser storage!", "success");
      setShowLoadDropdown(false);
    } catch (e: any) {
      triggerToast(`Failed to load session: ${e.message || e}`, "error");
    }
  };

  const exportStateToFile = () => {
    try {
      const dataToSave = {
        selectedWorkflowId,
        claim,
        juryCount,
        juryPersonas,
        enabledExtensions,
        session,
        llmConfig,
        roundsCount,
        maxWords,
        dynamicJuryEnabled,
        exportDate: new Date().toISOString()
      };
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataToSave, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `tribunal-session-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      triggerToast("Session configuration JSON file downloaded!", "success");
      setShowSaveDropdown(false);
    } catch (err: any) {
      triggerToast(`Failed to export session: ${err.message || err}`, "error");
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed.selectedWorkflowId) setSelectedWorkflowId(parsed.selectedWorkflowId);
          if (parsed.claim !== undefined) setClaim(parsed.claim);
          if (parsed.juryCount !== undefined) setJuryCount(parsed.juryCount);
          if (parsed.juryPersonas) setJuryPersonas(parsed.juryPersonas);
          if (parsed.enabledExtensions !== undefined) setEnabledExtensions(parsed.enabledExtensions);
          if (parsed.session) setSession(parsed.session);
          if (parsed.llmConfig) setLlmConfig(parsed.llmConfig);
          if (parsed.roundsCount !== undefined) setRoundsCount(parsed.roundsCount);
          if (parsed.maxWords !== undefined) setMaxWords(parsed.maxWords);
          if (parsed.dynamicJuryEnabled !== undefined) setDynamicJuryEnabled(parsed.dynamicJuryEnabled);
          triggerToast("Session configuration JSON imported successfully!", "success");
          setShowLoadDropdown(false);
        } catch (error: any) {
          triggerToast(`Invalid JSON file format: ${error.message || error}`, "error");
        }
      };
    }
  };

  // ----------------------------------------------------
  // --- CORE LIFECYCLE ---
  // ----------------------------------------------------
  const currentWorkflow = WORKFLOWS.find((w) => w.id === selectedWorkflowId) || WORKFLOWS[0];

  // Sync claim when preset changes, if we are in idle state
  useEffect(() => {
    if (session.status === "idle") {
      setClaim(currentWorkflow.defaultClaim);
    }
  }, [selectedWorkflowId, session.status]);

  // Construct debate dynamic schedule
  const debateSteps = React.useMemo(() => {
    const hasJury = juryCount > 0;
    const steps: { id: string; role: any; name: string; agentId: string; round: number }[] = [];

    // 1. Build Round steps (roundsCount)
    for (let k = 1; k <= roundsCount; k++) {
      steps.push({
        id: `defender_round_${k}`,
        role: "defender",
        name: k === 1 ? "Initial Defense Case Pitch" : `Defending Case Refinement (Round ${k})`,
        agentId: "defender",
        round: k,
      });

      steps.push({
        id: `prosecutor_round_${k}`,
        role: "prosecutor",
        name: k === 1 ? "Prosecutor Cross-Challenge" : `Prosecutor Refinement (Round ${k})`,
        agentId: "prosecutor",
        round: k,
      });

      if (hasJury && dynamicJuryEnabled) {
        steps.push({
          id: `jury_round_${k}`,
          role: "jury",
          name: `Jury Round ${k} Dynamic Issues Highlight`,
          agentId: "jury",
          round: k,
        });
      }

      // Add a virtual synthesis/consolidation step to keep prompts thin and structured
      steps.push({
        id: `summary_round_${k}`,
        role: "system_summary",
        name: `Round ${k} Consolidation (LLM Synthesized)`,
        agentId: "system_summary",
        round: k,
      });

      // Interim guidance review: Judge reviews the synthesis and offers strategic directives
      if (k < roundsCount) {
        steps.push({
          id: `judge_guidance_round_${k}`,
          role: "judge",
          name: `Interim Judicial Guidelines (Round ${k})`,
          agentId: "judge",
          round: k,
        });
      }
    }

    const finalRound = roundsCount + 1;

    // 2. Add Closing Arguments (Round R + 1)
    steps.push({
      id: "defender_closing",
      role: "defender",
      name: "Defense Closing Statement",
      agentId: "defender",
      round: finalRound,
    });

    steps.push({
      id: "prosecutor_closing",
      role: "prosecutor",
      name: "Prosecutor Closing Statement",
      agentId: "prosecutor",
      round: finalRound,
    });

    // 3. Specialized Audit Extensions (Round R + 1)
    enabledExtensions.forEach((extId) => {
      const extInfo = EXTENSION_PERSONAS_POOL.find((e) => e.id === extId);
      if (extInfo) {
        steps.push({
          id: `ext_${extId}`,
          role: extId as any,
          name: `${extInfo.name} Review & Evaluation`,
          agentId: extId,
          round: finalRound,
        });
      }
    });

    // 4. Final Citizen Jury Assessment (only if dynamic jury is off and juryCount > 0)
    if (hasJury && !dynamicJuryEnabled) {
      steps.push({
        id: "jury_final_review",
        role: "jury",
        name: "Final Citizen Jury Assessment",
        agentId: "jury",
        round: finalRound,
      });
    }

    // 5. Final binding judicial verdict (Judge decides, Jury only highlights)
    steps.push({
      id: "final_verdict",
      role: "judge",
      name: "Chief Judge Final Verdict",
      agentId: "judge",
      round: finalRound,
    });

    return steps;
  }, [roundsCount, dynamicJuryEnabled, juryCount, enabledExtensions]);

  // ----------------------------------------------------
  // --- ACTIONS ---
  // ----------------------------------------------------

  // Call the server to act as Prompt Architect and generate the tailored prompts
  const generateAgentPrompts = async () => {
    setIsGeneratingPrompts(true);
    setSession({
      status: "idle",
      currentRound: 1,
      currentStepIndex: 0,
      agents: [],
      messages: [],
    });

    try {
      const activeCustomJurors = juryPersonas.slice(0, juryCount).filter((j) => j.isEnabled !== false);
      let generated: any;

      const isDirectClientFetch =
        (llmConfig.provider === "local_ollama" || llmConfig.provider === "local_custom") &&
        (
          !llmConfig.endpointUrl ||
          llmConfig.endpointUrl.includes("localhost") ||
          llmConfig.endpointUrl.includes("127.0.0.1") ||
          llmConfig.endpointUrl.includes("0.0.0.0") ||
          llmConfig.endpointUrl.includes("192.168.") ||
          llmConfig.endpointUrl.includes("10.") ||
          llmConfig.endpointUrl.includes("172.") ||
          llmConfig.endpointUrl.includes("100.")
        );

      if (isDirectClientFetch) {
        generated = await generateLocalSystemPrompts({
          claim,
          workflowId: selectedWorkflowId,
          customJurors: activeCustomJurors,
          enabledExtensions,
          modelConfig: llmConfig,
        });
      } else {
        const response = await fetch("/api/generate-system-prompts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            claim,
            workflowId: selectedWorkflowId,
            juryCount: activeCustomJurors.length,
            customJurors: activeCustomJurors,
            enabledExtensions,
            llmConfig,
          }),
        });

        if (!response.ok) {
          const errVal = await response.json();
          throw new Error(errVal.error || "Failed to generate system prompts.");
        }

        const data = await response.json();
        generated = data.prompts;
      }

      // Construct final agent entities
      const loadedAgents: AgentPersona[] = [
        {
          id: "defender",
          name: currentWorkflow.defendingTitle,
          role: "defender",
          description: "Strive to justify and prove the core claim with logical evidence.",
          systemPromptTemplate: "",
          systemPrompt: generated.defender,
          color: "bg-emerald-500",
          avatar: "🛡️",
        },
        {
          id: "prosecutor",
          name: currentWorkflow.prosecutingTitle,
          role: "prosecutor",
          description: "Strive to break and expose structural errors in the core claim.",
          systemPromptTemplate: "",
          systemPrompt: generated.prosecutor,
          color: "bg-rose-500",
          avatar: "⚖️",
        },
        {
          id: "judge",
          name: currentWorkflow.judgingTitle,
          role: "judge",
          description: "Neutral structural reviewer and final synthesizer.",
          systemPromptTemplate: "",
          systemPrompt: generated.judge,
          color: "bg-violet-500",
          avatar: "👨‍⚖️",
        },
      ];

      // Seed selected juries
      activeCustomJurors.forEach((jury) => {
        const customPrompt = generated.jury?.[jury.id] || "You are a jury member analyzing arguments.";
        loadedAgents.push({
          ...jury,
          systemPrompt: customPrompt,
        });
      });

      // Seed selected specialized extensions
      enabledExtensions.forEach((extId) => {
        const extBase = EXTENSION_PERSONAS_POOL.find((e) => e.id === extId);
        if (extBase) {
          const customPrompt = generated.extensions?.[extId] || extBase.systemPromptTemplate;
          loadedAgents.push({
            ...extBase,
            systemPrompt: customPrompt,
          } as AgentPersona);
        }
      });

      setSession({
        status: "ready",
        currentRound: 1,
        currentStepIndex: 0,
        agents: loadedAgents,
        messages: [],
      });

    } catch (e: any) {
      console.error("Failed to generate: ", e);
      setSession((prev) => ({
        ...prev,
        status: "error",
        error: e.message || "Failed to generate specialized system prompts.",
      }));
    } finally {
      setIsGeneratingPrompts(false);
    }
  };

  // Run the next action step in our sequence
  const runNextStep = useCallback(async () => {
    if (session.status !== "ready" && session.status !== "running" && session.status !== "paused") return;
    if (session.currentStepIndex >= debateSteps.length) return;

    setIsStepActive(true);

    // Swap status to in progress
    setSession((prev) => ({
      ...prev,
      status: "running",
    }));

    const step = debateSteps[session.currentStepIndex];
    const customTranscript = getIsolatedTranscript(step, session.messages, claim);

    try {
      const updatedMessages = [...session.messages];

      // Handle the virtual system_summary step
      if (step.role === "system_summary") {
        const roundMessages = updatedMessages.filter((m) => m.round === step.round && m.agentId !== "system_summary");
        
        const summaryTranscript = `Review the following debates of this round:\n` +
          roundMessages.map(m => `### ${m.agentName} (${m.agentRole.toUpperCase()}):\n${m.content}`).join("\n\n---\n\n");

        const summaryPrompt = `You are an expert neutral summarizer. Synthesize the key points raised by both sides during round ${step.round}. Stay purely neutral, list their respective core assertions, and summarize any crucial jury/judgement feedback from this round. Limit your summary to under 150 words. Be concise and crisp.`;

        const speech = await runAgentTurn({
          agentId: "system_summary",
          agentRole: "judge", // Treat system summarizer as neutral judge structure
          systemPrompt: summaryPrompt,
          transcript: summaryTranscript,
          modelConfig: llmConfig,
          temperature: 0.3,
          maxWords: 150, // summarize/consolidate to keep context bloat-free
        });

        updatedMessages.push({
          id: `msg-summary-${step.round}-${Date.now()}`,
          round: step.round,
          stepName: step.name,
          agentId: "system_summary",
          agentName: `Round ${step.round} Synthesis ✨`,
          agentRole: "system" as any,
          content: `${speech}`,
          timestamp: new Date().toLocaleTimeString(),
        });

        const isLastStep = session.currentStepIndex + 1 >= debateSteps.length;
        setSession((prev) => ({
          ...prev,
          status: isLastStep ? "completed" : "paused",
          currentStepIndex: prev.currentStepIndex + 1,
          currentRound: isLastStep ? prev.currentRound : debateSteps[prev.currentStepIndex + 1]?.round || prev.currentRound,
          messages: updatedMessages,
        }));
        return;
      }

      // Handle jury steps (sequential turns with all sit-in voters)
      if (step.role === "jury") {
        const juryMembers = session.agents.filter((a) => a.role === "jury");
        const nextJurySentiments: Record<string, number> = {};

        // Loop over each jury member sequentially to let them speak their thoughts independently
        for (const jury of juryMembers) {
          // Use previous ratings or seeded base confidence as the baseline
          const lastMessage = updatedMessages[updatedMessages.length - 1];
          const previousConfidence =
            lastMessage?.juryConfidenceHistory?.[jury.id] ?? (jury.juryInitialConfidence || 50);

          const agentModelConfig = {
            ...llmConfig,
            ...(jury.modelName ? { modelName: jury.modelName } : {})
          };

          const speech = await runAgentTurn({
            agentId: jury.id,
            agentRole: "jury",
            systemPrompt: jury.systemPrompt,
            transcript: customTranscript,
            modelConfig: agentModelConfig,
            temperature: jury.temperature,
            maxWords: maxWords, // Apply dynamic length control
          });

          // Parse returned confidence rating and lean
          const parsed = parseJuryMetric(speech, previousConfidence);
          nextJurySentiments[jury.id] = parsed.confidence;

          // Push individual jury logs
          updatedMessages.push({
            id: `msg-${step.id}-${jury.id}-${Date.now()}`,
            round: step.round,
            stepName: step.name,
            agentId: jury.id,
            agentName: `${jury.name} (${jury.description.split(".")[0]})`,
            agentRole: "jury",
            content: `${speech}\n\n*Current Conviction Rating: ${parsed.confidence}% (Lean: ${parsed.lean.toUpperCase()})*`,
            timestamp: new Date().toLocaleTimeString(),
            juryConfidenceHistory: { ...nextJurySentiments }, // intermediate save
          });
        }

        // Apply updated confidence histories across all freshly generated jury turns
        const finalJurySentiments = { ...nextJurySentiments };
        // Clean and update back
        for (let idx = updatedMessages.length - juryMembers.length; idx < updatedMessages.length; idx++) {
          updatedMessages[idx].juryConfidenceHistory = finalJurySentiments;
        }

        const isLastStep = session.currentStepIndex + 1 >= debateSteps.length;
        setSession((prev) => ({
          ...prev,
          status: isLastStep ? "completed" : "paused",
          currentStepIndex: prev.currentStepIndex + 1,
          currentRound: isLastStep ? prev.currentRound : debateSteps[prev.currentStepIndex + 1]?.round || prev.currentRound,
          messages: updatedMessages,
        }));

      } else {
        // Standard agent (Prosecutor, Defender, Judge)
        const activeAgent = session.agents.find((a) => a.id === step.agentId);
        if (!activeAgent) throw new Error(`Active agent ${step.agentId} was not found.`);

        const agentModelConfig = {
          ...llmConfig,
          ...(activeAgent.modelName ? { modelName: activeAgent.modelName } : {})
        };

        const speech = await runAgentTurn({
          agentId: activeAgent.id,
          agentRole: activeAgent.role,
          systemPrompt: activeAgent.systemPrompt,
          transcript: customTranscript,
          modelConfig: agentModelConfig,
          temperature: activeAgent.temperature,
          maxWords: maxWords, // Apply dynamic length control
        });

        // Simulating the jury's reactive swaying factor.
        const previousJuryRatings = updatedMessages[updatedMessages.length - 1]?.juryConfidenceHistory || {};
        const simulatedSentiments: Record<string, number> = {};

        session.agents
          .filter((a) => a.role === "jury")
          .forEach((jury) => {
            const baseConf = previousJuryRatings[jury.id] ?? (jury.juryInitialConfidence || 50);
            
            // Heuristic adjustments based on speech content matching jury personas
            let offset = 0;
            if (activeAgent.role === "defender") {
              const lowerText = speech.toLowerCase();
              if (jury.id === "jury_1") { // Accountant
                offset = lowerText.includes("cost") || lowerText.includes("metric") || lowerText.includes("risk") ? 4 : -1;
              } else if (jury.id === "jury_2") { // Designer
                offset = lowerText.includes("people") || lowerText.includes("human") || lowerText.includes("ethic") ? 5 : -1;
              } else if (jury.id === "jury_3") { // Carpenter
                offset = lowerText.includes("practical") || lowerText.includes("simple") ? 4 : -2;
              } else {
                offset = 1;
              }
            } else if (activeAgent.role === "prosecutor") {
              const lowerText = speech.toLowerCase();
              if (jury.id === "jury_1") {
                offset = lowerText.includes("flaw") || lowerText.includes("consequence") ? -5 : 1;
              } else if (jury.id === "jury_3") {
                offset = lowerText.includes("expensive") || lowerText.includes("unreal") ? -6 : 1;
              } else {
                offset = -2;
              }
            }
            
            simulatedSentiments[jury.id] = Math.min(100, Math.max(0, baseConf + offset));
          });

        updatedMessages.push({
          id: `msg-${step.id}-${Date.now()}`,
          round: step.round,
          stepName: step.name,
          agentId: activeAgent.id,
          agentName: activeAgent.name,
          agentRole: activeAgent.role,
          content: speech,
          timestamp: new Date().toLocaleTimeString(),
          juryConfidenceHistory: juryCount > 0 ? simulatedSentiments : undefined,
        });

        const isLastStep = session.currentStepIndex + 1 >= debateSteps.length;
        setSession((prev) => ({
          ...prev,
          status: isLastStep ? "completed" : "paused",
          currentStepIndex: prev.currentStepIndex + 1,
          currentRound: isLastStep ? prev.currentRound : debateSteps[prev.currentStepIndex + 1]?.round || prev.currentRound,
          messages: updatedMessages,
        }));
      }

    } catch (e: any) {
      console.error("Error executing step: ", e);
      setSession((prev) => ({
        ...prev,
        status: "paused",
        error: e.message || "Failed to execute debate turn.",
      }));
      setAutoPlay(false);
    } finally {
      setIsStepActive(false);
    }
  }, [session, debateSteps, llmConfig, claim, juryCount, maxWords]);

  // Handle auto-playing loops
  useEffect(() => {
    let timer: any = null;
    if (autoPlay && session.status === "paused" && !isStepActive) {
      if (session.currentStepIndex < debateSteps.length) {
        timer = setTimeout(() => {
          runNextStep();
        }, 1500);
      } else {
        setAutoPlay(false);
      }
    }
    return () => clearTimeout(timer);
  }, [autoPlay, session.status, session.currentStepIndex, debateSteps.length, runNextStep, isStepActive]);

  const handleUpdateSystemPrompt = (agentId: string, newPrompt: string) => {
    setSession((prev) => {
      const updatedAgents = prev.agents.map((a) => {
        if (a.id === agentId) {
          return { ...a, systemPrompt: newPrompt };
        }
        return a;
      });
      return {
        ...prev,
        agents: updatedAgents,
      };
    });
  };

  const handleUpdateAgent = (agentId: string, updatedFields: Partial<AgentPersona>) => {
    setSession((prev) => {
      const updatedAgents = prev.agents.map((a) => {
        if (a.id === agentId) {
          return { ...a, ...updatedFields };
        }
        return a;
      });
      return {
        ...prev,
        agents: updatedAgents,
      };
    });
  };

  const startDebateSimulation = () => {
    setAutoPlay(true);
    runNextStep();
  };

  const pauseDebateSimulation = () => {
    setAutoPlay(false);
  };

  const resetDebate = () => {
    setAutoPlay(false);
    setSession({
      status: "idle",
      currentRound: 1,
      currentStepIndex: 0,
      agents: [],
      messages: [],
    });
  };

  return (
    <div id="main-app" className="min-h-screen bg-slate-100 text-slate-900 flex flex-col antialiased">
      {/* Top Header navbar */}
      <nav className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-40 shadow-sm flex-shrink-0">
        <div className="max-w-7xl w-full mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/>
              </svg>
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight text-slate-900 flex items-center gap-1.5">
                AgenticTribunal <span className="text-slate-400 font-normal">v1.4.2</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-medium">
            {/* Session Save/Load persistence button group */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1 mr-1">
              {/* SAVE DROPDOWN */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowSaveDropdown(!showSaveDropdown);
                    setShowLoadDropdown(false);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-slate-200 text-slate-700 hover:text-slate-950 font-bold transition-all"
                  aria-label="Save Session"
                >
                  <Save className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Save</span>
                </button>
                {showSaveDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowSaveDropdown(false)} />
                    <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                      <button
                        type="button"
                        onClick={saveStateToLocalStorage}
                        className="w-full text-left px-3.5 py-2 hover:bg-slate-50 text-slate-750 flex items-center gap-2.5 transition"
                      >
                        <Database className="w-4 h-4 text-slate-400" />
                        <div className="flex-1">
                          <p className="font-bold text-[11px] text-slate-800">Quick Save to Browser</p>
                          <p className="text-[9px] text-slate-400">Stores in local storage</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={exportStateToFile}
                        className="w-full text-left px-3.5 py-2 hover:bg-slate-50 text-indigo-600 border-t border-slate-100 flex items-center gap-2.5 transition"
                      >
                        <Download className="w-4 h-4 text-indigo-500" />
                        <div className="flex-1">
                          <p className="font-bold text-[11px]">Download Config file</p>
                          <p className="text-[9px] text-slate-400">Exports a .json file</p>
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* LOAD DROPDOWN */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowLoadDropdown(!showLoadDropdown);
                    setShowSaveDropdown(false);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-slate-200 text-slate-700 hover:text-slate-950 font-bold transition-all"
                  aria-label="Load Session"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Load</span>
                </button>
                {showLoadDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowLoadDropdown(false)} />
                    <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                      <button
                        type="button"
                        onClick={loadStateFromLocalStorage}
                        className="w-full text-left px-3.5 py-2 hover:bg-slate-50 text-slate-750 flex items-center gap-2.5 transition"
                      >
                        <Database className="w-4 h-4 text-slate-400" />
                        <div className="flex-1">
                          <p className="font-bold text-[11px] text-slate-800">Quick Load from Browser</p>
                          <p className="text-[9px] text-slate-400">Restores browser state</p>
                        </div>
                      </button>
                      <label className="w-full text-left px-3.5 py-2 hover:bg-slate-50 text-indigo-600 border-t border-slate-100 flex items-center gap-2.5 cursor-pointer transition">
                        <Upload className="w-4 h-4 text-indigo-500" />
                        <div className="flex-1">
                          <p className="font-bold text-[11px]">Upload Config file</p>
                          <p className="text-[9px] text-slate-400">Restores from .json file</p>
                        </div>
                        <input
                          type="file"
                          accept=".json"
                          onChange={handleImportFile}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              Local LLM: Active Arena
            </div>
            <div className="text-slate-400 hidden md:block">System Isolation: ON</div>
          </div>
        </div>
      </nav>

      {/* Primary Dashboard Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Setup Control Panels */}
        <div className="space-y-4 lg:col-span-1 pr-1.5 pb-4 flex flex-col justify-start gap-3.5">
          {session.status === "idle" ? (
            <>

              {/* Option 1: Debate Workflow Pathway (Collapsible Box) */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setCollapsedSections(prev => ({ ...prev, workflow: !prev.workflow }))}
                  className="w-full flex items-center justify-between p-3.5 text-left font-sans font-bold text-slate-800 text-xs hover:bg-slate-50/50 transition cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2">
                    <Gavel className="w-4 h-4 text-indigo-600" />
                    <span className="uppercase tracking-wider">Debate Workflow</span>
                    {collapsedSections.workflow && (
                      <span className="ml-1.5 text-[10px] text-indigo-650 font-bold font-mono bg-indigo-50/70 px-2 py-0.5 rounded-md uppercase">
                        {currentWorkflow.name}
                      </span>
                    )}
                  </div>
                  <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${!collapsedSections.workflow ? "rotate-90" : ""}`} />
                </button>
                {!collapsedSections.workflow && (
                  <div className="p-3.5 border-t border-slate-100 bg-white/50 space-y-3 animate-in fade-in duration-200">
                    <div className="grid grid-cols-1 gap-2">
                      {WORKFLOWS.map((flow) => (
                        <button
                          key={flow.id}
                          id={`preset-${flow.id}`}
                          type="button"
                          onClick={() => setSelectedWorkflowId(flow.id)}
                          className={`w-full text-left p-3 rounded-xl border text-xs transition-colors duration-150 flex flex-col justify-between cursor-pointer ${
                            selectedWorkflowId === flow.id
                              ? "border-indigo-600 bg-indigo-50/30 ring-1 ring-indigo-600"
                              : "border-slate-200 hover:border-slate-300 bg-white"
                          }`}
                        >
                          <div className="font-bold text-slate-900 flex items-center justify-between w-full">
                            <span className={selectedWorkflowId === flow.id ? "text-indigo-700" : ""}>{flow.name}</span>
                            {selectedWorkflowId === flow.id && (
                              <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-1">
                            {flow.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Option 2: Citizen Jury Panel (Collapsible Box) */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setCollapsedSections(prev => ({ ...prev, jury: !prev.jury }))}
                  className="w-full flex items-center justify-between p-3.5 text-left font-sans font-bold text-slate-800 text-xs hover:bg-slate-50/50 transition cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span className="uppercase tracking-wider">Citizen Jury Panel</span>
                    {collapsedSections.jury && (
                      <span className="ml-1.5 text-[10px] text-indigo-650 font-bold font-mono bg-indigo-50/70 px-2 py-0.5 rounded-md uppercase">
                        {juryCount === 0 ? "Off" : `${juryCount} Citizens`}
                      </span>
                    )}
                  </div>
                  <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${!collapsedSections.jury ? "rotate-90" : ""}`} />
                </button>
                {!collapsedSections.jury && (
                  <div className="p-3.5 border-t border-slate-100 bg-white/50 space-y-3.5 animate-in fade-in duration-200">
                    <div className="flex gap-1.5 p-1 bg-slate-50 rounded-xl border border-slate-200">
                      {[0, 1, 2, 3, 5].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => {
                            setJuryCount(num);
                            setJuryPersonas((prev) => {
                              if (prev.length >= num) {
                                return prev.slice(0, num);
                              } else {
                                const nextList = [...prev];
                                for (let i = prev.length; i < num; i++) {
                                  const prof = JURY_PROFESSIONS[i % JURY_PROFESSIONS.length];
                                  nextList.push({
                                    id: `${prof.id}_custom_${Date.now()}_${i}`,
                                    name: prof.name,
                                    role: "jury",
                                    description: prof.description,
                                    juryBias: prof.juryBias,
                                    systemPromptTemplate: prof.systemPromptTemplate,
                                    systemPrompt: prof.systemPromptTemplate.replace("{CLAIM}", claim),
                                    avatar: prof.avatar,
                                    color: prof.color,
                                    modelName: "",
                                    temperature: 0.7,
                                    isEnabled: true,
                                  });
                                }
                                return nextList;
                              }
                            });
                          }}
                          className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                            juryCount === num ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          {num === 0 ? "Off" : num}
                        </button>
                      ))}
                    </div>

                    {juryCount > 0 && (
                      <div className="space-y-3 mt-3 bg-slate-50/50 border border-slate-200 rounded-xl p-3">
                        <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest pl-0.5">
                          ACTIVE JURY CUSTOMIZATION
                        </span>
                        <div className="space-y-3.5 max-h-56 overflow-y-auto pr-1">
                          {juryPersonas.slice(0, juryCount).map((jury, idx) => (
                            <div key={jury.id} className="bg-white border border-slate-150 rounded-xl p-3 space-y-2.5 shadow-2xs">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-sm">{jury.avatar}</span>
                                  <input
                                    type="text"
                                    value={jury.name}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setJuryPersonas(prev => prev.map((j, jidx) => {
                                        if (jidx === idx) {
                                          return { ...j, name: val };
                                        }
                                        return j;
                                      }));
                                    }}
                                    className="font-bold text-slate-800 text-xs bg-transparent border-b border-dashed border-slate-300 focus:border-indigo-500 focus:outline-none w-28 truncate"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setJuryPersonas(prev => {
                                      const updated = [...prev];
                                      updated.splice(idx, 1);
                                      return updated;
                                    });
                                    setJuryCount(prev => Math.max(0, prev - 1));
                                  }}
                                  className="text-[10px] text-rose-500 hover:text-rose-700 font-bold transition-colors cursor-pointer"
                                >
                                  Remove
                                </button>
                              </div>

                              <div className="grid grid-cols-1 gap-1 text-[11px]">
                                <span className="text-slate-500 font-semibold text-[10px]">PROFESSION PATHWAY:</span>
                                <select
                                  value={jury.id.replace(/_custom_.*$/, "")}
                                  onChange={(e) => {
                                    const selectedProf = JURY_PROFESSIONS.find(p => p.id === e.target.value);
                                    if (selectedProf) {
                                      setJuryPersonas(prev => prev.map((j, jidx) => {
                                        if (jidx === idx) {
                                          return {
                                            ...j,
                                            id: `${selectedProf.id}_custom_${Date.now()}_${idx}`,
                                            name: selectedProf.name,
                                            avatar: selectedProf.avatar,
                                            color: selectedProf.color,
                                            description: selectedProf.description,
                                            juryBias: selectedProf.juryBias,
                                            systemPromptTemplate: selectedProf.systemPromptTemplate,
                                            systemPrompt: selectedProf.systemPromptTemplate.replace("{CLAIM}", claim),
                                          };
                                        }
                                        return j;
                                      }));
                                    }
                                  }}
                                  className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-700 font-sans text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                >
                                  {JURY_PROFESSIONS.map(p => (
                                    <option key={p.id} value={p.id}>
                                      {p.avatar} {p.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="grid grid-cols-1 gap-1 text-[11px]">
                                <span className="text-slate-505 font-semibold text-[10px]">MODEL ASSIGNMENT:</span>
                                <select
                                  value={jury.modelName || ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setJuryPersonas(prev => prev.map((j, jidx) => {
                                      if (jidx === idx) {
                                        return { ...j, modelName: val || undefined };
                                      }
                                      return j;
                                    }));
                                  }}
                                  className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-700 font-mono text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                >
                                  <option value="">(Inherit Global Option Selection)</option>
                                  {["gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash", "gemini-1.5-pro", ...discoveredModels].map((m) => (
                                    <option key={m} value={m}>{m}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-500 font-semibold text-[10px]">TEMP: {(jury.temperature ?? 0.7).toFixed(1)}</span>
                                <input
                                  type="range"
                                  min="0"
                                  max="1.2"
                                  step="0.1"
                                  value={jury.temperature ?? 0.7}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    setJuryPersonas(prev => prev.map((j, jidx) => {
                                      if (jidx === idx) {
                                        return { ...j, temperature: val };
                                      }
                                      return j;
                                    }));
                                  }}
                                  className="w-32 accent-indigo-600 h-1 cursor-pointer"
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        {juryCount < JURY_PROFESSIONS.length && (
                          <button
                            type="button"
                            onClick={() => {
                              const usedIds = juryPersonas.slice(0, juryCount).map(j => j.id.replace(/_custom_.*$/, ""));
                              const nextProf = JURY_PROFESSIONS.find(p => !usedIds.includes(p.id)) || JURY_PROFESSIONS[0];
                              const newJuror: AgentPersona = {
                                id: `${nextProf.id}_custom_${Date.now()}_${juryCount}`,
                                name: nextProf.name,
                                role: "jury",
                                description: nextProf.description,
                                juryBias: nextProf.juryBias,
                                systemPromptTemplate: nextProf.systemPromptTemplate,
                                systemPrompt: nextProf.systemPromptTemplate.replace("{CLAIM}", claim),
                                avatar: nextProf.avatar,
                                color: nextProf.color,
                                modelName: "",
                                temperature: 0.7,
                                isEnabled: true
                              };
                              setJuryPersonas(prev => [...prev.slice(0, juryCount), newJuror]);
                              setJuryCount(prev => prev + 1);
                            }}
                            className="w-full py-1.5 border border-dashed border-indigo-300 hover:bg-white text-indigo-600 rounded-lg text-center text-xs font-semibold cursor-pointer transition-colors"
                          >
                            + Add Custom Juror
                          </button>
                        )}
                      </div>
                    )}
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                      The trial engine supports fully customizable jurors to evaluate logic transparency and verify clear communicative translation.
                    </p>
                  </div>
                )}
              </div>

                  {/* Option 3: Additional Tribunal Extensions (Collapsible Box) */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setCollapsedSections(prev => ({ ...prev, extensions: !prev.extensions }))}
                  className="w-full flex items-center justify-between p-3.5 text-left font-sans font-bold text-slate-800 text-xs hover:bg-slate-50/50 transition cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-indigo-600" />
                    <span className="uppercase tracking-wider">Tribunal Extensions</span>
                    {collapsedSections.extensions && (
                      <span className="ml-1.5 text-[10px] text-indigo-650 font-bold font-mono bg-indigo-50/70 px-2 py-0.5 rounded-md uppercase">
                        {enabledExtensions.length === 0 ? "None" : `${enabledExtensions.length} Active`}
                      </span>
                    )}
                  </div>
                  <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${!collapsedSections.extensions ? "rotate-90" : ""}`} />
                </button>
                {!collapsedSections.extensions && (
                  <div className="p-3.5 border-t border-slate-100 bg-white/50 space-y-3 animate-in fade-in duration-200">
                    <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto pr-1">
                      {EXTENSION_PERSONAS_POOL.map((ext) => {
                        const isSelected = enabledExtensions.includes(ext.id);
                        return (
                          <button
                            key={ext.id}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setEnabledExtensions(enabledExtensions.filter((id) => id !== ext.id));
                              } else {
                                setEnabledExtensions([...enabledExtensions, ext.id]);
                              }
                            }}
                            className={`text-left p-2.5 rounded-xl border text-[11px] transition-all flex items-center justify-between gap-2.5 cursor-pointer ${
                              isSelected
                                ? "border-indigo-600 bg-indigo-50/20 ring-1 ring-indigo-600"
                                : "border-slate-200 hover:border-slate-300 bg-white"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{ext.avatar}</span>
                              <div>
                                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                  <span>{ext.name}</span>
                                </div>
                                <p className="text-[10px] text-slate-500 leading-normal line-clamp-1 mt-0.5">
                                  {ext.description}
                                </p>
                              </div>
                            </div>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 pointer-events-none accent-indigo-600"
                            />
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                      Unlike advocates, these agents operate in complete isolation and analyze evidentiary claims or blind spots.
                    </p>
                  </div>
                )}
              </div>

              {/* Option 4: Target Claim & Hypothesis (Collapsible Box) */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setCollapsedSections(prev => ({ ...prev, claim: !prev.claim }))}
                  className="w-full flex items-center justify-between p-3.5 text-left font-sans font-bold text-slate-800 text-xs hover:bg-slate-50/50 transition cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-indigo-600" />
                    <span className="uppercase tracking-wider">Target Hypothesis Claim</span>
                    {collapsedSections.claim && claim.trim() && (
                      <span className="ml-1.5 text-[11px] text-slate-500 font-normal truncate max-w-[12rem] block lg:max-w-[7rem] xl:max-w-[12rem]">
                        "{claim.slice(0, 32)}{claim.length > 32 ? '...' : ''}"
                      </span>
                    )}
                  </div>
                  <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${!collapsedSections.claim ? "rotate-90" : ""}`} />
                </button>
                {!collapsedSections.claim && (
                  <div className="p-3.5 border-t border-slate-100 bg-white/50 space-y-3.5 animate-in fade-in duration-200">
                    <textarea
                      id="claim-text-area"
                      value={claim}
                      onChange={(e) => setClaim(e.target.value)}
                      className="w-full h-24 text-xs p-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none leading-relaxed text-slate-700 font-sans"
                      placeholder="Enter initial argument, proposal, or thesis claim..."
                    />
                  </div>
                )}
              </div>

              {/* Option 5: Debate Performance Controls (Collapsible Box) */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setCollapsedSections(prev => ({ ...prev, performance: !prev.performance }))}
                  className="w-full flex items-center justify-between p-3.5 text-left font-sans font-bold text-slate-800 text-xs hover:bg-slate-50/50 transition cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-indigo-600" />
                    <span className="uppercase tracking-wider">Tribunal Constraints</span>
                    {collapsedSections.performance && (
                      <span className="ml-1.5 text-[10px] text-indigo-650 font-bold font-mono bg-indigo-50/70 px-2 py-0.5 rounded-md uppercase">
                        Rounds: {roundsCount} | Max: {maxWords}w
                      </span>
                    )}
                  </div>
                  <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${!collapsedSections.performance ? "rotate-90" : ""}`} />
                </button>
                {!collapsedSections.performance && (
                  <div className="p-3.5 border-t border-slate-100 bg-white/50 space-y-4 animate-in fade-in duration-200">
                    
                    {/* Debate Rounds Selector (1..5) */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600 font-bold">Debate Rounds</span>
                        <span className="bg-indigo-50 text-indigo-700 font-mono font-bold px-2 py-0.5 rounded text-[11px]">
                          {roundsCount} {roundsCount === 1 ? "Round" : "Rounds"}
                        </span>
                      </div>
                      <div className="flex gap-1.5 p-1 bg-slate-50 rounded-xl border border-slate-200">
                        {[1, 2, 3, 4, 5].map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => setRoundsCount(num)}
                            className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                              roundsCount === num ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Word Size limit with slider (200 .. 2500, default 1000) */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600 font-bold">Response Word Limit</span>
                        <span className="bg-indigo-50 text-indigo-700 font-mono font-bold px-2 py-0.5 rounded text-[11px]">
                          {maxWords.toLocaleString()} Words
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="200"
                          max="2505"
                          step="50"
                          value={maxWords}
                          onChange={(e) => setMaxWords(parseInt(e.target.value, 10))}
                          className="w-full accent-indigo-600 h-1.5 rounded-lg bg-slate-200 cursor-pointer"
                        />
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Restricts individual advocate/jury logs sizes to prevent context clipping and model output truncation.
                      </p>
                    </div>

                    {/* Toggle Switch for Dynamic Jury participation */}
                    {juryCount > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                        <div>
                          <span className="block text-xs text-slate-600 font-bold">Active Dynamic Jury</span>
                          <span className="block text-[10px] text-slate-400">
                            Jury critiques after every round, not just final pass.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDynamicJuryEnabled(!dynamicJuryEnabled)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            dynamicJuryEnabled ? "bg-indigo-600" : "bg-slate-200"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              dynamicJuryEnabled ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>
                    )}

                  </div>
                )}
              </div>

              {/* Action: Generate Catalyst Button */}
              <button
                id="btn-generate-prompts"
                type="button"
                disabled={isGeneratingPrompts || !claim.trim()}
                onClick={generateAgentPrompts}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                {isGeneratingPrompts ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Architecting Systems...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate System Prompts</span>
                  </>
                )}
              </button>
            </>
          ) : (
            // Status Active Setup Actions
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-150 pb-3">
                <h3 className="font-sans font-semibold text-slate-900 text-xs tracking-wider uppercase">
                  Simulation Dashboard
                </h3>
                <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold uppercase ${
                  session.status === "running" ? "bg-indigo-100 text-indigo-700" :
                  session.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                  session.status === "paused" ? "bg-amber-100 text-amber-700 font-medium" : "bg-slate-100 text-slate-600"
                }`}>
                  {session.status}
                </span>
              </div>

              {/* Show metrics */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-slate-700">
                <div className="text-center py-1.5 border-r border-slate-200/60">
                  <span className="block text-[10px] font-mono font-bold text-slate-500 uppercase">ROUND</span>
                  <span className="text-lg font-bold font-mono mt-0.5 block text-indigo-600">{session.currentRound}/3</span>
                </div>
                <div className="text-center py-1.5">
                  <span className="block text-[10px] font-mono font-bold text-slate-500 uppercase">ACTIONS RUN</span>
                  <span className="text-lg font-bold font-mono mt-0.5 block text-slate-800">
                    {session.currentStepIndex}/{debateSteps.length}
                  </span>
                </div>
              </div>

              {/* Session Warnings / Errors */}
              {session.error && (
                <div className="bg-rose-50 border border-rose-100 rounded-lg p-3 text-xs text-rose-800 space-y-1">
                  <div className="font-semibold flex items-center gap-1">
                    <span>Connection Warning:</span>
                  </div>
                  <p className="font-sans leading-relaxed text-[11px]">{session.error}</p>
                </div>
              )}

              {/* Dynamic steps summary indicator list */}
              <div className="space-y-2">
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                  DEBATE TRANSCRIPT PROTOCOLS
                </span>
                <div className="border border-slate-200 rounded-xl max-h-52 overflow-y-auto p-2 bg-slate-50/50 space-y-1">
                  {debateSteps.map((s, i) => {
                    let textClass = "text-slate-400";
                    let rowBg = "hover:bg-slate-100/30";
                    let dotColor = "bg-slate-300";

                    if (i === session.currentStepIndex) {
                      textClass = "text-indigo-900 font-semibold";
                      rowBg = "bg-white border border-indigo-200 p-1.5 rounded-lg shadow-sm";
                      dotColor = "bg-indigo-600 animate-pulse";
                    } else if (i < session.currentStepIndex) {
                      textClass = "text-slate-400 line-through";
                      dotColor = "bg-emerald-500";
                    }

                    return (
                      <div key={s.id} className={`flex items-center gap-2 p-1 text-[11px] transition-colors duration-200 ${rowBg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                        <span className="font-mono text-[9px] text-slate-400">Step {i+1}</span>
                        <span className={`truncate flex-1 font-sans ${textClass}`}>{s.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Simulation triggers panel */}
              <div className="space-y-2 pt-2">
                {session.status !== "completed" ? (
                  <>
                    <button
                      id="btn-play-auto"
                      type="button"
                      disabled={isStepActive}
                      onClick={autoPlay ? pauseDebateSimulation : startDebateSimulation}
                      className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-sm ${
                        autoPlay
                          ? "bg-amber-600 hover:bg-amber-700 text-white"
                          : "bg-indigo-600 hover:bg-indigo-700 text-white"
                      }`}
                    >
                      {autoPlay ? (
                        <>
                          <Pause className="w-4 h-4" />
                          <span>Pause Simulation</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          <span>Start Automated Debate</span>
                        </>
                      )}
                    </button>

                    <button
                      id="btn-step-manual"
                      type="button"
                      disabled={isStepActive || autoPlay}
                      onClick={runNextStep}
                      className="w-full py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <ChevronRight className="w-4 h-4" />
                      <span>Step Debate Forward</span>
                    </button>
                  </>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center text-xs text-emerald-800 space-y-1">
                    <Award className="w-6 h-6 text-emerald-600 mx-auto" />
                    <p className="font-bold">Debate Workflow Concluded</p>
                    <p className="text-[11px] text-emerald-700 leading-relaxed">
                      All sequential rounds and citizen voting metrics have successfully run. Review the synthesized verdict below.
                    </p>
                  </div>
                )}

                <button
                  id="btn-reset"
                  type="button"
                  onClick={resetDebate}
                  className="w-full py-2 border border-dashed border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-400 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Config Claim or Reset</span>
                </button>
              </div>
            </div>
          )}

          {/* Model provider card */}
          <ProviderSelector config={llmConfig} onChange={setLlmConfig} onDiscoveredModelsChange={setDiscoveredModels} />
        </div>

        {/* Right Columns: Agents and Dialogue log */}
        <div className="space-y-6 lg:col-span-2">
          {session.status === "idle" ? (
            <div className="h-full flex flex-col justify-between">
              {/* Informational Welcome Card */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between border-b border-slate-150 pb-3">
                  <div className="flex items-center gap-2 text-slate-900">
                    <HelpCircle className="w-5 h-5 text-indigo-650" />
                    <h3 className="font-sans font-bold text-sm tracking-tight text-slate-900">Understanding Multilateral Debate Arenas</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowReadmeModal(true)}
                    className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded-lg font-semibold hover:bg-indigo-100/50 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Detailed Guide & Manual</span>
                  </button>
                </div>
                <div className="space-y-4 text-xs text-slate-650 leading-relaxed">
                  <p>
                    Classic LLM chat interfaces suffer from self-reinforcing bias, circular reasoning, and context poisoning. AgenticTribunal resolves these pitfalls by setting up an adversarial, multi-agent argumentation architecture:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                    <div className="p-3.5 bg-emerald-50/15 border border-emerald-100 rounded-xl space-y-1">
                      <span className="font-bold text-emerald-800 text-[11px] flex items-center gap-1">🛡️ Defender Attorney</span>
                      <p className="text-slate-600 leading-normal text-[10px]">
                        Tasked strictly to discover, bolster, and substantiate optimal reasoning arguments in favor of the claim.
                      </p>
                    </div>
                    <div className="p-3.5 bg-rose-50/15 border border-rose-100 rounded-xl space-y-1">
                      <span className="font-bold text-rose-805 text-[11px] flex items-center gap-1">⚖️ Prosecuting Attorney</span>
                      <p className="text-slate-600 leading-normal text-[10px]">
                        Tasked strictly to uncover fallacies, challenge unsupported assertions, and expose hidden risks.
                      </p>
                    </div>
                    <div className="p-3.5 bg-violet-50/15 border border-violet-100 rounded-xl space-y-1">
                      <span className="font-bold text-violet-800 text-[11px] flex items-center gap-1">👨‍⚖️ Presiding Chief Judge</span>
                      <p className="text-slate-600 leading-normal text-[10px]">
                        Analyzes the adversarial dialogue transcript in isolation to issue an impartial logical synthesis and final verdict.
                      </p>
                    </div>
                    <div className="p-3.5 bg-slate-50/70 border border-slate-200/60 rounded-xl space-y-1">
                      <span className="font-bold text-slate-800 text-[11px] flex items-center gap-1">👥 Seated Citizen Jury</span>
                      <p className="text-slate-600 leading-normal text-[10px]">
                        Up to 5 custom citizens with unique professional biases (e.g. Master Carpenter, Nurse) voting dynamically on persuasiveness.
                      </p>
                    </div>
                  </div>
                  <div className="p-3 bg-indigo-50/40 border border-indigo-100/60 rounded-xl space-y-1.5 mt-2 text-[11px]">
                    <span className="font-bold text-indigo-950 block">Heterogeneous Multi-Model Execution (v2):</span>
                    <p className="text-slate-650 leading-relaxed">
                      Each seated actor in this tribunal can run on an independent model size (such as Gemini 2.5 Flash, Pro, or local Ollama configurations), letting you compare different models' structural biases and logical performance in real-time.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Live Simulation Screen
            <div className="space-y-6">
              
              {/* Grid of Core and Extension expert agents */}
              <div className="space-y-4">
                <div className="space-y-2.5">
                  <span className="block text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-widest pl-1">
                    Seated Core Adversaries & Presider
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {session.agents
                      .filter((a) => ["defender", "prosecutor", "judge"].includes(a.role))
                      .map((agent) => {
                        const step = debateSteps[session.currentStepIndex];
                        const isAgentSpeaking = session.status === "running" && step?.agentId === agent.id;
                        const isTalking = isStepActive && isAgentSpeaking;

                        return (
                          <AgentCard
                            key={agent.id}
                            agent={agent}
                            isSpeaking={isAgentSpeaking}
                            isThinking={isTalking}
                            onUpdateSystemPrompt={handleUpdateSystemPrompt}
                            onUpdateAgent={handleUpdateAgent}
                            availableModels={discoveredModels}
                          />
                        );
                      })}
                  </div>
                </div>

                {session.agents.some((a) => !["defender", "prosecutor", "judge", "jury"].includes(a.role)) && (
                  <div className="space-y-2.5 pt-1">
                    <span className="block text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-widest pl-1">
                      Active Specialized Tribunal Evaluations (Isolated Audits)
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {session.agents
                        .filter((a) => !["defender", "prosecutor", "judge", "jury"].includes(a.role))
                        .map((agent) => {
                          const step = debateSteps[session.currentStepIndex];
                          const isAgentSpeaking = session.status === "running" && step?.agentId === agent.id;
                          const isTalking = isStepActive && isAgentSpeaking;

                          return (
                            <AgentCard
                              key={agent.id}
                              agent={agent}
                              isSpeaking={isAgentSpeaking}
                              isThinking={isTalking}
                              onUpdateSystemPrompt={handleUpdateSystemPrompt}
                              onUpdateAgent={handleUpdateAgent}
                              availableModels={discoveredModels}
                            />
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              {/* Dynamic Grid: Logs feed + Jury chart widget */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Timeline feed column (2/3 width) */}
                <div className="md:col-span-2 space-y-3.5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <span className="block text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-widest pl-1">
                      REAL-TIME COURTROOM Dialogue Transcript
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      Sequential Container Active
                    </span>
                  </div>
                  <DebateTimeline
                    messages={session.messages}
                    agents={session.agents}
                    isGenerating={isStepActive}
                  />
                </div>

                {/* Jury panel column (1/3 width) */}
                <div className="md:col-span-1 space-y-3.5">
                  <span className="block text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-widest pl-1">
                    Jury sway tracker
                  </span>
                  <JuryPanel
                    juryCount={juryCount}
                    juries={session.agents.filter((a) => a.role === "jury")}
                    messages={session.messages}
                  />
                  
                  {/* Inline list of editable jury prompts if active */}
                  {juryCount > 0 && (
                    <div className="space-y-3 pt-3">
                      <span className="block text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-medium">
                        Inline Citizen prompt editors
                      </span>
                      <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                        {session.agents
                          .filter((a) => a.role === "jury")
                          .map((jury) => {
                            const step = debateSteps[session.currentStepIndex];
                            const isSpeaking = session.status === "running" && step?.role === "jury";
                            return (
                              <AgentCard
                                key={jury.id}
                                agent={jury}
                                isSpeaking={isSpeaking}
                                isThinking={isStepActive && isSpeaking}
                                onUpdateSystemPrompt={handleUpdateSystemPrompt}
                                onUpdateAgent={handleUpdateAgent}
                                availableModels={discoveredModels}
                              />
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>

              </div>
              
            </div>
          )}
        </div>
      </main>

      {/* Detailed Reference Manual Modal Overlay */}
      {showReadmeModal && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl border border-slate-200 p-6 space-y-4 text-slate-700 flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-slate-150 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <h3 className="font-sans font-bold text-slate-900 text-sm tracking-tight uppercase">AgenticTribunal System Manual & Architecture</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReadmeModal(false)}
                className="text-slate-400 hover:text-slate-900 p-1 bg-slate-50 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-4 leading-relaxed overflow-y-auto pr-1">
              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-900 uppercase text-[11px] tracking-wide">1. Core Multi-Agent Governance Model</h4>
                <p>
                  AgenticTribunal runs on a rigorous, isolated-session asynchronous trial protocol. Every major debate workflow models an objective tri-partite legal institutional framework:
                </p>
                <ul className="list-disc list-inside pl-2.5 space-y-1">
                  <li><strong>The Defender Attorney:</strong> Tasked to optimize claim justifications, structure solid proofs, and counter prosecution claims.</li>
                  <li><strong>The Prosecuting Attorney:</strong> Tasked to reveal hidden assumptions, check empirical limits, and break claim structures.</li>
                  <li><strong>The Chief Presiding Judge:</strong> Impartially synthesizes the adversarial records to deliver final trade-off evaluations.</li>
                </ul>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-900 uppercase text-[11px] tracking-wide">2. Statutory Specialist Extensions</h4>
                <p>
                  These agents operate as neutral, single-turn specialist auditors. They never take advocate positions, working instead to evaluate criteria benchmarks:
                </p>
                <ul className="list-disc list-inside pl-2.5 space-y-1">
                  <li><strong>Evidence Clerk:</strong> Classifies claims strictly as Established, Plausible, Speculative, or Unsupported.</li>
                  <li><strong>Scientific Judge:</strong> Audits claims against rigorous physical laws and empirical reproducibility.</li>
                  <li><strong>Ethical Judge:</strong> Examines moral dilemmas, social equity impacts, and distributive justice.</li>
                  <li><strong>Contrarian Auditor:</strong> Proactively generates custom counter-hypotheses to expose systemic biases.</li>
                </ul>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-900 uppercase text-[11px] tracking-wide">3. Dynamic Jurors & Sway Metrics</h4>
                <p>
                  Seating real citizen jury members bridges the gap between expert academic claims and everyday consensus:
                </p>
                <ul className="list-disc list-inside pl-2.5 space-y-1">
                  <li><strong>Custom Professions:</strong> Choose from Forensic Accountants, UX Designers, Nurses, Carpenters, and Teachers.</li>
                  <li><strong>Minority Report highlights:</strong> When active jurors split their leans (e.g. 2 in support of Defender and 1 in support of Prosecution), the system highlights dissenting minority opinions directly in the Jury Panel of the live courtroom.</li>
                </ul>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-900 uppercase text-[11px] tracking-wide">4. Heterogeneous Multi-Model Institutions (v2)</h4>
                <p>
                  By eliminating global LLM bounds, AgenticTribunal lets you declare per-agent model sizes and customized temperatures. Compare high-density reasoning models (like Gemini 2.5 Pro) with ultra-fast local completions servers seamlessly.
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setShowReadmeModal(false)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-indigo-750 cursor-pointer shadow-sm"
              >
                Ready & Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Alert Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 ring-1 ring-slate-800/15 max-w-sm bg-slate-900 text-white rounded-xl shadow-2xl p-4 flex items-start gap-3 transition-all duration-300 transform translate-y-0 scale-100">
          <div className="flex-shrink-0 mt-0.5 animate-pulse">
            {toast.type === "success" ? (
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            ) : toast.type === "error" ? (
              <AlertTriangle className="w-5 h-5 text-rose-450" />
            ) : (
              <Info className="w-5 h-5 text-sky-400" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 font-mono">
              {toast.type === "success" ? "Operation Successful" : toast.type === "error" ? "System Warning" : "Notice"}
            </p>
            <p className="text-xs text-slate-200 mt-1 leading-relaxed font-sans">{toast.message}</p>
          </div>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white p-0.5 rounded transition">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-950 text-slate-400 text-[11px] py-4 px-6 text-center mt-auto font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <span>AUTHENTIC MULTI-AGENT TRIAL ENGINE • EST. 2026</span>
          <span>CRAFTED IN MODERN REACT & TAILWIND CSS</span>
        </div>
      </footer>
    </div>
  );
}
