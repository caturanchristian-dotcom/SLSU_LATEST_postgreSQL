import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import { useAuth } from '../components/AuthProvider';
import { useRealtime } from '../hooks/useRealtime';
import { api } from '../lib/api';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { 
  Clock, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Search, 
  Filter, 
  Calendar, 
  FileText, 
  Download, 
  Printer, 
  RefreshCw, 
  User, 
  Building2, 
  Check, 
  X, 
  ChevronRight, 
  ChevronLeft,
  ArrowLeft,
  Eye,
  Trash2,
  FileSpreadsheet,
  Info,
  CalendarCheck,
  ShieldCheck,
  Award,
  Sparkles,
  ExternalLink,
  CheckSquare,
  Square,
  Zap,
  Layers,
  ArrowUpRight,
  HelpCircle,
  FileCheck,
  CalendarDays,
  CheckCheck,
  BadgeCheck,
  Briefcase,
  History,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '../components/ui/dialog';
import { formatCurrency, cn, safeSplit } from '../lib/utils';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Module-level in-memory cache to make re-navigation load in 0ms
let cachedEmployeesList: any[] | null = null;
let cachedOvertimeList: any[] | null = null;

export interface OvertimeRequestItem {
  id: string;
  employeeId: string;
  overtimeDate: string;
  startTime: string;
  endTime: string;
  requestedHours: number;
  approvedHours: number;
  actualHours: number;
  payableHours: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approverId?: string;
  approverName?: string;
  approvalRemarks?: string;
  approvedAt?: string;
  rejectedAt?: string;
  cancelledAt?: string;
  documentUrl?: string;
  createdAt: string;
  firstName?: string;
  lastName?: string;
  employeeNo?: string;
  category?: string;
  position?: string;
  campus?: string;
  email?: string;
  profileImage?: string;
}

const COMMON_REASONS = [
  {
    category: "Academic & Examination",
    items: [
      "Grading, Student Assessment & Final Examination Evaluation",
      "Urgent Curriculum Revision & Academic Council Meeting Requirements",
      "Board Examination Review Class & Diagnostic Test Coordination"
    ]
  },
  {
    category: "Institutional Quality & Accreditation",
    items: [
      "Institutional Accreditation Documents Preparation & AACCUP Compliance",
      "CHED / SUC Leveling Verification & Program Portfolio Audit",
      "ISO 9001:2015 Quality Management Audit Documents Finalization"
    ]
  },
  {
    category: "Administration & Financial Services",
    items: [
      "Payroll Closing, BIR 2316 Reconciliation & GSIS Remittance Report",
      "Semester Enrollment, Student Registration & Late Assessment Extension",
      "Annual Financial Statement Audit & COA Compliance Reconciliation"
    ]
  },
  {
    category: "Technical, Facilities & Campus Operations",
    items: [
      "Emergency Campus Server & Network Infrastructure Maintenance",
      "Official University Commencement & Institutional Convocation Setup",
      "Campus Facility Power Interruption Recovery & Urgent Repairs"
    ]
  }
];

const TIME_PRESETS = [
  { label: '5:00 PM – 8:00 PM (3.0 hrs)', start: '17:00', end: '20:00', hours: 3.0, type: 'Weekday Evening' },
  { label: '5:00 PM – 9:00 PM (4.0 hrs)', start: '17:00', end: '21:00', hours: 4.0, type: 'Weekday Evening' },
  { label: '6:00 PM – 10:00 PM (4.0 hrs)', start: '18:00', end: '22:00', hours: 4.0, type: 'Late Evening' },
  { label: 'Weekend: 8:00 AM – 5:00 PM (8.0 hrs)', start: '08:00', end: '17:00', hours: 8.0, type: 'Weekend Full Day' },
  { label: 'Weekend: 1:00 PM – 6:00 PM (5.0 hrs)', start: '13:00', end: '18:00', hours: 5.0, type: 'Weekend Half Day' },
];

const APPROVAL_TEMPLATES = [
  "Verified against biometric punch log and endorsed for official payroll credit.",
  "Approved pursuant to authorized Departmental Work Accomplishment Plan.",
  "Endorsed for urgent institutional operations per Office Special Order.",
  "Attendance confirmed by Unit Head; payable overtime authorized."
];

const REJECTION_TEMPLATES = [
  "Insufficient justification provided for after-hours university service.",
  "Overtime request exceeds approved departmental work plan budget ceiling.",
  "No biometric punch record on file to corroborate rendered extra service.",
  "Prior written authorization was not filed prior to service delivery."
];

export const formatTimeTo12H = (timeStr: string) => {
  if (!timeStr) return '';
  const clean = String(timeStr).trim();
  if (clean.toLowerCase().includes('am') || clean.toLowerCase().includes('pm')) {
    return clean;
  }
  const parts = safeSplit(clean, ':');
  if (parts.length < 2) return clean;
  let hour = parseInt(parts[0], 10);
  const min = parts[1].substring(0, 2);
  if (isNaN(hour)) return clean;
  
  const ampm = hour >= 12 ? 'PM' : 'AM';
  let displayHour = hour % 12;
  if (displayHour === 0) displayHour = 12;
  return `${String(displayHour).padStart(2, '0')}:${min} ${ampm}`;
};

export const formatServiceDate = (dateStr?: string | null) => {
  if (!dateStr) return '—';
  try {
    const str = String(dateStr).trim();
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      const dateObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
      return format(dateObj, 'MMM dd, yyyy');
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return format(d, 'MMM dd, yyyy');
    }
    return str;
  } catch {
    return String(dateStr);
  }
};

export const formatFullServiceDate = (dateStr?: string | null) => {
  if (!dateStr) return '—';
  try {
    const str = String(dateStr).trim();
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      const dateObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
      return format(dateObj, 'EEEE, MMMM dd, yyyy');
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return format(d, 'EEEE, MMMM dd, yyyy');
    }
    return str;
  } catch {
    return String(dateStr);
  }
};

export const getDayTypeInfo = (dateStr?: string | null) => {
  if (!dateStr) return { label: '', isWeekend: false, badgeText: '' };
  try {
    const str = String(dateStr).trim();
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    let d: Date;
    if (isoMatch) {
      const [, y, m, dNum] = isoMatch;
      d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(dNum, 10));
    } else {
      d = new Date(str);
    }
    if (isNaN(d.getTime())) {
      return { label: '', isWeekend: false, badgeText: '' };
    }
    const day = d.getDay();
    if (day === 0) return { label: 'Sunday', isWeekend: true, badgeText: 'SUN • Weekend' };
    if (day === 6) return { label: 'Saturday', isWeekend: true, badgeText: 'SAT • Weekend' };
    return { label: format(d, 'EEEE'), isWeekend: false, badgeText: `${format(d, 'EEE')} • Weekday` };
  } catch {
    return { label: '', isWeekend: false, badgeText: '' };
  }
};

export default function OvertimePage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { user } = useAuth();
  const isEmployeeRole = user?.role === 'employee';

  const [requests, setRequests] = useState<OvertimeRequestItem[]>(() => cachedOvertimeList || []);
  const [employees, setEmployees] = useState<any[]>(() => cachedEmployeesList || []);
  const [currentEmployeeProfile, setCurrentEmployeeProfile] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(!cachedOvertimeList);
  const [refreshing, setRefreshing] = useState(false);

  // Active view mode for supervisors/admins (Approvals Queue vs All Records)
  const [viewMode, setViewMode] = useState<'queue' | 'all'>('queue');

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [selectedCampus, setSelectedCampus] = useState('all');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('all');
  const [activeDatePreset, setActiveDatePreset] = useState<'all' | 'today' | 'week' | 'month' | 'pending'>('all');

  // Multi-Selection for Batch Operations
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Modals
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<OvertimeRequestItem | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');

  // Delete Confirmation States
  const [requestToDelete, setRequestToDelete] = useState<OvertimeRequestItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  // Submit Form State
  const [targetEmployeeId, setTargetEmployeeId] = useState('');
  const [overtimeDate, setOvertimeDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('17:00');
  const [endTime, setEndTime] = useState('20:00');
  const [reason, setReason] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Review Form State
  const [reviewHours, setReviewHours] = useState<number>(0);
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [isProcessingReview, setIsProcessingReview] = useState(false);
  const [dtrRecordOnDate, setDtrRecordOnDate] = useState<any>(null);
  const [loadingDtrRecord, setLoadingDtrRecord] = useState(false);

  // Auto calculate duration in hours
  const calculatedHours = useMemo(() => {
    if (!startTime || !endTime) return 0;
    const parseTimeToMin = (t: string) => {
      const parts = t.split(':').map(Number);
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    };
    const s = parseTimeToMin(startTime);
    let e = parseTimeToMin(endTime);
    if (e < s) e += 24 * 60;
    const diff = (e - s) / 60;
    return Number(diff.toFixed(2));
  }, [startTime, endTime]);

  // Fast Parallel Initial Data Fetching with In-Memory Caching
  const fetchData = useCallback(async (silent = false) => {
    if (!silent && !cachedOvertimeList) {
      setLoading(true);
    }
    try {
      const overtimeParams: any = {};
      if (isEmployeeRole && user) {
        overtimeParams.employeeId = user.id || user.email;
        overtimeParams.viewRole = 'employee';
      } else {
        overtimeParams.viewRole = 'admin';
      }

      const employeesPromise = cachedEmployeesList 
        ? Promise.resolve(cachedEmployeesList)
        : api.employees.list()
            .then(res => (Array.isArray(res) ? res : (res?.data || [])))
            .catch(() => cachedEmployeesList || []);

      const overtimePromise = api.overtime.list(overtimeParams)
        .catch(err => {
          console.warn("Overtime list fetch notice:", err?.message || err);
          return { data: cachedOvertimeList || [] };
        });

      const [empsList, otResult] = await Promise.all([employeesPromise, overtimePromise]);

      if (empsList && Array.isArray(empsList)) {
        cachedEmployeesList = empsList;
        setEmployees(empsList);

        if (user) {
          const userEmail = (user.email || '').toLowerCase().trim();
          const matched = empsList.find((e: any) => 
            (e.email && e.email.toLowerCase().trim() === userEmail) ||
            (user.id && (String(e.id) === String(user.id) || e.employeeId === String(user.id)))
          );
          if (matched) {
            setCurrentEmployeeProfile(matched);
            setTargetEmployeeId(matched.id);
          }
        }
      }

      if (otResult && otResult.data) {
        cachedOvertimeList = otResult.data;
        setRequests(otResult.data);
      }
    } catch (err: any) {
      console.error("Error fetching overtime data:", err);
      if (!silent) {
        toast.error("Failed to load overtime requests: " + err.message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, isEmployeeRole]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time synchronization
  useRealtime('overtime_changed', () => {
    fetchData(true);
  });
  useRealtime('payroll_changed', () => {
    fetchData(true);
  });

  // Handle Preset Date Filter Clicks
  const handleApplyDatePreset = (preset: 'all' | 'today' | 'week' | 'month' | 'pending') => {
    setActiveDatePreset(preset);
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');

    if (preset === 'all') {
      setStartDateFilter('');
      setEndDateFilter('');
      setStatusFilter('all');
    } else if (preset === 'today') {
      setStartDateFilter(todayStr);
      setEndDateFilter(todayStr);
    } else if (preset === 'week') {
      setStartDateFilter(format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      setEndDateFilter(format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
    } else if (preset === 'month') {
      setStartDateFilter(format(startOfMonth(today), 'yyyy-MM-dd'));
      setEndDateFilter(format(endOfMonth(today), 'yyyy-MM-dd'));
    } else if (preset === 'pending') {
      setStatusFilter('pending');
      setStartDateFilter('');
      setEndDateFilter('');
    }
    setCurrentPage(1);
  };

  // High-performance Filtered requests list
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      // If in Approvals Queue mode and not an employee, only show pending items
      if (!isEmployeeRole && viewMode === 'queue' && r.status !== 'pending') {
        return false;
      }

      // Status filter
      if (statusFilter !== 'all' && r.status !== statusFilter) {
        return false;
      }
      // Employee filter
      if (selectedEmployeeId !== 'all' && r.employeeId !== selectedEmployeeId) {
        return false;
      }
      // Campus filter
      if (selectedCampus !== 'all' && r.campus !== selectedCampus) {
        return false;
      }
      // Department/Category filter
      if (selectedDepartment !== 'all' && r.category !== selectedDepartment && r.position !== selectedDepartment) {
        return false;
      }
      // Date range filter
      const cleanDate = (r.overtimeDate || '').substring(0, 10);
      if (startDateFilter && cleanDate < startDateFilter) {
        return false;
      }
      if (endDateFilter && cleanDate > endDateFilter) {
        return false;
      }
      // Search query using deferredSearch
      if (deferredSearch.trim()) {
        const q = deferredSearch.toLowerCase();
        const empName = `${r.firstName || ''} ${r.lastName || ''}`.toLowerCase();
        const empNo = (r.employeeNo || '').toLowerCase();
        const reasonStr = (r.reason || '').toLowerCase();
        const idStr = (r.id || '').toLowerCase();
        if (!empName.includes(q) && !empNo.includes(q) && !reasonStr.includes(q) && !idStr.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [requests, isEmployeeRole, viewMode, statusFilter, selectedEmployeeId, selectedCampus, selectedDepartment, startDateFilter, endDateFilter, deferredSearch]);

  // Paginated requests
  const paginatedRequests = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filteredRequests.slice(startIdx, startIdx + pageSize);
  }, [filteredRequests, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredRequests.length / pageSize) || 1;

  // Overall and filtered stats
  const stats = useMemo(() => {
    const baseList = requests;
    const total = baseList.length;
    const pending = baseList.filter((r) => r.status === 'pending').length;
    const approved = baseList.filter((r) => r.status === 'approved').length;
    const rejected = baseList.filter((r) => r.status === 'rejected').length;
    const cancelled = baseList.filter((r) => r.status === 'cancelled').length;
    const totalApprovedHours = Number(
      baseList
        .filter((r) => r.status === 'approved')
        .reduce((sum, r) => sum + Number(r.approvedHours || r.requestedHours || 0), 0)
        .toFixed(2)
    );
    const totalPayableHours = Number(
      baseList
        .filter((r) => r.status === 'approved')
        .reduce((sum, r) => sum + Number(r.payableHours || r.approvedHours || r.requestedHours || 0), 0)
        .toFixed(2)
    );
    return { total, pending, approved, rejected, cancelled, totalApprovedHours, totalPayableHours };
  }, [requests]);

  // Unique campuses & departments for filters
  const campuses = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      if (e.campus) set.add(e.campus);
    });
    return Array.from(set);
  }, [employees]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      if (e.category) set.add(e.category);
    });
    return Array.from(set);
  }, [employees]);

  // Selection toggle handlers
  const handleToggleSelectAll = () => {
    const allOnPage = paginatedRequests.map(r => r.id);
    if (allOnPage.length === 0) return;
    
    const allSelected = allOnPage.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !allOnPage.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...allOnPage])));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Submit Overtime Request Handler (Optimistic)
  const handleSubmitOvertime = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeEmpId = isEmployeeRole ? (currentEmployeeProfile?.id || user?.id) : targetEmployeeId;
    
    if (!activeEmpId) {
      toast.error("Please select an employee");
      return;
    }
    if (!overtimeDate) {
      toast.error("Please select a date for the overtime");
      return;
    }
    if (!startTime || !endTime) {
      toast.error("Please specify both start time and end time");
      return;
    }
    if (calculatedHours <= 0) {
      toast.error("End time must be after start time (minimum 0.5 hours)");
      return;
    }
    if (!reason.trim()) {
      toast.error("Please provide a reason / justification for the overtime");
      return;
    }

    setIsSubmitting(true);
    try {
      const createdRes = await api.overtime.create({
        employeeId: activeEmpId,
        overtimeDate,
        startTime,
        endTime,
        requestedHours: calculatedHours,
        reason: reason.trim(),
        documentUrl: documentUrl.trim() || undefined
      });

      toast.success("Overtime request submitted successfully! It is now queued for supervisor approval.");
      setIsSubmitModalOpen(false);
      setReason('');
      setDocumentUrl('');
      
      if (createdRes && createdRes.data) {
        setRequests(prev => [createdRes.data, ...prev]);
        cachedOvertimeList = [createdRes.data, ...(cachedOvertimeList || [])];
      } else {
        fetchData(true);
      }
    } catch (err: any) {
      toast.error("Failed to submit overtime request: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1-Click Quick Approve (Instant 0ms perceived lag with optimistic update)
  const handleQuickApprove = async (req: OvertimeRequestItem) => {
    const prevRequests = [...requests];
    const targetHours = Number(req.requestedHours || 0);

    // Optimistic UI update
    setRequests(prev => prev.map(item => 
      item.id === req.id 
        ? { 
            ...item, 
            status: 'approved', 
            approvedHours: targetHours, 
            payableHours: targetHours, 
            approverName: user?.displayName || user?.email || 'Authorized Official',
            approvalRemarks: 'Quick approved for official university duty.'
          } 
        : item
    ));

    toast.success(`Authorized ${targetHours} hrs overtime for ${req.firstName || 'Employee'}.`);

    try {
      await api.overtime.approve(req.id, {
        approverId: user?.id || 'admin',
        approverName: user?.displayName || user?.email || 'Authorized Official',
        approvalRemarks: 'Quick approved for official university duty.',
        approvedHours: targetHours
      });
    } catch (err: any) {
      setRequests(prevRequests);
      toast.error("Failed to approve overtime: " + err.message);
    }
  };

  // Batch Approve Action
  const handleBatchApprove = async () => {
    const pendingSelected = selectedIds.filter(id => requests.find(r => r.id === id)?.status === 'pending');
    if (pendingSelected.length === 0) {
      toast.error("No pending requests selected for authorization.");
      return;
    }
    const count = pendingSelected.length;
    const prevRequests = [...requests];
    const idsToApprove = [...pendingSelected];

    setRequests(prev => prev.map(item => 
      idsToApprove.includes(item.id)
        ? {
            ...item,
            status: 'approved',
            approvedHours: item.requestedHours,
            payableHours: item.requestedHours,
            approverName: user?.displayName || user?.email || 'Authorized Official',
            approvalRemarks: 'Batch authorized for official university duty.'
          }
        : item
    ));
    setSelectedIds(prev => prev.filter(id => !idsToApprove.includes(id)));
    toast.success(`Batch approved ${count} overtime requests successfully.`);

    setIsProcessingBatch(true);
    try {
      await api.overtime.batchApprove({
        ids: idsToApprove,
        approverId: user?.id || 'admin',
        approverName: user?.displayName || user?.email || 'Authorized Official',
        approvalRemarks: 'Batch authorized for official university duty.'
      });
    } catch (err: any) {
      setRequests(prevRequests);
      toast.error("Batch approval failed: " + err.message);
    } finally {
      setIsProcessingBatch(false);
    }
  };

  // Batch Reject Action
  const handleBatchReject = async () => {
    const pendingSelected = selectedIds.filter(id => requests.find(r => r.id === id)?.status === 'pending');
    if (pendingSelected.length === 0) {
      toast.error("No pending requests selected for rejection.");
      return;
    }
    const count = pendingSelected.length;
    const prevRequests = [...requests];
    const idsToReject = [...pendingSelected];

    setRequests(prev => prev.map(item => 
      idsToReject.includes(item.id)
        ? {
            ...item,
            status: 'rejected',
            approvedHours: 0,
            payableHours: 0,
            approverName: user?.displayName || user?.email || 'Authorized Official',
            approvalRemarks: 'Batch declined by supervisor.'
          }
        : item
    ));
    setSelectedIds(prev => prev.filter(id => !idsToReject.includes(id)));
    toast.info(`Declined ${count} overtime requests.`);

    setIsProcessingBatch(true);
    try {
      await api.overtime.batchReject({
        ids: idsToReject,
        approverId: user?.id || 'admin',
        approverName: user?.displayName || user?.email || 'Authorized Official',
        rejectionReason: 'Batch declined by supervisor.'
      });
    } catch (err: any) {
      setRequests(prevRequests);
      toast.error("Batch rejection failed: " + err.message);
    } finally {
      setIsProcessingBatch(false);
    }
  };

  // Delete Single Overtime Record (Authorized / Declined / Cancelled)
  const handleConfirmDeleteSingle = async () => {
    if (!requestToDelete) return;
    const targetId = requestToDelete.id;
    const prevRequests = [...requests];

    setIsDeleting(true);
    // Optimistic UI update
    setRequests(prev => prev.filter(r => r.id !== targetId));
    cachedOvertimeList = (cachedOvertimeList || []).filter(r => r.id !== targetId);
    setSelectedIds(prev => prev.filter(id => id !== targetId));

    try {
      await api.overtime.delete(targetId);
      toast.success(`Overtime record for ${requestToDelete.firstName || 'employee'} deleted successfully.`);
      setRequestToDelete(null);
    } catch (err: any) {
      setRequests(prevRequests);
      cachedOvertimeList = prevRequests;
      toast.error("Failed to delete overtime record: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Confirm Batch Delete
  const handleConfirmBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    const prevRequests = [...requests];
    const idsToDelete = [...selectedIds];

    setIsBatchDeleting(true);
    // Optimistic UI update
    setRequests(prev => prev.filter(r => !idsToDelete.includes(r.id)));
    cachedOvertimeList = (cachedOvertimeList || []).filter(r => !idsToDelete.includes(r.id));
    setSelectedIds([]);

    try {
      await api.overtime.batchDelete({ ids: idsToDelete });
      toast.success(`Successfully deleted ${count} overtime records.`);
      setIsBatchDeleteModalOpen(false);
    } catch (err: any) {
      setRequests(prevRequests);
      cachedOvertimeList = prevRequests;
      toast.error("Batch deletion failed: " + err.message);
    } finally {
      setIsBatchDeleting(false);
    }
  };

  // Open Review (Approve/Reject) Modal
  const openReviewModal = async (req: OvertimeRequestItem, action: 'approve' | 'reject') => {
    setSelectedRequest(req);
    setReviewAction(action);
    setReviewHours(Number(req.requestedHours || 0));
    setReviewRemarks(
      action === 'approve' 
        ? 'Verified against biometric attendance logbook and approved for payroll credit.' 
        : 'Overtime application declined based on departmental scheduling / budget allocation.'
    );
    setIsReviewModalOpen(true);

    // Fetch DTR record on that date to verify actual attendance
    setLoadingDtrRecord(true);
    try {
      const details = await api.overtime.get(req.id);
      if (details && details.dtrRecord) {
        setDtrRecordOnDate(details.dtrRecord);
      } else {
        setDtrRecordOnDate(null);
      }
    } catch (e) {
      setDtrRecordOnDate(null);
    } finally {
      setLoadingDtrRecord(false);
    }
  };

  // Process Review (Approve/Reject)
  const handleProcessReview = async () => {
    if (!selectedRequest) return;
    setIsProcessingReview(true);
    const targetId = selectedRequest.id;
    const prevRequests = [...requests];

    setRequests(prev => prev.map(item => 
      item.id === targetId
        ? {
            ...item,
            status: reviewAction === 'approve' ? 'approved' : 'rejected',
            approvedHours: reviewAction === 'approve' ? Number(reviewHours) : 0,
            payableHours: reviewAction === 'approve' ? Number(reviewHours) : 0,
            approverName: user?.displayName || user?.email || 'Authorized Official',
            approvalRemarks: reviewRemarks.trim()
          }
        : item
    ));

    try {
      const approverName = user?.displayName || user?.email || 'Authorized Official';
      const approverId = user?.id || 'admin';

      if (reviewAction === 'approve') {
        await api.overtime.approve(targetId, {
          approverId,
          approverName,
          approvalRemarks: reviewRemarks.trim(),
          approvedHours: Number(reviewHours)
        });
        toast.success(`Overtime application approved for ${selectedRequest.firstName || 'Employee'} (${reviewHours} hrs).`);
      } else {
        await api.overtime.reject(targetId, {
          approverId,
          approverName,
          rejectionReason: reviewRemarks.trim()
        });
        toast.info("Overtime application declined.");
      }

      setIsReviewModalOpen(false);
      setSelectedRequest(null);
    } catch (err: any) {
      setRequests(prevRequests);
      toast.error(`Failed to ${reviewAction} overtime request: ` + err.message);
    } finally {
      setIsProcessingReview(false);
    }
  };

  // Cancel Request Handler (Employee - Optimistic)
  const handleCancelRequest = async (req: OvertimeRequestItem) => {
    if (!confirm(`Are you sure you want to cancel your overtime application for ${req.overtimeDate}?`)) {
      return;
    }
    const prevRequests = [...requests];
    setRequests(prev => prev.map(item => 
      item.id === req.id ? { ...item, status: 'cancelled' } : item
    ));
    toast.success("Overtime request cancelled.");

    try {
      await api.overtime.cancel(req.id, "Cancelled by employee");
    } catch (err: any) {
      setRequests(prevRequests);
      toast.error("Failed to cancel request: " + err.message);
    }
  };

  // Open Details Modal
  const openDetailsModal = async (req: OvertimeRequestItem) => {
    setSelectedRequest(req);
    setIsDetailsModalOpen(true);
    setLoadingDtrRecord(true);
    try {
      const details = await api.overtime.get(req.id);
      if (details && details.dtrRecord) {
        setDtrRecordOnDate(details.dtrRecord);
      } else {
        setDtrRecordOnDate(null);
      }
    } catch (e) {
      setDtrRecordOnDate(null);
    } finally {
      setLoadingDtrRecord(false);
    }
  };

  // Print Individual Overtime Slip
  const handlePrintSlip = (req: OvertimeRequestItem) => {
    try {
      const doc = new jsPDF('portrait');
      
      // Header
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('SOUTHERN LEYTE STATE UNIVERSITY', 105, 18, { align: 'center' });
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Hinunangan Campus • San Roque, Hinunangan, Southern Leyte', 105, 23, { align: 'center' });
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('CERTIFICATE OF OVERTIME SERVICE & AUTHORIZATION SLIP', 105, 32, { align: 'center' });
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text('Pursuant to CSC & DBM Joint Circular No. 1, s. 2015 (CSC Form 48 Addendum)', 105, 36, { align: 'center' });
      
      doc.setLineWidth(0.4);
      doc.setDrawColor(200, 200, 200);
      doc.line(20, 39, 190, 39);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`CONTROL NO: ${req.id}`, 20, 46);
      doc.setFont('helvetica', 'normal');
      doc.text(`Date Filed: ${req.createdAt ? format(new Date(req.createdAt), 'MMMM dd, yyyy') : formatServiceDate(req.overtimeDate)}`, 140, 46);

      // Box for employee info
      autoTable(doc, {
        startY: 50,
        head: [['EMPLOYEE / APPLICANT INFORMATION', 'AUTHORIZATION & SERVICE DETAILS']],
        body: [
          [
            `Name: ${req.lastName ? req.lastName + ', ' : ''}${req.firstName || 'Employee'}\nID No: ${req.employeeNo || req.employeeId}\nPosition: ${req.position || 'Staff'}\nDepartment: ${req.category || 'N/A'}\nCampus: ${req.campus || 'Hinunangan Campus'}`,
            `Service Date: ${formatFullServiceDate(req.overtimeDate)}\nTime Interval: ${formatTimeTo12H(req.startTime)} - ${formatTimeTo12H(req.endTime)}\nRequested Hours: ${req.requestedHours} hrs\nApproved Hours: ${req.approvedHours || 0} hrs\nPayable Units: ${req.payableHours || 0} hrs\nOfficial Status: ${req.status.toUpperCase()}`
          ]
        ],
        theme: 'grid',
        headStyles: { fillColor: [29, 88, 217], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8.5, cellPadding: 4 },
        margin: { left: 20, right: 20 }
      });

      const currentY = (doc as any).lastAutoTable.finalY + 8;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('OFFICIAL PURPOSE & SCOPE OF WORK:', 20, currentY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(req.reason || 'Official university services rendered.', 20, currentY + 5, { maxWidth: 170 });

      let endY = currentY + 18;

      if (req.approvalRemarks) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('SUPERVISOR / ENDORSING OFFICIAL REMARKS:', 20, endY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(req.approvalRemarks, 20, endY + 5, { maxWidth: 170 });
        endY += 16;
      }

      // Signatures
      const sigY = Math.max(endY + 25, 200);
      doc.setDrawColor(80, 80, 80);
      doc.setLineWidth(0.4);

      doc.line(25, sigY, 85, sigY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(`${req.firstName || ''} ${req.lastName || ''}`, 55, sigY + 5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text('Employee / Applicant Signature', 55, sigY + 9, { align: 'center' });

      doc.line(125, sigY, 185, sigY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(req.approverName || 'Authorized Approving Official', 155, sigY + 5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text('Department Head / Campus Director', 155, sigY + 9, { align: 'center' });

      doc.save(`SLSU_Overtime_Authorization_${req.employeeNo || 'Emp'}_${req.overtimeDate}.pdf`);
      toast.success("Official Overtime Slip downloaded successfully");
    } catch (err: any) {
      toast.error("Failed to generate slip: " + err.message);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    try {
      const exportData = filteredRequests.map((r) => ({
        "Control ID": r.id,
        "Employee No": r.employeeNo || r.employeeId,
        "Employee Name": `${r.lastName ? r.lastName + ', ' : ''}${r.firstName || ''}`,
        "Department / Unit": r.category || r.position || 'N/A',
        "Campus": r.campus || 'SLSU Hinunangan Campus',
        "Overtime Date": formatServiceDate(r.overtimeDate),
        "Day of Week": getDayTypeInfo(r.overtimeDate).label,
        "Start Time": formatTimeTo12H(r.startTime),
        "End Time": formatTimeTo12H(r.endTime),
        "Requested Hours": r.requestedHours,
        "Approved Hours": r.status === 'approved' ? r.approvedHours : 0,
        "Payable Hours": r.status === 'approved' ? r.payableHours : 0,
        "Status": r.status.toUpperCase(),
        "Scope of Work": r.reason,
        "Approver": r.approverName || 'N/A',
        "Approver Remarks": r.approvalRemarks || 'N/A',
        "Date Filed": r.createdAt ? format(new Date(r.createdAt), 'yyyy-MM-dd HH:mm') : ''
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Overtime Authorizations");
      XLSX.writeFile(wb, `SLSU_Overtime_Authorizations_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
      toast.success("Exported overtime authorizations to Excel");
    } catch (err: any) {
      toast.error("Failed to export Excel: " + err.message);
    }
  };

  // Export to PDF
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF('landscape');
      
      // Header
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('SOUTHERN LEYTE STATE UNIVERSITY', 148, 16, { align: 'center' });
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.text('Hinunangan Campus • Human Resource Management & Payroll Operations Office', 148, 22, { align: 'center' });
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('OFFICIAL OVERTIME AUTHORIZATIONS & APPROVAL SUMMARY REPORT', 148, 30, { align: 'center' });
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${format(new Date(), 'MMMM dd, yyyy hh:mm a')} | Scope: ${statusFilter.toUpperCase()}`, 148, 35, { align: 'center' });

      const tableData = filteredRequests.map((r, i) => [
        i + 1,
        r.employeeNo || r.employeeId,
        `${r.lastName ? r.lastName + ', ' : ''}${r.firstName || ''}`,
        formatServiceDate(r.overtimeDate),
        `${formatTimeTo12H(r.startTime)} - ${formatTimeTo12H(r.endTime)}`,
        `${r.requestedHours}h`,
        r.status === 'approved' ? `${r.payableHours || r.approvedHours}h` : '-',
        r.status.toUpperCase(),
        r.reason ? (r.reason.length > 32 ? r.reason.substring(0, 30) + '...' : r.reason) : '-',
        r.approverName || '-'
      ]);

      autoTable(doc, {
        startY: 40,
        head: [['#', 'EMP ID', 'EMPLOYEE NAME', 'DATE', 'TIME PERIOD', 'REQ', 'PAYABLE', 'STATUS', 'SCOPE / PURPOSE', 'APPROVER']],
        body: tableData,
        theme: 'grid',
        headStyles: { 
          fillColor: [29, 88, 217],
          textColor: [255, 255, 255],
          fontSize: 7.5,
          fontStyle: 'bold'
        },
        bodyStyles: { fontSize: 7.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 10, right: 10 }
      });

      doc.save(`SLSU_Overtime_Report_${format(new Date(), 'yyyyMMdd')}.pdf`);
      toast.success("Overtime summary report exported to PDF");
    } catch (err: any) {
      toast.error("Failed to generate PDF: " + err.message);
    }
  };

  // Status Badge Component
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Pending Review
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs whitespace-nowrap">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Authorized
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs whitespace-nowrap">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Declined
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-neutral-100 text-neutral-600 border border-neutral-200 shadow-2xs whitespace-nowrap">
            <X className="w-3.5 h-3.5 text-neutral-400" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-800">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 font-sans">
      {/* ========================================================================= */}
      {/* 1. EXECUTIVE HEADER BANNER */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-neutral-200/90 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#1d58d9] flex items-center justify-center shrink-0 border border-blue-100/80 shadow-xs">
              <Clock className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight">
                  {isEmployeeRole ? "Overtime Request" : "Overtime Approvals"}
                </h1>
                <Badge className="bg-blue-50 text-[#1d58d9] border border-blue-200/80 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                  {isEmployeeRole ? "Employee Self-Service" : "CSC Form 48 Authorization Desk"}
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-neutral-500 mt-1 max-w-2xl leading-relaxed">
                {isEmployeeRole 
                  ? "Submit official overtime applications and track approval endorsements. Authorized hours are automatically cross-checked against biometric DTR logs and forwarded to payroll."
                  : "Review, verify biometric DTR attendance logs, and endorse employee overtime applications for official payroll credit in accordance with Civil Service rules."}
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 pt-1 lg:pt-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRefreshing(true);
                fetchData();
              }}
              disabled={refreshing}
              className="rounded-xl border-neutral-200 text-neutral-700 hover:bg-neutral-50 h-9.5 px-3 font-semibold text-xs shadow-2xs"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", refreshing && "animate-spin")} />
              Refresh
            </Button>

            {!isEmployeeRole && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportExcel}
                  className="rounded-xl border-neutral-200 text-neutral-700 hover:bg-neutral-50 h-9.5 px-3 font-semibold text-xs shadow-2xs"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                  Excel Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportPDF}
                  className="rounded-xl border-neutral-200 text-neutral-700 hover:bg-neutral-50 h-9.5 px-3 font-semibold text-xs shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                  Print Report
                </Button>
              </>
            )}

            <Button
              onClick={() => {
                if (isEmployeeRole && currentEmployeeProfile) {
                  setTargetEmployeeId(currentEmployeeProfile.id);
                }
                setIsSubmitModalOpen(true);
              }}
              className="bg-[#1d58d9] hover:bg-[#1444b0] text-white font-bold rounded-xl h-9.5 px-4 shadow-sm flex items-center gap-2 text-xs transition-all active:scale-[0.98]"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              Overtime Request
            </Button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. EXECUTIVE METRIC KPI STAT CARDS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Metric 1: Pending Approvals */}
        <div className="bg-white rounded-2xl border border-amber-200/90 p-4 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
              Pending Authorization
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200/70">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-amber-800 font-mono tracking-tight">
              {stats.pending}
            </span>
            <span className="text-xs text-amber-700/80 font-medium">
              {stats.pending === 1 ? "application" : "applications"}
            </span>
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">
            {isEmployeeRole ? "Awaiting supervisor endorsement" : "Requires authorized officer action"}
          </p>
        </div>

        {/* Metric 2: Approved OT Hours */}
        <div className="bg-white rounded-2xl border border-neutral-200/90 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              Authorized OT Hours
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200/70">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-emerald-800 font-mono tracking-tight">
              {stats.totalApprovedHours}
            </span>
            <span className="text-xs text-emerald-700/80 font-medium">hours</span>
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">
            Across {stats.approved} approved applications
          </p>
        </div>

        {/* Metric 3: Payable Units */}
        <div className="bg-white rounded-2xl border border-neutral-200/90 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#1d58d9]">
              Payable to Payroll
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1d58d9] flex items-center justify-center border border-blue-200/70">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-[#1d58d9] font-mono tracking-tight">
              {stats.totalPayableHours}
            </span>
            <span className="text-xs text-blue-700/80 font-medium">payable units</span>
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">
            Integrated with SLSU payroll engine
          </p>
        </div>

        {/* Metric 4: Total Records */}
        <div className="bg-white rounded-2xl border border-neutral-200/90 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
              Total Applications
            </span>
            <div className="w-7 h-7 rounded-lg bg-neutral-100 text-neutral-700 flex items-center justify-center border border-neutral-200/70">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-neutral-900 font-mono tracking-tight">
              {stats.total}
            </span>
            <span className="text-xs text-neutral-500 font-medium">filed to date</span>
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">
            {stats.rejected} declined • {stats.cancelled} cancelled
          </p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. MAIN TABLE & FILTER CONTAINER */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-neutral-200/90 shadow-xs overflow-hidden">
        {/* Filter Toolbar */}
        <div className="p-4 sm:p-5 border-b border-neutral-100 bg-neutral-50/40 space-y-3">
          {/* Status Tabs and Quick Date Presets */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Status Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: 'All Requests', count: requests.length },
                { id: 'pending', label: 'Pending Review', count: requests.filter((r) => r.status === 'pending').length },
                { id: 'approved', label: 'Authorized', count: requests.filter((r) => r.status === 'approved').length },
                { id: 'rejected', label: 'Declined', count: requests.filter((r) => r.status === 'rejected').length },
                { id: 'cancelled', label: 'Cancelled', count: requests.filter((r) => r.status === 'cancelled').length },
              ].map((tab) => {
                const active = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setStatusFilter(tab.id);
                      if (tab.id !== 'all' && tab.id !== 'pending') {
                        setViewMode('all');
                      }
                      setCurrentPage(1);
                    }}
                    className={cn(
                      "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-2xs",
                      active
                        ? "bg-neutral-900 text-white"
                        : "bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200/80"
                    )}
                  >
                    {tab.label}
                    <span className={cn(
                      "px-1.5 py-0.2 rounded-full text-[10px] font-black",
                      active ? "bg-white/20 text-white" : "bg-neutral-100 text-neutral-600"
                    )}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Quick Date Presets */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-neutral-200/80 shrink-0 self-start lg:self-auto shadow-2xs">
              <span className="text-[10px] font-bold text-neutral-400 px-2 uppercase tracking-wider">Date:</span>
              {(['all', 'today', 'week', 'month'] as const).map((preset) => (
                <button
                  key={preset}
                  onClick={() => handleApplyDatePreset(preset)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition-all",
                    activeDatePreset === preset 
                      ? "bg-[#1d58d9] text-white shadow-2xs" 
                      : "text-neutral-600 hover:bg-neutral-100"
                  )}
                >
                  {preset === 'week' ? 'This Week' : preset === 'month' ? 'This Month' : preset}
                </button>
              ))}
            </div>
          </div>

          {/* View Mode Segmented Control (Below All Requests & Status Tabs) */}
          {!isEmployeeRole && (
            <div className="pt-2.5 border-t border-neutral-200/70 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 bg-neutral-100/90 p-1 rounded-xl border border-neutral-200/80 shadow-2xs">
                <button
                  onClick={() => {
                    setViewMode('queue');
                    setStatusFilter('all');
                    setCurrentPage(1);
                  }}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                    viewMode === 'queue'
                      ? "bg-white text-neutral-900 shadow-xs"
                      : "text-neutral-500 hover:text-neutral-800"
                  )}
                >
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  Pending Approvals Queue
                  <span className={cn(
                    "px-1.5 py-0.2 rounded-full text-[10.5px] font-black",
                    stats.pending > 0 ? "bg-amber-100 text-amber-800" : "bg-neutral-200 text-neutral-600"
                  )}>
                    {stats.pending}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setViewMode('all');
                    setCurrentPage(1);
                  }}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                    viewMode === 'all'
                      ? "bg-white text-neutral-900 shadow-xs"
                      : "text-neutral-500 hover:text-neutral-800"
                  )}
                >
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  All Overtime Records &amp; History
                  <span className="px-1.5 py-0.2 rounded-full text-[10.5px] font-black bg-neutral-200 text-neutral-600">
                    {stats.total}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Biometric Cross-Check Engine Active</span>
              </div>
            </div>
          )}

          {/* Secondary Search & Dropdown Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5 pt-1">
            {/* Search Input */}
            <div className="relative sm:col-span-2">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Search applicant name, employee ID, reason..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 h-9.5 text-xs bg-white rounded-xl border-neutral-200 font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Campus Filter */}
            {!isEmployeeRole && (
              <div>
                <select
                  value={selectedCampus}
                  onChange={(e) => {
                    setSelectedCampus(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full h-9.5 px-3 rounded-xl border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 outline-none focus:ring-2 focus:ring-[#1d58d9]"
                >
                  <option value="all">All Campuses</option>
                  {campuses.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Department Filter */}
            {!isEmployeeRole && (
              <div>
                <select
                  value={selectedDepartment}
                  onChange={(e) => {
                    setSelectedDepartment(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full h-9.5 px-3 rounded-xl border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 outline-none focus:ring-2 focus:ring-[#1d58d9]"
                >
                  <option value="all">All Departments</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Date Range Start */}
            <div>
              <Input
                type="date"
                value={startDateFilter}
                onChange={(e) => {
                  setStartDateFilter(e.target.value);
                  setActiveDatePreset('all');
                  setCurrentPage(1);
                }}
                aria-label="From Date"
                className="h-9.5 text-xs bg-white rounded-xl border-neutral-200 font-mono"
              />
            </div>

            {/* Date Range End */}
            <div>
              <Input
                type="date"
                value={endDateFilter}
                onChange={(e) => {
                  setEndDateFilter(e.target.value);
                  setActiveDatePreset('all');
                  setCurrentPage(1);
                }}
                aria-label="To Date"
                className="h-9.5 text-xs bg-white rounded-xl border-neutral-200 font-mono"
              />
            </div>
          </div>

          {/* Active Filter Indicators */}
          {(searchQuery || startDateFilter || endDateFilter || statusFilter !== 'all' || selectedCampus !== 'all' || selectedDepartment !== 'all') && (
            <div className="flex items-center justify-between pt-1 text-xs">
              <div className="flex items-center gap-1.5 text-neutral-500 font-medium">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Filters applied: showing <strong>{filteredRequests.length}</strong> matching records</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setStartDateFilter('');
                  setEndDateFilter('');
                  setStatusFilter('all');
                  setSelectedCampus('all');
                  setSelectedDepartment('all');
                  setSelectedEmployeeId('all');
                  setActiveDatePreset('all');
                  setCurrentPage(1);
                }}
                className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-7 px-2 font-bold"
              >
                <X className="w-3.5 h-3.5 mr-1" /> Reset Filters
              </Button>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 4. MULTI-SELECT BATCH ACTION FLOATING TOOLBAR */}
        {/* ========================================================================= */}
        {selectedIds.length > 0 && (
          <div className="bg-neutral-900 text-white px-5 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1d58d9] text-white text-xs font-black">
                {selectedIds.length}
              </span>
              <span className="text-xs font-bold tracking-wide">
                {selectedIds.length} {selectedIds.length === 1 ? 'record' : 'records'} selected
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* If supervisor/admin and any selected records are pending, show Batch Authorize / Decline */}
              {!isEmployeeRole && selectedIds.some(id => requests.find(r => r.id === id)?.status === 'pending') && (
                <>
                  <Button
                    size="sm"
                    onClick={handleBatchApprove}
                    disabled={isProcessingBatch || isBatchDeleting}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold h-8.5 px-3.5 shadow-sm flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    Batch Authorize ({selectedIds.filter(id => requests.find(r => r.id === id)?.status === 'pending').length})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBatchReject}
                    disabled={isProcessingBatch || isBatchDeleting}
                    className="text-rose-400 border-rose-800/80 hover:bg-rose-950/60 rounded-xl text-xs font-bold h-8.5 px-3.5 flex items-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5 stroke-[2.5]" />
                    Batch Decline ({selectedIds.filter(id => requests.find(r => r.id === id)?.status === 'pending').length})
                  </Button>
                </>
              )}

              {/* Batch Delete Button for Selected Records */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsBatchDeleteModalOpen(true)}
                disabled={isProcessingBatch || isBatchDeleting}
                className="text-rose-400 border-rose-700 hover:bg-rose-900/50 hover:text-white rounded-xl text-xs font-bold h-8.5 px-3.5 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Batch Delete ({selectedIds.length})
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds([])}
                className="text-neutral-400 hover:text-white rounded-xl text-xs font-medium h-8.5 px-2"
              >
                Clear Selection
              </Button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 5. REQUESTS TABLE */}
        {/* ========================================================================= */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-20 text-center">
              <div className="w-10 h-10 border-3 border-[#1d58d9] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-semibold text-neutral-600">Loading overtime records...</p>
              <p className="text-xs text-neutral-400 mt-0.5">Fetching employee requests and biometric cross-checks</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="py-20 text-center px-4">
              <div className="w-14 h-14 rounded-2xl bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto mb-3 border border-neutral-200">
                <Clock className="w-7 h-7 stroke-[1.5]" />
              </div>
              <h3 className="text-base font-bold text-neutral-800">No Overtime Requests Found</h3>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto mt-1">
                {isEmployeeRole
                  ? "You haven't submitted any overtime requests matching this filter. Click 'Overtime Request' above to file an application."
                  : "No overtime records match your current filter criteria."}
              </p>
              <Button
                onClick={() => setIsSubmitModalOpen(true)}
                className="mt-4 bg-[#1d58d9] hover:bg-[#1444b0] text-white text-xs font-bold rounded-xl h-9 px-4 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" /> File Overtime Request
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-neutral-50/80">
                <TableRow className="border-b border-neutral-200/90">
                  <TableHead className="w-10 py-3.5 pl-4 pr-0">
                    <input
                      type="checkbox"
                      aria-label="Select all requests on this page"
                      checked={
                        paginatedRequests.length > 0 &&
                        paginatedRequests.every(r => selectedIds.includes(r.id))
                      }
                      onChange={handleToggleSelectAll}
                      className="rounded border-neutral-300 text-[#1d58d9] focus:ring-blue-500 w-4 h-4 cursor-pointer"
                    />
                  </TableHead>
                  <TableHead className="text-xs font-bold text-neutral-700 uppercase py-3.5 tracking-wider pl-3">
                    Employee / Applicant
                  </TableHead>
                  <TableHead className="text-xs font-bold text-neutral-700 uppercase py-3.5 tracking-wider">
                    Service Date
                  </TableHead>
                  <TableHead className="text-xs font-bold text-neutral-700 uppercase py-3.5 tracking-wider">
                    Time Interval
                  </TableHead>
                  <TableHead className="text-xs font-bold text-neutral-700 uppercase py-3.5 tracking-wider text-center">
                    Requested
                  </TableHead>
                  <TableHead className="text-xs font-bold text-neutral-700 uppercase py-3.5 tracking-wider text-center">
                    Payable
                  </TableHead>
                  <TableHead className="text-xs font-bold text-neutral-700 uppercase py-3.5 tracking-wider">
                    Scope of Work / Justification
                  </TableHead>
                  <TableHead className="text-xs font-bold text-neutral-700 uppercase py-3.5 tracking-wider">
                    Status
                  </TableHead>
                  <TableHead className="text-xs font-bold text-neutral-700 uppercase py-3.5 tracking-wider">
                    Supervisor Endorsement
                  </TableHead>
                  <TableHead className="text-xs font-bold text-neutral-700 uppercase py-3.5 tracking-wider text-right pr-6">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRequests.map((req) => {
                  const empName = `${req.lastName ? req.lastName + ', ' : ''}${req.firstName || 'Employee'}`;
                  const isPending = req.status === 'pending';
                  const isSelected = selectedIds.includes(req.id);
                  const dayInfo = getDayTypeInfo(req.overtimeDate);

                  return (
                    <TableRow 
                      key={req.id} 
                      className={cn(
                        "hover:bg-neutral-50/80 transition-colors border-b border-neutral-100",
                        isSelected && "bg-blue-50/50"
                      )}
                    >
                      {/* Checkbox Column */}
                      <TableCell className="py-3.5 pl-4 pr-0">
                        <input
                          type="checkbox"
                          aria-label={`Select request ${req.id}`}
                          checked={isSelected}
                          onChange={() => handleToggleSelectRow(req.id)}
                          className="rounded border-neutral-300 text-[#1d58d9] focus:ring-blue-500 w-4 h-4 cursor-pointer"
                        />
                      </TableCell>

                      {/* Employee Column */}
                      <TableCell className="py-3.5 pl-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 overflow-hidden shrink-0 flex items-center justify-center text-xs font-black text-[#1d58d9]">
                            {req.profileImage ? (
                              <img src={req.profileImage} alt={empName} className="w-full h-full object-cover" />
                            ) : (
                              (req.firstName ? req.firstName[0] : 'E')
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-neutral-900 block truncate leading-tight">
                              {empName}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-neutral-500 font-mono">
                                {req.employeeNo || req.employeeId}
                              </span>
                              {(req.category || req.position) && (
                                <>
                                  <span className="text-neutral-300">•</span>
                                  <span className="text-[10px] text-neutral-500 truncate max-w-[120px]">
                                    {req.category || req.position}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {/* Overtime Date Column */}
                      <TableCell className="py-3.5 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-neutral-900 tracking-tight">
                            {formatServiceDate(req.overtimeDate)}
                          </span>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={cn(
                              "text-[9.5px] font-bold px-1.5 py-0.2 rounded-md",
                              dayInfo.isWeekend 
                                ? "bg-amber-100 text-amber-800" 
                                : "bg-neutral-100 text-neutral-600"
                            )}>
                              {dayInfo.badgeText}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Time Period Column */}
                      <TableCell className="py-3.5 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-neutral-100/80 rounded-lg text-xs font-semibold text-neutral-700 font-mono">
                          <Clock className="w-3.5 h-3.5 text-neutral-400" />
                          {formatTimeTo12H(req.startTime)} – {formatTimeTo12H(req.endTime)}
                        </div>
                      </TableCell>

                      {/* Requested Hours */}
                      <TableCell className="py-3.5 text-center font-mono font-bold text-xs text-neutral-700">
                        {req.requestedHours} hrs
                      </TableCell>

                      {/* Payable Hours */}
                      <TableCell className="py-3.5 text-center whitespace-nowrap">
                        {req.status === 'approved' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black bg-emerald-100 text-emerald-800 font-mono">
                            {req.payableHours || req.approvedHours} hrs
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-300 font-mono">-</span>
                        )}
                      </TableCell>

                      {/* Scope / Reason */}
                      <TableCell className="py-3.5 max-w-[240px]">
                        <p className="text-xs text-neutral-700 truncate" title={req.reason}>
                          {req.reason}
                        </p>
                        {req.documentUrl && (
                          <a 
                            href={req.documentUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="inline-flex items-center gap-1 text-[10px] text-[#1d58d9] hover:underline font-bold mt-0.5"
                          >
                            <ExternalLink className="w-2.5 h-2.5" /> View Attached Order / Memo
                          </a>
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell className="py-3.5 whitespace-nowrap">
                        {renderStatusBadge(req.status)}
                      </TableCell>

                      {/* Approver Remarks */}
                      <TableCell className="py-3.5 max-w-[190px]">
                        {req.approvalRemarks ? (
                          <div className="text-xs text-neutral-600 truncate" title={req.approvalRemarks}>
                            <span className="font-bold text-neutral-700">{req.approverName || 'Authorized Official'}: </span>
                            {req.approvalRemarks}
                          </div>
                        ) : (
                          <span className="text-[11px] text-neutral-400 italic">Awaiting action</span>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="py-3.5 text-right pr-6 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Print Official Slip (Available for approved records or any record) */}
                          <button
                            onClick={() => handlePrintSlip(req)}
                            title="Download Official Overtime Slip (PDF)"
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {/* View details */}
                          <button
                            onClick={() => openDetailsModal(req)}
                            title="View Full Authorization Record"
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Employee Cancel button */}
                          {isPending && (isEmployeeRole || user?.id === req.employeeId) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCancelRequest(req)}
                              className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50 rounded-lg h-7 px-2 font-bold"
                            >
                              Cancel
                            </Button>
                          )}

                          {/* Admin / Supervisor Review Buttons */}
                          {!isEmployeeRole && isPending && (
                            <>
                              {/* Primary Review Modal Trigger */}
                              <Button
                                size="sm"
                                onClick={() => openReviewModal(req, 'approve')}
                                title="Review with DTR Biometric Verification"
                                className="bg-[#1d58d9] hover:bg-[#1444b0] text-white rounded-lg h-7 px-2.5 text-xs font-bold shadow-2xs flex items-center gap-1"
                              >
                                <Check className="w-3 h-3 stroke-[2.5]" /> Review
                              </Button>

                              {/* 1-Click Fast Quick Approve */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleQuickApprove(req)}
                                title="1-Click Approve Full Hours"
                                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-lg h-7 px-2 text-xs font-bold"
                              >
                                Quick
                              </Button>

                              {/* Reject */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openReviewModal(req, 'reject')}
                                title="Decline Request"
                                className="text-rose-600 border-rose-200 hover:bg-rose-50 rounded-lg h-7 px-1.5 text-xs font-bold"
                              >
                                <X className="w-3.5 h-3.5 stroke-[2.5]" />
                              </Button>
                            </>
                          )}

                          {/* Delete Button for Authorized, Declined, or Cancelled Requests */}
                          {!isPending && (
                            <button
                              onClick={() => setRequestToDelete(req)}
                              title={`Delete ${req.status === 'approved' ? 'Authorized' : req.status === 'rejected' ? 'Declined' : 'Cancelled'} Overtime Record`}
                              className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Table Pagination Footer */}
        {filteredRequests.length > 0 && (
          <div className="p-4 border-t border-neutral-100 bg-neutral-50/40 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs text-neutral-500 font-medium">
              <span>
                Showing <strong className="text-neutral-800">{Math.min((currentPage - 1) * pageSize + 1, filteredRequests.length)}</strong> to{' '}
                <strong className="text-neutral-800">{Math.min(currentPage * pageSize, filteredRequests.length)}</strong> of{' '}
                <strong className="text-neutral-800">{filteredRequests.length}</strong> applications
              </span>
              <span className="text-neutral-300">|</span>
              <div className="flex items-center gap-1.5">
                <span>Rows:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-neutral-200 rounded-lg px-2 py-1 text-xs font-bold text-neutral-700 outline-none"
                >
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="rounded-lg h-8 px-2.5 text-xs font-bold border-neutral-200 disabled:opacity-40"
              >
                Previous
              </Button>
              <div className="px-2.5 text-xs font-bold text-neutral-700">
                Page {currentPage} of {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="rounded-lg h-8 px-2.5 text-xs font-bold border-neutral-200 disabled:opacity-40"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: SUBMIT OVERTIME REQUEST (PROFESSIONAL APPLICATION FORM) */}
      {/* ========================================================================= */}
      <Dialog open={isSubmitModalOpen} onOpenChange={setIsSubmitModalOpen}>
        <DialogContent className="max-w-xl bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-neutral-100 max-h-[90vh] overflow-y-auto font-sans">
          <DialogHeader className="pb-3 border-b border-neutral-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#1d58d9] flex items-center justify-center shrink-0 border border-blue-100">
                <Clock className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black text-neutral-900 tracking-tight flex items-center gap-2">
                  Official Overtime Application
                  <Badge className="bg-blue-50 text-[#1d58d9] border-blue-200 text-[10px] font-bold px-2 py-0.2">
                    CSC Form 48 Addendum
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-neutral-500">
                  Pursuant to CSC &amp; DBM Joint Circular No. 1, s. 2015. Please declare authorized rendered extra service.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSubmitOvertime} className="space-y-4 pt-3">
            {/* Policy Tip Notice */}
            <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-100 text-xs text-blue-900 flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed text-[11.5px]">
                Overtime must be pre-authorized by your Department Chair or Campus Director. Rendered hours will be corroborated against biometric DTR logs before payroll crediting.
              </p>
            </div>

            {/* Applicant Profile / Target Selection */}
            {!isEmployeeRole ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">Select Employee Applicant *</Label>
                <select
                  value={targetEmployeeId}
                  onChange={(e) => setTargetEmployeeId(e.target.value)}
                  required
                  className="w-full h-10 px-3 rounded-xl border border-neutral-200 bg-white text-xs font-medium text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[#1d58d9]"
                >
                  <option value="">-- Choose Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.lastName}, {emp.firstName} ({emp.employeeId || emp.id}) – {emp.category || emp.position}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Applicant</span>
                  <span className="text-xs font-bold text-neutral-900">
                    {currentEmployeeProfile ? `${currentEmployeeProfile.firstName} ${currentEmployeeProfile.lastName}` : (user?.displayName || user?.email)}
                  </span>
                  <span className="text-[10.5px] text-neutral-500 block">
                    {currentEmployeeProfile?.category || currentEmployeeProfile?.position || 'SLSU Staff'} • {currentEmployeeProfile?.campus || 'Hinunangan Campus'}
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono bg-white border-neutral-300">
                  {currentEmployeeProfile?.employeeId || 'CURRENT USER'}
                </Badge>
              </div>
            )}

            {/* Overtime Date */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-neutral-700">Date of Overtime Service *</Label>
                {overtimeDate && (
                  <span className="text-[11px] font-bold text-[#1d58d9]">
                    {getDayTypeInfo(overtimeDate).label} {getDayTypeInfo(overtimeDate).isWeekend && "• Weekend Service"}
                  </span>
                )}
              </div>
              <Input
                type="date"
                required
                value={overtimeDate}
                onChange={(e) => setOvertimeDate(e.target.value)}
                className="rounded-xl border-neutral-200 text-xs h-10 font-mono"
              />
            </div>

            {/* Quick Time Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-neutral-600 block">Standard University Time Presets:</span>
              <div className="flex flex-wrap gap-1.5">
                {TIME_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setStartTime(preset.start);
                      setEndTime(preset.end);
                    }}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all",
                      startTime === preset.start && endTime === preset.end
                        ? "bg-blue-50 border-[#1d58d9] text-[#1d58d9] shadow-2xs"
                        : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Start Time & End Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">Start Time *</Label>
                <Input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="rounded-xl border-neutral-200 text-xs h-10 font-mono font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">End Time *</Label>
                <Input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="rounded-xl border-neutral-200 text-xs h-10 font-mono font-bold"
                />
              </div>
            </div>

            {/* Duration Summary */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50/60 border border-blue-100">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-blue-900">Total Requested Duration:</span>
              </div>
              <span className="text-xs font-black text-[#1d58d9] font-mono bg-white px-3 py-1 rounded-lg border border-blue-200 shadow-2xs">
                {calculatedHours} Hours
              </span>
            </div>

            {/* Scope of Work & Institutional Justification */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-neutral-700">Purpose &amp; Scope of Work *</Label>
                <span className="text-[10px] text-neutral-400">Required for official audit</span>
              </div>
              <textarea
                required
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Detail the specific tasks or deliverables rendered beyond regular working hours..."
                className="w-full p-3 rounded-xl border border-neutral-200 text-xs font-normal text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#1d58d9]"
              />

              {/* Categorized Quick Template Chips */}
              <div className="pt-1 space-y-1.5">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
                  Quick Institutional Templates:
                </span>
                <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                  {COMMON_REASONS.map((grp, gIdx) => (
                    <div key={gIdx} className="space-y-1">
                      <span className="text-[9.5px] font-bold text-neutral-400 block">{grp.category}:</span>
                      <div className="flex flex-wrap gap-1">
                        {grp.items.map((item, iIdx) => (
                          <button
                            key={iIdx}
                            type="button"
                            onClick={() => setReason(item)}
                            className="text-[10px] text-left px-2 py-0.5 rounded bg-neutral-100 hover:bg-blue-50 hover:text-blue-700 text-neutral-600 border border-neutral-200/60 transition-colors"
                          >
                            • {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Document Link / Special Order Link */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-neutral-700">
                Supporting Memo / Special Order URL (Optional)
              </Label>
              <Input
                type="url"
                value={documentUrl}
                onChange={(e) => setDocumentUrl(e.target.value)}
                placeholder="https://drive.google.com/... or scanned Special Order URL"
                className="rounded-xl border-neutral-200 text-xs h-10"
              />
            </div>

            {/* Submission Pre-Confirmation Card */}
            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 text-xs text-neutral-600 space-y-1">
              <div className="flex justify-between">
                <span>Target Date:</span>
                <strong className="text-neutral-900 font-mono">{overtimeDate || '-'}</strong>
              </div>
              <div className="flex justify-between">
                <span>Rendered Hours:</span>
                <strong className="text-neutral-900 font-mono">{calculatedHours} hrs ({formatTimeTo12H(startTime)} - {formatTimeTo12H(endTime)})</strong>
              </div>
              <div className="flex justify-between">
                <span>Routing:</span>
                <span className="text-amber-700 font-semibold">Immediate Supervisor Endorsement Queue</span>
              </div>
            </div>

            <DialogFooter className="pt-3 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSubmitModalOpen(false)}
                className="rounded-xl border-neutral-200 text-xs h-10 font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || calculatedHours <= 0}
                className="bg-[#1d58d9] hover:bg-[#1444b0] text-white font-bold rounded-xl text-xs h-10 px-5 shadow-sm"
              >
                {isSubmitting ? "Submitting Application..." : "Submit Overtime Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 2: SUPERVISOR REVIEW & DTR VERIFICATION MODAL */}
      {/* ========================================================================= */}
      <Dialog open={isReviewModalOpen} onOpenChange={setIsReviewModalOpen}>
        <DialogContent className="max-w-lg bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-neutral-100 max-h-[90vh] overflow-y-auto font-sans">
          <DialogHeader className="pb-3 border-b border-neutral-100">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border",
                reviewAction === 'approve' 
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                  : "bg-rose-50 text-rose-700 border-rose-200"
              )}>
                {reviewAction === 'approve' ? <Check className="w-5 h-5 stroke-[2.5]" /> : <X className="w-5 h-5 stroke-[2.5]" />}
              </div>
              <div>
                <DialogTitle className="text-lg font-black text-neutral-900 tracking-tight">
                  {reviewAction === 'approve' ? 'Authorize Overtime Service' : 'Decline Overtime Application'}
                </DialogTitle>
                <DialogDescription className="text-xs text-neutral-500">
                  Cross-examine attendance punch records and confirm payable hours for payroll.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4 pt-3">
              {/* Applicant & Application Summary */}
              <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-neutral-900 block">
                      {selectedRequest.lastName}, {selectedRequest.firstName}
                    </span>
                    <span className="text-[10px] text-neutral-500">
                      {selectedRequest.category || selectedRequest.position || 'Staff'} • {selectedRequest.campus || 'SLSU'}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono bg-white">
                    {selectedRequest.employeeNo || selectedRequest.employeeId}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-xl border border-neutral-200/60">
                  <div>
                    <span className="text-neutral-400 block text-[10px] uppercase font-bold">Service Date:</span>
                    <span className="font-bold text-neutral-800">{formatFullServiceDate(selectedRequest.overtimeDate)}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[10px] uppercase font-bold">Time Interval:</span>
                    <span className="font-bold text-neutral-800 font-mono">
                      {formatTimeTo12H(selectedRequest.startTime)} – {formatTimeTo12H(selectedRequest.endTime)}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-bold">Declared Justification:</span>
                  <p className="text-xs text-neutral-800 italic bg-white p-2 rounded-lg border border-neutral-200/60 mt-0.5 leading-relaxed">
                    "{selectedRequest.reason}"
                  </p>
                </div>
              </div>

              {/* DTR Biometric Cross-Reference Verification */}
              <div className="p-3.5 rounded-2xl bg-blue-50/50 border border-blue-100/90 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    Biometric DTR Cross-Check
                  </span>
                  <span className="text-[10.5px] font-bold text-blue-700">
                    {loadingDtrRecord ? 'Verifying biometric logs...' : (dtrRecordOnDate ? '✓ Biometric Punch Confirmed' : 'ℹ️ No Punch Recorded')}
                  </span>
                </div>

                {dtrRecordOnDate ? (
                  <div className="bg-white p-2.5 rounded-xl border border-blue-200/70 space-y-1.5">
                    <div className="grid grid-cols-3 gap-1 text-xs font-mono">
                      <div>
                        <span className="text-[9.5px] text-neutral-400 block uppercase">AM Out:</span>
                        <span className="font-bold text-neutral-800">{dtrRecordOnDate.amOut ? formatTimeTo12H(dtrRecordOnDate.amOut) : '-'}</span>
                      </div>
                      <div>
                        <span className="text-[9.5px] text-neutral-400 block uppercase">PM Out:</span>
                        <span className="font-bold text-neutral-800">{dtrRecordOnDate.pmOut ? formatTimeTo12H(dtrRecordOnDate.pmOut) : '-'}</span>
                      </div>
                      <div>
                        <span className="text-[9.5px] text-neutral-400 block uppercase">Logged DTR:</span>
                        <span className="font-black text-blue-700">{dtrRecordOnDate.hoursWorked || 0} hrs</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-emerald-700 font-semibold pt-0.5">
                      Biometric punch verified. Extra hours beyond 8:00 AM - 5:00 PM are authenticated.
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200/70">
                    No machine punch log found on this date. You may authorize based on signed physical logbook or Special Order.
                  </p>
                )}
              </div>

              {/* Approval Mode Form: Approved Hours & Endorsement */}
              {reviewAction === 'approve' ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-neutral-800">Authorized Hours for Payroll *</Label>
                      <span className="text-[10px] text-neutral-500 font-mono font-bold">
                        Requested: {selectedRequest.requestedHours} hrs
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.25"
                        min="0.5"
                        max="16"
                        value={reviewHours}
                        onChange={(e) => setReviewHours(Number(e.target.value))}
                        className="rounded-xl border-neutral-200 text-xs h-10 font-mono font-black text-neutral-900 w-32"
                      />
                      {/* Quick Adjust Buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setReviewHours(Number(selectedRequest.requestedHours))}
                          className="px-2 py-1.5 text-[11px] font-bold rounded-lg border border-neutral-200 hover:bg-neutral-100"
                        >
                          Full ({selectedRequest.requestedHours}h)
                        </button>
                        <button
                          type="button"
                          onClick={() => setReviewHours(Number((selectedRequest.requestedHours / 2).toFixed(2)))}
                          className="px-2 py-1.5 text-[11px] font-bold rounded-lg border border-neutral-200 hover:bg-neutral-100"
                        >
                          Half ({(selectedRequest.requestedHours / 2).toFixed(1)}h)
                        </button>
                        <button
                          type="button"
                          onClick={() => setReviewHours(h => Math.max(0.5, Number((h - 0.5).toFixed(2))))}
                          className="px-2 py-1.5 text-[11px] font-bold rounded-lg border border-neutral-200 hover:bg-neutral-100"
                        >
                          -0.5h
                        </button>
                        <button
                          type="button"
                          onClick={() => setReviewHours(h => Number((h + 0.5).toFixed(2)))}
                          className="px-2 py-1.5 text-[11px] font-bold rounded-lg border border-neutral-200 hover:bg-neutral-100"
                        >
                          +0.5h
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Endorsement Remarks */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-neutral-800">Official Endorsement Remarks</Label>
                    <textarea
                      rows={2}
                      value={reviewRemarks}
                      onChange={(e) => setReviewRemarks(e.target.value)}
                      placeholder="Enter supervisor endorsement notes..."
                      className="w-full p-2.5 rounded-xl border border-neutral-200 text-xs font-normal text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[#1d58d9]"
                    />

                    {/* Quick Preset Buttons */}
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {APPROVAL_TEMPLATES.map((tmpl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setReviewRemarks(tmpl)}
                          className="text-[9.5px] px-2 py-0.5 rounded bg-neutral-100 hover:bg-emerald-50 hover:text-emerald-800 text-neutral-600 border border-neutral-200/60"
                        >
                          • {tmpl.substring(0, 42)}...
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Rejection Mode Form */
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-rose-800">Rejection Justification *</Label>
                  <textarea
                    rows={3}
                    required
                    value={reviewRemarks}
                    onChange={(e) => setReviewRemarks(e.target.value)}
                    placeholder="State the official ground for declining this overtime application..."
                    className="w-full p-2.5 rounded-xl border border-rose-200 text-xs font-normal text-neutral-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {REJECTION_TEMPLATES.map((tmpl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setReviewRemarks(tmpl)}
                        className="text-[9.5px] px-2 py-0.5 rounded bg-neutral-100 hover:bg-rose-50 hover:text-rose-800 text-neutral-600 border border-neutral-200/60"
                      >
                        • {tmpl.substring(0, 42)}...
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter className="pt-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsReviewModalOpen(false)}
                  className="rounded-xl border-neutral-200 text-xs h-10 font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isProcessingReview || (reviewAction === 'approve' && reviewHours <= 0)}
                  onClick={handleProcessReview}
                  className={cn(
                    "text-white font-bold rounded-xl text-xs h-10 px-5 shadow-sm",
                    reviewAction === 'approve' 
                      ? "bg-emerald-600 hover:bg-emerald-700" 
                      : "bg-rose-600 hover:bg-rose-700"
                  )}
                >
                  {isProcessingReview 
                    ? "Processing..." 
                    : (reviewAction === 'approve' ? `Authorize ${reviewHours} Hours` : "Confirm Rejection")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 3: FULL DETAILS & CERTIFICATE RECORD MODAL */}
      {/* ========================================================================= */}
      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="max-w-lg bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-neutral-100 max-h-[90vh] overflow-y-auto font-sans">
          <DialogHeader className="pb-3 border-b border-neutral-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-neutral-100 text-neutral-700 flex items-center justify-center shrink-0 border border-neutral-200">
                <FileCheck className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black text-neutral-900 tracking-tight">
                  Overtime Service Record
                </DialogTitle>
                <DialogDescription className="text-xs text-neutral-500 font-mono">
                  Control No: {selectedRequest?.id}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4 pt-3">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                <span className="text-xs font-bold text-neutral-500">Official Status</span>
                {renderStatusBadge(selectedRequest.status)}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">Employee Applicant</span>
                  <span className="font-bold text-neutral-900 block mt-0.5">
                    {selectedRequest.lastName}, {selectedRequest.firstName}
                  </span>
                  <span className="text-[10px] text-neutral-500 font-mono">{selectedRequest.employeeNo || selectedRequest.employeeId}</span>
                  <span className="text-[10px] text-neutral-500 block">{selectedRequest.category || selectedRequest.position || 'Staff'}</span>
                </div>

                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">Service Date &amp; Span</span>
                  <span className="font-bold text-neutral-900 block mt-0.5">{formatFullServiceDate(selectedRequest.overtimeDate)}</span>
                  <span className="text-[10px] text-neutral-600 font-mono block">
                    {formatTimeTo12H(selectedRequest.startTime)} – {formatTimeTo12H(selectedRequest.endTime)}
                  </span>
                  <span className="text-[10px] text-neutral-400">{getDayTypeInfo(selectedRequest.overtimeDate).label}</span>
                </div>
              </div>

              {/* Hours Breakdown */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70">
                  <span className="text-[10px] text-neutral-400 block font-bold uppercase">Requested</span>
                  <span className="text-base font-black text-neutral-800 font-mono">{selectedRequest.requestedHours} hrs</span>
                </div>
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70">
                  <span className="text-[10px] text-neutral-400 block font-bold uppercase">Approved</span>
                  <span className="text-base font-black text-emerald-700 font-mono">{selectedRequest.approvedHours || 0} hrs</span>
                </div>
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70">
                  <span className="text-[10px] text-neutral-400 block font-bold uppercase">Payable Units</span>
                  <span className="text-base font-black text-[#1d58d9] font-mono">{selectedRequest.payableHours || 0} hrs</span>
                </div>
              </div>

              {/* Justification */}
              <div className="space-y-1">
                <span className="text-xs font-bold text-neutral-700">Official Purpose &amp; Scope of Work</span>
                <p className="text-xs text-neutral-800 p-3 bg-neutral-50 rounded-xl border border-neutral-200/70 leading-relaxed">
                  {selectedRequest.reason}
                </p>
              </div>

              {/* Supervisor Remarks */}
              {selectedRequest.approvalRemarks && (
                <div className="space-y-1">
                  <span className="text-xs font-bold text-neutral-700">Endorsing Official Remarks</span>
                  <p className="text-xs text-neutral-800 p-3 bg-blue-50/50 rounded-xl border border-blue-100 leading-relaxed">
                    <span className="font-bold text-[#1d58d9]">{selectedRequest.approverName || 'Authorized Official'}: </span>
                    {selectedRequest.approvalRemarks}
                  </p>
                </div>
              )}

              {/* Attachment link if present */}
              {selectedRequest.documentUrl && (
                <div>
                  <a
                    href={selectedRequest.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-3 rounded-xl bg-blue-50 text-[#1d58d9] hover:bg-blue-100 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors border border-blue-200/60"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> View Attached Special Order / Travel Order
                  </a>
                </div>
              )}

              <DialogFooter className="pt-2 gap-2 flex-wrap">
                {selectedRequest.status !== 'pending' && (
                  <Button
                    onClick={() => {
                      const toDel = selectedRequest;
                      setIsDetailsModalOpen(false);
                      setRequestToDelete(toDel);
                    }}
                    variant="outline"
                    className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 font-bold rounded-xl text-xs h-10 px-3 flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    Delete Record
                  </Button>
                )}
                <Button
                  onClick={() => handlePrintSlip(selectedRequest)}
                  variant="outline"
                  className="flex-1 border-neutral-200 hover:bg-neutral-50 text-neutral-800 font-bold rounded-xl text-xs h-10 flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-4 h-4 text-[#1d58d9]" />
                  Download Official Slip (PDF)
                </Button>
                <Button
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="bg-neutral-900 hover:bg-neutral-800 text-white font-bold rounded-xl text-xs h-10 px-5"
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 4: CONFIRM SINGLE DELETE MODAL */}
      {/* ========================================================================= */}
      <Dialog open={!!requestToDelete} onOpenChange={(open) => !open && setRequestToDelete(null)}>
        <DialogContent className="max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-neutral-100 font-sans">
          <DialogHeader className="pb-3 border-b border-neutral-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                <Trash2 className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black text-neutral-900 tracking-tight">
                  Delete Overtime Record
                </DialogTitle>
                <DialogDescription className="text-xs text-neutral-500">
                  {isEmployeeRole
                    ? "Remove this overtime record from your employee account view."
                    : "Remove this overtime record from the administration view."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {requestToDelete && (
            <div className="space-y-4 pt-3 text-xs">
              <p className="text-neutral-600 leading-relaxed">
                Are you sure you want to delete the overtime application for{' '}
                <strong className="text-neutral-900 font-bold">
                  {requestToDelete.lastName ? `${requestToDelete.lastName}, ` : ''}{requestToDelete.firstName || 'Employee'}
                </strong>{' '}
                on <strong className="text-neutral-900 font-bold">{formatFullServiceDate(requestToDelete.overtimeDate)}</strong> ({requestToDelete.requestedHours} hrs)?
              </p>

              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 space-y-1.5">
                <div className="flex items-center justify-between text-neutral-500 text-[11px]">
                  <span>Status:</span>
                  <span className="font-bold text-neutral-800 uppercase">{requestToDelete.status}</span>
                </div>
                <div className="flex items-center justify-between text-neutral-500 text-[11px]">
                  <span>Time Span:</span>
                  <span className="font-mono text-neutral-800">{formatTimeTo12H(requestToDelete.startTime)} – {formatTimeTo12H(requestToDelete.endTime)}</span>
                </div>
                <div className="flex items-center justify-between text-neutral-500 text-[11px]">
                  <span>Control No:</span>
                  <span className="font-mono text-neutral-800">{requestToDelete.id}</span>
                </div>
              </div>

              <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-100 text-[#1d58d9] text-[11px] leading-relaxed">
                {isEmployeeRole ? (
                  <span>
                    <strong>Employee Note:</strong> This record will be hidden from your account view immediately. It remains stored in the administrative archive for payroll & official records until also deleted by administration.
                  </span>
                ) : (
                  <span>
                    <strong>Administration Note:</strong> This record will be hidden from the admin list. If the employee has also deleted this record, it will be permanently purged from the database.
                  </span>
                )}
              </div>

              <DialogFooter className="pt-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isDeleting}
                  onClick={() => setRequestToDelete(null)}
                  className="flex-1 border-neutral-200 text-neutral-700 font-bold rounded-xl text-xs h-10"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDeleteSingle}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs h-10 shadow-sm flex items-center justify-center gap-1.5"
                >
                  {isDeleting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      Confirm Delete
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 5: CONFIRM BATCH DELETE MODAL */}
      {/* ========================================================================= */}
      <Dialog open={isBatchDeleteModalOpen} onOpenChange={setIsBatchDeleteModalOpen}>
        <DialogContent className="max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-neutral-100 font-sans">
          <DialogHeader className="pb-3 border-b border-neutral-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                <Trash2 className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black text-neutral-900 tracking-tight">
                  Batch Delete Records
                </DialogTitle>
                <DialogDescription className="text-xs text-neutral-500">
                  {isEmployeeRole
                    ? "Delete multiple overtime applications from your employee account."
                    : "Delete multiple overtime authorization records from administration."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-3 text-xs">
            <p className="text-neutral-600 leading-relaxed">
              Are you sure you want to delete{' '}
              <strong className="text-rose-600 font-bold text-sm">{selectedIds.length}</strong> selected overtime records?
            </p>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 text-amber-800 text-[11px] leading-relaxed flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <span>
                {isEmployeeRole
                  ? "Selected records will be hidden from your account view immediately. They remain accessible to administrators until both sides remove them."
                  : "Selected records will be removed from your administration view. Any records that have also been deleted by employees will be permanently purged from the database."}
              </span>
            </div>

            <DialogFooter className="pt-2 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isBatchDeleting}
                onClick={() => setIsBatchDeleteModalOpen(false)}
                className="flex-1 border-neutral-200 text-neutral-700 font-bold rounded-xl text-xs h-10"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isBatchDeleting}
                onClick={handleConfirmBatchDelete}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs h-10 shadow-sm flex items-center justify-center gap-1.5"
              >
                {isBatchDeleting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete {selectedIds.length} Records
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
