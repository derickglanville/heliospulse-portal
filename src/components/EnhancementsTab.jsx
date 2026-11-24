import React, { useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Search,
  Download,
  Sparkles,
  Clock,
  AlertTriangle,
} from 'lucide-react';

const STATUS_OPTIONS = ['Planned', 'In Progress', 'Monitoring', 'Completed', 'On Hold'];
const PRIORITY_OPTIONS = ['High', 'Medium', 'Low'];
const CATEGORY_OPTIONS = [
  'Array / Hardware',
  'Inverter / Optimizer',
  'Panel Maintenance',
  'Battery / Storage',
  'Metering & Grid',
  'Load Optimization',
  'Monitoring & Portal',
  'Other',
];

function createEmptyForm() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  return {
    date: today,
    title: '',
    category: 'Panel Maintenance',
    status: 'Planned',
    priority: 'Medium',
    impact: '',
    cost: '',
    description: '',
    notes: '',
  };
}

function getStatusPillClass(status, darkMode) {
  switch (status) {
    case 'Completed':
      return 'bg-[#1f7a4c]/12 text-[#1f7a4c] border-[#1f7a4c]/30';
    case 'In Progress':
      return 'bg-[#e07a16]/15 text-[#c25e00] border-[#e07a16]/35';
    case 'Monitoring':
      return darkMode
        ? 'bg-sky-900/50 text-sky-200 border-sky-700'
        : 'bg-[#dbeafe] text-[#1e3a8a] border-[#93c5fd]';
    case 'On Hold':
      return 'bg-[#b91c1c]/12 text-[#b91c1c] border-[#b91c1c]/30';
    case 'Planned':
    default:
      return darkMode
        ? 'bg-slate-800 text-slate-200 border-slate-700'
        : 'bg-[#efece4] text-[#1a1917] border-[#dcd8ce]';
  }
}

function getPriorityBadgeClass(priority) {
  switch (priority) {
    case 'High':
      return 'text-[#b91c1c] bg-[#b91c1c]/10';
    case 'Medium':
      return 'text-[#e07a16] bg-[#e07a16]/12';
    default:
      return 'text-[#1f7a4c] bg-[#1f7a4c]/10';
  }
}

export default function EnhancementsTab({
  entries,
  onSaveEntries,
  syncStatusMessage,
  darkMode,
  cardBg,
  calloutBg,
  mutedText,
  dividerBorder,
  pillBtnSecondary,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortOrder, setSortOrder] = useState('desc');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(createEmptyForm);
  const [formError, setFormError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const stats = useMemo(() => {
    const total = entries.length;
    const completed = entries.filter((e) => e.status === 'Completed').length;
    const active = entries.filter((e) => e.status === 'In Progress' || e.status === 'Monitoring' || e.status === 'Planned').length;
    const highPriorityOpen = entries.filter((e) => e.priority === 'High' && e.status !== 'Completed').length;
    const totalCost = entries.reduce((sum, e) => {
      const n = Number(String(e.cost || '').replace(/[^0-9.-]/g, ''));
      return sum + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
    return { total, completed, active, highPriorityOpen, totalCost };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return [...entries]
      .filter((item) => {
        if (statusFilter !== 'All' && item.status !== statusFilter) return false;
        if (categoryFilter !== 'All' && item.category !== categoryFilter) return false;
        if (q) {
          const hay = [
            item.id,
            item.date,
            item.title,
            item.category,
            item.status,
            item.priority,
            item.impact,
            item.description,
            item.notes,
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const cmp = (a.date || '').localeCompare(b.date || '');
        if (cmp !== 0) return sortOrder === 'desc' ? -cmp : cmp;
        return sortOrder === 'desc'
          ? (b.id || '').localeCompare(a.id || '')
          : (a.id || '').localeCompare(b.id || '');
      });
  }, [entries, searchTerm, statusFilter, categoryFilter, sortOrder]);

  const openAddForm = () => {
    setEditingId(null);
    setFormData(createEmptyForm());
    setFormError('');
    setFormOpen(true);
  };

  const openEditForm = (item) => {
    setEditingId(item.id);
    setFormData({
      date: item.date || '',
      title: item.title || '',
      category: item.category || 'Other',
      status: item.status || 'Planned',
      priority: item.priority || 'Medium',
      impact: item.impact || '',
      cost: item.cost ?? '',
      description: item.description || '',
      notes: item.notes || '',
    });
    setFormError('');
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setFormError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.date) {
      setFormError('Please select a date.');
      return;
    }
    if (!formData.title.trim()) {
      setFormError('Please enter a title for this enhancement or production note.');
      return;
    }
    if (!formData.description.trim()) {
      setFormError('Please enter a description.');
      return;
    }

    const nowIso = new Date().toISOString();
    let updated;
    if (editingId) {
      updated = entries.map((item) =>
        item.id === editingId
          ? {
              ...item,
              ...formData,
              title: formData.title.trim(),
              impact: formData.impact.trim(),
              cost: String(formData.cost || '').trim(),
              description: formData.description.trim(),
              notes: formData.notes.trim(),
              updatedAt: nowIso,
            }
          : item
      );
    } else {
      const nextNum =
        entries.reduce((maxNum, item) => {
          const m = String(item.id || '').match(/ENH-(\d+)/);
          return m ? Math.max(maxNum, Number(m[1])) : maxNum;
        }, 0) + 1;
      const newEntry = {
        id: `ENH-${String(nextNum).padStart(3, '0')}`,
        ...formData,
        title: formData.title.trim(),
        impact: formData.impact.trim(),
        cost: String(formData.cost || '').trim(),
        description: formData.description.trim(),
        notes: formData.notes.trim(),
        updatedAt: nowIso,
      };
      updated = [newEntry, ...entries];
    }

    onSaveEntries(updated);
    closeForm();
  };

  const handleQuickStatusChange = (id, newStatus) => {
    const nowIso = new Date().toISOString();
    const updated = entries.map((item) =>
      item.id === id ? { ...item, status: newStatus, updatedAt: nowIso } : item
    );
    onSaveEntries(updated);
  };

  const handleDelete = (id) => {
    const updated = entries.filter((item) => item.id !== id);
    setConfirmDeleteId(null);
    if (editingId === id) closeForm();
    onSaveEntries(updated);
  };

  const handleExportCsv = () => {
    const headers = ['ID', 'Date', 'Title', 'Category', 'Status', 'Priority', 'Impact', 'Cost', 'Description', 'Notes', 'UpdatedAt'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      headers.join(','),
      ...filteredEntries.map((r) =>
        [r.id, r.date, r.title, r.category, r.status, r.priority, r.impact, r.cost, r.description, r.notes, r.updatedAt]
          .map(esc)
          .join(',')
      ),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'heliospulse_solar_enhancements.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputClass = `w-full px-3 py-2 rounded-xl border text-xs ${
    darkMode
      ? 'bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500'
      : 'bg-[#faf8f4] border-[#dcd8ce] text-[#1a1917] placeholder:text-[#8c877c]'
  }`;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Solar production enhancements &amp; log
          </h1>
          <p className={`text-sm sm:text-[15px] leading-relaxed ${mutedText}`}>
            Track hardware upgrades, inverter tuning, panel maintenance, weather/production observations, and system improvements with add, edit, and delete controls.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {syncStatusMessage && (
            <span className={`text-[11px] font-mono px-3 py-1.5 rounded-full ${calloutBg}`}>
              {syncStatusMessage}
            </span>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            className={`px-3.5 py-2 rounded-full border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${pillBtnSecondary}`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={openAddForm}
            className="px-4 py-2 rounded-full bg-[#1a1917] hover:opacity-90 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Enhancement</span>
          </button>
        </div>
      </div>

      {/* KPI SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`rounded-2xl border p-4 space-y-1 ${cardBg}`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${mutedText}`}>TOTAL TRACKED</div>
          <div className="text-2xl font-bold font-mono">{stats.total}</div>
          <div className={`text-xs ${mutedText}`}>Production &amp; system items</div>
        </div>
        <div className={`rounded-2xl border p-4 space-y-1 ${cardBg}`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${mutedText}`}>COMPLETED</div>
          <div className="text-2xl font-bold font-mono text-[#1f7a4c]">{stats.completed}</div>
          <div className={`text-xs ${mutedText}`}>Implemented &amp; verified</div>
        </div>
        <div className={`rounded-2xl border p-4 space-y-1 ${cardBg}`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${mutedText}`}>PLANNED / ACTIVE</div>
          <div className="text-2xl font-bold font-mono text-[#e07a16]">{stats.active}</div>
          <div className={`text-xs ${mutedText}`}>{stats.highPriorityOpen} high priority open</div>
        </div>
        <div className={`rounded-2xl border p-4 space-y-1 ${cardBg}`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${mutedText}`}>LOGGED INVESTMENT</div>
          <div className="text-2xl font-bold font-mono">${stats.totalCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</div>
          <div className={`text-xs ${mutedText}`}>Tracked enhancement cost</div>
        </div>
      </div>

      {/* ADD / MODIFY FORM PANEL */}
      {formOpen && (
        <form onSubmit={handleSubmit} className={`rounded-2xl border p-5 sm:p-6 space-y-4 ${cardBg}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#e07a16]" />
              <h3 className="text-sm font-bold">
                {editingId ? `Modify Entry (${editingId})` : 'Add Solar Production / Enhancement Entry'}
              </h3>
            </div>
            <button
              type="button"
              onClick={closeForm}
              className="p-1.5 rounded-full hover:bg-black/5 cursor-pointer"
              aria-label="Close enhancement form"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {formError && (
            <div className="px-3.5 py-2 rounded-xl border border-[#b91c1c]/40 bg-[#b91c1c]/10 text-[#b91c1c] text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold mb-1">Date *</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                className={`${inputClass} font-mono`}
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold mb-1">Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Spring panel wash, Tree trimming on south roofline, Microinverter check"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
                className={inputClass}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                className={inputClass}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold mb-1">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData((prev) => ({ ...prev, priority: e.target.value }))}
                className={inputClass}
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold mb-1">Production / kWh Impact</label>
              <input
                type="text"
                value={formData.impact}
                onChange={(e) => setFormData((prev) => ({ ...prev, impact: e.target.value }))}
                placeholder="e.g., +4.5 kWh/day or +8% output"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold mb-1">Cost ($)</label>
              <input
                type="text"
                value={formData.cost}
                onChange={(e) => setFormData((prev) => ({ ...prev, cost: e.target.value }))}
                placeholder="e.g., 250 or 0"
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold mb-1">Description *</label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the production change, upgrade scope, shading fix, or maintenance performed..."
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold mb-1">Verification / Follow-up Notes</label>
              <textarea
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional follow-up dates, contractor info, before/after irradiance notes..."
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeForm}
              className={`px-4 py-2 rounded-full border text-xs font-semibold cursor-pointer ${pillBtnSecondary}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-full bg-[#1f7a4c] hover:bg-[#17613b] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{editingId ? 'Save Changes' : 'Add Entry'}</span>
            </button>
          </div>
        </form>
      )}

      {/* FILTER & SEARCH BAR */}
      <div className={`rounded-2xl border p-4 flex flex-wrap items-center gap-2.5 ${cardBg}`}>
        <div className="relative flex-1 min-w-[200px]">
          <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${mutedText}`} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by title, description, impact, ID, or notes..."
            className={`w-full pl-8 pr-3 py-1.5 rounded-full border text-xs ${
              darkMode ? 'bg-slate-950 border-slate-700 text-slate-100' : 'bg-[#faf8f4] border-[#dcd8ce] text-[#1a1917]'
            }`}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`px-3 py-1.5 rounded-full border text-xs font-medium cursor-pointer ${pillBtnSecondary}`}
        >
          <option value="All">All Statuses</option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className={`px-3 py-1.5 rounded-full border text-xs font-medium cursor-pointer ${pillBtnSecondary}`}
        >
          <option value="All">All Categories</option>
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setSortOrder((s) => (s === 'desc' ? 'asc' : 'desc'))}
          className={`px-3 py-1.5 rounded-full border text-xs font-medium cursor-pointer ${pillBtnSecondary}`}
        >
          Date: {sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}
        </button>
      </div>

      {/* ENTRIES LIST */}
      {filteredEntries.length === 0 ? (
        <div className={`rounded-2xl border p-8 text-center space-y-2 ${cardBg}`}>
          <div className="text-sm font-semibold">No matching enhancement or production entries</div>
          <p className={`text-xs ${mutedText}`}>
            Adjust your filters or click <strong>Add Enhancement</strong> to log a new item.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((item) => (
            <div key={item.id} className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${cardBg}`}>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold ${calloutBg}`}>
                      {item.id}
                    </span>
                    <span className="text-xs font-mono font-semibold text-[#e07a16] flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {item.date}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${getStatusPillClass(item.status, darkMode)}`}>
                      {item.status}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${getPriorityBadgeClass(item.priority)}`}>
                      {item.priority} Priority
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${calloutBg}`}>
                      {item.category}
                    </span>
                  </div>

                  <h3 className="text-sm sm:text-base font-bold leading-snug">{item.title}</h3>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <select
                    value={item.status}
                    onChange={(e) => handleQuickStatusChange(item.id, e.target.value)}
                    aria-label={`Change status for ${item.title}`}
                    className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold cursor-pointer ${pillBtnSecondary}`}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => openEditForm(item)}
                    className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${pillBtnSecondary}`}
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Modify</span>
                  </button>

                  {confirmDeleteId === item.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="px-2.5 py-1 rounded-full bg-[#b91c1c] text-white text-[11px] font-semibold cursor-pointer"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className={`px-2 py-1 rounded-full border text-[11px] font-semibold cursor-pointer ${pillBtnSecondary}`}
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(item.id)}
                      className="px-2.5 py-1 rounded-full border border-[#b91c1c]/35 text-[#b91c1c] hover:bg-[#b91c1c]/10 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs sm:text-[13px] leading-relaxed">{item.description}</p>

              <div className={`grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t ${dividerBorder} text-xs`}>
                <div>
                  <span className={`text-[10.5px] uppercase font-semibold tracking-wider block ${mutedText}`}>
                    Production / Output Impact
                  </span>
                  <span className="font-mono font-medium">{item.impact || '—'}</span>
                </div>
                <div>
                  <span className={`text-[10.5px] uppercase font-semibold tracking-wider block ${mutedText}`}>
                    Estimated / Actual Cost
                  </span>
                  <span className="font-mono font-medium">
                    {item.cost !== '' && item.cost != null ? `$${String(item.cost).replace(/^\$/, '')}` : '—'}
                  </span>
                </div>
                <div>
                  <span className={`text-[10.5px] uppercase font-semibold tracking-wider block ${mutedText}`}>
                    Notes
                  </span>
                  <span className={mutedText}>{item.notes || '—'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
