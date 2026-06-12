import React from "react";
import { AgentPersona, DebateMessage } from "../types";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Users, Info, ShieldAlert, TrendingUp } from "lucide-react";

interface JuryPanelProps {
  juryCount: number;
  juries: AgentPersona[];
  messages: DebateMessage[];
}

export default function JuryPanel({ juryCount, juries, messages }: JuryPanelProps) {
  if (juryCount <= 0 || juries.length === 0) {
    return (
      <div id="jury-empty-panel" className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-6 text-center">
        <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <h4 className="font-sans font-medium text-slate-700 text-sm">No Active Jury Selected</h4>
        <p className="text-xs text-slate-400 mt-1 max-w-[280px] mx-auto">
          Enable a community jury panel to force agents to communicate clearly with average, undecided citizens.
        </p>
      </div>
    );
  }

  // Compile timeline data for Recharts
  // Start with step 0 (initial conditions)
  const initialDataPoint: any = {
    stepName: "Baseline",
  };
  juries.forEach((jury) => {
    initialDataPoint[jury.name] = jury.juryInitialConfidence ?? 50;
  });

  const chartData = [initialDataPoint];

  // Pick up steps where jury confidence markers exist
  messages.forEach((msg) => {
    if (msg.juryConfidenceHistory && Object.keys(msg.juryConfidenceHistory).length > 0) {
      const dataPoint: any = {
        stepName: msg.stepName,
      };
      juries.forEach((jury) => {
        dataPoint[jury.name] = msg.juryConfidenceHistory?.[jury.id] !== undefined
          ? msg.juryConfidenceHistory[jury.id]
          : (chartData[chartData.length - 1][jury.name] ?? 50);
      });
      chartData.push(dataPoint);
    }
  });

  // Get current voter leans/confidences
  const currentMessage = messages[messages.length - 1];
  const lastMetrics = currentMessage?.juryConfidenceHistory || {};

  // Parse each juror's latest detailed speech and conviction parameters for the Minority report section
  const latestSpeechByJurorId: Record<string, { content: string; confidence: number; lean: string }> = {};
  messages.forEach((msg) => {
    if (msg.agentRole === "jury" && msg.agentId) {
      const ratingMatch = msg.content.match(/Current Conviction Rating:\s*(\d+)%\s*\(Lean:\s*([A-Za-z_]+)\)/i);
      if (ratingMatch) {
        latestSpeechByJurorId[msg.agentId] = {
          content: msg.content.split("\n\n*Current Conviction Rating:")[0],
          confidence: parseInt(ratingMatch[1], 10),
          lean: ratingMatch[2].toLowerCase(),
        };
      }
    }
  });

  const activeJurorsWithSpeeches = juries.filter(j => latestSpeechByJurorId[j.id]);

  // Map out voting stats
  const leansCount: Record<string, number> = { defender: 0, prosecutor: 0, undecided: 0 };
  activeJurorsWithSpeeches.forEach(j => {
    const info = latestSpeechByJurorId[j.id];
    if (info && info.lean) {
      leansCount[info.lean] = (leansCount[info.lean] || 0) + 1;
    }
  });

  // Determine majority lean
  let majorityLean = "undecided";
  if (leansCount.defender > leansCount.prosecutor && leansCount.defender > leansCount.undecided) {
    majorityLean = "defender";
  } else if (leansCount.prosecutor > leansCount.defender && leansCount.prosecutor > leansCount.undecided) {
    majorityLean = "prosecutor";
  }

  // Seized dissenting opinions
  const dissenters = activeJurorsWithSpeeches.filter(j => {
    const info = latestSpeechByJurorId[j.id];
    return majorityLean !== "undecided" && info.lean !== majorityLean && info.lean !== "undecided";
  });

  return (
    <div id="jury-panel-container" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-slate-500" />
          <h3 className="font-sans font-medium text-slate-900 text-sm tracking-tight">Active Jury Panel</h3>
        </div>
        <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full font-sans font-medium">
          {juries.length} {juries.length === 1 ? "Citizen" : "Citizens"} seated
        </span>
      </div>

      {/* Grid of Active Juries */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
        {juries.map((jury) => {
          const currentConfidence = lastMetrics[jury.id] !== undefined 
            ? lastMetrics[jury.id] 
            : (jury.juryInitialConfidence ?? 50);
          
          const previousConfidence = jury.juryInitialConfidence ?? 50;
          const diff = currentConfidence - previousConfidence;

          return (
            <div
              key={jury.id}
              id={`jury-member-${jury.id}`}
              className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 flex items-start gap-2.5"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-lg shadow-sm">
                {jury.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <h4 className="text-xs font-semibold text-slate-800 truncate">{jury.name}</h4>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono font-bold text-slate-700 bg-slate-200 px-1.5 py-0.5 rounded">
                      {currentConfidence}%
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5 uppercase tracking-wide">
                  Profession Bias
                </p>
                <p className="text-[10px] text-slate-600 line-clamp-2 mt-0.5 italic leading-relaxed">
                  "{jury.juryBias}"
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <div className="flex-1 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${currentConfidence}%` }}
                    />
                  </div>
                  <span className={`text-[9px] font-mono font-medium ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-rose-500" : "text-slate-400"}`}>
                    {diff > 0 ? `+${diff}%` : diff < 0 ? `${diff}%` : "0%"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* MINORITY REPORT CARD (DIVERGENT CONFLICT) */}
      {dissenters.length > 0 && (
        <div id="jury-minority-report" className="border border-rose-100 bg-rose-50/35 rounded-xl p-4 space-y-2.5 animate-in fade-in duration-300">
          <div className="flex items-center gap-1.5 text-rose-800">
            <ShieldAlert className="w-4.5 h-4.5 text-rose-600" />
            <h4 className="font-sans font-bold text-xs uppercase tracking-wide">Minority Report (Dissent Panel)</h4>
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed font-normal">
            A coalition split has occurred. The following seated citizen(s) voiced isolated reasoning that opposes the majority consensus:
          </p>
          <div className="space-y-2.5">
            {dissenters.map((jury) => {
              const info = latestSpeechByJurorId[jury.id];
              return (
                <div key={jury.id} className="bg-white border border-rose-100 rounded-lg p-3 shadow-2xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                      <span>{jury.avatar}</span>
                      <span>{jury.name}</span>
                    </span>
                    <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-100 uppercase">
                      Lean: {info.lean} (Score: {info.confidence}%)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 italic leading-relaxed line-clamp-4">
                    "{info.content.replace(/### Citizen Perspective\s*/g, "").trim()}"
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Jury Sentiment Chart */}
      <div id="jury-sentiment-chart-box" className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-slate-500">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>SWAY ANALYSIS: CONVICTION SWINGS</span>
        </div>
        
        {chartData.length <= 1 ? (
          <div className="bg-slate-50 rounded-lg p-6 border border-slate-100 text-center text-xs text-slate-400 italic">
            Conviction swaying chart will populate once debate steps begin executing...
          </div>
        ) : (
          <div className="h-64 border border-slate-100 bg-slate-50/20 p-2.5 rounded-xl">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 15, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="stepName" tick={{ fill: "#64748b", fontSize: 9 }} stroke="#cbd5e1" />
                <YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 9 }} stroke="#cbd5e1" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", border: "none" }}
                  labelStyle={{ color: "#94a3b8", fontSize: "10px", fontFamily: "monospace" }}
                  itemStyle={{ fill: "#fff", fontSize: "11px", fontFamily: "sans-serif" }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "10px", marginTop: "10px" }} />
                {juries.map((jury, i) => {
                  const colors = ["#4338ca", "#2563eb", "#db2777", "#ea580c", "#16a34a"];
                  return (
                    <Line
                      key={jury.id}
                      type="monotone"
                      dataKey={jury.name}
                      stroke={colors[i % colors.length]}
                      strokeWidth={2}
                      activeDot={{ r: 5 }}
                      dot={{ r: 2.5 }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="flex items-start gap-1.5 text-[10px] bg-indigo-50/85 border border-indigo-100/60 text-indigo-950 p-3 rounded-lg leading-relaxed shadow-sm">
        <Info className="w-3.5 h-3.5 flex-shrink-0 text-indigo-600 mt-0.5" />
        <p>
          <strong>Deductive swaying:</strong> During a debate step where attorneys speak, the system automatically checks the swaying effect by sequentially presenting their speech separately to individual jury members, causing their conviction rating metric to adapt dynamically.
        </p>
      </div>
    </div>
  );
}
