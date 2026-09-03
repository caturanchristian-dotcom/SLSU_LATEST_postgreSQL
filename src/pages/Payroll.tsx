import React, { useEffect, useState, useMemo } from 'react';
import { useRealtime } from '../hooks/useRealtime';
import { api } from '../lib/api';
import { useAuth } from '../components/AuthProvider';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import { 
  Plus, 
  Calendar as CalendarIcon, 
  ChevronRight, 
  ChevronLeft,
  Maximize2,
  Minimize2,
  Play, 
  CheckCircle2, 
  FileText,
  ArrowLeft,
  DollarSign,
  XCircle,
  Download,
  Search,
  Edit2,
  Save,
  X,
  Info,
  Trash2,
  UserPlus,
  FileSpreadsheet,
  Upload,
  Loader2,
  Database,
  Folder,
  Shield,
  ShieldCheck,
  UserCheck,
  Lock,
  Building2,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  Users,
  Clock,
  SlidersHorizontal,
  Calculator,
  Receipt,
  Check,
  Layers
} from 'lucide-react';
import { SLSU_CAMPUSES } from '../lib/constants';
import { PayrollRecords } from '../components/PayrollRecords';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from "../components/ui/badge";
import { toast } from 'sonner';
import { DeleteConfirmationDialog } from '../components/DeleteConfirmationDialog';
import { format, differenceInDays, isAfter, isBefore, startOfDay } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import XLSXStyle from 'xlsx-js-style';
import { formatCurrency, safeDateStr, safeDateOnly, safeSplit } from '../lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

const capitalizeName = (str: string): string => {
  if (!str) return '';
  return str
    .split(/\s+/)
    .map(word => {
      if (!word) return '';
      if (word.includes('-')) {
        return word
          .split('-')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join('-');
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

function formatEmployeeName(emp: { lastName: string; firstName: string; mi?: string; appellation?: string }): string {
  const lastName = capitalizeName((emp.lastName || '').trim());
  const firstName = capitalizeName((emp.firstName || '').trim());
  const appellation = (emp.appellation || '').trim();
  const mi = capitalizeName((emp.mi || '').trim());

  let nameStr = `${lastName}, ${firstName}`;
  if (appellation) {
    nameStr += ` ${appellation}`;
  }
  if (mi) {
    nameStr += ` ${mi}`;
    if (!mi.endsWith('.')) {
      nameStr += '.';
    }
  }
  nameStr += ' '; // Trailing space like "Baclayon, Jacinto Jr. P. "
  return nameStr;
}

function getEmployeeGroupAndGender(entry: any): { group: 'FACULTY' | 'STAFF' | 'OTHERS'; isMale: boolean } {
  const category = (entry.category || '').toUpperCase();
  const firstName = (entry.firstName || '').toUpperCase();
  const lastName = (entry.lastName || '').toUpperCase();

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
  // These are the exact females we identified from the DB + images:
  const femaleLastNames = [
    'AGAD', 'ALMINE', 'BATIANCILA', 'BRUN', 'BUGAIS-PAGOBO', 'CABERTE', 'CAPAPAS', 
    'CARBONILLA', 'CRUZADA', 'CUENCO', 'CUPAT', 'CUTA', 'MARUCOT', 'MEMBREVE', 'NUÑEZ', 
    'ORIAS', 'PAUG', 'PERNITES', 'PIAMONTE', 'PLANA', 'ROSOLADA', 'SINAHON', 'TIIN', 'DE LA CRUZ',
    'SALUDSOD'
  ];

  let isMale = true;

  if (entry.gender) {
    isMale = (entry.gender.toUpperCase() !== 'FEMALE');
  } else if (lastName === 'SINAHON') {
    if (firstName.includes('CHRESTIAN') || firstName.includes('JEDE')) {
      isMale = false;
    } else {
      isMale = true;
    }
  } else if (lastName === 'MANUN-OG' && firstName.includes('MADELYN')) {
    isMale = false;
  } else if (femaleLastNames.includes(lastName)) {
    isMale = false;
  }

  return { group, isMale };
}

const Payroll = () => {
  const { role, user } = useAuth();
  const [mainTab, setMainTab] = useState<'cycles' | 'records'>('cycles');
  const [cycles, setCycles] = useState<any[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [accountantsList, setAccountantsList] = useState<any[]>([]);
  const [filterManaged, setFilterManaged] = useState<'all' | 'my-managed'>('all');

  // Fetch accountants list
  useEffect(() => {
    const fetchAccountants = async () => {
      try {
        const users = await api.users.list();
        const accs = users.filter((u: any) => u.role === 'accountant');
        setAccountantsList(accs);
      } catch (e) {
        console.error('Failed to load accountants:', e);
      }
    };
    fetchAccountants();
  }, []);

  // Operational loaders
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDisbursing, setIsDisbursing] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isCreatingCycle, setIsCreatingCycle] = useState(false);
  const [isAddingEmployee, setIsAddingEmployee] = useState<string | null>(null);

  const isBatchManagedByMe = (cycle: any) => {
    if (role === 'admin') return true;
    if (!cycle) return false;
    if (!cycle.managedBy || cycle.managedBy === 'all') return true;
    if (user?.id && cycle.managedBy === user.id) return true;
    if (user?.email && String(cycle.managedBy).toLowerCase() === String(user.email).toLowerCase()) return true;
    if (user?.campus && cycle.campus !== 'All Campuses' && cycle.campus === user.campus) return true;
    return false;
  };

  const handleAssignAccountant = async (cycleId: string, managedBy?: string, managedByName?: string, campus?: string) => {
    try {
      const res = await api.payroll.assignAccountant(cycleId, { managedBy, managedByName, campus });
      toast.success('Managing accountant updated successfully!');
      fetchCycles();
      if (selectedCycle?.id === cycleId) {
        setSelectedCycle({
          ...selectedCycle,
          managedBy: res.managedBy,
          managedByName: res.managedByName,
          campus: res.campus
        });
      }
    } catch (e: any) {
      toast.error('Failed to reassign accountant: ' + e.message);
    }
  };

  const handleApproveBatch = async (cycleId: string) => {
    setIsApproving(true);
    try {
      const res = await api.payroll.approve(cycleId, {
        approvedBy: user?.displayName || 'Managing Accountant',
        userRole: role || undefined,
        userId: user?.id,
        userEmail: user?.email,
        userCampus: user?.campus
      });
      toast.success('Payroll batch list approved successfully!');
      fetchCycles();
      if (selectedCycle?.id === cycleId) {
        setSelectedCycle({ ...selectedCycle, status: 'approved', approvedBy: res.approvedBy || user?.displayName, approvedAt: res.approvedAt });
      }
    } catch (e: any) {
      toast.error('Approval failed: ' + e.message);
    } finally {
      setIsApproving(false);
    }
  };

  const handleRejectBatch = async (cycleId: string) => {
    setIsRejecting(true);
    try {
      await api.payroll.reject(cycleId, {
        rejectedBy: user?.displayName || 'Managing Accountant',
        userRole: role || undefined,
        userId: user?.id,
        userEmail: user?.email,
        userCampus: user?.campus
      });
      toast.success('Payroll batch list rejected!');
      fetchCycles();
      if (selectedCycle?.id === cycleId) {
        setSelectedCycle({ ...selectedCycle, status: 'rejected' });
      }
    } catch (e: any) {
      toast.error('Rejection failed: ' + e.message);
    } finally {
      setIsRejecting(false);
    }
  };

  const handleToggleValidateEntry = async (entryId: string, currentVal: number | boolean) => {
    try {
      const targetVal = !currentVal;
      await api.payroll.validateEntry(entryId, targetVal);
      toast.success(targetVal ? 'Computation validated successfully!' : 'Computation evaluation uncapped.');
      
      // Update local listing
      setEntries(entries.map(e => e.id === entryId ? { ...e, isValidated: targetVal ? 1 : 0 } : e));
    } catch (e: any) {
      toast.error('Failed to change validation indicator: ' + e.message);
    }
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [showGsisFormula, setShowGsisFormula] = useState(false);
  const [showPhilhealthFormula, setShowPhilhealthFormula] = useState(false);
  const [showGrossFormula, setShowGrossFormula] = useState(false);
  const [showGsisPersonalFormula, setShowGsisPersonalFormula] = useState(false);
  const [showPagibigPersonalFormula, setShowPagibigPersonalFormula] = useState(false);
  const [showPhilhealthContFormula, setShowPhilhealthContFormula] = useState(false);
  const [showTaxWithheldFormula, setShowTaxWithheldFormula] = useState(false);
  const [cycleSearchTerm, setCycleSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'standard' | 'spreadsheet'>('spreadsheet');
  const [editingCell, setEditingCell] = useState<{ entryId: string; key: string } | null>(null);
  const [cellValue, setCellValue] = useState<string>('');
  const [editValues, setEditValues] = useState({ overtime: 0, bonuses: 0, allowances: 0, otHours: 0, incentives: 0, teachingHours: 0 });
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [availableEmployees, setAvailableEmployees] = useState<any[]>([]);
  const [allEmployeesList, setAllEmployeesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingSlips, setIsExportingSlips] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'cycle' | 'entry' } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Excel deductions import states
  const [isDeductionPreviewOpen, setIsDeductionPreviewOpen] = useState(false);
  const [deductionPreviewData, setDeductionPreviewData] = useState<any[]>([]);
  const [isImportingDeductions, setIsImportingDeductions] = useState(false);
  const [deductionPreviewSearch, setDeductionPreviewSearch] = useState('');
  const [isDeductionDragging, setIsDeductionDragging] = useState(false);

  // Fullscreen and hover scroll states for General Payroll spreadsheet
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTableHovered, setIsTableHovered] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const tableContainerRef = React.useRef<HTMLDivElement>(null);

  const updateScrollButtons = () => {
    const el = tableContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 15);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 15);
  };

  const handleTableScroll = () => {
    updateScrollButtons();
  };

  const scrollTable = (direction: 'left' | 'right') => {
    const el = tableContainerRef.current;
    if (!el) return;
    const scrollAmount = Math.max(350, Math.floor(el.clientWidth * 0.6));
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      setIsFullscreen(true);
      try {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } catch {
        // Fallback for iframe sandbox
      }
    } else {
      setIsFullscreen(false);
      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      } catch {
        // Ignore
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        try {
          if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          }
        } catch {}
      }
    };
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isFullscreen]);

  useEffect(() => {
    const timer = setTimeout(() => {
      updateScrollButtons();
    }, 150);
    return () => clearTimeout(timer);
  }, [entries, searchTerm, isFullscreen, selectedCycle]);

  // New Cycle Form
  const [newCycle, setNewCycle] = useState({
    name: '',
    startDate: '',
    endDate: '',
    type: 'all',
    categoryFilter: 'all',
    managedBy: user?.role === 'accountant' ? user.id : 'accountant-1',
    managedByName: user?.role === 'accountant' ? user.displayName : 'System Accountant',
    campus: user?.campus || 'Hinunangan Campus'
  });

  // Dynamic deduction types from global deductions directory
  const [deductionTypes, setDeductionTypes] = useState<any[]>([]);

  // Employee Deductions Modal State
  const [selectedEntryForDeductions, setSelectedEntryForDeductions] = useState<any | null>(null);
  const [employeeDeductionsDraft, setEmployeeDeductionsDraft] = useState<{ [key: string]: number }>({});
  const [customDeductionName, setCustomDeductionName] = useState('');
  const [customDeductionAmount, setCustomDeductionAmount] = useState('');
  const [isSavingEmployeeDeductions, setIsSavingEmployeeDeductions] = useState(false);

  const standardDeductions = useMemo(() => [
    { key: 'dedPolicyLoan', label: 'GSIS Policy Loan', shortLabel: 'Policy Loan', org: 'GSIS', category: "DEDUCTIONS" },
    { key: 'dedConsolLoan', label: 'GSIS Consol Loan', shortLabel: 'Consol Loan', org: 'GSIS', category: "DEDUCTIONS" },
    { key: 'dedMplLite', label: 'GSIS MPL Lite', shortLabel: 'MPL Lite', org: 'GSIS', category: "DEDUCTIONS" },
    { key: 'dedMpl', label: 'GSIS Multipurpose Loan', shortLabel: 'MPL', org: 'GSIS', category: "DEDUCTIONS" },
    { key: 'dedCpl', label: 'GSIS Computer Loan', shortLabel: 'CPL', org: 'GSIS', category: "DEDUCTIONS" },
    { key: 'dedGfal', label: 'GSIS GFAL Loan', shortLabel: 'GFAL', org: 'GSIS', category: "DEDUCTIONS" },
    { key: 'dedEmergencyLoan', label: 'GSIS Emergency Loan', shortLabel: 'Emergency Loan', org: 'GSIS', category: "DEDUCTIONS" },
    { key: 'dedGsisPremPersonal', label: 'GSIS Personal Premium (9%)', shortLabel: 'Prem Personal', org: 'GSIS', category: "DEDUCTIONS", hasFormula: true, formulaDesc: '9% of Basic Salary' },
    { key: 'dedEducAsst', label: 'GSIS Educational Asst.', shortLabel: 'Educ Asst.', org: 'GSIS', category: "DEDUCTIONS" },
    { key: 'dedPagibigPersonal', label: 'Pag-IBIG Personal (2%)', shortLabel: 'Personal(EE)', org: 'PAG-IBIG', category: "DEDUCTIONS", hasFormula: true, formulaDesc: '2% of Basic Salary (Max 100/200)' },
    { key: 'dedPagibigMpl', label: 'Pag-IBIG MPL', shortLabel: 'MPL', org: 'PAG-IBIG', category: "DEDUCTIONS" },
    { key: 'dedSss', label: 'SSS Contribution', shortLabel: 'Contribution', org: 'SSS', category: "DEDUCTIONS" },
    { key: 'dedPagibigMp2', label: 'Pag-IBIG MP2', shortLabel: 'MP2 Savings', org: 'PAG-IBIG', category: "DEDUCTIONS" },
    { key: 'dedPhilhealthCont', label: 'PhilHealth Contribution (2.5%)', shortLabel: 'Cont (2.5%)', org: 'PHILHEALTH', category: "DEDUCTIONS", hasFormula: true, formulaDesc: '2.5% Employee Share' },
    { key: 'dedCsbLoan', label: 'China Bank Savings Loan', shortLabel: 'Sal. Loan', org: 'CSB', category: "DEDUCTIONS" },
    { key: 'dedTaxWithheld', label: 'Withholding Tax (BIR)', shortLabel: 'Withheld', org: 'TAX', category: "DEDUCTIONS", hasFormula: true, formulaDesc: 'TRAIN Law Withholding Tax Table' },
  ], []);

  const standardAliasSet = useMemo(() => new Set([
    'policyloan', 'consoloan', 'mpllite', 'mpl', 'cpl', 'gfal', 'emergencyloan', 'emrgyln',
    'gsisprem', 'gsispersonal', 'gsisprempersonal', 'educasst', 'pagibigpersonal', 'pagibigprem',
    'pagibigmpl', 'sss', 'mp2', 'pagibigmp2', 'philhealth', 'philhealthcont', 'csbloan', 'tax', 'taxwithheld'
  ]), []);

  const columnsList: { key: string; label: string; category: string; isReadOnly?: boolean }[] = useMemo(() => {
    const baseGov: { key: string; label: string; category: string; isReadOnly?: boolean }[] = [
      { key: 'govSecGsis', label: 'GSIS PREM', category: "GOV'T SHARES" },
      { key: 'govSecHdmf', label: 'HDMF PREM', category: "GOV'T SHARES" },
      { key: 'govSecPh', label: 'PHILHEALTH ES', category: "GOV'T SHARES" },
      { key: 'govSecEcip', label: 'ECIP', category: "GOV'T SHARES" },
    ];

    const baseComp: { key: string; label: string; category: string; isReadOnly?: boolean }[] = [
      { key: 'compSal2nd', label: 'Salaries and Wages-2nd Tranch', category: 'COMPENSATIONS' },
      { key: 'compPera', label: 'PERA', category: 'COMPENSATIONS' },
      { key: 'compGross', label: 'Gross Amount Earned', category: 'COMPENSATIONS', isReadOnly: true },
      { key: 'absences', label: 'Abs.', category: 'COMPENSATIONS' },
    ];

    const extraDeductionCols: { key: string; label: string; category: string; isReadOnly?: boolean }[] = [];
    const addedKeys = new Set(standardDeductions.map(d => d.key));

    // 1. Add custom deduction types from deduction_types table
    (Array.isArray(deductionTypes) ? deductionTypes : []).forEach(dt => {
      if (!dt?.name) return;
      const normalized = dt.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isStandard = standardAliasSet.has(normalized) || standardDeductions.some(s => s.label.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized);
      if (!isStandard) {
        const key = 'ded_' + dt.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        if (!addedKeys.has(key)) {
          addedKeys.add(key);
          extraDeductionCols.push({
            key,
            label: dt.name,
            category: "DEDUCTIONS"
          });
        }
      }
    });

    // 2. Add any extra deduction keys discovered in active entries
    entries.forEach(entry => {
      const allKeys = { ...(entry.deductions || {}), ...(entry.customValues || {}) };
      Object.keys(allKeys).forEach(k => {
        if (k.startsWith('ded_') || (k.startsWith('ded') && !addedKeys.has(k) && !baseGov.some(g => g.key === k) && !baseComp.some(c => c.key === k))) {
          if (!addedKeys.has(k)) {
            addedKeys.add(k);
            const cleanLabel = k.replace(/^ded_/, '').replace(/_/g, ' ').toUpperCase();
            extraDeductionCols.push({
              key: k,
              label: cleanLabel,
              category: "DEDUCTIONS"
            });
          }
        }
      });
    });

    return [...baseGov, ...baseComp, ...standardDeductions, ...extraDeductionCols];
  }, [deductionTypes, entries, standardDeductions, standardAliasSet]);

  const getCellValue = (entry: any, key: string) => {
    // 1. Resolve current active basic pay / wages (compSal2nd)
    const rawEmpSalary = Number(entry.basicSalary || entry.basic_salary || 0);
    const resolvedWages = Number(
      entry.customValues?.compSal2nd !== undefined 
        ? entry.customValues.compSal2nd 
        : (entry.compSal2nd !== undefined && entry.compSal2nd !== null && Number(entry.compSal2nd) > 0
            ? entry.compSal2nd 
            : (entry.basicPay !== undefined && entry.basicPay !== null && Number(entry.basicPay) > 0 
                ? entry.basicPay 
                : rawEmpSalary))
    );

    // 2. If there is a manual override for this specific column, that always wins
    if (entry.customValues && entry.customValues[key] !== undefined) {
      return Number(entry.customValues[key]);
    }

    // 3. For the primary wages column:
    if (key === 'compSal2nd') return resolvedWages;

    // 3b. For absences column:
    if (key === 'absences') return Number(entry.absences || 0);

    // 4. For dynamically computed components based on basicPay:
    if (key === 'govSecGsis') {
      const isRegular = entry.category === 'FACULTY' || entry.category === 'STAFF';
      return isRegular ? Number((resolvedWages * 0.12).toFixed(2)) : 0;
    }
    if (key === 'govSecPh') {
      return Number(((resolvedWages * 0.05) / 2).toFixed(2));
    }
    if (key === 'dedGsisPremPersonal') {
      const isRegular = entry.category === 'FACULTY' || entry.category === 'STAFF';
      return isRegular ? Number((resolvedWages * 0.09).toFixed(2)) : 0;
    }
    if (key === 'dedSss') {
      return (entry.category === 'Job Order' && entry.hasSss) ? Number((resolvedWages * 0.045).toFixed(2)) : 0;
    }
    if (key === 'dedPhilhealthCont') {
      const isRegular = entry.category === 'FACULTY' || entry.category === 'STAFF';
      return (isRegular || (entry.category === 'Job Order' && entry.hasPhilhealth)) 
        ? Number((resolvedWages * 0.025).toFixed(2)) : 0;
    }
    if (key === 'dedPagibigPersonal') {
      const isRegular = entry.category === 'FACULTY' || entry.category === 'STAFF';
      const hasPagibig = isRegular || (entry.category === 'Job Order' && entry.hasPagibig);
      return hasPagibig ? Number((resolvedWages * 0.02).toFixed(2)) : 0;
    }

    // 5. If it's cached in deductions, use that
    if (entry.deductions && entry.deductions[key] !== undefined) {
      return Number(entry.deductions[key]);
    }

    // 5b. Check normalized key match in deductions
    if (entry.deductions) {
      const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const [dK, dV] of Object.entries(entry.deductions)) {
        if (dK.toLowerCase().replace(/[^a-z0-9]/g, '') === normKey) {
          return Number(dV);
        }
      }
    }

    // 6. Dynamic Gross Pay calculation
    if (key === 'compGross') {
      const compPera = entry.customValues?.compPera !== undefined ? Number(entry.customValues.compPera) : (entry.compPera !== undefined ? Number(entry.compPera) : 2000.00);
      const absVal = Number(entry.customValues?.absences !== undefined ? entry.customValues.absences : (entry.absences || 0));
      const otVal = Number(entry.customValues?.overtime !== undefined ? entry.customValues.overtime : (entry.overtime || 0));
      const allowVal = Number(entry.customValues?.allowances !== undefined ? entry.customValues.allowances : (entry.allowances || 0));
      const bonusVal = Number(entry.customValues?.bonuses !== undefined ? entry.customValues.bonuses : (entry.bonuses || 0));
      const computed = Math.max(0, Number((resolvedWages + compPera - absVal + allowVal + otVal + bonusVal).toFixed(2)));
      if (computed > 0) return computed;
      if (Number(entry.grossPay || 0) > 0) return Number(entry.grossPay);
      return 0;
    }

    // 7. Static/Smart defaults
    if (key === 'compPera') return 2000.00;
    if (key === 'govSecHdmf') {
      const isRegular = entry.category === 'FACULTY' || entry.category === 'STAFF';
      const hasHdmf = isRegular || (entry.category === 'Job Order' && entry.hasPagibig);
      return hasHdmf ? 200.00 : 0;
    }
    if (key === 'govSecEcip') {
      const isRegular = entry.category === 'FACULTY' || entry.category === 'STAFF';
      return isRegular ? 100.00 : 0;
    }

    return 0;
  };

  const startEditCell = (entryId: string, key: string, currentVal: any) => {
    setEditingCell({ entryId, key });
    setCellValue(String(currentVal ?? ''));
  };

  const handleSaveCell = async (entryId: string, key: string) => {
    if (!editingCell) return;
    const numVal = parseFloat(cellValue) || 0;
    setEditingCell(null);
    
    // Optimistic UI update
    setEntries(prev => prev.map(e => {
      if (e.id === entryId) {
        const updatedCustom = { ...(e.customValues || {}), [key]: numVal };
        const updatedEntry = {
          ...e,
          customValues: updatedCustom
        };
        if (key === 'compSal2nd') {
          updatedEntry.basicPay = numVal;
          updatedEntry.compSal2nd = numVal;
        }
        if (key === 'absences') updatedEntry.absences = numVal;
        if (key === 'overtime') updatedEntry.overtime = numVal;
        if (key === 'allowances') updatedEntry.allowances = numVal;
        if (key === 'bonuses') updatedEntry.bonuses = numVal;
        return updatedEntry;
      }
      return e;
    }));

    try {
      const res = await api.payroll.updateEntry(entryId, {
        customValues: { [key]: numVal }
      });
      if (res?.cycleTotals && selectedCycle) {
        setSelectedCycle((prev: any) => prev ? {
          ...prev,
          totalGross: res.cycleTotals.totalGross,
          totalDeductions: res.cycleTotals.totalDeductions,
          totalNet: res.cycleTotals.totalNet
        } : prev);
      }
      fetchEntries();
    } catch (e: any) {
      toast.error("Failed to update: " + e.message);
    }
  };

  const openEmployeeDeductionsModal = (entry: any) => {
    setSelectedEntryForDeductions(entry);
    const draft: { [key: string]: number } = {};
    
    // Populate all standard deduction columns
    standardDeductions.forEach(col => {
      draft[col.key] = getCellValue(entry, col.key);
    });

    // Populate any custom overrides or deduction entries
    if (entry.customValues) {
      Object.entries(entry.customValues).forEach(([k, v]) => {
        if (k.startsWith('ded') || !['compSal2nd', 'compPera', 'compGross', 'absences'].includes(k)) {
          draft[k] = Number(v || 0);
        }
      });
    }
    if (entry.deductions) {
      Object.entries(entry.deductions).forEach(([k, v]) => {
        if (draft[k] === undefined && Number(v || 0) > 0) {
          draft[k] = Number(v || 0);
        }
      });
    }

    setEmployeeDeductionsDraft(draft);
    setCustomDeductionName('');
    setCustomDeductionAmount('');
  };

  const handleSaveEmployeeDeductions = async () => {
    if (!selectedEntryForDeductions) return;
    setIsSavingEmployeeDeductions(true);
    try {
      const entryId = selectedEntryForDeductions.id;
      // Update locally in optimistic state
      setEntries(prev => prev.map(e => {
        if (e.id === entryId) {
          const updatedCustom = { ...(e.customValues || {}), ...employeeDeductionsDraft };
          return {
            ...e,
            customValues: updatedCustom,
            deductions: { ...(e.deductions || {}), ...employeeDeductionsDraft }
          };
        }
        return e;
      }));

      const res = await api.payroll.updateEntry(entryId, {
        customValues: employeeDeductionsDraft
      });

      if (res?.cycleTotals && selectedCycle) {
        setSelectedCycle((prev: any) => prev ? {
          ...prev,
          totalGross: res.cycleTotals.totalGross,
          totalDeductions: res.cycleTotals.totalDeductions,
          totalNet: res.cycleTotals.totalNet
        } : prev);
      }

      toast.success(`Deductions updated and synced for ${selectedEntryForDeductions.employeeName}`);
      setSelectedEntryForDeductions(null);
      fetchEntries();
    } catch (err: any) {
      toast.error("Failed to save deductions: " + err.message);
    } finally {
      setIsSavingEmployeeDeductions(false);
    }
  };

  const fetchDeductionTypes = async () => {
    try {
      const types = await api.deductions.listTypes();
      setDeductionTypes(types);
    } catch (err) {
      console.error("Failed to load deduction types", err);
    }
  };

  useEffect(() => {
    fetchCycles();
    fetchDeductionTypes();
  }, []);

  const handleRealtimeSync = () => {
    fetchCycles();
    fetchDeductionTypes();
    if (selectedCycle?.id) {
      fetchEntries();
    }
  };

  useRealtime('payroll_changed', handleRealtimeSync);
  useRealtime('deductions_changed', handleRealtimeSync);
  useRealtime('employees_changed', handleRealtimeSync);

  const fetchCycles = async () => {
    try {
      const data = await api.payroll.listCycles();
      if (Array.isArray(data)) {
        setCycles(data);
      } else {
        setCycles([]);
      }
    } catch (error: any) {
      console.error('Failed to fetch payroll cycles:', error);
      toast.error(error.message || 'Failed to fetch payroll cycles');
      setCycles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCycle?.id) {
      fetchEntries();
    }
  }, [selectedCycle?.id]);

  const fetchEntries = async () => {
    setEntriesLoading(true);
    try {
      const data = await api.payroll.getEntries(selectedCycle.id);
      setEntries(data);
      
      try {
        const allEmployees = await api.employees.list();
        setAllEmployeesList(allEmployees);
      } catch (err) {
        console.error("Could not load all active employees: ", err);
      }
      
      // Refresh cycle totals to get updated calculations from backend
      if (selectedCycle.status !== 'disbursed') {
        const updatedCycles = await api.payroll.listCycles();
        const updated = updatedCycles.find((c: any) => c.id === selectedCycle.id);
        if (updated) setSelectedCycle(updated);
      }
    } catch (error: any) {
      toast.error('Failed to fetch entries');
    } finally {
      setEntriesLoading(false);
    }
  };

  const fetchAvailableEmployees = async () => {
    try {
      const allEmployees = await api.employees.list();
      const currentEmployeeIds = entries.map(e => e.employeeId);
      const available = allEmployees.filter((emp: any) => 
        emp.status === 'active' && !currentEmployeeIds.includes(emp.id)
      );
      setAvailableEmployees(available);
    } catch (error: any) {
      toast.error('Failed to fetch available employees');
    }
  };

  const handleAddEmployee = async (employeeId: string) => {
    setIsAddingEmployee(employeeId);
    try {
      await api.payroll.addEmployee(selectedCycle.id, employeeId);
      toast.success('Employee added to cycle');
      fetchEntries();
      fetchAvailableEmployees();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsAddingEmployee(null);
    }
  };

  const handlePopulateCycle = async () => {
    if (!selectedCycle?.id) return;
    setEntriesLoading(true);
    try {
      await api.payroll.populate(selectedCycle.id);
      toast.success('Employees and deductions populated and computed successfully!');
      fetchEntries();
      fetchCycles();
    } catch (e: any) {
      toast.error('Failed to populate employees: ' + e.message);
    } finally {
      setEntriesLoading(false);
    }
  };

  const handleRemoveEmployee = async (entryId: string) => {
    setItemToDelete({ id: entryId, type: 'entry' });
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    
    setIsDeleting(true);
    try {
      if (itemToDelete.type === 'entry') {
        await api.payroll.deleteEntry(itemToDelete.id);
        toast.success('Employee removed from cycle');
        fetchEntries();
      } else {
        await api.payroll.deleteCycle(itemToDelete.id);
        toast.success('Payroll cycle deleted');
        if (selectedCycle?.id === itemToDelete.id) {
          setSelectedCycle(null);
        }
        fetchCycles();
      }
      setIsDeleteOpen(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsDeleting(false);
      setItemToDelete(null);
    }
  };

  const handleCreateCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingCycle(true);
    try {
      await api.payroll.createCycle(newCycle);
      toast.success('Payroll cycle created and entries generated');
      setIsAddOpen(false);
      fetchCycles();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsCreatingCycle(false);
    }
  };

  const handleProcessPayroll = async (cycle: any) => {
    setIsProcessing(true);
    try {
      toast.info('Payroll processing started...');
      await api.payroll.process(cycle.id);
      toast.success('Payroll processing completed');
      fetchCycles();
      // Refresh selected cycle
      const updatedCycles = await api.payroll.listCycles();
      const updated = updatedCycles.find((c: any) => c.id === cycle.id);
      setSelectedCycle(updated);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const processDeductionsFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = event.target?.result;
        let workbook;
        
        try {
          // 1. Try modern ArrayBuffer reading
          workbook = XLSX.read(data, { type: 'array', cellDates: true });
        } catch (arrayErr) {
          console.warn("ArrayBuffer read failed, trying legacy binary string fallback...", arrayErr);
          try {
            // 2. Fallback for formats like HTML-in-disguise or old XLS formats that parse better as binary strings
            const arr = new Uint8Array(data as ArrayBuffer);
            let binary = "";
            const len = arr.length;
            // Batch processing for speed
            const chunkSize = 65536;
            for (let i = 0; i < len; i += chunkSize) {
              const chunk = arr.subarray(i, i + chunkSize);
              binary += String.fromCharCode.apply(null, chunk as any);
            }
            workbook = XLSX.read(binary, { type: 'binary', cellDates: true });
          } catch (binaryErr) {
            throw new Error("Unable to parse file structure. Ensure the file is a valid Excel spreadsheet (.xlsx or .xls).");
          }
        }

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[];

        if (rawRows.length === 0) {
          toast.error('The selected sheet is empty');
          return;
        }

        // Helper to retrieve spreadsheet cells dynamically with extensive match lists
        const getValFromRow = (row: any[], keys: string[], headersList: string[]) => {
          for (const key of keys) {
            const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
            const colIdx = headersList.findIndex(h => typeof h === 'string' && h.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanKey);
            if (colIdx !== -1 && row[colIdx] !== undefined && row[colIdx] !== null) {
              return row[colIdx];
            }
          }
          return null;
        };

        // Smart employee matcher helper for import tools
        const matchEmployee = (
          exLast: string, 
          exFirst: string, 
          exFull: string, 
          emp: { lastName?: string; firstName?: string; employeeName?: string }
        ) => {
          const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();

          const stripSuffixes = (s: string) => {
            return String(s || '')
              .replace(/\b(jr\.?|sr\.?|iii|ii|iv|v|esq\.?|phd\.?|md\.?)\b/gi, '')
              .replace(/\s+/g, ' ')
              .trim();
          };

          const SURNAME_ALIASES: Record<string, string[]> = {
            'pille': ['plana', 'pilleplana', 'planapille'],
            'plana': ['pille', 'pilleplana', 'planapille'],
            'pilleplana': ['pille', 'plana'],
            'planapille': ['pille', 'plana'],
            'bugais': ['pagobo', 'bugaispagobo'],
            'pagobo': ['bugais', 'bugaispagobo'],
            'bugaispagobo': ['bugais', 'pagobo']
          };

          const areSurnamesMatching = (s1: string, s2: string): boolean => {
            const norm1 = norm(s1);
            const norm2 = norm(s2);
            if (!norm1 || !norm2) return false;
            if (norm1 === norm2) return true;
            if (norm1.length >= 3 && norm2.length >= 3) {
              if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
            }
            if (SURNAME_ALIASES[norm1]?.includes(norm2)) return true;
            if (SURNAME_ALIASES[norm2]?.includes(norm1)) return true;
            return false;
          };

          const areFirstNamesMatching = (f1: string, f2: string): boolean => {
            const norm1 = norm(f1);
            const norm2 = norm(f2);
            const clean1 = norm(stripSuffixes(f1));
            const clean2 = norm(stripSuffixes(f2));
            if (!clean1 || !clean2) return false;
            if (norm1 === norm2 || clean1 === clean2) return true;
            if (clean1.length >= 3 && clean2.length >= 3) {
              if (clean1.includes(clean2) || clean2.includes(clean1)) return true;
            }
            return false;
          };

          let empLast = emp.lastName || '';
          let empFirst = emp.firstName || '';

          if (!empLast && !empFirst && emp.employeeName) {
            const nameParts = emp.employeeName.split(',').map(p => p.trim());
            if (nameParts.length >= 2) {
              empLast = nameParts[0];
              empFirst = nameParts[1];
            } else {
              empLast = emp.employeeName;
            }
          }

          if (exLast && exFirst) {
            if (areSurnamesMatching(exLast, empLast) && areFirstNamesMatching(exFirst, empFirst)) return true;
          }

          const excelFull = exFull || (exLast && exFirst ? `${exLast}, ${exFirst}` : '');
          if (excelFull) {
            const excelFullNorm = norm(excelFull);
            const empFullNorm = norm(emp.employeeName || `${empLast}${empFirst}`);
            if (excelFullNorm && empFullNorm && excelFullNorm === empFullNorm) return true;

            if (excelFull.includes(',')) {
              const parts = excelFull.split(',').map(p => p.trim());
              if (parts.length >= 2) {
                if (areSurnamesMatching(parts[0], empLast) && areFirstNamesMatching(parts[1], empFirst)) return true;
              }
            }

            const words = excelFull.toLowerCase().split(/[\s,]+/).map(w => norm(w)).filter(Boolean);
            const cleanWords = stripSuffixes(excelFull).toLowerCase().split(/[\s,]+/).map(w => norm(w)).filter(Boolean);

            const hasSurname = words.some(w => areSurnamesMatching(w, empLast)) || cleanWords.some(w => areSurnamesMatching(w, empLast));
            const hasFirstName = words.some(w => areFirstNamesMatching(w, empFirst)) || cleanWords.some(w => areFirstNamesMatching(w, empFirst));

            if (hasSurname && hasFirstName) return true;
          }

          return false;
        };

        // Scan rows for a header
        let headerRowIndex = -1;
        for (let i = 0; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (Array.isArray(row)) {
            const hasHeaderIndicator = row.some(cell => {
              const str = String(cell || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
              return (
                str === 'bpno' || 
                str === 'bpnumber' ||
                str === 'bp' ||
                str === 'employeeid' ||
                str === 'idnumber' ||
                str === 'consoloan' || 
                str === 'consolidationloan' ||
                str === 'emrgyln' || 
                str === 'emergencyloan' ||
                str === 'gsisemergencyloan' ||
                str === 'gfal' ||
                str === 'mpl' || 
                str === 'cpl' ||
                str === 'mpllite' ||
                str === 'mplliterlp' ||
                str === 'employeename' || 
                str === 'fullname' ||
                str === 'lastname' ||
                str === 'familyname' ||
                str === 'surname' ||
                str === 'educasst' ||
                str === 'policyloan' ||
                str === 'gsisprem' ||
                str === 'gsisprempersonal' ||
                str === 'pagibigprem' ||
                str === 'pagibigpersonal' ||
                str === 'pagibigpersonalee' ||
                str === 'pagibigregular' ||
                str === 'pagibigee' ||
                str === 'pagibigmpl' ||
                str === 'sss' ||
                str === 'sssprem' ||
                str === 'mp2' ||
                str === 'pagibigmp2' ||
                str === 'philhealth' ||
                str === 'philhealthcont' ||
                str === 'philhealthee' ||
                str === 'csbloan' ||
                str === 'csbsalloan' ||
                str === 'tax' ||
                str === 'wtax' ||
                str === 'wtaxwithheld' ||
                str === 'taxwithheld' ||
                str === 'withholdingtax'
              );
            });
            if (hasHeaderIndicator) {
              headerRowIndex = i;
              break;
            }
          }
        }

        let headers: string[] = [];
        let dataRows: any[] = [];

        if (headerRowIndex !== -1) {
          headers = rawRows[headerRowIndex].map((h: any) => String(h || '').trim());
          dataRows = rawRows.slice(headerRowIndex + 1);
        } else {
          headers = rawRows[0] ? rawRows[0].map((h: any) => String(h || '').trim()) : [];
          dataRows = rawRows.slice(1);
        }

        let allEmployees: any[] = [];
        try {
          allEmployees = await api.employees.list();
          setAllEmployeesList(allEmployees);
        } catch (err) {
          console.error("Could not load all active employees: ", err);
        }

        const mapped = dataRows.map((row: any[]) => {
          if (!Array.isArray(row) || row.length === 0) return null;

          const bpnoVal = String(getValFromRow(row, [
            'bpno', 'bpNo', 'bp number', 'bp_number', 'employeeid', 'id', 'idnumber', 
            'employee id', 'id no', 'id_number', 'bp_no', 'bpno.', 'employee no', 
            'employee_no', 'emp no', 'emp_no', 'empno'
          ], headers) || '').trim();
          
          let lastName = String(getValFromRow(row, ['lastname', 'last name', 'surname', 'family name', 'last_name', 'sname'], headers) || '').trim();
          let firstName = String(getValFromRow(row, ['firstname', 'first name', 'given name', 'first_name', 'fname'], headers) || '').trim();
          const fullName = String(getValFromRow(row, ['fullname', 'full name', 'name', 'employee name', 'employeename', 'participant', 'employee', 'employee_name', 'participant name', 'name of employee'], headers) || '').trim();

          // Split name if first/last names are missing but we have combined fullName
          if (!lastName && !firstName && fullName) {
            const cleanName = fullName.trim();
            if (cleanName.includes(',')) {
              const parts = cleanName.split(',').map(p => p.trim());
              lastName = parts[0];
              const rest = parts[1] || '';
              const words = rest.split(/\s+/);
              const suffixes = ['jr', 'jr.', 'sr', 'sr.', 'iii', 'ii', 'iv', 'v'];
              let firstWords: string[] = [];
              for (const w of words) {
                const wLower = w.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (suffixes.includes(wLower)) continue;
                if (wLower.length === 1 || (wLower.length === 2 && w.endsWith('.'))) continue; // skip MI
                firstWords.push(w);
              }
              firstName = firstWords.join(' ');
            } else {
              const words = cleanName.split(/\s+/);
              if (words.length >= 2) {
                lastName = words[words.length - 1];
                firstName = words.slice(0, words.length - 1).join(' ');
              }
            }
          }

          let nameInExcel = '';
          if (lastName && firstName) {
            nameInExcel = `${lastName}, ${firstName}`;
          } else if (fullName) {
            nameInExcel = fullName;
          } else if (bpnoVal) {
            nameInExcel = `Employee (BPNo: ${bpnoVal})`;
          } else {
            return null; // Skip empty / non-identifiable row
          }

          // 1st Pass: Match current cycle entries
          let matchedEntry = entries.find((e: any) => {
            if (bpnoVal) {
              const cleanBpno = bpnoVal.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
              if (cleanBpno) {
                if (e.bpno && e.bpno.toLowerCase().replace(/[^a-z0-9]/g, '').trim() === cleanBpno) return true;
                if (e.friendlyEmployeeId && e.friendlyEmployeeId.toLowerCase().replace(/[^a-z0-9]/g, '').trim() === cleanBpno) return true;
                if (e.employeeId && e.employeeId.toLowerCase().replace(/[^a-z0-9]/g, '').trim() === cleanBpno) return true;
              }
            }
            return matchEmployee(lastName, firstName, fullName, e);
          });

          let isMatched = !!matchedEntry;
          let isAutoAdd = false;
          let matchedEntryId = matchedEntry?.id || null;
          let employeeName = matchedEntry?.employeeName || null;
          let friendlyEmployeeId = matchedEntry?.friendlyEmployeeId || null;
          let matchedEmployeeId: string | null = null;

          // 2nd Pass: Match with ALL active system employees if not found in cycle entries
          if (!isMatched && allEmployees.length > 0) {
            let matchedEmp = allEmployees.find((emp: any) => {
              if (bpnoVal) {
                const cleanBpno = bpnoVal.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
                if (cleanBpno) {
                  if (emp.bpno && emp.bpno.toLowerCase().replace(/[^a-z0-9]/g, '').trim() === cleanBpno) return true;
                  if (emp.employeeId && emp.employeeId.toLowerCase().replace(/[^a-z0-9]/g, '').trim() === cleanBpno) return true;
                  if (emp.id && emp.id.toLowerCase().replace(/[^a-z0-9]/g, '').trim() === cleanBpno) return true;
                }
              }
              return matchEmployee(lastName, firstName, fullName, emp);
            });

            if (matchedEmp) {
              isMatched = true;
              isAutoAdd = true;
              matchedEmployeeId = matchedEmp.id;
              matchedEntryId = `new-emp-${matchedEmp.id}`;
              employeeName = formatEmployeeName(matchedEmp);
              friendlyEmployeeId = matchedEmp.employeeNo || matchedEmp.employeeId || matchedEmp.bpno || null;
            }
          }

          // Build dynamic high-integrity deductions mapping object
          const deductionsObj: any = {};

          const addIfPresent = (field: string, keys: string[]) => {
            let isPresent = false;
            for (const key of keys) {
              const cleanK = key.toLowerCase().replace(/[^a-z0-9]/g, '');
              const colIdx = headers.findIndex(h => typeof h === 'string' && h.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanK);
              if (colIdx !== -1) {
                isPresent = true;
                break;
              }
            }
            if (isPresent) {
              const value = parseFloat(getValFromRow(row, keys, headers) || 0) || 0;
              deductionsObj[field] = value;
            }
          };

          addIfPresent('dedConsolLoan', ['consoloan', 'consol loan', 'consolidation loan', 'conso loan', 'consolidation', 'dedconsoloan']);
          addIfPresent('dedEmergencyLoan', ['emrgyln', 'gsis emergency loan', 'emergency loan', 'emrgy ln', 'emrgy_ln', 'emergency_loan', 'dedemergencyloan']);
          addIfPresent('dedGfal', ['gfal', 'gsis financial assistance loan', 'gsis financial assistance', 'gfal loan', 'dedgfal']);
          addIfPresent('dedMpl', ['mpl', 'multipurpose loan', 'multi purpose loan', 'multi-purpose loan', 'mpl loan', 'dedmpl', 'gsis multipurpose loan']);
          addIfPresent('dedCpl', ['cpl', 'computer purchase loan', 'computer loan', 'cpl loan', 'dedcpl', 'gsis computer loan', 'cpl_loan']);
          addIfPresent('dedMplLite', ['mpllite', 'mpl_lite', 'mpl-lite', 'mpl_lite rlp', 'mplliterlp', 'mpl lite', 'multi-purpose loan lite', 'dedmpllite', 'mpl_lite_rlp']);
          addIfPresent('dedEducAsst', ['educasst', 'educ_asst', 'educational assistance', 'educational assistance loan', 'educ asst', 'dededucasst', 'gsis educational assistance']);
          addIfPresent('dedPolicyLoan', ['policyloan', 'policy loan', 'gsis policy loan', 'policy_loan', 'dedpolicyloan']);
          addIfPresent('dedGsisPremPersonal', ['gsisprem', 'gsispersonal', 'gsisprempersonal', 'gsisEE', 'gsis personal', 'gsis contribution', 'gsis premium', 'gsis ee', 'dedgsisprempersonal', 'gsis prem personal', 'gsis personal share', 'gsis_prem', 'gsis personal premium']);
          addIfPresent('dedPagibigPersonal', ['pagibigprem', 'pagibigpersonal', 'pagibigpersonalee', 'pagibigregular', 'pagibigee', 'hdmfpersonal', 'hdmfpersonalee', 'hdmfee', 'pagibig regular', 'pagibig personal', 'pagibig contribution', 'pagibig premium', 'pagibig ee', 'hdmf personal', 'hdmf contribution', 'hdmf ee', 'dedpagibigpersonal', 'pag-ibig personal', 'pag-ibig ee', 'pag-ibig regular', 'pagibig_prem', 'hdmf premium', 'pag-ibig personal(ee)']);
          addIfPresent('dedPagibigMpl', ['pagibigmpl', 'pagibig_mpl', 'hdmf_mpl', 'pag-ibig mpl', 'dedpagibigmpl', 'hdmf mpl', 'pag-ibig mpl']);
          addIfPresent('dedSss', ['sss', 'dedsss', 'sss contribution', 'sss premium', 'sss ee', 'sss_prem', 'sss share']);
          addIfPresent('dedPagibigMp2', ['mp2', 'dedpagibigmp2', 'pagibig mp2', 'pag-ibig mp2', 'mp2 contribution', 'pagibig_mp2', 'hdmf mp2']);
          
          // Special mapping for PhilHealth EE: if no record exists in the imported XLS (column is absent or cell is blank), make it 0 (zero) per user's request
          const phKeys = ['philhealth', 'dedphilhealthcont', 'philhealth contribution', 'philhealth premium', 'philhealth ee', 'philhealth cont', 'philhealth_prem', 'ph_prem', 'phee', 'ph ee', 'philhealth ee share', 'philhealth cont.'];
          const phVal = getValFromRow(row, phKeys, headers);
          if (phVal !== null && phVal !== undefined && String(phVal).trim() !== '') {
            deductionsObj.dedPhilhealthCont = parseFloat(String(phVal)) || 0;
          } else {
            deductionsObj.dedPhilhealthCont = 0;
          }

          addIfPresent('dedCsbLoan', ['csbloan', 'dedcsbloan', 'csb loan', 'csb', 'csbsalloan', 'csb sal loan']);
          
          // Special mapping for Tax Withheld: if no record exists in the imported XLS (column is absent or cell is blank), make it 0 (zero) per user's request
          const taxKeys = ['tax', 'dedtaxwithheld', 'withholding tax', 'tax withheld', 'wtax', 'income tax', 'withholding_tax', 'tax_withheld', 'wtax withheld', 'withholding tax(ee)', 'taxwithheld'];
          const taxVal = getValFromRow(row, taxKeys, headers);
          if (taxVal !== null && taxVal !== undefined && String(taxVal).trim() !== '') {
            deductionsObj.dedTaxWithheld = parseFloat(String(taxVal)) || 0;
          } else {
            deductionsObj.dedTaxWithheld = 0;
          }

          // Special fields
          const wagesKeys = ['salariesandwages2ndtranch', 'salariesandwages', 'compSal2nd', 'comp_sal_2nd', 'wages', 'salary', 'basicsalary', 'basicsalary2ndtranch'];
          let hasWages = false;
          for (const key of wagesKeys) {
            const cleanK = key.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (headers.findIndex(h => typeof h === 'string' && h.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanK) !== -1) {
              hasWages = true;
              break;
            }
          }
          if (hasWages) {
            const wagesVal = parseFloat(getValFromRow(row, wagesKeys, headers) || 0) || 0;
            if (wagesVal > 0) {
              deductionsObj.compSal2nd = wagesVal;
            }
          }

          const peraKeys = ['pera', 'comppera', 'comp_pera', 'personaleconomicreliefallowance'];
          let hasPera = false;
          for (const key of peraKeys) {
            const cleanK = key.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (headers.findIndex(h => typeof h === 'string' && h.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanK) !== -1) {
              hasPera = true;
              break;
            }
          }
          if (hasPera) {
            const peraVal = parseFloat(getValFromRow(row, peraKeys, headers) || 0) || 0;
            if (peraVal > 0) {
              deductionsObj.compPera = peraVal;
            }
          }

          const absKeys = ['absences', 'abs', 'absval', 'tardiness', 'undertime'];
          let hasAbs = false;
          for (const key of absKeys) {
            const cleanK = key.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (headers.findIndex(h => typeof h === 'string' && h.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanK) !== -1) {
              hasAbs = true;
              break;
            }
          }
          if (hasAbs) {
            const absencesVal = parseFloat(getValFromRow(row, absKeys, headers) || 0) || 0;
            if (absencesVal > 0) {
              deductionsObj.absences = absencesVal;
            }
          }

          return {
            bpno: bpnoVal,
            lastName,
            firstName,
            nameInExcel,
            matchedEntryId,
            employeeName,
            friendlyEmployeeId,
            isMatched,
            isAutoAdd,
            matchedEmployeeId,
            deductions: deductionsObj
          };
        }).filter((item): item is NonNullable<typeof item> => Boolean(item));

        if (mapped.length === 0) {
          toast.error("No valid entries with matching headers found in Excel file.");
          return;
        }

        // Consolidate mapped rows by employee (update mode: don't sum, overwrite with latest row values)
        const consolidatedMapped: any[] = [];
        const seenMap = new Map<string, number>();

        for (const item of (mapped as any[])) {
          if (!item) continue;
          const key = item.matchedEntryId || item.matchedEmployeeId || item.bpno || item.nameInExcel;
          if (key && seenMap.has(key)) {
            const existingIdx = seenMap.get(key)!;
            const existingItem = consolidatedMapped[existingIdx] || {};
            consolidatedMapped[existingIdx] = {
              ...existingItem,
              ...item,
              deductions: {
                ...(existingItem.deductions || {}),
                ...(item.deductions || {})
              }
            };
          } else {
            seenMap.set(key, consolidatedMapped.length);
            consolidatedMapped.push(item);
          }
        }

        setDeductionPreviewData(consolidatedMapped);
        setIsDeductionPreviewOpen(true);
      } catch (err: any) {
        toast.error("Failed to parse file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImportDeductionsExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processDeductionsFile(files[0]);
    // Reset file input value
    e.target.value = '';
  };

  const handleConfirmImportDeductions = async () => {
    setIsImportingDeductions(true);
    try {
      const updates = deductionPreviewData
        .filter(r => r.isMatched && r.matchedEntryId)
        .map(r => ({
          id: r.matchedEntryId,
          employeeId: r.isAutoAdd ? r.matchedEmployeeId : null,
          customValues: r.deductions
        }));

      if (updates.length === 0) {
        toast.error("No matched employee records to update.");
        setIsImportingDeductions(false);
        return;
      }

      await api.payroll.importDeductions(selectedCycle.id, updates);
      toast.success(`Successfully imported deductions for ${updates.length} employee records!`);
      setIsDeductionPreviewOpen(false);
      fetchEntries(); // Refresh entries list and totals from server
    } catch (e: any) {
      toast.error("Failed to import deductions: " + e.message);
    } finally {
      setIsImportingDeductions(false);
    }
  };

  const handleSaveEntry = async (entryId: string) => {
    try {
      await api.payroll.updateEntry(entryId, {
        overtime: parseFloat(editValues.overtime as any) || 0,
        bonuses: parseFloat(editValues.bonuses as any) || 0,
        allowances: parseFloat(editValues.allowances as any) || 0,
        otHours: parseFloat(editValues.otHours as any) || 0,
        incentives: parseFloat(editValues.incentives as any) || 0,
        teachingHours: parseFloat(editValues.teachingHours as any) || 0,
      });
      toast.success('Entry updated');
      setEditingEntryId(null);
      fetchEntries();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getCycleProgress = (start: string, end: string) => {
    const today = startOfDay(new Date());
    const startDate = startOfDay(new Date(start));
    const endDate = startOfDay(new Date(end));
    
    const totalDays = differenceInDays(endDate, startDate) + 1;
    const elapsedDays = differenceInDays(today, startDate) + 1;
    
    if (isNaN(totalDays) || totalDays <= 0) return { percent: 0, elapsed: 0, total: 0, status: 'error' };
    
    if (isBefore(today, startDate)) return { percent: 0, elapsed: 0, total: totalDays, status: 'upcoming' };
    if (isAfter(today, endDate)) return { percent: 100, elapsed: totalDays, total: totalDays, status: 'ended' };
    
    const percent = Math.min(Math.max((elapsedDays / totalDays) * 100, 0), 100);
    return { percent: isNaN(percent) ? 0 : percent, elapsed: elapsedDays, total: totalDays, status: 'active' };
  };

  const generatePayslip = (entry: any) => {
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
    doc.text(`Employee ID: ${entry.employeeNo || entry.friendlyEmployeeId || entry.employeeId}`, 20, 62);
    doc.text(`Payroll Period: ${selectedCycle.name}`, 20, 69);
    doc.text(`Date Generated: ${format(new Date(), 'MMM dd, yyyy')}`, 20, 76);
    
    // Earnings Table
    let earningsRows: any[] = [];
    if (entry.category === 'FACULTY' || entry.category === 'STAFF') {
      earningsRows = [
        ['Basic Salary', `PHP ${formatCurrency(entry.basicPay)}`],
        ['Allowances', `PHP ${formatCurrency(entry.allowances || 0)}`],
        ['Overtime (' + (entry.otHours || 0) + ' hrs)', `PHP ${formatCurrency(entry.overtime || 0)}`],
        ['Bonuses', `PHP ${formatCurrency(entry.bonuses || 0)}`],
      ];
    } else if (entry.category === 'Job Order') {
      earningsRows = [
        ['Basic Pay', `PHP ${formatCurrency(entry.basicPay)}`],
        ['Allowances', `PHP ${formatCurrency(entry.allowances || 0)}`],
      ];
    } else if (entry.category === 'Visiting Instructor') {
      earningsRows = [
        ['Teaching Pay (' + (entry.teachingHours || 0) + ' hrs/units)', `PHP ${formatCurrency(entry.basicPay)}`],
        ['Incentives', `PHP ${formatCurrency(entry.incentives || 0)}`],
      ];
    } else {
      earningsRows = [
        ['Basic Pay', `PHP ${formatCurrency(entry.basicPay)}`],
        ['Overtime', `PHP ${formatCurrency(entry.overtime)}`],
        ['Bonuses', `PHP ${formatCurrency(entry.bonuses)}`],
      ];
    }

    earningsRows.push([
      { content: 'GROSS PAY', styles: { fontStyle: 'bold' } }, 
      { content: `PHP ${formatCurrency(entry.grossPay)}`, styles: { fontStyle: 'bold' } }
    ]);

    autoTable(doc, {
      startY: 90,
      head: [['EARNINGS', 'AMOUNT']],
      body: earningsRows,
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
    const humanDeductionsMap: { [k: string]: string } = {
      dedPolicyLoan: 'GSIS Policy Loan',
      dedConsolLoan: 'GSIS Consol Loan',
      dedMplLite: 'GSIS MPL Lite',
      dedMpl: 'GSIS Multipurpose Loan (MPL)',
      dedCpl: 'GSIS Computer Loan (CPL)',
      dedGfal: 'GSIS GFAL Loan',
      dedEmergencyLoan: 'GSIS Emergency Loan',
      dedGsisPremPersonal: 'GSIS Personal Premium (9%)',
      dedEducAsst: 'GSIS Educational Assistance',
      dedPagibigPersonal: 'Pag-IBIG Personal Regular (2%)',
      dedPagibigMpl: 'Pag-IBIG Multi-Purpose Loan (MPL)',
      dedSss: 'SSS Contribution/Loan',
      dedPagibigMp2: 'Pag-IBIG MP2 Savings',
      dedPhilhealthCont: 'PhilHealth Contribution (2.5%)',
      dedCsbLoan: 'China Bank Savings Loan (CSB)',
      dedTaxWithheld: 'BIR Withholding Tax',
    };

    const activeDeductionEntries: [string, number][] = [];
    columnsList.filter(col => col.category === 'DEDUCTIONS').forEach(col => {
      const val = getCellValue(entry, col.key);
      if (val > 0) {
        const readableName = humanDeductionsMap[col.key] || col.label;
        activeDeductionEntries.push([readableName, val]);
      }
    });

    const deductionRows = activeDeductionEntries.map(([name, amount]) => [
      name, 
      `PHP ${formatCurrency(amount)}`
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['DEDUCTIONS', 'AMOUNT']],
      body: [
        ...(deductionRows.length > 0 ? deductionRows : [['No active deductions', 'PHP 0.00']]),
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
    
    doc.save(`Payslip_${entry.employeeNo || entry.friendlyEmployeeId || entry.employeeId}_${selectedCycle.name}.pdf`);
    toast.success('Payslip downloaded');
  };

  const downloadAllPDF = () => {
    if (entries.length === 0) {
      toast.error('No entries to download');
      return;
    }

    setIsExportingSlips(true);
    setTimeout(() => {
      try {
        const doc = new jsPDF();
        
        const humanDeductionsMap: { [k: string]: string } = {
          dedPolicyLoan: 'GSIS Policy Loan',
          dedConsolLoan: 'GSIS Consol Loan',
          dedMplLite: 'GSIS MPL Lite',
          dedMpl: 'GSIS Multipurpose Loan (MPL)',
          dedCpl: 'GSIS Computer Loan (CPL)',
          dedGfal: 'GSIS GFAL Loan',
          dedEmergencyLoan: 'GSIS Emergency Loan',
          dedGsisPremPersonal: 'GSIS Personal Premium (9%)',
          dedEducAsst: 'GSIS Educational Assistance',
          dedPagibigPersonal: 'Pag-IBIG Personal Regular (2%)',
          dedPagibigMpl: 'Pag-IBIG Multi-Purpose Loan (MPL)',
          dedSss: 'SSS Contribution/Loan',
          dedPagibigMp2: 'Pag-IBIG MP2 Savings',
          dedPhilhealthCont: 'PhilHealth Contribution (2.5%)',
          dedCsbLoan: 'China Bank Savings Loan (CSB)',
          dedTaxWithheld: 'BIR Withholding Tax',
        };

        entries.forEach((entry, index) => {
          if (index > 0) doc.addPage();
          
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
          doc.text(`Employee ID: ${entry.employeeNo || entry.friendlyEmployeeId || entry.employeeId}`, 20, 62);
          doc.text(`Payroll Period: ${selectedCycle.name}`, 20, 69);
          doc.text(`Date Generated: ${format(new Date(), 'MMM dd, yyyy')}`, 20, 76);
          
          // Earnings Table
          let earningsRows: any[] = [];
          if (entry.category === 'FACULTY' || entry.category === 'STAFF') {
            earningsRows = [
              ['Basic Salary', `PHP ${formatCurrency(getCellValue(entry, 'compSal2nd'))}`],
              ['PERA Allowance', `PHP ${formatCurrency(getCellValue(entry, 'compPera'))}`],
              ['Allowances', `PHP ${formatCurrency(entry.allowances || 0)}`],
              ['Overtime (' + (entry.otHours || 0) + ' hrs)', `PHP ${formatCurrency(entry.overtime || 0)}`],
              ['Bonuses / Incentives', `PHP ${formatCurrency(entry.bonuses || 0)}`],
            ];
            if (getCellValue(entry, 'absences') > 0) {
              earningsRows.push(['Less: Absences / Tardiness', `-PHP ${formatCurrency(getCellValue(entry, 'absences'))}`]);
            }
          } else if (entry.category === 'Job Order') {
            earningsRows = [
              ['Basic Wages', `PHP ${formatCurrency(getCellValue(entry, 'compSal2nd'))}`],
              ['Allowances', `PHP ${formatCurrency(entry.allowances || 0)}`],
            ];
            if (getCellValue(entry, 'absences') > 0) {
              earningsRows.push(['Less: Absences / Tardiness', `-PHP ${formatCurrency(getCellValue(entry, 'absences'))}`]);
            }
          } else if (entry.category === 'Visiting Instructor') {
            earningsRows = [
              ['Teaching Pay (' + (entry.teachingHours || 0) + ' hrs/units)', `PHP ${formatCurrency(getCellValue(entry, 'compSal2nd'))}`],
              ['Incentives', `PHP ${formatCurrency(entry.incentives || 0)}`],
            ];
          } else {
            earningsRows = [
              ['Basic Pay', `PHP ${formatCurrency(getCellValue(entry, 'compSal2nd'))}`],
              ['PERA Allowance', `PHP ${formatCurrency(getCellValue(entry, 'compPera'))}`],
              ['Overtime', `PHP ${formatCurrency(entry.overtime || 0)}`],
              ['Bonuses', `PHP ${formatCurrency(entry.bonuses || 0)}`],
            ];
          }

          const entryGross = getCellValue(entry, 'compGross');
          earningsRows.push([
            { content: 'GROSS PAY', styles: { fontStyle: 'bold' } }, 
            { content: `PHP ${formatCurrency(entryGross)}`, styles: { fontStyle: 'bold' } }
          ]);

          autoTable(doc, {
            startY: 90,
            head: [['EARNINGS', 'AMOUNT']],
            body: earningsRows,
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
          const activeDeductionEntries: [string, number][] = [];
          columnsList.filter(col => col.category === 'DEDUCTIONS').forEach(col => {
            const val = getCellValue(entry, col.key);
            if (val > 0) {
              const readableName = humanDeductionsMap[col.key] || col.label;
              activeDeductionEntries.push([readableName, val]);
            }
          });

          const deductionRows = activeDeductionEntries.map(([name, amount]) => [
            name, 
            `PHP ${formatCurrency(amount)}`
          ]);

          const totalDeds = activeDeductionEntries.reduce((sum, [, amt]) => sum + amt, 0);
          const computedNet = Number((entryGross - totalDeds).toFixed(2));

          autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 15,
            head: [['DEDUCTIONS', 'AMOUNT']],
            body: [
              ...(deductionRows.length > 0 ? deductionRows : [['No active deductions', 'PHP 0.00']]),
              [{ content: 'TOTAL DEDUCTIONS', styles: { fontStyle: 'bold' } }, { content: `PHP ${formatCurrency(totalDeds)}`, styles: { fontStyle: 'bold' } }],
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
          doc.text(`NET PAY: PHP ${formatCurrency(computedNet)}`, 190, finalY, { align: 'right' });
          
          // Footer
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100);
          doc.text('This is a system-generated document.', 105, 285, { align: 'center' });
        });
        
        doc.save(`All_Payslips_${selectedCycle.name}.pdf`);
        toast.success('All payslips downloaded as PDF');
      } catch (error: any) {
        console.error('All Slips Generation Error:', error);
        toast.error('Failed to generate all payslips');
      } finally {
        setIsExportingSlips(false);
      }
    }, 50);
  };

  const downloadTablePDF = () => {
    if (entries.length === 0) {
      toast.error('No entries to download');
      return;
    }

    setIsExportingPDF(true);
    setTimeout(() => {
      try {
        const doc = new jsPDF('l', 'mm', 'a4'); // Landscape
        const pageWidth = doc.internal.pageSize.getWidth();
        
        // Basic Header
        doc.setFillColor(30, 30, 30); 
        doc.rect(0, 0, pageWidth, 35, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.text('SLSU PAYROLL SYSTEM', 15, 15);
        
        doc.setFontSize(10);
        doc.text(`PAYROLL REPORT: ${selectedCycle.name.toUpperCase()}`, 15, 25);
        
        doc.setFontSize(8);
        doc.text(`PERIOD: ${format(new Date(selectedCycle.startDate), 'MMM dd')} - ${format(new Date(selectedCycle.endDate), 'MMM dd, yyyy')}`, 15, 30);

        // Get deduction columns
        const dedCols = columnsList.filter(col => col.category === 'DEDUCTIONS');

        const headers = [
          'NO.',
          'EMPLOYEE NAME', 
          'EMP. NO', 
          'BASIC / WAGES', 
          'PERA',
          'GROSS', 
          ...dedCols.map(d => d.label.length > 12 ? d.label.substring(0, 10) + '..' : d.label), 
          'TOTAL DED', 
          'NET PAY',
          '1ST HALF',
          '2ND HALF'
        ];

        let totalCycleNet = 0;

        const tableData = entries.map((e, idx) => {
          const basic = getCellValue(e, 'compSal2nd');
          const pera = getCellValue(e, 'compPera');
          const gross = getCellValue(e, 'compGross');
          
          const dedValues = dedCols.map(col => getCellValue(e, col.key));
          const totalDed = dedValues.reduce((sum, v) => sum + v, 0);
          const net = Number((gross - totalDed).toFixed(2));
          totalCycleNet += net;
          const firstHalf = Number((net / 2).toFixed(2));
          const secondHalf = Number((net - firstHalf).toFixed(2));

          return [
            String(idx + 1),
            e.employeeName,
            e.employeeNo || e.friendlyEmployeeId || e.employeeId,
            formatCurrency(basic),
            formatCurrency(pera),
            formatCurrency(gross),
            ...dedValues.map(v => formatCurrency(v)),
            formatCurrency(totalDed),
            formatCurrency(net),
            formatCurrency(firstHalf),
            formatCurrency(secondHalf)
          ];
        });

        autoTable(doc, {
          startY: 40,
          head: [headers],
          body: tableData,
          theme: 'grid',
          headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255], fontSize: 6.5, fontStyle: 'bold' },
          styles: { fontSize: 5.5, cellPadding: 1.5 },
          margin: { left: 8, right: 8 },
          columnStyles: {
            0: { cellWidth: 8 },
            1: { cellWidth: 28 }, // Name
            2: { cellWidth: 16 }, // ID
          }
        });

        const finalY = (doc as any).lastAutoTable?.finalY || 150;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`TOTAL NET DISBURSEMENT: PHP ${formatCurrency(totalCycleNet || selectedCycle.totalNet)}`, pageWidth - 15, finalY + 12, { align: 'right' });

        // Manual download to bypass potential doc.save() issues
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Payroll_Report_${selectedCycle.name.replace(/[^a-z0-9]/gi, '_')}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        toast.success('Payroll report downloaded');
      } catch (error) {
        console.error('PDF Generation Error:', error);
        toast.error('Failed to generate PDF');
      } finally {
        setIsExportingPDF(false);
      }
    }, 50);
  };

  const performExcelGeneration = () => {
    if (entries.length === 0) {
      toast.error('No entries to download');
      return;
    }

    const titleRows = [
      // Row 0
      ['GENERAL PAYROLL', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      // Row 1
      [`For the month of ${format(new Date(selectedCycle.startDate), 'MMMM, yyyy').toUpperCase()}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      // Row 2: Info row: Left, center, right
      [
        'Entity Name : Southern Leyte State University, Hinunangan Campus', '', '', '', '', '', '', '',
        'Fund Cluster : 01', '', '', '', '', '', '', '',
        'Payroll No. : _________________', '', '', '', '', '', '',
        'Sheet 1 of 1 Sheets', '', '', '', '', '', '', ''
      ],
      // Row 3: receipt disclaimer
      ['We acknowledge receipt of cash shown opposite our name as full compensation for services rendered for the period covered.', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      // Row 4: Blank spacer
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
    ];

    const headerRow5 = [
      'No.',
      'Name of Employee',
      'Position',
      'Emp. No.',
      "GOVERNMENT'S SHARE", '', '', '',
      'COMPENSATIONS', '', '',
      'DEDUCTIONS', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      'Net Amount Due',
      'Signature of Recipient'
    ];

    const headerRow6 = [
      '',
      '',
      '',
      '',
      'GSIS PREM', 'HDMF PREM', 'PHILHEALTH ES', 'ECIP',
      'Salaries and Wages-2nd Tranch', 'PERA', 'Gross Amount Earned',
      'Absences', 'GSIS PREM Policy', 'GSIS PREM Consol', 'GSIS PREM MPL Lite', 'GSIS PREM MPL', 'GSIS PREM CPL', 'GSIS PREM GFAL', 'GSIS PREM Emergency', 'GSIS PREM PERSONAL', 'GSIS PREM Educ', 'HDMF PREM PERSONAL(EE)', 'HDMF PREM MPL', 'SSS', 'HDMF PREM MP2', 'PHILHEALTH ES CONT', 'CSB Sal', 'TAX', 'TOTAL',
      '',
      ''
    ];

    const headerRow7 = [
      '',
      '',
      '',
      '',
      '', '', '', '',
      '', '', '',
      '', 'Loan', 'Loan', '', 'Loan', 'Loan', 'Loan', 'Loan', '', 'Asst.', '', 'Loan', 'Contribution', 'Loan', '', 'Loan', 'WITHHELD', 'DEDUCTION',
      '',
      ''
    ];

    // Partition entries for beautiful grouping
    const facultyMale: any[] = [];
    const facultyFemale: any[] = [];
    const staffMale: any[] = [];
    const staffFemale: any[] = [];
    const others: any[] = [];

    for (const entry of entries) {
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

    const sortByName = (a: any, b: any) => a.employeeName.localeCompare(b.employeeName);
    facultyMale.sort(sortByName);
    facultyFemale.sort(sortByName);
    staffMale.sort(sortByName);
    staffFemale.sort(sortByName);
    others.sort(sortByName);

    const sheetData: any[] = [];
    sheetData.push(...titleRows);
    sheetData.push(headerRow5, headerRow6, headerRow7);

    const sectionHeaderRowIndices: number[] = [];
    const dataRowIndices: number[] = [];

    const sections = [
      { label: 'FACULTY: MALE', entries: facultyMale, isGenderSub: false },
      { label: 'Female:', entries: facultyFemale, isGenderSub: true },
      { label: 'STAFF: MALE', entries: staffMale, isGenderSub: false },
      { label: 'Female:', entries: staffFemale, isGenderSub: true },
      { label: 'OTHERS', entries: others, isGenderSub: false }
    ].filter(sect => sect.entries.length > 0);

    let globalIdx = 1;

    sections.forEach(section => {
      // Add section group header row
      const sectionLabelRow = Array(31).fill('');
      sectionLabelRow[1] = section.label;
      sectionHeaderRowIndices.push(sheetData.length);
      sheetData.push(sectionLabelRow);

      section.entries.forEach(entry => {
        const totalDed = [
          'dedPolicyLoan', 'dedConsolLoan', 'dedMplLite', 'dedMpl', 'dedCpl', 'dedGfal', 
          'dedEmergencyLoan', 'dedGsisPremPersonal', 'dedEducAsst', 'dedPagibigPersonal', 
          'dedPagibigMpl', 'dedSss', 'dedPagibigMp2', 'dedPhilhealthCont', 'dedCsbLoan', 'dedTaxWithheld'
        ].reduce((sum, key) => sum + getCellValue(entry, key), 0);

        const netPayVal = Number((getCellValue(entry, 'compGross') - totalDed).toFixed(2));

        const row = [
          globalIdx,                                         // Col 0: No.
          entry.employeeName,                               // Col 1: Name
          entry.position || entry.category || 'No Position', // Col 2: Position
          entry.employeeNo || entry.friendlyEmployeeId || entry.employeeId,    // Col 3: Emp. No.
          getCellValue(entry, 'govSecGsis'),                // Col 4: GSIS PREM
          getCellValue(entry, 'govSecHdmf'),                // Col 5: HDMF PREM
          getCellValue(entry, 'govSecPh'),                  // Col 6: PHILHEALTH ES
          getCellValue(entry, 'govSecEcip'),                // Col 7: ECIP
          getCellValue(entry, 'compSal2nd'),                // Col 8: Salaries and Wages
          getCellValue(entry, 'compPera'),                  // Col 9: PERA
          getCellValue(entry, 'compGross'),                 // Col 10: Gross Amount
          getCellValue(entry, 'absences'),                  // Col 11: Absences (Abs.)
          getCellValue(entry, 'dedPolicyLoan'),             // Col 12: GSIS Policy Loan
          getCellValue(entry, 'dedConsolLoan'),             // Col 13: GSIS Consol Loan
          getCellValue(entry, 'dedMplLite'),                // Col 14: GSIS MPL Lite
          getCellValue(entry, 'dedMpl'),                    // Col 15: GSIS MPL
          getCellValue(entry, 'dedCpl'),                    // Col 16: GSIS CPL
          getCellValue(entry, 'dedGfal'),                   // Col 17: GSIS GFAL
          getCellValue(entry, 'dedEmergencyLoan'),          // Col 18: GSIS Emergency Loan
          getCellValue(entry, 'dedGsisPremPersonal'),       // Col 19: GSIS Personal Premium
          getCellValue(entry, 'dedEducAsst'),               // Col 20: GSIS Educ Asst
          getCellValue(entry, 'dedPagibigPersonal'),        // Col 21: Pag-IBIG Personal EE
          getCellValue(entry, 'dedPagibigMpl'),             // Col 22: Pag-IBIG MPL
          getCellValue(entry, 'dedSss'),                    // Col 23: SSS Contrib
          getCellValue(entry, 'dedPagibigMp2'),             // Col 24: Pag-IBIG MP2
          getCellValue(entry, 'dedPhilhealthCont'),         // Col 25: PhilHealth EE (PHILHLTH CONT)
          getCellValue(entry, 'dedCsbLoan'),                // Col 26: CSB Sal Loan
          getCellValue(entry, 'dedTaxWithheld'),            // Col 27: Tax Withheld
          Number(totalDed.toFixed(2)),                      // Col 28: TOTAL DEDUCTION
          netPayVal,                                         // Col 29: Net Amount Due
          globalIdx                                          // Col 30: Signature guide index
        ];

        dataRowIndices.push(sheetData.length);
        sheetData.push(row);
        globalIdx++;
      });
    });

    // Create and compute GRAND TOTAL Row
    const totalRow = Array(31).fill('');
    totalRow[1] = 'GRAND TOTAL';

    const sumValues = Array(31).fill(0);
    dataRowIndices.forEach(rIdx => {
      const rowData = sheetData[rIdx];
      for (let col = 4; col <= 29; col++) {
        sumValues[col] += Number(rowData[col] || 0);
      }
    });

    for (let col = 4; col <= 29; col++) {
      totalRow[col] = Number(sumValues[col].toFixed(2));
    }

    const grandTotalRowIndex = sheetData.length;
    sheetData.push(totalRow);

    // Insert spacing for signature section
    sheetData.push([]);
    sheetData.push([]);

    const sigRowIndex1 = sheetData.length;
    const sigRow1 = Array(31).fill('');
    sigRow1[1] = 'Prepared By:';
    sigRow1[8] = 'Certified Correct:';
    sigRow1[19] = 'Approved for Payment:';
    sheetData.push(sigRow1);

    sheetData.push([]);
    sheetData.push([]);

    const sigRowIndex2 = sheetData.length;
    const sigRow2 = Array(31).fill('');
    sigRow2[1] = '________________________';
    sigRow2[8] = '________________________';
    sigRow2[19] = '________________________';
    sheetData.push(sigRow2);

    const sigRowIndex3 = sheetData.length;
    const sigRow3 = Array(31).fill('');
    sigRow3[1] = 'Payroll Clerk';
    sigRow3[8] = 'Campus Accountant';
    sigRow3[19] = 'Campus Director';
    sheetData.push(sigRow3);

    // Convert aoa to worksheet using XLSXStyle
    const worksheet = XLSXStyle.utils.aoa_to_sheet(sheetData);

    const merges = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 30 } }, // Title
      { s: { r: 1, c: 0 }, e: { r: 1, c: 30 } }, // Subtitle
      { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },  // Entity Name
      { s: { r: 2, c: 8 }, e: { r: 2, c: 13 } }, // Fund Cluster
      { s: { r: 2, c: 14 }, e: { r: 2, c: 21 } },// Payroll No
      { s: { r: 2, c: 22 }, e: { r: 2, c: 30 } },// Sheet info
      { s: { r: 3, c: 0 }, e: { r: 3, c: 30 } }, // Disclaimer
      { s: { r: 4, c: 0 }, e: { r: 4, c: 30 } }, // Spacer

      // Multi-layer table headers
      { s: { r: 5, c: 0 }, e: { r: 7, c: 0 } },  // No.
      { s: { r: 5, c: 1 }, e: { r: 7, c: 1 } },  // Name
      { s: { r: 5, c: 2 }, e: { r: 7, c: 2 } },  // Position
      { s: { r: 5, c: 3 }, e: { r: 7, c: 3 } },  // Emp. No.

      { s: { r: 5, c: 4 }, e: { r: 5, c: 7 } },  // Gov Share
      { s: { r: 5, c: 8 }, e: { r: 5, c: 10 } }, // Compensation
      { s: { r: 5, c: 11 }, e: { r: 5, c: 28 } },// Deductions

      { s: { r: 5, c: 29 }, e: { r: 7, c: 29 } },// Net Pay
      { s: { r: 5, c: 30 }, e: { r: 7, c: 30 } } // Signature
    ];

    // Merges for section label rows
    sectionHeaderRowIndices.forEach(rIdx => {
      merges.push({ s: { r: rIdx, c: 0 }, e: { r: rIdx, c: 30 } });
    });

    worksheet['!merges'] = merges;

    // Create and instantiate all empty cells to style them correctly
    const maxRow = sheetData.length;
    for (let r = 0; r < maxRow; r++) {
      for (let c = 0; c < 31; c++) {
        const cellRef = XLSXStyle.utils.encode_cell({ r, c });
        if (!worksheet[cellRef]) {
          worksheet[cellRef] = { t: "s", v: "" };
        }
      }
    }

    // Apply specific styles
    // 1. GENERAL PAYROLL title (Arial Narrow, bold, size 16)
    for (let c = 0; c < 31; c++) {
      const cellRef = XLSXStyle.utils.encode_cell({ r: 0, c });
      worksheet[cellRef].s = {
        font: { name: "Arial Narrow", sz: 16, bold: true, color: { rgb: "000000" } },
        alignment: { horizontal: "center", vertical: "center" }
      };
    }

    // 2. Month title
    for (let c = 0; c < 31; c++) {
      const cellRef = XLSXStyle.utils.encode_cell({ r: 1, c });
      worksheet[cellRef].s = {
        font: { name: "Arial Narrow", sz: 11, bold: true, color: { rgb: "000000" } },
        alignment: { horizontal: "center", vertical: "center" }
      };
    }

    // 3. Info labels (Entity Name, Fund, Payroll No, Sheet)
    for (let c = 0; c < 31; c++) {
      const cellRef = XLSXStyle.utils.encode_cell({ r: 2, c });
      let align = "left";
      if (c >= 22) align = "right";
      worksheet[cellRef].s = {
        font: { name: "Arial Narrow", sz: 9.5, bold: true, color: { rgb: "000000" } },
        alignment: { horizontal: align, vertical: "center" }
      };
    }

    // 4. Receipt disclaimer
    for (let c = 0; c < 31; c++) {
      const cellRef = XLSXStyle.utils.encode_cell({ r: 3, c });
      worksheet[cellRef].s = {
        font: { name: "Arial Narrow", sz: 8.5, italic: true, color: { rgb: "333333" } },
        alignment: { horizontal: "center", vertical: "center" }
      };
    }

    // 5. Multi-layer table headers (Rows 5, 6, 7)
    for (let r = 5; r <= 7; r++) {
      for (let c = 0; c < 31; c++) {
        const cellRef = XLSXStyle.utils.encode_cell({ r, c });
        worksheet[cellRef].s = {
          font: { name: "Arial Narrow", sz: 8.5, bold: true, color: { rgb: "000000" } },
          fill: { fgColor: { rgb: "F2F2F2" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
          border: {
            bottom: { style: "thin", color: { rgb: "000000" } },
            top: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } }
          }
        };
      }
    }

    // 6. Section separation rows (e.g., "FACULTY: MALE")
    sectionHeaderRowIndices.forEach(rIdx => {
      for (let c = 0; c < 31; c++) {
        const cellRef = XLSXStyle.utils.encode_cell({ r: rIdx, c });
        worksheet[cellRef].s = {
          font: { name: "Arial Narrow", sz: 10, bold: true, italic: true, color: { rgb: "155724" } },
          fill: { fgColor: { rgb: "E6F4EA" } }, // Subtle pastoral green background
          alignment: { horizontal: "left", vertical: "center" },
          border: {
            bottom: { style: "thin", color: { rgb: "34D399" } },
            top: { style: "thin", color: { rgb: "34D399" } },
            left: { style: "thin", color: { rgb: "34D399" } },
            right: { style: "thin", color: { rgb: "34D399" } }
          }
        };
      }
    });

    // 7. General employee data rows
    dataRowIndices.forEach(rIdx => {
      const isAlt = rIdx % 2 === 1;
      const rowBgColor = isAlt ? "F9FBF9" : "FFFFFF"; // Extreme light ink-saver zebra tint

      for (let c = 0; c < 31; c++) {
        const cellRef = XLSXStyle.utils.encode_cell({ r: rIdx, c });
        const cellVal = worksheet[cellRef].v;
        const isNum = typeof cellVal === 'number';

        worksheet[cellRef].s = {
          font: { name: "Arial Narrow", sz: 10, color: { rgb: "000000" } },
          fill: { fgColor: { rgb: rowBgColor } },
          alignment: {
            horizontal: isNum ? "right" : (c === 0 || c === 3 || c === 30 ? "center" : "left"),
            vertical: "center"
          },
          border: {
            bottom: { style: "thin", color: { rgb: "E2E8F0" } },
            top: { style: "thin", color: { rgb: "E2E8F0" } },
            left: { style: "thin", color: { rgb: "E2E8F0" } },
            right: { style: "thin", color: { rgb: "E2E8F0" } }
          }
        };

        // Name and IDs highlighted slightly
        if (c === 1) {
          worksheet[cellRef].s.font.bold = true;
        }

        // Apply number format to wages / deductions / totals
        if (c >= 4 && c <= 29) {
          worksheet[cellRef].z = '#,##0.00';
        }
      }
    });

    // 8. GRAND TOTAL style
    for (let c = 0; c < 31; c++) {
      const cellRef = XLSXStyle.utils.encode_cell({ r: grandTotalRowIndex, c });
      worksheet[cellRef].s = {
        font: { name: "Arial Narrow", sz: 10, bold: true, color: { rgb: "000000" } },
        fill: { fgColor: { rgb: "F2F2F2" } },
        alignment: {
          horizontal: c >= 4 && c <= 29 ? "right" : (c === 0 ? "center" : "left"),
          vertical: "center"
        },
        border: {
          bottom: { style: "double", color: { rgb: "000000" } }, // Accounting Standard Double Underscore
          top: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } }
        }
      };

      if (c >= 4 && c <= 29) {
        worksheet[cellRef].z = '#,##0.00';
      }
    }

    // 9. Signatures Area
    for (let r = grandTotalRowIndex + 1; r < maxRow; r++) {
      for (let c = 0; c < 31; c++) {
        const cellRef = XLSXStyle.utils.encode_cell({ r, c });
        worksheet[cellRef].s = {
          font: {
            name: "Arial Narrow",
            sz: 10,
            bold: r === sigRowIndex1 || r === sigRowIndex3,
            color: { rgb: "000000" }
          },
          alignment: {
            horizontal: c === 1 ? "left" : (c === 8 ? "left" : (c === 19 ? "left" : "left")),
            vertical: "center"
          }
        };
      }
    }

    // Configure heights
    const wsrows = Array(maxRow).fill({ hpt: 20 });
    wsrows[0] = { hpt: 35 }; // GENERAL PAYROLL
    wsrows[1] = { hpt: 25 }; // Month range
    wsrows[2] = { hpt: 22 }; // Info labels
    wsrows[3] = { hpt: 20 }; // Disclaimer
    wsrows[4] = { hpt: 15 }; // Blank spacer
    wsrows[5] = { hpt: 24 }; // Head 1
    wsrows[6] = { hpt: 22 }; // Head 2
    wsrows[7] = { hpt: 22 }; // Head 3

    sectionHeaderRowIndices.forEach(rIdx => {
      wsrows[rIdx] = { hpt: 25 };
    });
    wsrows[grandTotalRowIndex] = { hpt: 26 };

    worksheet['!rows'] = wsrows;

    // Col Widths
    const wscols = [
      { wch: 6 },  // No.
      { wch: 32 }, // Name of Employee
      { wch: 22 }, // Position
      { wch: 14 }, // Emp. No.
      { wch: 11 }, // GSIS PREM
      { wch: 11 }, // HDMF PREM
      { wch: 11 }, // PHILHEALTH ES
      { wch: 11 }, // ECIP
      { wch: 15 }, // Salaries and Wages
      { wch: 10 }, // PERA
      { wch: 14 }, // Gross Earned
      { wch: 11 }, // Abs. (Absences)
      { wch: 12 }, // GSIS Policy Loan
      { wch: 12 }, // GSIS Consol Loan
      { wch: 12 }, // GSIS MPL Lite
      { wch: 12 }, // GSIS MPL
      { wch: 12 }, // GSIS CPL
      { wch: 12 }, // GSIS GFAL
      { wch: 12 }, // GSIS Emergency Loan
      { wch: 13 }, // GSIS PREM PERSONAL
      { wch: 12 }, // GSIS Educ Asst.
      { wch: 15 }, // PAG-IBIG PERSONAL
      { wch: 12 }, // PAG-IBIG MPL
      { wch: 12 }, // SSS Contrib
      { wch: 12 }, // PAG-IBIG MP2
      { wch: 13 }, // PHILHLTH CONT.
      { wch: 12 }, // CSB Sal Loan
      { wch: 13 }, // TAX WITHHELD
      { wch: 15 }, // TOTAL DEDUCTION
      { wch: 16 }, // Net Amount Due
      { wch: 16 }  // Signature of Recipient
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSXStyle.utils.book_new();
    XLSXStyle.utils.book_append_sheet(workbook, worksheet, 'General Payroll');
    XLSXStyle.writeFile(workbook, `General_Payroll_${selectedCycle.name.replace(/[^a-z0-9]/gi, '_')}.xlsx`);
    toast.success('Professional general payroll exported successfully');
  };

  const downloadAllExcel = () => {
    if (entries.length === 0) {
      toast.error('No entries to download');
      return;
    }
    setIsExportingExcel(true);
    setTimeout(() => {
      try {
        performExcelGeneration();
      } catch (error: any) {
        console.error('Excel Generation Error:', error);
        toast.error('Failed to export General Payroll Excel');
      } finally {
        setIsExportingExcel(false);
      }
    }, 50);
  };

  const handleDisburse = async (cycle: any) => {
    setIsDisbursing(true);
    try {
      await api.payroll.disburse(cycle.id);
      toast.success('Payroll disbursed successfully! Moved to Payroll Records database.');
      fetchCycles();
      if (selectedCycle?.id === cycle.id) {
        setSelectedCycle(null);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsDisbursing(false);
    }
  };

  const handleRevertToDraft = async (cycle: any) => {
    setIsReverting(true);
    try {
      await api.payroll.revert(cycle.id);
      toast.success('Payroll reverted to draft');
      fetchCycles();
      if (selectedCycle?.id === cycle.id) {
        setSelectedCycle({...selectedCycle, status: 'draft'});
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsReverting(false);
    }
  };

  const filteredEntries = entries.filter(e => 
    e.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.employeeId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCycles = cycles.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(cycleSearchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
    const matchesType = filterType === 'all' || (c.type || 'all') === filterType;
    const matchesManaged = filterManaged === 'all' || isBatchManagedByMe(c);
    return matchesSearch && matchesStatus && matchesType && matchesManaged;
  });

  const deductionCols = useMemo(() => {
    return columnsList.filter(col => col.category === 'DEDUCTIONS');
  }, [columnsList]);

  // Real-time dynamic payroll totals calculated directly from the active entries state
  const realTimeTotals = useMemo(() => {
    let cycleGross = 0;
    let cycleDeductions = 0;
    let cycleNet = 0;

    for (const entry of entries) {
      const gross = getCellValue(entry, 'compGross');
      const rowDed = deductionCols.reduce((sum, col) => sum + getCellValue(entry, col.key), 0);
      const effectiveDed = rowDed > 0 ? rowDed : Number(entry.totalDeductions || entry.total_deductions || 0);
      const effectiveGross = gross > 0 ? gross : Number(entry.grossPay || entry.gross_pay || 0);
      const effectiveNet = Math.max(0, Number((effectiveGross - effectiveDed).toFixed(2)));

      cycleGross += effectiveGross;
      cycleDeductions += effectiveDed;
      cycleNet += effectiveNet;
    }

    // Filtered totals (when user is searching)
    let filteredGross = 0;
    let filteredDeductions = 0;
    let filteredNet = 0;

    for (const entry of filteredEntries) {
      const gross = getCellValue(entry, 'compGross');
      const rowDed = deductionCols.reduce((sum, col) => sum + getCellValue(entry, col.key), 0);
      const effectiveDed = rowDed > 0 ? rowDed : Number(entry.totalDeductions || entry.total_deductions || 0);
      const effectiveGross = gross > 0 ? gross : Number(entry.grossPay || entry.gross_pay || 0);
      const effectiveNet = Math.max(0, Number((effectiveGross - effectiveDed).toFixed(2)));

      filteredGross += effectiveGross;
      filteredDeductions += effectiveDed;
      filteredNet += effectiveNet;
    }

    // If entries are present, use computed sums; otherwise fall back to stored cycle totals
    const finalGross = entries.length > 0 ? cycleGross : Number(selectedCycle?.totalGross || 0);
    const finalDeductions = entries.length > 0 ? cycleDeductions : Number(selectedCycle?.totalDeductions || 0);
    const finalNet = entries.length > 0 ? cycleNet : Number(selectedCycle?.totalNet || 0);

    return {
      totalGross: Number(finalGross.toFixed(2)),
      totalDeductions: Number(finalDeductions.toFixed(2)),
      totalNet: Number(finalNet.toFixed(2)),
      filteredGross: Number(filteredGross.toFixed(2)),
      filteredDeductions: Number(filteredDeductions.toFixed(2)),
      filteredNet: Number(filteredNet.toFixed(2)),
      isFiltered: filteredEntries.length < entries.length,
      totalCount: entries.length,
      filteredCount: filteredEntries.length
    };
  }, [entries, filteredEntries, deductionCols, selectedCycle, columnsList]);

  // Keep selectedCycle totals in sync with real-time calculated values
  useEffect(() => {
    if (selectedCycle && entries.length > 0) {
      const curGross = Number(selectedCycle.totalGross || 0);
      const curDeds = Number(selectedCycle.totalDeductions || 0);
      const curNet = Number(selectedCycle.totalNet || 0);
      if (
        Math.abs(curGross - realTimeTotals.totalGross) > 0.01 ||
        Math.abs(curDeds - realTimeTotals.totalDeductions) > 0.01 ||
        Math.abs(curNet - realTimeTotals.totalNet) > 0.01
      ) {
        setSelectedCycle((prev: any) => prev ? {
          ...prev,
          totalGross: realTimeTotals.totalGross,
          totalDeductions: realTimeTotals.totalDeductions,
          totalNet: realTimeTotals.totalNet
        } : prev);
      }
    }
  }, [realTimeTotals.totalGross, realTimeTotals.totalDeductions, realTimeTotals.totalNet, entries.length]);

  const cn = (...inputs: any[]) => inputs.filter(Boolean).join(' ');

  return (
    <div className="w-full relative">
      {(loading || entriesLoading) && (
        <div className="fixed top-6 right-6 z-[9999] pointer-events-auto flex items-center gap-3 bg-white border border-neutral-200/80 rounded-2xl shadow-xl p-3.5 pr-5 animate-in fade-in slide-in-from-top-3 duration-300">
          <div className="p-2 bg-neutral-900 rounded-xl text-white">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-neutral-900 font-sans tracking-tight">
              {entriesLoading ? "Calculating Payroll Spreadsheet..." : "Fetching Payroll Cycles..."}
            </h4>
            <p className="text-[10px] text-neutral-500 font-sans mt-0.5">
              Please wait while we update system values
            </p>
          </div>
        </div>
      )}
      {selectedCycle ? (
        <div className="space-y-6">
          {/* Top Bar Navigation, Metadata & Actions */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-neutral-200/80">
            <div className="flex items-start sm:items-center gap-3.5">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setSelectedCycle(null)}
                className="h-10 w-10 shrink-0 rounded-xl border-neutral-200 bg-white shadow-xs hover:bg-neutral-50 text-neutral-700"
                title="Back to all cycles"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 font-sans">
                    {selectedCycle.name}
                  </h2>
                  <Badge className={cn(
                    "text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide border shadow-2xs inline-flex items-center gap-1.5",
                    selectedCycle.status === 'draft' ? "bg-slate-50 text-slate-700 border-slate-200" :
                    selectedCycle.status === 'completed' ? "bg-amber-50 text-amber-800 border-amber-200" :
                    selectedCycle.status === 'approved' ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                    selectedCycle.status === 'disbursed' ? "bg-teal-50 text-teal-800 border-teal-200" :
                    "bg-rose-50 text-rose-800 border-rose-200"
                  )}>
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      selectedCycle.status === 'draft' ? "bg-slate-400" :
                      selectedCycle.status === 'completed' ? "bg-amber-500 animate-pulse" :
                      selectedCycle.status === 'approved' ? "bg-emerald-500" :
                      selectedCycle.status === 'disbursed' ? "bg-teal-500" : "bg-rose-500"
                    )} />
                    {selectedCycle.status === 'completed' ? 'Pending Approval' : selectedCycle.status}
                  </Badge>
                  {isBatchManagedByMe(selectedCycle) && (
                    <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[11px] px-2.5 py-0.5 rounded-full gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Managed by You
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  <span className="inline-flex items-center gap-1.5 font-medium text-neutral-600">
                    <CalendarIcon className="w-3.5 h-3.5 text-neutral-400" />
                    {format(new Date(selectedCycle.startDate), 'MMM dd')} – {format(new Date(selectedCycle.endDate), 'MMM dd, yyyy')}
                  </span>
                  {selectedCycle.status === 'draft' && (
                    <>
                      <span className="text-neutral-300">•</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100/80 border border-neutral-200/60 rounded-md text-[10px] font-bold text-neutral-600 uppercase tracking-wider">
                        <Clock className="w-3 h-3 text-neutral-400" />
                        Day {getCycleProgress(selectedCycle.startDate, selectedCycle.endDate).elapsed} of {getCycleProgress(selectedCycle.startDate, selectedCycle.endDate).total}
                      </span>
                    </>
                  )}
                  {selectedCycle.campus && (
                    <>
                      <span className="text-neutral-300">•</span>
                      <span className="inline-flex items-center gap-1 text-neutral-600 font-medium">
                        <Building2 className="w-3.5 h-3.5 text-neutral-400" />
                        {selectedCycle.campus}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Actions Toolbar */}
            <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center">
              {selectedCycle.status !== 'disbursed' && (
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-red-600 border-red-200/80 hover:bg-red-50/80 hover:text-red-700 rounded-xl h-9 text-xs font-semibold gap-1.5 px-3.5 shadow-2xs"
                  onClick={() => {
                    setItemToDelete({ id: selectedCycle.id, type: 'cycle' });
                    setIsDeleteOpen(true);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  Delete Cycle
                </Button>
              )}

              {selectedCycle.status === 'draft' && (
                <>
                  <Dialog open={isAddEmployeeOpen} onOpenChange={(open) => {
                    setIsAddEmployeeOpen(open);
                    if (open) fetchAvailableEmployees();
                  }}>
                    <DialogTrigger 
                      render={(props) => (
                        <Button {...props} variant="outline" size="sm" className="rounded-xl border-neutral-200 h-9 text-xs font-semibold gap-1.5 px-3.5 shadow-2xs hover:bg-neutral-50 text-neutral-700">
                          <UserPlus className="w-3.5 h-3.5 text-neutral-500" />
                          Add Employee
                        </Button>
                      )}
                    />
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Add Employee to Cycle</DialogTitle>
                        <DialogDescription>
                          Select an employee to add to this payroll cycle.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="max-h-[400px] overflow-y-auto space-y-2 py-4">
                        {availableEmployees.length === 0 ? (
                          <p className="text-center text-neutral-500 py-4">No available active employees to add.</p>
                        ) : (
                          availableEmployees.map(emp => (
                            <div key={emp.id} className="flex items-center justify-between p-3 border border-neutral-100 rounded-lg hover:bg-neutral-50 transition-colors">
                              <div>
                                <p className="font-bold text-sm">{formatEmployeeName(emp)}</p>
                                <p className="text-xs text-neutral-500">{emp.employeeId} • {emp.category}</p>
                              </div>
                              <Button 
                                size="sm" 
                                onClick={() => handleAddEmployee(emp.id)}
                                disabled={isAddingEmployee === emp.id}
                              >
                                {isAddingEmployee === emp.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  "Add"
                                )}
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Button 
                    size="sm"
                    onClick={() => handleProcessPayroll(selectedCycle)} 
                    className="bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl h-9 text-xs font-semibold gap-2 px-4 shadow-sm"
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    {isProcessing ? 'Processing...' : 'Process Payroll'}
                  </Button>
                </>
              )}

              {selectedCycle.status === 'completed' && (
                <div className="flex flex-wrap items-center gap-2">
                  {isBatchManagedByMe(selectedCycle) ? (
                    <>
                      <Button 
                        onClick={() => handleRejectBatch(selectedCycle.id)} 
                        variant="outline" 
                        size="sm"
                        className="text-red-600 border-red-200 hover:bg-red-50 rounded-xl h-9 text-xs font-semibold gap-1.5 px-3.5"
                        disabled={isRejecting}
                      >
                        {isRejecting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        {isRejecting ? 'Rejecting...' : 'Reject Batch'}
                      </Button>
                      <Button 
                        onClick={() => handleApproveBatch(selectedCycle.id)} 
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-9 text-xs font-bold gap-1.5 px-4 shadow-sm"
                        disabled={isApproving}
                      >
                        {isApproving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        {isApproving ? 'Approving...' : 'Approve Batch'}
                      </Button>
                    </>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 text-amber-900 px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-2 font-medium">
                      <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Approval Restricted: Managed by {selectedCycle.managedByName || 'Assigned Accountant'}</span>
                    </div>
                  )}
                  <Button 
                    onClick={() => handleRevertToDraft(selectedCycle)} 
                    variant="ghost" 
                    size="sm" 
                    className="text-neutral-500 hover:text-neutral-800 rounded-xl h-9 text-xs gap-1"
                    disabled={isReverting}
                  >
                    {isReverting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Revert to Draft
                  </Button>
                </div>
              )}

              {selectedCycle.status === 'approved' && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button 
                    onClick={() => handleRevertToDraft(selectedCycle)} 
                    variant="outline" 
                    size="sm"
                    className="rounded-xl border-neutral-200 h-9 text-xs font-semibold gap-1.5 px-3.5"
                    disabled={isReverting}
                  >
                    {isReverting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ArrowLeft className="w-3.5 h-3.5" />
                    )}
                    Back to Draft
                  </Button>
                  <Button 
                    onClick={() => handleDisburse(selectedCycle)} 
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-9 text-xs font-bold gap-1.5 px-4 shadow-sm"
                    disabled={isDisbursing}
                  >
                    {isDisbursing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <DollarSign className="w-3.5 h-3.5" />
                    )}
                    {isDisbursing ? 'Disbursing...' : 'Disburse Funds'}
                  </Button>
                </div>
              )}

              {selectedCycle.status === 'rejected' && (
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={() => handleRevertToDraft(selectedCycle)} 
                    variant="outline" 
                    size="sm" 
                    className="rounded-xl border-neutral-200 h-9 text-xs font-semibold gap-1.5 px-3.5"
                    disabled={isReverting}
                  >
                    {isReverting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ArrowLeft className="w-3.5 h-3.5" />
                    )}
                    Revert to Draft
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Professional Batch Governance & Approval Authority Card */}
          <div className="bg-white border border-neutral-200/90 rounded-2xl p-4 sm:p-4.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start md:items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100/80 flex items-center justify-center text-blue-600 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-bold text-neutral-900 tracking-tight">Batch Governance & Approval Authority</h4>
                  {selectedCycle.campus && (
                    <Badge variant="outline" className="text-[10px] font-semibold border-neutral-200 text-neutral-700 bg-neutral-50 px-2 py-0.5">
                      <Building2 className="w-3 h-3 mr-1 text-blue-600" />
                      {selectedCycle.campus}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 mt-0.5">
                  <span>Managing Accountant: <strong className="text-neutral-800 font-semibold">{selectedCycle.managedByName || 'System Accountant'}</strong></span>
                  {selectedCycle.approvedBy && (
                    <>
                      <span className="text-neutral-300">•</span>
                      <span>Approved By: <strong className="text-emerald-700 font-semibold">{selectedCycle.approvedBy}</strong></span>
                    </>
                  )}
                  {selectedCycle.approvedAt && (
                    <>
                      <span className="text-neutral-300">•</span>
                      <span className="text-neutral-500">Date: {format(new Date(selectedCycle.approvedAt), 'MMM dd, yyyy HH:mm')}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
              {role === 'admin' && (
                <Popover>
                  <PopoverTrigger render={(props) => (
                    <Button {...props} variant="outline" size="sm" className="bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border-neutral-200 text-xs font-semibold rounded-xl gap-1.5 h-8.5 px-3">
                      <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                      Reassign Authority
                    </Button>
                  )} />
                  <PopoverContent className="w-72 p-4 space-y-3 bg-white text-neutral-900 border border-neutral-200 shadow-xl rounded-xl z-[9999]">
                    <div className="border-b pb-2">
                      <h5 className="font-bold text-xs text-neutral-900">Reassign Managing Accountant</h5>
                      <p className="text-[10px] text-neutral-500">Change approval authority for this batch</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-neutral-600 font-semibold">Managing Accountant</Label>
                      <select
                        value={selectedCycle.managedBy || ''}
                        onChange={async (e) => {
                          const accId = e.target.value;
                          const found = accountantsList.find((a: any) => a.id === accId);
                          await handleAssignAccountant(selectedCycle.id, accId, found?.displayName || 'System Accountant', selectedCycle.campus);
                        }}
                        className="w-full text-xs p-2 border border-neutral-200 rounded-lg bg-neutral-50 font-medium focus:outline-none focus:ring-1 focus:ring-neutral-900"
                      >
                        {accountantsList.map((acc: any) => (
                          <option key={acc.id} value={acc.id}>{acc.displayName} ({acc.campus || 'Main'})</option>
                        ))}
                        {accountantsList.length === 0 && (
                          <option value="accountant-1">System Accountant (Hinunangan)</option>
                        )}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-neutral-600 font-semibold">Campus Scope</Label>
                      <select
                        value={selectedCycle.campus || 'All Campuses'}
                        onChange={async (e) => {
                          await handleAssignAccountant(selectedCycle.id, selectedCycle.managedBy, selectedCycle.managedByName, e.target.value);
                        }}
                        className="w-full text-xs p-2 border border-neutral-200 rounded-lg bg-neutral-50 font-medium focus:outline-none focus:ring-1 focus:ring-neutral-900"
                      >
                        <option value="All Campuses">All Campuses</option>
                        {SLSU_CAMPUSES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Card className="bg-white border-neutral-200 shadow-sm transition-all duration-200 hover:border-neutral-300">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-neutral-500 font-semibold uppercase tracking-wider">Total Gross Pay</p>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  Real-time
                </span>
              </div>
              <h3 className="text-2xl font-black text-neutral-900 font-mono tracking-tight">
                ₱{formatCurrency(realTimeTotals.totalGross)}
              </h3>
              {realTimeTotals.isFiltered ? (
                <p className="text-[11px] text-neutral-500 mt-1 font-sans">
                  Filtered ({realTimeTotals.filteredCount}): <span className="font-mono font-semibold text-neutral-800">₱{formatCurrency(realTimeTotals.filteredGross)}</span>
                </p>
              ) : (
                <p className="text-[11px] text-neutral-400 mt-1 font-sans">
                  Across all {realTimeTotals.totalCount} employees
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="bg-white border-neutral-200 shadow-sm transition-all duration-200 hover:border-neutral-300">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-neutral-500 font-semibold uppercase tracking-wider">Total Deductions</p>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200/60">
                  Real-time
                </span>
              </div>
              <h3 className="text-2xl font-black text-red-600 font-mono tracking-tight">
                ₱{formatCurrency(realTimeTotals.totalDeductions)}
              </h3>
              {realTimeTotals.isFiltered ? (
                <p className="text-[11px] text-neutral-500 mt-1 font-sans">
                  Filtered ({realTimeTotals.filteredCount}): <span className="font-mono font-semibold text-red-700">₱{formatCurrency(realTimeTotals.filteredDeductions)}</span>
                </p>
              ) : (
                <p className="text-[11px] text-neutral-400 mt-1 font-sans">
                  Statutory & internal deductions
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="bg-white border-neutral-200 shadow-sm transition-all duration-200 hover:border-neutral-300">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-neutral-500 font-semibold uppercase tracking-wider">Total Net Pay</p>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  Real-time
                </span>
              </div>
              <h3 className="text-2xl font-black text-emerald-600 font-mono tracking-tight">
                ₱{formatCurrency(realTimeTotals.totalNet)}
              </h3>
              {realTimeTotals.isFiltered ? (
                <p className="text-[11px] text-neutral-500 mt-1 font-sans">
                  Filtered ({realTimeTotals.filteredCount}): <span className="font-mono font-semibold text-emerald-700">₱{formatCurrency(realTimeTotals.filteredNet)}</span>
                </p>
              ) : (
                <p className="text-[11px] text-neutral-400 mt-1 font-sans">
                  Net take-home disbursement
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="bg-white border-neutral-200 shadow-sm transition-all duration-200 hover:border-neutral-300">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-neutral-500 font-semibold uppercase tracking-wider">Total Entries</p>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-700">
                  Cycle Staff
                </span>
              </div>
              <h3 className="text-2xl font-black text-neutral-900 font-mono tracking-tight">
                {realTimeTotals.totalCount}
              </h3>
              {realTimeTotals.isFiltered ? (
                <p className="text-[11px] text-neutral-500 mt-1 font-sans">
                  Matching search: <span className="font-semibold text-neutral-800">{realTimeTotals.filteredCount}</span>
                </p>
              ) : (
                <p className="text-[11px] text-neutral-400 mt-1 font-sans">
                  Enrolled in this payroll run
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className={cn(
          "bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden transition-all duration-200",
          isFullscreen && "fixed inset-0 z-[1000] rounded-none border-none p-2 sm:p-3 bg-white flex flex-col h-screen w-screen"
        )}>
          {/* Top Bar: In fullscreen, shows ONLY the search bar, employee count, and exit fullscreen button */}
          {isFullscreen ? (
            <div className="px-4 py-3 bg-neutral-900 text-white rounded-lg shadow-sm flex items-center justify-between gap-4 shrink-0 mb-2.5">
              <div className="flex items-center gap-4 flex-1 max-w-2xl">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                  <Input 
                    placeholder="Search employee name, ID or position..." 
                    className="pl-11 h-10 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-400 text-sm focus-visible:ring-neutral-400 font-sans"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    autoFocus
                  />
                  {searchTerm && (
                    <button 
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white text-sm font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="text-xs text-neutral-300 font-medium whitespace-nowrap hidden sm:flex items-center gap-3">
                  <span><strong className="font-bold text-white text-sm">{filteredEntries.length}</strong> of {entries.length} Staff</span>
                  <span className="text-neutral-600">|</span>
                  <span>Gross: <strong className="text-emerald-400 font-mono font-bold">₱{formatCurrency(realTimeTotals.totalGross)}</strong></span>
                  <span className="text-neutral-600">|</span>
                  <span>Net: <strong className="text-emerald-400 font-mono font-bold">₱{formatCurrency(realTimeTotals.totalNet)}</strong></span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="default" 
                  onClick={toggleFullscreen} 
                  className="gap-2 h-10 px-4 bg-red-600 hover:bg-red-700 text-white border-red-500 hover:border-red-600 font-sans shadow-sm font-semibold text-sm transition-colors cursor-pointer"
                  title="Exit Fullscreen (ESC)"
                >
                  <Minimize2 className="w-4 h-4" />
                  <span>Exit Fullscreen</span>
                  <kbd className="hidden sm:inline-block text-[10px] bg-red-800/80 text-white px-2 py-0.5 rounded font-mono border border-red-700/50">ESC</kbd>
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-4 border-b border-neutral-100 bg-neutral-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1 max-w-2xl">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <Input 
                    placeholder="Search employee name or ID..." 
                    className="pl-10 h-9 bg-white"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 border-l border-neutral-200 pl-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mr-2">Export Report</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={downloadTablePDF} 
                    className="gap-2 h-9 bg-white"
                    disabled={isExportingPDF || isExportingExcel || isExportingSlips}
                  >
                    {isExportingPDF ? (
                      <Loader2 className="w-4 h-4 animate-spin text-neutral-600" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                    {isExportingPDF ? 'Exporting PDF...' : 'PDF Report'}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={downloadAllExcel} 
                    className="gap-2 h-9 bg-white"
                    disabled={isExportingPDF || isExportingExcel || isExportingSlips}
                  >
                    {isExportingExcel ? (
                      <Loader2 className="w-4 h-4 animate-spin text-neutral-600" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    {isExportingExcel ? 'Exporting Excel...' : 'Excel Report'}
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 border-r border-neutral-200 pr-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 font-sans">Payslips</p>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={downloadAllPDF} 
                    className="gap-2 h-9 text-neutral-600 hover:text-neutral-900 font-sans"
                    disabled={isExportingPDF || isExportingExcel || isExportingSlips}
                  >
                    {isExportingSlips ? (
                      <Loader2 className="w-4 h-4 animate-spin text-neutral-600" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    {isExportingSlips ? 'Generating...' : 'All Slips'}
                  </Button>
                </div>
                {selectedCycle.status === 'draft' && (
                  <>
                    <div className="flex items-center gap-2 border-r pr-3 border-neutral-200">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePopulateCycle}
                        className="gap-1.5 h-9 bg-white border-neutral-300 text-neutral-800 hover:bg-neutral-50 text-xs font-semibold"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-neutral-600" />
                        Sync / Populate Employees
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 border-r pr-3 border-neutral-200">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 font-sans">Import</p>
                      <label className="flex items-center gap-1.5 px-3 h-9 bg-zinc-950 hover:bg-zinc-805 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm select-none font-sans">
                        <Plus className="w-4 h-4" />
                        Deductions XLSX/XLS
                        <input
                          type="file"
                          accept=".xlsx, .xls"
                          onChange={handleImportDeductionsExcel}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={toggleFullscreen} 
                  className="gap-2 h-9 border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 font-sans shadow-xs font-semibold transition-colors"
                  title="Expand spreadsheet to fullscreen view"
                >
                  <Maximize2 className="w-4 h-4 text-neutral-700" />
                  <span>Fullscreen</span>
                </Button>
                <div className="text-xs font-medium text-neutral-500">
                  {filteredEntries.length} Employees
                </div>
              </div>
            </div>
          )}

          <div className={cn(
            "flex flex-col gap-6 bg-white p-6 border border-neutral-200 rounded-lg shadow-sm transition-opacity duration-300",
            entriesLoading && "opacity-60 pointer-events-none",
            isFullscreen && "flex-1 min-h-0 overflow-hidden gap-0 p-0 border-none shadow-none rounded-none"
          )}>
            {/* SLSU General Payroll Header Block - only in normal non-fullscreen view */}
            {!isFullscreen && (
              <div className="font-serif select-text text-neutral-900 pb-3 shrink-0">
                <h1 className="text-[25px] font-bold text-black uppercase tracking-tight leading-none mb-1.5 font-serif" id="slsu-general-payroll-title">GENERAL PAYROLL</h1>
                <h2 className="text-[17px] font-bold text-black mb-3 font-serif">
                  For the month of &nbsp;<span className="font-bold underline decoration-1 underline-offset-1">{selectedCycle ? format(new Date(selectedCycle.startDate), 'MMMM, yyyy').toUpperCase() : 'MARCH, 2025'}</span>
                </h2>
                <div className="space-y-1.5 text-[13px] font-serif">
                  <div className="flex items-center gap-1">
                    <span className="text-zinc-800">Entity Name :</span>
                    <span className="font-bold text-black">Southern Leyte State University, Hinunangan Campus</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-zinc-800">Fund Cluster :</span>
                    <span className="font-bold text-black underline decoration-1 decoration-black underline-offset-2 px-1 text-center">01</span>
                  </div>
                </div>
                <p className="mt-4 text-[12px] text-zinc-900 font-serif leading-relaxed">
                  We acknowledge receipt of cash shown opposite our name as full compensation for services rendered for the period covered.
                </p>
              </div>
            )}

            {/* The Spreadsheet scrollable container with hover navigation buttons */}
            <div 
              className={cn(
                "relative group/spreadsheet w-full",
                isFullscreen ? "flex-1 min-h-0 flex flex-col h-full" : ""
              )}
              onMouseEnter={() => {
                setIsTableHovered(true);
                updateScrollButtons();
              }}
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
                ref={tableContainerRef}
                onScroll={handleTableScroll}
                className={cn(
                  "overflow-auto custom-scrollbar border border-neutral-200 rounded-lg w-full select-none shadow-sm",
                  isFullscreen ? "flex-1 min-h-0 h-full max-h-[calc(100vh-60px)]" : "max-h-[700px]"
                )}
              >
                <table className={cn(
                  "w-full border-collapse border-spacing-0 text-[11.5px] select-text transition-all",
                  isFullscreen && "spreadsheet-fullscreen-mode text-[14px]"
                )}>
                <thead>
                  {/* Row 1: Main Column Groups - SLSU Corporate Themed */}
                  <tr className="bg-neutral-900 text-white font-bold border-b border-neutral-700 divide-x divide-neutral-800">
                    <th 
                      rowSpan={2} 
                      className="p-2.5 text-center sticky left-0 top-0 z-50 bg-blue-950 text-white border-b border-blue-900 border-r border-[#1a3a6b] font-bold"
                      style={{ minWidth: '60px', width: '60px', height: '64px' }}
                    >
                      <div className="flex flex-col items-center justify-center leading-[1.1]">
                        <span className="text-[10px] font-normal">Serial</span>
                        <span className="text-[11px] font-bold">No.</span>
                      </div>
                    </th>
                    <th 
                      rowSpan={2} 
                      className="p-2.5 text-left sticky left-[60px] top-0 z-50 bg-blue-950 text-white border-b border-blue-900 border-r border-[#1a3a6b] font-bold"
                      style={{ minWidth: '220px', width: '220px', height: '64px' }}
                    >
                      Name
                    </th>
                    <th 
                      rowSpan={2} 
                      className="p-2.5 text-left sticky top-0 z-30 bg-blue-950 text-white border-b border-blue-900 font-bold"
                      style={{ minWidth: '125px', height: '64px' }}
                    >
                      Position
                    </th>
                    <th 
                      className="p-1.5 text-center bg-blue-950 text-white border-b border-blue-900 min-w-[85px] font-bold text-[11px] sticky top-0 z-30"
                      style={{ height: '34px' }}
                    >
                      Emp.
                    </th>
                    <th 
                      colSpan={4} 
                      className="p-1.5 text-center text-[10.5px] tracking-wider bg-blue-900 text-blue-100 border-b border-blue-950 font-bold sticky top-0 z-30"
                      style={{ height: '34px' }}
                    >
                      GOVERNMENT SHARE
                    </th>
                    <th 
                      colSpan={4} 
                      className="p-1.5 text-center text-[10.5px] tracking-wider bg-emerald-900 text-emerald-100 border-b border-emerald-950 font-bold sticky top-0 z-30"
                      style={{ height: '34px' }}
                    >
                      COMPENSATIONS
                    </th>
                    <th 
                      colSpan={columnsList.filter(col => col.category === 'DEDUCTIONS').length} 
                      className="p-2 text-center text-[11px] bg-rose-100 text-rose-950 font-extrabold tracking-widest border border-zinc-300 select-none uppercase sticky top-0 z-30"
                      style={{ height: '34px' }}
                    >
                      DEDUCTIONS
                    </th>
                    <th 
                      rowSpan={2} 
                      className="p-2.5 text-right bg-red-900 text-white min-w-[95px] border-b border-red-950 font-bold sticky top-0 z-30"
                      style={{ height: '64px' }}
                    >
                      Total Deduct
                    </th>
                    <th 
                      rowSpan={2} 
                      className="p-2.5 text-right bg-amber-600 text-neutral-950 min-w-[100px] border-b border-amber-800 font-extrabold uppercase tracking-wide sticky top-0 z-30"
                      style={{ height: '64px' }}
                    >
                      Net Pay
                    </th>
                    <th 
                      colSpan={3} 
                      className="p-1.5 text-center text-[10.5px] tracking-wider bg-amber-700 text-white border-b border-amber-800 font-bold sticky top-0 z-30"
                      style={{ height: '34px' }}
                    >
                      NET DISBURSEMENT
                    </th>
                    <th 
                      rowSpan={2} 
                      className="p-2.5 text-center min-w-[130px] bg-blue-950 text-white border-b border-blue-900 font-bold sticky top-0 z-30"
                      style={{ height: '64px' }}
                    >
                      Recipient Signature
                    </th>
                  </tr>
                  {/* Row 2: Sub-Headers - Clearly Structured and readable */}
                  <tr className="bg-neutral-100 text-slate-700 font-semibold border-b border-neutral-300 divide-x divide-neutral-200 text-[10px]">
                    {/* Employee No. Sub-Header */}
                    <th 
                      className="sticky top-[34px] z-30 p-1.5 text-center min-w-[85px] bg-neutral-100 text-slate-700 font-bold border-b border-neutral-300 text-[10px]"
                      style={{ height: '30px' }}
                    >
                      No.
                    </th>
                    {/* Govt Shares Sub-Headers (SLSU Blue Accent) */}
                    <th 
                      onClick={() => {
                        setShowGsisFormula(!showGsisFormula);
                        if (!showGsisFormula) {
                          toast.info("Formula view enabled: 12% of Salaries and Wages-2nd Tranch");
                        }
                      }}
                      className={`sticky top-[34px] z-30 p-1.5 cursor-pointer select-none transition-all duration-200 ${showGsisFormula ? 'bg-blue-100 text-blue-950 min-w-[210px] text-center font-bold font-sans border-x border-blue-300' : 'p-1.5 text-right min-w-[70px] bg-blue-50 text-blue-950 hover:bg-blue-100'}`}
                      style={{ height: '30px' }}
                      id="gsis-prem-header-toggle"
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
                    <th 
                      className="sticky top-[34px] z-30 p-1.5 text-right min-w-[70px] bg-blue-50 text-blue-950"
                      style={{ height: '30px' }}
                    >
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
                      id="philhealth-es-header-toggle"
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
                    <th 
                      className="sticky top-[34px] z-30 p-1.5 text-right min-w-[70px] bg-blue-50 text-blue-950"
                      style={{ height: '30px' }}
                    >
                      ECIP
                    </th>

                    {/* Compensations Sub-Headers (Emerald Accent) */}
                    <th 
                      className="sticky top-[34px] z-30 p-1.5 text-right min-w-[95px] bg-emerald-50 text-emerald-950"
                      style={{ height: '30px' }}
                    >
                      Salaries and Wages-2nd Tranch
                    </th>
                    <th 
                      className="sticky top-[34px] z-30 p-1.5 text-right min-w-[70px] bg-emerald-50 text-emerald-950"
                      style={{ height: '30px' }}
                    >
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
                      id="gross-amount-header-toggle"
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
                            <Info className="w-3.5 h-3.5 text-emerald-600 opacity-70 inline-block animate-pulse-slow" />
                          </>
                        )}
                      </div>
                    </th>
                    <th 
                      className="sticky top-[34px] z-30 p-1.5 text-right min-w-[70px] bg-orange-50 text-orange-950"
                      style={{ height: '30px' }}
                    >
                      Abs.
                    </th>

                    {/* Deductions Sub-Headers (Elegant Pastel Rose Theme) */}
                    <th 
                      className="sticky top-[34px] z-30 p-1.5 text-center min-w-[85px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none"
                      style={{ height: '30px' }}
                    >
                      <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                        <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">GSIS PREM</span>
                        <span className="text-[9.5px] font-extrabold text-rose-950 uppercase tracking-tight">Policy Loan</span>
                      </div>
                    </th>
                    <th 
                      className="sticky top-[34px] z-30 p-1.5 text-center min-w-[85px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none"
                      style={{ height: '30px' }}
                    >
                      <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                        <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">GSIS PREM</span>
                        <span className="text-[9.5px] font-extrabold text-rose-950 uppercase tracking-tight">Consol Loan</span>
                      </div>
                    </th>
                    <th 
                      className="sticky top-[34px] z-30 p-1.5 text-center min-w-[85px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none"
                      style={{ height: '30px' }}
                    >
                      <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                        <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">GSIS PREM</span>
                        <span className="text-[9.5px]/[1.1] font-extrabold text-rose-950 uppercase tracking-tight">MPL Lite</span>
                      </div>
                    </th>
                    <th 
                      className="sticky top-[34px] z-30 p-1.5 text-center min-w-[75px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none"
                      style={{ height: '30px' }}
                    >
                      <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                        <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">GSIS PREM</span>
                        <span className="text-[9.5px] font-extrabold text-rose-950 uppercase tracking-tight">MPL</span>
                      </div>
                    </th>
                    <th 
                      className="sticky top-[34px] z-30 p-1.5 text-center min-w-[75px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none"
                      style={{ height: '30px' }}
                    >
                      <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                        <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">GSIS PREM</span>
                        <span className="text-[9.5px] font-extrabold text-rose-950 uppercase tracking-tight">CPL</span>
                      </div>
                    </th>
                    <th 
                      className="sticky top-[34px] z-30 p-1.5 text-center min-w-[75px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none"
                      style={{ height: '30px' }}
                    >
                      <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                        <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">GSIS PREM</span>
                        <span className="text-[9.5px] font-extrabold text-rose-950 uppercase tracking-tight">GFAL</span>
                      </div>
                    </th>
                    <th 
                      className="sticky top-[34px] z-30 p-1.5 text-center min-w-[95px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none"
                      style={{ height: '30px' }}
                    >
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
                      id="gsis-prem-personal-header-toggle"
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
                    <th 
                      className="sticky top-[34px] z-30 p-1.5 text-center min-w-[85px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none"
                      style={{ height: '30px' }}
                    >
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
                      id="pagibig-personal-header-toggle"
                      title={showPagibigPersonalFormula ? "Click to reset to 'HDMF PREM PERSONAL(EE)'" : "Click to view formula for HDMF PREM PERSONAL(EE)"}
                    >
                      <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px] px-1">
                        {showPagibigPersonalFormula ? (
                          <span className="text-[10px] font-extrabold tracking-tight text-rose-900 leading-[1.2]">
                            2% of Salaries and Wages-2nd Tranch
                          </span>
                        ) : (
                          <>
                            <span className="text-[8.5px] font-bold text-rose-700 tracking-tight font-sans animate-none">HDMF PREM</span>
                            <span className="text-[9.5px]/[1.1] font-extrabold text-rose-950 uppercase tracking-tight text-[8.5px] flex items-center gap-0.5 justify-center">
                              PERSONAL(EE) <Info className="w-2.5 h-2.5 text-rose-500 opacity-60 inline-block" />
                            </span>
                          </>
                        )}
                      </div>
                    </th>
                    <th 
                      className="sticky top-[34px] z-30 p-1.5 text-center min-w-[85px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none"
                      style={{ height: '30px' }}
                    >
                      <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                        <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">HDMF PREM</span>
                        <span className="text-[9.5px] font-extrabold text-rose-950 uppercase tracking-tight">MPL</span>
                      </div>
                    </th>
                    <th 
                      className="sticky top-[34px] z-30 p-1.5 text-center min-w-[85px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none"
                      style={{ height: '30px' }}
                    >
                      <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px]">
                        <span className="text-[8.5px] font-bold text-rose-700 tracking-tight">SSS</span>
                        <span className="text-[9.5px] font-extrabold text-rose-950 uppercase tracking-tight text-[9px]">Contribution</span>
                      </div>
                    </th>
                    <th 
                      className="sticky top-[34px] z-30 p-1.5 text-center min-w-[85px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none"
                      style={{ height: '30px' }}
                    >
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
                      id="philhealth-cont-header-toggle"
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
                    <th 
                      className="sticky top-[34px] z-30 p-1.5 text-center min-w-[85px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none"
                      style={{ height: '30px' }}
                    >
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
                      id="tax-withheld-header-toggle"
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

                    {/* Custom / Dynamic Deductions Sub-Headers */}
                    {columnsList.filter(col => col.category === 'DEDUCTIONS' && !standardDeductions.some(s => s.key === col.key)).map(col => (
                      <th 
                        key={`hdr-${col.key}`}
                        className="sticky top-[34px] z-30 p-1.5 text-center min-w-[90px] bg-rose-50 text-rose-950 font-bold border border-zinc-300 select-none"
                        style={{ height: '30px' }}
                      >
                        <div className="flex flex-col items-center justify-center text-center leading-[1.1] min-h-[28px] px-1">
                          <span className="text-[8px] font-bold text-rose-700 tracking-tight uppercase">DEDUCT</span>
                          <span className="text-[9px] font-extrabold text-rose-950 uppercase tracking-tight truncate max-w-[85px]" title={col.label}>{col.label}</span>
                        </div>
                      </th>
                    ))}

                    {/* Net Disbursement Sub-Headers (SLSU Gold Accent) */}
                    <th className="sticky top-[34px] z-30 p-1.5 text-right min-w-[80px] bg-amber-50 text-amber-950" style={{ height: '30px' }}>1st Half</th>
                    <th className="sticky top-[34px] z-30 p-1.5 text-right min-w-[80px] bg-amber-50 text-amber-950" style={{ height: '30px' }}>2nd Half</th>
                    <th className="sticky top-[34px] z-30 p-1.5 text-right min-w-[90px] bg-amber-100 text-amber-950 font-bold" style={{ height: '30px' }}>Total Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {(() => {
                    const facultyMale: any[] = [];
                    const facultyFemale: any[] = [];
                    const staffMale: any[] = [];
                    const staffFemale: any[] = [];
                    const others: any[] = [];

                    for (const entry of filteredEntries) {
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
                      return a.employeeName.localeCompare(b.employeeName);
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

                    if (sections.length === 0) {
                      return (
                        <tr key="empty-payroll-entries">
                          <td colSpan={columnsList.length + 7} className="p-12 text-center bg-white text-neutral-500 font-sans">
                            <div className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
                              <Users className="w-10 h-10 text-neutral-300" />
                              <div>
                                <h3 className="text-sm font-semibold text-neutral-800">No Employees in this Payroll Cycle</h3>
                                <p className="text-xs text-neutral-500 mt-1">
                                  Click below to automatically populate all employees matching this cycle's campus and category, along with their salary, DTR metrics, and deductions.
                                </p>
                              </div>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={handlePopulateCycle}
                                className="mt-2 gap-2 bg-neutral-900 text-white hover:bg-neutral-800"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Populate Employees & Deductions
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    let globalIdx = 0;
                    
                    return sections.flatMap((section, sIndex) => {
                      const headerRow = (
                        <tr key={`sec-hdr-${section.label}-${section.isGenderSub}-${sIndex}`} className="bg-neutral-100/90 border-y border-neutral-300 divide-x divide-neutral-200">
                          {/* Blank for Seq */}
                          <td className="p-2 text-center sticky left-0 z-10 bg-neutral-100 font-bold text-neutral-500 text-[10px]" style={{ minWidth: "60px", width: "60px" }} />
                          {/* Header Text spans */}
                          <td colSpan={columnsList.length + 6} className={`p-2 px-4 sticky left-[60px] z-10 bg-neutral-100 font-serif font-black uppercase text-[12px] tracking-widest text-neutral-900 select-none ${section.isGenderSub ? 'italic capitalize pl-8 text-neutral-800' : ''}`} style={{ minWidth: "220px" }}>
                            {section.label}
                          </td>
                        </tr>
                      );

                      const rows = section.entries.map((entry) => {
                        globalIdx++;
                        const currentIdx = globalIdx;
                        const gross = getCellValue(entry, 'compGross');
                        const totalDed = columnsList
                          .filter(col => col.category === "DEDUCTIONS")
                          .reduce((sum, col) => sum + getCellValue(entry, col.key), 0);
                        const net = Number((gross - totalDed).toFixed(2));
                        const firstHalf = Number((net / 2).toFixed(2));
                        const secondHalf = Number((net - firstHalf).toFixed(2));

                        return (
                          <tr key={entry.id} className="hover:bg-slate-50/75 divide-x divide-neutral-200 transition-colors">
                            {/* Seq No */}
                            <td className="p-2 text-center sticky left-0 z-10 bg-slate-50 font-mono border-r border-neutral-200 text-neutral-500 font-medium" style={{ minWidth: "60px", width: "60px" }}>{currentIdx}</td>
                            {/* Name */}
                            <td className="p-2 sticky left-[60px] z-10 bg-white border-r border-neutral-200 font-bold text-neutral-800" style={{ minWidth: "220px", width: "220px" }}>
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="truncate block max-w-[140px]" title={entry.employeeName}>{entry.employeeName}</span>
                                <div className="flex items-center gap-1 shrink-0 ml-auto">
                                  <button
                                    onClick={() => openEmployeeDeductionsModal(entry)}
                                    className="p-1 rounded text-rose-600 hover:bg-rose-50 hover:text-rose-800 transition-colors cursor-pointer"
                                    title="Manage all deductions for this employee (GSIS, Pag-IBIG, PhilHealth, Tax, Loans)"
                                  >
                                    <SlidersHorizontal className="w-3.5 h-3.5" />
                                  </button>
                                  {selectedCycle?.status === 'draft' && (role === 'admin' || role === 'accountant') && (
                                    <button
                                      onClick={() => handleRemoveEmployee(entry.id)}
                                      className="p-1 rounded text-red-500 hover:bg-neutral-100 hover:text-red-700 transition-colors cursor-pointer"
                                      title="Remove employee from this cycle"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                            {/* Position */}
                            <td className="p-2 text-neutral-500 font-medium bg-white">
                              <div className="truncate max-w-[125px]" title={entry.position || entry.category || 'No Position'}>
                                {entry.position || entry.category || 'No Position'}
                              </div>
                            </td>
                            {/* Employee No */}
                            <td className="p-2 text-center bg-slate-50/40 text-neutral-700 font-mono text-[11px] font-semibold">
                              {entry.employeeNo || entry.friendlyEmployeeId || entry.employeeId}
                            </td>

                            {/* Government Shares Columns - Soft blue tones */}
                            {columnsList.filter(col => col.category === "GOV'T SHARES").map(col => {
                              const val = getCellValue(entry, col.key);
                              const isEditable = selectedCycle.status === 'draft';
                              return (
                                <td key={col.key} className="p-1 text-right font-mono bg-blue-50/20">
                                  {editingCell?.entryId === entry.id && editingCell?.key === col.key ? (
                                    <input
                                      autoFocus
                                      type="number"
                                      step="any"
                                      className="w-[68px] h-6 px-1 text-right text-xs border border-blue-500 focus:outline-none rounded bg-white shadow-xs"
                                      value={cellValue}
                                      onChange={(e) => setCellValue(e.target.value)}
                                      onBlur={() => handleSaveCell(entry.id, col.key)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveCell(entry.id, col.key);
                                        else if (e.key === 'Escape') setEditingCell(null);
                                      }}
                                    />
                                  ) : (
                                    <div
                                      onClick={() => isEditable && startEditCell(entry.id, col.key, val)}
                                      className={`font-mono text-xs cursor-pointer px-1 py-0.5 rounded select-none ${isEditable ? 'hover:bg-blue-100 text-blue-900 border border-dashed border-transparent hover:border-blue-300' : 'text-slate-600 cursor-not-allowed'}`}
                                    >
                                      ₱{formatCurrency(val)}
                                    </div>
                                  )}
                                </td>
                              );
                            })}

                            {/* Compensations Columns - Soft green tones */}
                            {columnsList.filter(col => col.category === 'COMPENSATIONS').map(col => {
                              const val = getCellValue(entry, col.key);
                              const isEditable = selectedCycle.status === 'draft' && !col.isReadOnly;
                              return (
                                <td key={col.key} className={`p-1 text-right ${col.key === 'compGross' ? 'bg-emerald-50/60 text-emerald-950 font-bold' : 'bg-emerald-50/10'}`}>
                                  {editingCell?.entryId === entry.id && editingCell?.key === col.key ? (
                                    <input
                                      autoFocus
                                      type="number"
                                      step="any"
                                      className="w-[68px] h-6 px-1 text-right text-xs border border-emerald-500 focus:outline-none rounded bg-white shadow-xs"
                                      value={cellValue}
                                      onChange={(e) => setCellValue(e.target.value)}
                                      onBlur={() => handleSaveCell(entry.id, col.key)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveCell(entry.id, col.key);
                                        else if (e.key === 'Escape') setEditingCell(null);
                                      }}
                                    />
                                  ) : (
                                    <div
                                      onClick={() => isEditable && startEditCell(entry.id, col.key, val)}
                                      className={`font-mono text-xs cursor-pointer px-1 py-0.5 rounded select-none ${isEditable ? 'hover:bg-emerald-100 text-emerald-900 border border-dashed border-transparent hover:border-emerald-300' : col.key === 'compGross' ? 'text-emerald-900 font-bold' : 'text-slate-600'}`}
                                    >
                                      ₱{formatCurrency(val)}
                                    </div>
                                  )}
                                </td>
                              );
                            })}

                            {/* Deductions Columns - Elegant Pastel Rose Theme without thick outlines */}
                            {columnsList.filter(col => col.category === 'DEDUCTIONS').map((col) => {
                              const val = getCellValue(entry, col.key);
                              const isEditable = selectedCycle.status === 'draft';

                              return (
                                <td 
                                  key={col.key} 
                                  className="p-1 text-right transition-colors border-r border-neutral-200"
                                  style={{ backgroundColor: '#fff5f5' }}
                                >
                                  {editingCell?.entryId === entry.id && editingCell?.key === col.key ? (
                                    <input
                                      autoFocus
                                      type="number"
                                      step="any"
                                      className="w-[68px] h-6 px-1 text-right text-xs border border-rose-500 focus:outline-none rounded bg-white shadow-xs text-rose-950"
                                      value={cellValue}
                                      onChange={(e) => setCellValue(e.target.value)}
                                      onBlur={() => handleSaveCell(entry.id, col.key)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveCell(entry.id, col.key);
                                        else if (e.key === 'Escape') setEditingCell(null);
                                      }}
                                    />
                                  ) : (
                                    <div
                                      onClick={() => isEditable && startEditCell(entry.id, col.key, val)}
                                      className={`font-mono text-[11px] cursor-pointer px-1 py-0.5 rounded select-none ${
                                        isEditable 
                                          ? 'hover:bg-rose-100 text-rose-950 border border-dashed border-transparent hover:border-rose-300' 
                                          : 'text-rose-900 cursor-not-allowed'
                                      } ${val > 0 ? 'text-rose-800 font-bold' : 'text-rose-300'}`}
                                    >
                                      ₱{formatCurrency(val)}
                                    </div>
                                  )}
                                </td>
                              );
                            })}

                            {/* Summaries: Total Deduct, Net Pay */}
                            <td className="p-2 font-mono text-xs text-right bg-rose-50/40 text-red-700 font-bold">
                              ₱{formatCurrency(totalDed)}
                            </td>
                            <td className="p-2 font-mono text-xs text-right bg-amber-50/60 text-amber-900 font-bold">
                              ₱{formatCurrency(net)}
                            </td>

                            {/* Net Disbursement: 1st, 2nd, Total */}
                            <td className="p-2 font-mono text-xs text-right bg-amber-50/15 text-amber-900 font-semibold">
                              ₱{formatCurrency(firstHalf)}
                            </td>
                            <td className="p-2 font-mono text-xs text-right bg-amber-50/15 text-amber-900 font-semibold">
                              ₱{formatCurrency(secondHalf)}
                            </td>
                            <td className="p-2 font-mono text-xs text-right bg-amber-50/45 text-amber-950 font-bold border-r border-neutral-200">
                              ₱{formatCurrency(net)}
                            </td>

                            {/* Signature Placeholder */}
                            <td className="p-2 text-center text-[10px] text-neutral-400 font-mono italic select-none">
                              Signature Attached
                            </td>
                          </tr>
                        );
                      });

                      return [headerRow, ...rows];
                    });
                  })()}
                </tbody>
                <tfoot className="sticky bottom-0 z-10 border-t-2 border-neutral-400 bg-neutral-100 shadow-[0_-2px_10px_rgba(0,0,0,0.08)]">
                  <tr className="divide-x divide-neutral-200 text-neutral-900 font-bold">
                    {/* Seq No */}
                    <td className="p-2.5 text-center sticky left-0 z-20 bg-neutral-200 font-extrabold border-r border-neutral-300 text-neutral-800 text-[11px]" style={{ minWidth: "60px", width: "60px" }}>
                      Σ
                    </td>
                    {/* Name */}
                    <td className="p-2.5 sticky left-[60px] z-20 bg-neutral-200 border-r border-neutral-300 font-extrabold text-neutral-950 text-[11px] tracking-wider uppercase" style={{ minWidth: "220px", width: "220px" }}>
                      TOTALS
                    </td>
                    {/* Position */}
                    <td className="p-2.5 bg-neutral-50 font-bold text-center text-neutral-500 text-[10px]">-</td>
                    {/* Employee No */}
                    <td className="p-2.5 bg-neutral-50 font-bold text-center text-neutral-500 text-[10px]">-</td>

                    {/* Government Shares Columns */}
                    {columnsList.filter(col => col.category === "GOV'T SHARES").map(col => {
                      const totalVal = filteredEntries.reduce((sum, entry) => sum + getCellValue(entry, col.key), 0);
                      return (
                        <td key={`tot-${col.key}`} className="p-2 text-right font-mono text-[11px] text-blue-950 bg-blue-50/50 font-bold">
                          ₱{formatCurrency(totalVal)}
                        </td>
                      );
                    })}

                    {/* Compensations Columns */}
                    {columnsList.filter(col => col.category === 'COMPENSATIONS').map(col => {
                      const totalVal = filteredEntries.reduce((sum, entry) => sum + getCellValue(entry, col.key), 0);
                      return (
                        <td key={`tot-${col.key}`} className={`p-2 text-right font-mono text-[11px] font-bold ${col.key === 'compGross' ? 'bg-emerald-100/80 text-emerald-950 font-extrabold' : 'bg-emerald-50/50 text-emerald-900'}`}>
                          ₱{formatCurrency(totalVal)}
                        </td>
                      );
                    })}

                    {/* Deductions Columns */}
                    {columnsList.filter(col => col.category === 'DEDUCTIONS').map(col => {
                      const totalVal = filteredEntries.reduce((sum, entry) => sum + getCellValue(entry, col.key), 0);
                      return (
                        <td key={`tot-${col.key}`} className="p-2 text-right font-mono text-[11px] font-bold text-rose-950 bg-rose-50 border-r border-neutral-200">
                          ₱{formatCurrency(totalVal)}
                        </td>
                      );
                    })}

                    {/* Total Deductions */}
                    <td className="p-2 font-mono text-[11px] text-right bg-rose-100 text-red-900 font-extrabold border-r border-neutral-200">
                      ₱{formatCurrency(filteredEntries.reduce((sum, entry) => {
                        const totalDed = columnsList
                          .filter(col => col.category === "DEDUCTIONS")
                          .reduce((s, col) => s + getCellValue(entry, col.key), 0);
                        return sum + totalDed;
                      }, 0))}
                    </td>

                    {/* Net Pay */}
                    <td className="p-2 font-mono text-[11px] text-right bg-amber-100 text-amber-950 font-extrabold border-r border-neutral-200">
                      ₱{formatCurrency(filteredEntries.reduce((sum, entry) => {
                        const gross = getCellValue(entry, 'compGross');
                        const totalDed = columnsList
                          .filter(col => col.category === "DEDUCTIONS")
                          .reduce((s, col) => s + getCellValue(entry, col.key), 0);
                        return sum + (gross - totalDed);
                      }, 0))}
                    </td>

                    {/* 1st Half */}
                    <td className="p-2 font-mono text-[11px] text-right bg-amber-50 text-amber-950 font-bold border-r border-neutral-200">
                      ₱{formatCurrency(filteredEntries.reduce((sum, entry) => {
                        const gross = getCellValue(entry, 'compGross');
                        const totalDed = columnsList
                          .filter(col => col.category === "DEDUCTIONS")
                          .reduce((s, col) => s + getCellValue(entry, col.key), 0);
                        const net = Number((gross - totalDed).toFixed(2));
                        const firstHalf = Number((net / 2).toFixed(2));
                        return sum + firstHalf;
                      }, 0))}
                    </td>

                    {/* 2nd Half */}
                    <td className="p-2 font-mono text-[11px] text-right bg-amber-50 text-amber-950 font-bold border-r border-neutral-200">
                      ₱{formatCurrency(filteredEntries.reduce((sum, entry) => {
                        const gross = getCellValue(entry, 'compGross');
                        const totalDed = columnsList
                          .filter(col => col.category === "DEDUCTIONS")
                          .reduce((s, col) => s + getCellValue(entry, col.key), 0);
                        const net = Number((gross - totalDed).toFixed(2));
                        const firstHalf = Number((net / 2).toFixed(2));
                        const secondHalf = Number((net - firstHalf).toFixed(2));
                        return sum + secondHalf;
                      }, 0))}
                    </td>

                    {/* Total Net */}
                    <td className="p-2 font-mono text-[11px] text-right bg-amber-100 text-amber-950 font-extrabold border-r border-neutral-200">
                      ₱{formatCurrency(filteredEntries.reduce((sum, entry) => {
                        const gross = getCellValue(entry, 'compGross');
                        const totalDed = columnsList
                          .filter(col => col.category === "DEDUCTIONS")
                          .reduce((s, col) => s + getCellValue(entry, col.key), 0);
                        const net = Number((gross - totalDed).toFixed(2));
                        return sum + net;
                      }, 0))}
                    </td>

                    {/* Recipient Signature placeholder */}
                    <td className="p-2 bg-neutral-50 font-bold text-center text-neutral-400 font-mono text-[10px] italic">-</td>
                  </tr>
                </tfoot>
              </table>
              </div>
            </div>
            </div>
        </div>
      </div>
      ) : (
        <div className="space-y-6">
          {/* Main Payroll Hub Header & Navigation Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-neutral-200 shadow-xs">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-neutral-900 flex items-center gap-2">
                Payroll Hub
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Active processing cycles & official database records (by Year & Month)
              </p>
            </div>

            <div className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded-xl border border-neutral-200/80">
              <Button
                variant={mainTab === 'cycles' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setMainTab('cycles')}
                className={`h-9 px-4 text-xs font-bold gap-2 rounded-lg transition-all ${
                  mainTab === 'cycles'
                    ? 'bg-neutral-900 text-white shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Payroll Cycles
                <Badge className={`ml-1 text-[10px] px-1.5 py-0 ${mainTab === 'cycles' ? 'bg-neutral-800 text-neutral-200' : 'bg-neutral-200 text-neutral-700'}`}>
                  {cycles.length}
                </Badge>
              </Button>

              <Button
                variant={mainTab === 'records' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setMainTab('records')}
                className={`h-9 px-4 text-xs font-bold gap-2 rounded-lg transition-all ${
                  mainTab === 'records'
                    ? 'bg-blue-900 text-white shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60'
                }`}
              >
                <Database className="w-3.5 h-3.5 text-blue-400" />
                Payroll Records
                <Badge className={`ml-1 text-[10px] px-1.5 py-0 ${mainTab === 'records' ? 'bg-blue-800 text-blue-100' : 'bg-blue-100 text-blue-800'}`}>
                  By Year & Month
                </Badge>
              </Button>
            </div>
          </div>

          {mainTab === 'records' ? (
            <PayrollRecords 
              cycles={cycles} 
              onRefreshCycles={fetchCycles} 
              onBackToCycles={() => setMainTab('cycles')} 
            />
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-neutral-900">Active Payroll Cycles</h3>
                  <p className="text-xs text-neutral-500">Manage active draft, processing, and completed salary batches prior to disbursement.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <Input 
              placeholder="Search cycles..." 
              className="pl-10 h-9 bg-white"
              value={cycleSearchTerm}
              onChange={e => setCycleSearchTerm(e.target.value)}
            />
          </div>
          <Select 
            value={filterStatus} 
            onValueChange={(v: string | null) => {
              if (v) setFilterStatus(v);
            }}
          >
            <SelectTrigger className="w-[140px] h-9 bg-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select 
            value={filterType} 
            onValueChange={(v: string | null) => {
              if (v) setFilterType(v);
            }}
          >
            <SelectTrigger className="w-[140px] h-9 bg-white">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="semi-monthly">Semi-Monthly</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterManaged} onValueChange={(v: any) => setFilterManaged(v)}>
            <SelectTrigger className="w-[160px] h-9 bg-white">
              <SelectValue placeholder="Approval Scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Batches</SelectItem>
              <SelectItem value="my-managed">My Managed Batches</SelectItem>
            </SelectContent>
          </Select>
          { (cycleSearchTerm || filterStatus !== 'all' || filterType !== 'all' || filterManaged !== 'all') && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-9 px-2 text-neutral-500"
              onClick={() => {
                setCycleSearchTerm('');
                setFilterStatus('all');
                setFilterType('all');
                setFilterManaged('all');
              }}
            >
              Reset
            </Button>
          )}
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger render={(props) => (
            <Button {...props} className="bg-neutral-900 text-white gap-2">
              <Plus className="w-4 h-4" />
              New Cycle
            </Button>
          )} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Payroll Cycle</DialogTitle>
              <DialogDescription>
                Define the period and assign managing accountant for this cycle.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateCycle} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Cycle Name</Label>
                <Input 
                  id="name" 
                  placeholder="e.g. April 2026 - First Half" 
                  value={newCycle.name}
                  onChange={e => setNewCycle({...newCycle, name: e.target.value})}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Cycle Type</Label>
                  <Select 
                    value={newCycle.type} 
                    onValueChange={(v: string | null) => {
                      if (v) setNewCycle(prev => ({ ...prev, type: v }));
                    }}
                  >
                    <SelectTrigger id="type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Employees</SelectItem>
                      <SelectItem value="monthly">Monthly Only</SelectItem>
                      <SelectItem value="semi-monthly">Semi-Monthly Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="categoryFilter">Category Filter</Label>
                  <Select 
                    value={newCycle.categoryFilter} 
                    onValueChange={(v: string | null) => {
                      if (v) setNewCycle(prev => ({ ...prev, categoryFilter: v }));
                    }}
                  >
                    <SelectTrigger id="categoryFilter">
                      <SelectValue placeholder="Select category filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="faculty-staff">only FACULTY AND STAFF</SelectItem>
                      <SelectItem value="visiting-instructor">only Visiting Instructor</SelectItem>
                      <SelectItem value="job-order">only Job Order</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="managedBy">Managing Accountant</Label>
                  <select 
                    id="managedBy"
                    value={newCycle.managedBy} 
                    onChange={e => {
                      const accId = e.target.value;
                      const acc = accountantsList.find((a: any) => a.id === accId);
                      setNewCycle({
                        ...newCycle, 
                        managedBy: accId,
                        managedByName: acc?.displayName || 'System Accountant'
                      });
                    }}
                    className="w-full h-10 px-3 py-2 text-sm border border-neutral-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  >
                    {accountantsList.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>{acc.displayName} ({acc.campus || 'Main'})</option>
                    ))}
                    {accountantsList.length === 0 && (
                      <option value="accountant-1">System Accountant (Hinunangan)</option>
                    )}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="campus">Target Campus Scope</Label>
                  <select 
                    id="campus"
                    value={newCycle.campus} 
                    onChange={e => setNewCycle({...newCycle, campus: e.target.value})}
                    className="w-full h-10 px-3 py-2 text-sm border border-neutral-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  >
                    <option value="All Campuses">All Campuses</option>
                    {SLSU_CAMPUSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input 
                    id="startDate" 
                    type="date" 
                    value={newCycle.startDate}
                    onChange={e => setNewCycle({...newCycle, startDate: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input 
                    id="endDate" 
                    type="date" 
                    value={newCycle.endDate}
                    onChange={e => setNewCycle({...newCycle, endDate: e.target.value})}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button 
                  type="submit" 
                  className="w-full bg-neutral-900 text-white gap-2"
                  disabled={isCreatingCycle}
                >
                  {isCreatingCycle && <Loader2 className="w-4 h-4 animate-spin text-white" />}
                  {isCreatingCycle ? 'Creating Cycle...' : 'Create Cycle'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading && cycles.length === 0 ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse border-neutral-200 p-6 space-y-4 bg-white rounded-xl">
              <div className="flex items-center justify-between">
                <div className="h-5 w-20 bg-neutral-100/50 rounded-full animate-pulse" />
                <div className="h-5 w-16 bg-neutral-100/50 rounded-full animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="h-6 w-3/4 bg-neutral-100/60 rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-neutral-100/40 rounded animate-pulse" />
              </div>
              <div className="pt-4 border-t border-neutral-100 flex justify-between items-center">
                <div className="space-y-1">
                  <div className="h-3 w-12 bg-neutral-100/40 rounded animate-pulse" />
                  <div className="h-5 w-24 bg-neutral-100/50 rounded animate-pulse" />
                </div>
                <div className="h-8 w-8 bg-neutral-100/50 rounded-full animate-pulse" />
              </div>
            </Card>
          ))
        ) : (
          filteredCycles.map((cycle) => (
          <Card key={cycle.id} className="group hover:shadow-lg transition-all duration-300 border-neutral-200 cursor-pointer relative" onClick={() => setSelectedCycle(cycle)}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between mb-2">
                <Badge className={cn(
                  "font-bold",
                  cycle.status === 'disbursed' ? "bg-emerald-100 text-emerald-700" : 
                  cycle.status === 'completed' ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                )}>
                  {cycle.status.toUpperCase()}
                </Badge>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {cycle.type || 'ALL'}
                  </Badge>
                  {cycle.categoryFilter && cycle.categoryFilter !== 'all' && (
                    <Badge variant="secondary" className="text-[10px] bg-neutral-100 text-neutral-800 border-none font-bold uppercase">
                      {cycle.categoryFilter === 'faculty-staff' ? 'FACULTY & STAFF' :
                       cycle.categoryFilter === 'visiting-instructor' ? 'VISITING INST.' :
                       cycle.categoryFilter === 'job-order' ? 'JOB ORDER' : cycle.categoryFilter}
                    </Badge>
                  )}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-neutral-400 hover:text-red-600 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setItemToDelete({ id: cycle.id, type: 'cycle' });
                        setIsDeleteOpen(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  <CalendarIcon className="w-4 h-4 text-neutral-400" />
                </div>
              </div>
              <CardTitle className="text-xl">{cycle.name}</CardTitle>
              <CardDescription>
                {format(new Date(cycle.startDate), 'MMM dd')} - {format(new Date(cycle.endDate), 'MMM dd, yyyy')}
              </CardDescription>

              <div className="pt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-800 border-blue-200 gap-1 font-medium">
                  <Shield className="w-3 h-3 text-blue-600" />
                  {cycle.managedByName || 'System Accountant'}
                </Badge>
                {cycle.campus && (
                  <Badge variant="outline" className="text-[10px] text-neutral-600 border-neutral-200 gap-1 font-medium">
                    <Building2 className="w-3 h-3 text-neutral-400" />
                    {cycle.campus}
                  </Badge>
                )}
                {isBatchManagedByMe(cycle) && (
                  <Badge className="text-[9px] bg-emerald-600 text-white font-bold px-1.5 py-0">
                    Your Batch
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {cycle.status === 'draft' && (
                <div className="mb-4 space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    <span>Period Progress</span>
                    <span>{Math.round(getCycleProgress(cycle.startDate, cycle.endDate).percent)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-neutral-900 transition-all duration-500" 
                      style={{ width: `${getCycleProgress(cycle.startDate, cycle.endDate).percent}%` }} 
                    />
                  </div>
                  <p className="text-[10px] text-neutral-400 font-medium">
                    Day {getCycleProgress(cycle.startDate, cycle.endDate).elapsed} of {getCycleProgress(cycle.startDate, cycle.endDate).total}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
                <div>
                  <p className="text-xs text-neutral-400 uppercase font-bold tracking-wider">Total Net</p>
                  <p className="text-lg font-bold text-neutral-900">₱{formatCurrency(cycle.totalNet)}</p>
                </div>
                <div className="bg-neutral-50 p-2 rounded-full group-hover:bg-neutral-900 group-hover:text-white transition-colors">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        )))}
        {cycles.length === 0 && !loading && (
          <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-neutral-300">
            <FileText className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-neutral-900">No Payroll Cycles</h3>
            <p className="text-neutral-500">Start by creating a new payroll cycle for this period.</p>
          </div>
        )}
      </div>
      </div>
      )}
      </div>
      )}

      <DeleteConfirmationDialog 
        isOpen={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        title={itemToDelete?.type === 'cycle' ? "Delete Payroll Cycle" : "Remove Employee"}
        description={itemToDelete?.type === 'cycle' 
          ? "Are you sure you want to delete this payroll cycle? This will remove all generated entries and cannot be undone." 
          : "Are you sure you want to remove this employee from the payroll cycle?"}
      />

      {/* Employee Deductions Manager Dialog */}
      <Dialog open={!!selectedEntryForDeductions} onOpenChange={(open) => !open && setSelectedEntryForDeductions(null)}>
        <DialogContent className="sm:max-w-[840px] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-white rounded-2xl shadow-2xl border border-neutral-200">
          <DialogHeader className="p-6 pb-4 shrink-0 bg-neutral-900 text-white">
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2.5 text-white">
                  <SlidersHorizontal className="w-5 h-5 text-rose-400" />
                  <span>Manage Employee Deductions</span>
                </DialogTitle>
                <DialogDescription className="text-neutral-300 text-xs mt-1">
                  Adjust standard loans, statutory contributions, and custom deductions for this payroll period. Changes automatically synchronize with the Deductions master directory.
                </DialogDescription>
              </div>
            </div>

            {selectedEntryForDeductions && (
              <div className="mt-4 pt-3 border-t border-neutral-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-neutral-800/80 p-2.5 rounded-lg border border-neutral-700">
                  <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">Employee Name</span>
                  <span className="font-bold text-white text-sm truncate block">{selectedEntryForDeductions.employeeName}</span>
                </div>
                <div className="bg-neutral-800/80 p-2.5 rounded-lg border border-neutral-700">
                  <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">ID / Position</span>
                  <span className="font-semibold text-neutral-200 text-xs truncate block">
                    {selectedEntryForDeductions.employeeNo || selectedEntryForDeductions.employeeId} • {selectedEntryForDeductions.position || selectedEntryForDeductions.category}
                  </span>
                </div>
                <div className="bg-neutral-800/80 p-2.5 rounded-lg border border-neutral-700">
                  <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">Basic Pay (Wages)</span>
                  <span className="font-bold text-emerald-400 text-sm">
                    ₱{formatCurrency(getCellValue(selectedEntryForDeductions, 'compSal2nd'))}
                  </span>
                </div>
                <div className="bg-neutral-800/80 p-2.5 rounded-lg border border-neutral-700">
                  <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">Gross Earnings</span>
                  <span className="font-bold text-emerald-300 text-sm">
                    ₱{formatCurrency(getCellValue(selectedEntryForDeductions, 'compGross'))}
                  </span>
                </div>
              </div>
            )}
          </DialogHeader>

          {/* Quick Statutory Calculation Toolbar */}
          {selectedEntryForDeductions && (
            <div className="px-6 py-2.5 bg-rose-50/50 border-b border-rose-100 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 text-xs text-rose-900 font-semibold">
                <Calculator className="w-4 h-4 text-rose-600" />
                <span>Quick Statutory Fill:</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] px-2.5 bg-white border-rose-200 text-rose-800 hover:bg-rose-100"
                  onClick={() => {
                    const basic = getCellValue(selectedEntryForDeductions, 'compSal2nd');
                    const isSemi = selectedCycle?.periodType === 'semi-monthly';
                    const gsis = Number(((basic * 0.09) / (isSemi ? 2 : 1)).toFixed(2));
                    setEmployeeDeductionsDraft(prev => ({ ...prev, dedGsisPremPersonal: gsis }));
                    toast.success(`Applied 9% GSIS: ₱${formatCurrency(gsis)}`);
                  }}
                >
                  GSIS 9%
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] px-2.5 bg-white border-rose-200 text-rose-800 hover:bg-rose-100"
                  onClick={() => {
                    const basic = getCellValue(selectedEntryForDeductions, 'compSal2nd');
                    const isSemi = selectedCycle?.periodType === 'semi-monthly';
                    const hdmf = Number((Math.min(100, basic * 0.02) / (isSemi ? 2 : 1)).toFixed(2));
                    setEmployeeDeductionsDraft(prev => ({ ...prev, dedPagibigPersonal: hdmf }));
                    toast.success(`Applied 2% HDMF: ₱${formatCurrency(hdmf)}`);
                  }}
                >
                  HDMF 2%
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] px-2.5 bg-white border-rose-200 text-rose-800 hover:bg-rose-100"
                  onClick={() => {
                    const basic = getCellValue(selectedEntryForDeductions, 'compSal2nd');
                    const isSemi = selectedCycle?.periodType === 'semi-monthly';
                    const ph = Number(((basic * 0.025) / (isSemi ? 2 : 1)).toFixed(2));
                    setEmployeeDeductionsDraft(prev => ({ ...prev, dedPhilhealthCont: ph }));
                    toast.success(`Applied 2.5% PhilHealth: ₱${formatCurrency(ph)}`);
                  }}
                >
                  PhilHealth 2.5%
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px] px-2 text-neutral-500 hover:text-red-600 hover:bg-red-50"
                  onClick={() => {
                    const cleared: { [k: string]: number } = {};
                    Object.keys(employeeDeductionsDraft).forEach(k => { cleared[k] = 0; });
                    setEmployeeDeductionsDraft(cleared);
                    toast.info("Cleared all deduction amounts");
                  }}
                >
                  Clear All
                </Button>
              </div>
            </div>
          )}

          {/* Form Scrollable Body */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-neutral-50/30">
            {/* GSIS Section */}
            <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-neutral-100">
                <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 font-bold text-[10px]">
                  GSIS
                </Badge>
                <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wide">
                  GSIS Loans & Contributions (9 Items)
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {standardDeductions.filter(d => d.org === 'GSIS').map(item => (
                  <div key={item.key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] font-semibold text-neutral-700 truncate" title={item.label}>
                        {item.shortLabel}
                      </Label>
                      {item.hasFormula && (
                        <span className="text-[9px] text-neutral-400 font-mono italic">Formula</span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs font-mono">₱</span>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        className="pl-6 h-8 text-xs font-mono text-right bg-white"
                        value={employeeDeductionsDraft[item.key] ?? 0}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          setEmployeeDeductionsDraft(prev => ({ ...prev, [item.key]: v }));
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pag-IBIG Section */}
            <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-neutral-100">
                <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 font-bold text-[10px]">
                  PAG-IBIG
                </Badge>
                <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wide">
                  Pag-IBIG / HDMF Contributions & Loans (3 Items)
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {standardDeductions.filter(d => d.org === 'PAG-IBIG').map(item => (
                  <div key={item.key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] font-semibold text-neutral-700 truncate" title={item.label}>
                        {item.shortLabel}
                      </Label>
                      {item.hasFormula && (
                        <span className="text-[9px] text-neutral-400 font-mono italic">Formula</span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs font-mono">₱</span>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        className="pl-6 h-8 text-xs font-mono text-right bg-white"
                        value={employeeDeductionsDraft[item.key] ?? 0}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          setEmployeeDeductionsDraft(prev => ({ ...prev, [item.key]: v }));
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* PhilHealth, SSS, Bank & Taxes Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* PhilHealth & SSS */}
              <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-neutral-100">
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 font-bold text-[10px]">
                    HEALTH & SSS
                  </Badge>
                  <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wide">
                    PhilHealth & SSS
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {standardDeductions.filter(d => d.org === 'PHILHEALTH' || d.org === 'SSS').map(item => (
                    <div key={item.key} className="space-y-1">
                      <Label className="text-[11px] font-semibold text-neutral-700 truncate block" title={item.label}>
                        {item.shortLabel}
                      </Label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs font-mono">₱</span>
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          className="pl-6 h-8 text-xs font-mono text-right bg-white"
                          value={employeeDeductionsDraft[item.key] ?? 0}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value) || 0;
                            setEmployeeDeductionsDraft(prev => ({ ...prev, [item.key]: v }));
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bank Loans & Tax */}
              <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-neutral-100">
                  <Badge variant="outline" className="bg-purple-50 text-purple-800 border-purple-200 font-bold text-[10px]">
                    BANK & TAX
                  </Badge>
                  <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wide">
                    China Bank & BIR Tax
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {standardDeductions.filter(d => d.org === 'CSB' || d.org === 'TAX').map(item => (
                    <div key={item.key} className="space-y-1">
                      <Label className="text-[11px] font-semibold text-neutral-700 truncate block" title={item.label}>
                        {item.shortLabel}
                      </Label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs font-mono">₱</span>
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          className="pl-6 h-8 text-xs font-mono text-right bg-white"
                          value={employeeDeductionsDraft[item.key] ?? 0}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value) || 0;
                            setEmployeeDeductionsDraft(prev => ({ ...prev, [item.key]: v }));
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Custom / Additional Deductions */}
            <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-neutral-100 text-neutral-800 border-neutral-300 font-bold text-[10px]">
                    CUSTOM
                  </Badge>
                  <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wide">
                    Custom & University Deductions
                  </h4>
                </div>
              </div>

              {/* Existing Custom Deductions in Draft */}
              {Object.entries(employeeDeductionsDraft)
                .filter(([k]) => !standardDeductions.some(s => s.key === k) && !['compSal2nd', 'compPera', 'compGross', 'absences'].includes(k))
                .length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  {Object.entries(employeeDeductionsDraft)
                    .filter(([k]) => !standardDeductions.some(s => s.key === k) && !['compSal2nd', 'compPera', 'compGross', 'absences'].includes(k))
                    .map(([k, val]) => {
                      const cleanLabel = k.replace(/^ded_/, '').replace(/_/g, ' ').toUpperCase();
                      return (
                        <div key={k} className="p-2.5 bg-neutral-50 rounded-lg border border-neutral-200 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-neutral-800 truncate" title={cleanLabel}>
                              {cleanLabel}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEmployeeDeductionsDraft(prev => {
                                  const copy = { ...prev };
                                  delete copy[k];
                                  return copy;
                                });
                              }}
                              className="text-neutral-400 hover:text-red-600 transition-colors p-0.5"
                              title="Remove custom deduction"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs font-mono">₱</span>
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              className="pl-6 h-8 text-xs font-mono text-right bg-white"
                              value={val}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value) || 0;
                                setEmployeeDeductionsDraft(prev => ({ ...prev, [k]: v }));
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Add New Custom Deduction Form */}
              <div className="p-3 bg-neutral-50/70 rounded-lg border border-dashed border-neutral-300 flex flex-col sm:flex-row items-end gap-2.5">
                <div className="flex-1 w-full space-y-1">
                  <Label className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">New Deduction Name</Label>
                  <Input
                    placeholder="e.g. Faculty Union Dues, Cooperative"
                    className="h-8 text-xs bg-white"
                    value={customDeductionName}
                    onChange={e => setCustomDeductionName(e.target.value)}
                  />
                </div>
                <div className="w-full sm:w-36 space-y-1">
                  <Label className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Amount (₱)</Label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    className="h-8 text-xs font-mono text-right bg-white"
                    value={customDeductionAmount}
                    onChange={e => setCustomDeductionAmount(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 bg-neutral-900 text-white hover:bg-neutral-800 text-xs shrink-0 w-full sm:w-auto"
                  onClick={() => {
                    if (!customDeductionName.trim()) {
                      toast.error("Please enter a deduction name");
                      return;
                    }
                    const amt = parseFloat(customDeductionAmount) || 0;
                    const key = 'ded_' + customDeductionName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
                    setEmployeeDeductionsDraft(prev => ({ ...prev, [key]: amt }));
                    setCustomDeductionName('');
                    setCustomDeductionAmount('');
                    toast.success(`Added deduction "${customDeductionName}"`);
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Field</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Real-time Summary Footer */}
          {selectedEntryForDeductions && (() => {
            const basic = getCellValue(selectedEntryForDeductions, 'compSal2nd');
            const gross = getCellValue(selectedEntryForDeductions, 'compGross');
            const totalDraftDeductions = Object.values(employeeDeductionsDraft).reduce((sum, v) => sum + (Number(v) || 0), 0);
            const estNet = Math.max(0, Number((gross - totalDraftDeductions).toFixed(2)));

            return (
              <DialogFooter className="p-4 px-6 border-t border-neutral-200 bg-neutral-50/90 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-neutral-500">Gross:</span>
                    <span className="font-bold font-mono text-neutral-800">₱{formatCurrency(gross)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-neutral-500">Total Deduct:</span>
                    <span className="font-bold font-mono text-rose-600">₱{formatCurrency(totalDraftDeductions)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 pl-2 border-l border-neutral-200">
                    <span className="text-neutral-500">Net Pay:</span>
                    <span className="font-extrabold font-mono text-emerald-600 text-sm">₱{formatCurrency(estNet)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 px-4 text-xs"
                    onClick={() => setSelectedEntryForDeductions(null)}
                    disabled={isSavingEmployeeDeductions}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 px-5 gap-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold shadow-xs"
                    onClick={handleSaveEmployeeDeductions}
                    disabled={isSavingEmployeeDeductions}
                  >
                    {isSavingEmployeeDeductions ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>{isSavingEmployeeDeductions ? "Saving & Syncing..." : "Save & Sync Master"}</span>
                  </Button>
                </div>
              </DialogFooter>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Import Deductions Preview Modal */}
      <Dialog open={isDeductionPreviewOpen} onOpenChange={setIsDeductionPreviewOpen}>
        <DialogContent className="sm:max-w-[750px] max-h-[85vh] flex flex-col p-0 overflow-hidden bg-white rounded-xl">
          <DialogHeader className="p-6 pb-2 shrink-0">
            <DialogTitle className="text-xl font-bold text-neutral-900 flex items-center gap-2">
              Import Payroll Deductions Preview
            </DialogTitle>
            <DialogDescription>
              Review the parsed employee list and deductions/allowance overrides before committing the import. A total of {deductionPreviewData.length} records found.
            </DialogDescription>
          </DialogHeader>

          {/* Search Table */}
          <div className="px-6 py-2 flex items-center justify-between gap-4 shrink-0">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <Input
                placeholder="Search by participant name..."
                value={deductionPreviewSearch}
                onChange={e => setDeductionPreviewSearch(e.target.value)}
                className="pl-10 h-9 text-xs"
              />
            </div>
            <div className="text-xs font-semibold text-neutral-600 font-sans">
              Matched: {deductionPreviewData.filter(r => r.isMatched).length} / {deductionPreviewData.length} records
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-4 custom-scrollbar">
            <div className="border border-neutral-200 rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="bg-neutral-50 sticky top-0">
                  <TableRow>
                    <TableHead className="font-bold text-xs">ID</TableHead>
                    <TableHead className="font-bold text-xs">Full Name & Mapping</TableHead>
                    <TableHead className="font-bold text-xs text-right">Overrides/Deductions Total</TableHead>
                    <TableHead className="font-bold text-xs text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deductionPreviewData
                    .filter(row => row.nameInExcel.toLowerCase().includes(deductionPreviewSearch.toLowerCase()))
                    .map((row, i) => {
                      // Total deductions: all keys matching ded* or absences
                      const totalDeds = Object.entries(row.deductions || {})
                        .filter(([k]) => k.startsWith('ded') || k === 'absences')
                        .reduce((sum, [_, v]) => sum + Number(v || 0), 0);

                      // Total compensations: all keys matching comp* except compGross
                      const totalComps = Object.entries(row.deductions || {})
                        .filter(([k]) => k.startsWith('comp') && k !== 'compGross')
                        .reduce((sum, [_, v]) => sum + Number(v || 0), 0);

                      const activeDeds = Object.entries(row.deductions || {})
                        .filter(([_, val]) => Number(val) > 0)
                        .map(([key, val]) => {
                          const label = columnsList.find(c => c.key === key)?.label || key;
                          return `${label}: ₱${formatCurrency(Number(val))}`;
                        });

                      return (
                        <TableRow key={i} className="hover:bg-neutral-50/50">
                          <TableCell className="font-mono text-xs">{row.bpno || 'N/A'}</TableCell>
                          <TableCell>
                            <div className="font-semibold text-xs text-neutral-800">{row.nameInExcel}</div>
                            
                            {/* Manual dropdown match selection */}
                            <div className="mt-1.5 flex flex-col gap-0.5 max-w-[260px]">
                              <span className="text-[9px] text-neutral-400 font-sans font-medium uppercase tracking-wider">System Employee Map:</span>
                              <select
                                className={`text-[11px] border rounded-lg px-2 py-1 outline-none font-sans w-full transition-all bg-white ${
                                  row.isMatched 
                                    ? (row.isAutoAdd ? "border-indigo-200 bg-indigo-50/20 text-indigo-900 font-semibold" : "border-neutral-200 text-neutral-850") 
                                    : "border-amber-300 bg-amber-55/10 text-amber-950 font-bold shadow-3xs"
                                }`}
                                value={row.matchedEntryId || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const newData = [...deductionPreviewData];
                                  if (val === "") {
                                    newData[i] = {
                                      ...newData[i],
                                      matchedEntryId: null,
                                      employeeName: null,
                                      friendlyEmployeeId: null,
                                      isMatched: false,
                                      isAutoAdd: false,
                                      matchedEmployeeId: null
                                    };
                                  } else if (val.startsWith("new-emp-")) {
                                    const targetEmpId = val.replace("new-emp-", "");
                                    const matchingEmp = allEmployeesList.find((emp: any) => emp.id === targetEmpId);
                                    if (matchingEmp) {
                                      newData[i] = {
                                        ...newData[i],
                                        matchedEntryId: val,
                                        employeeName: formatEmployeeName(matchingEmp),
                                        friendlyEmployeeId: matchingEmp.employeeNo || matchingEmp.employeeId || matchingEmp.bpno,
                                        isMatched: true,
                                        isAutoAdd: true,
                                        matchedEmployeeId: matchingEmp.id
                                      };
                                    }
                                  } else {
                                    const matchingEntry = entries.find((empEntry: any) => empEntry.id === val);
                                    if (matchingEntry) {
                                      newData[i] = {
                                        ...newData[i],
                                        matchedEntryId: matchingEntry.id,
                                        employeeName: matchingEntry.employeeName,
                                        friendlyEmployeeId: matchingEntry.friendlyEmployeeId,
                                        isMatched: true,
                                        isAutoAdd: false,
                                        matchedEmployeeId: null
                                      };
                                    }
                                  }
                                  setDeductionPreviewData(newData);
                                }}
                              >
                                <option value="">⚠️ -- Specify Employee Match --</option>
                                <optgroup label="Present in Payroll Cycle">
                                  {entries.map((empEntry: any) => (
                                    <option key={empEntry.id} value={empEntry.id}>
                                      {empEntry.employeeName} ({empEntry.employeeNo || empEntry.friendlyEmployeeId || empEntry.bpno})
                                    </option>
                                  ))}
                                </optgroup>
                                <optgroup label="Other Employees (Auto-Add to Cycle)">
                                  {allEmployeesList
                                    .filter((emp: any) => !entries.some((e: any) => e.employeeId === emp.id))
                                    .map((emp: any) => (
                                      <option key={emp.id} value={`new-emp-${emp.id}`}>
                                        ✨ {formatEmployeeName(emp)} ({emp.employeeNo || emp.employeeId || emp.bpno || 'DRAFT'})
                                      </option>
                                    ))}
                                </optgroup>
                              </select>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="font-semibold text-xs text-rose-600">
                              ₱{formatCurrency(totalDeds)}
                            </div>
                            {totalComps > 0 && (
                              <div className="text-[10px] text-emerald-600 font-bold">
                                + ₱{formatCurrency(totalComps)} (Compensations)
                              </div>
                            )}
                            <div className="text-[10px] text-neutral-400 font-sans max-w-[200px] ml-auto whitespace-normal leading-normal mt-0.5" title={activeDeds.join(", ")}>
                              {activeDeds.length > 0 ? activeDeds.join(" | ") : "No extra mappings"}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {row.isMatched ? (
                              row.isAutoAdd ? (
                                <Badge className="bg-indigo-50 text-indigo-700 text-[10px] hover:bg-indigo-50 border border-indigo-200/50 rounded px-2 py-0.5 font-bold uppercase font-sans whitespace-nowrap">
                                  Auto-Add
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-50 text-emerald-700 text-[10px] hover:bg-emerald-50 border border-emerald-200/50 rounded px-2 py-0.5 font-bold uppercase font-sans whitespace-nowrap">
                                  Matched
                                </Badge>
                              )
                            ) : (
                              <Badge className="bg-amber-50 text-amber-700 text-[10px] hover:bg-amber-50 border border-amber-200/50 rounded px-2 py-0.5 font-bold uppercase font-sans whitespace-nowrap">
                                Unmatched
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter className="p-6 pt-2 border-t border-neutral-100 bg-neutral-50 shrink-0">
            <Button
              variant="outline"
              onClick={() => setIsDeductionPreviewOpen(false)}
              disabled={isImportingDeductions}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmImportDeductions}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-medium"
              disabled={isImportingDeductions}
            >
              {isImportingDeductions ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Importing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Confirm Import ({deductionPreviewData.length} Employees)
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Payroll;
