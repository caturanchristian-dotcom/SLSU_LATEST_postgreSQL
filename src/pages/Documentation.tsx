import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { FileText, GitBranch, Shield, Zap, Database, Download, CheckCircle, RefreshCw, Server, AlertCircle, Radio, Link2, Sparkles } from 'lucide-react';
import { SchoolApiSyncModal } from '../components/SchoolApiSyncModal';

mermaid.initialize({
  startOnLoad: true,
  theme: 'neutral',
  securityLevel: 'loose',
  fontFamily: 'Inter, sans-serif',
});

const Mermaid = ({ chart }: { chart: string }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      mermaid.contentLoaded();
    }
  }, [chart]);

  return (
    <div className="mermaid flex justify-center bg-white p-8 rounded-2xl border border-neutral-100 shadow-sm overflow-x-auto" ref={ref}>
      {chart}
    </div>
  );
};

const Documentation = () => {
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [loadingDb, setLoadingDb] = useState(false);
  const [testHost, setTestHost] = useState('localhost');
  const [testPort, setTestPort] = useState('3306');
  const [testUser, setTestUser] = useState('root');
  const [testPass, setTestPass] = useState('');
  const [testDbName, setTestDbName] = useState('payroll');
  const [testResult, setTestResult] = useState<any>(null);
  const [testingConn, setTestingConn] = useState(false);

  const fetchDbStatus = async () => {
    setLoadingDb(true);
    try {
      const res = await fetch('/api/database/status');
      if (res.ok) {
        const data = await res.json();
        setDbStatus(data);
      }
    } catch (e) {
      console.error('Failed to fetch DB status:', e);
    } finally {
      setLoadingDb(false);
    }
  };

  useEffect(() => {
    fetchDbStatus();
  }, []);

  const handleTestConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestingConn(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/database/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: testHost,
          port: testPort,
          user: testUser,
          password: testPass,
          database: testDbName,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTestingConn(false);
    }
  };

  const payrollChart = `
    graph TD
      A[Start Payroll Cycle] --> B{Cycle Type?}
      B -- Monthly --> C[Basic Salary / 1]
      B -- Semi-Monthly --> D[Basic Salary / 2]
      C --> E[Process Attendance]
      D --> E
      E --> F[Calculate Deductions]
      F --> G[Generate Gross Pay]
      G --> H[Finalize Net Pay]
      H --> I[Disbursement]
      I --> J[Release Payslips]
  `;

  const dtrChart = `
    graph LR
      A[Employee Login] --> B[Check Status]
      B --> C{Current Status?}
      C -- Out/Empty --> D[Clock In]
      C -- In --> E[Clock Out]
      D --> F[Log Entry Created]
      E --> G[Log Entry Updated]
      F --> H[Attendance History]
      G --> H
  `;

  const schoolApiChart = `
    graph TD
      subgraph School Central Systems
        A[School SIS / HRIS Database]
        B[Biometric Turnstiles / RFID Readers]
        C[Academic Load System]
      end

      subgraph School REST API Gateway
        D[GET /api/v1/employees]
        E[GET /api/v1/dtr]
        F[GET /api/v1/schedules]
        G[POST /webhook/dtr-punch]
      end

      subgraph SLSU Payroll Engine
        H[(MySQL Payroll DB)]
        I[Automatic DTR Metric Parser]
        J[Payroll Generation Engine]
      end

      A --> D
      B --> E
      B -->|Instant Push| G
      C --> F

      D -->|Sync Faculty & Staff| H
      E -->|Pull Attendance| I
      G -->|Real-Time Punch| I
      F -->|Sync Teaching Loads| H
      I --> H
      H --> J
  `;

  return (
    <div className="space-y-10 pb-20">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-neutral-900 mb-2">System Documentation & Database</h1>
        <p className="text-neutral-500 text-lg">Understanding the logic, workflow, and relational MySQL architecture of the SLSU Payroll System.</p>
      </div>

      {/* Database & MySQL Architecture Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-neutral-900">Database Engine & MySQL Configuration</h2>
              <p className="text-sm text-neutral-500">Native MySQL database support with automatic schema synchronization and fail-safe persistence.</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDbStatus}
            disabled={loadingDb}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loadingDb ? 'animate-spin' : ''}`} />
            Refresh Status
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 bg-white border-neutral-200 rounded-2xl shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Active Engine</span>
              <span className={`px-2.5 py-1 text-xs font-bold rounded-full uppercase ${
                dbStatus?.engine === 'mysql' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
              }`}>
                {dbStatus?.engine ? `${dbStatus.engine.toUpperCase()}` : 'Detecting...'}
              </span>
            </div>
            <div>
              <p className="text-2xl font-black text-neutral-900">{dbStatus?.engine === 'mysql' ? 'MySQL Database' : 'SQLite Relational'}</p>
              <p className="text-xs text-neutral-500 mt-1">
                {dbStatus?.engine === 'mysql'
                  ? `Connected to ${dbStatus.host}:${dbStatus.port || 3306} (${dbStatus.database})`
                  : 'Embedded high-performance relational storage'}
              </p>
            </div>
            <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-600">
              <span>Managed Tables:</span>
              <span className="font-bold text-neutral-900">{dbStatus?.tablesCount || 28} Tables</span>
            </div>
          </Card>

          <Card className="p-6 bg-white border-neutral-200 rounded-2xl shadow-xs space-y-4">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">MySQL DDL & Dumps</span>
            <div>
              <p className="text-sm font-bold text-neutral-800">Export & Backup Schema</p>
              <p className="text-xs text-neutral-500 mt-1">Download ready-to-run MySQL scripts with all tables, constraints, and current live data.</p>
            </div>
            <div className="pt-2 border-t border-neutral-100 flex flex-col gap-2">
              <a
                href="/api/database/mysql-dump"
                download
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download Full MySQL Dump (.sql)
              </a>
              <a
                href="/api/database/schema-sql"
                download
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                Download Schema DDL Only (.sql)
              </a>
            </div>
          </Card>

          <Card className="p-6 bg-white border-neutral-200 rounded-2xl shadow-xs space-y-3">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Configuration Variables</span>
            <p className="text-xs text-neutral-600">Provide these standard variables in your environment to connect directly to any MySQL instance:</p>
            <pre className="p-3 bg-neutral-900 text-neutral-100 rounded-xl text-[11px] font-mono overflow-x-auto leading-relaxed">
{`MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=secret
MYSQL_DATABASE=payroll`}
            </pre>
          </Card>
        </div>

        {/* Live MySQL Connection Tester */}
        <Card className="p-6 bg-white border-neutral-200 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-2.5">
            <Server className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-neutral-900">Live MySQL Connection Diagnostics</h3>
          </div>
          <form onSubmit={handleTestConnection} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Host</label>
              <input
                type="text"
                value={testHost}
                onChange={(e) => setTestHost(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:border-emerald-500"
                placeholder="localhost"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Port</label>
              <input
                type="number"
                value={testPort}
                onChange={(e) => setTestPort(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:border-emerald-500"
                placeholder="3306"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">User</label>
              <input
                type="text"
                value={testUser}
                onChange={(e) => setTestUser(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:border-emerald-500"
                placeholder="root"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Password</label>
              <input
                type="password"
                value={testPass}
                onChange={(e) => setTestPass(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:border-emerald-500"
                placeholder="(optional)"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Database</label>
              <input
                type="text"
                value={testDbName}
                onChange={(e) => setTestDbName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:border-emerald-500"
                placeholder="payroll"
                required
              />
            </div>
            <div className="md:col-span-5 flex items-center justify-between pt-2">
              <Button
                type="submit"
                size="sm"
                disabled={testingConn}
                className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs px-4"
              >
                {testingConn ? 'Testing MySQL Server...' : 'Test Connection'}
              </Button>
              {testResult && (
                <div className={`flex items-center gap-2 text-xs font-medium ${testResult.success ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {testResult.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  <span>{testResult.message || testResult.error} {testResult.version ? `(MySQL Version: ${testResult.version})` : ''}</span>
                </div>
              )}
            </div>
          </form>
        </Card>
      </section>

      {/* School REST API & Biometrics Gateway Section */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-900 text-emerald-300 rounded-xl">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-neutral-900">School REST API & Biometrics Gateway (Option 2)</h2>
              <p className="text-sm text-neutral-500">Live API and Webhook integration connecting Employees, DTR Biometrics, and Class Schedules to central school servers.</p>
            </div>
          </div>
          <SchoolApiSyncModal
            triggerButton={
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-10 px-5 rounded-xl shadow-sm gap-2">
                <Radio className="w-4 h-4 animate-pulse" />
                Open Sync & API Center
              </Button>
            }
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 bg-white border-neutral-200 rounded-2xl shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <Link2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-neutral-900">1. Employees & Faculty Sync</h3>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Consumes <code className="text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded font-mono">GET /api/v1/employees</code> to automatically populate or update staff profiles, designations, salary rates, and campus assignments.
            </p>
          </Card>

          <Card className="p-6 bg-white border-neutral-200 rounded-2xl shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
              <Radio className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-neutral-900">2. Attendance & Turnstiles</h3>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Accepts instant biometric punches from physical turnstiles via <code className="text-blue-700 bg-blue-50 px-1 py-0.5 rounded font-mono">POST /webhook/dtr-punch</code> or batch pulls via <code className="text-blue-700 bg-blue-50 px-1 py-0.5 rounded font-mono">GET /api/v1/dtr</code>.
            </p>
          </Card>

          <Card className="p-6 bg-white border-neutral-200 rounded-2xl shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-neutral-900">3. Class Schedules & Loads</h3>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Queries <code className="text-purple-700 bg-purple-50 px-1 py-0.5 rounded font-mono">GET /api/v1/schedules</code> to import teaching units, sections, and room assignments for accurate visiting and overload compensation.
            </p>
          </Card>
        </div>

        <Mermaid chart={schoolApiChart} />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 bg-white border-neutral-100 rounded-3xl shadow-sm hover:shadow-md transition-shadow">
          <Zap className="w-8 h-8 text-amber-500 mb-4" />
          <h3 className="font-bold text-lg mb-2">Automated Calculations</h3>
          <p className="text-sm text-neutral-500">Gross and net pay are automatically computed based on salary category and semi-monthly divisions.</p>
        </Card>
        <Card className="p-6 bg-white border-neutral-100 rounded-3xl shadow-sm hover:shadow-md transition-shadow">
          <FileText className="w-8 h-8 text-blue-500 mb-4" />
          <h3 className="font-bold text-lg mb-2">Dynamic Payslips</h3>
          <p className="text-sm text-neutral-500">Real-time PDF generation for payslips, including breakdown of earnings and statutory deductions.</p>
        </Card>
        <Card className="p-6 bg-white border-neutral-100 rounded-3xl shadow-sm hover:shadow-md transition-shadow">
          <Shield className="w-8 h-8 text-emerald-500 mb-4" />
          <h3 className="font-bold text-lg mb-2">Role-Based Access</h3>
          <p className="text-sm text-neutral-500">Strict security boundaries between Admins, Payroll Officers, and regular Employees.</p>
        </Card>
      </div>

      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <GitBranch className="w-6 h-6 text-neutral-900" />
          <h2 className="text-2xl font-bold text-neutral-900">Payroll Processing Pipeline</h2>
        </div>
        <Mermaid chart={payrollChart} />
        <div className="bg-neutral-50 p-6 rounded-2xl border border-neutral-200">
          <h4 className="font-bold mb-2">Key Pipeline Stages:</h4>
          <ul className="list-disc list-inside space-y-2 text-sm text-neutral-600">
            <li><strong>Cycle Initiation:</strong> Define period (e.g., April 1-15) and cycle type.</li>
            <li><strong>Calculation Engine:</strong> Basic salary is halved for semi-monthly cycles.</li>
            <li><strong>Deduction Matrix:</strong> Fixed and variable deductions (SSS, PhilHealth, Pag-IBIG) are applied.</li>
            <li><strong>Validation:</strong> Admin reviews the processed list before disbursement.</li>
          </ul>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-neutral-900" />
          <h2 className="text-2xl font-bold text-neutral-900">Attendance (DTR) Workflow</h2>
        </div>
        <Mermaid chart={dtrChart} />
        <div className="bg-neutral-50 p-6 rounded-2xl border border-neutral-200">
          <h4 className="font-bold mb-2">DTR Business Rules:</h4>
          <p className="text-sm text-neutral-600 mb-4">The Daily Time Record (DTR) system ensures accurate tracking of hours rendered.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-white rounded-xl border border-neutral-100">
              <h5 className="font-bold text-xs uppercase tracking-wider text-neutral-400 mb-1">Clock-In</h5>
              <p className="text-sm">Captures precise timestamp and associates it with the current date.</p>
            </div>
            <div className="p-4 bg-white rounded-xl border border-neutral-100">
              <h5 className="font-bold text-xs uppercase tracking-wider text-neutral-400 mb-1">Clock-Out</h5>
              <p className="text-sm">Updates the existing log for the day or creates a completion entry.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Documentation;
