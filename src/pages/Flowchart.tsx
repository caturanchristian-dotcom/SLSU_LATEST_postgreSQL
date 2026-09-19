import React, { useState, useMemo } from 'react';
import { 
  GitFork, 
  Shield, 
  Users, 
  CreditCard, 
  Clock, 
  Layers, 
  Search, 
  Building2, 
  FileSpreadsheet, 
  Sparkles, 
  Calculator,
  HelpCircle,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  Lock,
  LogOut,
  FileText,
  UserCheck,
  FileCheck
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { MermaidViewer } from '../components/MermaidViewer';
import { useAuth } from '../components/AuthProvider';

interface FlowchartProps {
  onNavigate?: (page: string) => void;
}

type TabMode = 'master' | 'payroll_engine' | 'admin' | 'employee' | 'depthead' | 'accountant' | 'symbols' | 'raci';

export const Flowchart: React.FC<FlowchartProps> = ({ onNavigate }) => {
  const { user, role } = useAuth();
  const [activeTab, setActiveTab] = useState<TabMode>('master');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. MASTER END-TO-END SWIMLANE FLOWCHART (CLEAN VERTICAL ARCHITECTURE WITH LOCALIZED ROUTING)
  const masterChart = `
flowchart TD
  classDef startEnd fill:#d1fae5,stroke:#059669,stroke-width:2px,color:#064e3b;
  classDef process fill:#e2ebf8,stroke:#1d58d9,stroke-width:2px,color:#0f2d6b;
  classDef decision fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f;
  classDef inout fill:#f3e8ff,stroke:#7e22ce,stroke-width:2px,color:#581c87;
  classDef errorNode fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#7f1d1d;
  classDef payrollEngine fill:#ecfdf5,stroke:#10b981,stroke-width:2px,color:#064e3b;

  %% 1. LOGIN & AUTHENTICATION (TOP)
  subgraph SEC_LOGIN["1. LOGIN & AUTHENTICATION"]
    direction TB
    START([Start: User Access System]):::startEnd
    IN_CRED[/"Enter Username / Email & Password"/]:::inout
    VAL_CRED[Validate Credentials]:::process
    DEC_VALID{Credentials Valid?}:::decision
    ERR_LOGIN[/"Show Error: Invalid Credentials"/]:::errorNode
    DEC_ROLE{Identify User Role}:::decision

    START --> IN_CRED
    IN_CRED --> VAL_CRED
    VAL_CRED --> DEC_VALID
    DEC_VALID -- No --> ERR_LOGIN
    ERR_LOGIN --> IN_CRED
    DEC_VALID -- Yes --> DEC_ROLE
  end

  %% 2. ROLE IDENTIFICATION & DASHBOARDS
  subgraph SEC_DASH["2. ROLE IDENTIFICATION & DASHBOARDS"]
    subgraph LANE_ADMIN_TOP["Administrator Portal"]
      ADM_DASH[Admin Dashboard]:::process
    end
    subgraph LANE_EMP_TOP["Employee Self-Service"]
      EMP_DASH[Employee Dashboard]:::process
    end
    subgraph LANE_DH_TOP["Department Head Portal"]
      DH_DASH[Department Head Dashboard]:::process
    end
    subgraph LANE_ACC_TOP["Accountant Portal"]
      ACC_DASH[Accountant Dashboard]:::process
    end
  end

  DEC_ROLE -- Administrator --> ADM_DASH
  DEC_ROLE -- Employee --> EMP_DASH
  DEC_ROLE -- Department Head --> DH_DASH
  DEC_ROLE -- Accountant --> ACC_DASH

  %% 3. ROLE-SPECIFIC OPERATIONS & MASTERFILES
  subgraph SEC_ROLES["3. ROLE-SPECIFIC OPERATIONS & MASTERFILES"]
    subgraph G_ADM_OPS["Administrator Masterfiles & Settings"]
      direction TB
      ADM_USERS[Manage Users & Security]:::process
      ADM_EMP[Manage Employees Registry]:::process
      ADM_DEP[Manage Departments & Subjects]:::process
      ADM_POS[Manage Positions]:::process
      ADM_SCHED[Manage Schedules & Load]:::process
      ADM_SAL[Manage Salary/Compensation]:::process
      ADM_PAY[Manage Payroll Generation]:::process
      ADM_HIST[View Activity & History Logs]:::process
      ADM_LOG[View Audit Logs]:::process
      ADM_SET[Manage System Settings]:::process
      ADM_DOC[/"Knowledge Base Documentation"/]:::inout

      ADM_DASH --> ADM_USERS
      ADM_USERS --> ADM_EMP
      ADM_EMP --> ADM_DEP
      ADM_DEP --> ADM_POS
      ADM_POS --> ADM_SCHED
      ADM_SCHED --> ADM_SAL
      ADM_SAL --> ADM_PAY
      ADM_PAY --> ADM_HIST
      ADM_HIST --> ADM_LOG
      ADM_LOG --> ADM_SET
      ADM_SET --> ADM_DOC
    end

    subgraph G_EMP_OPS["Employee Profile & Portal Modules"]
      direction TB
      EMP_PROF[View / Edit Profile]:::process
      EMP_SCHED[View My Schedules & Load]:::process
      EMP_HOL[View Holidays Calendar]:::process
      EMP_SAL[View Salary Information]:::process
      EMP_DED_ALL[View Deductions & Allowances]:::process
      EMP_PWD[Change Password]:::process
      EMP_DOC[/"Knowledge Base Documentation"/]:::inout

      EMP_DASH --> EMP_PROF
      EMP_PROF --> EMP_SCHED
      EMP_SCHED --> EMP_HOL
      EMP_HOL --> EMP_SAL
      EMP_SAL --> EMP_DED_ALL
      EMP_DED_ALL --> EMP_PWD
      EMP_PWD --> EMP_DOC
    end

    subgraph G_DH_OPS["Department Head Oversight Modules"]
      direction TB
      DH_EMPS[View Department Employees]:::process
      DH_DEP[View Academic Depts & Subjects]:::process
      DH_SCHED[Manage Faculty Schedules & Timetables]:::process
      DH_HOL[View Holidays Calendar]:::process
      DH_PAY_INFO[View Department Payroll Information]:::process

      DH_DASH --> DH_EMPS
      DH_EMPS --> DH_DEP
      DH_DEP --> DH_SCHED
      DH_SCHED --> DH_HOL
      DH_HOL --> DH_PAY_INFO
    end

    subgraph G_ACC_OPS["Accountant Audit & Compliance Modules"]
      direction TB
      ACC_REV_DATA[Review Employee Payroll Data]:::process
      ACC_VER_HOL[Verify Holiday Pay Multipliers]:::process
      ACC_AUDIT[Review Compliance Audit Logs]:::process
      ACC_HIST[Payroll History & Archives]:::process
      ACC_VAL_DEC{Review & Validate Payroll}:::decision

      ACC_DASH --> ACC_REV_DATA
      ACC_REV_DATA --> ACC_VER_HOL
      ACC_VER_HOL --> ACC_AUDIT
      ACC_AUDIT --> ACC_HIST
      ACC_HIST --> ACC_VAL_DEC
    end
  end

  ADM_SCHED -. Academic Load Sync .-> DH_SCHED
  DH_SCHED -. Timetable Sync .-> EMP_SCHED

  %% 4. REQUESTS, APPROVALS & ATTENDANCE TRACKING (DTR / OT / LEAVE)
  subgraph SEC_APPROVALS["4. REQUESTS, APPROVALS & ATTENDANCE TRACKING"]
    subgraph G_DTR["DTR & Attendance Logs"]
      direction TB
      ADM_HOL[Manage Holidays Registry]:::process
      ADM_DTR[Manage DTR Attendance Logs]:::process
      EMP_DTR[View DTR Attendance Logs]:::process
      DH_DTR[View Department DTR / Attendance]:::process
      ACC_VER_DTR[Verify Attendance & DTR]:::process

      ADM_HOL -. Multipliers .-> ADM_DTR
      ADM_EMP --> ADM_HOL
      ADM_HOL --> ADM_DTR
      EMP_PROF --> EMP_DTR
      DH_EMPS --> DH_DTR
      ACC_REV_DATA --> ACC_VER_DTR
    end

    subgraph G_OT["Overtime Application & Endorsement Pipeline"]
      direction TB
      EMP_OT_SUB[/"Submit Overtime Request"/]:::inout
      DH_OT_DEC{Review / Endorse Overtime}:::decision
      ADM_OT_REV[Manage Overtime Approvals]:::process
      EMP_OT_STAT[View Overtime Status]:::process
      ACC_VER_OT[Verify Approved Overtime]:::process

      EMP_DTR --> EMP_OT_SUB
      EMP_OT_SUB --> DH_OT_DEC
      DH_OT_DEC -- Endorsed --> ADM_OT_REV
      ADM_OT_REV -- Approved --> EMP_OT_STAT
      ADM_OT_REV --> ACC_VER_OT
    end

    subgraph G_LV["Leave Application & Balance Deduction Pipeline"]
      direction TB
      EMP_LV_SUB[/"Submit Leave Application"/]:::inout
      DH_LV_DEC{Review / Endorse Leave}:::decision
      ADM_LV_REV[Manage Leave Requests & Balances]:::process
      EMP_LV_STAT[View Leave Request Status & Balances]:::process
      ACC_VER_LV[Verify Leaves, Absences & LWOP]:::process

      EMP_OT_SUB --> EMP_LV_SUB
      EMP_LV_SUB --> DH_LV_DEC
      DH_LV_DEC -- Endorsed --> ADM_LV_REV
      ADM_LV_REV -- "Approved / Logged" --> EMP_LV_STAT
      ADM_LV_REV --> ACC_VER_LV
    end
  end

  %% 5. ALLOWANCES & DEDUCTIONS MANAGEMENT
  subgraph SEC_BENEFITS["5. ALLOWANCES & DEDUCTIONS MANAGEMENT"]
    direction TB
    ADM_ALL[Manage Allowances]:::process
    ADM_DED[Manage Deductions]:::process
    ACC_VER_AD[Verify Allowances & Deductions]:::process
    ACC_PROC[Process / Calculate Payroll Engine]:::process

    ADM_SAL --> ADM_ALL
    ADM_ALL --> ADM_DED
    ACC_VER_HOL --> ACC_VER_AD
    ACC_VER_AD --> ACC_PROC
  end

  %% 6. PAYROLL PROCESSING, REVIEW & FINALIZATION ENGINE
  subgraph SEC_PAYROLL["6. PAYROLL PROCESSING, REVIEW & FINALIZATION"]
    direction TB
    PAY_INPUT[/"Inputs: Approved DTR (Regular, Visiting, Job-Order) + Overtime + Leave/LWOP + Allowances + Deductions"/]:::inout
    PAY_GROSS[Calculate Gross Pay<br/>Base + Overtime Pay + Allowances]:::payrollEngine
    PAY_DED[Calculate Total Deductions<br/>Statutory + Withholding Tax + Loans + LWOP]:::payrollEngine
    PAY_NET[Calculate Net Pay<br/>Gross Pay - Total Deductions]:::payrollEngine
    PAY_REV{"Payroll Review / Validation<br/>Accountant & Admin Sign-off"}:::decision
    PAY_FIN[Finalize & Lock Payroll Cycle]:::payrollEngine

    PAY_INPUT --> PAY_GROSS
    PAY_GROSS --> PAY_DED
    PAY_DED --> PAY_NET
    PAY_NET --> PAY_REV
    PAY_REV -- Validated --> PAY_FIN
    PAY_REV -- Corrections Needed --> ACC_REV_DATA
  end

  %% Short Direct Feeder Connections into Payroll Processing Input
  ADM_DTR --> PAY_INPUT
  ACC_VER_DTR --> PAY_INPUT
  ACC_VER_OT --> PAY_INPUT
  ACC_VER_LV --> PAY_INPUT
  ADM_DED --> PAY_INPUT
  ACC_PROC --> PAY_INPUT
  ADM_PAY --> PAY_INPUT

  %% 7. PAYSLIP & FINANCIAL REPORTS DISTRIBUTION
  subgraph SEC_REPORTS["7. PAYSLIP & FINANCIAL REPORTS GENERATION"]
    direction TB
    PAY_OUT_PS[/"Generate Digital & PDF Payslips"/]:::inout
    PAY_OUT_REP[/"Generate Payroll Register & Remittance Reports"/]:::inout
    
    ACC_GEN_PS[/"Generate Payslips"/]:::inout
    ACC_GEN_REP[/"Generate Payroll & Financial Reports"/]:::inout
    ACC_EXP_REP[/"Export / Print Reports"/]:::inout
    ADM_REP[/"View / Generate Reports"/]:::inout
    DH_REP[/"View Department Reports"/]:::inout

    EMP_VIEW_PS[/"Employee Views Payslip & Payroll History"/]:::inout
    EMP_PAYSLIP[/"View Payslip"/]:::inout
    EMP_PAY_HIST[View Payroll History]:::process

    PAY_FIN --> PAY_OUT_PS
    PAY_FIN --> PAY_OUT_REP
    PAY_OUT_PS --> ACC_GEN_PS
    PAY_OUT_PS --> EMP_VIEW_PS
    PAY_OUT_REP --> ACC_GEN_REP
    PAY_OUT_REP --> ADM_REP
    PAY_OUT_REP --> DH_REP
    ACC_GEN_REP --> ACC_EXP_REP
    EMP_VIEW_PS --> EMP_PAYSLIP
    EMP_VIEW_PS --> EMP_PAY_HIST
  end

  %% 8. LOGOUT & TERMINATION (BOTTOM)
  subgraph SEC_END["8. LOGOUT & TERMINATION"]
    direction TB
    ADM_OUT[Admin Logout]:::process
    EMP_OUT[Employee Logout]:::process
    DH_OUT[Department Head Logout]:::process
    ACC_OUT[Accountant Logout]:::process
    LOGOUT_ACT[Process Logout & Clear Session Cache]:::process
    END_NODE([End: User Logged Out]):::startEnd

    ADM_REP --> ADM_OUT
    EMP_PAY_HIST --> EMP_OUT
    DH_REP --> DH_OUT
    ACC_EXP_REP --> ACC_OUT

    ADM_OUT --> LOGOUT_ACT
    EMP_OUT --> LOGOUT_ACT
    DH_OUT --> LOGOUT_ACT
    ACC_OUT --> LOGOUT_ACT
    LOGOUT_ACT --> END_NODE
  end
`;

  // 2. DEDICATED PAYROLL PROCESSING FLOW
  const payrollChart = `
flowchart TD
  classDef startEnd fill:#d1fae5,stroke:#059669,stroke-width:2px,color:#064e3b;
  classDef process fill:#e2ebf8,stroke:#1d58d9,stroke-width:2px,color:#0f2d6b;
  classDef decision fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f;
  classDef inout fill:#f3e8ff,stroke:#7e22ce,stroke-width:2px,color:#581c87;

  START_PAY([Start: Trigger Payroll Calculation Cycle]):::startEnd
  
  subgraph STAGE1["Stage 1: Verified Input Feeds"]
    IN_DTR[/"Approved Attendance & DTR Timesheets<br/>Regular, Visiting & Job-Order"/]:::inout
    IN_OT[/"Approved Overtime Authorizations"/]:::inout
    IN_LV[/"Approved Leaves, Absences & LWOP Deductions"/]:::inout
    IN_ALL[/"Active Allowances & Benefits<br/>PERA, RATA, Teaching Load"/]:::inout
    IN_DED[/"Statutory & Institutional Deductions Table<br/>GSIS, PhilHealth, Pag-IBIG, Withholding Tax & Loans"/]:::inout
  end

  START_PAY --> IN_DTR
  START_PAY --> IN_OT
  START_PAY --> IN_LV
  START_PAY --> IN_ALL
  START_PAY --> IN_DED

  subgraph STAGE2["Stage 2: Mathematical Computation Pipeline"]
    CALC_GROSS[Calculate Gross Pay<br/>Base Salary/Rate + Overtime Pay + Allowances]:::process
    CALC_DED[Calculate Total Deductions<br/>GSIS/SSS + PhilHealth + Pag-IBIG + Withholding Tax + Loans + LWOP/Tardy]:::process
    CALC_NET[Calculate Net Pay<br/>Gross Pay - Total Deductions]:::process
  end

  IN_DTR --> CALC_GROSS
  IN_OT --> CALC_GROSS
  IN_ALL --> CALC_GROSS
  IN_LV --> CALC_DED
  IN_DED --> CALC_DED
  CALC_GROSS --> CALC_DED
  CALC_DED --> CALC_NET

  subgraph STAGE3["Stage 3: Review, Validation & Finalization"]
    DEC_VAL{"Payroll Review & Validation<br/>Accountant & Admin Sign-off"}:::decision
    REVISE[Flag Discrepancies & Adjust Calculation Inputs]:::process
    FIN_PAY[Finalize & Lock Payroll Cycle]:::process
  end

  CALC_NET --> DEC_VAL
  DEC_VAL -- Corrections Required --> REVISE
  REVISE --> IN_DTR
  DEC_VAL -- Validated & Approved --> FIN_PAY

  subgraph STAGE4["Stage 4: Output Generation & Employee Distribution"]
    GEN_PS[/"Generate Official Digital & Printable PDF Payslips"/]:::inout
    GEN_REP[/"Generate Payroll Register, General Ledger & Remittance Reports"/]:::inout
    EMP_VIEW[/"Employee Views Payslip & Payroll History"/]:::inout
    END_PAY([End: Payroll Period Successfully Completed]):::startEnd
  end

  FIN_PAY --> GEN_PS
  FIN_PAY --> GEN_REP
  GEN_PS --> EMP_VIEW
  GEN_REP --> END_PAY
  EMP_VIEW --> END_PAY
`;

  // 3. ADMINISTRATOR WORKFLOW
  const adminChart = `
flowchart TD
  classDef startEnd fill:#d1fae5,stroke:#059669,stroke-width:2px,color:#064e3b;
  classDef process fill:#e2ebf8,stroke:#1d58d9,stroke-width:2px,color:#0f2d6b;
  classDef decision fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f;
  classDef inout fill:#f3e8ff,stroke:#7e22ce,stroke-width:2px,color:#581c87;
  classDef errorNode fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#7f1d1d;

  A_START([Start: Admin Portal Access]):::startEnd --> A_IN[/"Enter Username / Email & Password"/]:::inout
  A_IN --> A_VAL[Validate Credentials]:::process
  A_VAL --> A_DEC{Credentials Valid?}:::decision
  A_DEC -- No --> A_ERR[/"Show Error: Invalid Credentials"/]:::errorNode
  A_ERR --> A_IN
  A_DEC -- Yes --> A_ROLE{Identify Role = Admin}:::decision
  A_ROLE --> A_DASH[Admin Dashboard]:::process

  subgraph MNG_ORG["Organization & Personnel Management"]
    A_DASH --> A_USERS[Manage Users & Security]:::process
    A_DASH --> A_EMP[Manage Employees Registry]:::process
    A_DASH --> A_DEP[Manage Departments & Subjects]:::process
    A_DASH --> A_POS[Manage Positions]:::process
    A_DASH --> A_SCHED[Manage Schedules & Faculty Load]:::process
  end

  subgraph MNG_COMP["Compensation & Deductions Management"]
    A_DASH --> A_SAL[Manage Salary & Compensation]:::process
    A_DASH --> A_ALL[Manage Allowances & Benefits]:::process
    A_DASH --> A_DED[Manage Deductions & Loan Amortizations]:::process
    A_DASH --> A_HOL[Manage Holidays Registry]:::process
  end

  subgraph MNG_ATT["Attendance, Overtime & Leave Management"]
    A_DASH --> A_DTR[Manage DTR Attendance Logs<br/>Regular, Visiting, Job-Order & Sandbox]:::process
    A_DASH --> A_OT[Manage Overtime Requests & Approval Center]:::process
    A_DASH --> A_LV[Manage Leave Requests & Balance Credits]:::process
  end

  subgraph MNG_FIN["Payroll Processing, Governance & Audits"]
    A_DASH --> A_PAY[Manage Payroll Generation Hub]:::process
    A_DASH --> A_REP[/"View / Generate Financial Reports"/]:::inout
    A_DASH --> A_HIST[View Activity & History Records]:::process
    A_DASH --> A_SET[Manage System Settings]:::process
    A_DASH --> A_LOG[View Compliance Audit Logs]:::process
    A_DASH --> A_DOC[/"Knowledge Base Documentation"/]:::inout
  end

  A_USERS --> A_OUT[Admin Logout]:::process
  A_EMP --> A_OUT
  A_DEP --> A_OUT
  A_POS --> A_OUT
  A_SCHED --> A_OUT
  A_SAL --> A_OUT
  A_ALL --> A_OUT
  A_DED --> A_OUT
  A_HOL --> A_OUT
  A_DTR --> A_OUT
  A_OT --> A_OUT
  A_LV --> A_OUT
  A_PAY --> A_OUT
  A_REP --> A_OUT
  A_HIST --> A_OUT
  A_SET --> A_OUT
  A_LOG --> A_OUT
  A_DOC --> A_OUT
  A_DASH --> A_OUT

  A_OUT --> A_END([End: Admin Session Closed]):::startEnd
`;

  // 4. EMPLOYEE SELF-SERVICE WORKFLOW
  const employeeChart = `
flowchart TD
  classDef startEnd fill:#d1fae5,stroke:#059669,stroke-width:2px,color:#064e3b;
  classDef process fill:#e2ebf8,stroke:#1d58d9,stroke-width:2px,color:#0f2d6b;
  classDef decision fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f;
  classDef inout fill:#f3e8ff,stroke:#7e22ce,stroke-width:2px,color:#581c87;
  classDef errorNode fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#7f1d1d;

  E_START([Start: Employee Portal Access]):::startEnd --> E_IN[/"Enter Username / Email & Password"/]:::inout
  E_IN --> E_VAL[Validate Credentials]:::process
  E_VAL --> E_DEC{Credentials Valid?}:::decision
  E_DEC -- No --> E_ERR[/"Show Error: Invalid Credentials"/]:::errorNode
  E_ERR --> E_IN
  E_DEC -- Yes --> E_ROLE{Identify Role = Employee}:::decision
  E_ROLE --> E_DASH[Employee Dashboard]:::process

  subgraph EMP_SELF["Profile & Account Operations"]
    E_DASH --> E_PROF[View / Edit Profile]:::process
    E_DASH --> E_ACCT[View My Account Overview]:::process
    E_DASH --> E_PWD[Change Password]:::process
    E_DASH --> E_DOC[/"Knowledge Base Documentation"/]:::inout
  end

  subgraph EMP_TIME["Time, Attendance, Schedules & Requests"]
    E_DASH --> E_DTR[View DTR Attendance Logs<br/>Regular, Visiting or Job-Order]:::process
    E_DASH --> E_SCHED[View My Schedules & Teaching Load]:::process
    E_DASH --> E_HOL[View Holidays Calendar]:::process
    E_DASH --> E_OT_SUB[/"Submit Overtime Request"/]:::inout
    E_OT_SUB --> E_OT_STAT[View Overtime Request Status]:::process
    E_DASH --> E_LV_SUB[/"Submit Leave Application<br/>Vacation, Sick, Custom with Attachments"/]:::inout
    E_LV_SUB --> E_LV_STAT[View Leave Request Status & Balances]:::process
  end

  subgraph EMP_PAY["Salary, Payslips & Financial History"]
    E_DASH --> E_SAL[View Salary Information]:::process
    E_DASH --> E_DED_ALL[View Deductions & Allowances Breakdown]:::process
    E_DASH --> E_PAY_HIST[View Payroll History]:::process
    E_DASH --> E_PAYSLIP[/"View & Download Payslip"/]:::inout
  end

  E_PROF --> E_OUT[Employee Logout]:::process
  E_ACCT --> E_OUT
  E_PWD --> E_OUT
  E_DOC --> E_OUT
  E_DTR --> E_OUT
  E_SCHED --> E_OUT
  E_HOL --> E_OUT
  E_OT_STAT --> E_OUT
  E_LV_STAT --> E_OUT
  E_SAL --> E_OUT
  E_DED_ALL --> E_OUT
  E_PAY_HIST --> E_OUT
  E_PAYSLIP --> E_OUT
  E_DASH --> E_OUT

  E_OUT --> E_END([End: Employee Session Closed]):::startEnd
`;

  // 5. DEPARTMENT HEAD WORKFLOW
  const deptHeadChart = `
flowchart TD
  classDef startEnd fill:#d1fae5,stroke:#059669,stroke-width:2px,color:#064e3b;
  classDef process fill:#e2ebf8,stroke:#1d58d9,stroke-width:2px,color:#0f2d6b;
  classDef decision fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f;
  classDef inout fill:#f3e8ff,stroke:#7e22ce,stroke-width:2px,color:#581c87;
  classDef errorNode fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#7f1d1d;

  DH_START([Start: Department Head Portal Access]):::startEnd --> DH_IN[/"Enter Username / Email & Password"/]:::inout
  DH_IN --> DH_VAL[Validate Credentials]:::process
  DH_VAL --> DH_DEC{Credentials Valid?}:::decision
  DH_DEC -- No --> DH_ERR[/"Show Error: Invalid Credentials"/]:::errorNode
  DH_ERR --> DH_IN
  DH_DEC -- Yes --> DH_ROLE{Identify Role = Department Head}:::decision
  DH_ROLE --> DH_DASH[Department Head Dashboard]:::process

  subgraph DH_STAFF["Department Personnel, Schedules & Attendance Oversight"]
    DH_DASH --> DH_EMPS[View Employees under Department]:::process
    DH_DASH --> DH_SCHED[View & Manage Faculty Schedules / Load]:::process
    DH_DASH --> DH_DEP[View Academic Departments & Subjects]:::process
    DH_DASH --> DH_DTR[View Department DTR & Attendance Logs]:::process
    DH_DASH --> DH_HOL[View Holidays Calendar]:::process
  end

  subgraph DH_APPROVALS["Review & Approvals Gateway"]
    DH_DASH --> DH_OT_REV{Review Overtime Requests}:::decision
    DH_OT_REV -- "Endorse / Approve" --> DH_OT_APP[Endorse / Approve Overtime]:::process
    DH_OT_REV -- Decline --> DH_OT_REJ[Reject Overtime Request]:::process

    DH_DASH --> DH_LV_REV{Review Leave Requests}:::decision
    DH_LV_REV -- "Endorse / Approve" --> DH_LV_APP[Endorse / Approve Leave]:::process
    DH_LV_REV -- Decline --> DH_LV_REJ[Reject Leave Request]:::process
  end

  subgraph DH_REPORTS["Departmental Payroll & Reporting"]
    DH_DASH --> DH_PAY_INFO[View Department Payroll Information]:::process
    DH_DASH --> DH_REP[/"View Department Reports"/]:::inout
  end

  DH_EMPS --> DH_OUT[Department Head Logout]:::process
  DH_SCHED --> DH_OUT
  DH_DEP --> DH_OUT
  DH_DTR --> DH_OUT
  DH_HOL --> DH_OUT
  DH_OT_APP --> DH_OUT
  DH_OT_REJ --> DH_OUT
  DH_LV_APP --> DH_OUT
  DH_LV_REJ --> DH_OUT
  DH_PAY_INFO --> DH_OUT
  DH_REP --> DH_OUT
  DH_DASH --> DH_OUT

  DH_OUT --> DH_END([End: Department Head Session Closed]):::startEnd
`;

  // 6. ACCOUNTANT WORKFLOW
  const accountantChart = `
flowchart TD
  classDef startEnd fill:#d1fae5,stroke:#059669,stroke-width:2px,color:#064e3b;
  classDef process fill:#e2ebf8,stroke:#1d58d9,stroke-width:2px,color:#0f2d6b;
  classDef decision fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f;
  classDef inout fill:#f3e8ff,stroke:#7e22ce,stroke-width:2px,color:#581c87;
  classDef errorNode fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#7f1d1d;

  AC_START([Start: Accountant Portal Access]):::startEnd --> AC_IN[/"Enter Username / Email & Password"/]:::inout
  AC_IN --> AC_VAL[Validate Credentials]:::process
  AC_VAL --> AC_DEC{Credentials Valid?}:::decision
  AC_DEC -- No --> AC_ERR[/"Show Error: Invalid Credentials"/]:::errorNode
  AC_ERR --> AC_IN
  AC_DEC -- Yes --> AC_ROLE{Identify Role = Accountant}:::decision
  AC_ROLE --> AC_DASH[Accountant Dashboard]:::process

  subgraph AC_AUDIT["Data Review & Pre-Payroll Verification"]
    AC_DASH --> AC_REV_EMP[Review Employee Payroll Masterfile]:::process
    AC_DASH --> AC_VER_DTR[Verify Attendance & DTR Logs<br/>Regular, Visiting & Job-Order]:::process
    AC_DASH --> AC_VER_OT[Verify Approved Overtime Records]:::process
    AC_DASH --> AC_VER_LV[Verify Leaves, Absences & LWOP Deductions]:::process
    AC_DASH --> AC_VER_AD[Verify Allowances & Statutory Deductions]:::process
    AC_DASH --> AC_VER_HOL[Verify Holiday Pay Multipliers]:::process
  end

  subgraph AC_CALC["Payroll Calculation & Validation"]
    AC_DASH --> AC_PROC_PAY[Process & Calculate Payroll Engine]:::process
    AC_PROC_PAY --> AC_VAL_PAY{Review and Validate Payroll Registry}:::decision
    AC_VAL_PAY -- Revisions Required --> AC_REV_EMP
  end

  subgraph AC_DISB["Reports, Payslips, Audits & History"]
    AC_VAL_PAY -- Validated --> AC_GEN_PS[/"Generate Digital & PDF Payslips"/]:::inout
    AC_VAL_PAY -- Validated --> AC_GEN_REP[/"Generate Payroll, Tax & Remittance Reports"/]:::inout
    AC_GEN_REP --> AC_EXP_REP[/"Export & Print Financial Reports"/]:::inout
    AC_DASH --> AC_HIST[View Payroll History & Archived Records]:::process
    AC_DASH --> AC_LOGS[Review Compliance Audit Logs]:::process
  end

  AC_GEN_PS --> AC_OUT[Accountant Logout]:::process
  AC_EXP_REP --> AC_OUT
  AC_HIST --> AC_OUT
  AC_LOGS --> AC_OUT
  AC_DASH --> AC_OUT

  AC_OUT --> AC_END([End: Accountant Session Closed]):::startEnd
`;

  // RACI Matrix definition for governance tab
  const raciData = [
    {
      module: '1. User Authentication & Login Verification',
      desc: 'Credential validation, password security, session initiation, and role dispatching.',
      admin: 'Accountable',
      deptHead: 'Informed',
      accountant: 'Informed',
      employee: 'Responsible',
    },
    {
      module: '2. User, Employee & Organization Masterfile',
      desc: 'Manage users, employees, academic departments, positions, compensation, allowances, and statutory deductions.',
      admin: 'Accountable',
      deptHead: 'Consulted',
      accountant: 'Consulted',
      employee: 'Informed',
    },
    {
      module: '3. Academic Schedules, Faculty Load & Timetables',
      desc: 'Class timetables, room assignments, faculty teaching load distribution, and schedule conflict resolution.',
      admin: 'Accountable',
      deptHead: 'Responsible',
      accountant: 'Informed',
      employee: 'Responsible',
    },
    {
      module: '4. Attendance (DTR Regular, Visiting & Job-Order)',
      desc: 'Category-specific DTR tracking, biometrics, hourly lecture logs, daily accomplishments, and tardiness summation.',
      admin: 'Accountable',
      deptHead: 'Responsible',
      accountant: 'Consulted',
      employee: 'Responsible',
    },
    {
      module: '5. Overtime Request & Dual-Tier Approval Center',
      desc: 'Filing overtime applications, work accomplishment evidence, department head endorsement, and admin approval.',
      admin: 'Accountable',
      deptHead: 'Responsible',
      accountant: 'Informed',
      employee: 'Responsible',
    },
    {
      module: '6. Leave Management, Filing & Balance Credits',
      desc: 'Leave application (VL, SL, Maternity/Paternity, Custom), document proof, credit deduction, and approval.',
      admin: 'Accountable',
      deptHead: 'Responsible',
      accountant: 'Consulted',
      employee: 'Responsible',
    },
    {
      module: '7. Public & Institutional Holidays Registry',
      desc: 'Regular, special non-working, and institutional holidays, automated pay multipliers, and calendar sync.',
      admin: 'Accountable',
      deptHead: 'Informed',
      accountant: 'Consulted',
      employee: 'Informed',
    },
    {
      module: '8. Compensation, Allowances & Benefits',
      desc: 'Base salary rates, PERA, RATA, teaching load honoraria, and special institutional compensation.',
      admin: 'Accountable',
      deptHead: 'Consulted',
      accountant: 'Responsible',
      employee: 'Informed',
    },
    {
      module: '9. Deductions Hub, Statutory Taxes & Loans',
      desc: 'Mandatory GSIS, PhilHealth, Pag-IBIG, progressive Withholding Tax tables, and employee loan amortizations.',
      admin: 'Accountable',
      deptHead: 'Informed',
      accountant: 'Responsible',
      employee: 'Informed',
    },
    {
      module: '10. Automated Payroll Calculation Engine',
      desc: 'Mathematical execution: Gross Pay (Base + OT + Allowances) - Total Deductions (Taxes + Loans + LWOP) = Net Pay.',
      admin: 'Accountable',
      deptHead: 'Informed',
      accountant: 'Responsible',
      employee: 'Informed',
    },
    {
      module: '11. Pre-Payroll Auditing & Registry Finalization',
      desc: 'Audit validation, discrepancy resolution, manual adjustments, period locking, and voucher signing.',
      admin: 'Accountable',
      deptHead: 'Informed',
      accountant: 'Responsible',
      employee: 'Informed',
    },
    {
      module: '12. Digital Payslip Generation & Distribution',
      desc: 'Generating official encrypted digital PDF payslips, batch printing, and employee self-service access.',
      admin: 'Consulted',
      deptHead: 'Informed',
      accountant: 'Responsible',
      employee: 'Accountable',
    },
    {
      module: '13. Financial Reports & Remittance Schedules',
      desc: 'Payroll Summary Register, General Ledger Journal Voucher, BIR 2316, GSIS/HDMF remittance exports.',
      admin: 'Accountable',
      deptHead: 'Consulted',
      accountant: 'Responsible',
      employee: 'Informed',
    },
    {
      module: '14. System Compliance Audit Logs & History Archives',
      desc: 'Immutable audit trails, system access tracking, role mutations, and historical payroll run archives.',
      admin: 'Accountable',
      deptHead: 'Informed',
      accountant: 'Responsible',
      employee: 'Informed',
    },
    {
      module: '15. Knowledge Base Documentation & Guides',
      desc: 'Institutional user manuals, statutory computation references, and step-by-step operating guidelines.',
      admin: 'Accountable',
      deptHead: 'Consulted',
      accountant: 'Consulted',
      employee: 'Informed',
    },
    {
      module: '16. System Logout & Session Termination',
      desc: 'Secure session logout, cache clearing, and immutable logout audit logging across all roles.',
      admin: 'Responsible',
      deptHead: 'Responsible',
      accountant: 'Responsible',
      employee: 'Responsible',
    },
  ];

  const filteredRaciData = useMemo(() => {
    if (!searchQuery.trim()) return raciData;
    const q = searchQuery.toLowerCase();
    return raciData.filter(
      (row) =>
        row.module.toLowerCase().includes(q) ||
        row.desc.toLowerCase().includes(q) ||
        row.admin.toLowerCase().includes(q) ||
        row.deptHead.toLowerCase().includes(q) ||
        row.accountant.toLowerCase().includes(q) ||
        row.employee.toLowerCase().includes(q)
    );
  }, [searchQuery, raciData]);

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
            <span>Academic System Flowchart & Architecture Specification</span>
          </div>
          
          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight leading-tight">
            System Flowchart: Login to Logout
          </h1>
          
          <p className="text-sm md:text-base text-white/85 max-w-3xl font-medium leading-relaxed">
            A comprehensive, multi-role academic system flowchart for the <strong>Payroll Management System</strong>. 
            Visualizes every process, decision gateway, input/output operation, and cross-actor connection across 
            <strong className="text-white"> Administrator</strong>, 
            <strong className="text-white"> Employee</strong>, 
            <strong className="text-white"> Department Head</strong>, and 
            <strong className="text-white"> Accountant</strong> roles.
          </p>

          {/* Quick Flow Metrics */}
          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs font-medium text-white/90">
            <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
              <Shield className="w-4 h-4 text-emerald-300" />
              <span>4 User Roles</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
              <Layers className="w-4 h-4 text-blue-300" />
              <span>7 System Sections</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
              <Calculator className="w-4 h-4 text-amber-300" />
              <span>Full Payroll Processing Pipeline</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
              <FileCheck className="w-4 h-4 text-purple-300" />
              <span>Standard ISO / Academic Flowchart Symbols</span>
            </div>
          </div>
        </div>
      </div>

      {/* Standard Flowchart Symbols Reference Banner */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[#e2ebf8] text-[#1d58d9] rounded-lg">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                Standard Flowchart Symbols Key
              </h4>
              <p className="text-[11px] text-neutral-500">
                Adheres strictly to standard academic and ISO flowchart conventions
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono font-bold text-[#1d58d9] bg-[#e2ebf8]/60 px-2.5 py-1 rounded-lg">
            ISO 5807 Compliant
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-1">
          {/* 1. Oval */}
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-neutral-50 border border-neutral-200/80">
            <div className="w-8 h-5 rounded-full border-2 border-emerald-600 bg-emerald-50 shrink-0" />
            <div>
              <span className="text-xs font-bold text-neutral-900 block leading-tight">Oval</span>
              <span className="text-[10px] text-neutral-500">Start / End</span>
            </div>
          </div>

          {/* 2. Rectangle */}
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-neutral-50 border border-neutral-200/80">
            <div className="w-7 h-5 rounded-xs border-2 border-[#1d58d9] bg-[#e2ebf8] shrink-0" />
            <div>
              <span className="text-xs font-bold text-neutral-900 block leading-tight">Rectangle</span>
              <span className="text-[10px] text-neutral-500">Process / Feature</span>
            </div>
          </div>

          {/* 3. Diamond */}
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-neutral-50 border border-neutral-200/80">
            <div className="w-5 h-5 rotate-45 border-2 border-amber-600 bg-amber-50 shrink-0" />
            <div>
              <span className="text-xs font-bold text-neutral-900 block leading-tight">Diamond</span>
              <span className="text-[10px] text-neutral-500">Decision Gateway</span>
            </div>
          </div>

          {/* 4. Parallelogram */}
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-neutral-50 border border-neutral-200/80">
            <div className="w-7 h-5 -skew-x-12 border-2 border-purple-600 bg-purple-50 shrink-0" />
            <div>
              <span className="text-xs font-bold text-neutral-900 block leading-tight">Parallelogram</span>
              <span className="text-[10px] text-neutral-500">Input / Output</span>
            </div>
          </div>

          {/* 5. Arrows */}
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-neutral-50 border border-neutral-200/80">
            <div className="flex items-center text-neutral-700 shrink-0">
              <span className="w-4 h-0.5 bg-neutral-700" />
              <ArrowRight className="w-4 h-4 -ml-1" />
            </div>
            <div>
              <span className="text-xs font-bold text-neutral-900 block leading-tight">Arrows</span>
              <span className="text-[10px] text-neutral-500">Flow Direction</span>
            </div>
          </div>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-neutral-200 pb-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
          {[
            { id: 'master', label: 'Master System Swimlane', icon: GitFork, badge: 'Top-to-Bottom Flow' },
            { id: 'payroll_engine', label: 'Payroll Processing Flow', icon: Calculator, badge: 'Formula & Review' },
            { id: 'admin', label: 'Administrator Flow', icon: Shield, badge: '20 Features' },
            { id: 'employee', label: 'Employee Portal Flow', icon: Users, badge: '16 Features' },
            { id: 'depthead', label: 'Department Head Flow', icon: Building2, badge: '13 Features' },
            { id: 'accountant', label: 'Accountant Flow', icon: CreditCard, badge: '15 Features' },
            { id: 'symbols', label: 'Flowchart Symbols Guide', icon: HelpCircle, badge: 'Academic Standard' },
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
      </div>

      {/* TAB 1: MASTER SWIMLANE FLOWCHART */}
      {activeTab === 'master' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
            <div className="space-y-1">
              <h3 className="font-extrabold text-base text-neutral-900 flex items-center gap-2">
                <span>Complete Multi-Role System Swimlane Flowchart</span>
                <Badge className="bg-[#e2ebf8] text-[#1d58d9] font-mono text-[10px] uppercase border-none">
                  Master Blueprint
                </Badge>
              </h3>
              <p className="text-xs text-neutral-500 leading-relaxed max-w-3xl">
                Depicts the entire operational lifecycle from Login credential validation, through role-specific dashboards (Admin, Employee, Department Head, Accountant), cross-role approvals, the unified payroll computation pipeline, to Logout and End.
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
            title="Complete System Swimlane Flowchart (Login to Logout/End)"
            subtitle="Full multi-role architectural workflow with standard symbols, decision gates, and data feeds"
          />
        </div>
      )}

      {/* TAB 2: DEDICATED PAYROLL PROCESSING FLOW */}
      {activeTab === 'payroll_engine' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="font-extrabold text-base text-neutral-900 flex items-center gap-2">
                <span>Section 6: Payroll Processing Engine Flowchart</span>
                <Badge className="bg-emerald-50 text-emerald-700 font-mono text-[10px] uppercase border-none">
                  Mathematical Pipeline
                </Badge>
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Approved DTR (Regular, Visiting, Job-Order) + Approved Overtime + Leave/LWOP Deductions + Active Allowances + Deductions &amp; Loans → Calculate Gross Pay → Calculate Deductions → Calculate Net Pay → Pre-Payroll Review &amp; Validation → Finalize &amp; Lock Period → Generate Digital Payslips &amp; Remittance Reports → Employee Self-Service Access.
              </p>
            </div>
            {onNavigate && (
              <Button 
                onClick={() => onNavigate('payroll')}
                className="bg-[#1d58d9] text-white rounded-xl text-xs font-bold shadow-xs"
              >
                <span>Launch Payroll Engine</span>
                <ExternalLink className="w-3.5 h-3.5 ml-1" />
              </Button>
            )}
          </div>

          {/* Mathematical Step Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4 bg-white border-neutral-200 rounded-2xl space-y-2">
              <span className="text-[10px] font-mono font-bold text-[#1d58d9] uppercase tracking-wider bg-[#e2ebf8] px-2 py-0.5 rounded-md">
                1. Data Aggregation
              </span>
              <h4 className="text-xs font-bold text-neutral-900">Approved DTR, OT &amp; Leaves</h4>
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                Biometric attendance punches across categories (Regular, Visiting, Job-Order), dual-approved overtime hours, and approved leave credit deductions/LWOP.
              </p>
            </Card>

            <Card className="p-4 bg-white border-neutral-200 rounded-2xl space-y-2">
              <span className="text-[10px] font-mono font-bold text-amber-700 uppercase tracking-wider bg-amber-50 px-2 py-0.5 rounded-md">
                2. Gross Computation
              </span>
              <h4 className="text-xs font-bold text-neutral-900">Calculate Gross Pay</h4>
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                Base Monthly / Daily / Hourly Rate + Overtime Hourly Multipliers + Active Allowances (PERA, RATA, Teaching Load Honoraria).
              </p>
            </Card>

            <Card className="p-4 bg-white border-neutral-200 rounded-2xl space-y-2">
              <span className="text-[10px] font-mono font-bold text-purple-700 uppercase tracking-wider bg-purple-50 px-2 py-0.5 rounded-md">
                3. Deductions &amp; Taxes
              </span>
              <h4 className="text-xs font-bold text-neutral-900">Calculate Total Deductions</h4>
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                Mandatory GSIS/SSS, PhilHealth, Pag-IBIG contributions + progressive Withholding Tax + active loan amortizations and LWOP/tardiness penalties.
              </p>
            </Card>

            <Card className="p-4 bg-white border-neutral-200 rounded-2xl space-y-2">
              <span className="text-[10px] font-mono font-bold text-emerald-700 uppercase tracking-wider bg-emerald-50 px-2 py-0.5 rounded-md">
                4. Net Pay &amp; Payslips
              </span>
              <h4 className="text-xs font-bold text-neutral-900">Net Pay &amp; Distribution</h4>
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                Gross Pay minus Total Deductions = Net Pay. Validated by Accountant, approved by Admin, distributed as PDF payslips and remittance schedules.
              </p>
            </Card>
          </div>

          <MermaidViewer
            chart={payrollChart}
            title="Detailed Payroll Processing Flowchart"
            subtitle="Step-by-step mathematical calculations, verification gates, and reporting outputs"
          />
        </div>
      )}

      {/* TAB 3: ADMINISTRATOR WORKFLOW */}
      {activeTab === 'admin' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="font-extrabold text-base text-neutral-900 flex items-center gap-2">
                <span>Section 2: Administrator Flowchart</span>
                <Badge className="bg-[#e2ebf8] text-[#1d58d9] font-mono text-[10px] uppercase border-none">
                  20 Features
                </Badge>
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Dashboard → Manage Users, Employees, Departments &amp; Subjects, Positions, Schedules &amp; Faculty Load, Salary, Allowances, Deductions &amp; Loans, Holidays, DTR Categories, Overtime Approvals, Leave Requests &amp; Balances, Payroll Hub, Financial Reports, Activity History, Audit Logs, System Settings, Knowledge Base → Logout → End.
              </p>
            </div>
            {onNavigate && (
              <div className="flex gap-2 flex-wrap">
                <Button 
                  onClick={() => onNavigate('employees')}
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-bold"
                >
                  Employees
                </Button>
                <Button 
                  onClick={() => onNavigate('schedules')}
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-bold"
                >
                  Schedules
                </Button>
                <Button 
                  onClick={() => onNavigate('leaves')}
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-bold"
                >
                  Leaves
                </Button>
                <Button 
                  onClick={() => onNavigate('payroll')}
                  className="bg-[#1d58d9] text-white rounded-xl text-xs font-bold"
                >
                  Payroll Hub
                </Button>
              </div>
            )}
          </div>

          {/* Feature Checklist Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {[
              'Admin Dashboard Overview',
              'Manage Users & Security',
              'Employees Registry',
              'Academic Depts & Subjects',
              'Positions & Classifications',
              'Schedules & Faculty Load',
              'Salary & Base Rates',
              'Allowances & Benefits',
              'Deductions & Loans',
              'Holidays Registry',
              'DTR Attendance Logs',
              'Overtime Approval Center',
              'Leave Management & Balances',
              'Payroll Generation Hub',
              'Financial Reports & Analysis',
              'Activity & History Records',
              'Compliance Audit Logs',
              'System Settings',
              'Knowledge Base Documentation',
              'Logout & Session Termination'
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-neutral-200/80 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#1d58d9] shrink-0" />
                <span className="font-semibold text-neutral-800 text-[11px] truncate">{feature}</span>
              </div>
            ))}
          </div>

          <MermaidViewer
            chart={adminChart}
            title="Administrator System Flowchart"
            subtitle="Full lifecycle of all 20 administrative governance modules from Login to Logout"
          />
        </div>
      )}

      {/* TAB 4: EMPLOYEE SELF-SERVICE WORKFLOW */}
      {activeTab === 'employee' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="font-extrabold text-base text-neutral-900 flex items-center gap-2">
                <span>Section 3: Employee Self-Service Flowchart</span>
                <Badge className="bg-emerald-50 text-emerald-700 font-mono text-[10px] uppercase border-none">
                  16 Features
                </Badge>
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Dashboard → View / Edit Profile, My Account Overview, Change Password, View DTR Logs (Regular, Visiting, JO), View My Schedules &amp; Teaching Load, View Holidays Calendar, Submit Overtime Request, View Overtime Status, Submit Leave Application, View Leave Status &amp; Balances, View Salary Information, View Deductions &amp; Allowances, View Payroll History, View / Download Digital Payslip, Knowledge Base → Logout → End.
              </p>
            </div>
            {onNavigate && (
              <div className="flex gap-2 flex-wrap">
                <Button 
                  onClick={() => onNavigate('leaves')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
                >
                  Leave Request
                </Button>
                <Button 
                  onClick={() => onNavigate('overtime')}
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-bold"
                >
                  Overtime Request
                </Button>
                <Button 
                  onClick={() => onNavigate('schedules')}
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-bold"
                >
                  My Schedules
                </Button>
              </div>
            )}
          </div>

          {/* Feature Checklist Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {[
              'Employee Dashboard Home',
              'View / Edit Profile',
              'My Account Overview',
              'Change Password',
              'DTR Attendance Logs',
              'My Schedules & Teaching Load',
              'Holidays & Academic Calendar',
              'Submit Overtime Request',
              'Track Overtime Status',
              'Submit Leave Application',
              'Leave Balances & Status',
              'Salary & Rate Information',
              'Deductions & Allowances',
              'Payroll History',
              'Digital PDF Payslip',
              'Knowledge Base & Manuals'
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-neutral-200/80 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="font-semibold text-neutral-800 text-[11px] truncate">{feature}</span>
              </div>
            ))}
          </div>

          <MermaidViewer
            chart={employeeChart}
            title="Employee Self-Service Flowchart"
            subtitle="Complete workflow for faculty and staff from Login to Leaves, Schedules, Payslip Download & Logout"
          />
        </div>
      )}

      {/* TAB 5: DEPARTMENT HEAD WORKFLOW */}
      {activeTab === 'depthead' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="font-extrabold text-base text-neutral-900 flex items-center gap-2">
                <span>Section 4: Department Head Flowchart</span>
                <Badge className="bg-amber-50 text-amber-700 font-mono text-[10px] uppercase border-none">
                  13 Features
                </Badge>
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Dashboard → View Dept Employees, Faculty Schedules &amp; Teaching Load, Academic Departments &amp; Subjects, Department DTR Logs, Holidays Calendar, Overtime Review (Endorse / Reject), Leave Review (Endorse / Reject), Department Payroll Info, Department Financial Reports → Logout → End.
              </p>
            </div>
            {onNavigate && (
              <div className="flex gap-2 flex-wrap">
                <Button 
                  onClick={() => onNavigate('departments')}
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-bold"
                >
                  Department Staff
                </Button>
                <Button 
                  onClick={() => onNavigate('schedules')}
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-bold"
                >
                  Faculty Schedules
                </Button>
                <Button 
                  onClick={() => onNavigate('overtime')}
                  className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold"
                >
                  Review Overtime
                </Button>
                <Button 
                  onClick={() => onNavigate('leaves')}
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-bold"
                >
                  Review Leaves
                </Button>
              </div>
            )}
          </div>

          {/* Feature Checklist Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {[
              'Department Dashboard',
              'View Dept Employees',
              'Faculty Schedules & Load',
              'Academic Depts & Subjects',
              'Department DTR Logs',
              'Holidays Calendar',
              'Overtime Request Review',
              'Endorse / Approve Overtime',
              'Reject Overtime Request',
              'Leave Request Review',
              'Endorse / Approve Leave',
              'Reject Leave Request',
              'Department Payroll & Reports'
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-neutral-200/80 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="font-semibold text-neutral-800 text-[11px] truncate">{feature}</span>
              </div>
            ))}
          </div>

          <MermaidViewer
            chart={deptHeadChart}
            title="Department Head Workflow Diagram"
            subtitle="Departmental supervision, faculty load & schedules oversight, and dual-party approval gateway"
          />
        </div>
      )}

      {/* TAB 6: ACCOUNTANT WORKFLOW */}
      {activeTab === 'accountant' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="font-extrabold text-base text-neutral-900 flex items-center gap-2">
                <span>Section 5: Accountant Flowchart</span>
                <Badge className="bg-purple-50 text-purple-700 font-mono text-[10px] uppercase border-none">
                  15 Features
                </Badge>
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Dashboard → Review Employee Payroll Data (Regular, Visiting, JO), Verify Attendance / DTR, Verify Approved Overtime, Verify Leaves &amp; LWOP Deductions, Verify Allowances &amp; Statutory Deductions, Verify Holiday Multipliers, Process / Calculate Payroll Engine, Review and Validate Payroll Registry, Generate Digital Payslips, Generate Financial Reports &amp; Remittances, Export / Print Reports, Payroll History, Compliance Audit Logs → Logout → End.
              </p>
            </div>
            {onNavigate && (
              <div className="flex gap-2 flex-wrap">
                <Button 
                  onClick={() => onNavigate('deductions')}
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-bold"
                >
                  Deductions Table
                </Button>
                <Button 
                  onClick={() => onNavigate('reports')}
                  className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold"
                >
                  Financial Reports
                </Button>
                <Button 
                  onClick={() => onNavigate('audit')}
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-bold"
                >
                  Audit Logs
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

          {/* Feature Checklist Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {[
              'Accountant Dashboard',
              'Review Employee Payroll Data',
              'Verify Attendance & DTR',
              'Verify Approved Overtime',
              'Verify Leaves & LWOP Deductions',
              'Verify Allowances & Deductions',
              'Verify Holiday Multipliers',
              'Process Payroll Engine',
              'Review & Validate Registry',
              'Generate Digital Payslips',
              'Generate Financial Reports',
              'Statutory Remittances (GSIS/BIR)',
              'Export & Print Reports',
              'Payroll History Archives',
              'Compliance Audit Logs Review'
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-neutral-200/80 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span className="font-semibold text-neutral-800 text-[11px] truncate">{feature}</span>
              </div>
            ))}
          </div>

          <MermaidViewer
            chart={accountantChart}
            title="Accountant Audit & Calculation Diagram"
            subtitle="Pre-computation verification, tax validation, report generation, and voucher sign-off"
          />
        </div>
      )}

      {/* TAB 7: FLOWCHART SYMBOLS GUIDE */}
      {activeTab === 'symbols' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
            <h3 className="font-extrabold text-base text-neutral-900 mb-1">
              Academic &amp; Standard Flowchart Symbols Reference Guide
            </h3>
            <p className="text-xs text-neutral-500">
              Complete breakdown of standard flowchart geometry according to ISO 5807 and academic computing standards.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Oval */}
            <Card className="p-6 bg-white border-neutral-200 rounded-3xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-16 h-10 rounded-full border-3 border-emerald-600 bg-emerald-50 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-emerald-900">Start / End</span>
                </div>
                <div>
                  <h4 className="font-bold text-sm text-neutral-900">Oval (Terminator)</h4>
                  <span className="text-xs text-emerald-600 font-semibold font-mono">Syntax: ([ Label ])</span>
                </div>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Represents the start or end of the flowchart. In this system:
              </p>
              <ul className="text-xs text-neutral-700 space-y-1 list-disc list-inside">
                <li><strong>Start:</strong> User accesses login portal or initiates computation.</li>
                <li><strong>End:</strong> User logs out, session terminates, or payroll cycle finishes.</li>
              </ul>
            </Card>

            {/* 2. Rectangle */}
            <Card className="p-6 bg-white border-neutral-200 rounded-3xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-16 h-10 rounded-xs border-3 border-[#1d58d9] bg-[#e2ebf8] flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-[#1d58d9]">Process</span>
                </div>
                <div>
                  <h4 className="font-bold text-sm text-neutral-900">Rectangle (Process / Action)</h4>
                  <span className="text-xs text-[#1d58d9] font-semibold font-mono">Syntax: [ Label ]</span>
                </div>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Represents a process, task, action step, or feature execution. Examples:
              </p>
              <ul className="text-xs text-neutral-700 space-y-1 list-disc list-inside">
                <li><strong>Data Operations:</strong> Manage Users, Manage Employees, Manage Deductions.</li>
                <li><strong>Calculations:</strong> Calculate Gross Pay, Calculate Deductions, Calculate Net Pay.</li>
              </ul>
            </Card>

            {/* 3. Diamond */}
            <Card className="p-6 bg-white border-neutral-200 rounded-3xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rotate-45 border-3 border-amber-600 bg-amber-50 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-bold text-amber-900 -rotate-45">Decision</span>
                </div>
                <div>
                  <h4 className="font-bold text-sm text-neutral-900">Diamond (Decision Gateway)</h4>
                  <span className="text-xs text-amber-600 font-semibold font-mono">Syntax: {'{ Label }'}</span>
                </div>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Represents a decision or condition resulting in alternative pathways. Examples:
              </p>
              <ul className="text-xs text-neutral-700 space-y-1 list-disc list-inside">
                <li><strong>Authentication:</strong> Credentials Valid? (Yes / No).</li>
                <li><strong>Role Resolution:</strong> Identify Role (Admin / Employee / Dept Head / Accountant).</li>
                <li><strong>Approvals:</strong> Review Overtime / Leave Request (Approve / Reject).</li>
              </ul>
            </Card>

            {/* 4. Parallelogram */}
            <Card className="p-6 bg-white border-neutral-200 rounded-3xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-16 h-10 -skew-x-12 border-3 border-purple-600 bg-purple-50 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-bold text-purple-900 skew-x-12">Input / Output</span>
                </div>
                <div>
                  <h4 className="font-bold text-sm text-neutral-900">Parallelogram (Input / Output)</h4>
                  <span className="text-xs text-purple-600 font-semibold font-mono">Syntax: [/ Label /]</span>
                </div>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Represents receiving user input or emitting data/reports/files. Examples:
              </p>
              <ul className="text-xs text-neutral-700 space-y-1 list-disc list-inside">
                <li><strong>User Inputs:</strong> Enter username/email and password, Submit Overtime Request.</li>
                <li><strong>Outputs:</strong> Show Error Alert, Generate Payslips, Export / Print Reports.</li>
              </ul>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 8: RACI MATRIX */}
      {activeTab === 'raci' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-extrabold text-base text-neutral-900 mb-1">
                Role Responsibility Assignment Matrix (RACI)
              </h3>
              <p className="text-xs text-neutral-500">
                Clear institutional governance guidelines showing which role is <strong>Responsible (R)</strong>, <strong>Accountable (A)</strong>, <strong>Consulted (C)</strong>, or <strong>Informed (I)</strong> across all system features.
              </p>
            </div>
            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search modules or roles..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#1d58d9] focus:border-transparent bg-neutral-50 focus:bg-white"
              />
            </div>
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
                  {filteredRaciData.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-neutral-400">
                        No modules match your search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredRaciData.map((row, idx) => (
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
                  )))}
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
