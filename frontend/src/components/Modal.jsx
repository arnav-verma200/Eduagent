import React from 'react';

const Modal = ({
  isOpen,
  onClose,
  type = 'info', // 'info' | 'warning' | 'error' | 'confirm'
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Cancel',
  onConfirm
}) => {
  if (!isOpen) return null;

  // Icons and borders based on type
  const getTypeStyles = () => {
    switch (type) {
      case 'error':
        return {
          iconBg: 'bg-red-500/10 text-red-400 border-red-500/20',
          buttonBg: 'bg-red-600 hover:bg-red-500 shadow-red-500/20',
          accentBorder: 'border-red-500/20',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )
        };
      case 'warning':
        return {
          iconBg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          buttonBg: 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/20',
          accentBorder: 'border-amber-500/20',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )
        };
      case 'confirm':
        return {
          iconBg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
          buttonBg: 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20',
          accentBorder: 'border-blue-500/20',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
        };
      case 'info':
      default:
        return {
          iconBg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
          buttonBg: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20',
          accentBorder: 'border-indigo-500/20',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
        };
    }
  };

  const styles = getTypeStyles();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300"
        onClick={type === 'confirm' ? undefined : onClose}
      />
      
      {/* Modal Container */}
      <div className={`glass-panel max-w-md w-full rounded-3xl p-6 border ${styles.accentBorder} shadow-2xl relative z-10 transform scale-100 transition-all duration-300 animate-in fade-in zoom-in-95 duration-200`}>
        <div className="flex flex-col items-center text-center space-y-4">
          {/* Header Icon */}
          <div className={`h-12 w-12 rounded-full border ${styles.iconBg} flex items-center justify-center shadow-inner`}>
            {styles.icon}
          </div>
          
          {/* Text content */}
          <div className="space-y-2">
            <h3 className="text-lg font-extrabold text-white tracking-tight">{title}</h3>
            <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">{message}</p>
          </div>
          
          {/* Buttons row */}
          <div className="flex items-center gap-3 w-full pt-4">
            {onConfirm ? (
              <>
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 border border-white/5 text-gray-400 hover:text-white rounded-xl text-xs font-semibold transition"
                >
                  {cancelText}
                </button>
                <button
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className={`flex-1 py-2.5 px-4 ${styles.buttonBg} text-white rounded-xl text-xs font-semibold transition shadow-md`}
                >
                  {confirmText}
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className={`w-full py-2.5 px-4 ${styles.buttonBg} text-white rounded-xl text-xs font-semibold transition shadow-md`}
              >
                {confirmText}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
