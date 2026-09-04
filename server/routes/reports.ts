import { Router } from "express";
import { db, logAudit } from "../db/schema.js";
import { sendSmsNotification, getSmsLogs } from "../services/smsService.js";

export const reportsRouter = Router();

// Financial Report & Analytics Aggregator
reportsRouter.get("/reports/financial", async (req: any, res: any) => {
  try {
    const { year, month, campus, category, status } = req.query;

    // 1. Fetch Payroll Cycles
    let cyclesQuery = "SELECT * FROM payroll_cycles WHERE 1=1";
    const cyclesParams: any[] = [];

    if (campus && campus !== 'all' && campus !== 'All Campuses') {
      cyclesQuery += " AND (campus = ? OR campus IS NULL OR campus = '')";
      cyclesParams.push(campus);
    }
    if (status && status !== 'all' && status !== 'All Statuses') {
      cyclesQuery += " AND status = ?";
      cyclesParams.push(status);
    }

    cyclesQuery += " ORDER BY createdAt DESC, id DESC";
    let cycles: any[] = [];
    try {
      cycles = await db.prepare(cyclesQuery).all(...cyclesParams) as any[];
    } catch {
      try {
        cycles = await db.prepare("SELECT * FROM payroll_cycles ORDER BY id DESC").all() as any[];
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
          SELECT pe.*, e.employeeId as employeeNo, e.category, e.position, e.campus, e.departmentId
          FROM payroll_entries pe
          LEFT JOIN employees e ON pe.employeeId = e.id
          WHERE pe.cycleId IN (${placeholders})
        `).all(...cycleIds) as any[];
      } catch {
        entries = [];
      }
    }

    // Filter entries by category if provided
    if (category && category !== 'all' && category !== 'All Categories') {
      entries = entries.filter(e => (e.category || '').toLowerCase() === category.toLowerCase());
    }

    // Also fetch historical payroll records for completeness
    let records: any[] = [];
    try {
      let recQuery = "SELECT * FROM payroll_records WHERE 1=1";
      const recParams: any[] = [];
      if (year && year !== 'all') {
        recQuery += " AND year = ?";
        recParams.push(Number(year));
      }
      if (month && month !== 'all') {
        recQuery += " AND month = ?";
        recParams.push(Number(month));
      }
      if (campus && campus !== 'all' && campus !== 'All Campuses') {
        recQuery += " AND (campus = ? OR campus IS NULL OR campus = '')";
        recParams.push(campus);
      }
      recQuery += " ORDER BY year DESC, month DESC";
      records = await db.prepare(recQuery).all(...recParams) as any[];
    } catch {
      records = [];
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

    const categoryMap: { [cat: string]: { name: string; gross: number; net: number; deductions: number; employerShare: number; count: number; employeeIds: Set<string> } } = {
      'FACULTY': { name: 'Regular Faculty', gross: 0, net: 0, deductions: 0, employerShare: 0, count: 0, employeeIds: new Set() },
      'STAFF': { name: 'Regular Staff', gross: 0, net: 0, deductions: 0, employerShare: 0, count: 0, employeeIds: new Set() },
      'Job Order': { name: 'Job Order', gross: 0, net: 0, deductions: 0, employerShare: 0, count: 0, employeeIds: new Set() },
      'Visiting Instructor': { name: 'Visiting Instructor', gross: 0, net: 0, deductions: 0, employerShare: 0, count: 0, employeeIds: new Set() },
    };

    const campusMap: { [cName: string]: { campus: string; gross: number; net: number; deductions: number; employerShare: number; count: number } } = {};
    const monthlySeriesMap: { [monthKey: string]: { monthName: string; monthNum: number; year: number; Gross: number; Net: number; Deductions: number; EmployerShare: number; Batches: number } } = {};

    const uniqueEmployees = new Set<string>();

    // Process entries
    entries.forEach(entry => {
      uniqueEmployees.add(entry.employeeId);

      const basic = Number(entry.compSal2nd || entry.basicPay || 0);
      const pera = Number(entry.compPera || 0);
      const ot = Number(entry.overtime || 0);
      const teaching = Number(entry.teachingHoursWorked || 0) * Number(entry.hourlyRate || 0);
      const bonuses = Number(entry.bonuses || entry.allowances || 0);
      const absences = Number(entry.absences || 0);
      const gross = Number(entry.compGross || entry.grossPay || (basic + pera + ot + bonuses - absences));

      totalBasicPay += basic;
      totalPera += pera;
      totalOvertime += ot;
      totalHonoraria += teaching;
      totalBonuses += bonuses;
      totalAbsences += absences;

      // Extract detailed deductions
      const dedGsisPrem = Number(entry.dedGsisPremPersonal || 0);
      const dedPolicyLoan = Number(entry.dedPolicyLoan || 0);
      const dedConsolLoan = Number(entry.dedConsolLoan || 0);
      const dedMpl = Number(entry.dedMpl || 0);
      const dedMplLite = Number(entry.dedMplLite || 0);
      const dedCpl = Number(entry.dedCpl || 0);
      const dedGfal = Number(entry.dedGfal || 0);
      const dedEmerg = Number(entry.dedEmergencyLoan || 0);
      const dedEduc = Number(entry.dedEducAsst || 0);
      const dedPagibig = Number(entry.dedPagibigPersonal || 0);
      const dedPagibigMpl = Number(entry.dedPagibigMpl || 0);
      const dedMp2 = Number(entry.dedPagibigMp2 || 0);
      const dedPh = Number(entry.dedPhilhealthCont || 0);
      const dedSss = Number(entry.dedSss || 0);
      const dedCsb = Number(entry.dedCsbLoan || 0);
      const dedTax = Number(entry.dedTaxWithheld || 0);

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
      if (entry.deductions) {
        try {
          const parsed = typeof entry.deductions === 'string' ? JSON.parse(entry.deductions) : entry.deductions;
          if (parsed && typeof parsed === 'object') {
            Object.entries(parsed).forEach(([k, v]) => {
              if (!k.startsWith('ded') && typeof v === 'number' && v > 0) {
                customDedsSum += v;
              }
            });
          }
        } catch (e) {}
      }
      deductionsBreakdown['Other Custom Deductions'] += customDedsSum;

      const sumDeds = dedGsisPrem + dedPolicyLoan + dedConsolLoan + dedMpl + dedMplLite + dedCpl + dedGfal + dedEmerg + dedEduc + dedPagibig + dedPagibigMpl + dedMp2 + dedPh + dedSss + dedCsb + dedTax + customDedsSum;
      const entryTotalDed = Number(entry.totalDeductions || sumDeds);
      const net = Number(entry.netPay || Math.max(0, gross - entryTotalDed));

      totalGross += gross;
      totalDeductions += entryTotalDed;
      totalNet += net;

      // Employer / Gov contributions
      const gsisGov = Number(entry.govSecGsis || (entry.category === 'FACULTY' || entry.category === 'STAFF' ? basic * 0.12 : 0));
      const phGov = Number(entry.govSecPh || (entry.category === 'FACULTY' || entry.category === 'STAFF' ? basic * 0.025 : 0));
      const hdmfGov = Number(entry.govSecHdmf || (entry.category === 'FACULTY' || entry.category === 'STAFF' ? 100 : 0));
      const ecip = Number(entry.govSecEcip || (entry.category === 'FACULTY' || entry.category === 'STAFF' ? 100 : 0));
      const entryGovTotal = gsisGov + phGov + hdmfGov + ecip;

      govSharesBreakdown.gsisEmployer += gsisGov;
      govSharesBreakdown.philhealthEmployer += phGov;
      govSharesBreakdown.hdmfEmployer += hdmfGov;
      govSharesBreakdown.ecip += ecip;
      govSharesBreakdown.total += entryGovTotal;
      totalEmployerShare += entryGovTotal;

      // Category grouping
      const catKey = entry.category || 'STAFF';
      if (!categoryMap[catKey]) {
        categoryMap[catKey] = { name: catKey, gross: 0, net: 0, deductions: 0, employerShare: 0, count: 0, employeeIds: new Set() };
      }
      categoryMap[catKey].gross += gross;
      categoryMap[catKey].net += net;
      categoryMap[catKey].deductions += entryTotalDed;
      categoryMap[catKey].employerShare += entryGovTotal;
      categoryMap[catKey].employeeIds.add(entry.employeeId);

      // Campus grouping
      const cmp = entry.campus || 'Main Campus - Sogod';
      if (!campusMap[cmp]) {
        campusMap[cmp] = { campus: cmp, gross: 0, net: 0, deductions: 0, employerShare: 0, count: 0 };
      }
      campusMap[cmp].gross += gross;
      campusMap[cmp].net += net;
      campusMap[cmp].deductions += entryTotalDed;
      campusMap[cmp].employerShare += entryGovTotal;
      campusMap[cmp].count += 1;
    });

    // Populate category counts from unique employees
    Object.values(categoryMap).forEach(cat => {
      cat.count = cat.employeeIds.size;
    });

    // Build cycle trends list
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const fullMonthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const cyclesTrend = cycles.map(c => {
      const cycleEntries = entries.filter(e => e.cycleId === c.id);
      let cGross = cycleEntries.reduce((sum, e) => sum + Number(e.compGross || e.grossPay || 0), 0);
      let cDeds = cycleEntries.reduce((sum, e) => sum + Number(e.totalDeductions || 0), 0);
      let cNet = cycleEntries.reduce((sum, e) => sum + Number(e.netPay || 0), 0);
      let cGov = cycleEntries.reduce((sum, e) => sum + Number(e.govSecGsis || 0) + Number(e.govSecPh || 0) + Number(e.govSecHdmf || 0) + Number(e.govSecEcip || 0), 0);

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

      return {
        id: c.id,
        name: c.name,
        startDate: c.startDate || '',
        endDate: c.endDate || '',
        status: c.status,
        campus: c.campus || 'All Campuses',
        categoryFilter: c.categoryFilter || 'all',
        type: c.type || 'all',
        employeeCount: cycleEntries.length,
        totalGross: Number(cGross.toFixed(2)),
        totalDeductions: Number(cDeds.toFixed(2)),
        totalNet: Number(cNet.toFixed(2)),
        totalEmployerShare: Number(cGov.toFixed(2)),
        createdAt: c.createdAt || c.created_at || ''
      };
    });

    // If no cycle entries were found, fallback onto records
    if (entries.length === 0 && records.length > 0) {
      records.forEach(rec => {
        const rGross = Number(rec.totalGross || 0);
        const rDeds = Number(rec.totalDeductions || 0);
        const rNet = Number(rec.totalNet || 0);
        const rGov = Number(rec.totalEmployerContrib || 0);

        totalGross += rGross;
        totalDeductions += rDeds;
        totalNet += rNet;
        totalEmployerShare += rGov;

        const mName = rec.monthName || monthNames[(rec.month || 1) - 1] || 'Month';
        const monthKey = `${rec.year}-${String(rec.month || 1).padStart(2, '0')}`;
        if (!monthlySeriesMap[monthKey]) {
          monthlySeriesMap[monthKey] = {
            monthName: `${mName} ${rec.year}`,
            monthNum: rec.month || 1,
            year: rec.year,
            Gross: 0,
            Net: 0,
            Deductions: 0,
            EmployerShare: 0,
            Batches: 0
          };
        }
        monthlySeriesMap[monthKey].Gross += rGross;
        monthlySeriesMap[monthKey].Net += rNet;
        monthlySeriesMap[monthKey].Deductions += rDeds;
        monthlySeriesMap[monthKey].EmployerShare += rGov;
        monthlySeriesMap[monthKey].Batches += 1;
      });
    }

    // Sort monthly series chronologically
    const monthlySeries = Object.values(monthlySeriesMap).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.monthNum - b.monthNum;
    });

    // Prepare Statutory Remittances Table
    const statutoryRemittances = [
      {
        agency: 'GSIS (Government Service Insurance System)',
        accountCode: '414-01',
        description: 'Retirement & Life Insurance Premiums (9% Personal + 12% Gov)',
        personalShare: deductionsBreakdown['GSIS Personal Premium (9%)'],
        employerShare: govSharesBreakdown.gsisEmployer,
        loans: deductionsBreakdown['GSIS Policy Loan'] + deductionsBreakdown['GSIS Consol Loan'] + deductionsBreakdown['GSIS Multipurpose Loan (MPL)'] + deductionsBreakdown['GSIS MPL Lite'] + deductionsBreakdown['GSIS Computer Loan (CPL)'] + deductionsBreakdown['GSIS GFAL Loan'] + deductionsBreakdown['GSIS Emergency Loan'] + deductionsBreakdown['GSIS Educational Assistance'],
        totalPayable: deductionsBreakdown['GSIS Personal Premium (9%)'] + govSharesBreakdown.gsisEmployer + (deductionsBreakdown['GSIS Policy Loan'] + deductionsBreakdown['GSIS Consol Loan'] + deductionsBreakdown['GSIS Multipurpose Loan (MPL)'] + deductionsBreakdown['GSIS MPL Lite'] + deductionsBreakdown['GSIS Computer Loan (CPL)'] + deductionsBreakdown['GSIS GFAL Loan'] + deductionsBreakdown['GSIS Emergency Loan'] + deductionsBreakdown['GSIS Educational Assistance']),
        status: 'Reconciled & Pending Remittance'
      },
      {
        agency: 'HDMF (Pag-IBIG Fund)',
        accountCode: '414-02',
        description: 'Mandatory Savings (2% Personal + Gov Share) & Loans / MP2',
        personalShare: deductionsBreakdown['Pag-IBIG Personal Regular (2%)'],
        employerShare: govSharesBreakdown.hdmfEmployer,
        loans: deductionsBreakdown['Pag-IBIG Multi-Purpose Loan (MPL)'] + deductionsBreakdown['Pag-IBIG MP2 Savings'],
        totalPayable: deductionsBreakdown['Pag-IBIG Personal Regular (2%)'] + govSharesBreakdown.hdmfEmployer + deductionsBreakdown['Pag-IBIG Multi-Purpose Loan (MPL)'] + deductionsBreakdown['Pag-IBIG MP2 Savings'],
        status: 'Reconciled & Pending Remittance'
      },
      {
        agency: 'PhilHealth (Philippine Health Insurance Corp.)',
        accountCode: '414-03',
        description: 'National Health Insurance Program (2.5% Personal + 2.5% Gov)',
        personalShare: deductionsBreakdown['PhilHealth Contribution (2.5%)'],
        employerShare: govSharesBreakdown.philhealthEmployer,
        loans: 0,
        totalPayable: deductionsBreakdown['PhilHealth Contribution (2.5%)'] + govSharesBreakdown.philhealthEmployer,
        status: 'Reconciled & Pending Remittance'
      },
      {
        agency: 'BIR (Bureau of Internal Revenue)',
        accountCode: '412-01',
        description: 'Expanded Withholding Tax on Compensation Income',
        personalShare: deductionsBreakdown['BIR Withholding Tax'],
        employerShare: 0,
        loans: 0,
        totalPayable: deductionsBreakdown['BIR Withholding Tax'],
        status: 'Reconciled & Pending Remittance'
      },
      {
        agency: 'China Bank Savings (CSB)',
        accountCode: '419-01',
        description: 'Payroll Salary Loan Amortizations & Financial Facilities',
        personalShare: deductionsBreakdown['China Bank Savings Loan (CSB)'],
        employerShare: 0,
        loans: deductionsBreakdown['China Bank Savings Loan (CSB)'],
        totalPayable: deductionsBreakdown['China Bank Savings Loan (CSB)'],
        status: 'Reconciled & Pending Remittance'
      },
      {
        agency: 'ECIP (Employees Compensation Insurance Premium)',
        accountCode: '414-04',
        description: 'State Insurance Fund Work Contingency & Disability Coverage',
        personalShare: 0,
        employerShare: govSharesBreakdown.ecip,
        loans: 0,
        totalPayable: govSharesBreakdown.ecip,
        status: 'Reconciled & Pending Remittance'
      }
    ];

    const categoryDistribution = Object.values(categoryMap).filter(cat => cat.gross > 0 || cat.count > 0);
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
        totalGross: Number(totalGross.toFixed(2))
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
