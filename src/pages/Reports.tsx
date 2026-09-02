import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { 
  TrendingUp, 
  DollarSign, 
  Percent, 
  Layers, 
  Download, 
  RefreshCw, 
  ArrowUpRight, 
  CheckCircle,
  FileSpreadsheet,
  FileText,
  Filter,
  Users,
  Building2,
  Calendar,
  ShieldCheck,
  Landmark,
  PieChart as PieIcon,
  Search,
  Eye,
  CreditCard,
  Briefcase,
  HelpCircle,
  Clock
} from 'lucide-react';

const COLORS = [
  '#0f172a', // slate-900
  '#334155', // slate-700
  '#64748b', // slate-500
  '#0284c7', // sky-600
  '#0d9488', // teal-600
  '#ca8a04', // yellow-600
  '#ea580c', // orange-600
  '#e11d48', // rose-600
  '#7c3aed', // violet-600
  '#9333ea', // purple-600
  '#475569', // slate-600
  '#94a3b8', // slate-400
  '#cbd5e1', // slate-300
  '#16a34a', // green-600
  '#2563eb', // blue-600
  '#4f46e5'  // indigo-600
];

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  
  // Filters
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedCampus, setSelectedCampus] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  
  // View states
  const [activeTab, setActiveTab] = useState<'overview' | 'remittance' | 'ledger' | 'earnings'>('overview');
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [searchLedger, setSearchLedger] = useState<string>('');
  
  // Cycle Inspection Modal
  const [inspectedCycle, setInspectedCycle] = useState<any | null>(null);
  const [inspectedEntries, setInspectedEntries] = useState<any[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      const res = await api.reports.getFinancial({
        year: selectedYear,
        month: selectedMonth,
        campus: selectedCampus,
        category: selectedCategory,
        status: selectedStatus,
      });
      setData(res);
    } catch (error: any) {
      toast.error('Failed to load financial reports: ' + (error.message || error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [selectedYear, selectedMonth, selectedCampus, selectedCategory, selectedStatus]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val || 0);
  };

  // Open cycle inspector
  const handleInspectCycle = async (cycle: any) => {
    setInspectedCycle(cycle);
    setLoadingEntries(true);
    try {
      const entries = await api.payroll.getEntries(cycle.id);
      setInspectedEntries(entries || []);
    } catch (err: any) {
      toast.error('Failed to load batch entries: ' + err.message);
      setInspectedEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  };

  // Export Financial Summary PDF
  const handleExportPDF = () => {
    if (!data) {
      toast.error('No financial data available to export');
      return;
    }

    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      // University Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(24, 24, 27);
      doc.text('SOUTHERN LEYTE STATE UNIVERSITY', pageWidth / 2, 14, { align: 'center' });
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(75, 85, 99);
      doc.text('Office of Financial Management & Payroll Services', pageWidth / 2, 19, { align: 'center' });
      doc.text(`EXECUTIVE FINANCIAL PAYROLL & REMITTANCE AUDIT REPORT`, pageWidth / 2, 24, { align: 'center' });

      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      const filterDesc = `Filter Scope: Campus [${selectedCampus === 'all' ? 'All Campuses' : selectedCampus}] | Year [${selectedYear === 'all' ? 'All Years' : selectedYear}] | Month [${selectedMonth === 'all' ? 'All Months' : selectedMonth}] | Category [${selectedCategory === 'all' ? 'All' : selectedCategory}] | Date Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`;
      doc.text(filterDesc, pageWidth / 2, 29, { align: 'center' });

      // KPI Summary Box
      const summaryY = 34;
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14, summaryY, pageWidth - 28, 22, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);

      const kpiCols = [
        { label: 'TOTAL GROSS PAYROLL', val: formatCurrency(data.summary?.totalGross) },
        { label: 'TOTAL DEDUCTIONS', val: formatCurrency(data.summary?.totalDeductions) },
        { label: 'NET CASH DISBURSED', val: formatCurrency(data.summary?.totalNet) },
        { label: 'GOV / EMPLOYER SHARE', val: formatCurrency(data.summary?.totalEmployerShare) },
        { label: 'TOTAL DISBURSEMENT LIABILITY', val: formatCurrency(data.summary?.totalExpenditure) },
        { label: 'PERSONNEL COVERED', val: `${data.summary?.totalPersonnelCount || 0} Staff / Fac` }
      ];

      const colWidth = (pageWidth - 28) / kpiCols.length;
      kpiCols.forEach((kpi, idx) => {
        const xPos = 14 + (idx * colWidth) + (colWidth / 2);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(kpi.label, xPos, summaryY + 7, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(kpi.val, xPos, summaryY + 15, { align: 'center' });
      });

      // Section 1: Statutory Remittances Table
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text('1. STATUTORY AGENCY REMITTANCES & OBLIGATIONS (PHILHEALTH, GSIS, HDMF, BIR, LOANS)', 14, 62);

      const remittanceRows = (data.statutoryRemittances || []).map((r: any) => [
        r.agency,
        r.accountCode,
        formatCurrency(r.personalShare),
        formatCurrency(r.employerShare),
        formatCurrency(r.loans),
        formatCurrency(r.totalPayable),
        r.status
      ]);

      const totalRemitPersonal = (data.statutoryRemittances || []).reduce((sum: number, r: any) => sum + r.personalShare, 0);
      const totalRemitGov = (data.statutoryRemittances || []).reduce((sum: number, r: any) => sum + r.employerShare, 0);
      const totalRemitLoans = (data.statutoryRemittances || []).reduce((sum: number, r: any) => sum + r.loans, 0);
      const totalRemitGrand = (data.statutoryRemittances || []).reduce((sum: number, r: any) => sum + r.totalPayable, 0);

      remittanceRows.push([
        { content: 'TOTAL STATUTORY REMITTANCES DUE', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: '--', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: formatCurrency(totalRemitPersonal), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: formatCurrency(totalRemitGov), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: formatCurrency(totalRemitLoans), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: formatCurrency(totalRemitGrand), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: 'Reconciled', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }
      ]);

      autoTable(doc, {
        startY: 65,
        head: [['GOVERNMENT / FINANCIAL AGENCY', 'ACCT CODE', 'EMPLOYEE SHARE', 'EMPLOYER SHARE', 'LOANS / MP2', 'TOTAL REMITTANCE', 'STATUS']],
        body: remittanceRows,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
        styles: { fontSize: 6.5, cellPadding: 2 },
        margin: { left: 14, right: 14 },
      });

      // Section 2: Processed Batches / Cycles
      let nextY = (doc as any).lastAutoTable.finalY + 8;
      if (nextY > 165) {
        doc.addPage();
        nextY = 15;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text('2. AUDITED PAYROLL BATCHES & DISBURSEMENT LEDGER', 14, nextY);

      const batchRows = (data.cyclesTrend || []).map((b: any, idx: number) => [
        String(idx + 1),
        b.name,
        b.campus,
        `${b.startDate} to ${b.endDate}`,
        `${b.employeeCount} pax`,
        formatCurrency(b.totalGross),
        formatCurrency(b.totalDeductions),
        formatCurrency(b.totalEmployerShare),
        formatCurrency(b.totalNet),
        b.status.toUpperCase()
      ]);

      autoTable(doc, {
        startY: nextY + 3,
        head: [['#', 'BATCH TITLE', 'CAMPUS', 'PERIOD BOUNDS', 'COVERAGE', 'GROSS PAY', 'DEDUCTIONS', 'GOV SHARE', 'NET PAY', 'STATUS']],
        body: batchRows.length > 0 ? batchRows : [['-', 'No processed batches found for this filter scope', '', '', '', '', '', '', '', '']],
        theme: 'grid',
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
        styles: { fontSize: 6.5, cellPadding: 2 },
        margin: { left: 14, right: 14 },
      });

      // Signatures
      let finalY = (doc as any).lastAutoTable.finalY + 12;
      if (finalY > 170) {
        doc.addPage();
        finalY = 20;
      }

      const sigWidth = 65;
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);

      // Prepared By
      doc.text('Prepared by:', 20, finalY);
      doc.line(20, finalY + 12, 20 + sigWidth, finalY + 12);
      doc.setFont('helvetica', 'bold');
      doc.text('PAYROLL OFFICER / ACCOUNTANT', 20, finalY + 16);
      doc.setFont('helvetica', 'normal');
      doc.text('SLSU Payroll & Remittance Division', 20, finalY + 20);

      // Certified Correct
      doc.text('Certified Correct:', 115, finalY);
      doc.line(115, finalY + 12, 115 + sigWidth, finalY + 12);
      doc.setFont('helvetica', 'bold');
      doc.text('HEAD, ACCOUNTING DEPARTMENT', 115, finalY + 16);
      doc.setFont('helvetica', 'normal');
      doc.text('SLSU Financial Services', 115, finalY + 20);

      // Approved By
      doc.text('Approved for Disbursement:', 210, finalY);
      doc.line(210, finalY + 12, 210 + sigWidth, finalY + 12);
      doc.setFont('helvetica', 'bold');
      doc.text('UNIVERSITY PRESIDENT / VP ADMIN', 210, finalY + 16);
      doc.setFont('helvetica', 'normal');
      doc.text('Southern Leyte State University', 210, finalY + 20);

      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SLSU_Financial_Audit_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Financial Audit Report PDF downloaded successfully');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to generate PDF: ' + err.message);
    }
  };

  // Export Remittance PDF
  const handleExportRemittancePDF = () => {
    if (!data || !data.statutoryRemittances) return;
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(24, 24, 27);
      doc.text('SOUTHERN LEYTE STATE UNIVERSITY', pageWidth / 2, 16, { align: 'center' });
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(75, 85, 99);
      doc.text('OFFICIAL STATUTORY REMITTANCE SCHEDULE & AGENCY LIABILITIES', pageWidth / 2, 22, { align: 'center' });
      doc.text(`Generated: ${format(new Date(), 'MMMM dd, yyyy')} | Campus Scope: ${selectedCampus === 'all' ? 'All Campuses' : selectedCampus}`, pageWidth / 2, 27, { align: 'center' });

      const tableRows = data.statutoryRemittances.map((r: any) => [
        r.agency,
        r.accountCode,
        formatCurrency(r.personalShare),
        formatCurrency(r.employerShare),
        formatCurrency(r.loans),
        formatCurrency(r.totalPayable),
        r.status
      ]);

      const totalGrand = data.statutoryRemittances.reduce((sum: number, r: any) => sum + r.totalPayable, 0);
      tableRows.push([
        { content: 'TOTAL REMITTANCES DUE', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: '--', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: formatCurrency(data.statutoryRemittances.reduce((s: number, r: any) => s + r.personalShare, 0)), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: formatCurrency(data.statutoryRemittances.reduce((s: number, r: any) => s + r.employerShare, 0)), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: formatCurrency(data.statutoryRemittances.reduce((s: number, r: any) => s + r.loans, 0)), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: formatCurrency(totalGrand), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: 'Verified', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }
      ]);

      autoTable(doc, {
        startY: 34,
        head: [['AGENCY NAME', 'CODE', 'PERSONAL', 'GOV SHARE', 'LOANS/MP2', 'TOTAL DUE', 'STATUS']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 8 },
        styles: { fontSize: 7.5, cellPadding: 3 },
        margin: { left: 14, right: 14 },
      });

      const finalY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(8);
      doc.text('Prepared By: Payroll & Remittances Officer', 14, finalY);
      doc.text('Certified by: Chief Accountant', 120, finalY);

      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SLSU_Remittance_Schedule_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Remittance Schedule PDF downloaded');
    } catch (e: any) {
      toast.error('Failed to export Remittance PDF: ' + e.message);
    }
  };

  // Export Ledger CSV
  const handleExportCSV = () => {
    if (!data || !data.cyclesTrend) {
      toast.error('No ledger data to export');
      return;
    }
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Cycle ID,Period Title,Campus,Date Range,Employees Covered,Total Gross Pay,Total Deductions,Employer Share,Total Net Pay,Status\n";
    
    data.cyclesTrend.forEach((c: any) => {
      csvContent += `"${c.id}","${c.name}","${c.campus}","${c.startDate} to ${c.endDate}",${c.employeeCount},${c.totalGross},${c.totalDeductions},${c.totalEmployerShare},${c.totalNet},"${c.status}"\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SLSU_Financial_Payroll_Ledger_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Financial Ledger CSV exported successfully');
  };

  // Export Itemized Statutory Breakdown CSV
  const handleExportStatutoryCSV = () => {
    if (!data || !data.statutoryRemittances) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Agency,Account Code,Description,Personal Share Withheld,Employer Counterpart,Loans / Savings,Total Remittance Due,Status\n";
    
    data.statutoryRemittances.forEach((r: any) => {
      csvContent += `"${r.agency}","${r.accountCode}","${r.description}",${r.personalShare},${r.employerShare},${r.loans},${r.totalPayable},"${r.status}"\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SLSU_Statutory_Remittance_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Statutory Remittance CSV exported');
  };

  // Chart data formatting
  const monthlyExpenseData = useMemo(() => {
    if (!data?.monthlySeries || data.monthlySeries.length === 0) {
      return (data?.cyclesTrend || []).map((c: any) => ({
        name: c.name.length > 18 ? c.name.substring(0, 16) + '...' : c.name,
        Gross: Number(c.totalGross || 0),
        Deductions: Number(c.totalDeductions || 0),
        Net: Number(c.totalNet || 0),
        GovShare: Number(c.totalEmployerShare || 0)
      }));
    }
    return data.monthlySeries.map((m: any) => ({
      name: m.monthName,
      Gross: m.Gross,
      Deductions: m.Deductions,
      Net: m.Net,
      GovShare: m.EmployerShare
    }));
  }, [data]);

  const deductionData = useMemo(() => {
    if (!data?.deductionsBreakdown) return [];
    return Object.entries(data.deductionsBreakdown)
      .map(([key, value]) => ({
        name: key,
        value: Number(value || 0)
      }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [data]);

  const totalDeductionsSum = useMemo(() => {
    return deductionData.reduce((acc, curr) => acc + curr.value, 0);
  }, [deductionData]);

  const categoryData = useMemo(() => {
    return data?.categoryDistribution?.map((cat: any) => ({
      name: cat.name || cat.category || 'Unknown',
      Gross: Number(cat.gross || 0),
      Net: Number(cat.net || 0),
      Deductions: Number(cat.deductions || 0),
      GovShare: Number(cat.employerShare || 0),
      Employees: cat.count || 0
    })) || [];
  }, [data]);

  const campusData = useMemo(() => {
    return data?.campusDistribution?.map((cmp: any) => ({
      name: cmp.campus,
      Gross: Number(cmp.gross || 0),
      Net: Number(cmp.net || 0),
      Employees: cmp.count || 0
    })) || [];
  }, [data]);

  const filteredLedger = useMemo(() => {
    if (!data?.cyclesTrend) return [];
    if (!searchLedger) return data.cyclesTrend;
    const s = searchLedger.toLowerCase();
    return data.cyclesTrend.filter((c: any) => 
      c.name.toLowerCase().includes(s) || 
      c.campus.toLowerCase().includes(s) ||
      c.status.toLowerCase().includes(s)
    );
  }, [data, searchLedger]);

  return (
    <div className="space-y-6 pb-20">
      {/* Header & Action Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Financial Intelligence & Audit Suite</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">Financial Reports & Analytics</h1>
          <p className="text-neutral-500 text-sm mt-0.5">
            Audit compliance, statutory tax remittances, institutional personnel expenditures, and disbursement ledgers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button 
            onClick={fetchReportData} 
            variant="outline" 
            size="sm" 
            disabled={loading}
            className="gap-2 h-9 border-neutral-200 hover:bg-neutral-50 text-neutral-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Reload</span>
          </Button>

          <Button 
            onClick={handleExportCSV} 
            variant="outline" 
            size="sm" 
            className="gap-2 h-9 border-neutral-200 hover:bg-neutral-50 text-neutral-700"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export CSV</span>
          </Button>

          <Button 
            onClick={handleExportPDF} 
            variant="default" 
            size="sm" 
            className="gap-2 h-9 bg-neutral-900 border-neutral-900 hover:bg-neutral-800 text-white shadow-sm"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Print Financial Report (PDF)</span>
          </Button>
        </div>
      </div>

      {/* Global Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-neutral-100 shadow-sm flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 mr-1">
          <Filter className="w-3.5 h-3.5 text-neutral-400" />
          <span>Filters:</span>
        </div>

        {/* Campus Filter */}
        <div className="min-w-[170px]">
          <Select value={selectedCampus} onValueChange={(val: string | null) => setSelectedCampus(val ?? 'all')}>
            <SelectTrigger className="h-8 text-xs bg-neutral-50 border-neutral-200">
              <SelectValue placeholder="All Campuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Campuses</SelectItem>
              <SelectItem value="Main Campus - Sogod">Main Campus - Sogod</SelectItem>
              <SelectItem value="Hinunangan Campus">Hinunangan Campus</SelectItem>
              <SelectItem value="Bontoc Campus">Bontoc Campus</SelectItem>
              <SelectItem value="Tomas Oppus Campus">Tomas Oppus Campus</SelectItem>
              <SelectItem value="San Juan Campus">San Juan Campus</SelectItem>
              <SelectItem value="Maasin City Campus">Maasin City Campus</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Year Filter */}
        <div className="min-w-[110px]">
          <Select value={selectedYear} onValueChange={(val: string | null) => setSelectedYear(val ?? 'all')}>
            <SelectTrigger className="h-8 text-xs bg-neutral-50 border-neutral-200">
              <SelectValue placeholder="All Years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              <SelectItem value="2026">2026</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
              <SelectItem value="2024">2024</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Month Filter */}
        <div className="min-w-[120px]">
          <Select value={selectedMonth} onValueChange={(val: string | null) => setSelectedMonth(val ?? 'all')}>
            <SelectTrigger className="h-8 text-xs bg-neutral-50 border-neutral-200">
              <SelectValue placeholder="All Months" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              <SelectItem value="1">January</SelectItem>
              <SelectItem value="2">February</SelectItem>
              <SelectItem value="3">March</SelectItem>
              <SelectItem value="4">April</SelectItem>
              <SelectItem value="5">May</SelectItem>
              <SelectItem value="6">June</SelectItem>
              <SelectItem value="7">July</SelectItem>
              <SelectItem value="8">August</SelectItem>
              <SelectItem value="9">September</SelectItem>
              <SelectItem value="10">October</SelectItem>
              <SelectItem value="11">November</SelectItem>
              <SelectItem value="12">December</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Category Filter */}
        <div className="min-w-[150px]">
          <Select value={selectedCategory} onValueChange={(val: string | null) => setSelectedCategory(val ?? 'all')}>
            <SelectTrigger className="h-8 text-xs bg-neutral-50 border-neutral-200">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="FACULTY">Regular Faculty</SelectItem>
              <SelectItem value="STAFF">Regular Staff</SelectItem>
              <SelectItem value="Job Order">Job Order</SelectItem>
              <SelectItem value="Visiting Instructor">Visiting Instructor</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status Filter */}
        <div className="min-w-[130px]">
          <Select value={selectedStatus} onValueChange={(val: string | null) => setSelectedStatus(val ?? 'all')}>
            <SelectTrigger className="h-8 text-xs bg-neutral-50 border-neutral-200">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="disbursed">Disbursed</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(selectedCampus !== 'all' || selectedYear !== 'all' || selectedMonth !== 'all' || selectedCategory !== 'all' || selectedStatus !== 'all') && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => {
              setSelectedCampus('all');
              setSelectedYear('all');
              setSelectedMonth('all');
              setSelectedCategory('all');
              setSelectedStatus('all');
            }}
            className="h-8 text-xs text-neutral-500 hover:text-neutral-900"
          >
            Reset Filters
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[350px] gap-3 bg-white rounded-2xl border border-neutral-100 p-12">
          <RefreshCw className="w-8 h-8 text-neutral-400 animate-spin" />
          <p className="text-neutral-600 text-sm font-medium">Aggregating real-time financial metrics & institutional ledgers...</p>
        </div>
      ) : (
        <>
          {/* Top 6 KPI Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {/* Total Institutional Expenditure */}
            <Card className="rounded-2xl border-neutral-100 shadow-sm bg-gradient-to-br from-neutral-900 to-neutral-800 text-white">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Total Expenditure</span>
                  <div className="w-7 h-7 rounded-lg bg-neutral-700/60 flex items-center justify-center text-emerald-400">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-white">{formatCurrency(data?.summary?.totalExpenditure)}</h3>
                  <p className="text-[11px] text-neutral-400 mt-1">Gross Wages + Gov Share</p>
                </div>
              </CardContent>
            </Card>

            {/* Gross Compensation */}
            <Card className="rounded-2xl border-neutral-100 shadow-sm bg-white">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Gross Payroll</span>
                  <div className="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-900">
                    <Briefcase className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-neutral-900">{formatCurrency(data?.summary?.totalGross)}</h3>
                  <p className="text-[11px] text-neutral-500 mt-1">Base wages & allowances</p>
                </div>
              </CardContent>
            </Card>

            {/* Total Deductions & Taxes */}
            <Card className="rounded-2xl border-neutral-100 shadow-sm bg-white">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Total Deductions</span>
                  <span className="text-[10px] text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded">
                    {data?.summary?.totalGross ? ((data.summary.totalDeductions / data.summary.totalGross) * 100).toFixed(1) + '%' : '0%'}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-rose-600">{formatCurrency(data?.summary?.totalDeductions)}</h3>
                  <p className="text-[11px] text-neutral-500 mt-1">Taxes, GSIS, HDMF & Loans</p>
                </div>
              </CardContent>
            </Card>

            {/* Net Released Wages */}
            <Card className="rounded-2xl border-neutral-100 shadow-sm bg-white">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Net Disbursed</span>
                  <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                    {data?.summary?.totalGross ? ((data.summary.totalNet / data.summary.totalGross) * 100).toFixed(1) + '%' : '0%'}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-emerald-600">{formatCurrency(data?.summary?.totalNet)}</h3>
                  <p className="text-[11px] text-neutral-500 mt-1">Take-home pay disbursed</p>
                </div>
              </CardContent>
            </Card>

            {/* Employer / Gov Share */}
            <Card className="rounded-2xl border-neutral-100 shadow-sm bg-white">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Gov / Employer Share</span>
                  <div className="w-7 h-7 rounded-lg bg-sky-50 flex items-center justify-center text-sky-700">
                    <Building2 className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-sky-900">{formatCurrency(data?.summary?.totalEmployerShare)}</h3>
                  <p className="text-[11px] text-neutral-500 mt-1">GSIS 12%, PhilHealth 2.5%, HDMF</p>
                </div>
              </CardContent>
            </Card>

            {/* Personnel & Batches */}
            <Card className="rounded-2xl border-neutral-100 shadow-sm bg-white">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Personnel & Batches</span>
                  <div className="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-900">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-neutral-900">{data?.summary?.totalPersonnelCount || 0} <span className="text-xs font-normal text-neutral-400">pax</span></h3>
                  <p className="text-[11px] text-neutral-500 mt-1">{data?.summary?.totalBatches || 0} Audited Batches</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabbed Navigation */}
          <div className="flex border-b border-neutral-200 gap-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-3 text-sm font-semibold transition-colors relative flex items-center gap-2 ${
                activeTab === 'overview' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>Executive Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('remittance')}
              className={`pb-3 text-sm font-semibold transition-colors relative flex items-center gap-2 ${
                activeTab === 'remittance' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              <Landmark className="w-4 h-4" />
              <span>Statutory Remittances & BIR Tax</span>
              <Badge className="ml-1 bg-neutral-100 text-neutral-700 text-[10px] py-0 px-1.5 border-0">6 Agencies</Badge>
            </button>

            <button
              onClick={() => setActiveTab('ledger')}
              className={`pb-3 text-sm font-semibold transition-colors relative flex items-center gap-2 ${
                activeTab === 'ledger' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Disbursement Batches Ledger</span>
              <Badge className="ml-1 bg-neutral-100 text-neutral-700 text-[10px] py-0 px-1.5 border-0">{data?.cyclesTrend?.length || 0}</Badge>
            </button>

            <button
              onClick={() => setActiveTab('earnings')}
              className={`pb-3 text-sm font-semibold transition-colors relative flex items-center gap-2 ${
                activeTab === 'earnings' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Earnings & Personnel Costs</span>
            </button>
          </div>

          {/* TAB 1: EXECUTIVE OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Primary Time Series & Deductions Donut */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Time series trends chart */}
                <Card className="lg:col-span-2 rounded-2xl border-neutral-100 shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                      <CardTitle className="text-base font-bold flex items-center gap-2 text-neutral-900">
                        <TrendingUp className="w-4 h-4 text-neutral-700" />
                        Wages, Deductions & Employer Cost Trends
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Comparative analysis of Gross Wages, Total Deductions, Disbursed Net Pay, and Government Shares
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setChartType('bar')}
                        className={`h-7 px-2.5 text-xs rounded-md ${chartType === 'bar' ? 'bg-white font-bold shadow-xs text-neutral-900' : 'text-neutral-500'}`}
                      >
                        Bar View
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setChartType('line')}
                        className={`h-7 px-2.5 text-xs rounded-md ${chartType === 'line' ? 'bg-white font-bold shadow-xs text-neutral-900' : 'text-neutral-500'}`}
                      >
                        Line View
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {monthlyExpenseData.length === 0 ? (
                      <div className="py-24 text-center text-neutral-400 text-sm">No payroll data recorded for the selected filter scope.</div>
                    ) : (
                      <div className="h-[320px] w-full mt-2">
                        <ResponsiveContainer width="100%" height="100%">
                          {chartType === 'bar' ? (
                            <BarChart data={monthlyExpenseData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis dataKey="name" fontSize={11} stroke="#94a3b8" tickLine={false} />
                              <YAxis fontSize={11} stroke="#94a3b8" tickLine={false} tickFormatter={(val) => `₱${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`} />
                              <Tooltip 
                                formatter={(val: any) => [formatCurrency(val), '']} 
                                contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                              />
                              <Legend iconSize={8} verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px' }} />
                              <Bar dataKey="Gross" fill="#0f172a" name="Gross Pay" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="Net" fill="#059669" name="Net Disbursed" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="Deductions" fill="#e11d48" name="Deductions & Tax" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="GovShare" fill="#0284c7" name="Gov Counterpart" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          ) : (
                            <LineChart data={monthlyExpenseData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis dataKey="name" fontSize={11} stroke="#94a3b8" tickLine={false} />
                              <YAxis fontSize={11} stroke="#94a3b8" tickLine={false} tickFormatter={(val) => `₱${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`} />
                              <Tooltip 
                                formatter={(val: any) => [formatCurrency(val), '']} 
                                contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                              />
                              <Legend iconSize={8} verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px' }} />
                              <Line type="monotone" dataKey="Gross" stroke="#0f172a" strokeWidth={2.5} name="Gross Pay" dot={{ r: 3 }} />
                              <Line type="monotone" dataKey="Net" stroke="#059669" strokeWidth={2.5} name="Net Disbursed" dot={{ r: 3 }} />
                              <Line type="monotone" dataKey="Deductions" stroke="#e11d48" strokeWidth={2} name="Deductions & Tax" strokeDasharray="4 4" dot={{ r: 3 }} />
                              <Line type="monotone" dataKey="GovShare" stroke="#0284c7" strokeWidth={2} name="Gov Counterpart" dot={{ r: 3 }} />
                            </LineChart>
                          )}
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Statutory Deductions Distribution Pie */}
                <Card className="rounded-2xl border-neutral-100 shadow-sm flex flex-col justify-between">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-bold text-neutral-900">Tax & Deduction Matrix</CardTitle>
                    <CardDescription className="text-xs">Withholding tax, GSIS, HDMF, PhilHealth & amortizations</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center justify-center flex-1">
                    {deductionData.length === 0 ? (
                      <p className="text-center py-20 text-neutral-400 text-sm">No statutory deductions recorded.</p>
                    ) : (
                      <>
                        <div className="h-[200px] w-full relative flex items-center justify-center">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={deductionData}
                                cx="50%"
                                cy="50%"
                                innerRadius={55}
                                outerRadius={80}
                                paddingAngle={3}
                                dataKey="value"
                              >
                                {deductionData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(val: any) => [formatCurrency(val), '']} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute text-center pointer-events-none">
                            <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Total Withheld</p>
                            <p className="text-sm font-bold text-neutral-900">
                              {formatCurrency(totalDeductionsSum)}
                            </p>
                          </div>
                        </div>

                        <div className="w-full mt-3 space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                          {deductionData.map((entry, index) => {
                            const pct = totalDeductionsSum > 0 ? ((entry.value / totalDeductionsSum) * 100).toFixed(1) : '0';
                            return (
                              <div key={entry.name} className="flex items-center justify-between text-xs py-1 border-b border-neutral-50">
                                <div className="flex items-center gap-2 max-w-[170px]">
                                  <span 
                                    className="w-2 h-2 rounded-full shrink-0" 
                                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                  />
                                  <span className="font-medium text-neutral-700 truncate" title={entry.name}>{entry.name}</span>
                                </div>
                                <div className="text-right">
                                  <span className="font-bold text-neutral-900">{formatCurrency(entry.value)}</span>
                                  <span className="text-[10px] text-neutral-400 ml-1.5">({pct}%)</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Category & Campus Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Employment Class Distribution */}
                <Card className="rounded-2xl border-neutral-100 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base font-bold text-neutral-900">Compensation by Employment Category</CardTitle>
                    <CardDescription className="text-xs">Gross pay, deductions, net disbursement, and headcount breakdown</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {categoryData.length === 0 ? (
                      <p className="text-center py-8 text-neutral-400 text-sm">No category distribution data.</p>
                    ) : (
                      categoryData.map((cat: any) => {
                        const totalExpenditure = data?.summary?.totalGross || 1;
                        const shareOfTotal = ((cat.Gross / totalExpenditure) * 100).toFixed(1);
                        const netPercentage = cat.Gross > 0 ? ((cat.Net / cat.Gross) * 100).toFixed(0) : '0';

                        return (
                          <div key={cat.name} className="bg-neutral-50/70 p-3.5 rounded-xl border border-neutral-100 space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-neutral-900">{cat.name}</span>
                                <Badge className="bg-neutral-200 text-neutral-800 text-[10px] py-0 px-2 border-0">
                                  {cat.Employees} Personnel
                                </Badge>
                              </div>
                              <div className="text-right">
                                <span className="font-bold text-neutral-900">{formatCurrency(cat.Gross)}</span>
                                <span className="text-xs text-neutral-400 ml-1.5">({shareOfTotal}% of total)</span>
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-neutral-900 rounded-full" 
                                style={{ width: `${Math.min(100, Math.max(8, Number(shareOfTotal)))}%` }}
                              />
                            </div>

                            <div className="flex items-center justify-between text-xs text-neutral-500 pt-1">
                              <span>Net Pay: <strong className="text-emerald-700">{formatCurrency(cat.Net)}</strong> ({netPercentage}%)</span>
                              <span>Deductions: <strong className="text-rose-700">{formatCurrency(cat.Deductions)}</strong></span>
                              <span>Gov Share: <strong className="text-sky-700">{formatCurrency(cat.GovShare)}</strong></span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>

                {/* Campus Cost Centers */}
                <Card className="rounded-2xl border-neutral-100 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base font-bold text-neutral-900">Campus Cost Allocation</CardTitle>
                    <CardDescription className="text-xs">University branch payroll liabilities and staffing coverage</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {campusData.length === 0 ? (
                      <p className="text-center py-8 text-neutral-400 text-sm">No campus distribution data.</p>
                    ) : (
                      campusData.map((cmp: any, idx: number) => {
                        const totalPayroll = data?.summary?.totalGross || 1;
                        const pct = ((cmp.Gross / totalPayroll) * 100).toFixed(1);

                        return (
                          <div key={cmp.name} className="flex items-center justify-between text-sm py-2 border-b border-neutral-100 last:border-0">
                            <div className="flex items-center gap-3">
                              <div className="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center text-xs font-bold text-neutral-800">
                                {idx + 1}
                              </div>
                              <div>
                                <p className="font-semibold text-neutral-900">{cmp.name}</p>
                                <p className="text-[11px] text-neutral-400">{cmp.Employees} personnel processed</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-neutral-900">{formatCurrency(cmp.Gross)}</p>
                              <p className="text-[11px] text-emerald-600 font-medium">Net: {formatCurrency(cmp.Net)} ({pct}%)</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* TAB 2: STATUTORY REMITTANCES & AGENCY LIABILITIES */}
          {activeTab === 'remittance' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-neutral-100 shadow-sm">
                <div>
                  <h3 className="text-base font-bold text-neutral-900">Statutory Remittance Schedule</h3>
                  <p className="text-xs text-neutral-500">Government contribution liabilities (GSIS, HDMF, PhilHealth, BIR, ECIP) and loan amortizations</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={handleExportStatutoryCSV} variant="outline" size="sm" className="gap-1.5 h-8 text-xs border-neutral-200">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Export Remittance CSV</span>
                  </Button>
                  <Button onClick={handleExportRemittancePDF} variant="default" size="sm" className="gap-1.5 h-8 text-xs bg-neutral-900 text-white">
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Schedule (PDF)</span>
                  </Button>
                </div>
              </div>

              {/* Remittance Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(data?.statutoryRemittances || []).map((agency: any) => (
                  <Card key={agency.agency} className="rounded-2xl border-neutral-100 shadow-sm overflow-hidden flex flex-col justify-between">
                    <div className="p-4 bg-neutral-50/80 border-b border-neutral-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-mono font-bold text-neutral-500 bg-white px-2 py-0.5 rounded border border-neutral-200">
                          {agency.accountCode}
                        </span>
                        <Badge className="bg-emerald-100 text-emerald-800 text-[10px] font-bold border-0">
                          {agency.status}
                        </Badge>
                      </div>
                      <h4 className="font-bold text-sm text-neutral-900 line-clamp-1">{agency.agency}</h4>
                      <p className="text-[11px] text-neutral-500 line-clamp-1 mt-0.5">{agency.description}</p>
                    </div>

                    <CardContent className="p-4 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-500">Employee Share Withheld:</span>
                        <span className="font-semibold text-neutral-800">{formatCurrency(agency.personalShare)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-500">Employer Counterpart Share:</span>
                        <span className="font-semibold text-neutral-800">{formatCurrency(agency.employerShare)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-500">Loans & Amortizations / MP2:</span>
                        <span className="font-semibold text-neutral-800">{formatCurrency(agency.loans)}</span>
                      </div>

                      <div className="pt-2 border-t border-neutral-100 flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-900 uppercase">Total Remittance Due:</span>
                        <span className="text-base font-bold text-neutral-900">{formatCurrency(agency.totalPayable)}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Remittance Detail Table */}
              <Card className="rounded-2xl border-neutral-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-bold text-neutral-900">Comprehensive Remittance Matrix</CardTitle>
                  <CardDescription className="text-xs">Itemized schedule for institutional bank check preparation and BIR/GSIS e-portal filing</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-neutral-200 text-neutral-400 font-semibold uppercase tracking-wider bg-neutral-50/50">
                          <th className="py-3 px-4">Agency Name</th>
                          <th className="py-3 px-3">Account Code</th>
                          <th className="py-3 px-3 text-right">Employee Share</th>
                          <th className="py-3 px-3 text-right">Employer Share</th>
                          <th className="py-3 px-3 text-right">Loans / Savings</th>
                          <th className="py-3 px-4 text-right">Total Payable</th>
                          <th className="py-3 px-4 text-center">Remittance Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {(data?.statutoryRemittances || []).map((r: any) => (
                          <tr key={r.agency} className="hover:bg-neutral-50/50 transition-colors">
                            <td className="py-3 px-4 font-semibold text-neutral-800">{r.agency}</td>
                            <td className="py-3 px-3 font-mono text-neutral-500">{r.accountCode}</td>
                            <td className="py-3 px-3 text-right text-neutral-700">{formatCurrency(r.personalShare)}</td>
                            <td className="py-3 px-3 text-right text-sky-700">{formatCurrency(r.employerShare)}</td>
                            <td className="py-3 px-3 text-right text-neutral-700">{formatCurrency(r.loans)}</td>
                            <td className="py-3 px-4 text-right font-bold text-neutral-900">{formatCurrency(r.totalPayable)}</td>
                            <td className="py-3 px-4 text-center">
                              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                                {r.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-neutral-100/60 font-bold border-t-2 border-neutral-200">
                          <td colSpan={2} className="py-3 px-4 text-neutral-900">GRAND TOTAL REMITTANCE OBLIGATIONS</td>
                          <td className="py-3 px-3 text-right">
                            {formatCurrency((data?.statutoryRemittances || []).reduce((s: number, r: any) => s + r.personalShare, 0))}
                          </td>
                          <td className="py-3 px-3 text-right text-sky-900">
                            {formatCurrency((data?.statutoryRemittances || []).reduce((s: number, r: any) => s + r.employerShare, 0))}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {formatCurrency((data?.statutoryRemittances || []).reduce((s: number, r: any) => s + r.loans, 0))}
                          </td>
                          <td className="py-3 px-4 text-right text-neutral-900 text-sm">
                            {formatCurrency((data?.statutoryRemittances || []).reduce((s: number, r: any) => s + r.totalPayable, 0))}
                          </td>
                          <td className="py-3 px-4 text-center text-emerald-700">Reconciled</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 3: DISBURSEMENT BATCHES LEDGER */}
          {activeTab === 'ledger' && (
            <div className="space-y-6">
              <Card className="rounded-2xl border-neutral-100 shadow-sm">
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
                  <div>
                    <CardTitle className="text-base font-bold text-neutral-900">Audited Payroll Batches Ledger</CardTitle>
                    <CardDescription className="text-xs">Itemized register of all processed payroll cycles, cutoff dates, and disbursement status</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative w-64">
                      <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
                      <Input
                        value={searchLedger}
                        onChange={(e) => setSearchLedger(e.target.value)}
                        placeholder="Search batches, campus, status..."
                        className="h-8 pl-8 text-xs bg-neutral-50 border-neutral-200"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-neutral-200 text-neutral-400 font-semibold uppercase tracking-wider bg-neutral-50/50">
                          <th className="py-3 px-4">Period Title</th>
                          <th className="py-3 px-3">Campus</th>
                          <th className="py-3 px-3">Cutoff Bounds</th>
                          <th className="py-3 px-3 text-center">Employees</th>
                          <th className="py-3 px-3 text-right">Gross Pay</th>
                          <th className="py-3 px-3 text-right">Deductions</th>
                          <th className="py-3 px-3 text-right">Gov Share</th>
                          <th className="py-3 px-3 text-right">Net Released</th>
                          <th className="py-3 px-3 text-center">Status</th>
                          <th className="py-3 px-4 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {filteredLedger.map((c: any) => (
                          <tr key={c.id} className="hover:bg-neutral-50/50 transition-colors">
                            <td className="py-3 px-4 font-bold text-neutral-900">
                              {c.name}
                            </td>
                            <td className="py-3 px-3 text-neutral-600">
                              {c.campus}
                            </td>
                            <td className="py-3 px-3 text-neutral-500 font-mono">
                              {c.startDate ? `${c.startDate} to ${c.endDate}` : 'Unscheduled'}
                            </td>
                            <td className="py-3 px-3 text-center font-medium">
                              <Badge className="bg-neutral-100 text-neutral-800 border-0 text-[10px]">
                                {c.employeeCount} pax
                              </Badge>
                            </td>
                            <td className="py-3 px-3 text-right font-semibold text-neutral-800">{formatCurrency(c.totalGross)}</td>
                            <td className="py-3 px-3 text-right text-rose-600 font-semibold">{formatCurrency(c.totalDeductions)}</td>
                            <td className="py-3 px-3 text-right text-sky-700 font-semibold">{formatCurrency(c.totalEmployerShare)}</td>
                            <td className="py-3 px-3 text-right font-bold text-emerald-600">{formatCurrency(c.totalNet)}</td>
                            <td className="py-3 px-3 text-center">
                              <Badge className={`text-[10px] font-bold uppercase tracking-wider select-none ${
                                c.status === 'disbursed' ? 'bg-emerald-100 text-emerald-800 border-0' :
                                c.status === 'approved' ? 'bg-indigo-100 text-indigo-800 border-0' :
                                c.status === 'rejected' ? 'bg-rose-100 text-rose-800 border-0' :
                                c.status === 'completed' ? 'bg-blue-100 text-blue-800 border-0' :
                                'bg-amber-100 text-amber-800 border-0'
                              }`}>
                                {c.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleInspectCycle(c)}
                                className="h-7 px-2.5 text-xs gap-1 border-neutral-200 hover:bg-neutral-100"
                              >
                                <Eye className="w-3 h-3 text-neutral-500" />
                                <span>Inspect</span>
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {filteredLedger.length === 0 && (
                          <tr>
                            <td colSpan={10} className="py-12 text-center text-neutral-400">
                              No matching payroll batches found in this scope.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 4: EARNINGS & PERSONNEL COSTS */}
          {activeTab === 'earnings' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <Card className="rounded-2xl border-neutral-100 shadow-sm p-4">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Basic Salary</span>
                  <h4 className="text-base font-bold text-neutral-900 mt-1">{formatCurrency(data?.earningsBreakdown?.basicPay)}</h4>
                  <p className="text-[11px] text-neutral-500 mt-0.5">Base compensation</p>
                </Card>

                <Card className="rounded-2xl border-neutral-100 shadow-sm p-4">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">PERA Allowance</span>
                  <h4 className="text-base font-bold text-neutral-900 mt-1">{formatCurrency(data?.earningsBreakdown?.pera)}</h4>
                  <p className="text-[11px] text-neutral-500 mt-0.5">₱2,000 / mo per plantilla</p>
                </Card>

                <Card className="rounded-2xl border-neutral-100 shadow-sm p-4">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Overtime Pay</span>
                  <h4 className="text-base font-bold text-neutral-900 mt-1">{formatCurrency(data?.earningsBreakdown?.overtime)}</h4>
                  <p className="text-[11px] text-neutral-500 mt-0.5">After-hours service</p>
                </Card>

                <Card className="rounded-2xl border-neutral-100 shadow-sm p-4">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Teaching Honoraria</span>
                  <h4 className="text-base font-bold text-neutral-900 mt-1">{formatCurrency(data?.earningsBreakdown?.honoraria)}</h4>
                  <p className="text-[11px] text-neutral-500 mt-0.5">Overload & Visiting hours</p>
                </Card>

                <Card className="rounded-2xl border-neutral-100 shadow-sm p-4">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Bonuses / Incentives</span>
                  <h4 className="text-base font-bold text-neutral-900 mt-1">{formatCurrency(data?.earningsBreakdown?.bonuses)}</h4>
                  <p className="text-[11px] text-neutral-500 mt-0.5">Allowances & increments</p>
                </Card>

                <Card className="rounded-2xl border-neutral-100 shadow-sm p-4">
                  <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Less: Tardiness / Absences</span>
                  <h4 className="text-base font-bold text-rose-600 mt-1">-{formatCurrency(data?.earningsBreakdown?.absences)}</h4>
                  <p className="text-[11px] text-neutral-500 mt-0.5">DTR LWOP deductions</p>
                </Card>
              </div>

              {/* Institutional Remuneration Breakdown Table */}
              <Card className="rounded-2xl border-neutral-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-bold text-neutral-900">Personnel Compensation Matrix</CardTitle>
                  <CardDescription className="text-xs">Detailed audit of university earnings categories and fringe benefits</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-neutral-200 text-neutral-400 font-semibold uppercase tracking-wider bg-neutral-50/50">
                          <th className="py-3 px-4">Remuneration Element</th>
                          <th className="py-3 px-4">Classification</th>
                          <th className="py-3 px-4">Eligibility Rule</th>
                          <th className="py-3 px-4 text-right">Processed Total</th>
                          <th className="py-3 px-4 text-right">Share of Gross</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        <tr>
                          <td className="py-3 px-4 font-bold text-neutral-900">Basic Monthly Salaries & Wages</td>
                          <td className="py-3 px-4 text-neutral-600">Core Remuneration</td>
                          <td className="py-3 px-4 text-neutral-500">All Regular, JO and Contractual staff</td>
                          <td className="py-3 px-4 text-right font-bold">{formatCurrency(data?.earningsBreakdown?.basicPay)}</td>
                          <td className="py-3 px-4 text-right text-neutral-500">
                            {data?.summary?.totalGross ? ((data.earningsBreakdown.basicPay / data.summary.totalGross) * 100).toFixed(1) + '%' : '0%'}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-3 px-4 font-bold text-neutral-900">Personnel Economic Relief Allowance (PERA)</td>
                          <td className="py-3 px-4 text-neutral-600">Standard Allowance</td>
                          <td className="py-3 px-4 text-neutral-500">Plantilla Faculty & Staff (₱2,000 / mo)</td>
                          <td className="py-3 px-4 text-right font-bold">{formatCurrency(data?.earningsBreakdown?.pera)}</td>
                          <td className="py-3 px-4 text-right text-neutral-500">
                            {data?.summary?.totalGross ? ((data.earningsBreakdown.pera / data.summary.totalGross) * 100).toFixed(1) + '%' : '0%'}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-3 px-4 font-bold text-neutral-900">Overtime & Special Services Pay</td>
                          <td className="py-3 px-4 text-neutral-600">Variable Compensation</td>
                          <td className="py-3 px-4 text-neutral-500">Rendered OT hours approved in DTR</td>
                          <td className="py-3 px-4 text-right font-bold">{formatCurrency(data?.earningsBreakdown?.overtime)}</td>
                          <td className="py-3 px-4 text-right text-neutral-500">
                            {data?.summary?.totalGross ? ((data.earningsBreakdown.overtime / data.summary.totalGross) * 100).toFixed(1) + '%' : '0%'}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-3 px-4 font-bold text-neutral-900">Teaching Overload & Visiting Honoraria</td>
                          <td className="py-3 px-4 text-neutral-600">Academic Load</td>
                          <td className="py-3 px-4 text-neutral-500">Units above standard 18-hr load & guest lecturers</td>
                          <td className="py-3 px-4 text-right font-bold">{formatCurrency(data?.earningsBreakdown?.honoraria)}</td>
                          <td className="py-3 px-4 text-right text-neutral-500">
                            {data?.summary?.totalGross ? ((data.earningsBreakdown.honoraria / data.summary.totalGross) * 100).toFixed(1) + '%' : '0%'}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-3 px-4 font-bold text-neutral-900">Bonuses & Other Increments</td>
                          <td className="py-3 px-4 text-neutral-600">Incentives</td>
                          <td className="py-3 px-4 text-neutral-500">Institutional performance allowances</td>
                          <td className="py-3 px-4 text-right font-bold">{formatCurrency(data?.earningsBreakdown?.bonuses)}</td>
                          <td className="py-3 px-4 text-right text-neutral-500">
                            {data?.summary?.totalGross ? ((data.earningsBreakdown.bonuses / data.summary.totalGross) * 100).toFixed(1) + '%' : '0%'}
                          </td>
                        </tr>
                        <tr className="text-rose-600">
                          <td className="py-3 px-4 font-bold">Less: Absences & Tardiness (DTR Deductions)</td>
                          <td className="py-3 px-4">Attendance Penalty</td>
                          <td className="py-3 px-4 text-neutral-500">Leave without pay (LWOP) & late deductions</td>
                          <td className="py-3 px-4 text-right font-bold">-{formatCurrency(data?.earningsBreakdown?.absences)}</td>
                          <td className="py-3 px-4 text-right">--</td>
                        </tr>
                      </tbody>
                      <tfoot>
                        <tr className="bg-neutral-900 text-white font-bold">
                          <td colSpan={3} className="py-3 px-4">NET CUMULATIVE GROSS PAYROLL EXPENDITURE</td>
                          <td className="py-3 px-4 text-right">{formatCurrency(data?.summary?.totalGross)}</td>
                          <td className="py-3 px-4 text-right">100.0%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      {/* Batch Inspection Dialog */}
      <Dialog open={!!inspectedCycle} onOpenChange={(open) => !open && setInspectedCycle(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center justify-between">
              <span>{inspectedCycle?.name}</span>
              <Badge className={`text-xs uppercase ${
                inspectedCycle?.status === 'disbursed' ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-800'
              }`}>
                {inspectedCycle?.status}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Campus: <strong>{inspectedCycle?.campus}</strong> | Period: <strong>{inspectedCycle?.startDate} to {inspectedCycle?.endDate}</strong> | Scope: <strong>{inspectedCycle?.categoryFilter}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            {/* Batch totals overview */}
            <div className="grid grid-cols-4 gap-3 bg-neutral-50 p-3 rounded-xl border border-neutral-100 text-center">
              <div>
                <p className="text-[10px] text-neutral-500 uppercase font-bold">Employees</p>
                <p className="text-sm font-bold text-neutral-900">{inspectedEntries.length} pax</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-500 uppercase font-bold">Gross Pay</p>
                <p className="text-sm font-bold text-neutral-900">{formatCurrency(inspectedCycle?.totalGross)}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-500 uppercase font-bold">Deductions</p>
                <p className="text-sm font-bold text-rose-600">{formatCurrency(inspectedCycle?.totalDeductions)}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-500 uppercase font-bold">Net Disbursed</p>
                <p className="text-sm font-bold text-emerald-600">{formatCurrency(inspectedCycle?.totalNet)}</p>
              </div>
            </div>

            {loadingEntries ? (
              <div className="py-12 text-center text-neutral-400">Loading batch employee entries...</div>
            ) : (
              <div className="overflow-x-auto border border-neutral-100 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50/70 text-neutral-500 font-semibold uppercase">
                      <th className="py-2.5 px-3">Employee Name</th>
                      <th className="py-2.5 px-3">Emp ID</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3 text-right">Basic Pay</th>
                      <th className="py-2.5 px-3 text-right">Gross Pay</th>
                      <th className="py-2.5 px-3 text-right">Deductions</th>
                      <th className="py-2.5 px-3 text-right">Net Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {inspectedEntries.map((e: any) => (
                      <tr key={e.id} className="hover:bg-neutral-50/50">
                        <td className="py-2 px-3 font-semibold text-neutral-800">{e.employeeName}</td>
                        <td className="py-2 px-3 font-mono text-neutral-500">{e.employeeNo || e.employeeId}</td>
                        <td className="py-2 px-3 text-neutral-600">{e.category || 'STAFF'}</td>
                        <td className="py-2 px-3 text-right">{formatCurrency(e.compSal2nd || e.basicPay)}</td>
                        <td className="py-2 px-3 text-right font-semibold">{formatCurrency(e.compGross || e.grossPay)}</td>
                        <td className="py-2 px-3 text-right text-rose-600">{formatCurrency(e.totalDeductions)}</td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-600">{formatCurrency(e.netPay)}</td>
                      </tr>
                    ))}
                    {inspectedEntries.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-neutral-400">No employee records in this batch.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
