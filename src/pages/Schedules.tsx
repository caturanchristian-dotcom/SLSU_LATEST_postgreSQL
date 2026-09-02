import React, { useState, useEffect } from 'react';
import { useRealtime } from '../hooks/useRealtime';
import { useAuth } from '../components/AuthProvider';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Trash2, 
  Pencil,
  Search,
  Filter,
  Clock,
  BookOpen,
  MapPin,
  LayoutGrid,
  List,
  User,
  Info,
  Radio
} from 'lucide-react';
import { SchoolApiSyncModal } from '../components/SchoolApiSyncModal';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger
} from '../components/ui/dialog';
import { DeleteConfirmationDialog } from '../components/DeleteConfirmationDialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

interface Schedule {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  category?: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  subject: string;
  room: string;
  specificDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  teachingDepartmentId?: string;
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  category: string;
  teachingDepartmentId?: string;
}

const autoPmTime = (val: string): string => {
  if (!val) return val;
  const match = val.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = match[2];
    if (h > 0 && h <= 6) {
      h += 12;
      return `${h}:${m}`;
    }
  }
  return val;
};

export const formatTimeTo12Hour = (timeStr: string): string => {
  if (!timeStr) return '';
  const trimmed = timeStr.trim();
  if (trimmed.toLowerCase().includes('am') || trimmed.toLowerCase().includes('pm')) {
    return trimmed;
  }
  const parts = trimmed.split(':');
  if (parts.length < 2) return trimmed;
  let hour = parseInt(parts[0], 10);
  const min = parts[1];
  if (isNaN(hour)) return trimmed;
  
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

export const formatEffDate = (dateStr?: string) => {
  if (!dateStr) return '';
  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const yr = parts[0];
  if (mIdx < 0 || mIdx > 11) return dateStr;
  return `${months[mIdx]} ${day}, ${yr}`;
};

const Schedules = () => {
  const { user, role } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [scheduleType, setScheduleType] = useState<'recurring' | 'specific'>('recurring');
  const [editScheduleType, setEditScheduleType] = useState<'recurring' | 'specific'>('recurring');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('all');

  const [addFormCategoryFilter, setAddFormCategoryFilter] = useState<string>('all');
  const [editFormCategoryFilter, setEditFormCategoryFilter] = useState<string>('all');

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [scheduleIdToDelete, setScheduleIdToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [viewingSchedule, setViewingSchedule] = useState<Schedule | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);

  const isRegularEmp = (empId: string | undefined) => {
    if (!empId) return false;
    const emp = employees.find(e => e.id === empId);
    return emp ? ['Regular Employee', 'FACULTY', 'STAFF'].includes(emp.category) : false;
  };

  const availableCategories = Array.from(new Set(employees.map(emp => emp.category).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));

  const handleAddFormCategoryChange = (cat: string) => {
    setAddFormCategoryFilter(cat);
    if (cat !== 'all') {
      const selectedEmp = employees.find(e => e.id === newSchedule.employeeId);
      if (!selectedEmp || selectedEmp.category !== cat) {
        setNewSchedule(prev => ({ ...prev, employeeId: '' }));
      }
    }
  };

  const handleEditFormCategoryChange = (cat: string) => {
    setEditFormCategoryFilter(cat);
    if (cat !== 'all') {
      const selectedEmp = employees.find(e => e.id === editSchedule.employeeId);
      if (!selectedEmp || selectedEmp.category !== cat) {
        setEditSchedule(prev => ({ ...prev, employeeId: '' }));
      }
    }
  };

  const [selectedDays, setSelectedDays] = useState<string[]>(['Monday']);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const shortDays: {[key: string]: string} = {
    'Monday': 'Mon',
    'Tuesday': 'Tue',
    'Wednesday': 'Wed',
    'Thursday': 'Thu',
    'Friday': 'Fri',
    'Saturday': 'Sat',
    'Sunday': 'Sun'
  };

  const dayOrder: { [key: string]: number } = {
    'Monday': 1,
    'Tuesday': 2,
    'Wednesday': 3,
    'Thursday': 4,
    'Friday': 5,
    'Saturday': 6,
    'Sunday': 7
  };

  const [departments, setDepartments] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  const toggleDay = (day: string) => {
    if (selectedDays.includes(day)) {
      if (selectedDays.length > 1) {
        setSelectedDays(selectedDays.filter(d => d !== day));
      } else {
        toast.error('Please select at least one day.');
      }
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  };

  const [newSchedule, setNewSchedule] = useState({
    employeeId: '',
    dayOfWeek: 'Monday',
    startTime: '08:00',
    endTime: '10:00',
    subject: '',
    room: '',
    specificDate: '',
    effectiveFrom: '',
    effectiveTo: '',
    teachingDepartmentId: ''
  });

  const [editSchedule, setEditSchedule] = useState({
    employeeId: '',
    dayOfWeek: 'Monday',
    startTime: '08:00',
    endTime: '10:00',
    subject: '',
    room: '',
    specificDate: '',
    effectiveFrom: '',
    effectiveTo: '',
    teachingDepartmentId: ''
  });

  const myDepartment = role === 'department_head'
    ? departments.find(d => d.departmentHeadId === user?.id)
    : null;

  useEffect(() => {
    if (role === 'department_head' && departments.length > 0) {
      const myDept = departments.find(d => d.departmentHeadId === user?.id);
      if (myDept) {
        setSelectedDepartmentId(myDept.id);
        setSelectedCategory('Visiting Instructor');
        setAddFormCategoryFilter('Visiting Instructor');
        setEditFormCategoryFilter('Visiting Instructor');
        setNewSchedule(prev => ({
          ...prev,
          teachingDepartmentId: myDept.id
        }));
      }
    }
  }, [role, departments, user]);

  const isAdmin = role === 'admin' || role === 'payroll_officer' || role === 'department_head';

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const data = role === 'employee' 
        ? await api.schedules.getByEmployee(user?.id || '') 
        : await api.schedules.list();
      setSchedules(data || []);
    } catch (error) {
      console.error('Failed to fetch schedules:', error);
      toast.error('Could not load schedules');
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    if (!isAdmin) return;
    try {
      const data = await api.employees.list();
      setEmployees(data || []);
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    }
  };

  const fetchDepartmentsAndSubjects = async () => {
    try {
      const [depts, subs] = await Promise.all([
        api.departments.list(),
        api.subjects.list()
      ]);
      setDepartments(depts || []);
      setSubjects(subs || []);
    } catch (error) {
      console.error('Failed to fetch departments or subjects:', error);
    }
  };

  useEffect(() => {
    fetchSchedules();
    fetchEmployees();
    fetchDepartmentsAndSubjects();
  }, [user, role]);

  useRealtime('schedules_changed', fetchSchedules);
  useRealtime('employees_changed', fetchEmployees);

  const handleAutoGenerateStandardSchedules = async (empId: string) => {
    if (!empId) {
      toast.error('Please select an employee first');
      return;
    }
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;

    try {
      const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      const promises = [];
      for (const day of weekdays) {
        promises.push(api.schedules.create({
          employeeId: empId,
          dayOfWeek: day,
          startTime: '08:00',
          endTime: '11:00',
          subject: 'Core Hours',
          room: 'Office',
        }));
        promises.push(api.schedules.create({
          employeeId: empId,
          dayOfWeek: day,
          startTime: '13:00',
          endTime: '17:00',
          subject: 'Core Hours',
          room: 'Office',
        }));
      }
      
      await Promise.all(promises);
      toast.success(`Standard Mon-Fri 8-11 AM & 1-5 PM schedules generated!`);
      setIsAddOpen(false);
      fetchSchedules();
    } catch (error) {
      console.error(error);
      toast.error('Failed to auto-generate standard schedules');
    }
  };

  const handleEmployeeChangeInNewSchedule = (empId: string) => {
    const emp = employees.find(e => e.id === empId);
    if (emp && (emp.category === 'Regular Employee' || emp.category === 'FACULTY' || emp.category === 'STAFF')) {
      setNewSchedule({
        employeeId: empId,
        dayOfWeek: 'Monday',
        startTime: '08:00',
        endTime: '11:00',
        subject: 'Core Hours',
        room: 'Office',
        specificDate: '',
        effectiveFrom: '',
        effectiveTo: '',
        teachingDepartmentId: ''
      });
    } else {
      setNewSchedule(prev => ({
        ...prev,
        employeeId: empId,
        subject: '',
        teachingDepartmentId: emp?.teachingDepartmentId || ''
      }));
    }
  };

  const handleEmployeeChangeInEditSchedule = (empId: string) => {
    const emp = employees.find(e => e.id === empId);
    if (emp && (emp.category === 'Regular Employee' || emp.category === 'FACULTY' || emp.category === 'STAFF')) {
      setEditSchedule({
        employeeId: empId,
        dayOfWeek: 'Monday',
        startTime: '08:00',
        endTime: '11:00',
        subject: 'Core Hours',
        room: 'Office',
        specificDate: '',
        effectiveFrom: '',
        effectiveTo: '',
        teachingDepartmentId: ''
      });
    } else {
      setEditSchedule(prev => ({
        ...prev,
        employeeId: empId,
        subject: '',
        teachingDepartmentId: emp?.teachingDepartmentId || ''
      }));
    }
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchedule.employeeId && role !== 'employee') {
      toast.error('Please select an employee first');
      return;
    }
    if (scheduleType === 'recurring' && selectedDays.length === 0) {
      toast.error('Please select at least one day or teaching slot');
      return;
    }
    
    try {
      const basePayload = role === 'employee' ? { ...newSchedule, employeeId: user?.id } : newSchedule;
      
      if (scheduleType === 'recurring') {
        const promises = selectedDays.map(day => {
          return api.schedules.create({
            ...basePayload,
            dayOfWeek: day,
            specificDate: ''
          });
        });

        const responses = await Promise.all(promises);
        const successes = responses.filter(r => r && r.success);
        
        if (successes.length === selectedDays.length) {
          toast.success(`Schedule successfully added for ${selectedDays.join(', ')}`);
          setIsAddOpen(false);
          fetchSchedules();
          setNewSchedule({
            employeeId: '',
            dayOfWeek: 'Monday',
            startTime: '08:00',
            endTime: '10:00',
            subject: '',
            room: '',
            specificDate: '',
            effectiveFrom: '',
            effectiveTo: '',
            teachingDepartmentId: ''
          });
          setSelectedDays(['Monday']);
          setScheduleType('recurring');
        } else if (successes.length > 0) {
          toast.warning(`Added ${successes.length} out of ${selectedDays.length} schedules`);
          setIsAddOpen(false);
          fetchSchedules();
        } else {
          toast.error('Failed to add schedules');
        }
      } else {
        const response = await api.schedules.create({
          ...basePayload,
          specificDate: newSchedule.specificDate
        });
        
        if (response && response.success) {
          toast.success('Schedule added successfully');
          setIsAddOpen(false);
          fetchSchedules();
          setNewSchedule({
            employeeId: '',
            dayOfWeek: 'Monday',
            startTime: '08:00',
            endTime: '10:00',
            subject: '',
            room: '',
            specificDate: '',
            effectiveFrom: '',
            effectiveTo: '',
            teachingDepartmentId: ''
          });
          setSelectedDays(['Monday']);
          setScheduleType('recurring');
        } else {
          toast.error('Failed to add schedule');
        }
      }
    } catch (error) {
      console.error(error);
      toast.error('Connection error encountered');
    }
  };

  const handleDeleteSchedule = (id: string) => {
    setScheduleIdToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteSchedule = async () => {
    if (!scheduleIdToDelete) return;
    setIsDeleting(true);
    try {
      const response = await api.schedules.delete(scheduleIdToDelete);
      if (response && response.success) {
        toast.success('Schedule deleted successfully');
        fetchSchedules();
        setIsDeleteDialogOpen(false);
        setScheduleIdToDelete(null);
      } else {
        toast.error('Failed to delete schedule');
      }
    } catch (error) {
      toast.error('Connection error');
    } finally {
      setIsDeleting(false);
    }
  };

  const startEditSchedule = (schedule: Schedule) => {
    setEditingScheduleId(schedule.id);
    const emp = employees.find(e => e.id === schedule.employeeId);
    setEditFormCategoryFilter(role === 'department_head' ? 'Visiting Instructor' : (emp ? emp.category || 'all' : 'all'));
    setEditSchedule({
      employeeId: schedule.employeeId || '',
      dayOfWeek: schedule.dayOfWeek || 'Monday',
      startTime: schedule.startTime || '08:00',
      endTime: schedule.endTime || '10:00',
      subject: schedule.subject || '',
      room: schedule.room || '',
      specificDate: schedule.specificDate || '',
      effectiveFrom: schedule.effectiveFrom || '',
      effectiveTo: schedule.effectiveTo || '',
      teachingDepartmentId: schedule.teachingDepartmentId || (emp ? emp.teachingDepartmentId || '' : '')
    });
    setEditScheduleType(schedule.specificDate ? 'specific' : 'recurring');
    setIsEditOpen(true);
  };

  const handleEditSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingScheduleId) return;
    try {
      const payload = role === 'employee' ? { ...editSchedule, employeeId: user?.id } : editSchedule;
      const response = await api.schedules.update(editingScheduleId, payload);
      
      if (response && response.success) {
        toast.success('Schedule updated successfully');
        setIsEditOpen(false);
        setEditingScheduleId(null);
        fetchSchedules();
      } else {
        toast.error('Failed to update schedule');
      }
    } catch (error) {
      toast.error('Connection error');
    }
  };

  const get24HourMinutes = (timeStr: string): number => {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(':');
    if (parts.length < 2) return 0;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    return hours * 60 + minutes;
  };

  // Strictly filter then chronologically sort schedules
  const filteredSchedules = schedules.filter(s => {
    const matchesSearch = 
      s.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.room && s.room.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'all' || s.category === selectedCategory;
    const matchesEmployee = selectedEmployeeId === 'all' || s.employeeId === selectedEmployeeId;
    
    let matchesDepartment = true;
    if (selectedDepartmentId !== 'all') {
      const schDeptId = s.teachingDepartmentId;
      const empDeptId = employees.find(e => e.id === s.employeeId)?.teachingDepartmentId;
      matchesDepartment = (schDeptId === selectedDepartmentId) || (!schDeptId && empDeptId === selectedDepartmentId);
    }
    
    return matchesSearch && matchesCategory && matchesEmployee && matchesDepartment;
  });

  const sortedSchedules = [...filteredSchedules].sort((a, b) => {
    const dayDiff = (dayOrder[a.dayOfWeek] || 99) - (dayOrder[b.dayOfWeek] || 99);
    if (dayDiff !== 0) return dayDiff;
    return get24HourMinutes(a.startTime) - get24HourMinutes(b.startTime);
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      {/* Top Title and Control Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2 border-b border-neutral-100">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-neutral-900 font-sans">Schedules</h2>
          <p className="text-sm text-neutral-500 mt-1 font-medium">Manage and view teaching slots, duty hours, and class locations.</p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* View Mode Toggle Switch */}
          <div className="bg-neutral-100 p-1 rounded-xl flex items-center border border-neutral-200">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'grid' 
                  ? 'bg-white text-neutral-950 shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
              title="Board View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Weekly Board</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'list' 
                  ? 'bg-white text-neutral-950 shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
              title="Table View"
            >
              <List className="w-3.5 h-3.5" />
              <span>Table List</span>
            </button>
          </div>

          {isAdmin && (
            <>
              <SchoolApiSyncModal
                defaultTab="sync"
                triggerButton={
                  <Button 
                    variant="outline" 
                    className="gap-2 border-emerald-300 text-emerald-800 bg-emerald-50/70 hover:bg-emerald-100 rounded-xl font-sans text-xs h-11 px-4 shadow-sm"
                  >
                    <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                    Sync SIS Loads
                  </Button>
                }
              />
              <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogTrigger render={(props) => (
                  <Button {...props} className="gap-2 bg-neutral-950 hover:bg-neutral-800 text-white shadow-sm rounded-xl h-11 px-6 font-bold transition-all">
                    <Plus className="w-4.5 h-4.5" />
                    Add Schedule
                  </Button>
                )} />
              <DialogContent className="md:max-w-[850px] sm:max-w-[650px] w-[95%] max-h-[90vh] overflow-y-auto rounded-3xl p-6 md:p-8">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold tracking-tight text-neutral-900">
                    {isRegularEmp(newSchedule.employeeId)
                      ? 'Add Regular Work Schedule'
                      : 'Add New Class Schedule'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddSchedule} className="space-y-6 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                    
                    {/* Left Column: Scope & Schedule Type */}
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <Label htmlFor="add-employee-category" className="font-semibold text-neutral-700">Select Employee Category</Label>
                        <select
                          id="add-employee-category"
                          className="w-full h-11 bg-neutral-50 hover:bg-neutral-100/70 border border-neutral-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-neutral-200 transition-colors cursor-pointer text-neutral-800 font-medium disabled:opacity-75 disabled:cursor-not-allowed"
                          value={addFormCategoryFilter}
                          disabled={role === 'department_head'}
                          onChange={(e) => handleAddFormCategoryChange(e.target.value)}
                        >
                          {role === 'department_head' ? (
                            <option value="Visiting Instructor">📁 Visiting Instructor</option>
                          ) : (
                            <>
                              <option value="all">📁 All Categories</option>
                              {availableCategories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="employee" className="font-semibold text-neutral-700">Select Employee</Label>
                        <select 
                          id="employee"
                          className="w-full h-11 bg-neutral-50 hover:bg-neutral-100/70 border border-neutral-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-neutral-200 transition-colors"
                          value={newSchedule.employeeId}
                          onChange={(e) => handleEmployeeChangeInNewSchedule(e.target.value)}
                          required
                        >
                          <option value="">Select Employee</option>
                          {employees
                            .filter(emp => addFormCategoryFilter === 'all' || emp.category === addFormCategoryFilter)
                            .filter(emp => role !== 'department_head' || emp.teachingDepartmentId === myDepartment?.id)
                            .map(emp => (
                              <option key={emp.id} value={emp.id}>
                                {emp.lastName}, {emp.firstName} ({emp.category})
                              </option>
                            ))}
                        </select>
                      </div>

                      {isRegularEmp(newSchedule.employeeId) && (
                        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-2">
                          <p className="text-xs text-emerald-800 font-bold flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-emerald-600" />
                            Faculty / Staff Work Presets
                          </p>
                          <p className="text-[11px] text-emerald-700 leading-normal">
                            Instantly populate standard work schedules across standard days.
                          </p>
                          <div className="flex flex-col gap-2 pt-1">
                            <Button
                              type="button"
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs h-8 gap-1.5 font-semibold shadow-sm w-full"
                              onClick={() => handleAutoGenerateStandardSchedules(newSchedule.employeeId)}
                            >
                              ⚡ Generate Mon-Fri (8-11 AM & 1-5 PM)
                            </Button>
                            <div className="grid grid-cols-2 gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="text-[10px] h-7 border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-100 rounded-lg font-medium"
                                onClick={() => setNewSchedule(prev => ({
                                  ...prev,
                                  startTime: '08:00',
                                  endTime: '11:00',
                                  subject: 'Core Hours',
                                  room: 'Office'
                                }))}
                              >
                                Morning (8-11 AM)
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="text-[10px] h-7 border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-100 rounded-lg font-medium"
                                onClick={() => setNewSchedule(prev => ({
                                  ...prev,
                                  startTime: '13:00',
                                  endTime: '17:00',
                                  subject: 'Core Hours',
                                  room: 'Office'
                                }))}
                              >
                                Afternoon (1-5 PM)
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-neutral-500">Schedule Type</Label>
                        <div className="flex gap-6">
                          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer text-neutral-700 hover:text-neutral-900 transition-colors">
                            <input 
                              type="radio" 
                              name="scheduleType" 
                              checked={scheduleType === 'recurring'} 
                              onChange={() => {
                                setScheduleType('recurring');
                                setNewSchedule(prev => ({ ...prev, specificDate: '' }));
                              }}
                              className="accent-neutral-900 w-4 h-4 cursor-pointer"
                            />
                            Weekly Recurring
                          </label>
                          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer text-neutral-700 hover:text-neutral-900 transition-colors">
                            <input 
                              type="radio" 
                              name="scheduleType" 
                              checked={scheduleType === 'specific'} 
                              onChange={() => setScheduleType('specific')}
                              className="accent-neutral-900 w-4 h-4 cursor-pointer"
                            />
                            Specific Date
                          </label>
                        </div>
                      </div>

                      {scheduleType === 'recurring' ? (
                        <div className="space-y-3 bg-neutral-50 p-4 rounded-2xl border border-neutral-100">
                          <Label className="text-xs font-bold uppercase tracking-wider text-neutral-600">
                            Select Recurring Days
                          </Label>
                          <p className="text-[11px] text-neutral-500 leading-normal">
                            Choose active days of the week (multiple allowed). This creates matching slots for each selected day!
                          </p>
                          <div className="grid grid-cols-4 gap-1.5 pt-1">
                            {days.map((day) => {
                              const isSelected = selectedDays.includes(day);
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => toggleDay(day)}
                                  className={`py-2 px-1 text-xs font-bold rounded-lg transition-all border text-center duration-150 min-h-[40px] flex items-center justify-center ${
                                    isSelected
                                      ? "bg-blue-950 text-white border-blue-950 shadow-sm"
                                      : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-100 hover:text-neutral-950"
                                  }`}
                                >
                                  {shortDays[day]}
                                </button>
                              );
                            })}
                          </div>
                          <div className="pt-1.5 select-none flex items-center gap-1.5">
                            <Badge className="bg-blue-50 text-blue-950 border border-blue-200 font-bold text-[10px] px-2 py-0">
                              Selected
                            </Badge>
                            <span className="text-[10px] text-neutral-600 font-semibold truncate max-w-[200px]">
                              {selectedDays.join(', ')}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label htmlFor="specificDate" className="font-semibold text-neutral-700">Specific Date</Label>
                          <Input 
                            id="specificDate" 
                            type="date" 
                            className="rounded-xl h-11 bg-neutral-50 border border-neutral-200 px-3 text-sm focus:ring-2 focus:ring-neutral-200 focus-visible:ring-2 focus-visible:ring-neutral-200"
                            value={newSchedule.specificDate}
                            onChange={(e) => {
                              const dateVal = e.target.value;
                              if (dateVal) {
                                const parts = dateVal.split('-');
                                const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                                const yr = Number(parts[0]);
                                const mo = Number(parts[1]);
                                const dy = Number(parts[2]);
                                const dt = new Date(yr, mo - 1, dy);
                                const dayName = daysOfWeek[dt.getDay()];
                                setNewSchedule({
                                  ...newSchedule,
                                  specificDate: dateVal,
                                  dayOfWeek: dayName
                                });
                              } else {
                                setNewSchedule({
                                  ...newSchedule,
                                  specificDate: ''
                                });
                              }
                            }}
                            required 
                          />
                        </div>
                      )}
                    </div>

                    {/* Right Column: Timing, Subject & Metadata */}
                    <div className="space-y-5">
                      {isRegularEmp(newSchedule.employeeId) ? (
                        <div className="space-y-2">
                          <Label htmlFor="subject" className="font-semibold text-neutral-700">
                            Regular Work Type
                          </Label>
                          <Input 
                            id="subject" 
                            placeholder="e.g. Core Hours, Research, Consultation" 
                            className="rounded-xl h-11 bg-neutral-50 border border-neutral-200 focus:ring-2 focus:ring-neutral-200 focus-visible:ring-2 focus-visible:ring-neutral-200 px-3 text-sm"
                            value={newSchedule.subject}
                            onChange={(e) => setNewSchedule({...newSchedule, subject: e.target.value})}
                            required 
                          />
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="teachingDepartmentId" className="font-semibold text-neutral-700">Department</Label>
                            <select
                              id="teachingDepartmentId"
                              className="w-full h-11 bg-neutral-50 hover:bg-neutral-100/70 border border-neutral-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-neutral-200 transition-colors cursor-pointer text-neutral-800 font-medium disabled:opacity-75 disabled:cursor-not-allowed"
                              value={newSchedule.teachingDepartmentId || ''}
                              onChange={(e) => {
                                setNewSchedule({
                                  ...newSchedule,
                                  teachingDepartmentId: e.target.value,
                                  subject: ''
                                });
                              }}
                              required
                              disabled={role === 'department_head'}
                            >
                              {role !== 'department_head' && <option value="">Select Department</option>}
                              {departments
                                .filter(dept => role !== 'department_head' || dept.id === myDepartment?.id)
                                .map(dept => (
                                  <option key={dept.id} value={dept.id}>
                                    {dept.name} ({dept.code})
                                  </option>
                                ))
                              }
                            </select>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="subject" className="font-semibold text-neutral-700">Subject / Class Name</Label>
                            <select
                              id="subject"
                              className="w-full h-11 bg-neutral-50 hover:bg-neutral-100/70 border border-neutral-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-neutral-200 transition-colors cursor-pointer text-neutral-800 font-medium"
                              value={newSchedule.subject}
                              onChange={(e) => setNewSchedule({...newSchedule, subject: e.target.value})}
                              required
                            >
                              <option value="">Select Subject</option>
                              {subjects
                                .filter(sub => sub.departmentId === newSchedule.teachingDepartmentId)
                                .map(sub => (
                                  <option key={sub.id} value={`${sub.code} - ${sub.name}`}>
                                    {sub.code} - {sub.name} ({sub.units} units)
                                  </option>
                                ))}
                            </select>
                            {newSchedule.teachingDepartmentId && subjects.filter(sub => sub.departmentId === newSchedule.teachingDepartmentId).length === 0 && (
                              <p className="text-xs text-amber-600 font-semibold mt-1">
                                No subjects found for this department. Add subjects in Curriculum/Departments page first.
                              </p>
                            )}
                          </div>
                        </>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="room" className="font-semibold text-neutral-700">Room / Location</Label>
                        <Input 
                          id="room" 
                          placeholder="e.g. Lab 4 / Online / Field" 
                          className="rounded-xl h-11 bg-neutral-50 border border-neutral-200 focus:ring-2 focus:ring-neutral-200 focus-visible:ring-2 focus-visible:ring-neutral-200 px-3 text-sm"
                          value={newSchedule.room}
                          onChange={(e) => setNewSchedule({...newSchedule, room: e.target.value})}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="startTime" className="font-semibold text-neutral-700">Start Time</Label>
                          <Input 
                            id="startTime" 
                            type="time" 
                            className="rounded-xl h-11 bg-neutral-50 border border-neutral-200 focus:ring-2 focus:ring-neutral-200 focus-visible:ring-2 focus-visible:ring-neutral-200 px-3 text-sm"
                            value={newSchedule.startTime}
                            onChange={(e) => setNewSchedule({...newSchedule, startTime: autoPmTime(e.target.value)})}
                            required 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="endTime" className="font-semibold text-neutral-700">End Time</Label>
                          <Input 
                            id="endTime" 
                            type="time" 
                            className="rounded-xl h-11 bg-neutral-50 border border-neutral-200 focus:ring-2 focus:ring-neutral-200 focus-visible:ring-2 focus-visible:ring-neutral-200 px-3 text-sm"
                            value={newSchedule.endTime}
                            onChange={(e) => setNewSchedule({...newSchedule, endTime: autoPmTime(e.target.value)})}
                            required 
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="effectiveFrom" className="font-semibold text-neutral-700">Effective From</Label>
                          <Input 
                            id="effectiveFrom" 
                            type="date" 
                            className="rounded-xl h-11 bg-neutral-50 border border-neutral-200 px-3 text-sm focus:ring-2 focus:ring-neutral-200 focus-visible:ring-2 focus-visible:ring-neutral-200"
                            value={newSchedule.effectiveFrom}
                            onChange={(e) => setNewSchedule({...newSchedule, effectiveFrom: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="effectiveTo" className="font-semibold text-neutral-700">Effective To</Label>
                          <Input 
                            id="effectiveTo" 
                            type="date" 
                            className="rounded-xl h-11 bg-neutral-50 border border-neutral-200 px-3 text-sm focus:ring-2 focus:ring-neutral-200 focus-visible:ring-2 focus-visible:ring-neutral-200"
                            value={newSchedule.effectiveTo}
                            onChange={(e) => setNewSchedule({...newSchedule, effectiveTo: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>

                  </div>

                  <DialogFooter className="pt-4 border-t border-neutral-100 flex gap-2 justify-end">
                    <Button type="button" variant="ghost" onClick={() => setIsAddOpen(false)} className="rounded-xl h-11 font-medium text-neutral-600 hover:bg-neutral-100 transition-colors">
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-neutral-900 text-white rounded-xl h-11 px-6 hover:bg-neutral-800 transition-colors font-bold">
                      Save Schedules
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            </>
          )}
        </div>
      </div>

      {/* Top Professional Stats widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border border-neutral-200 shadow-sm bg-white rounded-3xl overflow-hidden hover:shadow-md transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                <CalendarIcon className="w-6 h-6" />
              </div>
              <div className="truncate">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Total Active Schedules</p>
                <p className="text-2xl font-extrabold text-neutral-900 mt-0.5">{loading ? '...' : sortedSchedules.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border border-neutral-200 shadow-sm bg-white rounded-3xl overflow-hidden hover:shadow-md transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                <Clock className="w-6 h-6" />
              </div>
              <div className="truncate">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Active Weekly Days</p>
                <p className="text-2xl font-extrabold text-neutral-900 mt-0.5">
                  {loading ? '...' : `${new Set(sortedSchedules.map(s => s.dayOfWeek)).size} / 7`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-neutral-200 shadow-sm bg-white rounded-3xl overflow-hidden hover:shadow-md transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                <BookOpen className="w-6 h-6" />
              </div>
              <div className="truncate">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Tracked Duties / Subjects</p>
                <p className="text-2xl font-extrabold text-neutral-900 mt-0.5">
                  {loading ? '...' : new Set(sortedSchedules.map(s => s.subject)).size}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Filter Suite */}
      <Card className="border border-neutral-200 shadow-sm bg-white rounded-3xl">
        <CardHeader className="p-6 border-b border-neutral-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="w-full relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input 
              placeholder="Search subject, room or employee name..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 bg-neutral-50 hover:bg-neutral-100/50 border border-neutral-200 rounded-xl focus-visible:ring-2 focus-visible:ring-neutral-200 focus:bg-white transition-all text-sm"
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {isAdmin && (
              <>
                <div className="w-full sm:w-48">
                  <select
                    className="w-full h-11 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl px-3 text-xs focus:ring-2 focus:ring-neutral-200 cursor-pointer text-neutral-700 font-bold transition-all disabled:opacity-75 disabled:cursor-not-allowed"
                    value={selectedDepartmentId}
                    onChange={(e) => setSelectedDepartmentId(e.target.value)}
                    disabled={role === 'department_head'}
                  >
                    {role !== 'department_head' && <option value="all">🏫 All Departments</option>}
                    {departments
                      .filter(dept => role !== 'department_head' || dept.id === myDepartment?.id)
                      .map(dept => (
                        <option key={dept.id} value={dept.id}>
                          🏫 {dept.code} Department
                        </option>
                      ))
                    }
                  </select>
                </div>
                <div className="w-full sm:w-48">
                  <select
                    className="w-full h-11 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl px-3 text-xs focus:ring-2 focus:ring-neutral-200 cursor-pointer text-neutral-700 font-bold transition-all disabled:opacity-75"
                    value={selectedCategory}
                    disabled={role === 'department_head'}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value);
                      setSelectedEmployeeId('all');
                    }}
                  >
                    {role === 'department_head' ? (
                      <option value="Visiting Instructor">📁 Visiting Instructor</option>
                    ) : (
                      <>
                        <option value="all">📁 All Categories</option>
                        <option value="FACULTY">Faculty</option>
                        <option value="STAFF">Staff</option>
                        <option value="Job Order">Job Order</option>
                        <option value="Visiting Instructor">Visiting Instructor</option>
                      </>
                    )}
                  </select>
                </div>
                <div className="w-full sm:w-48">
                  <select
                    className="w-full h-11 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl px-3 text-xs focus:ring-2 focus:ring-neutral-200 cursor-pointer text-neutral-700 font-bold transition-all"
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  >
                    <option value="all">👤 All Employees</option>
                    {employees
                      .filter(emp => selectedCategory === 'all' || emp.category === selectedCategory)
                      .filter(emp => role !== 'department_head' || emp.teachingDepartmentId === myDepartment?.id)
                      .map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.lastName}, {emp.firstName}
                        </option>
                      ))
                    }
                  </select>
                </div>
              </>
            )}
          </div>
        </CardHeader>

        {/* Dynamic Display area depending on viewMode (Weekly Grid vs Table List) */}
        <CardContent className="p-6">
          {viewMode === 'grid' ? (
            /* =========================================================================
               NEW WEEKLY BOARD VIEW
               ========================================================================= */
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-500 uppercase tracking-widest px-1">
                <Info className="w-3.5 h-3.5 text-blue-500" />
                <span>Weekly Schedule Board (Monday - Sunday chronological cards)</span>
              </div>
              
              {loading ? (
                <div className="py-20 text-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-neutral-900 mx-auto"></div>
                  <p className="text-xs font-bold text-neutral-500 mt-4 uppercase tracking-widest animate-pulse">Loading Planner Grid...</p>
                </div>
              ) : sortedSchedules.length === 0 ? (
                <div className="py-20 text-center border-2 border-dashed border-neutral-100 rounded-2xl bg-neutral-50/50">
                  <span className="text-sm font-semibold text-neutral-500">No active schedules match current filters.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
                  {days.map((dayOfWeek) => {
                    const daySlots = sortedSchedules.filter(s => s.dayOfWeek === dayOfWeek);
                    const isToday = new Date().toLocaleDateString('en-US', { weekday: 'long' }) === dayOfWeek;
                    
                    return (
                      <div 
                        key={dayOfWeek} 
                        className={`flex flex-col bg-neutral-50/75 rounded-2xl border p-3.5 h-full min-h-[400px] transition-all relative ${
                          isToday 
                            ? 'border-blue-300 ring-2 ring-blue-50/50 bg-blue-50/10' 
                            : 'border-neutral-200/65'
                        }`}
                      >
                        {/* Day Column Header */}
                        <div className="flex items-center justify-between pb-3.5 border-b border-neutral-200/60 mb-3">
                          <span className="font-bold text-sm text-neutral-800">{dayOfWeek}</span>
                          <span className={`text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded-md ${
                            daySlots.length > 0 
                              ? 'bg-neutral-900 text-white' 
                              : 'bg-neutral-200 text-neutral-500'
                          }`}>
                            {daySlots.length}
                          </span>
                        </div>

                        {/* Schedule list inside day Column */}
                        <div className="space-y-3 flex-1 overflow-visible">
                          {daySlots.length === 0 ? (
                            <div className="h-full flex items-center justify-center py-10 opacity-40 select-none">
                              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider text-center">Rest Day</p>
                            </div>
                          ) : (
                            daySlots.map((slot) => (
                              <div 
                                key={slot.id} 
                                onClick={() => {
                                  setViewingSchedule(slot);
                                  setIsViewOpen(true);
                                }}
                                className="group bg-white border border-neutral-200 p-3 rounded-xl shadow-sm hover:shadow-md hover:border-neutral-300 transition-all duration-150 relative overflow-visible cursor-pointer hover:scale-[1.01] hover:ring-2 hover:ring-neutral-100"
                              >
                                {/* Header / Time Duration */}
                                <div className="text-[10px] font-bold font-mono text-neutral-600 flex items-center gap-1 mb-1 bg-neutral-50 px-1.5 py-0.5 rounded-md w-fit">
                                  <Clock className="w-2.5 h-2.5 text-neutral-500" />
                                  <span>
                                    {formatTimeTo12Hour(slot.startTime)} - {formatTimeTo12Hour(slot.endTime)}
                                  </span>
                                </div>

                                {/* Subject Details */}
                                <div className="font-bold text-xs text-neutral-900 flex items-center gap-1.5 mb-1.5">
                                  {(slot.category === 'Regular Employee' || slot.category === 'FACULTY' || slot.category === 'STAFF') ? (
                                    <Clock className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                                  ) : (
                                    <BookOpen className="w-3 h-3 text-blue-500 flex-shrink-0" />
                                  )}
                                  <span className="truncate" title={slot.subject}>{slot.subject}</span>
                                </div>

                                {/* Location Details */}
                                <div className="text-[10px] text-neutral-500 flex items-center justify-between gap-1 font-semibold mb-1">
                                  <div className="flex items-center gap-1 min-w-0">
                                    <MapPin className="w-2.5 h-2.5 flex-shrink-0 text-neutral-400" />
                                    <span className="truncate">{slot.room || 'No Room'}</span>
                                  </div>
                                  {slot.teachingDepartmentId && (() => {
                                    const dept = departments.find(d => d.id === slot.teachingDepartmentId);
                                    return dept ? (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-neutral-100 text-neutral-700 whitespace-nowrap">
                                        {dept.code}
                                      </span>
                                    ) : null;
                                  })()}
                                </div>

                                {/* Instructor details */}
                                <div className="text-[10px] text-neutral-700 font-bold flex items-center gap-1.5 pt-1.5 border-t border-neutral-100">
                                  <User className="w-2.5 h-2.5 text-neutral-400 flex-shrink-0" />
                                  <span className="truncate">{slot.lastName}, {slot.firstName}</span>
                                </div>

                                {/* Effective Dates if specified */}
                                {(slot.effectiveFrom || slot.effectiveTo) && (
                                  <div className="text-[8px] text-neutral-400 font-medium italic mt-1 leading-tight">
                                    Eff: {slot.effectiveFrom ? formatEffDate(slot.effectiveFrom) : 'Start'} to {slot.effectiveTo ? formatEffDate(slot.effectiveTo) : 'End'}
                                  </div>
                                )}

                                {/* Specific Single-Date Override flag */}
                                {slot.specificDate && (
                                  <Badge className="absolute -top-1.5 -right-1.5 bg-rose-100 text-rose-700 border-rose-200 text-[8px] px-1 py-0 font-extrabold hover:bg-rose-100">
                                    Date Locked
                                  </Badge>
                                )}

                                {/* Admin Editing Rails overlay (on hovering the card) */}
                                {isAdmin && (
                                  <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 pl-1.5 rounded-lg shadow-sm">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        startEditSchedule(slot);
                                      }}
                                      className="p-1 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50 rounded"
                                      title="Edit Schedule"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteSchedule(slot.id);
                                      }}
                                      className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                                      title="Delete Schedule"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* =========================================================================
               STANDARD TRADITIONAL TABLE LIST VIEW
               ========================================================================= */
            <div className="rounded-2xl border border-neutral-100 overflow-hidden">
              <Table>
                <TableHeader className="bg-neutral-50">
                  <TableRow>
                    <TableHead className="font-bold text-neutral-700">Day</TableHead>
                    <TableHead className="font-bold text-neutral-700">Time</TableHead>
                    <TableHead className="font-bold text-neutral-700">
                      {(selectedCategory === 'Regular Employee' || selectedCategory === 'FACULTY' || selectedCategory === 'STAFF') ? 'Regular Duty Type' : 'Subject / Duty Type'}
                    </TableHead>
                    {isAdmin && <TableHead className="font-bold text-neutral-700">Employee Name</TableHead>}
                    <TableHead className="font-bold text-neutral-700">Room</TableHead>
                    {isAdmin && <TableHead className="text-right font-bold text-neutral-700 w-[120px]">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-900 mx-auto"></div>
                      </TableCell>
                    </TableRow>
                  ) : sortedSchedules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-neutral-500">
                        No matching schedules found. Get started by clicking "Add Schedule".
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedSchedules.map((schedule) => (
                      <TableRow 
                        key={schedule.id} 
                        onClick={() => {
                          setViewingSchedule(schedule);
                          setIsViewOpen(true);
                        }}
                        className="hover:bg-neutral-50/50 transition-colors cursor-pointer"
                      >
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="rounded-lg bg-blue-50 text-blue-900 border-none font-bold px-2 py-0.5 w-fit">
                              {schedule.dayOfWeek}
                            </Badge>
                            {schedule.specificDate && (
                              <span className="text-[10px] text-neutral-500 font-semibold italic">
                                {(() => {
                                  const parts = schedule.specificDate.split('-');
                                  if (parts.length === 3) {
                                    const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                                    return dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                                  }
                                  return schedule.specificDate;
                                })()}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-xs text-neutral-900 font-bold">
                              {formatTimeTo12Hour(schedule.startTime)} - {formatTimeTo12Hour(schedule.endTime)}
                            </span>
                            {(schedule.effectiveFrom || schedule.effectiveTo) && (
                              <span className="text-[10px] text-neutral-500 font-semibold italic whitespace-nowrap">
                                Effective: {schedule.effectiveFrom ? formatEffDate(schedule.effectiveFrom) : 'Start'} to {schedule.effectiveTo ? formatEffDate(schedule.effectiveTo) : 'End'}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {(schedule.category === 'Regular Employee' || schedule.category === 'FACULTY' || schedule.category === 'STAFF') ? (
                              <Clock className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                            )}
                            <span className="font-bold text-neutral-900 text-sm">{schedule.subject}</span>
                            {schedule.teachingDepartmentId && (() => {
                              const dept = departments.find(d => d.id === schedule.teachingDepartmentId);
                              return dept ? (
                                <Badge variant="secondary" className="rounded-md bg-neutral-100 text-neutral-800 font-bold text-[10px] border-none px-1.5 py-0.5">
                                  {dept.code}
                                </Badge>
                              ) : null;
                            })()}
                          </div>
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-neutral-600 font-semibold text-sm">
                            {schedule.lastName}, {schedule.firstName}
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                            <span className="text-sm text-neutral-600 font-medium">{schedule.room || 'N/A'}</span>
                          </div>
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-lg h-9 w-9"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditSchedule(schedule);
                                }}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg h-9 w-9"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteSchedule(schedule.id);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* =========================================================================
         EDIT SCHEDULE DIALOG (FULLY HORIZONTAL & POLISHED MATCHING ADD DIALOG)
         ========================================================================= */}
      {isAdmin && (
        <Dialog open={isEditOpen} onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) setEditingScheduleId(null);
        }}>
          <DialogContent className="md:max-w-[850px] sm:max-w-[650px] w-[95%] max-h-[90vh] overflow-y-auto rounded-3xl p-6 md:p-8">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold tracking-tight text-neutral-900">
                {isRegularEmp(editSchedule.employeeId)
                  ? 'Edit Regular Work Schedule'
                  : 'Edit Class Schedule'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSchedule} className="space-y-6 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                
                {/* Left Column: Scope & Schedule Type */}
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="edit-employee-category" className="font-semibold text-neutral-700">Select Employee Category</Label>
                    <select
                      id="edit-employee-category"
                      className="w-full h-11 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-neutral-200 transition-colors cursor-pointer text-neutral-800 font-medium disabled:opacity-75 disabled:cursor-not-allowed"
                      value={editFormCategoryFilter}
                      disabled={role === 'department_head'}
                      onChange={(e) => handleEditFormCategoryChange(e.target.value)}
                    >
                      {role === 'department_head' ? (
                        <option value="Visiting Instructor">📁 Visiting Instructor</option>
                      ) : (
                        <>
                          <option value="all">📁 All Categories</option>
                          {availableCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </>
                      )}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-employee" className="font-semibold text-neutral-700">Select Employee</Label>
                    <select 
                      id="edit-employee"
                      className="w-full h-11 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-neutral-200 transition-colors"
                      value={editSchedule.employeeId}
                      onChange={(e) => setEditSchedule({...editSchedule, employeeId: e.target.value})}
                      required
                    >
                      <option value="">Select Employee</option>
                      {employees
                        .filter(emp => editFormCategoryFilter === 'all' || emp.category === editFormCategoryFilter)
                        .map(emp => (
                          <option key={emp.id} value={emp.id}>
                            {emp.lastName}, {emp.firstName} ({emp.category})
                          </option>
                        ))}
                    </select>
                  </div>

                  {isRegularEmp(editSchedule.employeeId) && (
                    <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-2">
                      <p className="text-xs text-emerald-800 font-bold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        Faculty / Staff Work Presets
                      </p>
                      <div className="flex gap-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-[10px] h-7 border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-100 rounded-lg font-bold w-full"
                          onClick={() => setEditSchedule(prev => ({
                            ...prev,
                            startTime: '08:00',
                            endTime: '11:00',
                            subject: 'Core Hours',
                            room: 'Office'
                          }))}
                        >
                          Morning (8-11 AM)
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-[10px] h-7 border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-100 rounded-lg font-bold w-full"
                          onClick={() => setEditSchedule(prev => ({
                            ...prev,
                            startTime: '13:00',
                            endTime: '17:00',
                            subject: 'Core Hours',
                            room: 'Office'
                          }))}
                        >
                          Afternoon (1-5 PM)
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    <Label className="text-xs font-bold uppercase tracking-wider text-neutral-500">Schedule Type</Label>
                    <div className="flex gap-6">
                      <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer text-neutral-700 hover:text-neutral-900 transition-colors">
                        <input 
                          type="radio" 
                          name="editScheduleType" 
                          checked={editScheduleType === 'recurring'} 
                          onChange={() => {
                            setEditScheduleType('recurring');
                            setEditSchedule(prev => ({ ...prev, specificDate: '' }));
                          }}
                          className="accent-neutral-900 w-4 h-4 cursor-pointer"
                        />
                        Weekly Recurring
                      </label>
                      <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer text-neutral-700 hover:text-neutral-900 transition-colors">
                        <input 
                          type="radio" 
                          name="editScheduleType" 
                          checked={editScheduleType === 'specific'} 
                          onChange={() => setEditScheduleType('specific')}
                          className="accent-neutral-900 w-4 h-4 cursor-pointer"
                        />
                        Specific Date
                      </label>
                    </div>
                  </div>

                  {editScheduleType === 'recurring' ? (
                    <div className="space-y-3 bg-neutral-50 p-4 rounded-2xl border border-neutral-100">
                      <Label className="text-xs font-bold uppercase tracking-wider text-neutral-600">
                        Choose Day
                      </Label>
                      <p className="text-[11px] text-neutral-500 leading-normal">
                        Select the active day of the week for this active resource schedule.
                      </p>
                      <div className="grid grid-cols-4 gap-1.5 pt-1">
                        {days.map((day) => {
                          const isSelected = editSchedule.dayOfWeek === day;
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => setEditSchedule({ ...editSchedule, dayOfWeek: day })}
                              className={`py-2 px-1 text-xs font-bold rounded-lg transition-all border text-center duration-150 min-h-[40px] flex items-center justify-center ${
                                isSelected
                                  ? "bg-blue-950 text-white border-blue-950 shadow-sm"
                                  : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-100 hover:text-neutral-950"
                              }`}
                            >
                              {shortDays[day]}
                            </button>
                          );
                        })}
                      </div>
                      <div className="pt-1.5 select-none flex items-center gap-1.5">
                        <Badge className="bg-blue-50 text-blue-950 border border-blue-200 font-bold text-[10px] px-2 py-0">
                          Selected
                        </Badge>
                        <span className="text-[10px] text-neutral-600 font-semibold">
                          {editSchedule.dayOfWeek}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="edit-specificDate" className="font-semibold text-neutral-700">Specific Date</Label>
                      <Input 
                        id="edit-specificDate" 
                        type="date" 
                        className="rounded-xl h-11 bg-neutral-50 border border-neutral-200 px-3 text-sm focus:ring-2 focus:ring-neutral-200 focus-visible:ring-2 focus-visible:ring-neutral-200"
                        value={editSchedule.specificDate}
                        onChange={(e) => {
                          const dateVal = e.target.value;
                          if (dateVal) {
                            const parts = dateVal.split('-');
                            const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                            const yr = Number(parts[0]);
                            const mo = Number(parts[1]);
                            const dy = Number(parts[2]);
                            const dt = new Date(yr, mo - 1, dy);
                            const dayName = daysOfWeek[dt.getDay()];
                            setEditSchedule({
                              ...editSchedule,
                              specificDate: dateVal,
                              dayOfWeek: dayName
                            });
                          } else {
                            setEditSchedule({
                              ...editSchedule,
                              specificDate: ''
                            });
                          }
                        }}
                        required 
                      />
                    </div>
                  )}
                </div>

                {/* Right Column: Timing, Subject & Metadata */}
                <div className="space-y-5">
                  {isRegularEmp(editSchedule.employeeId) ? (
                    <div className="space-y-2">
                      <Label htmlFor="edit-subject" className="font-semibold text-neutral-700">
                        Regular Work Type
                      </Label>
                      <Input 
                        id="edit-subject" 
                        placeholder="e.g. Core Hours, Research, Consultation" 
                        className="rounded-xl h-11 bg-neutral-50 border border-neutral-200 focus:ring-2 focus:ring-neutral-200 focus-visible:ring-2 focus-visible:ring-neutral-200 px-3 text-sm"
                        value={editSchedule.subject}
                        onChange={(e) => setEditSchedule({...editSchedule, subject: e.target.value})}
                        required 
                      />
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="edit-teachingDepartmentId" className="font-semibold text-neutral-700">Department</Label>
                        <select
                          id="edit-teachingDepartmentId"
                          className="w-full h-11 bg-neutral-50 hover:bg-neutral-100/70 border border-neutral-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-neutral-200 transition-colors cursor-pointer text-neutral-800 font-medium disabled:opacity-75 disabled:cursor-not-allowed"
                          value={editSchedule.teachingDepartmentId || ''}
                          onChange={(e) => {
                            setEditSchedule({
                              ...editSchedule,
                              teachingDepartmentId: e.target.value,
                              subject: ''
                            });
                          }}
                          required
                          disabled={role === 'department_head'}
                        >
                          {role !== 'department_head' && <option value="">Select Department</option>}
                          {departments
                            .filter(dept => role !== 'department_head' || dept.id === myDepartment?.id)
                            .map(dept => (
                              <option key={dept.id} value={dept.id}>
                                {dept.name} ({dept.code})
                              </option>
                            ))
                          }
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="edit-subject" className="font-semibold text-neutral-700">Subject / Class Name</Label>
                        <select
                          id="edit-subject"
                          className="w-full h-11 bg-neutral-50 hover:bg-neutral-100/70 border border-neutral-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-neutral-200 transition-colors cursor-pointer text-neutral-800 font-medium"
                          value={editSchedule.subject}
                          onChange={(e) => setEditSchedule({...editSchedule, subject: e.target.value})}
                          required
                        >
                          <option value="">Select Subject</option>
                          {subjects
                            .filter(sub => sub.departmentId === editSchedule.teachingDepartmentId)
                            .map(sub => (
                              <option key={sub.id} value={`${sub.code} - ${sub.name}`}>
                                {sub.code} - {sub.name} ({sub.units} units)
                              </option>
                            ))}
                        </select>
                        {editSchedule.teachingDepartmentId && subjects.filter(sub => sub.departmentId === editSchedule.teachingDepartmentId).length === 0 && (
                          <p className="text-xs text-amber-600 font-semibold mt-1">
                            No subjects found for this department. Add subjects in Curriculum/Departments page first.
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="edit-room" className="font-semibold text-neutral-700">Room / Location</Label>
                    <Input 
                      id="edit-room" 
                      placeholder="e.g. Lab 4 / Online / Field" 
                      className="rounded-xl h-11 bg-neutral-50 border border-neutral-200 focus:ring-2 focus:ring-neutral-200 focus-visible:ring-2 focus-visible:ring-neutral-200 px-3 text-sm"
                      value={editSchedule.room}
                      onChange={(e) => setEditSchedule({...editSchedule, room: e.target.value})}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-startTime" className="font-semibold text-neutral-700">Start Time</Label>
                      <Input 
                        id="edit-startTime" 
                        type="time" 
                        className="rounded-xl h-11 bg-neutral-50 border border-neutral-200 focus:ring-2 focus:ring-neutral-200 focus-visible:ring-2 focus-visible:ring-neutral-200 px-3 text-sm"
                        value={editSchedule.startTime}
                        onChange={(e) => setEditSchedule({...editSchedule, startTime: autoPmTime(e.target.value)})}
                        required 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-endTime" className="font-semibold text-neutral-700">End Time</Label>
                      <Input 
                        id="edit-endTime" 
                        type="time" 
                        className="rounded-xl h-11 bg-neutral-50 border border-neutral-200 focus:ring-2 focus:ring-neutral-200 focus-visible:ring-2 focus-visible:ring-neutral-200 px-3 text-sm"
                        value={editSchedule.endTime}
                        onChange={(e) => setEditSchedule({...editSchedule, endTime: autoPmTime(e.target.value)})}
                        required 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-effectiveFrom" className="font-semibold text-neutral-700">Effective From</Label>
                      <Input 
                        id="edit-effectiveFrom" 
                        type="date" 
                        className="rounded-xl h-11 bg-neutral-50 border border-neutral-200 px-3 text-sm focus:ring-2 focus:ring-neutral-200 focus-visible:ring-2 focus-visible:ring-neutral-200"
                        value={editSchedule.effectiveFrom}
                        onChange={(e) => setEditSchedule({...editSchedule, effectiveFrom: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-effectiveTo" className="font-semibold text-neutral-700">Effective To</Label>
                      <Input 
                        id="edit-effectiveTo" 
                        type="date" 
                        className="rounded-xl h-11 bg-neutral-50 border border-neutral-200 px-3 text-sm focus:ring-2 focus:ring-neutral-200 focus-visible:ring-2 focus-visible:ring-neutral-200 font-medium"
                        value={editSchedule.effectiveTo}
                        onChange={(e) => setEditSchedule({...editSchedule, effectiveTo: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

              </div>

              <DialogFooter className="pt-4 border-t border-neutral-100 flex flex-row items-center justify-between gap-2">
                {editingScheduleId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditOpen(false);
                      handleDeleteSchedule(editingScheduleId);
                    }}
                    className="border-rose-200 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl h-11 px-4 font-bold transition-all flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4 text-rose-500" />
                    Delete Schedule
                  </Button>
                )}
                <div className="flex gap-2 justify-end ml-auto">
                  <Button type="button" variant="ghost" onClick={() => { setIsEditOpen(false); setEditingScheduleId(null); }} className="rounded-xl h-11 font-medium text-neutral-600 hover:bg-neutral-100 transition-colors">
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-neutral-900 text-white rounded-xl h-11 px-6 hover:bg-neutral-800 transition-colors font-bold">
                    Update Schedule
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* =========================================================================
         VIEW SCHEDULE DIALOG
         ========================================================================= */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="sm:max-w-[550px] w-[95%] rounded-3xl p-6 md:p-8 bg-white border border-neutral-100 shadow-xl">
          <DialogHeader className="border-b border-neutral-100 pb-4 mb-4">
            <DialogTitle className="text-xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-blue-600" />
              <span>Schedule Details</span>
            </DialogTitle>
          </DialogHeader>

          {viewingSchedule && (
            <div className="space-y-6">
              {/* Header Info / Subject Card */}
              <div className="bg-neutral-50/70 border border-neutral-200/50 rounded-2xl p-4 flex items-start gap-3.5">
                <div className={`p-3.5 rounded-xl ${
                  (viewingSchedule.category === 'Regular Employee' || viewingSchedule.category === 'FACULTY' || viewingSchedule.category === 'STAFF')
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-blue-50 text-blue-600'
                }`}>
                  {(viewingSchedule.category === 'Regular Employee' || viewingSchedule.category === 'FACULTY' || viewingSchedule.category === 'STAFF') ? (
                    <Clock className="w-6 h-6 stroke-[2.5px]" />
                  ) : (
                    <BookOpen className="w-6 h-6 stroke-[2.5px]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-0.5">
                    {(viewingSchedule.category === 'Regular Employee' || viewingSchedule.category === 'FACULTY' || viewingSchedule.category === 'STAFF') ? 'Work / Duty Type' : 'Course Subject'}
                  </div>
                  <h4 className="font-extrabold text-neutral-900 text-lg leading-tight truncate">
                    {viewingSchedule.subject}
                  </h4>
                  {viewingSchedule.teachingDepartmentId && (() => {
                    const dept = departments.find(d => d.id === viewingSchedule.teachingDepartmentId);
                    return dept ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1e74f1] mt-1.5 bg-[#e2ebf8] px-2.5 py-1 rounded-lg">
                        {dept.name} ({dept.code})
                      </span>
                    ) : null;
                  })()}
                </div>
              </div>

              {/* Information Grid */}
              <div className="grid grid-cols-2 gap-4">
                {/* Day & Time */}
                <div className="space-y-1 bg-neutral-50/40 p-3.5 rounded-xl border border-neutral-100">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Day & Time</span>
                  <div className="font-bold text-neutral-800 text-sm mt-0.5">
                    {viewingSchedule.dayOfWeek}
                  </div>
                  <div className="font-semibold text-neutral-600 text-xs mt-0.5 font-mono">
                    {formatTimeTo12Hour(viewingSchedule.startTime)} - {formatTimeTo12Hour(viewingSchedule.endTime)}
                  </div>
                </div>

                {/* Location / Room */}
                <div className="space-y-1 bg-neutral-50/40 p-3.5 rounded-xl border border-neutral-100">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Location / Room</span>
                  <div className="font-bold text-neutral-800 text-sm mt-0.5 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                    <span>{viewingSchedule.room || 'No Room Specified'}</span>
                  </div>
                </div>

                {/* Assigned Employee */}
                <div className="space-y-1 bg-neutral-50/40 p-3.5 rounded-xl border border-neutral-100 col-span-2">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Assigned Instructor / Employee</span>
                  <div className="font-bold text-neutral-900 text-base mt-1 flex items-center gap-2">
                    <User className="w-5 h-5 text-neutral-400" />
                    <span>{viewingSchedule.lastName}, {viewingSchedule.firstName}</span>
                  </div>
                  {viewingSchedule.category && (
                    <div className="text-xs font-bold text-neutral-500 pl-7 mt-0.5">
                      Category: <Badge variant="outline" className="text-[11px] font-bold bg-neutral-100/50 text-neutral-700 border-none rounded-md py-0 px-2.5 ml-1">{viewingSchedule.category}</Badge>
                    </div>
                  )}
                </div>

                {/* Validity Period */}
                <div className="space-y-1 bg-neutral-50/40 p-3.5 rounded-xl border border-neutral-100 col-span-2">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Validity Period</span>
                  <div className="text-xs font-semibold text-neutral-700 mt-1">
                    {viewingSchedule.specificDate ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 text-[10px] uppercase tracking-wider">Specific Date</span>
                        <span className="font-mono text-sm font-bold">
                          {(() => {
                            const parts = viewingSchedule.specificDate.split('-');
                            if (parts.length === 3) {
                              const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                              return dateObj.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
                            }
                            return viewingSchedule.specificDate;
                          })()}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-neutral-700">Recurring Schedule</span>
                        {(viewingSchedule.effectiveFrom || viewingSchedule.effectiveTo) ? (
                          <div className="font-mono text-neutral-600 font-bold text-xs">
                            Active From: <span className="text-neutral-800">{viewingSchedule.effectiveFrom ? formatEffDate(viewingSchedule.effectiveFrom) : 'Infinite'}</span>
                            <br />
                            Active To: <span className="text-neutral-800">{viewingSchedule.effectiveTo ? formatEffDate(viewingSchedule.effectiveTo) : 'Infinite'}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-500 font-medium italic">Continuous (No start/end date constraints)</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Options in Detail View */}
              <DialogFooter className="pt-4 border-t border-neutral-100 flex flex-row items-center justify-between gap-2">
                {isAdmin && (
                  <div className="flex items-center gap-2 w-full justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsViewOpen(false);
                        handleDeleteSchedule(viewingSchedule.id);
                      }}
                      className="border-rose-200 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl h-11 px-4 font-bold transition-all flex items-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4 text-rose-500" />
                      Delete
                    </Button>
                    <div className="flex gap-2">
                      <Button 
                        type="button" 
                        variant="ghost" 
                        onClick={() => setIsViewOpen(false)} 
                        className="rounded-xl h-11 font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
                      >
                        Close
                      </Button>
                      <Button 
                        type="button" 
                        onClick={() => {
                          setIsViewOpen(false);
                          startEditSchedule(viewingSchedule);
                        }} 
                        className="bg-neutral-900 text-white rounded-xl h-11 px-6 hover:bg-neutral-800 transition-colors font-bold flex items-center gap-1.5"
                      >
                        <Pencil className="w-4 h-4" />
                        Edit Schedule
                      </Button>
                    </div>
                  </div>
                )}
                {!isAdmin && (
                  <Button 
                    type="button" 
                    onClick={() => setIsViewOpen(false)} 
                    className="bg-neutral-900 text-white rounded-xl h-11 px-6 hover:bg-neutral-800 transition-colors font-bold w-full"
                  >
                    Close
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <DeleteConfirmationDialog 
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={confirmDeleteSchedule}
        isLoading={isDeleting}
        title="Delete Schedule"
        description="Are you sure you want to delete this schedule? This action cannot be undone."
      />
    </div>
  );
};

export default Schedules;
