import React, { useState, useEffect } from 'react';
import { useAuth } from '../components/AuthProvider';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { 
  Clock, 
  Download, 
  LogIn, 
  LogOut,
  Plus,
  Printer,
  Sparkles,
  Trash2,
  Calendar,
  User,
  ShieldAlert,
  Edit2
} from 'lucide-react';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { format, differenceInHours, differenceInMinutes } from 'date-fns';
import { safeDateStr, safeDateOnly, safeSplit } from '../lib/utils';

interface DTRLog {
  id: string;
  employeeId: string;
  firstName?: string;
  lastName?: string;
  date: string;
  timeIn: string;
  timeOut: string | null;
  notes: string;
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  category: string;
  basicSalary: number;
  salaryType: string;
  phoneNumber?: string;
  status: string;
}

const mouthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const parseLocalDateNoShift = (dateVal: any): Date | null => {
  if (!dateVal) return null;
  if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? null : dateVal;
  const dateStr = safeDateStr(dateVal);
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    const [_, y, m, d, hh, mm, ss] = match;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  }
  const dateOnlyMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [_, y, m, d] = dateOnlyMatch;
    return new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0);
  }
  const timeMatch = dateStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch) {
    const [_, hh, mm, ss] = timeMatch;
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(hh), Number(mm), Number(ss || 0));
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d;
};

const autoPmTime = (val: any): string => {
  if (!val) return '';
  const str = String(val);
  const match = str.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = match[2];
    if (h > 0 && h <= 6) {
      h += 12;
      return `${h}:${m}`;
    }
  }
  return str;
};

const formatTimeTo12Hour = (timeVal: any): string => {
  if (!timeVal) return '';
  const timeStr = String(timeVal).trim();
  if (timeStr.toLowerCase().includes('am') || timeStr.toLowerCase().includes('pm')) {
    return timeStr;
  }
  const parts = safeSplit(timeStr, ':');
  if (parts.length < 2) return timeStr;
  let hour = parseInt(parts[0], 10);
  const min = parts[1];
  if (isNaN(hour)) return timeStr;
  
  let ampm = 'AM';
  if (hour >= 12) {
    ampm = 'PM';
  } else if (hour > 0 && hour <= 6) {
    ampm = 'PM';
  } else {
    ampm = 'AM';
  }
  
  let displayHour = hour % 12;
  if (displayHour === 0) displayHour = 12;
  const hourFormatted = String(displayHour).padStart(2, '0');
  return `${hourFormatted}:${min} ${ampm}`;
};

const DTR = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'payroll_officer' || user?.role === 'department_head';

  // State
  const [logs, setLogs] = useState<DTRLog[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [employeeSchedules, setEmployeeSchedules] = useState<any[]>([]);

  const fetchSchedulesForEmployee = (empId: string) => {
    if (empId) {
      fetch(`/api/schedules/employee/${empId}`)
        .then(res => res.json())
        .then(data => setEmployeeSchedules(data || []))
        .catch(err => console.error("Failed to fetch schedules:", err));
    } else {
      setEmployeeSchedules([]);
    }
  };

  useEffect(() => {
    fetchSchedulesForEmployee(selectedEmployeeId);
  }, [selectedEmployeeId]);

  const [isAddingInlineSchedule, setIsAddingInlineSchedule] = useState(false);
  const [inlineSchedule, setInlineSchedule] = useState({
    subject: '',
    startTime: '08:00',
    endTime: '10:00',
    room: ''
  });

  const handleCreateInlineSchedule = async () => {
    if (!inlineSchedule.subject || !inlineSchedule.startTime || !inlineSchedule.endTime) {
      const fieldLabel = (selectedEmployee?.category === 'Regular Employee' || selectedEmployee?.category === 'FACULTY' || selectedEmployee?.category === 'STAFF') ? 'Regular Type' : 'Subject';
      toast.error(`${fieldLabel} and times are required.`);
      return;
    }
    
    // Calculate Day of Week from editDate
    const parts = safeSplit(editDate, '-');
    if (parts.length !== 3) {
      toast.error("Invalid edit date.");
      return;
    }
    
    const logDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const daysOfWeekStr = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = daysOfWeekStr[logDate.getDay()];

    try {
      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          dayOfWeek: dayName,
          startTime: inlineSchedule.startTime,
          endTime: inlineSchedule.endTime,
          subject: inlineSchedule.subject,
          room: inlineSchedule.room || '',
          specificDate: editDate
        })
      });
      const data = await response.json();
      if (data.success) {
        toast.success("Schedule added specifically for this date!");
        setIsAddingInlineSchedule(false);
        setInlineSchedule({
          subject: '',
          startTime: '08:00',
          endTime: '10:00',
          room: ''
        });
        // Refresh schedules & logs to reflect instantly in DTR
        fetchSchedulesForEmployee(selectedEmployeeId);
        fetchLogs();
      } else {
        toast.error("Failed to add schedule");
      }
    } catch (e) {
      toast.error("Network error adding schedule.");
    }
  };
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [currentStatus, setCurrentStatus] = useState<DTRLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);


  // Manual General Entry Dialog
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newEntry, setNewEntry] = useState({
    employeeId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    timeIn: '08:00',
    timeOut: '17:00',
    notes: ''
  });

  // Cell/Row Click Edit DTR Dialog
  const [isRowEditOpen, setIsRowEditOpen] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editPunches, setEditPunches] = useState({
    amIn: '',
    amOut: '',
    pmIn: '',
    pmOut: '',
    notes: ''
  });
  const [editingDayLogs, setEditingDayLogs] = useState<DTRLog[]>([]);

  // Sandbox / Testing States
  const [testDay, setTestDay] = useState<number>(new Date().getDate());
  const [testPreset, setTestPreset] = useState<string>('regular');
  const [testAmIn, setTestAmIn] = useState<string>('08:00');
  const [testAmOut, setTestAmOut] = useState<string>('12:00');
  const [testPmIn, setTestPmIn] = useState<string>('13:00');
  const [testPmOut, setTestPmOut] = useState<string>('17:00');
  
  const [singlePunchDay, setSinglePunchDay] = useState<number>(new Date().getDate());
  const [singlePunchType, setSinglePunchType] = useState<string>('amin');
  const [singlePunchTime, setSinglePunchTime] = useState<string>('08:10');
  const [isSandboxOperating, setIsSandboxOperating] = useState<boolean>(false);

  const handlePresetChange = (preset: string) => {
    setTestPreset(preset);
    if (preset === 'regular') {
      setTestAmIn('08:00');
      setTestAmOut('12:00');
      setTestPmIn('13:00');
      setTestPmOut('17:00');
    } else if (preset === 'visiting_example') {
      setTestAmIn('08:00');
      setTestAmOut('12:00');
      setTestPmIn('');
      setTestPmOut('');
    } else if (preset === 'tardy') {
      setTestAmIn('08:15');
      setTestAmOut('12:00');
      setTestPmIn('13:00');
      setTestPmOut('16:30');
    }
  };

  const handleQuickAddDay = async () => {
    if (!selectedEmployeeId) {
      toast.error('Please select an employee first');
      return;
    }
    setIsSandboxOperating(true);
    try {
      const targetDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(testDay).padStart(2, '0')}`;
      
      const response = await fetch('/api/dtr/save-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          date: targetDate,
          amIn: testAmIn || null,
          amOut: testAmOut || null,
          pmIn: testPmIn || null,
          pmOut: testPmOut || null,
          notes: testPreset === 'visiting_example' ? 'Visiting Instructor Session' : 'Sandbox AM/PM Work'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to configure day');
      }

      toast.success(`Day ${testDay} configured and simulated!`);
      fetchLogs();
    } catch (err) {
      toast.error('Failed to quick-add day');
    } finally {
      setIsSandboxOperating(false);
    }
  };

  const handleSingleMockPunch = async () => {
    if (!selectedEmployeeId) {
      toast.error('Please select an employee update target');
      return;
    }
    setIsSandboxOperating(true);
    try {
      const targetDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(singlePunchDay).padStart(2, '0')}`;
      
      // Get existing logs
      const dayLogs = logs.filter(
        l => l.employeeId === selectedEmployeeId && safeDateOnly(l.date) === targetDate
      );

      // Parse punches
      const current = getDayPunches(dayLogs, targetDate);
      let updatedAmIn = current.pickerAmIn;
      let updatedAmOut = current.pickerAmOut;
      let updatedPmIn = current.pickerPmIn;
      let updatedPmOut = current.pickerPmOut;

      if (singlePunchType === 'amin') updatedAmIn = singlePunchTime;
      if (singlePunchType === 'amout') updatedAmOut = singlePunchTime;
      if (singlePunchType === 'pmin') updatedPmIn = singlePunchTime;
      if (singlePunchType === 'pmout') updatedPmOut = singlePunchTime;

      const response = await fetch('/api/dtr/save-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          date: targetDate,
          amIn: updatedAmIn || null,
          amOut: updatedAmOut || null,
          pmIn: updatedPmIn || null,
          pmOut: updatedPmOut || null,
          notes: 'Mock Single Punch'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to register mock punch');
      }

      toast.success(`Punch registered on day ${singlePunchDay} at ${singlePunchTime}!`);
      fetchLogs();
    } catch (err) {
      toast.error('Failed to trigger mock punch');
    } finally {
      setIsSandboxOperating(false);
    }
  };

  const handleDeleteDayLogs = async (dayNum: number) => {
    if (!selectedEmployeeId) {
      toast.error('Please select an employee first');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete all logs for day ${dayNum}?`)) {
      return;
    }
    setIsSandboxOperating(true);
    try {
      const targetDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const response = await fetch('/api/dtr/save-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          date: targetDate,
          amIn: null,
          amOut: null,
          pmIn: null,
          pmOut: null
        })
      });

      if (!response.ok) {
        throw new Error('Failed to clear day logs');
      }

      toast.success(`Cleared all punch transactions for day ${dayNum}.`);
      fetchLogs();
    } catch (err) {
      toast.error('Failed to clear day logs');
    } finally {
      setIsSandboxOperating(false);
    }
  };

  // Real-time time display
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const selectedEmployee = employees.find(emp => emp.id === selectedEmployeeId);

  // Fallback metadata for print DTR
  const getEmployeeName = () => {
    if (isAdmin && selectedEmployee) {
      const last = selectedEmployee.lastName || '';
      const first = selectedEmployee.firstName || '';
      if (last && first) {
        return `${String(last).toUpperCase()}, ${String(first).toUpperCase()}`;
      } else if (last || first) {
        return String(last || first).toUpperCase();
      }
    }
    if (user?.displayName) {
      return String(user.displayName).toUpperCase();
    }
    if (user?.email) {
      return String(user.email).toUpperCase();
    }
    return "SLSU EMPLOYEE";
  };

  const getEmployeeIdNo = () => {
    if (isAdmin && selectedEmployee) {
      return selectedEmployee.employeeId;
    }
    return "SLSU-2026-TEMP";
  };

  const getEmployeeDesignation = () => {
    if (isAdmin && selectedEmployee) {
      return `${selectedEmployee.category} (${selectedEmployee.salaryType})`;
    }
    return "Staff Member";
  };

  const getEmployeeScheduleText = () => {
    if (employeeSchedules.length === 0) {
      return '8:00 AM - 12:00 PM, 1:00 PM - 5:00 PM';
    }
    const activeSchedules = employeeSchedules.filter(s => !s.specificDate);
    const times: string[] = [];
    const get24HourTimeStr = (tStr: string) => {
      if (!tStr) return '';
      let [h, m] = safeSplit(tStr, ':').map(Number);
      if (h > 0 && h <= 6) h += 12;
      return `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}`;
    };

    const sorted = [...activeSchedules].sort((a, b) => {
      return get24HourTimeStr(a.startTime).localeCompare(get24HourTimeStr(b.startTime));
    });

    const seen = new Set<string>();
    sorted.forEach(s => {
      const range = `${formatTimeTo12Hour(s.startTime)} - ${formatTimeTo12Hour(s.endTime)}`;
      if (!seen.has(range)) {
        seen.add(range);
        times.push(range);
      }
    });

    if (times.length > 0) {
      return times.join(', ');
    }
    return '8:00 AM - 12:00 PM, 1:00 PM - 5:00 PM';
  };

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const endpoint = isAdmin ? '/api/dtr' : `/api/dtr/employee/${user?.id}`;
      const response = await fetch(endpoint);
      const data = await response.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('Failed to fetch DTR logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/employees');
      const data = await response.json();
      const emps = Array.isArray(data) ? data : [];
      setEmployees(emps);
      if (emps.length > 0 && !selectedEmployeeId) {
        // Set default selected employee to first one for Admin, or login employee
        const self = emps.find((e: Employee) => e.email && user?.email && e.email.toLowerCase() === user.email.toLowerCase());
        setSelectedEmployeeId(self ? self.id : emps[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    }
  };

  const fetchStatus = async () => {
    if (!user) return;
    try {
      const response = await fetch(`/api/dtr/status/${user.id}`);
      const data = await response.json();
      setCurrentStatus(data);
    } catch (error) {
      console.error('Failed to fetch status:', error);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchStatus();
    if (isAdmin) {
      fetchEmployees();
    } else {
      setSelectedEmployeeId(user?.id || '');
    }
  }, [user]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/dtr/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: newEntry.employeeId || selectedEmployeeId,
          date: newEntry.date,
          timeIn: newEntry.timeIn,
          timeOut: newEntry.timeOut || null,
          notes: newEntry.notes
        })
      });
      const data = await response.json();
      
      if (response.ok) {
        toast.success('DTR entry added successfully');
        setIsAddDialogOpen(false);
        fetchLogs();
      } else {
        toast.error(data.error || 'Failed to add DTR entry');
      }
    } catch (error) {
      toast.error('Connection error');
    }
  };

  const handleClockAction = async (action: 'in' | 'out') => {
    try {
      const response = await fetch(`/api/dtr/clock-${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: user?.id })
      });
      const data = await response.json();
      
      if (response.ok) {
        toast.success(`Successfully clocked ${action}! SMS sent.`);
        fetchLogs();
        fetchStatus();
      } else {
        toast.error(data.error || `Failed to clock ${action}`);
      }
    } catch (error) {
      toast.error('Connection error');
    }
  };

  // Advanced Day Row Edit click - pulls existing logs for that specific day
  const handleOpenRowEdit = (day: number) => {
    if (!isAdmin) {
      toast.info("Only payroll admins can edit timesheet records.");
      return;
    }
    const dayStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setEditDate(dayStr);

    // Filter logs for this employee and date
    const dayLogs = logs.filter(log => {
      const logEmpId = log.employeeId;
      const d = safeDateOnly(log.date);
      return logEmpId === selectedEmployeeId && d === dayStr;
    });

    setEditingDayLogs(dayLogs);

    // Parse punches
    const parsed = getDayPunches(dayLogs, dayStr);
    setEditPunches({
      amIn: parsed.pickerAmIn || '',
      amOut: parsed.pickerAmOut || '',
      pmIn: parsed.pickerPmIn || '',
      pmOut: parsed.pickerPmOut || '',
      notes: dayLogs[0]?.notes || ''
    });

    setIsRowEditOpen(true);
  };

  // Convert "8:00" to "08:00" for input[type=time]
  const formatTo24Char = (timeStr: string) => {
    if (!timeStr) return '';
    const [h, m] = safeSplit(timeStr.trim(), ':');
    return `${(h || '').padStart(2, '0')}:${(m || '').padStart(2, '0')}`;
  };

  const getSchedulesForEditDate = () => {
    if (!editDate) return [];
    const parts = safeSplit(editDate, '-');
    if (parts.length !== 3) return [];
    try {
      const logDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      const daysOfWeekStr = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = daysOfWeekStr[logDate.getDay()];
      
      return employeeSchedules.filter((sch: any) => {
        if (sch.specificDate) {
          const sDate = safeDateOnly(sch.specificDate);
          return sDate === editDate;
        }
        return sch.dayOfWeek === dayName;
      });
    } catch (e) {
      return [];
    }
  };

  const handleSaveDayPunches = async () => {
    try {
      const response = await fetch('/api/dtr/save-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          date: editDate,
          amIn: editPunches.amIn || null,
          amOut: editPunches.amOut || null,
          pmIn: editPunches.pmIn || null,
          pmOut: editPunches.pmOut || null,
          notes: editPunches.notes || ''
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update day punches');
      }

      toast.success('Timesheet day punches updated successfully.');
      setIsRowEditOpen(false);
      fetchLogs();
    } catch (e) {
      toast.error('Failed to save day punches');
    }
  };

  // Simulate DTR entries for selected month/year
  const simulateMonthLogs = async () => {
    setSimulating(true);
    try {
      const response = await fetch('/api/dtr/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: 'all',
          year: selectedYear,
          month: selectedMonth
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Simulation failed');
      }

      toast.success(`Successfully simulated ${data.count || 0} timesheet records for all employees.`);
      fetchLogs();
    } catch (err: any) {
      toast.error(err.message || 'Simulation failed');
    } finally {
      setSimulating(false);
    }
  };

  // Clear all DTR logs for selected employee in the selected month
  const clearMonthLogs = async () => {
    if (!window.confirm("Are you sure you want to clear all DTR entries for this employee for this month?")) return;
    const yearMonthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    try {
      await fetch(`/api/dtr/clear/${selectedEmployeeId}/${yearMonthStr}`, { method: 'DELETE' });
      toast.success('Month logs cleared successfully.');
      fetchLogs();
    } catch (e) {
      toast.error('Failed to clear logs');
    }
  };

  // Get days array in month
  const getDaysInMonthArray = () => {
    const totalDays = new Date(selectedYear, selectedMonth, 0).getDate();
    return Array.from({ length: totalDays }, (_, i) => i + 1);
  };

  // CSC Parser of am/pm logs on a specific day
  const getDayPunchesInner = (dayLogs: DTRLog[], dateStrOverride?: string) => {
    let amIn = '---';
    let amOut = '---';
    let pmIn = '---';
    let pmOut = '---';
    let pickerAmIn = '';
    let pickerAmOut = '';
    let pickerPmIn = '';
    let pickerPmOut = '';
    let undertimeHours = '';
    let undertimeMin = '';

    if (dayLogs.length === 0) {
      return { 
        amIn, amOut, pmIn, pmOut, 
        pickerAmIn, pickerAmOut, pickerPmIn, pickerPmOut, 
        undertimeHours, undertimeMin 
      };
    }

    const activeDateStr = dateStrOverride || (dayLogs[0] ? safeDateOnly(dayLogs[0].date) : null);

    if (selectedEmployee?.category === 'Visiting Instructor') {
      let amInVal = '---';
      let amOutVal = '---';
      let pmInVal = '---';
      let pmOutVal = '---';
      let pickerAmInVal = '';
      let pickerAmOutVal = '';
      let pickerPmInVal = '';
      let pickerPmOutVal = '';

      const sorted = [...dayLogs].sort((a, b) => {
        const aTime = parseLocalDateNoShift(a.timeIn)?.getTime() || 0;
        const bTime = parseLocalDateNoShift(b.timeIn)?.getTime() || 0;
        return aTime - bTime;
      });
      
      let amInDate: Date | null = null;
      let amOutDate: Date | null = null;
      let pmInDate: Date | null = null;
      let pmOutDate: Date | null = null;

      let morningLogs: DTRLog[] = [];
      let afternoonLogs: DTRLog[] = [];

      if (sorted.length >= 2) {
        morningLogs = [sorted[0]];
        afternoonLogs = sorted.slice(1);
      } else if (sorted.length === 1) {
        const d = parseLocalDateNoShift(sorted[0].timeIn);
        if (d && d.getHours() < 12) {
          morningLogs = [sorted[0]];
        } else {
          afternoonLogs = [sorted[0]];
        }
      }

      if (morningLogs.length > 0) {
        const firstAM = morningLogs[0];
        amInDate = parseLocalDateNoShift(firstAM.timeIn);
        if (amInDate) {
          amInVal = format(amInDate, 'h:mm');
          pickerAmInVal = format(amInDate, 'HH:mm');
        }

        const lastAMWithOut = [...morningLogs].reverse().find(l => l.timeOut);
        if (lastAMWithOut && lastAMWithOut.timeOut) {
          const lastAMOut = parseLocalDateNoShift(lastAMWithOut.timeOut);
          if (lastAMOut) {
            if (lastAMOut.getHours() < 13) {
              amOutDate = lastAMOut;
              amOutVal = format(amOutDate, 'h:mm');
              pickerAmOutVal = format(amOutDate, 'HH:mm');
            } else {
              pmOutDate = lastAMOut;
              pmOutVal = format(pmOutDate, 'h:mm');
              pickerPmOutVal = format(pmOutDate, 'HH:mm');
            }
          }
        }
      }

      if (afternoonLogs.length > 0) {
        const firstPM = afternoonLogs[0];
        pmInDate = parseLocalDateNoShift(firstPM.timeIn);
        if (pmInDate) {
          pmInVal = format(pmInDate, 'h:mm');
          pickerPmInVal = format(pmInDate, 'HH:mm');
        }

        const lastPMWithOut = [...afternoonLogs].reverse().find(l => l.timeOut);
        if (lastPMWithOut && lastPMWithOut.timeOut) {
          pmOutDate = parseLocalDateNoShift(lastPMWithOut.timeOut);
          if (pmOutDate) {
            pmOutVal = format(pmOutDate, 'h:mm');
            pickerPmOutVal = format(pmOutDate, 'HH:mm');
          }
        }
      }

      const dateStr = safeDateOnly(dayLogs[0].date);
      const dateParts = safeSplit(dateStr, '-');
      const logDate = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]));
      const daysOfWeekStr = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = daysOfWeekStr[logDate.getDay()];

      const matchingSchedules = employeeSchedules.filter((sch: any) => {
        if (sch.specificDate) {
          const sDate = safeDateOnly(sch.specificDate);
          return sDate === dateStr;
        }
        return sch.dayOfWeek === dayName;
      });

      let totalEarnedMinutes = 0;
      matchingSchedules.forEach((sch: any) => {
        if (sch.startTime && sch.endTime) {
          let sh = Number(sch.startTime.split(':')[0]);
          let sm = Number(sch.startTime.split(':')[1] || 0);
          if (sh > 0 && sh <= 6) sh += 12;

          let eh = Number(sch.endTime.split(':')[0]);
          let em = Number(sch.endTime.split(':')[1] || 0);
          if (eh > 0 && eh <= 6) eh += 12;

          const schedInMin = sh * 60 + sm;
          const schedOutMin = eh * 60 + em;
          const schedDuration = Math.max(0, schedOutMin - schedInMin);

          let overlapMin = 0;
          dayLogs.forEach((log) => {
            if (log.timeIn && log.timeOut) {
              const inDate = parseLocalDateNoShift(log.timeIn);
              const outDate = parseLocalDateNoShift(log.timeOut);
              
              if (inDate && outDate) {
                const logInMin = inDate.getHours() * 60 + inDate.getMinutes();
                const logOutMin = outDate.getHours() * 60 + outDate.getMinutes();

                const overlapIn = Math.max(logInMin, schedInMin);
                const overlapOut = Math.min(logOutMin, schedOutMin);
                overlapMin += Math.max(0, overlapOut - overlapIn);
              }
            }
          });

          totalEarnedMinutes += overlapMin;
        }
      });

      let undertimeHoursVal = '';
      let undertimeMinVal = '';
      if (totalEarnedMinutes > 0) {
        const h = Math.floor(totalEarnedMinutes / 60);
        const m = Math.round(totalEarnedMinutes % 60);
        undertimeHoursVal = String(h);
        undertimeMinVal = String(m);
      }

      return {
        amIn: amInVal,
        amOut: amOutVal,
        pmIn: pmInVal,
        pmOut: pmOutVal,
        pickerAmIn: pickerAmInVal,
        pickerAmOut: pickerAmOutVal,
        pickerPmIn: pickerPmInVal,
        pickerPmOut: pickerPmOutVal,
        undertimeHours: undertimeHoursVal,
        undertimeMin: undertimeMinVal
      };
    }

    const formatPunchTime = (val: string | null | undefined, baseDate?: string) => {
      if (!val || val === '---') return { display: '---', picker: '', date: null as Date | null };
      const str = String(val).trim();
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
        const parts = safeSplit(str, ':');
        let h = parseInt(parts[0], 10);
        const m = parts[1];
        const picker = `${String(h).padStart(2, '0')}:${m}`;
        const displayH = h % 12 === 0 ? 12 : h % 12;
        const display = `${displayH}:${m}`;
        const base = baseDate ? safeDateOnly(baseDate) : '';
        const d = base ? parseLocalDateNoShift(`${base}T${picker}:00`) : null;
        return { display, picker, date: d };
      }
      const d = parseLocalDateNoShift(str);
      if (d && !isNaN(d.getTime())) {
        return {
          display: format(d, 'h:mm'),
          picker: format(d, 'HH:mm'),
          date: d
        };
      }
      return { display: str, picker: str, date: null };
    };

    // Sort logs by timeIn ascending
    const sorted = [...dayLogs].sort((a, b) => {
      const aTime = parseLocalDateNoShift(a.timeIn)?.getTime() || 0;
      const bTime = parseLocalDateNoShift(b.timeIn)?.getTime() || 0;
      return aTime - bTime;
    });

    let amInDate: Date | null = null;
    let amOutDate: Date | null = null;
    let pmInDate: Date | null = null;
    let pmOutDate: Date | null = null;

    if (sorted.length >= 2) {
      const primaryAM: any = sorted[0];
      const primaryPM: any = sorted[1];

      if (primaryAM.amIn || primaryAM.amOut || primaryAM.pmIn || primaryAM.pmOut) {
        if (primaryAM.amIn) {
          const res = formatPunchTime(primaryAM.amIn, activeDateStr || undefined);
          amIn = res.display;
          pickerAmIn = res.picker;
          amInDate = res.date;
        }
        if (primaryAM.amOut) {
          const res = formatPunchTime(primaryAM.amOut, activeDateStr || undefined);
          amOut = res.display;
          pickerAmOut = res.picker;
          amOutDate = res.date;
        }
      } else {
        amInDate = parseLocalDateNoShift(primaryAM.timeIn);
        if (amInDate) {
          amIn = format(amInDate, 'h:mm');
          pickerAmIn = format(amInDate, 'HH:mm');
        }
        if (primaryAM.timeOut) {
          amOutDate = parseLocalDateNoShift(primaryAM.timeOut);
          if (amOutDate) {
            amOut = format(amOutDate, 'h:mm');
            pickerAmOut = format(amOutDate, 'HH:mm');
          }
        }
      }

      if (primaryPM.pmIn || primaryPM.pmOut) {
        if (primaryPM.pmIn) {
          const res = formatPunchTime(primaryPM.pmIn, activeDateStr || undefined);
          pmIn = res.display;
          pickerPmIn = res.picker;
          pmInDate = res.date;
        }
        if (primaryPM.pmOut) {
          const res = formatPunchTime(primaryPM.pmOut, activeDateStr || undefined);
          pmOut = res.display;
          pickerPmOut = res.picker;
          pmOutDate = res.date;
        }
      } else {
        pmInDate = parseLocalDateNoShift(primaryPM.timeIn);
        if (pmInDate) {
          pmIn = format(pmInDate, 'h:mm');
          pickerPmIn = format(pmInDate, 'HH:mm');
        }
        if (primaryPM.timeOut) {
          pmOutDate = parseLocalDateNoShift(primaryPM.timeOut);
          if (pmOutDate) {
            pmOut = format(pmOutDate, 'h:mm');
            pickerPmOut = format(pmOutDate, 'HH:mm');
          }
        }
      }
    } else if (sorted.length === 1) {
      const singleLog: any = sorted[0];

      // 1. If explicit AM/PM columns exist on record
      if (singleLog.amIn || singleLog.amOut || singleLog.pmIn || singleLog.pmOut) {
        if (singleLog.amIn) {
          const res = formatPunchTime(singleLog.amIn, activeDateStr || undefined);
          amIn = res.display;
          pickerAmIn = res.picker;
          amInDate = res.date;
        }
        if (singleLog.amOut) {
          const res = formatPunchTime(singleLog.amOut, activeDateStr || undefined);
          amOut = res.display;
          pickerAmOut = res.picker;
          amOutDate = res.date;
        }
        if (singleLog.pmIn) {
          const res = formatPunchTime(singleLog.pmIn, activeDateStr || undefined);
          pmIn = res.display;
          pickerPmIn = res.picker;
          pmInDate = res.date;
        }
        if (singleLog.pmOut) {
          const res = formatPunchTime(singleLog.pmOut, activeDateStr || undefined);
          pmOut = res.display;
          pickerPmOut = res.picker;
          pmOutDate = res.date;
        }
      } else {
        // 2. Derive from timeIn and timeOut
        const inDate = parseLocalDateNoShift(singleLog.timeIn);
        const outDate = singleLog.timeOut ? parseLocalDateNoShift(singleLog.timeOut) : null;
        const inHour = inDate ? inDate.getHours() : 8;
        const outHour = outDate ? outDate.getHours() : (inHour < 12 ? 17 : inHour + 4);

        // Full day shift covering AM & PM (e.g. morning start < 12 and afternoon end >= 13 or >= 12:30)
        if (inDate && outDate && inHour < 12 && (outHour >= 13 || (outHour === 12 && outDate.getMinutes() >= 30))) {
          amInDate = inDate;
          amIn = format(amInDate, 'h:mm');
          pickerAmIn = format(amInDate, 'HH:mm');

          if (activeDateStr) {
            amOutDate = parseLocalDateNoShift(`${activeDateStr}T12:00:00`);
          }
          amOut = '12:00';
          pickerAmOut = '12:00';

          if (activeDateStr) {
            pmInDate = parseLocalDateNoShift(`${activeDateStr}T13:00:00`);
          }
          pmIn = '1:00';
          pickerPmIn = '13:00';

          pmOutDate = outDate;
          pmOut = format(pmOutDate, 'h:mm');
          pickerPmOut = format(pmOutDate, 'HH:mm');
        } else if (inHour < 12) {
          amInDate = inDate;
          if (amInDate) {
            amIn = format(amInDate, 'h:mm');
            pickerAmIn = format(amInDate, 'HH:mm');
          }
          if (outDate) {
            amOutDate = outDate;
            amOut = format(amOutDate, 'h:mm');
            pickerAmOut = format(amOutDate, 'HH:mm');
          }
        } else {
          pmInDate = inDate;
          if (pmInDate) {
            pmIn = format(pmInDate, 'h:mm');
            pickerPmIn = format(pmInDate, 'HH:mm');
          }
          if (outDate) {
            pmOutDate = outDate;
            pmOut = format(pmOutDate, 'h:mm');
            pickerPmOut = format(pmOutDate, 'HH:mm');
          }
        }
      }
    }

    // Resolve targeted schedule boundaries for regular employee
    let amStartTimeStr = '08:00';
    let amEndTimeStr = '12:00';
    let pmStartTimeStr = '13:00';
    let pmEndTimeStr = '17:00';
    let hasMatchingScheduleForDay = false;

    if (activeDateStr && (selectedEmployee?.category === 'Regular Employee' || selectedEmployee?.category === 'FACULTY' || selectedEmployee?.category === 'STAFF')) {
      const dateParts = safeSplit(safeDateOnly(activeDateStr), '-');
      const logDate = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]));
      const daysOfWeekStr = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = daysOfWeekStr[logDate.getDay()];

      const matchingSchedules = employeeSchedules.filter((sch: any) => {
        if (sch.specificDate) {
          const sDate = safeDateOnly(sch.specificDate);
          return sDate === activeDateStr;
        }
        return sch.dayOfWeek === dayName;
      });

      if (matchingSchedules.length > 0) {
        hasMatchingScheduleForDay = true;
        const get24HourTimeStr = (tStr: string) => {
          if (!tStr) return '';
          let [h, m] = safeSplit(tStr, ':').map(Number);
          if (h > 0 && h <= 6) h += 12;
          return `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}`;
        };

        const sortedSchedules = [...matchingSchedules].sort((a, b) => {
          return get24HourTimeStr(a.startTime).localeCompare(get24HourTimeStr(b.startTime));
        });

        let schedAm = null;
        let schedPm = null;

        if (sortedSchedules.length >= 2) {
          schedAm = sortedSchedules[0];
          schedPm = sortedSchedules[1];
        } else if (sortedSchedules.length === 1) {
          const firstSched = sortedSchedules[0];
          const firstStartHour = Number(safeSplit(firstSched.startTime, ':')[0]);
          if (firstStartHour < 12) {
            schedAm = firstSched;
          } else {
            schedPm = firstSched;
          }
        }

        if (schedAm) {
          amStartTimeStr = schedAm.startTime;
          amEndTimeStr = schedAm.endTime;
        } else {
          amStartTimeStr = '00:00';
          amEndTimeStr = '00:00';
        }

        if (schedPm) {
          pmStartTimeStr = schedPm.startTime;
          pmEndTimeStr = schedPm.endTime;
        } else {
          pmStartTimeStr = '00:00';
          pmEndTimeStr = '00:00';
        }
      }
    }

    const getMinutesFromTime = (timeStr: string) => {
      if (!timeStr || timeStr === '00:00') return 0;
      let [h, m] = safeSplit(timeStr, ':').map(Number);
      if (h > 0 && h <= 6) h += 12;
      return h * 60 + (m || 0);
    };

    const amStartMinutes = getMinutesFromTime(amStartTimeStr);
    const amEndMinutes = getMinutesFromTime(amEndTimeStr);
    const pmStartMinutes = getMinutesFromTime(pmStartTimeStr);
    const pmEndMinutes = getMinutesFromTime(pmEndTimeStr);

    // Job Order logic inside the main DTR.tsx Selector Page
    if (selectedEmployee?.category === 'Job Order') {
      let totalWorkedMinutes = 0;
      dayLogs.forEach(log => {
        if (log.timeIn && log.timeOut) {
          const inD = parseLocalDateNoShift(log.timeIn);
          const outD = parseLocalDateNoShift(log.timeOut);
          if (inD && outD) {
            const diffMs = outD.getTime() - inD.getTime();
            let diffMin = Math.max(0, Math.floor(diffMs / (1000 * 60)));
            
            // Auto noon lunch deduction (2 hours) if the work session spans across 11:00 AM and 1:00 PM
            const inLocalMinutes = inD.getHours() * 60 + inD.getMinutes();
            const outLocalMinutes = outD.getHours() * 60 + outD.getMinutes();
            if (inLocalMinutes <= 11 * 60 && outLocalMinutes >= 13 * 60) {
              diffMin = Math.max(0, diffMin - 120);
            }
            totalWorkedMinutes += diffMin;
          }
        }
      });

      let workedHoursVal = '';
      let workedMinVal = '';
      if (totalWorkedMinutes > 0) {
        const h = Math.floor(totalWorkedMinutes / 60);
        const m = Math.round(totalWorkedMinutes % 60);
        workedHoursVal = String(h);
        workedMinVal = String(m).padStart(2, '0');
      }

      return {
        amIn, amOut, pmIn, pmOut,
        pickerAmIn, pickerAmOut, pickerPmIn, pickerPmOut,
        undertimeHours: workedHoursVal,
        undertimeMin: workedMinVal
      };
    }

    // Regular Employee logic
    let totalWorkedMinutes = 0;

    const isWeekendDay = (dayNum: number) => {
      const dateObj = new Date(selectedYear, selectedMonth - 1, dayNum);
      const dayOfWeek = dateObj.getDay();
      return dayOfWeek === 0 || dayOfWeek === 6;
    };

    const dayNum = activeDateStr ? Number(safeSplit(safeDateOnly(activeDateStr), '-')[2]) : 1;

    if (dayLogs.length > 0) {
      const amStart = amStartTimeStr !== '00:00' ? amStartMinutes : 480; // 8:00
      const amEnd = amEndTimeStr !== '00:00' ? amEndMinutes : 720; // 12:00
      const pmStart = pmStartTimeStr !== '00:00' ? pmStartMinutes : 780; // 13:00
      const pmEnd = pmEndTimeStr !== '00:00' ? pmEndMinutes : 1020; // 17:00

      // Case 1: Standard AM segment
      if (amInDate && amOutDate) {
        const arrivalMin = amInDate.getHours() * 60 + amInDate.getMinutes();
        const departureMin = amOutDate.getHours() * 60 + amOutDate.getMinutes();
        const effectiveIn = isWeekendDay(dayNum) ? arrivalMin : Math.max(arrivalMin, amStart);
        const effectiveOut = isWeekendDay(dayNum) ? departureMin : Math.min(departureMin, amEnd);
        if (effectiveOut > effectiveIn) {
          totalWorkedMinutes += (effectiveOut - effectiveIn);
        }
      }

      // Case 2: Standard PM segment
      if (pmInDate && pmOutDate) {
        const arrivalMin = pmInDate.getHours() * 60 + pmInDate.getMinutes();
        const departureMin = pmOutDate.getHours() * 60 + pmOutDate.getMinutes();
        const effectiveIn = isWeekendDay(dayNum) ? arrivalMin : Math.max(arrivalMin, pmStart);
        const effectiveOut = isWeekendDay(dayNum) ? departureMin : Math.min(departureMin, pmEnd);
        if (effectiveOut > effectiveIn) {
          totalWorkedMinutes += (effectiveOut - effectiveIn);
        }
      }

      // Case 3: Continuous check-in/out spanning noon
      if (amInDate && pmOutDate && !amOutDate && !pmInDate) {
        const arrivalMin = amInDate.getHours() * 60 + amInDate.getMinutes();
        const departureMin = pmOutDate.getHours() * 60 + pmOutDate.getMinutes();
        let totalSpan = departureMin - arrivalMin;
        let worked = totalSpan - 60; // Break deduction (12:00 PM - 1:00 PM is 1 hour)
        if (!isWeekendDay(dayNum)) {
          const activeSchedDuration = (amEnd - amStart) + (pmEnd - pmStart);
          worked = Math.min(worked, activeSchedDuration);
        }
        if (worked > 0) {
          totalWorkedMinutes = worked;
        }
      }
    }

    if (totalWorkedMinutes > 0) {
      const h = Math.floor(totalWorkedMinutes / 60);
      const m = Math.round(totalWorkedMinutes % 60);
      undertimeHours = String(h);
      undertimeMin = String(m).padStart(2, '0');
    } else {
      undertimeHours = '';
      undertimeMin = '';
    }

    return { 
      amIn, amOut, pmIn, pmOut, 
      pickerAmIn, pickerAmOut, pickerPmIn, pickerPmOut, 
      undertimeHours, undertimeMin 
    };
  };

  const getDayPunches = (dayLogs: DTRLog[], dateStrOverride?: string) => {
    const res = getDayPunchesInner(dayLogs, dateStrOverride);
    const activeDateStr = dateStrOverride || (dayLogs[0] ? safeDateOnly(dayLogs[0].date) : null);
    if (activeDateStr) {
      const parts = safeSplit(activeDateStr, '-');
      if (parts.length === 3) {
        const yr = Number(parts[0]);
        const mn = Number(parts[1]);
        const dy = Number(parts[2]);
        const dateObj = new Date(yr, mn - 1, dy);
        const dayOfWeek = dateObj.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          res.undertimeHours = '';
          res.undertimeMin = '';
        }
      }
    }
    return res;
  };

  const getScheduledHoursForDate = (dateStr: string) => {
    const parts = safeSplit(dateStr, '-');
    if (parts.length !== 3) return 0;
    const yr = Number(parts[0]);
    const mn = Number(parts[1]);
    const dy = Number(parts[2]);
    const dateObj = new Date(yr, mn - 1, dy);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (isWeekend) return 0;
    const daysOfWeekStr = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = daysOfWeekStr[dayOfWeek];

    const getMinutesOfTime = (timeStr: string) => {
      if (!timeStr || timeStr === '00:00') return 0;
      let [h, m] = safeSplit(timeStr, ':').map(Number);
      if (h > 0 && h <= 6) h += 12;
      return h * 60 + (m || 0);
    };

    const matchingSchedules = employeeSchedules.filter((sch: any) => {
      if (sch.specificDate) {
        const sDate = safeDateOnly(sch.specificDate);
        return sDate === dateStr;
      }
      return sch.dayOfWeek === dayName;
    });

    if (matchingSchedules.length > 0) {
      let totalMinutes = 0;
      matchingSchedules.forEach((sch: any) => {
        const start = getMinutesOfTime(sch.startTime);
        const end = getMinutesOfTime(sch.endTime);
        if (end > start) {
          totalMinutes += (end - start);
        }
      });
      return totalMinutes / 60;
    } else {
      if (selectedEmployee?.category === 'Visiting Instructor') {
        return 0;
      }
      if (employeeSchedules.length === 0) {
        return isWeekend ? 0 : 8;
      }
      return 0;
    }
  };

  const getScheduledHoursForPeriod = (startDay: number, endDay: number) => {
    let total = 0;
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const limit = Math.min(endDay, daysInMonth);
    
    for (let day = startDay; day <= limit; day++) {
      const dateObj = new Date(selectedYear, selectedMonth - 1, day);
      const dayOfWeek = dateObj.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip Saturday and Sunday
      
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      total += getScheduledHoursForDate(dateStr);
    }
    return Math.round(total * 100) / 100;
  };

  // Get computed DTR data for the selected employee and selected month
  const getDtrSheetData = () => {
    const days = getDaysInMonthArray();
    const sheetData: any[] = [];

    days.forEach(day => {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      // Get all log documents on this date for the selected employee
      const dayLogs = logs.filter(log => {
        const logEmpId = log.employeeId;
        const d = safeDateOnly(log.date);
        return logEmpId === selectedEmployeeId && d === dateStr;
      });

      const parsed = getDayPunches(dayLogs, dateStr);
      sheetData.push({
        day,
        dateStr,
        ...parsed
      });
    });

    return sheetData;
  };

  const sheetEntries = getDtrSheetData();
  const firstHalf = sheetEntries.filter(e => e.day <= 15);
  // Pad the first half up to exactly 15 rows
  while (firstHalf.length < 15) {
    firstHalf.push({ day: firstHalf.length + 1, amIn: '---', amOut: '---', pmIn: '---', pmOut: '---', undertimeHours: '', undertimeMin: '' });
  }

  const secondHalf = sheetEntries.filter(e => e.day > 15);
  // Pad the second half up to exactly 16 rows to match 16 to 31 grid size perfectly
  while (secondHalf.length < 16) {
    const nextDayNum = 16 + secondHalf.length;
    secondHalf.push({ day: nextDayNum, amIn: '---', amOut: '---', pmIn: '---', pmOut: '---', undertimeHours: '', undertimeMin: '' });
  }

  // Calculate totals
  const calculateTotals = (halfEntries: any[]) => {
    let totalHr = 0;
    let totalMin = 0;
    halfEntries.forEach(e => {
      if (e.undertimeHours) totalHr += Number(e.undertimeHours);
      if (e.undertimeMin) totalMin += Number(e.undertimeMin);
    });

    totalHr += Math.floor(totalMin / 60);
    totalMin = totalMin % 60;

    return {
      hoursStr: totalHr > 0 ? String(totalHr) : '',
      minutesStr: totalMin > 0 ? String(totalMin) : ''
    };
  };

  const firstHalfTotals = calculateTotals(firstHalf);
  const secondHalfTotals = calculateTotals(secondHalf);

  const fullMonthRows = (() => {
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const rows: any[] = [];
    for (let day = 1; day <= 31; day++) {
      if (day <= daysInMonth) {
        const dateObj = new Date(selectedYear, selectedMonth - 1, day);
        const dayOfWeek = dateObj.getDay();
        const found = sheetEntries.find((e: any) => e.day === day);
        if (found) {
          rows.push({
            day,
            amIn: found.amIn !== '---' ? found.amIn : '',
            amOut: found.amOut !== '---' ? found.amOut : '',
            pmIn: found.pmIn !== '---' ? found.pmIn : '',
            pmOut: found.pmOut !== '---' ? found.pmOut : '',
            undertimeHours: found.undertimeHours || '',
            undertimeMin: found.undertimeMin || '',
            dayOfWeek
          });
        } else {
          rows.push({
            day,
            amIn: '',
            amOut: '',
            pmIn: '',
            pmOut: '',
            undertimeHours: '',
            undertimeMin: '',
            dayOfWeek
          });
        }
      } else {
        rows.push({
          day,
          amIn: '',
          amOut: '',
          pmIn: '',
          pmOut: '',
          undertimeHours: '',
          undertimeMin: '',
          dayOfWeek: -1
        });
      }
    }
    return rows;
  })();

  const fullMonthTotals = calculateTotals(fullMonthRows);

  const parsedName = () => {
    const fullName = getEmployeeName() || '';
    if (fullName.includes(',')) {
      const parts = fullName.split(',');
      const lastName = parts[0]?.trim() || '';
      const rest = parts[1]?.trim()?.split(/\s+/) || [];
      const firstName = rest[0] || '';
      const middleName = rest.slice(1).join(' ') || '';
      return { lastName, firstName, middleName };
    }
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return { lastName: '', firstName: '', middleName: '' };
    } else if (parts.length === 1) {
      return { lastName: parts[0] || '', firstName: '', middleName: '' };
    } else if (parts.length === 2) {
      return { lastName: parts[1] || '', firstName: parts[0] || '', middleName: '' };
    } else {
      return {
        lastName: parts[parts.length - 1] || '',
        firstName: parts[0] || '',
        middleName: parts.slice(1, parts.length - 1).join(' ')
      };
    }
  };

  const triggerPrint = () => {
    window.print();
  };

  const renderDtrSheet = (copyIndex: number) => {
    const nameData = parsedName();
    return (
      <div key={copyIndex} className="dtr-sheet-card w-full max-w-[580px] bg-white p-6 sm:p-8 border-2 border-black rounded-none text-neutral-900 shadow-md print:shadow-none flex flex-col justify-between print-border-thick print:p-6 print:w-full print:max-w-none print:h-full">
        <div>
          {/* Header text section (logos removed) */}
          <div className="flex items-center justify-center pb-2 border-b-2 border-black">
            <div className="text-center leading-normal font-sans text-neutral-850">
              <p className="text-[9.5px] font-medium tracking-tight text-neutral-600">Republic of the Philippines</p>
              <p className="text-[11.5px] font-extrabold uppercase leading-none mt-0.5 text-neutral-950">SOUTHERN LEYTE STATE UNIVERSITY</p>
              <p className="text-[10px] font-extrabold mt-1 text-[#1d58d9] uppercase tracking-wide">HINUNANGAN CAMPUS</p>
              <p className="text-[9.5px] font-medium mt-0.5 text-neutral-500 font-serif italic">Hinunangan, Southern Leyte</p>
            </div>
          </div>

          {/* CS Form Layout */}
          <div className="mt-2.5 relative">
            <span className="absolute left-0 top-0 text-[9.5px] font-bold font-serif">CS Form No. 48</span>
            <h2 className="text-center text-[14px] font-extrabold tracking-widest font-sans uppercase">
              DAILY TIME RECORD
            </h2>
          </div>

          {/* Last / First / Middle Name Details */}
          <div className="mt-4 border-b-2 border-black pb-1">
            <div className="grid grid-cols-3 gap-0.5 text-center font-sans text-[14px] font-black leading-none pb-1">
              <span className="truncate">{nameData.lastName ? nameData.lastName.toUpperCase() : '---'}</span>
              <span className="truncate">{nameData.firstName ? nameData.firstName.toUpperCase() : '---'}</span>
              <span className="truncate">{nameData.middleName ? nameData.middleName.toUpperCase() : '---'}</span>
            </div>
            <div className="grid grid-cols-3 gap-0.5 text-center text-[8px] text-neutral-500 uppercase font-sans tracking-wide leading-none pb-0.5">
              <span>Last Name</span>
              <span>First Name</span>
              <span>Middle Name</span>
            </div>
          </div>

          {/* Month & Schedule write-up */}
          <div className="mt-2.5 space-y-1 text-neutral-800 font-sans leading-none">
            <div className="flex items-center text-[10px]">
              <span className="shrink-0 uppercase font-semibold">For the month of</span>
              <div className="flex-1 border-b border-black text-center font-extrabold text-[11.5px] ml-1 uppercase pb-0.5">
                {mouthNames[selectedMonth - 1]}&nbsp;&nbsp;{selectedYear}
              </div>
            </div>
            <div className="flex items-center text-[10px]">
              <span className="shrink-0 uppercase font-semibold">Official hours for arrival</span>
              <div className="flex-1 border-b border-black text-center font-bold text-[10px] ml-1 pb-0.5 truncate">
                {getEmployeeScheduleText() || '_______________________'}
              </div>
            </div>
            <div className="flex items-center text-[10px]">
              <span className="shrink-0 uppercase font-semibold">and departure</span>
              <div className="flex-1 border-b border-black text-center font-bold text-[10px] ml-1 pb-0.5 truncate">
                {getEmployeeScheduleText() ? 'According to work schedule' : '_______________________'}
              </div>
            </div>
          </div>

          {/* 1 to 31 Days Table */}
          <div className="mt-3.5 border border-black select-none print-cell-border">
            <table className="w-full text-center border-collapse text-[10.5px] font-sans">
              <thead>
                <tr className="bg-neutral-50 border-b border-black text-[9px] font-bold text-neutral-800 uppercase print-cell-border">
                  <th rowSpan={2} className="border-r border-black py-1 w-8 print-cell-border font-extrabold">Day</th>
                  <th colSpan={2} className="border-r border-black border-b border-black py-1 print-cell-border font-extrabold">A.M.</th>
                  <th colSpan={2} className="border-r border-black border-b border-black py-1 print-cell-border font-extrabold">P.M.</th>
                  <th colSpan={2} className="border-b border-black py-1 print-cell-border font-extrabold">TOTAL</th>
                </tr>
                <tr className="bg-neutral-50/50 border-b border-black text-[7.5px] font-bold text-neutral-500 uppercase print-cell-border">
                  <th className="border-r border-black py-1 print-cell-border w-[14%] font-extrabold">ARRIVAL</th>
                  <th className="border-r border-black py-1 print-cell-border w-[14%] font-extrabold">DEPARTURE</th>
                  <th className="border-r border-black py-1 print-cell-border w-[14%] font-extrabold">ARRIVAL</th>
                  <th className="border-r border-black py-1 print-cell-border w-[14%] font-extrabold">DEPARTURE</th>
                  <th className="border-r border-black py-1 print-cell-border w-[10%] font-extrabold">HOURS</th>
                  <th className="py-1 print-cell-border w-[10%] font-extrabold">MINUTES</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[10px] text-neutral-900 leading-tight">
                {fullMonthRows.map(row => {
                  const hasPunches = row.amIn || row.amOut || row.pmIn || row.pmOut;
                  const isWeekend = row.dayOfWeek === 6 || row.dayOfWeek === 0;
                  const weekendLabel = row.dayOfWeek === 6 ? 'SATURDAY' : 'SUNDAY';
                  return (
                    <tr 
                      key={row.day} 
                      onClick={() => handleOpenRowEdit(row.day)}
                      className={`border-b border-black hover:bg-neutral-50 transition-colors cursor-pointer print-cell-border ${row.holiday ? 'bg-rose-50/40 print:bg-rose-50/10' : isWeekend ? 'bg-amber-50/20 print:bg-neutral-50/5' : ''}`}
                    >
                      <td className="border-r border-black font-extrabold py-0.5 w-8 bg-neutral-50/70 select-none text-[9.5px] print-cell-border text-center relative">
                        {row.day}
                        {row.holiday && (
                          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-rose-500 rounded-full print:border print:border-rose-500" title={row.holiday.name}></span>
                        )}
                        {isWeekend && !row.holiday && (
                          <span className="absolute bottom-0.5 right-0.5 w-1 h-1 bg-amber-500 rounded-full print:border print:border-amber-500" title={weekendLabel}></span>
                        )}
                      </td>
                      {row.holiday && !hasPunches ? (
                        <td colSpan={6} className="py-0.5 text-center font-bold tracking-wider text-[9px] text-rose-700 uppercase italic print-cell-border bg-rose-50/30">
                          ● HOLIDAY: {row.holiday.name}
                        </td>
                      ) : isWeekend && !hasPunches ? (
                        <td colSpan={6} className="py-0.5 text-center font-bold tracking-widest text-[9px] text-amber-700 uppercase italic print-cell-border bg-amber-50/20">
                          • {weekendLabel}
                        </td>
                      ) : (
                        <>
                          <td className="border-r border-black py-0.5 text-center font-medium tracking-tight text-[10px] print-cell-border">
                            {row.amIn}
                          </td>
                          <td className="border-r border-black py-0.5 text-center font-medium tracking-tight text-[10px] print-cell-border">
                            {row.amOut}
                          </td>
                          <td className="border-r border-black py-0.5 text-center font-medium tracking-tight text-[10px] print-cell-border">
                            {row.pmIn}
                          </td>
                          <td className="border-r border-black py-0.5 text-center font-medium tracking-tight text-[10px] print-cell-border">
                            {row.pmOut}
                          </td>
                          <td className="border-r border-black py-0.5 text-center print-cell-border text-neutral-900 font-bold">
                            {row.undertimeHours}
                          </td>
                          <td className="py-0.5 text-center print-cell-border text-neutral-900 font-semibold">
                            {row.undertimeMin}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
                {/* Totals Row */}
                <tr className="bg-neutral-50 font-bold text-[10px] border-t border-black print-cell-border select-none">
                  <td className="border-r border-black py-1 uppercase font-extrabold tracking-wider print-cell-border">Total</td>
                  <td colSpan={4} className="border-r border-black py-1 text-right pr-2 text-[8.5px] text-neutral-400 italic print-cell-border">Total Worked Time:</td>
                  <td className="border-r border-black py-1 text-neutral-900 text-center font-extrabold print-cell-border">{fullMonthTotals.hoursStr}</td>
                  <td className="py-1 text-center text-neutral-900 font-extrabold print-cell-border">{fullMonthTotals.minutesStr}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Verification & Signatures */}
        <div className="mt-3 space-y-2.5 border-t border-dotted border-neutral-300 pt-2 font-sans leading-none">
          <p className="text-[8.5px] text-neutral-600 leading-normal italic text-justify px-0.5">
            I certify on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.
          </p>

          <div className="pt-2 text-center">
            <div className="border-b border-black mx-auto w-3/4" />
            <p className="text-[8px] uppercase tracking-wide font-black text-neutral-500 mt-1">Signature of Employee</p>
          </div>

          <div className="border-b border-black pt-2 mx-0.5" />

          <p className="text-[9.5px] font-bold text-neutral-800 text-center uppercase tracking-wide pt-1">
            VERIFIED as to the prescribed office hours:
          </p>

          <div className="pt-3 text-center">
            <div className="border-b border-black mx-auto w-3/4" />
            <p className="text-[8px] uppercase tracking-wide font-black text-neutral-500 mt-1">IN-CHARGE</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Dynamic Native CSS Print Styles mapping CSC layouts on A4 paper */}
      <style>{`
        @media print {
          @page {
            size: portrait;
            margin: 0.3in 0.3in;
          }
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #printable-dtr {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
          }
          .dtr-sheet-card {
            border: 1.5px solid #000000 !important;
            background-color: #ffffff !important;
            border-radius: 0px !important;
            box-shadow: none !important;
            padding: 24px !important;
            page-break-inside: avoid !important;
            width: 100% !important;
            max-width: 600px !important;
            margin: 0 auto !important;
          }
          .no-print {
            display: none !important;
          }
          main, aside, nav, header, footer, button, .navbar, .sidebar {
            display: none !important;
          }
          .print-border-thick {
            border: 1.5px solid #000000 !important;
          }
          .print-cell-border {
            border: 0.5px solid #000000 !important;
          }
        }
      `}</style>

      {/* Screen Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print border-b border-neutral-100 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight font-sans">Daily Time Record</h1>
          <p className="text-neutral-500 text-sm font-sans mt-0.5">Civil Service Commission (Form 48) Official timesheet verification.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <>
              <Button 
                onClick={simulateMonthLogs}
                disabled={simulating}
                variant="outline" 
                className="gap-2 border-emerald-200 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-50 rounded-xl font-sans text-xs h-10 px-4"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {simulating ? "Generating..." : "Simulate Logs"}
              </Button>
              <Button 
                onClick={clearMonthLogs}
                variant="outline" 
                className="gap-2 border-red-200 text-red-600 hover:bg-red-50 rounded-xl font-sans text-xs h-10 px-4"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Reset Month
              </Button>
              <Button 
                onClick={() => setIsAddDialogOpen(true)}
                className="bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl gap-2 font-sans text-xs h-10 px-4 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Entry
              </Button>
            </>
          )}

          <Button 
            onClick={triggerPrint}
            className="bg-green-700 hover:bg-green-800 text-white gap-2 rounded-xl font-sans text-xs h-10 px-4 shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Form 48
          </Button>
        </div>
      </div>

      {/* Real-time Punch Center & User Status (No-Print) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 no-print">
        {/* Punch State Machine Control */}
        <Card className="border border-neutral-100 shadow-xl shadow-neutral-200/40 rounded-3xl overflow-hidden bg-white lg:col-span-1">
          <div className="bg-neutral-950 p-5 text-white relative overflow-hidden">
            <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none translate-x-4 translate-y-4">
              <Clock className="w-40 h-40" />
            </div>
            <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold font-mono">Real-time Attendance Gate</p>
            <h2 className="text-2xl font-bold font-sans mt-1">DTR Terminal</h2>
            <div className="mt-4 flex items-baseline gap-2 font-mono">
              <span className="text-3xl font-extrabold">{format(currentTime, 'hh:mm:ss')}</span>
              <span className="text-xs uppercase text-neutral-400 font-bold">{format(currentTime, 'a')}</span>
            </div>
            <p className="text-xs text-neutral-400 font-sans mt-0.5">{format(currentTime, 'EEEE, MMMM dd, yyyy')}</p>
          </div>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between p-3.5 bg-neutral-50 rounded-2xl border border-neutral-100">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${currentStatus ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-300'}`} />
                <div>
                  <p className="text-xs font-bold text-neutral-700 font-sans leading-none">Your Clock Status</p>
                  <p className="text-[10px] text-neutral-400 font-medium font-sans mt-1">
                    {currentStatus ? `Clocked In since ${format(parseLocalDateNoShift(currentStatus.timeIn) || new Date(), 'hh:mm a')}` : 'Currently Clocked Out'}
                  </p>
                </div>
              </div>
              <Badge className={`text-[10px] rounded-lg ${currentStatus ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold' : 'bg-neutral-100 border border-neutral-200 text-neutral-500'}`}>
                {currentStatus ? 'Active Punch' : 'Idle'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <Button 
                onClick={() => handleClockAction('in')}
                disabled={!!currentStatus}
                className="w-full h-11 rounded-xl bg-green-700 hover:bg-green-800 text-white shadow-sm flex items-center justify-center gap-2 font-semibold font-sans text-xs disabled:opacity-50"
              >
                <LogIn className="w-3.5 h-3.5" />
                Punch In (AM/PM)
              </Button>
              <Button 
                onClick={() => handleClockAction('out')}
                disabled={!currentStatus}
                className="w-full h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-sm flex items-center justify-center gap-2 font-semibold font-sans text-xs disabled:opacity-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                Punch Out
              </Button>
            </div>
            <p className="text-[10px] text-neutral-400 text-center font-sans mt-2">
              Note: System automatically maps your logs to AM Arrival, departure for lunch, PM arrival, and afternoon departure.
            </p>
          </CardContent>
        </Card>

        {/* Administrative filter sidebar */}
        <Card className="border border-neutral-100 shadow-xl shadow-neutral-200/40 rounded-3xl p-6 bg-white lg:col-span-2 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-neutral-100 pb-3">
              <div className="p-2 bg-neutral-100 rounded-xl text-neutral-600">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold font-sans text-neutral-800 leading-none">Timesheet Selection Scope</h3>
                <p className="text-[10px] text-neutral-400 font-sans mt-0.5">Filter employee sheets and period details.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="space-y-1.5Col">
                <Label htmlFor="period-emp" className="text-xs font-bold text-neutral-600 font-sans">Select Employee</Label>
                {isAdmin ? (
                  <select 
                    id="period-emp"
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    className="w-full h-11 border border-neutral-200 rounded-xl bg-neutral-50/50 px-3 text-xs text-neutral-800 font-medium focus:ring-2 focus:ring-neutral-200 focus:outline-none focus:border-neutral-300"
                  >
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.lastName}, {emp.firstName} ({emp.employeeId})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="h-11 border border-neutral-200 rounded-xl bg-neutral-50 px-3 flex items-center gap-2 text-xs text-neutral-500 font-semibold font-sans">
                    <User className="w-3.5 h-3.5 text-neutral-400" />
                    <span>{getEmployeeName()}</span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5Col">
                <Label htmlFor="period-month" className="text-xs font-bold text-neutral-600 font-sans font-medium">Month</Label>
                <select 
                  id="period-month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="w-full h-11 border border-neutral-200 rounded-xl bg-neutral-50/50 px-3 text-xs text-neutral-800 font-medium focus:ring-2 focus:ring-neutral-200 focus:outline-none focus:border-neutral-300"
                >
                  {mouthNames.map((m, idx) => (
                    <option key={m} value={idx + 1}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5Col">
                <Label htmlFor="period-year" className="text-xs font-bold text-neutral-600 font-sans font-medium">Year</Label>
                <select 
                  id="period-year"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-full h-11 border border-neutral-200 rounded-xl bg-neutral-50/50 px-3 text-xs text-neutral-800 font-medium focus:ring-2 focus:ring-neutral-200 focus:outline-none focus:border-neutral-300"
                >
                  <option value={2024}>2024</option>
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                  <option value={2027}>2027</option>
                  <option value={2028}>2028</option>
                </select>
              </div>
            </div>
          </div>

          <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-200/50 mt-4 flex items-start gap-2 text-[11px] leading-snug text-neutral-500 font-sans">
            <ShieldAlert className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-neutral-700">Sandbox Form Instruction:</span>
              <p className="mt-0.5">Click directly on any table row of the sheets below to override, delete, or insert custom punches for that day. Ideal for retrofitting missing punch-ins and lunch intervals.</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Sandbox & Testing Suite Panel (No-Print) */}
      <Card className="border border-neutral-100 shadow-xl shadow-neutral-200/40 rounded-3xl p-6 bg-white no-print">
        <div className="flex items-center gap-2 border-b border-neutral-100 pb-3 mb-5">
          <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold font-sans text-neutral-800 leading-none">DTR Interactive Test Suite</h3>
            <p className="text-[10px] text-neutral-400 font-sans mt-0.5">Quickly add simulated days, record individual mock punches, or manage logs on behalf of a selected employee.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sub-column 1: Quick Add Day */}
          <div className="space-y-4 border-r border-neutral-100 pr-0 lg:pr-6 pb-6 lg:pb-0">
            <h4 className="text-xs font-bold font-sans text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              1. Add Worked Day
            </h4>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sandbox-day" className="text-[11px] font-bold text-neutral-500 font-sans">Day of Month</Label>
                <select 
                  id="sandbox-day"
                  value={testDay}
                  onChange={(e) => setTestDay(Number(e.target.value))}
                  className="w-full h-10 border border-neutral-200 rounded-xl bg-neutral-50 px-3 text-xs focus:ring-2 focus:ring-neutral-200 focus:outline-none"
                >
                  {getDaysInMonthArray().map(d => (
                    <option key={d} value={d}>Day {d}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="sandbox-preset" className="text-[11px] font-bold text-neutral-500 font-sans">Time Preset</Label>
                <select 
                  id="sandbox-preset"
                  value={testPreset}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  className="w-full h-10 border border-neutral-200 rounded-xl bg-neutral-50 px-3 text-xs font-medium focus:ring-2 focus:ring-neutral-200 focus:outline-none"
                >
                  <option value="regular">Regular (8-12, 1-5)</option>
                  <option value="visiting_example">Visiting Example (8:00-11:00 AM)</option>
                  <option value="tardy">Tardy & Early (8:15-12, 1-4:30)</option>
                  <option value="custom">Custom Manual Entry</option>
                </select>
              </div>
            </div>

            {testPreset === 'custom' && (
              <div className="grid grid-cols-2 gap-2 pt-1 border border-neutral-100 p-2.5 rounded-2xl bg-neutral-50/50">
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-neutral-400 block">AM In</span>
                  <Input 
                    type="time" 
                    value={testAmIn} 
                    onChange={(e) => setTestAmIn(autoPmTime(e.target.value))} 
                    className="h-8 text-xs bg-white rounded-lg border-neutral-200" 
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-neutral-400 block">AM Out</span>
                  <Input 
                    type="time" 
                    value={testAmOut} 
                    onChange={(e) => setTestAmOut(autoPmTime(e.target.value))} 
                    className="h-8 text-xs bg-white rounded-lg border-neutral-200" 
                  />
                </div>
                <div className="space-y-1 mt-1.5">
                  <span className="text-[9px] font-bold text-neutral-400 block">PM In</span>
                  <Input 
                    type="time" 
                    value={testPmIn} 
                    onChange={(e) => setTestPmIn(autoPmTime(e.target.value))} 
                    className="h-8 text-xs bg-white rounded-lg border-neutral-200" 
                  />
                </div>
                <div className="space-y-1 mt-1.5">
                  <span className="text-[9px] font-bold text-neutral-400 block">PM Out</span>
                  <Input 
                    type="time" 
                    value={testPmOut} 
                    onChange={(e) => setTestPmOut(autoPmTime(e.target.value))} 
                    className="h-8 text-xs bg-white rounded-lg border-neutral-200" 
                  />
                </div>
              </div>
            )}

            <Button 
              onClick={handleQuickAddDay}
              disabled={isSandboxOperating}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold font-sans text-xs flex items-center justify-center gap-1.5 mt-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Configure day {testDay} ({testPreset})
            </Button>
          </div>

          {/* Sub-column 2: Mock Single Punch */}
          <div className="space-y-4 border-r border-neutral-100 pr-0 lg:pr-6 pb-6 lg:pb-0">
            <h4 className="text-xs font-bold font-sans text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              2. Single Punch Machine
            </h4>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="punch-day" className="text-[11px] font-bold text-neutral-500 font-sans">Day</Label>
                  <select 
                    id="punch-day"
                    value={singlePunchDay}
                    onChange={(e) => setSinglePunchDay(Number(e.target.value))}
                    className="w-full h-10 border border-neutral-200 rounded-xl bg-neutral-50 px-3 text-xs focus:ring-2 focus:ring-neutral-200 focus:outline-none"
                  >
                    {getDaysInMonthArray().map(d => (
                      <option key={d} value={d}>Day {d}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="punch-slot" className="text-[11px] font-bold text-neutral-500 font-sans">Timesheet Slot</Label>
                  <select 
                    id="punch-slot"
                    value={singlePunchType}
                    onChange={(e) => setSinglePunchType(e.target.value)}
                    className="w-full h-10 border border-neutral-200 rounded-xl bg-neutral-50 px-3 text-xs focus:ring-2 focus:ring-neutral-200 focus:outline-none"
                  >
                    <option value="amin">AM In (Morning Arrival)</option>
                    <option value="amout">AM Out (Lunch Break)</option>
                    <option value="pmin">PM In (Lunch Return)</option>
                    <option value="pmout">PM Out (Afternoon Departure)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="punch-time" className="text-[11px] font-bold text-neutral-500 font-sans">Punch Time</Label>
                <Input 
                  id="punch-time"
                  type="time"
                  value={singlePunchTime}
                  onChange={(e) => setSinglePunchTime(autoPmTime(e.target.value))}
                  className="h-10 text-xs bg-neutral-50 rounded-xl border-neutral-200"
                />
              </div>

              <Button 
                onClick={handleSingleMockPunch}
                disabled={isSandboxOperating}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold font-sans text-xs flex items-center justify-center gap-1.5 mt-2"
              >
                <Clock className="w-3.5 h-3.5" />
                Trigger Quick Punch to Slot
              </Button>
            </div>
          </div>

          {/* Sub-column 3: Direct Overrides */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold font-sans text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-800" />
              3. Day Actions & Edit
            </h4>

            <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-100 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-400">Target Day Selector</span>
                  <p className="text-xs font-semibold text-neutral-700 font-sans">Active Period Override</p>
                </div>
                <span className="text-2xl font-black text-neutral-400">Day {testDay}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-1">
                <Button 
                  onClick={() => handleOpenRowEdit(testDay)}
                  variant="outline"
                  className="h-10 rounded-xl border-neutral-200 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 font-semibold font-sans text-xs gap-1"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit Day
                </Button>
                <Button 
                  onClick={() => handleDeleteDayLogs(testDay)}
                  variant="outline"
                  className="h-10 rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-semibold font-sans text-xs gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Logs
                </Button>
              </div>
            </div>

            <div className="p-3 bg-yellow-50/50 rounded-2xl border border-yellow-100 text-[10.5px] text-yellow-800 font-medium leading-relaxed font-sans mt-3">
              💡 <span className="font-bold">Pro-tip for testing:</span> Select <span className="font-semibold">"Visiting Example"</span> on any Monday, configure it, and configure a Schedule for this instructor. The timesheet sheet below will automatically perform the custom schedule tracking calculations we programmed!
            </div>
          </div>
        </div>
      </Card>

      {/* Statistics Resume (No-Print) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 no-print sm:pb-2">
        <Card className="border border-neutral-100 shadow-md rounded-2xl bg-white p-4 flex items-center gap-4">
          <div className="p-3 bg-neutral-100 rounded-xl text-neutral-800">
            <Clock className="w-5 h-5 text-neutral-600" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-neutral-400 font-sans tracking-tight">1st-15th Scheduled Hours</span>
            <p className="text-xl font-bold text-neutral-800 font-sans mt-0.5">{getScheduledHoursForPeriod(1, 15)} Hours</p>
          </div>
        </Card>

        <Card className="border border-neutral-100 shadow-md rounded-2xl bg-white p-4 flex items-center gap-4">
          <div className="p-3 bg-neutral-100 rounded-xl text-neutral-800">
            <Clock className="w-5 h-5 text-neutral-600" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-neutral-400 font-sans tracking-tight">16th-End Scheduled Hours</span>
            <p className="text-xl font-bold text-neutral-800 font-sans mt-0.5">{getScheduledHoursForPeriod(16, 31)} Hours</p>
          </div>
        </Card>

        <Card className="border border-[#e2e8f0] shadow-md rounded-2xl bg-[#f8fafc] p-4 flex items-center gap-4">
          <div className="p-3 bg-neutral-900 rounded-xl text-white">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-neutral-500 font-sans tracking-tight">Total Monthly Scheduled</span>
            <p className="text-xl font-extrabold text-[#15803d] font-sans mt-0.5">{getScheduledHoursForPeriod(1, 31)} Hours</p>
          </div>
        </Card>
      </div>

      {/* Civil Service Commission Form No. 48 Print Setup Controls */}
      <Card className="no-print border border-neutral-200 shadow-md rounded-2xl p-5 bg-white space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-green-50 text-green-700 rounded-xl">
              <Printer className="w-5 h-5 text-green-700" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-neutral-800 leading-tight">Print Setup & Wording</h3>
              <p className="text-neutral-500 text-[11px] mt-0.5 font-medium">Configure Form 48 print layout and guidelines.</p>
            </div>
          </div>
          <Button 
            onClick={triggerPrint}
            className="bg-green-700 hover:bg-green-800 text-white gap-2 rounded-xl font-sans text-xs h-10 px-4 shadow-sm"
          >
            <Printer className="w-4 h-4" />
            Trigger Print Dialog
          </Button>
        </div>
        
        <div className="p-3 bg-neutral-50/80 border border-neutral-100 rounded-xl text-[10.5px] text-neutral-500 font-medium">
          💡 <span className="font-bold text-neutral-600">Pro-Tip:</span> For a perfect layout, set the print margins in your browser print dialog to <span className="font-bold text-neutral-700">None</span> or <span className="font-bold text-neutral-700">Default</span>, and ensure <span className="font-bold text-neutral-700">"Background graphics"</span> is checked.
        </div>
      </Card>

      {/* CIVIL SERVICE FORM 48 PRINT LAYOUT SHEET CONTAINER */}
      <div id="printable-dtr" className="bg-neutral-100/50 border border-neutral-200/50 p-4 lg:p-8 rounded-3xl shadow-inner bg-white flex flex-col items-center justify-center animate-in fade-in overflow-x-auto">
        <div className="flex flex-col gap-6 items-center w-full">
          {renderDtrSheet(1)}
        </div>
      </div>

      {/* MODAL 1: Row Click AM/PM Punch Editor */}
      <Dialog open={isRowEditOpen} onOpenChange={(open) => {
        setIsRowEditOpen(open);
        if (!open) {
          setIsAddingInlineSchedule(false);
        }
      }}>
        <DialogContent className="sm:max-w-[500px] w-full rounded-3xl no-print max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-bold font-sans">
              <div className="p-1.5 bg-green-50 text-green-700 rounded-lg">
                <Edit2 className="w-4 h-4" />
              </div>
              <span>Edit Punches — {editDate}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 font-sans">
            <div className="p-3 bg-yellow-50 text-yellow-800 text-[11px] rounded-xl border border-yellow-200">
              Editing will replace all active database attendance transactions for this employee on this date.
            </div>

            {/* Daily Class/Work Schedules */}
            <div className="border border-neutral-100 rounded-2xl p-4 bg-neutral-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                  <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-neutral-500">
                    {(selectedEmployee?.category === 'Regular Employee' || selectedEmployee?.category === 'FACULTY' || selectedEmployee?.category === 'STAFF') ? "Day's Work Schedules" : "Day's Class Schedules"}
                  </h4>
                </div>
                {selectedEmployee?.category === 'Visiting Instructor' && (
                  <Badge className="bg-green-100 text-green-800 text-[9px] uppercase font-bold px-1.5 py-0.5 border-none">
                    Visiting Instructor
                  </Badge>
                )}
              </div>

              {getSchedulesForEditDate().length === 0 ? (
                <div className="text-center py-4 bg-white border border-dashed border-neutral-200 rounded-xl">
                  <p className="text-xs text-neutral-400 font-semibold italic">
                    {(selectedEmployee?.category === 'Regular Employee' || selectedEmployee?.category === 'FACULTY' || selectedEmployee?.category === 'STAFF') ? 'No work schedules for this day.' : 'No classes scheduled for this day.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {getSchedulesForEditDate().map((sch: any) => (
                    <div key={sch.id} className="bg-white border border-neutral-100 p-2.5 rounded-xl text-xs flex items-center justify-between gap-2 shadow-sm">
                      <div className="flex-1 min-w-0 text-left">
                        <div className="font-bold text-neutral-900 truncate">{sch.subject}</div>
                        <div className="flex items-center gap-2 mt-0.5 text-neutral-500 font-mono text-[10.5px]">
                          <Clock className="w-3 h-3 text-neutral-400" />
                          <span>{formatTimeTo12Hour(sch.startTime)} - {formatTimeTo12Hour(sch.endTime)}</span>
                          {sch.room && (
                            <span className="text-neutral-400 font-bold border-l-2 pl-1.5 border-neutral-200">{sch.room}</span>
                          )}
                        </div>
                        {sch.specificDate && (
                          <span className="inline-block mt-1 text-[9px] font-bold bg-neutral-100 text-neutral-600 rounded px-1">Specific Date</span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Auto-populate AM/PM punches */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          title="Apply to form time inputs"
                          className="h-7 px-2 text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 rounded-lg flex items-center gap-1 text-[10px] font-bold"
                          onClick={() => {
                            const [sh] = sch.startTime.split(':').map(Number);
                            const isPmTime = sh >= 12;
                            if (!isPmTime) {
                              setEditPunches(prev => ({
                                ...prev,
                                amIn: formatTo24Char(sch.startTime),
                                amOut: formatTo24Char(sch.endTime)
                              }));
                            } else {
                              setEditPunches(prev => ({
                                ...prev,
                                pmIn: formatTo24Char(sch.startTime),
                                pmOut: formatTo24Char(sch.endTime)
                              }));
                            }
                            toast.success(`Copulated AM/PM punches for class hours: ${sch.startTime} - ${sch.endTime}`);
                          }}
                        >
                          <Sparkles className="w-3 h-3" />
                          Apply Time
                        </Button>
                        
                        {/* Delete schedule */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="Delete this class schedule"
                          className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg shrink-0"
                          onClick={async () => {
                            if (!confirm("Are you sure you want to delete this class schedule?")) return;
                            try {
                              const res = await fetch(`/api/schedules/${sch.id}`, { method: 'DELETE' });
                              const data = await res.json();
                              if (data.success) {
                                toast.success("Schedule deleted successfully");
                                fetchSchedulesForEmployee(selectedEmployeeId);
                                fetchLogs();
                              } else {
                                toast.error("Failed to delete schedule");
                              }
                            } catch (e) {
                              toast.error("Error deleting schedule");
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Inline Quick Add Schedule */}
              <div className="pt-2 border-t border-dashed border-neutral-200">
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  className="w-full text-neutral-600 h-8 flex items-center justify-center gap-1.5 text-xs bg-white border border-neutral-100 hover:border-neutral-200 rounded-xl"
                  onClick={() => setIsAddingInlineSchedule(!isAddingInlineSchedule)}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {isAddingInlineSchedule 
                    ? ((selectedEmployee?.category === 'Regular Employee' || selectedEmployee?.category === 'FACULTY' || selectedEmployee?.category === 'STAFF') ? "Cancel New Schedule" : "Cancel New Class Schedule") 
                    : ((selectedEmployee?.category === 'Regular Employee' || selectedEmployee?.category === 'FACULTY' || selectedEmployee?.category === 'STAFF') ? "Add Specific Work Schedule for this Day" : "Add Specific Class Schedule for this Day")}
                </Button>
                
                {isAddingInlineSchedule && (
                  <div className="mt-3 p-3 bg-white border border-neutral-100 rounded-xl space-y-3">
                    <div className="text-[10px] font-extrabold uppercase tracking-wide text-neutral-400 text-left">
                      {(selectedEmployee?.category === 'Regular Employee' || selectedEmployee?.category === 'FACULTY' || selectedEmployee?.category === 'STAFF') ? 'New Schedule' : 'New Class'} for {editDate}
                    </div>

                    {(selectedEmployee?.category === 'Regular Employee' || selectedEmployee?.category === 'FACULTY' || selectedEmployee?.category === 'STAFF') && (
                      <div className="flex gap-2 bg-emerald-50/50 p-2 rounded-lg border border-emerald-100 justify-between items-center text-left">
                        <span className="text-[10px] font-bold text-emerald-800">Presets:</span>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            className="text-[9px] h-6 px-2 border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-100 rounded-md font-medium"
                            onClick={() => setInlineSchedule({
                              startTime: '08:00',
                              endTime: '12:00',
                              subject: 'Core Hours',
                              room: 'Office'
                            })}
                          >
                            Morning (08:00-12:00 PM)
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="text-[9px] h-6 px-2 border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-100 rounded-md font-medium"
                            onClick={() => setInlineSchedule({
                              startTime: '01:00',
                              endTime: '05:00',
                              subject: 'Core Hours',
                              room: 'Office'
                            })}
                          >
                            Afternoon (01:00-05:00 PM)
                          </Button>
                        </div>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-2 text-left">
                      <div className="space-y-1">
                        <Label htmlFor="inline-start" className="text-[10px] font-semibold text-neutral-500">Start Time</Label>
                        <Input 
                          id="inline-start" 
                          type="time" 
                          className="h-8 rounded-lg text-xs" 
                          value={inlineSchedule.startTime}
                          onChange={e => setInlineSchedule({...inlineSchedule, startTime: autoPmTime(e.target.value)})}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="inline-end" className="text-[10px] font-semibold text-neutral-500">End Time</Label>
                        <Input 
                          id="inline-end" 
                          type="time" 
                          className="h-8 rounded-lg text-xs" 
                          value={inlineSchedule.endTime}
                          onChange={e => setInlineSchedule({...inlineSchedule, endTime: autoPmTime(e.target.value)})}
                        />
                      </div>
                    </div>

                    <div className="space-y-1 text-left">
                      <Label htmlFor="inline-subject" className="text-[10px] font-semibold text-neutral-500">
                        {(selectedEmployee?.category === 'Regular Employee' || selectedEmployee?.category === 'FACULTY' || selectedEmployee?.category === 'STAFF') ? 'Regular Type' : 'Subject / Class Name'}
                      </Label>
                      <Input 
                        id="inline-subject" 
                        placeholder={(selectedEmployee?.category === 'Regular Employee' || selectedEmployee?.category === 'FACULTY' || selectedEmployee?.category === 'STAFF') ? 'e.g. Core Hours' : 'e.g. IT 101 - Intro'} 
                        className="h-8 rounded-lg text-xs" 
                        value={inlineSchedule.subject}
                        onChange={e => setInlineSchedule({...inlineSchedule, subject: e.target.value})}
                      />
                    </div>

                    <div className="space-y-1 text-left">
                      <Label htmlFor="inline-room" className="text-[10px] font-semibold text-neutral-500">Room</Label>
                      <Input 
                        id="inline-room" 
                        placeholder="e.g. Lab 4 (Optional)" 
                        className="h-8 rounded-lg text-xs" 
                        value={inlineSchedule.room}
                        onChange={e => setInlineSchedule({...inlineSchedule, room: e.target.value})}
                      />
                    </div>

                    <Button 
                      type="button" 
                      size="sm"
                      className="w-full h-8 text-xs bg-neutral-900 text-white rounded-lg font-bold"
                      onClick={handleCreateInlineSchedule}
                    >
                      Create & Calculate
                    </Button>
                  </div>
                )}
              </div>
            </div>
            
            <div className="border border-neutral-100 rounded-2xl p-4 bg-neutral-50/50 space-y-3">
              <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-neutral-400 mb-1">AM Session (Morning)</h4>
              <div className="grid grid-cols-2 gap-3 pb-1">
                <div className="space-y-1">
                  <Label htmlFor="am-in" className="text-[10.5px] font-semibold text-neutral-600">AM Clock In (Arrival)</Label>
                  <Input 
                    id="am-in" 
                    type="time" 
                    className="h-10 rounded-xl"
                    value={editPunches.amIn}
                    onChange={(e) => setEditPunches({...editPunches, amIn: autoPmTime(e.target.value)})}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="am-out" className="text-[10.5px] font-semibold text-neutral-600">AM Clock Out (Lunch)</Label>
                  <Input 
                    id="am-out" 
                    type="time" 
                    className="h-10 rounded-xl"
                    value={editPunches.amOut}
                    onChange={(e) => setEditPunches({...editPunches, amOut: autoPmTime(e.target.value)})}
                  />
                </div>
              </div>
            </div>

            <div className="border border-neutral-100 rounded-2xl p-4 bg-neutral-50/50 space-y-3">
              <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-neutral-400 mb-1">PM Session (Afternoon)</h4>
              <div className="grid grid-cols-2 gap-3 pb-1">
                <div className="space-y-1">
                  <Label htmlFor="pm-in" className="text-[10.5px] font-semibold text-neutral-600">PM Clock In (Return)</Label>
                  <Input 
                    id="pm-in" 
                    type="time" 
                    className="h-10 rounded-xl"
                    value={editPunches.pmIn}
                    onChange={(e) => setEditPunches({...editPunches, pmIn: autoPmTime(e.target.value)})}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pm-out" className="text-[10.5px] font-semibold text-neutral-600">PM Clock Out (Departure)</Label>
                  <Input 
                    id="pm-out" 
                    type="time" 
                    className="h-10 rounded-xl"
                    value={editPunches.pmOut}
                    onChange={(e) => setEditPunches({...editPunches, pmOut: autoPmTime(e.target.value)})}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="row-notes" className="text-xs font-semibold text-neutral-600">Daily Remarks / Notes</Label>
              <Input 
                id="row-notes" 
                placeholder="Overtime, Off-site, official travel, etc." 
                className="h-10 rounded-xl"
                value={editPunches.notes}
                onChange={(e) => setEditPunches({...editPunches, notes: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter className="no-print flex flex-col sm:flex-row justify-between items-center w-full gap-2">
            <div className="w-full sm:w-auto text-left">
              {editingDayLogs.length > 0 && (
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => {
                    const parts = editDate.split('-');
                    const dayNum = Number(parts[2]);
                    handleDeleteDayLogs(dayNum);
                    setIsRowEditOpen(false);
                  }} 
                  className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 w-full sm:w-auto text-xs font-semibold h-10 gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Day's Punches
                </Button>
              )}
            </div>
            <div className="flex gap-2 w-full sm:w-auto justify-end">
              <Button type="button" variant="ghost" onClick={() => setIsRowEditOpen(false)} className="rounded-xl h-10 text-xs font-semibold">
                Cancel
              </Button>
              <Button type="button" onClick={handleSaveDayPunches} className="bg-neutral-900 text-white rounded-xl h-10 text-xs font-semibold">
                Confirm Override
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: General Admin Add Entry Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-3xl no-print">
          <DialogHeader>
            <DialogTitle className="font-bold font-sans">Add Custom DTR punch</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleManualSubmit} className="space-y-4 py-3 font-sans">
            <div className="space-y-1">
              <Label htmlFor="employee" className="text-xs font-semibold text-neutral-600">Select Target staff member</Label>
              <select 
                id="employee"
                className="w-full h-11 bg-neutral-100 rounded-xl px-3 text-xs font-medium focus:ring-2 focus:ring-neutral-200 focus:outline-none focus:border-neutral-300"
                value={newEntry.employeeId || selectedEmployeeId}
                onChange={(e) => {
                  const empId = e.target.value;
                  const emp = employees.find(emp => emp.id === empId);
                  if (emp && (emp.category === 'Regular Employee' || emp.category === 'FACULTY' || emp.category === 'STAFF')) {
                    setNewEntry(prev => ({
                      ...prev,
                      employeeId: empId,
                      timeIn: '08:00',
                      timeOut: '17:00'
                    }));
                  } else {
                    setNewEntry(prev => ({
                      ...prev,
                      employeeId: empId
                    }));
                  }
                }}
                required
              >
                <option value="">Select Employee</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.lastName}, {emp.firstName} ({emp.employeeId})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="date" className="text-xs font-semibold text-neutral-600">Specific Date</Label>
                <Input 
                  id="date" 
                  type="date" 
                  className="rounded-xl h-11"
                  value={newEntry.date}
                  onChange={(e) => setNewEntry({...newEntry, date: e.target.value})}
                  required 
                />
              </div>
            </div>

            {(() => {
              const activeEmpId = newEntry.employeeId || selectedEmployeeId;
              const activeEmp = employees.find(emp => emp.id === activeEmpId);
              if (activeEmp && (activeEmp.category === 'Regular Employee' || activeEmp.category === 'FACULTY' || activeEmp.category === 'STAFF')) {
                return (
                  <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-2 text-left">
                    <p className="text-xs text-emerald-800 font-bold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-emerald-600" />
                      Faculty / Staff DTR Presets
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        className="text-[9.5px] p-1 h-8 border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-100 rounded-lg font-medium leading-none whitespace-normal text-center"
                        onClick={() => setNewEntry(prev => ({
                          ...prev,
                          timeIn: '08:00',
                          timeOut: '12:00'
                        }))}
                      >
                        Morning (8-12 PM)
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="text-[9.5px] p-1 h-8 border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-100 rounded-lg font-medium leading-none whitespace-normal text-center"
                        onClick={() => setNewEntry(prev => ({
                          ...prev,
                          timeIn: '13:00',
                          timeOut: '17:00'
                        }))}
                      >
                        Afternoon (1-5 PM)
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="text-[9.5px] p-1 h-8 border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-100 rounded-lg font-medium leading-none whitespace-normal text-center"
                        onClick={() => setNewEntry(prev => ({
                          ...prev,
                          timeIn: '08:00',
                          timeOut: '17:00'
                        }))}
                      >
                        Full Day (8 AM - 5 PM)
                      </Button>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="timeIn" className="text-xs font-semibold text-neutral-600">Time Arrival</Label>
                <Input 
                  id="timeIn" 
                  type="time" 
                  className="rounded-xl h-11"
                  value={newEntry.timeIn}
                  onChange={(e) => setNewEntry({...newEntry, timeIn: autoPmTime(e.target.value)})}
                  required 
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="timeOut" className="text-xs font-semibold text-neutral-600">Time Departure</Label>
                <Input 
                  id="timeOut" 
                  type="time" 
                  className="rounded-xl h-11"
                  value={newEntry.timeOut}
                  onChange={(e) => setNewEntry({...newEntry, timeOut: autoPmTime(e.target.value)})}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes" className="text-xs font-semibold text-neutral-600">Log Remarks</Label>
                <Input 
                  id="notes" 
                  placeholder="Optional log desc" 
                  className="rounded-xl h-11"
                  value={newEntry.notes}
                  onChange={(e) => setNewEntry({...newEntry, notes: e.target.value})}
                />
              </div>
            </div>
            <DialogFooter className="pt-4 no-print">
              <Button type="button" variant="ghost" onClick={() => setIsAddDialogOpen(false)} className="rounded-xl">
                Discard
              </Button>
              <Button type="submit" className="bg-neutral-900 text-white rounded-xl">
                Insert Punch Record
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DTR;
