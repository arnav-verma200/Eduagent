import React, { useState, useEffect } from 'react';
import TeacherDashboard from './pages/TeacherDashboard';
import ExamInterface from './pages/ExamInterface';
import ReportCard from './pages/ReportCard';
import SocraticDebate from './pages/SocraticDebate';
import Modal from './components/Modal';

const API_BASE = "http://localhost:8000";

function App() {
  const [role, setRole] = useState('teacher'); // 'teacher' | 'student'
  const [studentView, setStudentView] = useState('dashboard'); // 'dashboard' | 'taking_exam' | 'view_report' | 'socratic_debate'
  const [studentId, setStudentId] = useState('student_alice');
  const [selectedExamId, setSelectedExamId] = useState(null);
  const [activeExams, setActiveExams] = useState([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [submittedReportData, setSubmittedReportData] = useState(null);
  const [selectedDebateId, setSelectedDebateId] = useState(null);

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

  // Fetch exams for student list
  const fetchStudentExams = async () => {
    setExamsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/exams`);
      if (res.ok) {
        const data = await res.json();
        setActiveExams(data);
      }
    } catch (err) {
      console.error("Failed to fetch exams in student view:", err);
    } finally {
      setExamsLoading(false);
    }
  };

  useEffect(() => {
    if (role === 'student' && studentView === 'dashboard') {
      fetchStudentExams();
    }
  }, [role, studentView]);

  const handleStartExam = (examId) => {
    if (!studentId.trim()) {
      triggerModal(
        'warning',
        'Student ID Required',
        'Please enter a Student ID to begin the exam.'
      );
      return;
    }
    setSelectedExamId(examId);
    setSubmittedReportData(null);
    setStudentView('taking_exam');
  };

  const handleExamSubmitSuccess = (reportData) => {
    // Save report data to show immediately without fetching (or we can refetch)
    setSubmittedReportData(reportData);
    setStudentView('view_report');
  };

  const handleViewReportCard = (examId, sId = null) => {
    setSelectedExamId(examId);
    if (sId) {
      setStudentId(sId);
    }
    setSubmittedReportData(null);
    setStudentView('view_report');
  };

  const handleTeacherViewStudent = (examId, sId) => {
    // Jump teacher to view student report card
    setStudentId(sId);
    setSelectedExamId(examId);
    setSubmittedReportData(null);
    setRole('student');
    setStudentView('view_report');
  };

  return (
    <div className="min-h-screen text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="glass-panel border-b border-white/5 py-4 px-6 flex flex-col sm:flex-row justify-between items-center gap-4 sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-black text-white shadow-md shadow-blue-500/20">
            E
          </div>
          <span className="text-lg font-black tracking-tight text-white">EduAgent</span>
          <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold">v1.0</span>
        </div>

        {/* Role Toggle Switcher */}
        <div className="flex bg-slate-950/80 p-1 rounded-xl border border-white/5">
          <button
            onClick={() => {
              setRole('teacher');
              setStudentView('dashboard');
            }}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              role === 'teacher'
                ? 'bg-blue-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Teacher Portal
          </button>
          
          <button
            onClick={() => {
              setRole('student');
              setStudentView('dashboard');
            }}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              role === 'student'
                ? 'bg-blue-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
            </svg>
            Student Test Desk
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow">
        {role === 'teacher' ? (
          <TeacherDashboard onViewStudentReport={handleTeacherViewStudent} />
        ) : (
          /* Student Portal Layout */
          <div className="w-full">
            {studentView === 'dashboard' && (
              <div className="container mx-auto px-4 py-8 max-w-4xl">
                {/* Welcome Card & Student ID Login */}
                <div className="glass-panel rounded-3xl p-6 md:p-8 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div>
                    <h1 className="text-2xl font-black text-white">Student Examination Desk</h1>
                    <p className="text-xs text-gray-400 mt-1">Select an assigned syllabus exam to begin. explain your steps on the scratchpad!</p>
                  </div>
                  
                  <div className="w-full md:w-auto">
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Student ID Registration</label>
                    <input
                      type="text"
                      className="px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors w-full md:w-60 font-mono"
                      placeholder="e.g. student_alice"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                    />
                  </div>
                </div>

                {/* Available Exams */}
                <div className="glass-panel rounded-3xl p-6">
                  <h2 className="text-lg font-bold text-white mb-4">Available Syllabus Exams</h2>
                  
                  {examsLoading ? (
                    <div className="h-40 flex flex-col justify-center items-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="text-xs text-gray-500">Checking syllabus board...</span>
                    </div>
                  ) : activeExams.length === 0 ? (
                    <p className="text-gray-500 text-xs text-center py-8">No syllabus exams currently designed. Switch to Teacher Portal to design one.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {activeExams.map((exam) => (
                        <div key={exam.id} className="bg-black/20 border border-white/5 hover:border-white/10 rounded-2xl p-5 flex flex-col justify-between transition-all duration-300">
                          <div>
                            <h3 className="text-base font-bold text-white leading-relaxed">{exam.topic}</h3>
                            <p className="text-[10px] text-gray-500 mt-1">Syllabus Exam ID: {exam.id}</p>
                          </div>
                          
                          <div className="flex gap-2 mt-6">
                            <button
                              onClick={() => handleStartExam(exam.id)}
                              className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition shadow-md shadow-blue-500/10"
                            >
                              Take Exam
                            </button>
                            
                            <button
                              onClick={() => handleViewReportCard(exam.id)}
                              className="py-2.5 px-4 bg-slate-900/60 hover:bg-slate-800 border border-white/5 text-gray-400 hover:text-white rounded-xl text-xs font-semibold transition"
                              title="View existing reports"
                            >
                              Report Card
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {studentView === 'taking_exam' && (
              <ExamInterface
                examId={selectedExamId}
                studentId={studentId}
                onSubmitSuccess={handleExamSubmitSuccess}
                onCancel={() => setStudentView('dashboard')}
              />
            )}
            
            {studentView === 'view_report' && (
              <ReportCard
                examId={selectedExamId}
                studentId={studentId}
                initialReportData={submittedReportData}
                onBack={() => setStudentView('dashboard')}
                onStartDebate={(debateId) => {
                  setSelectedDebateId(debateId);
                  setStudentView('socratic_debate');
                }}
              />
            )}

            {studentView === 'socratic_debate' && (
              <SocraticDebate
                debateId={selectedDebateId}
                onBack={() => setStudentView('view_report')}
              />
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-gray-600 border-t border-white/5 mt-12 bg-black/40">
        EduAgent Exam Engine &copy; 2026. Made with Google Gemini AI.
      </footer>
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
}

export default App;
