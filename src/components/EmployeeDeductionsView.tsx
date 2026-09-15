import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  CreditCard, 
  ShieldCheck, 
  Calculator, 
  HelpCircle, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Building2, 
  TrendingDown, 
  PlusCircle, 
  Clock, 
  Calendar, 
  DollarSign, 
  RefreshCw, 
  Download, 
  FileSpreadsheet, 
  Search, 
  ExternalLink,
  ChevronRight,
  Sparkles,
  Layers,
  Send,
  Info
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { formatCurrency, cn } from '../lib/utils';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

interface EmployeeDeductionsViewProps {
  user: any;
  employeeProfile: any;
  latestPayslip: any;
  onBack: () => void;
  onNavigate?: (page: string) => void;
}

export const EmployeeDeductionsView: React.FC<EmployeeDeductionsViewProps> = ({
  user,
  employeeProfile,
  latestPayslip,
  onBack,
  onNavigate
}) => {
  const [activeTab, setActiveTab] = useState<'statutory' | 'loans' | 'simulator' | 'inquiry'>('statutory');
  
  // Loans & recurring deductions state
  const [loans, setLoans] = useState<any[]>([]);
  const [recurringDeductions, setRecurringDeductions] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [loanSearch, setLoanSearch] = useState('');

  // Simulator state
  const [simSalary, setSimSalary] = useState<number>(Number(employeeProfile?.basicSalary || latestPayslip?.basicPay || 35000));
  const [simOvertime, setSimOvertime] = useState<number>(0);
  const [simAllowances, setSimAllowances] = useState<number>(0);
  const [simIncludeSss, setSimIncludeSss] = useState<boolean>(true);
  const [simIncludePhilhealth, setSimIncludePhilhealth] = useState<boolean>(true);
  const [simIncludePagibig, setSimIncludePagibig] = useState<boolean>(true);
  const [simOtherDeductions, setSimOtherDeductions] = useState<number>(0);

  // Inquiry form state
  const [inquiryType, setInquiryType] = useState('Loan Deduction Registration');
  const [inquiryAmount, setInquiryAmount] = useState('');
  const [inquiryRef, setInquiryRef] = useState('');
  const [inquiryNotes, setInquiryNotes] = useState('');
  const [isSubmittingInquiry, setIsSubmittingInquiry] = useState(false);
  const [submittedInquiries, setSubmittedInquiries] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem(`emp_inquiries_${user?.id || 'default'}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const empId = employeeProfile?.id || user?.id;

  const fetchLoansAndDeductions = async () => {
    if (!empId) return;
    setIsLoadingData(true);
    try {
      // Fetch loans
      const loanRes = await fetch(`/api/loans?employeeId=${encodeURIComponent(empId)}`);
      if (loanRes.ok) {
        const loanData = await loanRes.json();
        setLoans(Array.isArray(loanData) ? loanData : []);
      }

      // Fetch recurring deductions
      const dedRes = await fetch(`/api/deductions?employeeId=${encodeURIComponent(empId)}`);
      if (dedRes.ok) {
        const dedData = await dedRes.json();
        setRecurringDeductions(Array.isArray(dedData) ? dedData : []);
      }
    } catch (err) {
      console.warn('Failed to fetch deductions:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    fetchLoansAndDeductions();
  }, [empId]);

  // Handle Inquiry Submit
  const handleInquirySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inquiryNotes.trim()) {
      return toast.error('Please describe your request details or inquiry.');
    }

    setIsSubmittingInquiry(true);
    setTimeout(() => {
      const newInquiry = {
        id: `INQ-${Date.now().toString().slice(-6)}`,
        type: inquiryType,
        amount: inquiryAmount ? Number(inquiryAmount) : null,
        referenceNo: inquiryRef || 'N/A',
        notes: inquiryNotes,
        date: new Date().toISOString(),
        status: 'Under Review by Payroll'
      };

      const updated = [newInquiry, ...submittedInquiries];
      setSubmittedInquiries(updated);
      try {
        localStorage.setItem(`emp_inquiries_${user?.id || 'default'}`, JSON.stringify(updated));
      } catch {}

      toast.success('Inquiry submitted to HR / Payroll office! Reference: ' + newInquiry.id);
      setInquiryNotes('');
      setInquiryAmount('');
      setInquiryRef('');
      setIsSubmittingInquiry(false);
    }, 600);
  };

  // Statutory Calculations for Simulator
  const calculateSimulation = () => {
    const gross = simSalary + simOvertime + simAllowances;

    // SSS / GSIS (approx 9% employee share or standard SSS bracket max ~₱1,350 to ₱1,800 or 9% of basic)
    let sssEmp = 0;
    let sssEmployer = 0;
    if (simIncludeSss) {
      if (employeeProfile?.category === 'Faculty' || employeeProfile?.category === 'Regular') {
        // GSIS Standard 9% employee, 12% government
        sssEmp = simSalary * 0.09;
        sssEmployer = simSalary * 0.12;
      } else {
        // SSS Standard
        sssEmp = Math.min(simSalary * 0.045, 1350);
        sssEmployer = Math.min(simSalary * 0.095, 2850);
      }
    }

    // PhilHealth (5% premium split 50/50, capped at ₱100k salary = ₱2,500 max employee share)
    let phEmp = 0;
    let phEmployer = 0;
    if (simIncludePhilhealth) {
      const cappedSalary = Math.min(Math.max(simSalary, 10000), 100000);
      const totalPh = cappedSalary * 0.05;
      phEmp = totalPh / 2;
      phEmployer = totalPh / 2;
    }

    // Pag-IBIG (₱200 mandatory employee + ₱200 employer)
    let pagibigEmp = 0;
    let pagibigEmployer = 0;
    if (simIncludePagibig) {
      pagibigEmp = 200;
      pagibigEmployer = 200;
    }

    // Taxable Income = Gross - (SSS + PhilHealth + Pag-IBIG)
    const statutorySum = sssEmp + phEmp + pagibigEmp;
    const taxableMonthly = Math.max(0, gross - statutorySum);

    // BIR Withholding Tax (TRAIN Law Monthly Graduated Table)
    let withholdingTax = 0;
    if (taxableMonthly <= 20833.33) {
      withholdingTax = 0;
    } else if (taxableMonthly <= 33333.33) {
      withholdingTax = (taxableMonthly - 20833.33) * 0.15;
    } else if (taxableMonthly <= 66666.67) {
      withholdingTax = 1875 + (taxableMonthly - 33333.33) * 0.20;
    } else if (taxableMonthly <= 166666.67) {
      withholdingTax = 8541.67 + (taxableMonthly - 66666.67) * 0.25;
    } else if (taxableMonthly <= 666666.67) {
      withholdingTax = 33541.67 + (taxableMonthly - 166666.67) * 0.30;
    } else {
      withholdingTax = 183541.67 + (taxableMonthly - 666666.67) * 0.35;
    }

    const totalDeductions = statutorySum + withholdingTax + simOtherDeductions;
    const netTakeHome = Math.max(0, gross - totalDeductions);

    return {
      gross,
      sssEmp,
      sssEmployer,
      phEmp,
      phEmployer,
      pagibigEmp,
      pagibigEmployer,
      statutorySum,
      taxableMonthly,
      withholdingTax,
      totalDeductions,
      netTakeHome
    };
  };

  const simResult = calculateSimulation();

  // Export Loans & Deductions Ledger to Excel
  const handleExportDeductionsExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const rows = [
        ['SOUTHERN LEYTE STATE UNIVERSITY'],
        ['EMPLOYEE DEDUCTIONS & SALARY LOANS LEDGER'],
        [''],
        ['Employee:', `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.displayName],
        ['Employee ID:', employeeProfile?.bpno || 'SLSU-EMP'],
        ['Date Exported:', format(new Date(), 'yyyy-MM-dd HH:mm')],
        [''],
        ['ACTIVE LOANS & AMORTIZATIONS'],
        ['Loan Type', 'Principal Amount (PHP)', 'Total Due (PHP)', 'Monthly Amortization (PHP)', 'Remaining Balance (PHP)', 'Status']
      ];

      loans.forEach(l => {
        rows.push([
          l.loanType || l.type || 'Salary Loan',
          Number(l.principalAmount || 0),
          Number(l.totalAmount || 0),
          Number(l.monthlyAmortization || 0),
          Number(l.remainingBalance || 0),
          l.status || 'Active'
        ]);
      });

      rows.push(['']);
      rows.push(['RECURRING DEDUCTIONS']);
      rows.push(['Deduction Name', 'Amount (PHP)', 'Type']);

      recurringDeductions.forEach(d => {
        rows.push([
          d.name || d.deductionType || 'Deduction',
          Number(d.amount || 0),
          d.type || 'Monthly Fixed'
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Deductions');
      XLSX.writeFile(wb, `Deductions_Ledger_${user?.lastName || 'SLSU'}.xlsx`);
      toast.success('Deduction matrix exported successfully!');
    } catch {
      toast.error('Failed to export deduction records.');
    }
  };

  const filteredLoans = loans.filter(l => 
    (l.loanType || l.type || '').toLowerCase().includes(loanSearch.toLowerCase()) ||
    (l.notes || '').toLowerCase().includes(loanSearch.toLowerCase())
  );

  const totalMonthlyAmortization = loans
    .filter(l => l.status === 'active' || !l.status)
    .reduce((sum, l) => sum + Number(l.monthlyAmortization || 0), 0);

  const totalRemainingLoanBalance = loans
    .filter(l => l.status === 'active' || !l.status)
    .reduce((sum, l) => sum + Number(l.remainingBalance || 0), 0);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Header */}
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
            <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white font-bold flex items-center justify-center text-lg shadow-sm">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-neutral-900 tracking-tight">
                  Deductions & Benefits
                </h2>
                <Badge className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold py-0.5">
                  <ShieldCheck className="w-3 h-3 mr-1 inline" /> Fully Insured
                </Badge>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Statutory agency coverage, monthly salary loan balances, and automated take-home pay computations.
              </p>
            </div>
          </div>
        </div>

        {/* Subview Tabs Control */}
        <div className="flex items-center bg-neutral-100/80 p-1.5 rounded-2xl border border-neutral-200/60 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('statutory')}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
              activeTab === 'statutory'
                ? "bg-white text-neutral-900 shadow-xs"
                : "text-neutral-500 hover:text-neutral-900"
            )}
          >
            <Building2 className="w-4 h-4 text-rose-600" />
            Statutory Coverage
          </button>
          <button
            onClick={() => setActiveTab('loans')}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
              activeTab === 'loans'
                ? "bg-white text-neutral-900 shadow-xs"
                : "text-neutral-500 hover:text-neutral-900"
            )}
          >
            <DollarSign className="w-4 h-4 text-rose-600" />
            Loans & Amortizations
          </button>
          <button
            onClick={() => setActiveTab('simulator')}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
              activeTab === 'simulator'
                ? "bg-white text-neutral-900 shadow-xs"
                : "text-neutral-500 hover:text-neutral-900"
            )}
          >
            <Calculator className="w-4 h-4 text-rose-600" />
            Salary Simulator
          </button>
          <button
            onClick={() => setActiveTab('inquiry')}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
              activeTab === 'inquiry'
                ? "bg-white text-neutral-900 shadow-xs"
                : "text-neutral-500 hover:text-neutral-900"
            )}
          >
            <HelpCircle className="w-4 h-4 text-rose-600" />
            Deduction Help Desk
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm bg-white rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-neutral-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Latest Cycle Deductions</span>
              <TrendingDown className="w-4 h-4 text-rose-600" />
            </div>
            <div className="text-3xl font-black text-rose-600 font-mono">
              ₱{latestPayslip ? formatCurrency(latestPayslip.totalDeductions) : '0.00'}
            </div>
          </div>
          <p className="text-xs text-neutral-400 mt-2">
            {latestPayslip ? `Debited on ${latestPayslip.cycleName}` : 'No active cycle deductions'}
          </p>
        </Card>

        <Card className="border-none shadow-sm bg-white rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-neutral-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Active Monthly Amortization</span>
              <DollarSign className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-3xl font-black text-neutral-900 font-mono">
              ₱{formatCurrency(totalMonthlyAmortization)}
            </div>
          </div>
          <p className="text-xs text-neutral-400 mt-2">Combined recurring loan debits</p>
        </Card>

        <Card className="border-none shadow-sm bg-white rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-neutral-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Remaining Loan Balance</span>
              <CreditCard className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-3xl font-black text-amber-600 font-mono">
              ₱{formatCurrency(totalRemainingLoanBalance)}
            </div>
          </div>
          <p className="text-xs text-neutral-400 mt-2">{loans.length} registered loan accounts</p>
        </Card>

        <Card className="border-none shadow-sm bg-white rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-neutral-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Statutory Status</span>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-emerald-600">
              Compliant
            </div>
          </div>
          <p className="text-xs text-emerald-700 font-medium mt-2">GSIS, PhilHealth, HDMF Active</p>
        </Card>
      </div>

      {/* TAB 1: STATUTORY COVERAGE & AGENCIES */}
      {activeTab === 'statutory' && (
        <div className="space-y-6">
          {/* Statutory 4-Agency Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* SSS / GSIS */}
            <Card className="border border-neutral-100 shadow-sm bg-white rounded-2xl p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                    GSIS
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">Government Service Insurance System</h3>
                    <p className="text-xs text-neutral-500">Retirement, Life, and Disability Pension Program</p>
                  </div>
                </div>
                <Badge className="bg-emerald-50 text-emerald-700 border-none text-[10px] font-bold">
                  Enrolled
                </Badge>
              </div>

              <div className="p-4 bg-neutral-50 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Employee BP / Policy No:</span>
                  <span className="font-mono font-bold text-neutral-900">{employeeProfile?.bpno || '2000189423'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Employee Contribution:</span>
                  <span className="font-mono font-bold text-blue-700">9.0% of Monthly Basic</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Government Employer Share:</span>
                  <span className="font-mono font-bold text-neutral-700">12.0% Government Match</span>
                </div>
              </div>

              <div className="text-xs text-neutral-600 space-y-1.5 pt-1">
                <div className="font-semibold text-neutral-800">Coverage & Benefits:</div>
                <div className="flex items-center gap-2 text-neutral-500">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Life Insurance & Compulsory Retirement Package</span>
                </div>
                <div className="flex items-center gap-2 text-neutral-500">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Disability, Sickness & Survivorship Pension</span>
                </div>
              </div>
            </Card>

            {/* PhilHealth */}
            <Card className="border border-neutral-100 shadow-sm bg-white rounded-2xl p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                    PH
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">Philippine Health Insurance (PhilHealth)</h3>
                    <p className="text-xs text-neutral-500">Universal Health Coverage & Medical Subsidies</p>
                  </div>
                </div>
                <Badge className="bg-emerald-50 text-emerald-700 border-none text-[10px] font-bold">
                  Active
                </Badge>
              </div>

              <div className="p-4 bg-neutral-50 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-500">PhilHealth PIN:</span>
                  <span className="font-mono font-bold text-neutral-900">{employeeProfile?.crn || '12-054928193-4'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Premium Rate (2025/2026):</span>
                  <span className="font-mono font-bold text-emerald-700">5.0% Monthly Total</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Employee Share / Employer Share:</span>
                  <span className="font-mono font-bold text-neutral-700">2.5% Employee / 2.5% State</span>
                </div>
              </div>

              <div className="text-xs text-neutral-600 space-y-1.5 pt-1">
                <div className="font-semibold text-neutral-800">Coverage & Benefits:</div>
                <div className="flex items-center gap-2 text-neutral-500">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Inpatient Hospitalization & Surgical Care Packages</span>
                </div>
                <div className="flex items-center gap-2 text-neutral-500">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Konsulta Plus Outpatient Consultations & Medicines</span>
                </div>
              </div>
            </Card>

            {/* Pag-IBIG HDMF */}
            <Card className="border border-neutral-100 shadow-sm bg-white rounded-2xl p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center font-bold">
                    HDMF
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">Home Development Mutual Fund (Pag-IBIG)</h3>
                    <p className="text-xs text-neutral-500">Provident Savings, Multi-Purpose & Housing Loans</p>
                  </div>
                </div>
                <Badge className="bg-emerald-50 text-emerald-700 border-none text-[10px] font-bold">
                  Enrolled
                </Badge>
              </div>

              <div className="p-4 bg-neutral-50 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Pag-IBIG MID:</span>
                  <span className="font-mono font-bold text-neutral-900">1210-9843-2219</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Mandatory Monthly Savings:</span>
                  <span className="font-mono font-bold text-rose-700">₱200.00 Employee Share</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Employer Counterpart:</span>
                  <span className="font-mono font-bold text-neutral-700">₱200.00 State Counterpart</span>
                </div>
              </div>

              <div className="text-xs text-neutral-600 space-y-1.5 pt-1">
                <div className="font-semibold text-neutral-800">Coverage & Benefits:</div>
                <div className="flex items-center gap-2 text-neutral-500">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Short-Term Multi-Purpose (MPL) & Calamity Loans</span>
                </div>
                <div className="flex items-center gap-2 text-neutral-500">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>End-User Housing Financing & MP2 High-Yield Dividends</span>
                </div>
              </div>
            </Card>

            {/* BIR Withholding Tax */}
            <Card className="border border-neutral-100 shadow-sm bg-white rounded-2xl p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                    BIR
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">Bureau of Internal Revenue (Withholding Tax)</h3>
                    <p className="text-xs text-neutral-500">TRAIN Law Graduated Individual Compensation Tax</p>
                  </div>
                </div>
                <Badge className="bg-blue-50 text-blue-700 border-none text-[10px] font-bold">
                  TRAIN Law
                </Badge>
              </div>

              <div className="p-4 bg-neutral-50 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Tax Exemption Threshold:</span>
                  <span className="font-mono font-bold text-emerald-700">₱250,000 / year (₱20,833 / mo)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Withholding Methodology:</span>
                  <span className="font-mono font-bold text-neutral-800">Cumulative Monthly Bracket</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Annual Return (Form 2316):</span>
                  <span className="font-mono font-bold text-neutral-700">Substituted Filing Eligible</span>
                </div>
              </div>

              <div className="text-xs text-neutral-600 space-y-1.5 pt-1">
                <div className="font-semibold text-neutral-800">Tax Withholding Highlights:</div>
                <div className="flex items-center gap-2 text-neutral-500">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>13th Month Pay & De Minimis benefits exempt up to ₱90,000</span>
                </div>
                <div className="flex items-center gap-2 text-neutral-500">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Automatic year-end tax annualized reconciliation</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Latest Itemized Deductions from Payslip */}
          <Card className="border-none shadow-sm bg-white rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div>
                <h3 className="text-base font-bold text-neutral-900">Latest Cycle Deduction Statement</h3>
                <p className="text-xs text-neutral-500">Itemized withholdings deducted in your most recent disbursement.</p>
              </div>
              {latestPayslip && (
                <span className="text-xs font-mono font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-xl">
                  Total Withheld: -₱{formatCurrency(latestPayslip.totalDeductions)}
                </span>
              )}
            </div>

            {latestPayslip && latestPayslip.deductions && Object.keys(latestPayslip.deductions).length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(latestPayslip.deductions).map(([name, amount]: [string, any]) => (
                  <div key={name} className="p-4 bg-neutral-50 rounded-xl border border-neutral-200/60 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-neutral-800 block">{name}</span>
                      <span className="text-[10px] text-neutral-400">Payroll Withholding</span>
                    </div>
                    <span className="text-sm font-black font-mono text-rose-600">
                      -₱{formatCurrency(amount)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center text-xs text-neutral-400 border border-dashed border-neutral-200 rounded-xl">
                No individual deduction debits found for the latest payroll cycle.
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 2: ACTIVE LOANS & RECURRING DEDUCTIONS */}
      {activeTab === 'loans' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400" />
              <Input 
                placeholder="Search loans..." 
                value={loanSearch}
                onChange={(e) => setLoanSearch(e.target.value)}
                className="pl-9 h-9 text-xs rounded-xl bg-white border-neutral-200 shadow-2xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchLoansAndDeductions}
                disabled={isLoadingData}
                className="text-xs rounded-xl bg-white border-neutral-200 text-neutral-700 shadow-2xs gap-1.5"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isLoadingData && "animate-spin")} /> Refresh
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportDeductionsExcel}
                className="text-xs rounded-xl bg-white border-neutral-200 text-neutral-700 shadow-2xs gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-neutral-500" /> Export Matrix
              </Button>
            </div>
          </div>

          {/* Active Loans Section */}
          <div className="space-y-4">
            <h3 className="text-base font-bold text-neutral-900">Salary Loans & Long-Term Amortizations</h3>

            {filteredLoans.length === 0 ? (
              <Card className="border-none shadow-sm bg-white rounded-2xl p-12 text-center">
                <CreditCard className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-neutral-700">No Active Loans Registered</h4>
                <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
                  You currently have no active GSIS, Pag-IBIG, or emergency salary loans debited from your payroll.
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredLoans.map(loan => {
                  const total = Number(loan.totalAmount || loan.principalAmount || 0);
                  const remaining = Number(loan.remainingBalance !== undefined ? loan.remainingBalance : total);
                  const paid = Math.max(0, total - remaining);
                  const percentPaid = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 100;

                  return (
                    <Card key={loan.id} className="border border-neutral-100 shadow-sm bg-white rounded-2xl p-5 space-y-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-neutral-900">{loan.loanType || loan.type || 'Salary Loan'}</h4>
                            <Badge className={cn(
                              "text-[10px] font-bold border-none",
                              loan.status === 'completed' 
                                ? "bg-emerald-50 text-emerald-700" 
                                : "bg-blue-50 text-blue-700"
                            )}>
                              {loan.status === 'completed' ? 'Fully Settled' : 'Active Amortization'}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-neutral-400 mt-0.5">
                            {loan.notes || 'Official university approved loan amortization'}
                          </p>
                        </div>
                        <span className="text-xs font-mono font-bold text-neutral-900">
                          ₱{formatCurrency(loan.monthlyAmortization)} / mo
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-neutral-400">Repayment Progress</span>
                          <span className="font-bold text-neutral-700">{percentPaid}% Paid</span>
                        </div>
                        <div className="w-full h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-[#355275] rounded-full transition-all duration-500" 
                            style={{ width: `${percentPaid}%` }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-neutral-100 text-center">
                        <div className="p-2 bg-neutral-50 rounded-xl">
                          <span className="text-[9px] uppercase font-bold text-neutral-400 block">Total Principal</span>
                          <span className="text-xs font-bold font-mono text-neutral-800">₱{formatCurrency(total)}</span>
                        </div>
                        <div className="p-2 bg-neutral-50 rounded-xl">
                          <span className="text-[9px] uppercase font-bold text-neutral-400 block">Total Paid</span>
                          <span className="text-xs font-bold font-mono text-emerald-700">₱{formatCurrency(paid)}</span>
                        </div>
                        <div className="p-2 bg-rose-50 rounded-xl">
                          <span className="text-[9px] uppercase font-bold text-rose-500 block">Remaining</span>
                          <span className="text-xs font-bold font-mono text-rose-700">₱{formatCurrency(remaining)}</span>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recurring Club & Association Dues */}
          <Card className="border-none shadow-sm bg-white rounded-2xl p-6 space-y-4">
            <div className="pb-2 border-b border-neutral-100">
              <h3 className="text-sm font-bold text-neutral-900">Monthly Faculty & Staff Association Dues</h3>
              <p className="text-xs text-neutral-500">Recurring institutional membership and cooperative debits.</p>
            </div>

            {recurringDeductions.length === 0 ? (
              <div className="text-xs text-neutral-400 py-6 text-center">
                No recurring club dues or custom institutional deductions registered.
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {recurringDeductions.map((ded, idx) => (
                  <div key={ded.id || idx} className="py-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-600 flex items-center justify-center font-bold">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-neutral-800">{ded.name || ded.deductionType}</div>
                        <div className="text-[10px] text-neutral-400">{ded.type || 'Fixed Deduction'}</div>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-rose-700">
                      -₱{formatCurrency(ded.amount || 0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: SALARY & DEDUCTION SIMULATOR */}
      {activeTab === 'simulator' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls Column */}
          <Card className="lg:col-span-6 border-none shadow-sm bg-white rounded-2xl p-6 space-y-5">
            <div className="pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-rose-600" />
                <h3 className="text-base font-bold text-neutral-900">Take-Home Pay Calculator</h3>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Simulate your net compensation under Philippine Government & TRAIN Law tax formulas.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <Label className="font-bold text-neutral-700">Monthly Basic Salary (PHP)</Label>
                  <span className="font-mono font-bold text-neutral-900">₱{formatCurrency(simSalary)}</span>
                </div>
                <Input 
                  type="number" 
                  value={simSalary || ''}
                  onChange={(e) => setSimSalary(Number(e.target.value) || 0)}
                  className="text-xs rounded-xl bg-neutral-50 border-neutral-200 font-mono"
                  min="0"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-neutral-700">Overtime Pay (PHP)</Label>
                  <Input 
                    type="number" 
                    value={simOvertime || ''}
                    onChange={(e) => setSimOvertime(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="text-xs rounded-xl bg-neutral-50 border-neutral-200 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-neutral-700">Allowances & Honoraria</Label>
                  <Input 
                    type="number" 
                    value={simAllowances || ''}
                    onChange={(e) => setSimAllowances(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="text-xs rounded-xl bg-neutral-50 border-neutral-200 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">Other Loan / Insurance Debits (PHP)</Label>
                <Input 
                  type="number" 
                  value={simOtherDeductions || ''}
                  onChange={(e) => setSimOtherDeductions(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="text-xs rounded-xl bg-neutral-50 border-neutral-200 font-mono"
                />
              </div>

              {/* Statutory Toggles */}
              <div className="pt-2 space-y-2">
                <Label className="text-xs font-bold text-neutral-700 block">Statutory Scheme Inclusions</Label>
                <div className="space-y-2 bg-neutral-50 p-3.5 rounded-xl border border-neutral-200/60">
                  <label className="flex items-center justify-between text-xs text-neutral-800 cursor-pointer">
                    <span>GSIS / SSS Pension Plan</span>
                    <input 
                      type="checkbox" 
                      checked={simIncludeSss}
                      onChange={(e) => setSimIncludeSss(e.target.checked)}
                      className="w-4 h-4 rounded text-rose-600 focus:ring-0 cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between text-xs text-neutral-800 cursor-pointer">
                    <span>PhilHealth Health Insurance (5% split)</span>
                    <input 
                      type="checkbox" 
                      checked={simIncludePhilhealth}
                      onChange={(e) => setSimIncludePhilhealth(e.target.checked)}
                      className="w-4 h-4 rounded text-rose-600 focus:ring-0 cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between text-xs text-neutral-800 cursor-pointer">
                    <span>Pag-IBIG Mutual Savings (₱200/mo)</span>
                    <input 
                      type="checkbox" 
                      checked={simIncludePagibig}
                      onChange={(e) => setSimIncludePagibig(e.target.checked)}
                      className="w-4 h-4 rounded text-rose-600 focus:ring-0 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            </div>
          </Card>

          {/* Results Column */}
          <Card className="lg:col-span-6 border-none shadow-sm bg-gradient-to-br from-neutral-900 to-neutral-800 text-white rounded-2xl p-6 flex flex-col justify-between space-y-6">
            <div>
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-400 font-mono">
                  Computed Output
                </span>
                <Badge className="bg-white/10 text-white border-none text-[10px] font-mono">
                  TRAIN Law Formula
                </Badge>
              </div>

              <div className="mt-6 text-center">
                <p className="text-xs uppercase font-extrabold text-neutral-400 tracking-wider">Estimated Monthly Net Take-Home Pay</p>
                <h2 className="text-4xl sm:text-5xl font-black text-emerald-400 font-mono mt-2 tracking-tight">
                  ₱{formatCurrency(simResult.netTakeHome)}
                </h2>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Gross: ₱{formatCurrency(simResult.gross)} | Total Deductions: -₱{formatCurrency(simResult.totalDeductions)}
                </p>
              </div>

              {/* Itemized Calculation List */}
              <div className="mt-8 space-y-2.5 text-xs">
                <div className="flex justify-between py-1.5 border-b border-white/5">
                  <span className="text-neutral-400">GSIS / SSS Employee Share:</span>
                  <span className="font-mono text-rose-300">-₱{formatCurrency(simResult.sssEmp)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-white/5">
                  <span className="text-neutral-400">PhilHealth Employee Share (2.5%):</span>
                  <span className="font-mono text-rose-300">-₱{formatCurrency(simResult.phEmp)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-white/5">
                  <span className="text-neutral-400">Pag-IBIG Employee Contribution:</span>
                  <span className="font-mono text-rose-300">-₱{formatCurrency(simResult.pagibigEmp)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-white/5">
                  <span className="text-neutral-400">BIR Monthly Withholding Tax:</span>
                  <span className="font-mono text-rose-300">-₱{formatCurrency(simResult.withholdingTax)}</span>
                </div>
                {simOtherDeductions > 0 && (
                  <div className="flex justify-between py-1.5 border-b border-white/5">
                    <span className="text-neutral-400">Other Loans / Debits:</span>
                    <span className="font-mono text-rose-300">-₱{formatCurrency(simOtherDeductions)}</span>
                  </div>
                )}
                <div className="flex justify-between py-1.5 border-t border-white/10 font-bold">
                  <span className="text-emerald-300">Government Employer Counterpart:</span>
                  <span className="font-mono text-emerald-300">+₱{formatCurrency(simResult.sssEmployer + simResult.phEmployer + simResult.pagibigEmployer)}</span>
                </div>
              </div>
            </div>

            <div className="text-[10px] text-neutral-400 bg-white/5 p-3 rounded-xl border border-white/10 flex items-center gap-2">
              <Info className="w-4 h-4 text-neutral-300 shrink-0" />
              <span>Calculations are indicative based on standard Philippine Civil Service Commission and BIR TRAIN compensation guidelines.</span>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 4: DEDUCTION HELP DESK & INQUIRY CENTER */}
      {activeTab === 'inquiry' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Inquiry Form */}
          <Card className="lg:col-span-7 border-none shadow-sm bg-white rounded-2xl p-6">
            <div className="pb-3 mb-5 border-b border-neutral-100">
              <h3 className="text-base font-bold text-neutral-900">Submit Deduction Inquiry or Loan Request</h3>
              <p className="text-xs text-neutral-500">Contact the Payroll Section for loan registrations, tax certificates, or discrepancy audits.</p>
            </div>

            <form onSubmit={handleInquirySubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">Request Type *</Label>
                <select
                  value={inquiryType}
                  onChange={(e) => setInquiryType(e.target.value)}
                  className="w-full h-9 text-xs rounded-xl bg-neutral-50 border border-neutral-200 px-3 text-neutral-800"
                >
                  <option value="Loan Deduction Registration">New Salary Loan Deduction Registration (GSIS / Pag-IBIG / Bank)</option>
                  <option value="Pag-IBIG MP2 Additional Savings">Pag-IBIG MP2 Additional Voluntary Savings</option>
                  <option value="Deduction Discrepancy / Audit">Deduction Discrepancy or Over-deduction Audit</option>
                  <option value="BIR Form 2316 Request">Certificate of Compensation Payment / Tax Withheld (BIR Form 2316)</option>
                  <option value="Net Take-Home Pay Certificate">Certificate of Net Take-Home Pay</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-neutral-700">Monthly Target Amount (if applicable)</Label>
                  <Input 
                    type="number"
                    value={inquiryAmount}
                    onChange={(e) => setInquiryAmount(e.target.value)}
                    placeholder="e.g. 1500.00"
                    className="text-xs rounded-xl bg-neutral-50 border-neutral-200 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-neutral-700">Loan / Reference Account No.</Label>
                  <Input 
                    value={inquiryRef}
                    onChange={(e) => setInquiryRef(e.target.value)}
                    placeholder="e.g. GSIS-PL-99214"
                    className="text-xs rounded-xl bg-neutral-50 border-neutral-200 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-neutral-700">Details & Purpose *</Label>
                <textarea 
                  value={inquiryNotes}
                  onChange={(e) => setInquiryNotes(e.target.value)}
                  rows={4}
                  placeholder="Please state your inquiry, effective month requested, or reference details..."
                  className="w-full text-xs rounded-xl bg-neutral-50 border border-neutral-200 p-3 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={isSubmittingInquiry}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-6 h-10 rounded-xl shadow-xs gap-1.5"
              >
                {isSubmittingInquiry ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Submit Request to Payroll
              </Button>
            </form>
          </Card>

          {/* Submissions Tracker */}
          <Card className="lg:col-span-5 border-none shadow-sm bg-neutral-50 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200/70">
              <h4 className="text-sm font-bold text-neutral-900">Submitted Inquiries Tracker</h4>
              <Badge className="bg-neutral-200 text-neutral-800 border-none text-[10px] font-mono">
                {submittedInquiries.length} Requests
              </Badge>
            </div>

            {submittedInquiries.length === 0 ? (
              <div className="py-12 text-center text-xs text-neutral-400">
                No previous inquiries recorded yet.
              </div>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {submittedInquiries.map((inq) => (
                  <div key={inq.id} className="p-3.5 bg-white rounded-xl border border-neutral-200/70 space-y-2 shadow-2xs">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-xs text-neutral-900">{inq.type}</span>
                      <Badge className="bg-amber-50 text-amber-800 border border-amber-200 text-[9px] font-bold shrink-0">
                        {inq.status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-neutral-500 line-clamp-2">{inq.notes}</p>
                    <div className="flex items-center justify-between text-[10px] text-neutral-400 pt-1 border-t border-neutral-100">
                      <span>Ref: {inq.id}</span>
                      <span>{format(new Date(inq.date), 'MMM dd, yyyy')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
