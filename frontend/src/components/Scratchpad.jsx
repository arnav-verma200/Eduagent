import React from 'react';

const Scratchpad = ({ 
  value, 
  onChange, 
  placeholder = "Write out your step-by-step thinking process here...\nFor example: 'If we split the list in half, we search...' or 'Using the formula...'" 
}) => {
  const charCount = value ? value.length : 0;
  
  return (
    <div className="w-full mt-4 bg-slate-900/40 rounded-2xl border border-white/5 p-4 focus-within:border-blue-500/30 transition-all duration-300">
      <div className="flex items-center justify-between mb-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Reasoning Scratchpad
        </label>
        <span className="text-[10px] font-mono text-gray-500">{charCount} characters</span>
      </div>
      
      <p className="text-[11px] text-gray-400 mb-2 leading-relaxed">
        Show your working — explaining your logic helps identify specific conceptual gaps or calculation slip-ups for custom feedback.
      </p>
      
      <textarea
        className="w-full h-32 p-3 bg-black/30 border border-white/5 rounded-xl text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/30 transition resize-none font-mono leading-relaxed"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};

export default Scratchpad;
