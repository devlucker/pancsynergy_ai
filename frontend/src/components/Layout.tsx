import type { ReactNode } from 'react';
import {
  LayoutDashboard,
  FlaskConical,
  BarChart3,
  Database,
  Layers,
  BookOpen,
  RefreshCw,
  Wifi,
  WifiOff,
  Loader2,
  Dna,
  Atom,
  TrendingDown,
} from 'lucide-react';
import type { Page, ApiStatus } from '@/types';
import type { BackendState } from '@/hooks/useBackend';

const navItems: { id: Page; label: string; description: string; icon: ReactNode }[] = [
  { id: 'overview', label: 'Overview', description: 'Executive summary & KPIs', icon: <LayoutDashboard size={19} /> },
  { id: 'prediction-lab', label: 'Prediction Lab', description: 'Screen drug pairs', icon: <FlaskConical size={19} /> },
  { id: 'reaction-properties', label: 'Reaction & Kinetics', description: 'Chemical properties & reaction time', icon: <Atom size={19} /> },
  { id: 'cancer-impact', label: 'Cancer Impact Dynamics', description: 'Time-course tumor reduction curves', icon: <TrendingDown size={19} /> },
  { id: 'model-performance', label: 'Model Performance', description: 'CV & test set validation', icon: <BarChart3 size={19} /> },
  { id: 'dataset-explorer', label: 'Dataset Explorer', description: '307 validated pairs', icon: <Database size={19} /> },
  { id: 'batch-screening', label: 'Batch Screening', description: 'CSV high-throughput screening', icon: <Layers size={19} /> },
  { id: 'methodology', label: 'Methodology', description: 'Feature math & limitations', icon: <BookOpen size={19} /> },
];

interface StatusDotProps {
  status: ApiStatus;
}

function StatusDot({ status }: StatusDotProps) {
  if (status === 'loading') {
    return <Loader2 size={12} className="animate-spin text-slate-400" />;
  }
  if (status === 'online') {
    return <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)] inline-block" />;
  }
  return <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />;
}

interface TopBarProps {
  currentPage: Page;
  backend: BackendState;
}

export function TopBar({ currentPage, backend }: TopBarProps) {
  const { apiStatus, health, modelInfo, refresh, lastChecked } = backend;
  const currentNav = navItems.find(n => n.id === currentPage);

  return (
    <header className="h-14 border-b border-slate-200/90 bg-white/90 backdrop-blur-md flex items-center justify-between px-6 gap-4 sticky top-0 z-40">
      {/* Current page title & context */}
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-bold text-slate-800">{currentNav?.label}</h2>
        <span className="hidden sm:inline-block text-xs text-slate-400 font-normal">|</span>
        <span className="hidden sm:inline-block text-xs text-slate-500 font-normal">{currentNav?.description}</span>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {/* Backend status indicator */}
        <div className={`flex items-center gap-2 text-xs font-medium rounded-full px-3 py-1 border transition-all ${
          apiStatus === 'online'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : apiStatus === 'loading'
            ? 'bg-slate-50 text-slate-600 border-slate-200'
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          <StatusDot status={apiStatus} />
          <span>
            {apiStatus === 'loading' ? 'Connecting to API...' : apiStatus === 'online' ? 'API Online' : 'API Offline'}
          </span>
        </div>

        {/* Model pill */}
        {health?.model_loaded && modelInfo && (
          <div className="hidden md:flex items-center gap-1.5 text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-full px-3 py-1 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-600 inline-block" />
            <span className="max-w-[150px] truncate">{modelInfo.model_name}</span>
          </div>
        )}

        {/* Refresh button */}
        <button
          onClick={() => { void refresh(); }}
          className="btn-ghost p-2 text-slate-500 hover:text-slate-800 rounded-lg border border-transparent hover:border-slate-200"
          title="Refresh backend status & data"
          aria-label="Refresh data"
        >
          <RefreshCw size={14} className={apiStatus === 'loading' ? 'animate-spin text-teal-600' : ''} />
        </button>

        {lastChecked && (
          <span className="hidden xl:inline-block text-[11px] text-slate-400 tabular-nums font-mono">
            Synced {lastChecked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>
    </header>
  );
}

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  apiStatus: ApiStatus;
}

export function Sidebar({ currentPage, onNavigate, apiStatus }: SidebarProps) {
  return (
    <aside className="w-64 shrink-0 bg-white border-r border-slate-200/90 flex flex-col justify-between shadow-card">
      <div>
        {/* Brand identity header */}
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-600 to-cyan-700 flex items-center justify-center text-white shadow-sm shrink-0">
              <Dna size={22} />
            </div>
            <div>
              <div className="flex items-center">
                <span className="text-[19px] sm:text-[20px] font-extrabold text-slate-900 tracking-tight leading-none">PancSynergy</span>
              </div>
              <p className="text-[12px] text-slate-500 font-medium mt-1">PANC-1 Synergy Prediction</p>
            </div>
          </div>
        </div>

        {/* Navigation links */}
        <div className="px-3 py-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2.5">Platform Navigation</p>
          <nav className="space-y-2" aria-label="Main navigation">
            {navItems.map(item => {
              const active = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`
                    w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left
                    transition-all duration-150 group
                    ${active
                      ? 'bg-teal-50 text-teal-800 border border-teal-200 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'}
                  `}
                >
                  <span className={`shrink-0 ${active ? 'text-teal-700' : 'text-slate-400 group-hover:text-slate-600'}`}>
                    {item.icon}
                  </span>
                  <div className="flex-1 truncate">
                    <span className="text-[15px] font-semibold leading-tight block">{item.label}</span>
                    <span className={`text-[12.5px] font-normal truncate block mt-0.5 ${active ? 'text-teal-700/80' : 'text-slate-400'}`}>
                      {item.description}
                    </span>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Sidebar Footer info */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/60">
        <div className="p-3 rounded-lg bg-white border border-slate-200/80 text-xs">
          <div className="flex items-center justify-between text-slate-700 font-semibold mb-1">
            <span>Cell Line Context</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">NCATS</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Human pancreatic ductal adenocarcinoma (<strong className="text-slate-700">PANC-1</strong>) combination matrix.
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 px-1">
          <span className="flex items-center gap-1.5">
            {apiStatus === 'online' ? <Wifi size={12} className="text-emerald-500" /> : <WifiOff size={12} className="text-rose-500" />}
            <span>{apiStatus === 'online' ? 'Live Connected' : 'Disconnected'}</span>
          </span>
          <span>v1.0.0</span>
        </div>
      </div>
    </aside>
  );
}
