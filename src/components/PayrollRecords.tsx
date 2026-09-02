import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatCurrency, cn } from '../lib/utils';
import { toast } from 'sonner';
import { 
  Folder, 
  FolderOpen, 
  Calendar, 
  ChevronDown, 
  ChevronRight, 
  ChevronLeft,
  Search, 
  Plus, 
  Save, 
  FileSpreadsheet, 
  Download, 
  Trash2, 
  Edit2, 
  Eye, 
  CheckCircle2, 
  Database, 
  Layers, 
  FileText, 
  X, 
  ArrowLeft, 
  Filter,
  Loader2,
  Building2,
  Users,
  DollarSign,
  Info,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSXStyle from 'xlsx-js-style';

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function getEmployeeGroupAndGender(entry: any): { group: 'FACULTY' | 'STAFF' | 'OTHERS'; isMale: boolean } {
  const category = (entry.category || entry.group || '').toUpperCase();
  const firstName = (entry.firstName || '').toUpperCase();
  const lastName = (entry.lastName || '').toUpperCase();
  const name = (entry.employeeName || '').toUpperCase();

  // Determine group
  let group: 'FACULTY' | 'STAFF' | 'OTHERS' = 'OTHERS';
  if (category.includes('FACULTY')) {
    group = 'FACULTY';
  } else if (category.includes('STAFF')) {
    group = 'STAFF';
  } else {
    // Fallback based on position
    const pos = (entry.position || '').toUpperCase();
    if (pos.includes('PROFESSOR') || pos.includes('INSTRUCTOR') || pos.includes('ASST') || pos.includes('PROF')) {
      group = 'FACULTY';
    } else if (pos) {
      group = 'STAFF';
    }
  }

  // Determine gender (isMale)
  const femaleLastNames = [
    'AGAD', 'ALMINE', 'BATIANCILA', 'BRUN', 'BUGAIS-PAGOBO', 'CABERTE', 'CAPAPAS', 
    'CARBONILLA', 'CRUZADA', 'CUENCO', 'CUPAT', 'CUTA', 'MARUCOT', 'MEMBREVE', 'NUÑEZ', 
    'PALER', 'PASCUAL', 'RIVERA', 'SABALO', 'SABEJON', 'SUMALJAG', 'TORMIS', 'VILLAMOR'
  ];

  let isMale = true;
  if (entry.gender) {
    isMale = entry.gender.toUpperCase() === 'MALE' || entry.gender.toUpperCase() === 'M';
  } else {
    const matchedFemale = femaleLastNames.some(fn => name.includes(fn) || lastName.includes(fn));
    if (matchedFemale) {
      isMale = false;
    }
  }

  return { group, isMale };
}

function extractEntryDeductions(e: any, basic: number) {
  let deds: any = e.deductions || {};
  if (typeof deds === 'string') {
    try { deds = JSON.parse(deds); } catch { deds = {}; }
  }
  let custom: any = e.customValues || e.custom_values || {};
  if (typeof custom === 'string') {
    try { custom = JSON.parse(custom); } catch { custom = {}; }
  }
  if (e.deductions_json && typeof e.deductions_json === 'string') {
    try {
      const parsed = JSON.parse(e.deductions_json);
      deds = { ...parsed, ...deds };
    } catch {}
  }
  if (e.custom_values_json && typeof e.custom_values_json === 'string') {
    try {
      const parsed = JSON.parse(e.custom_values_json);
      custom = { ...parsed, ...custom };
    } catch {}
  }

  // If deds or e.deductions is an array
  let dedArray: any[] = [];
  if (Array.isArray(deds)) {
    dedArray = deds;
    deds = {};
  } else if (Array.isArray(e.deductions)) {
    dedArray = e.deductions;
  }

  const findInArray = (typeKeywords: string[]): number | undefined => {
    if (!dedArray || dedArray.length === 0) return undefined;
    const match = dedArray.find((item: any) => {
      const itemType = String(item.type || item.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return typeKeywords.some(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === itemType);
    });
    return match ? Number(match.amount || 0) : undefined;
  };

  const getVal = (keys: string[], defaultVal: number = 0): number => {
    // 1. Check custom object
    for (const k of keys) {
      if (custom[k] !== undefined && custom[k] !== null && custom[k] !== '') {
        return Number(custom[k]);
      }
    }
    // 2. Check deds object
    for (const k of keys) {
      if (deds[k] !== undefined && deds[k] !== null && deds[k] !== '') {
        return Number(deds[k]);
      }
    }
    // 3. Check top level e object
    for (const k of keys) {
      if (e[k] !== undefined && e[k] !== null && e[k] !== '') {
        return Number(e[k]);
      }
    }
    // 4. Check array
    const arrVal = findInArray(keys);
    if (arrVal !== undefined) return arrVal;

    return defaultVal;
  };

  const isFacultyOrStaff = e.category === 'FACULTY' || e.category === 'STAFF';

  const policy = getVal(['dedPolicyLoan', 'dedGsisPolicyLoan', 'policyLoan', 'GSIS Policy Loan', 'policy_loan'], 0);
  const consol = getVal(['dedConsolLoan', 'dedGsisConsolLoan', 'consolLoan', 'GSIS Consol Loan', 'consolidation loan', 'consoloan'], 0);
  const mplLite = getVal(['dedMplLite', 'dedGsisMplLite', 'mplLite', 'GSIS MPL Lite', 'mpl_lite'], 0);
  const mpl = getVal(['dedMpl', 'dedGsisMpl', 'mpl', 'GSIS MPL', 'multipurpose loan'], 0);
  const cpl = getVal(['dedCpl', 'dedGsisCpl', 'cpl', 'GSIS CPL', 'computer purchase loan'], 0);
  const gfal = getVal(['dedGfal', 'dedGsisGfal', 'gfal', 'GSIS GFAL'], 0);
  const emerg = getVal(['dedEmergencyLoan', 'dedGsisEmergencyLoan', 'emergencyLoan', 'GSIS Emergency Loan', 'emrgyln'], 0);

  const defaultGsisPers = isFacultyOrStaff ? Math.round(basic * 0.09) : 0;
  const gsisPers = getVal(['dedGsisPremPersonal', 'dedGsisPersonal', 'gsisPersonal', 'gsisPremPersonal', 'GSIS Personal', 'gsisPrem', 'gsispersonal'], defaultGsisPers);

  const educ = getVal(['dedEducAsst', 'dedGsisEducAsst', 'educAsst', 'GSIS Educ Asst', 'educ_asst'], 0);

  const defaultHdmfPers = (isFacultyOrStaff || e.hasPagibig) ? 200 : 0;
  const hdmfPers = getVal(['dedPagibigPersonal', 'dedHdmfPersonal', 'hdmfPersonal', 'pagibigPersonal', 'HDMF Personal', 'pagibigprem', 'pagibigpersonal', 'hdmfPersonalEe'], defaultHdmfPers);

  const hdmfMpl = getVal(['dedPagibigMpl', 'dedHdmfMpl', 'hdmfMpl', 'pagibigMpl', 'HDMF MPL', 'pagibig_mpl'], 0);
  const sss = getVal(['dedSss', 'dedSssCont', 'sssCont', 'sss', 'SSS Cont', 'dedsss'], 0);
  const mp2 = getVal(['dedPagibigMp2', 'dedHdmfMp2', 'hdmfMp2', 'mp2', 'HDMF MP2', 'dedpagibigmp2'], 0);

  const defaultPhCont = (isFacultyOrStaff || e.hasPhilhealth) ? Math.round((basic * 0.05) / 2) : 0;
  const phCont = getVal(['dedPhilhealthCont', 'dedPhilhealth', 'philhealthCont', 'philhealth', 'PhilHealth', 'philhealth_prem', 'phee'], defaultPhCont);

  const csb = getVal(['dedCsbLoan', 'dedCsbSalLoan', 'csbSalLoan', 'csbLoan', 'CSB Sal Loan', 'csb'], 0);
  const tax = getVal(['dedTaxWithheld', 'dedWithholdingTax', 'taxWithheld', 'withholdingTax', 'Withholding Tax', 'wtax'], 0);

  return {
    policy,
    consol,
    mplLite,
    mpl,
    cpl,
    gfal,
    emerg,
    gsisPers,
    educ,
    hdmfPers,
    hdmfMpl,
    sss,
    mp2,
    phCont,
    csb,
    tax
  };
}

interface PayrollRecordsProps {
  onBackToCycles?: () => void;
  cycles?: any[];
  onRefreshCycles?: () => void;
}

export const PayrollRecords: React.FC<PayrollRecordsProps> = ({ onBackToCycles, cycles = [], onRefreshCycles }) => {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYearFilter, setSelectedYearFilter] = useState<string>('all');
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('all');
  
  // Expanded state
  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({});
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  // Dialogs & Modals
  const [selectedRecordForDetails, setSelectedRecordForDetails] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [recordToEdit, setRecordToEdit] = useState<any>(null);
  const [recordToDelete, setRecordToDelete] = useState<any>(null);

  // Formula View Toggles in Sheet
  const [showGsisFormula, setShowGsisFormula] = useState(false);
  const [showPhilhealthFormula, setShowPhilhealthFormula] = useState(false);
  const [showGrossFormula, setShowGrossFormula] = useState(false);
  const [showGsisPersonalFormula, setShowGsisPersonalFormula] = useState(false);
  const [showPagibigPersonalFormula, setShowPagibigPersonalFormula] = useState(false);
  const [showPhilhealthContFormula, setShowPhilhealthContFormula] = useState(false);
  const [showTaxWithheldFormula, setShowTaxWithheldFormula] = useState(false);

  // Full screen & Header view toggles for View Sheet
  const [isSheetFullscreen, setIsSheetFullscreen] = useState(true);
  const [showSheetHeader, setShowSheetHeader] = useState(false);
  const [sheetSearchTerm, setSheetSearchTerm] = useState('');
  const [isTableHovered, setIsTableHovered] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const sheetTableRef = React.useRef<HTMLDivElement>(null);

  const updateScrollButtons = () => {
    const el = sheetTableRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 15);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 15);
  };

  const handleTableScroll = () => {
    updateScrollButtons();
  };

  const scrollTable = (direction: 'left' | 'right') => {
    const el = sheetTableRef.current;
    if (!el) return;
    const scrollAmount = Math.max(350, Math.floor(el.clientWidth * 0.6));
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  // Reset sheet search term and scroll states when modal opens
  useEffect(() => {
    if (selectedRecordForDetails) {
      setSheetSearchTerm('');
      setTimeout(() => {
        updateScrollButtons();
      }, 150);
    }
  }, [selectedRecordForDetails]);

  // ESC key support to exit fullscreen view sheet
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedRecordForDetails) {
        setSelectedRecordForDetails(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRecordForDetails]);

  // Edit Form state
  interface EditFormState {
    title: string;
    year: number;
    month: number;
    periodType: string;
    notes: string;
    status: string;
  }

  const [editForm, setEditForm] = useState<EditFormState>({
    title: '',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    periodType: 'monthly',
    notes: '',
    status: 'saved'
  });

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const data = await api.payroll.listRecords();
      const recList = Array.isArray(data) ? data : (data?.data && Array.isArray(data.data) ? data.data : (data?.records && Array.isArray(data.records) ? data.records : []));
      setRecords(recList);
      
      // Auto-expand current or latest year
      if (recList.length > 0) {
        const years = Array.from(new Set(recList.map((r: any) => r?.year).filter(Boolean))) as number[];
        if (years.length > 0) {
          const maxYear = Math.max(...years);
          setExpandedYears(prev => ({ ...prev, [maxYear]: true }));
          
          // Auto-expand months in max year
          const yearRecords = recList.filter((r: any) => r?.year === maxYear);
          const months = Array.from(new Set(yearRecords.map((r: any) => r?.month).filter(Boolean))) as number[];
          const monthMap: Record<string, boolean> = {};
          months.forEach(m => {
            monthMap[`${maxYear}-${m}`] = true;
          });
          setExpandedMonths(prev => ({ ...prev, ...monthMap }));
        }
      }
    } catch (e: any) {
      toast.error('Failed to load payroll records: ' + (e.message || 'Unknown error'));
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleYear = (year: number) => {
    setExpandedYears(prev => ({ ...prev, [year]: !prev[year] }));
  };

  const toggleMonth = (year: number, month: number) => {
    const key = `${year}-${month}`;
    setExpandedMonths(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleUpdateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordToEdit) return;
    try {
      await api.payroll.updateRecord(recordToEdit.id, editForm);
      toast.success('Payroll Record updated!');
      setIsEditModalOpen(false);
      setRecordToEdit(null);
      fetchRecords();
    } catch (e: any) {
      toast.error('Failed to update record: ' + e.message);
    }
  };

  const handleDeleteRecord = async () => {
    if (!recordToDelete) return;
    try {
      await api.payroll.deleteRecord(recordToDelete.id);
      toast.success('Payroll record deleted');
      setRecordToDelete(null);
      if (selectedRecordForDetails?.id === recordToDelete.id) {
        setSelectedRecordForDetails(null);
      }
      fetchRecords();
    } catch (e: any) {
      toast.error('Failed to delete record: ' + e.message);
    }
  };

  const openEditModal = (rec: any) => {
    setRecordToEdit(rec);
    setEditForm({
      title: rec.title,
      year: rec.year,
      month: rec.month,
      periodType: rec.periodType || 'monthly',
      notes: rec.notes || '',
      status: rec.status || 'saved'
    });
    setIsEditModalOpen(true);
  };

  // Export Excel directly from database record snapshot
  const exportRecordExcel = (record: any) => {
    const entries = record.recordData || [];
    if (entries.length === 0) {
      toast.error('No employee entry data stored in this record snapshot');
      return;
    }

    try {
      const sheetData: any[] = [];
      sheetData.push([`SOUTHERN LEYTE STATE UNIVERSITY - GENERAL PAYROLL RECORD`]);
      sheetData.push([`PERIOD: ${record.monthName.toUpperCase()} ${record.year} (${record.periodType.toUpperCase()})`]);
      sheetData.push([`TITLE: ${record.title}`]);
      sheetData.push([]);

      // Headers
      const headers = [
        'No.', 'Employee Name', 'Position', 'Emp No.',
        'GSIS Gov', 'HDMF Gov', 'PhilHealth Gov', 'ECIP',
        'Basic Pay', 'PERA', 'Gross Pay', 'ABS',
        'Policy Loan', 'Consol Loan', 'MPL Lite', 'MPL', 'CPL', 'GFAL', 'Emergency Loan', 'GSIS Personal', 'Educ Asst', 'HDMF Personal', 'HDMF MPL', 'SSS Cont', 'MP2', 'PhilHealth Cont', 'CSB Loan', 'Withholding Tax',
        'Total Deductions', 'Net Pay Due', '1st Half', '2nd Half'
      ];
      sheetData.push(headers);

      entries.forEach((e: any, idx: number) => {
        const basic = Number(e.basicPay || e.salariesAndWages || 0);
        const pera = Number(e.pera || e.compPera || 0);
        const gross = Number(e.grossPay || e.compGross || (basic + pera));
        const abs = Number(e.abs || 0);

        const gsisGov = Number(e.compGsisGov || e.gsisPrem || Math.round(basic * 0.12));
        const hdmfGov = Number(e.compHdmfGov || e.hdmfPrem || 200);
        const phGov = Number(e.compPhilhealthGov || e.philhealthEs || Math.round((basic * 0.05) / 2));
        const ecip = Number(e.compEcip || e.ecip || 100);

        const {
          policy, consol, mplLite, mpl, cpl, gfal, emerg,
          gsisPers, educ, hdmfPers, hdmfMpl, sss, mp2, phCont, csb, tax
        } = extractEntryDeductions(e, basic);

        const ded = Number(e.totalDeductions || (policy + consol + mplLite + mpl + cpl + gfal + emerg + gsisPers + educ + hdmfPers + hdmfMpl + sss + mp2 + phCont + csb + tax));
        const net = Number(e.netPay || (gross - ded));
        const half1 = Math.floor(net / 2);
        const half2 = net - half1;

        sheetData.push([
          idx + 1,
          e.employeeName || 'N/A',
          e.position || 'Staff',
          e.employeeId || e.employeeNo || 'N/A',
          gsisGov, hdmfGov, phGov, ecip,
          basic, pera, gross, abs,
          policy, consol, mplLite, mpl, cpl, gfal, emerg, gsisPers, educ, hdmfPers, hdmfMpl, sss, mp2, phCont, csb, tax,
          ded, net, half1, half2
        ]);
      });

      // Total row
      const totGross = entries.reduce((s: number, e: any) => s + Number(e.grossPay || e.compGross || (Number(e.basicPay || 0) + Number(e.pera || 0))), 0);
      const totDed = entries.reduce((s: number, e: any) => {
        const basic = Number(e.basicPay || e.salariesAndWages || 0);
        const { policy, consol, mplLite, mpl, cpl, gfal, emerg, gsisPers, educ, hdmfPers, hdmfMpl, sss, mp2, phCont, csb, tax } = extractEntryDeductions(e, basic);
        return s + Number(e.totalDeductions || (policy + consol + mplLite + mpl + cpl + gfal + emerg + gsisPers + educ + hdmfPers + hdmfMpl + sss + mp2 + phCont + csb + tax));
      }, 0);
      const totNet = totGross - totDed;
      const totHalf1 = Math.floor(totNet / 2);
      const totHalf2 = totNet - totHalf1;

      sheetData.push(['TOTALS', '', '', '', '', '', '', '', '', '', totGross, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', totDed, totNet, totHalf1, totHalf2]);

      const worksheet = XLSXStyle.utils.aoa_to_sheet(sheetData);
      const workbook = XLSXStyle.utils.book_new();
      XLSXStyle.utils.book_append_sheet(workbook, worksheet, 'Payroll Record');
      XLSXStyle.writeFile(workbook, `Payroll_Record_${record.year}_${record.monthName}_${record.title.replace(/[^a-z0-9]/gi, '_')}.xlsx`);
      toast.success('Excel export generated successfully');
    } catch (err: any) {
      toast.error('Excel export failed: ' + err.message);
    }
  };

  const safeRecords = Array.isArray(records) ? records : [];

  // Filter records based on search and dropdowns
  const filteredRecords = safeRecords.filter(r => {
    if (!r) return false;
    const title = (r.title || '').toString();
    const monthName = (r.monthName || '').toString();
    const notes = (r.notes || '').toString();
    const matchesSearch = !searchQuery || 
      title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      monthName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      notes.toLowerCase().includes(searchQuery.toLowerCase());
      
    const matchesYear = selectedYearFilter === 'all' || (r.year && r.year.toString() === selectedYearFilter);
    const matchesMonth = selectedMonthFilter === 'all' || (r.month && r.month.toString() === selectedMonthFilter);

    return matchesSearch && matchesYear && matchesMonth;
  });

  // Group filtered records: Year -> Month
  const availableYears = Array.from(new Set(safeRecords.map(r => r?.year).filter(Boolean))).sort((a: any, b: any) => b - a);

  const recordsByYear: Record<number, Record<number, any[]>> = {};
  filteredRecords.forEach(r => {
    if (!recordsByYear[r.year]) recordsByYear[r.year] = {};
    if (!recordsByYear[r.year][r.month]) recordsByYear[r.year][r.month] = [];
    recordsByYear[r.year][r.month].push(r);
  });

  const sortedYears = Object.keys(recordsByYear).map(Number).sort((a, b) => b - a);

  // Overall statistics
  const totalNetAllRecords = filteredRecords.reduce((s, r) => s + Number(r.totalNet || 0), 0);
  const totalEmployeesRecorded = filteredRecords.reduce((s, r) => s + Number(r.totalEmployees || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Banner & Header Controls */}
      <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden border border-blue-900/40">
        <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
          <Database className="w-80 h-80 text-blue-300" />
        </div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-blue-500/20 text-blue-300 border-blue-400/30 text-xs px-2.5 py-0.5 font-mono">
                DATABASE RECORDS
              </Badge>
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30 text-xs px-2.5 py-0.5">
                BY YEAR & BY MONTH
              </Badge>
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <Database className="w-8 h-8 text-blue-400" />
              Payroll Records Hub
            </h2>
            <p className="text-blue-200/80 text-sm mt-1 max-w-2xl">
              Archived & official disburse records organized chronologically by Year and Month. Saved directly into persistent database storage.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30 text-xs px-3 py-1 flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              AUTO-SAVED IN DATABASE
            </Badge>
          </div>
        </div>

        {/* Aggregate Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-6 border-t border-blue-800/50">
          <div className="bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10">
            <span className="text-xs text-blue-300 font-medium block">Total Saved Records</span>
            <span className="text-2xl font-black text-white">{filteredRecords.length}</span>
          </div>
          <div className="bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10">
            <span className="text-xs text-blue-300 font-medium block">Total Years Recorded</span>
            <span className="text-2xl font-black text-white">{sortedYears.length}</span>
          </div>
          <div className="bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10">
            <span className="text-xs text-emerald-300 font-medium block">Total Disbursed Net Pay</span>
            <span className="text-xl font-black text-emerald-400">₱{formatCurrency(totalNetAllRecords)}</span>
          </div>
          <div className="bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10">
            <span className="text-xs text-blue-300 font-medium block">Recorded Payout Entries</span>
            <span className="text-2xl font-black text-white">{totalEmployeesRecorded}</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <Input 
            placeholder="Search record title, notes, month..." 
            className="pl-9 h-9 bg-neutral-50/50 border-neutral-200 text-xs"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-neutral-500 font-medium whitespace-nowrap">
            <Filter className="w-3.5 h-3.5 text-neutral-400" /> Filter:
          </div>
          
          <Select value={selectedYearFilter} onValueChange={(val: string | null) => setSelectedYearFilter(val ?? 'all')}>
            <SelectTrigger className="w-[130px] h-9 text-xs bg-white">
              <SelectValue placeholder="All Years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {availableYears.map(y => (
                <SelectItem key={y} value={y.toString()}>{y} Records</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedMonthFilter} onValueChange={(val: string | null) => setSelectedMonthFilter(val ?? 'all')}>
            <SelectTrigger className="w-[140px] h-9 text-xs bg-white">
              <SelectValue placeholder="All Months" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {MONTH_NAMES.map((m, idx) => (
                <SelectItem key={m} value={(idx + 1).toString()}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(searchQuery || selectedYearFilter !== 'all' || selectedMonthFilter !== 'all') && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-9 text-xs text-neutral-500"
              onClick={() => {
                setSearchQuery('');
                setSelectedYearFilter('all');
                setSelectedMonthFilter('all');
              }}
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Main Hierarchical Tree View: BY YEAR -> BY MONTH */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 bg-white rounded-2xl border border-neutral-200 text-neutral-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-600" />
          <p className="text-sm font-medium text-neutral-600">Loading payroll database records...</p>
        </div>
      ) : sortedYears.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-neutral-300">
          <Database className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-neutral-800">No Payroll Records Found</h3>
          <p className="text-sm text-neutral-500 mt-1 max-w-md mx-auto">
            There are no saved payroll records in the database matching your filters. Active and processed payroll cycles are automatically synced and saved into the database.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedYears.map(year => {
            const monthsInYear = recordsByYear[year];
            const sortedMonthNums = Object.keys(monthsInYear).map(Number).sort((a, b) => b - a);
            const isYearExpanded = expandedYears[year] ?? true;

            // Compute year aggregates
            const yearRecordsList = Object.values(monthsInYear).flat();
            const yearTotNet = yearRecordsList.reduce((s, r) => s + Number(r.totalNet || 0), 0);
            const yearTotGross = yearRecordsList.reduce((s, r) => s + Number(r.totalGross || 0), 0);
            const yearTotEmps = yearRecordsList.reduce((s, r) => s + Number(r.totalEmployees || 0), 0);

            return (
              <div 
                key={year} 
                className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden transition-all duration-200"
              >
                {/* YEAR HEADER CARD */}
                <div 
                  onClick={() => toggleYear(year)}
                  className="p-4 bg-gradient-to-r from-slate-900 via-neutral-900 to-slate-800 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-800 select-none transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-400/30">
                      {isYearExpanded ? <FolderOpen className="w-5 h-5" /> : <Folder className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-black tracking-tight text-white">Year {year}</span>
                        <Badge className="bg-blue-600 text-white text-[11px] px-2 py-0.5">
                          {yearRecordsList.length} {yearRecordsList.length === 1 ? 'Record' : 'Records'}
                        </Badge>
                      </div>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        {sortedMonthNums.length} {sortedMonthNums.length === 1 ? 'Month' : 'Months'} active in {year}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                      <span className="text-[10px] text-neutral-400 uppercase tracking-wider block font-medium">Annual Net Payout</span>
                      <span className="text-lg font-bold text-emerald-400 font-mono">₱{formatCurrency(yearTotNet)}</span>
                    </div>

                    <div className="text-right hidden md:block">
                      <span className="text-[10px] text-neutral-400 uppercase tracking-wider block font-medium">Annual Gross Earned</span>
                      <span className="text-sm font-semibold text-neutral-200 font-mono">₱{formatCurrency(yearTotGross)}</span>
                    </div>

                    <div className="p-1.5 rounded-lg bg-white/10 text-neutral-300">
                      {isYearExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    </div>
                  </div>
                </div>

                {/* MONTHS CONTAINER INSIDE YEAR */}
                {isYearExpanded && (
                  <div className="p-4 bg-neutral-50/50 space-y-4 border-t border-neutral-200">
                    {sortedMonthNums.map(monthNum => {
                      const monthName = MONTH_NAMES[monthNum - 1] || `Month ${monthNum}`;
                      const monthRecords = monthsInYear[monthNum];
                      const monthKey = `${year}-${monthNum}`;
                      const isMonthExpanded = expandedMonths[monthKey] ?? true;

                      const monthTotNet = monthRecords.reduce((s, r) => s + Number(r.totalNet || 0), 0);
                      const monthTotGross = monthRecords.reduce((s, r) => s + Number(r.totalGross || 0), 0);

                      return (
                        <div 
                          key={monthKey} 
                          className="bg-white rounded-xl border border-neutral-200/80 shadow-2xs overflow-hidden"
                        >
                          {/* MONTH HEADER */}
                          <div 
                            onClick={() => toggleMonth(year, monthNum)}
                            className="p-3.5 bg-neutral-100/80 hover:bg-neutral-200/60 border-b border-neutral-200 flex items-center justify-between cursor-pointer select-none transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-1.5 bg-blue-100 text-blue-800 rounded-lg font-bold text-xs">
                                <Calendar className="w-4 h-4" />
                              </div>
                              <div>
                                <h4 className="text-base font-extrabold text-neutral-900 flex items-center gap-2">
                                  {monthName} {year}
                                  <span className="text-xs font-semibold text-neutral-500 bg-white px-2 py-0.5 rounded-full border border-neutral-200">
                                    {monthRecords.length} {monthRecords.length === 1 ? 'entry' : 'entries'}
                                  </span>
                                </h4>
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider block">Month Total Net</span>
                                <span className="text-sm font-extrabold text-emerald-700 font-mono">₱{formatCurrency(monthTotNet)}</span>
                              </div>
                              
                              <div className="p-1 text-neutral-400">
                                {isMonthExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </div>
                            </div>
                          </div>

                          {/* MONTH INDIVIDUAL RECORDS LIST */}
                          {isMonthExpanded && (
                            <div className="divide-y divide-neutral-100 p-2">
                              {monthRecords.map(rec => (
                                <div 
                                  key={rec.id}
                                  className="p-3.5 hover:bg-blue-50/30 rounded-lg transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                      <h5 className="text-sm font-bold text-neutral-900">{rec.title}</h5>
                                      <Badge variant="outline" className="text-[10px] bg-neutral-50 text-neutral-600 font-medium capitalize">
                                        {rec.periodType || 'Monthly'}
                                      </Badge>
                                      {rec.status === 'disbursed' ? (
                                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-bold">
                                          Disbursed
                                        </Badge>
                                      ) : (
                                        <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] font-bold">
                                          Saved Record
                                        </Badge>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-4 text-xs text-neutral-500 flex-wrap">
                                      <span className="flex items-center gap-1 text-neutral-600">
                                        <Users className="w-3.5 h-3.5 text-neutral-400" />
                                        {rec.totalEmployees || (rec.recordData ? rec.recordData.length : 0)} Employees
                                      </span>
                                      <span>•</span>
                                      <span>Gross: <strong className="text-neutral-700 font-mono">₱{formatCurrency(rec.totalGross)}</strong></span>
                                      <span>•</span>
                                      <span>Deductions: <strong className="text-rose-700 font-mono">₱{formatCurrency(rec.totalDeductions)}</strong></span>
                                      {rec.notes && (
                                        <>
                                          <span>•</span>
                                          <span className="italic text-neutral-400 truncate max-w-xs">{rec.notes}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 pt-2 md:pt-0">
                                    <div className="text-right mr-2">
                                      <span className="text-[10px] text-neutral-400 uppercase font-bold block">Net Amount</span>
                                      <span className="text-base font-extrabold text-neutral-900 font-mono">₱{formatCurrency(rec.totalNet)}</span>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      <Button 
                                        size="sm"
                                        variant="outline"
                                        className="h-8 text-xs gap-1.5 bg-white border-neutral-200 hover:bg-neutral-100 text-neutral-800 font-semibold"
                                        onClick={() => setSelectedRecordForDetails(rec)}
                                      >
                                        <Eye className="w-3.5 h-3.5 text-blue-600" />
                                        View Sheet
                                      </Button>

                                      <Button 
                                        size="sm"
                                        variant="outline"
                                        className="h-8 w-8 p-0 text-neutral-600 hover:text-emerald-700 hover:bg-emerald-50"
                                        title="Export Excel"
                                        onClick={() => exportRecordExcel(rec)}
                                      >
                                        <FileSpreadsheet className="w-3.5 h-3.5" />
                                      </Button>

                                      <Button 
                                        size="sm"
                                        variant="outline"
                                        className="h-8 w-8 p-0 text-neutral-600 hover:text-blue-600 hover:bg-blue-50"
                                        title="Edit Record Info"
                                        onClick={() => openEditModal(rec)}
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </Button>

                                      <Button 
                                        size="sm"
                                        variant="outline"
                                        className="h-8 w-8 p-0 text-neutral-400 hover:text-red-600 hover:bg-red-50"
                                        title="Delete Record"
                                        onClick={() => setRecordToDelete(rec)}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* DIALOG 1: VIEW FULL RECORD PAYROLL SHEET */}
      <Dialog open={!!selectedRecordForDetails} onOpenChange={(open) => !open && setSelectedRecordForDetails(null)}>
        <DialogContent 
          showCloseButton={false}
          className="fixed inset-0 top-0 left-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none max-h-none sm:max-w-none rounded-none p-3 sm:p-4 flex flex-col overflow-hidden bg-neutral-900 border-none z-50 m-0 shadow-none text-neutral-900"
        >
          {selectedRecordForDetails && (
            <div className="flex-1 overflow-hidden flex flex-col h-full min-h-0">
              {/* Fullscreen Top Bar - Identical to Payroll Cycle Fullscreen */}
              <div className="px-4 py-3 bg-neutral-900 text-white rounded-lg shadow-sm flex items-center justify-between gap-4 shrink-0 mb-2.5 border border-neutral-800">
                <div className="flex items-center gap-4 flex-1 max-w-2xl">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                    <Input 
                      placeholder="Search employee name, ID or position in this record..." 
                      className="pl-11 h-10 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-400 text-sm focus-visible:ring-neutral-400 font-sans"
                      value={sheetSearchTerm}
                      onChange={e => setSheetSearchTerm(e.target.value)}
                      autoFocus
                    />
                    {sheetSearchTerm && (
                      <button 
                        onClick={() => setSheetSearchTerm('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white text-sm font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="text-sm text-neutral-200 font-medium whitespace-nowrap hidden sm:block">
                    <span className="font-bold text-white text-base">
                      {(selectedRecordForDetails.recordData || []).filter((e: any) => {
                        if (!sheetSearchTerm) return true;
                        const q = sheetSearchTerm.toLowerCase();
                        const name = (e.employeeName || '').toLowerCase();
                        const pos = (e.position || e.category || '').toLowerCase();
                        const id = (e.employeeNo || e.friendlyEmployeeId || e.employeeId || e.employeeNumber || '').toLowerCase();
                        return name.includes(q) || pos.includes(q) || id.includes(q);
                      }).length}
                    </span> of {(selectedRecordForDetails.recordData || []).length} Employees
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="hidden lg:flex items-center gap-2 mr-2">
                    <Badge className="bg-blue-600/90 text-white text-xs px-2.5 py-1 font-semibold border-blue-500">
                      {selectedRecordForDetails.monthName} {selectedRecordForDetails.year} ({selectedRecordForDetails.periodType || 'Monthly'})
                    </Badge>
                  </div>

                  <Button 
                    size="default"
                    className="gap-2 h-10 px-4 bg-emerald-700 hover:bg-emerald-600 text-white font-sans shadow-sm font-semibold text-sm transition-colors cursor-pointer border border-emerald-600"
                    onClick={() => exportRecordExcel(selectedRecordForDetails)}
                    title="Export Record to Excel"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span className="hidden sm:inline">Export Excel</span>
                  </Button>

                  <Button 
                    variant="outline" 
                    size="default" 
                    onClick={() => setSelectedRecordForDetails(null)} 
                    className="gap-2 h-10 px-4 bg-red-600 hover:bg-red-700 text-white border-red-500 hover:border-red-600 font-sans shadow-sm font-semibold text-sm transition-colors cursor-pointer"
                    title="Exit Fullscreen (ESC)"
                  >
                    <Minimize2 className="w-4 h-4" />
                    <span>Exit Fullscreen</span>
                    <kbd className="hidden sm:inline-block text-[10px] bg-red-800/80 text-white px-2 py-0.5 rounded font-mono border border-red-700/50">ESC</kbd>
                  </Button>
                </div>
              </div>

              {/* Spreadsheet Table with Floating Scroll Buttons */}
              {(() => {
                const rawData = selectedRecordForDetails.recordData || [];
                const filteredData = rawData.filter((e: any) => {
                  if (!sheetSearchTerm) return true;
                  const q = sheetSearchTerm.toLowerCase();
                  const name = (e.employeeName || '').toLowerCase();
                  const pos = (e.position || e.category || '').toLowerCase();
                  const id = (e.employeeNo || e.friendlyEmployeeId || e.employeeId || e.employeeNumber || '').toLowerCase();
                  return name.includes(q) || pos.includes(q) || id.includes(q);
                });

                const facultyMale: any[] = [];
                const facultyFemale: any[] = [];
                const staffMale: any[] = [];
                const staffFemale: any[] = [];
                const others: any[] = [];

                for (const entry of filteredData) {
                  const info = getEmployeeGroupAndGender(entry);
                  if (info.group === 'FACULTY') {
                    if (info.isMale) facultyMale.push(entry);
                    else facultyFemale.push(entry);
                  } else if (info.group === 'STAFF') {
                    if (info.isMale) staffMale.push(entry);
                    else staffFemale.push(entry);
                  } else {
                    others.push(entry);
                  }
                }

                const sortByName = (a: any, b: any) => {
                  return (a.employeeName || '').localeCompare(b.employeeName || '');
                };

                facultyMale.sort(sortByName);
                facultyFemale.sort(sortByName);
                staffMale.sort(sortByName);
                staffFemale.sort(sortByName);
                others.sort(sortByName);

                const sections = [
                  { label: 'FACULTY: MALE', entries: facultyMale, isGenderSub: false },
                  { label: 'Female:', entries: facultyFemale, isGenderSub: true },
                  { label: 'STAFF: MALE', entries: staffMale, isGenderSub: false },
                  { label: 'Female:', entries: staffFemale, isGenderSub: true },
                  { label: 'OTHERS', entries: others, isGenderSub: false }
                ].filter(sect => sect.entries.length > 0);

                let globalIdx = 0;
                let sumBasic = 0, sumPera = 0, sumGross = 0, sumAbs = 0;
                let sumGsisGov = 0, sumHdmfGov = 0, sumPhGov = 0, sumEcip = 0;
                let sumPolicy = 0, sumConsol = 0, sumMplLite = 0, sumMpl = 0, sumCpl = 0, sumGfal = 0, sumEmerg = 0;
                let sumGsisPers = 0, sumEduc = 0, sumHdmfPers = 0, sumHdmfMpl = 0, sumSss = 0, sumMp2 = 0;
                let sumPhCont = 0, sumCsb = 0, sumTax = 0, sumTotalDed = 0, sumNet = 0, sumHalf1 = 0, sumHalf2 = 0;

                return (
                  <div 
                    className="relative flex-1 min-h-0 flex flex-col group/table"
                    onMouseEnter={() => setIsTableHovered(true)}
                    onMouseLeave={() => setIsTableHovered(false)}
                  >
                    {/* Floating Left Scroll Arrow */}
                    <button
                      type="button"
                      onClick={() => scrollTable('left')}
                      disabled={!canScrollLeft}
                      className={cn(
                        "absolute left-2 sm:left-[288px] top-1/2 -translate-y-1/2 z-[60] flex items-center justify-center w-11 h-11 rounded-full bg-neutral-900/90 hover:bg-neutral-950 text-white shadow-2xl border border-white/30 backdrop-blur-md transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer group/btn disabled:opacity-0 disabled:pointer-events-none",
                        isTableHovered && canScrollLeft ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none"
                      )}
                      title="Scroll Left"
                      aria-label="Scroll table left"
                    >
                      <ChevronLeft className="w-6 h-6 text-white stroke-[2.5] transition-transform group-hover/btn:-translate-x-0.5" />
                    </button>

                    {/* Floating Right Scroll Arrow */}
                    <button
                      type="button"
                      onClick={() => scrollTable('right')}
                      disabled={!canScrollRight}
                      className={cn(
                        "absolute right-3 top-1/2 -translate-y-1/2 z-[60] flex items-center justify-center w-11 h-11 rounded-full bg-neutral-900/90 hover:bg-neutral-950 text-white shadow-2xl border border-white/30 backdrop-blur-md transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer group/btn disabled:opacity-0 disabled:pointer-events-none",
                        isTableHovered && canScrollRight ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none"
                      )}
                      title="Scroll Right"
                      aria-label="Scroll table right"
                    >
                      <ChevronRight className="w-6 h-6 text-white stroke-[2.5] transition-transform group-hover/btn:translate-x-0.5" />
                    </button>

                    <div 
                      ref={sheetTableRef}
                      onScroll={handleTableScroll}
                      className="flex-1 min-h-0 overflow-auto custom-scrollbar border border-neutral-200 rounded-lg w-full select-none shadow-xs bg-white h-full max-h-[calc(100vh-60px)]"
                    >
                      <table className="w-full border-collapse border-spacing-0 spreadsheet-fullscreen-mode text-[14px] select-text transition-all">
                        <thead>
                          {/* Row 1: Main Column Groups - SLSU Corporate Themed */}
                          <tr className="bg-neutral-900 text-white font-bold border-b border-neutral-700 divide-x divide-neutral-800">
                            <th rowSpan={2} className="p-2.5 text-center sticky left-0 top-0 z-50 bg-blue-950 text-white border-b border-blue-900 border-r border-[#1a3a6b] font-bold" style={{ minWidth: '60px', width: '60px', height: '64px' }}>
                              <div className="flex flex-col items-center justify-center leading-[1.1]">
                                <span className="text-[10px] font-normal">Serial</span>
                                <span className="text-[11px] font-bold">No.</span>
                              </div>
                            </th>
                            <th rowSpan={2} className="p-2.5 text-left sticky left-[60px] top-0 z-50 bg-blue-950 text-white border-b border-blue-900 border-r border-[#1a3a6b] font-bold" style={{ minWidth: '220px', width: '220px', height: '64px' }}>
                              Name
                            </th>
                            <th rowSpan={2} className="p-2.5 text-left sticky top-0 z-30 bg-blue-950 text-white border-b border-blue-900 font-bold" style={{ minWidth: '135px', height: '64px' }}>
                              Position
                            </th>
                            <th className="p-1.5 text-center bg-blue-950 text-white border-b border-blue-900 min-w-[85px] font-bold text-[11px] sticky top-0 z-30" style={{ height: '34px' }}>
                              Emp.
                            </th>
                            <th colSpan={4} className="p-1.5 text-center text-[10.5px] tracking-wider bg-blue-900 text-blue-100 border-b border-blue-950 font-bold sticky top-0 z-30" style={{ height: '34px' }}>
                              GOVERNMENT SHARE
                            </th>
                            <th colSpan={4} className="p-1.5 text-center text-[10.5px] tracking-wider bg-emerald-900 text-emerald-100 border-b border-emerald-950 font-bold sticky top-0 z-30" style={{ height: '34px' }}>
                              COMPENSATIONS
                            </th>
                            <th colSpan={16} className="p-2 text-center text-[11px] bg-rose-100 text-rose-950 font-extrabold tracking-widest border border-zinc-300 select-none uppercase sticky top-0 z-30" style={{ height: '34px' }}>
                              DEDUCTIONS
                            </th>
                            <th rowSpan={2} className="p-2.5 text-right bg-red-900 text-white min-w-[100px] border-b border-red-950 font-bold sticky top-0 z-30" style={{ height: '64px' }}>
                              Total Deduct
                            </th>
                            <th rowSpan={2} className="p-2.5 text-right bg-amber-600 text-neutral-950 min-w-[105px] border-b border-amber-800 font-extrabold uppercase tracking-wide sticky top-0 z-30" style={{ height: '64px' }}>
                              Net Pay
                            </th>
                            <th colSpan={3} className="p-1.5 text-center text-[10.5px] tracking-wider bg-amber-700 text-white border-b border-amber-800 font-bold sticky top-0 z-30" style={{ height: '34px' }}>
                              NET DISBURSEMENT
                            </th>
                            <th rowSpan={2} className="p-2.5 text-center min-w-[130px] bg-blue-950 text-white border-b border-blue-900 font-bold sticky top-0 z-30" style={{ height: '64px' }}>
                              Recipient Signature
                            </th>
                          </tr>
                          {/* Row 2: Sub-Headers with Formulas & Info Tooltips */}
                          <tr className="bg-neutral-100 text-slate-700 font-semibold border-b border-neutral-300 divide-x divide-neutral-200 text-[10px]">
                            <th className="sticky top-[34px] z-30 p-1.5 text-center min-w-[85px] bg-neutral-100 text-slate-700 font-bold border-b border-neutral-300 text-[10px]" style={{ height: '30px' }}>
                              No.
                            </th>
                            {/* Govt Shares */}
                            <th 
                              onClick={() => {
                                setShowGsisFormula(!showGsisFormula);
                                if (!showGsisFormula) {
                                  toast.info("Formula view enabled: 12% of Salaries and Wages-2nd Tranch");
                                }
                              }}
                              className={`sticky top-[34px] z-30 p-1.5 cursor-pointer select-none transition-all duration-200 ${showGsisFormula ? 'bg-blue-100 text-blue-950 min-w-[210px] text-center font-bold font-sans border-x border-blue-300' : 'p-1.5 text-right min-w-[70px] bg-blue-50 text-blue-950 hover:bg-blue-100'}`}
                              style={{ height: '30px' }}
                              title={showGsisFormula ? "Click to reset to 'GSIS PREM'" : "Click to view formula for GSIS PREM"}
                            >
                              <div className={`flex items-center gap-1 ${showGsisFormula ? 'justify-center text-blue-900' : 'justify-end'}`}>
                                {showGsisFormula ? (
                                  <span className="text-[10px] font-extrabold tracking-tight">
                                    12% of Salaries and Wages-2nd Tranch
                                  </span>
                                ) : (
                                  <>
                                    <span className="font-bold">GSIS PREM</span>
                                    <Info className="w-3.5 h-3.5 text-blue-500 opacity-60 inline-block" />
                                  </>
                                )}
                              </div>
                            </th>
                            <th className="sticky top-[34px] z-30 p-1.5 text-right min-w-[70px] bg-blue-50 text-blue-950" style={{ height: '30px' }}>
                              HDMF PREM
                            </th>
                            <th 
                              onClick={() => {
                                setShowPhilhealthFormula(!showPhilhealthFormula);
                                if (!showPhilhealthFormula) {
                                  toast.info("Formula view enabled: 5% of Salaries and Wages-2nd Tranch / 2");
                                }
                              }}
                              className={`sticky top-[34px] z-30 p-1.5 cursor-pointer select-none transition-all duration-200 ${showPhilhealthFormula ? 'bg-blue-100 text-blue-950 min-w-[210px] text-center font-bold font-sans border-x border-blue-300' : 'p-1.5 text-right min-w-[70px] bg-blue-50 text-blue-950 hover:bg-blue-100'}`}
                              style={{ height: '30px' }}
                              title={showPhilhealthFormula ? "Click to reset to 'PHILHEALTH ES'" : "Click to view formula for PHILHEALTH ES"}
                            >
                              <div className={`flex items-center gap-1 ${showPhilhealthFormula ? 'justify-center text-blue-900' : 'justify-end'}`}>
                                {showPhilhealthFormula ? (
                                  <span className="text-[10px] font-extrabold tracking-tight">
                                    5% of Salaries and Wages-2nd Tranch / 2
                                  </span>
                                ) : (
                                  <>
                                    <span className="font-bold">PHILHEALTH ES</span>
                                    <Info className="w-3.5 h-3.5 text-blue-500 opacity-60 inline-block" />
                                  </>
                                )}
                              </div>
                            </th>
                            <th className="sticky top-[34px] z-30 p-1.5 text-right min-w-[70px] bg-blue-50 text-blue-950" style={{ height: '30px' }}>
                              ECIP
                            </th>

                            {/* Compensations */}
                            <th className="sticky top-[34px] z-30 p-1.5 text-right min-w-[95px] bg-emerald-50 text-emerald-950" style={{ height: '30px' }}>
                              Salaries and Wages-2nd Tranch
                            </th>
                            <th className="sticky top-[34px] z-30 p-1.5 text-right min-w-[70px] bg-emerald-50 text-emerald-950" style={{ height: '30px' }}>
                              PERA
                            </th>
                            <th 
                              onClick={() => {
                                setShowGrossFormula(!showGrossFormula);
                                if (!showGrossFormula) {
                                  toast.info("Formula view enabled: Salaries and Wages-2nd Tranch + PERA - Abs.");
                                }
                              }}
                              className={`sticky top-[34px] z-30 p-1.5 cursor-pointer select-none transition-all duration-200 ${showGrossFormula ? 'bg-emerald-100 text-emerald-950 min-w-[310px] text-center font-bold font-sans border-x border-emerald-300' : 'p-1.5 text-right min-w-[90px] bg-emerald-100 text-emerald-950 hover:bg-emerald-200'}`}
                              style={{ height: '30px' }}
                              title={showGrossFormula ? "Click to reset to 'Gross Amount Earned'" : "Click to view formula for Gross Amount Earned"}
                            >
                              <div className={`flex items-center gap-1 ${showGrossFormula ? 'justify-center text-emerald-900' : 'justify-end'}`}>
                                {showGrossFormula ? (
                                  <span className="text-[10px] font-extrabold tracking-tight">
                                    Salaries and Wages-2nd Tranch + PERA - Abs.
                                  </span>
                                ) : (
                                  <>
                                    <span className="font-bold">Gross Amount Earned</span>
                                    <Info className="w-3.5 h-3.5 text-emerald-600 opacity-70 inline-block" />
                                  </>
                                )}
                              </div>
                            </th>
                            <th className="sticky top-[34px] z-30 p-1.5 text-right min-w-[70px] bg-orange-50 text-orange-950" style={{ height: '30px' }}>
                              Abs.
                            </th>

                            {/* Deductions (16 Columns) */}
                            <th className="sticky top-[34px] z-30 p-1.5 text-center min-w-[85px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none" style={{ height: '30px' }}>
                              <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                                <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">GSIS PREM</span>
                                <span className="text-[9.5px] font-extrabold text-rose-950 uppercase tracking-tight">Policy Loan</span>
                              </div>
                            </th>
                            <th className="sticky top-[34px] z-30 p-1.5 text-center min-w-[85px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none" style={{ height: '30px' }}>
                              <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                                <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">GSIS PREM</span>
                                <span className="text-[9.5px] font-extrabold text-rose-950 uppercase tracking-tight">Consol Loan</span>
                              </div>
                            </th>
                            <th className="sticky top-[34px] z-30 p-1.5 text-center min-w-[85px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none" style={{ height: '30px' }}>
                              <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                                <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">GSIS PREM</span>
                                <span className="text-[9.5px] font-extrabold text-rose-950 uppercase tracking-tight">MPL Lite</span>
                              </div>
                            </th>
                            <th className="sticky top-[34px] z-30 p-1.5 text-center min-w-[75px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none" style={{ height: '30px' }}>
                              <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                                <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">GSIS PREM</span>
                                <span className="text-[9.5px] font-extrabold text-rose-950 uppercase tracking-tight">MPL</span>
                              </div>
                            </th>
                            <th className="sticky top-[34px] z-30 p-1.5 text-center min-w-[75px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none" style={{ height: '30px' }}>
                              <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                                <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">GSIS PREM</span>
                                <span className="text-[9.5px] font-extrabold text-rose-950 uppercase tracking-tight">CPL</span>
                              </div>
                            </th>
                            <th className="sticky top-[34px] z-30 p-1.5 text-center min-w-[75px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none" style={{ height: '30px' }}>
                              <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                                <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">GSIS PREM</span>
                                <span className="text-[9.5px] font-extrabold text-rose-950 uppercase tracking-tight">GFAL</span>
                              </div>
                            </th>
                            <th className="sticky top-[34px] z-30 p-1.5 text-center min-w-[95px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none" style={{ height: '30px' }}>
                              <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                                <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">GSIS PREM</span>
                                <span className="text-[9.5px] font-extrabold text-rose-950 uppercase tracking-tight text-[8px]">Emergency Loan</span>
                              </div>
                            </th>
                            <th 
                              onClick={() => {
                                setShowGsisPersonalFormula(!showGsisPersonalFormula);
                                if (!showGsisPersonalFormula) {
                                  toast.info("Formula view enabled: 9% of Salaries and Wages-2nd Tranch");
                                }
                              }}
                              className={`sticky top-[34px] z-30 p-1.5 cursor-pointer select-none transition-all duration-200 border border-zinc-300 ${showGsisPersonalFormula ? 'bg-rose-100 text-rose-950 min-w-[210px]' : 'bg-rose-50 text-rose-950 hover:bg-rose-100'}`}
                              style={{ height: '30px' }}
                              title={showGsisPersonalFormula ? "Click to reset to 'GSIS PREM PERSONAL'" : "Click to view formula for GSIS PREM PERSONAL"}
                            >
                              <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px] px-1">
                                {showGsisPersonalFormula ? (
                                  <span className="text-[10px] font-extrabold tracking-tight text-rose-900 leading-[1.2]">
                                    9% of Salaries and Wages-2nd Tranch
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">GSIS PREM</span>
                                    <span className="text-[9.5px]/[1.1] font-extrabold text-rose-950 uppercase tracking-tight flex items-center gap-0.5 justify-center">
                                      PERSONAL <Info className="w-2.5 h-2.5 text-rose-500 opacity-60 inline-block" />
                                    </span>
                                  </>
                                )}
                              </div>
                            </th>
                            <th className="sticky top-[34px] z-30 p-1.5 text-center min-w-[85px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none" style={{ height: '30px' }}>
                              <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                                <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">GSIS PREM</span>
                                <span className="text-[9.5px] font-extrabold text-rose-950 uppercase tracking-tight font-sans">Educ Asst.</span>
                              </div>
                            </th>
                            <th 
                              onClick={() => {
                                setShowPagibigPersonalFormula(!showPagibigPersonalFormula);
                                if (!showPagibigPersonalFormula) {
                                  toast.info("Formula view enabled: 2% of Salaries and Wages-2nd Tranch");
                                }
                              }}
                              className={`sticky top-[34px] z-30 p-1.5 cursor-pointer select-none transition-all duration-200 border border-zinc-300 ${showPagibigPersonalFormula ? 'bg-rose-100 text-rose-950 min-w-[210px]' : 'bg-rose-50 text-rose-950 hover:bg-rose-100'}`}
                              style={{ height: '30px' }}
                              title={showPagibigPersonalFormula ? "Click to reset to 'HDMF PREM PERSONAL(EE)'" : "Click to view formula for HDMF PREM PERSONAL(EE)"}
                            >
                              <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px] px-1">
                                {showPagibigPersonalFormula ? (
                                  <span className="text-[10px] font-extrabold tracking-tight text-rose-900 leading-[1.2]">
                                    2% of Salaries and Wages-2nd Tranch
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-[8.5px] font-bold text-rose-700 tracking-tight font-sans">HDMF PREM</span>
                                    <span className="text-[9.5px]/[1.1] font-extrabold text-rose-950 uppercase tracking-tight text-[8.5px] flex items-center gap-0.5 justify-center">
                                      PERSONAL(EE) <Info className="w-2.5 h-2.5 text-rose-500 opacity-60 inline-block" />
                                    </span>
                                  </>
                                )}
                              </div>
                            </th>
                            <th className="sticky top-[34px] z-30 p-1.5 text-center min-w-[85px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none" style={{ height: '30px' }}>
                              <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                                <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">HDMF PREM</span>
                                <span className="text-[9.5px] font-extrabold text-rose-950 uppercase tracking-tight">MPL</span>
                              </div>
                            </th>
                            <th className="sticky top-[34px] z-30 p-1.5 text-center min-w-[85px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none" style={{ height: '30px' }}>
                              <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                                <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">SSS</span>
                                <span className="text-[9.5px] font-extrabold text-rose-950 uppercase tracking-tight text-[9px]">Contribution</span>
                              </div>
                            </th>
                            <th className="sticky top-[34px] z-30 p-1.5 text-center min-w-[85px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none" style={{ height: '30px' }}>
                              <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                                <span className="text-[8.5px] font-bold text-rose-700 tracking-tight font-sans">HDMF PREM</span>
                                <span className="text-[9.5px] font-extrabold text-rose-950 uppercase tracking-tight font-sans font-medium">MP2</span>
                              </div>
                            </th>
                            <th 
                              onClick={() => {
                                setShowPhilhealthContFormula(!showPhilhealthContFormula);
                                if (!showPhilhealthContFormula) {
                                  toast.info("Formula view enabled: 2.5% of Salaries and Wages-2nd Tranch");
                                }
                              }}
                              className={`sticky top-[34px] z-30 p-1.5 cursor-pointer select-none transition-all duration-200 border border-zinc-300 ${showPhilhealthContFormula ? 'bg-rose-100 text-rose-950 min-w-[210px]' : 'bg-rose-50 text-rose-950 hover:bg-rose-100'}`}
                              style={{ height: '30px' }}
                              title={showPhilhealthContFormula ? "Click to reset to 'PHILHEALTH ES CONT'" : "Click to view formula for PHILHEALTH ES CONT"}
                            >
                              <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px] px-1">
                                {showPhilhealthContFormula ? (
                                  <span className="text-[10px] font-extrabold tracking-tight text-rose-900 leading-[1.2]">
                                    2.5% of Salaries and Wages-2nd Tranch
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-[8.5px] font-bold text-rose-700 tracking-tight font-sans">PHILHEALTH ES</span>
                                    <span className="text-[9.5px]/[1.1] font-extrabold text-rose-950 uppercase tracking-tight flex items-center gap-0.5 justify-center">
                                      CONT <Info className="w-2.5 h-2.5 text-rose-500 opacity-60 inline-block" />
                                    </span>
                                  </>
                                )}
                              </div>
                            </th>
                            <th className="sticky top-[34px] z-30 p-1.5 text-center min-w-[85px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none" style={{ height: '30px' }}>
                              <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                                <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">CSB</span>
                                <span className="text-[9.5px] font-extrabold text-rose-950 uppercase tracking-tight font-sans">Sal. Loan</span>
                              </div>
                            </th>
                            <th 
                              onClick={() => {
                                setShowTaxWithheldFormula(!showTaxWithheldFormula);
                                if (!showTaxWithheldFormula) {
                                  toast.info("Formula view enabled: TRAIN Law Monthly Tax Table (Over 20.8k Gross)");
                                }
                              }}
                              className={`sticky top-[34px] z-30 p-1.5 cursor-pointer select-none transition-all duration-200 border border-zinc-300 ${showTaxWithheldFormula ? 'bg-rose-100 text-rose-950 min-w-[220px]' : 'bg-rose-50 text-rose-950 hover:bg-rose-100'}`}
                              style={{ height: '30px' }}
                              title={showTaxWithheldFormula ? "Click to reset to 'TAX WITHHELD'" : "Click to view formula for TAX WITHHELD"}
                            >
                              <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px] px-1">
                                {showTaxWithheldFormula ? (
                                  <span className="text-[9.5px] font-extrabold tracking-tight text-rose-900 leading-[1.2]">
                                    TRAIN Law Tax Table (Over 20.8k Gross)
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">TAX</span>
                                    <span className="text-[9.5px]/[1.1] font-extrabold text-rose-950 uppercase tracking-tight font-sans flex items-center gap-0.5 justify-center">
                                      WITHHELD <Info className="w-2.5 h-2.5 text-rose-500 opacity-60 inline-block" />
                                    </span>
                                  </>
                                )}
                              </div>
                            </th>

                            {/* Net Disbursement */}
                            <th className="sticky top-[34px] z-30 p-1.5 text-right min-w-[85px] bg-amber-50 text-amber-950" style={{ height: '30px' }}>1st Half</th>
                            <th className="sticky top-[34px] z-30 p-1.5 text-right min-w-[85px] bg-amber-50 text-amber-950" style={{ height: '30px' }}>2nd Half</th>
                            <th className="sticky top-[34px] z-30 p-1.5 text-right min-w-[95px] bg-amber-100 text-amber-950 font-bold" style={{ height: '30px' }}>Total Net</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200 bg-white font-mono text-[13.5px]">
                          {sections.length === 0 ? (
                            <tr>
                              <td colSpan={32} className="p-12 text-center text-neutral-400 font-sans italic text-base">
                                {rawData.length === 0 ? "No itemized employee snapshot stored in this record." : "No employees match your search query."}
                              </td>
                            </tr>
                          ) : (
                            sections.map((section, sIndex) => {
                              const headerRow = (
                                <tr key={`sec-hdr-${section.label}-${section.isGenderSub}-${sIndex}`} className="bg-neutral-100/90 border-y border-neutral-300 divide-x divide-neutral-200">
                                  <td className="p-2 text-center sticky left-0 z-10 bg-neutral-100 font-bold text-neutral-500 text-[11px]" style={{ minWidth: "60px", width: "60px" }} />
                                  <td colSpan={31} className={`p-2.5 px-4 sticky left-[60px] z-10 bg-neutral-100 font-serif font-black uppercase text-[13px] tracking-widest text-neutral-900 select-none ${section.isGenderSub ? 'italic capitalize pl-8 text-neutral-800' : ''}`} style={{ minWidth: "220px", width: "220px" }}>
                                    {section.label}
                                  </td>
                                </tr>
                              );

                              const rows = section.entries.map((e: any) => {
                                globalIdx++;
                                const currentIdx = globalIdx;

                                const basic = Number(e.basicPay || e.salariesAndWages || 0);
                                const pera = Number(e.pera || e.compPera || 0);
                                const gross = Number(e.grossPay || e.compGross || (basic + pera));
                                const abs = Number(e.abs || 0);

                                const gsisGov = Number(e.compGsisGov || e.gsisPrem || Math.round(basic * 0.12));
                                const hdmfGov = Number(e.compHdmfGov || e.hdmfPrem || 200);
                                const phGov = Number(e.compPhilhealthGov || e.philhealthEs || Math.round((basic * 0.05) / 2));
                                const ecip = Number(e.compEcip || e.ecip || 100);

                                const {
                                  policy, consol, mplLite, mpl, cpl, gfal, emerg,
                                  gsisPers, educ, hdmfPers, hdmfMpl, sss, mp2, phCont, csb, tax
                                } = extractEntryDeductions(e, basic);

                                const totDed = Number(e.totalDeductions || (policy + consol + mplLite + mpl + cpl + gfal + emerg + gsisPers + educ + hdmfPers + hdmfMpl + sss + mp2 + phCont + csb + tax));
                                const net = Number(e.netPay || (gross - totDed));
                                const half1 = Math.floor(net / 2);
                                const half2 = net - half1;

                                sumBasic += basic;
                                sumPera += pera;
                                sumGross += gross;
                                sumAbs += abs;
                                sumGsisGov += gsisGov;
                                sumHdmfGov += hdmfGov;
                                sumPhGov += phGov;
                                sumEcip += ecip;
                                sumPolicy += policy;
                                sumConsol += consol;
                                sumMplLite += mplLite;
                                sumMpl += mpl;
                                sumCpl += cpl;
                                sumGfal += gfal;
                                sumEmerg += emerg;
                                sumGsisPers += gsisPers;
                                sumEduc += educ;
                                sumHdmfPers += hdmfPers;
                                sumHdmfMpl += hdmfMpl;
                                sumSss += sss;
                                sumMp2 += mp2;
                                sumPhCont += phCont;
                                sumCsb += csb;
                                sumTax += tax;
                                sumTotalDed += totDed;
                                sumNet += net;
                                sumHalf1 += half1;
                                sumHalf2 += half2;

                                return (
                                  <tr key={e.id || currentIdx} className="hover:bg-slate-50/75 divide-x divide-neutral-200 transition-colors">
                                    <td className="p-2.5 text-center sticky left-0 z-10 bg-slate-50 font-mono border-r border-neutral-200 text-neutral-500 font-medium" style={{ minWidth: "60px", width: "60px" }}>{currentIdx}</td>
                                    <td className="p-2.5 sticky left-[60px] z-10 bg-white border-r border-neutral-200 font-bold text-neutral-900" style={{ minWidth: "220px", width: "220px" }}>
                                      <span className="truncate block max-w-[200px]" title={e.employeeName}>{e.employeeName}</span>
                                    </td>
                                    <td className="p-2.5 text-neutral-600 font-medium bg-white whitespace-nowrap">{e.position || e.category || 'Staff'}</td>
                                    <td className="p-2.5 text-center bg-slate-50/40 text-neutral-700 font-mono text-[12px] font-semibold">{e.employeeNo || e.friendlyEmployeeId || e.employeeId || e.employeeNumber || `EMP-${currentIdx + 100}`}</td>
                                    
                                    {/* Govt Shares */}
                                    <td className="p-2 text-right font-mono bg-blue-50/20 text-slate-700">₱{formatCurrency(gsisGov)}</td>
                                    <td className="p-2 text-right font-mono bg-blue-50/20 text-slate-700">₱{formatCurrency(hdmfGov)}</td>
                                    <td className="p-2 text-right font-mono bg-blue-50/20 text-slate-700">₱{formatCurrency(phGov)}</td>
                                    <td className="p-2 text-right font-mono bg-blue-50/20 text-slate-700">₱{formatCurrency(ecip)}</td>

                                    {/* Compensations */}
                                    <td className="p-2 text-right font-mono text-neutral-800 bg-emerald-50/10">₱{formatCurrency(basic)}</td>
                                    <td className="p-2 text-right font-mono text-neutral-800 bg-emerald-50/10">₱{formatCurrency(pera)}</td>
                                    <td className="p-2 text-right font-mono font-bold text-emerald-950 bg-emerald-50/60">₱{formatCurrency(gross)}</td>
                                    <td className="p-2 text-right font-mono text-neutral-500 bg-orange-50/20">₱{formatCurrency(abs)}</td>

                                    {/* Deductions (16 Columns) */}
                                    <td className="p-1.5 text-right font-mono border-r border-neutral-200" style={{ backgroundColor: '#fff5f5' }}>
                                      <span className={policy > 0 ? 'text-rose-800 font-bold' : 'text-rose-300'}>₱{formatCurrency(policy)}</span>
                                    </td>
                                    <td className="p-1.5 text-right font-mono border-r border-neutral-200" style={{ backgroundColor: '#fff5f5' }}>
                                      <span className={consol > 0 ? 'text-rose-800 font-bold' : 'text-rose-300'}>₱{formatCurrency(consol)}</span>
                                    </td>
                                    <td className="p-1.5 text-right font-mono border-r border-neutral-200" style={{ backgroundColor: '#fff5f5' }}>
                                      <span className={mplLite > 0 ? 'text-rose-800 font-bold' : 'text-rose-300'}>₱{formatCurrency(mplLite)}</span>
                                    </td>
                                    <td className="p-1.5 text-right font-mono border-r border-neutral-200" style={{ backgroundColor: '#fff5f5' }}>
                                      <span className={mpl > 0 ? 'text-rose-800 font-bold' : 'text-rose-300'}>₱{formatCurrency(mpl)}</span>
                                    </td>
                                    <td className="p-1.5 text-right font-mono border-r border-neutral-200" style={{ backgroundColor: '#fff5f5' }}>
                                      <span className={cpl > 0 ? 'text-rose-800 font-bold' : 'text-rose-300'}>₱{formatCurrency(cpl)}</span>
                                    </td>
                                    <td className="p-1.5 text-right font-mono border-r border-neutral-200" style={{ backgroundColor: '#fff5f5' }}>
                                      <span className={gfal > 0 ? 'text-rose-800 font-bold' : 'text-rose-300'}>₱{formatCurrency(gfal)}</span>
                                    </td>
                                    <td className="p-1.5 text-right font-mono border-r border-neutral-200" style={{ backgroundColor: '#fff5f5' }}>
                                      <span className={emerg > 0 ? 'text-rose-800 font-bold' : 'text-rose-300'}>₱{formatCurrency(emerg)}</span>
                                    </td>
                                    <td className="p-1.5 text-right font-mono border-r border-neutral-200" style={{ backgroundColor: '#fff5f5' }}>
                                      <span className={gsisPers > 0 ? 'text-rose-800 font-bold' : 'text-rose-300'}>₱{formatCurrency(gsisPers)}</span>
                                    </td>
                                    <td className="p-1.5 text-right font-mono border-r border-neutral-200" style={{ backgroundColor: '#fff5f5' }}>
                                      <span className={educ > 0 ? 'text-rose-800 font-bold' : 'text-rose-300'}>₱{formatCurrency(educ)}</span>
                                    </td>
                                    <td className="p-1.5 text-right font-mono border-r border-neutral-200" style={{ backgroundColor: '#fff5f5' }}>
                                      <span className={hdmfPers > 0 ? 'text-rose-800 font-bold' : 'text-rose-300'}>₱{formatCurrency(hdmfPers)}</span>
                                    </td>
                                    <td className="p-1.5 text-right font-mono border-r border-neutral-200" style={{ backgroundColor: '#fff5f5' }}>
                                      <span className={hdmfMpl > 0 ? 'text-rose-800 font-bold' : 'text-rose-300'}>₱{formatCurrency(hdmfMpl)}</span>
                                    </td>
                                    <td className="p-1.5 text-right font-mono border-r border-neutral-200" style={{ backgroundColor: '#fff5f5' }}>
                                      <span className={sss > 0 ? 'text-rose-800 font-bold' : 'text-rose-300'}>₱{formatCurrency(sss)}</span>
                                    </td>
                                    <td className="p-1.5 text-right font-mono border-r border-neutral-200" style={{ backgroundColor: '#fff5f5' }}>
                                      <span className={mp2 > 0 ? 'text-rose-800 font-bold' : 'text-rose-300'}>₱{formatCurrency(mp2)}</span>
                                    </td>
                                    <td className="p-1.5 text-right font-mono border-r border-neutral-200" style={{ backgroundColor: '#fff5f5' }}>
                                      <span className={phCont > 0 ? 'text-rose-800 font-bold' : 'text-rose-300'}>₱{formatCurrency(phCont)}</span>
                                    </td>
                                    <td className="p-1.5 text-right font-mono border-r border-neutral-200" style={{ backgroundColor: '#fff5f5' }}>
                                      <span className={csb > 0 ? 'text-rose-800 font-bold' : 'text-rose-300'}>₱{formatCurrency(csb)}</span>
                                    </td>
                                    <td className="p-1.5 text-right font-mono border-r border-neutral-200" style={{ backgroundColor: '#fff5f5' }}>
                                      <span className={tax > 0 ? 'text-rose-800 font-bold' : 'text-rose-300'}>₱{formatCurrency(tax)}</span>
                                    </td>

                                    {/* Summaries */}
                                    <td className="p-2.5 font-mono text-right bg-rose-50/40 text-red-700 font-bold">₱{formatCurrency(totDed)}</td>
                                    <td className="p-2.5 font-mono text-right bg-amber-50/60 text-amber-900 font-bold">₱{formatCurrency(net)}</td>

                                    {/* Net Disbursement */}
                                    <td className="p-2.5 font-mono text-right bg-amber-50/15 text-amber-900 font-semibold">₱{formatCurrency(half1)}</td>
                                    <td className="p-2.5 font-mono text-right bg-amber-50/15 text-amber-900 font-semibold">₱{formatCurrency(half2)}</td>
                                    <td className="p-2.5 font-mono text-right bg-amber-50/45 text-amber-950 font-bold border-r border-neutral-200">₱{formatCurrency(net)}</td>
                                    <td className="p-2.5 text-center text-neutral-400 font-sans italic text-[11px]">Signed</td>
                                  </tr>
                                );
                              });

                              return (
                                <React.Fragment key={`section-frag-${sIndex}`}>
                                  {headerRow}
                                  {rows}
                                </React.Fragment>
                              );
                            })
                          )}
                        </tbody>
                        <tfoot className="sticky bottom-0 z-10 border-t-2 border-neutral-400 bg-neutral-100 shadow-[0_-2px_10px_rgba(0,0,0,0.08)]">
                          <tr className="divide-x divide-neutral-200 text-neutral-900 font-bold font-mono text-[13px]">
                            {/* Seq No */}
                            <td className="p-3 text-center sticky left-0 z-20 bg-neutral-200 font-extrabold border-r border-neutral-300 text-neutral-800 text-[13px]" style={{ minWidth: "60px", width: "60px" }}>
                              Σ
                            </td>
                            {/* Name */}
                            <td className="p-3 sticky left-[60px] z-20 bg-neutral-200 border-r border-neutral-300 font-extrabold text-neutral-950 text-[13px] tracking-wider uppercase" style={{ minWidth: "220px", width: "220px" }}>
                              TOTALS
                            </td>
                            {/* Position */}
                            <td className="p-3 bg-neutral-50 font-bold text-center text-neutral-500 text-[11px]">-</td>
                            {/* Employee No */}
                            <td className="p-3 bg-neutral-50 font-bold text-center text-neutral-500 text-[11px]">-</td>

                            {/* Government Shares Columns */}
                            <td className="p-2.5 text-right font-mono text-blue-950 bg-blue-50/50 font-bold">₱{formatCurrency(sumGsisGov)}</td>
                            <td className="p-2.5 text-right font-mono text-blue-950 bg-blue-50/50 font-bold">₱{formatCurrency(sumHdmfGov)}</td>
                            <td className="p-2.5 text-right font-mono text-blue-950 bg-blue-50/50 font-bold">₱{formatCurrency(sumPhGov)}</td>
                            <td className="p-2.5 text-right font-mono text-blue-950 bg-blue-50/50 font-bold">₱{formatCurrency(sumEcip)}</td>

                            {/* Compensations Columns */}
                            <td className="p-2.5 text-right font-mono font-bold bg-emerald-50/50 text-emerald-900">₱{formatCurrency(sumBasic)}</td>
                            <td className="p-2.5 text-right font-mono font-bold bg-emerald-50/50 text-emerald-900">₱{formatCurrency(sumPera)}</td>
                            <td className="p-2.5 text-right font-mono font-extrabold bg-emerald-100/80 text-emerald-950">₱{formatCurrency(sumGross)}</td>
                            <td className="p-2.5 text-right font-mono font-bold bg-orange-50/50 text-orange-900">₱{formatCurrency(sumAbs)}</td>

                            {/* Deductions Columns */}
                            <td className="p-2.5 text-right font-mono font-bold text-rose-950 bg-rose-50 border-r border-neutral-200">₱{formatCurrency(sumPolicy)}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-rose-950 bg-rose-50 border-r border-neutral-200">₱{formatCurrency(sumConsol)}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-rose-950 bg-rose-50 border-r border-neutral-200">₱{formatCurrency(sumMplLite)}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-rose-950 bg-rose-50 border-r border-neutral-200">₱{formatCurrency(sumMpl)}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-rose-950 bg-rose-50 border-r border-neutral-200">₱{formatCurrency(sumCpl)}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-rose-950 bg-rose-50 border-r border-neutral-200">₱{formatCurrency(sumGfal)}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-rose-950 bg-rose-50 border-r border-neutral-200">₱{formatCurrency(sumEmerg)}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-rose-950 bg-rose-50 border-r border-neutral-200">₱{formatCurrency(sumGsisPers)}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-rose-950 bg-rose-50 border-r border-neutral-200">₱{formatCurrency(sumEduc)}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-rose-950 bg-rose-50 border-r border-neutral-200">₱{formatCurrency(sumHdmfPers)}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-rose-950 bg-rose-50 border-r border-neutral-200">₱{formatCurrency(sumHdmfMpl)}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-rose-950 bg-rose-50 border-r border-neutral-200">₱{formatCurrency(sumSss)}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-rose-950 bg-rose-50 border-r border-neutral-200">₱{formatCurrency(sumMp2)}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-rose-950 bg-rose-50 border-r border-neutral-200">₱{formatCurrency(sumPhCont)}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-rose-950 bg-rose-50 border-r border-neutral-200">₱{formatCurrency(sumCsb)}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-rose-950 bg-rose-50 border-r border-neutral-200">₱{formatCurrency(sumTax)}</td>

                            {/* Total Deductions */}
                            <td className="p-3 font-mono text-right bg-rose-100 text-red-900 font-extrabold border-r border-neutral-200">
                              ₱{formatCurrency(sumTotalDed)}
                            </td>

                            {/* Net Pay */}
                            <td className="p-3 font-mono text-right bg-amber-100 text-amber-950 font-extrabold border-r border-neutral-200">
                              ₱{formatCurrency(sumNet)}
                            </td>

                            {/* 1st Half */}
                            <td className="p-3 font-mono text-right bg-amber-50 text-amber-950 font-bold border-r border-neutral-200">
                              ₱{formatCurrency(sumHalf1)}
                            </td>

                            {/* 2nd Half */}
                            <td className="p-3 font-mono text-right bg-amber-50 text-amber-950 font-bold border-r border-neutral-200">
                              ₱{formatCurrency(sumHalf2)}
                            </td>

                            {/* Total Net */}
                            <td className="p-3 font-mono text-right bg-amber-100 text-amber-950 font-extrabold border-r border-neutral-200">
                              ₱{formatCurrency(sumNet)}
                            </td>

                            {/* Signature placeholder */}
                            <td className="p-3 bg-neutral-50 font-bold text-center text-neutral-400 font-mono text-[11px] italic">-</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* DIALOG 4: EDIT RECORD INFO */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Payroll Record</DialogTitle>
            <DialogDescription>
              Update record details, title, year, or month.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateRecord} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-title" className="text-xs font-bold text-neutral-700">Record Title</Label>
              <Input 
                id="edit-title"
                value={editForm.title}
                onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-year" className="text-xs font-bold text-neutral-700">Year</Label>
                <Select 
                  value={editForm.year.toString()} 
                  onValueChange={(v: string | null) => setEditForm(prev => ({ ...prev, year: v ? Number(v) : new Date().getFullYear() }))}
                >
                  <SelectTrigger id="edit-year" className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2026, 2025, 2024, 2023, 2022].map(y => (
                      <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-month" className="text-xs font-bold text-neutral-700">Month</Label>
                <Select 
                  value={editForm.month.toString()} 
                  onValueChange={(v: string | null) => setEditForm(prev => ({ ...prev, month: v ? Number(v) : 1 }))}
                >
                  <SelectTrigger id="edit-month" className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((m, idx) => (
                      <SelectItem key={m} value={(idx + 1).toString()}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-period" className="text-xs font-bold text-neutral-700">Period Type</Label>
              <Select 
                value={editForm.periodType} 
                onValueChange={(v: string | null) => setEditForm(prev => ({ ...prev, periodType: v ?? 'monthly' }))}
              >
                <SelectTrigger id="edit-period" className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly (Full)</SelectItem>
                  <SelectItem value="1st-half">1st Half</SelectItem>
                  <SelectItem value="2nd-half">2nd Half</SelectItem>
                  <SelectItem value="semi-monthly">Semi-Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-notes" className="text-xs font-bold text-neutral-700">Notes / Remarks</Label>
              <Input 
                id="edit-notes"
                value={editForm.notes}
                onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
              />
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-neutral-900 text-white font-bold">
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG 5: DELETE RECORD CONFIRMATION */}
      <Dialog open={!!recordToDelete} onOpenChange={(open) => !open && setRecordToDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Payroll Record?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong className="text-neutral-800">{recordToDelete?.title}</strong> ({recordToDelete?.monthName} {recordToDelete?.year}) from the database? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setRecordToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteRecord}>
              Delete Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
