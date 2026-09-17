import React, { useState, useEffect, useMemo } from 'react';
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
  ExternalLink,
  ChevronRight,
  Sparkles,
  HelpCircle,
  DollarSign
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
import { formatCurrency, cn, safeSplit } from '../lib/utils';
import { api } from '../lib/api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface EmployeeAccountViewProps {
  user: any;
  employeeProfile?: any;
  myPayroll?: any[];
  chartData?: any[];
  onBack: () => void;
  onNavigate?: (page: string) => void;
  onProfileUpdated?: (updated: any) => void;
}

// Utility to parse time value or ISO timestamp to 12-hour format with AM/PM
const formatTimeTo12Hour = (timeVal: any): string => {
  if (!timeVal) return '';
  const str = String(timeVal).trim();
  if (str.toLowerCase().includes('am') || str.toLowerCase().includes('pm')) {
    return str;
  }
  // Check if it is an ISO string with T
  if (str.includes('T')) {
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return format(d, 'hh:mm a');
      }
    } catch {}
  }
  const parts = safeSplit(str, ':');
  if (parts.length < 2) return str;
  let hour = parseInt(parts[0], 10);
  const min = parts[1].substring(0, 2);
  if (isNaN(hour)) return str;
  
  const ampm = hour >= 12 ? 'PM' : 'AM';
  let displayHour = hour % 12;
  if (displayHour === 0) displayHour = 12;
  return `${String(displayHour).padStart(2, '0')}:${min} ${ampm}`;
};

// Safe number getter for multiple possible database casing keys
const getNum = (obj: any, ...keys: string[]): number => {
  if (!obj) return 0;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
      const n = Number(obj[k]);
      if (!isNaN(n)) return n;
    }
  }
  return 0;
};

const getCycleName = (entry: any): string => {
  if (!entry) return '';
  return entry.cycleName || entry.cyclename || entry.cycle_name || entry.name || 'Regular Payroll Cycle';
};

const getNetPay = (entry: any): number => getNum(entry, 'netPay', 'netpay', 'net_pay');
const getGrossPay = (entry: any): number => getNum(entry, 'grossPay', 'grosspay', 'gross_pay');
const getTotalDeductions = (entry: any): number => getNum(entry, 'totalDeductions', 'totaldeductions', 'total_deductions');
const getBasicPay = (entry: any): number => getNum(entry, 'basicPay', 'basicpay', 'basic_pay', 'basicSalary', 'basicsalary', 'basic_salary');
const getStartDate = (entry: any): string => entry?.startDate || entry?.startdate || entry?.start_date || '';
const getEndDate = (entry: any): string => entry?.endDate || entry?.enddate || entry?.end_date || '';

// Helper to extract complete itemized deductions & gross earnings breakdown from a payslip entry
const extractPayslipBreakdown = (entry: any) => {
  if (!entry) return { earnings: [], deductions: [] };

  // 1. Gross Earnings Items
  const earnings: { name: string; amount: number }[] = [];
  const basic = getBasicPay(entry);
  if (basic > 0 || earnings.length === 0) {
    earnings.push({ name: 'Basic Base Salary', amount: basic });
  }
  const pera = getNum(entry, 'compPera', 'comppera', 'comp_pera', 'pera');
  if (pera > 0) {
    earnings.push({ name: 'Personnel Economic Relief (PERA)', amount: pera });
  }
  const overtime = getNum(entry, 'overtime');
  if (overtime > 0) {
    earnings.push({ name: 'Overtime & Extended Duty', amount: overtime });
  }
  const bonuses = getNum(entry, 'bonuses');
  if (bonuses > 0) {
    earnings.push({ name: 'Bonuses, Incentives & Subsidy', amount: bonuses });
  }
  const teachingHours = getNum(entry, 'teachingHours', 'teachinghours', 'teaching_hours');
  const ratePerHour = getNum(entry, 'ratePerHour', 'rateperhour', 'rate_per_hour');
  if (teachingHours > 0 && ratePerHour > 0) {
    earnings.push({ name: `Teaching Honoraria (${teachingHours} hrs)`, amount: teachingHours * ratePerHour });
  }

  // 2. Deductions Items
  const deductionsMap = new Map<string, number>();

  // Check explicit statutory fields
  const gsis = getNum(entry, 'govSecGsis', 'govsecgsis', 'gov_sec_gsis', 'dedGsis', 'gsis', 'dedGsisPremPersonal');
  if (gsis > 0) {
    deductionsMap.set('GSIS / Pension Fund Contribution', gsis);
  }
  const hdmf = getNum(entry, 'govSecHdmf', 'govsechdmf', 'gov_sec_hdmf', 'dedHdmf', 'pagibig', 'hdmf', 'dedPagibigPersonal');
  if (hdmf > 0) {
    deductionsMap.set('Pag-IBIG (HDMF) Contribution', hdmf);
  }
  const ph = getNum(entry, 'govSecPh', 'govsecph', 'gov_sec_ph', 'dedPhilhealth', 'philhealth', 'dedPhilhealthCont');
  if (ph > 0) {
    deductionsMap.set('PhilHealth Medical Insurance', ph);
  }
  const wtax = getNum(entry, 'dedWithholdingTax', 'dedwithholdingtax', 'ded_withholding_tax', 'wtax', 'tax', 'dedTaxWithheld');
  if (wtax > 0) {
    deductionsMap.set('Withholding Tax (BIR)', wtax);
  }
  const absences = getNum(entry, 'absences');
  if (absences > 0) {
    deductionsMap.set('Absences & Tardiness Withholding', absences);
  }

  // Loans & Institutional Deductions
  const policyLoan = getNum(entry, 'dedPolicyLoan', 'dedpolicyloan', 'ded_policy_loan');
  if (policyLoan > 0) deductionsMap.set('GSIS Policy Loan', policyLoan);
  
  const consolLoan = getNum(entry, 'dedConsolLoan', 'dedconsolloan', 'ded_consol_loan');
  if (consolLoan > 0) deductionsMap.set('GSIS Consolidation Loan', consolLoan);

  const emergLoan = getNum(entry, 'dedEmergencyLoan', 'dedemergencyloan', 'ded_emergency_loan');
  if (emergLoan > 0) deductionsMap.set('GSIS Emergency Loan', emergLoan);

  const mpl = getNum(entry, 'dedMplLite', 'dedmpllite', 'ded_mpl_lite', 'dedMpl', 'ded_mpl');
  if (mpl > 0) deductionsMap.set('GSIS Multi-Purpose Loan (MPL)', mpl);

  const cpl = getNum(entry, 'dedCpl', 'dedcpl', 'ded_cpl');
  if (cpl > 0) deductionsMap.set('GSIS Computer Loan (CPL)', cpl);

  const gfal = getNum(entry, 'dedGfal', 'dedgfal', 'ded_gfal');
  if (gfal > 0) deductionsMap.set('GSIS Financial Assistance Loan (GFAL)', gfal);

  const pagibigMpl = getNum(entry, 'dedPagibigMpl', 'dedpagibigmpl', 'ded_pagibig_mpl');
  if (pagibigMpl > 0) deductionsMap.set('Pag-IBIG Multi-Purpose Loan', pagibigMpl);

  const pagibigMp2 = getNum(entry, 'dedPagibigMp2', 'dedpagibigmp2', 'ded_pagibig_mp2');
  if (pagibigMp2 > 0) deductionsMap.set('Pag-IBIG Modified MP2 Voluntary Savings', pagibigMp2);

  const csbLoan = getNum(entry, 'dedCsbLoan', 'dedcsbloan', 'ded_csb_loan');
  if (csbLoan > 0) deductionsMap.set('CitySavings / CSB Salary Loan', csbLoan);

  const educAsst = getNum(entry, 'dedEducAsst', 'dededucasst', 'ded_educ_asst');
  if (educAsst > 0) deductionsMap.set('Educational Assistance Loan', educAsst);

  const sss = getNum(entry, 'dedSss', 'dedsss', 'ded_sss');
  if (sss > 0) deductionsMap.set('Social Security Contribution', sss);

  const gpal = getNum(entry, 'dedGpal', 'dedgpal', 'ded_gpal');
  if (gpal > 0) deductionsMap.set('GPAL Education / Calamity Loan', gpal);

  // Check dynamic deductions object (deductions_json / deductions / customValues)
  const dynamicDeds = entry.deductions || entry.customValues || {};
  Object.entries(dynamicDeds).forEach(([key, val]) => {
    const num = Number(val);
    if (!isNaN(num) && num > 0) {
      // Normalize key display names
      let label = key;
      if (key.toLowerCase() === 'gsis') label = 'GSIS Pension Contribution';
      else if (key.toLowerCase() === 'philhealth') label = 'PhilHealth Insurance';
      else if (key.toLowerCase() === 'pagibig' || key.toLowerCase() === 'hdmf') label = 'Pag-IBIG (HDMF) Contribution';
      else if (key.toLowerCase() === 'wtax' || key.toLowerCase() === 'tax') label = 'Withholding Tax';
      
      if (!deductionsMap.has(label)) {
        deductionsMap.set(label, num);
      }
    }
  });

  const deductions: { name: string; amount: number }[] = [];
  deductionsMap.forEach((amount, name) => {
    deductions.push({ name, amount });
  });

  return { earnings, deductions };
};

export const EmployeeAccountView: React.FC<EmployeeAccountViewProps> = ({
  user,
  employeeProfile: initialEmployeeProfile,
  myPayroll: initialMyPayroll = [],
  chartData: initialChartData = [],
  onBack,
  onNavigate,
  onProfileUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'payslips' | 'profile' | 'security' | 'dtr'>('payslips');
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  
  // Local profile & payroll state with auto-fetch resiliency
  const [employeeProfile, setEmployeeProfile] = useState<any>(initialEmployeeProfile || null);
  const [myPayroll, setMyPayroll] = useState<any[]>(initialMyPayroll || []);
  const [isLoadingAccount, setIsLoadingAccount] = useState(!initialEmployeeProfile || initialMyPayroll.length === 0);

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

  // Live timer clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch full employee and payroll data if not loaded
  const loadAccountData = async () => {
    if (!user) return;
    setIsLoadingAccount(true);
    try {
      // 1. Fetch employee record
      const empRes = await fetch('/api/employees');
      let matchedEmp = null;
      if (empRes.ok) {
        const emps = await empRes.json();
        const userEmail = (user.email || '').toLowerCase().trim();
        const userDisplay = (user.displayName || '').toLowerCase().trim();
        const nameParts = userDisplay.split(' ').filter(Boolean);
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

        matchedEmp = emps.find((e: any) => {
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

        if (matchedEmp) {
          setEmployeeProfile(matchedEmp);
        } else if (emps.length > 0 && !employeeProfile) {
          setEmployeeProfile(emps[0]);
        }
      }

      // 2. Fetch my payroll entries
      const payrollData = await api.payroll.getMyPayroll(user.email || '');
      if (Array.isArray(payrollData)) {
        setMyPayroll(payrollData);
      }
    } catch (err) {
      console.warn('Failed to load employee account records:', err);
    } finally {
      setIsLoadingAccount(false);
    }
  };

  useEffect(() => {
    if (!employeeProfile || myPayroll.length === 0) {
      loadAccountData();
    }
  }, [user?.email, user?.id]);

  // Sync profile form when employeeProfile or user changes
  useEffect(() => {
    if (employeeProfile) {
      setProfileForm({
        firstName: employeeProfile.firstName || user?.firstName || '',
        lastName: employeeProfile.lastName || user?.lastName || '',
        mi: employeeProfile.mi || '',
        email: employeeProfile.email || user?.email || '',
        phoneNumber: employeeProfile.phoneNumber || employeeProfile.phone || '',
        position: employeeProfile.position || 'Faculty / Staff Member',
        category: employeeProfile.category || 'Regular Employee',
        campus: employeeProfile.campus || user?.campus || 'Hinunangan Campus',
        bpno: employeeProfile.bpno || employeeProfile.employeeId || '',
        crn: employeeProfile.crn || '',
        birthDate: employeeProfile.birthDate ? employeeProfile.birthDate.split('T')[0] : '',
        gender: employeeProfile.gender || '',
        teachingExperience: employeeProfile.teachingExperience || '',
        hasSss: employeeProfile.hasSss === 1 || employeeProfile.hasSss === true || employeeProfile.hasSss === '1',
        hasPhilhealth: employeeProfile.hasPhilhealth === 1 || employeeProfile.hasPhilhealth === true || employeeProfile.hasPhilhealth === '1',
        hasPagibig: employeeProfile.hasPagibig === 1 || employeeProfile.hasPagibig === true || employeeProfile.hasPagibig === '1'
      });
    } else if (user) {
      const nameParts = (user.displayName || '').split(' ');
      setProfileForm(prev => ({
        ...prev,
        firstName: prev.firstName || nameParts[0] || '',
        lastName: prev.lastName || nameParts.slice(1).join(' ') || '',
        email: user.email || '',
        campus: user.campus || 'Hinunangan Campus'
      }));
    }
  }, [employeeProfile, user]);

  // Fetch DTR punch status
  const fetchDtrStatus = async () => {
    const empId = employeeProfile?.id || user?.id || user?.email;
    if (!empId) return;
    try {
      const res = await fetch(`/api/dtr/status/${encodeURIComponent(empId)}`);
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
  }, [employeeProfile?.id, user?.id, user?.email]);

  // Handle DTR Clock In / Clock Out
  const handleClockAction = async (action: 'in' | 'out') => {
    const empId = employeeProfile?.id || user?.id || user?.email;
    if (!empId) {
      return toast.error('Employee identification not found. Please refresh the page.');
    }
    setIsPunching(true);
    try {
      const response = await fetch(`/api/dtr/clock-${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: empId })
      });
      const data = await response.json();
      if (response.ok) {
        toast.success(`Successfully clocked ${action}! Recorded at ${formatTimeTo12Hour(data.timeIn || data.timeOut || new Date().toLocaleTimeString())}`);
        fetchDtrStatus();
      } else {
        toast.error(data.error || `Failed to clock ${action}`);
      }
    } catch {
      toast.error('Network connection error while recording attendance');
    } finally {
      setIsPunching(false);
    }
  };

  // Save updated Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileForm.firstName.trim() || !profileForm.lastName.trim()) {
      return toast.error('First Name and Last Name are mandatory fields.');
    }

    setIsSavingProfile(true);
    try {
      const fullName = `${profileForm.firstName.trim()} ${profileForm.lastName.trim()}`;
      let empId = employeeProfile?.id;

      // If empId not yet present, look up by email or user.id
      if (!empId) {
        const list = await api.employees.list();
        const found = list.find((e: any) => 
          (e.email && e.email.toLowerCase() === user.email?.toLowerCase()) ||
          (user.id && String(e.id) === String(user.id))
        );
        if (found) {
          empId = found.id;
        }
      }

      const updatedPayload = {
        ...(employeeProfile || {}),
        ...profileForm,
        id: empId || user?.id,
        firstName: profileForm.firstName.trim(),
        lastName: profileForm.lastName.trim(),
        mi: profileForm.mi.trim(),
        email: profileForm.email.trim().toLowerCase(),
        phoneNumber: profileForm.phoneNumber.trim(),
        position: profileForm.position.trim(),
        campus: profileForm.campus || user?.campus || 'Hinunangan Campus',
        bpno: profileForm.bpno.trim(),
        crn: profileForm.crn.trim(),
        birthDate: profileForm.birthDate,
        gender: profileForm.gender,
        teachingExperience: profileForm.teachingExperience.trim(),
        hasSss: profileForm.hasSss ? 1 : 0,
        hasPhilhealth: profileForm.hasPhilhealth ? 1 : 0,
        hasPagibig: profileForm.hasPagibig ? 1 : 0
      };

      if (empId) {
        await api.employees.update(empId, updatedPayload);
      }

      // Sync with user account profile endpoint
      try {
        await api.profile.update({
          email: profileForm.email.trim().toLowerCase(),
          firstName: profileForm.firstName.trim(),
          lastName: profileForm.lastName.trim(),
          phoneNumber: profileForm.phoneNumber.trim(),
          displayName: fullName
        });
      } catch (err) {
        console.warn('Profile sync warning:', err);
      }

      // Update local storage user session so name immediately reflects across UI
      try {
        const saved = localStorage.getItem('payroll_user');
        if (saved) {
          const u = JSON.parse(saved);
          u.displayName = fullName;
          u.firstName = profileForm.firstName.trim();
          u.lastName = profileForm.lastName.trim();
          localStorage.setItem('payroll_user', JSON.stringify(u));
        }
      } catch {}

      setEmployeeProfile(updatedPayload);
      toast.success('Official employee account profile updated successfully!');
      if (onProfileUpdated) {
        onProfileUpdated(updatedPayload);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update account profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordForm.currentPassword) {
      return toast.error('Please enter your current account password.');
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
          email: (user?.email || profileForm.email || '').toLowerCase().trim(),
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password');
      }

      toast.success('Security password updated successfully! Please keep your new credentials safe.');
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

  // Export payslip to Excel (.xlsx)
  const handleExportToExcel = (entry: any) => {
    try {
      const wb = XLSX.utils.book_new();
      const { earnings, deductions } = extractPayslipBreakdown(entry);

      const rows: any[][] = [
        ['SOUTHERN LEYTE STATE UNIVERSITY'],
        ['Human Resource Management & Payroll Disbursement Section'],
        ['OFFICIAL STATEMENT OF EARNINGS & DEDUCTIONS'],
        [''],
        ['Employee Name:', entry.employeeName || `${profileForm.firstName} ${profileForm.lastName}`.trim() || 'SLSU Employee'],
        ['Employee ID / BP No:', entry.employeeId || profileForm.bpno || employeeProfile?.bpno || 'SLSU-EMP'],
        ['Campus Assignment:', entry.campus || profileForm.campus || 'Hinunangan Campus'],
        ['Payroll Cycle:', entry.cycleName || 'Regular Cycle'],
        ['Period Covered:', entry.startDate ? `${entry.startDate} to ${entry.endDate || ''}` : 'Current Period'],
        ['Disbursement Date:', format(new Date(), 'yyyy-MM-dd HH:mm')],
        [''],
        ['GROSS EARNINGS ITEM', 'AMOUNT (PHP)'],
      ];

      earnings.forEach(e => {
        rows.push([e.name, Number(e.amount || 0)]);
      });
      rows.push(['TOTAL GROSS EARNINGS', Number(entry.grossPay || 0)]);
      rows.push(['']);
      rows.push(['ADJUSTED DEDUCTIONS & STATUTORY WITHHOLDINGS', 'AMOUNT (PHP)']);

      deductions.forEach(d => {
        rows.push([d.name, Number(d.amount || 0)]);
      });
      rows.push(['TOTAL DEDUCTIONS WITHHELD', Number(entry.totalDeductions || 0)]);
      rows.push(['']);
      rows.push(['NET TAKE-HOME PAY DISBURSED', Number(entry.netPay || 0)]);
      rows.push(['']);
      rows.push(['Certified Computerized Output. SLSU HR Portal. No manual initials required.']);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Payslip');
      const filename = `Payslip_${(entry.cycleName || 'Cycle').replace(/[^a-zA-Z0-9]/g, '_')}_${(entry.employeeName || 'SLSU').replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast.success('Excel payslip generated and downloaded successfully!');
    } catch (err) {
      console.error('Excel export error:', err);
      toast.error('Failed to export Excel file');
    }
  };

  // Export payslip to PDF (.pdf)
  const handleExportToPDF = (entry: any) => {
    try {
      const doc = new jsPDF();
      const { earnings, deductions } = extractPayslipBreakdown(entry);

      doc.setFontSize(15);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(53, 82, 117);
      doc.text('SOUTHERN LEYTE STATE UNIVERSITY', 105, 18, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text('Human Resource Management Office - Official Payroll Disbursement Stub', 105, 25, { align: 'center' });
      
      doc.setDrawColor(53, 82, 117);
      doc.setLineWidth(0.75);
      doc.line(20, 29, 190, 29);

      // Metadata Grid
      doc.setFontSize(9);
      doc.setTextColor(30, 30, 30);
      doc.setFont('helvetica', 'bold');
      doc.text('Employee Name:', 20, 37);
      doc.setFont('helvetica', 'normal');
      doc.text(`${entry.employeeName || `${profileForm.firstName} ${profileForm.lastName}`.trim() || 'SLSU Employee'}`, 55, 37);

      doc.setFont('helvetica', 'bold');
      doc.text('Employee ID / BP:', 20, 43);
      doc.setFont('helvetica', 'normal');
      doc.text(`${entry.employeeId || profileForm.bpno || employeeProfile?.bpno || 'SLSU-EMP'}`, 55, 43);

      doc.setFont('helvetica', 'bold');
      doc.text('Campus:', 20, 49);
      doc.setFont('helvetica', 'normal');
      doc.text(`${entry.campus || profileForm.campus || 'Hinunangan Campus'}`, 55, 49);

      doc.setFont('helvetica', 'bold');
      doc.text('Payroll Cycle:', 120, 37);
      doc.setFont('helvetica', 'normal');
      doc.text(`${entry.cycleName || 'Disbursed Cycle'}`, 148, 37);

      doc.setFont('helvetica', 'bold');
      doc.text('Date Generated:', 120, 43);
      doc.setFont('helvetica', 'normal');
      doc.text(`${format(new Date(), 'MMMM dd, yyyy')}`, 148, 43);

      doc.setFont('helvetica', 'bold');
      doc.text('Status:', 120, 49);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(4, 120, 87);
      doc.text('DISBURSED & AUTHENTICATED', 148, 49);
      doc.setTextColor(30, 30, 30);

      // Earnings Table
      const earningsData = earnings.map(e => [e.name, `PHP ${formatCurrency(e.amount)}`]);
      earningsData.push(['TOTAL GROSS EARNINGS', `PHP ${formatCurrency(entry.grossPay || 0)}`]);

      autoTable(doc, {
        startY: 56,
        head: [['Gross Earnings Component', 'Amount']],
        body: earningsData,
        theme: 'grid',
        headStyles: { fillColor: [53, 82, 117], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8.5 },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
      });

      const currentY = (doc as any).lastAutoTable.finalY + 8;

      // Deductions Table
      const deductionsData = deductions.map(d => [d.name, `-PHP ${formatCurrency(d.amount)}`]);
      deductionsData.push(['TOTAL DEDUCTIONS WITHHELD', `-PHP ${formatCurrency(entry.totalDeductions || 0)}`]);

      autoTable(doc, {
        startY: currentY,
        head: [['Adjusted Statutory & Loan Deductions', 'Amount']],
        body: deductionsData,
        theme: 'grid',
        headStyles: { fillColor: [180, 50, 50], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8.5 },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold', textColor: [180, 30, 30] } }
      });

      const finalY = (doc as any).lastAutoTable.finalY + 14;

      // Net Pay Summary Box
      doc.setFillColor(240, 253, 244);
      doc.setDrawColor(167, 243, 208);
      doc.roundedRect(20, finalY, 170, 18, 3, 3, 'FD');

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(6, 95, 70);
      doc.text('NET TAKE-HOME PAY DISBURSED:', 25, finalY + 11);

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(4, 120, 87);
      doc.text(`PHP ${formatCurrency(entry.netPay || 0)}`, 185, finalY + 11, { align: 'right' });

      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(120, 120, 120);
      doc.text('This is an official computerized statement issued by the Southern Leyte State University HR Management Portal.', 105, finalY + 26, { align: 'center' });

      doc.save(`Payslip_${(entry.cycleName || 'Cycle').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
      toast.success('PDF Payslip generated and downloaded successfully!');
    } catch (err) {
      console.error('PDF export error:', err);
      toast.error('Failed to generate PDF');
    }
  };

  // Print Payslip Stub
  const handlePrintPayslip = (entry: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      return toast.error('Pop-up was blocked. Please enable pop-ups for this website to print.');
    }

    const { earnings, deductions } = extractPayslipBreakdown(entry);

    const earningRows = earnings.map(e => `
      <tr>
        <td style="padding: 6px 12px; border-bottom: 1px solid #e5e5e5; font-size: 12px;">${e.name}</td>
        <td style="padding: 6px 12px; border-bottom: 1px solid #e5e5e5; text-align: right; font-family: monospace; font-size: 12px;">₱${formatCurrency(e.amount)}</td>
      </tr>
    `).join('');

    const dedRows = deductions.map(d => `
      <tr>
        <td style="padding: 6px 12px; border-bottom: 1px solid #e5e5e5; font-size: 12px;">${d.name}</td>
        <td style="padding: 6px 12px; border-bottom: 1px solid #e5e5e5; text-align: right; font-family: monospace; font-size: 12px; color: #b91c1c;">-₱${formatCurrency(d.amount)}</td>
      </tr>
    `).join('') || '<tr><td colspan="2" style="padding: 8px; text-align: center; color: #888; font-size: 12px;">No deductions debited</td></tr>';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Official Payslip - ${entry.employeeName || 'SLSU'}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #111; max-width: 800px; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #355275; padding-bottom: 12px; }
          .header h1 { font-size: 18px; margin: 0; text-transform: uppercase; color: #355275; letter-spacing: 0.5px; }
          .header p { margin: 4px 0 0; font-size: 11px; color: #666; }
          .meta-grid { display: flex; justify-content: space-between; margin-bottom: 18px; font-size: 12px; background: #fafafa; padding: 12px; border-radius: 8px; border: 1px solid #eee; }
          .meta-col div { margin-bottom: 4px; }
          .section-title { font-size: 12px; font-weight: bold; background: #f4f6f8; padding: 6px 12px; margin-top: 14px; border-left: 4px solid #355275; }
          table { width: 100%; border-collapse: collapse; margin-top: 5px; }
          .net-box { margin-top: 20px; padding: 14px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
          .net-box .label { font-size: 13px; font-weight: bold; color: #065f46; }
          .net-box .val { font-size: 22px; font-weight: bold; font-family: monospace; color: #047857; }
          .footer { margin-top: 25px; font-size: 10px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Southern Leyte State University</h1>
          <p>Human Resource Management & Compensation Section | Official Statement of Account</p>
        </div>
        <div class="meta-grid">
          <div class="meta-col">
            <div><strong>Employee:</strong> ${entry.employeeName || `${profileForm.firstName} ${profileForm.lastName}`.trim() || 'SLSU Employee'}</div>
            <div><strong>Employee ID:</strong> ${entry.employeeId || profileForm.bpno || employeeProfile?.bpno || 'SLSU-EMP'}</div>
            <div><strong>Campus:</strong> ${entry.campus || profileForm.campus || 'Hinunangan Campus'}</div>
          </div>
          <div class="meta-col" style="text-align: right;">
            <div><strong>Payroll Cycle:</strong> ${entry.cycleName || 'Disbursed Cycle'}</div>
            <div><strong>Disbursement Date:</strong> ${format(new Date(), 'MMMM dd, yyyy')}</div>
            <div><strong>Status:</strong> <span style="color: #059669; font-weight: bold;">DISBURSED & VERIFIED</span></div>
          </div>
        </div>

        <div class="section-title">Gross Earnings Breakdown</div>
        <table>
          ${earningRows}
          <tr style="font-weight: bold; background: #fafafa;">
            <td style="padding: 8px 12px; font-size: 12px;">Total Gross Earnings</td>
            <td style="padding: 8px 12px; text-align: right; font-family: monospace; font-size: 13px; color: #047857;">₱${formatCurrency(entry.grossPay || 0)}</td>
          </tr>
        </table>

        <div class="section-title" style="border-left-color: #b91c1c; margin-top: 18px;">Adjusted Statutory & Loan Deductions</div>
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

  // Filtered payslips
  const filteredPayslips = useMemo(() => {
    return myPayroll.filter(p => {
      const cName = getCycleName(p);
      const sDate = getStartDate(p);
      const matchesSearch = 
        cName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sDate.includes(searchQuery);
      
      if (yearFilter !== 'all') {
        const year = sDate.substring(0, 4);
        if (year && year !== yearFilter) return false;
      }
      return matchesSearch;
    });
  }, [myPayroll, searchQuery, yearFilter]);

  // Available filter years
  const availableYears = useMemo(() => {
    return Array.from(
      new Set(
        myPayroll.map(p => getStartDate(p).substring(0, 4)).filter(Boolean)
      )
    ).sort().reverse();
  }, [myPayroll]);

  // Derived dynamic chart data
  const chartData = useMemo(() => {
    if (initialChartData && initialChartData.length > 0) {
      return initialChartData;
    }
    return myPayroll
      .slice(0, 6)
      .reverse()
      .map(p => ({
        name: safeSplit(getCycleName(p), ' ')[0] || 'Cycle',
        amount: getNetPay(p)
      }));
  }, [initialChartData, myPayroll]);

  const lifetimeEarnings = myPayroll.reduce((acc, curr) => acc + getNetPay(curr), 0);
  const lifetimeDeductions = myPayroll.reduce((acc, curr) => acc + getTotalDeductions(curr), 0);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Banner & Employee Identity Bar */}
      <div className="bg-white border border-neutral-100 rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            onClick={onBack} 
            className="p-3 border-neutral-200 hover:bg-neutral-50 rounded-xl flex items-center gap-2 text-xs font-bold shrink-0 text-neutral-700 active:scale-95 transition-all shadow-sm cursor-pointer"
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
                  {profileForm.firstName ? `${profileForm.firstName} ${profileForm.lastName}`.trim() : (user?.displayName || user?.email)}
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
              "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer",
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
              "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer",
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
              "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer",
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
              "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer",
              activeTab === 'dtr'
                ? "bg-white text-neutral-900 shadow-xs"
                : "text-neutral-500 hover:text-neutral-900"
            )}
          >
            <Clock className="w-4 h-4 text-[#355275]" />
            DTR Clocks
          </button>
          {onNavigate && (
            <button
              onClick={() => onNavigate('overtime')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer text-[#1d58d9] hover:bg-white/80"
            >
              <Clock className="w-4 h-4 text-[#1d58d9]" />
              Overtime Request
            </button>
          )}
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
                  ₱{myPayroll.length > 0 ? formatCurrency(getNetPay(myPayroll[0])) : (employeeProfile?.basicSalary ? formatCurrency(Number(employeeProfile.basicSalary)) : '0.00')}
                </div>
              </div>
              <p className="text-xs text-neutral-400 mt-2">
                {myPayroll.length > 0 ? `Cycle: ${getCycleName(myPayroll[0])}` : (employeeProfile?.basicSalary ? 'Regular Base Rate' : 'No records computed yet')}
              </p>
            </Card>

            <Card className="border-none shadow-sm bg-white rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-neutral-400 mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Lifetime Disbursed</span>
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-3xl font-black text-emerald-600 font-mono">
                  ₱{formatCurrency(lifetimeEarnings > 0 ? lifetimeEarnings : (employeeProfile?.basicSalary ? Number(employeeProfile.basicSalary) : 0))}
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
                  ₱{myPayroll.length > 0 ? formatCurrency(getTotalDeductions(myPayroll[0])) : '0.00'}
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
                  ₱{formatCurrency(employeeProfile?.basicSalary || (myPayroll.length > 0 ? getBasicPay(myPayroll[0]) : 0))}
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
                    {dtrStatus?.timeIn ? `Clocked in since ${formatTimeTo12Hour(dtrStatus.timeIn)}` : 'No active shift punch'}
                  </p>
                </div>
              </div>

              <div className="space-y-3 relative z-10 mt-6">
                {dtrStatus?.timeIn ? (
                  <Button
                    onClick={() => handleClockAction('out')}
                    disabled={isPunching}
                    className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold h-11 rounded-xl gap-2 text-xs cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" /> Clock Out Now
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleClockAction('in')}
                    disabled={isPunching}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-11 rounded-xl gap-2 text-xs border-none cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" /> Clock In Now
                  </Button>
                )}
                {onNavigate && (
                  <button
                    onClick={() => onNavigate('dtr')}
                    className="w-full text-center text-xs text-neutral-400 hover:text-white underline font-medium cursor-pointer"
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
                {filteredPayslips.map((entry) => {
                  const entryNet = getNetPay(entry);
                  const entryGross = getGrossPay(entry);
                  const entryDed = getTotalDeductions(entry);
                  const entryCycle = getCycleName(entry);
                  const entryStart = getStartDate(entry);

                  return (
                    <div key={entry.id || entry.cycleId || entry.cycle_id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-50/80 p-3 rounded-xl transition-colors">
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-[#355275]/10 text-[#355275] flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-neutral-900">{entryCycle}</h4>
                            <Badge className="bg-emerald-50 text-emerald-700 border-none text-[10px] font-bold">
                              Disbursed
                            </Badge>
                          </div>
                          <p className="text-xs text-neutral-400 mt-0.5">
                            Period: {entryStart ? format(new Date(entryStart), 'MMM dd, yyyy') : 'Current Period'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 justify-between sm:justify-end">
                        <div className="text-right">
                          <div className="text-sm font-black text-neutral-900 font-mono">
                            ₱{formatCurrency(entryNet)}
                          </div>
                          <div className="text-[11px] text-neutral-400">
                            Gross: ₱{formatCurrency(entryGross)} | Ded: <span className="text-rose-600">-₱{formatCurrency(entryDed)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8.5 w-8.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-white shadow-2xs cursor-pointer"
                            onClick={() => setSelectedPayslip(entry)}
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8.5 w-8.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-white shadow-2xs cursor-pointer"
                            onClick={() => handleExportToExcel(entry)}
                            title="Download Excel"
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8.5 w-8.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-white shadow-2xs cursor-pointer"
                            onClick={() => handleExportToPDF(entry)}
                            title="Download PDF"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8.5 w-8.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-white shadow-2xs cursor-pointer"
                            onClick={() => handlePrintPayslip(entry)}
                            title="Print Stub"
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                className="bg-[#355275] hover:bg-blue-900 text-white text-xs font-bold px-5 h-9 rounded-xl shadow-xs gap-1.5 cursor-pointer"
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
                  className="w-full h-9 text-xs rounded-xl bg-neutral-50 border border-neutral-200 px-3 text-neutral-800 cursor-pointer"
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
                    className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
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
                    className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
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
                    className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  >
                    {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={isChangingPassword}
                  className="bg-[#355275] hover:bg-blue-900 text-white text-xs font-bold px-6 h-10 rounded-xl shadow-xs gap-1.5 cursor-pointer"
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
                <div className="text-neutral-500 font-mono text-[11px] truncate">{user?.email || profileForm.email}</div>
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
                    className="text-xs rounded-xl border-neutral-200 text-neutral-700 gap-1.5 cursor-pointer"
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
                    className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 px-6 rounded-xl gap-2 text-xs cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" /> Clock In
                  </Button>
                  <Button
                    onClick={() => handleClockAction('out')}
                    disabled={isPunching}
                    className="flex-1 sm:flex-none bg-neutral-900 hover:bg-neutral-800 text-white font-bold h-11 px-6 rounded-xl gap-2 text-xs cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" /> Clock Out
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-4 bg-white border border-neutral-200/80 rounded-xl">
                  <span className="text-xs font-bold text-neutral-500 block mb-1">Morning Time-In</span>
                  <span className="text-base font-bold font-mono text-neutral-900">
                    {dtrStatus?.timeIn ? formatTimeTo12Hour(dtrStatus.timeIn) : 'Not Recorded'}
                  </span>
                </div>
                <div className="p-4 bg-white border border-neutral-200/80 rounded-xl">
                  <span className="text-xs font-bold text-neutral-500 block mb-1">Afternoon / Evening Time-Out</span>
                  <span className="text-base font-bold font-mono text-neutral-900">
                    {dtrStatus?.timeOut ? formatTimeTo12Hour(dtrStatus.timeOut) : 'Shift Pending'}
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

      {/* Payslip View Modal Dialog */}
      <Dialog open={!!selectedPayslip} onOpenChange={() => setSelectedPayslip(null)}>
        <DialogContent className="max-w-5xl sm:max-w-5xl w-full bg-white border border-neutral-100 shadow-2xl rounded-3xl overflow-y-auto max-h-[90vh] p-0 gap-0">
          {selectedPayslip && (() => {
            const { earnings, deductions } = extractPayslipBreakdown(selectedPayslip);
            return (
              <div>
                <DialogHeader className="sr-only">
                  <DialogTitle>Official Statement of Earnings - {selectedPayslip.cycleName}</DialogTitle>
                  <DialogDescription>Itemized payroll statement and deductions ledger</DialogDescription>
                </DialogHeader>

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
                          <span className="text-sm font-extrabold text-white">
                            {selectedPayslip.employeeName || `${profileForm.firstName} ${profileForm.lastName}`.trim() || 'SLSU Employee'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-bold text-blue-300/80 tracking-wider block">ID Ref</span>
                          <span className="text-xs font-mono font-bold text-blue-200 bg-white/10 px-2 py-0.5 rounded-md inline-block">
                            {selectedPayslip.employeeId || profileForm.bpno || employeeProfile?.bpno || 'SLSU-EMP'}
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
                              {earnings.map((earn) => (
                                <div key={earn.name} className="flex justify-between">
                                  <span className="text-neutral-600">{earn.name}</span>
                                  <span className="font-mono font-bold text-neutral-800">₱{formatCurrency(earn.amount)}</span>
                                </div>
                              ))}
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
                            <div className="space-y-2.5 text-xs max-h-48 overflow-y-auto pr-1">
                              {deductions.length === 0 ? (
                                <div className="text-xs text-neutral-400 italic">No deductions debited.</div>
                              ) : (
                                deductions.map((ded) => (
                                  <div key={ded.name} className="flex justify-between">
                                    <span className="text-neutral-600 truncate pr-2" title={ded.name}>{ded.name}</span>
                                    <span className="font-mono font-bold text-rose-700 shrink-0">-₱{formatCurrency(ded.amount)}</span>
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
                          className="flex-1 bg-white border-neutral-200 text-neutral-700 rounded-xl text-xs h-9.5 font-medium cursor-pointer"
                          onClick={() => handleExportToExcel(selectedPayslip)}
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 mr-2 text-neutral-500" />
                          Download Excel
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="flex-1 bg-white border-neutral-200 text-neutral-700 rounded-xl text-xs h-9.5 font-medium cursor-pointer"
                          onClick={() => handleExportToPDF(selectedPayslip)}
                        >
                          <Download className="w-3.5 h-3.5 mr-2 text-neutral-500" />
                          Download PDF
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="flex-1 bg-[#355275] border-none text-white hover:bg-blue-900 rounded-xl text-xs h-9.5 font-semibold shadow-sm cursor-pointer"
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
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};
