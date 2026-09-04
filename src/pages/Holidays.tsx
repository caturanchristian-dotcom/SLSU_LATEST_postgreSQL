import React, { useEffect, useState, useMemo } from 'react';
import { useRealtime } from '../hooks/useRealtime';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  Calendar,
  AlertTriangle,
  Tag,
  ChevronLeft,
  ChevronRight,
  Info,
  CalendarDays,
  Sparkles,
  List,
  Clock,
  CheckCircle2,
  Bookmark,
  FileText
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAuth } from '../components/AuthProvider';

export interface Holiday {
  id: string;
  name: string;
  date: string;
  type: string;
  description?: string;
  category?: string;
  createdAt?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const AVAILABLE_YEARS = [2024, 2025, 2026, 2027, 2028];

const HolidaysPage = () => {
  const { role } = useAuth();
  const canManage = role === 'admin' || role === 'payroll_officer';

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [yearFilter, setYearFilter] = useState<string>('2026');
  const [loading, setLoading] = useState(true);
  
  // View Toggle: 'calendar' (interactive grid) or 'list' (classic table)
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  
  // Interactive Calendar state
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [selectedDayInfo, setSelectedDayInfo] = useState<{ date: Date; holidays: Holiday[] } | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  
  const [holidayForm, setHolidayForm] = useState({
    name: '',
    date: '',
    type: 'Regular',
    description: '',
    category: 'National'
  });

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [holidayToDelete, setHolidayToDelete] = useState<Holiday | null>(null);

  useEffect(() => {
    fetchHolidays();
  }, []);

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/holidays');
      if (!res.ok) throw new Error('Failed to fetch holidays');
      const data = await res.json();
      if (Array.isArray(data)) {
        // Guarantee unique holidays by date and normalized name
        const seen = new Set<string>();
        const uniqueHolidays = data.filter((h: Holiday) => {
          const dateStr = h.date ? h.date.split('T')[0] : '';
          const key = `${dateStr}::${(h.name || '').trim().toLowerCase()}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setHolidays(uniqueHolidays);
      } else {
        setHolidays([]);
      }
    } catch (err: any) {
      toast.error('Failed to load holidays');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useRealtime('holidays_changed', fetchHolidays);

  const handleOpenAdd = () => {
    setEditingHoliday(null);
    setHolidayForm({
      name: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      type: 'Regular',
      description: '',
      category: 'National'
    });
    setIsDialogOpen(true);
  };

  const handleOpenAddForDate = (date: Date) => {
    setEditingHoliday(null);
    setHolidayForm({
      name: '',
      date: format(date, 'yyyy-MM-dd'),
      type: 'Regular',
      description: '',
      category: 'National'
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    const cleanDate = holiday.date ? holiday.date.split('T')[0] : '';
    setHolidayForm({
      name: holiday.name,
      date: cleanDate,
      type: holiday.type || 'Regular',
      description: holiday.description || '',
      category: holiday.category || 'National'
    });
    setIsDialogOpen(true);
  };

  const handleOpenDelete = (holiday: Holiday) => {
    setHolidayToDelete(holiday);
    setIsDeleteOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayForm.name.trim() || !holidayForm.date) {
      toast.error('Holiday name and date are required');
      return;
    }

    try {
      const url = editingHoliday ? `/api/holidays/${editingHoliday.id}` : '/api/holidays';
      const method = editingHoliday ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(holidayForm)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save holiday');
      }

      toast.success(editingHoliday ? 'Holiday updated successfully' : 'Holiday added successfully');
      setIsDialogOpen(false);
      fetchHolidays();
    } catch (err: any) {
      toast.error(err.message || 'Error occurred while saving');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!holidayToDelete) return;
    try {
      const res = await fetch(`/api/holidays/${holidayToDelete.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete holiday');
      
      toast.success('Holiday deleted successfully');
      setIsDeleteOpen(false);
      setHolidayToDelete(null);
      setSelectedDayInfo(null);
      fetchHolidays();
    } catch (err: any) {
      toast.error('Failed to delete holiday');
    }
  };

  // Helper: compare dateObj to YYYY-MM-DD safely without timezone shifts
  const isSameLocalDate = (dateObj: Date, holidayDateStr: string) => {
    if (!holidayDateStr) return false;
    const clean = holidayDateStr.split('T')[0];
    const parts = clean.split('-');
    if (parts.length !== 3) return false;
    const hYear = parseInt(parts[0], 10);
    const hMonth = parseInt(parts[1], 10) - 1; // 0-indexed month
    const hDay = parseInt(parts[2], 10);
    
    return dateObj.getFullYear() === hYear &&
           dateObj.getMonth() === hMonth &&
           dateObj.getDate() === hDay;
  };

  const isTodayDate = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  // Helper: format YYYY-MM-DD string to date safely without timezone shift
  const formatHolidayDate = (dateStr: string, formatStr: string) => {
    if (!dateStr) return '---';
    try {
      const clean = dateStr.split('T')[0];
      const parts = clean.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return format(d, formatStr);
      }
      return format(new Date(dateStr), formatStr);
    } catch {
      return dateStr;
    }
  };

  // Filter & sort chronologically for directory / list
  const filteredHolidays = useMemo(() => {
    return holidays.filter(hol => {
      const cleanDate = hol.date ? hol.date.split('T')[0] : '';
      const matchesSearch = hol.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            cleanDate.includes(searchTerm) ||
                            (hol.description && hol.description.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesType = filterType === 'all' || hol.type === filterType;
      const matchesYear = yearFilter === 'all' || cleanDate.startsWith(yearFilter);
      return matchesSearch && matchesType && matchesYear;
    }).sort((a, b) => {
      const dateA = a.date ? a.date.split('T')[0] : '';
      const dateB = b.date ? b.date.split('T')[0] : '';
      return dateA.localeCompare(dateB);
    });
  }, [holidays, searchTerm, filterType, yearFilter]);

  // Generate calendar grid array
  const getCalendarDays = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const startOfWeekDay = firstDay.getDay(); // 0 is Sunday
    
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const totalDaysInPrevMonth = new Date(year, month, 0).getDate();
    
    const daysList = [];
    
    // Previous month filler days
    for (let i = startOfWeekDay - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, totalDaysInPrevMonth - i);
      const dayHols = holidays.filter(h => isSameLocalDate(d, h.date));
      daysList.push({
        date: d,
        isCurrentMonth: false,
        holidays: dayHols,
        holiday: dayHols[0]
      });
    }
    
    // Current month days
    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dObj = new Date(year, month, d);
      const dayHols = holidays.filter(h => isSameLocalDate(dObj, h.date));
      daysList.push({
        date: dObj,
        isCurrentMonth: true,
        holidays: dayHols,
        holiday: dayHols[0]
      });
    }
    
    // Next month filler days (makes standard 35 or 42 grid blocks)
    const totalCells = daysList.length > 35 ? 42 : 35;
    const remainingCells = totalCells - daysList.length;
    for (let d = 1; d <= remainingCells; d++) {
      const dObj = new Date(year, month + 1, d);
      const dayHols = holidays.filter(h => isSameLocalDate(dObj, h.date));
      daysList.push({
        date: dObj,
        isCurrentMonth: false,
        holidays: dayHols,
        holiday: dayHols[0]
      });
    }
    
    return daysList;
  };

  const handlePrevMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
    setSelectedDayInfo(null);
  };

  const handleNextMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
    setSelectedDayInfo(null);
  };

  const handleGoToday = () => {
    const today = new Date();
    setCalendarDate(today);
    const dayHols = holidays.filter(h => isSameLocalDate(today, h.date));
    setSelectedDayInfo({ date: today, holidays: dayHols });
  };

  const handleMonthChange = (monthIdxStr: string | null) => {
    if (monthIdxStr === null) return;
    const monthIdx = parseInt(monthIdxStr, 10);
    setCalendarDate(new Date(calendarDate.getFullYear(), monthIdx, 1));
    setSelectedDayInfo(null);
  };

  const handleYearChange = (yearStr: string | null) => {
    if (yearStr === null) return;
    const year = parseInt(yearStr, 10);
    setCalendarDate(new Date(year, calendarDate.getMonth(), 1));
    setSelectedDayInfo(null);
  };

  const calendarDays = getCalendarDays();
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Current Month Holiday Count
  const currentMonthEventsCount = calendarDays.filter(d => d.isCurrentMonth && d.holidays.length > 0).length;

  return (
    <div className="space-y-6" id="holidays-dashboard-container">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 shadow-xs">
              <CalendarDays className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900 font-sans flex items-center gap-2">
                Calendar & Holidays
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] font-semibold py-0.5">
                  Official Real Calendar
                </Badge>
              </h1>
              <p className="text-xs text-neutral-500 font-sans mt-0.5">
                Official statutory Philippine public holidays and university events. Synchronized with real-time DTR attendance and payroll calculations.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Switcher */}
          <div className="bg-neutral-100 p-0.5 rounded-xl border border-neutral-200 flex items-center shrink-0">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setViewMode('calendar')}
              className={`h-8 px-3 rounded-lg text-xs font-semibold gap-1.5 transition-all ${viewMode === 'calendar' ? 'bg-white shadow-xs text-neutral-900' : 'text-neutral-500 hover:text-neutral-900'}`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Calendar View
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setViewMode('list')}
              className={`h-8 px-3 rounded-lg text-xs font-semibold gap-1.5 transition-all ${viewMode === 'list' ? 'bg-white shadow-xs text-neutral-900' : 'text-neutral-500 hover:text-neutral-900'}`}
            >
              <List className="w-3.5 h-3.5" />
              List View
            </Button>
          </div>

          {canManage && (
            <Button onClick={handleOpenAdd} className="h-9 gap-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl shadow-xs text-xs font-semibold" id="btn-add-holiday">
              <Plus className="w-4 h-4" />
              Add Holiday
            </Button>
          )}
        </div>
      </div>

      {/* Main Grid: Adapts based on viewMode */}
      {viewMode === 'calendar' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="holidays-interactive-grid">
          {/* LEFT: Calendar card (lg:col-span-8) */}
          <div className="lg:col-span-8 space-y-6">
            <Card className="border-neutral-200/80 shadow-sm rounded-2xl overflow-hidden bg-white">
              {/* Calendar Header with Year & Month Selection */}
              <div className="bg-neutral-50/50 border-b border-neutral-100 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Month Dropdown */}
                  <Select 
                    value={calendarDate.getMonth().toString()} 
                    onValueChange={handleMonthChange}
                  >
                    <SelectTrigger className="w-36 h-9 rounded-xl border-neutral-200 bg-white font-bold text-sm text-neutral-900">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_NAMES.map((m, idx) => (
                        <SelectItem key={m} value={idx.toString()}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Year Dropdown */}
                  <Select 
                    value={calendarDate.getFullYear().toString()} 
                    onValueChange={handleYearChange}
                  >
                    <SelectTrigger className="w-24 h-9 rounded-xl border-neutral-200 bg-white font-bold text-sm text-neutral-900 font-mono">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_YEARS.map(y => (
                        <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Badge variant="outline" className="bg-rose-50 border-rose-200 text-rose-700 rounded-md font-mono text-[11px] font-bold py-0.5 px-2">
                    {currentMonthEventsCount} {currentMonthEventsCount === 1 ? 'Holiday' : 'Holidays'}
                  </Badge>
                </div>

                {/* Nav Buttons */}
                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleGoToday}
                    className="h-8 px-3 text-xs font-semibold rounded-lg border-neutral-200 hover:bg-neutral-50 text-neutral-700 shadow-xs"
                  >
                    Today
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handlePrevMonth}
                    className="h-8 w-8 rounded-lg border-neutral-200 hover:bg-neutral-50"
                    title="Previous Month"
                  >
                    <ChevronLeft className="w-4 h-4 text-neutral-600" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleNextMonth}
                    className="h-8 w-8 rounded-lg border-neutral-200 hover:bg-neutral-50"
                    title="Next Month"
                  >
                    <ChevronRight className="w-4 h-4 text-neutral-600" />
                  </Button>
                </div>
              </div>

              {/* Weekdays header */}
              <div className="grid grid-cols-7 border-b border-neutral-100 bg-neutral-50/50 text-center py-2 text-xs font-bold text-neutral-500 uppercase tracking-wider font-sans">
                {weekDays.map(day => (
                  <div key={day} className={day === 'Sun' || day === 'Sat' ? 'text-rose-500 font-extrabold' : ''}>
                    {day}
                  </div>
                ))}
              </div>

              {/* Day cells grid */}
              <CardContent className="p-2 sm:p-3">
                <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                  {calendarDays.map((cell, idx) => {
                    const isToday = isTodayDate(cell.date);
                    const hasHoliday = cell.holidays && cell.holidays.length > 0;
                    const primaryHoliday = cell.holidays[0];
                    const isSelected = selectedDayInfo && isSameLocalDate(cell.date, format(selectedDayInfo.date, 'yyyy-MM-dd'));
                    
                    // Style helpers
                    let bgStyle = 'bg-white hover:bg-neutral-50/80 border-neutral-150';
                    let textStyle = cell.isCurrentMonth ? 'text-neutral-800 font-semibold' : 'text-neutral-300 font-normal';
                    
                    if (hasHoliday) {
                      const isRegular = cell.holidays.some(h => h.type === 'Regular');
                      if (isRegular) {
                        bgStyle = 'bg-rose-50/90 hover:bg-rose-100/90 border-rose-200 text-rose-950 shadow-xs';
                      } else {
                        bgStyle = 'bg-amber-50/90 hover:bg-amber-100/90 border-amber-200 text-amber-950 shadow-xs';
                      }
                    } else if (isToday) {
                      bgStyle = 'bg-blue-50/50 hover:bg-blue-100/60 border-blue-200 text-blue-950 ring-2 ring-blue-200';
                    }

                    if (isSelected) {
                      bgStyle += ' ring-2 ring-neutral-900 border-neutral-900';
                    }

                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedDayInfo({ date: cell.date, holidays: cell.holidays })}
                        className={`min-h-[80px] sm:min-h-[105px] p-1.5 sm:p-2 border rounded-xl flex flex-col justify-between transition-all duration-150 cursor-pointer select-none group relative ${bgStyle}`}
                      >
                        {/* Day indicator & badge */}
                        <div className="flex justify-between items-center">
                          <span className={`text-xs sm:text-sm font-mono ${textStyle} ${isToday ? 'h-5 w-5 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold font-sans shadow-xs' : ''}`}>
                            {cell.date.getDate()}
                          </span>
                          
                          {/* Holiday marker pin / counter */}
                          {hasHoliday && (
                            <div className="flex items-center gap-1">
                              {cell.holidays.length > 1 && (
                                <span className="text-[9px] font-bold font-mono px-1 rounded bg-neutral-900 text-white leading-none py-0.5">
                                  +{cell.holidays.length}
                                </span>
                              )}
                              <span className={`w-2 h-2 rounded-full ${primaryHoliday.type === 'Regular' ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-amber-500 ring-2 ring-amber-200'}`}></span>
                            </div>
                          )}
                        </div>

                        {/* Holiday Label inside cell */}
                        {hasHoliday ? (
                          <div className="mt-1 space-y-0.5">
                            {cell.holidays.slice(0, 2).map((h, hIdx) => {
                              const isRegular = h.type === 'Regular';
                              return (
                                <div key={hIdx} className="leading-tight">
                                  <p className="text-[10px] sm:text-[11px] leading-snug font-bold tracking-tight line-clamp-2 font-sans">
                                    {h.name}
                                  </p>
                                  <span className={`hidden sm:inline-block text-[8px] font-extrabold uppercase tracking-wider px-1 py-0.2 rounded mt-0.5 ${isRegular ? 'bg-rose-200/70 text-rose-800' : 'bg-amber-200/70 text-amber-800'}`}>
                                    {isRegular ? 'Regular' : 'Special'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          /* Quick "+ Add" button on hover for authorized users */
                          canManage && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenAddForDate(cell.date);
                              }}
                              className="text-[9px] font-bold text-neutral-400 group-hover:text-neutral-900 hover:bg-neutral-200/60 px-1.5 py-0.5 rounded-md self-start opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 font-sans"
                            >
                              <Plus className="w-2.5 h-2.5" />
                              Add
                            </button>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>

              {/* Legend & Summary */}
              <div className="bg-neutral-50/50 border-t border-neutral-100 p-4 flex flex-wrap gap-4 items-center justify-between text-xs font-sans text-neutral-600">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-rose-100 border border-rose-300 inline-block"></span>
                    <span className="font-semibold text-neutral-800">Regular Holiday (100% / 200%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300 inline-block"></span>
                    <span className="font-semibold text-neutral-800">Special Non-Working (+30%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-blue-100 border border-blue-300 inline-block"></span>
                    <span className="font-semibold text-neutral-800">Today</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-neutral-400">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>Click any date to inspect legal basis or schedule events.</span>
                </div>
              </div>
            </Card>

            {/* Selected Day Info details panel */}
            {selectedDayInfo && (
              <Card className="border-neutral-200/80 shadow-md rounded-2xl bg-white border-l-4 border-l-neutral-900 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <CardContent className="p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-3">
                    <div>
                      <div className="text-[10px] font-bold tracking-widest text-neutral-400 uppercase font-sans">
                        Calendar Date Inspector
                      </div>
                      <h3 className="text-lg font-bold text-neutral-900 font-sans tracking-tight">
                        {format(selectedDayInfo.date, 'EEEE, MMMM d, yyyy')}
                      </h3>
                    </div>

                    {canManage && (
                      <Button 
                        size="sm" 
                        onClick={() => handleOpenAddForDate(selectedDayInfo.date)}
                        className="h-8 px-3.5 bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 gap-1.5 text-xs font-semibold self-start sm:self-auto"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Event For This Day
                      </Button>
                    )}
                  </div>

                  {selectedDayInfo.holidays.length > 0 ? (
                    <div className="space-y-3">
                      {selectedDayInfo.holidays.map((h) => {
                        const isRegular = h.type === 'Regular';
                        return (
                          <div key={h.id} className="p-4 rounded-xl border border-neutral-150 bg-neutral-50/50 flex flex-col md:flex-row md:items-start justify-between gap-3">
                            <div className="space-y-1.5 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-base font-bold text-neutral-900 font-sans">
                                  {h.name}
                                </span>
                                <Badge 
                                  variant="outline" 
                                  className={
                                    isRegular
                                      ? 'bg-rose-50 border-rose-200 text-rose-700 font-bold rounded-md text-xs'
                                      : 'bg-amber-50 border-amber-200 text-amber-700 font-bold rounded-md text-xs'
                                  }
                                >
                                  {h.type}
                                </Badge>
                                {h.category && (
                                  <Badge variant="outline" className="bg-neutral-100 text-neutral-600 border-neutral-200 text-[10px] font-semibold">
                                    {h.category}
                                  </Badge>
                                )}
                              </div>

                              <p className="text-xs text-neutral-600 font-sans leading-relaxed">
                                {h.description || (isRegular 
                                  ? 'Nationwide statutory regular holiday. Employees receive 100% basic salary if unworked; 200% rate if required to report on duty.' 
                                  : 'Special non-working day. Specific 130% premium applies when worked pursuant to labor advisories.')}
                              </p>

                              <div className="flex items-center gap-3 text-[11px] text-neutral-500 font-sans">
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  Timesheet Auto-Calculated
                                </span>
                                <span>•</span>
                                <span className="font-mono text-neutral-400">
                                  ID: {h.id}
                                </span>
                              </div>
                            </div>

                            {canManage && (
                              <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => handleOpenEdit(h)}
                                  className="h-8 px-3 rounded-xl border-neutral-200 text-neutral-700 hover:bg-neutral-100 gap-1 text-xs"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  Edit
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => handleOpenDelete(h)}
                                  className="h-8 px-3 rounded-xl border-red-100 text-red-600 hover:bg-red-50 hover:border-red-200 gap-1 text-xs"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Delete
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-6 text-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50/30">
                      <Calendar className="w-8 h-8 text-neutral-300 mx-auto mb-2 stroke-[1.5]" />
                      <p className="text-sm font-bold text-neutral-700 font-sans">Regular Academic / Working Day</p>
                      <p className="text-xs text-neutral-400 font-sans mt-0.5">
                        No public holidays or class suspensions scheduled for this calendar date.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* RIGHT: Tear-off Calendar & Directory (lg:col-span-4) */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="border-neutral-200/80 shadow-sm rounded-2xl overflow-hidden bg-white">
              <CardHeader className="bg-neutral-50/50 border-b border-neutral-100 p-4 sm:p-5">
                <CardTitle className="text-base font-bold font-sans tracking-tight">Holiday Directory</CardTitle>
                <CardDescription className="text-xs font-sans">
                  Browse and search statutory holidays on the official real calendar.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-4 sm:p-5 space-y-4">
                {/* Search & Filter Widgets inside Sidebar */}
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                    <Input
                      placeholder="Search holiday name or date..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 rounded-xl border-neutral-200 bg-neutral-50/50 text-xs"
                      id="holiday-search-sidebar"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Select 
                      value={yearFilter} 
                      onValueChange={(val: string | null) => {
                        if (val) setYearFilter(val);
                      }}
                    >
                      <SelectTrigger className="rounded-xl border-neutral-200 bg-neutral-50/50 text-xs">
                        <SelectValue placeholder="Year" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Years</SelectItem>
                        <SelectItem value="2026">2026 (Active)</SelectItem>
                        <SelectItem value="2025">2025</SelectItem>
                        <SelectItem value="2027">2027</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select 
                      value={filterType} 
                      onValueChange={(val: string | null) => {
                        if (val) setFilterType(val);
                      }}
                    >
                      <SelectTrigger className="rounded-xl border-neutral-200 bg-neutral-50/50 text-xs" id="holiday-type-sidebar">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="Regular">Regular</SelectItem>
                        <SelectItem value="Special Non-Working">Special</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="border-t border-neutral-100 pt-4">
                  <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 font-sans flex items-center justify-between">
                    <span>Scheduled Holidays</span>
                    <span className="font-mono text-[10px] text-neutral-500 font-semibold bg-neutral-100 px-2 py-0.5 rounded-full">
                      {filteredHolidays.length}
                    </span>
                  </h3>

                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-8 space-y-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-neutral-900"></div>
                      <p className="text-xs text-neutral-400 font-sans">Loading holidays...</p>
                    </div>
                  ) : filteredHolidays.length === 0 ? (
                    <div className="text-center py-10 border border-dashed border-neutral-150 rounded-2xl bg-neutral-50/20">
                      <Calendar className="w-8 h-8 text-neutral-300 stroke-[1.5] mx-auto mb-1.5" />
                      <p className="text-xs text-neutral-600 font-bold font-sans">No matching holidays found</p>
                      <p className="text-[10px] text-neutral-400 font-sans">Try adjusting search term or year filter.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                      {filteredHolidays.map((holiday) => {
                        const dayName = holiday.date ? formatHolidayDate(holiday.date, 'EEEE') : '---';
                        const monthName = holiday.date ? formatHolidayDate(holiday.date, 'MMM') : '---';
                        const dayNum = holiday.date ? formatHolidayDate(holiday.date, 'd') : '--';
                        const isRegular = holiday.type === 'Regular';

                        return (
                          <div 
                            key={holiday.id} 
                            onClick={() => {
                              const cleanDate = holiday.date.split('T')[0];
                              const parts = cleanDate.split('-');
                              if (parts.length === 3) {
                                const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                                setCalendarDate(d);
                                setSelectedDayInfo({ date: d, holidays: [holiday] });
                              }
                            }}
                            className="flex items-center justify-between p-2.5 bg-white hover:bg-neutral-50/80 border border-neutral-150 rounded-2xl transition-all shadow-xs group cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {/* Tear-Off Calendar badge */}
                              <div className="w-11 h-11 rounded-xl border border-neutral-200 overflow-hidden flex flex-col items-center justify-center shrink-0 shadow-xs">
                                <div className={`w-full text-[8px] font-extrabold text-center text-white py-0.5 uppercase tracking-widest ${isRegular ? 'bg-rose-600' : 'bg-amber-600'}`}>
                                  {monthName}
                                </div>
                                <div className={`text-sm font-extrabold leading-none py-1 font-mono ${isRegular ? 'text-rose-900 bg-rose-50/50' : 'text-amber-900 bg-amber-50/50'} w-full text-center`}>
                                  {dayNum}
                                </div>
                              </div>

                              <div className="space-y-0.5 min-w-0">
                                <h4 className="text-xs font-bold text-neutral-800 font-sans leading-snug tracking-tight group-hover:text-neutral-950 truncate">
                                  {holiday.name}
                                </h4>
                                <div className="flex items-center gap-1.5 text-[10px]">
                                  <span className="font-medium text-neutral-400 font-mono">
                                    {dayName}
                                  </span>
                                  <span className="text-neutral-300">•</span>
                                  <span className={`font-extrabold uppercase text-[9px] ${isRegular ? 'text-rose-600' : 'text-amber-600'}`}>
                                    {isRegular ? 'Regular' : 'Special'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Actions on hover */}
                            {canManage && (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-7 w-7 p-0 rounded-lg text-neutral-600 hover:bg-neutral-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenEdit(holiday);
                                  }}
                                  title="Edit"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-7 w-7 p-0 rounded-lg text-red-600 hover:bg-red-50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenDelete(holiday);
                                  }}
                                  title="Delete"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        /* LIST VIEW: Full-width Table */
        <div className="space-y-6">
          <Card className="border-neutral-200/80 shadow-sm rounded-2xl">
            <CardContent className="p-4 flex flex-col md:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                <Input
                  placeholder="Search holiday name, date, or legal description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 rounded-xl border-neutral-200"
                  id="holiday-search-table-view"
                />
              </div>

              <div className="w-full md:w-48">
                <Select 
                  value={yearFilter} 
                  onValueChange={(val: string | null) => {
                    if (val) setYearFilter(val);
                  }}
                >
                  <SelectTrigger className="rounded-xl border-neutral-200">
                    <SelectValue placeholder="Filter by year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Calendar Years</SelectItem>
                    <SelectItem value="2026">2026 (Active Calendar)</SelectItem>
                    <SelectItem value="2025">2025 (Historical)</SelectItem>
                    <SelectItem value="2027">2027 (Upcoming)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="w-full md:w-56">
                <Select 
                  value={filterType} 
                  onValueChange={(val: string | null) => {
                    if (val) setFilterType(val);
                  }}
                >
                  <SelectTrigger className="rounded-xl border-neutral-200" id="holiday-type-filter-table">
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Holiday Types</SelectItem>
                    <SelectItem value="Regular">Regular Holiday</SelectItem>
                    <SelectItem value="Special Non-Working">Special Non-Working</SelectItem>
                    <SelectItem value="Special Working">Special Working</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-neutral-200/80 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-neutral-50/50 border-b border-neutral-100 p-6 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold font-sans">Official Calendar Holidays ({filteredHolidays.length})</CardTitle>
                <CardDescription className="font-sans text-xs">Official Philippine presidential proclamations, Republic Acts, and institutional university off-days.</CardDescription>
              </div>
              <Badge variant="outline" className="bg-neutral-100 text-neutral-700 font-mono text-xs">
                {filteredHolidays.filter(h => h.type === 'Regular').length} Regular • {filteredHolidays.filter(h => h.type !== 'Regular').length} Special
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-900"></div>
                  <p className="text-sm text-neutral-400 font-sans">Loading official calendar...</p>
                </div>
              ) : filteredHolidays.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Calendar className="w-12 h-12 text-neutral-300 stroke-[1.5] mb-2" />
                  <p className="text-neutral-900 font-medium font-sans">No holidays found</p>
                  <p className="text-xs text-neutral-400 font-sans mt-0.5">Try searching for an alternative term or click "Sync Real Holidays".</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-neutral-100/50">
                      <TableRow>
                        <TableHead className="font-semibold text-neutral-800">Holiday</TableHead>
                        <TableHead className="font-semibold text-neutral-800">Date</TableHead>
                        <TableHead className="font-semibold text-neutral-800">Day of Week</TableHead>
                        <TableHead className="font-semibold text-neutral-800">Type</TableHead>
                        <TableHead className="font-semibold text-neutral-800">Description & Legal Basis</TableHead>
                        {canManage && <TableHead className="text-right font-semibold text-neutral-800 pr-6">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHolidays.map((holiday) => {
                        const dayOfWeekLabel = holiday.date ? formatHolidayDate(holiday.date, 'EEEE') : '---';
                        const dateFormatted = holiday.date ? formatHolidayDate(holiday.date, 'MMMM d, yyyy') : '---';
                        const isRegular = holiday.type === 'Regular';

                        return (
                          <TableRow key={holiday.id} className="hover:bg-neutral-50/50">
                            <TableCell className="font-medium text-neutral-900 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <Calendar className="w-4 h-4 text-neutral-400 shrink-0" />
                                <div>
                                  <span className="font-bold tracking-tight text-neutral-900 block">{holiday.name}</span>
                                  {holiday.category && (
                                    <span className="text-[10px] text-neutral-400 font-medium">{holiday.category}</span>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-neutral-700 font-mono text-sm py-3.5">
                              {dateFormatted}
                            </TableCell>
                            <TableCell className="text-neutral-500 py-3.5 text-sm">
                              {dayOfWeekLabel || '---'}
                            </TableCell>
                            <TableCell className="py-3.5">
                              <Badge 
                                variant="outline" 
                                className={
                                  isRegular
                                    ? 'bg-rose-50 border-rose-200 text-rose-700 rounded-lg text-xs font-semibold'
                                    : 'bg-amber-50 border-amber-200 text-amber-700 rounded-lg text-xs font-semibold'
                                }
                              >
                                <Tag className="w-3 h-3 mr-1 shrink-0" />
                                {holiday.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-3.5 max-w-md">
                              <p className="text-xs text-neutral-600 line-clamp-2 leading-relaxed">
                                {holiday.description || 'Statutory public holiday.'}
                              </p>
                            </TableCell>
                            {canManage && (
                              <TableCell className="text-right py-3.5 pr-6">
                                <div className="flex justify-end gap-1.5">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-8 w-8 p-0 rounded-xl border-neutral-200 text-neutral-600 hover:bg-neutral-100 shadow-xs"
                                    onClick={() => handleOpenEdit(holiday)}
                                    title="Edit Holiday"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-8 w-8 p-0 rounded-xl border-red-100 text-red-600 hover:bg-red-50 hover:border-red-200 shadow-xs"
                                    onClick={() => handleOpenDelete(holiday)}
                                    title="Delete Holiday"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Save Modal */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-white">
          <form onSubmit={handleFormSubmit}>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold font-sans">
                {editingHoliday ? 'Edit Calendar Holiday' : 'Add Calendar Holiday'}
              </DialogTitle>
              <DialogDescription className="text-xs text-neutral-500 font-sans">
                Configure calendar dates as statutory or university holidays. These will automatically calculate across digital timesheets and payroll.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 my-5">
              <div className="space-y-1.5">
                <Label htmlFor="holiday-name" className="text-xs font-bold text-neutral-700">Holiday Name *</Label>
                <Input
                  id="holiday-name"
                  placeholder="e.g. Christmas Day, University Foundation Day"
                  value={holidayForm.name}
                  onChange={(e) => setHolidayForm(prev => ({ ...prev, name: e.target.value }))}
                  className="rounded-xl border-neutral-200"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="holiday-date" className="text-xs font-bold text-neutral-700">Calendar Date *</Label>
                  <Input
                    id="holiday-date"
                    type="date"
                    value={holidayForm.date}
                    onChange={(e) => setHolidayForm(prev => ({ ...prev, date: e.target.value }))}
                    className="rounded-xl border-neutral-200 font-mono"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="holiday-type" className="text-xs font-bold text-neutral-700 font-sans">Holiday Type *</Label>
                  <Select 
                    value={holidayForm.type} 
                    onValueChange={(val: string | null) => {
                      if (val) setHolidayForm(prev => ({ ...prev, type: val }));
                    }}
                  >
                    <SelectTrigger className="rounded-xl border-neutral-200" id="holiday-type-trigger">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Regular">Regular Holiday</SelectItem>
                      <SelectItem value="Special Non-Working">Special Non-Working</SelectItem>
                      <SelectItem value="Special Working">Special Working</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="holiday-category" className="text-xs font-bold text-neutral-700 font-sans">Category</Label>
                <Select 
                  value={holidayForm.category} 
                  onValueChange={(val: string | null) => {
                    if (val) setHolidayForm(prev => ({ ...prev, category: val }));
                  }}
                >
                  <SelectTrigger className="rounded-xl border-neutral-200">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="National">National Statutory</SelectItem>
                    <SelectItem value="Academic">University / Academic</SelectItem>
                    <SelectItem value="Local">Local / Provincial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="holiday-desc" className="text-xs font-bold text-neutral-700 font-sans">Legal Description / Notes</Label>
                <textarea
                  id="holiday-desc"
                  placeholder="e.g. Proclamation No. 727, s. 2024 / Republic Act No. 9492"
                  value={holidayForm.description}
                  onChange={(e) => setHolidayForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full rounded-xl border border-neutral-200 p-2.5 text-xs text-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900 min-h-[70px]"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)} 
                className="rounded-xl border-neutral-200 text-neutral-600 hover:bg-neutral-50"
              >
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl bg-neutral-900 text-white hover:bg-neutral-800">
                {editingHoliday ? 'Save Changes' : 'Create Holiday'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold font-sans flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-500" />
              Remove Calendar Holiday
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-500 font-sans">
              Are you sure you want to remove this holiday? This action is permanent and may affect historical payroll calculations if timesheets are recalculated.
            </DialogDescription>
          </DialogHeader>

          {holidayToDelete && (
            <div className="bg-red-50/60 rounded-xl p-4 border border-red-100 my-4 space-y-1">
              <p className="text-sm font-bold text-red-900">{holidayToDelete.name}</p>
              <p className="text-xs text-red-700 font-mono">
                {holidayToDelete.date ? formatHolidayDate(holidayToDelete.date, 'MMMM d, yyyy') : ''}
              </p>
              <Badge variant="outline" className="bg-white border-red-200 text-red-700 text-[10px] font-bold">
                {holidayToDelete.type}
              </Badge>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsDeleteOpen(false)} 
              className="rounded-xl border-neutral-200 text-neutral-500 hover:bg-neutral-100"
            >
              Cancel
            </Button>
            <Button 
              type="button" 
              onClick={handleDeleteConfirm} 
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HolidaysPage;
