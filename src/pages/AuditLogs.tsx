import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { 
  ShieldAlert, 
  Search, 
  RefreshCw, 
  Clock, 
  User, 
  Terminal, 
  Activity, 
  Key, 
  FileText,
  Lock,
  Globe
} from 'lucide-react';
import { Badge } from '../components/ui/badge';

export default function AuditLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.audit.list();
      setLogs(res);
    } catch (e: any) {
      toast.error('Failed to get compliance audit logs: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (err) {
      return dateStr;
    }
  };

  // Extract unique actions for filter
  const uniqueActions = ['ALL', ...Array.from(new Set(logs.map(l => l.action).filter(Boolean))).sort((a, b) => a.localeCompare(b))];

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      log.detail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.ipAddress?.includes(searchTerm) ||
      log.userId?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;

    return matchesSearch && matchesAction;
  });

  const getActionBadgeStyle = (action: string) => {
    if (action.includes('REJECT') || action.includes('FAILED')) {
      return 'bg-red-100 text-red-800 border-0';
    }
    if (action.includes('APPROVE') || action.includes('VALIDATE')) {
      return 'bg-emerald-100 text-emerald-800 border-0';
    }
    if (action.includes('DISBURSE') || action.includes('PROCESS')) {
      return 'bg-neutral-900 text-white border-0';
    }
    if (action.includes('LOGIN_SUCCESS')) {
      return 'bg-blue-100 text-blue-800 border-0';
    }
    return 'bg-neutral-100 text-neutral-800 border-0';
  };

  const getActionIcon = (action: string) => {
    if (action.includes('LOGIN')) return <Key className="w-3.5 h-3.5" />;
    if (action.includes('CYCLE')) return <Activity className="w-3.5 h-3.5" />;
    if (action.includes('ENTRY')) return <FileText className="w-3.5 h-3.5" />;
    if (action.includes('DTR')) return <Clock className="w-3.5 h-3.5" />;
    return <Terminal className="w-3.5 h-3.5" />;
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
            <Lock className="w-8 h-8 text-neutral-700" />
            Compliance Audit Logs
          </h1>
          <p className="text-neutral-500">Water-tight event trail for all security, authentication, and financial transactions.</p>
        </div>
        <Button onClick={fetchLogs} variant="outline" size="sm" className="gap-2 shrink-0">
          <RefreshCw className="w-4 h-4" />
          Reload Audit Trail
        </Button>
      </div>

      {/* Filter Toolbar */}
      <Card className="rounded-2xl border-neutral-100 shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Search Input */}
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 w-4 h-4" />
              <Input
                type="text"
                placeholder="Search by user email, action content, IP or action info..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-neutral-50/50 border-neutral-200 focus:bg-white text-sm h-10 rounded-xl"
              />
            </div>
            
            {/* Action Filtering pills */}
            <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest shrink-0 mr-2">Filter:</span>
              {uniqueActions.slice(0, 7).map(act => (
                <button
                  key={act}
                  onClick={() => setActionFilter(act)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 ${
                    actionFilter === act 
                      ? 'bg-neutral-900 text-white font-semibold' 
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {act === 'ALL' ? 'All Activities' : act.replace('_', ' ')}
                </button>
              ))}
              {uniqueActions.length > 7 && actionFilter !== 'ALL' && !uniqueActions.slice(0, 7).includes(actionFilter) && (
                <button
                  onClick={() => setActionFilter(actionFilter)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 bg-neutral-900 text-white"
                >
                  {actionFilter.replace('_', ' ')}
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline Audit Logs table */}
      <Card className="rounded-2xl border-neutral-100 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 gap-3">
              <RefreshCw className="w-8 h-8 text-neutral-400 animate-spin" />
              <p className="text-neutral-500 text-sm">Querying secure compliance ledger...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-20 gap-3 text-center">
              <ShieldAlert className="w-12 h-12 text-neutral-300" />
              <h3 className="font-bold text-neutral-700">No logs matching filters found</h3>
              <p className="text-neutral-400 text-xs max-w-sm">No action logs exist with the given filters. Try modifying your search parameters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse text-left">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-100 text-neutral-400 text-xs font-bold uppercase tracking-wider">
                    <th className="py-4 px-6">Timestamp & Date</th>
                    <th className="py-4 px-6">Action / Event</th>
                    <th className="py-4 px-6">Actor User</th>
                    <th className="py-4 px-6">Compliance Context Details</th>
                    <th className="py-4 px-6">IP Trace</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-neutral-50/20 transition-colors">
                      {/* Timestamp */}
                      <td className="py-4 px-6 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-neutral-900 font-medium">
                          <Clock className="w-3.5 h-3.5 text-neutral-400" />
                          <span>{formatDate(log.createdAt)}</span>
                        </div>
                      </td>
                      
                      {/* Action Category */}
                      <td className="py-4 px-6 whitespace-nowrap">
                        <Badge className={`px-2.5 py-1 text-[11px] font-bold flex items-center gap-1.5 w-fit ${getActionBadgeStyle(log.action)}`}>
                          {getActionIcon(log.action)}
                          <span className="font-mono tracking-tight uppercase">{log.action}</span>
                        </Badge>
                      </td>

                      {/* Actor Email/Role */}
                      <td className="py-4 px-6">
                        <div className="flex flex-col">
                          <span className="text-xs text-neutral-500 font-mono">ID: {log.userId}</span>
                          <span className="font-bold text-neutral-800 text-xs flex items-center gap-1.5 mt-0.5">
                            <User className="w-3 h-3 text-neutral-400" />
                            {log.userEmail}
                          </span>
                        </div>
                      </td>

                      {/* Detail audit notes */}
                      <td className="py-4 px-6 max-w-md">
                        <p className="text-neutral-700 text-xs leading-relaxed font-mono">
                          {log.detail}
                        </p>
                      </td>

                      {/* Trace Address */}
                      <td className="py-4 px-6 font-mono text-neutral-400 text-xs">
                        <span className="flex items-center gap-1">
                          <Globe className="w-3 h-3 text-neutral-300" />
                          {log.ipAddress}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
