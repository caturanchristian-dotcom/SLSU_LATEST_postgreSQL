import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  CreditCard, 
  TrendingUp, 
  PieChart, 
  FileText, 
  Eye, 
  FileSpreadsheet, 
  Download, 
  Building2, 
  BadgeCheck, 
  Printer, 
  User, 
  Mail, 
  Phone, 
  Lock, 
  Shield, 
  Key, 
  Clock, 
  LogIn, 
  LogOut, 
  Calendar, 
  Award, 
  CheckCircle2, 
  AlertCircle, 
  Briefcase, 
  RefreshCw, 
  Save, 
  EyeOff,
  Filter,
  Search,
  ExternalLink
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { formatCurrency, cn } from '../lib/utils';
import { api } from '../lib/api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface EmployeeAccountViewProps {
  user: any;
  employeeProfile: any;
  myPayroll: any[];
  chartData: any[];
  onBack: () => void;
  onNavigate?: (page: string) => void;
  onProfileUpdated?: (updated: any) => void;
}

export const EmployeeAccountView: React.FC<EmployeeAccountViewProps> = ({
  user,
  employeeProfile,
  myPayroll,
  chartData,
  onBack,
  onNavigate,
  onProfileUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'payslips' | 'profile' | 'security' | 'dtr'>('payslips');
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  
  // Profile edit form
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    mi: '',
    email: '',
    phoneNumber: '',
    position: '',
    category: '',
    campus: '',
    bpno: '',
    crn: '',
    birthDate: '',
    gender: '',
    teachingExperience: '',
    hasSss: true,
    hasPhilhealth: true,
    hasPagibig: true
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Security / password form
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // DTR Widget State
  const [dtrStatus, setDtrStatus] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isPunching, setIsPunching] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (employeeProfile) {
      setProfileForm({
        firstName: employeeProfile.firstName || '',
        lastName: employeeProfile.lastName || '',
        mi: employeeProfile.mi || '',
        email: employeeProfile.email || user?.email || '',
        phoneNumber: employeeProfile.phoneNumber || '',
        position: employeeProfile.position || '',
        category: employeeProfile.category || '',
        campus: employeeProfile.campus || 'Hinunangan Campus',
        bpno: employeeProfile.bpno || employeeProfile.employeeId || '',
        crn: employeeProfile.crn || '',
        birthDate: employeeProfile.birthDate || '',
        gender: employeeProfile.gender || '',
        teachingExperience: employeeProfile.teachingExperience || '',
        hasSss: employeeProfile.hasSss === 1 || employeeProfile.hasSss === true || employeeProfile.hasSss === '1',
        hasPhilhealth: employeeProfile.hasPhilhealth === 1 || employeeProfile.hasPhilhealth === true || employeeProfile.hasPhilhealth === '1',
        hasPagibig: employeeProfile.hasPagibig === 1 || employeeProfile.hasPagibig === true || employeeProfile.hasPagibig === '1'
      });
    }
  }, [employeeProfile, user]);

  const fetchDtrStatus = async () => {
    const empId = employeeProfile?.id || user?.id;
    if (!empId) return;
    try {
      const res = await fetch(`/api/dtr/status/${empId}`);
      if (res.ok) {
        const data = await res.json();
        setDtrStatus(data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchDtrStatus();
  }, [employeeProfile, user]);

  const handleClockAction = async (action: 'in' | 'out') => {
    const empId = employeeProfile?.id || user?.id;
    if (!empId) return;
    setIsPunching(true);
    try {
      const response = await fetch(`/api/dtr/clock-${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: empId })
      });
      const data = await response.json();
      if (response.ok) {
        toast.success(`Successfully clocked ${action}!`);
        fetchDtrStatus();
      } else {
        toast.error(data.error || `Failed to clock ${action}`);
      }
    } catch {
      toast.error('Network connection error');
    } finally {
      setIsPunching(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileForm.firstName.trim() || !profileForm.lastName.trim()) {
      return toast.error('First and Last name are required.');
    }
    const empId = employeeProfile?.id;
    if (!empId) {
      return toast.error('Employee record ID not found.');
    }

    setIsSavingProfile(true);
    try {
      const updatedPayload = {
        ...employeeProfile,
        ...profileForm,
        hasSss: profileForm.hasSss ? 1 : 0,
        hasPhilhealth: profileForm.hasPhilhealth ? 1 : 0,
        hasPagibig: profileForm.hasPagibig ? 1 : 0
      };

      await api.employees.update(empId, updatedPayload);
      
      try {
        await api.profile.update({
          email: profileForm.email,
          firstName: profileForm.firstName,
          lastName: profileForm.lastName,
          phoneNumber: profileForm.phoneNumber,
          displayName: `${profileForm.firstName} ${profileForm.lastName}`.trim()
        });
      } catch {}

      toast.success('Account profile updated successfully!');
      if (onProfileUpdated) {
        onProfileUpdated(updatedPayload);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update account profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordForm.currentPassword) {
      return toast.error('Please enter your current password.');
    }
    if (!passwordForm.newPassword) {
      return toast.error('Please enter your new password.');
    }
    if (passwordForm.newPassword.length < 6) {
      return toast.error('New password must be at least 6 characters long.');
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return toast.error('New password and confirmation do not match.');
    }

    setIsChangingPassword(true);
    try {
      const res = await fetch('/api/profile/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user?.email,
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password');
      }

      toast.success('Password updated successfully! Please keep your new credentials secure.');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to update password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Export payslip to Excel
  const handleExportToExcel = (entry: any) => {
    try {
      const wb = XLSX.utils.book_new();
      const rows = [
        ['SOUTHERN LEYTE STATE UNIVERSITY'],
        ['OFFICIAL STATEMENT OF EARNINGS & DEDUCTIONS'],
        [''],
        ['Employee Name:', entry.employeeName || `${user?.firstName || ''} ${user?.lastName || ''}`],
        ['Employee ID:', entry.employeeId || employeeProfile?.bpno || 'EMP-SLSU'],
        ['Payroll Cycle:', entry.cycleName],
        ['Disbursement Date:', format(new Date(), 'yyyy-MM-dd')],
        [''],
        ['GROSS EARNINGS', 'AMOUNT (PHP)'],
        ['Basic Base Pay', Number(entry.basicPay || 0)],
        ['Overtime Credit', Number(entry.overtime || 0)],
        ['Bonuses & Allowances', Number(entry.bonuses || 0)],
        ['TOTAL GROSS EARNINGS', Number(entry.grossPay || 0)],
        [''],
        ['ADJUSTED DEDUCTIONS', 'AMOUNT (PHP)']
      ];

      Object.entries(entry.deductions || {}).forEach(([name, val]) => {
        rows.push([name, Number(val || 0)]);
      });

      rows.push(['TOTAL DEDUCTIONS', Number(entry.totalDeductions || 0)]);
      rows.push(['']);
      rows.push(['NET TAKE-HOME PAY', Number(entry.netPay || 0)]);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Payslip');
      XLSX.writeFile(wb, `Payslip_${entry.cycleName?.replace(/\s+/g, '_')}_${entry.employeeName || 'SLSU'}.xlsx`);
      toast.success('Excel payslip generated and downloaded!');
    } catch {
      toast.error('Failed to export Excel file');
    }
  };

  // Export payslip to PDF
  const handleExportToPDF = (entry: any) => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('SOUTHERN LEYTE STATE UNIVERSITY', 105, 20, { align: 'center' });
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text('Human Resource Management Office - Payroll Disbursement Stub', 105, 28, { align: 'center' });
      
      doc.setDrawColor(200, 200, 200);
      doc.line(20, 32, 190, 32);

      doc.setFontSize(10);
      doc.text(`Employee Name: ${entry.employeeName || 'Employee'}`, 20, 40);
      doc.text(`Employee ID: ${entry.employeeId || employeeProfile?.bpno || 'N/A'}`, 20, 46);
      doc.text(`Payroll Cycle: ${entry.cycleName || 'Current Cycle'}`, 120, 40);
      doc.text(`Date Generated: ${format(new Date(), 'MMMM dd, yyyy')}`, 120, 46);

      const earningsData = [
        ['Basic Base Pay', `PHP ${formatCurrency(entry.basicPay || 0)}`],
        ['Overtime Credit', `PHP ${formatCurrency(entry.overtime || 0)}`],
        ['Bonuses & Allowances', `PHP ${formatCurrency(entry.bonuses || 0)}`],
        ['TOTAL GROSS EARNINGS', `PHP ${formatCurrency(entry.grossPay || 0)}`]
      ];

      const deductionsData = Object.entries(entry.deductions || {}).map(([key, val]: [string, any]) => [
        key,
        `PHP ${formatCurrency(val || 0)}`
      ]);
      deductionsData.push(['TOTAL DEDUCTIONS', `PHP ${formatCurrency(entry.totalDeductions || 0)}`]);

      autoTable(doc, {
        startY: 55,
        head: [['Earnings Category', 'Amount']],
        body: earningsData,
        theme: 'grid',
        headStyles: { fillColor: [53, 82, 117], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9 }
      });

      const currentY = (doc as any).lastAutoTable.finalY + 10;

      autoTable(doc, {
        startY: currentY,
        head: [['Deduction / Liability Item', 'Amount']],
        body: deductionsData,
        theme: 'grid',
        headStyles: { fillColor: [180, 50, 50], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9 }
      });

      const finalY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(34, 139, 34);
      doc.text(`NET TAKE-HOME PAY: PHP ${formatCurrency(entry.netPay || 0)}`, 20, finalY);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(120, 120, 120);
      doc.text('This statement is electronically verified and issued by the SLSU HR Management Portal.', 105, finalY + 15, { align: 'center' });

      doc.save(`Payslip_${entry.cycleName?.replace(/\s+/g, '_')}.pdf`);
      toast.success('PDF Payslip generated and downloaded!');
    } catch {
      toast.error('Failed to generate PDF');
    }
  };

  const handlePrintPayslip = (entry: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      return toast.error('Pop-up blocked. Please allow pop-ups for this site.');
    }

    const dedRows = Object.entries(entry.deductions || {}).map(([name, amount]) => `
      <tr>
        <td style="padding: 6px 12px; border-bottom: 1px solid #e5e5e5; font-size: 12px;">${name}</td>
        <td style="padding: 6px 12px; border-bottom: 1px solid #e5e5e5; text-align: right; font-family: monospace; font-size: 12px; color: #b91c1c;">-₱${formatCurrency(amount as number)}</td>
      </tr>
    `).join('') || '<tr><td colspan="2" style="padding: 8px; text-align: center; color: #888; font-size: 12px;">No deductions debited</td></tr>';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Official Payslip - ${entry.employeeName || 'SLSU'}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #111; max-width: 800px; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 25px; border-bottom: 2px solid #355275; padding-bottom: 15px; }
          .header h1 { font-size: 18px; margin: 0; text-transform: uppercase; color: #355275; letter-spacing: 0.5px; }
          .header p { margin: 4px 0 0; font-size: 12px; color: #666; }
          .meta-grid { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 12px; }
          .meta-col div { margin-bottom: 5px; }
          .section-title { font-size: 13px; font-weight: bold; background: #f4f6f8; padding: 6px 12px; margin-top: 15px; border-left: 4px solid #355275; }
          table { width: 100%; border-collapse: collapse; margin-top: 5px; }
          .net-box { margin-top: 25px; padding: 15px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
          .net-box .label { font-size: 14px; font-weight: bold; color: #065f46; }
          .net-box .val { font-size: 24px; font-weight: bold; font-family: monospace; color: #047857; }
          .footer { margin-top: 30px; font-size: 10px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Southern Leyte State University</h1>
          <p>Human Resource Management & Compensation Section | Official Statement of Account</p>
        </div>
        <div class="meta-grid">
          <div class="meta-col">
            <div><strong>Employee:</strong> ${entry.employeeName || 'Employee'}</div>
            <div><strong>Employee ID:</strong> ${entry.employeeId || employeeProfile?.bpno || 'N/A'}</div>
          </div>
          <div class="meta-col" style="text-align: right;">
            <div><strong>Payroll Cycle:</strong> ${entry.cycleName}</div>
            <div><strong>Date Generated:</strong> ${format(new Date(), 'MMMM dd, yyyy')}</div>
          </div>
        </div>

        <div class="section-title">Gross Earnings Breakdown</div>
        <table>
          <tr>
            <td style="padding: 6px 12px; border-bottom: 1px solid #e5e5e5; font-size: 12px;">Basic Base Pay</td>
            <td style="padding: 6px 12px; border-bottom: 1px solid #e5e5e5; text-align: right; font-family: monospace; font-size: 12px;">₱${formatCurrency(entry.basicPay || 0)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 12px; border-bottom: 1px solid #e5e5e5; font-size: 12px;">Overtime Credit</td>
            <td style="padding: 6px 12px; border-bottom: 1px solid #e5e5e5; text-align: right; font-family: monospace; font-size: 12px;">₱${formatCurrency(entry.overtime || 0)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 12px; border-bottom: 1px solid #e5e5e5; font-size: 12px;">Bonuses / Subsidy</td>
            <td style="padding: 6px 12px; border-bottom: 1px solid #e5e5e5; text-align: right; font-family: monospace; font-size: 12px;">₱${formatCurrency(entry.bonuses || 0)}</td>
          </tr>
          <tr style="font-weight: bold; background: #fafafa;">
            <td style="padding: 8px 12px; font-size: 12px;">Total Gross Earnings</td>
            <td style="padding: 8px 12px; text-align: right; font-family: monospace; font-size: 13px; color: #047857;">₱${formatCurrency(entry.grossPay || 0)}</td>
          </tr>
        </table>

        <div class="section-title" style="border-left-color: #b91c1c; margin-top: 20px;">Adjusted Deductions & Statutory Withholdings</div>
        <table>
          ${dedRows}
          <tr style="font-weight: bold; background: #fafafa;">
            <td style="padding: 8px 12px; font-size: 12px;">Total Deductions Withheld</td>
            <td style="padding: 8px 12px; text-align: right; font-family: monospace; font-size: 13px; color: #b91c1c;">-₱${formatCurrency(entry.totalDeductions || 0)}</td>
          </tr>
        </table>

        <div class="net-box">
          <div class="label">NET TAKE-HOME PAY DISBURSED:</div>
          <div class="val">₱${formatCurrency(entry.netPay || 0)}</div>
        </div>

        <div class="footer">
          This document is generated by the SLSU HR Management Portal. Certified true and correct computerized statement.
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  };

  const filteredPayslips = myPayroll.filter(p => {
    const matchesSearch = 
      (p.cycleName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.startDate || '').includes(searchQuery);
    
    if (yearFilter !== 'all') {
      const year = (p.startDate || '').substring(0, 4);
      if (year !== yearFilter) return false;
    }
    return matchesSearch;
  });

  const availableYears = Array.from(
    new Set(
      myPayroll.map(p => (p.startDate || '').substring(0, 4)).filter(Boolean)
    )
  ).sort().reverse();

  const lifetimeEarnings = myPayroll.reduce((acc, curr) => acc + Number(curr.netPay || 0), 0);
  const lifetimeDeductions = myPayroll.reduce((acc, curr) => acc + Number(curr.totalDeductions || 0), 0);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Banner & Employee Identity Bar */}
      <div className="bg-white border border-neutral-100 rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            onClick={onBack} 
            className="p-3 border-neutral-200 hover:bg-neutral-50 rounded-xl flex items-center gap-2 text-xs font-bold shrink-0 text-neutral-700 active:scale-95 transition-all shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 text-neutral-500" /> Back to Portal
          </Button>

          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#355275] text-white font-bold flex items-center justify-center text-lg shadow-sm">
              {profileForm.firstName ? profileForm.firstName[0] : (user?.displayName ? user.displayName[0] : 'E')}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-neutral-900 tracking-tight">
                  {profileForm.firstName ? `${profileForm.firstName} ${profileForm.lastName}` : (user?.displayName || user?.email)}
                </h2>
                <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold py-0.5">
                  <CheckCircle2 className="w-3 h-3 mr-1 inline" /> Active Account
                </Badge>
                {profileForm.category && (
                  <Badge variant="outline" className="text-[10px] font-bold bg-neutral-50 text-neutral-700">
                    {profileForm.category}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>{profileForm.position || 'Faculty / Staff Member'}</span>
                <span>•</span>
                <span>ID: {profileForm.bpno || employeeProfile?.bpno || 'SLSU-EMP'}</span>
                <span>•</span>
                <span>{profileForm.campus || 'Hinunangan Campus'}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Quick Tabs Control */}
        <div className="flex items-center bg-neutral-100/80 p-1.5 rounded-2xl border border-neutral-200/60 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('payslips')}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
              activeTab === 'payslips'
                ? "bg-white text-neutral-900 shadow-xs"
                : "text-neutral-500 hover:text-neutral-900"
            )}
          >
            <FileText className="w-4 h-4 text-[#355275]" />
            Payslips & Statements
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
              activeTab === 'profile'
                ? "bg-white text-neutral-900 shadow-xs"
                : "text-neutral-500 hover:text-neutral-900"
            )}
          >
            <User className="w-4 h-4 text-[#355275]" />
            Profile Details
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
              activeTab === 'security'
                ? "bg-white text-neutral-900 shadow-xs"
                : "text-neutral-500 hover:text-neutral-900"
            )}
          >
            <Lock className="w-4 h-4 text-[#355275]" />
            Security & Password
          </button>
          <button
            onClick={() => setActiveTab('dtr')}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
              activeTab === 'dtr'
                ? "bg-white text-neutral-900 shadow-xs"
                : "text-neutral-500 hover:text-neutral-900"
            )}
          >
            <Clock className="w-4 h-4 text-[#355275]" />
            DTR Clocks
          </button>
        </div>
      </div>

      {/* TAB 1: PAYSLIPS & STATEMENTS */}
      {activeTab === 'payslips' && (
        <div className="space-y-6">
          {/* Metrics summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-none shadow-sm bg-white rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-neutral-400 mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Last Net Pay</span>
                  <CreditCard className="w-4 h-4 text-[#355275]" />
                </div>
                <div className="text-3xl font-black text-neutral-900 font-mono">
                  ₱{myPayroll[0] ? formatCurrency(myPayroll[0]?.netPay) : '0.00'}
                </div>
              </div>
              <p className="text-xs text-neutral-400 mt-2">
                {myPayroll[0] ? `Cycle: ${myPayroll[0].cycleName}` : 'No records computed yet'}
              </p>
            </Card>

            <Card className="border-none shadow-sm bg-white rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-neutral-400 mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Lifetime Disbursed</span>
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-3xl font-black text-emerald-600 font-mono">
                  ₱{formatCurrency(lifetimeEarnings)}
                </div>
              </div>
              <p className="text-xs text-neutral-400 mt-2">Total net pay across all cycles</p>
            </Card>

            <Card className="border-none shadow-sm bg-white rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-neutral-400 mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Total Deductions</span>
                  <PieChart className="w-4 h-4 text-rose-500" />
                </div>
                <div className="text-3xl font-black text-rose-700 font-mono">
                  ₱{myPayroll[0] ? formatCurrency(myPayroll[0]?.totalDeductions) : '0.00'}
                </div>
              </div>
              <p className="text-xs text-rose-600 font-medium mt-2">Withheld in latest cycle</p>
            </Card>

            <Card className="border-none shadow-sm bg-white rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-neutral-400 mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Monthly Base Salary</span>
                  <Award className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-3xl font-black text-neutral-900 font-mono">
                  ₱{formatCurrency(employeeProfile?.basicSalary || myPayroll[0]?.basicPay || 0)}
                </div>
              </div>
              <p className="text-xs text-neutral-400 mt-2">Official compensation tier</p>
            </Card>
          </div>

          {/* Earnings History Chart and Payslips List */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 border-none shadow-sm bg-white rounded-2xl overflow-hidden p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-neutral-900">Net Take-Home Pay Trend</h3>
                  <p className="text-xs text-neutral-500">Historical net compensation disbursement trajectory.</p>
                </div>
                <Badge variant="outline" className="text-xs font-mono text-[#355275]">
                  {chartData.length} Cycles Shown
                </Badge>
              </div>

              <div className="h-[280px] w-full pt-2">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#355275" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#355275" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#888', fontSize: 11 }}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#888', fontSize: 11 }}
                        tickFormatter={(v) => `₱${(v/1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                        formatter={(val: any) => [`₱${formatCurrency(val)}`, 'Net Take-Home Pay']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="amount" 
                        stroke="#355275" 
                        strokeWidth={2.5} 
                        fillOpacity={1} 
                        fill="url(#colorNet)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-neutral-400">
                    No cycle history data available yet
                  </div>
                )}
              </div>
            </Card>

            {/* Quick Actions & Live DTR preview */}
            <Card className="border-none shadow-sm bg-neutral-900 text-white rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                <Clock className="w-32 h-32" />
              </div>
              <div className="space-y-4 relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 font-mono">
                    Timekeeper Live
                  </span>
                  <span className="text-xs font-mono text-neutral-400">{format(currentTime, 'HH:mm:ss')}</span>
                </div>
                <div>
                  <h4 className="text-lg font-bold">Attendance Punch</h4>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {dtrStatus?.timeIn ? `Clocked in since ${dtrStatus.timeIn}` : 'No active shift punch'}
                  </p>
                </div>
              </div>

              <div className="space-y-3 relative z-10 mt-6">
                {dtrStatus?.timeIn ? (
                  <Button
                    onClick={() => handleClockAction('out')}
                    disabled={isPunching}
                    className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold h-11 rounded-xl gap-2 text-xs"
                  >
                    <LogOut className="w-4 h-4" /> Clock Out Now
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleClockAction('in')}
                    disabled={isPunching}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-11 rounded-xl gap-2 text-xs border-none"
                  >
                    <LogIn className="w-4 h-4" /> Clock In Now
                  </Button>
                )}
                {onNavigate && (
                  <button
                    onClick={() => onNavigate('dtr')}
                    className="w-full text-center text-xs text-neutral-400 hover:text-white underline font-medium"
                  >
                    Open Complete DTR Timesheet
                  </button>
                )}
              </div>
            </Card>
          </div>

          {/* Detailed Payslips Ledger & Search */}
          <Card className="border-none shadow-sm bg-white rounded-2xl p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-neutral-100">
              <div>
                <h3 className="text-base font-bold text-neutral-900">Official Statements of Earnings</h3>
                <p className="text-xs text-neutral-500">Review, print, or download your itemized payroll stubs.</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative w-64">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400" />
                  <Input 
                    placeholder="Search cycle name..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-xs rounded-xl bg-neutral-50 border-neutral-200"
                  />
                </div>

                {availableYears.length > 0 && (
                  <select
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    className="h-9 text-xs rounded-xl bg-neutral-50 border border-neutral-200 px-3 font-medium text-neutral-700 cursor-pointer"
                  >
                    <option value="all">All Years</option>
                    {availableYears.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {filteredPayslips.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed border-neutral-200 rounded-2xl bg-neutral-50/50">
                <FileText className="w-10 h-10 text-neutral-400 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-neutral-700">No Payslips Found</h4>
                <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
                  When payroll cycles are finalized and disbursed by the University Accountant, your computerized statements will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 overflow-x-auto">
                {filteredPayslips.map((entry) => (
                  <div key={entry.id || entry.cycleId} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-50/80 p-3 rounded-xl transition-colors">
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-[#355275]/10 text-[#355275] flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-neutral-900">{entry.cycleName}</h4>
                          <Badge className="bg-emerald-50 text-emerald-700 border-none text-[10px] font-bold">
                            Disbursed
                          </Badge>
                        </div>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          Period: {entry.startDate ? format(new Date(entry.startDate), 'MMM dd, yyyy') : 'Current Period'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 justify-between sm:justify-end">
                      <div className="text-right">
                        <div className="text-sm font-black text-neutral-900 font-mono">
                          ₱{formatCurrency(entry.netPay || 0)}
                        </div>
                        <div className="text-[11px] text-neutral-400">
                          Gross: ₱{formatCurrency(entry.grossPay || 0)} | Ded: <span className="text-rose-600">-₱{formatCurrency(entry.totalDeductions || 0)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8.5 w-8.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-white shadow-2xs"
                          onClick={() => setSelectedPayslip(entry)}
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8.5 w-8.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-white shadow-2xs"
                          onClick={() => handleExportToExcel(entry)}
                          title="Download Excel"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8.5 w-8.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-white shadow-2xs"
                          onClick={() => handleExportToPDF(entry)}
                          title="Download PDF"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8.5 w-8.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-white shadow-2xs"
                          onClick={() => handlePrintPayslip(entry)}
                          title="Print Stub"
                        >
                          <Printer className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 2: PROFILE INFORMATION & HR DETAILS */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="space-y-6">
          <Card className="border-none shadow-sm bg-white rounded-2xl p-6">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-neutral-100">
              <div>
                <h3 className="text-base font-bold text-neutral-900">Personal & Academic Profile</h3>
                <p className="text-xs text-neutral-500">Update your official contact information and university records.</p>
              </div>
              <Button
                type="submit"
                disabled={isSavingProfile}
                className="bg-[#355275] hover:bg-blue-900 text-white text-xs font-bold px-5 h-9 rounded-xl shadow-xs gap-1.5"
              >
                {isSavingProfile ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Changes
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">First Name *</Label>
                <Input 
                  value={profileForm.firstName}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, firstName: e.target.value }))}
                  className="text-xs rounded-xl bg-neutral-50 border-neutral-200"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">Middle Initial / Name</Label>
                <Input 
                  value={profileForm.mi}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, mi: e.target.value }))}
                  className="text-xs rounded-xl bg-neutral-50 border-neutral-200"
                  placeholder="e.g. A."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">Last Name *</Label>
                <Input 
                  value={profileForm.lastName}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, lastName: e.target.value }))}
                  className="text-xs rounded-xl bg-neutral-50 border-neutral-200"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">Email Address (Read-only)</Label>
                <Input 
                  value={profileForm.email}
                  disabled
                  className="text-xs rounded-xl bg-neutral-100 border-neutral-200 text-neutral-500 cursor-not-allowed"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">Mobile Phone Number</Label>
                <Input 
                  value={profileForm.phoneNumber}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, phoneNumber: e.target.value }))}
                  placeholder="+63 9XX XXX XXXX"
                  className="text-xs rounded-xl bg-neutral-50 border-neutral-200"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">Gender</Label>
                <select
                  value={profileForm.gender}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, gender: e.target.value }))}
                  className="w-full h-9 text-xs rounded-xl bg-neutral-50 border border-neutral-200 px-3 text-neutral-800"
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">Birth Date</Label>
                <Input 
                  type="date"
                  value={profileForm.birthDate}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, birthDate: e.target.value }))}
                  className="text-xs rounded-xl bg-neutral-50 border-neutral-200"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">Campus Assignment</Label>
                <Input 
                  value={profileForm.campus}
                  disabled
                  className="text-xs rounded-xl bg-neutral-100 border-neutral-200 text-neutral-500"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">Academic Position / Title</Label>
                <Input 
                  value={profileForm.position}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, position: e.target.value }))}
                  placeholder="e.g. Associate Professor I"
                  className="text-xs rounded-xl bg-neutral-50 border-neutral-200"
                />
              </div>
            </div>

            {/* Government & Statutory Identifiers Section */}
            <div className="mt-8 pt-6 border-t border-neutral-100">
              <h4 className="text-sm font-bold text-neutral-900 mb-1">Government Identifiers & Statutory Schemes</h4>
              <p className="text-xs text-neutral-500 mb-4">Official numbers for mandatory social security, health insurance, and provident funds.</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-neutral-700">BP / GSIS Number</Label>
                  <Input 
                    value={profileForm.bpno}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, bpno: e.target.value }))}
                    placeholder="e.g. 2000123456"
                    className="text-xs rounded-xl bg-neutral-50 border-neutral-200 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-neutral-700">CRN (Common Reference No.)</Label>
                  <Input 
                    value={profileForm.crn}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, crn: e.target.value }))}
                    placeholder="e.g. 0111-1234567-8"
                    className="text-xs rounded-xl bg-neutral-50 border-neutral-200 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-neutral-700">Teaching Experience / Academic Rank</Label>
                  <Input 
                    value={profileForm.teachingExperience}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, teachingExperience: e.target.value }))}
                    placeholder="e.g. 8 years (Full-time)"
                    className="text-xs rounded-xl bg-neutral-50 border-neutral-200"
                  />
                </div>
              </div>

              {/* Statutory coverage checkboxes */}
              <div className="mt-6 flex flex-wrap gap-6 bg-neutral-50 p-4 rounded-2xl border border-neutral-200/70">
                <label className="flex items-center gap-2 text-xs font-bold text-neutral-800 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={profileForm.hasSss}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, hasSss: e.target.checked }))}
                    className="w-4 h-4 rounded text-[#355275] focus:ring-0 cursor-pointer"
                  />
                  <span>SSS / GSIS Pension Plan Enrolled</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-neutral-800 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={profileForm.hasPhilhealth}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, hasPhilhealth: e.target.checked }))}
                    className="w-4 h-4 rounded text-[#355275] focus:ring-0 cursor-pointer"
                  />
                  <span>PhilHealth Medical Insurance Enrolled</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-neutral-800 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={profileForm.hasPagibig}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, hasPagibig: e.target.checked }))}
                    className="w-4 h-4 rounded text-[#355275] focus:ring-0 cursor-pointer"
                  />
                  <span>Pag-IBIG (HDMF) Mutual Fund Enrolled</span>
                </label>
              </div>
            </div>
          </Card>
        </form>
      )}

      {/* TAB 3: SECURITY & PASSWORD */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 border-none shadow-sm bg-white rounded-2xl p-6">
            <div className="pb-4 mb-6 border-b border-neutral-100">
              <h3 className="text-base font-bold text-neutral-900">Change Account Password</h3>
              <p className="text-xs text-neutral-500">Ensure your password contains at least 6 characters for optimal security.</p>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4 max-w-lg">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">Current Password *</Label>
                <div className="relative">
                  <Input 
                    type={showCurrentPw ? 'text' : 'password'}
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                    placeholder="••••••••"
                    className="text-xs rounded-xl bg-neutral-50 border-neutral-200 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-700"
                  >
                    {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">New Password *</Label>
                <div className="relative">
                  <Input 
                    type={showNewPw ? 'text' : 'password'}
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                    placeholder="At least 6 characters"
                    className="text-xs rounded-xl bg-neutral-50 border-neutral-200 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-700"
                  >
                    {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">Confirm New Password *</Label>
                <div className="relative">
                  <Input 
                    type={showConfirmPw ? 'text' : 'password'}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="Re-enter new password"
                    className="text-xs rounded-xl bg-neutral-50 border-neutral-200 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw(!showConfirmPw)}
                    className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-700"
                  >
                    {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={isChangingPassword}
                  className="bg-[#355275] hover:bg-blue-900 text-white text-xs font-bold px-6 h-10 rounded-xl shadow-xs gap-1.5"
                >
                  {isChangingPassword ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                  Update Password
                </Button>
              </div>
            </form>
          </Card>

          {/* Security details sidebar */}
          <Card className="border-none shadow-sm bg-neutral-50 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-neutral-900 font-bold text-sm">
              <Shield className="w-4 h-4 text-[#355275]" />
              Account Security Status
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-white rounded-xl border border-neutral-200/60 space-y-1">
                <div className="font-bold text-neutral-800">Assigned Role</div>
                <Badge className="bg-blue-50 text-blue-700 border-none font-mono text-[10px]">
                  EMPLOYEE PORTAL
                </Badge>
              </div>

              <div className="p-3 bg-white rounded-xl border border-neutral-200/60 space-y-1">
                <div className="font-bold text-neutral-800">Authenticated Email</div>
                <div className="text-neutral-500 font-mono text-[11px] truncate">{user?.email}</div>
              </div>

              <div className="p-3 bg-white rounded-xl border border-neutral-200/60 space-y-1">
                <div className="font-bold text-neutral-800">Active Campus Authorization</div>
                <div className="text-neutral-600 font-medium">{profileForm.campus || 'Hinunangan Campus'}</div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 4: DTR CLOCKS */}
      {activeTab === 'dtr' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-2 border-none shadow-sm bg-white rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <div>
                  <h3 className="text-base font-bold text-neutral-900">Daily Attendance Clock Status</h3>
                  <p className="text-xs text-neutral-500">Record your official university shift attendance.</p>
                </div>
                {onNavigate && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onNavigate('dtr')}
                    className="text-xs rounded-xl border-neutral-200 text-neutral-700 gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Full DTR Records
                  </Button>
                )}
              </div>

              <div className="p-6 bg-neutral-50 rounded-2xl border border-neutral-200/70 flex flex-col sm:flex-row items-center justify-between gap-6">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">Current Server Clock</span>
                  <div className="text-4xl font-black font-mono text-neutral-900 mt-1">
                    {format(currentTime, 'hh:mm:ss a')}
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">
                    {format(currentTime, 'EEEE, MMMM dd, yyyy')}
                  </p>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <Button
                    onClick={() => handleClockAction('in')}
                    disabled={isPunching}
                    className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 px-6 rounded-xl gap-2 text-xs"
                  >
                    <LogIn className="w-4 h-4" /> Clock In
                  </Button>
                  <Button
                    onClick={() => handleClockAction('out')}
                    disabled={isPunching}
                    className="flex-1 sm:flex-none bg-neutral-900 hover:bg-neutral-800 text-white font-bold h-11 px-6 rounded-xl gap-2 text-xs"
                  >
                    <LogOut className="w-4 h-4" /> Clock Out
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-4 bg-white border border-neutral-200/80 rounded-xl">
                  <span className="text-xs font-bold text-neutral-500 block mb-1">Morning Time-In</span>
                  <span className="text-base font-bold font-mono text-neutral-900">
                    {dtrStatus?.timeIn ? dtrStatus.timeIn : 'Not Recorded'}
                  </span>
                </div>
                <div className="p-4 bg-white border border-neutral-200/80 rounded-xl">
                  <span className="text-xs font-bold text-neutral-500 block mb-1">Afternoon / Evening Time-Out</span>
                  <span className="text-base font-bold font-mono text-neutral-900">
                    {dtrStatus?.timeOut ? dtrStatus.timeOut : 'Shift Pending'}
                  </span>
                </div>
              </div>
            </Card>

            <Card className="border-none shadow-sm bg-neutral-50 rounded-2xl p-6 space-y-3">
              <h4 className="text-sm font-bold text-neutral-900">Shift Guidelines</h4>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Standard office and faculty duty hours are monitored according to Civil Service Commission and SLSU administrative manuals.
              </p>
              <div className="text-xs text-neutral-600 space-y-2 pt-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Morning Session: 08:00 AM - 12:00 NN</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Afternoon Session: 01:00 PM - 05:00 PM</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Payslip View Modal */}
      <Dialog open={!!selectedPayslip} onOpenChange={() => setSelectedPayslip(null)}>
        <DialogContent className="max-w-5xl sm:max-w-5xl w-full bg-white border border-neutral-100 shadow-2xl rounded-3xl overflow-y-auto max-h-[90vh] p-0 gap-0">
          {selectedPayslip && (
            <div className="flex flex-col md:flex-row md:min-h-[500px]">
              {/* Left Column Summary */}
              <div className="md:w-80 shrink-0 bg-gradient-to-b from-[#1e344e] via-[#2a4566] to-[#122133] text-white p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden">
                <div className="relative z-10 space-y-6">
                  <div className="space-y-1.5 border-b border-white/10 pb-5">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-blue-300" />
                      <span className="text-[10px] uppercase tracking-widest text-blue-200 font-extrabold font-mono">SLSU Payroll Group</span>
                    </div>
                    <h3 className="text-lg font-bold">Official Statement</h3>
                    <p className="text-[11px] text-blue-100/70">Human Resource Management Statement of Account</p>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-[9px] uppercase font-bold text-blue-300/80 tracking-wider block">Employee</span>
                      <span className="text-sm font-extrabold text-white">{selectedPayslip.employeeName}</span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase font-bold text-blue-300/80 tracking-wider block">ID Ref</span>
                      <span className="text-xs font-mono font-bold text-blue-200 bg-white/10 px-2 py-0.5 rounded-md inline-block">
                        {selectedPayslip.employeeId || employeeProfile?.bpno || 'SLSU-EMP'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase font-bold text-blue-300/80 tracking-wider block">Covered Cycle</span>
                      <span className="text-xs font-medium text-blue-100">{selectedPayslip.cycleName}</span>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 mt-8 pt-5 border-t border-white/10">
                  <p className="text-blue-200/80 text-[10px] uppercase font-extrabold tracking-wider">Net Take-Home Pay</p>
                  <p className="text-3xl sm:text-4xl font-black text-emerald-300 font-mono mt-1">
                    ₱{formatCurrency(selectedPayslip.netPay)}
                  </p>
                  <div className="mt-4 flex items-center gap-1.5 text-[10px] text-blue-200 bg-white/10 px-3 py-1.5 rounded-xl font-medium">
                    <BadgeCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Authenticated Record</span>
                  </div>
                </div>
              </div>

              {/* Right Column Breakdown */}
              <div className="flex-1 p-6 sm:p-8 bg-neutral-50/30 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-neutral-100">
                    <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Itemized Ledger Balances</span>
                    <Badge className="bg-emerald-500/10 text-emerald-700 border-none font-semibold text-[10px] uppercase font-mono px-3 py-0.5 rounded-full">
                      Disbursed & Settled
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Gross Earnings */}
                    <div className="border border-emerald-100 bg-emerald-50/20 rounded-2xl p-5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 border-b border-emerald-100 pb-2.5 mb-4">
                          <span className="p-1 px-2.5 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold font-mono">+ CR</span>
                          <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider">Gross Earnings</span>
                        </div>
                        <div className="space-y-2.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Basic Base Pay</span>
                            <span className="font-mono font-bold text-neutral-800">₱{formatCurrency(selectedPayslip.basicPay)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Overtime Credit</span>
                            <span className="font-mono font-bold text-neutral-800">₱{formatCurrency(selectedPayslip.overtime || 0)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Bonuses / Subsidy</span>
                            <span className="font-mono font-bold text-neutral-800">₱{formatCurrency(selectedPayslip.bonuses || 0)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="border-t border-dashed border-emerald-200 pt-3 mt-4 flex justify-between items-baseline">
                        <span className="text-[10px] uppercase font-extrabold text-emerald-900 tracking-wider">Gross Total</span>
                        <span className="text-base font-extrabold text-emerald-800 font-mono">₱{formatCurrency(selectedPayslip.grossPay)}</span>
                      </div>
                    </div>

                    {/* Deductions */}
                    <div className="border border-rose-100 bg-rose-50/20 rounded-2xl p-5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 border-b border-rose-100 pb-2.5 mb-4">
                          <span className="p-1 px-2.5 bg-rose-100 text-rose-800 rounded-lg text-xs font-bold font-mono">- DR</span>
                          <span className="text-xs font-bold text-rose-950 uppercase tracking-wider">Adjusted Deductions</span>
                        </div>
                        <div className="space-y-2.5 text-xs max-h-44 overflow-y-auto">
                          {Object.entries(selectedPayslip.deductions || {}).length === 0 ? (
                            <div className="text-xs text-neutral-400 italic">No deductions debited.</div>
                          ) : (
                            Object.entries(selectedPayslip.deductions || {}).map(([name, amount]: [string, any]) => (
                              <div key={name} className="flex justify-between">
                                <span className="text-neutral-500">{name}</span>
                                <span className="font-mono font-bold text-rose-700">-₱{formatCurrency(amount)}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="border-t border-dashed border-rose-200 pt-3 mt-4 flex justify-between items-baseline">
                        <span className="text-[10px] uppercase font-extrabold text-rose-900 tracking-wider">Total Deductions</span>
                        <span className="text-base font-extrabold text-rose-800 font-mono">₱{formatCurrency(selectedPayslip.totalDeductions)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="flex flex-wrap sm:flex-nowrap gap-3">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex-1 bg-white border-neutral-200 text-neutral-700 rounded-xl text-xs h-9.5 font-medium"
                      onClick={() => handleExportToExcel(selectedPayslip)}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 mr-2 text-neutral-500" />
                      Download Excel
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex-1 bg-white border-neutral-200 text-neutral-700 rounded-xl text-xs h-9.5 font-medium"
                      onClick={() => handleExportToPDF(selectedPayslip)}
                    >
                      <Download className="w-3.5 h-3.5 mr-2 text-neutral-500" />
                      Download PDF
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex-1 bg-[#355275] border-none text-white hover:bg-blue-900 rounded-xl text-xs h-9.5 font-semibold shadow-sm"
                      onClick={() => handlePrintPayslip(selectedPayslip)}
                    >
                      <Printer className="w-3.5 h-3.5 mr-2" />
                      Print Official Stub
                    </Button>
                  </div>

                  <div className="flex justify-between items-center text-[9px] text-neutral-400 pt-2 border-t border-neutral-100">
                    <span>SLSU Human Resource Management Portal</span>
                    <span className="italic">Computerized ledger output. No manual initials required.</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
