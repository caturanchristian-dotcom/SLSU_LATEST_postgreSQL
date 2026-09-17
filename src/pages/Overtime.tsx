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
  Layers
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

interface OvertimeRequestItem {
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
  "Grading, Student Assessment & Final Examination Evaluation",
  "Institutional Accreditation Documents Preparation",
  "Emergency System & Campus Network Infrastructure Maintenance",
  "Semester Enrollment & Registration Processing Extension",
  "Payroll Closing, BIR 2316 & Financial Reports Reconciliation",
  "Official University Event & Commencement Exercise Coordination",
  "Urgent Curriculum Revision & Faculty Board Meeting Requirements"
];

const TIME_PRESETS = [
  { label: '5:00 PM – 8:00 PM (3.0 hrs)', start: '17:00', end: '20:00' },
  { label: '5:00 PM – 9:00 PM (4.0 hrs)', start: '17:00', end: '21:00' },
  { label: '6:00 PM – 10:00 PM (4.0 hrs)', start: '18:00', end: '22:00' },
  { label: 'Weekend: 8:00 AM – 5:00 PM (8.0 hrs)', start: '08:00', end: '17:00' },
  { label: 'Weekend: 1:00 PM – 6:00 PM (5.0 hrs)', start: '13:00', end: '18:00' },
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

export default function OvertimePage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { user } = useAuth();
  const isEmployeeRole = user?.role === 'employee';

  const [requests, setRequests] = useState<OvertimeRequestItem[]>(() => cachedOvertimeList || []);
  const [employees, setEmployees] = useState<any[]>(() => cachedEmployeesList || []);
  const [currentEmployeeProfile, setCurrentEmployeeProfile] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(!cachedOvertimeList);
  const [refreshing, setRefreshing] = useState(false);

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
      }

      const employeesPromise = cachedEmployeesList 
        ? Promise.resolve(cachedEmployeesList)
        : fetch('/api/employees')
            .then(res => res.ok ? res.json() : [])
            .catch(() => []);

      const overtimePromise = api.overtime.list(overtimeParams)
        .catch(err => {
          console.error("Overtime list error:", err);
          return { data: [] };
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
      if (startDateFilter && r.overtimeDate < startDateFilter) {
        return false;
      }
      if (endDateFilter && r.overtimeDate > endDateFilter) {
        return false;
      }
      // Search query using deferredSearch for 60fps input responsiveness
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
  }, [requests, statusFilter, selectedEmployeeId, selectedCampus, selectedDepartment, startDateFilter, endDateFilter, deferredSearch]);

  // Paginated requests
  const paginatedRequests = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filteredRequests.slice(startIdx, startIdx + pageSize);
  }, [filteredRequests, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredRequests.length / pageSize) || 1;

  // Summary Metrics
  const stats = useMemo(() => {
    const total = filteredRequests.length;
    const pending = filteredRequests.filter((r) => r.status === 'pending').length;
    const approved = filteredRequests.filter((r) => r.status === 'approved').length;
    const rejected = filteredRequests.filter((r) => r.status === 'rejected').length;
    const cancelled = filteredRequests.filter((r) => r.status === 'cancelled').length;
    const totalApprovedHours = Number(
      filteredRequests
        .filter((r) => r.status === 'approved')
        .reduce((sum, r) => sum + Number(r.approvedHours || r.requestedHours || 0), 0)
        .toFixed(2)
    );
    const totalPayableHours = Number(
      filteredRequests
        .filter((r) => r.status === 'approved')
        .reduce((sum, r) => sum + Number(r.payableHours || r.approvedHours || r.requestedHours || 0), 0)
        .toFixed(2)
    );
    return { total, pending, approved, rejected, cancelled, totalApprovedHours, totalPayableHours };
  }, [filteredRequests]);

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
    const pendingOnPage = paginatedRequests.filter(r => r.status === 'pending').map(r => r.id);
    if (pendingOnPage.length === 0) return;
    
    const allSelected = pendingOnPage.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !pendingOnPage.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...pendingOnPage])));
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
      toast.error("Please provide a reason for the overtime");
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

      toast.success("Overtime request submitted successfully! It is now pending approval.");
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
            approverName: user?.displayName || user?.email || 'Supervisor',
            approvalRemarks: 'Quick approved for official duty.'
          } 
        : item
    ));

    toast.success(`Quick approved overtime for ${req.firstName || 'Employee'} (${targetHours} hrs).`);

    try {
      await api.overtime.approve(req.id, {
        approverId: user?.id || 'admin',
        approverName: user?.displayName || user?.email || 'Supervisor',
        approvalRemarks: 'Quick approved for official duty.',
        approvedHours: targetHours
      });
    } catch (err: any) {
      setRequests(prevRequests);
      toast.error("Failed to approve overtime: " + err.message);
    }
  };

  // Batch Approve Action
  const handleBatchApprove = async () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    const prevRequests = [...requests];
    const idsToApprove = [...selectedIds];

    setRequests(prev => prev.map(item => 
      idsToApprove.includes(item.id)
        ? {
            ...item,
            status: 'approved',
            approvedHours: item.requestedHours,
            payableHours: item.requestedHours,
            approverName: user?.displayName || user?.email || 'Supervisor',
            approvalRemarks: 'Batch approved for official duty.'
          }
        : item
    ));
    setSelectedIds([]);
    toast.success(`Approved ${count} overtime requests successfully.`);

    setIsProcessingBatch(true);
    try {
      await api.overtime.batchApprove({
        ids: idsToApprove,
        approverId: user?.id || 'admin',
        approverName: user?.displayName || user?.email || 'Supervisor',
        approvalRemarks: 'Batch approved for official duty.'
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
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    const prevRequests = [...requests];
    const idsToReject = [...selectedIds];

    setRequests(prev => prev.map(item => 
      idsToReject.includes(item.id)
        ? {
            ...item,
            status: 'rejected',
            approvedHours: 0,
            payableHours: 0,
            approverName: user?.displayName || user?.email || 'Supervisor',
            approvalRemarks: 'Batch declined by supervisor.'
          }
        : item
    ));
    setSelectedIds([]);
    toast.info(`Rejected ${count} overtime requests.`);

    setIsProcessingBatch(true);
    try {
      await api.overtime.batchReject({
        ids: idsToReject,
        approverId: user?.id || 'admin',
        approverName: user?.displayName || user?.email || 'Supervisor',
        rejectionReason: 'Batch declined by supervisor.'
      });
    } catch (err: any) {
      setRequests(prevRequests);
      toast.error("Batch rejection failed: " + err.message);
    } finally {
      setIsProcessingBatch(false);
    }
  };

  // Open Review (Approve/Reject) Modal
  const openReviewModal = async (req: OvertimeRequestItem, action: 'approve' | 'reject') => {
    setSelectedRequest(req);
    setReviewAction(action);
    setReviewHours(Number(req.requestedHours || 0));
    setReviewRemarks(
      action === 'approve' 
        ? 'Approved for official duty and payroll credit.' 
        : 'Overtime request declined based on departmental scheduling / budget allocation.'
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
            approverName: user?.displayName || user?.email || 'Supervisor',
            approvalRemarks: reviewRemarks.trim()
          }
        : item
    ));

    try {
      const approverName = user?.displayName || user?.email || 'Supervisor';
      const approverId = user?.id || 'admin';

      if (reviewAction === 'approve') {
        await api.overtime.approve(targetId, {
          approverId,
          approverName,
          approvalRemarks: reviewRemarks.trim(),
          approvedHours: Number(reviewHours)
        });
        toast.success(`Overtime request approved for ${selectedRequest.firstName || 'Employee'} (${reviewHours} hrs).`);
      } else {
        await api.overtime.reject(targetId, {
          approverId,
          approverName,
          rejectionReason: reviewRemarks.trim()
        });
        toast.info("Overtime request rejected.");
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
    if (!confirm(`Are you sure you want to cancel your overtime request for ${req.overtimeDate}?`)) {
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
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('SOUTHERN LEYTE STATE UNIVERSITY', 105, 18, { align: 'center' });
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Hinunangan Campus • San Roque, Hinunangan, Southern Leyte', 105, 24, { align: 'center' });
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('CERTIFICATE OF OVERTIME SERVICE & AUTHORIZATION SLIP', 105, 34, { align: 'center' });
      
      doc.setLineWidth(0.5);
      doc.line(20, 38, 190, 38);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`CONTROL NO: ${req.id}`, 20, 46);
      doc.setFont('helvetica', 'normal');
      doc.text(`Date Filed: ${req.createdAt ? format(new Date(req.createdAt), 'MMMM dd, yyyy') : req.overtimeDate}`, 140, 46);

      // Box for employee info
      autoTable(doc, {
        startY: 52,
        head: [['EMPLOYEE INFORMATION', 'SERVICE DETAILS']],
        body: [
          [`Name: ${req.lastName ? req.lastName + ', ' : ''}${req.firstName || 'Employee'}\nID No: ${req.employeeNo || req.employeeId}\nPosition: ${req.position || 'Staff'}\nDepartment: ${req.category || 'N/A'}\nCampus: ${req.campus || 'Hinunangan Campus'}`,
           `OT Date: ${req.overtimeDate}\nTime Period: ${formatTimeTo12H(req.startTime)} - ${formatTimeTo12H(req.endTime)}\nRequested: ${req.requestedHours} hrs\nApproved Hours: ${req.approvedHours || 0} hrs\nPayable Units: ${req.payableHours || 0} hrs\nStatus: ${req.status.toUpperCase()}`]
        ],
        theme: 'grid',
        headStyles: { fillColor: [29, 88, 217], textColor: 255, fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 9, cellPadding: 4 },
        margin: { left: 20, right: 20 }
      });

      const currentY = (doc as any).lastAutoTable.finalY + 8;

      doc.setFont('helvetica', 'bold');
      doc.text('JUSTIFICATION / SCOPE OF WORK:', 20, currentY);
      doc.setFont('helvetica', 'normal');
      doc.text(req.reason || 'Official university services rendered.', 20, currentY + 6, { maxWidth: 170 });

      if (req.approvalRemarks) {
        doc.setFont('helvetica', 'bold');
        doc.text('SUPERVISOR REMARKS:', 20, currentY + 22);
        doc.setFont('helvetica', 'normal');
        doc.text(req.approvalRemarks, 20, currentY + 28, { maxWidth: 170 });
      }

      // Signatures
      const sigY = currentY + 50;
      doc.setFont('helvetica', 'normal');
      doc.line(25, sigY, 80, sigY);
      doc.text('Employee Signature', 52, sigY + 5, { align: 'center' });

      doc.line(130, sigY, 185, sigY);
      doc.text(req.approverName || 'Department Head / Approver', 157, sigY + 5, { align: 'center' });
      doc.setFontSize(8);
      doc.text('Authorized Approving Official', 157, sigY + 9, { align: 'center' });

      doc.save(`SLSU_Overtime_Slip_${req.employeeNo || 'Emp'}_${req.overtimeDate}.pdf`);
      toast.success("Overtime slip downloaded successfully");
    } catch (err: any) {
      toast.error("Failed to generate slip: " + err.message);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    try {
      const exportData = filteredRequests.map((r, idx) => ({
        "No.": idx + 1,
        "Request ID": r.id,
        "Employee ID": r.employeeNo || r.employeeId,
        "Employee Name": `${r.lastName ? r.lastName + ', ' : ''}${r.firstName || ''}`,
        "Category / Department": r.category || r.position || 'N/A',
        "Campus": r.campus || 'SLSU Hinunangan Campus',
        "Overtime Date": r.overtimeDate,
        "Start Time": formatTimeTo12H(r.startTime),
        "End Time": formatTimeTo12H(r.endTime),
        "Requested Hours": r.requestedHours,
        "Approved Hours": r.status === 'approved' ? r.approvedHours : 0,
        "Payable Hours": r.status === 'approved' ? r.payableHours : 0,
        "Status": r.status.toUpperCase(),
        "Reason": r.reason,
        "Approver": r.approverName || 'N/A',
        "Approver Remarks": r.approvalRemarks || 'N/A',
        "Submitted Date": r.createdAt ? format(new Date(r.createdAt), 'yyyy-MM-dd HH:mm') : ''
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Overtime Requests");
      XLSX.writeFile(wb, `SLSU_Overtime_Requests_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
      toast.success("Overtime requests exported to Excel successfully");
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
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Hinunangan Campus • Human Resource & Payroll Management Hub', 148, 22, { align: 'center' });
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('OFFICIAL OVERTIME REQUESTS & APPROVAL REPORT', 148, 30, { align: 'center' });
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated on: ${format(new Date(), 'MMMM dd, yyyy hh:mm a')} | Status: ${statusFilter.toUpperCase()}`, 148, 36, { align: 'center' });

      const tableData = filteredRequests.map((r, i) => [
        i + 1,
        r.employeeNo || r.employeeId,
        `${r.lastName ? r.lastName + ', ' : ''}${r.firstName || ''}`,
        r.overtimeDate,
        `${formatTimeTo12H(r.startTime)} - ${formatTimeTo12H(r.endTime)}`,
        `${r.requestedHours} hrs`,
        r.status === 'approved' ? `${r.payableHours || r.approvedHours} hrs` : '-',
        r.status.toUpperCase(),
        r.reason ? (r.reason.length > 35 ? r.reason.substring(0, 32) + '...' : r.reason) : '-',
        r.approverName || '-'
      ]);

      autoTable(doc, {
        startY: 42,
        head: [['#', 'EMP ID', 'EMPLOYEE NAME', 'DATE', 'TIME SPAN', 'REQ', 'PAYABLE', 'STATUS', 'REASON', 'APPROVER']],
        body: tableData,
        theme: 'grid',
        headStyles: { 
          fillColor: [29, 88, 217],
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: 'bold'
        },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 10, right: 10 }
      });

      doc.save(`SLSU_Overtime_Report_${format(new Date(), 'yyyyMMdd')}.pdf`);
      toast.success("Overtime report exported to PDF");
    } catch (err: any) {
      toast.error("Failed to generate PDF: " + err.message);
    }
  };

  // Status Badge Component
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Pending Approval
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200/80">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Rejected
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-neutral-100 text-neutral-600 border border-neutral-200">
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
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#1d58d9] flex items-center justify-center shrink-0 border border-blue-100 shadow-xs">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-black text-neutral-900 tracking-tight">
                Overtime Request &amp; Approval
              </h1>
              <span className="px-2.5 py-0.5 text-[11px] font-bold bg-blue-100/70 text-[#1d58d9] rounded-full border border-blue-200/60">
                Official Form
              </span>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              {isEmployeeRole 
                ? "Submit and track your official overtime requests. Approved hours are verified and integrated automatically into payroll."
                : "Review, verify DTR attendance, and approve or reject employee overtime requests for official payroll computation."}
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRefreshing(true);
              fetchData();
            }}
            disabled={refreshing}
            className="rounded-xl border-neutral-200 text-neutral-700 hover:bg-neutral-50 h-10 font-medium"
          >
            <RefreshCw className={cn("w-4 h-4 mr-1.5", refreshing && "animate-spin")} />
            Refresh
          </Button>

          {!isEmployeeRole && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                className="rounded-xl border-neutral-200 text-neutral-700 hover:bg-neutral-50 h-10 font-medium"
              >
                <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" />
                Export Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPDF}
                className="rounded-xl border-neutral-200 text-neutral-700 hover:bg-neutral-50 h-10 font-medium"
              >
                <Printer className="w-4 h-4 mr-1.5 text-blue-600" />
                Print PDF
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
            className="bg-[#1d58d9] hover:bg-[#1444b0] text-white font-bold rounded-xl h-10 px-4 shadow-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Overtime Request
          </Button>
        </div>
      </div>

      {/* KPI Metric Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-neutral-200/80 shadow-sm bg-white rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">Total Requests</span>
            <div className="w-8 h-8 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-600">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-black text-neutral-900">{stats.total}</span>
            <span className="text-xs text-neutral-400 font-medium">applications</span>
          </div>
        </Card>

        <Card className="border-neutral-200/80 shadow-sm bg-white rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600">Pending Review</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-black text-amber-600">{stats.pending}</span>
            <span className="text-xs text-amber-600/70 font-medium">awaiting supervisor</span>
          </div>
        </Card>

        <Card className="border-neutral-200/80 shadow-sm bg-white rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Approved OT Hours</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-black text-emerald-700">{stats.totalApprovedHours}</span>
            <span className="text-xs text-emerald-600/80 font-medium">hrs approved ({stats.approved} reqs)</span>
          </div>
        </Card>

        <Card className="border-neutral-200/80 shadow-sm bg-white rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#1d58d9]">Payable Hours</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-[#1d58d9]">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-black text-[#1d58d9]">{stats.totalPayableHours}</span>
            <span className="text-xs text-blue-600/80 font-medium">credited to payroll</span>
          </div>
        </Card>
      </div>

      {/* Main Content Area */}
      <Card className="border-neutral-200/80 shadow-sm bg-white rounded-2xl overflow-hidden">
        {/* Filter Toolbar */}
        <div className="p-4 md:p-5 border-b border-neutral-100 bg-neutral-50/50 space-y-3">
          {/* Status Tabs and Date Presets */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-1">
            {/* Status Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: 'All Requests', count: requests.length },
                { id: 'pending', label: 'Pending', count: requests.filter((r) => r.status === 'pending').length },
                { id: 'approved', label: 'Approved', count: requests.filter((r) => r.status === 'approved').length },
                { id: 'rejected', label: 'Rejected', count: requests.filter((r) => r.status === 'rejected').length },
                { id: 'cancelled', label: 'Cancelled', count: requests.filter((r) => r.status === 'cancelled').length },
              ].map((tab) => {
                const active = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setStatusFilter(tab.id);
                      setCurrentPage(1);
                    }}
                    className={cn(
                      "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                      active
                        ? "bg-[#1d58d9] text-white shadow-xs"
                        : "bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200/70"
                    )}
                  >
                    {tab.label}
                    <span className={cn(
                      "px-1.5 py-0.2 rounded-full text-[10px] font-extrabold",
                      active ? "bg-white/20 text-white" : "bg-neutral-100 text-neutral-500"
                    )}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Quick Date Presets */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-neutral-200/80 shrink-0">
              <span className="text-[11px] font-bold text-neutral-400 px-2 uppercase tracking-wider">Preset:</span>
              {(['all', 'today', 'week', 'month'] as const).map((preset) => (
                <button
                  key={preset}
                  onClick={() => handleApplyDatePreset(preset)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all",
                    activeDatePreset === preset 
                      ? "bg-neutral-900 text-white shadow-xs" 
                      : "text-neutral-600 hover:bg-neutral-100"
                  )}
                >
                  {preset === 'week' ? 'This Week' : preset === 'month' ? 'This Month' : preset}
                </button>
              ))}
            </div>
          </div>

          {/* Secondary Search & Filter Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 pt-1">
            {/* Search Input */}
            <div className="relative sm:col-span-2">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Search by employee, ID or reason..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 h-9.5 text-xs bg-white rounded-xl border-neutral-200"
              />
            </div>

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
                placeholder="From Date"
                className="h-9.5 text-xs bg-white rounded-xl border-neutral-200"
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
                placeholder="To Date"
                className="h-9.5 text-xs bg-white rounded-xl border-neutral-200"
              />
            </div>

            {/* Reset Filters */}
            {(searchQuery || startDateFilter || endDateFilter || statusFilter !== 'all' || selectedCampus !== 'all' || selectedDepartment !== 'all') && (
              <div className="flex items-center">
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
                  className="text-xs text-neutral-500 hover:text-neutral-900 h-9.5 px-2"
                >
                  <X className="w-3.5 h-3.5 mr-1" /> Reset Filters
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Batch Operations Bar (Floats above table when items selected) */}
        {!isEmployeeRole && selectedIds.length > 0 && (
          <div className="bg-blue-50/90 border-b border-blue-200/70 px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1d58d9] text-white text-xs font-black">
                {selectedIds.length}
              </span>
              <span className="text-xs font-bold text-neutral-800">
                {selectedIds.length} overtime {selectedIds.length === 1 ? 'request' : 'requests'} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleBatchApprove}
                disabled={isProcessingBatch}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold h-8.5 px-3.5 shadow-xs flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Batch Approve ({selectedIds.length})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleBatchReject}
                disabled={isProcessingBatch}
                className="text-rose-600 border-rose-200 hover:bg-rose-50 rounded-xl text-xs font-bold h-8.5 px-3.5 flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                Batch Reject
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds([])}
                className="text-neutral-500 hover:text-neutral-800 rounded-xl text-xs font-medium h-8.5 px-2"
              >
                Deselect All
              </Button>
            </div>
          </div>
        )}

        {/* Requests Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-16 text-center">
              <div className="w-10 h-10 border-3 border-[#1d58d9] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium text-neutral-500">Loading overtime requests...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="py-16 text-center px-4">
              <div className="w-14 h-14 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto mb-3">
                <Clock className="w-7 h-7 stroke-[1.5]" />
              </div>
              <h3 className="text-base font-bold text-neutral-800">No overtime requests found</h3>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto mt-1">
                {isEmployeeRole
                  ? "You haven't submitted any overtime requests matching this filter. Click 'Overtime Request' above to submit one."
                  : "No overtime records match the current filter selection."}
              </p>
              <Button
                onClick={() => setIsSubmitModalOpen(true)}
                className="mt-4 bg-[#1d58d9] hover:bg-[#1444b0] text-white text-xs font-bold rounded-xl h-9"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Submit Overtime Request
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-neutral-50/80">
                <TableRow className="border-b border-neutral-200/80">
                  {!isEmployeeRole && (
                    <TableHead className="w-10 py-3.5 pl-4 pr-0">
                      <input
                        type="checkbox"
                        aria-label="Select all pending requests on this page"
                        checked={
                          paginatedRequests.filter(r => r.status === 'pending').length > 0 &&
                          paginatedRequests.filter(r => r.status === 'pending').every(r => selectedIds.includes(r.id))
                        }
                        onChange={handleToggleSelectAll}
                        className="rounded border-neutral-300 text-[#1d58d9] focus:ring-blue-500 w-4 h-4 cursor-pointer"
                      />
                    </TableHead>
                  )}
                  <TableHead className={cn("text-xs font-bold text-neutral-600 uppercase py-3.5", isEmployeeRole ? "pl-6" : "pl-3")}>
                    Employee
                  </TableHead>
                  <TableHead className="text-xs font-bold text-neutral-600 uppercase py-3.5">Overtime Date</TableHead>
                  <TableHead className="text-xs font-bold text-neutral-600 uppercase py-3.5">Time Period</TableHead>
                  <TableHead className="text-xs font-bold text-neutral-600 uppercase py-3.5 text-center">Requested</TableHead>
                  <TableHead className="text-xs font-bold text-neutral-600 uppercase py-3.5 text-center">Payable</TableHead>
                  <TableHead className="text-xs font-bold text-neutral-600 uppercase py-3.5">Reason / Justification</TableHead>
                  <TableHead className="text-xs font-bold text-neutral-600 uppercase py-3.5">Status</TableHead>
                  <TableHead className="text-xs font-bold text-neutral-600 uppercase py-3.5">Approver Remarks</TableHead>
                  <TableHead className="text-xs font-bold text-neutral-600 uppercase py-3.5 text-right pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRequests.map((req) => {
                  const empName = `${req.lastName ? req.lastName + ', ' : ''}${req.firstName || 'Employee'}`;
                  const isPending = req.status === 'pending';
                  const isSelected = selectedIds.includes(req.id);

                  return (
                    <TableRow 
                      key={req.id} 
                      className={cn(
                        "hover:bg-neutral-50/70 transition-colors border-b border-neutral-100",
                        isSelected && "bg-blue-50/40"
                      )}
                    >
                      {/* Checkbox Column */}
                      {!isEmployeeRole && (
                        <TableCell className="py-3.5 pl-4 pr-0">
                          {isPending ? (
                            <input
                              type="checkbox"
                              aria-label={`Select request ${req.id}`}
                              checked={isSelected}
                              onChange={() => handleToggleSelectRow(req.id)}
                              className="rounded border-neutral-300 text-[#1d58d9] focus:ring-blue-500 w-4 h-4 cursor-pointer"
                            />
                          ) : (
                            <div className="w-4 h-4" />
                          )}
                        </TableCell>
                      )}

                      {/* Employee Info */}
                      <TableCell className={cn("py-3.5", isEmployeeRole ? "pl-6" : "pl-3")}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold text-neutral-600">
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
                            <span className="text-[10px] text-neutral-400 font-mono">
                              {req.employeeNo || req.employeeId}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Overtime Date */}
                      <TableCell className="py-3.5 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-neutral-800 font-mono">
                            {req.overtimeDate}
                          </span>
                          <span className="text-[10px] text-neutral-400 font-medium">
                            {(() => {
                              try {
                                const d = new Date(req.overtimeDate + 'T00:00:00');
                                return format(d, 'EEEE');
                              } catch {
                                return '';
                              }
                            })()}
                          </span>
                        </div>
                      </TableCell>

                      {/* Time Period */}
                      <TableCell className="py-3.5 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-neutral-100/80 rounded-lg text-xs font-semibold text-neutral-700 font-mono">
                          <Clock className="w-3.5 h-3.5 text-neutral-400" />
                          {formatTimeTo12H(req.startTime)} – {formatTimeTo12H(req.endTime)}
                        </div>
                      </TableCell>

                      {/* Requested Hours */}
                      <TableCell className="py-3.5 text-center font-mono font-bold text-xs text-neutral-700">
                        {req.requestedHours} hrs
                      </TableCell>

                      {/* Payable Hours */}
                      <TableCell className="py-3.5 text-center">
                        {req.status === 'approved' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-extrabold bg-emerald-100 text-emerald-800 font-mono">
                            {req.payableHours || req.approvedHours} hrs
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-400 font-mono">-</span>
                        )}
                      </TableCell>

                      {/* Reason */}
                      <TableCell className="py-3.5 max-w-[220px]">
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
                            <ExternalLink className="w-2.5 h-2.5" /> View Attachment
                          </a>
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell className="py-3.5 whitespace-nowrap">
                        {renderStatusBadge(req.status)}
                      </TableCell>

                      {/* Approver Remarks */}
                      <TableCell className="py-3.5 max-w-[180px]">
                        {req.approvalRemarks ? (
                          <div className="text-xs text-neutral-600 truncate" title={req.approvalRemarks}>
                            <span className="font-semibold text-neutral-700">{req.approverName || 'Approver'}: </span>
                            {req.approvalRemarks}
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-300 italic">No remarks yet</span>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="py-3.5 text-right pr-6 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Print Official Slip (Available for approved records or any record) */}
                          <button
                            onClick={() => handlePrintSlip(req)}
                            title="Print Official Authorization Slip"
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {/* View details */}
                          <button
                            onClick={() => openDetailsModal(req)}
                            title="View Full Details"
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
                              className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50 rounded-lg h-7 px-2 font-semibold"
                            >
                              Cancel
                            </Button>
                          )}

                          {/* Admin / Supervisor Review Buttons */}
                          {!isEmployeeRole && isPending && (
                            <>
                              {/* 1-Click Fast Quick Approve */}
                              <Button
                                size="sm"
                                onClick={() => handleQuickApprove(req)}
                                title="1-Click Approve (Full Requested Hours)"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg h-7 px-2 text-xs font-bold shadow-xs flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" /> Quick Approve
                              </Button>

                              {/* Detailed Review Modal Trigger */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openReviewModal(req, 'approve')}
                                title="Adjust hours or leave customized remarks"
                                className="border-neutral-200 text-neutral-700 hover:bg-neutral-100 rounded-lg h-7 px-2 text-xs font-medium"
                              >
                                Custom
                              </Button>

                              {/* Reject */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openReviewModal(req, 'reject')}
                                className="text-rose-600 border-rose-200 hover:bg-rose-50 rounded-lg h-7 px-1.5 text-xs font-bold"
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </>
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
                <strong className="text-neutral-800">{filteredRequests.length}</strong> entries
              </span>
              <span className="text-neutral-300">|</span>
              <div className="flex items-center gap-1.5">
                <span>Per page:</span>
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
                className="rounded-lg h-8 px-2.5 text-xs font-medium border-neutral-200 disabled:opacity-40"
              >
                Previous
              </Button>
              <div className="px-2 text-xs font-bold text-neutral-700">
                Page {currentPage} of {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="rounded-lg h-8 px-2.5 text-xs font-medium border-neutral-200 disabled:opacity-40"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ========================================================================= */}
      {/* MODAL 1: SUBMIT OVERTIME REQUEST */}
      {/* ========================================================================= */}
      <Dialog open={isSubmitModalOpen} onOpenChange={setIsSubmitModalOpen}>
        <DialogContent className="max-w-lg bg-white rounded-3xl p-6 sm:p-7 shadow-xl border border-neutral-100">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1d58d9] flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black text-neutral-900 tracking-tight">
                  Submit Overtime Request
                </DialogTitle>
                <DialogDescription className="text-xs text-neutral-500">
                  Fill out the details for your required extra working hours.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSubmitOvertime} className="space-y-4 pt-2">
            {/* Employee Selection (if Admin) */}
            {!isEmployeeRole ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">Target Employee *</Label>
                <select
                  value={targetEmployeeId}
                  onChange={(e) => setTargetEmployeeId(e.target.value)}
                  required
                  className="w-full h-10 px-3 rounded-xl border border-neutral-200 bg-white text-xs font-medium text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[#1d58d9]"
                >
                  <option value="">-- Select Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.lastName}, {emp.firstName} ({emp.employeeId || emp.id}) – {emp.category || emp.position}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block">Employee</span>
                  <span className="text-xs font-bold text-neutral-900">
                    {currentEmployeeProfile ? `${currentEmployeeProfile.firstName} ${currentEmployeeProfile.lastName}` : (user?.displayName || user?.email)}
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono bg-white">
                  {currentEmployeeProfile?.employeeId || 'CURRENT USER'}
                </Badge>
              </div>
            )}

            {/* Overtime Date */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-neutral-700">Overtime Date *</Label>
              <Input
                type="date"
                required
                value={overtimeDate}
                onChange={(e) => setOvertimeDate(e.target.value)}
                className="rounded-xl border-neutral-200 text-xs h-10"
              />
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-neutral-500 block">Quick Time Presets</span>
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
                        ? "bg-blue-50 border-[#1d58d9] text-[#1d58d9]"
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
                  className="rounded-xl border-neutral-200 text-xs h-10 font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">End Time *</Label>
                <Input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="rounded-xl border-neutral-200 text-xs h-10 font-mono"
                />
              </div>
            </div>

            {/* Duration Summary */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50/60 border border-blue-100">
              <span className="text-xs font-bold text-blue-900">Total Requested Duration:</span>
              <span className="text-xs font-black text-[#1d58d9] font-mono bg-white px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs">
                {calculatedHours} Hours
              </span>
            </div>

            {/* Reason with suggestions */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-neutral-700">Reason / Justification *</Label>
                <span className="text-[10px] text-neutral-400">Required for audit</span>
              </div>
              <textarea
                required
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain the specific university tasks to be rendered during overtime..."
                className="w-full p-3 rounded-xl border border-neutral-200 text-xs font-normal text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#1d58d9]"
              />

              {/* Common reason chips */}
              <div className="pt-1">
                <span className="text-[10px] font-bold text-neutral-400 block mb-1">Common templates:</span>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {COMMON_REASONS.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setReason(r)}
                      className="text-[10px] text-left px-2 py-0.5 rounded bg-neutral-100 hover:bg-blue-50 hover:text-blue-700 text-neutral-600 transition-colors"
                    >
                      • {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Document URL (Optional) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-neutral-700">Supporting Document / Notice Link (Optional)</Label>
              <Input
                type="url"
                value={documentUrl}
                onChange={(e) => setDocumentUrl(e.target.value)}
                placeholder="https://drive.google.com/... or cloud document URL"
                className="rounded-xl border-neutral-200 text-xs h-10"
              />
            </div>

            <DialogFooter className="pt-3 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSubmitModalOpen(false)}
                className="rounded-xl border-neutral-200 text-xs h-10"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || calculatedHours <= 0}
                className="bg-[#1d58d9] hover:bg-[#1444b0] text-white font-bold rounded-xl text-xs h-10 px-5 shadow-sm"
              >
                {isSubmitting ? "Submitting..." : "Submit Overtime Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 2: ADMIN / SUPERVISOR REVIEW MODAL */}
      {/* ========================================================================= */}
      <Dialog open={isReviewModalOpen} onOpenChange={setIsReviewModalOpen}>
        <DialogContent className="max-w-lg bg-white rounded-3xl p-6 sm:p-7 shadow-xl border border-neutral-100">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center",
                reviewAction === 'approve' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
              )}>
                {reviewAction === 'approve' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
              </div>
              <div>
                <DialogTitle className="text-lg font-black text-neutral-900 tracking-tight">
                  {reviewAction === 'approve' ? 'Approve Overtime Request' : 'Reject Overtime Request'}
                </DialogTitle>
                <DialogDescription className="text-xs text-neutral-500">
                  Review attendance cross-reference and verify payable hours for payroll.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4 pt-2">
              {/* Request Summary Banner */}
              <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-900">
                    {selectedRequest.lastName}, {selectedRequest.firstName}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-500">
                    {selectedRequest.employeeNo || selectedRequest.employeeId}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-neutral-400 block text-[10px]">Date:</span>
                    <span className="font-bold text-neutral-800 font-mono">{selectedRequest.overtimeDate}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[10px]">Time Span:</span>
                    <span className="font-bold text-neutral-800 font-mono">
                      {formatTimeTo12H(selectedRequest.startTime)} – {formatTimeTo12H(selectedRequest.endTime)}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px]">Reason:</span>
                  <p className="text-xs text-neutral-700 italic">"{selectedRequest.reason}"</p>
                </div>
              </div>

              {/* DTR Cross-Reference Verification */}
              <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    DTR Attendance Cross-Check
                  </span>
                  <span className="text-[10px] font-mono text-blue-600">
                    {loadingDtrRecord ? 'Verifying...' : (dtrRecordOnDate ? 'DTR Record Found' : 'No DTR punch yet')}
                  </span>
                </div>
                {dtrRecordOnDate ? (
                  <div className="text-xs text-neutral-700 grid grid-cols-3 gap-1 pt-1 font-mono">
                    <div>
                      <span className="text-[10px] text-neutral-400 block">AM Out:</span>
                      <span>{dtrRecordOnDate.amOut ? formatTimeTo12H(dtrRecordOnDate.amOut) : '-'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 block">PM Out:</span>
                      <span>{dtrRecordOnDate.pmOut ? formatTimeTo12H(dtrRecordOnDate.pmOut) : '-'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 block">DTR Hours:</span>
                      <span className="font-bold text-blue-700">{dtrRecordOnDate.hoursWorked || 0} hrs</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-neutral-500">
                    No punch record found on this date. You may still approve based on official department authorization.
                  </p>
                )}
              </div>

              {/* Editable Approved Hours (if Approving) */}
              {reviewAction === 'approve' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-neutral-700">Official Approved Hours *</Label>
                    <span className="text-[10px] text-neutral-400 font-mono">
                      Requested: {selectedRequest.requestedHours} hrs
                    </span>
                  </div>
                  <Input
                    type="number"
                    step="0.25"
                    min="0.5"
                    max="16"
                    value={reviewHours}
                    onChange={(e) => setReviewHours(Number(e.target.value))}
                    className="rounded-xl border-neutral-200 text-xs h-10 font-mono font-bold"
                  />
                  <span className="text-[10px] text-neutral-400 block">
                    These approved hours will be used by the system to compute official overtime pay.
                  </span>
                </div>
              )}

              {/* Remarks */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">
                  {reviewAction === 'approve' ? 'Approval Remarks' : 'Rejection Reason *'}
                </Label>
                <textarea
                  rows={3}
                  required={reviewAction === 'reject'}
                  value={reviewRemarks}
                  onChange={(e) => setReviewRemarks(e.target.value)}
                  placeholder={reviewAction === 'approve' ? "Enter endorsement notes..." : "Enter clear reason for declining..."}
                  className="w-full p-3 rounded-xl border border-neutral-200 text-xs font-normal text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[#1d58d9]"
                />
              </div>

              <DialogFooter className="pt-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsReviewModalOpen(false)}
                  className="rounded-xl border-neutral-200 text-xs h-10"
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
                  {isProcessingReview ? "Processing..." : (reviewAction === 'approve' ? "Confirm Approval" : "Confirm Rejection")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 3: FULL DETAILS MODAL */}
      {/* ========================================================================= */}
      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="max-w-lg bg-white rounded-3xl p-6 sm:p-7 shadow-xl border border-neutral-100">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-9 h-9 rounded-xl bg-neutral-100 text-neutral-700 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black text-neutral-900 tracking-tight">
                  Overtime Application Details
                </DialogTitle>
                <DialogDescription className="text-xs text-neutral-500 font-mono">
                  {selectedRequest?.id}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                <span className="text-xs font-bold text-neutral-500">Status</span>
                {renderStatusBadge(selectedRequest.status)}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">Employee</span>
                  <span className="font-bold text-neutral-900 block mt-0.5">
                    {selectedRequest.lastName}, {selectedRequest.firstName}
                  </span>
                  <span className="text-[10px] text-neutral-500 font-mono">{selectedRequest.employeeNo || selectedRequest.employeeId}</span>
                </div>

                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">Overtime Date</span>
                  <span className="font-bold text-neutral-900 block mt-0.5 font-mono">{selectedRequest.overtimeDate}</span>
                  <span className="text-[10px] text-neutral-500">
                    {formatTimeTo12H(selectedRequest.startTime)} – {formatTimeTo12H(selectedRequest.endTime)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 bg-neutral-50 rounded-xl border border-neutral-100">
                  <span className="text-[10px] text-neutral-400 block font-bold uppercase">Requested</span>
                  <span className="text-sm font-black text-neutral-800 font-mono">{selectedRequest.requestedHours} hrs</span>
                </div>
                <div className="p-2.5 bg-neutral-50 rounded-xl border border-neutral-100">
                  <span className="text-[10px] text-neutral-400 block font-bold uppercase">Approved</span>
                  <span className="text-sm font-black text-emerald-600 font-mono">{selectedRequest.approvedHours || 0} hrs</span>
                </div>
                <div className="p-2.5 bg-neutral-50 rounded-xl border border-neutral-100">
                  <span className="text-[10px] text-neutral-400 block font-bold uppercase">Payable</span>
                  <span className="text-sm font-black text-[#1d58d9] font-mono">{selectedRequest.payableHours || 0} hrs</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-bold text-neutral-600">Reason</span>
                <p className="text-xs text-neutral-800 p-3 bg-neutral-50 rounded-xl border border-neutral-100 leading-relaxed">
                  {selectedRequest.reason}
                </p>
              </div>

              {selectedRequest.approvalRemarks && (
                <div className="space-y-1">
                  <span className="text-xs font-bold text-neutral-600">Supervisor Remarks</span>
                  <p className="text-xs text-neutral-800 p-3 bg-blue-50/40 rounded-xl border border-blue-100/80 leading-relaxed">
                    <span className="font-bold text-[#1d58d9]">{selectedRequest.approverName || 'Approver'}: </span>
                    {selectedRequest.approvalRemarks}
                  </p>
                </div>
              )}

              {selectedRequest.documentUrl && (
                <div className="pt-1">
                  <a
                    href={selectedRequest.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 px-3 rounded-xl bg-blue-50 text-[#1d58d9] hover:bg-blue-100 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> View Attached Authorization Document
                  </a>
                </div>
              )}

              <DialogFooter className="pt-2">
                <Button
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="w-full bg-neutral-900 hover:bg-neutral-800 text-white font-bold rounded-xl text-xs h-10"
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
