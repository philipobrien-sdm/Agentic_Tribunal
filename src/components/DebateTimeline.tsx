import React, { useRef, useEffect } from "react";
import { DebateMessage, AgentPersona } from "../types";
import { Scale, ShieldAlert, UserCheck, MessageSquare, Clock, ArrowDown, ChevronRight, Gavel, HelpCircle } from "lucide-react";

interface DebateTimelineProps {
  messages: DebateMessage[];
  agents: AgentPersona[];
  isGenerating: boolean;
}

// Custom simple parser to render basic markdown elements cleanly
function FormattedContent({ text }: { text: string }) {
  if (!text) return null;

  // Remove the jury JSON block if present at the end of the text
  const cleanedText = text.replace(/```json[\s\S]*?```/g, "").trim();

  const lines = cleanedText.split("\n");
  return (
    <div className="space-y-3.5 text-sm leading-relaxed text-slate-800">
      {lines.map((line, index) => {
        const trimmed = line.trim();

        // Headers
        if (trimmed.startsWith("###")) {
          return (
            <h4 key={index} className="font-sans font-semibold text-slate-900 text-sm mt-4 mb-2 tracking-tight flex items-center gap-1.5 border-b border-slate-100 pb-1">
              <ChevronRight className="w-4 h-4 text-slate-400" />
              {trimmed.replace(/^###\s*/, "")}
            </h4>
          );
        }
        if (trimmed.startsWith("##")) {
          return (
            <h3 key={index} className="font-sans font-bold text-slate-900 text-base mt-5 mb-2.5 tracking-tight">
              {trimmed.replace(/^##\s*/, "")}
            </h3>
          );
        }
        if (trimmed.startsWith("#")) {
          return (
            <h2 key={index} className="font-sans font-extrabold text-slate-900 text-lg mt-6 mb-3 tracking-tight">
              {trimmed.replace(/^#\s*/, "")}
            </h2>
          );
        }

        // Bullet Items
        if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
          return (
            <ul key={index} className="list-disc list-inside pl-3 space-y-1 my-1">
              <li className="text-slate-700">
                {trimmed.replace(/^[-*]\s*/, "")}
              </li>
            </ul>
          );
        }

        // Numbered List
        if (/^\d+\.\s/.test(trimmed)) {
          return (
            <ol key={index} className="list-decimal list-inside pl-3 space-y-1 my-1">
              <li className="text-slate-700">
                {trimmed.replace(/^\d+\.\s*/, "")}
              </li>
            </ol>
          );
        }

        // Quote blocks
        if (trimmed.startsWith(">")) {
          return (
            <blockquote key={index} className="border-l-4 border-slate-300 pl-4 py-1.5 italic text-slate-600 bg-slate-50/50 rounded-r-lg my-2">
              {trimmed.replace(/^>\s*/, "")}
            </blockquote>
          );
        }

        // Empty lines
        if (trimmed === "") {
          return <div key={index} className="h-2" />;
        }

        // Standard Paragraphs
        return (
          <p key={index} className="text-slate-700">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

export default function DebateTimeline({ messages, agents, isGenerating }: DebateTimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating]);

  const getAgentStyles = (role: string) => {
    switch (role) {
      case "defender":
        return {
          icon: <UserCheck className="w-4 h-4 text-emerald-600" />,
          borderColor: "border-emerald-200",
          badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-100",
          headerBg: "bg-emerald-50/30 border-b border-emerald-100"
        };
      case "prosecutor":
        return {
          icon: <ShieldAlert className="w-4 h-4 text-rose-600" />,
          borderColor: "border-rose-200",
          badgeBg: "bg-rose-50 text-rose-700 border-rose-100",
          headerBg: "bg-rose-50/30 border-b border-rose-100"
        };
      case "judge":
        return {
          icon: <Scale className="w-4 h-4 text-violet-600" />,
          borderColor: "border-violet-200",
          badgeBg: "bg-violet-50 text-violet-700 border-violet-100",
          headerBg: "bg-violet-50/30 border-b border-violet-100"
        };
      case "jury":
        return {
          icon: <MessageSquare className="w-4 h-4 text-amber-600" />,
          borderColor: "border-amber-200",
          badgeBg: "bg-amber-50 text-amber-700 border-amber-100",
          headerBg: "bg-amber-50/30 border-b border-amber-100"
        };
      default:
        return {
          icon: <Clock className="w-4 h-4 text-slate-500" />,
          borderColor: "border-slate-200",
          badgeBg: "bg-slate-50 text-slate-700 border-slate-100",
          headerBg: "bg-slate-50/40 border-b border-slate-100"
        };
    }
  };

  return (
    <div id="debate-timeline-container" className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
      {messages.length === 0 ? (
        <div id="debate-timeline-empty" className="bg-white border border-slate-200/80 rounded-2xl p-10 text-center shadow-sm">
          <Gavel className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-sans font-semibold text-slate-800 text-base">Debate Arena Uninitialized</h3>
          <p className="text-xs text-slate-500 mt-2 max-w-[360px] mx-auto leading-relaxed">
            Configure your target claims and generate your specialized system prompts, then click <strong>"Start Automated Debate"</strong> or <strong>"Step Debate"</strong> to watch the AI agents deliberate.
          </p>
        </div>
      ) : (
        <div className="relative pl-6 border-l-2 border-slate-100 space-y-6">
          {messages.map((msg, index) => {
            const styles = getAgentStyles(msg.agentRole);
            const matchingAgent = agents.find((a) => a.id === msg.agentId);

            return (
              <div
                key={msg.id}
                id={`timeline-card-${msg.id}`}
                className={`relative bg-white border ${styles.borderColor} rounded-2xl shadow-sm overflow-hidden transition-all hover:shadow-md`}
              >
                {/* Timeline node bullet */}
                <div className="absolute -left-[33px] top-6 w-4 h-4 rounded-full bg-white border-2 border-slate-300 flex items-center justify-center z-10 shadow-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                </div>

                {/* Banner / Header */}
                <div className={`px-5 py-3 flex items-center justify-between ${styles.headerBg}`}>
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{matchingAgent?.avatar || "⚖️"}</span>
                    <div>
                      <h4 className="font-sans font-bold text-slate-800 text-sm">{msg.agentName}</h4>
                      <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5 uppercase tracking-wide">
                        {styles.icon}
                        <span>{msg.stepName} • Round {msg.round}</span>
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${styles.badgeBg}`}>
                    {msg.agentRole}
                  </span>
                </div>

                {/* Speech content */}
                <div className="px-5 py-4">
                  <FormattedContent text={msg.content} />
                </div>

                {/* Footer and timestamp */}
                <div className="px-5 py-2.5 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>SYSTEM ACTION TRANSCRIPT LINK SECURED</span>
                  <span>{msg.timestamp}</span>
                </div>
              </div>
            );
          })}

          {/* Loader when generating the next turn */}
          {isGenerating && (
            <div id="timeline-spinner-card" className="relative bg-slate-50 border border-amber-300/80 rounded-2xl p-5 shadow-sm">
              <div className="absolute -left-[33px] top-6 w-4 h-4 rounded-full bg-white border-2 border-amber-300 flex items-center justify-center z-10 animate-ping">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              </div>
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-slate-600 text-xs font-mono font-medium animate-pulse">
                  SEQUENTIAL LLM CALL ACTIVE — INJECTING CONTEXT TRANSCRIPT AND HARVESTING ARGUMENT...
                </span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
