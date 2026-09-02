import React, { useEffect, useState } from 'react';
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
  Clock
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

interface Holiday {
  id: string;
  name: string;
  date: string;
  type: string;
  createdAt?: string;
}

const HolidaysPage = () => {
  const { role } = useAuth();
  const canManage = role === 'admin' || role === 'payroll_officer';

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [loading, setLoading] = useState(true);
  
  // View Toggle: 'calendar' (interactive grid) or 'list' (classic table)
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  
  // Interactive Calendar state
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [selectedDayInfo, setSelectedDayInfo] = useState<{ date: Date; holiday?: Holiday } | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  
  const [holidayForm, setHolidayForm] = useState({
    name: '',
    date: '',
    type: 'Regular'
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
      setHolidays(data || []);
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
      date: '',
      type: 'Regular'
    });
    setIsDialogOpen(true);
  };

  const handleOpenAddForDate = (date: Date) => {
    setEditingHoliday(null);
    setHolidayForm({
      name: '',
      date: format(date, 'yyyy-MM-dd'),
      type: 'Regular'
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    setHolidayForm({
      name: holiday.name,
      date: holiday.date,
      type: holiday.type
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
      toast.error('All fields are required');
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
      fetchHolidays();
    } catch (err: any) {
      toast.error('Failed to delete holiday');
    }
  };

  // Helper: compare dateObj to YYYY-MM-DD safely
  const isSameLocalDate = (dateObj: Date, holidayDateStr: string) => {
    if (!holidayDateStr) return false;
    const parts = holidayDateStr.split('-');
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
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return format(d, formatStr);
      }
      return format(new Date(dateStr), formatStr);
    } catch {
      return dateStr;
    }
  };

  // Filter & sort chronologically
  const filteredHolidays = holidays.filter(hol => {
    const matchesSearch = hol.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          hol.date.includes(searchTerm);
    const matchesType = filterType === 'all' || hol.type === filterType;
    return matchesSearch && matchesType;
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
      daysList.push({
        date: d,
        isCurrentMonth: false,
        holiday: holidays.find(h => isSameLocalDate(d, h.date))
      });
    }
    
    // Current month days
    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dObj = new Date(year, month, d);
      daysList.push({
        date: dObj,
        isCurrentMonth: true,
        holiday: holidays.find(h => isSameLocalDate(dObj, h.date))
      });
    }
    
    // Next month filler days (makes standard 35 or 42 grid blocks)
    const totalCells = daysList.length > 35 ? 42 : 35;
    const remainingCells = totalCells - daysList.length;
    for (let d = 1; d <= remainingCells; d++) {
      const dObj = new Date(year, month + 1, d);
      daysList.push({
        date: dObj,
        isCurrentMonth: false,
        holiday: holidays.find(h => isSameLocalDate(dObj, h.date))
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
    setCalendarDate(new Date());
    setSelectedDayInfo(null);
  };

  const calendarDays = getCalendarDays();
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-6" id="holidays-dashboard-container">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-rose-50 border border-rose-100 text-rose-600">
              <CalendarDays className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 font-sans">Calendar & Holidays</h1>
          </div>
          <p className="text-sm text-neutral-500 font-sans mt-0.5">
            Manage academic and state holiday calendar events. Holidays affect timesheet calculations and regular DTR computations.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            <Button onClick={handleOpenAdd} className="gap-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl shadow-xs" id="btn-add-holiday">
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
              {/* Calendar Header with Navigation */}
              <div className="bg-neutral-50/50 border-b border-neutral-100 p-5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-lg font-bold text-neutral-800 font-sans tracking-tight">
                    {format(calendarDate, 'MMMM yyyy')}
                  </h2>
                  <Badge variant="outline" className="bg-neutral-100 border-neutral-200 text-neutral-600 rounded-md font-mono text-[10px]">
                    {calendarDays.filter(d => d.isCurrentMonth && d.holiday).length} Events
                  </Badge>
                </div>

                <div className="flex items-center gap-1">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleGoToday}
                    className="h-8 text-xs font-semibold rounded-lg border-neutral-200 hover:bg-neutral-50 text-neutral-600"
                  >
                    Today
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handlePrevMonth}
                    className="h-8 w-8 rounded-lg border-neutral-200 hover:bg-neutral-50"
                  >
                    <ChevronLeft className="w-4 h-4 text-neutral-600" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleNextMonth}
                    className="h-8 w-8 rounded-lg border-neutral-200 hover:bg-neutral-50"
                  >
                    <ChevronRight className="w-4 h-4 text-neutral-600" />
                  </Button>
                </div>
              </div>

              {/* Weekdays header */}
              <div className="grid grid-cols-7 border-b border-neutral-100 bg-neutral-50/30 text-center py-2 text-xs font-bold text-neutral-400 uppercase tracking-wider font-sans">
                {weekDays.map(day => (
                  <div key={day} className={day === 'Sun' || day === 'Sat' ? 'text-rose-400/80' : ''}>
                    {day}
                  </div>
                ))}
              </div>

              {/* Day cells grid */}
              <CardContent className="p-3">
                <div className="grid grid-cols-7 gap-1 md:gap-2">
                  {calendarDays.map((cell, idx) => {
                    const isToday = isTodayDate(cell.date);
                    const holiday = cell.holiday;
                    
                    // Style helpers
                    let bgStyle = 'bg-white hover:bg-neutral-50/70 border-neutral-100';
                    let textStyle = cell.isCurrentMonth ? 'text-neutral-800 font-semibold' : 'text-neutral-300';
                    
                    if (holiday) {
                      if (holiday.type === 'Regular') {
                        bgStyle = 'bg-rose-50/80 hover:bg-rose-100/90 border-rose-200 text-rose-900 shadow-xs';
                      } else {
                        bgStyle = 'bg-amber-50/80 hover:bg-amber-100/90 border-amber-200 text-amber-900 shadow-xs';
                      }
                    } else if (isToday) {
                      bgStyle = 'bg-blue-50/40 hover:bg-blue-50/80 border-blue-200 text-blue-900 ring-2 ring-blue-100/50';
                    }

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setSelectedDayInfo(cell);
                          if (!holiday) {
                            // Offer addition helper on double-click or detail panel
                          }
                        }}
                        className={`min-h-[75px] md:min-h-[95px] p-2 border rounded-xl flex flex-col justify-between transition-all duration-200 cursor-pointer select-none group relative ${bgStyle}`}
                      >
                        {/* Day indicator */}
                        <div className="flex justify-between items-center">
                          <span className={`text-xs md:text-sm font-mono ${textStyle} ${isToday ? 'h-5 w-5 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold font-sans' : ''}`}>
                            {cell.date.getDate()}
                          </span>
                          
                          {/* Holiday marker pin */}
                          {holiday && (
                            <span className={`w-1.5 h-1.5 rounded-full ${holiday.type === 'Regular' ? 'bg-rose-500' : 'bg-amber-500'}`}></span>
                          )}
                        </div>

                        {/* Holiday Label inside cell */}
                        {holiday ? (
                          <div className="mt-1">
                            {/* Truncated Event Tag */}
                            <p className="text-[10px] md:text-[11px] leading-tight font-bold tracking-tight line-clamp-2 md:line-clamp-1 font-sans">
                              {holiday.name}
                            </p>
                            <span className="hidden md:inline-block text-[8px] font-extrabold uppercase opacity-75 font-sans mt-0.5">
                              {holiday.type === 'Regular' ? 'Regular' : 'Special'}
                            </span>
                          </div>
                        ) : (
                          /* Subtle hover "+ Add" link */
                          canManage && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenAddForDate(cell.date);
                              }}
                              className="text-[9px] font-bold text-neutral-400 group-hover:text-neutral-900 hover:bg-neutral-100/80 px-1.5 py-0.5 rounded-md self-start opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 font-sans"
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
              <div className="bg-neutral-50/50 border-t border-neutral-100 p-4 flex flex-wrap gap-4 items-center justify-between text-xs font-sans text-neutral-500">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-rose-50 border border-rose-200 inline-block"></span>
                    <span className="font-semibold text-neutral-700">Regular Holiday</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-amber-50 border border-amber-200 inline-block"></span>
                    <span className="font-semibold text-neutral-700">Special Non-Working</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-blue-50 border border-blue-200 inline-block"></span>
                    <span className="font-semibold text-neutral-700">Today</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-neutral-400">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>Click any cell to show details or create an event.</span>
                </div>
              </div>
            </Card>

            {/* Selected Day Info details panel */}
            {selectedDayInfo && (
              <Card className="border-neutral-200/80 shadow-sm rounded-2xl bg-white border-l-4 border-l-neutral-900 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold tracking-widest text-neutral-400 uppercase font-sans">
                      Selected Calendar Day • {format(selectedDayInfo.date, 'EEEE, MMMM d, yyyy')}
                    </div>
                    {selectedDayInfo.holiday ? (
                      <div>
                        <h3 className="text-lg font-bold text-neutral-900 font-sans tracking-tight">
                          {selectedDayInfo.holiday.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge 
                            variant="outline" 
                            className={
                              selectedDayInfo.holiday.type === 'Regular'
                                ? 'bg-rose-50 border-rose-200 text-rose-700 font-bold rounded-md'
                                : 'bg-amber-50 border-amber-200 text-amber-700 font-bold rounded-md'
                            }
                          >
                            {selectedDayInfo.holiday.type}
                          </Badge>
                          <span className="text-xs text-neutral-500 font-sans">
                            {selectedDayInfo.holiday.type === 'Regular' 
                              ? 'Paid regular holiday. Standard benefit calculations active.' 
                              : 'Special non-working day. Specific compensation adjustments apply.'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h3 className="text-base font-bold text-neutral-600 font-sans tracking-tight italic">
                          No holidays scheduled on this date
                        </h3>
                        <p className="text-xs text-neutral-400 font-sans">
                          Would you like to schedule a holiday or custom campus off-day on this calendar date?
                        </p>
                      </div>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-2 shrink-0">
                      {selectedDayInfo.holiday ? (
                        <>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleOpenEdit(selectedDayInfo.holiday!)}
                            className="h-9 px-4 rounded-xl border-neutral-200 text-neutral-700 hover:bg-neutral-50 gap-1.5"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Edit Holiday
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleOpenDelete(selectedDayInfo.holiday!)}
                            className="h-9 px-4 rounded-xl border-red-100 text-red-600 hover:bg-red-50 hover:border-red-200 gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </Button>
                        </>
                      ) : (
                        <Button 
                          size="sm" 
                          onClick={() => handleOpenAddForDate(selectedDayInfo.date)}
                          className="h-9 px-4 bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Schedule Holiday
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* RIGHT: High-craft "Tear-off Calendar" manager list (lg:col-span-4) */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="border-neutral-200/80 shadow-sm rounded-2xl overflow-hidden bg-white">
              <CardHeader className="bg-neutral-50/30 border-b border-neutral-100 p-5">
                <CardTitle className="text-base font-bold font-sans tracking-tight">Holiday Directory</CardTitle>
                <CardDescription className="text-xs font-sans">
                  Quickly lookup, search, or filter holidays in the active calendar.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-5 space-y-4">
                {/* Search & Filter Widgets inside Sidebar */}
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                    <Input
                      placeholder="Search name or date..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 rounded-xl border-neutral-200 bg-neutral-50/50"
                      id="holiday-search-sidebar"
                    />
                  </div>

                  <Select 
                    value={filterType} 
                    onValueChange={(val: string | null) => {
                      if (val) setFilterType(val);
                    }}
                  >
                    <SelectTrigger className="rounded-xl border-neutral-200 bg-neutral-50/50" id="holiday-type-sidebar">
                      <SelectValue placeholder="Filter type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Holiday Types</SelectItem>
                      <SelectItem value="Regular">Regular Holidays</SelectItem>
                      <SelectItem value="Special Non-Working">Special Non-Working</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="border-t border-neutral-100 pt-4">
                  <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 font-sans flex items-center justify-between">
                    <span>Upcoming Holidays</span>
                    <span className="font-mono text-[10px] text-neutral-400 font-medium">({filteredHolidays.length})</span>
                  </h3>

                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-8 space-y-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-neutral-900"></div>
                      <p className="text-xs text-neutral-400 font-sans">Loading list...</p>
                    </div>
                  ) : filteredHolidays.length === 0 ? (
                    <div className="text-center py-10 border border-dashed border-neutral-150 rounded-2xl bg-neutral-50/20">
                      <Calendar className="w-8 h-8 text-neutral-300 stroke-[1.5] mx-auto mb-1.5" />
                      <p className="text-xs text-neutral-500 font-bold font-sans">No matching holidays</p>
                      <p className="text-[10px] text-neutral-400 font-sans">Modify filters or add a holiday.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                      {filteredHolidays.map((holiday) => {
                        const dayName = holiday.date ? formatHolidayDate(holiday.date, 'EEEE') : '---';
                        const monthName = holiday.date ? formatHolidayDate(holiday.date, 'MMM') : '---';
                        const dayNum = holiday.date ? formatHolidayDate(holiday.date, 'd') : '--';
                        const isRegular = holiday.type === 'Regular';

                        return (
                          <div 
                            key={holiday.id} 
                            className="flex items-center justify-between p-3 bg-white hover:bg-neutral-50/50 border border-neutral-150 rounded-2xl transition-all shadow-xs group"
                          >
                            <div className="flex items-center gap-3">
                              {/* Tear-Off Calendar badge */}
                              <div className="w-12 h-12 rounded-xl border border-neutral-200 overflow-hidden flex flex-col items-center justify-center shrink-0 shadow-xs">
                                <div className={`w-full text-[8px] font-extrabold text-center text-white py-0.5 uppercase tracking-widest ${isRegular ? 'bg-rose-600' : 'bg-amber-600'}`}>
                                  {monthName}
                                </div>
                                <div className={`text-base font-extrabold leading-none py-1.5 font-mono ${isRegular ? 'text-rose-900 bg-rose-50/50' : 'text-amber-900 bg-amber-50/50'} w-full text-center`}>
                                  {dayNum}
                                </div>
                              </div>

                              <div className="space-y-0.5">
                                <h4 className="text-xs font-bold text-neutral-800 font-sans leading-snug tracking-tight group-hover:text-neutral-950">
                                  {holiday.name}
                                </h4>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-medium text-neutral-400 font-mono">
                                    {dayName}
                                  </span>
                                  <span className="text-[10px] text-neutral-300">•</span>
                                  <span className={`text-[9px] font-extrabold uppercase ${isRegular ? 'text-rose-600' : 'text-amber-600'}`}>
                                    {isRegular ? 'Regular' : 'Special'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Hover Controls */}
                            {canManage && (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="h-7 w-7 p-0 rounded-lg border-neutral-200 text-neutral-600 hover:bg-neutral-100"
                                  onClick={() => handleOpenEdit(holiday)}
                                  title="Edit Holiday"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="h-7 w-7 p-0 rounded-lg border-red-100 text-red-600 hover:bg-red-50"
                                  onClick={() => handleOpenDelete(holiday)}
                                  title="Delete Holiday"
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
            <CardContent className="p-4 flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                <Input
                  placeholder="Search holiday name or date..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 rounded-xl border-neutral-200"
                  id="holiday-search-table-view"
                />
              </div>
              
              <div className="w-full md:w-64">
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
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-neutral-200/80 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-neutral-50/50 border-b border-neutral-100 p-6">
              <CardTitle className="text-base font-bold font-sans">Active Calendar Events ({filteredHolidays.length})</CardTitle>
              <CardDescription className="font-sans text-xs">Standard federal and custom school holidays configured on the system.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-900"></div>
                  <p className="text-sm text-neutral-400 font-sans">Loading administrative calendar...</p>
                </div>
              ) : filteredHolidays.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Calendar className="w-12 h-12 text-neutral-300 stroke-[1.5] mb-2" />
                  <p className="text-neutral-900 font-medium font-sans">No holidays found</p>
                  <p className="text-xs text-neutral-400 font-sans mt-0.5">Try searching for an alternative term or add a new, custom holiday.</p>
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
                        {canManage && <TableHead className="text-right font-semibold text-neutral-800 pr-6">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHolidays.map((holiday) => {
                        const dayOfWeekLabel = holiday.date ? formatHolidayDate(holiday.date, 'EEEE') : '---';
                        const dateFormatted = holiday.date ? formatHolidayDate(holiday.date, 'MMMM d, yyyy') : '---';

                        return (
                          <TableRow key={holiday.id} className="hover:bg-neutral-50/30">
                            <TableCell className="font-medium text-neutral-900 py-3.5">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-neutral-400 shrink-0" />
                                <span className="font-semibold tracking-tight">{holiday.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-neutral-600 font-mono text-sm py-3.5">
                              {dateFormatted}
                            </TableCell>
                            <TableCell className="text-neutral-500 py-3.5">
                              {dayOfWeekLabel || '---'}
                            </TableCell>
                            <TableCell className="py-3.5">
                              <Badge 
                                variant="outline" 
                                className={
                                  holiday.type === 'Regular'
                                    ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-semibold'
                                    : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-50 rounded-lg text-xs font-semibold'
                                }
                              >
                                <Tag className="w-3 h-3 mr-1 shrink-0" />
                                {holiday.type}
                              </Badge>
                            </TableCell>
                            {canManage && (
                              <TableCell className="text-right py-3.5 pr-6">
                                <div className="flex justify-end gap-2">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-8 w-8 p-0 rounded-xl border-neutral-200 text-neutral-600 hover:bg-neutral-100"
                                    onClick={() => handleOpenEdit(holiday)}
                                    title="Edit Holiday"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-8 w-8 p-0 rounded-xl border-red-100 text-red-600 hover:bg-red-50 hover:border-red-200"
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
                {editingHoliday ? 'Edit public holiday' : 'Add custom public holiday'}
              </DialogTitle>
              <DialogDescription className="text-xs text-neutral-500 font-sans">
                Configure calendar dates as public hold days. These days will automatically register across digital timesheets.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 my-6">
              <div className="space-y-1.5">
                <Label htmlFor="holiday-name" className="text-xs font-bold text-neutral-700">Holiday Name</Label>
                <Input
                  id="holiday-name"
                  placeholder="e.g. Christmas Day"
                  value={holidayForm.name}
                  onChange={(e) => setHolidayForm(prev => ({ ...prev, name: e.target.value }))}
                  className="rounded-xl border-neutral-200"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="holiday-date" className="text-xs font-bold text-neutral-700">Calendar Date</Label>
                <Input
                  id="holiday-date"
                  type="date"
                  value={holidayForm.date}
                  onChange={(e) => setHolidayForm(prev => ({ ...prev, date: e.target.value }))}
                  className="rounded-xl border-neutral-200"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="holiday-type" className="text-xs font-bold text-neutral-700 font-sans">Holiday Type</Label>
                <Select 
                  value={holidayForm.type} 
                  onValueChange={(val: string | null) => {
                    if (val) setHolidayForm(prev => ({ ...prev, type: val }));
                  }}
                >
                  <SelectTrigger className="rounded-xl border-neutral-200 id-holiday-type-trigger">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Regular">Regular Holiday</SelectItem>
                    <SelectItem value="Special Non-Working">Special Non-Working</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="gap-2 md:gap-0">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)} 
                className="rounded-xl border-neutral-200 text-neutral-600 hover:bg-neutral-50"
              >
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl bg-neutral-950 text-white hover:bg-neutral-900">
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
              Are you sure you want to remove this holiday? This action is permanent and may affect historical payroll calculations if they aren't finalized.
            </DialogDescription>
          </DialogHeader>

          {holidayToDelete && (
            <div className="bg-red-50/50 rounded-xl p-4 border border-red-100 my-4">
              <p className="text-xs font-bold text-red-900 leading-none">{holidayToDelete.name}</p>
              <p className="text-[10px] text-red-600 mt-1 font-mono">
                {holidayToDelete.date ? formatHolidayDate(holidayToDelete.date, 'MMMM d, yyyy') : ''}
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 md:gap-0 mt-4">
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
