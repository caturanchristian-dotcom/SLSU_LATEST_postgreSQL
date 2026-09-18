import React, { useState, useMemo } from 'react';
import { 
  GitFork, 
  Shield, 
  Users, 
  CreditCard, 
  Clock, 
  BookOpen, 
  CheckCircle2, 
  ArrowRight, 
  ExternalLink, 
  Layers, 
  Filter, 
  Search, 
  Download, 
  HelpCircle, 
  UserCheck, 
  Building2, 
  FileSpreadsheet, 
  Sparkles, 
  ChevronRight,
  TrendingUp,
  FileText
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { MermaidViewer } from '../components/MermaidViewer';
import { useAuth } from '../components/AuthProvider';

interface FlowchartProps {
  onNavigate?: (page: string) => void;
}

type TabMode = 'master' | 'admin' | 'employee' | 'depthead' | 'accountant' | 'lifecycle' | 'raci';

export const Flowchart: React.FC<FlowchartProps> = ({ onNavigate }) => {
  const { user, role } = useAuth();
  const [activeTab, setActiveTab] = useState<TabMode>('master');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>(0);

  // Master End-to-End Swimlane Flowchart
  const masterChart = `
flowchart TD
  classDef auth fill:#e0e7ff,stroke:#4338ca,stroke-width:2px,color:#1e1b4b;
  classDef admin fill:#e2ebf8,stroke:#1d58d9,stroke-width:2px,color:#0f2d6b;
  classDef employee fill:#dcfce7,stroke:#15803d,stroke-width:2px,color:#14532d;
  classDef depthead fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f;
  classDef accountant fill:#f3e8ff,stroke:#7e22ce,stroke-width:2px,color:#581c87;
  classDef decision fill:#fed7aa,stroke:#ea580c,stroke-width:2px,color:#7c2d12;
  classDef engine fill:#f1f5f9,stroke:#475569,stroke-width:2px,color:#0f172a;
  classDef final fill:#d1fae5,stroke:#059669,stroke-width:3px,color:#064e3b;

  subgraph PHASE0["PHASE 1: SECURE AUTHENTICATION & ROLE DISPATCH"]
    START([User Access Portal]):::auth
    LOGIN[Enter Credentials / Biometric Token]:::auth
    ROLE_CHECK{System Role Verified?}:::decision
    START --> LOGIN --> ROLE_CHECK
  end

  ROLE_CHECK -->|Administrator| ADM_ENTRY[Admin Central Console]:::admin
  ROLE_CHECK -->|Regular / Visiting / JO| EMP_ENTRY[Employee Self-Service Portal]:::employee
  ROLE_CHECK -->|Department Head| DPT_ENTRY[Academic Dean / Dept Dashboard]:::depthead
  ROLE_CHECK -->|Accountant / Finance| ACC_ENTRY[Finance & Accounting Terminal]:::accountant

  subgraph PHASE1["PHASE 2: ROSTER, DEPARTMENTS & WORKLOAD"]
    ADM_ENTRY --> ADM_ROSTER[Employee Masterfile & Classification]:::admin
    ADM_ROSTER --> CAT_SPLIT{Personnel Category}:::decision
    CAT_SPLIT -->|Regular Faculty & Staff| CAT_REG[Monthly Base + Plantilla]:::admin
    CAT_SPLIT -->|Visiting Instructor| CAT_VIS[Hourly Teaching Rate]:::admin
    CAT_SPLIT -->|Job Order Staff| CAT_JO[Daily Rate & Contract Days]:::admin
    
    DPT_ENTRY --> DPT_CATALOG[Manage Curriculum Subjects]:::depthead
    DPT_CATALOG --> DPT_LOADS[Assign Teaching Units & Schedules]:::depthead
    CAT_REG --> DPT_LOADS
    CAT_VIS --> DPT_LOADS
  end

  subgraph PHASE2["PHASE 3: ATTENDANCE (DTR) & OVERTIME WORKFLOW"]
    DPT_LOADS --> EMP_PUNCH[Biometric Turnstiles / Web Punch In & Out]:::employee
    EMP_ENTRY --> EMP_PUNCH
    EMP_PUNCH --> DTR_EVAL[Automated Attendance Processor]:::engine
    DTR_EVAL --> DTR_METRICS[Calculate Regular Hours, Tardiness & Undertime]:::engine

    EMP_ENTRY --> EMP_OT[File Overtime Application with Purpose]:::employee
    EMP_OT --> OT_ENDORSE[Dept Head Endorsement & Verification]:::depthead
    OT_ENDORSE --> OT_APPROVE[Admin Checks DTR & Authorizes Overtime]:::admin
    OT_APPROVE --> OT_SYNC[Automatic Sync to DTR Overtime Hours]:::engine
  end

  subgraph PHASE3["PHASE 4: DEDUCTIONS MATRIX & TAXES"]
    DTR_METRICS --> ACC_VERIFY[Accountant Pre-Payroll Audit]:::accountant
    OT_SYNC --> ACC_VERIFY
    ACC_VERIFY --> DED_STATUTORY[Apply SSS / GSIS, PhilHealth & Pag-IBIG Tables]:::accountant
    ADM_ENTRY --> ADM_LOANS[Record Multi-Purpose & Institutional Loans]:::admin
    ADM_LOANS --> DED_STATUTORY
    DED_STATUTORY --> TAX_ENGINE[Compute Withholding Tax TRAIN Schedule]:::accountant
  end

  subgraph PHASE4["PHASE 5: PAYROLL CALCULATION ENGINE"]
    TAX_ENGINE --> RUN_CYCLE[Admin / Accountant Initiates Payroll Cycle]:::admin
    RUN_CYCLE --> CYCLE_TYPE{Cycle Type?}:::decision
    CYCLE_TYPE -->|Semi-Monthly 1-15 / 16-End| COMP_SEMI[Base Pay / 2 + Overtime - Absences]:::engine
    CYCLE_TYPE -->|Visiting Faculty| COMP_VISIT[Rendered Load Units x Hourly Rate]:::engine
    CYCLE_TYPE -->|Job Order| COMP_JO[Daily Rate x Verified Days]:::engine
    CYCLE_TYPE -->|13th Month / Year-End| COMP_BONUS[Annual Basic Salary / 12]:::engine

    COMP_SEMI --> COMP_NET[Compute Gross & Subtract Deductions = Net Pay]:::engine
    COMP_VISIT --> COMP_NET
    COMP_JO --> COMP_NET
    COMP_BONUS --> COMP_NET
  end

  subgraph PHASE5["PHASE 6: AUDIT, CLEARANCE & DISBURSEMENT"]
    COMP_NET --> ACC_SIGN[Accountant Reviews Payroll Register & Summary]:::accountant
    ACC_SIGN --> ADM_SIGN[Campus Director / Admin Final Sign-Off]:::admin
    ADM_SIGN --> BANK_EXP[Generate Bank Direct-Credit File / Checks]:::accountant
    BANK_EXP --> DISBURSED[Disburse Net Salary to Personnel Accounts]:::accountant
  end

  subgraph PHASE6["PHASE 7: DIGITAL PAYSLIPS & COMPLIANCE"]
    DISBURSED --> PAYSLIP_REL[Generate Encrypted Digital PDF Payslips]:::engine
    PAYSLIP_REL --> EMP_PAYSLIP[Employee Views, Downloads & Prints Payslip]:::employee
    DISBURSED --> AUDIT_RECORD[Immutable Audit Trail & Compliance Log]:::engine
    DISBURSED --> TAX_REPORTS[Export General Ledger & Remittance Reports]:::accountant
    TAX_REPORTS --> PERIOD_CLOSE([Cycle Archived & Period Completed]):::final
  end
`;

  // Administrator Pipeline
  const adminChart = `
flowchart TD
  classDef step fill:#e2ebf8,stroke:#1d58d9,stroke-width:2px,color:#0f2d6b;
  classDef decision fill:#fed7aa,stroke:#ea580c,stroke-width:2px,color:#7c2d12;
  classDef engine fill:#f1f5f9,stroke:#475569,stroke-width:2px,color:#0f172a;
  classDef endNode fill:#d1fae5,stroke:#059669,stroke-width:3px,color:#064e3b;

  A([Admin Secure Login]):::step --> B[Access Admin Master Dashboard]:::step
  B --> C[Personnel Masterfile Registration]:::step
  C --> D{Employee Classification?}:::decision
  D -->|Regular Plantilla| E[Set Monthly Base Salary, Step & Position]:::step
  D -->|Visiting Instructor| F[Set Hourly Academic Rate & Honorarium]:::step
  D -->|Job-Order Worker| G[Set Daily Wage & Contract Period]:::step
  
  E --> H[Supervise Department Schedules & Campus Loads]:::step
  F --> H
  G --> H
  
  H --> I[Attendance Oversight: Sandbox & Regular DTR Review]:::step
  I --> J[Overtime Management: Cross-Verify DTR & Authorize Requests]:::step
  J --> K[Deductions & Loans Maintenance]:::step
  K --> L[Launch Payroll Cycle: 1-15, 16-End, Visiting, or 13th Month]:::step
  L --> M[Execute Automated Computation & Inspect Payroll Register]:::step
  M --> N[Review Accountant Endorsement & Authorize Fund Disbursement]:::step
  N --> O[Publish Digital Payslips & Monitor System Audit Trails]:::endNode
`;

  // Employee Self-Service Pipeline
  const employeeChart = `
flowchart TD
  classDef emp fill:#dcfce7,stroke:#15803d,stroke-width:2px,color:#14532d;
  classDef check fill:#fed7aa,stroke:#ea580c,stroke-width:2px,color:#7c2d12;
  classDef endNode fill:#d1fae5,stroke:#059669,stroke-width:3px,color:#064e3b;

  A([Employee Portal Login]):::emp --> B[Employee Information System Home]:::emp
  B --> C{Select Operation}:::check
  
  C -->|Attendance| D[Biometric Turnstile / Web Clock-In & Clock-Out]:::emp
  D --> E[Review Daily Time Record Timesheet & Late/Undertime Balances]:::emp
  
  C -->|Overtime| F[Submit Overtime Application Form]:::emp
  F --> G[Specify Date, Start/End Time, Scope of Work & Memo]:::emp
  G --> H[Track Live Approval: Pending -> Dept Head Endorsement -> Admin Approval]:::emp
  H --> I[Print Official CSC Form 48 Overtime Slip]:::emp
  
  C -->|Workload| J[Inspect Assigned Class Schedules & Teaching Rooms]:::emp
  
  C -->|Financials| K[Check SSS / GSIS, PhilHealth & Pag-IBIG Deductions]:::emp
  K --> L[View Latest & Historical Payroll Cycles]:::emp
  L --> M[Download & Print Official Encrypted PDF Payslip]:::endNode
`;

  // Department Head Pipeline
  const deptHeadChart = `
flowchart TD
  classDef dept fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f;
  classDef check fill:#fed7aa,stroke:#ea580c,stroke-width:2px,color:#7c2d12;
  classDef endNode fill:#d1fae5,stroke:#059669,stroke-width:3px,color:#064e3b;

  A([Department Head Secure Login]):::dept --> B[Department Overview & Analytics Portal]:::dept
  B --> C[Curriculum Catalog: Manage Department Subjects & Unit Weights]:::dept
  C --> D[Faculty Scheduling: Assign Teaching Loads & Section Workloads]:::dept
  D --> E{Personnel Type?}:::check
  E -->|Visiting Instructors| F[Audit Rendered Teaching Units for Hourly Payroll]:::dept
  E -->|Regular Faculty| G[Monitor Overload Units & Plantilla Schedules]:::dept
  
  F --> H[Department Attendance Supervision]:::dept
  G --> H
  H --> I[Review Faculty Overtime Requests & Verify Purpose]:::dept
  I --> J[Endorse Overtime Applications to Administration]:::dept
  J --> K[Certify Department Workload Clearance for Payroll Cycle]:::endNode
`;

  // Accountant Pipeline
  const accountantChart = `
flowchart TD
  classDef acc fill:#f3e8ff,stroke:#7e22ce,stroke-width:2px,color:#581c87;
  classDef check fill:#fed7aa,stroke:#ea580c,stroke-width:2px,color:#7c2d12;
  classDef endNode fill:#d1fae5,stroke:#059669,stroke-width:3px,color:#064e3b;

  A([Accountant Secure Login]):::acc --> B[Finance & Accounting Dashboard]:::acc
  B --> C[Pre-Payroll Audit: Verify DTR Timesheets, Leaves & Approved Overtime]:::acc
  C --> D[Deductions Audit: Validate GSIS/SSS, PhilHealth & Pag-IBIG Rates]:::acc
  D --> E[Loan Ledgers: Verify Active Balances & Monthly Amortizations]:::acc
  E --> F[Withholding Tax Audit: Compute Trailing Progressive Tax Schedules]:::acc
  F --> G[Payroll Registry Review: Validate Gross, Deductions & Net Pay]:::acc
  G --> H{Audit Cleared?}:::check
  H -->|Revisions Required| I[Flag Discrepancy & Request Corrections]:::acc
  I --> C
  H -->|Verified & Accurate| J[Authorize Payroll Registry & Sign Disbursement Slip]:::acc
  J --> K[Prepare Bank Direct-Credit File / Issue Official Disbursement Checks]:::acc
  K --> L[Generate General Ledger Entries, Tax Reports & Remittance Files]:::endNode
`;

  // End-to-End System Lifecycle Steps
  const systemSteps = [
    {
      stepNumber: '01',
      title: 'Authentication & Role Gate',
      category: 'Security & Access',
      roles: ['Admin', 'Dept Head', 'Accountant', 'Employee'],
      description: 'Users authenticate through encrypted credentials. The system determines active role boundaries and dynamically presents role-tailored dashboards and permissions.',
      inputs: 'Email / Username, Password, Session Token',
      actions: 'Credential hashing verification, role resolution, audit logging of login timestamp.',
      outputs: 'Active authenticated session, scoped menu navigation, localized user state.',
      pageTarget: 'dashboard',
    },
    {
      stepNumber: '02',
      title: 'Personnel & Workload Setup',
      category: 'Master Data',
      roles: ['Admin', 'Dept Head'],
      description: 'Administrators register faculty and staff under Regular, Visiting Instructor, or Job Order categories. Department heads configure subjects and assign teaching loads.',
      inputs: 'Employee biodata, plantilla position, hourly/monthly salary rate, curriculum subjects, room assignments.',
      actions: 'Masterfile indexing, schedule assignment, workload unit validation, conflict detection.',
      outputs: 'Active employee registry, published teaching schedules, baseline rate catalog.',
      pageTarget: 'employees',
    },
    {
      stepNumber: '03',
      title: 'Daily Time Record (DTR) & Biometrics',
      category: 'Time & Attendance',
      roles: ['Employee', 'Admin', 'Dept Head'],
      description: 'Employees log attendance via physical biometric turnstiles or web portals. System captures punch timestamps and computes rendered hours, tardiness, and undertime.',
      inputs: 'Clock In / Clock Out timestamps, terminal IP, biometric hash.',
      actions: 'Shift comparison, late minutes computation, undertime deduction calculation, automatic aggregate summation.',
      outputs: 'Daily DTR records, monthly timesheet sheets, late/absence penalty figures.',
      pageTarget: 'dtr-regular',
    },
    {
      stepNumber: '04',
      title: 'Overtime Application & Approval',
      category: 'Attendance Approvals',
      roles: ['Employee', 'Dept Head', 'Admin'],
      description: 'Employees file overtime requests with institutional justification. Department heads endorse requests, and administrators verify actual DTR records before granting final authorization.',
      inputs: 'Service date, start/end hours, institutional purpose, memo/special order attachments.',
      actions: 'Duration calculation, overnight span detection, DTR cross-check, dual-party approval workflow.',
      outputs: 'Authorized overtime hours, synchronized DTR overtime field, printable official OT slip.',
      pageTarget: 'overtime',
    },
    {
      stepNumber: '05',
      title: 'Statutory & Voluntary Deductions',
      category: 'Payroll Rules',
      roles: ['Accountant', 'Admin'],
      description: 'Accountants and admins configure mandatory statutory contributions (GSIS/SSS, PhilHealth, Pag-IBIG) and loan amortizations. System applies exact percentage brackets.',
      inputs: 'Gross salary base, statutory deduction tables, active loan balances, voluntary contributions.',
      actions: 'Bracket matching, employee/employer share splitting, loan deduction amortization, taxable net computation.',
      outputs: 'Deduction schedules, monthly contribution summaries, loan amortization statements.',
      pageTarget: 'deductions',
    },
    {
      stepNumber: '06',
      title: 'Payroll Engine Computation',
      category: 'Computation Engine',
      roles: ['Admin', 'Accountant'],
      description: 'Automated engine combines base pay, approved overtime, teaching load honorarium, minus statutory deductions, loan balances, and absences to yield final net pay.',
      inputs: 'Active cycle period (Semi-Monthly, Monthly, Visiting, 13th Month), DTR records, verified deductions.',
      actions: 'Multi-category formula calculation, tax withholding computation, gross-to-net pipeline, variance checks.',
      outputs: 'Draft payroll register, individual employee payroll line items, summary totals.',
      pageTarget: 'payroll',
    },
    {
      stepNumber: '07',
      title: 'Audit, Clearance & Fund Authorization',
      category: 'Financial Governance',
      roles: ['Accountant', 'Admin'],
      description: 'Accountants perform mathematical and compliance audits on the draft payroll register. Upon certification, the campus director/admin signs off for bank fund disbursement.',
      inputs: 'Draft payroll register, variance reports, budget allocation sheets.',
      actions: 'General ledger verification, compliance cross-checking, dual digital sign-off, bank export format generation.',
      outputs: 'Certified payroll registry, bank direct-debit batch file, approved disbursement vouchers.',
      pageTarget: 'reports',
    },
    {
      stepNumber: '08',
      title: 'Disbursement, Payslips & Archiving',
      category: 'Cycle Completion',
      roles: ['Accountant', 'Employee', 'Admin'],
      description: 'Salaries are credited to employee accounts. Digital encrypted PDF payslips are generated instantly. System archives the cycle and logs immutable audit records.',
      inputs: 'Disbursement confirmation, bank settlement receipts.',
      actions: 'Batch PDF payslip compilation, employee portal release, audit log finalization, cycle locking.',
      outputs: 'Official printable PDF payslips, archived payroll history, historical compensation ledger.',
      pageTarget: 'history',
    }
  ];

  // RACI Matrix definition
  const raciData = [
    {
      module: 'User Credentials & Role Administration',
      desc: 'Create and configure system users, passwords, and assigned privilege levels.',
      admin: 'Accountable',
      deptHead: 'Informed',
      accountant: 'Informed',
      employee: 'Informed',
    },
    {
      module: 'Employee Masterfile & Classification',
      desc: 'Catalog staff under Regular, Visiting Instructor, or Job Order with salary rates.',
      admin: 'Accountable',
      deptHead: 'Consulted',
      accountant: 'Consulted',
      employee: 'Informed',
    },
    {
      module: 'Curriculum Subjects & Faculty Schedules',
      desc: 'Define course offerings, classroom units, and assign faculty teaching loads.',
      admin: 'Consulted',
      deptHead: 'Accountable',
      accountant: 'Informed',
      employee: 'Responsible',
    },
    {
      module: 'Daily Time Record (DTR) Logging',
      desc: 'Record daily attendance punches via turnstile or web timesheet.',
      admin: 'Accountable',
      deptHead: 'Consulted',
      accountant: 'Consulted',
      employee: 'Responsible',
    },
    {
      module: 'Overtime Application & Endorsement',
      desc: 'Submit, review, verify against attendance, and authorize overtime hours.',
      admin: 'Accountable',
      deptHead: 'Responsible',
      accountant: 'Informed',
      employee: 'Responsible',
    },
    {
      module: 'Statutory Deductions & Loan Balances',
      desc: 'Maintain GSIS/SSS, PhilHealth, Pag-IBIG tables, and employee loan ledgers.',
      admin: 'Responsible',
      deptHead: 'Informed',
      accountant: 'Accountable',
      employee: 'Informed',
    },
    {
      module: 'Payroll Cycle Generation & Computation',
      desc: 'Run semi-monthly, visiting, and 13th month payroll calculation engines.',
      admin: 'Accountable',
      deptHead: 'Informed',
      accountant: 'Responsible',
      employee: 'Informed',
    },
    {
      module: 'Bank Disbursement & Fund Transfer',
      desc: 'Authorize fund releases, bank credit files, and treasury vouchers.',
      admin: 'Accountable',
      deptHead: 'Informed',
      accountant: 'Responsible',
      employee: 'Informed',
    },
    {
      module: 'Digital Payslips Viewing & Printing',
      desc: 'Access official encrypted PDF payslips with breakdown of earnings and taxes.',
      admin: 'Consulted',
      deptHead: 'Informed',
      accountant: 'Consulted',
      employee: 'Accountable',
    },
    {
      module: 'Compliance Audit & Financial Reporting',
      desc: 'Immutable audit trails, tax remittance schedules, and expense reports.',
      admin: 'Accountable',
      deptHead: 'Informed',
      accountant: 'Accountable',
      employee: 'Informed',
    },
  ];

  // Filtered steps based on search
  const filteredSteps = useMemo(() => {
    if (!searchQuery.trim()) return systemSteps;
    const q = searchQuery.toLowerCase();
    return systemSteps.filter(s => 
      s.title.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.roles.some(r => r.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  return (
    <div className="space-y-8 pb-20 font-sans animate-fadeIn">
      {/* Top Hero Banner */}
      <div className="bg-gradient-to-r from-[#17386d] via-[#1d58d9] to-[#2563eb] rounded-3xl p-6 md:p-8 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-8 translate-y-8 pointer-events-none">
          <GitFork className="w-80 h-80 stroke-[1]" />
        </div>
        
        <div className="relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase border border-white/10">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Interactive Architecture & Workflow Guide</span>
          </div>
          
          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight leading-tight">
            System Flowchart & Lifecycle Diagram
          </h1>
          
          <p className="text-sm md:text-base text-white/85 max-w-3xl font-medium leading-relaxed">
            A comprehensive, end-to-end operational blueprint of the Southern Leyte State University Payroll Management System. 
            Trace how data flows across <strong className="text-white">Administrators</strong>, <strong className="text-white">Department Heads</strong>, <strong className="text-white">Accountants</strong>, and <strong className="text-white">Employees</strong> from secure login to final salary disbursement and digital payslip delivery.
          </p>

          {/* Quick Metrics */}
          <div className="flex flex-wrap items-center gap-4 pt-2 text-xs font-medium text-white/90">
            <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
              <Shield className="w-4 h-4 text-emerald-300" />
              <span>4 System Roles</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
              <Layers className="w-4 h-4 text-blue-300" />
              <span>8 Sequential Phases</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
              <Clock className="w-4 h-4 text-amber-300" />
              <span>DTR & Overtime Synced</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
              <CreditCard className="w-4 h-4 text-purple-300" />
              <span>Automated Net Pay Engine</span>
            </div>
          </div>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-neutral-200 pb-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
          {[
            { id: 'master', label: 'Master End-to-End', icon: GitFork, badge: 'All Roles' },
            { id: 'lifecycle', label: '8-Phase Lifecycle', icon: Layers, badge: 'Interactive' },
            { id: 'admin', label: 'Administrator Flow', icon: Shield, badge: 'Admin' },
            { id: 'employee', label: 'Employee Portal Flow', icon: Users, badge: 'Employee' },
            { id: 'depthead', label: 'Department Head Flow', icon: Building2, badge: 'Dean' },
            { id: 'accountant', label: 'Accountant Flow', icon: CreditCard, badge: 'Finance' },
            { id: 'raci', label: 'RACI Capability Matrix', icon: FileSpreadsheet, badge: 'Governance' },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabMode)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#1d58d9] text-white shadow-xs'
                    : 'bg-white text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 border border-neutral-200/70'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search Filter */}
        <div className="relative min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search flow stages..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-neutral-200 rounded-xl focus:outline-none focus:border-[#1d58d9] transition-colors"
          />
        </div>
      </div>

      {/* TAB 1: MASTER SWIMLANE FLOWCHART */}
      {activeTab === 'master' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
            <div className="space-y-1">
              <h3 className="font-extrabold text-base text-neutral-900 flex items-center gap-2">
                <span>Complete Multi-Perspective System Swimlane</span>
                <Badge className="bg-[#e2ebf8] text-[#1d58d9] font-mono text-[10px] uppercase border-none">
                  Core Architecture
                </Badge>
              </h3>
              <p className="text-xs text-neutral-500 leading-relaxed max-w-3xl">
                Illustrates how operational tasks transition across actors: from initial biometric punches to departmental clearances, administrative overtime approvals, statutory tax audits, and final net disbursement.
              </p>
            </div>

            {/* Color Legend */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#e2ebf8] text-[#1d58d9] border border-[#1d58d9]/20">
                <span className="w-2 h-2 rounded-full bg-[#1d58d9]" />
                <span>Admin</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                <span>Employee</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                <span className="w-2 h-2 rounded-full bg-amber-600" />
                <span>Dept Head</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-800 border border-purple-200">
                <span className="w-2 h-2 rounded-full bg-purple-600" />
                <span>Accountant</span>
              </div>
            </div>
          </div>

          <MermaidViewer
            chart={masterChart}
            title="End-to-End System Swimlane Diagram"
            subtitle="Zoom or download vector SVG for institutional documentation and auditing"
          />
        </div>
      )}

      {/* TAB 2: INTERACTIVE 8-PHASE LIFECYCLE */}
      {activeTab === 'lifecycle' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
            <h3 className="font-extrabold text-base text-neutral-900 mb-1">
              Interactive 8-Phase System Lifecycle
            </h3>
            <p className="text-xs text-neutral-500">
              Click any stage in the chronological pipeline to view detailed actor responsibilities, input data structures, computation rules, and jump directly to that module.
            </p>
          </div>

          {/* Stepper Buttons Horizontal */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {filteredSteps.map((step, idx) => {
              const isSelected = selectedStepIndex === idx;
              return (
                <button
                  key={step.stepNumber}
                  onClick={() => setSelectedStepIndex(idx)}
                  className={`p-3 rounded-2xl text-left transition-all border flex flex-col justify-between min-h-[95px] cursor-pointer ${
                    isSelected
                      ? 'bg-[#1d58d9] text-white border-[#1d58d9] shadow-sm scale-102'
                      : 'bg-white hover:bg-neutral-50 text-neutral-700 border-neutral-200'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className={`text-[10px] font-mono font-black ${isSelected ? 'text-white/80' : 'text-[#1d58d9]'}`}>
                      {step.stepNumber}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-neutral-300'}`} />
                  </div>
                  <div>
                    <h5 className="font-bold text-xs leading-tight line-clamp-2 mt-1">
                      {step.title}
                    </h5>
                    <span className={`text-[9px] font-medium uppercase tracking-wider block mt-1 ${isSelected ? 'text-white/75' : 'text-neutral-400'}`}>
                      {step.category}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Step Detailed Card */}
          {filteredSteps[selectedStepIndex] && (
            <Card className="p-6 md:p-8 bg-white border-neutral-200 rounded-3xl shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-extrabold px-2.5 py-0.5 rounded-lg bg-[#e2ebf8] text-[#1d58d9]">
                      PHASE {filteredSteps[selectedStepIndex].stepNumber}
                    </span>
                    <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                      {filteredSteps[selectedStepIndex].category}
                    </span>
                  </div>
                  <h2 className="text-xl md:text-2xl font-black text-neutral-900 tracking-tight">
                    {filteredSteps[selectedStepIndex].title}
                  </h2>
                </div>

                {onNavigate && (
                  <Button
                    onClick={() => onNavigate(filteredSteps[selectedStepIndex].pageTarget)}
                    className="bg-[#1d58d9] hover:bg-[#1444b0] text-white font-bold text-xs h-10 px-4 rounded-xl gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all self-start md:self-auto"
                  >
                    <span>Launch Feature</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>

              {/* Description */}
              <p className="text-sm md:text-base text-neutral-700 leading-relaxed">
                {filteredSteps[selectedStepIndex].description}
              </p>

              {/* Roles Badge List */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Participating System Actors:
                </span>
                <div className="flex flex-wrap gap-2">
                  {filteredSteps[selectedStepIndex].roles.map((r) => (
                    <span
                      key={r}
                      className={`px-3 py-1 rounded-xl text-xs font-extrabold border ${
                        r === 'Admin'
                          ? 'bg-[#e2ebf8] text-[#1d58d9] border-[#1d58d9]/20'
                          : r === 'Employee'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : r === 'Dept Head'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-purple-50 text-purple-800 border-purple-200'
                      }`}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              {/* 3-Column Specifications Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 space-y-1.5">
                  <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block">
                    Inputs &amp; Prerequisites
                  </span>
                  <p className="text-xs text-neutral-700 leading-relaxed">
                    {filteredSteps[selectedStepIndex].inputs}
                  </p>
                </div>

                <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 space-y-1.5">
                  <span className="text-[11px] font-bold text-[#1d58d9] uppercase tracking-wider block">
                    System Logic &amp; Actions
                  </span>
                  <p className="text-xs text-neutral-700 leading-relaxed">
                    {filteredSteps[selectedStepIndex].actions}
                  </p>
                </div>

                <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-100 space-y-1.5">
                  <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
                    Outputs &amp; Database State
                  </span>
                  <p className="text-xs text-emerald-950 leading-relaxed font-medium">
                    {filteredSteps[selectedStepIndex].outputs}
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB 3: ADMINISTRATOR WORKFLOW */}
      {activeTab === 'admin' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="font-extrabold text-base text-neutral-900 flex items-center gap-2">
                <span>Administrator Operational Pipeline</span>
                <Badge className="bg-[#e2ebf8] text-[#1d58d9] font-mono text-[10px] uppercase border-none">
                  Superuser
                </Badge>
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                From staff onboarding to biometrics verification, overtime authorization, cycle creation, and disbursement sign-off.
              </p>
            </div>
            {onNavigate && (
              <div className="flex gap-2">
                <Button 
                  onClick={() => onNavigate('employees')}
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-bold"
                >
                  Personnel Registry
                </Button>
                <Button 
                  onClick={() => onNavigate('payroll')}
                  className="bg-[#1d58d9] text-white rounded-xl text-xs font-bold"
                >
                  Payroll Engine
                </Button>
              </div>
            )}
          </div>

          <MermaidViewer
            chart={adminChart}
            title="Administrator End-to-End Execution Flow"
            subtitle="Visualizes administrative controls and gatekeeping actions"
          />
        </div>
      )}

      {/* TAB 4: EMPLOYEE SELF-SERVICE WORKFLOW */}
      {activeTab === 'employee' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="font-extrabold text-base text-neutral-900 flex items-center gap-2">
                <span>Employee Self-Service (EIS) Lifecycle</span>
                <Badge className="bg-emerald-50 text-emerald-700 font-mono text-[10px] uppercase border-none">
                  Faculty &amp; Staff
                </Badge>
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Daily biometric time clocking, tracking pending overtime endorsement status, viewing deductions, and downloading official payslips.
              </p>
            </div>
            {onNavigate && (
              <div className="flex gap-2">
                <Button 
                  onClick={() => onNavigate('overtime')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
                >
                  File Overtime
                </Button>
                <Button 
                  onClick={() => onNavigate('dtr-regular')}
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-bold"
                >
                  Check Timesheet
                </Button>
              </div>
            )}
          </div>

          <MermaidViewer
            chart={employeeChart}
            title="Employee Self-Service Workflow Diagram"
            subtitle="Transparent access to attendance records, overtime slips, and payslip PDFs"
          />
        </div>
      )}

      {/* TAB 5: DEPARTMENT HEAD WORKFLOW */}
      {activeTab === 'depthead' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="font-extrabold text-base text-neutral-900 flex items-center gap-2">
                <span>Department Head &amp; Dean Academic Workload Flow</span>
                <Badge className="bg-amber-50 text-amber-700 font-mono text-[10px] uppercase border-none">
                  Academic Governance
                </Badge>
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Managing course offerings, assigning class teaching units to faculty and visiting instructors, and endorsing overtime applications.
              </p>
            </div>
            {onNavigate && (
              <div className="flex gap-2">
                <Button 
                  onClick={() => onNavigate('departments')}
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-bold"
                >
                  Curriculum Subjects
                </Button>
                <Button 
                  onClick={() => onNavigate('schedules')}
                  className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold"
                >
                  Faculty Schedules
                </Button>
              </div>
            )}
          </div>

          <MermaidViewer
            chart={deptHeadChart}
            title="Department Head Curriculum & Endorsement Workflow"
            subtitle="Workload scheduling, teaching unit audits, and departmental overtime endorsement"
          />
        </div>
      )}

      {/* TAB 6: ACCOUNTANT WORKFLOW */}
      {activeTab === 'accountant' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="font-extrabold text-base text-neutral-900 flex items-center gap-2">
                <span>Accountant &amp; Finance Audit Flow</span>
                <Badge className="bg-purple-50 text-purple-700 font-mono text-[10px] uppercase border-none">
                  Fiscal Compliance
                </Badge>
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Pre-payroll timesheet audit, statutory deduction table verification, loan balance reconciliation, and disbursement check issuance.
              </p>
            </div>
            {onNavigate && (
              <div className="flex gap-2">
                <Button 
                  onClick={() => onNavigate('deductions')}
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-bold"
                >
                  Deductions Ledger
                </Button>
                <Button 
                  onClick={() => onNavigate('reports')}
                  className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold"
                >
                  Financial Reports
                </Button>
              </div>
            )}
          </div>

          <MermaidViewer
            chart={accountantChart}
            title="Accountant Audit & Disbursement Verification Diagram"
            subtitle="Pre-computation checks, statutory compliance, and payroll voucher clearance"
          />
        </div>
      )}

      {/* TAB 7: RACI MATRIX */}
      {activeTab === 'raci' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
            <h3 className="font-extrabold text-base text-neutral-900 mb-1">
              Role Responsibility Assignment Matrix (RACI)
            </h3>
            <p className="text-xs text-neutral-500">
              Clear institutional governance guidelines showing which role is <strong>Responsible (R)</strong>, <strong>Accountable (A)</strong>, <strong>Consulted (C)</strong>, or <strong>Informed (I)</strong> across all system features.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50/80 border-b border-neutral-200 font-bold text-neutral-600 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4 min-w-[200px]">System Module &amp; Scope</th>
                    <th className="py-3.5 px-4 text-center">Administrator</th>
                    <th className="py-3.5 px-4 text-center">Dept Head / Dean</th>
                    <th className="py-3.5 px-4 text-center">Accountant</th>
                    <th className="py-3.5 px-4 text-center">Employee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {raciData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-neutral-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-bold text-neutral-900 block text-xs">{row.module}</span>
                        <span className="text-[11px] text-neutral-500">{row.desc}</span>
                      </td>

                      {/* Admin */}
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-mono font-bold ${
                          row.admin === 'Accountable'
                            ? 'bg-[#1d58d9] text-white'
                            : row.admin === 'Responsible'
                            ? 'bg-blue-100 text-[#1d58d9]'
                            : 'bg-neutral-100 text-neutral-600'
                        }`}>
                          {row.admin}
                        </span>
                      </td>

                      {/* Dept Head */}
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-mono font-bold ${
                          row.deptHead === 'Accountable'
                            ? 'bg-amber-600 text-white'
                            : row.deptHead === 'Responsible'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-neutral-100 text-neutral-600'
                        }`}>
                          {row.deptHead}
                        </span>
                      </td>

                      {/* Accountant */}
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-mono font-bold ${
                          row.accountant === 'Accountable'
                            ? 'bg-purple-600 text-white'
                            : row.accountant === 'Responsible'
                            ? 'bg-purple-100 text-purple-900'
                            : 'bg-neutral-100 text-neutral-600'
                        }`}>
                          {row.accountant}
                        </span>
                      </td>

                      {/* Employee */}
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-mono font-bold ${
                          row.employee === 'Accountable'
                            ? 'bg-emerald-600 text-white'
                            : row.employee === 'Responsible'
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-neutral-100 text-neutral-600'
                        }`}>
                          {row.employee}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-neutral-50/50 border-t border-neutral-100 text-[11px] text-neutral-500 flex flex-wrap gap-4 items-center justify-between">
              <span><strong>Accountable (A)</strong>: Ultimate authority &amp; sign-off.</span>
              <span><strong>Responsible (R)</strong>: Primary actor who conducts the process.</span>
              <span><strong>Consulted (C)</strong>: Two-way input &amp; verification.</span>
              <span><strong>Informed (I)</strong>: One-way updates &amp; transparent view.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Flowchart;
