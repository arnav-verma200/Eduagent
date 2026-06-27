import React, { useState, useEffect } from 'react';
import Scratchpad from '../components/Scratchpad';
import ConfidenceSlider from '../components/ConfidenceSlider';

const API_BASE = "http://localhost:8000";

const ExamInterface = ({ examId, studentId, onSubmitSuccess, onCancel }) => {
  const [exam, setExam] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Student answer states
  const [answers, setAnswers] = useState({}); // { q_id: answer_text }
  const [scratchpads, setScratchpads] = useState({}); // { q_id: scratchpad_text }
  const [confidences, setConfidences] = useState({}); // { q_id: 1-5 }
  const [timeSpent, setTimeSpent] = useState({}); // { q_id: seconds }
  
  // Total timer
  const [totalSeconds, setTotalSeconds] = useState(0);

  // Fetch exam questions
  useEffect(() => {
    const fetchExam = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/exams/${examId}`);
        if (res.ok) {
          const data = await res.json();
          setExam(data);
          setQuestions(data.questions || []);
          
          // Initialize answer states
          const initialAnswers = {};
          const initialScratchpads = {};
          const initialConfidences = {};
          const initialTimes = {};
          
          (data.questions || []).forEach(q => {
            initialAnswers[q.id] = '';
            initialScratchpads[q.id] = '';
            initialConfidences[q.id] = 3; // Default confidence
            initialTimes[q.id] = 0;
          });
          
          setAnswers(initialAnswers);
          setScratchpads(initialScratchpads);
          setConfidences(initialConfidences);
          setTimeSpent(initialTimes);
        } else {
          alert("Failed to load the exam questions.");
        }
      } catch (err) {
        console.error("Error fetching exam:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchExam();
  }, [examId]);

  // Track time per question and total time
  useEffect(() => {
    if (loading || submitting || !questions.length || currentIdx >= questions.length) return;
    
    const activeQId = questions[currentIdx].id;
    
    const interval = setInterval(() => {
      setTotalSeconds(prev => prev + 1);
      setTimeSpent(prev => ({
        ...prev,
        [activeQId]: (prev[activeQId] || 0) + 1
      }));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [loading, submitting, currentIdx, questions]);

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
    }
  };

  const handlePrev = () => {
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
    }
  };

  const handleMCQSelect = (qId, option) => {
    setAnswers(prev => ({
      ...prev,
      [qId]: option
    }));
  };

  const handleTextAnswerChange = (qId, text) => {
    setAnswers(prev => ({
      ...prev,
      [qId]: text
    }));
  };

  const handleScratchpadChange = (qId, text) => {
    setScratchpads(prev => ({
      ...prev,
      [qId]: text
    }));
  };

  const handleConfidenceChange = (qId, val) => {
    setConfidences(prev => ({
      ...prev,
      [qId]: val
    }));
  };

  const handleSubmitExam = async () => {
    // Basic verification: check if they answered all questions
    const unanswered = questions.filter(q => !answers[q.id] || !answers[q.id].trim());
    if (unanswered.length > 0) {
      const confirmSubmit = window.confirm(
        `You have ${unanswered.length} unanswered questions. Are you sure you want to submit?`
      );
      if (!confirmSubmit) return;
    }

    setSubmitting(true);
    
    // Map responses into the payload structure
    const payloadResponses = questions.map(q => ({
      question_id: q.id,
      answer: answers[q.id] || "No answer provided",
      scratchpad: scratchpads[q.id] || "No scratchpad provided",
      confidence: confidences[q.id] || 3,
      time_spent: timeSpent[q.id] || 0
    }));

    const payload = {
      student_id: studentId,
      responses: payloadResponses
    };

    try {
      const res = await fetch(`${API_BASE}/api/exams/${examId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        // Trigger parent callback on success, moving the student to their report card
        onSubmitSuccess(data);
      } else {
        const errText = await res.text();
        alert(`Submission failed: ${errText}`);
      }
    } catch (err) {
      console.error("Error submitting exam:", err);
      alert("Error contacting the backend to submit. Make sure your server is running.");
    } finally {
      setSubmitting(false);
    }
  };

  // Helper to format time
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="h-96 flex flex-col justify-center items-center gap-4 text-white">
        <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-gray-400">Loading syllabus exam questions...</p>
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="h-96 flex flex-col justify-center items-center gap-5 text-white max-w-lg mx-auto text-center px-4">
        <svg className="animate-spin h-10 w-10 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-white">Analyzing Cognitive Fingerprint...</h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            Our multi-agent AI pipeline is assessing your answers, evaluating scratchpad reasoning, and scanning behavioral confidence to build your custom syllabus report.
          </p>
        </div>
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center text-white">
        <p className="text-gray-400">This exam contains no questions.</p>
        <button onClick={onCancel} className="mt-4 px-4 py-2 bg-slate-800 text-white rounded">Back</button>
      </div>
    );
  }

  const currentQ = questions[currentIdx];
  const qAnswer = answers[currentQ.id] || '';
  const qScratchpad = scratchpads[currentQ.id] || '';
  const qConfidence = confidences[currentQ.id] || 3;
  const qTime = timeSpent[currentQ.id] || 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Top Banner: Navigation / Title & Timers */}
      <div className="glass-panel rounded-2xl p-4 mb-6 flex justify-between items-center">
        <div>
          <button 
            onClick={onCancel}
            className="text-xs text-gray-400 hover:text-white flex items-center gap-1 font-semibold"
          >
            &larr; Exit Exam
          </button>
          <h2 className="text-sm font-bold text-white truncate max-w-[200px] md:max-w-md mt-1">{exam?.topic}</h2>
        </div>
        
        <div className="flex gap-4 items-center">
          <div className="text-right shrink-0">
            <span className="block text-[9px] uppercase font-bold text-gray-500">Question Time</span>
            <span className="font-mono text-sm font-semibold text-blue-400">{formatTime(qTime)}</span>
          </div>
          <div className="h-6 w-px bg-white/10"></div>
          <div className="text-right shrink-0">
            <span className="block text-[9px] uppercase font-bold text-gray-500">Total Timer</span>
            <span className="font-mono text-sm font-semibold text-white">{formatTime(totalSeconds)}</span>
          </div>
        </div>
      </div>

      {/* Progress Bar Indicators */}
      <div className="flex items-center gap-1.5 mb-6 overflow-x-auto py-1">
        {questions.map((q, idx) => {
          const isAnswered = answers[q.id] && answers[q.id].trim();
          return (
            <button
              key={q.id}
              onClick={() => setCurrentIdx(idx)}
              className={`h-2.5 rounded-full shrink-0 transition-all ${
                idx === currentIdx 
                  ? 'w-10 bg-blue-500' 
                  : isAnswered 
                  ? 'w-4 bg-indigo-500/60 hover:bg-indigo-500' 
                  : 'w-4 bg-slate-800 hover:bg-slate-700'
              }`}
              title={`Question ${idx + 1}`}
            />
          );
        })}
      </div>

      {/* Question Card */}
      <div className="glass-panel rounded-3xl p-6 md:p-8 glow-accent">
        <div className="flex justify-between items-center mb-6">
          <span className="text-xs font-bold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20">
            Question {currentIdx + 1} of {questions.length}
          </span>
          <span className="text-xs text-gray-400 capitalize bg-slate-800/40 border border-white/5 px-2.5 py-1 rounded-full">
            {currentQ.difficulty} | {currentQ.cognitive_level}
          </span>
        </div>

        <h3 className="text-lg md:text-xl font-bold text-white leading-relaxed mb-6">
          {currentQ.text}
        </h3>

        {/* Answer Inputs based on Question Type */}
        {currentQ.type === 'mcq' ? (
          <div className="space-y-3 mb-6">
            {(currentQ.options || []).map((option, idx) => {
              const isSelected = qAnswer === option;
              return (
                <div
                  key={idx}
                  onClick={() => handleMCQSelect(currentQ.id, option)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all duration-300 flex items-center justify-between ${
                    isSelected
                      ? 'bg-blue-500/10 border-blue-500/50 text-white'
                      : 'bg-black/20 border-white/5 hover:border-white/10 hover:bg-black/30 text-gray-300'
                  }`}
                >
                  <span className="text-sm font-medium pr-4">{option}</span>
                  <div className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                    isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-600'
                  }`}>
                    {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2 mb-6">
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Your Answer</label>
            <textarea
              className="w-full h-28 p-4 bg-black/30 border border-white/5 rounded-2xl text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/30 transition resize-none leading-relaxed"
              placeholder="Type your final answer/conclusions here..."
              value={qAnswer}
              onChange={(e) => handleTextAnswerChange(currentQ.id, e.target.value)}
            />
          </div>
        )}

        {/* Scratchpad and Slider */}
        <Scratchpad
          value={qScratchpad}
          onChange={(text) => handleScratchpadChange(currentQ.id, text)}
        />

        <ConfidenceSlider
          value={qConfidence}
          onChange={(val) => handleConfidenceChange(currentQ.id, val)}
        />
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between items-center mt-6">
        <button
          onClick={handlePrev}
          disabled={currentIdx === 0}
          className="px-5 py-3 bg-slate-900/60 border border-white/5 text-gray-300 hover:text-white rounded-xl text-sm font-semibold transition disabled:opacity-30 disabled:pointer-events-none"
        >
          &larr; Previous
        </button>

        {currentIdx < questions.length - 1 ? (
          <button
            onClick={handleNext}
            className="px-5 py-3 bg-slate-900/60 border border-white/5 text-gray-300 hover:text-white rounded-xl text-sm font-semibold transition"
          >
            Next &rarr;
          </button>
        ) : (
          <button
            onClick={handleSubmitExam}
            className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-sm font-semibold transition-all duration-300 shadow-md shadow-emerald-500/10"
          >
            Submit Exam
          </button>
        )}
      </div>
    </div>
  );
};

export default ExamInterface;
