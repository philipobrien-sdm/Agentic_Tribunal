/**
 * Types for the LLM Multi-Agent Debate Arena
 */

export type ModelProvider = "gemini" | "local_ollama" | "local_custom";

export interface LLMConfig {
  provider: ModelProvider;
  modelName: string;
  endpointUrl?: string; // e.g., http://localhost:11434/v1 for Ollama
  apiKey?: string; // Optional custom OpenAI or local key
}

export type AgentRole =
  | "defender"
  | "prosecutor"
  | "judge"
  | "jury"
  | "prompt_architect"
  | "evidence_clerk"
  | "practical_judge"
  | "ethical_judge"
  | "scientific_judge"
  | "contrarian_auditor";

export interface AgentPersona {
  id: string;
  name: string;
  role: AgentRole;
  description: string;
  systemPromptTemplate: string; // Predefined best practice template
  systemPrompt: string; // Actual prompt used (can be refined/edited by user)
  color: string; // Tailwind class color for visual distinction
  avatar: string; // Emoji avatar
  juryBias?: string; // Description of non-expert bias for jury members
  juryInitialConfidence?: number; // 0 to 100 base stance towards the claim
  modelName?: string; // Optional per-agent model override
  temperature?: number; // Optional per-agent temperature
  isEnabled?: boolean; // Toggle to participate in debate
  isCollapsed?: boolean; // Visual collapsible state in UI
}

export interface DebateMessage {
  id: string;
  round: number;
  stepName: string;
  agentId: string;
  agentName: string;
  agentRole: AgentRole | "system";
  content: string;
  timestamp: string;
  juryConfidenceHistory?: Record<string, number>; // Map of jury agent ID -> confidence at this step
}

export interface JurySentimentTimeline {
  step: string;
  roundName: string;
  [juryId: string]: number | string; // maps jury agent ID to standard confidence score (0-100)
}

export interface DebateWorkflow {
  id: string;
  name: string;
  description: string;
  defendingTitle: string;
  prosecutingTitle: string;
  judgingTitle: string;
  defaultClaim: string;
}

export interface DebateSession {
  id: string;
  claim: string;
  workflowId: string;
  config: LLMConfig;
  status: "idle" | "ready" | "running" | "paused" | "completed" | "error";
  currentRound: number;
  currentStepIndex: number;
  agents: AgentPersona[];
  messages: DebateMessage[];
  juryCount: number;
  chatLogs: string; // Plain text details
  error?: string;
}
