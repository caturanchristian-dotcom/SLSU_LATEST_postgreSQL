import React, { useState } from 'react';
import { 
  X, 
  Download, 
  Monitor, 
  Smartphone, 
  CheckCircle2, 
  Laptop, 
  Share, 
  PlusSquare, 
  MoreVertical,
  ExternalLink,
  ShieldCheck,
  Zap,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { SLSU_LOGO_URL, SLSU_LOGO_FALLBACK_URL } from '@/lib/constants';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, install, isInstalled } = usePWAInstall();
  const [activeTab, setActiveTab] = useState<'desktop' | 'mobile'>('desktop');
  const [installing, setInstalling] = useState(false);

  if (!isOpen) return null;

  const handleNativeInstall = async () => {
    setInstalling(true);
    const success = await install();
    setInstalling(false);
    if (success) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-100 bg-gradient-to-r from-[#1e40af] to-[#1d58d9] px-6 py-5 text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white p-1 border border-white/20 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                <img 
                  src={SLSU_LOGO_URL} 
                  alt="SLSU Payroll" 
                  className="w-full h-full object-contain" 
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (target.src !== window.location.origin + SLSU_LOGO_FALLBACK_URL) {
                      target.src = SLSU_LOGO_FALLBACK_URL;
                    }
                  }}
                />
              </div>
              <div>
                <h3 className="text-base font-bold tracking-tight">Install SLSU Payroll Desktop App</h3>
                <p className="text-xs text-blue-100">Progressive Web App (PWA) Standalone Application</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Install Bar (if browser supports one-click prompt) */}
          {isInstallable && !isInstalled && (
            <div className="bg-blue-50 border-b border-blue-100 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-[#1d58d9]" />
                <span className="text-xs font-semibold text-neutral-800">
                  Ready to install directly with one click!
                </span>
              </div>
              <button
                onClick={handleNativeInstall}
                disabled={installing}
                className="flex items-center gap-2 rounded-lg bg-[#1d58d9] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                {installing ? 'Installing...' : 'Install Now'}
              </button>
            </div>
          )}

          {/* Body with Tab Switcher */}
          <div className="p-6 overflow-y-auto space-y-6">
            {/* App Benefits */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                <Laptop className="w-4 h-4 text-[#1d58d9] mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-neutral-800">Standalone Window</h4>
                  <p className="text-[11px] text-neutral-500 mt-0.5">Runs in its own window without browser tabs or address bar.</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                <Zap className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-neutral-800">Fast & Responsive</h4>
                  <p className="text-[11px] text-neutral-500 mt-0.5">Pre-cached UI assets ensure lightning-fast startup.</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                <ShieldCheck className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-neutral-800">Desktop Icon</h4>
                  <p className="text-[11px] text-neutral-500 mt-0.5">Pin to Taskbar, Dock, or Start Menu for instant access.</p>
                </div>
              </div>
            </div>

            {/* Platform Instructions Selector */}
            <div>
              <div className="flex border-b border-neutral-200">
                <button
                  onClick={() => setActiveTab('desktop')}
                  className={`flex items-center gap-2 pb-2.5 px-4 text-xs font-bold border-b-2 transition-all ${
                    activeTab === 'desktop'
                      ? 'border-[#1d58d9] text-[#1d58d9]'
                      : 'border-transparent text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <Monitor className="w-4 h-4" />
                  Desktop (Chrome / Edge / Safari / Brave)
                </button>
                <button
                  onClick={() => setActiveTab('mobile')}
                  className={`flex items-center gap-2 pb-2.5 px-4 text-xs font-bold border-b-2 transition-all ${
                    activeTab === 'mobile'
                      ? 'border-[#1d58d9] text-[#1d58d9]'
                      : 'border-transparent text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  Mobile & Tablet (iOS / Android)
                </button>
              </div>

              {activeTab === 'desktop' ? (
                <div className="mt-4 space-y-4 text-xs text-neutral-600">
                  <div className="rounded-xl border border-neutral-200 p-4 bg-white space-y-3">
                    <h4 className="font-bold text-neutral-800 text-sm flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-[#1d58d9] flex items-center justify-center text-xs font-black">1</span>
                      Google Chrome & Brave (Windows, Mac, Linux)
                    </h4>
                    <ol className="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed text-neutral-600">
                      <li>Click the <strong>Install icon (computer with down arrow)</strong> on the right side of the address bar.</li>
                      <li>Or click the <strong>three dots menu (⋮)</strong> → <strong>Cast, save, and share</strong> → <strong>Install SLSU Payroll...</strong></li>
                      <li>Click <strong>Install</strong> in the confirmation popup. The app will launch in its own standalone window.</li>
                    </ol>
                  </div>

                  <div className="rounded-xl border border-neutral-200 p-4 bg-white space-y-3">
                    <h4 className="font-bold text-neutral-800 text-sm flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-[#1d58d9] flex items-center justify-center text-xs font-black">2</span>
                      Microsoft Edge (Windows & Mac)
                    </h4>
                    <ol className="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed text-neutral-600">
                      <li>Look for the <strong>App available icon</strong> in the address bar (next to favorites star).</li>
                      <li>Or click the <strong>three dots menu (...)</strong> → <strong>Apps</strong> → <strong>Install this site as an app</strong>.</li>
                      <li>Check <strong>"Pin to taskbar"</strong> or <strong>"Pin to Start"</strong> for rapid launch.</li>
                    </ol>
                  </div>

                  <div className="rounded-xl border border-neutral-200 p-4 bg-white space-y-3">
                    <h4 className="font-bold text-neutral-800 text-sm flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-[#1d58d9] flex items-center justify-center text-xs font-black">3</span>
                      Safari on macOS Sonoma+
                    </h4>
                    <ol className="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed text-neutral-600">
                      <li>Click <strong>File</strong> in the top menu bar.</li>
                      <li>Select <strong>Add to Dock...</strong></li>
                      <li>Click <strong>Add</strong>. The app will now live in your macOS Dock like any native app.</li>
                    </ol>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-4 text-xs text-neutral-600">
                  <div className="rounded-xl border border-neutral-200 p-4 bg-white space-y-3">
                    <h4 className="font-bold text-neutral-800 text-sm flex items-center gap-2">
                      <Share className="w-4 h-4 text-blue-600" />
                      Apple iOS (Safari on iPhone / iPad)
                    </h4>
                    <ol className="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed text-neutral-600">
                      <li>Open the website in <strong>Safari</strong>.</li>
                      <li>Tap the <strong>Share</strong> button (box with an arrow pointing up) in the bottom toolbar.</li>
                      <li>Scroll down the share sheet and tap <strong>Add to Home Screen</strong> <PlusSquare className="w-3.5 h-3.5 inline mx-1 text-neutral-500" />.</li>
                      <li>Tap <strong>Add</strong> in the top right corner.</li>
                    </ol>
                  </div>

                  <div className="rounded-xl border border-neutral-200 p-4 bg-white space-y-3">
                    <h4 className="font-bold text-neutral-800 text-sm flex items-center gap-2">
                      <MoreVertical className="w-4 h-4 text-emerald-600" />
                      Google Android (Chrome / Samsung Internet)
                    </h4>
                    <ol className="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed text-neutral-600">
                      <li>Open the website in <strong>Chrome</strong>.</li>
                      <li>Tap the <strong>three dots menu (⋮)</strong> in the top right.</li>
                      <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                      <li>Confirm by tapping <strong>Install</strong>.</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50 px-6 py-4">
            <span className="text-[11px] text-neutral-500 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              PWA v1.0.0 • Service Worker Active
            </span>
            <button
              onClick={onClose}
              className="rounded-lg bg-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-300 transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
