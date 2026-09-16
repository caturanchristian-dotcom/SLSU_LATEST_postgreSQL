import React, { useState } from 'react';
import { Download, MonitorCheck, HelpCircle } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { PWAInstallModal } from './PWAInstallModal';

interface PWAInstallButtonProps {
  variant?: 'header' | 'sidebar' | 'banner' | 'icon';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ 
  variant = 'header',
  className = '' 
}) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleClick = async () => {
    if (isInstallable) {
      const success = await install();
      if (!success) {
        setIsModalOpen(true);
      }
    } else {
      setIsModalOpen(true);
    }
  };

  // If already running in standalone app mode
  if (isInstalled) {
    if (variant === 'icon') {
      return (
        <button 
          title="Running in Desktop App Mode"
          onClick={() => setIsModalOpen(true)}
          className={`p-1.5 rounded-full text-emerald-600 hover:bg-emerald-50 transition-colors focus:outline-none ${className}`}
        >
          <MonitorCheck className="w-4 h-4 cursor-pointer" />
        </button>
      );
    }
    return (
      <>
        <div className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/60 text-emerald-700 text-[11px] font-semibold ${className}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Desktop App</span>
        </div>
        <PWAInstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  return (
    <>
      {variant === 'icon' ? (
        <button
          title="Install Desktop App"
          onClick={handleClick}
          className={`p-1.5 rounded-full text-[#1d58d9] hover:bg-blue-50 transition-colors focus:outline-none ${className}`}
        >
          <Download className="w-4 h-4 cursor-pointer" />
        </button>
      ) : variant === 'sidebar' ? (
        <button
          onClick={handleClick}
          className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-[#1d58d9] bg-[#e2ebf8]/60 hover:bg-[#e2ebf8] rounded-xl transition-all active:scale-[0.98] ${className}`}
        >
          <Download className="w-4 h-4 shrink-0 text-[#1d58d9]" />
          <span className="truncate font-sans font-bold">Install Desktop App</span>
        </button>
      ) : (
        <button
          onClick={handleClick}
          className={`flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#1e40af] to-[#1d58d9] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all ${className}`}
          title="Install website as a standalone desktop application"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="whitespace-nowrap">Install App</span>
        </button>
      )}

      <PWAInstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};
