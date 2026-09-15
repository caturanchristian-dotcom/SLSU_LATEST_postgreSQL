import React, { useState, useEffect, useMemo } from 'react';
import { 
  Printer, 
  User, 
  Clock, 
  MapPin, 
  BookOpen, 
  Plus, 
  Info,
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  GraduationCap,
  SlidersHorizontal
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

export interface ScheduleItem {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  category?: string;
  position?: string;
  basicSalary?: number;
  salaryType?: string;
  employeeNo?: string;
  hireDate?: string;
  employeeStatus?: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  subject: string;
  room: string;
  specificDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  teachingDepartmentId?: string;
  studentsCount?: number;
  workloadUnits?: number;
  teachingExperience?: string;
  isOverload?: boolean;
}

export interface EmployeeItem {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  category: string;
  position?: string;
  basicSalary?: number;
  salaryType?: string;
  status?: string;
  hireDate?: string;
  teachingDepartmentId?: string;
  teachingExperience?: string;
  qualification?: string;
}

export interface DepartmentItem {
  id: string;
  name: string;
  code: string;
}

interface WeeklyGanttChartProps {
  schedules: ScheduleItem[];
  employees: EmployeeItem[];
  departments: DepartmentItem[];
  onSelectSchedule: (schedule: ScheduleItem) => void;
  onAddScheduleForSlot?: (day: string, startTime: string, endTime: string, employeeId?: string) => void;
  isAdmin?: boolean;
  selectedEmployeeId?: string;
  onSelectEmployeeId?: (id: string) => void;
}

export interface TimeSlotConfig {
  id: string;
  label: string;
  startMinutes: number;
  endMinutes: number;
  rawStart: string;
  rawEnd: string;
}

export const STANDARD_GANTT_TIME_SLOTS: TimeSlotConfig[] = [
  { id: 'slot-1', label: '07:30 - 08:00 A.M.', startMinutes: 450, endMinutes: 480, rawStart: '07:30', rawEnd: '08:00' },
  { id: 'slot-2', label: '08:00 - 09:00 A.M.', startMinutes: 480, endMinutes: 540, rawStart: '08:00', rawEnd: '09:00' },
  { id: 'slot-3', label: '09:00 - 9:30 A.M.', startMinutes: 540, endMinutes: 570, rawStart: '09:00', rawEnd: '09:30' },
  { id: 'slot-4', label: '09:30 - 10:00 A.M.', startMinutes: 570, endMinutes: 600, rawStart: '09:30', rawEnd: '10:00' },
  { id: 'slot-5', label: '10:00 - 11:00 A.M.', startMinutes: 600, endMinutes: 660, rawStart: '10:00', rawEnd: '11:00' },
  { id: 'slot-6', label: '11:00 - 12:00 N.N.', startMinutes: 660, endMinutes: 720, rawStart: '11:00', rawEnd: '12:00' },
  { id: 'slot-7', label: '12:00 - 12:30 P.M.', startMinutes: 720, endMinutes: 750, rawStart: '12:00', rawEnd: '12:30' },
  { id: 'slot-8', label: '12:30 - 01:00 P.M.', startMinutes: 750, endMinutes: 780, rawStart: '12:30', rawEnd: '13:00' },
  { id: 'slot-9', label: '01:00 - 02:00 P.M.', startMinutes: 780, endMinutes: 840, rawStart: '13:00', rawEnd: '14:00' },
  { id: 'slot-10', label: '02:00 - 02:30 P.M.', startMinutes: 840, endMinutes: 870, rawStart: '14:00', rawEnd: '14:30' },
  { id: 'slot-11', label: '02:30 - 04:00 P.M.', startMinutes: 870, endMinutes: 960, rawStart: '14:30', rawEnd: '16:00' },
  { id: 'slot-12', label: '04:00 - 05:00 P.M.', startMinutes: 960, endMinutes: 1020, rawStart: '16:00', rawEnd: '17:00' },
  { id: 'slot-13', label: '05:00 - 05:30 P.M.', startMinutes: 1020, endMinutes: 1050, rawStart: '17:00', rawEnd: '17:30' },
  { id: 'slot-14', label: '05:30 - 07:00 P.M.', startMinutes: 1050, endMinutes: 1140, rawStart: '17:30', rawEnd: '19:00' },
  { id: 'slot-15', label: '07:00 - 08:30 P.M.', startMinutes: 1140, endMinutes: 1230, rawStart: '19:00', rawEnd: '20:30' },
];

export const parseTimeToMinutes = (t: string): number => {
  if (!t) return -1;
  const clean = t.trim().toLowerCase();
  const isPM = clean.includes('pm');
  const isAM = clean.includes('am');
  const isNN = clean.includes('nn') || clean.includes('noon');
  
  const numOnly = clean.replace(/[^\d:]/g, '');
  const parts = numOnly.split(':');
  if (parts.length < 2) return -1;
  let h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return -1;

  if (isNN) {
    h = 12;
  } else if (isPM) {
    if (h < 12) h += 12;
  } else if (isAM) {
    if (h === 12) h = 0;
  } else {
    if (h > 0 && h <= 6) h += 12;
  }
  return h * 60 + m;
};

export const formatSingleTimeLabel = (timeStr: string): { time: string; period: string } => {
  const mins = parseTimeToMinutes(timeStr);
  if (mins < 0) return { time: timeStr, period: '' };
  
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const mStr = m === 0 ? '00' : (m < 10 ? `0${m}` : `${m}`);
  
  if (h === 12 && m === 0) {
    return { time: '12:00', period: 'N.N.' };
  }
  
  const isPM = h >= 12;
  let displayHour = h % 12;
  if (displayHour === 0) displayHour = 12;
  const hStr = displayHour < 10 ? `0${displayHour}` : `${displayHour}`;
  const period = isPM ? 'P.M.' : 'A.M.';
  
  return { time: `${hStr}:${mStr}`, period };
};

export const formatSlotIntervalLabel = (startStr: string, endStr: string): string => {
  const start = formatSingleTimeLabel(startStr);
  const end = formatSingleTimeLabel(endStr);
  
  if (!start.period || !end.period) {
    return `${startStr} - ${endStr}`;
  }

  // If both start and end have the same period (and neither is N.N.)
  // e.g. "08:00 - 10:00 A.M." or "01:00 - 04:00 P.M."
  if (start.period === end.period && start.period !== 'N.N.') {
    return `${start.time} - ${end.time} ${end.period}`;
  }

  // e.g. "10:00 A.M. - 12:00 N.N." or "11:00 A.M. - 01:00 P.M."
  return `${start.time} ${start.period} - ${end.time} ${end.period}`;
};

export const getScheduleClassification = (s: ScheduleItem): 'teaching' | 'quasi' | 'requested' => {
  const sub = (s.subject || '').toLowerCase();
  const cat = (s.category || '').toLowerCase();
  if (
    s.isOverload || 
    sub.includes('overload') || 
    sub.includes('beyond 21') || 
    sub.includes('requested') || 
    (Number(s.workloadUnits) || 0) > 21
  ) {
    return 'requested';
  }
  if (
    cat === 'staff' || 
    sub.includes('core') || 
    sub.includes('duty') || 
    sub.includes('admin') || 
    sub.includes('consult') || 
    sub.includes('research') || 
    sub.includes('extension') || 
    sub.includes('office')
  ) {
    return 'quasi';
  }
  return 'teaching';
};

export const WeeklyGanttChart: React.FC<WeeklyGanttChartProps> = ({
  schedules,
  employees,
  departments,
  onSelectSchedule,
  onAddScheduleForSlot,
  isAdmin = false,
  selectedEmployeeId = '',
  onSelectEmployeeId,
}) => {
  // Determine the single active employee
  const resolvedInitialId = useMemo(() => {
    if (selectedEmployeeId && selectedEmployeeId !== 'all' && employees.some(e => e.id === selectedEmployeeId)) {
      return selectedEmployeeId;
    }
    return employees.length > 0 ? employees[0].id : '';
  }, [selectedEmployeeId, employees]);

  const [activeFacultyId, setActiveFacultyId] = useState<string>(resolvedInitialId);
  const [slotMode, setSlotMode] = useState<'class_schedules' | 'standard'>('class_schedules');

  // Synchronize when employees load or prop updates
  useEffect(() => {
    if (selectedEmployeeId && selectedEmployeeId !== 'all' && employees.some(e => e.id === selectedEmployeeId)) {
      setActiveFacultyId(selectedEmployeeId);
    } else if (employees.length > 0 && (!activeFacultyId || !employees.some(e => e.id === activeFacultyId))) {
      setActiveFacultyId(employees[0].id);
      if (onSelectEmployeeId) {
        onSelectEmployeeId(employees[0].id);
      }
    }
  }, [selectedEmployeeId, employees]);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  // Strictly filter schedules for ONLY this single employee
  const singleEmployeeSchedules = useMemo(() => {
    if (!activeFacultyId) return [];
    return schedules.filter(s => s.employeeId === activeFacultyId);
  }, [schedules, activeFacultyId]);

  // Selected employee object details
  const activeEmployee = useMemo(() => {
    return employees.find(e => e.id === activeFacultyId) || null;
  }, [employees, activeFacultyId]);

  // Current employee index for Prev/Next navigation
  const currentEmpIndex = useMemo(() => {
    return employees.findIndex(e => e.id === activeFacultyId);
  }, [employees, activeFacultyId]);

  const handleFacultyChange = (newId: string) => {
    setActiveFacultyId(newId);
    if (onSelectEmployeeId) {
      onSelectEmployeeId(newId);
    }
  };

  const handlePrevFaculty = () => {
    if (employees.length === 0) return;
    const newIdx = (currentEmpIndex - 1 + employees.length) % employees.length;
    handleFacultyChange(employees[newIdx].id);
  };

  const handleNextFaculty = () => {
    if (employees.length === 0) return;
    const newIdx = (currentEmpIndex + 1) % employees.length;
    handleFacultyChange(employees[newIdx].id);
  };

  // DYNAMIC TIME SLOTS BASED DIRECTLY ON THE EMPLOYEE'S CLASS SCHEDULES
  const displayTimeSlots = useMemo<TimeSlotConfig[]>(() => {
    if (slotMode === 'standard' || singleEmployeeSchedules.length === 0) {
      return STANDARD_GANTT_TIME_SLOTS;
    }

    // Extract unique time ranges from the employee's class schedule (e.g. 08:00 - 10:00 AM)
    const intervalMap = new Map<string, { startMinutes: number; endMinutes: number; rawStart: string; rawEnd: string }>();

    singleEmployeeSchedules.forEach(s => {
      const startMin = parseTimeToMinutes(s.startTime);
      const endMin = parseTimeToMinutes(s.endTime);
      if (startMin >= 0 && endMin > startMin) {
        const key = `${startMin}_${endMin}`;
        if (!intervalMap.has(key)) {
          intervalMap.set(key, {
            startMinutes: startMin,
            endMinutes: endMin,
            rawStart: s.startTime,
            rawEnd: s.endTime,
          });
        }
      }
    });

    if (intervalMap.size === 0) {
      return STANDARD_GANTT_TIME_SLOTS;
    }

    // Sort chronologically by start time, then duration
    const sorted = Array.from(intervalMap.values()).sort((a, b) => {
      if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
      return a.endMinutes - b.endMinutes;
    });

    return sorted.map((item, index) => ({
      id: `sched-slot-${index}-${item.startMinutes}-${item.endMinutes}`,
      label: formatSlotIntervalLabel(item.rawStart, item.rawEnd),
      startMinutes: item.startMinutes,
      endMinutes: item.endMinutes,
      rawStart: item.rawStart,
      rawEnd: item.rawEnd,
    }));
  }, [singleEmployeeSchedules, slotMode]);

  // Helper to check if a schedule matches a time slot
  const getSchedulesForSlotAndDay = (day: string, slot: TimeSlotConfig): ScheduleItem[] => {
    return singleEmployeeSchedules.filter(s => {
      if (s.dayOfWeek !== day) return false;
      const schedStart = parseTimeToMinutes(s.startTime);
      const schedEnd = parseTimeToMinutes(s.endTime);
      if (schedStart < 0 || schedEnd < 0) return false;
      
      if (slotMode === 'class_schedules') {
        // Direct matching for the exact class schedule interval
        return schedStart === slot.startMinutes && schedEnd === slot.endMinutes;
      }
      
      // Overlap matching for standard fixed grid
      return schedStart < slot.endMinutes && schedEnd > slot.startMinutes;
    });
  };

  // Calculate total workload and hours for this specific employee
  const stats = useMemo(() => {
    let teachingHours = 0;
    let quasiHours = 0;
    let requestedHours = 0;
    let totalUnits = 0;

    const uniqueMap = new Map<string, ScheduleItem>();
    singleEmployeeSchedules.forEach(s => uniqueMap.set(s.id, s));

    uniqueMap.forEach(s => {
      const start = parseTimeToMinutes(s.startTime);
      const end = parseTimeToMinutes(s.endTime);
      const durationHours = (start >= 0 && end > start) ? (end - start) / 60 : 0;
      const cls = getScheduleClassification(s);
      
      if (cls === 'teaching') teachingHours += durationHours;
      else if (cls === 'quasi') quasiHours += durationHours;
      else requestedHours += durationHours;

      if (s.workloadUnits) {
        totalUnits += Number(s.workloadUnits) || 0;
      }
    });

    return {
      teachingHours: Number(teachingHours.toFixed(1)),
      quasiHours: Number(quasiHours.toFixed(1)),
      requestedHours: Number(requestedHours.toFixed(1)),
      totalHours: Number((teachingHours + quasiHours + requestedHours).toFixed(1)),
      totalUnits: Number(totalUnits.toFixed(1)),
      count: uniqueMap.size
    };
  }, [singleEmployeeSchedules]);

  // Teaching department name of active employee
  const activeDept = useMemo(() => {
    if (!activeEmployee?.teachingDepartmentId) return null;
    return departments.find(d => d.id === activeEmployee.teachingDepartmentId);
  }, [departments, activeEmployee]);

  if (employees.length === 0) {
    return (
      <div className="py-16 text-center border-2 border-dashed border-neutral-200 rounded-3xl bg-neutral-50/60 p-8">
        <User className="w-12 h-12 text-neutral-400 mx-auto mb-3" />
        <h3 className="text-base font-bold text-neutral-900">No Employees Available</h3>
        <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">
          Please add employees first to generate their individual Weekly Monitoring Gantt Chart.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 6mm;
          }
          body {
            background: white !important;
            color: black !important;
          }
          .no-print, nav, header, aside, button {
            display: none !important;
          }
          .gantt-chart-container {
            border: 2px solid black !important;
            box-shadow: none !important;
            width: 100% !important;
            margin: 0 !important;
          }
          .gantt-header {
            background-color: black !important;
            color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .gantt-cell-teaching {
            background-color: #9cb5cc !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .gantt-cell-quasi {
            background-color: #1d4ed8 !important;
            color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .gantt-cell-requested {
            background-color: #15803d !important;
            color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* TOP CONTROLS: SINGLE EMPLOYEE SELECTOR & TIME SLOT FORMAT TOGGLE (Hidden in Print) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-neutral-50 p-4 rounded-2xl border border-neutral-200/80 shadow-xs no-print">
        {/* Employee Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-neutral-600 flex items-center gap-1.5">
              <User className="w-4 h-4 text-blue-600" />
              Employee:
            </span>
            
            <div className="flex items-center gap-1 bg-white border border-neutral-300 rounded-xl p-0.5 shadow-xs">
              <button
                onClick={handlePrevFaculty}
                disabled={employees.length <= 1}
                className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Previous Employee"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <select
                value={activeFacultyId}
                onChange={(e) => handleFacultyChange(e.target.value)}
                className="h-8 bg-transparent border-none px-2 text-xs font-extrabold text-neutral-900 focus:ring-0 cursor-pointer min-w-[220px]"
              >
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.lastName}, {emp.firstName} ({emp.category})
                  </option>
                ))}
              </select>

              <button
                onClick={handleNextFaculty}
                disabled={employees.length <= 1}
                className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Next Employee"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Info Badges */}
          {activeEmployee && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-extrabold text-neutral-900 bg-white px-2.5 py-1 rounded-xl border border-neutral-200 shadow-2xs">
                {activeEmployee.lastName}, {activeEmployee.firstName}
              </span>
              <span className="text-neutral-600 bg-neutral-200/70 font-semibold px-2 py-1 rounded-xl">
                {activeEmployee.category}
              </span>
              {activeDept && (
                <span className="text-blue-800 font-bold bg-blue-50 border border-blue-200/60 px-2 py-1 rounded-xl">
                  {activeDept.code}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Time Slot Display Mode Toggle & Print */}
        <div className="flex flex-wrap items-center gap-2.5 self-end lg:self-auto">
          {/* Time Slot Mode Toggle */}
          <div className="flex items-center bg-white border border-neutral-200 rounded-xl p-0.5 shadow-2xs text-xs">
            <button
              onClick={() => setSlotMode('class_schedules')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                slotMode === 'class_schedules'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
              title="Time slot rows match this employee's actual class schedule hours (e.g. 08:00 - 10:00 AM)"
            >
              Class Schedules ({displayTimeSlots.length} Slots)
            </button>
            <button
              onClick={() => setSlotMode('standard')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                slotMode === 'standard'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
              title="Full 30-min standard intervals grid"
            >
              Standard Fixed Grid
            </button>
          </div>

          {/* Weekly Load Summary */}
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-700 bg-white px-3 py-1.5 rounded-xl border border-neutral-200 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-neutral-500" />
            <span>Weekly Load:</span>
            <span className="font-mono text-neutral-950 font-black bg-neutral-100 px-1.5 py-0.5 rounded">{stats.totalHours} hrs</span>
            {stats.totalUnits > 0 && (
              <span className="font-mono text-blue-700 font-black bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">{stats.totalUnits} units</span>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="h-9 text-xs font-bold gap-2 border-neutral-300 hover:bg-neutral-100 bg-white rounded-xl shadow-xs text-neutral-800"
          >
            <Printer className="w-3.5 h-3.5 text-neutral-700" />
            Print Schedule
          </Button>
        </div>
      </div>

      {/* GANTT CHART MAIN CONTAINER */}
      <div className="gantt-chart-container bg-white border-2 border-neutral-900 rounded-none shadow-md overflow-hidden font-sans">
        
        {/* HEADER: MATCHING THE PHYSICAL DOCUMENT BANNER */}
        <div className="gantt-header bg-[#18181b] text-white py-2.5 px-4 text-center font-extrabold tracking-wider text-sm sm:text-base uppercase border-b-2 border-neutral-900 select-none">
          WEEKLY MONITORING GANTT CHART
        </div>

        {/* FACULTY PROFILE SUB-HEADER (Included in both Screen and Print) */}
        {activeEmployee && (
          <div className="bg-neutral-50 px-4 py-2 border-b border-neutral-800 flex flex-wrap items-center justify-between text-xs text-neutral-900 gap-2">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <div>
                <span className="font-bold uppercase text-[10px] text-neutral-500 mr-1.5">Faculty / Employee:</span>
                <span className="font-black text-sm text-neutral-950 uppercase">{activeEmployee.lastName}, {activeEmployee.firstName}</span>
              </div>
              <div>
                <span className="font-bold uppercase text-[10px] text-neutral-500 mr-1.5">Department:</span>
                <span className="font-bold text-neutral-900">
                  {activeDept ? `${activeDept.code} - ${activeDept.name}` : (activeEmployee.teachingDepartmentId || 'General')}
                </span>
              </div>
              <div>
                <span className="font-bold uppercase text-[10px] text-neutral-500 mr-1.5">Designation:</span>
                <span className="font-semibold text-neutral-800">{activeEmployee.category || 'Faculty'}</span>
              </div>
            </div>
            <div className="text-[11px] font-mono font-bold text-neutral-700">
              Total Weekly Hours: <span className="underline decoration-2 font-black">{stats.totalHours} hrs</span>
            </div>
          </div>
        )}

        {/* RESPONSIVE TABLE WRAPPER */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border-spacing-0 text-left">
            <thead>
              <tr className="bg-neutral-100 border-b-2 border-neutral-900 text-xs sm:text-sm font-bold text-neutral-900">
                {/* Time Interval Column Header */}
                <th className="w-[180px] sm:w-[220px] p-2.5 sm:p-3 text-center border-r-2 border-neutral-900 bg-neutral-200/80 uppercase tracking-wider text-neutral-900 text-xs font-black">
                  Time Slot
                </th>
                {/* Day Columns Headers */}
                {days.map((day) => {
                  const isToday = todayName === day;
                  return (
                    <th
                      key={day}
                      className={`p-2.5 sm:p-3 text-center border-r border-neutral-800 last:border-r-0 min-w-[110px] sm:min-w-[130px] font-extrabold ${
                        isToday ? 'bg-blue-50/80 text-blue-950 font-black' : 'text-neutral-900'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>{day}</span>
                        {isToday && (
                          <span className="no-print inline-block w-1.5 h-1.5 rounded-full bg-blue-600" title="Today"></span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {displayTimeSlots.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-sm font-bold text-neutral-400 italic">
                    No class schedules found for this employee.
                  </td>
                </tr>
              ) : (
                displayTimeSlots.map((slot, rowIndex) => {
                  const isEvenRow = rowIndex % 2 === 0;

                  return (
                    <tr 
                      key={slot.id} 
                      className={`border-b border-neutral-800 last:border-b-0 ${
                        isEvenRow ? 'bg-white' : 'bg-neutral-50/40'
                      }`}
                    >
                      {/* Time Label Cell - Formatted based on class schedules e.g. 08:00 - 10:00 A.M. */}
                      <td className="w-[180px] sm:w-[220px] p-2.5 text-center border-r-2 border-neutral-900 font-extrabold text-[11px] sm:text-xs text-neutral-900 bg-neutral-50 select-none whitespace-nowrap">
                        {slot.label}
                      </td>

                      {/* Day Cells */}
                      {days.map((day) => {
                        const matchedSchedules = getSchedulesForSlotAndDay(day, slot);
                        const hasSchedule = matchedSchedules.length > 0;
                        const isToday = todayName === day;

                        if (!hasSchedule) {
                          return (
                            <td
                              key={`${slot.id}-${day}`}
                              onClick={() => {
                                if (isAdmin && onAddScheduleForSlot && activeFacultyId) {
                                  onAddScheduleForSlot(day, slot.rawStart, slot.rawEnd, activeFacultyId);
                                }
                              }}
                              className={`border-r border-neutral-800 last:border-r-0 p-1 text-center transition-colors h-11 relative group ${
                                isAdmin ? 'cursor-pointer hover:bg-neutral-100/70' : ''
                              } ${isToday ? 'bg-blue-50/20' : ''}`}
                              title={isAdmin ? `Click to schedule ${activeEmployee ? `${activeEmployee.firstName} ${activeEmployee.lastName}` : ''} on ${day} (${slot.label})` : undefined}
                            >
                              {/* Empty state: subtle hover add indicator for admins */}
                              {isAdmin && (
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] text-neutral-400 font-bold no-print">
                                  <Plus className="w-3.5 h-3.5 text-neutral-400" />
                                </div>
                              )}
                            </td>
                          );
                        }

                        // Cell has single employee's matching schedule
                        return (
                          <td
                            key={`${slot.id}-${day}`}
                            className={`border-r border-neutral-800 last:border-r-0 p-1 align-middle h-11 transition-all relative ${
                              isToday ? 'ring-1 ring-inset ring-blue-300' : ''
                            }`}
                          >
                            <div className="flex flex-col gap-1 w-full h-full">
                              {matchedSchedules.map((sched) => {
                                const classification = getScheduleClassification(sched);
                                
                                // Background styling matching physical chart
                                let cellClass = 'gantt-cell-teaching bg-[#9cb5cc] border-[#759bbd] text-[#0d2847] hover:bg-[#8da8c1]';
                                if (classification === 'quasi') {
                                  cellClass = 'gantt-cell-quasi bg-blue-600 border-blue-700 text-white hover:bg-blue-700';
                                } else if (classification === 'requested') {
                                  cellClass = 'gantt-cell-requested bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700';
                                }

                                return (
                                  <div
                                    key={sched.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectSchedule(sched);
                                    }}
                                    className={`w-full min-h-[34px] p-1.5 rounded-sm border cursor-pointer shadow-xs transition-all flex flex-col justify-center text-left ${cellClass}`}
                                    title={`${sched.subject} (${sched.startTime} - ${sched.endTime}) ${sched.room ? `| Room: ${sched.room}` : ''}`}
                                  >
                                    {/* Subject Title */}
                                    <div className="font-black text-[10px] sm:text-[11px] leading-tight truncate">
                                      {sched.subject || 'Duty / Subject'}
                                    </div>

                                    {/* Room / Load Units */}
                                    <div className="flex items-center justify-between gap-1 text-[9px] opacity-95 leading-none mt-0.5 truncate">
                                      <span className="font-semibold truncate">
                                        {sched.room ? `Rm: ${sched.room}` : ''}
                                      </span>
                                      {sched.workloadUnits ? (
                                        <span className="font-bold truncate text-[8px] opacity-90">
                                          {sched.workloadUnits}u
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* BOTTOM LEGEND SECTION (EXACT REPLICA OF THE UPLOADED DOCUMENT) */}
        <div className="bg-white p-3 sm:p-4 border-t-2 border-neutral-900">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-bold text-neutral-900">
            <div className="flex flex-wrap items-center gap-5 sm:gap-8">
              {/* Teaching Legend */}
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-[#9cb5cc] border border-[#759bbd] inline-block shadow-xs"></span>
                <span className="text-neutral-950 font-bold">Teaching</span>
              </div>

              {/* Quasi-Teaching Legend */}
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-blue-600 border border-blue-700 inline-block shadow-xs"></span>
                <span className="text-neutral-950 font-bold">Quasi-Teaching and Other Tasks</span>
              </div>

              {/* Requested Subjects Legend */}
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-emerald-600 border border-emerald-700 inline-block shadow-xs"></span>
                <span className="text-neutral-950 font-bold">Requested Subjects and/or Subjects beyond 21 units</span>
              </div>
            </div>

            <div className="text-[11px] text-neutral-500 font-medium italic no-print">
              * Click any scheduled block to view full details or edit
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
