import { useSearchParams } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
  CartesianGrid, Legend,
} from 'recharts';
import { useFetch, useLabels } from '../hooks';
import { Spinner, ErrorNote, EmptyState } from '../components/ui';

// Command Center light palette: aqua, navy, green, amber, red, violet.
// All hues chosen to read clearly on a white card and meet AA contrast for chart fills/legends.
const CHART_COLORS = ['#1cc4bc', '#14314f', '#1a7a4a', '#a06010', '#b91c1c', '#7c5cd6'];
// Recharts tooltip restyled for the light theme: white card, hairline border,
// navy ink text, and a soft navy-tinted drop shadow to lift it off the page.
const TOOLTIP_STYLE = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #E6E6E6',
  borderRadius: 8,
  color: '#14314f',
  fontSize: 12,
  boxShadow: '0 4px 16px rgba(13,34,56,0.12)',
};

interface CapacityData {
  hoursByBucket: { name: string; hours: number }[];
  hoursByInitiative: { name: string; hours: number }[];
  weeklyTrend: { week: string; hours: number }[];
  estVsActual: { task: string; estimated: number; actual: number }[];
}

interface FlowData {
  tasksByStatus: Record<string, number>;
  avgCycleByBucket: { bucket: string; avgDays: number }[];
  tasksCompletedPerWeek: { week: string; count: number }[];
  priorityDistribution: Record<string, number>;
  wipTasks: { id: string; title: string; daysOpen: number }[];
  supportedLeaders: { name: string; tasks: number; hours: number; buckets: string[]; initiatives: string[] }[];
}

export default function Analytics() {
  const [params, setParams] = useSearchParams();
  const { buckets, initiatives } = useLabels();

  const qs = params.toString();
  const capacity = useFetch<CapacityData>(`/api/analytics/capacity${qs ? `?${qs}` : ''}`);
  const flow = useFetch<FlowData>(`/api/analytics/flow${qs ? `?${qs}` : ''}`);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  if (capacity.loading || flow.loading) return <Spinner />;
  if (capacity.error || flow.error) return <ErrorNote message={capacity.error || flow.error || ''} />;

  const cap = capacity.data!;
  const fl = flow.data!;

  const statusData = Object.entries(fl.tasksByStatus).map(([status, count]) => ({
    status: status.replace('_', ' '),
    count,
  }));
  const priorityData = Object.entries(fl.priorityDistribution).map(([priority, count]) => ({ priority, count }));

  return (
    <div className="space-y-6">
      <h1 className="page-title">Analytics</h1>

      {/* Filters — persisted in URL params */}
      <div className="card px-4 py-3 flex flex-wrap gap-2 items-center text-sm">
        <input type="date" className="input !w-auto" value={params.get('from') || ''} onChange={(e) => setFilter('from', e.target.value)} />
        {/* Secondary meta text on the light filter card — use the muted ink token. */}
        <span className="text-muted">to</span>
        <input type="date" className="input !w-auto" value={params.get('to') || ''} onChange={(e) => setFilter('to', e.target.value)} />
        <select className="input !w-auto" value={params.get('bucket') || ''} onChange={(e) => setFilter('bucket', e.target.value)}>
          <option value="">All buckets</option>
          {buckets.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className="input !w-auto max-w-[220px]" value={params.get('initiative') || ''} onChange={(e) => setFilter('initiative', e.target.value)}>
          <option value="">All initiatives</option>
          {initiatives.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        {qs && (
          <button className="btn-ghost" onClick={() => setParams({}, { replace: true })}>
            Clear
          </button>
        )}
      </div>

      {/* a. Capacity & effort */}
      <SectionHeading>Capacity &amp; effort</SectionHeading>
      <div className="grid lg:grid-cols-2 gap-6">
        <ChartCard title="Weekly hours trend">
          {cap.weeklyTrend.length === 0 ? <EmptyState>No data</EmptyState> : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={cap.weeklyTrend}>
                {/* Grid lines as a faint navy tint so they're visible on white (was white-alpha, invisible on light). */}
                <CartesianGrid stroke="rgba(20,49,79,0.08)" />
                {/* Axis strokes use the muted-ink hex so ticks/labels read on paper. */}
                <XAxis dataKey="week" stroke="#565f67" fontSize={11} />
                <YAxis stroke="#565f67" fontSize={12} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                {/* Trend line + dots in decorative aqua (was old gold accent). */}
                <Line type="monotone" dataKey="hours" stroke="#1cc4bc" strokeWidth={2} dot={{ fill: '#1cc4bc' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="Hours by bucket">
          <Donut data={cap.hoursByBucket} />
        </ChartCard>
        <ChartCard title="Hours by initiative">
          <Donut data={cap.hoursByInitiative} />
        </ChartCard>
        <ChartCard title="Estimated vs. actual hours" wide>
          {cap.estVsActual.length === 0 ? <EmptyState>No tasks with estimates</EmptyState> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={cap.estVsActual}>
                <XAxis dataKey="task" stroke="#565f67" fontSize={11} interval={0} angle={-12} textAnchor="end" height={60} />
                <YAxis stroke="#565f67" fontSize={12} />
                {/* Hover cursor as a faint navy wash (was white-alpha, invisible on light). */}
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(20,49,79,0.05)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {/* Estimated = neutral slate bar; actual = brand aqua so the comparison pops. */}
                <Bar dataKey="estimated" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" fill="#1cc4bc" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* b. Request & task flow */}
      <SectionHeading className="pt-2">Request &amp; task flow</SectionHeading>
      <div className="grid lg:grid-cols-2 gap-6">
        <ChartCard title="Tasks by status">
          {statusData.length === 0 ? <EmptyState>No tasks</EmptyState> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusData}>
                <XAxis dataKey="status" stroke="#565f67" fontSize={12} />
                <YAxis stroke="#565f67" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(20,49,79,0.05)' }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {statusData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="Tasks completed per week">
          {fl.tasksCompletedPerWeek.length === 0 ? <EmptyState>No completed tasks</EmptyState> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={fl.tasksCompletedPerWeek}>
                <XAxis dataKey="week" stroke="#565f67" fontSize={11} />
                <YAxis stroke="#565f67" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(20,49,79,0.05)' }} />
                {/* Completed = success green, darkened for AA contrast on white. */}
                <Bar dataKey="count" fill="#1a7a4a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="Avg. intake → completion by bucket (days)">
          {fl.avgCycleByBucket.length === 0 ? <EmptyState>No completed tasks yet</EmptyState> : (
            <ul className="space-y-2 text-sm">
              {fl.avgCycleByBucket.map((b) => (
                <li key={b.bucket} className="list-row py-1.5 flex justify-between">
                  <span className="text-muted">{b.bucket}</span>
                  <span className="font-mono text-xs tabular-nums text-ink">{b.avgDays} days</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
        <ChartCard title="Priority distribution (open tasks)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={priorityData}>
              <XAxis dataKey="priority" stroke="#565f67" fontSize={12} />
              <YAxis stroke="#565f67" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(20,49,79,0.05)' }} />
              {/* Priority cells: high=danger red, med=amber, low=neutral slate — all AA-darkened for white. */}
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                <Cell fill="#b91c1c" />
                <Cell fill="#a06010" />
                <Cell fill="#94a3b8" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="WIP tasks — days open" wide>
          {fl.wipTasks.length === 0 ? <EmptyState>No open WIP tasks</EmptyState> : (
            <ul className="space-y-2 text-sm">
              {fl.wipTasks.map((t) => (
                <li key={t.id} className="list-row py-1.5 flex justify-between">
                  <span className="text-muted">{t.title}</span>
                  {/* Days-open figure highlighted in AA-safe aqua-text (was bright gold). */}
                  <span className="font-mono text-xs tabular-nums text-aqua-text">{t.daysOpen} days</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>

      {/* c. Supported leaders */}
      <SectionHeading className="pt-2">Supported leaders</SectionHeading>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="th pl-5">Leader</th>
              <th className="th">Tasks</th>
              <th className="th">Hours invested</th>
              <th className="th">Buckets</th>
              <th className="th pr-5">Initiatives</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {fl.supportedLeaders.map((l) => (
              <tr key={l.name} className="row-hover">
                <td className="px-4 py-3 pl-5 font-medium text-ink">{l.name}</td>
                <td className="px-4 py-3 font-mono text-xs tabular-nums">{l.tasks}</td>
                <td className="px-4 py-3 font-mono text-xs tabular-nums">{l.hours}</td>
                <td className="px-4 py-3 text-muted text-xs">{l.buckets.join(', ')}</td>
                <td className="px-4 py-3 pr-5 text-muted text-xs">{l.initiatives.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {fl.supportedLeaders.length === 0 && <EmptyState>No tasks match the current filters</EmptyState>}
      </div>

    </div>
  );
}

function SectionHeading({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Section label in AA-safe aqua-text (was gold); divider hairline uses the line token. */}
      <h2 className="micro-title !text-aqua-text">{children}</h2>
      <span className="flex-1 h-px bg-line" />
    </div>
  );
}

function ChartCard({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`card p-6 ${wide ? 'lg:col-span-2' : ''}`}>
      <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-navy mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Donut({ data }: { data: { name: string; hours: number }[] }) {
  if (data.length === 0) return <EmptyState>No hours logged</EmptyState>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="hours" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
          {data.map((_, i) => (
            // Slice borders match the white card bg so segments read as cleanly separated wedges.
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="#FFFFFF" />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
