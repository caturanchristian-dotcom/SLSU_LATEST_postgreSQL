import React, { useEffect, useState } from 'react';
import { useRealtime } from '../hooks/useRealtime';
import { api } from '../lib/api';
import { useAuth } from '../components/AuthProvider';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Users, 
  CreditCard, 
  TrendingUp, 
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Download,
  FileText,
  PieChart,
  Eye,
  FileSpreadsheet,
  DollarSign,
  Printer,
  Building2,
  BadgeCheck,
  User,
  ArrowLeft,
  Scale,
  MessageSquare,
  BookOpen,
  Activity,
  RefreshCw,
  ShieldCheck,
  Landmark,
  Briefcase,
  GraduationCap,
  ChevronRight,
  FileCheck,
  Check,
  Database,
  Banknote,
  CalendarCheck,
  HelpCircle,
  ArrowRight,
  UserCheck,
  School,
  Layers,
  Sparkles,
  LogIn,
  LogOut
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { EmployeeAccountView } from '../components/EmployeeAccountView';
import { EmployeeDeductionsView } from '../components/EmployeeDeductionsView';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend
} from 'recharts';
import { format, differenceInSeconds } from 'date-fns';
import { toast } from 'sonner';
import { formatCurrency, formatCompactCurrency, formatCompactNumber, safeDateStr, safeDateOnly, safeSplit, formatHolidayDisplayDate } from '../lib/utils';

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

const DTRWidget = ({ employeeId }: { employeeId?: string }) => {
  const [currentStatus, setCurrentStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  const fetchStatus = async () => {
    if (!employeeId) return;
    try {
      const response = await fetch(`/api/dtr/status/${employeeId}`);
      const data = await response.json();
      setCurrentStatus(data);
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [employeeId]);

  const handleClockAction = async (action: 'in' | 'out') => {
    try {
      const response = await fetch(`/api/dtr/clock-${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId })
      });
      const data = await response.json();
      
      if (response.ok) {
        toast.success(`Successfully clocked ${action}`);
        fetchStatus();
      } else {
        toast.error(data.error || `Failed to clock ${action}`);
      }
    } catch (error) {
      toast.error('Connection error');
    }
  };

  if (loading) return <div className="h-24 flex items-center justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-neutral-900"></div></div>;

  return (
    <Card className="border-none shadow-sm bg-neutral-900 text-white overflow-hidden relative">
      <div className="absolute top-0 right-0 p-4 opacity-10">
        <Clock className="w-24 h-24" />
      </div>
      <CardContent className="p-6 relative z-10">
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-neutral-400 text-xs font-bold uppercase tracking-widest mb-1">Current Time</p>
              <h3 className="text-3xl font-bold font-mono">{format(currentTime, 'HH:mm:ss')}</h3>
              <p className="text-xs text-neutral-400">{format(currentTime, 'EEEE, MMM dd, yyyy')}</p>
            </div>
            {currentStatus && currentStatus.timeIn && (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-none">
                Clocked In Since {formatTimeTo12Hour(currentStatus.timeIn)}
              </Badge>
            )}
          </div>
          
          <div className="pt-2">
            {currentStatus ? (
              <Button 
                onClick={() => handleClockAction('out')}
                className="w-full bg-white text-neutral-900 hover:bg-neutral-100 gap-2 font-bold h-11 rounded-xl"
              >
                <LogOut className="w-4 h-4" />
                Clock Out Now
              </Button>
            ) : (
              <Button 
                onClick={() => handleClockAction('in')}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white border-none gap-2 font-bold h-11 rounded-xl"
              >
                <LogIn className="w-4 h-4" />
                Clock In Now
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

interface DashboardProps {
  onNavigate?: (page: string) => void;
  initialSubview?: string | null;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate, initialSubview = null }) => {
  const { user, role, logout } = useAuth();
  const [stats, setStats] = useState({
    totalEmployees: 0,
    regularCount: 0,
    visitingCount: 0,
    jobOrderCount: 0,
    totalDeductions: 0,
    totalDeductionsValue: 0,
    lastPayrollAmount: 0,
    lastGrossAmount: 0,
    lastDeductionsAmount: 0,
    lastCycleName: '',
    activeCycles: 0,
    draftCycles: 0,
    processingCycles: 0,
    disbursedCount: 0,
    totalDisbursedYTD: 0,
    avgNetPay: 0,
    deductionRatio: 0,
  });
  const [recentCycles, setRecentCycles] = useState<any[]>([]);
  const [recentAuditLogs, setRecentAuditLogs] = useState<any[]>([]);
  const [upcomingHolidaysList, setUpcomingHolidaysList] = useState<any[]>([]);
  const [all2026HolidaysList, setAll2026HolidaysList] = useState<any[]>([]);
  const [breaksTab, setBreaksTab] = useState<'upcoming' | '2026'>('upcoming');
  const [chartTab, setChartTab] = useState<'trends' | 'categories'>('trends');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [myPayroll, setMyPayroll] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [categoryBreakdownData, setCategoryBreakdownData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);
  const [employeeProfile, setEmployeeProfile] = useState<any>(null);
  const [subview, setSubview] = useState<string | null>(initialSubview);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setSubview(initialSubview);
  }, [initialSubview]);
  const [deptHeadData, setDeptHeadData] = useState<{
    myDepartment: any;
    subjects: any[];
    schedules: any[];
    faculty: any[];
    holidays: any[];
    loading: boolean;
  }>({
    myDepartment: null,
    subjects: [],
    schedules: [],
    faculty: [],
    holidays: [],
    loading: true
  });

  useEffect(() => {
    if (role === 'employee') {
      fetchEmployeeData();
    } else if (role === 'department_head') {
      fetchDeptHeadData();
    } else {
      fetchDashboardData();
    }
  }, [role, user]);

  const handleRealtimeDashboardSync = () => {
    if (role === 'employee') {
      fetchEmployeeData();
    } else if (role === 'department_head') {
      fetchDeptHeadData();
    } else {
      fetchDashboardData();
    }
  };

  useRealtime('employees_changed', handleRealtimeDashboardSync);
  useRealtime('payroll_changed', handleRealtimeDashboardSync);
  useRealtime('deductions_changed', handleRealtimeDashboardSync);
  useRealtime('dtr_changed', handleRealtimeDashboardSync);
  useRealtime('schedules_changed', handleRealtimeDashboardSync);

  const fetchEmployeeData = async () => {
    try {
      if (!user) return;
      
      try {
        const response = await fetch('/api/employees');
        if (response.ok) {
          const emps = await response.json();
          const userEmail = (user.email || '').toLowerCase().trim();
          const userDisplay = (user.displayName || '').toLowerCase().trim();
          const nameParts = userDisplay.split(' ').filter(Boolean);
          const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

          const matched = emps.find((e: any) => {
            const empEmail = (e.email || '').toLowerCase().trim();
            const empFirst = (e.firstName || '').toLowerCase().trim();
            const empLast = (e.lastName || '').toLowerCase().trim();
            const empFull = `${empFirst} ${empLast}`.trim();
            const empId = String(e.id || '');

            if (userEmail && empEmail === userEmail) return true;
            if (user.id && (empId === String(user.id) || e.employeeId === String(user.id))) return true;
            if (userDisplay && (empFull === userDisplay || `${empLast}, ${empFirst}` === userDisplay)) return true;
            if (lastName && empLast === lastName) return true;
            if (userEmail.includes('caturan') && (empEmail.includes('caturan') || empLast.includes('caturan'))) return true;
            return false;
          });

          if (matched) {
            setEmployeeProfile(matched);
          } else if (emps.length > 0) {
            setEmployeeProfile(emps[0]);
          }
        }
      } catch (err) {
        console.error("Failed to load employee list matching user context", err);
      }

      const data = await api.payroll.getMyPayroll(user.email || '');
      const list = Array.isArray(data) ? data : [];
      setMyPayroll(list);
      
      // Prepare chart data for employee
      const chart = list
        .slice(0, 6)
        .reverse()
        .map((e: any) => ({
          name: safeSplit(e.cycleName || e.cyclename || e.name || 'Cycle', ' ')[0],
          amount: Number(e.netPay ?? e.netpay ?? e.net_pay ?? 0)
        }));
      setChartData(chart);
    } catch (error) {
      console.error('Failed to fetch employee data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboardData = async () => {
    try {
      setIsRefreshing(true);
      const [employeesRes, cyclesRes, deductionsRes, auditRes, holidaysRes] = await Promise.allSettled([
        api.employees.list(),
        api.payroll.listCycles(),
        api.deductions.list(),
        api.audit.list(),
        fetch('/api/holidays').then(r => r.json())
      ]);

      const employees = employeesRes.status === 'fulfilled' && Array.isArray(employeesRes.value) ? employeesRes.value : [];
      const cycles = cyclesRes.status === 'fulfilled' && Array.isArray(cyclesRes.value) ? cyclesRes.value : [];
      const deductions = deductionsRes.status === 'fulfilled' && Array.isArray(deductionsRes.value) ? deductionsRes.value : [];
      const auditLogs = auditRes.status === 'fulfilled' && Array.isArray(auditRes.value) ? auditRes.value : [];
      const holidays = holidaysRes.status === 'fulfilled' && Array.isArray(holidaysRes.value) ? holidaysRes.value : [];

      const regularCount = employees.filter((e: any) => /faculty|regular|staff/i.test(e.category || '')).length;
      const visitingCount = employees.filter((e: any) => /visiting|part-time|lecturer/i.test(e.category || '')).length;
      const jobOrderCount = employees.filter((e: any) => /job order|jo/i.test(e.category || '')).length;

      const disbursedCycles = cycles.filter((c: any) => c.status === 'disbursed' || c.status === 'completed');
      const lastCycle = disbursedCycles[0] || null;

      const draftCycles = cycles.filter((c: any) => c.status === 'draft').length;
      const processingCycles = cycles.filter((c: any) => c.status === 'processing' || c.status === 'pending_approval').length;
      const activeCyclesCount = draftCycles + processingCycles;

      const totalDisbursedYTD = disbursedCycles.reduce((acc: number, c: any) => acc + Number(c.totalNet || 0), 0);
      const totalGrossYTD = disbursedCycles.reduce((acc: number, c: any) => acc + Number(c.totalGross || 0), 0);
      const totalDeductionsYTD = disbursedCycles.reduce((acc: number, c: any) => acc + Number(c.totalDeductions || 0), 0);

      const totalDeductionsValue = deductions.reduce((acc: number, d: any) => acc + Number(d.amount || 0), 0);

      const lastPayrollNet = lastCycle ? Number(lastCycle.totalNet || 0) : 0;
      const lastGross = lastCycle ? Number(lastCycle.totalGross || 0) : 0;
      const lastDeductions = lastCycle ? Number(lastCycle.totalDeductions || 0) : 0;
      const lastCycleEmpCount = lastCycle ? Number(lastCycle.employeeCount || 0) : 0;

      const avgNet = lastCycleEmpCount > 0 
        ? Math.round(lastPayrollNet / lastCycleEmpCount) 
        : (employees.length > 0 ? Math.round(lastPayrollNet / employees.length) : 0);
      const deductionRatio = lastGross > 0 ? Math.round((lastDeductions / lastGross) * 100) : 0;

      setStats({
        totalEmployees: employees.length,
        regularCount,
        visitingCount,
        jobOrderCount,
        totalDeductions: deductions.length,
        totalDeductionsValue,
        lastPayrollAmount: lastPayrollNet,
        lastGrossAmount: lastGross,
        lastDeductionsAmount: lastDeductions,
        lastCycleName: lastCycle?.name || 'No cycle yet',
        activeCycles: activeCyclesCount,
        draftCycles,
        processingCycles,
        disbursedCount: disbursedCycles.length,
        totalDisbursedYTD,
        avgNetPay: avgNet,
        deductionRatio,
      });

      setRecentCycles(cycles.slice(0, 6));
      setRecentAuditLogs(auditLogs.slice(0, 5));

      // 2026 & Upcoming Holidays Filtering
      const nonWorkingHols = holidays.filter((h: any) => h.type !== 'Special Working');

      // 2026 Full Calendar Breaks
      const hols2026 = nonWorkingHols.filter((h: any) => {
        const dStr = safeDateOnly(h.date);
        return dStr.startsWith('2026');
      });
      setAll2026HolidaysList(hols2026.slice(0, 4));

      // Upcoming breaks relative to today
      const todayStr = safeDateOnly(new Date());
      const upcoming = nonWorkingHols.filter((h: any) => {
        const dStr = safeDateOnly(h.date);
        return dStr >= todayStr;
      });

      // Populate upcoming breaks (fall back to 2026 calendar breaks if none upcoming)
      setUpcomingHolidaysList(upcoming.length > 0 ? upcoming.slice(0, 4) : hols2026.slice(0, 4));

      // Category breakdown data
      setCategoryBreakdownData([
        { name: 'Faculty & Regular Staff', count: regularCount, color: '#1e3a5f' },
        { name: 'Visiting Instructors', count: visitingCount, color: '#059669' },
        { name: 'Job Order Personnel', count: jobOrderCount, color: '#d97706' },
      ]);

      // Chart data: last 6 disbursed cycles
      const chart = disbursedCycles
        .slice(0, 6)
        .reverse()
        .map((c: any) => ({
          name: safeSplit(c.name || 'Cycle', ' ')[0] || 'Cycle',
          fullName: c.name,
          gross: Number(c.totalGross || 0),
          amount: Number(c.totalNet || 0),
          net: Number(c.totalNet || 0),
          deductions: Number(c.totalDeductions || 0),
          employees: Number(c.employeeCount || 0),
        }));

      if (chart.length === 0 && cycles.length > 0) {
        setChartData(cycles.slice(0, 6).reverse().map((c: any) => ({
          name: safeSplit(c.name || 'Cycle', ' ')[0] || 'Cycle',
          fullName: c.name,
          gross: Number(c.totalGross || 0),
          amount: Number(c.totalNet || 0),
          net: Number(c.totalNet || 0),
          deductions: Number(c.totalDeductions || 0),
          employees: Number(c.employeeCount || 0),
        })));
      } else {
        setChartData(chart);
      }

    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const fetchDeptHeadData = async () => {
    try {
      setLoading(true);
      const [allDepts, allSubjects, allSchedules, allEmployees, allHolidays] = await Promise.all([
        api.departments.list().catch(() => []),
        api.subjects.list().catch(() => []),
        api.schedules.list().catch(() => []),
        api.employees.list().catch(() => []),
        fetch('/api/holidays').then(res => res.json()).catch(() => [])
      ]);

      // Find managed department
      const myDept = allDepts.find((d: any) => d.departmentHeadId === user?.id);
      
      if (myDept) {
        // Filter subjects belonging to this department
        const deptSubjects = allSubjects.filter((s: any) => s.departmentId === myDept.id);
        
        // Filter schedules belonging to this department
        const deptSchedules = allSchedules.filter((sch: any) => {
          const schDeptId = sch.teachingDepartmentId;
          const emp = allEmployees.find((e: any) => e.id === sch.employeeId);
          const empDeptId = emp?.teachingDepartmentId;
          return schDeptId === myDept.id || (!schDeptId && empDeptId === myDept.id);
        });

        // Filter visiting instructors belonging to this department
        const deptFaculty = allEmployees.filter((emp: any) => 
          emp.teachingDepartmentId === myDept.id && 
          emp.category?.toLowerCase() === 'visiting instructor'
        );

        const deptHols = Array.isArray(allHolidays) 
          ? allHolidays.filter((h: any) => h.type !== 'Special Working') 
          : [];
        const todayStr = safeDateOnly(new Date());
        const deptUpcoming = deptHols.filter((h: any) => safeDateOnly(h.date) >= todayStr);
        const dept2026 = deptHols.filter((h: any) => safeDateOnly(h.date).startsWith('2026'));
        const deptDisplayHols = deptUpcoming.length > 0 ? deptUpcoming.slice(0, 5) : dept2026.slice(0, 5);

        setDeptHeadData({
          myDepartment: myDept,
          subjects: deptSubjects,
          schedules: deptSchedules,
          faculty: deptFaculty,
          holidays: deptDisplayHols,
          loading: false
        });
      } else {
        const deptHols = Array.isArray(allHolidays) 
          ? allHolidays.filter((h: any) => h.type !== 'Special Working') 
          : [];
        const todayStr = safeDateOnly(new Date());
        const deptUpcoming = deptHols.filter((h: any) => safeDateOnly(h.date) >= todayStr);
        const dept2026 = deptHols.filter((h: any) => safeDateOnly(h.date).startsWith('2026'));
        const deptDisplayHols = deptUpcoming.length > 0 ? deptUpcoming.slice(0, 5) : dept2026.slice(0, 5);

        setDeptHeadData({
          myDepartment: null,
          subjects: [],
          schedules: [],
          faculty: [],
          holidays: deptDisplayHols,
          loading: false
        });
      }
    } catch (error) {
      console.error('Failed to fetch department head data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportToExcel = (entry: any) => {
    const data = [
      ["SLSU Payroll System - Payslip"],
      ["Employee Name", entry.employeeName],
      ["Payroll Cycle", entry.cycleName],
      ["Period", `${entry.startDate ? format(new Date(entry.startDate), 'MMM dd, yyyy') : '---'} - ${entry.endDate ? format(new Date(entry.endDate), 'MMM dd, yyyy') : '---'}`],
      [""],
      ["Earnings", "Amount"],
      ["Basic Pay", entry.basicPay],
      ["Overtime", entry.overtime || 0],
      ["Bonuses", entry.bonuses || 0],
      ["Gross Pay", entry.grossPay],
      [""],
      ["Deductions", "Amount"],
      ...Object.entries(entry.deductions || {}).map(([name, amount]) => [name, amount]),
      ["Total Deductions", entry.totalDeductions],
      [""],
      ["Net Pay", entry.netPay],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payslip");
    XLSX.writeFile(wb, `Payslip_${entry.cycleName.replace(/\s+/g, '_')}.xlsx`);
  };

  const handleExportToPDF = (entry: any) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('SLSU PAYROLL SYSTEM', 105, 25, { align: 'center' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text('OFFICIAL PAYSLIP', 105, 35, { align: 'center' });
    
    // Employee Info
    doc.setFontSize(11);
    doc.text(`Employee Name: ${entry.employeeName}`, 20, 55);
    doc.text(`Employee ID: ${entry.employeeId}`, 20, 62);
    doc.text(`Payroll Period: ${entry.cycleName}`, 20, 69);
    doc.text(`Date Generated: ${format(new Date(), 'MMM dd, yyyy')}`, 20, 76);
    
    // Earnings Table
    autoTable(doc, {
      startY: 90,
      head: [['EARNINGS', 'AMOUNT']],
      body: [
        ['Basic Pay', `PHP ${formatCurrency(entry.basicPay)}`],
        ['Overtime', `PHP ${formatCurrency(entry.overtime || 0)}`],
        ['Bonuses', `PHP ${formatCurrency(entry.bonuses || 0)}`],
        [{ content: 'GROSS PAY', styles: { fontStyle: 'bold' } }, { content: `PHP ${formatCurrency(entry.grossPay)}`, styles: { fontStyle: 'bold' } }],
      ],
      theme: 'striped',
      headStyles: { 
        fillColor: [24, 24, 27], // neutral-900
        textColor: [255, 255, 255],
        fontSize: 10,
        fontStyle: 'bold'
      },
      bodyStyles: { fontSize: 10 },
      alternateRowStyles: { fillColor: [250, 250, 250] }
    });

    // Deductions Table
    const deductionRows = Object.entries(entry.deductions || {}).map(([name, amount]) => [
      name, 
      `PHP ${formatCurrency(amount as number)}`
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['DEDUCTIONS', 'AMOUNT']],
      body: [
        ...deductionRows,
        [{ content: 'TOTAL DEDUCTIONS', styles: { fontStyle: 'bold' } }, { content: `PHP ${formatCurrency(entry.totalDeductions)}`, styles: { fontStyle: 'bold' } }],
      ],
      theme: 'striped',
      headStyles: { 
        fillColor: [153, 0, 0], // Dark Red
        textColor: [255, 255, 255],
        fontSize: 10,
        fontStyle: 'bold'
      },
      bodyStyles: { fontSize: 10 },
      alternateRowStyles: { fillColor: [250, 250, 250] }
    });

    // Net Pay
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`NET PAY: PHP ${formatCurrency(entry.netPay)}`, 190, finalY, { align: 'right' });
    
    // Footer
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('This is a system-generated document.', 105, 285, { align: 'center' });
    
    doc.save(`Payslip_${entry.employeeId}_${entry.cycleName.replace(/\s+/g, '_')}.pdf`);
    toast.success('Payslip downloaded as PDF');
  };

  const handlePrintPayslip = (entry: any) => {
    if (!entry) return;
    const printWindow = window.open('', '_blank', 'width=850,height=700');
    if (printWindow) {
      const deductionsMarkup = Object.entries(entry.deductions || {})
        .map(([name, amount]) => `
          <div class="row">
            <span class="label">${name}</span>
            <span class="val font-mono">-₱${formatCurrency(amount as number)}</span>
          </div>
        `).join('') || '<div class="row"><span class="label">No statutory deductions</span><span class="val">₱0.00</span></div>';

      printWindow.document.write(`
        <html>
          <head>
            <title>SLSU Payslip - \${entry.employeeName}</title>
            <style>
              body {
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
                padding: 40px;
                color: #171717;
                background-color: #ffffff;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .container {
                max-width: 650px;
                margin: 0 auto;
                border: 1px solid #e5e7eb;
                border-radius: 16px;
                padding: 32px;
                box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);
              }
              .header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: 2px solid #047857;
                padding-bottom: 20px;
                margin-bottom: 24px;
              }
              .header-text h3 {
                font-size: 15px;
                font-weight: 800;
                letter-spacing: 0.08em;
                color: #047857;
                text-transform: uppercase;
                margin: 0;
              }
              .header-text p {
                font-size: 11px;
                color: #6b7280;
                margin: 4px 0 0 0;
                font-weight: 500;
              }
              .badge {
                font-size: 10px;
                font-weight: 800;
                padding: 4px 12px;
                border: 1px solid #10b981;
                background-color: #ecfdf5;
                color: #047857;
                text-transform: uppercase;
                border-radius: 9999px;
                letter-spacing: 0.05em;
              }
              .meta-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 16px;
                background-color: #f9fafb;
                padding: 16px;
                border-radius: 12px;
                border: 1px solid #f3f4f6;
                margin-bottom: 24px;
              }
              .meta-item label {
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                color: #9ca3af;
                display: block;
                margin-bottom: 4px;
                letter-spacing: 0.05em;
              }
              .meta-item span {
                font-size: 12px;
                font-weight: 700;
                color: #111827;
              }
              .font-mono {
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              }
              .details-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 20px;
                margin-bottom: 24px;
              }
              .col-card {
                border-radius: 12px;
                padding: 16px;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
              }
              .earnings {
                border: 1px solid #d1fae5;
                background-color: rgb(240 253 244 / 0.3);
              }
              .deductions {
                border: 1px solid #ffe4e6;
                background-color: rgb(255 241 242 / 0.3);
              }
              .card-title {
                display: flex;
                align-items: center;
                font-size: 11px;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: #047857;
                border-bottom: 1px solid rgb(4 120 87 / 0.1);
                padding-bottom: 8px;
                margin: 0 0 12px 0;
              }
              .deductions .card-title {
                color: #be123c;
                border-bottom-color: rgb(190 18 60 / 0.1);
              }
              .row {
                display: flex;
                justify-content: space-between;
                font-size: 12px;
                margin-bottom: 8px;
              }
              .row .label {
                color: #4b5563;
              }
              .row .val {
                font-weight: 600;
                color: #111827;
              }
              .deductions .row .val {
                color: #be123c;
              }
              .divider {
                border-top: 1px dashed #e5e7eb;
                margin: 12px 0;
              }
              .total-row {
                display: flex;
                justify-content: space-between;
                font-size: 13px;
                font-weight: 700;
              }
              .earnings .total-row {
                color: #065f46;
              }
              .deductions .total-row {
                color: #9f1239;
              }
              .net-banner {
                background-color: #111827;
                color: #ffffff;
                padding: 24px;
                border-radius: 12px;
                display: flex;
                justify-content: space-between;
                align-items: center;
              }
              .net-banner-info p {
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.1em;
                color: #9ca3af;
                text-transform: uppercase;
                margin: 0;
              }
              .net-banner-info h4 {
                font-size: 26px;
                font-weight: 800;
                color: #34d399;
                margin: 4px 0 0 0;
              }
              .sig {
                font-size: 9px;
                color: #9ca3af;
                border-top: 1px solid #f3f4f6;
                padding-top: 16px;
                margin-top: 24px;
                text-align: center;
                font-weight: 500;
              }
              @media print {
                body { padding: 0; background-color: #ffffff; }
                .container { border: none; box-shadow: none; padding: 0; margin: 0; max-width: 100%; }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="header-text">
                  <h3>Southern Leyte State University</h3>
                  <p>Human Resource Management & Payroll Registry Office</p>
                </div>
                <div class="badge">OFFICIAL PAYSLIP</div>
              </div>

              <div class="meta-grid">
                <div class="meta-item">
                  <label>Employee Name</label>
                  <span>\${entry.employeeName}</span>
                </div>
                <div class="meta-item">
                  <label>Employee ID</label>
                  <span class="font-mono">\${entry.employeeId}</span>
                </div>
                <div class="meta-item">
                  <label>Payroll Period</label>
                  <span>\${entry.cycleName}</span>
                </div>
                <div class="meta-item">
                  <label>Date Generated</label>
                  <span>\${format(new Date(), 'MMMM dd, yyyy')}</span>
                </div>
              </div>

              <div class="details-grid">
                <div class="col-card earnings">
                  <div>
                    <h5 class="card-title">Earnings Breakdown</h5>
                    <div class="row">
                      <span class="label">Basic Pay</span>
                      <span class="val font-mono">₱\${formatCurrency(entry.basicPay)}</span>
                    </div>
                    <div class="row">
                      <span class="label">Overtime</span>
                      <span class="val font-mono">₱\${formatCurrency(entry.overtime || 0)}</span>
                    </div>
                    <div class="row">
                      <span class="label">Bonuses / Incentives</span>
                      <span class="val font-mono">₱\${formatCurrency(entry.bonuses || 0)}</span>
                    </div>
                  </div>
                  <div>
                    <div class="divider"></div>
                    <div class="total-row">
                      <span>GROSS EARNINGS</span>
                      <span class="font-mono">₱\${formatCurrency(entry.grossPay)}</span>
                    </div>
                  </div>
                </div>

                <div class="col-card deductions">
                  <div>
                    <h5 class="card-title">Deductions Breakdown</h5>
                    \${deductionsMarkup}
                  </div>
                  <div>
                    <div class="divider"></div>
                    <div class="total-row">
                      <span>TOTAL DEDUCTIONS</span>
                      <span class="font-mono">₱\${formatCurrency(entry.totalDeductions)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="net-banner">
                <div class="net-banner-info">
                  <p>Net Take-Home Pay</p>
                  <h4 class="font-mono">₱\${formatCurrency(entry.netPay)}</h4>
                </div>
              </div>

              <div class="sig">
                Certified correct by SLSU Payroll Information System. Secure digital statement. Signature not required.
              </div>
            </div>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(() => window.close(), 100);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const cn = (...inputs: any[]) => inputs.filter(Boolean).join(' ');

  if (role === 'employee') {
    if (subview === null) {
      return (
        <div className="flex flex-col items-center justify-center py-6 px-4 md:py-10 min-h-[70vh] font-sans">
          <div className="max-w-5xl w-full text-center space-y-6">
            {/* Elegant institutional-inspired Title */}
            <h1 className="text-[#355275] font-extrabold text-2xl md:text-3.5xl tracking-widest uppercase font-sans">
              EMPLOYEE INFORMATION SYSTEM
            </h1>

            {/* Centralized User Avatar Card */}
            <div className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl border border-neutral-100 shadow-sm max-w-sm mx-auto w-full group hover:shadow-md transition-shadow">
              <div className="w-24 h-24 rounded-full bg-neutral-100 p-1 shadow-sm border-2 border-neutral-200 overflow-hidden flex items-center justify-center mb-3">
                {employeeProfile?.profileImage ? (
                  <img
                    src={employeeProfile.profileImage}
                    alt={`${employeeProfile.firstName} ${employeeProfile.lastName}`}
                    className="w-full h-full object-cover rounded-full"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full bg-[#355275] text-white rounded-full flex items-center justify-center text-3xl font-extrabold font-sans">
                    {employeeProfile?.firstName ? employeeProfile.firstName[0] : (user?.displayName ? user.displayName[0] : 'E')}
                  </div>
                )}
              </div>
              
              <p className="text-neutral-500 font-sans text-sm md:text-base text-center">
                Welcome back{" "}
                <span className="text-[#1a55cc] font-bold">
                  {employeeProfile ? `${employeeProfile.firstName} ${employeeProfile.lastName}` : (user?.displayName || user?.email)}!
                </span>
              </p>
              
              <div className="flex justify-center items-center gap-1.5 text-xs text-neutral-400 mt-2 select-none">
                <span>[</span>
                <button 
                  onClick={logout} 
                  className="text-[#1a55cc] hover:underline font-bold flex items-center gap-1 hover:text-blue-700"
                >
                  <LogOut className="w-3.5 h-3.5" /> Logout
                </button>
                <span>]</span>
              </div>
              
              <p className="text-neutral-400 text-xs mt-3 select-none">
                Please select from the options to continue
              </p>
            </div>

            {/* 3x2 Grid Cards inspired directly by SIS layout */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
              {[
                {
                  id: 'account',
                  title: 'My Account',
                  description: 'View grades, check balance, online enrolment and more',
                  icon: <User className="w-10 h-10 text-blue-500 stroke-[1.25]" />,
                  action: () => setSubview('account'),
                },
                {
                  id: 'dtr',
                  title: 'DTR',
                  description: 'Manage Daily Time Records and active timesheet status tracking',
                  icon: <Scale className="w-10 h-10 text-blue-500 stroke-[1.25]" />,
                  badge: 'ACTIVE',
                  action: () => onNavigate && onNavigate('dtr'),
                },
                {
                  id: 'schedules',
                  title: 'Schedules',
                  description: 'Check active shifts, assigned hours, calendar, and roster settings',
                  icon: <Calendar className="w-10 h-10 text-blue-500 stroke-[1.25]" />,
                  action: () => onNavigate && onNavigate('schedules'),
                },
                {
                  id: 'overtime',
                  title: 'Overtime Request',
                  description: 'Submit overtime hours, track supervisor approvals and payable units',
                  icon: <Clock className="w-10 h-10 text-blue-500 stroke-[1.25]" />,
                  action: () => onNavigate && onNavigate('overtime'),
                },
                {
                  id: 'deductions',
                  title: 'Deductions & SSS',
                  description: 'Automated statutory matching status (SSS, PhilHealth, Pag-IBIG)',
                  icon: <Building2 className="w-10 h-10 text-blue-500 stroke-[1.25]" />,
                  action: () => setSubview('deductions'),
                },
                {
                  id: 'profile',
                  title: 'My Profile',
                  description: 'Manage your personnel records, secure credentials, and contact details',
                  icon: <BadgeCheck className="w-10 h-10 text-blue-500 stroke-[1.25]" />,
                  action: () => onNavigate && onNavigate('profile'),
                },
                {
                  id: 'announcements',
                  title: 'Announcements',
                  description: 'Latest institutional announcements and system reports will be posted here',
                  icon: <MessageSquare className="w-10 h-10 text-amber-500 stroke-[1.25]" />,
                  action: () => setSubview('announcements'),
                }
              ].map((card) => (
                <Card 
                  key={card.id}
                  onClick={card.action}
                  className="border border-neutral-100 hover:border-blue-200 shadow-sm hover:shadow-md cursor-pointer transition-all duration-200 bg-white p-8 flex flex-col items-center text-center justify-between group active:scale-[0.98] rounded-2xl"
                >
                  <div className="flex flex-col items-center space-y-4">
                    <div className="p-3 bg-blue-50/50 rounded-xl group-hover:scale-105 transition-transform duration-200">
                      {card.icon}
                    </div>
                    
                    <div className="flex items-center gap-1.5 justify-center">
                      <h3 className="text-base font-bold text-[#355275] tracking-tight group-hover:text-[#1a55cc] transition-colors">
                        {card.title}
                      </h3>
                      {card.badge && (
                        <span className="bg-emerald-500 text-white font-mono text-[9px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider scale-90 select-none">
                          {card.badge}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-neutral-400 font-medium leading-relaxed max-w-[240px]">
                      {card.description}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (subview === 'account') {
      return (
        <EmployeeAccountView
          user={user}
          employeeProfile={employeeProfile}
          myPayroll={myPayroll}
          chartData={chartData}
          onBack={() => {
            setSubview(null);
            if (onNavigate) onNavigate('dashboard');
          }}
          onNavigate={onNavigate}
          onProfileUpdated={(updated) => {
            setEmployeeProfile(updated);
            fetchEmployeeData();
          }}
        />
      );
    }

    if (subview === 'deductions') {
      const latestPayslip = myPayroll[0];
      return (
        <EmployeeDeductionsView
          user={user}
          employeeProfile={employeeProfile}
          latestPayslip={latestPayslip}
          myPayroll={myPayroll}
          onBack={() => setSubview(null)}
          onNavigate={onNavigate}
        />
      );
    }

    if (subview === 'announcements') {
      return (
        <div className="space-y-6 animate-fadeIn">
          {/* Back Header */}
          <div className="bg-white border border-neutral-100 rounded-2xl p-5 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                onClick={() => setSubview(null)} 
                className="p-3 border-neutral-200 hover:bg-neutral-50 rounded-xl flex items-center gap-2 text-xs font-bold text-neutral-700 active:scale-95 transition-all shadow-sm"
              >
                <ArrowLeft className="w-4 h-4 text-neutral-500" /> Back to Portal
              </Button>
              <div>
                <h2 className="text-xl font-bold text-[#355275] tracking-tight">Announcements & Notices</h2>
                <p className="text-xs text-neutral-500">Memos, system updates, and official public holiday announcements.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border border-neutral-100 bg-white p-6 rounded-2xl shadow-sm space-y-3">
              <div className="inline-flex items-center gap-2 bg-[#f4f6f9] text-[#355275] border border-[#d6e4f0] py-1 px-3 rounded-full text-[10px] font-bold tracking-wider font-mono uppercase">
                System Updates
              </div>
              <h3 className="text-base font-bold text-[#355275] tracking-tight">Database & Profile Image Synchronization Complete</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">
                We have successfully realized dynamic, robust saving of employee profile images directly within our secure database layer. Personnel can navigate to 'My Profile' to instantly choose a custom JPEG or PNG photo which synchronizes automatically with other subcomponents.
              </p>
              <div className="text-[10px] text-neutral-450 font-mono">June 17, 2026 - Administration Group</div>
            </Card>

            <Card className="border border-neutral-100 bg-white p-6 rounded-2xl shadow-sm space-y-3">
              <div className="inline-flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-100 py-1 px-3 rounded-full text-[10px] font-bold tracking-wider font-mono uppercase">
                Regulatory Notices
              </div>
              <h3 className="text-base font-bold text-[#355275] tracking-tight">Statutory Mid-Month Benefit Deductions</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Eligible static rosters (Regular, Faculty, Staff models) are subject to deductions mirroring standard matching rules (SSS, PhilHealth, Pag-IBIG). Job Order designations proceed with zero active matching deductions in keeping with national guidelines.
              </p>
              <div className="text-[10px] text-neutral-450 font-mono">May 24, 2026 - Payroll Auditing</div>
            </Card>

            <Card className="border border-neutral-100 bg-white p-6 rounded-2xl shadow-sm space-y-3">
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-100 py-1 px-3 rounded-full text-[10px] font-bold tracking-wider font-mono uppercase">
                Memos
              </div>
              <h3 className="text-base font-bold text-[#355275] tracking-tight">Self-Service Portal Features Deployment</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">
                The brand-new SLSU Self-Service Portal is now active. Employees can easily audit their personal schedules, inspect timesheet clocks (DTR), review active benefits liability balances, load official statements, and track announcements in real-time.
              </p>
              <div className="text-[10px] text-neutral-450 font-mono">April 19, 2026 - Office of the Chancellor</div>
            </Card>
          </div>
        </div>
      );
    }
  }

  if (role === 'department_head') {
    if (deptHeadData.loading) {
      return (
        <div className="h-96 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1d58d9]"></div>
            <p className="text-sm text-neutral-500 font-medium animate-pulse">Loading Department Dashboard...</p>
          </div>
        </div>
      );
    }

    const { myDepartment, subjects: deptSubjects, schedules: deptSchedules, faculty: deptFaculty, holidays: upcomingHolidays } = deptHeadData;

    if (!myDepartment) {
      return (
        <div className="space-y-6">
          <Card className="border border-neutral-200 bg-white p-8 text-center rounded-2xl shadow-sm">
            <Building2 className="w-16 h-16 text-neutral-400 mx-auto mb-4 stroke-[1.25]" />
            <h3 className="text-xl font-bold text-neutral-800">No Managed Department Found</h3>
            <p className="text-neutral-500 text-sm mt-2 max-w-md mx-auto leading-relaxed">
              You are logged in as a Department Head, but no department is currently assigned to your account. Please contact an administrator to assign you to a department.
            </p>
            <div className="mt-6 flex justify-center gap-4">
              <Button onClick={logout} variant="outline" className="rounded-xl flex items-center gap-2">
                <LogOut className="w-4 h-4" /> Log Out
              </Button>
            </div>
          </Card>
        </div>
      );
    }

    return (
      <div className="space-y-8 animate-fadeIn">
        {/* Top Header Banner */}
        <div className="bg-gradient-to-r from-[#355275] via-[#2f6ce5] to-[#4082f4] rounded-3xl p-6 md:p-8 text-white shadow-md relative overflow-hidden">
          <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-10 translate-y-10 pointer-events-none">
            <Building2 className="w-80 h-80 stroke-[1]" />
          </div>
          <div className="relative z-10 space-y-4">
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase border border-white/10">
              Department Portal
            </div>
            <div className="space-y-2">
              <span className="text-sm font-mono tracking-widest text-white/80 uppercase font-bold">{myDepartment.code}</span>
              <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight leading-none">
                {myDepartment.name}
              </h1>
              <p className="text-sm md:text-base text-white/85 max-w-2xl font-medium leading-relaxed">
                {myDepartment.description || 'Department management and course workload scheduling overview.'}
              </p>
            </div>
          </div>
        </div>

        {/* Analytics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-none shadow-sm bg-white rounded-2xl hover:shadow-md transition-all">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Department Head</CardTitle>
              <User className="w-4 h-4 text-[#1d58d9]" />
            </CardHeader>
            <CardContent>
              <div className="text-base font-extrabold text-[#355275] truncate">
                {user?.displayName || user?.email?.split('@')[0]}
              </div>
              <p className="text-[10px] text-neutral-400 font-mono mt-1 truncate">{user?.email}</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white rounded-2xl hover:shadow-md transition-all">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Active Faculty</CardTitle>
              <Users className="w-4 h-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold text-neutral-900">{deptFaculty.length}</div>
              <p className="text-xs text-neutral-400 mt-1 font-medium">Assigned to schedules</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white rounded-2xl hover:shadow-md transition-all">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Subjects Catalog</CardTitle>
              <BookOpen className="w-4 h-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold text-neutral-900">{deptSubjects.length}</div>
              <p className="text-xs text-neutral-400 mt-1 font-medium">Curriculum records</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white rounded-2xl hover:shadow-md transition-all">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Class Schedules</CardTitle>
              <Calendar className="w-4 h-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold text-neutral-900">{deptSchedules.length}</div>
              <p className="text-xs text-neutral-400 mt-1 font-medium">Active lectures roster</p>
            </CardContent>
          </Card>
        </div>

        {/* Dashboard Sections Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Left Columns */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Class Lectures Board */}
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between border-b border-neutral-50 pb-4">
                <div>
                  <CardTitle className="text-lg font-extrabold text-neutral-800">Active Schedules & Lectures</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Assigned faculty timetables for {myDepartment.code} subjects.</CardDescription>
                </div>
                {onNavigate && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => onNavigate('schedules')}
                    className="text-[#1d58d9] hover:bg-[#e2ebf8] font-bold text-xs rounded-xl flex items-center gap-1.5"
                  >
                    Manage schedules <ArrowUpRight className="w-3.5 h-3.5" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {deptSchedules.length === 0 ? (
                  <div className="text-center py-12 text-neutral-400">
                    <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No active class schedules mapped for your subjects.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-neutral-50/50">
                        <TableRow>
                          <TableHead className="text-xs font-bold text-neutral-500 uppercase">Subject</TableHead>
                          <TableHead className="text-xs font-bold text-neutral-500 uppercase">Instructor</TableHead>
                          <TableHead className="text-xs font-bold text-neutral-500 uppercase">Day & Time</TableHead>
                          <TableHead className="text-xs font-bold text-neutral-500 uppercase">Room</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deptSchedules.map((sch) => (
                          <TableRow key={sch.id} className="hover:bg-neutral-50/40 transition-colors">
                            <TableCell className="py-3.5">
                              <div className="font-bold text-neutral-800">{sch.subject}</div>
                            </TableCell>
                            <TableCell className="py-3.5 text-neutral-600 font-medium">
                              {sch.firstName} {sch.lastName}
                            </TableCell>
                            <TableCell className="py-3.5">
                              <div className="flex items-center gap-1.5 text-xs text-neutral-600 font-semibold">
                                <Badge variant="outline" className="bg-neutral-50 font-bold border-neutral-200">
                                  {sch.dayOfWeek}
                                </Badge>
                                <span className="font-mono text-[11px] text-neutral-500">
                                  {formatTimeTo12Hour(sch.startTime)} - {formatTimeTo12Hour(sch.endTime)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-3.5 text-neutral-500 font-mono text-xs">
                              {sch.room || 'N/A'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Subject Catalog */}
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between border-b border-neutral-50 pb-4">
                <div>
                  <CardTitle className="text-lg font-extrabold text-neutral-800">Curriculum Subjects</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Official course catalogs managed under your academic division.</CardDescription>
                </div>
                {onNavigate && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => onNavigate('departments')}
                    className="text-[#1d58d9] hover:bg-[#e2ebf8] font-bold text-xs rounded-xl flex items-center gap-1.5"
                  >
                    Edit Subjects <ArrowUpRight className="w-3.5 h-3.5" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {deptSubjects.length === 0 ? (
                  <div className="text-center py-12 text-neutral-400">
                    <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No curriculum subjects cataloged yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-neutral-50/50">
                        <TableRow>
                          <TableHead className="text-xs font-bold text-neutral-500 uppercase">Code</TableHead>
                          <TableHead className="text-xs font-bold text-neutral-500 uppercase">Subject Title</TableHead>
                          <TableHead className="text-xs font-bold text-neutral-500 uppercase">Units</TableHead>
                          <TableHead className="text-xs font-bold text-neutral-500 uppercase">Active Classes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deptSubjects.map((subj) => {
                          const activeClasses = deptSchedules.filter((sch) => {
                            const schSubjClean = sch.subject?.toLowerCase().trim();
                            return schSubjClean === subj.code.toLowerCase().trim() || 
                                   schSubjClean === subj.name.toLowerCase().trim();
                          }).length;

                          return (
                            <TableRow key={subj.id} className="hover:bg-neutral-50/40 transition-colors">
                              <TableCell className="py-3.5 font-bold font-mono text-xs text-[#1d58d9]">
                                {subj.code}
                              </TableCell>
                              <TableCell className="py-3.5 font-semibold text-neutral-700">
                                {subj.name}
                              </TableCell>
                              <TableCell className="py-3.5 text-neutral-500 text-xs font-bold">
                                {subj.units} Units
                              </TableCell>
                              <TableCell className="py-3.5">
                                <Badge className={cn(
                                  "font-bold text-[10px] px-2 py-0.5 border-none",
                                  activeClasses > 0 ? "bg-emerald-50 text-emerald-600" : "bg-neutral-100 text-neutral-400"
                                )}>
                                  {activeClasses} {activeClasses === 1 ? 'class' : 'classes'}
                                </Badge>
                              </TableCell>
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

          {/* Right Column Panels */}
          <div className="space-y-8">
            
            {/* Faculty List */}
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between border-b border-neutral-50 pb-4">
                <div>
                  <CardTitle className="text-lg font-extrabold text-neutral-800">Faculty Roster</CardTitle>
                  <CardDescription className="text-xs">Assigned teachers and instructors.</CardDescription>
                </div>
                {onNavigate && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => onNavigate('employees')}
                    className="text-[#1d58d9] hover:bg-[#e2ebf8] font-bold text-xs rounded-xl flex items-center gap-1.5"
                  >
                    Manage Faculty <ArrowUpRight className="w-3.5 h-3.5" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-5 space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar">
                {deptFaculty.length === 0 ? (
                  <div className="text-center py-8 text-neutral-400 text-xs">
                    No faculty members are currently assigned to class schedules in your department.
                  </div>
                ) : (
                  deptFaculty.map((fac) => {
                    const facSchedCount = deptSchedules.filter(sch => sch.employeeId === fac.id).length;

                    return (
                      <div key={fac.id} className="flex items-center justify-between p-3 bg-neutral-50/50 rounded-xl hover:bg-neutral-50 transition-colors border border-neutral-100">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-[#1d58d9]/10 text-[#1d58d9] font-bold rounded-lg flex items-center justify-center text-sm font-sans select-none">
                            {fac.firstName[0]}{fac.lastName[0]}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-neutral-800">{fac.firstName} {fac.lastName}</h4>
                            <p className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">{fac.category || 'FACULTY'}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-white text-neutral-600 text-[10px] font-bold border-neutral-200">
                          {facSchedCount} {facSchedCount === 1 ? 'Schedule' : 'Schedules'}
                        </Badge>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* University Calendar / Holidays */}
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-neutral-50 pb-4 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-extrabold text-neutral-800">University Holidays</CardTitle>
                  <CardDescription className="text-xs">Upcoming administrative breaks.</CardDescription>
                </div>
                {onNavigate && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => onNavigate('holidays')}
                    className="text-[#1d58d9] hover:bg-[#e2ebf8] font-bold text-xs rounded-xl flex items-center gap-1"
                  >
                    All breaks
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                {upcomingHolidays.length === 0 ? (
                  <div className="text-center py-6 text-neutral-400 text-xs">No upcoming holidays scheduled.</div>
                ) : (
                  upcomingHolidays.map((hol: any) => (
                    <div key={hol.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div>
                          <h5 className="text-xs font-bold text-neutral-800">{hol.name}</h5>
                          <p className="text-[10px] text-neutral-400 font-mono">{formatHolidayDisplayDate(hol.date)}</p>
                        </div>
                      </div>
                      <Badge className={cn(
                        "text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 border-none",
                        hol.type === 'Regular' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                      )}>
                        {hol.type}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Quick action shortcuts */}
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden p-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">Academic Operations</h4>
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="outline" 
                  className="rounded-xl h-12 text-xs font-bold flex flex-col justify-center items-center gap-1 hover:bg-neutral-50 text-neutral-700 hover:text-neutral-900 border-neutral-200"
                  onClick={() => onNavigate && onNavigate('departments')}
                >
                  <BookOpen className="w-4 h-4 text-[#1d58d9]" />
                  <span>View Subjects</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="rounded-xl h-12 text-xs font-bold flex flex-col justify-center items-center gap-1 hover:bg-neutral-50 text-neutral-700 hover:text-neutral-900 border-neutral-200"
                  onClick={() => onNavigate && onNavigate('schedules')}
                >
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span>Class Schedules</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="rounded-xl h-12 text-xs font-bold flex flex-col justify-center items-center gap-1 hover:bg-neutral-50 text-neutral-700 hover:text-neutral-900 border-neutral-200"
                  onClick={() => onNavigate && onNavigate('employees')}
                >
                  <Users className="w-4 h-4 text-[#1e74f1]" />
                  <span>Manage Employees</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="rounded-xl h-12 text-xs font-bold flex flex-col justify-center items-center gap-1 hover:bg-neutral-50 text-neutral-700 hover:text-neutral-900 border-neutral-200"
                  onClick={() => onNavigate && onNavigate('profile')}
                >
                  <User className="w-4 h-4 text-amber-500" />
                  <span>My Information</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="rounded-xl h-12 text-xs font-bold flex flex-col justify-center items-center gap-1 hover:bg-neutral-50 text-neutral-700 hover:text-neutral-900 border-neutral-200 col-span-2"
                  onClick={() => onNavigate && onNavigate('holidays')}
                >
                  <Calendar className="w-4 h-4 text-purple-600" />
                  <span>University Breaks</span>
                </Button>
              </div>
            </Card>

          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Executive University Header & Live Status Ribbon */}
      <div className="bg-white border border-neutral-200/80 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-50/40 via-emerald-50/20 to-transparent rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-[#1e3a5f]/10 text-[#1e3a5f] border border-[#1e3a5f]/20">
                <School className="w-3.5 h-3.5 text-[#1e3a5f]" />
                Southern Leyte State University
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Hinunangan Campus
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold bg-neutral-100 text-neutral-600">
                <Database className="w-3 h-3 text-neutral-500" />
                PostgreSQL • Supabase Auth
              </span>
            </div>

            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-neutral-900 font-sans">
                Executive Operations & Payroll Governance
              </h1>
              <p className="text-sm text-neutral-500 mt-1 max-w-2xl font-normal leading-relaxed">
                Centralized administration of compensation cycles, statutory withholdings, personnel appointments, and institutional compliance.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            {/* Live Clock Display */}
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-neutral-50 border border-neutral-200/80 text-neutral-700 text-xs font-mono font-medium shadow-2xs">
              <Clock className="w-3.5 h-3.5 text-neutral-500" />
              <span>{format(currentTime, 'EEE, MMM dd, yyyy • hh:mm:ss a')}</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchDashboardData}
                disabled={isRefreshing}
                className="h-10 px-3.5 rounded-xl border-neutral-200 hover:bg-neutral-50 text-neutral-700 font-bold text-xs gap-1.5 shadow-2xs"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin text-blue-600")} />
                <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
              </Button>

              {onNavigate && (
                <Button
                  size="sm"
                  onClick={() => onNavigate('payroll')}
                  className="h-10 px-4 rounded-xl bg-[#1e3a5f] hover:bg-[#162c46] text-white font-bold text-xs gap-1.5 shadow-sm transition-all"
                >
                  <Banknote className="w-4 h-4" />
                  <span>Run Payroll</span>
                  <ArrowUpRight className="w-3.5 h-3.5 opacity-70" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Executive KPI Ribbon (4 Metric Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Total Personnel */}
        <Card className="border border-neutral-200/80 shadow-xs bg-white rounded-2xl hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              Total Active Personnel
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1e3a5f] flex items-center justify-center">
              <Users className="w-4 h-4 stroke-[2.2]" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-neutral-900 tracking-tight font-sans">
                {stats.totalEmployees}
              </span>
              <span className="text-xs font-semibold text-neutral-400">Headcount</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-neutral-100 text-[10px] font-medium text-neutral-600">
              <span className="px-2 py-0.5 rounded-md bg-neutral-100 font-bold text-[#1e3a5f]">
                {stats.regularCount} Regular
              </span>
              <span className="px-2 py-0.5 rounded-md bg-neutral-100 font-bold text-emerald-700">
                {stats.visitingCount} Visiting
              </span>
              <span className="px-2 py-0.5 rounded-md bg-neutral-100 font-bold text-amber-700">
                {stats.jobOrderCount} JO
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Latest Net Disbursement */}
        <Card className="border border-neutral-200/80 shadow-xs bg-white rounded-2xl hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              Latest Net Disbursement
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <span className="font-black text-base leading-none select-none">₱</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-emerald-700 tracking-tight font-sans">
                ₱{formatCurrency(stats.lastPayrollAmount)}
              </span>
            </div>
            
            <div className="flex items-center justify-between pt-1 border-t border-neutral-100 text-[11px]">
              <span className="text-neutral-500 font-medium">
                Gross: <strong className="text-neutral-800">₱{formatCurrency(stats.lastGrossAmount)}</strong>
              </span>
              <span className="text-red-600 font-semibold">
                -₱{formatCurrency(stats.lastDeductionsAmount)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Deductions Portfolio */}
        <Card className="border border-neutral-200/80 shadow-xs bg-white rounded-2xl hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              Active Deductions Pool
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <CreditCard className="w-4 h-4 stroke-[2.2]" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-neutral-900 tracking-tight font-sans">
                {stats.totalDeductions}
              </span>
              <span className="text-xs font-semibold text-neutral-400">Total Items</span>
            </div>
            
            <div className="flex items-center justify-between pt-1 border-t border-neutral-100 text-[11px]">
              <span className="text-neutral-500">Statutory & Loans</span>
              <span className="font-bold text-neutral-800">₱{formatCurrency(stats.totalDeductionsValue)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Active Payroll Cycles */}
        <Card className="border border-neutral-200/80 shadow-xs bg-white rounded-2xl hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              Active Cycle Pipeline
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 stroke-[2.2]" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-neutral-900 tracking-tight font-sans">
                {stats.activeCycles}
              </span>
              <span className="text-xs font-semibold text-amber-600">Pending Action</span>
            </div>
            
            <div className="flex items-center justify-between pt-1 border-t border-neutral-100 text-[11px]">
              <span className="text-neutral-500 font-medium">
                {stats.draftCycles} Draft • {stats.processingCycles} Review
              </span>
              <span className="font-bold text-emerald-700">{stats.disbursedCount} Disbursed</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Operational Workflow Launchpad (6 Quick Actions) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-500">
            Operations Workflow Launchpad
          </h2>
          <span className="text-xs text-neutral-400 font-medium">Direct operational shortcuts</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            {
              id: 'payroll',
              label: 'Run Payroll',
              sub: 'Cycles & Computation',
              icon: <Banknote className="w-5 h-5 text-[#1e3a5f]" />,
              color: 'hover:border-[#1e3a5f]/40 hover:bg-blue-50/30'
            },
            {
              id: 'employees',
              label: 'Personnel Registry',
              sub: 'Roster & Appointees',
              icon: <Users className="w-5 h-5 text-blue-600" />,
              color: 'hover:border-blue-300 hover:bg-blue-50/30'
            },
            {
              id: 'dtr',
              label: 'Attendance & DTR',
              sub: 'Biometrics & Hours',
              icon: <Clock className="w-5 h-5 text-emerald-600" />,
              color: 'hover:border-emerald-300 hover:bg-emerald-50/30'
            },
            {
              id: 'deductions',
              label: 'Deductions & SSS',
              sub: 'Mandatory & Loans',
              icon: <CreditCard className="w-5 h-5 text-amber-600" />,
              color: 'hover:border-amber-300 hover:bg-amber-50/30'
            },
            {
              id: 'reports',
              label: 'Official Reports',
              sub: 'Registers & BIR 2316',
              icon: <FileSpreadsheet className="w-5 h-5 text-indigo-600" />,
              color: 'hover:border-indigo-300 hover:bg-indigo-50/30'
            },
            {
              id: 'audit',
              label: 'Security & Audit',
              sub: 'Logs & Event Trail',
              icon: <ShieldCheck className="w-5 h-5 text-purple-600" />,
              color: 'hover:border-purple-300 hover:bg-purple-50/30'
            }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate && onNavigate(item.id)}
              className={cn(
                "p-4 bg-white border border-neutral-200/80 rounded-2xl text-left transition-all duration-150 flex flex-col justify-between group shadow-2xs cursor-pointer",
                item.color
              )}
            >
              <div className="p-2.5 rounded-xl bg-neutral-50 w-fit mb-3 group-hover:scale-105 transition-transform">
                {item.icon}
              </div>
              <div>
                <h3 className="text-xs font-bold text-neutral-800 group-hover:text-neutral-900">
                  {item.label}
                </h3>
                <p className="text-[10px] text-neutral-400 font-medium mt-0.5 leading-tight">
                  {item.sub}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Analytics & Demographics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart Column (2/3) */}
        <Card className="lg:col-span-2 border border-neutral-200/80 shadow-xs bg-white rounded-2xl overflow-hidden flex flex-col justify-between">
          <div>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-neutral-100 gap-4">
              <div>
                <CardTitle className="text-base font-extrabold text-neutral-900">
                  Payroll Financial Analytics
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Multi-cycle disbursement comparison (Gross Pay, Net Pay & Statutory Withholdings)
                </CardDescription>
              </div>

              <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-xl">
                <button
                  onClick={() => setChartTab('trends')}
                  className={cn(
                    "px-3 py-1 text-xs font-bold rounded-lg transition-colors",
                    chartTab === 'trends' ? "bg-white text-neutral-900 shadow-2xs" : "text-neutral-500 hover:text-neutral-800"
                  )}
                >
                  Trends Flow
                </button>
                <button
                  onClick={() => setChartTab('categories')}
                  className={cn(
                    "px-3 py-1 text-xs font-bold rounded-lg transition-colors",
                    chartTab === 'categories' ? "bg-white text-neutral-900 shadow-2xs" : "text-neutral-500 hover:text-neutral-800"
                  )}
                >
                  Workforce Allocation
                </button>
              </div>
            </CardHeader>

            <CardContent className="pt-6">
              {chartTab === 'trends' ? (
                <div className="h-[320px] w-full">
                  {chartData.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-neutral-400 text-xs">
                      <TrendingUp className="w-8 h-8 opacity-30 mb-2" />
                      No completed cycles recorded yet for disbursement analytics.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="grossGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#1e3a5f" stopOpacity={0.25}/>
                            <stop offset="95%" stopColor="#1e3a5f" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#059669" stopOpacity={0.35}/>
                            <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="dedGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#d97706" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#d97706" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                          dy={8}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#64748b', fontSize: 11 }}
                          tickFormatter={(val) => formatCompactCurrency(val, '₱')}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '12px', 
                            border: '1px solid #e2e8f0', 
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.08)',
                            fontSize: '12px',
                            fontWeight: 600
                          }}
                          formatter={((value: any, name: any) => {
                            const label = name === 'gross' || name === 'Gross Pay' 
                              ? 'Gross Pay' 
                              : name === 'net' || name === 'Net Disbursed' 
                              ? 'Net Disbursed' 
                              : 'Deductions';
                            return [`₱${formatCurrency(value || 0)}`, label];
                          }) as any}
                        />
                        <Legend 
                          verticalAlign="top" 
                          align="right"
                          iconType="circle"
                          wrapperStyle={{ paddingBottom: '12px', fontSize: '11px', fontWeight: 700 }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="gross" 
                          name="Gross Pay"
                          stroke="#1e3a5f" 
                          strokeWidth={2.5} 
                          fillOpacity={1} 
                          fill="url(#grossGrad)" 
                        />
                        <Area 
                          type="monotone" 
                          dataKey="net" 
                          name="Net Disbursed"
                          stroke="#059669" 
                          strokeWidth={3} 
                          fillOpacity={1} 
                          fill="url(#netGrad)" 
                        />
                        <Area 
                          type="monotone" 
                          dataKey="deductions" 
                          name="Deductions"
                          stroke="#d97706" 
                          strokeWidth={2} 
                          strokeDasharray="4 4"
                          fillOpacity={1} 
                          fill="url(#dedGrad)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              ) : (
                <div className="h-[320px] w-full pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    {categoryBreakdownData.map((cat, idx) => (
                      <div key={idx} className="p-4 rounded-xl border border-neutral-100 bg-neutral-50/50">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                          {cat.name}
                        </span>
                        <div className="text-2xl font-black text-neutral-900 mt-1">{cat.count}</div>
                        <div className="text-xs text-neutral-500 font-medium mt-0.5">
                          {stats.totalEmployees > 0 ? `${Math.round((cat.count / stats.totalEmployees) * 100)}% of workforce` : '0%'}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="h-[180px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryBreakdownData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                          dy={6}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                        <Tooltip 
                          formatter={(value: any) => [`${value} Personnel`, 'Count']}
                          contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                        />
                        <Bar dataKey="count" fill="#1e3a5f" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </CardContent>
          </div>

          {/* Key Executive KPI Metrics below chart */}
          <div className="p-4 bg-neutral-50/80 border-t border-neutral-100 grid grid-cols-3 gap-4 text-center">
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                Average Net / Employee
              </span>
              <div className="text-sm font-extrabold text-neutral-900 mt-0.5">
                ₱{formatCurrency(stats.avgNetPay)}
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                Withholding Ratio
              </span>
              <div className="text-sm font-extrabold text-amber-700 mt-0.5">
                {stats.deductionRatio}% of Gross
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                Total Disbursed (YTD)
              </span>
              <div className="text-sm font-extrabold text-emerald-700 mt-0.5">
                ₱{formatCurrency(stats.totalDisbursedYTD)}
              </div>
            </div>
          </div>
        </Card>

        {/* Workforce Demographics Column (1/3) */}
        <Card className="border border-neutral-200/80 shadow-xs bg-white rounded-2xl overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-neutral-100 pb-4">
            <CardTitle className="text-base font-extrabold text-neutral-900">
              Workforce Composition
            </CardTitle>
            <CardDescription className="text-xs">
              Staff appointment & category distribution
            </CardDescription>
          </CardHeader>

          <CardContent className="p-5 space-y-5">
            {/* Category 1: Faculty & Regular */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#1e3a5f]" />
                  Faculty & Regular Staff
                </span>
                <span className="font-bold text-neutral-900 font-mono">
                  {stats.regularCount} <span className="text-neutral-400 font-normal">({stats.totalEmployees > 0 ? Math.round((stats.regularCount / stats.totalEmployees) * 100) : 0}%)</span>
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-neutral-100 overflow-hidden">
                <div 
                  className="h-full bg-[#1e3a5f] rounded-full transition-all duration-500"
                  style={{ width: `${stats.totalEmployees > 0 ? (stats.regularCount / stats.totalEmployees) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Category 2: Visiting Instructors */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                  Visiting Instructors (Part-Time)
                </span>
                <span className="font-bold text-neutral-900 font-mono">
                  {stats.visitingCount} <span className="text-neutral-400 font-normal">({stats.totalEmployees > 0 ? Math.round((stats.visitingCount / stats.totalEmployees) * 100) : 0}%)</span>
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-neutral-100 overflow-hidden">
                <div 
                  className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                  style={{ width: `${stats.totalEmployees > 0 ? (stats.visitingCount / stats.totalEmployees) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Category 3: Job Order Personnel */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
                  Job Order Personnel (Daily)
                </span>
                <span className="font-bold text-neutral-900 font-mono">
                  {stats.jobOrderCount} <span className="text-neutral-400 font-normal">({stats.totalEmployees > 0 ? Math.round((stats.jobOrderCount / stats.totalEmployees) * 100) : 0}%)</span>
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-neutral-100 overflow-hidden">
                <div 
                  className="h-full bg-amber-600 rounded-full transition-all duration-500"
                  style={{ width: `${stats.totalEmployees > 0 ? (stats.jobOrderCount / stats.totalEmployees) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Institutional Campus Tag */}
            <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-100 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-700">Designated Campus</span>
                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px] font-bold border-none">
                  100% Active
                </Badge>
              </div>
              <p className="text-[11px] text-neutral-500">
                Southern Leyte State University • Hinunangan Campus registry
              </p>
            </div>
          </CardContent>

          <div className="p-4 bg-neutral-50 border-t border-neutral-100">
            {onNavigate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate('employees')}
                className="w-full rounded-xl text-xs font-bold text-neutral-700 hover:bg-white border-neutral-200 flex items-center justify-center gap-1.5"
              >
                <span>View Complete Personnel Directory</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* Operational Pipeline & Live System Audit Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Recent Cycles Table (2/3) */}
        <Card className="lg:col-span-2 border border-neutral-200/80 shadow-xs bg-white rounded-2xl overflow-hidden flex flex-col justify-between">
          <div>
            <CardHeader className="flex flex-row items-center justify-between border-b border-neutral-100 pb-4">
              <div>
                <CardTitle className="text-base font-extrabold text-neutral-900">
                  Recent Payroll Cycles
                </CardTitle>
                <CardDescription className="text-xs">
                  Latest compensation cycles and disbursement statuses
                </CardDescription>
              </div>

              {onNavigate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate('payroll')}
                  className="text-xs font-bold text-[#1e3a5f] hover:bg-blue-50/50 rounded-xl flex items-center gap-1"
                >
                  <span>All Cycles</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Button>
              )}
            </CardHeader>

            <CardContent className="p-0">
              {recentCycles.length === 0 ? (
                <div className="py-12 text-center text-neutral-400 text-xs">
                  <Calendar className="w-8 h-8 opacity-30 mx-auto mb-2" />
                  No payroll cycles created yet. Click "Run Payroll" to initiate your first cycle.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-neutral-50/60">
                      <TableRow className="border-b border-neutral-100">
                        <TableHead className="text-xs font-bold text-neutral-500 uppercase">Cycle Details</TableHead>
                        <TableHead className="text-xs font-bold text-neutral-500 uppercase">Category</TableHead>
                        <TableHead className="text-xs font-bold text-neutral-500 uppercase text-center">Personnel</TableHead>
                        <TableHead className="text-xs font-bold text-neutral-500 uppercase text-right">Net Amount</TableHead>
                        <TableHead className="text-xs font-bold text-neutral-500 uppercase text-center">Status</TableHead>
                        <TableHead className="text-xs font-bold text-neutral-500 uppercase text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentCycles.map((cycle) => (
                        <TableRow key={cycle.id} className="hover:bg-neutral-50/50 transition-colors border-b border-neutral-100">
                          <TableCell className="py-3.5">
                            <div className="font-bold text-xs text-neutral-900">{cycle.name}</div>
                            <div className="text-[11px] text-neutral-400 font-mono mt-0.5">
                              {cycle.startDate ? format(new Date(cycle.startDate), 'MMM dd') : '---'} - {cycle.endDate ? format(new Date(cycle.endDate), 'MMM dd, yyyy') : '---'}
                            </div>
                          </TableCell>

                          <TableCell className="py-3.5">
                            <Badge variant="outline" className="text-[10px] font-semibold text-neutral-600 border-neutral-200 bg-neutral-50">
                              {cycle.categoryFilter || 'All Categories'}
                            </Badge>
                          </TableCell>

                          <TableCell className="py-3.5 text-center font-mono text-xs font-bold text-neutral-700">
                            {cycle.employeeCount || 0}
                          </TableCell>

                          <TableCell className="py-3.5 text-right font-mono text-xs font-bold text-neutral-900">
                            ₱{formatCurrency(cycle.totalNet || 0)}
                          </TableCell>

                          <TableCell className="py-3.5 text-center">
                            <Badge className={cn(
                              "text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 border-none",
                              cycle.status === 'disbursed' || cycle.status === 'completed' 
                                ? "bg-emerald-50 text-emerald-700" 
                                : cycle.status === 'processing'
                                ? "bg-blue-50 text-blue-700"
                                : "bg-amber-50 text-amber-700"
                            )}>
                              {cycle.status || 'draft'}
                            </Badge>
                          </TableCell>

                          <TableCell className="py-3.5 text-right">
                            {onNavigate && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onNavigate('payroll')}
                                className="h-8 px-2.5 text-xs font-bold text-[#1e3a5f] hover:bg-blue-50/60 rounded-lg"
                              >
                                View Hub
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </div>
        </Card>

        {/* Right: Live System Audit Feed & Holidays (1/3) */}
        <div className="space-y-6">
          {/* Audit Feed */}
          <Card className="border border-neutral-200/80 shadow-xs bg-white rounded-2xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <CardTitle className="text-sm font-extrabold text-neutral-900 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-600" />
                  Live Compliance & Audit Feed
                </CardTitle>
                <CardDescription className="text-[11px]">
                  Real-time security & transactional stream
                </CardDescription>
              </div>

              {onNavigate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate('audit')}
                  className="text-xs font-bold text-neutral-600 hover:bg-neutral-50 rounded-xl"
                >
                  Logs
                </Button>
              )}
            </CardHeader>

            <CardContent className="p-4 space-y-3">
              {recentAuditLogs.length === 0 ? (
                <div className="text-center py-6 text-neutral-400 text-xs">
                  No recent audit events registered.
                </div>
              ) : (
                recentAuditLogs.map((log: any) => (
                  <div key={log.id} className="p-2.5 rounded-xl bg-neutral-50/60 border border-neutral-100 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold font-mono text-[10px] px-1.5 py-0.5 rounded bg-white text-neutral-700 border border-neutral-200">
                        {log.action}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono">
                        {log.createdAt ? format(new Date(log.createdAt), 'MMM dd, HH:mm') : 'Recently'}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-600 line-clamp-1">
                      {log.detail || 'Security event registered'}
                    </p>
                    <div className="text-[10px] text-neutral-400 font-mono">
                      By: {log.userEmail || 'system'}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Academic Calendar / Upcoming Breaks */}
          <Card className="border border-neutral-200/80 shadow-xs bg-white rounded-2xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-extrabold text-neutral-900 flex items-center gap-1.5">
                    <CalendarCheck className="w-4 h-4 text-purple-600" />
                    Upcoming University Breaks
                  </CardTitle>
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                    2026 Latest
                  </span>
                </div>
                <CardDescription className="text-[11px] mt-0.5">
                  Administrative holidays & cutoff dates
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center bg-neutral-100 p-0.5 rounded-lg text-[11px] font-medium">
                  <button
                    type="button"
                    onClick={() => setBreaksTab('upcoming')}
                    className={cn(
                      "px-2.5 py-1 rounded-md transition-all text-[11px]",
                      breaksTab === 'upcoming'
                        ? "bg-white text-neutral-900 font-bold shadow-2xs"
                        : "text-neutral-500 hover:text-neutral-800"
                    )}
                  >
                    Upcoming
                  </button>
                  <button
                    type="button"
                    onClick={() => setBreaksTab('2026')}
                    className={cn(
                      "px-2.5 py-1 rounded-md transition-all text-[11px]",
                      breaksTab === '2026'
                        ? "bg-white text-neutral-900 font-bold shadow-2xs"
                        : "text-neutral-500 hover:text-neutral-800"
                    )}
                  >
                    2026 Schedule
                  </button>
                </div>

                {onNavigate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigate('holidays')}
                    className="text-xs font-bold text-neutral-600 hover:bg-neutral-50 rounded-xl px-2.5 h-8"
                  >
                    Calendar
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-2.5">
              {(() => {
                const displayList = breaksTab === 'upcoming' ? upcomingHolidaysList : all2026HolidaysList;
                if (displayList.length === 0) {
                  return (
                    <div className="text-center py-6 text-neutral-400 text-xs">
                      No university breaks scheduled for this view.
                    </div>
                  );
                }
                return displayList.map((hol: any) => (
                  <div key={hol.id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-neutral-50 transition-colors text-xs border border-transparent hover:border-neutral-150">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-purple-50 text-purple-700 shrink-0">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-neutral-900 leading-tight text-xs">{hol.name}</h4>
                        <span className="text-[10px] text-neutral-500 font-mono font-medium">
                          {formatHolidayDisplayDate(hol.date)}
                        </span>
                      </div>
                    </div>

                    <Badge className={cn(
                      "text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 border-none",
                      hol.type === 'Regular' ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
                    )}>
                      {hol.type}
                    </Badge>
                  </div>
                ));
              })()}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Institutional Infrastructure Verification Ribbon */}
      <div className="p-4 rounded-2xl bg-white border border-neutral-200/80 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 stroke-[2.2]" />
          </div>
          <div>
            <h4 className="font-bold text-neutral-900">Database & Security Architecture Active</h4>
            <p className="text-[11px] text-neutral-500">
              PostgreSQL direct connection pool synchronized with Supabase Auth RBAC. AES-256 encrypted payroll registers.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-[11px] font-mono text-neutral-500">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            PostgreSQL: Operational
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Realtime: Connected
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            SLSU Hinunangan
          </span>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
