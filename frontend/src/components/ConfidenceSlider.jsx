import React from 'react';

const ConfidenceSlider = ({ value, onChange, disabled = false }) => {
  const getConfidenceDetails = (val) => {
    switch (val) {
      case 1:
        return { label: "Wild Guess", color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20", emoji: "🎲" };
      case 2:
        return { label: "Somewhat Unsure", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", emoji: "🤷" };
      case 3:
        return { label: "Fairly Confident", color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20", emoji: "🤔" };
      case 4:
        return { label: "Confident", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", emoji: "💪" };
      case 5:
        return { label: "Absolutely Certain", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", emoji: "🎯" };
      default:
        return { label: "Neutral", color: "text-gray-400", bg: "bg-gray-500/10", border: "border-gray-500/20", emoji: "😐" };
    }
  };

  const details = getConfidenceDetails(Number(value));

  return (
    <div className={`w-full mt-4 bg-slate-900/40 rounded-2xl border border-white/5 p-4 ${disabled ? 'opacity-50 select-none pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Confidence Level
        </label>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${details.bg} ${details.color} ${details.border} transition-all duration-300`}>
          <span>{details.emoji}</span>
          <span>{details.label}</span>
        </div>
      </div>
      
      <input
        type="range"
        min="1"
        max="5"
        step="1"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
      />
      
      <div className="flex justify-between text-[10px] font-semibold text-gray-500 px-1 mt-2">
        <span>1 (Guessing)</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
        <span>5 (Certain)</span>
      </div>
    </div>
  );
};

export default ConfidenceSlider;
