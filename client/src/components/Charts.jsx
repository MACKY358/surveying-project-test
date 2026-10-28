// Shared Recharts wrappers used by the admin dashboard and reports.
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { statusMeta, titleCase } from '../utils.js';

const GREEN = '#1c6b50';
const NAVY = '#17395c';
const AMBER = '#b8912f';
const TEAL = '#0f766e';
const RED = '#b3261e';
const SLATE = '#71808d';
const VIOLET = '#6d28d9';

const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: '1px solid #e1e7ec',
  boxShadow: '0 6px 18px rgba(16,43,71,.12)',
  fontSize: 12,
};

const AXIS = { fontSize: 11, fill: '#71808d' };

export function BookingsTrend({ data = [] }) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GREEN} stopOpacity={0.32} />
              <stop offset="100%" stopColor={GREEN} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" vertical={false} />
          <XAxis dataKey="month" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="total" name="Requests" stroke={GREEN} fill="url(#trendFill)" strokeWidth={2.2} />
          <Line type="monotone" dataKey="completed" name="Completed" stroke={NAVY} strokeWidth={2} dot={{ r: 2.5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StageBars({ data = [] }) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" horizontal={false} />
          <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="shortLabel" width={132} tick={{ ...AXIS, fontSize: 10.5 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="total" name="Projects" fill={TEAL} radius={[0, 5, 5, 0]} barSize={13} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ServiceBars({ data = [] }) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 26 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" vertical={false} />
          <XAxis dataKey="name" tick={{ ...AXIS, fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={52} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="total" name="Bookings" fill={GREEN} radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusDonut({ data = [] }) {
  const colors = [GREEN, NAVY, AMBER, TEAL, RED, SLATE, VIOLET, '#25855f', '#a3b0bb'];
  const shaped = data.map((d) => ({ ...d, label: statusMeta(d.status).label }));
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={shaped} dataKey="total" nameKey="label" innerRadius="52%" outerRadius="82%" paddingAngle={2} stroke="#fff" strokeWidth={1.5}>
            {shaped.map((entry, index) => (
              <Cell key={entry.status || index} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeekdayBars({ data = [] }) {
  return (
    <div className="chart-wrap" style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" vertical={false} />
          <XAxis dataKey="day" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="total" name="Appointments" fill={NAVY} radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthlyBars({ data = [] }) {
  const shaped = data.map((d) => ({ ...d, label: /^\d{4}-\d{2}$/.test(d.month) ? `${d.month.slice(5)}/${d.month.slice(2, 4)}` : d.month }));
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={shaped} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="total" name="Requests" fill={GREEN} radius={[4, 4, 0, 0]} />
          <Bar dataKey="completed" name="Completed" fill={TEAL} radius={[4, 4, 0, 0]} />
          <Bar dataKey="cancelled" name="Cancelled" fill={SLATE} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DocStatusBars({ data = [] }) {
  const shaped = data.map((d) => ({ ...d, label: titleCase(d.status) }));
  return (
    <div className="chart-wrap" style={{ height: 210 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={shaped} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" horizontal={false} />
          <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={92} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="total" name="Documents" fill={AMBER} radius={[0, 5, 5, 0]} barSize={13} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WorkloadMini({ data = [] }) {
  return (
    <div className="chart-wrap" style={{ height: 230 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 26 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" vertical={false} />
          <XAxis dataKey="name" tick={{ ...AXIS, fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={50} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="active" name="Active assignments" fill={GREEN} radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineTrend({ data = [], xKey = 'month', lines = [] }) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {lines.map((line) => (
            <Line key={line.key} type="monotone" dataKey={line.key} name={line.label} stroke={line.color || GREEN} strokeWidth={2} dot={{ r: 2.5 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLegend({ items }) {
  return (
    <div className="chart-legend">
      {items.map((item) => (
        <span key={item.label}>
          <i style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
