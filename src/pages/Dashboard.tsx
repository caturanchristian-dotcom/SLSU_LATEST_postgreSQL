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
  BookOpen
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
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
  Area
} from 'recharts';
import { format, differenceInSeconds } from 'date-fns';
import { toast } from 'sonner';
import { formatCurrency, safeDateStr, safeDateOnly, safeSplit } from '../lib/utils';
import { LogIn, LogOut } from 'lucide-react';

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
    totalDeductions: 0,
    lastPayrollAmount: 0,
    activeCycles: 0
  });
  const [recentCycles, setRecentCycles] = useState<any[]>([]);
  const [myPayroll, setMyPayroll] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);
  const [employeeProfile, setEmployeeProfile] = useState<any>(null);
  const [subview, setSubview] = useState<string | null>(initialSubview);

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
      if (!user?.email) return;
      
      try {
        const response = await fetch('/api/employees');
        if (response.ok) {
          const emps = await response.json();
          const matched = emps.find((e: any) => e.email.toLowerCase() === user.email.toLowerCase());
          if (matched) {
            setEmployeeProfile(matched);
          }
        }
      } catch (err) {
        console.error("Failed to load employee list matching user context", err);
      }

      const data = await api.payroll.getMyPayroll(user.email);
      setMyPayroll(data);
      
      // Prepare chart data for employee
      const chart = data
        .slice(0, 6)
        .reverse()
        .map((e: any) => ({
          name: safeSplit(e.cycleName || 'Cycle', ' ')[0],
          amount: e.netPay
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
      const [employees, cycles, deductions] = await Promise.all([
        api.employees.list(),
        api.payroll.listCycles(),
        api.deductions.list()
      ]);

      const lastCycle = cycles.find((c: any) => c.status === 'disbursed' || c.status === 'completed');
      
      setStats({
        totalEmployees: employees.length,
        totalDeductions: deductions.length,
        lastPayrollAmount: lastCycle ? lastCycle.totalNet : 0,
        activeCycles: cycles.filter((c: any) => c.status === 'draft' || c.status === 'processing').length
      });

      setRecentCycles(cycles.slice(0, 5));

      // Prepare chart data (last 6 cycles)
      const chart = cycles
        .filter((c: any) => c.status === 'disbursed' || c.status === 'completed')
        .slice(0, 6)
        .reverse()
        .map((c: any) => ({
          name: safeSplit(c.name || 'Cycle', ' ')[0],
          amount: c.totalNet
        }));
      setChartData(chart);

    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
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

        setDeptHeadData({
          myDepartment: myDept,
          subjects: deptSubjects,
          schedules: deptSchedules,
          faculty: deptFaculty,
          holidays: Array.isArray(allHolidays) ? allHolidays.slice(0, 5) : [],
          loading: false
        });
      } else {
        setDeptHeadData({
          myDepartment: null,
          subjects: [],
          schedules: [],
          faculty: [],
          holidays: Array.isArray(allHolidays) ? allHolidays.slice(0, 5) : [],
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
                  <h3>Southern Luzon State University</h3>
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
        <div className="space-y-8 animate-fadeIn">
          {/* Header Back Bar */}
          <div className="bg-white border border-neutral-100 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm">
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                onClick={() => setSubview(null)} 
                className="p-3 border-neutral-200 hover:bg-neutral-50 rounded-xl flex items-center gap-2 text-xs font-bold shrink-0 text-neutral-700 active:scale-95 transition-all shadow-sm"
              >
                <ArrowLeft className="w-4 h-4 text-neutral-500" /> Back to Portal
              </Button>
              <div>
                <h2 className="text-xl font-bold text-neutral-900 tracking-tight">My Payslips & Account</h2>
                <p className="text-xs text-neutral-500">Historical statements of earnings are tabulated dynamically.</p>
              </div>
            </div>
            <div className="w-full md:w-80">
              <DTRWidget employeeId={user?.id} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border-none shadow-sm bg-white rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Last Net Pay</CardTitle>
                <CreditCard className="w-4 h-4 text-neutral-400" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold text-neutral-900">
                  ₱{myPayroll[0] ? formatCurrency(myPayroll[0]?.netPay) : '0.00'}
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  {myPayroll[0] ? `For ${myPayroll[0].cycleName}` : 'No records yet'}
                </p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Total Net Pay</CardTitle>
                <DollarSign className="w-4 h-4 text-neutral-400" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold text-emerald-600">
                  ₱{formatCurrency(myPayroll.reduce((acc, curr) => acc + Number(curr.netPay || 0), 0))}
                </div>
                <p className="text-xs text-neutral-400 mt-1">Lifetime earnings</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Total Deductions</CardTitle>
                <PieChart className="w-4 h-4 text-neutral-400" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold text-neutral-900">
                  ₱{myPayroll[0] ? formatCurrency(myPayroll[0]?.totalDeductions) : '0.00'}
                </div>
                <p className="text-xs text-red-600 font-medium mt-1">Last cycle</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Basic Salary</CardTitle>
                <TrendingUp className="w-4 h-4 text-neutral-400" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold text-neutral-900">
                  ₱{myPayroll[0] ? formatCurrency(myPayroll[0]?.basicPay) : '0.00'}
                </div>
                <p className="text-xs text-neutral-400 mt-1">Monthly base</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-2 border-none shadow-sm bg-white overflow-hidden rounded-2xl">
              <CardHeader className="pb-0">
                <CardTitle className="text-lg font-bold">Earnings History</CardTitle>
                <CardDescription>Your net pay over the last few cycles.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 pt-6">
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#171717" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#171717" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#a3a3a3', fontSize: 12 }}
                        dy={10}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#a3a3a3', fontSize: 12 }}
                        tickFormatter={(value) => `₱${formatCurrency(value)}`}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: any) => [`₱${formatCurrency(value)}`, 'Net Pay']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="amount" 
                        stroke="#171717" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorAmount)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-white rounded-2xl">
              <CardHeader>
                <CardTitle className="text-lg font-bold">Recent Payslips</CardTitle>
                <CardDescription>View and download your latest payslips.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 max-h-[400px] overflow-auto custom-scrollbar">
                {myPayroll.length === 0 ? (
                  <div className="text-center py-10 text-neutral-400 text-sm">No payslips available yet.</div>
                ) : (
                  myPayroll.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-neutral-50 text-neutral-400 flex items-center justify-center">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-neutral-900">{entry.cycleName}</h4>
                          <p className="text-xs text-neutral-400">{format(new Date(entry.startDate), 'MMM dd, yyyy')}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-neutral-400 hover:text-neutral-900"
                          onClick={() => setSelectedPayslip(entry)}
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-neutral-400 hover:text-neutral-900"
                          onClick={() => handleExportToExcel(entry)}
                          title="Download Excel"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-neutral-400 hover:text-neutral-900"
                          onClick={() => handleExportToPDF(entry)}
                          title="Download PDF"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Payslip View Modal */}
          <Dialog open={!!selectedPayslip} onOpenChange={() => setSelectedPayslip(null)}>
            <DialogContent className="max-w-5xl sm:max-w-5xl w-full bg-white border border-neutral-100 shadow-2xl rounded-3xl overflow-y-auto max-h-[90vh] p-0 gap-0">
              {selectedPayslip && (
                <div className="flex flex-col md:flex-row md:min-h-[500px]">
                  {/* Left Section - Professional Institutional Receipt Summary */}
                  <div className="md:w-80 shrink-0 bg-gradient-to-b from-emerald-950 via-emerald-900 to-neutral-950 text-white p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden">
                    {/* Decorative faint background icon */}
                    <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none select-none">
                      <Building2 className="w-56 h-56 text-emerald-300" />
                    </div>
                    
                    <div className="relative z-10 space-y-6">
                      {/* Header Brand */}
                      <div className="space-y-1.5 border-b border-emerald-800/40 pb-5">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-5 h-5 text-emerald-400" />
                          <span className="text-[10px] uppercase tracking-widest text-[#a7f3d0] font-extrabold font-mono">SLSU Payroll Group</span>
                        </div>
                        <h3 className="text-lg font-bold font-sans">Official Statements</h3>
                        <p className="text-[11px] text-emerald-200/60 font-sans leading-relaxed">Human Resource Management Statement of Account</p>
                      </div>

                      {/* Compact Itemized Info */}
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-bold text-emerald-400/70 font-sans tracking-wider block">Employee Name</span>
                          <span className="text-sm font-extrabold text-white font-sans">{selectedPayslip.employeeName}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-bold text-emerald-400/70 font-sans tracking-wider block">Employee ID Ref</span>
                          <span className="text-xs font-mono font-bold text-emerald-150 bg-emerald-900/50 border border-emerald-800 px-2 py-0.5 rounded-md inline-block">{selectedPayslip.employeeId}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-bold text-emerald-400/70 font-sans tracking-wider block">Covered Cycle</span>
                          <span className="text-xs font-medium text-emerald-100 font-sans">{selectedPayslip.cycleName}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-bold text-emerald-400/70 font-sans tracking-wider block">Statement Issued</span>
                          <span className="text-xs font-medium text-emerald-100 font-sans">{format(new Date(), 'MMMM dd, yyyy')}</span>
                        </div>
                      </div>
                    </div>

                    {/* Net Pay Focus Frame (Bottom of Left Column) */}
                    <div className="relative z-10 mt-8 pt-5 border-t border-emerald-850/40">
                      <p className="text-emerald-400/80 text-[10px] uppercase font-extrabold tracking-wider font-sans">Net Take-Home Pay</p>
                      <p className="text-3xl sm:text-4xl font-black text-emerald-300 font-mono mt-1 tracking-tight">₱{formatCurrency(selectedPayslip.netPay)}</p>
                      
                      <div className="mt-4 flex items-center gap-1.5 text-[10px] text-emerald-300/80 bg-emerald-900/40 border border-emerald-800/30 px-3 py-1.5 rounded-xl font-medium">
                        <BadgeCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Authenticated Record</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Section - Double Side-by-Side Detailed Breakdown */}
                  <div className="flex-1 p-6 sm:p-8 bg-neutral-50/30 flex flex-col justify-between space-y-6">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center pb-2 border-b border-neutral-100">
                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider font-sans">Itemized Ledger Balances</span>
                        <Badge className="bg-emerald-500/10 text-emerald-700 border-none font-semibold text-[10px] uppercase font-mono px-3 py-0.5 rounded-full">
                          Disbursed & Settled
                        </Badge>
                      </div>

                      {/* Double Columns for Earnings and Deductions */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pb-2">
                        {/* Left: Gross Earnings */}
                        <div className="border border-emerald-100/50 bg-emerald-50/10 rounded-2xl p-5 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-2 border-b border-emerald-100/50 pb-2.5 mb-4">
                              <div className="p-1 px-2.5 bg-emerald-100/40 text-emerald-800 rounded-lg text-xs font-bold font-mono">
                                + CR
                              </div>
                              <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider font-sans">Gross Earnings</span>
                            </div>

                            <div className="space-y-3">
                              <div className="flex justify-between items-baseline text-xs">
                                <span className="text-neutral-500 font-medium">Basic Base Pay</span>
                                <span className="font-mono font-bold text-neutral-800">₱{formatCurrency(selectedPayslip.basicPay)}</span>
                              </div>
                              <div className="flex justify-between items-baseline text-xs">
                                <span className="text-neutral-500 font-medium">Overtime Credit</span>
                                <span className="font-mono font-bold text-neutral-800">₱{formatCurrency(selectedPayslip.overtime || 0)}</span>
                              </div>
                              <div className="flex justify-between items-baseline text-xs">
                                <span className="text-neutral-500 font-medium">Bonuses / Subsidy</span>
                                <span className="font-mono font-bold text-neutral-800">₱{formatCurrency(selectedPayslip.bonuses || 0)}</span>
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="border-t border-dashed border-emerald-200/50 pt-3.5 mt-5 flex justify-between items-baseline">
                              <span className="text-[10px] uppercase font-extrabold text-emerald-900 font-sans tracking-wider">Gross Pay Total</span>
                              <span className="text-base font-extrabold text-emerald-800 font-mono">₱{formatCurrency(selectedPayslip.grossPay)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Right: Adjusted Deductions */}
                        <div className="border border-rose-100/50 bg-rose-50/10 rounded-2xl p-5 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-2 border-b border-rose-100/50 pb-2.5 mb-4">
                              <div className="p-1 px-2.5 bg-rose-100/40 text-rose-800 rounded-lg text-xs font-bold font-mono">
                                - DR
                              </div>
                              <span className="text-xs font-bold text-rose-955 uppercase tracking-wider font-sans">Adjusted Deductions</span>
                            </div>

                            <div className="space-y-3">
                              {Object.entries(selectedPayslip.deductions || {}).length === 0 ? (
                                <div className="text-left py-4 text-xs text-neutral-400 italic">No deductions debited.</div>
                              ) : (
                                Object.entries(selectedPayslip.deductions || {}).map(([name, amount]: [string, any]) => (
                                  <div key={name} className="flex justify-between items-baseline text-xs">
                                    <span className="text-neutral-500 font-medium">{name}</span>
                                    <span className="font-mono font-bold text-rose-700">-₱{formatCurrency(amount)}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="border-t border-dashed border-rose-200/50 pt-3.5 mt-5 flex justify-between items-baseline">
                              <span className="text-[10px] uppercase font-extrabold text-rose-900 font-sans tracking-wider">Total Deductions</span>
                              <span className="text-base font-extrabold text-rose-800 font-mono">₱{formatCurrency(selectedPayslip.totalDeductions)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Wide Balance Sheet Actions Alignment Row */}
                    <div className="space-y-4 pt-1">
                      <div className="flex flex-wrap sm:flex-nowrap gap-3">
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="flex-1 bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 rounded-xl text-xs h-9.5 font-medium"
                          onClick={() => handleExportToExcel(selectedPayslip)}
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 mr-2 text-neutral-500" />
                          Download Excel
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="flex-1 bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 rounded-xl text-xs h-9.5 font-medium"
                          onClick={() => handleExportToPDF(selectedPayslip)}
                        >
                          <Download className="w-3.5 h-3.5 mr-2 text-neutral-500" />
                          Download PDF Statement
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="flex-1 bg-[#355275] border-none text-white hover:bg-blue-800 rounded-xl text-xs h-9.5 font-semibold shadow-sm"
                          onClick={() => handlePrintPayslip(selectedPayslip)}
                        >
                          <Printer className="w-3.5 h-3.5 mr-2" />
                          Print Official Stub
                        </Button>
                      </div>

                      {/* Standard declaration footer */}
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center text-[9px] text-neutral-400 font-sans select-none pt-2 border-t border-neutral-100 gap-1.5">
                        <span className="font-medium">SLSU Human Resource Management Portal</span>
                        <span className="italic">This receipt is a computerized ledger output. No manual initials required.</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      );
    }

    if (subview === 'deductions') {
      const latestPayslip = myPayroll[0];
      const customDeductions = latestPayslip?.deductions ? Object.entries(latestPayslip.deductions) : [];
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
                <h2 className="text-xl font-bold text-neutral-900 tracking-tight text-[#355275]">Deductions & Benefits</h2>
                <p className="text-xs text-neutral-500">Overview of statutory contributions and current loan balances.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border border-neutral-100 bg-white shadow-sm p-6 flex flex-col items-center text-center justify-between rounded-2xl">
              <div className="space-y-3 w-full">
                <div className="p-3 bg-red-50 text-red-500 rounded-full w-fit mx-auto font-bold font-mono text-xs">SSS</div>
                <h3 className="font-bold text-neutral-800">Social Security System</h3>
                <p className="text-neutral-400 text-xs text-center leading-normal">Pension and health disability fund matched dynamically based on base tier.</p>
                <div className="text-2xl font-black text-neutral-950 mt-2">
                  ₱{latestPayslip?.deductions?.SSS ? formatCurrency(latestPayslip.deductions.SSS) : (employeeProfile?.hasSss ? 'Matching Base' : '0.00')}
                </div>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full mt-5 select-none ${employeeProfile?.hasSss ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-neutral-100 text-neutral-400'}`}>
                {employeeProfile?.hasSss ? 'Eligible' : 'Not Registered'}
              </span>
            </Card>

            <Card className="border border-neutral-100 bg-white shadow-sm p-6 flex flex-col items-center text-center justify-between rounded-2xl">
              <div className="space-y-3 w-full">
                <div className="p-3 bg-blue-50 text-blue-500 rounded-full w-fit mx-auto font-bold font-mono text-xs">PH</div>
                <h3 className="font-bold text-neutral-800">PhilHealth</h3>
                <p className="text-neutral-400 text-xs text-center leading-normal">National health insurance program allocations computed based on compensation.</p>
                <div className="text-2xl font-black text-neutral-950 mt-2">
                  ₱{latestPayslip?.deductions?.PhilHealth ? formatCurrency(latestPayslip.deductions.PhilHealth) : (employeeProfile?.hasPhilhealth ? 'Matching Base' : '0.00')}
                </div>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full mt-5 select-none ${employeeProfile?.hasPhilhealth ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-neutral-100 text-neutral-400'}`}>
                {employeeProfile?.hasPhilhealth ? 'Eligible' : 'Not Registered'}
              </span>
            </Card>

            <Card className="border border-neutral-100 bg-white shadow-sm p-6 flex flex-col items-center text-center justify-between rounded-2xl">
              <div className="space-y-3 w-full">
                <div className="p-3 bg-purple-50 text-purple-500 rounded-full w-fit mx-auto font-bold font-mono text-xs">HDMF</div>
                <h3 className="font-bold text-neutral-800">Pag-IBIG Fund</h3>
                <p className="text-neutral-400 text-xs text-center leading-normal">Mutual savings and secure shelter program matching schemes for government personnel.</p>
                <div className="text-2xl font-black text-neutral-950 mt-2">
                  ₱{latestPayslip?.deductions?.PagIBIG ? formatCurrency(latestPayslip.deductions.PagIBIG) : (employeeProfile?.hasPagibig ? 'Matching Base' : '0.00')}
                </div>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full mt-5 select-none ${employeeProfile?.hasPagibig ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-neutral-100 text-neutral-400'}`}>
                {employeeProfile?.hasPagibig ? 'Eligible' : 'Not Registered'}
              </span>
            </Card>
          </div>

          <Card className="border border-neutral-100 bg-white shadow-sm p-6 rounded-2xl">
            <h3 className="font-bold text-neutral-950 mb-4 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-neutral-400" /> Detailed Statutory Ledger inside {latestPayslip?.cycleName || 'Current Cycle'}
            </h3>
            {customDeductions.length === 0 ? (
              <div className="text-center py-10 text-neutral-400 text-sm">No recorded deductions for the latest payroll cycle.</div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {customDeductions.map(([key, val]: [any, any]) => (
                  <div key={key} className="flex justify-between items-center py-3.5 text-sm">
                    <span className="font-bold text-neutral-600">{key}</span>
                    <span className="font-mono font-bold text-red-600">-₱{formatCurrency(val)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center py-4 pt-5 text-base font-bold border-t border-dashed border-neutral-200">
                  <span className="text-neutral-900">Total Deductible Liabilities</span>
                  <span className="font-mono text-red-600">₱{formatCurrency(latestPayslip?.totalDeductions || 0)}</span>
                </div>
              </div>
            )}
          </Card>
        </div>
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
                          <p className="text-[10px] text-neutral-400 font-mono">{hol.date}</p>
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
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-neutral-900">Dashboard</h2>
        <p className="text-neutral-500">Welcome back! Here's what's happening with your payroll today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Total Employees</CardTitle>
            <Users className="w-4 h-4 text-neutral-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-neutral-900">{stats.totalEmployees}</div>
            <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1 font-medium">
              <ArrowUpRight className="w-3 h-3" />
              +2 this month
            </p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Active Deductions</CardTitle>
            <CreditCard className="w-4 h-4 text-neutral-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-neutral-900">{stats.totalDeductions}</div>
            <p className="text-xs text-red-600 flex items-center gap-1 mt-1 font-medium">
              <ArrowDownRight className="w-3 h-3" />
              -₱12,400 total
            </p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Last Payroll</CardTitle>
            <TrendingUp className="w-4 h-4 text-neutral-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-neutral-900">₱{formatCurrency(stats.lastPayrollAmount)}</div>
            <p className="text-xs text-neutral-400 mt-1">Disbursed successfully</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Active Cycles</CardTitle>
            <Calendar className="w-4 h-4 text-neutral-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-neutral-900">{stats.activeCycles}</div>
            <p className="text-xs text-amber-600 font-medium mt-1">Requires processing</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="pb-0">
            <CardTitle className="text-lg font-bold">Payroll Trends</CardTitle>
            <CardDescription>Monthly net disbursement overview.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-6">
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#171717" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#171717" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#a3a3a3', fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#a3a3a3', fontSize: 12 }}
                    tickFormatter={(value) => `₱${formatCurrency(value)}`}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any) => [`₱${formatCurrency(value)}`, 'Net Pay']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="amount" 
                    stroke="#171717" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorAmount)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Recent Cycles</CardTitle>
            <CardDescription>Latest payroll activities.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 max-h-[450px] overflow-auto custom-scrollbar pr-2">
            {recentCycles.length === 0 ? (
              <div className="text-center py-10 text-neutral-400 text-sm">No recent cycles found.</div>
            ) : (
              recentCycles.map((cycle) => (
                <div key={cycle.id} className="flex items-center justify-between group cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                      cycle.status === 'disbursed' ? "bg-emerald-50 text-emerald-600" : "bg-neutral-50 text-neutral-400"
                    )}>
                      {cycle.status === 'disbursed' ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-neutral-900 group-hover:text-neutral-600 transition-colors">{cycle.name}</h4>
                      <p className="text-xs text-neutral-400">{format(new Date(cycle.startDate), 'MMM dd')} - {format(new Date(cycle.endDate), 'MMM dd')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-neutral-900">₱{formatCurrency(cycle.totalNet)}</div>
                    <div className={cn(
                      "text-[10px] font-bold uppercase tracking-wider",
                      cycle.status === 'disbursed' ? "text-emerald-600" : "text-neutral-400"
                    )}>{cycle.status}</div>
                  </div>
                </div>
              ))
            )}
            <div className="pt-4">
              <div className="p-4 bg-neutral-50 rounded-2xl flex items-center gap-4">
                <div className="bg-white p-2 rounded-lg shadow-sm">
                  <AlertCircle className="w-5 h-5 text-neutral-900" />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-neutral-900">System Status</h5>
                  <p className="text-[10px] text-neutral-500 leading-tight">All systems operational. Database connected via SQLite.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
