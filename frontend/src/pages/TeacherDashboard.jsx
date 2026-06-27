import React, { useState, useEffect } from 'react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid 
} from 'recharts';
import Modal from '../components/Modal';
import { API_BASE } from '../config';

const TeacherDashboard = ({ onViewStudentReport }) => {
  const [topic, setTopic] = useState('');
  const [numQuestions, setNumQuestions] = useState(10);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState(null);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // overview, gaps, integrity, students

  // Expanded student detail states for Socratic debate transcript inspection
  const [expandedStudentId, setExpandedStudentId] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [debateHistoryMap, setDebateHistoryMap] = useState({});

  const toggleExpandStudent = async (studentId) => {
    if (expandedStudentId === studentId) {
      setExpandedStudentId(null);
      setStudentDetail(null);
      return;
    }
    setExpandedStudentId(studentId);
    setDetailLoading(true);
    setStudentDetail(null);
    try {
      const res = await fetch(`${API_BASE}/api/exams/${selectedExamId}/student/${studentId}`);
      if (res.ok) {
        const data = await res.json();
        setStudentDetail(data);
        
        // Fetch transcripts for completed debates
        const diagnoses = data.confirmed_diagnosis || {};
        for (const [qId, diag] of Object.entries(diagnoses)) {
          if (diag.debate_id && !debateHistoryMap[diag.debate_id]) {
            fetchDebateTranscript(diag.debate_id);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load student detailed report:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const fetchDebateTranscript = async (debateId) => {
    try {
      const res = await fetch(`${API_BASE}/api/debate/${debateId}`);
      if (res.ok) {
        const data = await res.json();
        setDebateHistoryMap(prev => ({
          ...prev,
          [debateId]: data.conversation_history || []
        }));
      }
    } catch (err) {
      console.error("Failed to fetch debate transcript:", err);
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
        return 'bg-blue-500/10 text-blue-400 border-blue-500/25';
      case 'MISCALIBRATION':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25';
      case 'PARTIAL':
        return 'bg-pink-500/10 text-pink-400 border-pink-500/25';
      default:
        return 'bg-slate-500/10 text-gray-400 border-white/5';
    }
  };

  // Custom Modal configuration
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    type: 'info',
    title: '',
    message: ''
  });

  const triggerModal = (type, title, message) => {
    setModalConfig({
      isOpen: true,
      type,
      title,
      message
    });
  };

  const closeModal = () => {
    setModalConfig(prev => ({ ...prev, isOpen: false }));
  };

  // Fetch all exams on load
  const fetchExams = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/exams`);
      if (res.ok) {
        const data = await res.json();
        setExams(data);
      }
    } catch (err) {
      console.error("Failed to fetch exams:", err);
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  // Fetch report for selected exam
  const fetchReport = async (examId) => {
    setReportLoading(true);
    setSelectedExamId(examId);
    // BUG-13 fix: Clear stale debate transcripts when switching exams
    setDebateHistoryMap({});
    setExpandedStudentId(null);
    setStudentDetail(null);
    try {
      const res = await fetch(`${API_BASE}/api/exams/${examId}/report`);
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
    } catch (err) {
      console.error("Failed to fetch report:", err);
    } finally {
      setReportLoading(false);
    }
  };

  // Handle PDF upload and exam generation
  const handleGenerateExam = async (e) => {
    e.preventDefault();
    if (!file || !topic) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('topic', topic);
    formData.append('num_questions', numQuestions);
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/api/exams/generate`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setTopic('');
        setFile(null);
        // Clear file input
        const fileInput = document.getElementById('pdf-upload');
        if (fileInput) fileInput.value = '';
        
        await fetchExams();
        // Automatically select the newly created exam report
        fetchReport(data.exam_id);
      } else {
        const errText = await res.text();
        triggerModal(
          'error',
          'Exam Generation Failed',
          `Failed to generate exam: ${errText}`
        );
      }
    } catch (err) {
      console.error("Error generating exam:", err);
      triggerModal(
        'error',
        'Connection Error',
        'Error contacting the backend. Make sure your FastAPI server is running.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Prepare chart data for Recharts
  const COLORS = ['#10B981', '#EF4444', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899'];
  const getChartData = () => {
    if (!report || !report.error_type_distribution) return [];
    return Object.entries(report.error_type_distribution).map(([key, val]) => ({
      name: key.replace(/_/g, ' '),
      value: val
    })).filter(item => item.value > 0);
  };

  const chartData = getChartData();

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">EduAgent</span> 
            <span className="text-gray-400 font-light">Teacher Portal</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">Design cognitive exams, view reasoning analytics, and identify conceptual vulnerabilities.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Create Exam & List Exams */}
        <div className="space-y-8 lg:col-span-1">
          
          {/* Create Exam Panel */}
          <div className="glass-panel rounded-2xl p-6 glow-accent">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Design New Exam
            </h2>
            
            <form onSubmit={handleGenerateExam} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Exam Topic</label>
                <input
                  type="text"
                  placeholder="e.g., Binary Search Trees, Cell Biology"
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Number of Questions</label>
                <select
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(Number(e.target.value))}
                >
                  <option value={5}>5 Questions (Short Demo)</option>
                  <option value={10}>10 Questions (Balanced Exam)</option>
                  <option value={15}>15 Questions (Detailed Exam)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Resource PDF</label>
                <div className="relative border border-dashed border-white/10 hover:border-blue-500/30 rounded-xl p-4 transition-colors bg-black/20 flex flex-col items-center justify-center cursor-pointer">
                  <input
                    id="pdf-upload"
                    type="file"
                    accept=".pdf"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={(e) => setFile(e.target.files[0])}
                    required
                  />
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="text-xs text-gray-400 text-center font-medium">
                    {file ? file.name : "Drag & drop or browse PDF"}
                  </span>
                  <span className="text-[10px] text-gray-500 mt-1">AI builds syllabus and questions from text</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !file || !topic}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-blue-800 disabled:to-indigo-800 text-white rounded-xl text-sm font-semibold transition-all duration-300 shadow-md shadow-blue-500/10 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Designing Exam (10-20s)...
                  </>
                ) : "Create Cognitive Exam"}
              </button>
            </form>
          </div>

          {/* Created Exams List */}
          <div className="glass-panel rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Active Syllabus Exams
            </h2>
            
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {exams.length === 0 ? (
                <p className="text-gray-500 text-xs text-center py-6">No exams designed yet. Upload a syllabus PDF to get started.</p>
              ) : (
                exams.map((exam) => (
                  <div
                    key={exam.id}
                    onClick={() => fetchReport(exam.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all duration-300 flex justify-between items-center ${
                      selectedExamId === exam.id
                        ? 'bg-blue-900/20 border-blue-500/50 shadow-sm shadow-blue-500/5'
                        : 'bg-black/20 border-white/5 hover:border-white/10 hover:bg-black/30'
                    }`}
                  >
                    <div className="truncate pr-2">
                      <h3 className="text-sm font-semibold text-white truncate">{exam.topic}</h3>
                      <p className="text-[10px] text-gray-500 mt-0.5">ID: {exam.id.slice(0, 8)}...</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-semibold text-blue-400">{exam.student_count || 0} attempts</div>
                      <div className="text-[10px] text-gray-400">{exam.average_score ? `${exam.average_score}% avg` : 'No score'}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Right Side: Analytical Reports */}
        <div className="lg:col-span-2">
          
          {selectedExamId ? (
            reportLoading ? (
              <div className="h-96 glass-panel rounded-2xl flex flex-col justify-center items-center gap-4">
                <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-sm text-gray-400">Compiling class analytics...</p>
              </div>
            ) : report ? (
              <div className="space-y-6">
                
                {/* Exam Title & Stats Banner */}
                <div className="glass-panel rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">Class Report</span>
                    <h2 className="text-2xl font-black text-white mt-2">{report.topic}</h2>
                    <p className="text-xs text-gray-400 mt-1">Summary of {report.total_submissions} student evaluations</p>
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="bg-slate-900/50 border border-white/5 rounded-xl px-4 py-2">
                      <span className="block text-[10px] text-gray-500 uppercase font-semibold">Average Accuracy</span>
                      <span className="text-2xl font-extrabold text-white">{report.average_score}%</span>
                    </div>
                    <div className="bg-slate-900/50 border border-white/5 rounded-xl px-4 py-2">
                      <span className="block text-[10px] text-gray-500 uppercase font-semibold">Total Submissions</span>
                      <span className="text-2xl font-extrabold text-blue-400">{report.total_submissions}</span>
                    </div>
                  </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-2 border-b border-white/10 pb-1">
                  {[
                    { id: 'overview', label: 'Error Diagnostics' },
                    { id: 'gaps', label: 'Conceptual Gaps' },
                    { id: 'integrity', label: 'Integrity Anomalies' },
                    { id: 'students', label: 'Student Results' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                        activeTab === tab.id
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {tab.label}
                      {tab.id === 'integrity' && report.integrity_flags.length > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-[9px] bg-red-600 text-white rounded-full">
                          {report.integrity_flags.filter(f => f.severity !== 'low').length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Tab Content: 1. Overview / Error Charts */}
                {activeTab === 'overview' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Recharts Pie Chart */}
                    <div className="glass-panel rounded-2xl p-6 flex flex-col h-80">
                      <h3 className="text-sm font-bold text-white mb-4">Cognitive Error Type Distribution</h3>
                      {chartData.length > 0 ? (
                        <div className="flex-1 w-full h-full min-h-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                              >
                                {chartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', color: '#fff' }}
                                itemStyle={{ color: '#fff' }}
                              />
                              <Legend 
                                verticalAlign="bottom" 
                                height={36} 
                                iconSize={8}
                                iconType="circle"
                                wrapperStyle={{ fontSize: '10px', color: '#9CA3AF' }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 text-center my-auto">No cognitive errors detected. Class performs perfectly!</p>
                      )}
                    </div>

                    {/* Error types guide card */}
                    <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between">
                      <h3 className="text-sm font-bold text-white mb-4">Diagnostics Guide</h3>
                      <div className="space-y-3.5 text-xs text-gray-400">
                        <div className="flex gap-2">
                          <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0 mt-0.5"></div>
                          <div>
                            <span className="font-semibold text-white">CORRECT / CALIBRATED:</span> Knows the concept and answer.
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <div className="w-3 h-3 rounded-full bg-red-500 shrink-0 mt-0.5"></div>
                          <div>
                            <span className="font-semibold text-white">CONCEPTUAL GAP:</span> Wrong mental model of the concept. Requires retraining.
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <div className="w-3 h-3 rounded-full bg-amber-500 shrink-0 mt-0.5"></div>
                          <div>
                            <span className="font-semibold text-white">PROCEDURAL ERROR:</span> Right concept, wrong execution or math slip.
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <div className="w-3 h-3 rounded-full bg-blue-500 shrink-0 mt-0.5"></div>
                          <div>
                            <span className="font-semibold text-white">BLIND SPOT:</span> Wrong answer + High confidence + No reasoning. (Dangerous!)
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <div className="w-3 h-3 rounded-full bg-indigo-500 shrink-0 mt-0.5"></div>
                          <div>
                            <span className="font-semibold text-white">MISCALIBRATION:</span> Correct answer + Low confidence. Needs encouragement.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab Content: 2. Concept Gaps */}
                {activeTab === 'gaps' && (
                  <div className="glass-panel rounded-2xl p-6">
                    <h3 className="text-sm font-bold text-white mb-4">Top Concept Vulnerabilities</h3>
                    
                    {report.top_concept_gaps.length === 0 ? (
                      <p className="text-gray-500 text-xs text-center py-6">No recurring concept gaps found in this exam.</p>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-xs text-gray-400 leading-relaxed mb-2">
                          The following concepts were missed most frequently by students during evaluations. Focus review lectures on these items.
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {report.top_concept_gaps.map((gap, index) => (
                            <div key={index} className="bg-slate-900/40 border border-white/5 rounded-xl p-4 flex justify-between items-center">
                              <div>
                                <span className="text-[10px] text-blue-400 font-semibold tracking-wider uppercase block">Rank {index+1}</span>
                                <span className="text-sm font-bold text-white">{gap.concept}</span>
                              </div>
                              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5 text-center shrink-0">
                                <span className="block text-xs font-extrabold text-red-400">{gap.count}</span>
                                <span className="text-[9px] text-gray-500">students</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab Content: 3. Integrity Flags */}
                {activeTab === 'integrity' && (
                  <div className="glass-panel rounded-2xl p-6 border-l-4 border-red-500/60 glow-accent-rose">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-bold text-white">Integrity Flags (Anomalous Behaviors)</h3>
                        <p className="text-xs text-gray-400 mt-1">Based on timing slips, confidence discrepancies, and reasoning omissions.</p>
                      </div>
                      <span className="px-2.5 py-1 text-xs font-bold bg-red-950/60 text-red-400 border border-red-900/50 rounded-full">
                        {report.integrity_flags.length} Flagged Events
                      </span>
                    </div>

                    {report.integrity_flags.length === 0 ? (
                      <p className="text-gray-500 text-xs text-center py-6">No behavioral anomalies detected. High student integrity patterns.</p>
                    ) : (
                      <div className="space-y-3">
                        {report.integrity_flags.map((flag, idx) => (
                          <div 
                            key={idx} 
                            className={`p-4 rounded-xl border bg-black/40 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
                              flag.severity === 'high' 
                                ? 'border-red-500/30 bg-red-950/10' 
                                : flag.severity === 'medium'
                                ? 'border-amber-500/30 bg-amber-950/10'
                                : 'border-white/5'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white">Student: {flag.student_id}</span>
                                <span className={`text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full ${
                                  flag.severity === 'high' 
                                    ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                                    : flag.severity === 'medium'
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                    : 'bg-slate-500/20 text-gray-400 border border-white/5'
                                }`}>
                                  {flag.severity} Severity
                                </span>
                              </div>
                              <p className="text-xs text-gray-300 font-medium">{flag.evidence}</p>
                              <p className="text-[10px] text-gray-500">Anomaly Type: {flag.type} | Question: {flag.question_id}</p>
                            </div>
                            
                            <button
                              onClick={() => onViewStudentReport(report.exam_id, flag.student_id)}
                              className="text-xs text-blue-400 hover:text-blue-300 font-semibold shrink-0"
                            >
                              Verify Fingerprint &rarr;
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab Content: 4. Student Results */}
                {activeTab === 'students' && (
                  <div className="glass-panel rounded-2xl p-6">
                    <h3 className="text-sm font-bold text-white mb-4">Student Submissions Grid</h3>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-white/10 text-gray-500 font-semibold">
                            <th className="py-3 px-2">Student ID</th>
                            <th className="py-3 px-2 text-center">Score (Max)</th>
                            <th className="py-3 px-2">Dominant Error</th>
                            <th className="py-3 px-2 text-center">Integrity Rating</th>
                            <th className="py-3 px-2">Probe Gap Depth</th>
                            <th className="py-3 px-2 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {report.student_results.map((st, idx) => (
                            <React.Fragment key={idx}>
                              <tr className="hover:bg-white/5 transition-colors">
                                <td className="py-3 px-2 font-bold text-white">{st.student_id}</td>
                              <td className="py-3 px-2 text-center font-mono font-semibold">
                                {st.score} / {st.max_score}
                              </td>
                              <td className="py-3 px-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${
                                  st.dominant_error_type === 'CORRECT'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : st.dominant_error_type === 'CONCEPTUAL_GAP'
                                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                    : st.dominant_error_type === 'BLIND_SPOT'
                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                }`}>
                                  {st.dominant_error_type}
                                </span>
                              </td>
                              <td className="py-3 px-2 text-center">
                                <span className={`font-mono font-bold ${
                                  st.integrity_score >= 80 
                                    ? 'text-emerald-400' 
                                    : st.integrity_score >= 50
                                    ? 'text-amber-400'
                                    : 'text-red-400'
                                }`}>
                                  {st.integrity_score}%
                                </span>
                              </td>
                              <td className="py-3 px-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize ${
                                  st.gap_depth === 'shallow'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : st.gap_depth === 'deep'
                                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                    : 'bg-slate-500/10 text-gray-400 border border-white/5'
                                }`}>
                                  {st.gap_depth}
                                </span>
                              </td>
                              <td className="py-3 px-2 text-right flex justify-end gap-2">
                                <button
                                  onClick={() => toggleExpandStudent(st.student_id)}
                                  className={`px-2.5 py-1 text-[11px] rounded border transition-all font-semibold ${
                                    expandedStudentId === st.student_id
                                      ? 'bg-purple-600 border-purple-500 text-white shadow'
                                      : 'bg-purple-600/20 hover:bg-purple-600 text-purple-400 border-purple-500/30 hover:text-white'
                                  }`}
                                >
                                  {expandedStudentId === st.student_id ? 'Hide Details' : 'View Details'}
                                </button>
                                <button
                                  onClick={() => onViewStudentReport(report.exam_id, st.student_id)}
                                  className="px-2.5 py-1 text-[11px] bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded border border-blue-500/30 transition-all font-semibold"
                                >
                                  Report Card
                                </button>
                              </td>
                            </tr>
                            {expandedStudentId === st.student_id && (
                              <tr key={`details-${st.student_id}`}>
                                <td colSpan="6" className="bg-slate-950/60 p-6 border-b border-white/10">
                                  {detailLoading ? (
                                    <div className="flex justify-center items-center py-6 gap-2">
                                      <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                      </svg>
                                      <span className="text-gray-400">Loading student detailed fingerprint...</span>
                                    </div>
                                  ) : studentDetail ? (
                                    <div className="space-y-6 text-left">
                                      <div className="flex justify-between items-center pb-3 border-b border-white/5">
                                        <h4 className="text-sm font-bold text-white uppercase tracking-wider">Student: {st.student_id} Detailed Question Log</h4>
                                      </div>

                                      <div className="space-y-6">
                                        {(studentDetail.evaluation?.evaluations || []).map((ev, eIdx) => {
                                          const confirmedDiag = studentDetail.confirmed_diagnosis?.[ev.question_id];
                                          const isMismatch = confirmedDiag && confirmedDiag.confirmed_error_type !== ev.error_type;
                                          return (
                                            <div key={eIdx} className="bg-black/30 border border-white/5 rounded-2xl p-4 space-y-4">
                                              <div className="flex justify-between items-start flex-wrap gap-2 pb-2 border-b border-white/5">
                                                <div>
                                                  <span className="font-semibold text-white">Question {eIdx + 1}:</span>
                                                  <p className="text-gray-300 mt-1">{ev.question_text}</p>
                                                </div>
                                                <div className="flex gap-2">
                                                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${getErrorBadgeClass(ev.error_type)}`}>
                                                    {ev.error_type}
                                                  </span>
                                                </div>
                                              </div>

                                              {/* Diagnosis Side-by-Side */}
                                              {confirmedDiag ? (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                  {/* Left: Initial Assessment */}
                                                  <div className="bg-slate-950/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between">
                                                    <div>
                                                      <span className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Initial Assessment</span>
                                                      <p className="text-xs font-semibold text-white">Error Type: <span className="text-rose-400 font-bold">{ev.error_type?.replace(/_/g, ' ')}</span></p>
                                                      <p className="text-gray-400 mt-1 leading-relaxed text-[11px]">{ev.feedback}</p>
                                                    </div>
                                                  </div>

                                                  {/* Right: Confirmed Post-Debate */}
                                                  <div className={`border rounded-xl p-3 space-y-2 ${
                                                    isMismatch
                                                      ? 'bg-red-500/5 border-red-500/20 shadow-md shadow-red-500/5'
                                                      : 'bg-emerald-500/5 border-emerald-500/20'
                                                  }`}>
                                                    <div className="flex justify-between items-center flex-wrap gap-1">
                                                      <span className="block text-[9px] font-bold text-purple-400 uppercase">Post-Debate Confirmed</span>
                                                      {isMismatch && (
                                                        <span className="text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded animate-pulse uppercase tracking-wider">
                                                          Diagnosis Mismatch
                                                        </span>
                                                      )}
                                                    </div>

                                                    <div className="space-y-1 text-xs">
                                                      <p className="font-semibold text-white">Confirmed Type: <span className="text-emerald-400 font-bold uppercase">{confirmedDiag.confirmed_error_type?.replace(/_/g, ' ')}</span></p>
                                                      <p className="text-gray-300 leading-relaxed text-[11px]">
                                                        <strong className="text-white block text-[9.5px] mb-0.5">Root Cause:</strong>
                                                        "{confirmedDiag.root_cause}"
                                                      </p>
                                                      <p className="text-gray-300 leading-relaxed text-[11px]">
                                                        <strong className="text-white block text-[9.5px] mb-0.5">Teacher Note:</strong>
                                                        "{confirmedDiag.teacher_note}"
                                                      </p>
                                                    </div>

                                                    <div className="flex justify-between items-center text-[9px] text-gray-500 pt-1.5 border-t border-white/5">
                                                      <span>Calibrated Confidence: <strong className="text-gray-300">{confirmedDiag.confidence}%</strong></span>
                                                      <span>Depth: <strong className="text-gray-300 uppercase font-mono">{confirmedDiag.depth}</strong></span>
                                                    </div>
                                                  </div>
                                                </div>
                                              ) : (
                                                <div className="bg-slate-950/40 border border-white/5 rounded-xl p-3">
                                                  <span className="block text-[9px] font-bold text-blue-400 uppercase mb-1">AI Diagnostics</span>
                                                  <p className="text-gray-400 leading-relaxed text-[11px]">{ev.feedback}</p>
                                                </div>
                                              )}

                                              {/* Debate Transcript (Collapsible) */}
                                              {confirmedDiag && confirmedDiag.debate_id && (
                                                <div className="border border-white/5 rounded-xl overflow-hidden mt-2 text-xs bg-slate-950/30">
                                                  <details className="group">
                                                    <summary className="p-3 flex justify-between items-center cursor-pointer font-semibold text-gray-400 hover:text-white select-none transition-colors">
                                                      <span>Inspect Socratic Debate Transcript</span>
                                                      <span className="transition-transform group-open:rotate-180 font-mono">&darr;</span>
                                                    </summary>
                                                    <div className="p-4 bg-slate-950/70 space-y-3 border-t border-white/5 max-h-72 overflow-y-auto">
                                                      {(debateHistoryMap[confirmedDiag.debate_id] || []).map((tMsg, tIdx) => {
                                                        const isAI = tMsg.role === 'ai';
                                                        return (
                                                          <div key={tIdx} className={`flex ${isAI ? 'justify-start' : 'justify-end'}`}>
                                                            <div className={`p-2.5 rounded-xl max-w-[85%] text-[11.5px] leading-relaxed ${
                                                              isAI 
                                                                ? 'bg-slate-900 border border-white/5 text-gray-200 rounded-tl-none' 
                                                                : 'bg-blue-600/20 border border-blue-500/20 text-white rounded-tr-none'
                                                            }`}>
                                                              <strong className="block text-[8.5px] text-gray-500 uppercase tracking-wider mb-0.5">{isAI ? 'Examiner' : 'Student'}</strong>
                                                              {tMsg.message}
                                                            </div>
                                                          </div>
                                                        );
                                                      })}
                                                      {!(debateHistoryMap[confirmedDiag.debate_id]) && (
                                                        <p className="text-gray-500 text-center py-2 italic text-[11px]">Loading debate record...</p>
                                                      )}
                                                    </div>
                                                  </details>
                                                </div>
                                              )}

                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-red-400 text-center py-4 text-xs font-semibold">Failed to fetch detailed evaluation logs.</p>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-96 glass-panel rounded-2xl flex flex-col justify-center items-center">
                <p className="text-gray-500 text-sm">Failed to load report data.</p>
              </div>
            )
          ) : (
            <div className="h-full glass-panel rounded-2xl p-12 flex flex-col justify-center items-center text-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
              <h3 className="text-base font-bold text-gray-300 mt-2">No Exam Selected</h3>
              <p className="text-xs text-gray-500 max-w-sm">
                Select an active syllabus exam from the sidebar to view cognitive diagnostic reports, student errors, and integrity flags.
              </p>
            </div>
          )}

        </div>

      </div>
      {/* Custom Modal Popup */}
      <Modal
        isOpen={modalConfig.isOpen}
        onClose={closeModal}
        type={modalConfig.type}
        title={modalConfig.title}
        message={modalConfig.message}
      />
    </div>
  );
};

export default TeacherDashboard;
