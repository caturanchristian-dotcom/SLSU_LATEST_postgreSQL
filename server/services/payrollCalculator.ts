import { db, MONTH_NAMES_LIST } from "../db/schema.js";

export const DEDUCTION_KEY_MAP: { [key: string]: { typeName: string; aliases: string[] } } = {
  dedPolicyLoan: { typeName: "Policy Loan", aliases: ['policyloan', 'policy loan', 'gsis policy loan', 'policy_loan', 'dedpolicyloan', 'policy loan amortization'] },
  dedConsolLoan: { typeName: "Consol Loan", aliases: ['consoloan', 'consol loan', 'consolidation loan', 'conso loan', 'consolidation', 'gsis consol loan', 'dedconsoloan', 'consolloan', 'conso'] },
  dedEmergencyLoan: { typeName: "Emergency Loan", aliases: ['emrgyln', 'gsis emergency loan', 'emergency loan', 'emrgy ln', 'emrgy_ln', 'emergency_loan', 'dedemergencyloan', 'emrgy loan', 'emrgy'] },
  dedGfal: { typeName: "GFAL", aliases: ['gfal', 'gsis financial assistance loan', 'gsis financial assistance', 'gfal loan', 'dedgfal', 'gsis gfal'] },
  dedMpl: { typeName: "Multipurpose Loan", aliases: ['mpl', 'multipurpose loan', 'multi purpose loan', 'multi-purpose loan', 'mpl loan', 'dedmpl', 'gsis multipurpose loan', 'gsis mpl', 'gsis multi-purpose loan'] },
  dedCpl: { typeName: "Computer Purchase Loan", aliases: ['cpl', 'computer purchase loan', 'computer loan', 'cpl loan', 'dedcpl', 'gsis computer loan', 'cpl_loan', 'gsis cpl'] },
  dedMplLite: { typeName: "MPL Lite", aliases: ['mpllite', 'mpl_lite', 'mpl-lite', 'mpl_lite rlp', 'mplliterlp', 'mpl lite', 'multi-purpose loan lite', 'dedmpllite', 'mpl_lite_rlp', 'gsis mpl lite'] },
  dedEducAsst: { typeName: "Educational Assistance", aliases: ['educasst', 'educ_asst', 'educational assistance', 'educational assistance loan', 'educ asst', 'dededucasst', 'gsis educational assistance', 'gsis educ asst'] },
  dedGsisPremPersonal: { typeName: "GSIS Personal Premium", aliases: ['gsisprem', 'gsispersonal', 'gsisprempersonal', 'gsisEE', 'gsis personal', 'gsis contribution', 'gsis premium', 'gsis ee', 'dedgsisprempersonal', 'gsis prem personal', 'gsis personal share', 'gsis_prem', 'gsis personal premium', 'gsis regular'] },
  dedPagibigPersonal: { typeName: "Pag-ibig Personal Contribution", aliases: ['pagibigprem', 'pagibigpersonal', 'pagibigpersonalee', 'pagibigregular', 'pagibigee', 'hdmfpersonal', 'hdmfpersonalee', 'hdmfee', 'pagibig regular', 'pagibig personal', 'pagibig contribution', 'pagibig premium', 'pagibig ee', 'hdmf personal', 'hdmf contribution', 'hdmf ee', 'dedpagibigpersonal', 'pag-ibig personal', 'pag-ibig ee', 'pag-ibig regular', 'pagibig_prem', 'hdmf premium', 'pag-ibig personal(ee)', 'hdmf prem personal'] },
  dedPagibigMpl: { typeName: "Pag-ibig MPL", aliases: ['pagibigmpl', 'pagibig_mpl', 'hdmf_mpl', 'pag-ibig mpl', 'dedpagibigmpl', 'hdmf mpl', 'hdmf loan', 'hdmf prem mpl', 'hdmf multi purpose', 'pag-ibig multi-purpose loan'] },
  dedSss: { typeName: "SSS Contribution/Loan", aliases: ['sss', 'dedsss', 'sss contribution', 'sss premium', 'sss ee', 'sss_prem', 'sss share', 'sss contrib', 'sss contribution/loan', 'social security'] },
  dedPagibigMp2: { typeName: "Pag-ibig MP2", aliases: ['mp2', 'dedpagibigmp2', 'pagibig mp2', 'pag-ibig mp2', 'mp2 contribution', 'pagibig_mp2', 'hdmf mp2', 'hdmf prem mp2', 'hdmf_mp2'] },
  dedPhilhealthCont: { typeName: "PhilHealth Contribution", aliases: ['philhealth', 'dedphilhealthcont', 'philhealth contribution', 'philhealth premium', 'philhealth ee', 'philhealth cont', 'philhealth_prem', 'ph_prem', 'phee', 'ph ee', 'philhealth ee share', 'philhealth cont.', 'philhealth es cont', 'philhealth es', 'ph contribution'] },
  dedCsbLoan: { typeName: "CSB Loan", aliases: ['csbloan', 'dedcsbloan', 'csb loan', 'csb', 'csbsalloan', 'csb sal loan', 'chinabank savings loan', 'china bank loan', 'china bank', 'csb sal. loan', 'csb salary loan', 'chinabank'] },
  dedTaxWithheld: { typeName: "Withholding Tax", aliases: ['tax', 'dedtaxwithheld', 'withholding tax', 'tax withheld', 'wtax', 'income tax', 'withholding_tax', 'tax_withheld', 'wtax withheld', 'withholding tax(ee)', 'taxwithheld', 'w-tax'] }
};

export async function calculateNetSalary(
  cycleId: string,
  onlyEmployeeId?: string,
  customColumnValues?: any
) {
  try {
    const cycle = await db.prepare("SELECT * FROM payroll_cycles WHERE id = ?").get(cycleId) as any;
    if (!cycle) throw new Error("Cycle not found");

    let entries = await db.prepare("SELECT * FROM payroll_entries WHERE cycleId = ?").all(cycleId) as any[];
    if (onlyEmployeeId) {
      entries = entries.filter((e) => e.employeeId === onlyEmployeeId);
    }

    const employees = await db.prepare("SELECT * FROM employees").all() as any[];
    
    let allDeductions: any[] = [];
    try {
      allDeductions = await db.prepare("SELECT * FROM deductions WHERE status = 'active' OR status IS NULL OR status = ''").all() as any[];
    } catch {
      try {
        allDeductions = await db.prepare("SELECT * FROM deductions").all() as any[];
      } catch (e) {
        console.error("Error loading deductions for payroll calculation:", e);
      }
    }

    let allLoans: any[] = [];
    try {
      allLoans = await db.prepare('SELECT * FROM loans WHERE (status = \'active\' OR status IS NULL OR status = \'\') AND ("remainingBalance" > 0 OR remaining_balance > 0 OR remainingBalance > 0)').all() as any[];
    } catch {
      try {
        allLoans = await db.prepare("SELECT * FROM loans WHERE status = 'active' OR status IS NULL OR status = ''").all() as any[];
      } catch {
        try {
          allLoans = await db.prepare("SELECT * FROM loans").all() as any[];
        } catch (e) {
          console.error("Error loading loans for payroll calculation:", e);
        }
      }
    }

    const allTeachingLoads = await db.prepare("SELECT * FROM teaching_loads").all() as any[];
    const allVisitingRates = await db.prepare("SELECT * FROM visiting_instructors").all() as any[];
    const allSchedules = await db.prepare("SELECT * FROM schedules").all() as any[];
    const allHolidays = await db.prepare("SELECT * FROM holidays").all() as any[];
    const allLeaveApps = await db.prepare("SELECT * FROM leave_applications WHERE status = 'approved'").all() as any[];
    const allDtrRecords = await db.prepare("SELECT * FROM dtr_records").all() as any[];
    const allDtrLogs = await db.prepare("SELECT * FROM dtr_logs").all() as any[];
    const allVisitingDtr = await db.prepare("SELECT * FROM dtr_visiting_records WHERE status != 'rejected'").all() as any[];

    const safeStr = (v: any): string => {
      if (!v) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'object') {
        if (typeof v.toDate === 'function') {
          const d = v.toDate();
          if (d instanceof Date && !isNaN(d.getTime())) return d.toISOString().split('T')[0];
        }
        if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().split('T')[0];
        if (typeof v.seconds === 'number') {
          const d = new Date(v.seconds * 1000);
          if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        }
      }
      return String(v || '');
    };

    const parseLocalDate = (dateStr: any) => {
      if (!dateStr) return new Date();
      if (dateStr instanceof Date) return dateStr;
      const str = safeStr(dateStr);
      const clean = str.split('T')[0];
      const parts = clean.split('-').map(Number);
      if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0);
      }
      return new Date(dateStr);
    };

    const formatLocalYMD = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const empMap: { [key: string]: any } = {};
    for (const emp of employees) {
      empMap[emp.id] = emp;
      if (emp.employeeId) empMap[String(emp.employeeId).toLowerCase()] = emp;
      if (emp.employee_id) empMap[String(emp.employee_id).toLowerCase()] = emp;
      if (emp.bpno) empMap[String(emp.bpno).toLowerCase()] = emp;
    }

    const dedsByEmployee: { [key: string]: any[] } = {};
    for (const ded of allDeductions) {
      const rawEid = String(ded.employeeId || ded.employee_id || ded.employeeid || '').trim().toLowerCase();
      if (rawEid) {
        if (!dedsByEmployee[rawEid]) dedsByEmployee[rawEid] = [];
        dedsByEmployee[rawEid].push(ded);
      }
    }

    const loansByEmployee: { [key: string]: any[] } = {};
    for (const loan of allLoans) {
      const rawEid = String(loan.employeeId || loan.employee_id || loan.employeeid || '').trim().toLowerCase();
      if (rawEid) {
        if (!loansByEmployee[rawEid]) loansByEmployee[rawEid] = [];
        loansByEmployee[rawEid].push(loan);
      }
    }

    const getActiveDedsForEmp = (employee: any, entryEmpId: string) => {
      const dedList: any[] = [];
      const seen = new Set<string>();
      const candidateKeys = [
        entryEmpId,
        employee?.id,
        employee?.employeeId,
        employee?.employee_id,
        employee?.bpno,
        employee?.email
      ].filter(Boolean).map(k => String(k).trim().toLowerCase());

      for (const k of candidateKeys) {
        const matches = dedsByEmployee[k] || [];
        for (const d of matches) {
          const dId = String(d.id || `${d.type || d.type_name}-${d.amount}`);
          if (!seen.has(dId)) {
            seen.add(dId);
            dedList.push(d);
          }
        }
      }
      return dedList;
    };

    const getActiveLoansForEmp = (employee: any, entryEmpId: string) => {
      const loanList: any[] = [];
      const seen = new Set<string>();
      const candidateKeys = [
        entryEmpId,
        employee?.id,
        employee?.employeeId,
        employee?.employee_id,
        employee?.bpno,
        employee?.email
      ].filter(Boolean).map(k => String(k).trim().toLowerCase());

      for (const k of candidateKeys) {
        const matches = loansByEmployee[k] || [];
        for (const l of matches) {
          const lId = String(l.id || `${l.loanType || l.loan_type}-${l.principalAmount || l.principal_amount}`);
          if (!seen.has(lId)) {
            seen.add(lId);
            loanList.push(l);
          }
        }
      }
      return loanList;
    };

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    const updateEntryStmt = await db.prepare(`
      UPDATE payroll_entries SET
        employeeName = ?,
        basicPay = ?,
        teachingHours = ?,
        overtime = ?,
        grossPay = ?,
        deductions_json = ?,
        custom_values_json = ?,
        totalDeductions = ?,
        netPay = ?,
        govSecGsis = ?,
        govSecHdmf = ?,
        govSecPh = ?,
        govSecEcip = ?,
        compSal2nd = ?,
        compPera = ?,
        compGross = ?,
        absences = ?,
        dedPolicyLoan = ?,
        dedConsolLoan = ?,
        dedMplLite = ?,
        dedMpl = ?,
        dedCpl = ?,
        dedGfal = ?,
        dedEmergencyLoan = ?,
        dedGsisPremPersonal = ?,
        dedEducAsst = ?,
        dedPagibigPersonal = ?,
        dedPagibigMpl = ?,
        dedSss = ?,
        dedPagibigMp2 = ?,
        dedPhilhealthCont = ?,
        dedCsbLoan = ?,
        dedTaxWithheld = ?
      WHERE id = ?
    `);

    const isSemiMonthly = cycle.type === 'semi-monthly';

    for (const entry of entries) {
      const emp = empMap[entry.employeeId];
      let existingCustom: any = {};
      if (entry.custom_values_json) {
        try {
          existingCustom = typeof entry.custom_values_json === 'string' ? JSON.parse(entry.custom_values_json) : entry.custom_values_json;
        } catch {
          existingCustom = {};
        }
      }

      const explicitOverride = customColumnValues && customColumnValues[entry.id];
      const custom = explicitOverride 
        ? { ...existingCustom, ...explicitOverride }
        : existingCustom;

      let computedBasicPay = Number(entry.basicPay || (emp ? emp.basicSalary : 0));
      let dynamicAbsences = 0;
      let undertimeDeduction = 0;
      let teachingHoursToUpdate = Number(entry.teachingHours || 0);
      let dtrOvertimeHours = 0;

      const employeeName = emp ? `${emp.lastName ? emp.lastName + ', ' : ''}${emp.firstName || ''} ${emp.mi ? emp.mi + '.' : ''}`.trim() : (entry.employeeName || 'Unknown');

      const isVisiting = emp && (
        String(emp.category || '').toLowerCase().includes('visiting') ||
        String(emp.category || '').toLowerCase().includes('part-time') ||
        String(emp.category || '').toLowerCase().includes('lecturer')
      );

      if (emp) {
        if (isVisiting) {
          const matchVi = allVisitingRates.find((v: any) =>
            v.employeeId === emp.id ||
            v.employeeId === emp.employeeId ||
            v.employee_id === emp.id ||
            v.employee_id === emp.employeeId ||
            v.employeeid === emp.id ||
            v.employeeid === emp.employeeId
          );
          const visitingHourlyRate = Number(matchVi?.hourlyRate || matchVi?.hourly_rate || matchVi?.hourlyrate || 350.00);
          let verifiedHours = 0;
          
          if (cycle.startDate && cycle.endDate) {
            const startD = parseLocalDate(cycle.startDate);
            const endD = parseLocalDate(cycle.endDate);
            const matchingVisitingDtr = allVisitingDtr.filter((vd: any) => {
              if (vd.employeeId !== emp.id && vd.employeeId !== emp.employeeId && vd.employeeId !== emp.email) return false;
              const d = parseLocalDate(vd.date);
              return d >= startD && d <= endD;
            });
            verifiedHours = matchingVisitingDtr.reduce((sum: number, vd: any) => sum + Number(vd.hoursRendered || 0), 0);
          }

          if (verifiedHours === 0) {
            const loads = allTeachingLoads.filter((l: any) => l.employeeId === emp.id || l.employeeId === emp.employeeId);
            const weeklyHours = loads.reduce((sum: number, l: any) => sum + Number(l.hoursPerWeek || 3.0), 0);
            verifiedHours = Number((isSemiMonthly ? weeklyHours * 2 : weeklyHours * 4).toFixed(2));
          }

          teachingHoursToUpdate = verifiedHours;
          computedBasicPay = Number((verifiedHours * visitingHourlyRate).toFixed(2));
        } else {
          const monthlyRate = Number(emp.basicSalary || 0);
          const baseCyclePay = isSemiMonthly ? Number((monthlyRate / 2).toFixed(2)) : monthlyRate;
          computedBasicPay = baseCyclePay;

          if (cycle.startDate && cycle.endDate) {
            const start = parseLocalDate(cycle.startDate);
            const end = parseLocalDate(cycle.endDate);

            const empIdSet = new Set<string>();
            if (emp.id) empIdSet.add(String(emp.id).toLowerCase());
            if (emp.employeeId) empIdSet.add(String(emp.employeeId).toLowerCase());
            if (emp.email) empIdSet.add(String(emp.email).toLowerCase());

            const empDtrs = allDtrRecords.filter((d: any) => {
              if (!d.employeeId) return false;
              return empIdSet.has(String(d.employeeId).toLowerCase());
            });

            const empLogs = (allDtrLogs || []).filter((lg: any) => {
              if (!lg.employeeId) return false;
              return empIdSet.has(String(lg.employeeId).toLowerCase());
            });

            const empLeaves = allLeaveApps.filter((l: any) => {
              if (!l.employeeId) return false;
              return empIdSet.has(String(l.employeeId).toLowerCase());
            });

            let totalScheduledWorkdays = 0;
            let totalAbsenceDays = 0;
            let totalTardinessMinutes = 0;
            let totalUndertimeMinutes = 0;
            const currentDate = new Date(start);

            while (currentDate <= end) {
              const dayOfWeek = currentDate.getDay();
              const dateStr = formatLocalYMD(currentDate);

              const isHoliday = allHolidays.some((h: any) => {
                if (!h.date) return false;
                return safeStr(h.date).split('T')[0] === dateStr;
              });

              const isApprovedLeave = empLeaves.some((l: any) => {
                if (!l.startDate || !l.endDate) return false;
                const lStart = safeStr(l.startDate).split('T')[0];
                const lEnd = safeStr(l.endDate).split('T')[0];
                return dateStr >= lStart && dateStr <= lEnd;
              });

              // Scheduled working days (Mon to Fri = 1 to 5, not a holiday, not on approved leave)
              if (dayOfWeek >= 1 && dayOfWeek <= 5 && !isHoliday && !isApprovedLeave) {
                totalScheduledWorkdays += 1;

                const dayDtr = empDtrs.find((d: any) => d.date && safeStr(d.date).split('T')[0] === dateStr);
                const dayLogs = empLogs.filter((lg: any) => {
                  const rawLDate = lg.timestamp || lg.date;
                  const lDate = safeStr(rawLDate).split('T')[0];
                  return lDate === dateStr;
                });

                if (!dayDtr && dayLogs.length === 0) {
                  // No record in DTR and no punch logs on this scheduled workday -> Absent!
                  totalAbsenceDays += 1;
                } else if (dayDtr) {
                  const isExplicitAbsent = dayDtr.status === 'absent';
                  const hasPunches = Boolean(
                    dayDtr.timeIn || dayDtr.timeOut ||
                    dayDtr.amIn || dayDtr.amOut ||
                    dayDtr.pmIn || dayDtr.pmOut
                  );
                  const hoursWorked = Number(dayDtr.hoursWorked || 0);

                  if (isExplicitAbsent || (!hasPunches && hoursWorked === 0 && dayLogs.length === 0)) {
                    // Marked absent or 0 hours rendered without punch logs
                    totalAbsenceDays += 1;
                  } else {
                    // Present
                    totalTardinessMinutes += Number(dayDtr.lateMinutes || 0);
                    totalUndertimeMinutes += Number(dayDtr.undertimeMinutes || 0);
                    dtrOvertimeHours += Number(dayDtr.overtimeHours || 0);
                  }
                } else {
                  // Has dayLogs but no dayDtr record
                  // Present via logs
                }
              }
              currentDate.setDate(currentDate.getDate() + 1);
            }

            const dailyRate = Number((monthlyRate / 22).toFixed(2));
            const hourlyRate = dailyRate / 8;
            const minuteRate = hourlyRate / 60;

            dynamicAbsences = Number((totalAbsenceDays * dailyRate).toFixed(2));
            if (dynamicAbsences > baseCyclePay) {
              dynamicAbsences = baseCyclePay;
            }

            undertimeDeduction = Number(((totalTardinessMinutes + totalUndertimeMinutes) * minuteRate).toFixed(2));

            // Salaries and Wages-2nd Tranch represents the full regular cycle salary
            computedBasicPay = baseCyclePay;
          }
        }
      }

      // Explicit user override in table cell edit takes priority
      if (explicitOverride && explicitOverride.compSal2nd !== undefined) {
        computedBasicPay = Number(explicitOverride.compSal2nd);
      }

      const compPera = (explicitOverride && explicitOverride.compPera !== undefined) 
        ? Number(explicitOverride.compPera) 
        : (custom.compPera !== undefined ? Number(custom.compPera) : (isVisiting ? 0.00 : 2000.00));
      
      const totalAbsenceDeduction = Number((dynamicAbsences + undertimeDeduction).toFixed(2));
      const absences = (explicitOverride && explicitOverride.absences !== undefined) 
        ? Number(explicitOverride.absences) 
        : totalAbsenceDeduction;

      let otHours = Number(entry.otHours || 0);
      if (otHours === 0 && dtrOvertimeHours > 0) {
        otHours = dtrOvertimeHours;
      }

      let computedOvertime = Number(entry.overtime || 0);
      if (emp && !isVisiting) {
        const monthlySalary = emp.basicSalary || 0;
        const hourlyRate = monthlySalary / (22 * 8);
        computedOvertime = Number((hourlyRate * otHours * 1.25).toFixed(2));
      }

      let gross = Math.max(0, Number((computedBasicPay + compPera - absences + Number(entry.allowances || 0) + computedOvertime + Number(entry.bonuses || 0) + Number(entry.incentives || 0)).toFixed(2)));
      if (explicitOverride && explicitOverride.compGross !== undefined) {
        gross = Number(explicitOverride.compGross);
      }

      const activeDeds = getActiveDedsForEmp(emp, entry.employeeId);
      const activeLoans = getActiveLoansForEmp(emp, entry.employeeId);
      
      const getDbDeduction = (field: string, defaultVal: number = 0.00) => {
        const mappings: { [key: string]: string[] } = {
          dedPolicyLoan: ['policyloan', 'policy loan', 'gsis policy loan', 'policy_loan', 'dedpolicyloan', 'policy'],
          dedConsolLoan: ['consoloan', 'consol loan', 'consolidation loan', 'conso loan', 'consolidation', 'gsis consol loan', 'dedconsoloan', 'consolloan', 'conso'],
          dedMplLite: ['mpllite', 'mpl_lite', 'mpl-lite', 'mpl_lite rlp', 'mplliterlp', 'mpl lite', 'multi-purpose loan lite', 'dedmpllite', 'mpl_lite_rlp', 'lite'],
          dedMpl: ['mpl', 'multipurpose loan', 'multi purpose loan', 'multi-purpose loan', 'mpl loan', 'dedmpl', 'gsis multipurpose loan', 'gsis mpl'],
          dedCpl: ['cpl', 'computer purchase loan', 'computer loan', 'cpl loan', 'dedcpl', 'gsis computer loan', 'cpl_loan', 'gsis cpl'],
          dedGfal: ['gfal', 'gsis financial assistance loan', 'gsis financial assistance', 'gfal loan', 'dedgfal', 'gsis gfal'],
          dedEmergencyLoan: ['emrgyln', 'gsis emergency loan', 'emergency loan', 'emrgy ln', 'emrgy_ln', 'emergency_loan', 'dedemergencyloan', 'emrgy loan', 'emrgy'],
          dedGsisPremPersonal: ['gsisprem', 'gsispersonal', 'gsisprempersonal', 'gsisEE', 'gsis personal', 'gsis contribution', 'gsis premium', 'gsis ee', 'dedgsisprempersonal', 'gsis prem personal', 'gsis personal share', 'gsis_prem', 'gsis personal premium', 'gsis regular', 'gsis'],
          dedEducAsst: ['educasst', 'educ_asst', 'educational assistance', 'educational assistance loan', 'educ asst', 'dededucasst', 'gsis educational assistance', 'gsis educ asst', 'educ'],
          dedPagibigPersonal: ['pagibigprem', 'pagibigpersonal', 'pagibigpersonalee', 'pagibigregular', 'pagibigee', 'hdmfpersonal', 'hdmfpersonalee', 'hdmfee', 'pagibig regular', 'pagibig personal', 'pagibig contribution', 'pagibig premium', 'pagibig ee', 'hdmf personal', 'hdmf contribution', 'hdmf ee', 'dedpagibigpersonal', 'pag-ibig personal', 'pag-ibig ee', 'pag-ibig regular', 'pagibig_prem', 'hdmf premium', 'pag-ibig personal(ee)', 'hdmf prem personal', 'hdmf prem', 'pagibig'],
          dedPagibigMpl: ['pagibigmpl', 'pagibig_mpl', 'hdmf_mpl', 'pag-ibig mpl', 'dedpagibigmpl', 'hdmf mpl', 'hdmf loan', 'hdmf prem mpl', 'hdmf multi purpose'],
          dedSss: ['sss', 'dedsss', 'sss contribution', 'sss premium', 'sss ee', 'sss_prem', 'sss share', 'sss contrib', 'sss contribution/loan', 'social security'],
          dedPagibigMp2: ['mp2', 'dedpagibigmp2', 'pagibig mp2', 'pag-ibig mp2', 'mp2 contribution', 'pagibig_mp2', 'hdmf mp2', 'hdmf prem mp2', 'hdmf_mp2'],
          dedPhilhealthCont: ['philhealth', 'dedphilhealthcont', 'philhealth contribution', 'philhealth premium', 'philhealth ee', 'philhealth cont', 'philhealth_prem', 'ph_prem', 'phee', 'ph ee', 'philhealth ee share', 'philhealth cont.', 'philhealth es cont', 'philhealth es', 'ph contribution'],
          dedCsbLoan: ['csbloan', 'dedcsbloan', 'csb loan', 'csb', 'csbsalloan', 'csb sal loan', 'chinabank savings loan', 'china bank loan', 'china bank', 'csb sal. loan', 'csb salary loan'],
          dedTaxWithheld: ['tax', 'dedtaxwithheld', 'withholding tax', 'tax withheld', 'wtax', 'income tax', 'withholding_tax', 'tax_withheld', 'wtax withheld', 'withholding tax(ee)', 'taxwithheld', 'w-tax']
        };

        const colKeys = mappings[field] || [];
        const normKeys = colKeys.map(k => k.toLowerCase().replace(/[^a-z0-9]/g, ''));

        const matchCandidate = (rawText: string) => {
          const dT = String(rawText || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!dT) return false;
          // Disambiguation
          if (field === 'dedMpl' && (dT.includes('lite') || dT.includes('rlp'))) return false;
          if (field === 'dedPagibigPersonal' && (dT.includes('mpl') || dT.includes('mp2'))) return false;
          if (field === 'dedPagibigMpl' && (dT.includes('mp2') || dT.includes('personal') || dT.includes('regular'))) return false;
          if (field === 'dedPagibigMp2' && (dT.includes('mpl') || dT.includes('personal') || dT.includes('regular'))) return false;

          // Exact match
          if (normKeys.includes(dT)) return true;
          // Substring match
          return normKeys.some(k => dT === k || dT.includes(k) || (k.length >= 4 && dT.includes(k)));
        };

        // 1. Check deductions table
        const matchedDeds = activeDeds.filter(d => {
          return matchCandidate(d.type || d.type_name || d.typeName || d.description || '');
        });
        if (matchedDeds.length > 0) {
          const dedVal = matchedDeds.reduce((sum, d) => sum + Number(d.amount || 0), 0);
          return isSemiMonthly ? Number((dedVal / 2).toFixed(2)) : Number(dedVal.toFixed(2));
        }

        // 2. Check loans table
        const matchedLoans = activeLoans.filter(l => {
          return matchCandidate(l.loanType || l.loan_type || l.notes || l.type || '');
        });
        if (matchedLoans.length > 0) {
          let totalLoanDeduction = 0;
          for (const loan of matchedLoans) {
            const monthlyAmort = Number(loan.monthlyAmortization || loan.monthly_amortization || 0);
            const remBal = Number(loan.remainingBalance || loan.remaining_balance || monthlyAmort);
            const rawAmort = isSemiMonthly ? (monthlyAmort / 2) : monthlyAmort;
            totalLoanDeduction += Math.min(rawAmort, remBal > 0 ? remBal : rawAmort);
          }
          return Number(totalLoanDeduction.toFixed(2));
        }

        return defaultVal;
      };

      const isPhRegular = emp && (
        String(emp.category || '').toUpperCase() === 'FACULTY' || 
        String(emp.category || '').toUpperCase() === 'STAFF' ||
        String(emp.category || '').toLowerCase().includes('regular') ||
        String(emp.category || '').toLowerCase().includes('permanent')
      );
      const isJobOrder = emp && String(emp.category || '').toLowerCase().includes('job order');
      const hasPh = isPhRegular || (isJobOrder && emp.hasPhilhealth);
      const hasHdmf = isPhRegular || (isJobOrder && emp.hasPagibig);

      // Government Share Mandatory Contributions
      const govSecGsis = custom.govSecGsis !== undefined ? Number(custom.govSecGsis) : (isPhRegular ? Number((computedBasicPay * 0.12).toFixed(2)) : 0.00);
      const govSecHdmf = custom.govSecHdmf !== undefined ? Number(custom.govSecHdmf) : (hasHdmf ? (isSemiMonthly ? 100.00 : 200.00) : 0.00);
      const govSecPh = custom.govSecPh !== undefined ? Number(custom.govSecPh) : (hasPh ? Number(((computedBasicPay * 0.05) / 2).toFixed(2)) : 0.00);
      const govSecEcip = custom.govSecEcip !== undefined ? Number(custom.govSecEcip) : (isPhRegular ? (isSemiMonthly ? 50.00 : 100.00) : 0.00);

      const isExplicitOverride = (field: string) => {
        return customColumnValues && customColumnValues[entry.id] && customColumnValues[entry.id][field] !== undefined;
      };

      const getDeductionValue = (field: string, statutoryDefault: number = 0.00) => {
        if (isExplicitOverride(field)) {
          return Number(customColumnValues[entry.id][field] || 0);
        }
        const dbVal = getDbDeduction(field, -1);
        if (dbVal !== -1) {
          return dbVal;
        }
        return statutoryDefault;
      };

      // Personal Statutory & Loan Deductions
      const dedPolicyLoan = getDeductionValue('dedPolicyLoan', 0.00);
      const dedConsolLoan = getDeductionValue('dedConsolLoan', 0.00);
      const dedMplLite = getDeductionValue('dedMplLite', 0.00);
      const dedMpl = getDeductionValue('dedMpl', 0.00);
      const dedCpl = getDeductionValue('dedCpl', 0.00);
      const dedGfal = getDeductionValue('dedGfal', 0.00);
      const dedEmergencyLoan = getDeductionValue('dedEmergencyLoan', 0.00);
      
      const dedGsisPremPersonal = getDeductionValue('dedGsisPremPersonal', (isPhRegular ? Number((computedBasicPay * 0.09).toFixed(2)) : 0.00));
      const dedEducAsst = getDeductionValue('dedEducAsst', 0.00);

      const dedPagibigPersonal = getDeductionValue('dedPagibigPersonal', (hasHdmf ? (isSemiMonthly ? 100.00 : 200.00) : 0.00));
      const dedPagibigMpl = getDeductionValue('dedPagibigMpl', 0.00);
      const dedSss = getDeductionValue('dedSss', (isJobOrder && emp.hasSss ? Number((computedBasicPay * 0.045).toFixed(2)) : 0.00));

      const dedPagibigMp2 = getDeductionValue('dedPagibigMp2', 0.00);
      const dedPhilhealthCont = getDeductionValue('dedPhilhealthCont', (hasPh ? Number((computedBasicPay * 0.025).toFixed(2)) : 0.00));
      const dedCsbLoan = getDeductionValue('dedCsbLoan', 0.00);

      // Philippine TRAIN Law Tax Calculation
      let taxVal = 0;
      const annualizedGross = gross * (isSemiMonthly ? 24 : 12);
      if (annualizedGross > 8000000) taxVal = (2202500 + (annualizedGross - 8000000) * 0.35) / (isSemiMonthly ? 24 : 12);
      else if (annualizedGross > 2000000) taxVal = (402500 + (annualizedGross - 2000000) * 0.32) / (isSemiMonthly ? 24 : 12);
      else if (annualizedGross > 800000) taxVal = (102500 + (annualizedGross - 800000) * 0.30) / (isSemiMonthly ? 24 : 12);
      else if (annualizedGross > 400000) taxVal = (22500 + (annualizedGross - 400000) * 0.25) / (isSemiMonthly ? 24 : 12);
      else if (annualizedGross > 250000) taxVal = ((annualizedGross - 250000) * 0.15) / (isSemiMonthly ? 24 : 12);
      else taxVal = 0;
      
      const dedTaxWithheld = getDeductionValue('dedTaxWithheld', Number(taxVal.toFixed(2)));

      // Collect any unmapped active deductions for this employee from deductions table
      const mappedColAliases = [
        'policyloan', 'policy loan', 'gsis policy loan', 'policy_loan', 'dedpolicyloan',
        'consoloan', 'consol loan', 'consolidation loan', 'conso loan', 'consolidation', 'gsis consol loan', 'dedconsoloan', 'consolloan',
        'mpllite', 'mpl_lite', 'mpl-lite', 'mpl_lite rlp', 'mplliterlp', 'mpl lite', 'multi-purpose loan lite', 'dedmpllite', 'mpl_lite_rlp',
        'mpl', 'multipurpose loan', 'multi purpose loan', 'multi-purpose loan', 'mpl loan', 'dedmpl', 'gsis multipurpose loan', 'gsis mpl',
        'cpl', 'computer purchase loan', 'computer loan', 'cpl loan', 'dedcpl', 'gsis computer loan', 'cpl_loan', 'gsis cpl',
        'gfal', 'gsis financial assistance loan', 'gsis financial assistance', 'gfal loan', 'dedgfal', 'gsis gfal',
        'emrgyln', 'gsis emergency loan', 'emergency loan', 'emrgy ln', 'emrgy_ln', 'emergency_loan', 'dedemergencyloan', 'emrgy loan',
        'gsisprem', 'gsispersonal', 'gsisprempersonal', 'gsisEE', 'gsis personal', 'gsis contribution', 'gsis premium', 'gsis ee', 'dedgsisprempersonal', 'gsis prem personal', 'gsis personal share', 'gsis_prem', 'gsis personal premium',
        'educasst', 'educ_asst', 'educational assistance', 'educational assistance loan', 'educ asst', 'dededucasst', 'gsis educational assistance', 'gsis educ asst',
        'pagibigprem', 'pagibigpersonal', 'pagibigpersonalee', 'pagibigregular', 'pagibigee', 'hdmfpersonal', 'hdmfpersonalee', 'hdmfee', 'pagibig regular', 'pagibig personal', 'pagibig contribution', 'pagibig premium', 'pagibig ee', 'hdmf personal', 'hdmf contribution', 'hdmf ee', 'dedpagibigpersonal', 'pag-ibig personal', 'pag-ibig ee', 'pag-ibig regular', 'pagibig_prem', 'hdmf premium', 'pag-ibig personal(ee)', 'hdmf prem personal',
        'pagibigmpl', 'pagibig_mpl', 'hdmf_mpl', 'pag-ibig mpl', 'dedpagibigmpl', 'hdmf mpl', 'hdmf loan', 'hdmf prem mpl',
        'sss', 'dedsss', 'sss contribution', 'sss premium', 'sss ee', 'sss_prem', 'sss share', 'sss contrib', 'sss contribution/loan',
        'mp2', 'dedpagibigmp2', 'pagibig mp2', 'pag-ibig mp2', 'mp2 contribution', 'pagibig_mp2', 'hdmf mp2', 'hdmf prem mp2',
        'philhealth', 'dedphilhealthcont', 'philhealth contribution', 'philhealth premium', 'philhealth ee', 'philhealth cont', 'philhealth_prem', 'ph_prem', 'phee', 'ph ee', 'philhealth ee share', 'philhealth cont.', 'philhealth es cont', 'philhealth es',
        'csbloan', 'dedcsbloan', 'csb loan', 'csb', 'csbsalloan', 'csb sal loan', 'chinabank savings loan', 'china bank loan', 'china bank', 'csb sal. loan',
        'tax', 'dedtaxwithheld', 'withholding tax', 'tax withheld', 'wtax', 'income tax', 'withholding_tax', 'tax_withheld', 'wtax withheld', 'withholding tax(ee)', 'taxwithheld'
      ];

      let otherDeductionsTotal = 0;
      const extraDeductionsMap: { [key: string]: number } = {};

      for (const d of activeDeds) {
        const dT = String(d.type || d.description || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!mappedColAliases.some(alias => alias.replace(/[^a-z0-9]/g, '') === dT)) {
          const rawAmt = Number(d.amount || 0);
          const amt = isSemiMonthly ? Number((rawAmt / 2).toFixed(2)) : rawAmt;
          otherDeductionsTotal += amt;
          const keyName = 'ded_' + (d.type || 'other').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
          extraDeductionsMap[keyName] = amt;
        }
      }

      // Check any custom keys in customColumnValues for this entry that start with ded and are not standard 16
      if (customColumnValues && customColumnValues[entry.id]) {
        for (const [cKey, cVal] of Object.entries(customColumnValues[entry.id])) {
          if (cKey.startsWith('ded') && !DEDUCTION_KEY_MAP[cKey] && extraDeductionsMap[cKey] === undefined) {
            const customAmt = Number(cVal || 0);
            otherDeductionsTotal += customAmt;
            extraDeductionsMap[cKey] = customAmt;
          }
        }
      }

      const sumDeductions = Number((dedPolicyLoan + dedConsolLoan + dedMplLite + dedMpl + dedCpl + dedGfal + dedEmergencyLoan + 
        dedGsisPremPersonal + dedEducAsst + dedPagibigPersonal + dedPagibigMpl + dedSss + dedPagibigMp2 + 
        dedPhilhealthCont + dedCsbLoan + dedTaxWithheld + otherDeductionsTotal).toFixed(2));

      const net = Number((gross - sumDeductions).toFixed(2));

      const deductionsMap = {
        govSecGsis,
        govSecHdmf,
        govSecPh,
        govSecEcip,
        compSal2nd: computedBasicPay,
        compPera,
        absences,
        dedPolicyLoan,
        dedConsolLoan,
        dedMplLite,
        dedMpl,
        dedCpl,
        dedGfal,
        dedEmergencyLoan,
        dedGsisPremPersonal,
        dedEducAsst,
        dedPagibigPersonal,
        dedPagibigMpl,
        dedSss,
        dedPagibigMp2,
        dedPhilhealthCont,
        dedCsbLoan,
        dedTaxWithheld,
        ...extraDeductionsMap
      };

      const updatedCustomJson = JSON.stringify({ ...deductionsMap, ...(customColumnValues && customColumnValues[entry.id] ? customColumnValues[entry.id] : {}) });

      try {
        await updateEntryStmt.run(
          employeeName,
          computedBasicPay,
          teachingHoursToUpdate,
          computedOvertime,
          gross, 
          JSON.stringify(deductionsMap), 
          updatedCustomJson,
          sumDeductions, 
          net,
          govSecGsis,
          govSecHdmf,
          govSecPh,
          govSecEcip,
          computedBasicPay,
          compPera,
          gross,
          absences,
          dedPolicyLoan,
          dedConsolLoan,
          dedMplLite,
          dedMpl,
          dedCpl,
          dedGfal,
          dedEmergencyLoan,
          dedGsisPremPersonal,
          dedEducAsst,
          dedPagibigPersonal,
          dedPagibigMpl,
          dedSss,
          dedPagibigMp2,
          dedPhilhealthCont,
          dedCsbLoan,
          dedTaxWithheld,
          entry.id
        );
      } catch (stmtErr) {
        console.warn(`[PayrollCalculator] Full column update failed for entry ${entry.id}, applying safe fallback:`, (stmtErr as any)?.message);
        try {
          await db.prepare(`
            UPDATE payroll_entries SET
              employeeName = ?,
              basicPay = ?,
              grossPay = ?,
              deductions_json = ?,
              custom_values_json = ?,
              totalDeductions = ?,
              netPay = ?
            WHERE id = ?
          `).run(
            employeeName,
            computedBasicPay,
            gross,
            JSON.stringify(deductionsMap),
            updatedCustomJson,
            sumDeductions,
            net,
            entry.id
          );
        } catch (fallbackErr) {
          console.error(`[PayrollCalculator] Fallback update failed for entry ${entry.id}:`, fallbackErr);
          throw stmtErr;
        }
      }

      totalGross = Number((totalGross + gross).toFixed(2));
      totalDeductions = Number((totalDeductions + sumDeductions).toFixed(2));
      totalNet = Number((totalNet + net).toFixed(2));
    }

    if (onlyEmployeeId) {
      const summary = await db.prepare("SELECT SUM(grossPay) as sumGross, SUM(totalDeductions) as sumDeds, SUM(netPay) as sumNet FROM payroll_entries WHERE cycleId = ?").get(cycleId) as any;
      totalGross = summary?.sumGross || 0;
      totalDeductions = summary?.sumDeds || 0;
      totalNet = summary?.sumNet || 0;
    }

    await db.prepare("UPDATE payroll_cycles SET totalGross = ?, totalDeductions = ?, totalNet = ? WHERE id = ?").run(totalGross, totalDeductions, totalNet, cycleId);
  } catch (error) {
    throw error;
  }
}

export async function syncPayrollCycleToRecord(cycleId: string) {
  try {
    const cycle = await db.prepare("SELECT * FROM payroll_cycles WHERE id = ?").get(cycleId) as any;
    if (!cycle) return;

    if (cycle.status !== 'disbursed') {
      await db.prepare("DELETE FROM payroll_records WHERE cycleId = ?").run(cycleId);
      return;
    }

    const entries = await db.prepare("SELECT * FROM payroll_entries WHERE cycleId = ?").all(cycleId) as any[];
    const dateObj = new Date(cycle.startDate || cycle.createdAt || Date.now());
    const year = dateObj.getFullYear() || new Date().getFullYear();
    const month = (dateObj.getMonth() + 1) || 1;
    const monthName = MONTH_NAMES_LIST[month - 1] || 'January';

    let totGross = entries.reduce((s, e) => s + Number(e.grossPay || e.compGross || e.basicPay || 0), 0);
    let totDed = entries.reduce((s, e) => s + Number(e.totalDeductions || 0), 0);
    let totNet = entries.reduce((s, e) => s + Number(e.netPay || (totGross - totDed)), 0);

    if (totGross === 0 && totNet === 0 && cycle.totalGross) {
      totGross = Number(cycle.totalGross || 0);
      totDed = Number(cycle.totalDeductions || 0);
      totNet = Number(cycle.totalNet || 0);
    }

    const existing = await db.prepare("SELECT id FROM payroll_records WHERE cycleId = ?").get(cycleId) as any;
    const jsonPayload = JSON.stringify(entries);

    const executeSave = async () => {
      if (existing) {
        await db.prepare(`
          UPDATE payroll_records
          SET year = ?, month = ?, monthName = ?, title = ?, periodType = ?, totalEmployees = ?, totalGross = ?, totalDeductions = ?, totalNet = ?, status = 'disbursed', notes = ?, recordDataJson = ?, updatedAt = CURRENT_TIMESTAMP
          WHERE cycleId = ?
        `).run(
          year,
          month,
          monthName,
          cycle.name || `Payroll Record ${monthName} ${year}`,
          cycle.type || 'monthly',
          entries.length,
          totGross,
          totDed,
          totNet,
          `Official Disbursed Record (${cycle.status})`,
          jsonPayload,
          cycleId
        );
      } else {
        const recId = `rec-sync-${cycleId}`;
        await db.prepare(`
          INSERT INTO payroll_records 
          (id, cycleId, year, month, monthName, title, periodType, totalEmployees, totalGross, totalDeductions, totalNet, status, notes, recordDataJson)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          recId,
          cycleId,
          year,
          month,
          monthName,
          cycle.name || `Payroll Record ${monthName} ${year}`,
          cycle.type || 'monthly',
          entries.length,
          totGross,
          totDed,
          totNet,
          'disbursed',
          `Official Disbursed Record (${cycle.status})`,
          jsonPayload
        );
      }
    };

    try {
      await executeSave();
    } catch (err: any) {
      if (String(err?.message || '').includes('recordDataJson') || String(err?.message || '').includes('Data too long')) {
        try {
          await db.exec("ALTER TABLE payroll_records MODIFY COLUMN recordDataJson LONGTEXT");
          await executeSave();
          return;
        } catch (alterErr) {
          console.error("Failed to alter payroll_records table:", alterErr);
        }
      }
      throw err;
    }
  } catch (err) {
    console.error(`Auto-sync error for cycle ${cycleId}:`, err);
  }
}

export async function syncAllCyclesToRecords() {
  try {
    await db.prepare("DELETE FROM payroll_records WHERE cycleId IS NOT NULL AND cycleId IN (SELECT id FROM payroll_cycles WHERE status != 'disbursed')").run();

    const cycles = await db.prepare("SELECT id FROM payroll_cycles WHERE status = 'disbursed'").all() as any[];
    for (const cycle of cycles) {
      await syncPayrollCycleToRecord(cycle.id);
    }
  } catch (err) {
    console.error("Auto-sync all cycles error:", err);
  }
}

export async function syncCurrentDeductionsToRecord(year?: number, month?: number) {
  try {
    const now = new Date();
    const reqYear = year || now.getFullYear();
    const reqMonth = month || (now.getMonth() + 1);

    const allEmployees = await db.prepare("SELECT * FROM employees ORDER BY lastName ASC, firstName ASC").all() as any[];
    let allDeductions: any[] = [];
    try {
      allDeductions = await db.prepare("SELECT * FROM deductions WHERE status = 'active' OR status IS NULL").all() as any[];
    } catch {
      allDeductions = await db.prepare("SELECT * FROM deductions").all() as any[];
    }

    const snapshotEntries = allEmployees.map(emp => {
      const empDeds = allDeductions.filter(d => (d.employeeId === emp.id || d.employee_id === emp.id || d.employeeid === emp.id));
      const empName = `${emp.lastName ? emp.lastName + ', ' : ''}${emp.firstName || ''} ${emp.mi ? emp.mi + '.' : ''}`.trim();
      
      return {
        employeeId: emp.id,
        employeeNo: emp.employeeId || emp.employee_id || emp.bpno || '',
        employeeName: empName,
        firstName: emp.firstName || emp.first_name || '',
        lastName: emp.lastName || emp.last_name || '',
        mi: emp.mi || '',
        position: emp.position || 'Staff',
        category: emp.category || 'STAFF',
        gender: emp.gender || 'MALE',
        deductions: empDeds
      };
    });

    const totalEmployees = snapshotEntries.length;
    let totalDeductions = 0;

    for (const entry of snapshotEntries) {
      if (entry.deductions && Array.isArray(entry.deductions)) {
        totalDeductions += entry.deductions.reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);
      } else if ((entry as any).totalDeductions) {
        totalDeductions += Number((entry as any).totalDeductions || 0);
      }
    }

    let existing: any = null;
    try {
      existing = await db.prepare('SELECT * FROM deduction_records WHERE year = ? AND month = ? ORDER BY "createdAt" DESC LIMIT 1').get(reqYear, reqMonth) as any;
    } catch {
      try {
        existing = await db.prepare("SELECT * FROM deduction_records WHERE year = ? AND month = ? ORDER BY created_at DESC LIMIT 1").get(reqYear, reqMonth) as any;
      } catch {
        existing = await db.prepare("SELECT * FROM deduction_records WHERE year = ? AND month = ? ORDER BY id DESC LIMIT 1").get(reqYear, reqMonth) as any;
      }
    }

    if (existing) {
      if (totalEmployees > 0) {
        const jsonSnapshot = JSON.stringify(snapshotEntries);
        const executeDeductionSave = async () => {
          await db.prepare(`
            UPDATE deduction_records
            SET totalEmployees = ?, totalDeductions = ?, recordDataJson = ?, updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            totalEmployees,
            totalDeductions,
            jsonSnapshot,
            existing.id
          );
        };

        try {
          await executeDeductionSave();
        } catch (err: any) {
          if (String(err?.message || '').includes('recordDataJson') || String(err?.message || '').includes('Data too long')) {
            try {
              await db.exec("ALTER TABLE deduction_records MODIFY COLUMN recordDataJson LONGTEXT");
              await executeDeductionSave();
              return;
            } catch (alterErr) {
              console.error("Failed to alter deduction_records table:", alterErr);
            }
          }
          throw err;
        }
      }
    }
  } catch (err) {
    console.error("Auto-sync deductions record error:", err);
  }
}

export async function syncPayrollDeductionsToDeductionsTable(employeeId: string, customValues: any) {
  if (!employeeId || !customValues || typeof customValues !== 'object') return;
  try {
    for (const [key, rawVal] of Object.entries(customValues)) {
      // Find matching standard mapping or check if it's a deduction field
      let typeName: string | null = null;
      if (DEDUCTION_KEY_MAP[key]) {
        typeName = DEDUCTION_KEY_MAP[key].typeName;
      } else if (key.startsWith('ded')) {
        const cleanName = key.replace(/^ded_?/, '').replace(/([A-Z])/g, ' $1').trim();
        typeName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
      } else {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const mapItem of Object.values(DEDUCTION_KEY_MAP)) {
          if (mapItem.aliases.some(a => a.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedKey)) {
            typeName = mapItem.typeName;
            break;
          }
        }
      }

      if (!typeName) continue;

      const amount = Number(rawVal || 0);

      // Ensure deduction type exists
      const existingType = await db.prepare("SELECT id FROM deduction_types WHERE LOWER(name) = LOWER(?)").get(typeName) as any;
      if (!existingType) {
        const dtId = `dt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        await db.prepare("INSERT INTO deduction_types (id, name, description) VALUES (?, ?, ?)").run(dtId, typeName, "System Synced Deduction Type");
      }

      // Check if employee deduction already exists
      const existingDeds = await db.prepare("SELECT * FROM deductions WHERE employeeId = ?").all(employeeId) as any[];
      const matchedDed = existingDeds.find(d => {
        const dT = String(d.type || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const targetT = typeName!.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (dT === targetT) return true;
        const mapEntry = Object.values(DEDUCTION_KEY_MAP).find(m => m.typeName === typeName);
        return mapEntry?.aliases.some(a => a.toLowerCase().replace(/[^a-z0-9]/g, '') === dT);
      });

      if (matchedDed) {
        if (amount > 0) {
          await db.prepare("UPDATE deductions SET amount = ?, status = 'active' WHERE id = ?").run(amount, matchedDed.id);
        } else {
          await db.prepare("UPDATE deductions SET amount = 0, status = 'inactive' WHERE id = ?").run(matchedDed.id);
        }
      } else if (amount > 0) {
        const newId = `ded-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        try {
          await db.prepare(`
            INSERT INTO deductions (id, "employeeId", employee_id, type_id, type, type_name, description, amount, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
          `).run(newId, employeeId, employeeId, typeName, typeName, typeName, typeName, amount);
        } catch {
          try {
            await db.prepare(`
              INSERT INTO deductions (id, employeeId, type, description, amount, status)
              VALUES (?, ?, ?, ?, ?, 'active')
            `).run(newId, employeeId, typeName, typeName, amount);
          } catch {
            await db.prepare(`
              INSERT INTO deductions (id, employee_id, type_id, type_name, amount)
              VALUES (?, ?, ?, ?, ?)
            `).run(newId, employeeId, typeName, typeName, amount);
          }
        }
      }
    }

    await syncCurrentDeductionsToRecord();
  } catch (err) {
    console.error("Error syncing payroll deductions to deductions table:", err);
  }
}

export async function syncDeductionsToActivePayrollCycles(employeeId?: string) {
  try {
    const activeCycles = await db.prepare("SELECT * FROM payroll_cycles WHERE status != 'disbursed'").all() as any[];
    for (const cycle of activeCycles) {
      if (employeeId) {
        const inCycle = await db.prepare("SELECT id FROM payroll_entries WHERE cycleId = ? AND employeeId = ?").get(cycle.id, employeeId) as any;
        if (!inCycle) {
          const emp = await db.prepare("SELECT * FROM employees WHERE id = ?").get(employeeId) as any;
          if (emp) {
            const entryId = `entry-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const empName = `${emp.lastName ? emp.lastName + ', ' : ''}${emp.firstName || ''} ${emp.mi ? emp.mi + '.' : ''}`.trim();
            const isSemi = cycle.type === 'semi-monthly';
            const basicPay = isSemi ? (Number(emp.basicSalary || 0) / 2) : Number(emp.basicSalary || 0);
            await db.prepare(`
              INSERT INTO payroll_entries (id, cycleId, employeeId, employeeName, basicPay, grossPay, netPay, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
            `).run(entryId, cycle.id, emp.id, empName, basicPay, basicPay, basicPay);
          }
        }
        await calculateNetSalary(cycle.id, employeeId);
      } else {
        const allEmps = await db.prepare("SELECT * FROM employees WHERE status = 'active' OR status IS NULL").all() as any[];
        const existingEntries = await db.prepare("SELECT employeeId FROM payroll_entries WHERE cycleId = ?").all(cycle.id) as any[];
        const existingEmpIds = new Set(existingEntries.map(e => e.employeeId));

        for (const emp of allEmps) {
          if (!existingEmpIds.has(emp.id)) {
            const entryId = `entry-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const empName = `${emp.lastName ? emp.lastName + ', ' : ''}${emp.firstName || ''} ${emp.mi ? emp.mi + '.' : ''}`.trim();
            const isSemi = cycle.type === 'semi-monthly';
            const basicPay = isSemi ? (Number(emp.basicSalary || 0) / 2) : Number(emp.basicSalary || 0);
            await db.prepare(`
              INSERT INTO payroll_entries (id, cycleId, employeeId, employeeName, basicPay, grossPay, netPay, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
            `).run(entryId, cycle.id, emp.id, empName, basicPay, basicPay, basicPay);
          }
        }
        await calculateNetSalary(cycle.id);
      }
    }
  } catch (err) {
    console.error("Error syncing deductions to active payroll cycles:", err);
  }
}
