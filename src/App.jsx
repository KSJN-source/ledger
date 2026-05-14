import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Copy, User, Shield, Calendar,
  FileText, Edit2, Check, X, ArrowLeft, Clock, Building2, CircleCheck,
  CircleDot, CircleAlert, Hash, ArrowRight, Users, Rocket, BarChart3,
  RefreshCw, ListChecks, TrendingUp, WifiOff
} from 'lucide-react';
import { db } from './firebase';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp
} from 'firebase/firestore';

// ---------- date helpers ----------
const fmtISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const parseISO = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const todayISO = () => fmtISO(new Date());
const fmtDisplay = (iso) => parseISO(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const fmtShort = (iso) => parseISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtShortYear = (iso) => parseISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const shiftDay = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return fmtISO(d); };
const startOfWeek = (iso) => { const d = parseISO(iso); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return fmtISO(d); };
const endOfWeek = (iso) => shiftDay(startOfWeek(iso), 6);
const startOfMonth = (iso) => { const d = parseISO(iso); return fmtISO(new Date(d.getFullYear(), d.getMonth(), 1)); };
const endOfMonth = (iso) => { const d = parseISO(iso); return fmtISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };

const STATUS = {
  in_progress: { label: 'In Progress', icon: CircleDot, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  completed:   { label: 'Completed',   icon: CircleCheck, color: 'text-emerald-800', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  blocked:     { label: 'Blocked',     icon: CircleAlert, color: 'text-rose-800', bg: 'bg-rose-50', border: 'border-rose-200' },
};

// ---------- Firestore API ----------
const docs = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() }));
const api = {
  listEmployees: async () => docs(await getDocs(query(collection(db, 'employees'), orderBy('name')))),
  addEmployee: async (name) => {
    const ref = await addDoc(collection(db, 'employees'), { name: name.trim(), createdAt: serverTimestamp() });
    return { id: ref.id, name: name.trim() };
  },
  listClients: async () => docs(await getDocs(query(collection(db, 'clients'), orderBy('name')))),
  addClient: async (name) => {
    const ref = await addDoc(collection(db, 'clients'), { name: name.trim() });
    return { id: ref.id, name: name.trim() };
  },
  removeClient: (id) => deleteDoc(doc(db, 'clients', id)),
  tasksForEmployeeDate: async (empId, date) => {
    const snap = await getDocs(query(collection(db, 'tasks'), where('employeeId', '==', empId), where('date', '==', date)));
    return docs(snap).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  },
  createTask: async (data) => {
    const ref = await addDoc(collection(db, 'tasks'), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return { id: ref.id, ...data };
  },
  updateTask: async (id, data) => {
    await updateDoc(doc(db, 'tasks', id), { ...data, updatedAt: serverTimestamp() });
    return { id, ...data };
  },
  deleteTask: (id) => deleteDoc(doc(db, 'tasks', id)),
  datesForEmployee: async (empId) => {
    const snap = await getDocs(query(collection(db, 'tasks'), where('employeeId', '==', empId), orderBy('date', 'desc')));
    return [...new Set(snap.docs.map(d => d.data().date))];
  },
  previousDateWithTasks: async (empId, beforeDate) => {
    const snap = await getDocs(query(
      collection(db, 'tasks'),
      where('employeeId', '==', empId),
      where('date', '<', beforeDate),
      orderBy('date', 'desc'),
      limit(1)
    ));
    return snap.empty ? null : snap.docs[0].data().date;
  },
  allTasks: async () => docs(await getDocs(collection(db, 'tasks'))),
  employeeStats: async (empId) => {
    const dates = await api.datesForEmployee(empId);
    return { count: dates.length, lastDate: dates[0] || null };
  }
};

// ---------- main ----------
export default function App() {
  const [view, setView] = useState('landing');
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refreshRoster = useCallback(async () => {
    setLoading(true);
    try {
      const [emp, cl] = await Promise.all([api.listEmployees(), api.listClients()]);
      setEmployees(emp);
      setClients(cl);
      setError(null);
    } catch (e) {
      console.error(e);
      setError("Can't reach Firestore. Check your Firebase config and that the database is created.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { refreshRoster(); }, [refreshRoster]);

  const addClient = useCallback(async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = clients.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing.name;
    try {
      const c = await api.addClient(trimmed);
      setClients(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
      return c.name;
    } catch (e) { console.error(e); return null; }
  }, [clients]);

  const removeClient = useCallback(async (name) => {
    const c = clients.find(c => c.name === name);
    if (!c) return;
    try {
      await api.removeClient(c.id);
      setClients(prev => prev.filter(x => x.id !== c.id));
    } catch (e) { console.error(e); }
  }, [clients]);

  const handleEmployeeLogin = async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = employees.find(e => e.name.toLowerCase() === trimmed.toLowerCase());
    let user = existing;
    if (!existing) {
      try {
        user = await api.addEmployee(trimmed);
        setEmployees(prev => [...prev, user].sort((a, b) => a.name.localeCompare(b.name)));
      } catch (e) { console.error(e); return; }
    }
    setCurrentUser(user);
    setView('employee');
  };

  const addEmployeeFromAdmin = useCallback(async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = employees.find(e => e.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    try {
      const u = await api.addEmployee(trimmed);
      setEmployees(prev => [...prev, u].sort((a, b) => a.name.localeCompare(b.name)));
      return u;
    } catch (e) { console.error(e); return null; }
  }, [employees]);

  const goHome = () => { setCurrentUser(null); setSelectedEmployee(null); setView('landing'); };

  return (
    <div className="min-h-screen w-full" style={{
      fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
      background: 'radial-gradient(ellipse at top, #f7f1e6 0%, #efe8d8 100%)',
      color: '#1a1a1a',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .font-display { font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto; }
        .font-mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
        .grain::before {
          content: ''; position: fixed; inset: 0; pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.08 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          opacity: 0.5; z-index: 0;
        }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fade-up { animation: fadeUp 0.4s ease-out forwards; }
      `}</style>
      <div className="grain" />

      <div className="relative z-10 max-w-5xl mx-auto px-5 py-8 md:px-8 md:py-12">
        <header className="flex items-center justify-between mb-10 md:mb-14">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-sm flex items-center justify-center" style={{ background: '#1f3d2c' }}>
              <FileText size={18} className="text-amber-50" />
            </div>
            <div>
              <div className="font-display text-xl md:text-2xl leading-none" style={{ color: '#1f3d2c' }}>Ledger</div>
              <div className="font-mono text-[10px] uppercase tracking-widest opacity-60">Daily status reports</div>
            </div>
          </div>
          {view !== 'landing' && (
            <button onClick={goHome} className="font-mono text-xs uppercase tracking-wider opacity-70 hover:opacity-100 flex items-center gap-1.5 transition">
              <ArrowLeft size={14} /> Sign out
            </button>
          )}
        </header>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-300 rounded-sm flex items-start gap-3">
            <WifiOff size={18} className="text-rose-700 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-mono text-xs uppercase tracking-wider font-semibold text-rose-900 mb-1">Connection problem</div>
              <div className="text-sm text-rose-800">{error}</div>
            </div>
            <button onClick={refreshRoster} className="px-3 py-1.5 rounded-sm font-mono text-xs uppercase tracking-wider bg-rose-700 text-white hover:bg-rose-800 transition shrink-0">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 opacity-50 font-mono text-sm">Loading…</div>
        ) : view === 'landing' ? (
          <Landing onPickEmployee={() => setView('employeeLogin')} onPickAdmin={() => setView('admin')} employeeCount={employees.length} clientCount={clients.length} />
        ) : view === 'employeeLogin' ? (
          <EmployeeLogin onLogin={handleEmployeeLogin} employees={employees} />
        ) : view === 'employee' ? (
          <EmployeeView user={currentUser} clients={clients} onAddClient={addClient} />
        ) : view === 'admin' ? (
          <AdminView employees={employees} clients={clients} onAddClient={addClient} onRemoveClient={removeClient}
            onAddEmployee={addEmployeeFromAdmin}
            onSelect={(emp) => { setSelectedEmployee(emp); setView('adminDetail'); }} />
        ) : view === 'adminDetail' ? (
          <AdminDetailView employee={selectedEmployee} onBack={() => setView('admin')} />
        ) : null}

        <footer className="mt-20 pt-6 border-t border-stone-300/60 font-mono text-[10px] uppercase tracking-widest opacity-40 text-center">
          Cloud-hosted on Firebase
        </footer>
      </div>
    </div>
  );
}

function Landing({ onPickEmployee, onPickAdmin, employeeCount, clientCount }) {
  return (
    <div className="fade-up">
      <div className="mb-12 md:mb-16">
        <div className="font-mono text-xs uppercase tracking-widest opacity-50 mb-3">Vol. 01 · {fmtDisplay(todayISO())}</div>
        <h1 className="font-display text-5xl md:text-7xl leading-[0.95] mb-6" style={{ color: '#1f3d2c' }}>
          What did you<br/><em className="italic">accomplish</em> today?
        </h1>
        <p className="max-w-xl text-base md:text-lg opacity-70 leading-relaxed">
          A daily status journal for teams. Log incidents and tasks, mark builds promoted to PRD, keep a clean trail of what was done.
        </p>
        {(employeeCount > 0 || clientCount > 0) && (
          <div className="mt-6 flex gap-6 font-mono text-xs uppercase tracking-wider opacity-50">
            <span>{employeeCount} {employeeCount === 1 ? 'employee' : 'employees'}</span>
            <span>{clientCount} {clientCount === 1 ? 'client' : 'clients'}</span>
          </div>
        )}
      </div>
      <div className="grid md:grid-cols-2 gap-4 md:gap-6">
        <button onClick={onPickEmployee} className="group text-left p-6 md:p-8 rounded-sm border border-stone-300 bg-stone-50/40 hover:bg-white hover:border-stone-400 transition-all">
          <User size={22} className="mb-4" style={{ color: '#1f3d2c' }} />
          <div className="font-display text-2xl mb-2" style={{ color: '#1f3d2c' }}>I'm an employee</div>
          <div className="text-sm opacity-70 leading-relaxed">Log incidents and tasks, flag PRD moves, copy yesterday's entries to keep things easy.</div>
          <div className="mt-5 font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 opacity-60 group-hover:opacity-100 group-hover:gap-2.5 transition-all">Sign in <ChevronRight size={14} /></div>
        </button>
        <button onClick={onPickAdmin} className="group text-left p-6 md:p-8 rounded-sm border transition-all" style={{ background: '#1f3d2c', borderColor: '#1f3d2c', color: '#f7f1e6' }}>
          <Shield size={22} className="mb-4 opacity-80" />
          <div className="font-display text-2xl mb-2">I'm an admin</div>
          <div className="text-sm opacity-70 leading-relaxed">Review reports by day, week, or month. See new vs continuing work, status mix, and PRD moves.</div>
          <div className="mt-5 font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 opacity-70 group-hover:opacity-100 group-hover:gap-2.5 transition-all">Enter dashboard <ChevronRight size={14} /></div>
        </button>
      </div>
    </div>
  );
}

function EmployeeLogin({ onLogin, employees }) {
  const [name, setName] = useState('');
  return (
    <div className="fade-up max-w-xl">
      <div className="font-mono text-xs uppercase tracking-widest opacity-50 mb-3">Step 01</div>
      <h2 className="font-display text-4xl md:text-5xl mb-3" style={{ color: '#1f3d2c' }}>Your name</h2>
      <p className="opacity-70 mb-8">Pick your name from the roster or enter a new one.</p>
      {employees.length > 0 && (
        <div className="mb-8">
          <div className="font-mono text-xs uppercase tracking-wider opacity-60 mb-3">Existing</div>
          <div className="flex flex-wrap gap-2">
            {employees.map(e => (
              <button key={e.id} onClick={() => onLogin(e.name)} className="px-4 py-2 rounded-sm border border-stone-300 bg-white/60 hover:bg-white hover:border-stone-500 text-sm transition">{e.name}</button>
            ))}
          </div>
        </div>
      )}
      <div>
        <div className="font-mono text-xs uppercase tracking-wider opacity-60 mb-3">Or new</div>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onLogin(name)} placeholder="Your full name" className="flex-1 px-4 py-3 rounded-sm border border-stone-300 bg-white/60 focus:bg-white focus:border-stone-600 outline-none text-base" />
          <button onClick={() => onLogin(name)} disabled={!name.trim()} className="px-6 py-3 rounded-sm font-mono text-xs uppercase tracking-wider transition disabled:opacity-30" style={{ background: '#1f3d2c', color: '#f7f1e6' }}>Continue</button>
        </div>
      </div>
    </div>
  );
}

function ClientSelector({ value, onChange, clients, onAddClient }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const handleAdd = async () => {
    if (!newName.trim()) return;
    const added = await onAddClient(newName);
    if (added) { onChange(added); setAdding(false); setNewName(''); }
  };
  if (adding) {
    return (
      <div className="flex gap-1">
        <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); else if (e.key === 'Escape') { setAdding(false); setNewName(''); }}}
          placeholder="New client name"
          className="flex-1 px-2 py-1.5 text-sm bg-white border border-stone-700 rounded-sm outline-none min-w-0" />
        <button onClick={handleAdd} className="px-2 py-1.5 text-xs rounded-sm shrink-0" style={{ background: '#1f3d2c', color: '#f7f1e6' }}><Check size={13} /></button>
        <button onClick={() => { setAdding(false); setNewName(''); }} className="px-2 py-1.5 text-xs rounded-sm hover:bg-stone-200 shrink-0"><X size={13} /></button>
      </div>
    );
  }
  return (
    <select value={value || ''} onChange={(e) => { if (e.target.value === '__add__') setAdding(true); else onChange(e.target.value); }}
      className="w-full px-2 py-1.5 text-sm bg-white border border-stone-300 rounded-sm outline-none focus:border-stone-600">
      <option value="">— Select client —</option>
      {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
      <option value="__add__">+ Add new client…</option>
    </select>
  );
}

function EmployeeView({ user, clients, onAddClient }) {
  const [date, setDate] = useState(todayISO());
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [copyMsg, setCopyMsg] = useState('');

  const loadTasks = useCallback(async (d) => {
    setLoading(true);
    try { setTasks(await api.tasksForEmployeeDate(user.id, d)); }
    catch (e) { console.error(e); setTasks([]); }
    setLoading(false);
  }, [user.id]);

  useEffect(() => { loadTasks(date); }, [date, loadTasks]);

  const upsertTask = async (taskData) => {
    try {
      if (taskData.id) {
        const { id, ...rest } = taskData;
        const updated = await api.updateTask(id, rest);
        setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updated } : t));
      } else {
        const created = await api.createTask({ ...taskData, employeeId: user.id, employeeName: user.name, date });
        setTasks(prev => [...prev, created]);
      }
      setEditing(null);
    } catch (e) { console.error(e); alert('Failed to save. Check your connection.'); }
  };

  const deleteTask = async (id) => {
    try { await api.deleteTask(id); setTasks(prev => prev.filter(t => t.id !== id)); }
    catch (e) { console.error(e); alert('Failed to delete.'); }
  };

  const copyFromPrevious = async () => {
    setCopyMsg('Searching…');
    try {
      const prevDate = await api.previousDateWithTasks(user.id, date);
      if (!prevDate) { setCopyMsg('No earlier entries found'); setTimeout(() => setCopyMsg(''), 2500); return; }
      const prev = await api.tasksForEmployeeDate(user.id, prevDate);
      if (prev.length === 0) { setCopyMsg('Previous day had no tasks'); setTimeout(() => setCopyMsg(''), 2500); return; }
      const created = [];
      for (const t of prev) {
        const copy = await api.createTask({
          employeeId: user.id, employeeName: user.name, date,
          client: t.client || '', incidentId: t.incidentId || '',
          title: t.title || '', latestUpdate: '',
          hours: t.hours || 0,
          status: t.status === 'completed' ? 'in_progress' : t.status,
          movedToPRD: false, prdDate: '',
        });
        created.push(copy);
      }
      setTasks(prev => [...prev, ...created]);
      setCopyMsg(`Copied ${created.length} from ${fmtShort(prevDate)} · add today's update to each`);
      setTimeout(() => setCopyMsg(''), 4500);
    } catch (e) { console.error(e); setCopyMsg('Copy failed'); setTimeout(() => setCopyMsg(''), 2500); }
  };

  const totalHours = tasks.reduce((s, t) => s + (parseFloat(t.hours) || 0), 0);
  const isToday = date === todayISO();
  const isFuture = date > todayISO();

  return (
    <div className="fade-up">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest opacity-50 mb-2">Signed in as</div>
          <div className="font-display text-3xl md:text-4xl" style={{ color: '#1f3d2c' }}>{user.name}</div>
        </div>
        <div className="font-mono text-xs uppercase tracking-wider opacity-60">{tasks.length} item{tasks.length === 1 ? '' : 's'} · {totalHours.toFixed(1)}h logged</div>
      </div>

      <div className="flex items-center justify-between gap-3 my-6 py-4 border-y border-stone-300/70">
        <button onClick={() => setDate(shiftDay(date, -1))} className="p-2 rounded-sm hover:bg-stone-200/60 transition"><ChevronLeft size={18} /></button>
        <div className="text-center flex-1">
          <div className="font-display text-lg md:text-xl" style={{ color: '#1f3d2c' }}>
            {fmtDisplay(date)}
            {isToday && <span className="ml-2 font-mono text-[10px] uppercase tracking-widest align-middle px-1.5 py-0.5 rounded-sm" style={{ background: '#1f3d2c', color: '#f7f1e6' }}>Today</span>}
          </div>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="font-mono text-xs opacity-50 bg-transparent border-none outline-none cursor-pointer mt-0.5" />
        </div>
        <button onClick={() => setDate(shiftDay(date, 1))} className="p-2 rounded-sm hover:bg-stone-200/60 transition"><ChevronRight size={18} /></button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button onClick={() => setEditing('new')} disabled={isFuture}
          className="px-4 py-2 rounded-sm font-mono text-xs uppercase tracking-wider flex items-center gap-2 transition disabled:opacity-30"
          style={{ background: '#1f3d2c', color: '#f7f1e6' }}><Plus size={14} /> Add incident / task</button>
        <button onClick={copyFromPrevious} disabled={isFuture}
          className="px-4 py-2 rounded-sm font-mono text-xs uppercase tracking-wider flex items-center gap-2 border border-stone-400 hover:bg-stone-200/60 transition disabled:opacity-30">
          <Copy size={14} /> Copy from previous day</button>
        {copyMsg && <span className="font-mono text-xs opacity-70 italic">{copyMsg}</span>}
      </div>

      {editing === 'new' && <TaskForm clients={clients} onAddClient={onAddClient} onSave={upsertTask} onCancel={() => setEditing(null)} defaultDate={date} />}

      {loading ? (
        <div className="text-center py-12 opacity-40 font-mono text-sm">Loading entries…</div>
      ) : tasks.length === 0 && editing !== 'new' ? (
        <EmptyState onAdd={() => setEditing('new')} disabled={isFuture} />
      ) : (
        <div className="space-y-3">
          {tasks.map((t, i) => editing === t.id ? (
            <TaskForm key={t.id} task={t} clients={clients} onAddClient={onAddClient} onSave={upsertTask} onCancel={() => setEditing(null)} defaultDate={date} />
          ) : (
            <TaskCard key={t.id} task={t} index={i} onEdit={() => setEditing(t.id)} onDelete={() => deleteTask(t.id)} onStatusChange={(status) => upsertTask({ ...t, status })} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onAdd, disabled }) {
  return (
    <div className="text-center py-16 px-4 border border-dashed border-stone-400 rounded-sm bg-stone-50/40">
      <FileText size={28} className="mx-auto mb-3 opacity-30" />
      <div className="font-display text-xl mb-1" style={{ color: '#1f3d2c' }}>No entries yet</div>
      <div className="text-sm opacity-60 mb-5">{disabled ? "You can't log entries for future dates." : "Add an incident/task or copy from a previous day."}</div>
      {!disabled && <button onClick={onAdd} className="font-mono text-xs uppercase tracking-wider underline underline-offset-4 opacity-70 hover:opacity-100">+ Add your first entry</button>}
    </div>
  );
}

function TaskCard({ task, index, onEdit, onDelete, onStatusChange }) {
  const status = STATUS[task.status] || STATUS.in_progress;
  const StatusIcon = status.icon;
  return (
    <div className="group relative bg-white/70 border border-stone-300 rounded-sm p-5 hover:border-stone-500 transition-all">
      <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ background: task.movedToPRD ? '#0e7c40' : '#1f3d2c' }} />
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10px] uppercase tracking-widest opacity-40">№ {String(index + 1).padStart(2, '0')}</span>
          {task.client && <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm bg-stone-200/80 text-stone-700 flex items-center gap-1"><Building2 size={10} /> {task.client}</span>}
          {task.incidentId && <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm bg-stone-800 text-amber-50 flex items-center gap-1"><Hash size={10} /> {task.incidentId}</span>}
          <button onClick={() => {
              const order = ['in_progress', 'completed', 'blocked'];
              const next = order[(order.indexOf(task.status || 'in_progress') + 1) % order.length];
              onStatusChange(next);
            }}
            className={`font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm border ${status.bg} ${status.border} ${status.color} flex items-center gap-1 hover:opacity-80`}
            title="Click to cycle status">
            <StatusIcon size={10} /> {status.label}
          </button>
          {task.movedToPRD && <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm bg-emerald-700 text-emerald-50 flex items-center gap-1"><Rocket size={10} /> PRD{task.prdDate ? ` · ${fmtShort(task.prdDate)}` : ''}</span>}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
          <button onClick={onEdit} className="p-1.5 rounded-sm hover:bg-stone-200 transition"><Edit2 size={13} /></button>
          <button onClick={onDelete} className="p-1.5 rounded-sm hover:bg-rose-100 hover:text-rose-700 transition"><Trash2 size={13} /></button>
        </div>
      </div>
      <div className="font-display text-lg md:text-xl leading-snug mb-1" style={{ color: '#1a1a1a' }}>{task.title || <span className="opacity-40 italic">No details</span>}</div>
      {task.latestUpdate && (
        <div className="mt-3 pl-3 border-l-2 border-stone-400/70">
          <div className="font-mono text-[10px] uppercase tracking-widest opacity-50 mb-1 flex items-center gap-1"><ArrowRight size={10} /> Where we are now</div>
          <div className="text-sm opacity-80 leading-relaxed whitespace-pre-wrap">{task.latestUpdate}</div>
        </div>
      )}
      {task.hours ? <div className="mt-3 flex items-center gap-1.5 font-mono text-xs opacity-60"><Clock size={12} /> {task.hours}h</div> : null}
    </div>
  );
}

function TaskForm({ task, clients, onAddClient, onSave, onCancel, defaultDate }) {
  const [client, setClient] = useState(task?.client || '');
  const [incidentId, setIncidentId] = useState(task?.incidentId || '');
  const [title, setTitle] = useState(task?.title || '');
  const [latestUpdate, setLatestUpdate] = useState(task?.latestUpdate || '');
  const [hours, setHours] = useState(task?.hours || '');
  const [status, setStatus] = useState(task?.status || 'in_progress');
  const [movedToPRD, setMovedToPRD] = useState(!!task?.movedToPRD);
  const [prdDate, setPrdDate] = useState(task?.prdDate || defaultDate || todayISO());
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({
      id: task?.id,
      client: client.trim(),
      incidentId: incidentId.trim(),
      title: title.trim(),
      latestUpdate: latestUpdate.trim(),
      hours: hours ? parseFloat(hours) : 0,
      status,
      movedToPRD,
      prdDate: movedToPRD ? prdDate : '',
    });
    setSaving(false);
  };

  return (
    <div className="bg-stone-50 border-2 border-stone-700 rounded-sm p-5 mb-3 fade-up">
      <div className="font-display text-xl mb-4 pb-3 border-b border-stone-300" style={{ color: '#1f3d2c' }}>{task ? 'Edit entry' : 'New entry'}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="font-mono text-[11px] uppercase tracking-wider font-semibold block mb-1.5 text-stone-700">Client</label>
          <ClientSelector value={client} onChange={setClient} clients={clients} onAddClient={onAddClient} />
        </div>
        <div>
          <label className="font-mono text-[11px] uppercase tracking-wider font-semibold block mb-1.5 text-stone-700">Incident / Task ID</label>
          <input value={incidentId} onChange={(e) => setIncidentId(e.target.value)} placeholder="INC0012345" className="w-full px-2 py-1.5 text-sm font-mono bg-white border border-stone-300 rounded-sm outline-none focus:border-stone-600" />
        </div>
      </div>
      <div className="mb-3">
        <label className="font-mono text-[11px] uppercase tracking-wider font-semibold block mb-1.5 text-stone-700">Brief details *</label>
        <textarea autoFocus value={title} onChange={(e) => setTitle(e.target.value)} rows={2} placeholder="What is this incident or task about?" className="w-full px-3 py-2 text-base font-display bg-white border border-stone-300 rounded-sm outline-none focus:border-stone-600 resize-none" />
      </div>
      <div className="mb-3">
        <label className="font-mono text-[11px] uppercase tracking-wider font-semibold text-stone-700 mb-1.5 flex items-center gap-1"><ArrowRight size={12} /> Latest update — where are we now?</label>
        <textarea value={latestUpdate} onChange={(e) => setLatestUpdate(e.target.value)} rows={3} placeholder="Current state, what was done today, blockers, next steps…" className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-sm outline-none focus:border-stone-600 resize-none" />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="font-mono text-[11px] uppercase tracking-wider font-semibold block mb-1.5 text-stone-700">Hours</label>
          <input value={hours} onChange={(e) => setHours(e.target.value)} type="number" step="0.25" min="0" placeholder="0.0" className="w-full px-2 py-1.5 text-sm font-mono bg-white border border-stone-300 rounded-sm outline-none focus:border-stone-600" />
        </div>
        <div>
          <label className="font-mono text-[11px] uppercase tracking-wider font-semibold block mb-1.5 text-stone-700">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-2 py-1.5 text-sm bg-white border border-stone-300 rounded-sm outline-none focus:border-stone-600">
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>
      <div className={`p-3 rounded-sm border ${movedToPRD ? 'border-emerald-700 bg-emerald-50/60' : 'border-stone-300 bg-white'} mb-3`}>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={movedToPRD} onChange={(e) => setMovedToPRD(e.target.checked)} className="w-4 h-4 accent-emerald-700" />
          <Rocket size={14} className={movedToPRD ? 'text-emerald-700' : 'opacity-50'} />
          <span className="font-mono text-[11px] uppercase tracking-wider font-semibold text-stone-700">Build moved to PRD (production)</span>
        </label>
        {movedToPRD && (
          <div className="mt-2 pl-6 flex items-center gap-2">
            <label className="font-mono text-[11px] uppercase tracking-wider font-semibold text-stone-700">Date promoted:</label>
            <input type="date" value={prdDate} onChange={(e) => setPrdDate(e.target.value)} className="px-2 py-1 text-xs font-mono bg-white border border-stone-300 rounded-sm outline-none focus:border-stone-600" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} disabled={saving} className="px-4 py-2 rounded-sm font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 hover:bg-stone-200/60 transition disabled:opacity-30"><X size={13} /> Cancel</button>
        <button onClick={submit} disabled={!title.trim() || saving} className="px-4 py-2 rounded-sm font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 transition disabled:opacity-30" style={{ background: '#1f3d2c', color: '#f7f1e6' }}>
          <Check size={13} /> {saving ? 'Saving…' : 'Save entry'}
        </button>
      </div>
    </div>
  );
}

function AdminView({ employees, clients, onAddClient, onRemoveClient, onAddEmployee, onSelect }) {
  const [tab, setTab] = useState('roster');
  return (
    <div className="fade-up">
      <div className="font-mono text-xs uppercase tracking-widest opacity-50 mb-2">Admin</div>
      <h2 className="font-display text-4xl md:text-5xl mb-8" style={{ color: '#1f3d2c' }}>Dashboard</h2>
      <div className="flex gap-1 mb-8 border-b border-stone-300/70">
        {[{ id: 'roster', label: 'Roster', icon: Users }, { id: 'insights', label: 'Insights', icon: BarChart3 }].map(t => {
          const I = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2.5 font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 border-b-2 -mb-px transition ${tab === t.id ? 'border-stone-800 text-stone-900' : 'border-transparent opacity-60 hover:opacity-100'}`}>
              <I size={13} /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === 'roster'
        ? <RosterTab employees={employees} clients={clients} onAddClient={onAddClient} onRemoveClient={onRemoveClient} onAddEmployee={onAddEmployee} onSelect={onSelect} />
        : <InsightsTab employees={employees} />}
    </div>
  );
}

function RosterTab({ employees, clients, onAddClient, onRemoveClient, onAddEmployee, onSelect }) {
  const [meta, setMeta] = useState({});
  const [showClients, setShowClients] = useState(false);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [newEmpName, setNewEmpName] = useState('');
  const addEmp = async () => {
    if (!newEmpName.trim()) return;
    await onAddEmployee(newEmpName);
    setNewEmpName('');
    setShowAddEmployee(false);
  };

  useEffect(() => {
    (async () => {
      const next = {};
      for (const e of employees) {
        try { next[e.id] = await api.employeeStats(e.id); }
        catch (err) { next[e.id] = { count: 0, lastDate: null }; }
      }
      setMeta(next);
    })();
  }, [employees]);

  return (
    <div className="fade-up">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <p className="opacity-70">{employees.length} {employees.length === 1 ? 'employee' : 'employees'} on the books. Select one to review their reports.</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowAddEmployee(s => !s)} className="font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 px-3 py-2 rounded-sm transition" style={{ background: '#1f3d2c', color: '#f7f1e6' }}>
            <Plus size={13} /> Add employee
          </button>
          <button onClick={() => setShowClients(s => !s)} className="font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 px-3 py-2 border border-stone-400 rounded-sm hover:bg-stone-200/60 transition">
            <Users size={13} /> {showClients ? 'Hide' : 'Manage'} clients ({clients.length})
          </button>
        </div>
      </div>
      {showAddEmployee && (
        <div className="mb-6 p-5 bg-stone-50/60 border border-stone-300 rounded-sm fade-up">
          <div className="font-mono text-[11px] uppercase tracking-wider font-semibold text-stone-700 mb-3">Add a new employee</div>
          <div className="flex gap-2">
            <input
              autoFocus
              value={newEmpName}
              onChange={(e) => setNewEmpName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addEmp(); else if (e.key === 'Escape') { setShowAddEmployee(false); setNewEmpName(''); } }}
              placeholder="Full name"
              className="flex-1 px-3 py-2 text-sm bg-white border border-stone-300 rounded-sm outline-none focus:border-stone-600" />
            <button onClick={addEmp} disabled={!newEmpName.trim()} className="px-4 py-2 rounded-sm font-mono text-xs uppercase tracking-wider transition disabled:opacity-30" style={{ background: '#1f3d2c', color: '#f7f1e6' }}>
              <Check size={13} className="inline -mt-0.5 mr-1" />Save
            </button>
            <button onClick={() => { setShowAddEmployee(false); setNewEmpName(''); }} className="px-4 py-2 rounded-sm font-mono text-xs uppercase tracking-wider hover:bg-stone-200/60 transition">
              <X size={13} className="inline -mt-0.5" />
            </button>
          </div>
        </div>
      )}
      {showClients && (
        <div className="mb-8 p-5 bg-stone-50/60 border border-stone-300 rounded-sm fade-up">
          <div className="font-mono text-[10px] uppercase tracking-widest opacity-60 mb-3">Client roster · shared across the app</div>
          <ClientManager clients={clients} onAdd={onAddClient} onRemove={onRemoveClient} />
        </div>
      )}
      {employees.length === 0 ? (
        <div className="text-center py-16 px-4 border border-dashed border-stone-400 rounded-sm bg-stone-50/40">
          <User size={28} className="mx-auto mb-3 opacity-30" />
          <div className="font-display text-xl mb-1" style={{ color: '#1f3d2c' }}>No employees yet</div>
          <div className="text-sm opacity-60">Once employees sign in and log entries, they'll appear here.</div>
        </div>
      ) : (
        <div className="divide-y divide-stone-300/70 border-y border-stone-300/70">
          {employees.map((e, i) => {
            const m = meta[e.id] || {};
            return (
              <button key={e.id} onClick={() => onSelect(e)} className="w-full flex items-center justify-between gap-4 py-5 px-1 hover:bg-stone-200/30 transition group text-left">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs opacity-40 w-6">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <div className="font-display text-2xl group-hover:translate-x-1 transition-transform" style={{ color: '#1f3d2c' }}>{e.name}</div>
                    <div className="font-mono text-[11px] uppercase tracking-wider opacity-50 mt-0.5">
                      {m.count ? `${m.count} day${m.count === 1 ? '' : 's'} logged` : 'No entries yet'}
                      {m.lastDate && ` · last: ${fmtShort(m.lastDate)}`}
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClientManager({ clients, onAdd, onRemove }) {
  const [newName, setNewName] = useState('');
  const handleAdd = async () => { if (!newName.trim()) return; await onAdd(newName); setNewName(''); };
  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} placeholder="Add client (e.g., Sanford Health)" className="flex-1 px-3 py-2 text-sm bg-white border border-stone-300 rounded-sm outline-none focus:border-stone-600" />
        <button onClick={handleAdd} disabled={!newName.trim()} className="px-4 py-2 rounded-sm font-mono text-xs uppercase tracking-wider transition disabled:opacity-30" style={{ background: '#1f3d2c', color: '#f7f1e6' }}>
          <Plus size={13} className="inline -mt-0.5 mr-1" />Add
        </button>
      </div>
      {clients.length === 0 ? <div className="text-sm italic opacity-50">No clients yet. Add one above, or they'll be created as employees log entries.</div> : (
        <div className="flex flex-wrap gap-2">
          {clients.map(c => (
            <span key={c.id} className="group inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-300 rounded-sm text-sm">
              <Building2 size={12} className="opacity-50" />{c.name}
              <button onClick={() => { if (confirm(`Remove "${c.name}" from the client roster? Existing entries that reference it will still show the name.`)) onRemove(c.name); }} className="opacity-40 hover:opacity-100 ml-1 text-rose-700 hover:text-rose-900 transition"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function InsightsTab({ employees }) {
  const [allTasks, setAllTasks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState('week');
  const [anchor, setAnchor] = useState(todayISO());
  const [customStart, setCustomStart] = useState(shiftDay(todayISO(), -7));
  const [customEnd, setCustomEnd] = useState(todayISO());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await api.allTasks();
      setAllTasks(all.map(t => ({ empId: t.employeeId, empName: t.employeeName || '(unknown)', date: t.date, task: t })));
    } catch (e) { console.error(e); setAllTasks([]); }
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const range = useMemo(() => {
    if (preset === 'day') return { start: anchor, end: anchor };
    if (preset === 'week') return { start: startOfWeek(anchor), end: endOfWeek(anchor) };
    if (preset === 'month') return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
    return { start: customStart, end: customEnd };
  }, [preset, anchor, customStart, customEnd]);

  const shiftPeriod = (dir) => {
    if (preset === 'day') setAnchor(shiftDay(anchor, dir));
    else if (preset === 'week') setAnchor(shiftDay(anchor, dir * 7));
    else if (preset === 'month') { const d = parseISO(anchor); d.setMonth(d.getMonth() + dir); setAnchor(fmtISO(d)); }
  };

  const insights = useMemo(() => computeInsights(allTasks || [], range), [allTasks, range]);
  const rangeLabel = preset === 'day' ? fmtDisplay(range.start)
    : preset === 'month' ? parseISO(range.start).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : `${fmtShort(range.start)} — ${fmtShortYear(range.end)}`;

  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['custom', 'Custom']].map(([k, lbl]) => (
          <button key={k} onClick={() => setPreset(k)} className={`px-3 py-1.5 rounded-sm font-mono text-xs uppercase tracking-wider transition ${preset === k ? 'bg-stone-800 text-amber-50' : 'border border-stone-300 hover:bg-stone-200/60'}`}>{lbl}</button>
        ))}
        <button onClick={refresh} className="ml-auto p-2 rounded-sm hover:bg-stone-200/60 transition" title="Refresh"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      {preset !== 'custom' ? (
        <div className="flex items-center justify-between gap-2 mb-6 py-3 border-y border-stone-300/70">
          <button onClick={() => shiftPeriod(-1)} className="p-2 rounded-sm hover:bg-stone-200/60"><ChevronLeft size={18} /></button>
          <div className="text-center flex-1">
            <div className="font-display text-lg md:text-xl" style={{ color: '#1f3d2c' }}>{rangeLabel}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest opacity-50 mt-0.5">
              {preset === 'day' ? '1 day' : `${fmtShort(range.start)} → ${fmtShort(range.end)}`}
            </div>
          </div>
          <button onClick={() => shiftPeriod(1)} className="p-2 rounded-sm hover:bg-stone-200/60"><ChevronRight size={18} /></button>
        </div>
      ) : (
        <div className="flex items-end gap-3 mb-6 py-3 border-y border-stone-300/70 flex-wrap">
          <div>
            <label className="font-mono text-[11px] uppercase tracking-wider font-semibold block mb-1.5 text-stone-700">From</label>
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="px-2 py-1.5 text-sm font-mono bg-white border border-stone-300 rounded-sm outline-none" />
          </div>
          <div>
            <label className="font-mono text-[11px] uppercase tracking-wider font-semibold block mb-1.5 text-stone-700">To</label>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="px-2 py-1.5 text-sm font-mono bg-white border border-stone-300 rounded-sm outline-none" />
          </div>
        </div>
      )}

      {loading ? <div className="text-center py-16 opacity-40 font-mono text-sm">Crunching the numbers…</div>
      : insights.totalEntries === 0 ? (
        <div className="text-center py-16 px-4 border border-dashed border-stone-400 rounded-sm bg-stone-50/40">
          <BarChart3 size={28} className="mx-auto mb-3 opacity-30" />
          <div className="font-display text-xl mb-1" style={{ color: '#1f3d2c' }}>Nothing logged in this period</div>
          <div className="text-sm opacity-60">Try a wider range, or check back once the team has filed entries.</div>
        </div>
      ) : <InsightsContent insights={insights} />}
    </div>
  );
}

function computeInsights(allTasks, range) {
  const inRange = allTasks.filter(t => t.date >= range.start && t.date <= range.end);
  const incidentKey = (t) => {
    const id = (t.task.incidentId || '').trim().toLowerCase();
    const client = (t.task.client || '').trim().toLowerCase();
    if (!id) return null;
    return `${client}::${id}`;
  };
  const earliest = {};
  for (const t of allTasks) {
    const k = incidentKey(t); if (!k) continue;
    if (!earliest[k] || t.date < earliest[k]) earliest[k] = t.date;
  }
  const uniqueKeys = new Set(), newKeys = new Set(), continuingKeys = new Set();
  let completed = 0, inProgress = 0, blocked = 0;
  const prdItems = [];
  const byEmployee = {}, byClient = {};

  for (const t of inRange) {
    const k = incidentKey(t);
    if (k) { uniqueKeys.add(k); if (earliest[k] >= range.start) newKeys.add(k); else continuingKeys.add(k); }
    const status = t.task.status || 'in_progress';
    if (status === 'completed') completed++; else if (status === 'blocked') blocked++; else inProgress++;
    const prdDate = t.task.prdDate || t.date;
    if (t.task.movedToPRD && prdDate >= range.start && prdDate <= range.end) prdItems.push({ ...t, prdDate });
    if (!byEmployee[t.empId]) byEmployee[t.empId] = { empId: t.empId, empName: t.empName, entries: 0, unique: new Set(), prd: 0, completed: 0 };
    byEmployee[t.empId].entries++;
    if (k) byEmployee[t.empId].unique.add(k);
    if (status === 'completed') byEmployee[t.empId].completed++;
    if (t.task.movedToPRD && prdDate >= range.start && prdDate <= range.end) byEmployee[t.empId].prd++;
    const client = t.task.client || '— No client —';
    if (!byClient[client]) byClient[client] = { client, entries: 0, completed: 0, prd: 0 };
    byClient[client].entries++;
    if (status === 'completed') byClient[client].completed++;
    if (t.task.movedToPRD && prdDate >= range.start && prdDate <= range.end) byClient[client].prd++;
  }
  for (const t of allTasks) {
    if (t.date >= range.start && t.date <= range.end) continue;
    const prdDate = t.task.prdDate;
    if (t.task.movedToPRD && prdDate && prdDate >= range.start && prdDate <= range.end) {
      prdItems.push({ ...t, prdDate });
      if (!byEmployee[t.empId]) byEmployee[t.empId] = { empId: t.empId, empName: t.empName, entries: 0, unique: new Set(), prd: 0, completed: 0 };
      byEmployee[t.empId].prd++;
      const client = t.task.client || '— No client —';
      if (!byClient[client]) byClient[client] = { client, entries: 0, completed: 0, prd: 0 };
      byClient[client].prd++;
    }
  }
  const seen = new Set();
  const dedupedPRD = prdItems.filter(p => { const k = `${p.empId}:${p.date}:${p.task.id}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.prdDate || '').localeCompare(a.prdDate || ''));
  return {
    range, totalEntries: inRange.length,
    uniqueIncidents: uniqueKeys.size, newIncidents: newKeys.size, continuingIncidents: continuingKeys.size,
    completed, inProgress, blocked,
    prdCount: dedupedPRD.length, prdItems: dedupedPRD,
    byEmployee: Object.values(byEmployee).map(e => ({ ...e, unique: e.unique.size })).sort((a, b) => b.entries - a.entries),
    byClient: Object.values(byClient).sort((a, b) => b.entries - a.entries),
  };
}

function InsightsContent({ insights }) {
  return (
    <div className="space-y-8">
      <div>
        <SectionHeader icon={ListChecks} title="Volume" subtitle="Entries and incident counts" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total entries" value={insights.totalEntries} />
          <StatCard label="Unique incidents" value={insights.uniqueIncidents} hint="distinct client + ID" />
          <StatCard label="New" value={insights.newIncidents} hint="first time this period" accent="#1f3d2c" />
          <StatCard label="Continuing" value={insights.continuingIncidents} hint="carried from before" />
        </div>
      </div>
      <div>
        <SectionHeader icon={TrendingUp} title="Status mix" subtitle="How the work landed" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Completed" value={insights.completed} icon={CircleCheck} accent="#065f46" />
          <StatCard label="In Progress" value={insights.inProgress} icon={CircleDot} accent="#b45309" />
          <StatCard label="Blocked" value={insights.blocked} icon={CircleAlert} accent="#9f1239" />
          <StatCard label="Moved to PRD" value={insights.prdCount} icon={Rocket} accent="#0e7c40" />
        </div>
      </div>
      <div>
        <SectionHeader icon={Rocket} title="Moved to PRD this period" subtitle={`${insights.prdItems.length} build${insights.prdItems.length === 1 ? '' : 's'} promoted`} />
        {insights.prdItems.length === 0 ? (
          <div className="p-5 border border-dashed border-stone-400 rounded-sm bg-stone-50/40 text-sm italic opacity-60">No builds moved to PRD in this range.</div>
        ) : (
          <div className="divide-y divide-stone-300/60 border border-stone-300 rounded-sm bg-white/60">
            {insights.prdItems.map((p, i) => (
              <div key={`${p.empId}-${p.date}-${p.task.id}-${i}`} className="p-4 flex items-start gap-3">
                <div className="font-mono text-[10px] uppercase tracking-widest opacity-40 pt-0.5 w-12 shrink-0">{fmtShort(p.prdDate)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {p.task.client && <span className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-stone-200/80">{p.task.client}</span>}
                    {p.task.incidentId && <span className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-stone-800 text-amber-50">{p.task.incidentId}</span>}
                    <span className="font-mono text-[10px] opacity-60">{p.empName}</span>
                  </div>
                  <div className="font-display text-base leading-snug">{p.task.title || <span className="opacity-40 italic">No details</span>}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <SectionHeader icon={Users} title="By employee" subtitle="Per-person breakdown" />
        <Breakdown rows={insights.byEmployee} render={(r) => (
          <div className="flex items-center justify-between gap-3 py-3 px-3 hover:bg-stone-200/30 transition">
            <div className="font-display text-base" style={{ color: '#1f3d2c' }}>{r.empName}</div>
            <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-wider opacity-70 shrink-0">
              <span>{r.entries} entries</span><span className="hidden sm:inline opacity-50">·</span>
              <span className="hidden sm:inline">{r.unique} unique</span><span className="opacity-50">·</span>
              <span className="text-emerald-800">{r.completed} done</span>
              {r.prd > 0 && <><span className="opacity-50">·</span><span className="text-emerald-700 flex items-center gap-1"><Rocket size={10} /> {r.prd}</span></>}
            </div>
          </div>
        )} />
      </div>
      <div>
        <SectionHeader icon={Building2} title="By client" subtitle="Per-client breakdown" />
        <Breakdown rows={insights.byClient} render={(r) => (
          <div className="flex items-center justify-between gap-3 py-3 px-3 hover:bg-stone-200/30 transition">
            <div className="font-display text-base" style={{ color: '#1f3d2c' }}>{r.client}</div>
            <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-wider opacity-70 shrink-0">
              <span>{r.entries} entries</span><span className="opacity-50">·</span>
              <span className="text-emerald-800">{r.completed} done</span>
              {r.prd > 0 && <><span className="opacity-50">·</span><span className="text-emerald-700 flex items-center gap-1"><Rocket size={10} /> {r.prd}</span></>}
            </div>
          </div>
        )} />
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      {Icon && <div className="w-8 h-8 rounded-sm flex items-center justify-center shrink-0" style={{ background: '#1f3d2c' }}><Icon size={15} className="text-amber-50" /></div>}
      <div>
        <div className="font-display text-xl md:text-2xl leading-none" style={{ color: '#1f3d2c' }}>{title}</div>
        {subtitle && <div className="font-mono text-[10px] uppercase tracking-widest opacity-50 mt-1">{subtitle}</div>}
      </div>
    </div>
  );
}

function StatCard({ label, value, hint, icon: Icon, accent }) {
  return (
    <div className="p-4 rounded-sm border border-stone-300 bg-white/60">
      <div className="font-mono text-[10px] uppercase tracking-widest opacity-60 mb-1 flex items-center gap-1">
        {Icon && <Icon size={11} style={accent ? { color: accent } : {}} />}{label}
      </div>
      <div className="font-display text-3xl md:text-4xl leading-none" style={{ color: accent || '#1f3d2c' }}>{value}</div>
      {hint && <div className="font-mono text-[10px] uppercase tracking-wider opacity-40 mt-1">{hint}</div>}
    </div>
  );
}

function Breakdown({ rows, render }) {
  if (rows.length === 0) return <div className="opacity-50 text-sm italic">Nothing to show.</div>;
  return <div className="divide-y divide-stone-300/60 border border-stone-300 rounded-sm bg-white/60">{rows.map((r, i) => <div key={i}>{render(r)}</div>)}</div>;
}

function AdminDetailView({ employee, onBack }) {
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const ds = await api.datesForEmployee(employee.id);
        setDates(ds);
        if (ds.length > 0) setSelectedDate(ds[0]);
      } catch (e) { setDates([]); }
      setLoading(false);
    })();
  }, [employee.id]);

  useEffect(() => {
    if (!selectedDate) { setTasks([]); return; }
    (async () => {
      try { setTasks(await api.tasksForEmployeeDate(employee.id, selectedDate)); }
      catch (e) { setTasks([]); }
    })();
  }, [employee.id, selectedDate]);

  const filteredTasks = clientFilter ? tasks.filter(t => t.client === clientFilter) : tasks;
  const totalHours = filteredTasks.reduce((s, t) => s + (parseFloat(t.hours) || 0), 0);
  const clientsInDay = [...new Set(tasks.map(t => t.client).filter(Boolean))];

  return (
    <div className="fade-up">
      <button onClick={onBack} className="font-mono text-xs uppercase tracking-wider opacity-60 hover:opacity-100 flex items-center gap-1.5 mb-6 transition"><ArrowLeft size={14} /> Back to dashboard</button>
      <div className="font-mono text-xs uppercase tracking-widest opacity-50 mb-2">Admin · Employee report</div>
      <h2 className="font-display text-4xl md:text-5xl mb-1" style={{ color: '#1f3d2c' }}>{employee.name}</h2>
      <p className="opacity-70 mb-8">{dates.length} {dates.length === 1 ? 'day' : 'days'} of reports on record</p>
      {loading ? <div className="text-center py-12 opacity-40 font-mono text-sm">Loading…</div>
      : dates.length === 0 ? (
        <div className="text-center py-16 px-4 border border-dashed border-stone-400 rounded-sm bg-stone-50/40">
          <Calendar size={28} className="mx-auto mb-3 opacity-30" />
          <div className="font-display text-xl mb-1" style={{ color: '#1f3d2c' }}>No reports filed</div>
          <div className="text-sm opacity-60">This employee hasn't logged anything yet.</div>
        </div>
      ) : (
        <div className="grid md:grid-cols-[200px_1fr] gap-6">
          <aside>
            <div className="font-mono text-[10px] uppercase tracking-widest opacity-50 mb-2">Dates</div>
            <div className="space-y-0.5 max-h-[60vh] overflow-y-auto pr-2">
              {dates.map(d => (
                <button key={d} onClick={() => setSelectedDate(d)} className={`block w-full text-left px-3 py-2 rounded-sm font-mono text-xs transition ${selectedDate === d ? 'bg-stone-800 text-amber-50' : 'hover:bg-stone-200/60'}`}>
                  {fmtShort(d)}<span className="opacity-50 ml-2">{d.split('-')[0]}</span>
                </button>
              ))}
            </div>
          </aside>
          <div>
            {selectedDate && (
              <>
                <div className="flex items-end justify-between flex-wrap gap-2 mb-4 pb-4 border-b border-stone-300/70">
                  <div className="font-display text-xl md:text-2xl" style={{ color: '#1f3d2c' }}>{fmtDisplay(selectedDate)}</div>
                  <div className="font-mono text-xs uppercase tracking-wider opacity-60">{filteredTasks.length} item{filteredTasks.length === 1 ? '' : 's'} · {totalHours.toFixed(1)}h</div>
                </div>
                {clientsInDay.length > 1 && (
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <span className="font-mono text-[10px] uppercase tracking-wider opacity-50">Filter:</span>
                    <button onClick={() => setClientFilter('')} className={`font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-sm border transition ${!clientFilter ? 'bg-stone-800 text-amber-50 border-stone-800' : 'border-stone-300 hover:bg-stone-200/60'}`}>All</button>
                    {clientsInDay.map(c => (
                      <button key={c} onClick={() => setClientFilter(c)} className={`font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-sm border transition ${clientFilter === c ? 'bg-stone-800 text-amber-50 border-stone-800' : 'border-stone-300 hover:bg-stone-200/60'}`}>{c}</button>
                    ))}
                  </div>
                )}
                {filteredTasks.length === 0 ? <div className="opacity-50 text-sm italic">No entries match this filter.</div>
                : <div className="space-y-3">{filteredTasks.map((t, i) => <AdminTaskRow key={t.id} task={t} index={i} />)}</div>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AdminTaskRow({ task, index }) {
  const status = STATUS[task.status] || STATUS.in_progress;
  const StatusIcon = status.icon;
  return (
    <div className="bg-white/70 border border-stone-300 rounded-sm p-4 md:p-5">
      <div className="flex items-start gap-3">
        <span className="font-mono text-[10px] uppercase tracking-widest opacity-40 pt-1">№ {String(index + 1).padStart(2, '0')}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            {task.client && <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm bg-stone-200/80 text-stone-700 flex items-center gap-1"><Building2 size={10} /> {task.client}</span>}
            {task.incidentId && <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm bg-stone-800 text-amber-50 flex items-center gap-1"><Hash size={10} /> {task.incidentId}</span>}
            <span className={`font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm border ${status.bg} ${status.border} ${status.color} flex items-center gap-1`}><StatusIcon size={10} /> {status.label}</span>
            {task.movedToPRD && <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm bg-emerald-700 text-emerald-50 flex items-center gap-1"><Rocket size={10} /> PRD{task.prdDate ? ` · ${fmtShort(task.prdDate)}` : ''}</span>}
            {task.hours ? <span className="font-mono text-[10px] opacity-60 flex items-center gap-1"><Clock size={10} /> {task.hours}h</span> : null}
          </div>
          <div className="font-display text-lg leading-snug" style={{ color: '#1a1a1a' }}>{task.title || <span className="opacity-40 italic">No details</span>}</div>
          {task.latestUpdate && (
            <div className="mt-3 pl-3 border-l-2 border-stone-400/70">
              <div className="font-mono text-[10px] uppercase tracking-widest opacity-50 mb-1 flex items-center gap-1"><ArrowRight size={10} /> Where we are now</div>
              <div className="text-sm opacity-80 leading-relaxed whitespace-pre-wrap">{task.latestUpdate}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
