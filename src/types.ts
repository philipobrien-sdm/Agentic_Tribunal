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

export interface ConcessionMap {
  defender: string[];
  prosecutor: string[];
  judge: string[];
}

export interface ArgumentGraph {
  supported: string[];
  challenged: string[];
  unresolved: string[];
  rejected: string[];
  conceded: string[];
}

export interface InstitutionalRecord {
  findingsOfFact: string[];
  contestedIssues: string[];
  concessions: string[];
  unresolvedQuestions: string[];
  definitions: string[];
  keyEvidence: string[];
  confidenceLevels: string; // "Low" | "Moderate" | "High"
}

export interface MajorityOpinion {
  conclusions: string[];
  reasoning: string[];
  confidence: string;
}

export interface DissentingOpinion {
  principalObjections: string[];
  alternativeInterpretations: string[];
  remainingRisks: string[];
  confidence: string;
}

export interface MinorityReport {
  id: string;
  dissenter: string;
  position: string;
  reasoning: string;
  possibleHiddenIssue: string;
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
  // v3 Institutional memory layer
  institutionalRecord?: InstitutionalRecord;
  majorityOpinion?: MajorityOpinion;
  dissentingOpinion?: DissentingOpinion;
  minorityReports?: MinorityReport[];
  concessionMap?: ConcessionMap;
  argumentGraph?: ArgumentGraph;
  activeCompressionWordCount?: number; // Automatic compression trigger word limit
  // v3.5 Persistent Actor Archives & Human-in-the-loop additions
  promotedItems?: Array<{
    id: string;
    category: "Key Fact" | "Key Objection" | "Important Evidence" | "Hidden Assumption" | "Practical Concern" | "Ethical Concern" | "Unresolved Question";
    content: string;
    actor: string;
    timestamp: string;
  }>;
  targetedFlags?: Array<{
    id: string;
    targetActor: string; // "jury" | "defender" | "prosecutor" | "judge" | "evidence_clerk" | "practical_judge" | "ethical_judge" | "scientific_judge" | "contrarian_auditor";
    snippet: string;
    note?: string;
    timestamp: string;
  }>;
  humanNotes?: string;
  humanConfidence?: number;
  neverCompressLogs?: string[]; // array of message IDs marked "Never Compress"
  humanReflectionAnswers?: {
    overlooked?: string;
    strongest?: string;
    unclear?: string;
    converging?: string;
  };
  humanConcernReports?: Array<{
    id: string;
    observation: string;
    actorsAddressingIt: string[];
    unansweredIssues: string;
    recommendation: string;
  }>;
}
