import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { 
  History as HistoryIcon, 
  Users, 
  CreditCard, 
  TrendingDown,
  Search,
  Calendar,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  UserPlus,
  Clock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from "../components/ui/badge";
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';

interface HistoryEvent {
  id: string;
  type: 'employee' | 'payroll' | 'deduction';
  title: string;
  date: string;
  amount?: number;
}

const History = () => {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'employee' | 'payroll' | 'deduction'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const data = await api.history.list();
      setEvents(data);
    } catch (error: any) {
      console.error('Failed to fetch history:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = events.filter(event => {
    const matchesSearch = event.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = activeFilter === 'all' || event.type === activeFilter;
    return matchesSearch && matchesFilter;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'employee': return <UserPlus className="w-5 h-5 text-blue-600" />;
      case 'payroll': return <TrendingDown className="w-5 h-5 text-emerald-600" />;
      case 'deduction': return <CreditCard className="w-5 h-5 text-red-600" />;
      default: return <Clock className="w-5 h-5 text-neutral-600" />;
    }
  };

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'employee': return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'payroll': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'deduction': return 'bg-red-50 text-red-700 border-red-100';
      default: return 'bg-neutral-50 text-neutral-700 border-neutral-100';
    }
  };

  const cn = (...inputs: any[]) => inputs.filter(Boolean).join(' ');

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-neutral-900">System History</h2>
          <p className="text-neutral-500">A chronological log of all system activities and transactions.</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-neutral-200 shadow-sm">
          {(['all', 'employee', 'payroll', 'deduction'] as const).map((filter) => (
            <Button
              key={filter}
              variant={activeFilter === filter ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveFilter(filter)}
              className={cn(
                "capitalize rounded-lg px-4",
                activeFilter === filter ? "bg-neutral-900 text-white" : "text-neutral-500"
              )}
            >
              {filter}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-blue-50/50 border-blue-100">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <Users className="w-5 h-5 text-blue-600" />
              <ArrowUpRight className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-sm text-blue-600 font-medium">Total Hires</p>
            <h3 className="text-2xl font-bold text-blue-900">{events.filter(e => e.type === 'employee').length}</h3>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50/50 border-emerald-100">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <TrendingDown className="w-5 h-5 text-emerald-600" />
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-sm text-emerald-600 font-medium">Payroll Cycles</p>
            <h3 className="text-2xl font-bold text-emerald-900">{events.filter(e => e.type === 'payroll').length}</h3>
          </CardContent>
        </Card>
        <Card className="bg-red-50/50 border-red-100">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <CreditCard className="w-5 h-5 text-red-600" />
              <ArrowDownRight className="w-4 h-4 text-red-400" />
            </div>
            <p className="text-sm text-red-600 font-medium">Total Deductions</p>
            <h3 className="text-2xl font-bold text-red-900">{events.filter(e => e.type === 'deduction').length}</h3>
          </CardContent>
        </Card>
      </div>

      <Card className="border-neutral-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-neutral-100 bg-neutral-50/50 flex items-center justify-between">
          <h3 className="font-bold text-neutral-900 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {activeFilter === 'all' ? 'Activity Timeline' : `${activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1)} Log`}
          </h3>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <Input 
              placeholder="Search history..." 
              className="pl-10 h-9 bg-white"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="divide-y divide-neutral-100 max-h-[600px] overflow-auto custom-scrollbar">
          {loading ? (
            <div className="p-12 text-center text-neutral-500">Loading history...</div>
          ) : filteredEvents.length === 0 ? (
            <div className="p-12 text-center">
              <HistoryIcon className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-neutral-900">No events found</h3>
              <p className="text-neutral-500">Try adjusting your search or filters.</p>
            </div>
          ) : (
            filteredEvents.map((event) => (
              <div key={event.id} className="p-6 hover:bg-neutral-50 transition-colors flex items-start gap-6">
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <div className={cn(
                    "p-3 rounded-xl",
                    getBadgeColor(event.type).split(' ')[0]
                  )}>
                    {getIcon(event.type)}
                  </div>
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-tighter">
                    {event.type.slice(0, 3)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-bold text-neutral-900 truncate">{event.title}</h4>
                    <span className="text-xs font-medium text-neutral-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(event.date), 'MMM dd, yyyy • hh:mm a')}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-500 leading-relaxed">
                    {event.type === 'employee' && `New staff member added to the system.`}
                    {event.type === 'payroll' && `Payroll cycle processed with a total net of ₱${formatCurrency(event.amount || 0)}.`}
                    {event.type === 'deduction' && `Deduction of ₱${formatCurrency(event.amount || 0)} applied to employee record.`}
                  </p>
                </div>
                <div className="shrink-0">
                  <Badge variant="outline" className={cn("font-bold", getBadgeColor(event.type))}>
                    {event.type.toUpperCase()}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};

export default History;
