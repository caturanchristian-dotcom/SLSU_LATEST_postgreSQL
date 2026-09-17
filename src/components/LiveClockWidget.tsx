import React, { useState, useEffect, memo } from 'react';
import { format } from 'date-fns';
import { Clock } from 'lucide-react';

interface LiveClockWidgetProps {
  className?: string;
  showIcon?: boolean;
}

export const LiveClockWidget: React.FC<LiveClockWidgetProps> = memo(({
  className = "text-xl font-bold text-slate-800 tracking-tight",
  showIcon = false
}) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {showIcon && <Clock className="w-4 h-4 text-emerald-600 animate-pulse" />}
      {format(time, 'hh:mm:ss a')}
    </span>
  );
});

export const LiveDateWidget: React.FC<{ className?: string }> = memo(({
  className = "text-sm text-slate-500 font-medium"
}) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    // Update date every minute or hour
    const timer = setInterval(() => {
      setTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className={className}>
      {format(time, 'EEEE, MMMM dd, yyyy')}
    </span>
  );
});
