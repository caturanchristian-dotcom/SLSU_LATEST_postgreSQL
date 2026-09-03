import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import { toast } from 'sonner';
import { useRealtime } from '../hooks/useRealtime';
import { 
  Folder, 
  FolderOpen, 
  Calendar, 
  ChevronDown, 
  ChevronRight, 
  Search, 
  Plus, 
  Save, 
  FileSpreadsheet, 
  Download, 
  Trash2, 
  Edit2, 
  Eye, 
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
  CreditCard
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
import * as XLSX from 'xlsx';

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const MATRIX_COLUMNS = [
  { id: 'policy', label: 'GSIS POLICY LOAN', key: 'dedPolicyLoan' },
  { id: 'consol', label: 'GSIS CONSOL LOAN', key: 'dedConsolLoan' },
  { id: 'mplLite', label: 'GSIS MPL LITE', key: 'dedMplLite' },
  { id: 'mpl', label: 'GSIS MPL', key: 'dedMpl' },
  { id: 'cpl', label: 'GSIS CPL', key: 'dedCpl' },
  { id: 'gfal', label: 'GSIS GFAL', key: 'dedGfal' },
  { id: 'emergency', label: 'GSIS EMERGENCY LOAN', key: 'dedEmergencyLoan' },
  { id: 'gsisPrem', label: 'GSIS PREM PERSONAL', key: 'dedGsisPremPersonal' },
  { id: 'educAsst', label: 'GSIS EDUC ASST.', key: 'dedEducAsst' },
  { id: 'pagibigPersonal', label: 'PAG-IBIG PERSONAL(EE)', key: 'dedPagibigPersonal' },
  { id: 'pagibigMpl', label: 'PAG-IBIG MPL', key: 'dedPagibigMpl' },
  { id: 'sss', label: 'SSS CONTRIBUTION', key: 'dedSss' },
  { id: 'mp2', label: 'PAG-IBIG MP2', key: 'dedPagibigMp2' },
  { id: 'philhealth', label: 'PHILHLTH CONT', key: 'dedPhilhealthCont' },
  { id: 'csb', label: 'CSB SAL. LOAN', key: 'dedCsbLoan' },
  { id: 'tax', label: 'TAX WITHHELD', key: 'dedTaxWithheld' },
];

const getDeductionAmountByCol = (empDeds: any[], colId: string): number => {
  if (!empDeds || !Array.isArray(empDeds)) return 0;

  const mappings: { [key: string]: string[] } = {
    policy: ['policyloan', 'policy loan', 'gsis policy loan', 'policy_loan', 'dedpolicyloan'],
    consol: ['consoloan', 'consol loan', 'consolidation loan', 'conso loan', 'consolidation', 'dedconsoloan'],
    mplLite: ['mpllite', 'mpl_lite', 'mpl-lite', 'mpl_lite rlp', 'mplliterlp', 'mpl lite', 'multi-purpose loan lite', 'dedmpllite', 'mpl_lite_rlp'],
    mpl: ['mpl', 'multipurpose loan', 'multi purpose loan', 'multi-purpose loan', 'mpl loan', 'dedmpl', 'gsis multipurpose loan'],
    cpl: ['cpl', 'computer purchase loan', 'computer loan', 'cpl loan', 'dedcpl', 'gsis computer loan', 'cpl_loan'],
    gfal: ['gfal', 'gsis financial assistance loan', 'gsis financial assistance', 'gfal loan', 'dedgfal'],
    emergency: ['emrgyln', 'gsis emergency loan', 'emergency loan', 'emrgy ln', 'emrgy_ln', 'emergency_loan', 'dedemergencyloan'],
    gsisPrem: ['gsisprem', 'gsispersonal', 'gsisprempersonal', 'gsisEE', 'gsis personal', 'gsis contribution', 'gsis premium', 'gsis ee', 'dedgsisprempersonal', 'gsis prem personal', 'gsis personal share', 'gsis_prem', 'gsis personal premium'],
    educAsst: ['educasst', 'educ_asst', 'educational assistance', 'educational assistance loan', 'educ asst', 'dededucasst', 'gsis educational assistance'],
    pagibigPersonal: ['pagibigprem', 'pagibigpersonal', 'pagibigpersonalee', 'pagibigregular', 'pagibigee', 'hdmfpersonal', 'hdmfpersonalee', 'hdmfee', 'pagibig regular', 'pagibig personal', 'pagibig contribution', 'pagibig premium', 'pagibig ee', 'hdmf personal', 'hdmf contribution', 'hdmf ee', 'dedpagibigpersonal', 'pag-ibig personal', 'pag-ibig ee', 'pag-ibig regular', 'pagibig_prem', 'hdmf premium', 'pag-ibig personal(ee)'],
    pagibigMpl: ['pagibigmpl', 'pagibig_mpl', 'hdmf_mpl', 'pag-ibig mpl', 'dedpagibigmpl', 'hdmf mpl', 'pag-ibig mpl'],
    sss: ['sss', 'dedsss', 'sss contribution', 'sss premium', 'sss ee', 'sss_prem', 'sss share'],
    mp2: ['mp2', 'dedpagibigmp2', 'pagibig mp2', 'pag-ibig mp2', 'mp2 contribution', 'pagibig_mp2', 'hdmf mp2'],
    philhealth: ['philhealth', 'dedphilhealthcont', 'philhealth contribution', 'philhealth premium', 'philhealth ee', 'philhealth cont', 'philhealth_prem', 'ph_prem', 'phee', 'ph ee', 'philhealth ee share', 'philhealth cont.'],
    csb: ['csbloan', 'dedcsbloan', 'csb loan', 'csb', 'csbsalloan', 'csb sal loan'],
    tax: ['tax', 'dedtaxwithheld', 'withholding tax', 'tax withheld', 'wtax', 'income tax', 'withholding_tax', 'tax_withheld', 'wtax withheld', 'withholding tax(ee)', 'taxwithheld']
  };

  const colKeys = mappings[colId] || [];
  const matched = empDeds.find(d => {
    const dT = String(d.type || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return colKeys.some(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === dT);
  });

  if (matched) {
    return Number(matched.amount || 0);
  }
  return 0;
};

const getEmployeeOtherDeductionsAmount = (empDeds: any[]): number => {
  if (!empDeds || !Array.isArray(empDeds)) return 0;
  
  const mappings = [
    'policyloan', 'policy loan', 'gsis policy loan', 'policy_loan', 'dedpolicyloan',
    'consoloan', 'consol loan', 'consolidation loan', 'conso loan', 'consolidation', 'dedconsoloan',
    'mpllite', 'mpl_lite', 'mpl-lite', 'mpl_lite rlp', 'mplliterlp', 'mpl lite', 'multi-purpose loan lite', 'dedmpllite', 'mpl_lite_rlp',
    'mpl', 'multipurpose loan', 'multi purpose loan', 'multi-purpose loan', 'mpl loan', 'dedmpl', 'gsis multipurpose loan',
    'cpl', 'computer purchase loan', 'computer loan', 'cpl loan', 'dedcpl', 'gsis computer loan', 'cpl_loan',
    'gfal', 'gsis financial assistance loan', 'gsis financial assistance', 'gfal loan', 'dedgfal',
    'emrgyln', 'gsis emergency loan', 'emergency loan', 'emrgy ln', 'emrgy_ln', 'emergency_loan', 'dedemergencyloan',
    'gsisprem', 'gsispersonal', 'gsisprempersonal', 'gsisEE', 'gsis personal', 'gsis contribution', 'gsis premium', 'gsis ee', 'dedgsisprempersonal', 'gsis prem personal', 'gsis personal share', 'gsis_prem', 'gsis personal premium',
    'educasst', 'educ_asst', 'educational assistance', 'educational assistance loan', 'educ asst', 'dededucasst', 'gsis educational assistance',
    'pagibigprem', 'pagibigpersonal', 'pagibigpersonalee', 'pagibigregular', 'pagibigee', 'hdmfpersonal', 'hdmfpersonalee', 'hdmfee', 'pagibig regular', 'pagibig personal', 'pagibig contribution', 'pagibig premium', 'pagibig ee', 'hdmf personal', 'hdmf contribution', 'hdmf ee', 'dedpagibigpersonal', 'pag-ibig personal', 'pag-ibig ee', 'pag-ibig regular', 'pagibig_prem', 'hdmf premium', 'pag-ibig personal(ee)',
    'pagibigmpl', 'pagibig_mpl', 'hdmf_mpl', 'pag-ibig mpl', 'dedpagibigmpl', 'hdmf mpl', 'pag-ibig mpl',
    'sss', 'dedsss', 'sss contribution', 'sss premium', 'sss ee', 'sss_prem', 'sss share',
    'mp2', 'dedpagibigmp2', 'pagibig mp2', 'pag-ibig mp2', 'mp2 contribution', 'pagibig_mp2', 'hdmf mp2',
    'philhealth', 'dedphilhealthcont', 'philhealth contribution', 'philhealth premium', 'philhealth ee', 'philhealth cont', 'philhealth_prem', 'ph_prem', 'phee', 'ph ee', 'philhealth ee share', 'philhealth cont.',
    'csbloan', 'dedcsbloan', 'csb loan', 'csb', 'csbsalloan', 'csb sal loan',
    'tax', 'dedtaxwithheld', 'withholding tax', 'tax withheld', 'wtax', 'income tax', 'withholding_tax', 'tax_withheld', 'wtax withheld', 'withholding tax(ee)', 'taxwithheld'
  ];

  const unmapped = empDeds.filter(d => {
    const dT = String(d.type || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return !mappings.some(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === dT);
  });

  return unmapped.reduce((sum, d) => sum + Number(d.amount || 0), 0);
};

interface DeductionRecordsProps {
  onBackToMatrix?: () => void;
}

export const DeductionRecords: React.FC<DeductionRecordsProps> = ({ onBackToMatrix }) => {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');

  // Expanded year folders state
  const [expandedYears, setExpandedYears] = useState<{ [key: number]: boolean }>({
    [new Date().getFullYear()]: true,
  });

  // Modal States
  const [isSaveCurrentOpen, setIsSaveCurrentOpen] = useState(false);
  const [saveCurrentForm, setSaveCurrentForm] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    title: '',
    notes: '',
  });
  const [isSavingCurrent, setIsSavingCurrent] = useState(false);

  // Edit Record State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    notes: '',
    status: 'saved',
  });
  const [isUpdating, setIsUpdating] = useState(false);

  // View Record Sheet Modal State
  const [selectedRecordForDetails, setSelectedRecordForDetails] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Delete State
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Clear All Records State
  const [isClearAllOpen, setIsClearAllOpen] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const data = await api.deductionRecords.listRecords();
      const recList = Array.isArray(data) ? data : (data?.data && Array.isArray(data.data) ? data.data : (data?.records && Array.isArray(data.records) ? data.records : []));
      setRecords(recList);
    } catch (error: any) {
      toast.error('Failed to load deduction records');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  useRealtime(['deduction_records_changed', 'deductions_changed'], fetchRecords);

  const handleOpenSaveCurrent = () => {
    const curMonth = new Date().getMonth() + 1;
    const curYear = new Date().getFullYear();
    const monthName = MONTH_NAMES[curMonth - 1];

    setSaveCurrentForm({
      year: curYear,
      month: curMonth,
      title: `GENERAL DEDUCTIONS RECORD - ${monthName.toUpperCase()} ${curYear}`,
      notes: `Snapshot of active employee deductions as of ${monthName} ${curYear}`,
    });
    setIsSaveCurrentOpen(true);
  };

  const handleSaveCurrentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCurrent(true);
    try {
      await api.deductionRecords.saveCurrent({
        year: saveCurrentForm.year,
        month: saveCurrentForm.month,
        title: saveCurrentForm.title,
        notes: saveCurrentForm.notes,
      });
      toast.success('Deduction record saved successfully to database!');
      setIsSaveCurrentOpen(false);
      fetchRecords();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save deduction record');
    } finally {
      setIsSavingCurrent(false);
    }
  };

  const handleOpenEdit = (rec: any) => {
    setEditingRecord(rec);
    setEditForm({
      title: rec.title,
      year: rec.year,
      month: rec.month,
      notes: rec.notes || '',
      status: rec.status || 'saved',
    });
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    setIsUpdating(true);
    try {
      await api.deductionRecords.updateRecord(editingRecord.id, editForm);
      toast.success('Deduction record updated successfully');
      setIsEditOpen(false);
      fetchRecords();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update deduction record');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteClick = (rec: any) => {
    setRecordToDelete(rec);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!recordToDelete) return;
    setIsDeleting(true);
    try {
      await api.deductionRecords.deleteRecord(recordToDelete.id);
      toast.success('Deduction record deleted from database');
      setIsDeleteOpen(false);
      setRecordToDelete(null);
      fetchRecords();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete record');
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmClearAll = async () => {
    setIsClearingAll(true);
    try {
      await api.deductionRecords.clearAllRecords();
      toast.success('All deduction records cleared from database');
      setIsClearAllOpen(false);
      fetchRecords();
    } catch (error: any) {
      toast.error(error.message || 'Failed to clear deduction records');
    } finally {
      setIsClearingAll(false);
    }
  };

  const toggleYearExpand = (year: number) => {
    setExpandedYears(prev => ({
      ...prev,
      [year]: !prev[year]
    }));
  };

  const safeRecords = Array.isArray(records) ? records : [];

  // Filter records
  const filteredRecords = safeRecords.filter(rec => {
    if (!rec) return false;
    const matchesSearch = 
      !searchTerm ||
      rec.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.monthName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(rec.year).includes(searchTerm);

    const matchesYear = filterYear === 'all' || String(rec.year) === filterYear;
    const matchesMonth = filterMonth === 'all' || String(rec.month) === filterMonth;

    return matchesSearch && matchesYear && matchesMonth;
  });

  // Group records by Year
  const groupedByYear: { [year: number]: any[] } = {};
  filteredRecords.forEach(rec => {
    const y = rec.year || new Date().getFullYear();
    if (!groupedByYear[y]) groupedByYear[y] = [];
    groupedByYear[y].push(rec);
  });

  const availableYears = Array.from(
    new Set(safeRecords.map(r => r?.year || new Date().getFullYear()))
  ).sort((a, b) => b - a);

  // Export Record to XLSX
  const exportRecordToXlsx = (record: any) => {
    if (!record || !record.recordData) return;
    const entries = record.recordData || [];

    const dataRows = entries.map((e: any, idx: number) => {
      const empDeds = e.deductions || [];
      const row: any = {
        'Seq No': idx + 1,
        'Employee Name': e.employeeName || `${e.lastName || ''}, ${e.firstName || ''}`,
        'Position': e.position || 'Staff',
        'Category': e.category || 'STAFF',
      };

      let totalEmpDed = 0;
      MATRIX_COLUMNS.forEach(col => {
        let val = 0;
        if (e[col.key] !== undefined) {
          val = Number(e[col.key] || 0);
        } else {
          val = getDeductionAmountByCol(empDeds, col.id);
        }
        row[col.label] = val;
        totalEmpDed += val;
      });

      const otherVal = getEmployeeOtherDeductionsAmount(empDeds);
      row['OTHER DEDUCTIONS'] = otherVal;
      totalEmpDed += otherVal;

      row['TOTAL DEDUCTIONS'] = totalEmpDed;
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'General Deductions');
    XLSX.writeFile(workbook, `${record.title || 'DeductionRecord'}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-bold text-neutral-900 tracking-tight flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600" />
              Deduction Records (Database Snapshots)
            </h3>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 text-xs font-semibold gap-1.5 py-0.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Auto-Save Active
            </Badge>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
              Database Synced
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Official monthly deduction spreadsheet snapshots automatically saved and updated in real-time in the database.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onBackToMatrix && (
            <Button variant="outline" size="sm" onClick={onBackToMatrix} className="gap-1.5 text-xs">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Matrix
            </Button>
          )}

          {records.length > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsClearAllOpen(true)}
              className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800 gap-1.5 text-xs font-medium"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              Clear All Records
            </Button>
          )}

          <Button 
            onClick={handleOpenSaveCurrent} 
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-sm text-xs font-medium"
          >
            <Save className="w-4 h-4" />
            Save Current Active Matrix as Record
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-neutral-50/80 p-3.5 rounded-lg border border-neutral-200/80">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
          <Input
            placeholder="Search records by title, month..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 text-xs bg-white"
          />
        </div>

        <div>
          <Select value={filterYear} onValueChange={(val: string | null) => setFilterYear(val ?? 'all')}>
            <SelectTrigger className="text-xs bg-white">
              <SelectValue placeholder="All Years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {availableYears.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Select value={filterMonth} onValueChange={(val: string | null) => setFilterMonth(val ?? 'all')}>
            <SelectTrigger className="text-xs bg-white">
              <SelectValue placeholder="All Months" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {MONTH_NAMES.map((m, idx) => (
                <SelectItem key={m} value={String(idx + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-end text-xs text-neutral-500 font-medium px-2">
          Total Records: <span className="ml-1 text-neutral-900 font-bold">{filteredRecords.length}</span>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-neutral-200">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
          <p className="text-sm font-medium text-neutral-600">Loading deduction records from database...</p>
        </div>
      ) : Object.keys(groupedByYear).length === 0 ? (
        <Card className="border-dashed border-2 border-neutral-300 bg-neutral-50/50">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-3">
              <CreditCard className="w-6 h-6" />
            </div>
            <h4 className="text-base font-semibold text-neutral-900">No Deduction Records Found</h4>
            <p className="text-xs text-neutral-500 max-w-sm mt-1 mb-4">
              {searchTerm || filterYear !== 'all' || filterMonth !== 'all' 
                ? "No records match your active search filters." 
                : "Save your active deductions matrix to create an official deduction record snapshot."}
            </p>
            <Button onClick={handleOpenSaveCurrent} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              <Save className="w-4 h-4" />
              Save Active Matrix as Record
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Folder Tree by Year */
        <div className="space-y-6">
          {Object.keys(groupedByYear)
            .map(Number)
            .sort((a, b) => b - a)
            .map(year => {
              const yearRecords = groupedByYear[year];
              const isExpanded = expandedYears[year] ?? true;

              return (
                <div key={year} className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-xs">
                  {/* Folder Header */}
                  <div 
                    onClick={() => toggleYearExpand(year)}
                    className="flex items-center justify-between px-5 py-3.5 bg-neutral-100/80 hover:bg-neutral-100 border-b border-neutral-200 cursor-pointer select-none transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-neutral-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-neutral-500" />
                      )}
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <FolderOpen className="w-5 h-5 text-amber-500" />
                        ) : (
                          <Folder className="w-5 h-5 text-amber-500" />
                        )}
                        <span className="text-base font-bold text-neutral-900">
                          Year {year}
                        </span>
                      </div>
                      <Badge variant="secondary" className="bg-neutral-200 text-neutral-700 font-mono text-[11px]">
                        {yearRecords.length} {yearRecords.length === 1 ? 'Record' : 'Records'}
                      </Badge>
                    </div>

                    <div className="text-xs text-neutral-500">
                      Total Year Deductions: <span className="font-bold text-neutral-900 font-mono">{formatCurrency(yearRecords.reduce((s, r) => s + Number(r.totalDeductions || 0), 0))}</span>
                    </div>
                  </div>

                  {/* Folder Contents */}
                  {isExpanded && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-neutral-50/40">
                      {yearRecords.map(rec => (
                        <Card key={rec.id} className="bg-white hover:shadow-md transition-all border border-neutral-200 flex flex-col justify-between">
                          <CardHeader className="pb-3 pt-4 px-4">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 text-[10px] font-semibold mb-1">
                                  {rec.monthName || MONTH_NAMES[(rec.month || 1) - 1]} {rec.year}
                                </Badge>
                                <CardTitle className="text-sm font-bold text-neutral-900 line-clamp-2 leading-snug">
                                  {rec.title}
                                </CardTitle>
                              </div>
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                                {rec.status || 'Saved'}
                              </Badge>
                            </div>
                            {rec.notes && (
                              <CardDescription className="text-xs text-neutral-500 line-clamp-2 mt-1.5">
                                {rec.notes}
                              </CardDescription>
                            )}
                          </CardHeader>

                          <CardContent className="py-2 px-4 space-y-2 border-t border-b border-neutral-100 bg-neutral-50/50">
                            <div className="flex items-center justify-between text-xs text-neutral-600">
                              <span className="flex items-center gap-1.5 text-neutral-500">
                                <Users className="w-3.5 h-3.5 text-neutral-400" />
                                Employees
                              </span>
                              <span className="font-bold text-neutral-800 font-mono">
                                {rec.totalEmployees || (rec.recordData ? rec.recordData.length : 0)}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-xs text-neutral-600">
                              <span className="flex items-center gap-1.5 text-neutral-500">
                                <CreditCard className="w-3.5 h-3.5 text-neutral-400" />
                                Total Deductions
                              </span>
                              <span className="font-bold text-rose-600 font-mono">
                                {formatCurrency(rec.totalDeductions || 0)}
                              </span>
                            </div>
                          </CardContent>

                          <div className="p-3 bg-white flex items-center justify-between gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedRecordForDetails(rec);
                                setIsDetailsOpen(true);
                              }}
                              className="text-xs gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50 hover:text-blue-800 flex-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View Sheet
                            </Button>

                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenEdit(rec)}
                                className="h-8 w-8 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"
                                title="Edit Title/Notes"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteClick(rec)}
                                className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                title="Delete Record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Save Current Active Matrix Dialog */}
      <Dialog open={isSaveCurrentOpen} onOpenChange={setIsSaveCurrentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-neutral-900">
              <Save className="w-5 h-5 text-blue-600" />
              Save Active Matrix as Record Snapshot
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-500">
              Capture all current employee deductions as an official deduction record saved in the PostgreSQL / Supabase database.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveCurrentSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Year</Label>
                <Input
                  type="number"
                  value={saveCurrentForm.year}
                  onChange={(e) => {
                    const y = Number(e.target.value);
                    setSaveCurrentForm(prev => ({
                      ...prev,
                      year: y,
                      title: `GENERAL DEDUCTIONS RECORD - ${MONTH_NAMES[prev.month - 1].toUpperCase()} ${y}`
                    }));
                  }}
                  className="text-xs mt-1"
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Month</Label>
                <Select 
                  value={String(saveCurrentForm.month)} 
                  onValueChange={(val) => {
                    const m = Number(val);
                    setSaveCurrentForm(prev => ({
                      ...prev,
                      month: m,
                      title: `GENERAL DEDUCTIONS RECORD - ${MONTH_NAMES[m - 1].toUpperCase()} ${prev.year}`
                    }));
                  }}
                >
                  <SelectTrigger className="text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((m, idx) => (
                      <SelectItem key={m} value={String(idx + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Record Title</Label>
              <Input
                value={saveCurrentForm.title}
                onChange={(e) => setSaveCurrentForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g. GENERAL DEDUCTIONS RECORD - JULY 2026"
                className="text-xs mt-1"
                required
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Notes / Remarks</Label>
              <Input
                value={saveCurrentForm.notes}
                onChange={(e) => setSaveCurrentForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional notes or references"
                className="text-xs mt-1"
              />
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsSaveCurrentOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSavingCurrent} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
                {isSavingCurrent && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Snapshot to Database
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Record Details Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-neutral-900 text-base">Edit Deduction Record Details</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Title</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                className="text-xs mt-1"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Year</Label>
                <Input
                  type="number"
                  value={editForm.year}
                  onChange={(e) => setEditForm(prev => ({ ...prev, year: Number(e.target.value) }))}
                  className="text-xs mt-1"
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Month</Label>
                <Select 
                  value={String(editForm.month)} 
                  onValueChange={(val) => setEditForm(prev => ({ ...prev, month: Number(val) }))}
                >
                  <SelectTrigger className="text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((m, idx) => (
                      <SelectItem key={m} value={String(idx + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Notes</Label>
              <Input
                value={editForm.notes}
                onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                className="text-xs mt-1"
              />
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isUpdating} className="bg-blue-600 hover:bg-blue-700 text-white">
                {isUpdating && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Record Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-rose-600 flex items-center gap-2 text-base">
              <Trash2 className="w-5 h-5" />
              Delete Deduction Record
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-500">
              Are you sure you want to delete the deduction record "{recordToDelete?.title}" from the database? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-3">
            <Button variant="outline" size="sm" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" disabled={isDeleting} onClick={confirmDelete}>
              {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear All Deduction Records Dialog */}
      <Dialog open={isClearAllOpen} onOpenChange={setIsClearAllOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-rose-600 flex items-center gap-2 text-base">
              <Trash2 className="w-5 h-5" />
              Clear All Deduction Records
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-500">
              Are you sure you want to delete <strong>ALL {records.length} deduction records</strong> from the database? This will clear all historical deduction snapshots permanently.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-3">
            <Button variant="outline" size="sm" onClick={() => setIsClearAllOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" disabled={isClearingAll} onClick={confirmClearAll}>
              {isClearingAll && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Clear All Records
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full Sheet View Dialog for Selected Deduction Record */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-[96vw] w-[96vw] max-h-[92vh] flex flex-col p-4 sm:p-6 bg-white text-neutral-900 border-neutral-200 shadow-xl">
          {selectedRecordForDetails && (
            <div className="flex flex-col h-full space-y-4 overflow-hidden">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 text-xs font-semibold">
                      {selectedRecordForDetails.monthName || MONTH_NAMES[(selectedRecordForDetails.month || 1) - 1]} {selectedRecordForDetails.year}
                    </Badge>
                    <h2 className="text-lg font-bold text-neutral-900 tracking-tight">
                      {selectedRecordForDetails.title}
                    </h2>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                      Official Snapshot
                    </Badge>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">
                    SOUTHERN LEYTE STATE UNIVERSITY - HINUNANGAN CAMPUS • GENERAL DEDUCTION RECORDS
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => exportRecordToXlsx(selectedRecordForDetails)} 
                    className="bg-emerald-600 hover:bg-emerald-700 text-white border-none gap-1.5 text-xs font-medium shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Excel (.xlsx)
                  </Button>

                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setIsDetailsOpen(false)} 
                    className="text-neutral-400 hover:text-neutral-900 hover:bg-neutral-200/60"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              {/* General Deductions Spreadsheet - Matching Active Matrix Design */}
              {(() => {
                const entries = selectedRecordForDetails.recordData || [];
                const colTotals: { [colId: string]: number } = {};
                MATRIX_COLUMNS.forEach(c => { colTotals[c.id] = 0; });
                let totalOther = 0;
                let grandTotalDeductions = 0;

                entries.forEach((e: any) => {
                  const empDeds = e.deductions || [];
                  let rowTotal = 0;

                  MATRIX_COLUMNS.forEach(c => {
                    let amt = 0;
                    if (e[c.key] !== undefined) {
                      amt = Number(e[c.key] || 0);
                    } else {
                      amt = getDeductionAmountByCol(empDeds, c.id);
                    }
                    colTotals[c.id] += amt;
                    rowTotal += amt;
                  });

                  const otherAmt = getEmployeeOtherDeductionsAmount(empDeds);
                  totalOther += otherAmt;
                  rowTotal += otherAmt;

                  grandTotalDeductions += rowTotal;
                });

                return (
                  <div className="border border-neutral-200 rounded-xl bg-white shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
                    <div className="overflow-auto custom-scrollbar max-h-full w-full">
                      <table className="w-full border-collapse border-spacing-0 text-[11.5px]">
                        <thead className="sticky top-0 bg-white z-40">
                          {/* Header Row 1: Navy category and Spanning "DEDUCTIONS" Banner */}
                          <tr className="border-b-0 hover:bg-transparent">
                            <th 
                              rowSpan={2} 
                              className="sticky left-0 top-0 z-50 bg-[#12284c] text-white font-bold text-xs uppercase tracking-wider text-center align-middle border-r border-[#1a3a6b]"
                              style={{ minWidth: '60px', width: '60px', height: '64px' }}
                            >
                              Serial No.
                            </th>
                            <th 
                              rowSpan={2} 
                              className="sticky left-[60px] top-0 z-50 bg-[#12284c] text-white font-bold text-xs uppercase tracking-wider text-left align-middle border-r border-[#1a3a6b]"
                              style={{ minWidth: '220px', width: '220px' }}
                            >
                              Name
                            </th>
                            <th 
                              colSpan={MATRIX_COLUMNS.length + 2} 
                              className="sticky top-0 z-30 bg-rose-50 border-b border-rose-100 text-rose-800 text-center font-extrabold text-xs tracking-[0.25em] uppercase py-2 leading-none"
                              style={{ height: '34px' }}
                            >
                              DEDUCTIONS
                            </th>
                          </tr>

                          {/* Header Row 2: Sub-headers for specific deductions */}
                          <tr className="border-b border-neutral-200 hover:bg-transparent">
                            {MATRIX_COLUMNS.map((col) => (
                              <th 
                                key={col.id} 
                                className="sticky top-[34px] z-30 bg-rose-50/90 text-[#71161d] font-extrabold text-[10px] text-center leading-normal uppercase px-2 py-3 border-r border-rose-100/60"
                                style={{ minWidth: '130px', width: '140px', height: '34px' }}
                              >
                                {col.label}
                              </th>
                            ))}
                            <th 
                              className="sticky top-[34px] z-30 bg-rose-50/90 text-[#71161d] font-extrabold text-[10px] text-center leading-normal uppercase px-2 py-3 border-r border-rose-100/60"
                              style={{ minWidth: '120px', width: '130px' }}
                            >
                              OTHER DEDS
                            </th>
                            <th 
                              className="sticky top-[34px] z-30 bg-rose-100 text-rose-900 font-extrabold text-[10px] text-center leading-normal uppercase px-2 py-3"
                              style={{ minWidth: '135px', width: '145px' }}
                            >
                              TOTAL DEDUCTIONS
                            </th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-neutral-100 text-neutral-800">
                          {entries.length === 0 ? (
                            <tr>
                              <td colSpan={MATRIX_COLUMNS.length + 4} className="py-12 text-center text-neutral-500 font-medium">
                                No employee deduction rows recorded in this snapshot.
                              </td>
                            </tr>
                          ) : (
                            entries.map((e: any, idx: number) => {
                              const empDeds = e.deductions || [];
                              let empRowTotal = 0;
                              const empName = e.employeeName || `${e.lastName || ''}, ${e.firstName || ''}`.trim() || 'Employee';

                              return (
                                <tr key={e.employeeId || idx} className="hover:bg-neutral-50/60 transition-colors border-b border-neutral-100 group">
                                  {/* Serial Number */}
                                  <td 
                                    className="sticky left-0 z-20 font-mono text-xs text-center font-bold text-neutral-500 border-r border-[#1a3a6b]/20 bg-[#f9fafb] group-hover:bg-[#f3f4f6]"
                                    style={{ minWidth: '60px', width: '60px' }}
                                  >
                                    {idx + 1}
                                  </td>

                                  {/* Name */}
                                  <td 
                                    className="sticky left-[60px] z-20 font-medium text-xs border-r border-[#1a3a6b]/20 bg-white group-hover:bg-[#f9fafb] px-3 py-2.5"
                                    style={{ minWidth: '220px', width: '220px' }}
                                  >
                                    <div className="flex flex-col">
                                      <span className="font-bold text-neutral-800 leading-snug truncate block max-w-[200px]" title={empName}>
                                        {empName}
                                      </span>
                                      <span className="text-[10px] text-neutral-500 font-sans tracking-wide truncate block max-w-[200px]">
                                        {e.position || 'Staff'} • {e.category || 'STAFF'} • {e.employeeNo || e.employeeId || 'No ID'}
                                      </span>
                                    </div>
                                  </td>

                                  {/* Specific Deduction Columns */}
                                  {MATRIX_COLUMNS.map(col => {
                                    let amt = 0;
                                    if (e[col.key] !== undefined) {
                                      amt = Number(e[col.key] || 0);
                                    } else {
                                      amt = getDeductionAmountByCol(empDeds, col.id);
                                    }
                                    empRowTotal += amt;

                                    return (
                                      <td 
                                        key={col.id} 
                                        className={`text-right text-xs font-mono border-r border-neutral-100/60 px-3 py-3 select-none ${
                                          amt > 0 ? 'font-bold text-neutral-900 bg-[#fef2f2]/60' : 'text-neutral-300 font-normal'
                                        }`}
                                      >
                                        ₱{formatCurrency(amt)}
                                      </td>
                                    );
                                  })}

                                  {/* OTHER DEDUCTIONS Column */}
                                  {(() => {
                                    const otherAmt = getEmployeeOtherDeductionsAmount(empDeds);
                                    empRowTotal += otherAmt;
                                    return (
                                      <td 
                                        className={`text-right text-xs font-mono border-r border-neutral-100/60 px-3 py-3 select-none ${
                                          otherAmt > 0 ? 'font-bold text-neutral-900 bg-[#fef2f2]/60' : 'text-neutral-300 font-normal'
                                        }`}
                                      >
                                        ₱{formatCurrency(otherAmt)}
                                      </td>
                                    );
                                  })()}

                                  {/* TOTAL DEDUCTIONS Column */}
                                  <td className="text-right text-xs font-mono px-3 py-3 select-none font-extrabold text-rose-700 bg-rose-50/70 border-l border-rose-200">
                                    ₱{formatCurrency(empRowTotal)}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>

                        {/* Footer - Grand Totals */}
                        <tfoot className="sticky bottom-0 z-40 border-t-2 border-neutral-300 bg-neutral-100 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
                          <tr className="divide-x divide-neutral-200">
                            <td colSpan={2} className="p-2.5 text-center sticky left-0 z-50 bg-neutral-200 font-extrabold border-r border-neutral-300 text-neutral-800 text-[11px] uppercase tracking-wider">
                              GRAND TOTALS
                            </td>
                            {MATRIX_COLUMNS.map(col => (
                              <td key={col.id} className="p-2.5 text-right font-mono font-bold text-rose-800 text-[11.5px]">
                                ₱{formatCurrency(colTotals[col.id])}
                              </td>
                            ))}
                            <td className="p-2.5 text-right font-mono font-bold text-rose-800 text-[11.5px]">
                              ₱{formatCurrency(totalOther)}
                            </td>
                            <td className="p-2.5 text-right font-mono font-black text-white bg-rose-700 text-[12px]">
                              ₱{formatCurrency(grandTotalDeductions)}
                            </td>
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
    </div>
  );
};
