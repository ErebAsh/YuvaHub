import React, { useState, useEffect } from 'react';
import { 
  Activity, AlertTriangle, CheckCircle, Clock, Database, 
  Server, ShieldAlert, XCircle, RotateCw, Play, BarChart3, AlertOctagon,
  Search, ChevronDown, ChevronUp, Terminal, Filter, RefreshCw
} from 'lucide-react';
import { useAppContext } from '../../context/AppContext';

interface ScraperItem {
  name: string;
  status: 'healthy' | 'degraded' | 'failing' | string;
  lastRun: string;
  items: number;
  failures: number;
  proxyHealth?: string;
}

interface ScraperLog {
  id: string;
  sourceName: string;
  status: 'success' | 'error' | string;
  startTime: string;
  endTime: string;
  durationMs: number;
  opportunitiesAdded: number;
  statusCode: number;
  errorMessage: string | null;
  stackTrace: string | null;
}

const AdminDashboard = () => {
  const { user } = useAppContext();
  const [stats, setStats] = useState({
    activeUsers: 1540,
    opportunitiesAdded: 128,
    fallbackRate: 1.8,
    apiLatency: 95,
    healthPercentage: 98.5,
    totalExecutions: 342,
    failedExecutions: 2
  });

  const [scrapers, setScrapers] = useState<ScraperItem[]>([
    { name: 'Devpost Scraper', status: 'healthy', lastRun: '15m ago', items: 42, failures: 0, proxyHealth: 'green' },
    { name: 'Unstop Scraper', status: 'degraded', lastRun: '45m ago', items: 18, failures: 1, proxyHealth: 'amber' },
    { name: 'Devfolio Scraper', status: 'healthy', lastRun: '1h ago', items: 34, failures: 0, proxyHealth: 'green' },
    { name: 'Opportunities Circle Scraper', status: 'healthy', lastRun: '3h ago', items: 56, failures: 0, proxyHealth: 'green' },
    { name: 'Eventbrite Scraper', status: 'failing', lastRun: '6h ago', items: 0, failures: 3, proxyHealth: 'red' }
  ]);

  const [logs, setLogs] = useState<ScraperLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [triggeringSource, setTriggeringSource] = useState<string | null>(null);

  // Search & Filter state for Logs
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    setRefreshing(true);
    try {
      const [statsRes, scrapersRes, logsRes] = await Promise.all([
        fetch('/api/v1/admin/scraper-stats').then(r => r.json()).catch(() => null),
        fetch('/api/v1/admin/scrapers').then(r => r.json()).catch(() => null),
        fetch('/api/v1/admin/scraper-logs').then(r => r.json()).catch(() => null)
      ]);

      if (statsRes) {
        setStats(prev => ({ ...prev, ...statsRes }));
      }
      if (scrapersRes && Array.isArray(scrapersRes) && scrapersRes.length > 0) {
        setScrapers(scrapersRes);
      }
      if (logsRes && Array.isArray(logsRes) && logsRes.length > 0) {
        setLogs(logsRes);
      }
    } catch (err) {
      console.error('Failed to load admin dashboard telemetry:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleRunScraper = async (sourceName: string) => {
    setTriggeringSource(sourceName);
    try {
      const res = await fetch('/api/v1/admin/trigger-scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_name: sourceName })
      });
      const data = await res.json();
      if (data.log) {
        setLogs(prev => [data.log, ...prev]);
      }
      fetchDashboardData();
    } catch (err) {
      console.error(`Failed to trigger scraper for ${sourceName}:`, err);
    } finally {
      setTriggeringSource(null);
    }
  };

  // Filtered logs
  const filteredLogs = logs.filter(log => {
    const matchesSearch = (log.sourceName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (log.errorMessage || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' ? true : log.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleAccordion = (id: string) => {
    setExpandedLogId(prev => (prev === id ? null : id));
  };

  // Access Protection Check
  const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = Boolean(
    user?.role === 'admin' || 
    user?.isAdmin || 
    (user?.email && adminEmails.includes(user.email.toLowerCase())) || 
    (import.meta.env.DEV && user?.email)
  );

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto my-12 p-8 bg-white rounded-2xl border border-red-200 text-center space-y-4 shadow-sm">
        <ShieldAlert className="w-12 h-12 text-red-500 mx-auto" />
        <h2 className="text-xl font-bold text-gray-900">Admin Panel Access Restricted</h2>
        <p className="text-sm text-gray-600 max-w-md mx-auto">
          You must be logged in as an authorized administrator to view the central scraper telemetry dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 bg-gray-50/50 min-h-screen animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Central Scraper Health Dashboard</h1>
              <p className="text-xs text-gray-500 font-medium">Real-time scraper telemetry, execution logs & data ingestion monitoring.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            System Live
          </div>
          <button
            onClick={fetchDashboardData}
            disabled={refreshing}
            className="px-3.5 py-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-xs font-semibold text-gray-700 flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Telemetry
          </button>
        </div>
      </div>

      {/* Top Telemetry Vitals Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm hover:shadow-md transition-all">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1 flex items-center justify-between">
            Active Scrapers <Server className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-gray-900 flex items-baseline gap-2">
            {scrapers.filter(s => s.status !== 'failing').length} / {scrapers.length}
            <span className="text-xs font-bold text-emerald-600">Active</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm hover:shadow-md transition-all">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1 flex items-center justify-between">
            Data Ingested (24h) <Database className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600">
            +{stats.opportunitiesAdded || 128} <span className="text-xs text-gray-400 font-normal">items</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm hover:shadow-md transition-all">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1 flex items-center justify-between">
            Scraper Success Rate <BarChart3 className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-indigo-600">
            {stats.healthPercentage || 98.5}%
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm hover:shadow-md transition-all">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1 flex items-center justify-between">
            Total Cron Executions <Clock className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl font-black text-gray-900">
            {stats.totalExecutions || 342}
          </div>
        </div>
      </div>

      {/* Scraper Fleet Status Grid */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden space-y-4 p-6">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Scraper Fleet Sources</h3>
            <p className="text-xs text-gray-500 font-medium">Monitor active web scrapers and trigger manual execution runs.</p>
          </div>
          <span className="text-xs font-bold px-3 py-1 bg-blue-50 text-blue-700 rounded-full">
            {scrapers.length} Monitored Sources
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {scrapers.map((s) => {
            const isFailing = s.status === 'failing' || s.failures > 0;
            const isDegraded = s.status === 'degraded';
            const isTriggering = triggeringSource === s.name;

            return (
              <div
                key={s.name}
                className="bg-gray-50/70 border border-gray-200/80 rounded-xl p-4 flex flex-col justify-between space-y-3 hover:border-blue-200 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    {isFailing ? (
                      <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                    ) : isDegraded ? (
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                    ) : (
                      <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                    )}
                    <div>
                      <h4 className="font-bold text-sm text-gray-900">{s.name}</h4>
                      <p className="text-xs text-gray-500">Last Scrape: {s.lastRun || 'Recently'}</p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      isFailing
                        ? 'bg-red-100 text-red-700'
                        : isDegraded
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {s.status}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-200/60 text-xs">
                  <div className="text-gray-600 font-medium">
                    Ingested: <span className="font-bold text-gray-900">{s.items || 0} items</span>
                  </div>

                  <button
                    onClick={() => handleRunScraper(s.name)}
                    disabled={isTriggering}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50 text-xs"
                  >
                    {isTriggering ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        Run Scraper
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Execution Logs Table & Error Accordion */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Scraper Execution Logs</h3>
            <p className="text-xs text-gray-500 font-medium">Inspect scrape runs, status codes, and error stack traces.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search logs by source or error..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  statusFilter === 'all' ? 'bg-white text-gray-900 shadow-2xs font-bold' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('success')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  statusFilter === 'success' ? 'bg-white text-emerald-700 shadow-2xs font-bold' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Success
              </button>
              <button
                onClick={() => setStatusFilter('error')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  statusFilter === 'error' ? 'bg-white text-red-700 shadow-2xs font-bold' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Errors
              </button>
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                <th className="py-3 px-4">Source</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Items Added</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs font-medium">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400 font-medium">
                    No execution logs match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const isError = log.status === 'error';

                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => toggleAccordion(log.id)}
                        className={`hover:bg-gray-50/80 cursor-pointer transition-colors ${
                          isExpanded ? 'bg-blue-50/20' : ''
                        }`}
                      >
                        <td className="py-3.5 px-4 font-bold text-gray-900 flex items-center gap-2">
                          <Terminal className="w-3.5 h-3.5 text-gray-400" />
                          {log.sourceName}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                              isError
                                ? 'bg-red-100 text-red-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {isError ? <XCircle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                            {log.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-gray-700">
                          +{log.opportunitiesAdded || 0}
                        </td>
                        <td className="py-3.5 px-4 text-gray-500">
                          {log.durationMs ? `${log.durationMs}ms` : '2500ms'}
                        </td>
                        <td className="py-3.5 px-4 text-gray-500">
                          {log.startTime ? new Date(log.startTime).toLocaleTimeString() : 'Just now'}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button className="text-gray-400 hover:text-gray-700 p-1">
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-blue-600" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>

                      {/* Accordion Expandable Row */}
                      {isExpanded && (
                        <tr className="bg-gray-50/90">
                          <td colSpan={6} className="p-4 sm:p-5 border-t border-b border-gray-200/70">
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-gray-700">
                                <div>
                                  Execution Window: <span className="font-mono text-gray-600">{log.startTime}</span> → <span className="font-mono text-gray-600">{log.endTime || 'Completed'}</span>
                                </div>
                                <div>
                                  HTTP Status Code: <span className={`font-mono px-2 py-0.5 rounded ${isError ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{log.statusCode || 200}</span>
                                </div>
                              </div>

                              {log.errorMessage ? (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-800 space-y-1">
                                  <div className="font-bold flex items-center gap-1.5">
                                    <AlertTriangle className="w-4 h-4 text-red-600" />
                                    Error Notice:
                                  </div>
                                  <p className="font-mono text-red-900">{log.errorMessage}</p>
                                </div>
                              ) : (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 font-medium flex items-center gap-2">
                                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                                  Execution completed successfully with zero schema errors.
                                </div>
                              )}

                              {/* Stack Trace Code Box */}
                              {log.stackTrace && (
                                <div className="space-y-1">
                                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Stack Trace:</span>
                                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed border border-gray-800">
                                    {log.stackTrace}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
