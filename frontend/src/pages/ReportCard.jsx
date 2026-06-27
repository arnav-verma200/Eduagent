import React, { useState, useEffect } from 'react';
import Modal from '../components/Modal';

const API_BASE = "http://localhost:8000";

const ReportCard = ({ examId, studentId, initialReportData, onBack }) => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // null | 'not_found' | 'failed'
  
  // Probe answers submission state
  const [probeAnswers, setProbeAnswers] = useState({}); // { p1: answer }
  const [submittingProbe, setSubmittingProbe] = useState(false);

  // Custom Modal configuration
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    confirmText: 'OK',
    cancelText: 'Cancel',
    onConfirm: null
  });

  const triggerModal = (type, title, message, onConfirm = null, confirmText = 'OK', cancelText = 'Cancel') => {
    setModalConfig({
      isOpen: true,
      type,
      title,
      message,
      confirmText,
      cancelText,
      onConfirm
    });
  };

  const closeModal = () => {
    setModalConfig(prev => ({ ...prev, isOpen: false }));
  };

  // Fetch report data if not passed from submit
  const fetchReport = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/exams/${examId}/student/${studentId}`);
      if (res.ok) {
        const data = await res.json();
        setReport(data);
        
        // Initialize probe answers state
        const initialAnswers = {};
        const pQuestions = data.probe_questions?.probe_questions || [];
        pQuestions.forEach(pq => {
          initialAnswers[pq.id] = '';
        });
        setProbeAnswers(initialAnswers);
      } else if (res.status === 404) {
        setError('not_found');
      } else {
        setError('failed');
      }
    } catch (err) {
      console.error("Error fetching report:", err);
      setError('failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialReportData) {
      // Map initial data format from submission endpoint
      // Submission endpoint returns { evaluation, integrity, probe_questions }
      const mappedReport = {
        exam_id: examId,
        student_id: studentId,
        evaluation: initialReportData.evaluation,
        integrity: initialReportData.integrity,
        probe_questions: { probe_questions: initialReportData.probe_questions },
        probe_evaluation: null,
        gap_depth: null
      };
      setReport(mappedReport);
      
      const initialAnswers = {};
      (initialReportData.probe_questions || []).forEach(pq => {
        initialAnswers[pq.id] = '';
      });
      setProbeAnswers(initialAnswers);
      setLoading(false);
    } else {
      fetchReport();
    }
  }, [examId, studentId, initialReportData]);

  const handleProbeAnswerChange = (pId, text) => {
    setProbeAnswers(prev => ({
      ...prev,
      [pId]: text
    }));
  };

  const handleSubmitProbes = async (e) => {
    e.preventDefault();
    
    // Check if they answered all probe questions
    const unanswered = (report.probe_questions?.probe_questions || []).filter(
      pq => !probeAnswers[pq.id] || !probeAnswers[pq.id].trim()
    );
    if (unanswered.length > 0) {
      triggerModal(
        'warning',
        'Unanswered Probes',
        'Please answer all diagnostic probe questions before submitting.'
      );
      return;
    }

    setSubmittingProbe(true);

    const payload = {
      student_id: studentId,
      responses: Object.entries(probeAnswers).map(([key, val]) => ({
        question_id: key,
        answer: val
      }))
    };

    try {
      const res = await fetch(`${API_BASE}/api/exams/${examId}/probe/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        // Update local report with probe evaluations and gap depth
        setReport(prev => ({
          ...prev,
          probe_evaluation: data.probe_evaluation,
          gap_depth: data.gap_depth
        }));
      } else {
        triggerModal(
          'error',
          'Failed to Submit Probes',
          'Failed to submit diagnostic probes. Please try again later.'
        );
      }
    } catch (err) {
      console.error("Error submitting probes:", err);
      triggerModal(
        'error',
        'Connection Error',
        'Error contacting the backend. Make sure your server is running.'
      );
    } finally {
      setSubmittingProbe(false);
    }
  };

  const getErrorBadgeClass = (errType) => {
    switch (errType) {
      case 'CORRECT':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25';
      case 'CONCEPTUAL_GAP':
        return 'bg-red-500/10 text-red-400 border-red-500/25';
      case 'PROCEDURAL_ERROR':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/25';
      case 'BLIND_SPOT':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/25 glow-accent';
      case 'MISCALIBRATION':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25';
      case 'PARTIAL':
        return 'bg-pink-500/10 text-pink-400 border-pink-500/25';
      default:
        return 'bg-slate-500/10 text-gray-400 border-white/5';
    }
  };

  const getErrorTypeDescription = (errType) => {
    switch (errType) {
      case 'CONCEPTUAL_GAP': return 'Conceptual Gap (wrong mental model of the concept)';
      case 'PROCEDURAL_ERROR': return 'Procedural Slip (valid concept, broke down in execution)';
      case 'BLIND_SPOT': return 'Blind Spot (incorrect answer but high confidence & weak reasoning)';
      case 'MISCALIBRATION': return 'Miscalibration (correct answer but low self-confidence)';
      case 'PARTIAL': return 'Partially Correct (specific smaller knowledge gaps)';
      default: return 'No concept errors detected';
    }
  };

  if (loading) {
    return (
      <div className="h-96 flex flex-col justify-center items-center gap-4 text-white">
        <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-gray-400">Compiling cognitive fingerprint report...</p>
      </div>
    );
  }

  if (error === 'not_found') {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="glass-panel rounded-3xl p-8 border border-white/5 space-y-6">
          <div className="h-16 w-16 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full flex items-center justify-center mx-auto text-2xl font-black">
            !
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white">No Report Found</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              No exam submission was found for Student ID <span className="font-mono text-blue-400">{studentId}</span> on this exam. Please take the exam first!
            </p>
          </div>
          <button 
            onClick={onBack}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition"
          >
            Go to Student Desk
          </button>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="glass-panel rounded-3xl p-8 border border-white/5 space-y-6">
          <div className="h-16 w-16 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full flex items-center justify-center mx-auto text-2xl font-black">
            ×
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white">Failed to Load Report</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              We encountered an issue loading your report card. Please check your network and try again.
            </p>
          </div>
          <button 
            onClick={onBack}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white border border-white/5 rounded-xl text-xs font-semibold transition"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const cogProfile = report.evaluation?.cognitive_profile || {};
  const evaluations = report.evaluation?.evaluations || [];
  const probeQuestions = report.probe_questions?.probe_questions || [];
  
  // Count error types for profile cards
  const errorCounts = {};
  evaluations.forEach(ev => {
    const err = ev.error_type;
    if (err !== 'CORRECT') {
      errorCounts[err] = (errorCounts[err] || 0) + 1;
    }
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Back Button */}
      <button 
        onClick={onBack}
        className="mb-6 text-xs text-gray-400 hover:text-white flex items-center gap-1 font-semibold"
      >
        &larr; Exit to Dashboard
      </button>

      {/* Main Score & Diagnostic Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Score Card */}
        <div className="glass-panel rounded-3xl p-6 flex flex-col justify-center items-center text-center col-span-1 border border-white/5 shadow-xl">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cognitive Score</span>
          <div className="relative mt-4 mb-2 flex items-center justify-center">
            <span className="text-5xl font-black text-white">{cogProfile.score}</span>
            <span className="text-gray-500 font-light text-2xl ml-1">/ {cogProfile.max_score}</span>
          </div>
          <span className="text-[11px] text-gray-400 px-4">
            Based on answer correctness and reasoning quality evaluation
          </span>
        </div>

        {/* Cognitive Profile Summary */}
        <div className="glass-panel rounded-3xl p-6 col-span-1 md:col-span-2 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Cognitive Profile</span>
            <h2 className="text-xl font-black text-white mt-2">
              Dominant Vulnerability: <span className="text-indigo-400 font-extrabold uppercase">{cogProfile.dominant_error_type?.replace('_', ' ')}</span>
            </h2>
            <p className="text-xs text-gray-400 leading-relaxed mt-2">
              {cogProfile.dominant_error_type === 'CORRECT' 
                ? "Excellent job! You displayed high mastery with clear understanding and calibrated confidence." 
                : `Our evaluator flagged ${cogProfile.dominant_error_type?.replace('_', ' ')} as your dominant error pattern. Check detailed feedback below.`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {Object.keys(errorCounts).length === 0 ? (
              <span className="px-2.5 py-1 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                Zero Concept Gaps Detected 🎉
              </span>
            ) : (
              Object.entries(errorCounts).map(([type, count]) => (
                <span 
                  key={type} 
                  className="px-2.5 py-1 text-[10px] font-bold bg-white/5 border border-white/10 text-gray-300 rounded-full"
                >
                  {count} {type.replace('_', ' ')}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Adversarial Probe / Gap Depth Diagnostic Banner */}
      {probeQuestions.length > 0 && (
        <div className="glass-panel rounded-3xl p-6 md:p-8 mb-8 border border-blue-500/20 glow-accent relative overflow-hidden">
          <div className="absolute top-0 right-0 h-24 w-24 bg-blue-500/5 rounded-full filter blur-xl"></div>
          
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-bold text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 uppercase tracking-wider">
              Adversarial Diagnostics
            </span>
            <span className="text-xs text-gray-400 font-medium">Probe Concept Depth</span>
          </div>

          <h3 className="text-lg font-black text-white mb-2">Deep Gap Probing Required</h3>
          <p className="text-xs text-gray-400 leading-relaxed mb-6">
            We generated 3 adversarial questions testing the concepts you got wrong. Answer them below to classify if this is a shallow slip (forgotten info) or deep gap (fundamental misunderstanding).
          </p>

          {/* Active Probe Form or Results */}
          {report.gap_depth ? (
            <div className="bg-black/30 border border-white/5 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-gray-400 font-semibold">Diagnostic Result:</span>
                <span className={`text-xs font-bold uppercase px-2.5 py-0.5 rounded ${
                  report.gap_depth === 'shallow' 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}>
                  {report.gap_depth} Gap
                </span>
              </div>
              
              <p className="text-sm font-semibold text-white leading-relaxed">
                {report.gap_depth === 'shallow' 
                  ? "Your gap is shallow - you just need review! You understand the underlying concepts but made execution errors or forgot minor details."
                  : "Your gap is deep - here's what to study. You have a fundamental misconception of this concept. We recommend visiting core study guides."}
              </p>

              {/* Probe feedback list */}
              <div className="mt-4 space-y-3 pt-4 border-t border-white/5">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Probe Evaluations</h4>
                {(report.probe_evaluation?.evaluations || []).map((pe, pidx) => (
                  <div key={pidx} className="text-xs border-b border-white/5 pb-2 last:border-b-0">
                    <span className="font-semibold text-white">Probe {pidx+1}: </span>
                    <span className={pe.is_correct ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>
                      {pe.is_correct ? "Correct" : "Incorrect"} (Score: {pe.score}/10)
                    </span>
                    <p className="text-gray-400 mt-1 italic">{pe.feedback}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitProbes} className="space-y-6">
              {probeQuestions.map((pq, idx) => (
                <div key={pq.id} className="bg-black/30 border border-white/5 rounded-2xl p-5 space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] uppercase font-bold text-gray-500">Diagnostic Question {idx+1}</span>
                    <span className="text-[9px] uppercase font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                      Targets Gap: {pq.targets_gap}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-white leading-relaxed">{pq.text}</h4>
                  <p className="text-[10px] text-gray-400 italic">Complexity: {pq.why_harder}</p>
                  
                  <textarea
                    className="w-full h-20 p-3 bg-black/40 border border-white/5 rounded-xl text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/30 transition resize-none leading-relaxed"
                    placeholder="Provide your diagnostic answer..."
                    value={probeAnswers[pq.id] || ''}
                    onChange={(e) => handleProbeAnswerChange(pq.id, e.target.value)}
                    required
                  />
                </div>
              ))}

              <button
                type="submit"
                disabled={submittingProbe}
                className="py-3 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all duration-300 shadow-md shadow-blue-500/10 flex items-center justify-center gap-2"
              >
                {submittingProbe ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Probing Gap Depth...
                  </>
                ) : "Submit Diagnostic Probes"}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Per-Question Cognitive Diagnostics Feed */}
      <h3 className="text-base font-bold text-white mb-4">Detailed Question Diagnostics</h3>
      <div className="space-y-6">
        {evaluations.map((ev, idx) => (
          <div 
            key={ev.question_id || idx} 
            className="glass-panel rounded-3xl p-6 border border-white/5 relative overflow-hidden"
          >
            {/* Top Row: Details */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  ev.is_correct 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {ev.is_correct ? "✓" : "✗"}
                </span>
                <span className="text-xs font-bold text-white">Question {idx+1}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getErrorBadgeClass(ev.error_type)}`}>
                  {ev.error_type?.replace('_', ' ')}
                </span>
                <span className="text-[10px] font-semibold text-gray-500 bg-slate-800/40 px-2 py-0.5 rounded border border-white/5">
                  Score: {ev.score}/10
                </span>
              </div>
            </div>

            {/* Question Text */}
            <h4 className="text-sm font-bold text-white leading-relaxed mb-4">
              {ev.question_text || `Question ID: ${ev.question_id}`}
            </h4>

            {/* MCQ Options Display */}
            {ev.options && ev.options.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4 text-xs">
                {ev.options.map((opt, oIdx) => {
                  const isStudentSelection = ev.answer === opt;
                  const isCorrectOption = ev.correct_answer === opt;
                  return (
                    <div 
                      key={oIdx}
                      className={`p-2.5 rounded-lg border flex items-center justify-between ${
                        isCorrectOption
                          ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                          : isStudentSelection
                          ? 'bg-red-500/5 border-red-500/20 text-red-400'
                          : 'bg-black/10 border-white/5 text-gray-500'
                      }`}
                    >
                      <span className="truncate pr-2">{opt}</span>
                      {isCorrectOption && <span className="font-extrabold text-[10px]">Correct</span>}
                      {isStudentSelection && !isCorrectOption && <span className="font-extrabold text-[10px]">Your Answer</span>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Non-MCQ answers */}
            {(!ev.options || ev.options.length === 0) && (
              <div className="bg-black/20 border border-white/5 rounded-xl p-3 mb-4 space-y-2 text-xs">
                <div>
                  <span className="block text-[10px] font-bold text-gray-500 uppercase">Your Answer</span>
                  <p className="text-gray-200 mt-1 font-medium">{ev.answer || "No answer provided"}</p>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-gray-500 uppercase">Expected Answer Outline</span>
                  <p className="text-emerald-400 mt-1 font-medium">{ev.correct_answer}</p>
                </div>
              </div>
            )}

            {/* Scratchpad and Feedback */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs mt-4 pt-4 border-t border-white/5">
              <div>
                <span className="block text-[10px] font-bold text-gray-500 uppercase">Your Working / Scratchpad</span>
                <p className="text-gray-300 mt-1 italic font-mono bg-black/20 p-2.5 rounded-xl border border-white/5">
                  {ev.scratchpad || "No scratchpad provided."}
                </p>
              </div>
              <div className="flex flex-col justify-between">
                <div>
                  <span className="block text-[10px] font-bold text-blue-400 uppercase">AI Diagnostics</span>
                  <p className="text-gray-200 mt-1 font-medium bg-blue-500/5 p-2.5 rounded-xl border border-blue-500/10 leading-relaxed">
                    {ev.feedback}
                  </p>
                </div>
                
                <div className="flex gap-4 text-[10px] text-gray-500 mt-3">
                  <span>Confidence Accuracy: <strong className="text-gray-300">{ev.confidence_accuracy}</strong></span>
                  <span>Reasoning Quality: <strong className="text-gray-300">{ev.reasoning_quality}</strong></span>
                </div>
              </div>
            </div>

          </div>
        ))}
      </div>

      {/* Custom Modal Popup */}
      <Modal
        isOpen={modalConfig.isOpen}
        onClose={closeModal}
        type={modalConfig.type}
        title={modalConfig.title}
        message={modalConfig.message}
        confirmText={modalConfig.confirmText}
        cancelText={modalConfig.cancelText}
        onConfirm={modalConfig.onConfirm}
      />
    </div>
  );
};

export default ReportCard;
