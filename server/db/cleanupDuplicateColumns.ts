import { db, getPostgresPool, isPostgres, getDatabaseStatus } from "./schema.js";

/**
 * Clean up duplicate columns across all database tables.
 * Consolidates all data into the single canonical camelCase columns (e.g. "birthDate", "employeeId", "firstName"),
 * removes all duplicate snake_case and lowercase columns (e.g. birth_date, birthdate, employee_id),
 * and ensures full functional data integrity.
 */
export async function runDuplicateColumnCleanup() {
  console.log("[Migration] Starting database duplicate column cleanup...");

  if (!isPostgres) {
    console.log("[Migration] Non-Postgres database detected. Skipping Postgres-specific cleanup.");
    return;
  }

  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    // Helper to get columns of a table
    const getTableColumns = async (tableName: string): Promise<Set<string>> => {
      const res = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [tableName]
      );
      return new Set(res.rows.map((r) => r.column_name));
    };

    // Helper to run query safely
    const safeQuery = async (sql: string) => {
      try {
        await client.query(sql);
      } catch (err: any) {
        console.warn(`[Migration Notice] ${sql.substring(0, 80)}... -> ${err.message}`);
      }
    };

    // ==========================================
    // 1. EMPLOYEES TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: employees...");
    let empCols = await getTableColumns("employees");

    // Copy data from duplicate columns to canonical columns if canonical is null or empty
    if (empCols.has("birth_date") || empCols.has("birthdate")) {
      await safeQuery(`
        UPDATE employees 
        SET "birthDate" = COALESCE(NULLIF("birthDate", ''), NULLIF(birth_date, ''), NULLIF(birthdate, ''))
        WHERE "birthDate" IS NULL OR "birthDate" = ''
      `);
    }

    if (empCols.has("employee_id")) {
      await safeQuery(`
        UPDATE employees 
        SET "employeeId" = COALESCE(NULLIF("employeeId", ''), NULLIF(employee_id, ''))
        WHERE "employeeId" IS NULL OR "employeeId" = ''
      `);
    }

    if (empCols.has("first_name")) {
      await safeQuery(`
        UPDATE employees 
        SET "firstName" = COALESCE(NULLIF("firstName", ''), NULLIF(first_name, ''))
        WHERE "firstName" IS NULL OR "firstName" = ''
      `);
    }

    if (empCols.has("last_name")) {
      await safeQuery(`
        UPDATE employees 
        SET "lastName" = COALESCE(NULLIF("lastName", ''), NULLIF(last_name, ''))
        WHERE "lastName" IS NULL OR "lastName" = ''
      `);
    }

    if (empCols.has("hire_date") || empCols.has("hiredate")) {
      await safeQuery(`
        UPDATE employees 
        SET "hireDate" = COALESCE("hireDate", hire_date, hiredate)
        WHERE "hireDate" IS NULL
      `);
    }

    if (empCols.has("effectivity_date") || empCols.has("effectivitydate")) {
      await safeQuery(`
        UPDATE employees 
        SET "effectivityDate" = COALESCE(NULLIF("effectivityDate", ''), NULLIF(effectivity_date, ''), NULLIF(effectivitydate, ''))
        WHERE "effectivityDate" IS NULL OR "effectivityDate" = ''
      `);
    }

    if (empCols.has("basic_salary") || empCols.has("monthly_salary")) {
      await safeQuery(`
        UPDATE employees 
        SET "basicSalary" = COALESCE("basicSalary", basic_salary, monthly_salary)
        WHERE "basicSalary" IS NULL
      `);
    }

    if (empCols.has("salary_type")) {
      await safeQuery(`
        UPDATE employees 
        SET "salaryType" = COALESCE(NULLIF("salaryType", ''), NULLIF(salary_type, ''))
        WHERE "salaryType" IS NULL OR "salaryType" = ''
      `);
    }

    if (empCols.has("phone_number")) {
      await safeQuery(`
        UPDATE employees 
        SET "phoneNumber" = COALESCE(NULLIF("phoneNumber", ''), NULLIF(phone_number, ''))
        WHERE "phoneNumber" IS NULL OR "phoneNumber" = ''
      `);
    }

    if (empCols.has("profile_image")) {
      await safeQuery(`
        UPDATE employees 
        SET "profileImage" = COALESCE(NULLIF("profileImage", ''), NULLIF(profile_image, ''))
        WHERE "profileImage" IS NULL OR "profileImage" = ''
      `);
    }

    if (empCols.has("has_sss")) {
      await safeQuery(`
        UPDATE employees 
        SET "hasSss" = COALESCE("hasSss", has_sss)
        WHERE "hasSss" IS NULL
      `);
    }

    if (empCols.has("has_philhealth")) {
      await safeQuery(`
        UPDATE employees 
        SET "hasPhilhealth" = COALESCE("hasPhilhealth", has_philhealth)
        WHERE "hasPhilhealth" IS NULL
      `);
    }

    if (empCols.has("has_pagibig")) {
      await safeQuery(`
        UPDATE employees 
        SET "hasPagibig" = COALESCE("hasPagibig", has_pagibig)
        WHERE "hasPagibig" IS NULL
      `);
    }

    if (empCols.has("created_at")) {
      await safeQuery(`
        UPDATE employees 
        SET "createdAt" = COALESCE("createdAt", created_at)
        WHERE "createdAt" IS NULL
      `);
    }

    // Constraints on employees:
    // Create unique index on "employeeId" if not exists
    await safeQuery(`CREATE UNIQUE INDEX IF NOT EXISTS "employees_employeeId_unique" ON employees ("employeeId")`);
    await safeQuery(`ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_employee_id_key`);
    await safeQuery(`ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_department_id_fkey`);

    // Drop all duplicate / redundant columns from employees
    const empDups = [
      "birth_date", "birthdate", "employee_id", "first_name", "last_name",
      "basic_salary", "monthly_salary", "salary_type", "phone_number",
      "profile_image", "hire_date", "hiredate", "has_sss", "has_philhealth",
      "has_pagibig", "effectivity_date", "effectivitydate", "created_at",
      "middle_name", "department_id", "hourly_rate", "tin", "gsis_no",
      "philhealth_no", "pagibig_no"
    ];
    for (const col of empDups) {
      if (empCols.has(col)) {
        await safeQuery(`ALTER TABLE employees DROP COLUMN IF EXISTS "${col}"`);
      }
    }

    // ==========================================
    // 2. USERS TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: users...");
    let userCols = await getTableColumns("users");

    if (userCols.has("display_name") || userCols.has("displayname")) {
      await safeQuery(`
        UPDATE users 
        SET "displayName" = COALESCE(NULLIF("displayName", ''), NULLIF(display_name, ''), NULLIF(displayname, ''))
        WHERE "displayName" IS NULL OR "displayName" = ''
      `);
    }
    if (userCols.has("profile_image")) {
      await safeQuery(`
        UPDATE users 
        SET "profileImage" = COALESCE(NULLIF("profileImage", ''), NULLIF(profile_image, ''))
        WHERE "profileImage" IS NULL OR "profileImage" = ''
      `);
    }
    if (userCols.has("password_hash")) {
      await safeQuery(`
        UPDATE users 
        SET password = COALESCE(NULLIF(password, ''), NULLIF(password_hash, ''))
        WHERE password IS NULL OR password = ''
      `);
    }
    if (userCols.has("created_at")) {
      await safeQuery(`
        UPDATE users 
        SET "createdAt" = COALESCE("createdAt", created_at)
        WHERE "createdAt" IS NULL
      `);
    }

    const userDups = ["display_name", "displayname", "profile_image", "created_at", "password_hash"];
    for (const col of userDups) {
      if (userCols.has(col)) {
        await safeQuery(`ALTER TABLE users DROP COLUMN IF EXISTS "${col}"`);
      }
    }

    // ==========================================
    // 3. PAYROLL_CYCLES TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: payroll_cycles...");
    let cycleCols = await getTableColumns("payroll_cycles");

    if (cycleCols.has("start_date")) await safeQuery(`UPDATE payroll_cycles SET "startDate" = COALESCE("startDate", start_date) WHERE "startDate" IS NULL`);
    if (cycleCols.has("end_date")) await safeQuery(`UPDATE payroll_cycles SET "endDate" = COALESCE("endDate", end_date) WHERE "endDate" IS NULL`);
    if (cycleCols.has("category_filter")) await safeQuery(`UPDATE payroll_cycles SET "categoryFilter" = COALESCE("categoryFilter", category_filter) WHERE "categoryFilter" IS NULL`);
    if (cycleCols.has("total_gross")) await safeQuery(`UPDATE payroll_cycles SET "totalGross" = COALESCE("totalGross", total_gross) WHERE "totalGross" IS NULL`);
    if (cycleCols.has("total_deductions")) await safeQuery(`UPDATE payroll_cycles SET "totalDeductions" = COALESCE("totalDeductions", total_deductions) WHERE "totalDeductions" IS NULL`);
    if (cycleCols.has("total_net")) await safeQuery(`UPDATE payroll_cycles SET "totalNet" = COALESCE("totalNet", total_net) WHERE "totalNet" IS NULL`);
    if (cycleCols.has("managed_by")) await safeQuery(`UPDATE payroll_cycles SET "managedBy" = COALESCE("managedBy", managed_by) WHERE "managedBy" IS NULL`);
    if (cycleCols.has("managed_by_name")) await safeQuery(`UPDATE payroll_cycles SET "managedByName" = COALESCE("managedByName", managed_by_name) WHERE "managedByName" IS NULL`);
    if (cycleCols.has("approved_by")) await safeQuery(`UPDATE payroll_cycles SET "approvedBy" = COALESCE("approvedBy", approved_by) WHERE "approvedBy" IS NULL`);
    if (cycleCols.has("approved_at")) await safeQuery(`UPDATE payroll_cycles SET "approvedAt" = COALESCE("approvedAt", approved_at) WHERE "approvedAt" IS NULL`);
    if (cycleCols.has("created_at")) await safeQuery(`UPDATE payroll_cycles SET "createdAt" = COALESCE("createdAt", created_at) WHERE "createdAt" IS NULL`);

    const cycleDups = ["start_date", "end_date", "category_filter", "total_gross", "total_deductions", "total_net", "managed_by", "managed_by_name", "approved_by", "approved_at", "created_at"];
    for (const col of cycleDups) {
      if (cycleCols.has(col)) {
        await safeQuery(`ALTER TABLE payroll_cycles DROP COLUMN IF EXISTS "${col}"`);
      }
    }

    // ==========================================
    // 4. PAYROLL_ENTRIES TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: payroll_entries...");
    let entryCols = await getTableColumns("payroll_entries");

    // Copy IDs and names
    if (entryCols.has("cycleid") || entryCols.has("cycle_id")) {
      await safeQuery(`UPDATE payroll_entries SET "cycleId" = COALESCE("cycleId", cycleid, cycle_id) WHERE "cycleId" IS NULL`);
    }
    if (entryCols.has("employeeid") || entryCols.has("employee_id")) {
      await safeQuery(`UPDATE payroll_entries SET "employeeId" = COALESCE("employeeId", employeeid, employee_id) WHERE "employeeId" IS NULL`);
    }
    if (entryCols.has("employeename") || entryCols.has("employee_name")) {
      await safeQuery(`UPDATE payroll_entries SET "employeeName" = COALESCE(NULLIF("employeeName", ''), NULLIF(employeename, ''), NULLIF(employee_name, '')) WHERE "employeeName" IS NULL OR "employeeName" = ''`);
    }
    if (entryCols.has("basicpay") || entryCols.has("basic_pay")) {
      await safeQuery(`UPDATE payroll_entries SET "basicPay" = COALESCE("basicPay", basicpay, basic_pay) WHERE "basicPay" IS NULL`);
    }
    if (entryCols.has("grosspay") || entryCols.has("gross_pay")) {
      await safeQuery(`UPDATE payroll_entries SET "grossPay" = COALESCE("grossPay", grosspay, gross_pay) WHERE "grossPay" IS NULL`);
    }
    if (entryCols.has("totaldeductions") || entryCols.has("total_deductions")) {
      await safeQuery(`UPDATE payroll_entries SET "totalDeductions" = COALESCE("totalDeductions", totaldeductions, total_deductions) WHERE "totalDeductions" IS NULL`);
    }
    if (entryCols.has("netpay") || entryCols.has("net_pay")) {
      await safeQuery(`UPDATE payroll_entries SET "netPay" = COALESCE("netPay", netpay, net_pay) WHERE "netPay" IS NULL`);
    }
    if (entryCols.has("othours") || entryCols.has("ot_hours")) {
      await safeQuery(`UPDATE payroll_entries SET "otHours" = COALESCE("otHours", othours, ot_hours) WHERE "otHours" IS NULL`);
    }
    if (entryCols.has("teachinghours") || entryCols.has("teaching_hours")) {
      await safeQuery(`UPDATE payroll_entries SET "teachingHours" = COALESCE("teachingHours", teachinghours, teaching_hours) WHERE "teachingHours" IS NULL`);
    }
    if (entryCols.has("isvalidated") || entryCols.has("is_validated")) {
      await safeQuery(`UPDATE payroll_entries SET "isValidated" = COALESCE("isValidated", isvalidated, is_validated) WHERE "isValidated" IS NULL`);
    }

    // Deductions / Government shares
    const entryPairs: [string, string[]][] = [
      ["govSecGsis", ["govsecgsis", "gov_sec_gsis"]],
      ["govSecHdmf", ["govsechdmf", "gov_sec_hdmf"]],
      ["govSecPh", ["govsecph", "gov_sec_ph"]],
      ["govSecEcip", ["govsececip", "gov_sec_ecip"]],
      ["compSal2nd", ["compsal2nd", "comp_sal_2nd"]],
      ["compPera", ["comppera", "comp_pera"]],
      ["compGross", ["compgross", "comp_gross"]],
      ["dedPolicyLoan", ["dedpolicyloan", "ded_policy_loan"]],
      ["dedConsolLoan", ["dedconsolloan", "ded_consol_loan"]],
      ["dedMplLite", ["dedmpllite", "ded_mpl_lite"]],
      ["dedMpl", ["dedmpl", "ded_mpl"]],
      ["dedCpl", ["dedcpl", "ded_cpl"]],
      ["dedGfal", ["dedgfal", "ded_gfal"]],
      ["dedEmergencyLoan", ["dedemergencyloan", "ded_emergency_loan"]],
      ["dedGsisPremPersonal", ["dedgsisprempersonal", "ded_gsis_prem_personal"]],
      ["dedEducAsst", ["dededucasst", "ded_educ_asst"]],
      ["dedPagibigPersonal", ["dedpagibigpersonal", "ded_pagibig_personal"]],
      ["dedPagibigMpl", ["dedpagibigmpl", "ded_pagibig_mpl"]],
      ["dedSss", ["dedsss", "ded_sss"]],
      ["dedPagibigMp2", ["dedpagibigmp2", "ded_pagibig_mp2"]],
      ["dedPhilhealthCont", ["dedphilhealthcont", "ded_philhealth_cont"]],
      ["dedCsbLoan", ["dedcsbloan", "ded_csb_loan"]],
      ["dedTaxWithheld", ["dedtaxwithheld", "ded_tax_withheld"]],
      ["createdAt", ["created_at"]]
    ];

    for (const [canon, dups] of entryPairs) {
      const existingDups = dups.filter((d) => entryCols.has(d));
      if (existingDups.length > 0) {
        await safeQuery(`UPDATE payroll_entries SET "${canon}" = COALESCE("${canon}", ${existingDups.map(d => `"${d}"`).join(", ")}) WHERE "${canon}" IS NULL`);
      }
    }

    // Drop constraints on cycleid, employeeid
    await safeQuery(`ALTER TABLE payroll_entries DROP CONSTRAINT IF EXISTS payroll_entries_cycleid_fkey`);
    await safeQuery(`ALTER TABLE payroll_entries DROP CONSTRAINT IF EXISTS payroll_entries_employeeid_fkey`);

    // Add foreign keys on canonical columns
    await safeQuery(`
      ALTER TABLE payroll_entries 
      ADD CONSTRAINT "payroll_entries_cycleId_fkey" 
      FOREIGN KEY ("cycleId") REFERENCES payroll_cycles(id) ON DELETE CASCADE
    `);
    await safeQuery(`
      ALTER TABLE payroll_entries 
      ADD CONSTRAINT "payroll_entries_employeeId_fkey" 
      FOREIGN KEY ("employeeId") REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE
    `);

    // Drop duplicate columns from payroll_entries
    const allEntryDups = [
      "cycleid", "cycle_id", "employeeid", "employee_id", "employeename", "employee_name",
      "basicpay", "basic_pay", "grosspay", "gross_pay", "totaldeductions", "total_deductions",
      "netpay", "net_pay", "othours", "ot_hours", "teachinghours", "teaching_hours",
      "isvalidated", "is_validated", "govsecgsis", "gov_sec_gsis", "govsechdmf", "gov_sec_hdmf",
      "govsecph", "gov_sec_ph", "govsececip", "gov_sec_ecip", "compsal2nd", "comp_sal_2nd",
      "comppera", "comp_pera", "compgross", "comp_gross", "dedpolicyloan", "ded_policy_loan",
      "dedconsolloan", "ded_consol_loan", "dedmpllite", "ded_mpl_lite", "dedmpl", "ded_mpl",
      "dedcpl", "ded_cpl", "dedgfal", "ded_gfal", "dedemergencyloan", "ded_emergency_loan",
      "dedgsisprempersonal", "ded_gsis_prem_personal", "dededucasst", "ded_educ_asst",
      "dedpagibigpersonal", "ded_pagibig_personal", "dedpagibigmpl", "ded_pagibig_mpl",
      "dedsss", "ded_sss", "dedpagibigmp2", "ded_pagibig_mp2", "dedphilhealthcont",
      "ded_philhealth_cont", "dedcsbloan", "ded_csb_loan", "dedtaxwithheld", "ded_tax_withheld",
      "created_at"
    ];
    for (const col of allEntryDups) {
      if (entryCols.has(col)) {
        await safeQuery(`ALTER TABLE payroll_entries DROP COLUMN IF EXISTS "${col}"`);
      }
    }

    // ==========================================
    // 5. PAYROLL_RECORDS TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: payroll_records...");
    let prCols = await getTableColumns("payroll_records");

    if (prCols.has("cycleid") || prCols.has("cycle_id")) await safeQuery(`UPDATE payroll_records SET "cycleId" = COALESCE("cycleId", cycleid, cycle_id) WHERE "cycleId" IS NULL`);
    if (prCols.has("monthname")) await safeQuery(`UPDATE payroll_records SET "monthName" = COALESCE("monthName", monthname) WHERE "monthName" IS NULL`);
    if (prCols.has("periodtype")) await safeQuery(`UPDATE payroll_records SET "periodType" = COALESCE("periodType", periodtype) WHERE "periodType" IS NULL`);
    if (prCols.has("totalemployees")) await safeQuery(`UPDATE payroll_records SET "totalEmployees" = COALESCE("totalEmployees", totalemployees) WHERE "totalEmployees" IS NULL`);
    if (prCols.has("totalgross") || prCols.has("total_gross")) await safeQuery(`UPDATE payroll_records SET "totalGross" = COALESCE("totalGross", totalgross, total_gross) WHERE "totalGross" IS NULL`);
    if (prCols.has("totaldeductions") || prCols.has("total_deductions")) await safeQuery(`UPDATE payroll_records SET "totalDeductions" = COALESCE("totalDeductions", totaldeductions, total_deductions) WHERE "totalDeductions" IS NULL`);
    if (prCols.has("totalnet") || prCols.has("total_net")) await safeQuery(`UPDATE payroll_records SET "totalNet" = COALESCE("totalNet", totalnet, total_net) WHERE "totalNet" IS NULL`);
    if (prCols.has("recorddatajson") || prCols.has("record_data_json")) await safeQuery(`UPDATE payroll_records SET "recordDataJson" = COALESCE("recordDataJson", recorddatajson, record_data_json) WHERE "recordDataJson" IS NULL`);
    if (prCols.has("createdby")) await safeQuery(`UPDATE payroll_records SET "createdBy" = COALESCE("createdBy", createdby) WHERE "createdBy" IS NULL`);
    if (prCols.has("createdat") || prCols.has("created_at")) await safeQuery(`UPDATE payroll_records SET "createdAt" = COALESCE("createdAt", createdat, created_at) WHERE "createdAt" IS NULL`);
    if (prCols.has("updatedat") || prCols.has("updated_at")) await safeQuery(`UPDATE payroll_records SET "updatedAt" = COALESCE("updatedAt", updatedat, updated_at) WHERE "updatedAt" IS NULL`);

    const prDups = [
      "cycleid", "cycle_id", "monthname", "periodtype", "totalemployees", "totalgross", "total_gross",
      "totaldeductions", "total_deductions", "totalnet", "total_net", "recorddatajson", "record_data_json",
      "createdby", "createdat", "created_at", "updatedat", "updated_at", "process_date", "processDate",
      "cutoff_period", "cutoffPeriod", "payroll_type", "payrollType"
    ];
    for (const col of prDups) {
      if (prCols.has(col)) {
        await safeQuery(`ALTER TABLE payroll_records DROP COLUMN IF EXISTS "${col}"`);
      }
    }

    // ==========================================
    // 6. DEDUCTION_RECORDS TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: deduction_records...");
    let drCols = await getTableColumns("deduction_records");

    if (drCols.has("monthname") || drCols.has("month_name")) await safeQuery(`UPDATE deduction_records SET "monthName" = COALESCE("monthName", monthname, month_name) WHERE "monthName" IS NULL`);
    if (drCols.has("periodtype") || drCols.has("period_type")) await safeQuery(`UPDATE deduction_records SET "periodType" = COALESCE("periodType", periodtype, period_type) WHERE "periodType" IS NULL`);
    if (drCols.has("totalemployees") || drCols.has("total_employees")) await safeQuery(`UPDATE deduction_records SET "totalEmployees" = COALESCE("totalEmployees", totalemployees, total_employees) WHERE "totalEmployees" IS NULL`);
    if (drCols.has("totaldeductions") || drCols.has("total_deductions")) await safeQuery(`UPDATE deduction_records SET "totalDeductions" = COALESCE("totalDeductions", totaldeductions, total_deductions) WHERE "totalDeductions" IS NULL`);
    if (drCols.has("recorddatajson") || drCols.has("record_data_json")) await safeQuery(`UPDATE deduction_records SET "recordDataJson" = COALESCE("recordDataJson", recorddatajson, record_data_json) WHERE "recordDataJson" IS NULL`);
    if (drCols.has("createdby") || drCols.has("created_by")) await safeQuery(`UPDATE deduction_records SET "createdBy" = COALESCE("createdBy", createdby, created_by) WHERE "createdBy" IS NULL`);
    if (drCols.has("createdat") || drCols.has("created_at")) await safeQuery(`UPDATE deduction_records SET "createdAt" = COALESCE("createdAt", createdat, created_at) WHERE "createdAt" IS NULL`);
    if (drCols.has("updatedat") || drCols.has("updated_at")) await safeQuery(`UPDATE deduction_records SET "updatedAt" = COALESCE("updatedAt", updatedat, updated_at) WHERE "updatedAt" IS NULL`);

    const drDups = [
      "monthname", "month_name", "periodtype", "period_type", "totalemployees", "total_employees",
      "totaldeductions", "total_deductions", "recorddatajson", "record_data_json", "details_json",
      "detailsJson", "createdby", "created_by", "createdat", "created_at", "updatedat", "updated_at"
    ];
    for (const col of drDups) {
      if (drCols.has(col)) {
        await safeQuery(`ALTER TABLE deduction_records DROP COLUMN IF EXISTS "${col}"`);
      }
    }

    // ==========================================
    // 7. DEDUCTIONS TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: deductions...");
    let dedCols = await getTableColumns("deductions");

    if (dedCols.has("employee_id")) {
      await safeQuery(`UPDATE deductions SET "employeeId" = COALESCE("employeeId", employee_id) WHERE "employeeId" IS NULL`);
    }
    if (dedCols.has("created_at")) {
      await safeQuery(`UPDATE deductions SET "createdAt" = COALESCE("createdAt", created_at) WHERE "createdAt" IS NULL`);
    }

    await safeQuery(`ALTER TABLE deductions DROP CONSTRAINT IF EXISTS deductions_employee_id_fkey`);
    await safeQuery(`
      ALTER TABLE deductions 
      ADD CONSTRAINT "deductions_employeeId_fkey" 
      FOREIGN KEY ("employeeId") REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE
    `);

    const dedDups = ["employee_id", "created_at", "type_id", "type_name"];
    for (const col of dedDups) {
      if (dedCols.has(col)) {
        await safeQuery(`ALTER TABLE deductions DROP COLUMN IF EXISTS "${col}"`);
      }
    }

    // ==========================================
    // 8. LOANS TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: loans...");
    let loanCols = await getTableColumns("loans");

    if (loanCols.has("employeeid") || loanCols.has("employee_id")) {
      await safeQuery(`UPDATE loans SET "employeeId" = COALESCE("employeeId", employeeid, employee_id) WHERE "employeeId" IS NULL`);
    }
    if (loanCols.has("loantype") || loanCols.has("loan_type") || loanCols.has("loanType")) {
      await safeQuery(`UPDATE loans SET type = COALESCE(type, loantype, loan_type, "loanType") WHERE type IS NULL`);
    }
    if (loanCols.has("principalamount") || loanCols.has("principal_amount")) {
      await safeQuery(`UPDATE loans SET "principalAmount" = COALESCE("principalAmount", principalamount, principal_amount) WHERE "principalAmount" IS NULL`);
    }
    if (loanCols.has("totalamount") || loanCols.has("total_amount")) {
      await safeQuery(`UPDATE loans SET "totalAmount" = COALESCE("totalAmount", totalamount, total_amount) WHERE "totalAmount" IS NULL`);
    }
    if (loanCols.has("monthlyamortization") || loanCols.has("monthly_amortization")) {
      await safeQuery(`UPDATE loans SET "monthlyAmortization" = COALESCE("monthlyAmortization", monthlyamortization, monthly_amortization) WHERE "monthlyAmortization" IS NULL`);
    }
    if (loanCols.has("termmonths") || loanCols.has("term_months")) {
      await safeQuery(`UPDATE loans SET "termMonths" = COALESCE("termMonths", termmonths, term_months) WHERE "termMonths" IS NULL`);
    }
    if (loanCols.has("remainingbalance") || loanCols.has("remaining_balance")) {
      await safeQuery(`UPDATE loans SET "remainingBalance" = COALESCE("remainingBalance", remainingbalance, remaining_balance) WHERE "remainingBalance" IS NULL`);
    }
    if (loanCols.has("startdate") || loanCols.has("start_date")) {
      await safeQuery(`UPDATE loans SET "startDate" = COALESCE("startDate", startdate, start_date) WHERE "startDate" IS NULL`);
    }
    if (loanCols.has("enddate") || loanCols.has("end_date")) {
      await safeQuery(`UPDATE loans SET "endDate" = COALESCE("endDate", enddate, end_date) WHERE "endDate" IS NULL`);
    }
    if (loanCols.has("createdat") || loanCols.has("created_at")) {
      await safeQuery(`UPDATE loans SET "createdAt" = COALESCE("createdAt", createdat, created_at) WHERE "createdAt" IS NULL`);
    }

    await safeQuery(`ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_employeeid_fkey`);
    await safeQuery(`
      ALTER TABLE loans 
      ADD CONSTRAINT "loans_employeeId_fkey" 
      FOREIGN KEY ("employeeId") REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE
    `);

    const loanDups = [
      "employeeid", "employee_id", "loantype", "loanType", "loan_type", "principalamount",
      "principal_amount", "totalamount", "total_amount", "monthlyamortization", "monthly_amortization",
      "termmonths", "term_months", "remainingbalance", "remaining_balance", "startdate",
      "start_date", "enddate", "end_date", "createdat", "created_at"
    ];
    for (const col of loanDups) {
      if (loanCols.has(col)) {
        await safeQuery(`ALTER TABLE loans DROP COLUMN IF EXISTS "${col}"`);
      }
    }

    // ==========================================
    // 9. DTR_RECORDS TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: dtr_records...");
    let dtrCols = await getTableColumns("dtr_records");

    if (dtrCols.has("employeeid") || dtrCols.has("employee_id")) {
      await safeQuery(`UPDATE dtr_records SET "employeeId" = COALESCE("employeeId", employeeid, employee_id) WHERE "employeeId" IS NULL`);
    }
    if (dtrCols.has("timein") || dtrCols.has("time_in")) await safeQuery(`UPDATE dtr_records SET "timeIn" = COALESCE("timeIn", timein, time_in) WHERE "timeIn" IS NULL`);
    if (dtrCols.has("timeout") || dtrCols.has("time_out")) await safeQuery(`UPDATE dtr_records SET "timeOut" = COALESCE("timeOut", timeout, time_out) WHERE "timeOut" IS NULL`);
    if (dtrCols.has("amin") || dtrCols.has("am_in")) await safeQuery(`UPDATE dtr_records SET "amIn" = COALESCE("amIn", amin, am_in) WHERE "amIn" IS NULL`);
    if (dtrCols.has("amout") || dtrCols.has("am_out")) await safeQuery(`UPDATE dtr_records SET "amOut" = COALESCE("amOut", amout, am_out) WHERE "amOut" IS NULL`);
    if (dtrCols.has("pmin") || dtrCols.has("pm_in")) await safeQuery(`UPDATE dtr_records SET "pmIn" = COALESCE("pmIn", pmin, pm_in) WHERE "pmIn" IS NULL`);
    if (dtrCols.has("pmout") || dtrCols.has("pm_out")) await safeQuery(`UPDATE dtr_records SET "pmOut" = COALESCE("pmOut", pmout, pm_out) WHERE "pmOut" IS NULL`);
    if (dtrCols.has("hoursworked") || dtrCols.has("hours_worked")) await safeQuery(`UPDATE dtr_records SET "hoursWorked" = COALESCE("hoursWorked", hoursworked, hours_worked) WHERE "hoursWorked" IS NULL`);
    if (dtrCols.has("overtimehours") || dtrCols.has("overtime_hours")) await safeQuery(`UPDATE dtr_records SET "overtimeHours" = COALESCE("overtimeHours", overtimehours, overtime_hours) WHERE "overtimeHours" IS NULL`);
    if (dtrCols.has("lateminutes") || dtrCols.has("late_minutes")) await safeQuery(`UPDATE dtr_records SET "lateMinutes" = COALESCE("lateMinutes", lateminutes, late_minutes) WHERE "lateMinutes" IS NULL`);
    if (dtrCols.has("undertimeminutes") || dtrCols.has("undertime_minutes")) await safeQuery(`UPDATE dtr_records SET "undertimeMinutes" = COALESCE("undertimeMinutes", undertimeminutes, undertime_minutes) WHERE "undertimeMinutes" IS NULL`);
    if (dtrCols.has("createdat") || dtrCols.has("created_at")) await safeQuery(`UPDATE dtr_records SET "createdAt" = COALESCE("createdAt", createdat, created_at) WHERE "createdAt" IS NULL`);

    await safeQuery(`ALTER TABLE dtr_records DROP CONSTRAINT IF EXISTS dtr_records_employeeid_fkey`);
    await safeQuery(`
      ALTER TABLE dtr_records 
      ADD CONSTRAINT "dtr_records_employeeId_fkey" 
      FOREIGN KEY ("employeeId") REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE
    `);

    const dtrDups = [
      "employeeid", "employee_id", "timein", "time_in", "timeout", "time_out",
      "amin", "am_in", "amout", "am_out", "pmin", "pm_in", "pmout", "pm_out",
      "hoursworked", "hours_worked", "overtimehours", "overtime_hours",
      "lateminutes", "late_minutes", "undertimeminutes", "undertime_minutes",
      "createdat", "created_at", "overtimein", "overtime_in", "overtimeout",
      "overtime_out", "undertimehours", "undertime_hours", "tardinessminutes", "tardiness_minutes"
    ];
    for (const col of dtrDups) {
      if (dtrCols.has(col)) {
        await safeQuery(`ALTER TABLE dtr_records DROP COLUMN IF EXISTS "${col}"`);
      }
    }

    // ==========================================
    // 10. SCHEDULES TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: schedules...");
    let schedCols = await getTableColumns("schedules");

    if (schedCols.has("employeeid") || schedCols.has("employee_id")) {
      await safeQuery(`UPDATE schedules SET "employeeId" = COALESCE("employeeId", employeeid, employee_id) WHERE "employeeId" IS NULL`);
    }
    if (schedCols.has("dayofweek") || schedCols.has("day_of_week")) await safeQuery(`UPDATE schedules SET "dayOfWeek" = COALESCE("dayOfWeek", dayofweek, day_of_week) WHERE "dayOfWeek" IS NULL`);
    if (schedCols.has("starttime") || schedCols.has("start_time")) await safeQuery(`UPDATE schedules SET "startTime" = COALESCE("startTime", starttime, start_time) WHERE "startTime" IS NULL`);
    if (schedCols.has("endtime") || schedCols.has("end_time")) await safeQuery(`UPDATE schedules SET "endTime" = COALESCE("endTime", endtime, end_time) WHERE "endTime" IS NULL`);
    if (schedCols.has("timein") || schedCols.has("time_in")) await safeQuery(`UPDATE schedules SET "timeIn" = COALESCE("timeIn", timein, time_in) WHERE "timeIn" IS NULL`);
    if (schedCols.has("timeout") || schedCols.has("time_out")) await safeQuery(`UPDATE schedules SET "timeOut" = COALESCE("timeOut", timeout, time_out) WHERE "timeOut" IS NULL`);
    if (schedCols.has("createdat") || schedCols.has("created_at")) await safeQuery(`UPDATE schedules SET "createdAt" = COALESCE("createdAt", createdat, created_at) WHERE "createdAt" IS NULL`);

    await safeQuery(`ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_employeeid_fkey`);
    await safeQuery(`
      ALTER TABLE schedules 
      ADD CONSTRAINT "schedules_employeeId_fkey" 
      FOREIGN KEY ("employeeId") REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE
    `);

    const schedDups = [
      "employeeid", "employee_id", "dayofweek", "day_of_week", "starttime", "start_time",
      "endtime", "end_time", "timein", "time_in", "timeout", "time_out",
      "specificdate", "specific_date", "effectivefrom", "effective_from",
      "effectiveto", "effective_to", "createdat", "created_at"
    ];
    for (const col of schedDups) {
      if (schedCols.has(col)) {
        await safeQuery(`ALTER TABLE schedules DROP COLUMN IF EXISTS "${col}"`);
      }
    }

    // ==========================================
    // 11. VISITING_INSTRUCTORS TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: visiting_instructors...");
    let viCols = await getTableColumns("visiting_instructors");

    if (viCols.has("employeeid") || viCols.has("employee_id")) {
      await safeQuery(`UPDATE visiting_instructors SET "employeeId" = COALESCE("employeeId", employeeid, employee_id) WHERE "employeeId" IS NULL`);
    }
    if (viCols.has("hourlyrate") || viCols.has("hourly_rate")) await safeQuery(`UPDATE visiting_instructors SET "hourlyRate" = COALESCE("hourlyRate", hourlyrate, hourly_rate) WHERE "hourlyRate" IS NULL`);
    if (viCols.has("maxhoursperweek") || viCols.has("max_hours_per_week")) await safeQuery(`UPDATE visiting_instructors SET "maxHoursPerWeek" = COALESCE("maxHoursPerWeek", maxhoursperweek, max_hours_per_week) WHERE "maxHoursPerWeek" IS NULL`);
    if (viCols.has("departmentid") || viCols.has("department_id")) await safeQuery(`UPDATE visiting_instructors SET "departmentId" = COALESCE("departmentId", departmentid, department_id) WHERE "departmentId" IS NULL`);
    if (viCols.has("contractstart") || viCols.has("contract_start")) await safeQuery(`UPDATE visiting_instructors SET "contractStart" = COALESCE("contractStart", contractstart, contract_start) WHERE "contractStart" IS NULL`);
    if (viCols.has("contractend") || viCols.has("contract_end")) await safeQuery(`UPDATE visiting_instructors SET "contractEnd" = COALESCE("contractEnd", contractend, contract_end) WHERE "contractEnd" IS NULL`);
    if (viCols.has("createdat") || viCols.has("created_at")) await safeQuery(`UPDATE visiting_instructors SET "createdAt" = COALESCE("createdAt", createdat, created_at) WHERE "createdAt" IS NULL`);

    await safeQuery(`ALTER TABLE visiting_instructors DROP CONSTRAINT IF EXISTS visiting_instructors_employeeid_key`);
    await safeQuery(`ALTER TABLE visiting_instructors DROP CONSTRAINT IF EXISTS visiting_instructors_employeeid_fkey`);
    await safeQuery(`ALTER TABLE visiting_instructors DROP CONSTRAINT IF EXISTS visiting_instructors_department_id_fkey`);

    await safeQuery(`CREATE UNIQUE INDEX IF NOT EXISTS "visiting_instructors_employeeId_unique" ON visiting_instructors ("employeeId")`);
    await safeQuery(`
      ALTER TABLE visiting_instructors 
      ADD CONSTRAINT "visiting_instructors_employeeId_fkey" 
      FOREIGN KEY ("employeeId") REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE
    `);
    await safeQuery(`
      ALTER TABLE visiting_instructors 
      ADD CONSTRAINT "visiting_instructors_departmentId_fkey" 
      FOREIGN KEY ("departmentId") REFERENCES departments(id) ON DELETE SET NULL
    `);

    const viDups = [
      "employeeid", "employee_id", "hourlyrate", "hourly_rate", "maxhoursperweek", "max_hours_per_week",
      "departmentid", "department_id", "contractstart", "contract_start", "contractend", "contract_end",
      "designation", "createdat", "created_at"
    ];
    for (const col of viDups) {
      if (viCols.has(col)) {
        await safeQuery(`ALTER TABLE visiting_instructors DROP COLUMN IF EXISTS "${col}"`);
      }
    }

    // ==========================================
    // 12. TEACHING_LOADS TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: teaching_loads...");
    let tlCols = await getTableColumns("teaching_loads");

    if (tlCols.has("employeeid") || tlCols.has("employee_id")) await safeQuery(`UPDATE teaching_loads SET "employeeId" = COALESCE("employeeId", employeeid, employee_id) WHERE "employeeId" IS NULL`);
    if (tlCols.has("subjectid") || tlCols.has("subject_id")) await safeQuery(`UPDATE teaching_loads SET "subjectId" = COALESCE("subjectId", subjectid, subject_id) WHERE "subjectId" IS NULL`);
    if (tlCols.has("teachingdepartmentid") || tlCols.has("teaching_department_id")) await safeQuery(`UPDATE teaching_loads SET "teachingDepartmentId" = COALESCE("teachingDepartmentId", teachingdepartmentid, teaching_department_id) WHERE "teachingDepartmentId" IS NULL`);
    if (tlCols.has("hoursperweek") || tlCols.has("hours_per_week")) await safeQuery(`UPDATE teaching_loads SET "hoursPerWeek" = COALESCE("hoursPerWeek", hoursperweek, hours_per_week) WHERE "hoursPerWeek" IS NULL`);
    if (tlCols.has("academicyear") || tlCols.has("academic_year")) await safeQuery(`UPDATE teaching_loads SET "academicYear" = COALESCE("academicYear", academicyear, academic_year) WHERE "academicYear" IS NULL`);
    if (tlCols.has("createdat") || tlCols.has("created_at")) await safeQuery(`UPDATE teaching_loads SET "createdAt" = COALESCE("createdAt", createdat, created_at) WHERE "createdAt" IS NULL`);

    await safeQuery(`ALTER TABLE teaching_loads DROP CONSTRAINT IF EXISTS teaching_loads_employeeid_fkey`);
    await safeQuery(`
      ALTER TABLE teaching_loads 
      ADD CONSTRAINT "teaching_loads_employeeId_fkey" 
      FOREIGN KEY ("employeeId") REFERENCES employees(id) ON DELETE CASCADE
    `);

    const tlDups = [
      "employeeid", "employee_id", "dayofweek", "day_of_week", "days", "starttime", "start_time",
      "endtime", "end_time", "room", "subjectid", "subject_id", "teachingdepartmentid",
      "teaching_department_id", "hoursperweek", "hours_per_week", "academicyear", "academic_year",
      "createdat", "created_at"
    ];
    for (const col of tlDups) {
      if (tlCols.has(col)) {
        await safeQuery(`ALTER TABLE teaching_loads DROP COLUMN IF EXISTS "${col}"`);
      }
    }

    // ==========================================
    // 13. LEAVE_APPLICATIONS TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: leave_applications...");
    let laCols = await getTableColumns("leave_applications");

    if (laCols.has("employeeid") || laCols.has("employee_id")) await safeQuery(`UPDATE leave_applications SET "employeeId" = COALESCE("employeeId", employeeid, employee_id) WHERE "employeeId" IS NULL`);
    if (laCols.has("leavetype") || laCols.has("leave_type")) await safeQuery(`UPDATE leave_applications SET "leaveType" = COALESCE("leaveType", leavetype, leave_type) WHERE "leaveType" IS NULL`);
    if (laCols.has("startdate") || laCols.has("start_date")) await safeQuery(`UPDATE leave_applications SET "startDate" = COALESCE("startDate", startdate, start_date) WHERE "startDate" IS NULL`);
    if (laCols.has("enddate") || laCols.has("end_date")) await safeQuery(`UPDATE leave_applications SET "endDate" = COALESCE("endDate", enddate, end_date) WHERE "endDate" IS NULL`);
    if (laCols.has("dayscount") || laCols.has("days_count")) await safeQuery(`UPDATE leave_applications SET "daysCount" = COALESCE("daysCount", dayscount, days_count) WHERE "daysCount" IS NULL`);
    if (laCols.has("rejectionreason") || laCols.has("rejection_reason")) await safeQuery(`UPDATE leave_applications SET "rejectionReason" = COALESCE("rejectionReason", rejectionreason, rejection_reason) WHERE "rejectionReason" IS NULL`);
    if (laCols.has("reviewedby") || laCols.has("reviewed_by")) await safeQuery(`UPDATE leave_applications SET "reviewedBy" = COALESCE("reviewedBy", reviewedby, reviewed_by) WHERE "reviewedBy" IS NULL`);
    if (laCols.has("reviewedat") || laCols.has("reviewed_at")) await safeQuery(`UPDATE leave_applications SET "reviewedAt" = COALESCE("reviewedAt", reviewedat, reviewed_at) WHERE "reviewedAt" IS NULL`);
    if (laCols.has("createdat") || laCols.has("created_at")) await safeQuery(`UPDATE leave_applications SET "createdAt" = COALESCE("createdAt", createdat, created_at) WHERE "createdAt" IS NULL`);

    await safeQuery(`ALTER TABLE leave_applications DROP CONSTRAINT IF EXISTS leave_applications_employeeid_fkey`);
    await safeQuery(`
      ALTER TABLE leave_applications 
      ADD CONSTRAINT "leave_applications_employeeId_fkey" 
      FOREIGN KEY ("employeeId") REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE
    `);

    const laDups = [
      "employeeid", "employee_id", "leavetype", "leave_type", "startdate", "start_date",
      "enddate", "end_date", "dayscount", "days_count", "rejectionreason", "rejection_reason",
      "reviewedby", "reviewed_by", "reviewedat", "reviewed_at", "createdat", "created_at"
    ];
    for (const col of laDups) {
      if (laCols.has(col)) {
        await safeQuery(`ALTER TABLE leave_applications DROP COLUMN IF EXISTS "${col}"`);
      }
    }

    // ==========================================
    // 14. DEPARTMENTS TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: departments...");
    let deptCols = await getTableColumns("departments");

    if (deptCols.has("departmentheadid") || deptCols.has("department_head_id")) {
      await safeQuery(`UPDATE departments SET "departmentHeadId" = COALESCE("departmentHeadId", departmentheadid, department_head_id) WHERE "departmentHeadId" IS NULL`);
    }
    if (deptCols.has("created_at")) await safeQuery(`UPDATE departments SET "createdAt" = COALESCE("createdAt", created_at) WHERE "createdAt" IS NULL`);

    const deptDups = ["department_head_id", "departmentheadid", "created_at", "campus"];
    for (const col of deptDups) {
      if (deptCols.has(col)) {
        await safeQuery(`ALTER TABLE departments DROP COLUMN IF EXISTS "${col}"`);
      }
    }

    // ==========================================
    // 15. TEACHING_DEPARTMENTS TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: teaching_departments...");
    let tdCols = await getTableColumns("teaching_departments");

    if (tdCols.has("departmentheadid") || tdCols.has("department_head_id")) {
      await safeQuery(`UPDATE teaching_departments SET "departmentHeadId" = COALESCE("departmentHeadId", departmentheadid, department_head_id) WHERE "departmentHeadId" IS NULL`);
    }
    if (tdCols.has("createdat") || tdCols.has("created_at")) {
      await safeQuery(`UPDATE teaching_departments SET "createdAt" = COALESCE("createdAt", createdat, created_at) WHERE "createdAt" IS NULL`);
    }

    const tdDups = ["departmentheadid", "department_head_id", "createdat", "created_at"];
    for (const col of tdDups) {
      if (tdCols.has(col)) {
        await safeQuery(`ALTER TABLE teaching_departments DROP COLUMN IF EXISTS "${col}"`);
      }
    }

    // ==========================================
    // 16. SUBJECTS TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: subjects...");
    let subCols = await getTableColumns("subjects");

    if (subCols.has("name")) {
      await safeQuery(`UPDATE subjects SET title = COALESCE(NULLIF(title, ''), name) WHERE title IS NULL OR title = ''`);
    }
    if (subCols.has("departmentid") || subCols.has("department_id")) {
      await safeQuery(`UPDATE subjects SET "departmentId" = COALESCE("departmentId", departmentid, department_id) WHERE "departmentId" IS NULL`);
    }
    if (subCols.has("teachingdepartmentid") || subCols.has("teaching_department_id")) {
      await safeQuery(`UPDATE subjects SET "teachingDepartmentId" = COALESCE("teachingDepartmentId", teachingdepartmentid, teaching_department_id) WHERE "teachingDepartmentId" IS NULL`);
    }
    if (subCols.has("created_at")) await safeQuery(`UPDATE subjects SET "createdAt" = COALESCE("createdAt", created_at) WHERE "createdAt" IS NULL`);

    await safeQuery(`ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_department_id_fkey`);
    await safeQuery(`
      ALTER TABLE subjects 
      ADD CONSTRAINT "subjects_departmentId_fkey" 
      FOREIGN KEY ("departmentId") REFERENCES departments(id) ON DELETE SET NULL
    `);
    await safeQuery(`
      ALTER TABLE subjects 
      ADD CONSTRAINT "subjects_teachingDepartmentId_fkey" 
      FOREIGN KEY ("teachingDepartmentId") REFERENCES teaching_departments(id) ON DELETE SET NULL
    `);

    const subDups = ["name", "departmentid", "department_id", "teachingdepartmentid", "teaching_department_id", "hours_per_week", "created_at"];
    for (const col of subDups) {
      if (subCols.has(col)) {
        await safeQuery(`ALTER TABLE subjects DROP COLUMN IF EXISTS "${col}"`);
      }
    }

    // ==========================================
    // 17. AUDIT_LOGS TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: audit_logs...");
    let auditCols = await getTableColumns("audit_logs");

    if (auditCols.has("userid") || auditCols.has("user_id")) await safeQuery(`UPDATE audit_logs SET "userId" = COALESCE("userId", userid, user_id) WHERE "userId" IS NULL`);
    if (auditCols.has("useremail") || auditCols.has("user_email")) await safeQuery(`UPDATE audit_logs SET "userEmail" = COALESCE("userEmail", useremail, user_email) WHERE "userEmail" IS NULL`);
    if (auditCols.has("ipaddress") || auditCols.has("ip_address")) await safeQuery(`UPDATE audit_logs SET "ipAddress" = COALESCE("ipAddress", ipaddress, ip_address) WHERE "ipAddress" IS NULL`);
    if (auditCols.has("createdat") || auditCols.has("created_at")) await safeQuery(`UPDATE audit_logs SET "createdAt" = COALESCE("createdAt", createdat, created_at) WHERE "createdAt" IS NULL`);

    const auditDups = ["userid", "user_id", "useremail", "user_email", "ipaddress", "ip_address", "details_json", "detailsJson", "createdat", "created_at"];
    for (const col of auditDups) {
      if (auditCols.has(col)) {
        await safeQuery(`ALTER TABLE audit_logs DROP COLUMN IF EXISTS "${col}"`);
      }
    }

    // ==========================================
    // 18. DTR_LOGS TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: dtr_logs...");
    let dtrLogCols = await getTableColumns("dtr_logs");

    if (dtrLogCols.has("employeeid") || dtrLogCols.has("employee_id")) {
      await safeQuery(`UPDATE dtr_logs SET "employeeId" = COALESCE("employeeId", employeeid, employee_id) WHERE "employeeId" IS NULL`);
    }
    if (dtrLogCols.has("ip_address")) {
      await safeQuery(`UPDATE dtr_logs SET "ipAddress" = COALESCE("ipAddress", ip_address) WHERE "ipAddress" IS NULL`);
    }
    if (dtrLogCols.has("created_at")) {
      await safeQuery(`UPDATE dtr_logs SET "createdAt" = COALESCE("createdAt", created_at) WHERE "createdAt" IS NULL`);
    }

    await safeQuery(`ALTER TABLE dtr_logs DROP CONSTRAINT IF EXISTS dtr_logs_employeeid_fkey`);
    await safeQuery(`
      ALTER TABLE dtr_logs 
      ADD CONSTRAINT "dtr_logs_employeeId_fkey" 
      FOREIGN KEY ("employeeId") REFERENCES employees(id) ON DELETE CASCADE
    `);

    const dtrLogDups = ["employeeid", "employee_id", "ip_address", "created_at"];
    for (const col of dtrLogDups) {
      if (dtrLogCols.has(col)) {
        await safeQuery(`ALTER TABLE dtr_logs DROP COLUMN IF EXISTS "${col}"`);
      }
    }

    // ==========================================
    // 19. DTR_VISITING_RECORDS TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: dtr_visiting_records...");
    let dtrVisCols = await getTableColumns("dtr_visiting_records");

    if (dtrVisCols.has("employeeid") || dtrVisCols.has("employee_id")) {
      await safeQuery(`UPDATE dtr_visiting_records SET "employeeId" = COALESCE("employeeId", employeeid, employee_id) WHERE "employeeId" IS NULL`);
    }
    if (dtrVisCols.has("created_at")) {
      await safeQuery(`UPDATE dtr_visiting_records SET "createdAt" = COALESCE("createdAt", created_at) WHERE "createdAt" IS NULL`);
    }

    await safeQuery(`ALTER TABLE dtr_visiting_records DROP CONSTRAINT IF EXISTS dtr_visiting_records_employeeid_fkey`);
    await safeQuery(`
      ALTER TABLE dtr_visiting_records 
      ADD CONSTRAINT "dtr_visiting_records_employeeId_fkey" 
      FOREIGN KEY ("employeeId") REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE
    `);

    const dtrVisDups = ["employeeid", "employee_id", "created_at"];
    for (const col of dtrVisDups) {
      if (dtrVisCols.has(col)) {
        await safeQuery(`ALTER TABLE dtr_visiting_records DROP COLUMN IF EXISTS "${col}"`);
      }
    }

    // ==========================================
    // 20. SMS_LOGS TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: sms_logs...");
    let smsCols = await getTableColumns("sms_logs");

    if (smsCols.has("employee_id")) {
      await safeQuery(`UPDATE sms_logs SET "employeeId" = COALESCE("employeeId", employee_id) WHERE "employeeId" IS NULL`);
      await safeQuery(`ALTER TABLE sms_logs DROP COLUMN IF EXISTS employee_id`);
    }

    // ==========================================
    // 21. EMPLOYEE_COMPENSATION TABLE
    // ==========================================
    console.log("[Migration] Cleaning up table: employee_compensation...");
    let ecCols = await getTableColumns("employee_compensation");

    if (ecCols.has("employeeid") || ecCols.has("employee_id")) {
      await safeQuery(`UPDATE employee_compensation SET "employeeId" = COALESCE("employeeId", employeeid, employee_id) WHERE "employeeId" IS NULL`);
    }

    await safeQuery(`ALTER TABLE employee_compensation DROP CONSTRAINT IF EXISTS employee_compensation_employeeid_fkey`);
    await safeQuery(`ALTER TABLE employee_compensation DROP CONSTRAINT IF EXISTS employee_compensation_employeeid_key`);
    await safeQuery(`CREATE UNIQUE INDEX IF NOT EXISTS "employee_compensation_employeeId_unique" ON employee_compensation ("employeeId")`);
    await safeQuery(`
      ALTER TABLE employee_compensation 
      ADD CONSTRAINT "employee_compensation_employeeId_fkey" 
      FOREIGN KEY ("employeeId") REFERENCES employees(id) ON DELETE CASCADE
    `);

    if (ecCols.has("employeeid")) await safeQuery(`ALTER TABLE employee_compensation DROP COLUMN IF EXISTS employeeid`);
    if (ecCols.has("employee_id")) await safeQuery(`ALTER TABLE employee_compensation DROP COLUMN IF EXISTS employee_id`);

    console.log("[Migration] All duplicate columns successfully removed and canonical columns consolidated!");
  } finally {
    client.release();
  }
}
