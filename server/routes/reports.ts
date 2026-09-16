import { Router } from "express";
import { db, logAudit } from "../db/schema.js";
import { sendSmsNotification, getSmsLogs } from "../services/smsService.js";

export const reportsRouter = Router();

// Financial Report & Analytics Aggregator
reportsRouter.get("/reports/financial", async (req: any, res: any) => {
  try {
    const { year, month, campus, category, status } = req.query;

    // 1. Fetch Payroll Cycles
    let cyclesQuery = 'SELECT * FROM payroll_cycles WHERE 1=1';
    const cyclesParams: any[] = [];

    if (campus && campus !== 'all' && campus !== 'All Campuses') {
      cyclesQuery += ' AND (campus = ? OR campus IS NULL OR campus = \'\')';
      cyclesParams.push(campus);
    }
    if (status && status !== 'all' && status !== 'All Statuses') {
      cyclesQuery += ' AND status = ?';
      cyclesParams.push(status);
    }

    cyclesQuery += ' ORDER BY "createdAt" DESC, id DESC';
    let cycles: any[] = [];
    try {
      cycles = await db.prepare(cyclesQuery).all(...cyclesParams) as any[];
    } catch {
      try {
        cycles = await db.prepare('SELECT * FROM payroll_cycles ORDER BY id DESC').all() as any[];
      } catch (e) {
        cycles = [];
      }
    }

    // Filter cycles by year / month if provided based on startDate or createdAt
    if (year && year !== 'all') {
      const yearNum = Number(year);
      cycles = cycles.filter(c => {
        const d = c.startDate || c.createdAt || c.created_at;
        return d && new Date(d).getFullYear() === yearNum;
      });
    }
    if (month && month !== 'all') {
      const monthNum = Number(month);
      cycles = cycles.filter(c => {
        const d = c.startDate || c.createdAt || c.created_at;
        return d && (new Date(d).getMonth() + 1) === monthNum;
      });
    }

    // 2. Fetch all entries for the matched cycles
    const cycleIds = cycles.map(c => c.id);
    let entries: any[] = [];
    
    if (cycleIds.length > 0) {
      const placeholders = cycleIds.map(() => '?').join(',');
      try {
        entries = await db.prepare(`
          SELECT pe.*, 
                 COALESCE(pe."employeeName", CONCAT(e."firstName", ' ', e."lastName")) as "resolvedName",
                 COALESCE(e."employeeId", pe."employeeId") as "employeeNo",
                 COALESCE(e.category, 'STAFF') as "empCategory",
                 COALESCE(e.position, 'Personnel') as "empPosition",
                 COALESCE(e.campus, pc.campus, 'Main Campus - Sogod') as "empCampus"
          FROM payroll_entries pe
          LEFT JOIN employees e ON pe."employeeId" = e.id
          LEFT JOIN payroll_cycles pc ON pe."cycleId" = pc.id
          WHERE pe."cycleId" IN (${placeholders})
        `).all(...cycleIds) as any[];
      } catch (err: any) {
        console.error("[Reports] Error fetching entries with join:", err?.message || err);
        try {
          entries = await db.prepare(`
            SELECT pe.*, pe."employeeName" as "resolvedName"
            FROM payroll_entries pe
            WHERE pe."cycleId" IN (${placeholders})
          `).all(...cycleIds) as any[];
        } catch (err2: any) {
          console.error("[Reports] Error fallback fetching entries:", err2?.message || err2);
          entries = [];
        }
      }
    }

    // Filter entries by category if provided
    if (category && category !== 'all' && category !== 'All Categories') {
      entries = entries.filter(e => {
        const cat = (e.empCategory || e.category || '').toLowerCase();
        return cat === category.toLowerCase();
      });
    }

    // 3. Initialize metrics accumulators
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    let totalEmployerShare = 0;
    let totalBasicPay = 0;
    let totalPera = 0;
    let totalOvertime = 0;
    let totalHonoraria = 0;
    let totalBonuses = 0;
    let totalAbsences = 0;

    const deductionsBreakdown: { [key: string]: number } = {
      'GSIS Personal Premium (9%)': 0,
      'GSIS Policy Loan': 0,
      'GSIS Consol Loan': 0,
      'GSIS Multipurpose Loan (MPL)': 0,
      'GSIS MPL Lite': 0,
      'GSIS Computer Loan (CPL)': 0,
      'GSIS GFAL Loan': 0,
      'GSIS Emergency Loan': 0,
      'GSIS Educational Assistance': 0,
      'Pag-IBIG Personal Regular (2%)': 0,
      'Pag-IBIG Multi-Purpose Loan (MPL)': 0,
      'Pag-IBIG MP2 Savings': 0,
      'PhilHealth Contribution (2.5%)': 0,
      'SSS Contribution/Loan': 0,
      'China Bank Savings Loan (CSB)': 0,
      'BIR Withholding Tax': 0,
      'Other Custom Deductions': 0
    };

    const govSharesBreakdown = {
      gsisEmployer: 0,
      hdmfEmployer: 0,
      philhealthEmployer: 0,
      ecip: 0,
      total: 0
    };

    // Agency personnel collectors for drilldowns
    const gsisEmployees: any[] = [];
    const hdmfEmployees: any[] = [];
    const philhealthEmployees: any[] = [];
    const birEmployees: any[] = [];
    const csbEmployees: any[] = [];
    const ecipEmployees: any[] = [];

    // Category and Campus trackers
    const categoryMap: { [cat: string]: { name: string; displayName: string; basicPay: number; pera: number; grossPay: number; gross: number; net: number; netPay: number; deductions: number; employerShare: number; count: number; employeeIds: Set<string> } } = {
      'FACULTY': { name: 'FACULTY', displayName: 'Regular Faculty', basicPay: 0, pera: 0, grossPay: 0, gross: 0, net: 0, netPay: 0, deductions: 0, employerShare: 0, count: 0, employeeIds: new Set() },
      'STAFF': { name: 'STAFF', displayName: 'Regular Staff', basicPay: 0, pera: 0, grossPay: 0, gross: 0, net: 0, netPay: 0, deductions: 0, employerShare: 0, count: 0, employeeIds: new Set() },
      'Job Order': { name: 'Job Order', displayName: 'Job Order', basicPay: 0, pera: 0, grossPay: 0, gross: 0, net: 0, netPay: 0, deductions: 0, employerShare: 0, count: 0, employeeIds: new Set() },
      'Visiting Instructor': { name: 'Visiting Instructor', displayName: 'Visiting Instructor', basicPay: 0, pera: 0, grossPay: 0, gross: 0, net: 0, netPay: 0, deductions: 0, employerShare: 0, count: 0, employeeIds: new Set() },
    };

    const campusMap: { [cName: string]: { campus: string; gross: number; net: number; deductions: number; employerShare: number; count: number } } = {};
    const monthlySeriesMap: { [monthKey: string]: { monthName: string; monthNum: number; year: number; Gross: number; Net: number; Deductions: number; EmployerShare: number; Batches: number } } = {};
    const uniqueEmployees = new Set<string>();
    const rosterEmployees: any[] = [];

    // Process entries
    entries.forEach(entry => {
      const empId = entry.employeeId || entry.employee_id || entry.id;
      uniqueEmployees.add(empId);

      const empName = entry.resolvedName || entry.employeeName || entry.employee_name || 'Personnel';
      const empCategory = entry.empCategory || entry.category || 'STAFF';
      const empPosition = entry.empPosition || entry.position || 'Staff';
      const empCampus = entry.empCampus || entry.campus || 'Main Campus - Sogod';
      const empNo = entry.employeeNo || entry.employeeId || empId;

      const basic = Number(entry.compSal2nd || entry.comp_sal_2nd || entry.basicPay || entry.basic_pay || entry.basicSalary || 0);
      const pera = Number(entry.compPera || entry.comp_pera || (empCategory === 'FACULTY' || empCategory === 'STAFF' ? 2000 : 0));
      const ot = Number(entry.overtime || 0);
      const teaching = Number(entry.teachingHoursWorked || entry.teaching_hours || 0) * Number(entry.hourlyRate || 0);
      const bonuses = Number(entry.bonuses || entry.allowances || entry.incentives || 0);
      const absences = Number(entry.absences || 0);
      let gross = Number(entry.compGross || entry.comp_gross || entry.grossPay || entry.gross_pay || 0);
      if (gross <= 0) {
        gross = basic + pera + ot + teaching + bonuses - absences;
      }

      totalBasicPay += basic;
      totalPera += pera;
      totalOvertime += ot;
      totalHonoraria += teaching;
      totalBonuses += bonuses;
      totalAbsences += absences;

      // Extract detailed deductions
      const dedGsisPrem = Number(entry.dedGsisPremPersonal || entry.ded_gsis_prem_personal || 0);
      const dedPolicyLoan = Number(entry.dedPolicyLoan || entry.ded_policy_loan || 0);
      const dedConsolLoan = Number(entry.dedConsolLoan || entry.ded_consol_loan || 0);
      const dedMpl = Number(entry.dedMpl || entry.ded_mpl || 0);
      const dedMplLite = Number(entry.dedMplLite || entry.ded_mpl_lite || 0);
      const dedCpl = Number(entry.dedCpl || entry.ded_cpl || 0);
      const dedGfal = Number(entry.dedGfal || entry.ded_gfal || 0);
      const dedEmerg = Number(entry.dedEmergencyLoan || entry.ded_emergency_loan || 0);
      const dedEduc = Number(entry.dedEducAsst || entry.ded_educ_asst || 0);
      const dedPagibig = Number(entry.dedPagibigPersonal || entry.ded_pagibig_personal || 0);
      const dedPagibigMpl = Number(entry.dedPagibigMpl || entry.ded_pagibig_mpl || 0);
      const dedMp2 = Number(entry.dedPagibigMp2 || entry.ded_pagibig_mp2 || 0);
      const dedPh = Number(entry.dedPhilhealthCont || entry.ded_philhealth_cont || 0);
      const dedSss = Number(entry.dedSss || entry.ded_sss || 0);
      const dedCsb = Number(entry.dedCsbLoan || entry.ded_csb_loan || 0);
      const dedTax = Number(entry.dedTaxWithheld || entry.ded_tax_withheld || 0);

      deductionsBreakdown['GSIS Personal Premium (9%)'] += dedGsisPrem;
      deductionsBreakdown['GSIS Policy Loan'] += dedPolicyLoan;
      deductionsBreakdown['GSIS Consol Loan'] += dedConsolLoan;
      deductionsBreakdown['GSIS Multipurpose Loan (MPL)'] += dedMpl;
      deductionsBreakdown['GSIS MPL Lite'] += dedMplLite;
      deductionsBreakdown['GSIS Computer Loan (CPL)'] += dedCpl;
      deductionsBreakdown['GSIS GFAL Loan'] += dedGfal;
      deductionsBreakdown['GSIS Emergency Loan'] += dedEmerg;
      deductionsBreakdown['GSIS Educational Assistance'] += dedEduc;
      deductionsBreakdown['Pag-IBIG Personal Regular (2%)'] += dedPagibig;
      deductionsBreakdown['Pag-IBIG Multi-Purpose Loan (MPL)'] += dedPagibigMpl;
      deductionsBreakdown['Pag-IBIG MP2 Savings'] += dedMp2;
      deductionsBreakdown['PhilHealth Contribution (2.5%)'] += dedPh;
      deductionsBreakdown['SSS Contribution/Loan'] += dedSss;
      deductionsBreakdown['China Bank Savings Loan (CSB)'] += dedCsb;
      deductionsBreakdown['BIR Withholding Tax'] += dedTax;

      // Handle custom/other deductions in json
      let customDedsSum = 0;
      const rawDedJson = entry.deductions_json || entry.deductions || entry.custom_values_json;
      const nonCustomKeys = new Set([
        'govSecGsis', 'govSecHdmf', 'govSecPh', 'govSecEcip', 'compSal2nd', 'compPera', 'compGross', 'absences',
        'basicSalary', 'grossPay', 'netPay', 'totalDeductions', 'basicPay', 'pera', 'overtime', 'teachingHoursWorked',
        'bonuses', 'allowances', 'incentives', 'dedPolicyLoan', 'dedConsolLoan', 'dedMplLite', 'dedMpl', 'dedCpl',
        'dedGfal', 'dedEmergencyLoan', 'dedGsisPremPersonal', 'dedEducAsst', 'dedPagibigPersonal', 'dedPagibigMpl',
        'dedSss', 'dedPagibigMp2', 'dedPhilhealthCont', 'dedCsbLoan', 'dedTaxWithheld'
      ]);

      if (rawDedJson) {
        try {
          const parsed = typeof rawDedJson === 'string' ? JSON.parse(rawDedJson) : rawDedJson;
          if (parsed && typeof parsed === 'object') {
            Object.entries(parsed).forEach(([k, v]) => {
              if (!nonCustomKeys.has(k) && typeof v === 'number' && v > 0) {
                customDedsSum += v;
              }
            });
          }
        } catch (e) {}
      }
      deductionsBreakdown['Other Custom Deductions'] += customDedsSum;

      const sumDeds = dedGsisPrem + dedPolicyLoan + dedConsolLoan + dedMpl + dedMplLite + dedCpl + dedGfal + dedEmerg + dedEduc + dedPagibig + dedPagibigMpl + dedMp2 + dedPh + dedSss + dedCsb + dedTax + customDedsSum;
      const entryStoredDed = Number(entry.totalDeductions || entry.total_deductions || entry.totaldeductions || 0);
      const entryTotalDed = sumDeds > 0 ? sumDeds : entryStoredDed;
      
      const storedNet = Number(entry.netPay || entry.net_pay || entry.netpay || 0);
      const net = storedNet > 0 ? storedNet : Math.max(0, gross - entryTotalDed);

      totalGross += gross;
      totalDeductions += entryTotalDed;
      totalNet += net;

      // Employer / Gov contributions
      const gsisGov = Number(entry.govSecGsis || entry.gov_sec_gsis || (empCategory === 'FACULTY' || empCategory === 'STAFF' ? basic * 0.12 : 0));
      const phGov = Number(entry.govSecPh || entry.gov_sec_ph || (empCategory === 'FACULTY' || empCategory === 'STAFF' ? (basic > 0 ? basic * 0.025 : 0) : 0));
      const hdmfGov = Number(entry.govSecHdmf || entry.gov_sec_hdmf || (empCategory === 'FACULTY' || empCategory === 'STAFF' ? 100 : 0));
      const ecip = Number(entry.govSecEcip || entry.gov_sec_ecip || (empCategory === 'FACULTY' || empCategory === 'STAFF' ? 100 : 0));
      const entryGovTotal = gsisGov + phGov + hdmfGov + ecip;

      govSharesBreakdown.gsisEmployer += gsisGov;
      govSharesBreakdown.philhealthEmployer += phGov;
      govSharesBreakdown.hdmfEmployer += hdmfGov;
      govSharesBreakdown.ecip += ecip;
      govSharesBreakdown.total += entryGovTotal;
      totalEmployerShare += entryGovTotal;

      // Category grouping
      const catKey = empCategory || 'STAFF';
      if (!categoryMap[catKey]) {
        categoryMap[catKey] = { name: catKey, displayName: catKey, basicPay: 0, pera: 0, grossPay: 0, gross: 0, net: 0, netPay: 0, deductions: 0, employerShare: 0, count: 0, employeeIds: new Set() };
      }
      categoryMap[catKey].basicPay += basic;
      categoryMap[catKey].pera += pera;
      categoryMap[catKey].grossPay += gross;
      categoryMap[catKey].gross += gross;
      categoryMap[catKey].net += net;
      categoryMap[catKey].netPay += net;
      categoryMap[catKey].deductions += entryTotalDed;
      categoryMap[catKey].employerShare += entryGovTotal;
      categoryMap[catKey].employeeIds.add(empId);

      // Campus grouping
      const cmp = empCampus || 'Main Campus - Sogod';
      if (!campusMap[cmp]) {
        campusMap[cmp] = { campus: cmp, gross: 0, net: 0, deductions: 0, employerShare: 0, count: 0 };
      }
      campusMap[cmp].gross += gross;
      campusMap[cmp].net += net;
      campusMap[cmp].deductions += entryTotalDed;
      campusMap[cmp].employerShare += entryGovTotal;
      campusMap[cmp].count += 1;

      // Add to Personnel Roster (deduplicated by ID or latest batch)
      rosterEmployees.push({
        id: empId,
        name: empName,
        employeeNo: empNo,
        position: empPosition,
        category: empCategory,
        campus: empCampus,
        basicPay: Number(basic.toFixed(2)),
        pera: Number(pera.toFixed(2)),
        grossPay: Number(gross.toFixed(2)),
        deductions: Number(entryTotalDed.toFixed(2)),
        netPay: Number(net.toFixed(2))
      });

      // Agency drilldown contributors
      const gsisLoans = dedPolicyLoan + dedConsolLoan + dedMpl + dedMplLite + dedCpl + dedGfal + dedEmerg + dedEduc;
      if (dedGsisPrem > 0 || gsisGov > 0 || gsisLoans > 0) {
        gsisEmployees.push({
          id: empId,
          name: empName,
          employeeNo: empNo,
          category: empCategory,
          personalShare: Number(dedGsisPrem.toFixed(2)),
          employerShare: Number(gsisGov.toFixed(2)),
          loans: Number(gsisLoans.toFixed(2)),
          total: Number((dedGsisPrem + gsisGov + gsisLoans).toFixed(2))
        });
      }

      const hdmfLoans = dedPagibigMpl + dedMp2;
      if (dedPagibig > 0 || hdmfGov > 0 || hdmfLoans > 0) {
        hdmfEmployees.push({
          id: empId,
          name: empName,
          employeeNo: empNo,
          category: empCategory,
          personalShare: Number(dedPagibig.toFixed(2)),
          employerShare: Number(hdmfGov.toFixed(2)),
          loans: Number(hdmfLoans.toFixed(2)),
          total: Number((dedPagibig + hdmfGov + hdmfLoans).toFixed(2))
        });
      }

      if (dedPh > 0 || phGov > 0) {
        philhealthEmployees.push({
          id: empId,
          name: empName,
          employeeNo: empNo,
          category: empCategory,
          personalShare: Number(dedPh.toFixed(2)),
          employerShare: Number(phGov.toFixed(2)),
          loans: 0,
          total: Number((dedPh + phGov).toFixed(2))
        });
      }

      if (dedTax > 0) {
        birEmployees.push({
          id: empId,
          name: empName,
          employeeNo: empNo,
          category: empCategory,
          personalShare: Number(dedTax.toFixed(2)),
          employerShare: 0,
          loans: 0,
          total: Number(dedTax.toFixed(2))
        });
      }

      if (dedCsb > 0) {
        csbEmployees.push({
          id: empId,
          name: empName,
          employeeNo: empNo,
          category: empCategory,
          personalShare: Number(dedCsb.toFixed(2)),
          employerShare: 0,
          loans: Number(dedCsb.toFixed(2)),
          total: Number(dedCsb.toFixed(2))
        });
      }

      if (ecip > 0) {
        ecipEmployees.push({
          id: empId,
          name: empName,
          employeeNo: empNo,
          category: empCategory,
          personalShare: 0,
          employerShare: Number(ecip.toFixed(2)),
          loans: 0,
          total: Number(ecip.toFixed(2))
        });
      }
    });

    // Populate category counts and format byCategory
    const byCategoryList = Object.values(categoryMap).map(cat => {
      cat.count = cat.employeeIds.size;
      return {
        category: cat.name,
        displayName: cat.displayName,
        count: cat.count,
        basicPay: Number(cat.basicPay.toFixed(2)),
        pera: Number(cat.pera.toFixed(2)),
        grossPay: Number(cat.grossPay.toFixed(2)),
        gross: Number(cat.gross.toFixed(2)),
        deductions: Number(cat.deductions.toFixed(2)),
        netPay: Number(cat.netPay.toFixed(2)),
        net: Number(cat.net.toFixed(2)),
        employerShare: Number(cat.employerShare.toFixed(2))
      };
    });

    // Build cycle trends list
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const cyclesTrend = cycles.map(c => {
      const cycleEntries = entries.filter(e => e.cycleId === c.id);
      let cGross = 0;
      let cDeds = 0;
      let cNet = 0;
      let cGov = 0;

      cycleEntries.forEach(e => {
        const basic = Number(e.compSal2nd || e.comp_sal_2nd || e.basicPay || e.basic_pay || 0);
        const pera = Number(e.compPera || e.comp_pera || 0);
        const ot = Number(e.overtime || 0);
        const bonuses = Number(e.bonuses || e.allowances || 0);
        const absences = Number(e.absences || 0);
        let g = Number(e.compGross || e.comp_gross || e.grossPay || e.gross_pay || 0);
        if (g <= 0) g = basic + pera + ot + bonuses - absences;

        const sumD = Number(e.dedGsisPremPersonal || e.ded_gsis_prem_personal || 0) +
                     Number(e.dedPolicyLoan || e.ded_policy_loan || 0) +
                     Number(e.dedConsolLoan || e.ded_consol_loan || 0) +
                     Number(e.dedMpl || e.ded_mpl || 0) +
                     Number(e.dedMplLite || e.ded_mpl_lite || 0) +
                     Number(e.dedCpl || e.ded_cpl || 0) +
                     Number(e.dedGfal || e.ded_gfal || 0) +
                     Number(e.dedEmergencyLoan || e.ded_emergency_loan || 0) +
                     Number(e.dedEducAsst || e.ded_educ_asst || 0) +
                     Number(e.dedPagibigPersonal || e.ded_pagibig_personal || 0) +
                     Number(e.dedPagibigMpl || e.ded_pagibig_mpl || 0) +
                     Number(e.dedPagibigMp2 || e.ded_pagibig_mp2 || 0) +
                     Number(e.dedPhilhealthCont || e.ded_philhealth_cont || 0) +
                     Number(e.dedSss || e.ded_sss || 0) +
                     Number(e.dedCsbLoan || e.ded_csb_loan || 0) +
                     Number(e.dedTaxWithheld || e.ded_tax_withheld || 0);
        const d = sumD > 0 ? sumD : Number(e.totalDeductions || e.total_deductions || 0);
        const n = Number(e.netPay || e.net_pay || 0) > 0 ? Number(e.netPay || e.net_pay) : Math.max(0, g - d);
        const gov = Number(e.govSecGsis || 0) + Number(e.govSecPh || 0) + Number(e.govSecHdmf || 0) + Number(e.govSecEcip || 0);

        cGross += g;
        cDeds += d;
        cNet += n;
        cGov += gov;
      });

      if (cGross === 0 && Number(c.totalGross || 0) > 0) {
        cGross = Number(c.totalGross);
        cDeds = Number(c.totalDeductions);
        cNet = Number(c.totalNet);
      }

      const cycleDate = new Date(c.startDate || c.createdAt || Date.now());
      const mIdx = cycleDate.getMonth();
      const yr = cycleDate.getFullYear();
      const monthKey = `${yr}-${String(mIdx + 1).padStart(2, '0')}`;

      if (!monthlySeriesMap[monthKey]) {
        monthlySeriesMap[monthKey] = {
          monthName: `${monthNames[mIdx]} ${yr}`,
          monthNum: mIdx + 1,
          year: yr,
          Gross: 0,
          Net: 0,
          Deductions: 0,
          EmployerShare: 0,
          Batches: 0
        };
      }
      monthlySeriesMap[monthKey].Gross += cGross;
      monthlySeriesMap[monthKey].Net += cNet;
      monthlySeriesMap[monthKey].Deductions += cDeds;
      monthlySeriesMap[monthKey].EmployerShare += cGov;
      monthlySeriesMap[monthKey].Batches += 1;

      const formatIsoDate = (d: any) => {
        if (!d) return '';
        if (d instanceof Date) return d.toISOString().substring(0, 10);
        return String(d).substring(0, 10);
      };

      return {
        id: c.id,
        name: c.name,
        startDate: formatIsoDate(c.startDate),
        endDate: formatIsoDate(c.endDate),
        status: c.status,
        campus: c.campus || 'Main Campus - Sogod',
        categoryFilter: c.categoryFilter || 'all',
        type: c.type || 'all',
        employeeCount: cycleEntries.length,
        totalGross: Number(cGross.toFixed(2)),
        totalDeductions: Number(cDeds.toFixed(2)),
        totalNet: Number(cNet.toFixed(2)),
        totalEmployerShare: Number(cGov.toFixed(2)),
        createdAt: c.createdAt ? (c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt)) : ''
      };
    });

    // Sort monthly series chronologically
    const monthlySeries = Object.values(monthlySeriesMap).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.monthNum - b.monthNum;
    });

    // GSIS Sub-items
    const gsisLoansTotal = deductionsBreakdown['GSIS Policy Loan'] + deductionsBreakdown['GSIS Consol Loan'] + deductionsBreakdown['GSIS Multipurpose Loan (MPL)'] + deductionsBreakdown['GSIS MPL Lite'] + deductionsBreakdown['GSIS Computer Loan (CPL)'] + deductionsBreakdown['GSIS GFAL Loan'] + deductionsBreakdown['GSIS Emergency Loan'] + deductionsBreakdown['GSIS Educational Assistance'];
    
    // HDMF Sub-items
    const hdmfLoansTotal = deductionsBreakdown['Pag-IBIG Multi-Purpose Loan (MPL)'] + deductionsBreakdown['Pag-IBIG MP2 Savings'];

    // Prepare Statutory Remittances Table with subItems and employee rosters
    const statutoryRemittances = [
      {
        agency: 'GSIS (Government Service Insurance System)',
        accountCode: '414-01',
        description: 'Retirement & Life Insurance Premiums (9% Personal + 12% Gov) and Loan Amortizations',
        personalShare: Number(deductionsBreakdown['GSIS Personal Premium (9%)'].toFixed(2)),
        employerShare: Number(govSharesBreakdown.gsisEmployer.toFixed(2)),
        loans: Number(gsisLoansTotal.toFixed(2)),
        totalPayable: Number((deductionsBreakdown['GSIS Personal Premium (9%)'] + govSharesBreakdown.gsisEmployer + gsisLoansTotal).toFixed(2)),
        status: 'Reconciled & Pending Remittance',
        subItems: [
          { name: 'Retirement & Life Premium (9% Personal)', type: 'Personal Premium', amount: deductionsBreakdown['GSIS Personal Premium (9%)'] },
          { name: 'Government Counterpart Share (12% Gov)', type: 'Employer Share', amount: govSharesBreakdown.gsisEmployer },
          { name: 'Multipurpose Loan (MPL)', type: 'Loan Amortization', amount: deductionsBreakdown['GSIS Multipurpose Loan (MPL)'] },
          { name: 'MPL Lite Loan', type: 'Loan Amortization', amount: deductionsBreakdown['GSIS MPL Lite'] },
          { name: 'Consolidation Loan', type: 'Loan Amortization', amount: deductionsBreakdown['GSIS Consol Loan'] },
          { name: 'Emergency Loan Facility', type: 'Loan Amortization', amount: deductionsBreakdown['GSIS Emergency Loan'] },
          { name: 'Computer Loan (CPL)', type: 'Loan Amortization', amount: deductionsBreakdown['GSIS Computer Loan (CPL)'] },
          { name: 'GFAL Loan', type: 'Loan Amortization', amount: deductionsBreakdown['GSIS GFAL Loan'] },
          { name: 'Policy / Educational Loan', type: 'Loan Amortization', amount: deductionsBreakdown['GSIS Policy Loan'] + deductionsBreakdown['GSIS Educational Assistance'] }
        ].filter(s => s.amount > 0),
        employees: gsisEmployees
      },
      {
        agency: 'HDMF (Pag-IBIG Fund)',
        accountCode: '414-02',
        description: 'Mandatory Savings (2% Personal + Gov Share) & Loans / MP2',
        personalShare: Number(deductionsBreakdown['Pag-IBIG Personal Regular (2%)'].toFixed(2)),
        employerShare: Number(govSharesBreakdown.hdmfEmployer.toFixed(2)),
        loans: Number(hdmfLoansTotal.toFixed(2)),
        totalPayable: Number((deductionsBreakdown['Pag-IBIG Personal Regular (2%)'] + govSharesBreakdown.hdmfEmployer + hdmfLoansTotal).toFixed(2)),
        status: 'Reconciled & Pending Remittance',
        subItems: [
          { name: 'Mandatory Regular Savings (2% Employee)', type: 'Personal Savings', amount: deductionsBreakdown['Pag-IBIG Personal Regular (2%)'] },
          { name: 'Employer Counterpart Contribution', type: 'Employer Share', amount: govSharesBreakdown.hdmfEmployer },
          { name: 'Multi-Purpose Loan (MPL)', type: 'Loan Amortization', amount: deductionsBreakdown['Pag-IBIG Multi-Purpose Loan (MPL)'] },
          { name: 'Modified Pag-IBIG II (MP2) Voluntary', type: 'Voluntary Savings', amount: deductionsBreakdown['Pag-IBIG MP2 Savings'] }
        ].filter(s => s.amount > 0),
        employees: hdmfEmployees
      },
      {
        agency: 'PhilHealth (Philippine Health Insurance Corp.)',
        accountCode: '414-03',
        description: 'National Health Insurance Program (2.5% Personal + 2.5% Gov)',
        personalShare: Number(deductionsBreakdown['PhilHealth Contribution (2.5%)'].toFixed(2)),
        employerShare: Number(govSharesBreakdown.philhealthEmployer.toFixed(2)),
        loans: 0,
        totalPayable: Number((deductionsBreakdown['PhilHealth Contribution (2.5%)'] + govSharesBreakdown.philhealthEmployer).toFixed(2)),
        status: 'Reconciled & Pending Remittance',
        subItems: [
          { name: 'NHIP Personal Contribution (2.5%)', type: 'Personal Premium', amount: deductionsBreakdown['PhilHealth Contribution (2.5%)'] },
          { name: 'NHIP Employer Counterpart (2.5%)', type: 'Employer Share', amount: govSharesBreakdown.philhealthEmployer }
        ].filter(s => s.amount > 0),
        employees: philhealthEmployees
      },
      {
        agency: 'BIR (Bureau of Internal Revenue)',
        accountCode: '412-01',
        description: 'Expanded Withholding Tax on Compensation Income',
        personalShare: Number(deductionsBreakdown['BIR Withholding Tax'].toFixed(2)),
        employerShare: 0,
        loans: 0,
        totalPayable: Number(deductionsBreakdown['BIR Withholding Tax'].toFixed(2)),
        status: 'Reconciled & Pending Remittance',
        subItems: [
          { name: 'TRAIN Law Compensation Withholding Tax', type: 'Income Tax', amount: deductionsBreakdown['BIR Withholding Tax'] }
        ].filter(s => s.amount > 0),
        employees: birEmployees
      },
      {
        agency: 'China Bank Savings (CSB)',
        accountCode: '419-01',
        description: 'Payroll Salary Loan Amortizations & Financial Facilities',
        personalShare: Number(deductionsBreakdown['China Bank Savings Loan (CSB)'].toFixed(2)),
        employerShare: 0,
        loans: Number(deductionsBreakdown['China Bank Savings Loan (CSB)'].toFixed(2)),
        totalPayable: Number(deductionsBreakdown['China Bank Savings Loan (CSB)'].toFixed(2)),
        status: 'Reconciled & Pending Remittance',
        subItems: [
          { name: 'Institutional Salary Loan Deduction', type: 'Bank Amortization', amount: deductionsBreakdown['China Bank Savings Loan (CSB)'] }
        ].filter(s => s.amount > 0),
        employees: csbEmployees
      },
      {
        agency: 'ECIP (Employees Compensation Insurance Premium)',
        accountCode: '414-04',
        description: 'State Insurance Fund Work Contingency & Disability Coverage',
        personalShare: 0,
        employerShare: Number(govSharesBreakdown.ecip.toFixed(2)),
        loans: 0,
        totalPayable: Number(govSharesBreakdown.ecip.toFixed(2)),
        status: 'Reconciled & Pending Remittance',
        subItems: [
          { name: 'ECIP Government Coverage Premium', type: 'Employer Insurance', amount: govSharesBreakdown.ecip }
        ].filter(s => s.amount > 0),
        employees: ecipEmployees
      }
    ];

    const categoryDistribution = byCategoryList.filter(cat => cat.gross > 0 || cat.count > 0);
    const campusDistribution = Object.values(campusMap).sort((a, b) => b.gross - a.gross);

    res.json({
      summary: {
        totalGross: Number(totalGross.toFixed(2)),
        totalDeductions: Number(totalDeductions.toFixed(2)),
        totalNet: Number(totalNet.toFixed(2)),
        totalEmployerShare: Number(totalEmployerShare.toFixed(2)),
        totalExpenditure: Number((totalGross + totalEmployerShare).toFixed(2)),
        totalBatches: cycles.length,
        totalPersonnelCount: uniqueEmployees.size || entries.length,
        averageNetPay: uniqueEmployees.size > 0 ? Number((totalNet / uniqueEmployees.size).toFixed(2)) : 0,
      },
      earningsBreakdown: {
        basicPay: Number(totalBasicPay.toFixed(2)),
        pera: Number(totalPera.toFixed(2)),
        overtime: Number(totalOvertime.toFixed(2)),
        honoraria: Number(totalHonoraria.toFixed(2)),
        bonuses: Number(totalBonuses.toFixed(2)),
        absences: Number(totalAbsences.toFixed(2)),
        totalGross: Number(totalGross.toFixed(2)),
        byCategory: categoryDistribution,
        employees: rosterEmployees
      },
      deductionsBreakdown,
      employerContributions: govSharesBreakdown,
      statutoryRemittances,
      categoryDistribution,
      campusDistribution,
      monthlySeries,
      cyclesTrend,
      availableCampuses: [
        'Main Campus - Sogod',
        'Hinunangan Campus',
        'Bontoc Campus',
        'Tomas Oppus Campus',
        'San Juan Campus',
        'Maasin City Campus'
      ],
      availableYears: [2026, 2025, 2024],
    });
  } catch (err: any) {
    console.error("[Reports] Error in GET /reports/financial:", err);
    res.status(500).json({ error: err.message });
  }
});

// Analytics Dashboard
reportsRouter.get("/analytics", async (req: any, res: any) => {
  try {
    const userRole = req.headers['x-user-role'] || req.headers['user-role'];
    const userCampus = req.headers['x-user-campus'] || req.headers['user-campus'];

    let empQuery = "SELECT COUNT(*) as count FROM employees WHERE status = 'active'";
    let cycleQuery = "SELECT COUNT(*) as count FROM payroll_cycles";
    let params: any[] = [];

    if (userRole === 'accountant' && userCampus && userCampus !== 'All Campuses') {
      empQuery += " AND (campus = ? OR campus IS NULL OR campus = '')";
      cycleQuery += " AND (campus = ? OR campus IS NULL OR campus = '')";
      params.push(userCampus);
    }

    const totalEmployees = await db.prepare(empQuery).get(...params);
    const totalCycles = await db.prepare(cycleQuery).get(...params);
    const totalDisbursed = await db.prepare('SELECT COALESCE(SUM("totalNet"), 0) as "sumNet" FROM payroll_cycles WHERE status = \'disbursed\'').get() as any;

    const categoryBreakdown = await db.prepare("SELECT category, COUNT(*) as count FROM employees GROUP BY category").all();
    const campusBreakdown = await db.prepare("SELECT campus, COUNT(*) as count FROM employees GROUP BY campus").all();

    res.json({
      totalEmployees: Number(totalEmployees?.count || 0),
      totalCycles: Number(totalCycles?.count || 0),
      totalDisbursed: Number(totalDisbursed?.sumNet ?? totalDisbursed?.sumnet ?? 0),
      categoryBreakdown: categoryBreakdown || [],
      campusBreakdown: campusBreakdown || []
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// History Endpoint
reportsRouter.get("/history", async (req: any, res: any) => {
  try {
    const events: any[] = [];

    // 1. Audit Logs
    try {
      const logs = await db.prepare("SELECT * FROM audit_logs ORDER BY createdAt DESC LIMIT 100").all();
      if (Array.isArray(logs)) {
        logs.forEach((log: any) => {
          let type: 'employee' | 'payroll' | 'deduction' = 'payroll';
          const actionLower = (log.action || '').toLowerCase();
          const detailsLower = (log.details || '').toLowerCase();
          
          if (actionLower.includes('employee') || detailsLower.includes('employee') || actionLower.includes('hire') || actionLower.includes('category')) {
            type = 'employee';
          } else if (actionLower.includes('deduct') || detailsLower.includes('deduct')) {
            type = 'deduction';
          }

          events.push({
            id: `audit-${log.id}`,
            type,
            title: `${log.action?.replace(/_/g, ' ') || 'Activity'}: ${log.details || 'System event recorded'}`,
            date: log.createdAt || new Date().toISOString()
          });
        });
      }
    } catch (e) {
      console.warn("Could not query audit_logs for history:", e);
    }

    // 2. Payroll Records / Cycles
    try {
      const records = await db.prepare("SELECT * FROM payroll_records ORDER BY year DESC, month DESC LIMIT 50").all();
      if (Array.isArray(records)) {
        records.forEach((rec: any) => {
          events.push({
            id: `payrec-${rec.id}`,
            type: 'payroll',
            title: `Payroll Record: ${rec.title || `${rec.monthName} ${rec.year}`}`,
            date: rec.createdAt || new Date().toISOString(),
            amount: Number(rec.totalNet || rec.totalGross || 0)
          });
        });
      }
    } catch (e) {
      console.warn("Could not query payroll_records for history:", e);
    }

    // 3. Deduction Records
    try {
      const dedRecords = await db.prepare("SELECT * FROM deduction_records ORDER BY year DESC, month DESC LIMIT 50").all();
      if (Array.isArray(dedRecords)) {
        dedRecords.forEach((d: any) => {
          events.push({
            id: `dedrec-${d.id}`,
            type: 'deduction',
            title: `Deduction File: ${d.title || `${d.monthName} ${d.year}`}`,
            date: d.createdAt || new Date().toISOString(),
            amount: Number(d.totalDeductions || 0)
          });
        });
      }
    } catch (e) {
      console.warn("Could not query deduction_records for history:", e);
    }

    // Sort all events by date descending
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json(events);
  } catch (err: any) {
    console.error("Error in /history endpoint:", err);
    res.status(500).json({ error: err.message });
  }
});

// Audit Logs
reportsRouter.get("/audit-logs", async (req: any, res: any) => {
  try {
    const logs = await db.prepare("SELECT * FROM audit_logs ORDER BY createdAt DESC LIMIT 200").all();
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reportsRouter.post("/audit-logs", async (req: any, res: any) => {
  try {
    const { action, detail } = req.body;
    await logAudit(req, action || "CUSTOM_ACTION", detail || "");
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reportsRouter.delete("/audit-logs", async (req: any, res: any) => {
  try {
    await db.prepare("DELETE FROM audit_logs").run();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// SMS Endpoints
reportsRouter.post("/send-sms", async (req: any, res: any) => {
  try {
    const { employeeId, phoneNumber, message } = req.body;
    const result = await sendSmsNotification(req, employeeId, phoneNumber, message);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reportsRouter.get("/sms-logs", async (req: any, res: any) => {
  try {
    const logs = await getSmsLogs();
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reportsRouter.get("/my-sms-logs", async (req: any, res: any) => {
  try {
    const userId = req.headers['x-user-id'] || req.headers['user-id'];
    const logs = await getSmsLogs(userId);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Employee Portal Payslips
reportsRouter.get("/my-payslips", async (req: any, res: any) => {
  try {
    const userId = req.headers['x-user-id'] || req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    let payslips: any[] = [];
    try {
      payslips = await db.prepare(`
        SELECT pe.*, pc.name as cycleName, pc.startDate, pc.endDate, pc.status as cycleStatus, pc.type as cycleType, pc.campus as cycleCampus
        FROM payroll_entries pe
        JOIN payroll_cycles pc ON pe.cycleId = pc.id
        WHERE pe.employeeId = ?
        ORDER BY pc.createdAt DESC
      `).all(userId);
    } catch {
      try {
        payslips = await db.prepare(`
          SELECT pe.*, pc.name as cycleName, pc.startDate, pc.endDate, pc.status as cycleStatus, pc.type as cycleType, pc.campus as cycleCampus
          FROM payroll_entries pe
          JOIN payroll_cycles pc ON pe.cycleId = pc.id
          WHERE pe.employeeId = ?
          ORDER BY pc.created_at DESC
        `).all(userId);
      } catch {
        payslips = await db.prepare(`
          SELECT pe.*, pc.name as cycleName, pc.startDate, pc.endDate, pc.status as cycleStatus, pc.type as cycleType, pc.campus as cycleCampus
          FROM payroll_entries pe
          JOIN payroll_cycles pc ON pe.cycleId = pc.id
          WHERE pe.employeeId = ?
          ORDER BY pc.id DESC
        `).all(userId);
      }
    }

    res.json(payslips);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reportsRouter.get("/my-historical-payslips", async (req: any, res: any) => {
  try {
    const userId = req.headers['x-user-id'] || req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const allRecords = await db.prepare("SELECT * FROM payroll_records ORDER BY year DESC, month DESC").all() as any[];
    const matchedPayslips: any[] = [];

    for (const record of allRecords) {
      if (record.recordDataJson) {
        try {
          const entries = JSON.parse(record.recordDataJson);
          const userEntry = entries.find((e: any) => e.employeeId === userId);
          if (userEntry) {
            matchedPayslips.push({
              ...userEntry,
              recordTitle: record.title,
              year: record.year,
              month: record.month,
              monthName: record.monthName
            });
          }
        } catch (e) {}
      }
    }

    res.json(matchedPayslips);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
