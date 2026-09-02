import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, 
  Database, 
  Users, 
  Clock, 
  Calendar, 
  Zap, 
  Settings2, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Link2, 
  Copy, 
  Check, 
  Activity, 
  ArrowRight,
  Sparkles,
  Terminal,
  ExternalLink,
  ChevronRight,
  Layers,
  Radio,
  FileCode2,
  Trash2,
  Info
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from './ui/dialog';
import { toast } from 'sonner';

interface SchoolApiSyncModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerButton?: React.ReactNode;
  defaultTab?: 'sync' | 'config' | 'webhooks' | 'logs' | 'specs';
}

export const SchoolApiSyncModal: React.FC<SchoolApiSyncModalProps> = ({
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  triggerButton,
  defaultTab = 'sync'
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = isControlled ? (setControlledOpen || (() => {})) : setInternalOpen;

  const [activeTab, setActiveTab] = useState<'sync' | 'config' | 'webhooks' | 'logs' | 'specs'>(defaultTab);

  // Config State
  const [config, setConfig] = useState<any>({
    baseUrl: '',
    apiKey: '',
    bearerToken: '',
    webhookSecret: '',
    autoSync: false,
    syncInterval: 60,
    endpoints: {
      employees: '/api/v1/employees',
      dtr: '/api/v1/dtr',
      schedules: '/api/v1/schedules'
    },
    webhookUrls: {
      dtrPunch: '',
      employeeUpdate: ''
    }
  });
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Test Connection State
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Sync States
  const [syncingModule, setSyncingModule] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<Record<string, any>>({});
  const [dtrStartDate, setDtrStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [dtrEndDate, setDtrEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Webhook Test State
  const [webhookEmpId, setWebhookEmpId] = useState('emp-101');
  const [webhookPunchType, setWebhookPunchType] = useState('IN');
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<any>(null);

  // Logs State
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Copy state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchConfig = async () => {
    setLoadingConfig(true);
    try {
      const res = await fetch('/api/integrations/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (err) {
      console.error('Failed to load integration config:', err);
    } finally {
      setLoadingConfig(false);
    }
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch('/api/integrations/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error('Failed to load sync logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
      fetchLogs();
    }
  }, [isOpen]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/integrations/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: config.baseUrl,
          apiKey: config.apiKey,
          bearerToken: config.bearerToken
        })
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        toast.success(data.message || 'Connection verified successfully!');
      } else {
        toast.error(data.error || 'Could not establish connection');
      }
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
      toast.error('Connection test failed');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await fetch('/api/integrations/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (data.success) {
        toast.success('School API configuration saved!');
        fetchConfig();
      } else {
        toast.error(data.error || 'Failed to save configuration');
      }
    } catch (err: any) {
      toast.error(err.message || 'Network error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleUseSimulator = () => {
    const simUrl = `${window.location.origin}/api/integrations/mock/school-api`;
    setConfig({
      ...config,
      baseUrl: simUrl,
      endpoints: {
        employees: '/employees',
        dtr: '/dtr',
        schedules: '/schedules'
      }
    });
    toast.info('Loaded Built-in School HRIS Simulator URL!');
  };

  const handleSyncEmployees = async () => {
    setSyncingModule('employees');
    const toastId = toast.loading('Synchronizing employees from School API...');
    try {
      const res = await fetch('/api/integrations/sync/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message, { id: toastId });
        setSyncResults((prev) => ({ ...prev, employees: data }));
        fetchLogs();
      } else {
        toast.error(data.error || 'Employees sync failed', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to sync employees', { id: toastId });
    } finally {
      setSyncingModule(null);
    }
  };

  const handleSyncDtr = async () => {
    setSyncingModule('dtr');
    const toastId = toast.loading('Pulling biometrics & attendance records...');
    try {
      const res = await fetch('/api/integrations/sync/dtr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: dtrStartDate, endDate: dtrEndDate })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message, { id: toastId });
        setSyncResults((prev) => ({ ...prev, dtr: data }));
        fetchLogs();
      } else {
        toast.error(data.error || 'DTR sync failed', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to sync DTR', { id: toastId });
    } finally {
      setSyncingModule(null);
    }
  };

  const handleSyncSchedules = async () => {
    setSyncingModule('schedules');
    const toastId = toast.loading('Syncing faculty schedules & teaching loads...');
    try {
      const res = await fetch('/api/integrations/sync/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message, { id: toastId });
        setSyncResults((prev) => ({ ...prev, schedules: data }));
        fetchLogs();
      } else {
        toast.error(data.error || 'Schedules sync failed', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to sync schedules', { id: toastId });
    } finally {
      setSyncingModule(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncingModule('all');
    const toastId = toast.loading('Running full School System synchronization...');
    try {
      const res = await fetch('/api/integrations/sync/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Full School Synchronization Completed!', { id: toastId });
        setSyncResults((prev) => ({ ...prev, all: data }));
        fetchLogs();
      } else {
        toast.error(data.error || 'Sync encountered errors', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to sync', { id: toastId });
    } finally {
      setSyncingModule(null);
    }
  };

  const handleTestPunchWebhook = async () => {
    setTestingWebhook(true);
    setWebhookResult(null);
    try {
      const res = await fetch('/api/integrations/webhook/dtr-punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: webhookEmpId,
          type: webhookPunchType,
          timestamp: new Date().toISOString(),
          terminalId: 'TURNSTILE-GATE-01',
          source: 'Simulated Biometric Reader',
          notes: 'Test Turnstile Punch'
        })
      });
      const data = await res.json();
      setWebhookResult(data);
      if (data.success) {
        toast.success(data.message || 'Biometric Punch Event logged successfully!');
      } else {
        toast.error(data.error || 'Failed to record punch');
      }
    } catch (err: any) {
      setWebhookResult({ success: false, error: err.message });
      toast.error('Webhook trigger failed');
    } finally {
      setTestingWebhook(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      const res = await fetch('/api/integrations/logs', { method: 'DELETE' });
      if (res.ok) {
        toast.success('Sync history cleared');
        setLogs([]);
      }
    } catch (e) {
      toast.error('Could not clear logs');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {triggerButton ? (
        <DialogTrigger render={triggerButton as any} />
      ) : (
        <DialogTrigger render={(props) => (
          <Button
            {...props}
            variant="outline"
            className="gap-2 border-emerald-300 text-emerald-800 bg-emerald-50/70 hover:bg-emerald-100/80 rounded-xl text-xs h-10 px-4 shadow-sm transition-all"
          >
            <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
            <span>School API Sync</span>
          </Button>
        )} />
      )}

      <DialogContent className="w-[95vw] max-w-6xl max-h-[92vh] flex flex-col bg-white rounded-3xl p-0 border border-neutral-200 shadow-2xl overflow-hidden">
        {/* Modal Header Banner */}
        <div className="bg-gradient-to-r from-emerald-950 via-neutral-950 to-emerald-900 text-white px-7 py-6 border-b border-emerald-800/30 relative shrink-0">
          <div className="absolute right-0 top-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shadow-inner shrink-0">
                <Radio className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-xl font-extrabold text-white tracking-tight font-sans">School REST API & Biometrics Gateway</h3>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5">
                    Live Sync
                  </Badge>
                </div>
                <p className="text-xs text-emerald-200/80 mt-0.5">
                  Synchronize Employees, DTR Biometrics, and Class Schedules with the university's central database.
                </p>
              </div>
            </div>

            {/* Quick Status Pill */}
            <div className="flex items-center gap-2.5 bg-black/40 backdrop-blur border border-white/10 px-4 py-2 rounded-xl text-xs shrink-0 self-start md:self-auto">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-neutral-200 font-medium">Gateway Active</span>
              <span className="text-neutral-500">|</span>
              <span className="text-emerald-400 font-mono text-[11px] truncate max-w-[200px]">
                {config.baseUrl ? 'Host Connected' : 'Using Simulator'}
              </span>
            </div>
          </div>

          {/* Navigation Tabs - Horizontal Bar */}
          <div className="flex items-center gap-2 mt-5 pt-4 border-t border-white/10 overflow-x-auto scrollbar-none text-xs">
            <button
              onClick={() => setActiveTab('sync')}
              className={`px-4 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 shrink-0 ${
                activeTab === 'sync'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-neutral-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Sync Center
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`px-4 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 shrink-0 ${
                activeTab === 'config'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-neutral-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              API Settings
            </button>
            <button
              onClick={() => setActiveTab('webhooks')}
              className={`px-4 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 shrink-0 ${
                activeTab === 'webhooks'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-neutral-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              Biometrics Webhook
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-4 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 shrink-0 ${
                activeTab === 'logs'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-neutral-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Sync History ({logs.length})
            </button>
            <button
              onClick={() => setActiveTab('specs')}
              className={`px-4 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 shrink-0 ${
                activeTab === 'specs'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-neutral-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5" />
              Developer Docs
            </button>
          </div>
        </div>

        {/* Modal Body - Scrollable with Wide Panes */}
        <div className="flex-1 overflow-y-auto px-7 py-6 space-y-6">
          {/* TAB 1: SYNC CENTER */}
          {activeTab === 'sync' && (
            <div className="space-y-6">
              {/* Target Server Info Card */}
              <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white border border-neutral-200 flex items-center justify-center text-neutral-700 shadow-sm">
                    <Database className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <div className="font-bold text-neutral-800">
                      Target School API Host: <span className="font-mono text-emerald-700">{config.baseUrl || 'Not Configured (Using Simulator)'}</span>
                    </div>
                    <div className="text-neutral-500 text-[11px] mt-0.5">
                      Endpoints mapped for Employees, Biometrics Attendance, and Class Schedules.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setActiveTab('config')}
                    className="h-8 text-xs font-semibold rounded-lg border-neutral-300 bg-white hover:bg-neutral-50"
                  >
                    Configure Host
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSyncAll}
                    disabled={!!syncingModule}
                    className="h-8 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm gap-1.5"
                  >
                    <Zap className={`w-3.5 h-3.5 ${syncingModule === 'all' ? 'animate-spin' : ''}`} />
                    Sync All Modules
                  </Button>
                </div>
              </div>

              {/* 3 Synchronization Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Employees Sync */}
                <Card className="rounded-2xl border border-neutral-200 shadow-sm hover:border-emerald-300 transition-all flex flex-col justify-between">
                  <CardHeader className="pb-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-2 font-bold">
                      <Users className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-sm font-bold text-neutral-800">Employees & Faculty</CardTitle>
                    <CardDescription className="text-xs text-neutral-500">
                      Syncs faculty & staff details, positions, salary rates, categories, and account logins.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    <div className="bg-neutral-50 p-2.5 rounded-xl border border-neutral-100 text-[11px] space-y-1 text-neutral-600">
                      <div className="flex justify-between">
                        <span>Endpoint:</span>
                        <span className="font-mono text-neutral-800 font-medium">{config.endpoints?.employees || '/api/v1/employees'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Sync Mode:</span>
                        <span className="font-semibold text-emerald-700">Upsert (Insert & Update)</span>
                      </div>
                    </div>

                    <Button
                      onClick={handleSyncEmployees}
                      disabled={!!syncingModule}
                      className="w-full bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold h-9 shadow-sm gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncingModule === 'employees' ? 'animate-spin' : ''}`} />
                      {syncingModule === 'employees' ? 'Syncing...' : 'Sync Employees'}
                    </Button>
                  </CardContent>
                </Card>

                {/* 2. DTR & Biometrics Sync */}
                <Card className="rounded-2xl border border-neutral-200 shadow-sm hover:border-emerald-300 transition-all flex flex-col justify-between">
                  <CardHeader className="pb-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center mb-2 font-bold">
                      <Clock className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-sm font-bold text-neutral-800">DTR & Biometrics</CardTitle>
                    <CardDescription className="text-xs text-neutral-500">
                      Pulls daily time-in/out attendance logs, calculating rendered hours, overtime, and tardiness.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[10px] font-semibold text-neutral-500">Start Date</label>
                        <Input
                          type="date"
                          value={dtrStartDate}
                          onChange={(e) => setDtrStartDate(e.target.value)}
                          className="h-7 text-[11px] rounded-lg border-neutral-200"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-neutral-500">End Date</label>
                        <Input
                          type="date"
                          value={dtrEndDate}
                          onChange={(e) => setDtrEndDate(e.target.value)}
                          className="h-7 text-[11px] rounded-lg border-neutral-200"
                        />
                      </div>
                    </div>

                    <Button
                      onClick={handleSyncDtr}
                      disabled={!!syncingModule}
                      className="w-full bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold h-9 shadow-sm gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncingModule === 'dtr' ? 'animate-spin' : ''}`} />
                      {syncingModule === 'dtr' ? 'Pulling DTR...' : 'Pull Attendance Logs'}
                    </Button>
                  </CardContent>
                </Card>

                {/* 3. Schedules & Teaching Loads */}
                <Card className="rounded-2xl border border-neutral-200 shadow-sm hover:border-emerald-300 transition-all flex flex-col justify-between">
                  <CardHeader className="pb-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center mb-2 font-bold">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-sm font-bold text-neutral-800">Class Schedules & Loads</CardTitle>
                    <CardDescription className="text-xs text-neutral-500">
                      Syncs assigned subjects, teaching loads, time slots, section codes, and room assignments.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    <div className="bg-neutral-50 p-2.5 rounded-xl border border-neutral-100 text-[11px] space-y-1 text-neutral-600">
                      <div className="flex justify-between">
                        <span>Target:</span>
                        <span className="font-semibold text-purple-700">1st Sem, AY 2025-2026</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Endpoint:</span>
                        <span className="font-mono text-neutral-800 font-medium">{config.endpoints?.schedules || '/api/v1/schedules'}</span>
                      </div>
                    </div>

                    <Button
                      onClick={handleSyncSchedules}
                      disabled={!!syncingModule}
                      className="w-full bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold h-9 shadow-sm gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncingModule === 'schedules' ? 'animate-spin' : ''}`} />
                      {syncingModule === 'schedules' ? 'Syncing...' : 'Sync Schedules'}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Instant Test Simulator Helper */}
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="text-xs">
                    <div className="font-bold text-emerald-950">Testing locally without live school servers?</div>
                    <div className="text-emerald-800 text-[11px]">
                      The system includes an integrated School HRIS & Biometrics simulator with realistic sample data.
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleUseSimulator}
                  className="shrink-0 border-emerald-300 text-emerald-900 bg-white hover:bg-emerald-50 text-xs font-bold h-8 rounded-xl"
                >
                  Use Internal Simulator
                </Button>
              </div>
            </div>
          )}

          {/* TAB 2: CONFIGURATION */}
          {activeTab === 'config' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-4">
                <div>
                  <h4 className="text-base font-bold text-neutral-900">School API Connection Settings</h4>
                  <p className="text-xs text-neutral-500 mt-0.5">Configure your university's central server base URL and authentication credentials.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleUseSimulator}
                  className="text-xs font-semibold gap-1.5 text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 h-9 rounded-xl self-start sm:self-auto"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Load Simulator URL
                </Button>
              </div>

              {/* 2-Column Wide Grid Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: Server Host & Credentials */}
                <div className="space-y-4 bg-neutral-50/70 p-5 rounded-2xl border border-neutral-200">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-neutral-600 flex items-center gap-2">
                    <Database className="w-3.5 h-3.5 text-emerald-600" />
                    Server Host & Authentication
                  </h5>

                  {/* Base URL */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-neutral-700">School API Base URL</Label>
                    <Input
                      placeholder="https://portal.slsu.edu.ph/api or http://localhost:3000/api/integrations/mock/school-api"
                      value={config.baseUrl}
                      onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                      className="font-mono text-xs h-10 rounded-xl bg-white"
                    />
                    <p className="text-[11px] text-neutral-400">
                      The root HTTP(S) endpoint where your school's HRIS / Biometrics API is exposed.
                    </p>
                  </div>

                  {/* Bearer Token */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-neutral-700">Bearer Token (Authorization Header)</Label>
                    <Input
                      type="password"
                      placeholder="e.g. eyJhbGciOiJIUzI1NiIsInR5cCI6Ik..."
                      value={config.bearerToken}
                      onChange={(e) => setConfig({ ...config, bearerToken: e.target.value })}
                      className="font-mono text-xs h-10 rounded-xl bg-white"
                    />
                  </div>

                  {/* API Key */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-neutral-700">Custom API Key (X-API-Key Header)</Label>
                    <Input
                      type="password"
                      placeholder="e.g. slsu_sec_key_99214"
                      value={config.apiKey}
                      onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                      className="font-mono text-xs h-10 rounded-xl bg-white"
                    />
                  </div>
                </div>

                {/* Right Column: Custom Endpoint Paths & Ping */}
                <div className="space-y-4 bg-neutral-50/70 p-5 rounded-2xl border border-neutral-200 flex flex-col justify-between">
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-3 flex items-center gap-2">
                      <Settings2 className="w-3.5 h-3.5 text-emerald-600" />
                      Custom Sub-Endpoint Paths
                    </h5>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-neutral-700">Employees Path</Label>
                        <Input
                          value={config.endpoints?.employees || '/api/v1/employees'}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              endpoints: { ...config.endpoints, employees: e.target.value }
                            })
                          }
                          className="font-mono text-xs h-9 rounded-xl bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-neutral-700">DTR Biometrics Path</Label>
                        <Input
                          value={config.endpoints?.dtr || '/api/v1/dtr'}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              endpoints: { ...config.endpoints, dtr: e.target.value }
                            })
                          }
                          className="font-mono text-xs h-9 rounded-xl bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-neutral-700">Class Schedules Path</Label>
                        <Input
                          value={config.endpoints?.schedules || '/api/v1/schedules'}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              endpoints: { ...config.endpoints, schedules: e.target.value }
                            })
                          }
                          className="font-mono text-xs h-9 rounded-xl bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Test Connection Feedback */}
                  {testResult && (
                    <div
                      className={`p-3.5 rounded-xl border text-xs flex items-start gap-3 mt-2 ${
                        testResult.success
                          ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                          : 'bg-rose-50/90 border-rose-200 text-rose-900'
                      }`}
                    >
                      {testResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-bold">
                          {testResult.success ? 'Connection Successful' : 'Connection Failed'} ({testResult.latencyMs}ms)
                        </div>
                        <div className="text-[11px] mt-0.5 opacity-90">{testResult.message || testResult.error}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-neutral-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testingConnection || !config.baseUrl}
                  className="gap-2 text-xs font-bold h-11 px-5 rounded-xl border-neutral-300 bg-white"
                >
                  <Activity className={`w-4 h-4 ${testingConnection ? 'animate-spin text-emerald-600' : 'text-neutral-500'}`} />
                  {testingConnection ? 'Pinging School Host...' : 'Test Connection & Ping'}
                </Button>

                <Button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-11 px-7 rounded-xl shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  {savingConfig ? 'Saving...' : 'Save Configuration'}
                </Button>
              </div>
            </div>
          )}

          {/* TAB 3: WEBHOOKS & TURNSTILES */}
          {activeTab === 'webhooks' && (
            <div className="space-y-6">
              <div className="border-b border-neutral-100 pb-4">
                <h4 className="text-base font-bold text-neutral-900">Real-Time Biometric Turnstile & RFID Webhooks</h4>
                <p className="text-xs text-neutral-500 mt-0.5">
                  School biometric devices (e.g., ZKTeco, Hikvision, RFID turnstiles) can push clock-in/out events immediately to this webhook.
                </p>
              </div>

              {/* 2-Column Wide Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Webhook URL & Instructions */}
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-neutral-800 flex items-center gap-2">
                        <Radio className="w-4 h-4 text-emerald-600" />
                        Inbound DTR Biometrics Webhook URL
                      </Label>
                      <Badge className="bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">POST</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={config.webhookUrls?.dtrPunch || `${window.location.origin}/api/integrations/webhook/dtr-punch`}
                        className="font-mono text-xs h-10 bg-white rounded-xl border-neutral-200"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleCopy(
                            config.webhookUrls?.dtrPunch || `${window.location.origin}/api/integrations/webhook/dtr-punch`,
                            'webhook-dtr'
                          )
                        }
                        className="shrink-0 h-10 px-4 gap-1.5 text-xs rounded-xl bg-white font-semibold"
                      >
                        {copiedKey === 'webhook-dtr' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                        Copy
                      </Button>
                    </div>
                    <p className="text-[11px] text-neutral-500 leading-relaxed">
                      Give this URL to your university's biometric turnstile administrator or IT team to configure automated push events.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 text-xs space-y-1.5 text-blue-950">
                    <div className="font-bold flex items-center gap-1.5">
                      <Info className="w-4 h-4 text-blue-600" />
                      Hardware Payload Compatibility
                    </div>
                    <p className="text-[11px] text-blue-900 leading-relaxed">
                      Accepts JSON payloads with <code className="bg-blue-100/80 px-1 py-0.5 rounded font-mono">employeeId</code>, <code className="bg-blue-100/80 px-1 py-0.5 rounded font-mono">timestamp</code>, and <code className="bg-blue-100/80 px-1 py-0.5 rounded font-mono">punchType</code> (IN, AM_OUT, PM_IN, OUT).
                    </p>
                  </div>
                </div>

                {/* Right: Interactive Turnstile Punch Simulator */}
                <div className="p-5 rounded-2xl border border-neutral-200 bg-white shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-neutral-800">
                    <Terminal className="w-4 h-4 text-emerald-600" />
                    <span>Test Real-Time Biometric Punch Push</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-neutral-600">Employee ID / No.</Label>
                      <Input
                        value={webhookEmpId}
                        onChange={(e) => setWebhookEmpId(e.target.value)}
                        placeholder="e.g. emp-101 or SLSU-2026-001"
                        className="text-xs h-10 rounded-xl"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-neutral-600">Punch Type</Label>
                      <select
                        value={webhookPunchType}
                        onChange={(e) => setWebhookPunchType(e.target.value)}
                        className="w-full h-10 px-3 text-xs border border-neutral-200 rounded-xl bg-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="IN">Time IN (Morning / Regular)</option>
                        <option value="AM_OUT">AM OUT (Lunch Break)</option>
                        <option value="PM_IN">PM IN (After Lunch)</option>
                        <option value="OUT">Time OUT (End of Day)</option>
                      </select>
                    </div>
                  </div>

                  <Button
                    onClick={handleTestPunchWebhook}
                    disabled={testingWebhook || !webhookEmpId}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-10 rounded-xl shadow-sm gap-2"
                  >
                    <Zap className={`w-4 h-4 ${testingWebhook ? 'animate-spin' : ''}`} />
                    {testingWebhook ? 'Pushing to Gateway...' : 'Trigger Test Hardware Punch'}
                  </Button>

                  {webhookResult && (
                    <div
                      className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                        webhookResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
                      }`}
                    >
                      {webhookResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <div className="overflow-hidden">
                        <div className="font-bold">{webhookResult.message}</div>
                        {webhookResult.punch && (
                          <div className="text-[11px] font-mono mt-1 opacity-80 truncate">
                            {JSON.stringify(webhookResult.punch)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LOGS & HISTORY */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-4">
                <div>
                  <h4 className="text-base font-bold text-neutral-900">Synchronization History & Logs</h4>
                  <p className="text-xs text-neutral-500 mt-0.5">Audit log of all past school API queries, biometrics pulls, and webhook events.</p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fetchLogs}
                    disabled={loadingLogs}
                    className="h-9 text-xs gap-1.5 rounded-xl bg-white"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                  {logs.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleClearLogs}
                      className="h-9 text-xs gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 rounded-xl"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear Logs
                    </Button>
                  )}
                </div>
              </div>

              {logs.length === 0 ? (
                <div className="text-center py-16 bg-neutral-50 rounded-2xl border border-neutral-200 text-neutral-500 text-xs">
                  <Activity className="w-10 h-10 mx-auto text-neutral-400 mb-3 opacity-50" />
                  <p className="font-bold text-sm text-neutral-700">No sync events recorded yet.</p>
                  <p className="text-xs text-neutral-400 mt-1">Execute a sync in the Sync Center to populate history.</p>
                </div>
              ) : (
                <div className="border border-neutral-200 rounded-2xl overflow-hidden bg-white divide-y divide-neutral-100">
                  {logs.map((log) => (
                    <div key={log.id} className="p-4 hover:bg-neutral-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3.5">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                            log.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {log.status === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="font-bold text-neutral-800 text-sm flex items-center gap-2 flex-wrap">
                            <span className="uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-700 font-mono font-bold">
                              {log.module}
                            </span>
                            <span>{log.message}</span>
                          </div>
                          <div className="text-xs text-neutral-400 mt-1 flex items-center gap-3 flex-wrap">
                            <span>{new Date(log.createdAt).toLocaleString()}</span>
                            <span>•</span>
                            <span>Processed: {log.recordsReceived || 0} records</span>
                            <span>•</span>
                            <span>Duration: {log.durationMs}ms</span>
                          </div>
                        </div>
                      </div>
                      <Badge
                        className={`text-[10px] uppercase font-bold shrink-0 self-start sm:self-auto ${
                          log.status === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {log.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: DEVELOPER DOCS & SPECS */}
          {activeTab === 'specs' && (
            <div className="space-y-6">
              <div className="border-b border-neutral-100 pb-4">
                <h4 className="text-base font-bold text-neutral-900">School IT / Developer API Specifications</h4>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Share these JSON payload formats with your university's MIS / IT Department to format their REST API output.
                </p>
              </div>

              {/* 3 Specifications side-by-side in 3 wide columns */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* 1. Employees Spec */}
                <div className="space-y-2.5 flex flex-col justify-between bg-neutral-50/60 p-4 rounded-2xl border border-neutral-200">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-neutral-800 flex items-center gap-2">
                      <Users className="w-4 h-4 text-emerald-600" />
                      <span>1. GET /api/v1/employees</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        handleCopy(
                          `[\n  {\n    "employeeId": "SLSU-2026-001",\n    "firstName": "Juan",\n    "lastName": "Dela Cruz",\n    "email": "juan.delacruz@slsu.edu.ph",\n    "category": "FACULTY",\n    "position": "Associate Professor I",\n    "basicSalary": 42000.00,\n    "salaryType": "monthly",\n    "campus": "Hinunangan Campus",\n    "phoneNumber": "09171234567"\n  }\n]`,
                          'spec-emp'
                        )
                      }
                      className="h-7 text-[11px] gap-1 px-2"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </Button>
                  </div>
                  <pre className="p-3 bg-neutral-900 text-emerald-400 rounded-xl text-[11px] font-mono overflow-x-auto max-h-[260px]">
{`[
  {
    "employeeId": "SLSU-2026-001",
    "firstName": "Juan",
    "lastName": "Dela Cruz",
    "email": "juan@slsu.edu.ph",
    "category": "FACULTY",
    "position": "Professor I",
    "basicSalary": 42000.00,
    "salaryType": "monthly",
    "campus": "Hinunangan",
    "phoneNumber": "09171234567"
  }
]`}
                  </pre>
                </div>

                {/* 2. DTR Spec */}
                <div className="space-y-2.5 flex flex-col justify-between bg-neutral-50/60 p-4 rounded-2xl border border-neutral-200">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-neutral-800 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600" />
                      <span>2. GET /api/v1/dtr</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        handleCopy(
                          `[\n  {\n    "employeeId": "SLSU-2026-001",\n    "date": "2026-08-18",\n    "amIn": "07:58",\n    "amOut": "12:00",\n    "pmIn": "12:55",\n    "pmOut": "17:02",\n    "hoursWorked": 8.0,\n    "status": "regular"\n  }\n]`,
                          'spec-dtr'
                        )
                      }
                      className="h-7 text-[11px] gap-1 px-2"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </Button>
                  </div>
                  <pre className="p-3 bg-neutral-900 text-blue-300 rounded-xl text-[11px] font-mono overflow-x-auto max-h-[260px]">
{`[
  {
    "employeeId": "SLSU-2026-001",
    "date": "2026-08-18",
    "amIn": "07:58",
    "amOut": "12:00",
    "pmIn": "12:55",
    "pmOut": "17:02",
    "hoursWorked": 8.0,
    "status": "regular"
  }
]`}
                  </pre>
                </div>

                {/* 3. Schedules Spec */}
                <div className="space-y-2.5 flex flex-col justify-between bg-neutral-50/60 p-4 rounded-2xl border border-neutral-200">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-neutral-800 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-purple-600" />
                      <span>3. GET /api/v1/schedules</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        handleCopy(
                          `[\n  {\n    "employeeId": "SLSU-2026-001",\n    "subject": "IT 101 - Intro to Computing",\n    "section": "BSIT 1-A",\n    "dayOfWeek": "Monday",\n    "startTime": "08:00",\n    "endTime": "10:00",\n    "room": "Lab 1",\n    "hoursPerWeek": 3.0\n  }\n]`,
                          'spec-sched'
                        )
                      }
                      className="h-7 text-[11px] gap-1 px-2"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </Button>
                  </div>
                  <pre className="p-3 bg-neutral-900 text-purple-300 rounded-xl text-[11px] font-mono overflow-x-auto max-h-[260px]">
{`[
  {
    "employeeId": "SLSU-2026-001",
    "subject": "IT 101",
    "section": "BSIT 1-A",
    "dayOfWeek": "Monday",
    "startTime": "08:00",
    "endTime": "10:00",
    "room": "Lab 1",
    "hoursPerWeek": 3.0
  }
]`}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-neutral-50 px-7 py-4 rounded-b-3xl border-t border-neutral-100 flex items-center justify-between text-xs shrink-0">
          <div className="text-neutral-500 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="font-medium">Encrypted REST API & Webhook Transmission</span>
          </div>
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            className="text-xs font-semibold h-9 px-5 rounded-xl border-neutral-200 hover:bg-neutral-100"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
