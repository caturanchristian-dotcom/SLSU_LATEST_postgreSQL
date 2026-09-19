import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../components/AuthProvider';
import { useRealtime } from '../hooks/useRealtime';
import { api } from '../lib/api';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { 
  Calendar, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Search, 
  Filter, 
  FileText, 
  Download, 
  Printer, 
  RefreshCw, 
  User, 
  Building2, 
  Check, 
  X, 
  Eye, 
  Trash2, 
  Info, 
  CalendarCheck, 
  ShieldCheck, 
  Layers, 
  Clock,
  FileCheck,
  Settings,
  BarChart3,
  Paperclip,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Edit2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../components/ui/dialog';
import { motion, AnimatePresence } from 'motion/react';

interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveTypeId?: string;
  leaveType: string;
  leaveTypeName?: string;
  leaveTypeCode?: string;
  isPaid?: number | boolean;
  requiresAttachment?: number | boolean;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  attachmentUrl?: string;
  rejectionReason?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
  firstName?: string;
  lastName?: string;
  employeeNo?: string;
  departmentName?: string;
  campus?: string;
  category?: string;
  avatar?: string;
}

interface LeaveType {
  id: string;
  name: string;
  code: string;
  description?: string;
  daysAllowed: number;
  isPaid: number | boolean;
  requiresAttachment: number | boolean;
  applicableGender?: string;
  status: string;
}

interface LeaveBalance {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  allocatedDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
  leaveTypeName?: string;
  leaveTypeCode?: string;
  isPaid?: number | boolean;
  firstName?: string;
  lastName?: string;
  employeeNo?: string;
  departmentName?: string;
}

interface LeavesProps {
  onNavigate?: (page: string) => void;
}

export default function Leaves({ onNavigate }: LeavesProps) {
  const { user, role } = useAuth();
  const isAdmin = role === 'admin' || role === 'super_admin' || role === 'payroll_officer';
  const isDeptHead = role === 'department_head';
  const isEmployee = role === 'employee';

  // Navigation tabs: 'requests' | 'balances' | 'types' | 'reports'
  const [activeTab, setActiveTab] = useState<'requests' | 'balances' | 'types' | 'reports'>('requests');

  // Core Data
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Modals state
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);

  // Selected item for action
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [selectedType, setSelectedType] = useState<LeaveType | null>(null);
  const [selectedBalance, setSelectedBalance] = useState<LeaveBalance | null>(null);

  // Rejection reason input
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // New request form state
  const [formData, setFormData] = useState({
    employeeId: '',
    leaveTypeId: '',
    leaveTypeName: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    daysCount: 1,
    reason: '',
    attachmentUrl: '',
  });

  // Leave Type form state
  const [typeFormData, setTypeFormData] = useState({
    id: '',
    name: '',
    code: '',
    description: '',
    daysAllowed: 15,
    isPaid: true,
    requiresAttachment: false,
    applicableGender: 'ALL',
    status: 'active'
  });

  // Calculate working days helper (timezone-safe)
  const calculateWorkingDays = (startStr: string, endStr: string): number => {
    if (!startStr || !endStr) return 1;
    const sParts = String(startStr).split('T')[0].split('-').map(Number);
    const eParts = String(endStr).split('T')[0].split('-').map(Number);
    if (sParts.length !== 3 || eParts.length !== 3) return 1;

    const start = new Date(sParts[0], sParts[1] - 1, sParts[2]);
    const end = new Date(eParts[0], eParts[1] - 1, eParts[2]);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 1;

    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const day = cur.getDay();
      if (day >= 1 && day <= 5) {
        count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return count > 0 ? count : 1;
  };

  // Helper to parse date parts without timezone offset jumping days
  const parseDateParts = (dateStr?: string | null) => {
    if (!dateStr) return null;
    const clean = String(dateStr).trim().split('T')[0];
    const match = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      const d = new Date(year, month - 1, day);
      if (!isNaN(d.getTime())) {
        const formatted = d.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
        return { year, month, day, formatted };
      }
    }
    const fallback = new Date(dateStr);
    if (!isNaN(fallback.getTime())) {
      return {
        year: fallback.getFullYear(),
        month: fallback.getMonth() + 1,
        day: fallback.getDate(),
        formatted: fallback.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })
      };
    }
    return null;
  };

  // Helper to format "Period & Duration" date range cleanly
  const formatLeavePeriod = (startDateStr?: string | null, endDateStr?: string | null): string => {
    const start = parseDateParts(startDateStr);
    const end = parseDateParts(endDateStr);

    if (!start && !end) return 'N/A';
    if (start && !end) return start.formatted;
    if (!start && end) return end.formatted;

    if (start && end) {
      // Single day
      if (start.year === end.year && start.month === end.month && start.day === end.day) {
        return start.formatted;
      }
      // Same month & year: "Oct 1 – 5, 2026"
      if (start.year === end.year && start.month === end.month) {
        const monthName = new Date(start.year, start.month - 1, 1).toLocaleDateString('en-US', { month: 'short' });
        return `${monthName} ${start.day} – ${end.day}, ${start.year}`;
      }
      // Same year, different months: "Sep 28 – Oct 2, 2026"
      if (start.year === end.year) {
        const startMonth = new Date(start.year, start.month - 1, 1).toLocaleDateString('en-US', { month: 'short' });
        const endMonth = new Date(end.year, end.month - 1, 1).toLocaleDateString('en-US', { month: 'short' });
        return `${startMonth} ${start.day} – ${endMonth} ${end.day}, ${start.year}`;
      }
      // Different years: "Dec 28, 2026 – Jan 3, 2027"
      return `${start.formatted} – ${end.formatted}`;
    }

    return 'N/A';
  };

  // Recalculate days when start/end dates change in apply modal
  useEffect(() => {
    if (formData.startDate && formData.endDate) {
      const calc = calculateWorkingDays(formData.startDate, formData.endDate);
      setFormData(prev => ({ ...prev, daysCount: calc }));
    }
  }, [formData.startDate, formData.endDate]);

  // Load all necessary data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [reqsRes, typesRes, balsRes, summaryRes, empsRes] = await Promise.all([
        api.leaves.getRequests({ year: selectedYear }),
        api.leaves.getTypes(),
        api.leaves.getBalances({ year: selectedYear }),
        api.leaves.getSummary(selectedYear),
        isAdmin ? api.employees.list().catch(() => []) : Promise.resolve([])
      ]);

      setRequests(Array.isArray(reqsRes) ? reqsRes : []);
      setLeaveTypes(Array.isArray(typesRes) ? typesRes : []);
      setBalances(Array.isArray(balsRes) ? balsRes : []);
      setSummary(summaryRes || null);
      if (Array.isArray(empsRes)) setEmployees(empsRes);
    } catch (err: any) {
      console.error("Error fetching leaves data:", err);
      toast.error(err.message || "Failed to load leave records");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedYear, isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription
  useRealtime(
    ['leave_requests_changed', 'leaves_changed', 'leaves', 'payroll_changed', 'dtr_changed'],
    () => {
      fetchData();
    }
  );

  // Manual refresh
  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  // Filtered requests
  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      const matchesStatus = statusFilter === 'all' || r.status.toLowerCase() === statusFilter.toLowerCase();
      const matchesType = typeFilter === 'all' || r.leaveTypeId === typeFilter || r.leaveTypeCode === typeFilter;
      
      const search = searchQuery.toLowerCase().trim();
      const matchesSearch = !search || 
        `${r.firstName || ''} ${r.lastName || ''}`.toLowerCase().includes(search) ||
        (r.employeeNo || '').toLowerCase().includes(search) ||
        (r.leaveTypeName || r.leaveType || '').toLowerCase().includes(search) ||
        (r.reason || '').toLowerCase().includes(search);

      return matchesStatus && matchesType && matchesSearch;
    });
  }, [requests, statusFilter, typeFilter, searchQuery]);

  // Handle Request Actions
  const handleApprove = async (request: LeaveRequest) => {
    try {
      setActionLoading(true);
      await api.leaves.approve(request.id);
      toast.success(`Leave request for ${request.firstName || 'Employee'} approved`);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to approve leave request");
    } finally {
      setActionLoading(false);
    }
  };

  const openRejectModal = (request: LeaveRequest) => {
    setSelectedRequest(request);
    setRejectionReason('');
    setIsRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!selectedRequest) return;
    if (!rejectionReason.trim()) {
      toast.error("Please enter a rejection reason");
      return;
    }

    try {
      setActionLoading(true);
      await api.leaves.reject(selectedRequest.id, { rejectionReason: rejectionReason.trim() });
      toast.success("Leave request has been rejected");
      setIsRejectModalOpen(false);
      setSelectedRequest(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to reject leave request");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async (request: LeaveRequest) => {
    const confirm = window.confirm("Are you sure you want to cancel this leave request?");
    if (!confirm) return;

    try {
      setActionLoading(true);
      await api.leaves.cancel(request.id);
      toast.success("Leave request cancelled");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel leave request");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (request: LeaveRequest) => {
    const confirm = window.confirm("Are you sure you want to permanently delete this leave request record?");
    if (!confirm) return;

    try {
      setActionLoading(true);
      await api.leaves.delete(request.id);
      toast.success("Leave request record deleted");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete leave request");
    } finally {
      setActionLoading(false);
    }
  };

  // Open apply modal
  const handleOpenApplyModal = () => {
    const defaultType = leaveTypes[0];
    setFormData({
      employeeId: employees[0]?.id || '',
      leaveTypeId: defaultType?.id || '',
      leaveTypeName: defaultType?.name || 'Vacation Leave',
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
      daysCount: 1,
      reason: '',
      attachmentUrl: '',
    });
    setIsApplyModalOpen(true);
  };

  // Submit apply form
  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.startDate || !formData.endDate) {
      toast.error("Please select start and end dates");
      return;
    }
    const finalTypeName = formData.leaveTypeName.trim();
    if (!finalTypeName) {
      toast.error("Please enter or select a leave type");
      return;
    }
    if (!formData.reason.trim()) {
      toast.error("Please provide a reason for the leave application");
      return;
    }

    const selectedTypeObj = leaveTypes.find(t => 
      (formData.leaveTypeId && t.id === formData.leaveTypeId) ||
      t.name.toLowerCase() === finalTypeName.toLowerCase() ||
      t.code.toLowerCase() === finalTypeName.toLowerCase()
    );

    if (selectedTypeObj?.requiresAttachment && !formData.attachmentUrl) {
      toast.error(`A supporting document or medical attachment is required for ${selectedTypeObj.name}`);
      return;
    }

    try {
      setActionLoading(true);
      await api.leaves.createRequest({
        employeeId: isAdmin ? formData.employeeId : undefined,
        leaveTypeId: selectedTypeObj?.id || (formData.leaveTypeId || undefined),
        leaveType: finalTypeName,
        startDate: formData.startDate,
        endDate: formData.endDate,
        daysCount: formData.daysCount,
        reason: formData.reason.trim(),
        attachmentUrl: formData.attachmentUrl || undefined,
      });

      toast.success("Leave application submitted successfully!");
      setIsApplyModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit leave application");
    } finally {
      setActionLoading(false);
    }
  };

  // Save / update leave type
  const handleSaveLeaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeFormData.name || !typeFormData.code) {
      toast.error("Name and code are required");
      return;
    }

    try {
      setActionLoading(true);
      if (typeFormData.id) {
        await api.leaves.updateType(typeFormData.id, typeFormData);
        toast.success("Leave type updated successfully");
      } else {
        await api.leaves.createType(typeFormData);
        toast.success("New leave type created successfully");
      }
      setIsTypeModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save leave type");
    } finally {
      setActionLoading(false);
    }
  };

  // Generate annual balances
  const handleGenerateBalances = async () => {
    try {
      setActionLoading(true);
      const res = await api.leaves.generateBalances(selectedYear);
      toast.success(res.message || "Annual leave balances allocated successfully");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate balances");
    } finally {
      setActionLoading(false);
    }
  };

  // Status badge styling helper
  const renderStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    switch (s) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Approved
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            Pending
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" />
            Rejected
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <X className="w-3 h-3 text-slate-500" />
            Cancelled
          </span>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="w-full space-y-5">
      {/* Top Header & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {isEmployee ? 'My Leave Applications' : 'Leave Management'}
            </h1>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 uppercase tracking-wide">
              {role?.replace('_', ' ')}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {isEmployee
              ? 'Submit leave requests, track approval status, and monitor your available leave balances.'
              : isDeptHead
              ? 'Review and authorize leave applications submitted by personnel under your department.'
              : 'Complete institutional leave management, balance allocations, leave types, and DTR/payroll synchronization.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-9 px-3 text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Button
            onClick={handleOpenApplyModal}
            size="sm"
            className="h-9 px-3.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Apply for Leave</span>
          </Button>
        </div>
      </div>

      {/* Metrics Summary Strip */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3.5 mb-5">
          <div className="bg-white rounded-xl p-3 sm:p-3.5 border border-slate-200/80 shadow-xs">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Total Filed</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl sm:text-2xl font-bold text-slate-900">{summary.total || 0}</span>
              <FileCheck className="w-4 h-4 text-slate-400" />
            </div>
          </div>

          <div className="bg-white rounded-xl p-3 sm:p-3.5 border border-amber-200/80 shadow-xs bg-amber-50/20">
            <span className="text-[11px] font-medium text-amber-700 uppercase tracking-wider block">Pending Review</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl sm:text-2xl font-bold text-amber-600">{summary.pending || 0}</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
          </div>

          <div className="bg-white rounded-xl p-3 sm:p-3.5 border border-emerald-200/80 shadow-xs bg-emerald-50/20">
            <span className="text-[11px] font-medium text-emerald-700 uppercase tracking-wider block">Approved</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl sm:text-2xl font-bold text-emerald-600">{summary.approved || 0}</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
          </div>

          <div className="bg-white rounded-xl p-3 sm:p-3.5 border border-rose-200/80 shadow-xs bg-rose-50/20">
            <span className="text-[11px] font-medium text-rose-700 uppercase tracking-wider block">Rejected</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl sm:text-2xl font-bold text-rose-600">{summary.rejected || 0}</span>
              <XCircle className="w-4 h-4 text-rose-500" />
            </div>
          </div>

          <div className="bg-white rounded-xl p-3 sm:p-3.5 border border-slate-200/80 shadow-xs">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Cancelled</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl sm:text-2xl font-bold text-slate-600">{summary.cancelled || 0}</span>
              <X className="w-4 h-4 text-slate-400" />
            </div>
          </div>

          <div className="bg-white rounded-xl p-3 sm:p-3.5 border border-blue-200/80 shadow-xs bg-blue-50/20">
            <span className="text-[11px] font-medium text-blue-700 uppercase tracking-wider block">Approved Days</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl sm:text-2xl font-bold text-blue-600">{summary.totalApprovedDays || 0} d</span>
              <Calendar className="w-4 h-4 text-blue-500" />
            </div>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 mb-5 overflow-x-auto scrollbar-none pb-1">
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeTab === 'requests'
              ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>{isEmployee ? 'My Requests' : 'Leave Applications'}</span>
          {summary?.pending > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
              {summary.pending}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('balances')}
          className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeTab === 'balances'
              ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <CalendarCheck className="w-4 h-4" />
          <span>{isEmployee ? 'My Leave Balances' : 'Leave Balances'}</span>
        </button>

        {isAdmin && (
          <button
            onClick={() => setActiveTab('types')}
            className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'types'
                ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Leave Types & Rules</span>
          </button>
        )}

        {(isAdmin || isDeptHead) && (
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'reports'
                ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Reports & Statistics</span>
          </button>
        )}
      </div>

      {/* ======================================================== */}
      {/* TAB 1: LEAVE REQUESTS TABLE / CARDS                     */}
      {/* ======================================================== */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          {/* Filter & Search Bar */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 sm:p-4 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Search employee, leave type, reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs sm:text-sm bg-slate-50 border-slate-200 w-full"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Status Pill Filters */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs">
                {['all', 'pending', 'approved', 'rejected', 'cancelled'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-md capitalize font-medium transition-colors ${
                      statusFilter === st
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {/* Leave Type Select */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">All Leave Types</option>
                {leaveTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table / Card Container */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-12 text-center">
                <RefreshCw className="w-7 h-7 text-blue-600 animate-spin mx-auto mb-2" />
                <p className="text-xs sm:text-sm text-slate-500">Loading leave applications...</p>
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2.5" />
                <h3 className="text-sm font-semibold text-slate-800">No leave requests found</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
                    ? 'Try adjusting your filters or search terms.'
                    : isEmployee
                    ? 'You have not submitted any leave requests yet. Click "Apply for Leave" to create one.'
                    : 'There are currently no leave applications matching your scope.'}
                </p>
                <Button
                  onClick={handleOpenApplyModal}
                  size="sm"
                  variant="outline"
                  className="mt-3.5 text-xs h-8"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Apply for Leave
                </Button>
              </div>
            ) : (
              <>
                {/* Desktop Table View (>= 768px) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                        <th className="py-3 px-4">Employee</th>
                        <th className="py-3 px-4">Leave Type</th>
                        <th className="py-3 px-4">Period & Duration</th>
                        <th className="py-3 px-4">Reason & Details</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                                {req.firstName ? req.firstName[0] : 'U'}
                              </div>
                              <div>
                                <div className="font-medium text-slate-900">
                                  {req.firstName ? `${req.firstName} ${req.lastName}` : 'Current Employee'}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {req.employeeNo || req.employeeId} {req.departmentName ? `• ${req.departmentName}` : ''}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-800">
                              {req.leaveTypeName || req.leaveType}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                                req.isPaid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}>
                                {req.isPaid ? 'With Pay' : 'Without Pay'}
                              </span>
                              {req.attachmentUrl && (
                                <a
                                  href={req.attachmentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5"
                                  title="View attachment"
                                >
                                  <Paperclip className="w-3 h-3" />
                                  Attached
                                </a>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900 flex items-center gap-1.5 whitespace-nowrap">
                              <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span>{formatLeavePeriod(req.startDate, req.endDate)}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                              <span className="font-semibold text-slate-700">{req.daysCount}</span>
                              <span>working {Number(req.daysCount) === 1 ? 'day' : 'days'}</span>
                            </div>
                          </td>

                          <td className="py-3 px-4 max-w-xs">
                            <div className="truncate text-slate-700" title={req.reason}>
                              {req.reason || 'No description provided'}
                            </div>
                            {req.rejectionReason && req.status === 'rejected' && (
                              <div className="text-[11px] text-rose-600 truncate mt-0.5" title={req.rejectionReason}>
                                Rejection: {req.rejectionReason}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            {renderStatusBadge(req.status)}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => {
                                  setSelectedRequest(req);
                                  setIsDetailModalOpen(true);
                                }}
                                title="View details"
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {/* Approvals for Dept Head & Admin */}
                              {(isAdmin || isDeptHead) && req.status === 'pending' && (
                                <>
                                  <button
                                    onClick={() => handleApprove(req)}
                                    disabled={actionLoading}
                                    title="Approve leave request"
                                    className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-md transition-colors"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    onClick={() => openRejectModal(req)}
                                    disabled={actionLoading}
                                    title="Reject leave request"
                                    className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-md transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}

                              {/* Cancel for Employee or Admin */}
                              {(isEmployee || isAdmin) && req.status === 'pending' && (
                                <button
                                  onClick={() => handleCancel(req)}
                                  disabled={actionLoading}
                                  title="Cancel request"
                                  className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Admin permanent delete */}
                              {isAdmin && (
                                <button
                                  onClick={() => handleDelete(req)}
                                  disabled={actionLoading}
                                  title="Delete record"
                                  className="p-1.5 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View (< 768px) */}
                <div className="block md:hidden divide-y divide-slate-100">
                  {filteredRequests.map((req) => (
                    <div key={req.id} className="p-3.5 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                            {req.firstName ? req.firstName[0] : 'U'}
                          </div>
                          <div>
                            <div className="font-semibold text-xs text-slate-900">
                              {req.firstName ? `${req.firstName} ${req.lastName}` : 'Current Employee'}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {req.employeeNo || req.employeeId} {req.departmentName ? `• ${req.departmentName}` : ''}
                            </div>
                          </div>
                        </div>
                        {renderStatusBadge(req.status)}
                      </div>

                      <div className="bg-slate-50 rounded-lg p-2.5 text-xs space-y-1 border border-slate-200/60">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800">
                            {req.leaveTypeName || req.leaveType}
                          </span>
                          <span className="text-slate-600 text-[11px] font-medium">
                            {req.daysCount} {req.daysCount === 1 ? 'day' : 'days'}
                          </span>
                        </div>

                        <div className="text-slate-700 text-xs font-medium flex items-center gap-1.5 flex-wrap">
                          <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>{formatLeavePeriod(req.startDate, req.endDate)}</span>
                          <span className="text-slate-300">•</span>
                          <span className="text-slate-600 text-[11px] font-medium">
                            {req.daysCount} {Number(req.daysCount) === 1 ? 'day' : 'days'}
                          </span>
                        </div>

                        <div className="text-slate-500 text-[11px] italic line-clamp-2 pt-0.5">
                          "{req.reason || 'No description provided'}"
                        </div>

                        {req.rejectionReason && req.status === 'rejected' && (
                          <div className="text-[11px] text-rose-600 font-medium pt-1 border-t border-rose-100">
                            Reason for rejection: {req.rejectionReason}
                          </div>
                        )}
                      </div>

                      {/* Mobile Action Buttons */}
                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedRequest(req);
                            setIsDetailModalOpen(true);
                          }}
                          className="h-8 px-2 text-xs"
                        >
                          Details
                        </Button>

                        {(isAdmin || isDeptHead) && req.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleApprove(req)}
                              disabled={actionLoading}
                              className="h-8 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <Check className="w-3 h-3 mr-1" />
                              Approve
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openRejectModal(req)}
                              disabled={actionLoading}
                              className="h-8 px-2 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                            >
                              <X className="w-3 h-3 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}

                        {(isEmployee || isAdmin) && req.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancel(req)}
                            disabled={actionLoading}
                            className="h-8 px-2 text-xs text-slate-600 border-slate-200 hover:bg-slate-100"
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: LEAVE BALANCES                                    */}
      {/* ======================================================== */}
      {activeTab === 'balances' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Year:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded font-semibold text-slate-800"
              >
                {[2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {isAdmin && (
              <Button
                onClick={handleGenerateBalances}
                disabled={actionLoading}
                size="sm"
                variant="outline"
                className="h-8 text-xs flex items-center gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Initialize / Refresh Annual Balances</span>
              </Button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            {balances.length === 0 ? (
              <div className="p-12 text-center">
                <CalendarCheck className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-slate-800">No balance records found</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {isAdmin
                    ? 'Click "Initialize / Refresh Annual Balances" to automatically create balance allocations for all active employees.'
                    : 'Balances have not been allocated yet for this year. Please contact HR / Payroll.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Leave Type</th>
                      <th className="py-3 px-4 text-center">Allocated</th>
                      <th className="py-3 px-4 text-center">Used</th>
                      <th className="py-3 px-4 text-center">Pending</th>
                      <th className="py-3 px-4 text-center">Remaining</th>
                      {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {balances.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">
                            {b.firstName ? `${b.firstName} ${b.lastName}` : 'Current Employee'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {b.employeeNo || b.employeeId} {b.departmentName ? `• ${b.departmentName}` : ''}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-800">{b.leaveTypeName}</span>
                          <span className="ml-1 text-[10px] text-slate-500">({b.leaveTypeCode})</span>
                        </td>

                        <td className="py-3 px-4 text-center font-medium text-slate-700">
                          {b.allocatedDays} d
                        </td>

                        <td className="py-3 px-4 text-center font-medium text-blue-600">
                          {b.usedDays} d
                        </td>

                        <td className="py-3 px-4 text-center font-medium text-amber-600">
                          {b.pendingDays} d
                        </td>

                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                            Number(b.remainingDays) > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {b.remainingDays} d
                          </span>
                        </td>

                        {isAdmin && (
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => {
                                setSelectedBalance(b);
                                setIsBalanceModalOpen(true);
                              }}
                              className="p-1 text-slate-500 hover:text-blue-600 rounded"
                              title="Adjust Balance"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: LEAVE TYPES & SETTINGS (ADMIN ONLY)               */}
      {/* ======================================================== */}
      {activeTab === 'types' && isAdmin && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              Configured Leave Types ({leaveTypes.length})
            </h2>
            <Button
              onClick={() => {
                setTypeFormData({
                  id: '',
                  name: '',
                  code: '',
                  description: '',
                  daysAllowed: 15,
                  isPaid: true,
                  requiresAttachment: false,
                  applicableGender: 'ALL',
                  status: 'active'
                });
                setIsTypeModalOpen(true);
              }}
              size="sm"
              className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Leave Type
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {leaveTypes.map((t) => (
              <div key={t.id} className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-slate-900">{t.name}</span>
                      <span className="ml-1.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {t.code}
                      </span>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      t.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {t.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                    {t.description || 'No description provided.'}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-1 text-xs">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Default Days:</span>
                    <span className="font-semibold text-slate-900">{t.daysAllowed} days/yr</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-600">
                    <span>Pay Treatment:</span>
                    <span className={`font-semibold ${t.isPaid ? 'text-emerald-700' : 'text-slate-600'}`}>
                      {t.isPaid ? 'With Pay (100%)' : 'Without Pay'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-600">
                    <span>Attachment Required:</span>
                    <span className="font-semibold text-slate-800">
                      {t.requiresAttachment ? 'Yes (Mandatory)' : 'Optional'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-600">
                    <span>Applicability:</span>
                    <span className="font-semibold text-slate-800">{t.applicableGender || 'ALL'}</span>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTypeFormData({
                          id: t.id,
                          name: t.name,
                          code: t.code,
                          description: t.description || '',
                          daysAllowed: t.daysAllowed,
                          isPaid: Boolean(t.isPaid),
                          requiresAttachment: Boolean(t.requiresAttachment),
                          applicableGender: t.applicableGender || 'ALL',
                          status: t.status || 'active'
                        });
                        setIsTypeModalOpen(true);
                      }}
                      className="h-7 px-2 text-xs"
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: REPORTS & STATISTICS                             */}
      {/* ======================================================== */}
      {activeTab === 'reports' && (isAdmin || isDeptHead) && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              <span>Leave Utilization by Leave Type</span>
            </h3>

            {summary?.byType && summary.byType.length > 0 ? (
              <div className="space-y-2.5">
                {summary.byType.map((bt: any) => (
                  <div key={bt.name} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">{bt.name}</span>
                      <span className="text-slate-500 font-semibold">
                        {bt.count} requests • {bt.days} approved days
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{
                          width: `${Math.min(100, summary.totalApprovedDays > 0 ? (bt.days / summary.totalApprovedDays) * 100 : 0)}%`
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No utilization data available for the selected period.</p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              <span>Leave Applications by Department</span>
            </h3>

            {summary?.byDepartment && summary.byDepartment.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {summary.byDepartment.map((bd: any) => (
                  <div key={bd.name} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                    <div className="font-semibold text-xs text-slate-900">{bd.name}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      <span className="text-slate-900 font-bold">{bd.count}</span> total •{' '}
                      <span className="text-emerald-600 font-semibold">{bd.approved}</span> approved
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No department breakdown available.</p>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: APPLY FOR LEAVE                                 */}
      {/* ======================================================== */}
      <Dialog open={isApplyModalOpen} onOpenChange={setIsApplyModalOpen}>
        <DialogContent className="sm:max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-bold text-slate-900">
              Submit Leave Application
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Provide the leave duration, category, reason, and any required medical or travel certificates.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleApplySubmit} className="space-y-3.5 py-2 text-xs sm:text-sm">
            {/* If Admin: can file on behalf of an employee */}
            {isAdmin && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Employee <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.employeeId}
                  onChange={(e) => setFormData(prev => ({ ...prev, employeeId: e.target.value }))}
                  className="w-full h-9 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium"
                  required
                >
                  <option value="">-- Select Employee --</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.lastName}, {e.firstName} ({e.employeeId || e.id})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Leave Type - Editable and Input-capable */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700">
                  Leave Type <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] text-[#1d58d9] font-medium flex items-center gap-1">
                  <Edit2 className="w-3 h-3" /> Editable / Custom input
                </span>
              </div>

              {/* Direct Editable Text Input */}
              <div className="relative">
                <Input
                  type="text"
                  value={formData.leaveTypeName}
                  onChange={(e) => {
                    const typed = e.target.value;
                    const matched = leaveTypes.find(t => 
                      t.name.toLowerCase() === typed.trim().toLowerCase() ||
                      t.code.toLowerCase() === typed.trim().toLowerCase()
                    );
                    setFormData(prev => ({
                      ...prev,
                      leaveTypeName: typed,
                      leaveTypeId: matched ? matched.id : ''
                    }));
                  }}
                  placeholder="Type or customize leave type (e.g. Vacation Leave, Sick Leave, Study Leave...)"
                  list="leave-types-datalist"
                  className="h-9 text-xs bg-slate-50 border-slate-200 font-medium focus:bg-white pr-8"
                  required
                />
                <datalist id="leave-types-datalist">
                  {leaveTypes.map(t => (
                    <option key={t.id} value={t.name}>
                      {t.code} • {t.isPaid ? 'With Pay' : 'Without Pay'} • Max {t.daysAllowed} days
                    </option>
                  ))}
                </datalist>
              </div>

              {/* Quick Select Presets Dropdown */}
              <div className="flex items-center gap-2">
                <select
                  value={
                    leaveTypes.find(t => 
                      (formData.leaveTypeId && t.id === formData.leaveTypeId) || 
                      t.name.toLowerCase() === formData.leaveTypeName.trim().toLowerCase()
                    )?.id || ''
                  }
                  onChange={(e) => {
                    const selId = e.target.value;
                    if (selId) {
                      const sel = leaveTypes.find(t => t.id === selId);
                      if (sel) {
                        setFormData(prev => ({
                          ...prev,
                          leaveTypeId: sel.id,
                          leaveTypeName: sel.name
                        }));
                      }
                    }
                  }}
                  className="w-full h-8 px-2 text-[11px] bg-slate-100/90 border border-slate-200 rounded-md text-slate-700 font-medium hover:bg-slate-100 transition-colors"
                >
                  <option value="">-- Quick fill from standard leave presets --</option>
                  {leaveTypes.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code}) • {t.isPaid ? 'With Pay' : 'Without Pay'} • Max {t.daysAllowed}d
                    </option>
                  ))}
                </select>
              </div>

              {/* Preset Chips */}
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                <span className="text-[10px] text-slate-400 font-medium">Suggestions:</span>
                {leaveTypes.slice(0, 6).map(t => {
                  const isSelected = formData.leaveTypeName.toLowerCase() === t.name.toLowerCase();
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        leaveTypeId: t.id,
                        leaveTypeName: t.name
                      }))}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#1d58d9] text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {t.code}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date Selection */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Start Date <span className="text-rose-500">*</span>
                </label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                  className="h-9 text-xs bg-slate-50 border-slate-200"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  End Date <span className="text-rose-500">*</span>
                </label>
                <Input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                  className="h-9 text-xs bg-slate-50 border-slate-200"
                  required
                />
              </div>
            </div>

            {/* Realtime Calculated Days Banner */}
            <div className="bg-blue-50/80 border border-blue-200 rounded-lg p-2.5 flex items-center justify-between text-xs text-blue-900">
              <span className="flex items-center gap-1.5 font-medium">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>Calculated Working Days (Mon-Fri):</span>
              </span>
              <span className="font-bold text-sm text-blue-700">{formData.daysCount} days</span>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason / Justification <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Explain the reason for requesting leave..."
                rows={3}
                className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            {/* Optional Attachment (URL or upload) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Supporting Attachment URL (Medical Certificate / Travel Order)
              </label>
              <Input
                type="url"
                placeholder="https://... or attachment document link"
                value={formData.attachmentUrl}
                onChange={(e) => setFormData(prev => ({ ...prev, attachmentUrl: e.target.value }))}
                className="h-9 text-xs bg-slate-50 border-slate-200"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Required for Sick Leave exceeding 3 days and Maternity/Paternity applications.
              </span>
            </div>

            <DialogFooter className="pt-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsApplyModalOpen(false)}
                size="sm"
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={actionLoading}
                size="sm"
                className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium"
              >
                {actionLoading ? 'Submitting...' : 'Submit Application'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* MODAL 2: REJECTION REASON DIALOG                         */}
      {/* ======================================================== */}
      <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
        <DialogContent className="sm:max-w-md w-full">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-700 flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              <span>Reject Leave Application</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Department Heads and Administrators must specify a clear reason when rejecting an employee's leave request.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3 text-xs">
            <p className="text-slate-700">
              You are rejecting the application filed by{' '}
              <strong className="text-slate-900">
                {selectedRequest?.firstName} {selectedRequest?.lastName}
              </strong>{' '}
              for <strong className="text-slate-900">{selectedRequest?.leaveType}</strong> (
              {selectedRequest?.daysCount} days).
            </p>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Reason for Rejection <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="E.g., Inadequate department coverage, conflicting exam schedule, insufficient leave balance..."
                rows={3}
                className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-rose-500"
                required
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsRejectModalOpen(false)}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmReject}
              disabled={actionLoading}
              className="h-8 text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium"
            >
              {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* MODAL 3: VIEW DETAILS & AUDIT LOG                        */}
      {/* ======================================================== */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="sm:max-w-md w-full max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Leave Application Details
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              ID: {selectedRequest?.id}
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-3 py-2 text-xs">
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Applicant:</span>
                  <span className="font-semibold text-slate-900">
                    {selectedRequest.firstName} {selectedRequest.lastName} ({selectedRequest.employeeNo || selectedRequest.employeeId})
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Department:</span>
                  <span className="font-medium text-slate-800">{selectedRequest.departmentName || 'N/A'}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Leave Type:</span>
                  <span className="font-semibold text-slate-900">{selectedRequest.leaveType}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Period & Duration:</span>
                  <span className="font-semibold text-slate-900 text-right">
                    {formatLeavePeriod(selectedRequest.startDate, selectedRequest.endDate)} ({selectedRequest.daysCount} working {Number(selectedRequest.daysCount) === 1 ? 'day' : 'days'})
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Compensation:</span>
                  <span className={`font-semibold ${selectedRequest.isPaid ? 'text-emerald-600' : 'text-slate-600'}`}>
                    {selectedRequest.isPaid ? 'With Pay (100%)' : 'Without Pay'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Status:</span>
                  <span>{renderStatusBadge(selectedRequest.status)}</span>
                </div>
              </div>

              <div>
                <span className="font-semibold text-slate-700 block mb-1">Reason:</span>
                <p className="bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800 italic">
                  "{selectedRequest.reason}"
                </p>
              </div>

              {selectedRequest.attachmentUrl && (
                <div>
                  <span className="font-semibold text-slate-700 block mb-1">Supporting Document:</span>
                  <a
                    href={selectedRequest.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-blue-600 hover:underline bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 font-medium"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>View Attached Document</span>
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </div>
              )}

              {/* Audit history */}
              <div className="border-t border-slate-200 pt-2.5 space-y-1 text-[11px] text-slate-500">
                <div>Filed on: {selectedRequest.createdAt}</div>
                {selectedRequest.approvedBy && (
                  <div className="text-emerald-700 font-medium">
                    Approved by: {selectedRequest.reviewedBy || selectedRequest.approvedBy} at {selectedRequest.approvedAt}
                  </div>
                )}
                {selectedRequest.rejectedBy && (
                  <div className="text-rose-700 font-medium">
                    Rejected by: {selectedRequest.reviewedBy || selectedRequest.rejectedBy} at {selectedRequest.rejectedAt}
                    <div className="text-xs text-rose-800 mt-0.5 font-normal">
                      Reason: {selectedRequest.rejectionReason}
                    </div>
                  </div>
                )}
                {selectedRequest.cancelledBy && (
                  <div className="text-slate-600 font-medium">
                    Cancelled at: {selectedRequest.cancelledAt}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDetailModalOpen(false)}
              className="h-8 text-xs"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* MODAL 4: LEAVE TYPE CREATION / EDITING (ADMIN)           */}
      {/* ======================================================== */}
      <Dialog open={isTypeModalOpen} onOpenChange={setIsTypeModalOpen}>
        <DialogContent className="sm:max-w-md w-full">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              {typeFormData.id ? 'Edit Leave Type' : 'Create Leave Type'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Configure annual day allotments, pay terms, and attachment rules.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveLeaveType} className="space-y-3 py-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Name *</label>
                <Input
                  value={typeFormData.name}
                  onChange={(e) => setTypeFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Vacation Leave"
                  className="h-8 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Code *</label>
                <Input
                  value={typeFormData.code}
                  onChange={(e) => setTypeFormData(prev => ({ ...prev, code: e.target.value }))}
                  placeholder="e.g. VL"
                  className="h-8 text-xs uppercase"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Description</label>
              <textarea
                value={typeFormData.description}
                onChange={(e) => setTypeFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Description or guidelines..."
                rows={2}
                className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Days Allowed / Year *</label>
                <Input
                  type="number"
                  step="0.5"
                  value={typeFormData.daysAllowed}
                  onChange={(e) => setTypeFormData(prev => ({ ...prev, daysAllowed: Number(e.target.value) }))}
                  className="h-8 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Applicable Gender</label>
                <select
                  value={typeFormData.applicableGender}
                  onChange={(e) => setTypeFormData(prev => ({ ...prev, applicableGender: e.target.value }))}
                  className="w-full h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded"
                >
                  <option value="ALL">All Employees</option>
                  <option value="FEMALE">Female Only</option>
                  <option value="MALE">Male Only</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={typeFormData.isPaid}
                  onChange={(e) => setTypeFormData(prev => ({ ...prev, isPaid: e.target.checked }))}
                  className="rounded text-blue-600"
                />
                <span className="text-slate-700 font-medium">Leave with Pay (100%)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={typeFormData.requiresAttachment}
                  onChange={(e) => setTypeFormData(prev => ({ ...prev, requiresAttachment: e.target.checked }))}
                  className="rounded text-blue-600"
                />
                <span className="text-slate-700 font-medium">Attachment Mandatory</span>
              </label>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTypeModalOpen(false)}
                size="sm"
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={actionLoading}
                size="sm"
                className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium"
              >
                {actionLoading ? 'Saving...' : 'Save Leave Type'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* MODAL 5: ADJUST BALANCE DIALOG (ADMIN)                   */}
      {/* ======================================================== */}
      <Dialog open={isBalanceModalOpen} onOpenChange={setIsBalanceModalOpen}>
        <DialogContent className="sm:max-w-md w-full">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Adjust Employee Leave Balance
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {selectedBalance?.firstName} {selectedBalance?.lastName} • {selectedBalance?.leaveTypeName} ({selectedBalance?.year})
            </DialogDescription>
          </DialogHeader>

          {selectedBalance && (
            <div className="space-y-3 py-2 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Allocated Days</label>
                <Input
                  type="number"
                  step="0.5"
                  value={selectedBalance.allocatedDays}
                  onChange={(e) => setSelectedBalance({ ...selectedBalance, allocatedDays: Number(e.target.value) })}
                  className="h-8 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Used Days</label>
                <Input
                  type="number"
                  step="0.5"
                  value={selectedBalance.usedDays}
                  onChange={(e) => setSelectedBalance({ ...selectedBalance, usedDays: Number(e.target.value) })}
                  className="h-8 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pending Days</label>
                <Input
                  type="number"
                  step="0.5"
                  value={selectedBalance.pendingDays}
                  onChange={(e) => setSelectedBalance({ ...selectedBalance, pendingDays: Number(e.target.value) })}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsBalanceModalOpen(false)}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                if (!selectedBalance) return;
                try {
                  setActionLoading(true);
                  await api.leaves.updateBalance(selectedBalance.id, selectedBalance);
                  toast.success("Leave balance updated successfully");
                  setIsBalanceModalOpen(false);
                  fetchData();
                } catch (err: any) {
                  toast.error(err.message || "Failed to update balance");
                } finally {
                  setActionLoading(false);
                }
              }}
              disabled={actionLoading}
              className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              {actionLoading ? 'Saving...' : 'Update Balance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
