import React, { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../config';

const SocraticDebate = ({ debateId, onBack }) => {
  const [debate, setDebate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [aiResponding, setAiResponding] = useState(false);
  const messagesEndRef = useRef(null);

  // Fetch initial debate details
  const fetchDebate = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/debate/${debateId}`);
      if (res.ok) {
        const data = await res.json();
        setDebate(data);
        setMessages(data.conversation_history || []);
      }
    } catch (err) {
      console.error("Failed to load debate:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (debateId) {
      fetchDebate();
    }
  }, [debateId]);

  // Scroll to bottom whenever messages list updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, aiResponding]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || aiResponding || debate?.debate_complete) return;

    const studentMessage = inputText.trim();
    setInputText("");

    // Append student message locally
    const updatedMessages = [...messages, { role: 'student', message: studentMessage }];
    setMessages(updatedMessages);
    setAiResponding(true);

    const startTime = Date.now();

    try {
      const res = await fetch(`${API_BASE}/api/debate/${debateId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_message: studentMessage })
      });

      if (res.ok) {
        const data = await res.json();

        // Enforce a minimum typing indicator duration of 1.5 seconds
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(1500 - elapsedTime, 0);

        await new Promise(resolve => setTimeout(resolve, remainingTime));

        setMessages(prev => [...prev, { role: 'ai', message: data.message }]);
        
        // Refresh full debate details to get updated debate_complete status and diagnosis
        const refetchRes = await fetch(`${API_BASE}/api/debate/${debateId}`);
        if (refetchRes.ok) {
          const freshData = await refetchRes.json();
          setDebate(freshData);
        }
      }
    } catch (err) {
      console.error("Error communicating with Socratic agent:", err);
    } finally {
      setAiResponding(false);
    }
  };

  if (loading) {
    return (
      <div className="h-96 flex flex-col justify-center items-center gap-4 text-white max-w-lg mx-auto">
        <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-gray-400 text-xs">Entering the Socratic Chamber...</p>
      </div>
    );
  }

  if (!debate) {
    return (
      <div className="glass-panel rounded-3xl p-8 text-center text-white max-w-md mx-auto my-12">
        <p className="text-red-400 font-bold mb-4">Debate Session Not Found</p>
        <button onClick={onBack} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold">
          Return to Report
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col h-[calc(100vh-140px)] md:h-[650px]">
      
      {/* Socratic Header Banner */}
      <div className="glass-panel rounded-t-3xl border-b border-white/5 p-4 md:p-6 shrink-0 flex flex-col gap-2">
        <div className="flex justify-between items-start md:items-center">
          <div>
            <button 
              onClick={onBack}
              className="text-xs text-gray-400 hover:text-white flex items-center gap-1 font-semibold transition"
            >
              &larr; Return to Report
            </button>
            <h2 className="text-sm font-black text-white mt-1">Socratic Defense Chamber</h2>
          </div>
          <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-1 rounded-full font-bold uppercase shrink-0">
            Debate Active
          </span>
        </div>

        <div className="bg-slate-900/60 rounded-xl p-3 border border-white/5 text-xs text-gray-300 mt-2">
          <p className="font-semibold text-white mb-1"><span className="text-blue-400">Question:</span> {debate.question_text}</p>
          <p className="italic text-gray-400 mt-1"><span className="text-indigo-400 not-italic font-semibold">Your Exam Answer:</span> "{debate.student_answer}"</p>
        </div>
      </div>

      {/* Chat Conversation Scroll Area */}
      <div className="flex-grow bg-slate-950/40 border-x border-white/5 p-4 md:p-6 overflow-y-auto flex flex-col gap-4 min-h-0">
        
        <div className="text-center my-2 select-none">
          <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500 bg-slate-900/60 px-3 py-1 rounded-full border border-white/5">
            Begin Answer Defense
          </span>
          <p className="text-[10.5px] text-gray-400 max-w-md mx-auto mt-2.5 leading-relaxed">
            The Socratic Examiner does not grade, correct, or instruct. It will probe your logical reasoning to understand your conceptual grasp.
          </p>
        </div>

        {messages.map((msg, idx) => {
          const isAI = msg.role === 'ai';
          return (
            <div 
              key={idx} 
              className={`flex w-full ${isAI ? 'justify-start' : 'justify-end'}`}
            >
              <div 
                className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 text-sm shadow-md leading-relaxed whitespace-pre-wrap ${
                  isAI 
                    ? 'bg-slate-900 border border-white/5 text-gray-100 rounded-tl-none' 
                    : 'bg-blue-600 text-white rounded-tr-none shadow-blue-500/10'
                }`}
              >
                {msg.message}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {aiResponding && (
          <div className="flex w-full justify-start">
            <div className="bg-slate-900 border border-white/5 text-gray-100 rounded-2xl rounded-tl-none px-4 py-3 flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input or Complete Diagnosis Panel */}
      <div className="glass-panel rounded-b-3xl border-t border-white/5 p-4 shrink-0 bg-slate-950/20">
        {!debate.debate_complete ? (
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              className="flex-grow px-4 py-3 bg-black/40 border border-white/10 rounded-2xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
              placeholder={aiResponding ? "Waiting for examiner..." : "Type your explanation / defense..."}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={aiResponding}
            />
            <button
              type="submit"
              className="px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl text-xs transition-colors shrink-0 shadow-lg shadow-blue-500/10 disabled:opacity-40 disabled:pointer-events-none"
              disabled={!inputText.trim() || aiResponding}
            >
              Send
            </button>
          </form>
        ) : (
          <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 md:p-6 text-white space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏆</span>
                <div>
                  <h3 className="text-sm font-bold">Debate Complete</h3>
                  <p className="text-[10px] text-gray-400">Diagnosis confirmed by examiner agent</p>
                </div>
              </div>

              {debate.diagnosis && (
                <div className="flex gap-2">
                  <span className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-full border ${
                    debate.diagnosis.confirmed_error_type === 'CORRECT_AFTER_PROBING'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : debate.diagnosis.confirmed_error_type === 'BLIND_SPOT'
                      ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                      : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                  }`}>
                    {debate.diagnosis.confirmed_error_type.replace(/_/g, ' ')}
                  </span>
                  
                  <span className="text-[10px] uppercase font-bold bg-slate-800 border border-white/10 text-gray-300 px-2.5 py-1 rounded-full">
                    {debate.diagnosis.depth} gap
                  </span>
                </div>
              )}
            </div>

            {debate.diagnosis && (
              <div className="space-y-3 bg-black/30 rounded-xl p-4 border border-white/5 text-xs text-gray-300">
                <p>
                  <strong className="text-white block mb-0.5">Root Cause Misunderstanding:</strong>
                  {debate.diagnosis.root_cause}
                </p>
                
                <p>
                  <strong className="text-white block mb-0.5">Examiner Confidence:</strong>
                  {debate.diagnosis.confidence}% calibrated confidence depth
                </p>
                
                <div className="border-t border-white/5 pt-2.5 mt-2.5 text-[11px]">
                  {debate.diagnosis.confirmed_error_type === 'CORRECT_AFTER_PROBING' ? (
                    <p className="text-emerald-400 font-semibold">
                      Excellent work! Probing revealed you possess a sound understanding, despite what the initial test markers flagged. Focus on explaining your steps clearly in future tests!
                    </p>
                  ) : (
                    <p className="text-amber-400">
                      Recommendation: Study this specific misunderstanding. Pay close attention to the root cause identified by the examiner to resolve the conceptual deficit.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                onClick={onBack}
                className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition"
              >
                Return to Report Card
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default SocraticDebate;
