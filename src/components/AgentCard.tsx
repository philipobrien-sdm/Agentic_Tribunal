import React, { useState } from "react";
import { AgentPersona } from "../types";
import { ChevronDown, ChevronUp, Scale, ShieldAlert, Sparkles, UserCheck, MessageSquareCode, FileText, Wrench, Heart, FlaskConical, EyeOff } from "lucide-react";

interface AgentCardProps {
  key?: any;
  agent: AgentPersona;
  isSpeaking: boolean;
  isThinking: boolean;
  onUpdateSystemPrompt: (id: string, newPrompt: string) => void;
  onUpdateAgent?: (id: string, updatedFields: Partial<AgentPersona>) => void;
  availableModels?: string[];
  onViewLog?: (id: string) => void;
}

export default function AgentCard({ agent, isSpeaking, isThinking, onUpdateSystemPrompt, onUpdateAgent, availableModels, onViewLog }: AgentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState(agent.systemPrompt);
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    setEditedPrompt(agent.systemPrompt);
  }, [agent.systemPrompt]);

  const handleSave = () => {
    setIsSaving(true);
    onUpdateSystemPrompt(agent.id, editedPrompt);
    setTimeout(() => {
      setIsSaving(false);
    }, 400);
  };

  const getRoleIcon = () => {
    switch (agent.role) {
      case "defender":
        return <UserCheck className="w-4 h-4 text-emerald-600" />;
      case "prosecutor":
        return <ShieldAlert className="w-4 h-4 text-rose-600" />;
      case "judge":
        return <Scale className="w-4 h-4 text-violet-600" />;
      case "evidence_clerk":
        return <FileText className="w-4 h-4 text-sky-600" />;
      case "practical_judge":
        return <Wrench className="w-4 h-4 text-cyan-600" />;
      case "ethical_judge":
        return <Heart className="w-4 h-4 text-teal-600" />;
      case "scientific_judge":
        return <FlaskConical className="w-4 h-4 text-indigo-600" />;
      case "contrarian_auditor":
        return <EyeOff className="w-4 h-4 text-orange-600" />;
      default:
        return <Sparkles className="w-4 h-4 text-amber-500" />;
    }
  };

  const getRoleBadgeStyle = () => {
    switch (agent.role) {
      case "defender":
        return "bg-emerald-50 text-emerald-700 border-emerald-100";
      case "prosecutor":
        return "bg-rose-50 text-rose-700 border-rose-100";
      case "judge":
        return "bg-violet-50 text-violet-700 border-violet-100";
      case "evidence_clerk":
        return "bg-sky-50 text-sky-700 border-sky-100";
      case "practical_judge":
        return "bg-cyan-50 text-cyan-700 border-cyan-100";
      case "ethical_judge":
        return "bg-teal-50 text-teal-700 border-teal-100";
      case "scientific_judge":
        return "bg-indigo-50 text-indigo-700 border-indigo-100";
      case "contrarian_auditor":
        return "bg-orange-50 text-orange-700 border-orange-100";
      default:
        return "bg-amber-50 text-amber-700 border-amber-100";
    }
  };

  const isEnabled = agent.isEnabled !== false;

  // Status Classes
  let borderClass = isEnabled ? "border-slate-200 bg-white shadow-sm" : "border-slate-200/60 bg-slate-50/40 opacity-60";
  let animateShadow = "";
  if (isThinking && isEnabled) {
    borderClass = "border-amber-400 bg-amber-50/20";
    animateShadow = "shadow-[0_0_12px_-2px_rgba(245,158,11,0.25)] animate-pulse";
  } else if (isSpeaking && isEnabled) {
    borderClass = "border-indigo-600 bg-indigo-50/10 ring-1 ring-indigo-600";
    animateShadow = "shadow-[0_4px_16px_-4px_rgba(79,70,229,0.15)]";
  }

  const modelListToUse = [
    "gemini-3.5-flash",
    "gemini-2.5-flash",
    "gemini-1.5-flash",
    "gemini-2.5-pro",
    "gemini-1.5-pro",
    ...(availableModels || [])
  ];

  return (
    <div
      id={`agent-card-${agent.id}`}
      className={`border rounded-xl transition-all duration-300 ${borderClass} ${animateShadow} overflow-hidden`}
    >
      {/* Header section */}
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${agent.juryBias ? agent.color : "from-slate-100 to-slate-200"} flex items-center justify-center text-xl shadow-inner text-white flex-shrink-0`}>
            {agent.avatar}
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="font-sans font-semibold text-slate-800 text-sm flex items-center gap-1">
                {agent.name}
                {!isEnabled && <span className="text-[10px] text-slate-400 font-normal italic">(Inactive)</span>}
              </h4>
              <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${getRoleBadgeStyle()}`}>
                {agent.role}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{agent.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Active status pill */}
          {isThinking && isEnabled && (
            <span className="flex items-center gap-1 text-[10px] bg-amber-100 text-amber-800 font-medium px-2 py-0.5 rounded-full animate-bounce">
              Thinking...
            </span>
          )}
          {isSpeaking && !isThinking && isEnabled && (
            <span className="flex items-center gap-1 text-[10px] bg-slate-950 text-white font-medium px-2 py-0.5 rounded-full">
              Speaking
            </span>
          )}

          <button
            id={`btn-toggle-prompt-${agent.id}`}
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition"
            title="Edit Agent Instructions"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Configuration settings ribbon */}
      <div className="px-4 py-2 bg-slate-100/50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 font-medium text-slate-700 cursor-pointer select-none">
            <input
              id={`checkbox-enable-${agent.id}`}
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => onUpdateAgent?.(agent.id, { isEnabled: e.target.checked })}
              className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 border-slate-300"
            />
            <span>Active in Session</span>
          </label>

          {onViewLog && agent.id !== "human_juror" && (
            <button
              type="button"
              onClick={() => onViewLog(agent.id)}
              className="px-2 py-0.5 bg-white border border-slate-200 hover:border-slate-300 rounded text-[10px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
            >
              <FileText className="w-3 h-3 text-indigo-500" />
              <span>View Log</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Model:</span>
          <select
            id={`select-model-${agent.id}`}
            value={agent.modelName || ""}
            disabled={!isEnabled}
            onChange={(e) => onUpdateAgent?.(agent.id, { modelName: e.target.value || undefined })}
            className="bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-[11px] font-mono max-w-[170px]"
          >
            <option value="">(Global Option Preset)</option>
            {modelListToUse.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 whitespace-nowrap">Temp: {(agent.temperature ?? 0.7).toFixed(1)}</span>
          <input
            id={`slider-temp-${agent.id}`}
            type="range"
            min="0"
            max="1.2"
            step="0.1"
            disabled={!isEnabled}
            value={agent.temperature ?? 0.7}
            onChange={(e) => onUpdateAgent?.(agent.id, { temperature: parseFloat(e.target.value) })}
            className="w-16 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 disabled:opacity-50"
          />
        </div>
      </div>

      {/* Expanded Prompt Editor view */}
      {isExpanded && (
        <div id={`prompt-editor-${agent.id}`} className="border-t border-slate-100 bg-slate-50 p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-slate-500 font-mono font-medium">
              <MessageSquareCode className="w-3.5 h-3.5" />
              SYSTEM PROMPT INSTRUCTIONS
            </span>
            <span className="text-[10px] text-slate-400 italic">Advanced Prompt Best-Practice Template</span>
          </div>

          <textarea
            id={`textarea-prompt-${agent.id}`}
            value={editedPrompt}
            disabled={!isEnabled}
            onChange={(e) => setEditedPrompt(e.target.value)}
            className="w-full h-44 text-xs font-mono p-3 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y leading-relaxed text-slate-700 disabled:opacity-50"
            placeholder="Edit system prompt templates..."
          />

          <div className="flex items-center justify-between pb-1">
            <p className="text-[10px] text-slate-400 max-w-[280px]">
              {agent.juryBias
                ? "This persona is biased and not an expert. They must be genuinely convinced using simple, relatable logic."
                : "This is a specialized debate expert template. Keep system instructions structured with concrete objectives."}
            </p>
            <div className="flex gap-2">
              <button
                id={`btn-reset-prompt-${agent.id}`}
                type="button"
                onClick={() => setEditedPrompt(agent.systemPrompt)}
                disabled={!isEnabled}
                className="px-2.5 py-1.5 border border-slate-200 text-[11px] rounded-lg text-slate-600 hover:bg-white transition disabled:opacity-50"
              >
                Reset
              </button>
              <button
                id={`btn-save-prompt-${agent.id}`}
                type="button"
                onClick={handleSave}
                disabled={isSaving || !isEnabled}
                className="px-3.5 py-1.5 bg-indigo-600 text-white text-[11px] rounded-lg font-medium hover:bg-indigo-700 transition flex items-center gap-1 disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Apply Prompt"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
